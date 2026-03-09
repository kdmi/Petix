const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), ".data");
const IMAGES_DIR = path.join(DATA_DIR, "character-images");
const DB_PATH = path.join(DATA_DIR, "characters.json");

const EMPTY_DB = {
  version: 2,
  records: {},
};

const EMPTY_WALLET_PROFILE = {
  draft: null,
  characters: [],
};

let writeQueue = Promise.resolve();

async function ensureStorage() {
  await fs.mkdir(IMAGES_DIR, { recursive: true });
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

async function readDb() {
  await ensureStorage();

  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    const parsed = JSON.parse(raw);
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
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ...EMPTY_DB };
    }
    throw error;
  }
}

async function writeDb(nextDb) {
  await ensureStorage();
  const tempPath = `${DB_PATH}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(nextDb, null, 2), "utf8");
  await fs.rename(tempPath, DB_PATH);
}

async function withDbMutation(mutate) {
  writeQueue = writeQueue.then(async () => {
    const db = await readDb();
    const result = await mutate(db);
    await writeDb(db);
    return result;
  });

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

  return withDbMutation(async (db) => {
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
}

function buildImagePath(characterId, extension) {
  return path.join(IMAGES_DIR, `${characterId}.${extension}`);
}

async function writeImageBuffer(characterId, extension, buffer) {
  await ensureStorage();
  const filePath = buildImagePath(characterId, extension);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function copyFallbackImage(characterId, sourcePath) {
  await ensureStorage();
  const targetPath = buildImagePath(characterId, "jpg");
  await fs.copyFile(sourcePath, targetPath);
  return targetPath;
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
  listAllCharacters,
  readDb,
  saveWalletProfile,
  updateWalletProfile,
};
