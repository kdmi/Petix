const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { del, get, list, put } = require("@vercel/blob");
const { normalizeBattleState } = require("./battle-energy");

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
};

let writeQueue = Promise.resolve();
const walletWriteQueues = new Map();

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
      ? profile.characters.map((record) => cloneRecord(record))
      : [],
    notifications: Array.isArray(profile?.notifications)
      ? profile.notifications.map((record) => cloneRecord(record))
      : [],
    battleState: normalizeBattleState(profile?.battleState),
  };
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
    };
  }

  if (rawValue.status === "completed") {
    return {
      draft: null,
      characters: [cloneRecord(rawValue)],
      notifications: [],
      battleState: normalizeBattleState(null),
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
  const blobResult = await get(DB_BLOB_PATH, {
    access: "public",
  }).catch((error) => {
    if (error?.name === "BlobNotFoundError") {
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
  return `${buildWalletProfileBlobPrefix(wallet)}${Date.now()}-${crypto.randomUUID()}.json`;
}

function extractWalletFromProfileBlobPath(pathname) {
  const prefix = `${WALLET_PROFILE_BLOB_PREFIX}/`;
  if (!String(pathname || "").startsWith(prefix)) {
    return "";
  }

  const rest = pathname.slice(prefix.length);
  const [encodedWallet] = rest.split("/");

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

async function loadWalletProfileFromBlobPath(pathname) {
  if (!pathname) return null;

  const blobResult = await get(pathname, {
    access: "public",
  }).catch((error) => {
    if (error?.name === "BlobNotFoundError") {
      return null;
    }
    throw error;
  });

  if (!blobResult || blobResult.statusCode !== 200) {
    return null;
  }

  const raw = await readBlobText(blobResult.stream);
  return normalizeWalletProfile(raw ? JSON.parse(raw) : EMPTY_WALLET_PROFILE);
}

async function loadBlobWalletProfile(wallet) {
  const blobs = await listBlobPathnames(buildWalletProfileBlobPrefix(wallet));
  const latest = blobs.reduce((current, candidate) => {
    return isNewerBlob(candidate, current) ? candidate : current;
  }, null);

  if (!latest) {
    return null;
  }

  return loadWalletProfileFromBlobPath(latest.pathname);
}

async function loadAllBlobWalletProfiles() {
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

  const entries = await Promise.all(
    [...latestByWallet.entries()].map(async ([wallet, blob]) => {
      const profile = await loadWalletProfileFromBlobPath(blob.pathname);
      return [wallet, profile];
    })
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

async function writeWalletProfileBlob(wallet, profile) {
  await put(buildWalletProfileBlobPath(wallet), JSON.stringify(normalizeWalletProfile(profile), null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 31536000,
  });
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

  if (isBlobDbEnabled()) {
    const profile = await loadBlobWalletProfile(wallet);
    if (profile) {
      return profile;
    }

    const legacySnapshot = await loadLegacyBlobDbSnapshot();
    return normalizeWalletProfile(legacySnapshot?.db?.records?.[wallet]);
  }

  const db = await readDb();
  return normalizeWalletProfile(db.records[wallet]);
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
  if (isBlobDbEnabled()) {
    const [legacySnapshot, blobProfiles] = await Promise.all([
      loadLegacyBlobDbSnapshot(),
      loadAllBlobWalletProfiles(),
    ]);

    return mergeRecordMaps(legacySnapshot?.db?.records || {}, blobProfiles);
  }

  const snapshot = await loadLocalDbSnapshot();
  return snapshot.db;
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
    const normalized = normalizeWalletProfile(profile);
    const key = String(wallet || "").trim();
    const previous = walletWriteQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => null).then(async () => {
      await writeWalletProfileBlob(wallet, normalized);
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
    db.records[wallet] = normalizeWalletProfile(profile);
    return cloneWalletProfile(db.records[wallet]);
  });
}

async function updateWalletProfile(wallet, updater) {
  if (isBlobDbEnabled()) {
    const key = String(wallet || "").trim();
    const previous = walletWriteQueues.get(key) || Promise.resolve();
    const next = previous.catch(() => null).then(async () => {
      const current = await getWalletProfile(wallet);
      const updated = await updater(cloneWalletProfile(current));
      const normalized = updated
        ? normalizeWalletProfile(updated)
        : cloneWalletProfile(EMPTY_WALLET_PROFILE);

      await writeWalletProfileBlob(wallet, normalized);
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
    const current = normalizeWalletProfile(db.records[wallet]);
    const next = await updater(cloneWalletProfile(current));

    if (!next) {
      delete db.records[wallet];
      return cloneWalletProfile(EMPTY_WALLET_PROFILE);
    }

    db.records[wallet] = normalizeWalletProfile(next);
    return cloneWalletProfile(db.records[wallet]);
  });
}

async function deleteCharacterById(characterId) {
  if (!characterId) return null;

  if (isBlobDbEnabled()) {
    const db = await readDb();

    for (const [wallet, value] of Object.entries(db.records)) {
      const profile = normalizeWalletProfile(value);
      const characterIndex = profile.characters.findIndex((record) => record.id === characterId);

      if (characterIndex === -1) {
        continue;
      }

      const [deletedCharacter] = profile.characters.splice(characterIndex, 1);
      const nextProfile =
        !profile.draft && profile.characters.length === 0
          ? cloneWalletProfile(EMPTY_WALLET_PROFILE)
          : profile;

      await saveWalletProfile(wallet, nextProfile);

      if (deletedCharacter?.image) {
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
  createImageStore,
  deleteCharacterById,
  findCharacterRecordById,
  getWalletProfile,
  isBlobImageStoreEnabled,
  listAllCharacters,
  readDb,
  saveWalletProfile,
  updateWalletProfile,
};
