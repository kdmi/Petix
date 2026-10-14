const { getSessionFromRequest, handleCors, isAdminSession, json } = require("../../api/_lib/auth");
const { listCharacterImageCensus, readDb } = require("../../api/_lib/store");
const { RARITIES, emptyByRarity, normalizeRolls } = require("../../api/_lib/roll-ledger");

// Аудит создания питомцев (035).
//
// Вопрос, на который он отвечает: сколько бросков рарности было сделано и
// сколько питомцев из них оставили. Доля редких среди живых питомцев на него
// не отвечает — брошенный черновик и сожжённый питомец исчезают из профиля
// бесследно. След остаётся один: картинка. Её рисует каждый черновик, и её
// никто не удаляет.
//
// Разница «нарисовано минус живо» по дням — это и есть перебор. Если он близок
// к нулю, смещение нужно искать в самом броске; если он большой, доля редких
// среди выживших ничего не говорит о шансах.

const DAY_LIMIT = 90;
const WALLET_LIMIT = 60;

function dayOf(value) {
  const text = String(value || "");
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null;
}

function pct(part, total) {
  return total > 0 ? Math.round((1000 * part) / total) / 10 : 0;
}

function buildAudit(images, records) {
  const rolledByDay = new Map();
  for (const image of images) {
    const day = dayOf(image.uploadedAt);
    if (!day) continue;
    rolledByDay.set(day, (rolledByDay.get(day) || 0) + 1);
  }

  const keptByDay = new Map();
  const keptByDayRarity = new Map();
  const wallets = [];
  const totals = {
    rolled: images.length,
    alive: 0,
    ledgerRolls: 0,
    ledgerByRarity: emptyByRarity(),
    aliveByRarity: emptyByRarity(),
  };

  for (const [wallet, raw] of Object.entries(records || {})) {
    const profile = raw || {};
    const characters = Array.isArray(profile.characters) ? profile.characters : [];
    const rolls = normalizeRolls(profile.rolls);

    for (const character of characters) {
      if (!character || character.status !== "completed") continue;
      totals.alive += 1;
      if (totals.aliveByRarity[character.rarity] !== undefined) {
        totals.aliveByRarity[character.rarity] += 1;
      }
      const day = dayOf(character.createdAt);
      if (!day) continue;
      keptByDay.set(day, (keptByDay.get(day) || 0) + 1);
      const byRarity = keptByDayRarity.get(day) || emptyByRarity();
      if (byRarity[character.rarity] !== undefined) byRarity[character.rarity] += 1;
      keptByDayRarity.set(day, byRarity);
    }

    totals.ledgerRolls += rolls.total;
    for (const label of RARITIES) totals.ledgerByRarity[label] += rolls.byRarity[label];

    const alive = characters.filter((character) => character && character.status === "completed");
    // Сколько картинок этого кошелька уже не принадлежат живому питомцу: по
    // журналу бросков это видно точно, остальное — только суммарно.
    const dropped = rolls.recent.filter(
      (entry) => entry.id && !alive.some((character) => character.id === entry.id)
    ).length;

    if (rolls.total > 0 || alive.length > 0) {
      wallets.push({
        wallet,
        alive: alive.length,
        unlockedSlots: profile.unlockedSlots ?? null,
        balance: profile.currency?.balance ?? 0,
        totalEarned: profile.currency?.totalEarned ?? 0,
        rolls: rolls.total,
        paidRolls: rolls.paid,
        byRarity: rolls.byRarity,
        droppedInLog: dropped,
        lastRollAt: rolls.lastAt,
      });
    }
  }

  const days = [...new Set([...rolledByDay.keys(), ...keptByDay.keys()])]
    .sort()
    .slice(-DAY_LIMIT)
    .map((date) => {
      const rolled = rolledByDay.get(date) || 0;
      const kept = keptByDay.get(date) || 0;
      const byRarity = keptByDayRarity.get(date) || emptyByRarity();
      return {
        date,
        rolled,
        kept,
        dropped: rolled - kept,
        rareShare: pct(byRarity.Epic + byRarity.Legendary, kept),
        byRarity,
      };
    });

  wallets.sort((left, right) => right.rolls - left.rolls || right.alive - left.alive);

  return {
    totals: {
      ...totals,
      dropped: totals.rolled - totals.alive,
      aliveRareShare: pct(totals.aliveByRarity.Epic + totals.aliveByRarity.Legendary, totals.alive),
      ledgerRareShare: pct(
        totals.ledgerByRarity.Epic + totals.ledgerByRarity.Legendary,
        totals.ledgerRolls
      ),
    },
    days,
    wallets: wallets.slice(0, WALLET_LIMIT),
  };
}

function renderText(audit) {
  const lines = [];
  const t = audit.totals;
  lines.push(`картинок нарисовано (бросков):  ${t.rolled}`);
  lines.push(`питомцев живо сейчас:           ${t.alive}`);
  lines.push(`не дошли до профиля:            ${t.dropped}`);
  lines.push(
    `редких среди живых:             ${t.aliveRareShare}%  (Epic ${t.aliveByRarity.Epic}, Leg ${t.aliveByRarity.Legendary})`
  );
  lines.push(
    `журнал бросков (с выкатки 035): ${t.ledgerRolls}, редких ${t.ledgerRareShare}%  ` +
      RARITIES.map((label) => `${label} ${t.ledgerByRarity[label]}`).join(", ")
  );
  lines.push("");
  lines.push("дата        брошено  оставлено  разница  редких среди оставленных");
  for (const day of audit.days) {
    lines.push(
      `${day.date}  ${String(day.rolled).padStart(7)}  ${String(day.kept).padStart(9)}  ` +
        `${String(day.dropped).padStart(7)}  ${String(day.rareShare).padStart(5)}%`
    );
  }
  lines.push("");
  lines.push("кошелёк                                     бросков  платных  живо  редких");
  for (const wallet of audit.wallets) {
    if (!wallet.rolls) continue;
    const rare = wallet.byRarity.Epic + wallet.byRarity.Legendary;
    lines.push(
      `${wallet.wallet}  ${String(wallet.rolls).padStart(7)}  ${String(wallet.paidRolls).padStart(7)}  ` +
        `${String(wallet.alive).padStart(4)}  ${String(rare).padStart(6)}`
    );
  }
  return lines.join("\n");
}

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

  try {
    const [images, db] = await Promise.all([listCharacterImageCensus(), readDb()]);
    const audit = buildAudit(images, db.records);
    audit.generatedAt = new Date().toISOString();

    const url = new URL(req.url, "http://localhost");
    if (url.searchParams.get("format") === "text") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(renderText(audit));
      return;
    }

    json(res, 200, audit);
  } catch (error) {
    console.error("[admin:creation-audit]", error);
    json(res, 500, { error: error.message || "Audit failed." });
  }
};

module.exports.buildAudit = buildAudit;
