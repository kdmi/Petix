const { getSessionFromRequest, handleCors, isAdminSession, json } = require("../../api/_lib/auth");
const { normalizeFarmState } = require("../../api/_lib/farm");
const { readDb } = require("../../api/_lib/store");
const { listBattleRecords } = require("../../api/_lib/battle-store");

// Annual emission budget reference (Points). Курс 1:1 → 10M $PETIX/год (feature 013).
const POOL_BUDGET = Number(process.env.ECONOMY_POOL_BUDGET) || 10000000;
const DAY_MS = 24 * 60 * 60 * 1000;

function recordTimestamp(record) {
  return Date.parse(
    record?.completedAt || record?.result?.completedAt || record?.updatedAt || record?.createdAt || 0
  );
}

// Admin: emission/farm/slot aggregates vs the annual pool budget (feature 013, SC-008/009).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }
  if (!isAdminSession(session)) {
    json(res, 403, { error: "Forbidden." });
    return;
  }

  const db = await readDb();
  const records = db && db.records ? db.records : {};

  let totalEmitted = 0;
  let totalBalance = 0;
  let activeFarmers = 0;
  let totalPaidSlots = 0;
  const earners = [];

  for (const [wallet, profile] of Object.entries(records)) {
    const currency = profile.currency || { balance: 0, totalEarned: 0 };
    totalEmitted += Number(currency.totalEarned) || 0;
    totalBalance += Number(currency.balance) || 0;
    totalPaidSlots += Number(profile.paidSlots) || 0;
    activeFarmers += (profile.characters || []).filter(
      (record) => normalizeFarmState(record.farmState).active
    ).length;
    earners.push({ wallet, totalEarned: Number(currency.totalEarned) || 0, balance: Number(currency.balance) || 0 });
  }

  let emittedLast24h = 0;
  try {
    const now = Date.now();
    const battles = await listBattleRecords();
    for (const record of battles) {
      const ts = recordTimestamp(record);
      if (Number.isFinite(ts) && now - ts <= DAY_MS) {
        emittedLast24h += Number(record.coinReward) || 0;
      }
    }
  } catch {
    emittedLast24h = 0;
  }

  earners.sort((a, b) => b.totalEarned - a.totalEarned);

  json(res, 200, {
    totalEmitted,
    totalBalance,
    emittedLast24h,
    activeFarmers,
    totalPaidSlots,
    poolBudget: POOL_BUDGET,
    poolBudgetUsedPct: POOL_BUDGET > 0 ? Math.round((totalEmitted / POOL_BUDGET) * 1000) / 10 : 0,
    topEarners: earners.slice(0, 10),
    // pointsSpentLast24h: требует отдельного ledger трат (слоты) — backlog Фазы 2.
    pointsSpentLast24h: null,
  });
};
