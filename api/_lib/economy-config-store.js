const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { get, head, put } = require("@vercel/blob");
const { getFreshBlob, isBlobNotFoundError } = require("./blob-read");

// Singleton store for runtime-tunable economy overrides (Farm-экономика, feature 013).
// Dual backend mirroring battle-store: dev → local JSON, prod → @vercel/blob.
// Stores ONLY overrides on top of code defaults; never throws on read (fail-safe to {}).
//
// Blob layout (same scheme as wallet profiles / battles / nft-store): the
// pointer blob at CONFIG_BLOB_PATH is overwritten on every save, and overwritten
// blobs are served stale by the CDN in the functions region for tens of seconds —
// a query-string cache-bust does NOT help there. So every write first stores an
// immutable copy at `<path>-v/<md5>.json`; a read does head() on the pointer
// (API — always current), takes its etag (= md5 of the current content) and
// reads the copy at that pathname, which can never be stale. Writes carry
// ifMatch so two admins saving at once cannot clobber each other.

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
const CONFIG_VERSION_PREFIX = `${CONFIG_BLOB_PATH.replace(/\.json$/, "")}-v/`;
const AUDIT_VERSION_PREFIX = `${AUDIT_BLOB_PATH.replace(/\.json$/, "")}-v/`;
const AUDIT_LIMIT = 500;
const CAS_ATTEMPTS = 4;

function isBlobEnabled() {
  return process.env.NODE_ENV === "production" && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function md5Hex(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

// HTTP-header etags may be weak (`W/"..."`) or quoted, while the put API
// compares against the canonical etag from head()/put(). Normalize only for
// COMPARISON — never pass a normalized value to ifMatch.
function normalizeEtag(value) {
  return String(value || "")
    .replace(/^W\//i, "")
    .replace(/^"+|"+$/g, "");
}

function isEtagConflictError(error) {
  return (
    error?.constructor?.name === "BlobPreconditionFailedError" ||
    /precondition failed/i.test(String(error?.message || ""))
  );
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

async function readJsonBlob(pathname, fallback, { fresh = true } = {}) {
  const read = fresh ? getFreshBlob(pathname, { access: "public" }) : get(pathname, { access: "public" });
  const result = await read.catch((error) => {
    if (isBlobNotFoundError(error)) return null;
    throw error;
  });
  if (!result || result.statusCode !== 200) return fallback;
  const raw = await readBlobText(result.stream);
  return raw ? JSON.parse(raw) : fallback;
}

// Consistent read of one document: { value, etag }. etag is null when the
// pointer blob does not exist yet (first write goes unconditional).
async function readDocConsistent(pointerPath, versionPrefix, fallback) {
  const meta = await head(pointerPath).catch((error) => {
    if (isBlobNotFoundError(error)) return null;
    throw error;
  });
  if (!meta) return { value: fallback, etag: null };

  const canonicalEtag = meta.etag || null;
  const contentMd5 = normalizeEtag(canonicalEtag);
  if (/^[a-f0-9]{32}$/.test(contentMd5)) {
    // Immutable pathname → a plain (cacheable) read is safe. Retry only when
    // the pointer was written moments ago (its copy may not have replicated
    // yet); a missing copy on an old write is a pre-migration document.
    const uploadedMs = new Date(meta.uploadedAt).getTime();
    const isRecentWrite = Number.isFinite(uploadedMs) && Date.now() - uploadedMs < 60000;
    const attempts = isRecentWrite ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const value = await readJsonBlob(`${versionPrefix}${contentMd5}.json`, null, { fresh: false }).catch(
        (error) => {
          console.warn(`[economy-config-store] version blob unavailable: ${error.message}`);
          return null;
        }
      );
      if (value !== null && value !== undefined) return { value, etag: canonicalEtag };
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
  }

  // Pre-migration document (no copy yet) or replication lag: best-effort
  // cache-busted read of the pointer blob. The write is still guarded by CAS.
  const value = await readJsonBlob(pointerPath, fallback);
  return { value, etag: canonicalEtag };
}

async function writeDoc(pointerPath, versionPrefix, value, { ifMatch = null } = {}) {
  const json = JSON.stringify(value);
  // 1. Immutable copy FIRST — readers resolve the pointer's etag to this
  //    pathname, so it must exist before the pointer flips.
  await put(`${versionPrefix}${md5Hex(json)}.json`, json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true, // idempotent: same md5 ⇒ same content
    contentType: "application/json",
    cacheControlMaxAge: 31536000,
  });
  // 2. Pointer blob (also the legacy read path).
  await put(pointerPath, json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
    ...(ifMatch ? { ifMatch } : {}),
  });
}

// Read-modify-write under CAS; `mutate(current)` returns the next value.
async function mutateDoc(pointerPath, versionPrefix, fallback, mutate) {
  let next = null;
  for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
    const { value, etag } = await readDocConsistent(pointerPath, versionPrefix, fallback);
    next = await mutate(value);
    try {
      await writeDoc(pointerPath, versionPrefix, next, { ifMatch: etag });
      return next;
    } catch (error) {
      if (!isEtagConflictError(error)) throw error;
    }
  }
  console.warn("[economy-config-store] CAS kept conflicting — falling back to unconditional write");
  await writeDoc(pointerPath, versionPrefix, next);
  return next;
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

// Local writes are serialized in-process so two admin saves in the dev server
// cannot interleave their read-modify-write.
let localQueue = Promise.resolve();
function withLocalQueue(run) {
  const pending = localQueue.catch(() => null).then(run);
  localQueue = pending;
  return pending;
}

/** Read raw overrides object. Never throws — returns {} on any failure. */
async function readOverrides() {
  try {
    if (isBlobEnabled()) {
      const { value } = await readDocConsistent(CONFIG_BLOB_PATH, CONFIG_VERSION_PREFIX, {});
      return value || {};
    }
    return (await readLocalJson(LOCAL_PATH, {})) || {};
  } catch {
    return {};
  }
}

/** Replace the overrides document unconditionally (migrations / tests). Prefer mutateOverrides. */
async function writeOverrides(overrides) {
  if (isBlobEnabled()) {
    await writeDoc(CONFIG_BLOB_PATH, CONFIG_VERSION_PREFIX, overrides);
    return;
  }
  await withLocalQueue(() => writeLocalJson(LOCAL_PATH, overrides));
}

/** Read-modify-write of the overrides under CAS: `mutate(current)` returns the next document. */
async function mutateOverrides(mutate) {
  if (isBlobEnabled()) {
    return mutateDoc(CONFIG_BLOB_PATH, CONFIG_VERSION_PREFIX, {}, async (current) => mutate(current || {}));
  }
  return withLocalQueue(async () => {
    const current = (await readLocalJson(LOCAL_PATH, {})) || {};
    const next = await mutate(current);
    await writeLocalJson(LOCAL_PATH, next);
    return next;
  });
}

/** Append an audit entry { ts, adminWallet, patch, reason }. Best-effort. */
async function appendAuditEntry(entry) {
  const prepend = (existing) => [entry, ...(Array.isArray(existing) ? existing : [])].slice(0, AUDIT_LIMIT);
  try {
    if (isBlobEnabled()) {
      await mutateDoc(AUDIT_BLOB_PATH, AUDIT_VERSION_PREFIX, [], prepend);
      return;
    }
    await withLocalQueue(async () => {
      const existing = (await readLocalJson(AUDIT_LOCAL_PATH, [])) || [];
      await writeLocalJson(AUDIT_LOCAL_PATH, prepend(existing));
    });
  } catch (error) {
    console.warn(`[economy-config-store] audit append failed: ${error.message}`);
  }
}

async function readAuditEntries() {
  try {
    if (isBlobEnabled()) {
      const { value } = await readDocConsistent(AUDIT_BLOB_PATH, AUDIT_VERSION_PREFIX, []);
      return Array.isArray(value) ? value : [];
    }
    return (await readLocalJson(AUDIT_LOCAL_PATH, [])) || [];
  } catch {
    return [];
  }
}

module.exports = {
  AUDIT_BLOB_PATH,
  AUDIT_VERSION_PREFIX,
  CONFIG_BLOB_PATH,
  CONFIG_VERSION_PREFIX,
  appendAuditEntry,
  mutateOverrides,
  readAuditEntries,
  readOverrides,
  writeOverrides,
};
