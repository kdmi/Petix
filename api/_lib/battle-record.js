// Pure shape helpers for battle records: normalization, the history and admin
// projections, and the history cursor. They used to live in battle-store.js;
// feature 025 gave the records a second storage layout (one blob per battle
// plus indexes), and both layouts must project a record identically — so the
// projections live apart from either store.

const DEFAULT_BATTLE_HISTORY_PAGE_SIZE = 8;
const MAX_BATTLE_HISTORY_PAGE_SIZE = 24;

function cloneValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function normalizeCoinReward(rawValue) {
  const number = Number(rawValue);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(0, Math.floor(number));
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
    coinReward: normalizeCoinReward(record.coinReward),
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

module.exports = {
  DEFAULT_BATTLE_HISTORY_PAGE_SIZE,
  MAX_BATTLE_HISTORY_PAGE_SIZE,
  buildAdminBattleSummary,
  buildAdminCompletedBattleEntry,
  buildBattleHistoryEntry,
  cloneValue,
  compareBattleRecordsNewestFirst,
  decodeBattleHistoryCursor,
  encodeBattleHistoryCursor,
  getBattleSortTimestamp,
  isBattleHistoryEntryOlderThanCursor,
  isReplayableBattleRecord,
  normalizeBattleRecord,
  resolveBattleHistoryPageSize,
  serializeAdminBattlePet,
  serializeBattleHistoryPet,
};
