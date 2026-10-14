// Журнал бросков рарности (035).
//
// Рарность разыгрывается один раз — при старте черновика, и до сих пор она
// нигде не оставалась следа, кроме самого питомца. Поэтому доля редких среди
// живых питомцев отвечала на вопрос «что игрок оставил», а не «что выпало»:
// черновик, который бросили, и питомец, которого сожгли, из данных исчезают
// полностью. Понедельная доля Epic+Legendary выросла с 11% до 20–29% сразу
// после 20 сентября (платное создание, место остаётся открытым), и по данным
// на руках нельзя отличить смещённый бросок от отбора: сколько было бросков,
// никто не считал.
//
// Счётчик пишется той же мутацией профиля, что и сам черновик, — лишних
// обращений к хранилищу нет.

const RARITIES = ["Common", "Rare", "Epic", "Legendary"];

// Журнал обрезается сверху: сумма живёт в счётчиках, а последние записи нужны,
// чтобы увидеть ритм — десять бросков подряд за минуту выглядят иначе, чем
// десять за месяц.
const RECENT_LIMIT = 60;

function emptyByRarity() {
  return RARITIES.reduce((acc, label) => {
    acc[label] = 0;
    return acc;
  }, {});
}

function toCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizeRolls(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const byRarity = emptyByRarity();
  const rawByRarity =
    source.byRarity && typeof source.byRarity === "object" ? source.byRarity : {};
  for (const label of RARITIES) {
    byRarity[label] = toCount(rawByRarity[label]);
  }

  const recent = Array.isArray(source.recent)
    ? source.recent
        .filter((entry) => entry && typeof entry === "object")
        .slice(-RECENT_LIMIT)
        .map((entry) => ({
          at: entry.at ? String(entry.at) : null,
          id: entry.id ? String(entry.id) : null,
          rarity: RARITIES.includes(entry.rarity) ? entry.rarity : null,
          charged: toCount(entry.charged),
        }))
    : [];

  const summed = RARITIES.reduce((sum, label) => sum + byRarity[label], 0);

  return {
    // Бросков могло быть больше, чем разложено по рарностям, только если
    // данные битые; берём большее, чтобы счётчик не уезжал вниз.
    total: Math.max(toCount(source.total), summed),
    byRarity,
    paid: toCount(source.paid),
    recent,
    lastAt: source.lastAt ? String(source.lastAt) : null,
  };
}

/**
 * Записывает бросок в профиль. Вызывается там же, где черновик сохраняется, —
 * внутри мутации профиля.
 */
function recordRoll(profile, { rarity, characterId, charged = 0, at = null } = {}) {
  if (!profile || typeof profile !== "object") return null;

  const rolls = normalizeRolls(profile.rolls);
  const label = RARITIES.includes(rarity) ? rarity : null;
  const stamp = at || new Date().toISOString();
  const paid = toCount(charged);

  rolls.total += 1;
  if (label) rolls.byRarity[label] += 1;
  if (paid > 0) rolls.paid += 1;
  rolls.lastAt = stamp;
  rolls.recent.push({
    at: stamp,
    id: characterId ? String(characterId) : null,
    rarity: label,
    charged: paid,
  });
  if (rolls.recent.length > RECENT_LIMIT) {
    rolls.recent = rolls.recent.slice(-RECENT_LIMIT);
  }

  profile.rolls = rolls;
  return rolls;
}

module.exports = {
  RARITIES,
  RECENT_LIMIT,
  emptyByRarity,
  normalizeRolls,
  recordRoll,
};
