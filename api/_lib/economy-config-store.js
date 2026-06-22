const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { get, put } = require("@vercel/blob");

// Singleton store for runtime-tunable economy overrides (Farm-экономика, feature 013).
// Dual backend mirroring battle-store: dev → local JSON, prod → @vercel/blob.
// Stores ONLY overrides on top of code defaults; never throws on read (fail-safe to {}).

const DATA_DIR =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), ".data")
    : path.join(process.cwd(), ".data", "local-dev");
const LOCAL_PATH = path.join(DATA_DIR, "economy-config.json");
const AUDIT_LOCAL_PATH = path.join(DATA_DIR, "economy-config-audit.json");

const CONFIG_BLOB_PATH =
  process.env.ECONOMY_CONFIG_BLOB_PATH ||
  `system/economy-${crypto
    .createHash("sha256")
    .update(
      String(process.env.INTERNAL_API_SECRET || process.env.SOLANA_AUTH_SECRET || "petix-economy")
    )
    .digest("hex")
    .slice(0, 32)}.json`;
const AUDIT_BLOB_PATH = CONFIG_BLOB_PATH.replace(/\.json$/, "-audit.json");

function isBlobEnabled() {
  return process.env.NODE_ENV === "production" && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function readBlobText(stream) {
  if (!stream) return "";
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBlob(pathname, fallback) {
  const result = await get(pathname, { access: "public" }).catch((error) => {
    if (error?.name === "BlobNotFoundError") return null;
    throw error;
  });
  if (!result || result.statusCode !== 200) return fallback;
  const raw = await readBlobText(result.stream);
  return raw ? JSON.parse(raw) : fallback;
}

async function readLocalJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeLocalJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tempPath, filePath);
}

/** Read raw overrides object. Never throws — returns {} on any failure. */
async function readOverrides() {
  try {
    if (isBlobEnabled()) {
      return (await readJsonBlob(CONFIG_BLOB_PATH, {})) || {};
    }
    return (await readLocalJson(LOCAL_PATH, {})) || {};
  } catch {
    return {};
  }
}

/** Persist the full overrides object (already validated by caller). */
async function writeOverrides(overrides) {
  const payload = JSON.stringify(overrides, null, 2);
  if (isBlobEnabled()) {
    await put(CONFIG_BLOB_PATH, payload, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 0,
    });
    return;
  }
  await writeLocalJson(LOCAL_PATH, overrides);
}

/** Append an audit entry { ts, adminWallet, patch, reason }. Best-effort. */
async function appendAuditEntry(entry) {
  try {
    if (isBlobEnabled()) {
      const existing = (await readJsonBlob(AUDIT_BLOB_PATH, [])) || [];
      existing.unshift(entry);
      await put(AUDIT_BLOB_PATH, JSON.stringify(existing.slice(0, 500), null, 2), {
        access: "public",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: "application/json",
        cacheControlMaxAge: 0,
      });
      return;
    }
    const existing = (await readLocalJson(AUDIT_LOCAL_PATH, [])) || [];
    existing.unshift(entry);
    await writeLocalJson(AUDIT_LOCAL_PATH, existing.slice(0, 500));
  } catch {
    // audit is best-effort; never block a config change on audit failure
  }
}

async function readAuditEntries() {
  try {
    if (isBlobEnabled()) {
      return (await readJsonBlob(AUDIT_BLOB_PATH, [])) || [];
    }
    return (await readLocalJson(AUDIT_LOCAL_PATH, [])) || [];
  } catch {
    return [];
  }
}

module.exports = {
  appendAuditEntry,
  readAuditEntries,
  readOverrides,
  writeOverrides,
};
