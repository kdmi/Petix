const { getEconomyConfig } = require("./economy-config");
const { fetchTokenPriceUsd } = require("./price-feed");
const { clampPointsPerUsd, resolvePointsPerUsd } = require("./pet-price");
const tokenStore = require("./token-store");

// Хранение котировки (feature 024): здесь сеть и хранилище, чистая арифметика
// живёт в pet-price.js.
//
// Правило одно: покупки не блокируются никогда. Если источник не ответил,
// действует последняя котировка, а при её отсутствии — стартовый курс из
// конфига. Оператор видит возраст котировки и счётчик отказов в админке.

function minutesSince(iso) {
  const ms = Date.parse(iso || "");
  if (!Number.isFinite(ms)) return Infinity;
  return (Date.now() - ms) / 60000;
}

async function readQuote() {
  const state = await tokenStore.readTokenState();
  return state.price;
}

/** Котировка плюс всё, что нужно для показа оператору. */
async function describeQuote(cfg) {
  const config = cfg || (await getEconomyConfig());
  const quote = await readQuote();
  const ttl = Math.max(1, Number(config.PRICE_TTL_MINUTES) || 60);
  const age = quote ? minutesSince(quote.fetchedAt) : Infinity;

  return {
    quote,
    pointsPerUsd: resolvePointsPerUsd(quote, config),
    ageMinutes: Number.isFinite(age) ? Math.round(age) : null,
    // Устаревшей считаем котировку старше двух периодов обновления: один
    // пропущенный запуск крона — ещё не повод бить тревогу.
    stale: !quote || age > ttl * 2,
    bootstrap: !quote,
  };
}

/**
 * Записать новую котировку. usd приходит либо от источника, либо руками из
 * админки; кламп и границы применяются одинаково в обоих случаях.
 */
async function storeQuote({ usd, source }, cfg) {
  const config = cfg || (await getEconomyConfig());
  let stored = null;

  await tokenStore.withTokenState((state) => {
    const previous = state.price && state.price.pointsPerUsd ? state.price.pointsPerUsd : null;
    const raw = 1 / usd;
    const pointsPerUsd = clampPointsPerUsd(raw, previous, config);

    stored = {
      usd,
      pointsPerUsd,
      fetchedAt: new Date().toISOString(),
      source,
      previousPointsPerUsd: previous,
      rejections: 0,
      lastError: null,
      // Кламп сработал — оператору стоит знать, что цена догоняет курс, а не
      // повторяет его.
      clamped: Math.abs(pointsPerUsd - raw) > Math.max(1, raw * 0.001),
    };
    state.price = stored;
    return state;
  });

  return stored;
}

async function recordFailure(message) {
  await tokenStore.withTokenState((state) => {
    if (!state.price) {
      state.price = null;
      return state;
    }
    state.price = {
      ...state.price,
      rejections: (Number(state.price.rejections) || 0) + 1,
      lastError: String(message || "unknown"),
    };
    return state;
  });
}

/**
 * Сходить за курсом и сохранить его.
 * → { ok: true, quote } | { ok: false, error }
 * Никогда не бросает: вызывающий крон не должен падать из-за индексатора.
 */
async function refreshQuote(cfg) {
  const config = cfg || (await getEconomyConfig());
  try {
    const { usd, source } = await fetchTokenPriceUsd({
      contract: process.env.TOKEN_CONTRACT,
      minLiquidityUsd: Number(config.PRICE_MIN_LIQUIDITY_USD) || 0,
    });
    const quote = await storeQuote({ usd, source }, config);
    return { ok: true, quote };
  } catch (error) {
    await recordFailure(error.message).catch(() => {});
    return { ok: false, error: error.message };
  }
}

/** Обновить, если котировке больше PRICE_TTL_MINUTES. Вызывается с крона. */
async function ensureFreshQuote(cfg) {
  const config = cfg || (await getEconomyConfig());
  const quote = await readQuote();
  const ttl = Math.max(1, Number(config.PRICE_TTL_MINUTES) || 60);
  if (quote && minutesSince(quote.fetchedAt) < ttl) {
    return { ok: true, quote, skipped: true };
  }
  return refreshQuote(config);
}

module.exports = {
  describeQuote,
  ensureFreshQuote,
  readQuote,
  refreshQuote,
  storeQuote,
};
