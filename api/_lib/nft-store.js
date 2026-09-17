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
const STATE_PATH = path.join(DATA_DIR, "nft.json");
const STATE_BLOB_PATH =
  process.env.NFT_DB_BLOB_PATH ||
  `system/${crypto
    .createHash("sha256")
    .update(
      String(process.env.INTERNAL_API_SECRET || process.env.SOLANA_AUTH_SECRET || "petix-nft")
    )
    .digest("hex")
    .slice(0, 32)}-nft.json`;
const STATE_BLOB_VERSION_PREFIX = `${STATE_BLOB_PATH.replace(/\.json$/, "")}-v/`;
const CAS_ATTEMPTS = 4;
const MAX_TRANSFER_JOURNAL = 500;

const EMPTY_STATE = {
  version: 1,
  bindings: {},
  // tokenId → current owner, rebuilt from Transfer logs. Required because
  // OpenSea's ERC721SeaDrop is ERC721A and exposes no tokenOfOwnerByIndex.
  owners: {},
  // tokenId → { blockNumber, at }: block (and its timestamp) in which the current
  // owner received the token. Feeds the "held ≥ 48h" withdrawal gate (feature 019).
  ownedSince: {},
  ownedSinceBackfilledAt: null,
  startBlock: 0,
  lastSyncedBlock: 0,
  transfers: [],
  // Курсор обхода коллекции для обновления витрины. Нужен на ревиле: метаданные
  // меняются у всех токенов разом, а дёргать маркетплейс тысячей запросов в
  // одном вызове нельзя. Крон идёт по номерам пачками и двигает курсор.
  refreshSweep: null,
  // Состояние витрины на момент последнего прохода крона: "sealed" | "revealed".
  // Смена значения — сигнал, что метаданные изменились у всех токенов сразу.
  lastRevealState: null,
  // Последний известный адрес метаданных. Его смена = ревил (или откат его
  // Studio), и это единственный сигнал, по которому мы узнаём, что метаданные
  // поменялись сразу у всей коллекции.
  lastBaseUri: null,
  // Адрес контракта, к которому относится всё остальное. Сменился — значит это
  // другая коллекция, и привязки, владельцы и отметка сканирования от прошлой
  // к ней не имеют отношения.
  contract: null,
  // Проверка того, что витрина действительно перечитала метаданные. Запускается
  // после обхода: OpenSea принимает запрос молча и обновляет через раз.
  refreshAudit: null,
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
    // Обновление витрины не доехало (маркетплейс лёг или сработал дебаунс) —
    // токен ждёт, пока его дошлёт крон.
    refreshPendingSince: raw.refreshPendingSince || null,
    // Точечная проверка витрины после посадки/очистки/прокачки: когда сверить и
    // сколько раз уже переспрашивали.
    verifyAfter: Number.isFinite(Number(raw.verifyAfter)) && Number(raw.verifyAfter) > 0 ? Number(raw.verifyAfter) : null,
    verifyAttempts: Math.max(0, Math.floor(Number(raw.verifyAttempts) || 0)),
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

  const ownedSince = {};
  for (const [tokenId, raw] of Object.entries(parsed.ownedSince || {})) {
    const blockNumber = Math.floor(Number(raw?.blockNumber));
    const at = raw?.at ? String(raw.at) : "";
    if (Number.isFinite(blockNumber) && blockNumber >= 0 && at && Number.isFinite(Date.parse(at))) {
      ownedSince[String(Number(tokenId))] = { blockNumber, at };
    }
  }

  return {
    version: EMPTY_STATE.version,
    bindings,
    owners,
    ownedSince,
    ownedSinceBackfilledAt: parsed.ownedSinceBackfilledAt ? String(parsed.ownedSinceBackfilledAt) : null,
    startBlock: Math.max(0, Math.floor(Number(parsed.startBlock) || 0)),
    lastSyncedBlock: Math.max(0, Math.floor(Number(parsed.lastSyncedBlock) || 0)),
    transfers: Array.isArray(parsed.transfers)
      ? parsed.transfers.slice(-MAX_TRANSFER_JOURNAL).map((entry) => cloneValue(entry))
      : [],
    refreshSweep:
      parsed.refreshSweep && Number(parsed.refreshSweep.until) > 0
        ? {
            next: Math.max(1, Math.floor(Number(parsed.refreshSweep.next) || 1)),
            until: Math.max(1, Math.floor(Number(parsed.refreshSweep.until) || 1)),
          }
        : null,
    lastRevealState:
      parsed.lastRevealState === "sealed" || parsed.lastRevealState === "revealed"
        ? parsed.lastRevealState
        : null,
    lastBaseUri:
      typeof parsed.lastBaseUri === "string" && parsed.lastBaseUri ? parsed.lastBaseUri : null,
    contract:
      typeof parsed.contract === "string" && parsed.contract ? parsed.contract.toLowerCase() : null,
    refreshAudit:
      parsed.refreshAudit && Number(parsed.refreshAudit.until) > 0
        ? {
            next: Math.max(1, Math.floor(Number(parsed.refreshAudit.next) || 1)),
            until: Math.max(1, Math.floor(Number(parsed.refreshAudit.until) || 1)),
            attempt: Math.max(1, Math.floor(Number(parsed.refreshAudit.attempt) || 1)),
            notBefore: Math.max(0, Math.floor(Number(parsed.refreshAudit.notBefore) || 0)),
            staleCount: Math.max(0, Math.floor(Number(parsed.refreshAudit.staleCount) || 0)),
          }
        : null,
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
  // Обход edge-кеша дописывает к пути query-строку. Vercel Blob такой путь
  // блобом не считает и отвечает 403 — не «не найдено», поэтому раньше
  // ошибка вылетала наружу и роняла синк. Когда обход не сработал, читаем
  // тот же блоб обычным get: прочитать устаревшую копию не страшно, запись
  // всё равно идёт под CAS по etag, а вот падать здесь нельзя.
  const readFresh = async () => {
    try {
      return await getFreshBlob(pathname, { access: "public" });
    } catch (error) {
      if (isBlobNotFoundError(error)) return null;
      console.warn(`[nft-store] cache-busted read failed (${error.message}), reading directly`);
      return get(pathname, { access: "public" });
    }
  };

  const read = fresh ? readFresh() : get(pathname, { access: "public" });
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
      // Версии может не быть: канонический блоб мог быть записан кодом до
      // content-addressed схемы. На отсутствующий путь Vercel Blob отвечает
      // 403, а не «не найдено», и раньше эта ошибка вылетала наружу вместо
      // отката к каноническому блобу — синк падал на ровном месте. Откат
      // безопасен: запись всё равно защищена CAS по etag.
      const state = await loadBlobStateFromPath(buildVersionPath(contentMd5), {
        fresh: false,
      }).catch((error) => {
        console.warn(`[nft-store] version blob unavailable: ${error.message}`);
        return null;
      });
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

// Метаданные читает краулер маркетплейса — на ревиле это тысячи запросов за
// минуты, и каждый ходил в Blob за состоянием по три-четыре обращения. Blob
// отвечает на такой поток лимитом (403), и часть ответов краулеру уходила
// ошибкой — а он на ошибку оставляет старые данные. Состояние меняется редко,
// поэтому держим его в памяти инстанса несколько секунд, а если Blob отбил —
// отдаём последнюю удачную копию, лишь бы не пятисотить витрине.
const STATE_CACHE_MS = Math.max(0, Number(process.env.NFT_STATE_CACHE_MS) || 15000);
const stateCache = { state: null, at: 0 };

function rememberState(state) {
  stateCache.state = state;
  stateCache.at = Date.now();
  return state;
}

async function readNftState() {
  if (!isBlobDbEnabled()) {
    return loadLocalState();
  }
  if (stateCache.state && Date.now() - stateCache.at < STATE_CACHE_MS) {
    return stateCache.state;
  }
  try {
    const { state } = await loadBlobStateConsistent();
    return rememberState(state);
  } catch (error) {
    if (stateCache.state) {
      console.warn(`[nft-store] state read failed (${error.message}), serving last good copy`);
      return stateCache.state;
    }
    throw error;
  }
}

/**
 * Serialized mutation with CAS. The mutator may throw a coded error to abort
 * (nothing is written). It may also return a value via `mutate`'s own closure;
 * the resolved value is the normalized post-write state.
 */
async function withNftState(mutate) {
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
        return rememberState(next);
      } catch (error) {
        if (!isEtagConflictError(error)) throw error;
      }
    }

    console.warn("[nft-store] state CAS kept conflicting — falling back to unconditional write");
    await writeBlobState(next);
    return next;
  });

  writeQueue = pending;
  return pending;
}

async function getBinding(tokenId) {
  const state = await readNftState();
  return normalizeBinding(tokenId, state.bindings[String(Number(tokenId))]) || null;
}

async function getBindingByCharacterId(characterId) {
  if (!characterId) return null;
  const state = await readNftState();
  for (const [tokenId, raw] of Object.entries(state.bindings)) {
    if (raw.characterId === characterId) {
      return normalizeBinding(tokenId, raw);
    }
  }
  return null;
}

async function listBindings() {
  const state = await readNftState();
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
  const state = await readNftState();
  return Object.entries(state.owners)
    .filter(([, owner]) => owner === target)
    .map(([tokenId]) => Number(tokenId))
    .sort((a, b) => a - b);
}

const ZERO_ADDRESS = `0x${"0".repeat(40)}`;

/**
 * Applies one Transfer to the ownership index: owner + the moment the current
 * owner received the token (`at` = block timestamp ISO; callers fall back to
 * the sync time when the block cannot be read). Burns clear both.
 */
function applyTransferToIndex(state, transfer, at) {
  const key = String(Number(transfer.tokenId));
  const to = String(transfer.to || "").toLowerCase();
  if (!to || to === ZERO_ADDRESS || !/^0x[0-9a-f]{40}$/.test(to)) {
    delete state.owners[key];
    delete state.ownedSince[key];
    return state;
  }
  state.owners[key] = to;
  state.ownedSince[key] = {
    blockNumber: Math.max(0, Math.floor(Number(transfer.blockNumber) || 0)),
    at: at ? new Date(at).toISOString() : new Date().toISOString(),
  };
  return state;
}

/** Tokens the wallet holds according to the index, each with its `since` (ISO or null). */
function holdingsOf(state, wallet) {
  const target = String(wallet || "").toLowerCase();
  const tokens = Object.entries(state.owners)
    .filter(([, owner]) => owner === target)
    .map(([tokenId]) => ({
      tokenId: Number(tokenId),
      since: state.ownedSince[tokenId] ? state.ownedSince[tokenId].at : null,
    }))
    .sort((a, b) => a.tokenId - b.tokenId);
  const known = tokens.map((entry) => entry.since).filter(Boolean).sort();
  return { tokens, oldestSince: known.length ? known[0] : null };
}

async function listHoldingsFromIndex(wallet) {
  return holdingsOf(await readNftState(), wallet);
}

module.exports = {
  EMPTY_STATE,
  appendTransferEntry,
  applyTransferToIndex,
  holdingsOf,
  listHoldingsFromIndex,
  listTokensOfOwnerFromIndex,
  getBinding,
  getBindingByCharacterId,
  listBindings,
  normalizeBinding,
  normalizeState,
  readNftState,
  withNftState,
};
