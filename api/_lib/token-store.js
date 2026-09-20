const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { get, head, put } = require("@vercel/blob");
const { getFreshBlob, isBlobNotFoundError } = require("./blob-read");

// Глобальное состояние контура $PETIX (feature 019): курсор индексации
// вводов, недавние ключи событий (анти-дубль между профилями), кошельки с
// операциями (для журнала админки), короткая блокировка отправки с раздатчика
// (nonce одного кошелька нельзя брать из двух лямбд одновременно) и счётчик
// выплат за сутки. Тот же dual backend + content-addressed CAS, что у
// nft-store.js: mutable-указатель отдаётся stale после перезаписи, поэтому
// читаем по etag → immutable-версия, пишем с ifMatch.

const DATA_DIR =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), ".data")
    : path.join(process.cwd(), ".data", "local-dev");
const STATE_PATH = path.join(DATA_DIR, "token.json");
const STATE_BLOB_PATH =
  process.env.TOKEN_DB_BLOB_PATH ||
  `system/${crypto
    .createHash("sha256")
    .update(
      String(process.env.INTERNAL_API_SECRET || process.env.SOLANA_AUTH_SECRET || "petix-token")
    )
    .digest("hex")
    .slice(0, 32)}-token.json`;
const STATE_BLOB_VERSION_PREFIX = `${STATE_BLOB_PATH.replace(/\.json$/, "")}-v/`;
const CAS_ATTEMPTS = 4;
const MAX_RECENT_KEYS = 5000;
const MAX_RECENT_WALLETS = 500;
const DAY_MS = 86400000;

const EMPTY_STATE = {
  version: 1,
  treasury: null,
  token: null,
  startBlock: 0,
  lastSyncedBlock: 0,
  recentKeys: [],
  recentWallets: [],
  sendLock: null,
  dailyOut: { day: 0, points: 0 },
  // Котировка монеты (024): одно число под защитой, из него выводится вся
  // лестница цен на питомцев.
  price: null,
  // Сколько Points потрачено внутри игры с момента последнего сжигания.
  burnQueue: { points: 0, byReason: {}, since: null, lastBurnAt: null },
  // Сожжено за всё время и последние костры (id, сумма, хеш, статус).
  burnedTotalPoints: 0,
  burns: [],
  // Депозиты, которые синк увидел в цепи, но не смог зачислить (сбой хранилища,
  // RPC): курсор уезжает вперёд и сам их больше не увидит, поэтому они ждут
  // повтора здесь. 20.09.2026 так потерялись 80 000 у игрока.
  pendingDeposits: [],
  lastRunAt: null,
  lastError: null,
};

const MAX_PENDING_DEPOSITS = 100;

const SPEND_REASONS = ["pet_creation", "energy", "pet_burn", "capsule_unbind"];
const MAX_BURNS = 50;

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

function normalizeAddress(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return /^0x[0-9a-f]{40}$/.test(normalized) ? normalized : null;
}

function nonNegativeInt(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function normalizeState(parsed) {
  if (!parsed || typeof parsed !== "object") return cloneValue(EMPTY_STATE);
  const lock =
    parsed.sendLock && typeof parsed.sendLock === "object" && parsed.sendLock.owner
      ? {
          owner: String(parsed.sendLock.owner),
          expiresAt: nonNegativeInt(parsed.sendLock.expiresAt),
        }
      : null;
  return {
    version: EMPTY_STATE.version,
    treasury: normalizeAddress(parsed.treasury),
    token: normalizeAddress(parsed.token),
    startBlock: nonNegativeInt(parsed.startBlock),
    lastSyncedBlock: nonNegativeInt(parsed.lastSyncedBlock),
    recentKeys: Array.isArray(parsed.recentKeys)
      ? parsed.recentKeys.slice(-MAX_RECENT_KEYS).map(String)
      : [],
    recentWallets: Array.isArray(parsed.recentWallets)
      ? parsed.recentWallets.slice(-MAX_RECENT_WALLETS).map(String)
      : [],
    sendLock: lock,
    dailyOut: {
      day: nonNegativeInt(parsed.dailyOut?.day),
      points: nonNegativeInt(parsed.dailyOut?.points),
    },
    price: normalizePriceQuote(parsed.price),
    burnQueue: normalizeBurnQueue(parsed.burnQueue),
    burnedTotalPoints: nonNegativeInt(parsed.burnedTotalPoints),
    burns: Array.isArray(parsed.burns) ? parsed.burns.slice(-MAX_BURNS).map(normalizeBurn) : [],
    pendingDeposits: Array.isArray(parsed.pendingDeposits)
      ? parsed.pendingDeposits.slice(-MAX_PENDING_DEPOSITS).map(normalizePendingDeposit).filter(Boolean)
      : [],
    lastRunAt: parsed.lastRunAt ? String(parsed.lastRunAt) : null,
    lastError: parsed.lastError ? String(parsed.lastError) : null,
  };
}

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizePriceQuote(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const pointsPerUsd = positiveNumber(parsed.pointsPerUsd);
  if (pointsPerUsd === null) return null;
  return {
    usd: positiveNumber(parsed.usd),
    pointsPerUsd,
    fetchedAt: parsed.fetchedAt ? String(parsed.fetchedAt) : null,
    source: parsed.source ? String(parsed.source) : null,
    previousPointsPerUsd: positiveNumber(parsed.previousPointsPerUsd),
    rejections: nonNegativeInt(parsed.rejections),
    lastError: parsed.lastError ? String(parsed.lastError) : null,
    clamped: parsed.clamped === true,
  };
}

function normalizeBurnQueue(parsed) {
  const byReason = {};
  for (const reason of SPEND_REASONS) {
    const value = nonNegativeInt(parsed?.byReason?.[reason]);
    if (value > 0) byReason[reason] = value;
  }
  return {
    points: nonNegativeInt(parsed?.points),
    byReason,
    since: parsed?.since ? String(parsed.since) : null,
    lastBurnAt: parsed?.lastBurnAt ? String(parsed.lastBurnAt) : null,
  };
}

function normalizeBurn(parsed) {
  return {
    id: String(parsed?.id || ""),
    points: nonNegativeInt(parsed?.points),
    amountRaw: parsed?.amountRaw ? String(parsed.amountRaw) : null,
    txHash: parsed?.txHash ? String(parsed.txHash) : null,
    status: ["sent", "confirmed", "failed"].includes(parsed?.status) ? parsed.status : "sent",
    at: parsed?.at ? String(parsed.at) : null,
    settledAt: parsed?.settledAt ? String(parsed.settledAt) : null,
    // Из каких причин сложилась сожжённая сумма — по ней восстанавливаем
    // очередь, если транзакция не прошла.
    byReason: parsed?.byReason && typeof parsed.byReason === "object" ? { ...parsed.byReason } : {},
  };
}

/**
 * Снять сумму с очереди под костёр. Разбивка по причинам уменьшается от самой
 * большой к меньшим, чтобы итог и слагаемые всегда сходились. Возвращает, что
 * именно снято, — этим же восстанавливаем очередь, если транзакция не удалась.
 */
function drainBurnQueue(state, points) {
  const queue = normalizeBurnQueue(state.burnQueue);
  let left = Math.min(nonNegativeInt(points), queue.points);
  const drained = {};

  const reasons = Object.entries(queue.byReason).sort((a, b) => b[1] - a[1]);
  for (const [reason, amount] of reasons) {
    if (left <= 0) break;
    const take = Math.min(amount, left);
    drained[reason] = take;
    queue.byReason[reason] = amount - take;
    if (queue.byReason[reason] === 0) delete queue.byReason[reason];
    left -= take;
  }

  queue.points = Math.max(0, queue.points - nonNegativeInt(points));
  state.burnQueue = queue;
  return drained;
}

/** Вернуть в очередь сумму, которую костёр не смог сжечь. */
function restoreBurnQueue(state, byReason) {
  const queue = normalizeBurnQueue(state.burnQueue);
  for (const [reason, amount] of Object.entries(byReason || {})) {
    const value = nonNegativeInt(amount);
    if (!value) continue;
    queue.byReason[reason] = (queue.byReason[reason] || 0) + value;
    queue.points += value;
  }
  state.burnQueue = queue;
  return state;
}

/** Новый костёр: запись в историю, список ограничен последними MAX_BURNS. */
function recordBurn(state, entry) {
  const burns = Array.isArray(state.burns) ? state.burns : [];
  burns.push(normalizeBurn(entry));
  state.burns = burns.slice(-MAX_BURNS);
  state.burnQueue = { ...normalizeBurnQueue(state.burnQueue), lastBurnAt: entry.at || null };
  return state;
}

/**
 * Итог костра. Сожжённым считается только подтверждённый: «в пути» ещё может
 * не долететь, а неудачный не сжёг ничего.
 */
function settleBurn(state, id, { status, at }) {
  const burns = Array.isArray(state.burns) ? state.burns : [];
  const entry = burns.find((record) => record.id === id);
  if (!entry) return state;
  const wasConfirmed = entry.status === "confirmed";
  entry.status = status;
  entry.settledAt = at || null;
  if (status === "confirmed" && !wasConfirmed) {
    state.burnedTotalPoints = nonNegativeInt(state.burnedTotalPoints) + entry.points;
  }
  return state;
}

/**
 * Учёт траты в очереди на сжигание. Возврат приходит отрицательной суммой и
 * уменьшает очередь, но не уводит её ниже нуля: сжечь больше, чем потрачено,
 * нельзя ни при каком стечении обстоятельств.
 */
function addSpend(state, { points, reason, at }) {
  const amount = Math.floor(Number(points) || 0);
  if (!amount) return state;
  const key = SPEND_REASONS.includes(reason) ? reason : "other";

  const queue = normalizeBurnQueue(state.burnQueue);
  queue.points = Math.max(0, queue.points + amount);
  queue.byReason[key] = Math.max(0, (queue.byReason[key] || 0) + amount);
  if (queue.byReason[key] === 0) delete queue.byReason[key];
  if (!queue.since) queue.since = at || new Date().toISOString();

  state.burnQueue = queue;
  return state;
}

// ---- pure helpers (operate on a state object inside a mutator) -------------

function hasKey(state, key) {
  return state.recentKeys.includes(String(key));
}

// A transfer the chain scan already saw but the credit failed on. Kept verbatim
// so the retry does not need to re-scan the chain for it.
function normalizePendingDeposit(parsed) {
  const key = String(parsed?.key || "");
  const txHash = String(parsed?.txHash || "");
  const from = normalizeAddress(parsed?.from);
  if (!key || !txHash || !from) return null;
  return {
    key,
    from,
    txHash,
    logIndex: nonNegativeInt(parsed?.logIndex),
    blockNumber: nonNegativeInt(parsed?.blockNumber),
    amountRaw: String(parsed?.amountRaw || "0"),
    attempts: nonNegativeInt(parsed?.attempts),
    firstSeenAt: parsed?.firstSeenAt ? String(parsed.firstSeenAt) : null,
    lastError: parsed?.lastError ? String(parsed.lastError) : null,
  };
}

/** Queue a transfer whose credit failed; same key twice only bumps the counter. */
function rememberPendingDeposit(state, transfer, { at = null, error = null } = {}) {
  if (!Array.isArray(state.pendingDeposits)) state.pendingDeposits = [];
  const key = String(transfer?.key || "");
  if (!key) return state;

  const existing = state.pendingDeposits.find((entry) => entry.key === key);
  if (existing) {
    existing.attempts += 1;
    existing.lastError = error ? String(error) : existing.lastError;
    return state;
  }

  const normalized = normalizePendingDeposit({
    ...transfer,
    attempts: 1,
    firstSeenAt: at ? String(at) : null,
    lastError: error ? String(error) : null,
  });
  if (!normalized) return state;

  state.pendingDeposits.push(normalized);
  if (state.pendingDeposits.length > MAX_PENDING_DEPOSITS) {
    state.pendingDeposits = state.pendingDeposits.slice(-MAX_PENDING_DEPOSITS);
  }
  return state;
}

function forgetPendingDeposit(state, key) {
  if (!Array.isArray(state.pendingDeposits)) return state;
  state.pendingDeposits = state.pendingDeposits.filter((entry) => entry.key !== String(key));
  return state;
}

function rememberKeys(state, keys) {
  for (const key of keys || []) {
    const value = String(key);
    if (!state.recentKeys.includes(value)) state.recentKeys.push(value);
  }
  if (state.recentKeys.length > MAX_RECENT_KEYS) {
    state.recentKeys = state.recentKeys.slice(-MAX_RECENT_KEYS);
  }
  return state;
}

function rememberWallet(state, wallet) {
  const normalized = normalizeAddress(wallet);
  if (!normalized) return state;
  if (!state.recentWallets.includes(normalized)) state.recentWallets.push(normalized);
  if (state.recentWallets.length > MAX_RECENT_WALLETS) {
    state.recentWallets = state.recentWallets.slice(-MAX_RECENT_WALLETS);
  }
  return state;
}

/**
 * Курсор валиден только для пары (раздатчик, монета), под которую он строился.
 * Смена любого из них (новый раздатчик после инцидента, боевая монета вместо
 * тестовой) обнуляет курсор и ключи; журнал кошельков остаётся.
 * Возвращает true, если что-то сбросилось.
 */
function resetIfChanged(state, { treasury, token, startBlock }) {
  const nextTreasury = normalizeAddress(treasury);
  const nextToken = normalizeAddress(token);
  const changed =
    (state.treasury || null) !== (nextTreasury || null) || (state.token || null) !== (nextToken || null);
  if (!changed) return false;
  state.treasury = nextTreasury;
  state.token = nextToken;
  state.startBlock = nonNegativeInt(startBlock);
  state.lastSyncedBlock = 0;
  state.recentKeys = [];
  return true;
}

function dayIndex(now) {
  return Math.floor(nonNegativeInt(now) / DAY_MS);
}

function dailyOutFor(state, now) {
  return state.dailyOut.day === dayIndex(now) ? state.dailyOut.points : 0;
}

function bumpDailyOut(state, points, now) {
  const day = dayIndex(now);
  if (state.dailyOut.day !== day) state.dailyOut = { day, points: 0 };
  state.dailyOut.points += nonNegativeInt(points);
  return state;
}

// ---- persistence -----------------------------------------------------------

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
  if (!meta) return { state: cloneValue(EMPTY_STATE), etag: null };

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
    allowOverwrite: true,
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

async function readTokenState() {
  if (isBlobDbEnabled()) {
    const { state } = await loadBlobStateConsistent();
    return state;
  }
  return loadLocalState();
}

/**
 * Сериализованная мутация с CAS. Мутатор может бросить — тогда ничего не
 * пишется. Возвращает нормализованное состояние после записи.
 */
async function withTokenState(mutate) {
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

    console.warn("[token-store] state CAS kept conflicting — falling back to unconditional write");
    await writeBlobState(next);
    return next;
  });

  writeQueue = pending;
  return pending;
}

// ---- send lock ----------------------------------------------------------------

/**
 * Пытается взять блокировку отправки с раздатчика. true — взята (или уже
 * принадлежит этому owner и продлена), false — занята другим и не истекла.
 * CAS в withTokenState гарантирует, что два владельца не получат true на
 * одном и том же состоянии.
 */
async function acquireSendLock(owner, { ttlMs = 20000, now = Date.now() } = {}) {
  let acquired = false;
  await withTokenState((state) => {
    const lock = state.sendLock;
    const free = !lock || lock.expiresAt <= now || lock.owner === String(owner);
    if (!free) return state;
    state.sendLock = { owner: String(owner), expiresAt: now + Math.max(1000, ttlMs) };
    acquired = true;
    return state;
  });
  return acquired;
}

async function releaseSendLock(owner) {
  let released = false;
  await withTokenState((state) => {
    if (state.sendLock && state.sendLock.owner === String(owner)) {
      state.sendLock = null;
      released = true;
    }
    return state;
  });
  return released;
}

module.exports = {
  EMPTY_STATE,
  SPEND_REASONS,
  addSpend,
  drainBurnQueue,
  normalizeBurn,
  restoreBurnQueue,
  normalizeBurnQueue,
  recordBurn,
  settleBurn,
  normalizePriceQuote,
  MAX_PENDING_DEPOSITS,
  MAX_RECENT_KEYS,
  MAX_RECENT_WALLETS,
  acquireSendLock,
  bumpDailyOut,
  dailyOutFor,
  hasKey,
  normalizeState,
  readTokenState,
  releaseSendLock,
  forgetPendingDeposit,
  rememberKeys,
  rememberPendingDeposit,
  rememberWallet,
  resetIfChanged,
  withTokenState,
};
