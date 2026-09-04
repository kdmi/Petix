const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { get, head, put } = require("@vercel/blob");
const { getFreshBlob, isBlobNotFoundError } = require("./blob-read");

// Persistence for the NFT slots demo (feature 016): one small document holding
// token↔character bindings, the transfer-sync watermark and the move journal.
// Same dual backend + content-addressed CAS pattern as battle-store.js — the
// mutable pointer blob is served stale after overwrites, so reads resolve the
// pointer's etag to an immutable version blob and writes carry ifMatch.

const DATA_DIR =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), ".data")
    : path.join(process.cwd(), ".data", "local-dev");
const STATE_PATH = path.join(DATA_DIR, "nft-demo.json");
const STATE_BLOB_PATH =
  process.env.NFT_DEMO_DB_BLOB_PATH ||
  `system/${crypto
    .createHash("sha256")
    .update(
      String(process.env.INTERNAL_API_SECRET || process.env.SOLANA_AUTH_SECRET || "petix-nft-demo")
    )
    .digest("hex")
    .slice(0, 32)}-nft-demo.json`;
const STATE_BLOB_VERSION_PREFIX = `${STATE_BLOB_PATH.replace(/\.json$/, "")}-v/`;
const CAS_ATTEMPTS = 4;
const MAX_TRANSFER_JOURNAL = 500;

const EMPTY_STATE = {
  version: 1,
  bindings: {},
  // tokenId → current owner, rebuilt from Transfer logs. Required because
  // OpenSea's ERC721SeaDrop is ERC721A and exposes no tokenOfOwnerByIndex.
  owners: {},
  startBlock: 0,
  lastSyncedBlock: 0,
  transfers: [],
};

let writeQueue = Promise.resolve();

function md5Hex(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

function buildVersionPath(contentMd5) {
  return `${STATE_BLOB_VERSION_PREFIX}${contentMd5}.json`;
}

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

function isBlobDbEnabled() {
  return process.env.NODE_ENV === "production" && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function cloneValue(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function normalizeBinding(tokenId, raw) {
  if (!raw || typeof raw !== "object" || !raw.characterId) return null;
  return {
    tokenId: Number(tokenId),
    characterId: String(raw.characterId),
    wallet: String(raw.wallet || "").toLowerCase(),
    imageUri: raw.imageUri ? String(raw.imageUri) : null,
    imageGatewayUrl: raw.imageGatewayUrl ? String(raw.imageGatewayUrl) : null,
    boundAt: raw.boundAt || null,
    refreshedAt: raw.refreshedAt || null,
    // Отложенное сжигание: заявка живёт здесь до момента исполнения.
    pendingUnbind:
      raw.pendingUnbind && raw.pendingUnbind.executeAt
        ? {
            executeAt: String(raw.pendingUnbind.executeAt),
            requestedBy: String(raw.pendingUnbind.requestedBy || "").toLowerCase(),
            pricePaid: Math.max(0, Math.floor(Number(raw.pendingUnbind.pricePaid) || 0)),
            requestedAt: raw.pendingUnbind.requestedAt || null,
          }
        : null,
  };
}

function normalizeState(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return cloneValue(EMPTY_STATE);
  }
  const bindings = {};
  for (const [tokenId, raw] of Object.entries(parsed.bindings || {})) {
    const binding = normalizeBinding(tokenId, raw);
    if (binding) bindings[String(binding.tokenId)] = binding;
  }
  const owners = {};
  for (const [tokenId, address] of Object.entries(parsed.owners || {})) {
    const normalized = String(address || "").toLowerCase();
    if (/^0x[0-9a-f]{40}$/.test(normalized)) owners[String(Number(tokenId))] = normalized;
  }

  return {
    version: EMPTY_STATE.version,
    bindings,
    owners,
    startBlock: Math.max(0, Math.floor(Number(parsed.startBlock) || 0)),
    lastSyncedBlock: Math.max(0, Math.floor(Number(parsed.lastSyncedBlock) || 0)),
    transfers: Array.isArray(parsed.transfers)
      ? parsed.transfers.slice(-MAX_TRANSFER_JOURNAL).map((entry) => cloneValue(entry))
      : [],
  };
}

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
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

async function loadLocalState() {
  await ensureStorage();
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    return normalizeState(raw ? JSON.parse(raw) : null);
  } catch (error) {
    if (error.code === "ENOENT") return cloneValue(EMPTY_STATE);
    throw error;
  }
}

async function loadBlobStateFromPath(pathname, { fresh = true } = {}) {
  const read = fresh
    ? getFreshBlob(pathname, { access: "public" })
    : get(pathname, { access: "public" });
  const blobResult = await read.catch((error) => {
    if (isBlobNotFoundError(error)) return null;
    throw error;
  });
  if (!blobResult || blobResult.statusCode !== 200) return null;
  const raw = await readBlobText(blobResult.stream);
  return normalizeState(raw ? JSON.parse(raw) : null);
}

async function loadBlobStateConsistent() {
  const meta = await head(STATE_BLOB_PATH).catch((error) => {
    if (isBlobNotFoundError(error)) return null;
    throw error;
  });
  if (!meta) {
    return { state: cloneValue(EMPTY_STATE), etag: null };
  }

  const canonicalEtag = meta.etag || null;
  const contentMd5 = normalizeEtag(canonicalEtag);
  if (/^[a-f0-9]{32}$/.test(contentMd5)) {
    const uploadedMs = new Date(meta.uploadedAt).getTime();
    const isRecentWrite = Number.isFinite(uploadedMs) && Date.now() - uploadedMs < 60000;
    const attempts = isRecentWrite ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const state = await loadBlobStateFromPath(buildVersionPath(contentMd5), { fresh: false });
      if (state) return { state, etag: canonicalEtag };
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
  }

  const fallback = await loadBlobStateFromPath(STATE_BLOB_PATH);
  return { state: fallback || cloneValue(EMPTY_STATE), etag: canonicalEtag };
}

async function writeBlobState(state, { ifMatch = null } = {}) {
  const json = JSON.stringify(state, null, 2);
  await put(buildVersionPath(md5Hex(json)), json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true, // idempotent: same md5 ⇒ same content
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 31536000,
  });
  await put(STATE_BLOB_PATH, json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 0,
    ...(ifMatch ? { ifMatch } : {}),
  });
}

async function readNftDemoState() {
  if (isBlobDbEnabled()) {
    const { state } = await loadBlobStateConsistent();
    return state;
  }
  return loadLocalState();
}

/**
 * Serialized mutation with CAS. The mutator may throw a coded error to abort
 * (nothing is written). It may also return a value via `mutate`'s own closure;
 * the resolved value is the normalized post-write state.
 */
async function withNftDemoState(mutate) {
  const pending = writeQueue.catch(() => null).then(async () => {
    if (!isBlobDbEnabled()) {
      const current = await loadLocalState();
      const next = normalizeState((await mutate(current)) || current);
      await ensureStorage();
      await fs.writeFile(STATE_PATH, JSON.stringify(next, null, 2));
      return next;
    }

    let next = null;
    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt += 1) {
      const { state: current, etag } = await loadBlobStateConsistent();
      next = normalizeState((await mutate(current)) || current);
      try {
        await writeBlobState(next, { ifMatch: etag });
        return next;
      } catch (error) {
        if (!isEtagConflictError(error)) throw error;
      }
    }

    console.warn("[nft-demo-store] state CAS kept conflicting — falling back to unconditional write");
    await writeBlobState(next);
    return next;
  });

  writeQueue = pending;
  return pending;
}

async function getBinding(tokenId) {
  const state = await readNftDemoState();
  return normalizeBinding(tokenId, state.bindings[String(Number(tokenId))]) || null;
}

async function getBindingByCharacterId(characterId) {
  if (!characterId) return null;
  const state = await readNftDemoState();
  for (const [tokenId, raw] of Object.entries(state.bindings)) {
    if (raw.characterId === characterId) {
      return normalizeBinding(tokenId, raw);
    }
  }
  return null;
}

async function listBindings() {
  const state = await readNftDemoState();
  return Object.entries(state.bindings)
    .map(([tokenId, raw]) => normalizeBinding(tokenId, raw))
    .filter(Boolean)
    .sort((a, b) => a.tokenId - b.tokenId);
}

function appendTransferEntry(state, entry) {
  state.transfers.push({ ...entry, movedAt: entry.movedAt || new Date().toISOString() });
  if (state.transfers.length > MAX_TRANSFER_JOURNAL) {
    state.transfers = state.transfers.slice(-MAX_TRANSFER_JOURNAL);
  }
  return state;
}

/** Token ids currently owned by `wallet` according to the Transfer-log index. */
async function listTokensOfOwnerFromIndex(wallet) {
  const target = String(wallet || "").toLowerCase();
  const state = await readNftDemoState();
  return Object.entries(state.owners)
    .filter(([, owner]) => owner === target)
    .map(([tokenId]) => Number(tokenId))
    .sort((a, b) => a - b);
}

module.exports = {
  EMPTY_STATE,
  appendTransferEntry,
  listTokensOfOwnerFromIndex,
  getBinding,
  getBindingByCharacterId,
  listBindings,
  normalizeBinding,
  normalizeState,
  readNftDemoState,
  withNftDemoState,
};
