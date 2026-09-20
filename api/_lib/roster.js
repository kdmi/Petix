const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { get, head, put } = require("@vercel/blob");
const { isBlobNotFoundError } = require("./blob-read");
const { serializeCharacterRecord } = require("./character");
const {
  isBlobDbEnabled,
  listAllCharacters,
  listLatestWalletProfileBlobs,
  loadWalletProfileFromBlobPath,
  mapWithConcurrency,
} = require("./store");

// Roster index (feature 023).
//
// Matchmaking used to need every wallet profile on every battle: one blob GET
// per wallet, ~1123 of them on 2026-09-20, which is both the Blob op budget and
// the incident that showed players "fetch failed". The index is a compact
// projection of the characters that can be picked as opponents, kept in ONE
// blob and refreshed incrementally: `list()` reports each profile blob's
// `uploadedAt`, so only profiles newer than the stored watermark are re-read.
//
// The index is never the source of truth for a fight: once an opponent is
// chosen, its full record is read from the owner's profile (spec FR-003).

const ROSTER_VERSION = 1;

const DATA_DIR =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), ".data")
    : path.join(process.cwd(), ".data", "local-dev");
const ROSTER_FILE_PATH = path.join(DATA_DIR, "roster.json");

const ROSTER_BLOB_PATH =
  process.env.ROSTER_BLOB_PATH ||
  `system/${crypto
    .createHash("sha256")
    .update(
      String(process.env.INTERNAL_API_SECRET || process.env.SOLANA_AUTH_SECRET || "petix-roster")
    )
    .digest("hex")
    .slice(0, 32)}-roster.json`;
// Same content-addressed scheme the profiles and battles use: an overwritten
// blob is served stale for a while, and the writer must never merge onto stale
// content (it would resurrect removed characters).
const ROSTER_VERSION_PREFIX = `${ROSTER_BLOB_PATH.replace(/\.json$/, "")}-v/`;

function readIntEnv(name, fallback, minimum) {
  const raw = Number.parseInt(process.env[name] || "", 10);
  return Number.isFinite(raw) ? Math.max(minimum, raw) : fallback;
}

function isRosterEnabled() {
  return String(process.env.ROSTER_ENABLED ?? "1").trim() !== "0";
}

function getCacheTtlMs() {
  return readIntEnv("ROSTER_CACHE_TTL_MS", 60000, 0);
}

function getMaxAgeMs() {
  return readIntEnv("ROSTER_MAX_AGE_MS", 600000, 0);
}

function getWatermarkOverlapMs() {
  return readIntEnv("ROSTER_WATERMARK_OVERLAP_MS", 30000, 0);
}

function getFullSyncEvery() {
  return readIntEnv("ROSTER_FULL_EVERY", 60, 1);
}

let rosterCache = null; // { promise, expiresAt } | null

function clearRosterCache() {
  rosterCache = null;
}

function emptyRosterDocument() {
  return {
    version: ROSTER_VERSION,
    builtAt: null,
    watermark: null,
    fullSyncAt: null,
    syncCount: 0,
    entries: [],
  };
}

/**
 * Compact projection of a character record: a pruned record that still walks
 * through `serializeCharacterRecord` the same way the full one does, so
 * matchmaking and the reveal cards need no special case. Returns null for
 * anything that can never be an opponent (drafts, records without an image).
 */
function buildRosterEntry(wallet, character) {
  const walletKey = String(wallet || "").trim();
  if (!walletKey || !character || character.status !== "completed") {
    return null;
  }

  const serialized = serializeCharacterRecord(character);
  if (!serialized?.id || !serialized.imageUrl) {
    return null;
  }

  const selectedPower = serialized.selectedPower;

  return {
    wallet: walletKey,
    character: {
      id: serialized.id,
      status: serialized.status,
      // Raw name/rarity fields, not the serialized labels: they are fed back
      // through the same serializer when a card is built.
      name: character.name || null,
      displayName: character.displayName || null,
      creatureType: character.creatureType || null,
      rarity: character.rarity ?? null,
      level: serialized.level,
      // Precomputed so the entry does not have to carry the image record;
      // buildCharacterImageUrl() returns record.imageUrl as-is.
      imageUrl: serialized.imageUrl,
      selectedPower: selectedPower
        ? { id: selectedPower.id || "", name: selectedPower.name || "" }
        : null,
      completedAt: character.completedAt || null,
      updatedAt: character.updatedAt || null,
    },
  };
}

function buildEntriesFromProfile(wallet, profile) {
  const characters = Array.isArray(profile?.characters) ? profile.characters : [];
  return characters.map((character) => buildRosterEntry(wallet, character)).filter(Boolean);
}

function normalizeRosterDocument(raw) {
  if (!raw || typeof raw !== "object" || raw.version !== ROSTER_VERSION) {
    return null;
  }

  const entries = Array.isArray(raw.entries)
    ? raw.entries.filter((entry) => entry?.wallet && entry?.character?.id)
    : null;

  if (!entries) {
    return null;
  }

  return {
    version: ROSTER_VERSION,
    builtAt: raw.builtAt || null,
    watermark: raw.watermark || null,
    fullSyncAt: raw.fullSyncAt || null,
    syncCount: Number.isFinite(Number(raw.syncCount)) ? Number(raw.syncCount) : 0,
    entries,
  };
}

async function readRosterBlob({ consistent }) {
  if (!consistent) {
    const blob = await get(ROSTER_BLOB_PATH, { access: "public" }).catch((error) => {
      if (isBlobNotFoundError(error)) return null;
      throw error;
    });
    return blob;
  }

  // Writer path: head() hits the API (never the CDN) and its etag is the md5 of
  // the current content, which is exactly the immutable version's pathname.
  const meta = await head(ROSTER_BLOB_PATH).catch((error) => {
    if (isBlobNotFoundError(error)) return null;
    throw error;
  });
  if (!meta) return null;

  const contentMd5 = String(meta.etag || "").replace(/^W\//i, "").replace(/^"+|"+$/g, "");
  if (/^[a-f0-9]{32}$/.test(contentMd5)) {
    const versioned = await get(`${ROSTER_VERSION_PREFIX}${contentMd5}.json`, {
      access: "public",
    }).catch((error) => {
      if (isBlobNotFoundError(error)) return null;
      throw error;
    });
    if (versioned) return versioned;
  }

  return get(ROSTER_BLOB_PATH, { access: "public" }).catch((error) => {
    if (isBlobNotFoundError(error)) return null;
    throw error;
  });
}

async function readBlobText(stream) {
  if (!stream) return "";

  if (typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readRosterDocument({ consistent = false } = {}) {
  if (!isBlobDbEnabled()) {
    const raw = await fs.readFile(ROSTER_FILE_PATH, "utf8").catch(() => null);
    if (!raw) return null;
    try {
      return normalizeRosterDocument(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  const blob = await readRosterBlob({ consistent });
  if (!blob || blob.statusCode !== 200) return null;

  const raw = await readBlobText(blob.stream);
  try {
    return normalizeRosterDocument(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeRosterDocument(document) {
  const json = JSON.stringify(document);

  if (!isBlobDbEnabled()) {
    await fs.mkdir(path.dirname(ROSTER_FILE_PATH), { recursive: true });
    await fs.writeFile(ROSTER_FILE_PATH, json, "utf8");
    return;
  }

  const contentMd5 = crypto.createHash("md5").update(json).digest("hex");
  // Immutable version first — a reader that resolves the pointer's etag must
  // always find the matching content already in place.
  await put(`${ROSTER_VERSION_PREFIX}${contentMd5}.json`, json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 31536000,
  });
  await put(ROSTER_BLOB_PATH, json, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

function latestUploadedAt(blobs) {
  return blobs.reduce((latest, blob) => {
    const time = Date.parse(blob?.uploadedAt || "");
    if (!Number.isFinite(time)) return latest;
    return time > latest ? time : latest;
  }, 0);
}

async function buildFullRosterDocument() {
  const characters = await listAllCharacters();
  const entries = characters
    .map(({ wallet, character }) => buildRosterEntry(wallet, character))
    .filter(Boolean);

  let watermark = null;
  if (isBlobDbEnabled()) {
    const blobs = await listLatestWalletProfileBlobs();
    const latest = latestUploadedAt(blobs);
    if (latest) {
      // listAllCharacters() may serve a snapshot up to the scan TTL old, so the
      // watermark is pulled back by that window: the next incremental pass
      // re-reads anything written while the snapshot was being reused.
      const snapshotTtl = readIntEnv("WALLET_PROFILE_SCAN_TTL_MS", 60000, 0);
      watermark = new Date(latest - Math.max(snapshotTtl, getWatermarkOverlapMs())).toISOString();
    }
  }

  const now = new Date().toISOString();
  return {
    version: ROSTER_VERSION,
    builtAt: now,
    watermark,
    fullSyncAt: now,
    syncCount: 0,
    entries,
  };
}

function documentAgeMs(document) {
  const builtAt = Date.parse(document?.builtAt || "");
  return Number.isFinite(builtAt) ? Date.now() - builtAt : Number.POSITIVE_INFINITY;
}

async function refreshRoster({ force = false } = {}) {
  const startedAt = Date.now();

  if (!isRosterEnabled()) {
    return { mode: "skipped", reason: "ROSTER_DISABLED", entries: 0, wallets: 0, profilesRead: 0 };
  }

  // Dev storage is a single local JSON file — a full build costs nothing.
  if (!isBlobDbEnabled()) {
    const document = await buildFullRosterDocument();
    await writeRosterDocument(document);
    clearRosterCache();
    return {
      mode: "full",
      entries: document.entries.length,
      wallets: new Set(document.entries.map((entry) => entry.wallet)).size,
      profilesRead: 0,
      removedWallets: 0,
      watermark: document.watermark,
      durationMs: Date.now() - startedAt,
    };
  }

  const current = await readRosterDocument({ consistent: true }).catch(() => null);
  const needsFull =
    force ||
    !current ||
    !current.watermark ||
    current.syncCount >= getFullSyncEvery();

  if (needsFull) {
    const document = await buildFullRosterDocument();
    await writeRosterDocument(document);
    clearRosterCache();
    return {
      mode: "full",
      entries: document.entries.length,
      wallets: new Set(document.entries.map((entry) => entry.wallet)).size,
      profilesRead: document.entries.length,
      removedWallets: 0,
      watermark: document.watermark,
      durationMs: Date.now() - startedAt,
    };
  }

  const blobs = await listLatestWalletProfileBlobs();
  const knownWallets = new Set(blobs.map((blob) => blob.wallet));
  const watermarkMs = Date.parse(current.watermark);
  const cutoff = Number.isFinite(watermarkMs)
    ? watermarkMs - getWatermarkOverlapMs()
    : Number.NEGATIVE_INFINITY;

  // `uploadedAt` has second granularity, so the cutoff sits
  // ROSTER_WATERMARK_OVERLAP_MS *before* the watermark: a write that landed in
  // the same second as the previous run is re-read instead of slipping through.
  // A blob without a parsable timestamp is always re-read.
  const changed = blobs.filter((blob) => {
    const uploadedAt = Date.parse(blob.uploadedAt || "");
    return !Number.isFinite(uploadedAt) || uploadedAt > cutoff;
  });

  const refreshedEntries = await mapWithConcurrency(
    changed,
    readIntEnv("WALLET_PROFILE_SCAN_CONCURRENCY", 24, 1),
    async (blob) => {
      // Cache-busted read: this is the authoritative merge, a stale profile
      // here would be baked into the index until the next hourly full sync.
      const profile = await loadWalletProfileFromBlobPath(blob.pathname, { fresh: true });
      return { wallet: blob.wallet, entries: profile ? buildEntriesFromProfile(blob.wallet, profile) : [] };
    }
  );

  const changedWallets = new Set(changed.map((blob) => blob.wallet));
  const keptEntries = current.entries.filter(
    (entry) => knownWallets.has(entry.wallet) && !changedWallets.has(entry.wallet)
  );
  const removedWallets = new Set(
    current.entries
      .map((entry) => entry.wallet)
      .filter((wallet) => !knownWallets.has(wallet))
  ).size;

  const entries = keptEntries.concat(refreshedEntries.flatMap((result) => result.entries));

  const latest = latestUploadedAt(blobs);
  const document = {
    version: ROSTER_VERSION,
    builtAt: new Date().toISOString(),
    watermark: latest ? new Date(latest).toISOString() : current.watermark,
    fullSyncAt: current.fullSyncAt,
    syncCount: (current.syncCount || 0) + 1,
    entries,
  };

  await writeRosterDocument(document);
  clearRosterCache();

  return {
    mode: "incremental",
    entries: entries.length,
    wallets: knownWallets.size,
    profilesRead: changed.length,
    removedWallets,
    watermark: document.watermark,
    durationMs: Date.now() - startedAt,
  };
}

async function resolveRosterEntries() {
  const stored = await readRosterDocument().catch(() => null);
  if (stored && documentAgeMs(stored) <= getMaxAgeMs()) {
    return stored.entries;
  }

  // Missing, unreadable or too old: rebuild from the full scan so the player
  // still gets a fight, and persist the result best-effort.
  try {
    const document = await buildFullRosterDocument();
    void writeRosterDocument(document).catch(() => null);
    return document.entries;
  } catch (error) {
    if (stored?.entries?.length) {
      // A stale roster beats no roster — the fight itself reads fresh profiles.
      return stored.entries;
    }
    throw error;
  }
}

/**
 * Opponent candidates in the same shape `listAllCharacters()` returns
 * (`{ wallet, character }`), so callers only swap the source.
 */
async function getRoster() {
  if (!isRosterEnabled()) {
    return listAllCharacters();
  }

  if (rosterCache && rosterCache.expiresAt > Date.now()) {
    return rosterCache.promise;
  }

  const entry = { promise: resolveRosterEntries(), expiresAt: Date.now() + getCacheTtlMs() };
  rosterCache = entry;

  try {
    return await entry.promise;
  } catch (error) {
    if (rosterCache === entry) {
      rosterCache = null;
    }
    // Last line of defence: never turn a storage problem into a failed battle.
    return listAllCharacters();
  }
}

async function getRosterStatus() {
  const enabled = isRosterEnabled();
  const document = await readRosterDocument().catch(() => null);

  if (!document) {
    return { enabled, builtAt: null, ageMs: null, entries: 0, wallets: 0, watermark: null };
  }

  return {
    enabled,
    builtAt: document.builtAt,
    ageMs: Number.isFinite(documentAgeMs(document)) ? documentAgeMs(document) : null,
    entries: document.entries.length,
    wallets: new Set(document.entries.map((entry) => entry.wallet)).size,
    watermark: document.watermark,
  };
}

module.exports = {
  ROSTER_VERSION,
  buildRosterEntry,
  clearRosterCache,
  getRoster,
  getRosterStatus,
  isRosterEnabled,
  refreshRoster,
};
