const { countSlotCharacters } = require("./slots");

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

function getFreeSlots(cfg) {
  const n = Math.floor(Number(cfg && cfg.FREE_SLOTS));
  return Number.isFinite(n) && n >= 1 ? n : 1;
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
 * → { index, price, priceUsd, free, freeReason, atMax, petCount, maxPets }
 *
 * price === 0 — создание бесплатное, price === null — предел достигнут.
 */
function priceForNextPet(profile, cfg, pointsPerUsd) {
  const petCount = countSlotCharacters(profile);
  const maxPets = Math.floor(Number(cfg && cfg.MAX_CHARACTER_SLOTS) || 10);
  const index = petCount + 1;

  if (petCount >= maxPets) {
    return { index, price: null, priceUsd: null, free: false, freeReason: null, atMax: true, petCount, maxPets };
  }

  const free = getFreeSlots(cfg);
  const freeUsed = profile && profile.freeCreationUsed === true;
  const base = { index, atMax: false, petCount, maxPets };

  // Бесплатные места считаются по числу питомцев, но расходуются один раз:
  // кошелёк, сжёгший единственного питомца, за следующего уже платит.
  if (petCount < free && !freeUsed) {
    return { ...base, price: 0, priceUsd: 0, free: true, freeReason: "first_pet" };
  }

  const prepaid = Math.max(0, Math.floor(Number(profile && profile.prepaidCreations) || 0));
  if (prepaid > 0) {
    return { ...base, price: 0, priceUsd: 0, free: true, freeReason: "prepaid" };
  }

  const ladder = buildLadder(pointsPerUsd, cfg);
  // Кошелёк без питомцев, но с израсходованным бесплатным созданием платит по
  // первой платной ступени — иначе сжигание превращалось бы в бесплатную
  // перегенерацию за наш счёт.
  const step = ladder[Math.max(0, index - free - 1)] || ladder[ladder.length - 1];
  if (!step) {
    return { ...base, price: null, priceUsd: null, free: false, freeReason: null, atMax: true };
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
