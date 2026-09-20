const { countSlotCharacters, getFreeSlots, getUnlockedSlots } = require("./slots");

// Цена питомца (feature 024). Чистая логика: сеть и хранилище сюда не заходят,
// конфиг и профиль передаются аргументами.
//
// Лестница задана в долларах, а курс монеты живёт отдельно. Защита стоит на
// курсе, а не на девяти ценах: ограничиваем шаг одного пересчёта и держим курс
// между границами. Пул монеты тонкий (~$21k), поэтому одиночный выброс в
// котировке не должен сдвигать экономику.

const SIGNIFICANT_DIGITS = 3;

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function bounds(cfg) {
  const min = positiveNumber(cfg && cfg.PRICE_MIN_POINTS_PER_USD) || 1;
  const max = positiveNumber(cfg && cfg.PRICE_MAX_POINTS_PER_USD) || Number.MAX_SAFE_INTEGER;
  return { min, max: Math.max(min, max) };
}

function applyBounds(value, cfg) {
  const { min, max } = bounds(cfg);
  return Math.min(max, Math.max(min, value));
}

/**
 * Новый курс с учётом шага и границ. Мусор (ноль, отрицательное, NaN) не
 * двигает экономику: остаётся прежний курс, а при его отсутствии — стартовый.
 */
function clampPointsPerUsd(next, previous, cfg) {
  const prev = positiveNumber(previous);
  const candidate = positiveNumber(next);

  if (candidate === null) {
    return applyBounds(prev || positiveNumber(cfg && cfg.PRICE_BOOTSTRAP_POINTS_PER_USD) || 1, cfg);
  }

  if (prev === null) {
    return applyBounds(candidate, cfg);
  }

  const stepPct = Math.max(0, Number(cfg && cfg.PRICE_MAX_STEP_PCT) || 0);
  const maxStep = (prev * stepPct) / 100;
  const limited = Math.min(prev + maxStep, Math.max(prev - maxStep, candidate));
  return applyBounds(limited, cfg);
}

/** Курс, по которому считать прямо сейчас: из котировки или стартовый. */
function resolvePointsPerUsd(quote, cfg) {
  const stored = positiveNumber(quote && quote.pointsPerUsd);
  if (stored !== null) return applyBounds(stored, cfg);
  return applyBounds(positiveNumber(cfg && cfg.PRICE_BOOTSTRAP_POINTS_PER_USD) || 1, cfg);
}

/**
 * Округление вверх до трёх значащих цифр: игрок видит 25 200, а не 25 104, и
 * цена не скачет от шума в четвёртом знаке котировки.
 */
function roundPrice(points) {
  const n = Math.ceil(Number(points) || 0);
  if (n <= 0) return 0;
  const digits = Math.floor(Math.log10(n)) + 1;
  if (digits <= SIGNIFICANT_DIGITS) return n;
  const factor = Math.pow(10, digits - SIGNIFICANT_DIGITS);
  return Math.ceil(n / factor) * factor;
}

function usdLadder(cfg) {
  const prices = Array.isArray(cfg && cfg.PET_PRICES_USD) ? cfg.PET_PRICES_USD : [];
  return prices.filter((value) => positiveNumber(value) !== null);
}

/** Лестница в Points: ступень на каждого питомца после бесплатных. */
function buildLadder(pointsPerUsd, cfg) {
  const rate = applyBounds(positiveNumber(pointsPerUsd) || 1, cfg);
  const free = getFreeSlots(cfg);
  return usdLadder(cfg).map((usd, i) => ({
    index: free + i + 1,
    usd,
    points: roundPrice(usd * rate),
  }));
}

/**
 * Цена следующего питомца для конкретного кошелька.
 * → { index, price, priceUsd, free, freeReason, atMax, petCount, unlockedSlots, maxPets }
 *
 * price === 0 — создание бесплатное, price === null — предел достигнут.
 *
 * Цена считается по числу ОТКРЫТЫХ МЕСТ, а не живых питомцев: место, однажды
 * открытое (бесплатно или за Points), остаётся за кошельком. Сожжённый питомец
 * освобождает место, и следующий питомец в нём бесплатен.
 */
function priceForNextPet(profile, cfg, pointsPerUsd) {
  const petCount = countSlotCharacters(profile);
  const unlockedSlots = getUnlockedSlots(profile, cfg);
  const maxPets = Math.floor(Number(cfg && cfg.MAX_CHARACTER_SLOTS) || 10);
  const index = petCount + 1;
  const base = { index, petCount, unlockedSlots, maxPets, atMax: false };

  // Свободное место среди уже открытых — питомец бесплатен.
  if (petCount < unlockedSlots) {
    return { ...base, price: 0, priceUsd: 0, free: true, freeReason: "unlocked_slot" };
  }

  if (unlockedSlots >= maxPets) {
    return {
      ...base,
      atMax: true,
      price: null,
      priceUsd: null,
      free: false,
      freeReason: null,
    };
  }

  const ladder = buildLadder(pointsPerUsd, cfg);
  // Открываем следующее место: его номер — unlockedSlots + 1, а ступень в
  // лестнице отсчитывается от бесплатных мест.
  const step = ladder[unlockedSlots - getFreeSlots(cfg)];
  if (!step) {
    return { ...base, atMax: true, price: null, priceUsd: null, free: false, freeReason: null };
  }

  return { ...base, price: step.points, priceUsd: step.usd, free: false, freeReason: null };
}

module.exports = {
  buildLadder,
  clampPointsPerUsd,
  priceForNextPet,
  resolvePointsPerUsd,
  roundPrice,
};
