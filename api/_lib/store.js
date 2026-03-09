const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { del, get, put } = require("@vercel/blob");

const DATA_DIR = path.join(process.cwd(), ".data");
const IMAGES_DIR = path.join(DATA_DIR, "character-images");
const DB_PATH = path.join(DATA_DIR, "characters.json");
const BLOB_IMAGE_PREFIX = String(process.env.BLOB_CHARACTER_IMAGE_PREFIX || "characters").replace(
  /^\/+|\/+$/g,
  ""
);
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
};
const DB_MUTATION_RETRY_LIMIT = 4;

let writeQueue = Promise.resolve();

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
  };
}

function normalizeWalletProfile(rawValue) {
  if (!rawValue || typeof rawValue !== "object") {
    return cloneWalletProfile(EMPTY_WALLET_PROFILE);
  }

  if (Array.isArray(rawValue.characters) || "draft" in rawValue) {
    return cloneWalletProfile(rawValue);
  }

  if (rawValue.status === "draft") {
    return {
      draft: cloneRecord(rawValue),
      characters: [],
    };
  }

  if (rawValue.status === "completed") {
    return {
      draft: null,
      characters: [cloneRecord(rawValue)],
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

async function loadBlobDbSnapshot(access, { useCache = true, includeEtag = true } = {}) {
  const blobResult = await get(DB_BLOB_PATH, {
    access,
    ...(access === "private" ? { useCache } : {}),
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
    etag: includeEtag ? blobResult.blob.etag || null : null,
  };
}

async function loadDbSnapshot() {
  if (isBlobDbEnabled()) {
    const privateSnapshot = await loadBlobDbSnapshot("private", {
      useCache: false,
      includeEtag: true,
    });
    if (privateSnapshot) {
      return privateSnapshot;
    }

    const publicSnapshot = await loadBlobDbSnapshot("public", {
      includeEtag: false,
    });
    if (publicSnapshot) {
      return publicSnapshot;
    }

    return {
      db: { ...EMPTY_DB },
      etag: null,
    };
  }

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

async function readDb() {
  const snapshot = await loadDbSnapshot();
  return snapshot.db;
}

async function writeDb(nextDb, etag = null) {
  if (isBlobDbEnabled()) {
    await put(DB_BLOB_PATH, JSON.stringify(nextDb, null, 2), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json",
      cacheControlMaxAge: 60,
      ...(etag ? { ifMatch: etag } : {}),
    });
    return;
  }

  await ensureStorage();
  const tempPath = `${DB_PATH}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(nextDb, null, 2), "utf8");
  await fs.rename(tempPath, DB_PATH);
}

function isBlobPreconditionError(error) {
  const message = String(error?.message || "");
  return error?.name === "BlobPreconditionFailedError" || /precondition failed|etag mismatch/i.test(message);
}

async function executeDbMutation(mutate) {
  for (let attempt = 0; attempt < DB_MUTATION_RETRY_LIMIT; attempt += 1) {
    const snapshot = await loadDbSnapshot();
    const result = await mutate(snapshot.db);

    try {
      await writeDb(snapshot.db, snapshot.etag);
      return result;
    } catch (error) {
      const shouldRetry =
        isBlobDbEnabled() &&
        isBlobPreconditionError(error) &&
        attempt < DB_MUTATION_RETRY_LIMIT - 1;

      if (!shouldRetry) {
        throw error;
      }
    }
  }

  throw new Error("Database mutation retry limit reached.");
}

async function withDbMutation(mutate) {
  const run = async () => executeDbMutation(mutate);
  writeQueue = writeQueue.catch(() => null).then(run);

  return writeQueue;
}

async function getWalletProfile(wallet) {
  if (!wallet) return cloneWalletProfile(EMPTY_WALLET_PROFILE);
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
  return withDbMutation(async (db) => {
    db.records[wallet] = normalizeWalletProfile(profile);
    return cloneWalletProfile(db.records[wallet]);
  });
}

async function updateWalletProfile(wallet, updater) {
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
