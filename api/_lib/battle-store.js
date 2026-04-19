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
const DEFAULT_BATTLE_HISTORY_PAGE_SIZE = 8;
const MAX_BATTLE_HISTORY_PAGE_SIZE = 24;

let writeQueue = Promise.resolve();

function cloneValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function normalizeBattleRecord(record) {
  if (!record || typeof record !== "object" || !record.id) {
    return null;
  }

  return {
    id: String(record.id),
    status: String(record.status || "ready"),
    battleType: String(record.battleType || "pvp_random"),
    createdAt: record.createdAt || null,
    completedAt: record.completedAt || null,
    attackerPetId: record.attackerPetId || null,
    defenderPetId: record.defenderPetId || null,
    attackerOwnerWallet: record.attackerOwnerWallet || null,
    defenderOwnerWallet: record.defenderOwnerWallet || null,
    matchmaking: cloneValue(record.matchmaking || null),
    narrationMode: record.narrationMode || null,
    startingHp: cloneValue(record.startingHp || null),
    attackerSnapshot: cloneValue(record.attackerSnapshot || null),
    defenderSnapshot: cloneValue(record.defenderSnapshot || null),
    rounds: Array.isArray(record.rounds) ? cloneValue(record.rounds) : [],
    result: cloneValue(record.result || null),
    error: record.error || null,
  };
}

function getBattleSortTimestamp(record) {
  const rawValue = record?.completedAt || record?.createdAt || null;
  const timestamp = Date.parse(rawValue || 0);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareBattleRecordsNewestFirst(left, right) {
  const leftTime = getBattleSortTimestamp(left);
  const rightTime = getBattleSortTimestamp(right);

  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return String(right?.id || "").localeCompare(String(left?.id || ""));
}

function isReplayableBattleRecord(record) {
  return Boolean(
    record &&
      record.status === "ready" &&
      record.result &&
      record.attackerSnapshot &&
      record.defenderSnapshot
  );
}

function serializeBattleHistoryPet(snapshot) {
  if (!snapshot) {
    return null;
  }

  return {
    id: snapshot.id,
    name: snapshot.name,
    imageUrl: snapshot.imageUrl || null,
    level: Math.max(1, Math.floor(Number(snapshot.level) || 1)),
    rarity: snapshot.rarity || "Common",
  };
}

function serializeAdminBattlePet(snapshot, wallet) {
  if (!snapshot) {
    return null;
  }

  return {
    id: snapshot.id || null,
    wallet: wallet || null,
    name: snapshot.name || snapshot.displayName || snapshot.type || "Unknown",
    level: Math.max(1, Math.floor(Number(snapshot.level) || 1)),
    rarity: snapshot.rarity || "Common",
  };
}

function buildAdminCompletedBattleEntry(record) {
  if (!isReplayableBattleRecord(record)) {
    return null;
  }

  return {
    battleId: record.id,
    createdAt: record.createdAt || null,
    completedAt: record.completedAt || null,
    roundCount: Array.isArray(record.rounds) ? record.rounds.length : 0,
    winnerPetId: String(record.result?.winnerPetId || "").trim(),
    narrationMode: String(record.narrationMode || "template").trim() || "template",
    attackerPet: serializeAdminBattlePet(record.attackerSnapshot, record.attackerOwnerWallet || null),
    defenderPet: serializeAdminBattlePet(record.defenderSnapshot, record.defenderOwnerWallet || null),
  };
}

function calculateAverageRounds(entries, sampleSize) {
  if (!Array.isArray(entries) || !entries.length || sampleSize <= 0) {
    return 0;
  }

  const totalRounds = entries
    .slice(0, sampleSize)
    .reduce((sum, entry) => sum + Math.max(0, Math.floor(Number(entry?.roundCount) || 0)), 0);

  return Math.round((totalRounds / sampleSize) * 10) / 10;
}

function buildAdminBattleSummary(entries) {
  const battles = Array.isArray(entries) ? entries : [];
  const sampleSize = Math.min(50, battles.length);
  const aiNarratedBattles = battles.filter((entry) => entry?.narrationMode === "ai").length;
  const templateNarratedBattles = battles.filter((entry) => entry?.narrationMode !== "ai").length;
  const lastDayThreshold = Date.now() - 24 * 60 * 60 * 1000;
  const completedLast24Hours = battles.filter((entry) => {
    const timestamp = Date.parse(entry?.completedAt || entry?.createdAt || 0);
    return Number.isFinite(timestamp) && timestamp >= lastDayThreshold;
  }).length;

  return {
    totalCompletedBattles: battles.length,
    averageRoundsLast50: calculateAverageRounds(battles, sampleSize),
    averageRoundsSampleSize: sampleSize,
    aiNarratedBattles,
    templateNarratedBattles,
    completedLast24Hours,
  };
}

function buildBattleHistoryEntry(record, wallet) {
  if (!isReplayableBattleRecord(record) || !wallet) {
    return null;
  }

  const normalizedWallet = String(wallet || "").trim();
  const isAttacker = String(record.attackerOwnerWallet || "") === normalizedWallet;
  const isDefender = String(record.defenderOwnerWallet || "") === normalizedWallet;

  if (!isAttacker && !isDefender) {
    return null;
  }

  const playerSnapshot = isAttacker ? record.attackerSnapshot : record.defenderSnapshot;
  const opponentSnapshot = isAttacker ? record.defenderSnapshot : record.attackerSnapshot;
  const winnerPetId = String(record.result?.winnerPetId || "");
  const playerPetId = String(playerSnapshot?.id || "");

  return {
    battleId: record.id,
    playerRole: isAttacker ? "attacker" : "defender",
    outcome: playerPetId && winnerPetId === playerPetId ? "win" : "loss",
    createdAt: record.createdAt || null,
    completedAt: record.completedAt || null,
    playerPet: serializeBattleHistoryPet(playerSnapshot),
    opponentPet: serializeBattleHistoryPet(opponentSnapshot),
    finalSummaryText: String(record.result?.finalSummaryText || "").trim(),
    replayUrl: `/dashboard/?screen=arena&battleId=${encodeURIComponent(String(record.id || ""))}`,
  };
}

function resolveBattleHistoryPageSize(value) {
  const parsed = Math.floor(Number(value) || DEFAULT_BATTLE_HISTORY_PAGE_SIZE);
  return Math.max(1, Math.min(MAX_BATTLE_HISTORY_PAGE_SIZE, parsed));
}

function encodeBattleHistoryCursor(entry) {
  if (!entry?.battleId) {
    return null;
  }

  return Buffer.from(
    JSON.stringify({
      battleId: entry.battleId,
      completedAt: entry.completedAt || null,
      createdAt: entry.createdAt || null,
    }),
    "utf8"
  ).toString("base64url");
}

function decodeBattleHistoryCursor(cursor) {
  const rawCursor = String(cursor || "").trim();
  if (!rawCursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || !parsed.battleId) {
      return null;
    }

    return {
      battleId: String(parsed.battleId),
      completedAt: parsed.completedAt || null,
      createdAt: parsed.createdAt || null,
    };
  } catch {
    return null;
  }
}

function isBattleHistoryEntryOlderThanCursor(entry, cursor) {
  if (!entry || !cursor) {
    return false;
  }

  const entryTime = getBattleSortTimestamp(entry);
  const cursorTime = getBattleSortTimestamp(cursor);

  if (entryTime !== cursorTime) {
    return entryTime < cursorTime;
  }

  return String(entry.battleId || "").localeCompare(String(cursor.battleId || "")) < 0;
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
      Object.entries(parsed.records)
        .map(([battleId, record]) => [battleId, normalizeBattleRecord(record)])
        .filter(([, record]) => record)
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

  const snapshot = normalizeBattleRecord(record);
  await withDbMutation(async (db) => {
    db.records[snapshot.id] = snapshot;
    return db;
  });

  return snapshot;
}

async function updateBattleRecord(battleId, updater) {
  if (!battleId) return null;

  const db = await withDbMutation(async (current) => {
    const existing = normalizeBattleRecord(current.records[battleId] || null);
    const next = await updater(existing);

    if (!next) {
      delete current.records[battleId];
      return current;
    }

    current.records[battleId] = normalizeBattleRecord(next);
    return current;
  });

  return normalizeBattleRecord(db.records[battleId] || null);
}

async function getBattleRecord(battleId) {
  if (!battleId) return null;

  const db = await readDb();
  return normalizeBattleRecord(db.records[battleId] || null);
}

async function listBattleRecords() {
  const db = await readDb();
  return Object.values(db.records)
    .map((record) => normalizeBattleRecord(record))
    .filter(Boolean)
    .sort(compareBattleRecordsNewestFirst);
}

async function listBattleHistoryForWallet(wallet, { limit, cursor } = {}) {
  const normalizedWallet = String(wallet || "").trim();
  if (!normalizedWallet) {
    return {
      history: [],
      page: {
        nextCursor: null,
        hasMore: false,
      },
    };
  }

  const pageSize = resolveBattleHistoryPageSize(limit);
  const cursorState = decodeBattleHistoryCursor(cursor);
  const historyEntries = (await listBattleRecords())
    .map((record) => buildBattleHistoryEntry(record, normalizedWallet))
    .filter(Boolean);

  let visibleEntries = historyEntries;
  if (cursorState) {
    const cursorIndex = historyEntries.findIndex((entry) => entry.battleId === cursorState.battleId);
    visibleEntries =
      cursorIndex >= 0
        ? historyEntries.slice(cursorIndex + 1)
        : historyEntries.filter((entry) => isBattleHistoryEntryOlderThanCursor(entry, cursorState));
  }

  const slice = visibleEntries.slice(0, pageSize);
  const hasMore = visibleEntries.length > slice.length;
  const nextCursor = hasMore ? encodeBattleHistoryCursor(slice[slice.length - 1]) : null;

  return {
    history: slice.map((entry) => cloneValue(entry)),
    page: {
      nextCursor,
      hasMore,
    },
  };
}

async function listAdminCompletedBattles() {
  const battles = (await listBattleRecords())
    .map((record) => buildAdminCompletedBattleEntry(record))
    .filter(Boolean);

  return {
    summary: buildAdminBattleSummary(battles),
    battles: battles.map((entry) => cloneValue(entry)),
  };
}

module.exports = {
  buildAdminBattleSummary,
  buildAdminCompletedBattleEntry,
  buildBattleHistoryEntry,
  getBattleRecord,
  listAdminCompletedBattles,
  listBattleHistoryForWallet,
  listBattleRecords,
  saveBattleRecord,
  updateBattleRecord,
};
