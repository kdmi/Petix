const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { del, get, head, list, put } = require("@vercel/blob");
const { getFreshBlob, isBlobNotFoundError } = require("./blob-read");
const { normalizeBattleState } = require("./battle-energy");
const { normalizeCurrency } = require("./currency");
const { normalizeFarmState } = require("./farm");

const MAX_PAID_SLOTS = 7; // 3 free + 7 paid = 10 total (feature 013)

function normalizePaidSlots(value) {
  const n = Math.floor(Number(value) || 0);
  return Math.max(0, Math.min(MAX_PAID_SLOTS, n));
}

function normalizeCharacterRecord(record) {
  if (!record || typeof record !== "object") return record;
  record.farmState = normalizeFarmState(record.farmState);
  return record;
}

const DATA_DIR =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), ".data")
    : path.join(process.cwd(), ".data", "local-dev");
const IMAGES_DIR = path.join(DATA_DIR, "character-images");
const DB_PATH = path.join(DATA_DIR, "characters.json");
const BLOB_IMAGE_PREFIX = String(process.env.BLOB_CHARACTER_IMAGE_PREFIX || "characters").replace(
  /^\/+|\/+$/g,
  ""
);
const WALLET_PROFILE_BLOB_PREFIX = String(
  process.env.WALLET_PROFILE_BLOB_PREFIX || "wallet-profiles"
).replace(/^\/+|\/+$/g, "");
const DB_BLOB_PATH =
  process.env.CHARACTER_DB_BLOB_PATH ||
  `system/${crypto
    .createHash("sha256")
    .update(
      String(process.env.INTERNAL_API_SECRET || process.env.SOLANA_AUTH_SECRET || "petix-db")
    )
    .digest("hex")
    .slice(0, 32)}.json`;

const EMPTY_DB = {
  version: 2,
  records: {},
};

const EMPTY_WALLET_PROFILE = {
  draft: null,
  characters: [],
  notifications: [],
  battleState: normalizeBattleState(null),
  currency: { balance: 0, totalEarned: 0 },
  paidSlots: 0,
  // Платное создание питомцев (024): сколько мест открыто (бесплатное плюс
  // оплаченные) и журнал списаний Points.
  unlockedSlots: null,
  spend: [],
  withdrawals: [],
  deposits: [],
  profileUpdatedAt: null,
};

let writeQueue = Promise.resolve();
const walletWriteQueues = new Map();
const walletProfileReadCache = new Map();
const WALLET_PROFILE_READ_CACHE_TTL_MS = 100;

function readIntEnv(name, fallback, minimum) {
  const raw = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(raw) ? Math.max(minimum, raw) : fallback;
}

// How many profile blobs the full-store scan reads at once. Everything above
// a few dozen only queues sockets inside the same function instance, while
// the unbounded version dies on EMFILE/EBUSY once the roster passes ~1000.
const WALLET_PROFILE_SCAN_CONCURRENCY = readIntEnv("WALLET_PROFILE_SCAN_CONCURRENCY", 24, 1);

// The scan is the single most expensive read we have (one blob GET per
// wallet), and its consumers — matchmaking, the arena opponent list and the
// admin roster — tolerate a slightly old snapshot. Writes made by THIS
// instance are patched into the snapshot instead of dropping it, so a player
// always sees their own battle/farm result immediately; the TTL only bounds
// how long another instance's write can stay invisible.
const DB_SNAPSHOT_TTL_MS = readIntEnv("WALLET_PROFILE_SCAN_TTL_MS", 60000, 0);

let dbReadCache = null; // { promise, expiresAt } | null

// Runs `mapper` over `items` with at most `limit` in flight, results in order.
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });

  await Promise.all(workers);
  return results;
}

function clearWalletProfileCache(wallet) {
  if (wallet === undefined || wallet === null) {
    walletProfileReadCache.clear();
    dbReadCache = null;
    return;
  }
  walletProfileReadCache.delete(wallet);
  dbReadCache = null;
}

// Keep the cached snapshot usable after a write instead of forcing the next
// reader to re-scan every profile blob: we already know the new value.
// `profile === null` removes the wallet (character deletion / wipe).
function patchDbSnapshot(wallet, profile) {
  const entry = dbReadCache;
  const key = String(wallet || "").trim();
  if (!entry || !key) return;

  entry.promise = entry.promise.then((db) => {
    if (!db || !db.records) return db;

    if (profile === null) {
      delete db.records[key];
    } else {
      db.records[key] = normalizeWalletProfile(profile);
    }

    return db;
  });

  // A rejected snapshot must not stay cached (readDb clears it on the initial
  // failure; this covers a rejection observed only through the patch chain).
  entry.promise.catch(() => {
    if (dbReadCache === entry) {
      dbReadCache = null;
    }
  });
}

async function ensureStorage() {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
}

function isBlobDbEnabled() {
  return process.env.NODE_ENV === "production" && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function cloneRecord(record) {
  return record ? JSON.parse(JSON.stringify(record)) : null;
}

function cloneWalletProfile(profile) {
  return {
    draft: cloneRecord(profile?.draft || null),
    characters: Array.isArray(profile?.characters)
      ? profile.characters.map((record) => normalizeCharacterRecord(cloneRecord(record)))
      : [],
    notifications: Array.isArray(profile?.notifications)
      ? profile.notifications.map((record) => cloneRecord(record))
      : [],
    battleState: normalizeBattleState(profile?.battleState),
    currency: normalizeCurrency(profile?.currency),
    paidSlots: normalizePaidSlots(profile?.paidSlots),
    // null = ещё не считалось (см. ensureUnlockedSlots в slots.js).
    // Number(null) === 0, поэтому пустое значение проверяется отдельно.
    unlockedSlots:
      profile?.unlockedSlots != null && Number.isFinite(Number(profile.unlockedSlots))
        ? Math.max(0, Math.floor(Number(profile.unlockedSlots)))
        : null,
    spend: Array.isArray(profile?.spend) ? profile.spend.map((record) => cloneRecord(record)) : [],
    withdrawals: Array.isArray(profile?.withdrawals)
      ? profile.withdrawals.map((record) => cloneRecord(record))
      : [],
    // $PETIX deposits credited to this wallet (feature 019); keyed by txHash:logIndex.
    deposits: Array.isArray(profile?.deposits)
      ? profile.deposits.map((record) => cloneRecord(record))
      : [],
    profileUpdatedAt: profile?.profileUpdatedAt ? String(profile.profileUpdatedAt) : null,
  };
}

// Monotonic write stamp: lets readers (and the client) detect and discard a
// stale profile snapshot that arrives after a newer write.
function stampProfileUpdatedAt(profile) {
  profile.profileUpdatedAt = new Date().toISOString();
  return profile;
}

function normalizeWalletProfile(rawValue) {
  if (!rawValue || typeof rawValue !== "object") {
    return cloneWalletProfile(EMPTY_WALLET_PROFILE);
  }

  if (
    Array.isArray(rawValue.characters) ||
    "draft" in rawValue ||
    Array.isArray(rawValue.notifications) ||
    rawValue.battleState
  ) {
    return cloneWalletProfile(rawValue);
  }

  if (rawValue.status === "draft") {
    return {
      draft: cloneRecord(rawValue),
      characters: [],
      notifications: [],
      battleState: normalizeBattleState(null),
      currency: { balance: 0, totalEarned: 0 },
      paidSlots: 0,
    };
  }

  if (rawValue.status === "completed") {
    return {
      draft: null,
      characters: [normalizeCharacterRecord(cloneRecord(rawValue))],
      notifications: [],
      battleState: normalizeBattleState(null),
      currency: { balance: 0, totalEarned: 0 },
      paidSlots: 0,
    };
  }

  return cloneWalletProfile(EMPTY_WALLET_PROFILE);
}

function normalizeDbShape(parsed) {
  if (!parsed || typeof parsed !== "object" || typeof parsed.records !== "object") {
    return { ...EMPTY_DB };
  }

  const normalizedRecords = Object.fromEntries(
    Object.entries(parsed.records).map(([wallet, value]) => [wallet, normalizeWalletProfile(value)])
  );

  return {
    version: EMPTY_DB.version,
    records: normalizedRecords,
  };
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

async function loadLegacyBlobDbSnapshot() {
  const blobResult = await getFreshBlob(DB_BLOB_PATH, {
    access: "public",
  }).catch((error) => {
    if (isBlobNotFoundError(error)) {
      return null;
    }
    throw error;
  });

  if (!blobResult || blobResult.statusCode !== 200) {
    return null;
  }

  const raw = await readBlobText(blobResult.stream);
  const parsed = raw ? JSON.parse(raw) : EMPTY_DB;

  return {
    db: normalizeDbShape(parsed),
    etag: blobResult.blob.etag || null,
  };
}

async function loadLocalDbSnapshot() {
  await ensureStorage();

  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return {
      db: normalizeDbShape(JSON.parse(raw)),
      etag: null,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        db: { ...EMPTY_DB },
        etag: null,
      };
    }
    throw error;
  }
}

function buildWalletProfileBlobPrefix(wallet) {
  return `${WALLET_PROFILE_BLOB_PREFIX}/${encodeURIComponent(String(wallet || "").trim())}/`;
}

function buildWalletProfileBlobPath(wallet) {
  return `${WALLET_PROFILE_BLOB_PREFIX}/${encodeURIComponent(String(wallet || "").trim())}.json`;
}

// Content-addressed immutable copy of every profile version. Overwritten
// blobs are served stale by the CDN/origin for tens of seconds in the
// functions region, but a blob at a NEVER-REUSED pathname has no older
// version to serve — and the canonical etag of the deterministic blob IS
// the md5 of its content, which is exactly this pathname's key.
function md5Hex(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

function buildWalletProfileVersionPath(wallet, contentMd5) {
  return `${WALLET_PROFILE_BLOB_PREFIX}-v/${encodeURIComponent(String(wallet || "").trim())}/${contentMd5}.json`;
}

function extractWalletFromProfileBlobPath(pathname) {
  const prefix = `${WALLET_PROFILE_BLOB_PREFIX}/`;
  if (!String(pathname || "").startsWith(prefix)) {
    return "";
  }

  const rest = pathname.slice(prefix.length);
  const slashIndex = rest.indexOf("/");
  const encodedWallet = slashIndex === -1 ? rest.replace(/\.json$/, "") : rest.slice(0, slashIndex);

  try {
    return decodeURIComponent(encodedWallet || "");
  } catch {
    return "";
  }
}

function isNewerBlob(candidate, current) {
  if (!current) return true;

  const candidateTime = Date.parse(candidate?.uploadedAt || 0);
  const currentTime = Date.parse(current?.uploadedAt || 0);

  if (candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }

  return String(candidate?.pathname || "") > String(current?.pathname || "");
}

async function listBlobPathnames(prefix) {
  const blobs = [];
  let cursor = undefined;

  while (true) {
    const page = await list({
      prefix,
      cursor,
      limit: 1000,
    });

    blobs.push(...page.blobs);

    if (!page.hasMore || !page.cursor) {
      break;
    }

    cursor = page.cursor;
  }

  return blobs;
}

async function loadWalletProfileBlobWithEtag(pathname, { fresh = true } = {}) {
  if (!pathname) return null;

  const read = fresh
    ? getFreshBlob(pathname, { access: "public" })
    : get(pathname, { access: "public" });
  const blobResult = await read.catch((error) => {
    if (isBlobNotFoundError(error)) {
      return null;
    }
    throw error;
  });

  if (!blobResult || blobResult.statusCode !== 200) {
    return null;
  }

  const raw = await readBlobText(blobResult.stream);
  return {
    profile: normalizeWalletProfile(raw ? JSON.parse(raw) : EMPTY_WALLET_PROFILE),
    etag: blobResult.blob?.etag || null,
  };
}

async function loadWalletProfileFromBlobPath(pathname, options = {}) {
  const loaded = await loadWalletProfileBlobWithEtag(pathname, options);
  return loaded ? loaded.profile : null;
}

// HTTP-header etags (from the CDN GET) may be weak (`W/"..."`) or quoted,
// while the put API compares against the canonical etag from head()/put().
// Normalize only for COMPARISON — never pass a normalized value to ifMatch.
function normalizeEtag(value) {
  return String(value || "")
    .replace(/^W\//i, "")
    .replace(/^"+|"+$/g, "");
}

// Consistent profile read: head() on the deterministic blob (API — always
// current) gives the canonical etag, which equals the md5 of the current
// content; that md5 addresses the immutable version blob, whose content by
// construction matches the etag. No overwrite-staleness can leak in.
// Returns { profile, etag } or null when the deterministic blob is absent.
async function readWalletProfileConsistent(wallet) {
  const pathname = buildWalletProfileBlobPath(wallet);
  const meta = await head(pathname).catch((error) => {
    if (isBlobNotFoundError(error)) return null;
    throw error;
  });
  if (!meta) {
    return null;
  }

  const canonicalEtag = meta.etag || null;
  const contentMd5 = normalizeEtag(canonicalEtag);

  if (/^[a-f0-9]{32}$/.test(contentMd5)) {
    const versionPath = buildWalletProfileVersionPath(wallet, contentMd5);
    // Immutable pathname → plain (cacheable) read is safe and preferred.
    // Retry only when the deterministic blob was written moments ago (its
    // version blob may not have replicated yet); a MISSING version blob on
    // an old write just means a pre-migration profile — don't stall reads.
    const uploadedMs = new Date(meta.uploadedAt).getTime();
    const isRecentWrite = Number.isFinite(uploadedMs) && Date.now() - uploadedMs < 60000;
    const attempts = isRecentWrite ? 3 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const loaded = await loadWalletProfileBlobWithEtag(versionPath, { fresh: false });
      if (loaded) {
        return { profile: loaded.profile, etag: canonicalEtag };
      }
      if (attempt < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
      }
    }
  }

  // Old profile (no version blob yet) or replication lag exhausted the
  // retries: best-effort cache-busted read of the deterministic blob.
  const fallback = await loadWalletProfileBlobWithEtag(pathname);
  return fallback ? { profile: fallback.profile, etag: canonicalEtag || fallback.etag } : null;
}

async function loadBlobWalletProfile(wallet) {
  const direct = await readWalletProfileConsistent(wallet);
  if (direct) {
    return direct.profile;
  }

  const blobs = await listBlobPathnames(buildWalletProfileBlobPrefix(wallet));
  const latest = blobs.reduce((current, candidate) => {
    return isNewerBlob(candidate, current) ? candidate : current;
  }, null);

  if (!latest) {
    return null;
  }

  const profile = await loadWalletProfileFromBlobPath(latest.pathname);
  if (!profile) {
    return null;
  }

  void writeWalletProfileBlob(wallet, profile).catch(() => null);

  return profile;
}

// One entry per wallet — the newest profile blob it has, with the `uploadedAt`
// the listing reports. The roster index (feature 023) uses those timestamps to
// re-read only the profiles that changed since its watermark, so this listing
// is shared instead of duplicated there.
async function listLatestWalletProfileBlobs() {
  const blobs = await listBlobPathnames(`${WALLET_PROFILE_BLOB_PREFIX}/`);
  const latestByWallet = new Map();

  blobs.forEach((blob) => {
    const wallet = extractWalletFromProfileBlobPath(blob.pathname);
    if (!wallet) return;

    const current = latestByWallet.get(wallet);
    if (isNewerBlob(blob, current)) {
      latestByWallet.set(wallet, blob);
    }
  });

  return [...latestByWallet.entries()].map(([wallet, blob]) => ({
    wallet,
    pathname: blob.pathname,
    uploadedAt: blob.uploadedAt || null,
  }));
}

async function loadAllBlobWalletProfiles() {
  const latestByWallet = new Map(
    (await listLatestWalletProfileBlobs()).map((blob) => [blob.wallet, blob])
  );

  // Bounded fan-out: one Promise.all over every wallet opens a socket and a
  // DNS lookup per profile at once. Past ~1000 wallets that exhausts the
  // function instance (connect EMFILE / getaddrinfo EBUSY), and undici turns
  // both into a bare `TypeError: fetch failed` — which the battle handler
  // then shows to the player.
  const entries = await mapWithConcurrency(
    [...latestByWallet.entries()],
    WALLET_PROFILE_SCAN_CONCURRENCY,
    async ([wallet, blob]) => {
      // Cache-busting every profile read would send the whole scan to origin
      // storage. The snapshot is already allowed to be a minute old (see
      // DB_SNAPSHOT_TTL_MS) and its consumers — matchmaking, the opponent
      // list, the admin roster — tolerate that, while every read-modify-write
      // path goes through readWalletProfileConsistent instead.
      const profile = await loadWalletProfileFromBlobPath(blob.pathname, { fresh: false });
      return [wallet, profile];
    }
  );

  return Object.fromEntries(entries.filter(([, profile]) => profile));
}

function mergeRecordMaps(...maps) {
  const records = {};

  maps.forEach((recordMap) => {
    Object.entries(recordMap || {}).forEach(([wallet, value]) => {
      records[wallet] = normalizeWalletProfile(value);
    });
  });

  return {
    version: EMPTY_DB.version,
    records,
  };
}

async function writeWalletProfileBlob(wallet, profile, { ifMatch = null } = {}) {
  const json = JSON.stringify(normalizeWalletProfile(profile), null, 2);

  // 1. Immutable content-addressed version FIRST — readers resolve the
  //    deterministic blob's etag (= md5 of this json) to this pathname, so
  //    it must exist before the pointer flips. Long cache age is safe and
  //    desirable: the content at this pathname never changes.
  await put(buildWalletProfileVersionPath(wallet, md5Hex(json)), json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true, // idempotent: same md5 ⇒ same content
    contentType: "application/json",
    cacheControlMaxAge: 31536000,
  });

  // 2. Deterministic pointer/content blob (also the legacy read path).
  await put(buildWalletProfileBlobPath(wallet), json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 0,
    ...(ifMatch ? { ifMatch } : {}),
  });
}

function isEtagConflictError(error) {
  return (
    error?.constructor?.name === "BlobPreconditionFailedError" ||
    /precondition failed/i.test(String(error?.message || ""))
  );
}

async function withDbMutation(mutate) {
  const run = async () => {
    const snapshot = await loadLocalDbSnapshot();
    const result = await mutate(snapshot.db);

    await ensureStorage();
    const tempPath = `${DB_PATH}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(snapshot.db, null, 2), "utf8");
    await fs.rename(tempPath, DB_PATH);

    return result;
  };

  writeQueue = writeQueue.catch(() => null).then(run);
  return writeQueue;
}

async function getWalletProfile(wallet) {
  if (!wallet) return cloneWalletProfile(EMPTY_WALLET_PROFILE);

  if (!isBlobDbEnabled()) {
    const db = await readDb();
    return normalizeWalletProfile(db.records[wallet]);
  }

  const cached = walletProfileReadCache.get(wallet);
  if (cached && cached.expiresAt > Date.now()) {
    const profile = await cached.promise;
    return cloneWalletProfile(profile);
  }
  if (cached) {
    walletProfileReadCache.delete(wallet);
  }

  const pending = (async () => {
    const profile = await loadBlobWalletProfile(wallet);
    if (profile) {
      return profile;
    }

    const legacySnapshot = await loadLegacyBlobDbSnapshot();
    return normalizeWalletProfile(legacySnapshot?.db?.records?.[wallet]);
  })();

  walletProfileReadCache.set(wallet, {
    promise: pending,
    expiresAt: Date.now() + WALLET_PROFILE_READ_CACHE_TTL_MS,
  });

  try {
    const profile = await pending;
    return cloneWalletProfile(profile);
  } catch (error) {
    walletProfileReadCache.delete(wallet);
    throw error;
  }
}

function sortCharactersByRecent(left, right) {
  const leftTime = Date.parse(
    left?.character?.completedAt || left?.character?.updatedAt || left?.character?.createdAt || 0
  );
  const rightTime = Date.parse(
    right?.character?.completedAt || right?.character?.updatedAt || right?.character?.createdAt || 0
  );

  return rightTime - leftTime;
}

async function findCharacterRecordById(characterId) {
  if (!characterId) return null;

  const db = await readDb();

  for (const [wallet, value] of Object.entries(db.records)) {
    const profile = normalizeWalletProfile(value);

    if (profile.draft?.id === characterId) {
      return {
        wallet,
        character: cloneRecord(profile.draft),
      };
    }

    const completedCharacter = profile.characters.find((record) => record.id === characterId);
    if (completedCharacter) {
      return {
        wallet,
        character: cloneRecord(completedCharacter),
      };
    }
  }

  return null;
}

async function readDb() {
  if (!isBlobDbEnabled()) {
    const snapshot = await loadLocalDbSnapshot();
    return snapshot.db;
  }

  if (dbReadCache && dbReadCache.expiresAt > Date.now()) {
    return dbReadCache.promise;
  }

  const pending = (async () => {
    const [legacySnapshot, blobProfiles] = await Promise.all([
      loadLegacyBlobDbSnapshot(),
      loadAllBlobWalletProfiles(),
    ]);
    return mergeRecordMaps(legacySnapshot?.db?.records || {}, blobProfiles);
  })();

  const entry = { promise: pending, expiresAt: Date.now() + DB_SNAPSHOT_TTL_MS };
  dbReadCache = entry;

  try {
    return await pending;
  } catch (error) {
    if (dbReadCache === entry) {
      dbReadCache = null;
    }
    throw error;
  }
}

async function listAllCharacters() {
  const db = await readDb();
  const characters = [];

  for (const [wallet, value] of Object.entries(db.records)) {
    const profile = normalizeWalletProfile(value);
    profile.characters.forEach((character) => {
      characters.push({
        wallet,
        character: cloneRecord(character),
      });
    });
  }

  characters.sort(sortCharactersByRecent);
  return characters;
}

async function saveWalletProfile(wallet, profile) {
  if (isBlobDbEnabled()) {
    const normalized = stampProfileUpdatedAt(normalizeWalletProfile(profile));
    const key = String(wallet || "").trim();
    const previous = walletWriteQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => null).then(async () => {
      await writeWalletProfileBlob(wallet, normalized);
      walletProfileReadCache.delete(wallet);
      patchDbSnapshot(wallet, normalized);
      return cloneWalletProfile(normalized);
    });
    walletWriteQueues.set(key, next);

    try {
      return await next;
    } finally {
      if (walletWriteQueues.get(key) === next) {
        walletWriteQueues.delete(key);
      }
    }
  }

  return withDbMutation(async (db) => {
    db.records[wallet] = stampProfileUpdatedAt(normalizeWalletProfile(profile));
    return cloneWalletProfile(db.records[wallet]);
  });
}

const PROFILE_CAS_ATTEMPTS = 5;

async function updateWalletProfile(wallet, updater) {
  if (isBlobDbEnabled()) {
    const key = String(wallet || "").trim();
    const previous = walletWriteQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => null).then(async () => {
      // Compare-and-swap: the in-memory queue only serializes writes within
      // THIS lambda instance. Concurrent invocations (or a stale read) would
      // silently clobber each other's writes, so every write carries the
      // ETag of the profile version it was computed from; on a conflict we
      // re-read and re-run the updater.
      for (let attempt = 0; attempt < PROFILE_CAS_ATTEMPTS; attempt += 1) {
        const consistent = await readWalletProfileConsistent(wallet);
        const direct = consistent ? consistent.profile : null;
        const etag = consistent ? consistent.etag : null;
        // No deterministic blob yet → legacy/list fallback (or a brand-new
        // wallet); no CAS possible on the first write of the deterministic file.
        const current = direct || (await getWalletProfile(wallet));

        const updated = await updater(cloneWalletProfile(current));
        const normalized = updated
          ? stampProfileUpdatedAt(normalizeWalletProfile(updated))
          : stampProfileUpdatedAt(cloneWalletProfile(EMPTY_WALLET_PROFILE));

        try {
          await writeWalletProfileBlob(wallet, normalized, { ifMatch: direct ? etag : null });
        } catch (error) {
          if (isEtagConflictError(error)) {
            if (attempt < PROFILE_CAS_ATTEMPTS - 1) {
              walletProfileReadCache.delete(wallet);
              continue;
            }
            // Fail open: availability beats strict CAS here. After several
            // re-read+retry rounds the base is at most ~a second old, which
            // is no worse than the pre-CAS behaviour — and a hard error
            // would block farms/burns/battles entirely.
            console.warn(
              `[store] profile CAS kept conflicting for ${wallet} — falling back to unconditional write`
            );
            await writeWalletProfileBlob(wallet, normalized);
          } else {
            throw error;
          }
        }

        walletProfileReadCache.delete(wallet);
        patchDbSnapshot(wallet, normalized);
        return cloneWalletProfile(normalized);
      }

      throw new Error("Profile write conflict — please retry.");
    });
    walletWriteQueues.set(key, next);

    try {
      return await next;
    } finally {
      if (walletWriteQueues.get(key) === next) {
        walletWriteQueues.delete(key);
      }
    }
  }

  return withDbMutation(async (db) => {
    const current = normalizeWalletProfile(db.records[wallet]);
    const next = await updater(cloneWalletProfile(current));

    if (!next) {
      delete db.records[wallet];
      return cloneWalletProfile(EMPTY_WALLET_PROFILE);
    }

    db.records[wallet] = stampProfileUpdatedAt(normalizeWalletProfile(next));
    return cloneWalletProfile(db.records[wallet]);
  });
}

async function deleteCharacterById(characterId) {
  if (!characterId) return null;

  if (isBlobDbEnabled()) {
    const db = await readDb();

    for (const [wallet, value] of Object.entries(db.records)) {
      const snapshot = normalizeWalletProfile(value);

      if (!snapshot.characters.some((record) => record.id === characterId)) {
        continue;
      }

      // The scan snapshot only tells us WHO owns the character; the removal
      // itself runs through updateWalletProfile so it is computed from a
      // consistent read and cannot clobber a concurrent battle/farm write.
      let deletedCharacter = null;
      await updateWalletProfile(wallet, (profile) => {
        const characterIndex = profile.characters.findIndex((record) => record.id === characterId);
        if (characterIndex === -1) {
          return profile;
        }

        [deletedCharacter] = profile.characters.splice(characterIndex, 1);
        return !profile.draft && profile.characters.length === 0 ? null : profile;
      });

      if (!deletedCharacter) {
        return null;
      }

      if (deletedCharacter.image) {
        await deleteStoredImage(deletedCharacter.image);
      }

      return {
        wallet,
        character: cloneRecord(deletedCharacter),
      };
    }

    return null;
  }

  const deleted = await withDbMutation(async (db) => {
    for (const [wallet, value] of Object.entries(db.records)) {
      const profile = normalizeWalletProfile(value);
      const characterIndex = profile.characters.findIndex((record) => record.id === characterId);

      if (characterIndex === -1) {
        continue;
      }

      const [deletedCharacter] = profile.characters.splice(characterIndex, 1);

      if (!profile.draft && profile.characters.length === 0) {
        delete db.records[wallet];
      } else {
        db.records[wallet] = normalizeWalletProfile(profile);
      }

      return {
        wallet,
        character: cloneRecord(deletedCharacter),
      };
    }

    return null;
  });

  if (deleted?.character?.image) {
    await deleteStoredImage(deleted.character.image);
  }

  return deleted;
}

function buildImagePath(characterId, extension) {
  return path.join(IMAGES_DIR, `${characterId}.${extension}`);
}

function isBlobImageStoreEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function buildBlobImagePath(characterId, extension) {
  return `${BLOB_IMAGE_PREFIX}/${characterId}.${extension}`;
}

async function uploadImageToBlob(characterId, extension, buffer, mimeType) {
  const pathname = buildBlobImagePath(characterId, extension);
  const blob = await put(pathname, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: mimeType,
    cacheControlMaxAge: 31536000,
  });

  return {
    url: blob.url,
    blobPathname: blob.pathname,
  };
}

async function writeImageBuffer(characterId, extension, buffer, mimeType = "image/png") {
  if (isBlobImageStoreEnabled()) {
    return uploadImageToBlob(characterId, extension, buffer, mimeType);
  }

  await ensureStorage();
  const filePath = buildImagePath(characterId, extension);
  await fs.writeFile(filePath, buffer);
  return { filePath };
}

async function copyFallbackImage(characterId, sourcePath) {
  if (isBlobImageStoreEnabled()) {
    const buffer = await fs.readFile(sourcePath);
    return uploadImageToBlob(characterId, "jpg", buffer, "image/jpeg");
  }

  await ensureStorage();
  const targetPath = buildImagePath(characterId, "jpg");
  await fs.copyFile(sourcePath, targetPath);
  return { filePath: targetPath };
}

async function deleteStoredImage(image) {
  if (!image || typeof image !== "object") {
    return;
  }

  if (image.blobPathname && isBlobImageStoreEnabled()) {
    try {
      await del(image.blobPathname);
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[character:image:delete]", error.message);
      }
    }
    return;
  }

  if (image.filePath) {
    try {
      await fs.unlink(image.filePath);
    } catch (error) {
      if (error.code !== "ENOENT" && process.env.NODE_ENV !== "production") {
        console.warn("[character:image:delete]", error.message);
      }
    }
  }
}

function createImageStore() {
  return {
    copyFallbackImage,
    writeImageBuffer,
  };
}

module.exports = {
  clearWalletProfileCache,
  createImageStore,
  deleteCharacterById,
  deleteStoredImage,
  findCharacterRecordById,
  getWalletProfile,
  isBlobDbEnabled,
  isBlobImageStoreEnabled,
  listAllCharacters,
  listLatestWalletProfileBlobs,
  loadWalletProfileFromBlobPath,
  mapWithConcurrency,
  readDb,
  saveWalletProfile,
  updateWalletProfile,
};
