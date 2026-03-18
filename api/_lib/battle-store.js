const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { get, put } = require("@vercel/blob");

const DATA_DIR =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), ".data")
    : path.join(process.cwd(), ".data", "local-dev");
const BATTLES_PATH = path.join(DATA_DIR, "battles.json");
const BATTLES_BLOB_PATH =
  process.env.BATTLES_DB_BLOB_PATH ||
  `system/${crypto
    .createHash("sha256")
    .update(
      String(process.env.INTERNAL_API_SECRET || process.env.SOLANA_AUTH_SECRET || "petix-battles")
    )
    .digest("hex")
    .slice(0, 32)}-battles.json`;

const EMPTY_BATTLES_DB = {
  version: 1,
  records: {},
};

let writeQueue = Promise.resolve();

function cloneValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function isBlobDbEnabled() {
  return process.env.NODE_ENV === "production" && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function normalizeDbShape(parsed) {
  if (!parsed || typeof parsed !== "object" || typeof parsed.records !== "object") {
    return { ...EMPTY_BATTLES_DB };
  }

  return {
    version: EMPTY_BATTLES_DB.version,
    records: Object.fromEntries(
      Object.entries(parsed.records).map(([battleId, record]) => [battleId, cloneValue(record)])
    ),
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

async function loadLocalDbSnapshot() {
  await ensureStorage();

  try {
    const raw = await fs.readFile(BATTLES_PATH, "utf8");
    return normalizeDbShape(raw ? JSON.parse(raw) : EMPTY_BATTLES_DB);
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ...EMPTY_BATTLES_DB };
    }
    throw error;
  }
}

async function loadBlobDbSnapshot() {
  const blobResult = await get(BATTLES_BLOB_PATH, {
    access: "public",
  }).catch((error) => {
    if (error?.name === "BlobNotFoundError") {
      return null;
    }
    throw error;
  });

  if (!blobResult || blobResult.statusCode !== 200) {
    return { ...EMPTY_BATTLES_DB };
  }

  const raw = await readBlobText(blobResult.stream);
  return normalizeDbShape(raw ? JSON.parse(raw) : EMPTY_BATTLES_DB);
}

async function readDb() {
  if (isBlobDbEnabled()) {
    return loadBlobDbSnapshot();
  }

  return loadLocalDbSnapshot();
}

async function writeLocalDb(db) {
  await ensureStorage();
  await fs.writeFile(BATTLES_PATH, JSON.stringify(db, null, 2));
}

async function writeBlobDb(db) {
  await put(BATTLES_BLOB_PATH, JSON.stringify(db, null, 2), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json; charset=utf-8",
    cacheControlMaxAge: 0,
  });
}

async function withDbMutation(mutate) {
  const pending = writeQueue.catch(() => null).then(async () => {
    const current = await readDb();
    const next = (await mutate(current)) || current;

    if (isBlobDbEnabled()) {
      await writeBlobDb(next);
    } else {
      await writeLocalDb(next);
    }

    return normalizeDbShape(next);
  });

  writeQueue = pending;
  return pending;
}

async function saveBattleRecord(record) {
  if (!record?.id) {
    throw new Error("Battle id is required.");
  }

  const snapshot = cloneValue(record);
  await withDbMutation(async (db) => {
    db.records[snapshot.id] = snapshot;
    return db;
  });

  return snapshot;
}

async function updateBattleRecord(battleId, updater) {
  if (!battleId) return null;

  const db = await withDbMutation(async (current) => {
    const existing = cloneValue(current.records[battleId] || null);
    const next = await updater(existing);

    if (!next) {
      delete current.records[battleId];
      return current;
    }

    current.records[battleId] = cloneValue(next);
    return current;
  });

  return cloneValue(db.records[battleId] || null);
}

async function getBattleRecord(battleId) {
  if (!battleId) return null;

  const db = await readDb();
  return cloneValue(db.records[battleId] || null);
}

async function listBattleRecords() {
  const db = await readDb();
  return Object.values(db.records)
    .map((record) => cloneValue(record))
    .sort((left, right) => {
      const leftTime = Date.parse(left?.createdAt || 0);
      const rightTime = Date.parse(right?.createdAt || 0);
      return rightTime - leftTime;
    });
}

module.exports = {
  getBattleRecord,
  listBattleRecords,
  saveBattleRecord,
  updateBattleRecord,
};
