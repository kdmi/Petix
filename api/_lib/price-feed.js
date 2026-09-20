// Котировка $PETIX (feature 024).
//
// Монета выпустилась с кривой Pons в заблокированный пул Uniswap v4 в момент
// запуска, поэтому цена живёт в пуле, а не на кривой. Берём её у индексаторов:
// DexScreener основным (цена сразу в долларах, 300 запросов в минуту, ключ не
// нужен), GeckoTerminal запасным. Он-чейн-путь описан в research.md как
// отступление: он тянет в репозиторий четыре публичных адреса.
//
// Адрес контракта приходит параметром из окружения — адресов в коде нет.

const DEXSCREENER_URL = "https://api.dexscreener.com/tokens/v1/robinhood/";
const GECKOTERMINAL_URL =
  "https://api.geckoterminal.com/api/v2/simple/networks/robinhood/token_price/";
const DEFAULT_TIMEOUT_MS = 6000;

function positiveNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchJson(url, timeoutMs, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * По токену возвращаются все его пары, и брать первую нельзя: рядом с настоящим
 * пулом на $21k висят пыльные пары с ликвидностью в единицы долларов, чья цена
 * расходится с рыночной на проценты. Берём самую глубокую и отбрасываем всё
 * ниже порога.
 */
function pickDeepestPair(pairs, minLiquidityUsd) {
  if (!Array.isArray(pairs)) return null;
  let best = null;
  for (const pair of pairs) {
    const usd = positiveNumber(pair?.priceUsd);
    const liquidity = Number(pair?.liquidity?.usd) || 0;
    if (usd === null || liquidity < minLiquidityUsd) continue;
    if (!best || liquidity > best.liquidityUsd) {
      best = { usd, liquidityUsd: liquidity, pairAddress: pair?.pairAddress || null };
    }
  }
  return best;
}

async function fromDexScreener(contract, minLiquidityUsd, timeoutMs) {
  const payload = await fetchJson(DEXSCREENER_URL + contract, timeoutMs);
  const pairs = Array.isArray(payload) ? payload : payload?.pairs;
  const best = pickDeepestPair(pairs, minLiquidityUsd);
  if (!best) throw new Error("no pair above the liquidity floor");
  return { ...best, source: "dexscreener" };
}

async function fromGeckoTerminal(contract, timeoutMs) {
  const payload = await fetchJson(GECKOTERMINAL_URL + contract, timeoutMs, {
    accept: "application/json;version=20230302",
  });
  const prices = payload?.data?.attributes?.token_prices || {};
  const raw = prices[contract] ?? prices[String(contract).toLowerCase()];
  const usd = positiveNumber(raw);
  if (usd === null) throw new Error("no price in response");
  // Индексатор не отдаёт ликвидность в этом эндпоинте — он запасной и
  // используется, только когда основной источник уже не ответил.
  return { usd, liquidityUsd: null, pairAddress: null, source: "geckoterminal" };
}

/**
 * Цена одной монеты в долларах.
 * → { usd, source, pairAddress, liquidityUsd } | бросает, если не ответил никто
 *
 * PRICE_FAKE_USD существует только для локальной разработки и демонстрации:
 * при заданной переменной наружу не ходим вовсе.
 */
async function fetchTokenPriceUsd({ contract, minLiquidityUsd = 0, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const fake = positiveNumber(process.env.PRICE_FAKE_USD);
  if (fake !== null) {
    return { usd: fake, source: "fake", pairAddress: null, liquidityUsd: null };
  }

  const address = String(contract || "").trim();
  if (!address) throw new Error("Token contract is not configured.");

  const errors = [];
  try {
    return await fromDexScreener(address, minLiquidityUsd, timeoutMs);
  } catch (error) {
    errors.push(`dexscreener: ${error.message}`);
  }

  try {
    return await fromGeckoTerminal(address, timeoutMs);
  } catch (error) {
    errors.push(`geckoterminal: ${error.message}`);
  }

  throw new Error(`Price sources are unavailable (${errors.join("; ")})`);
}

module.exports = {
  DEXSCREENER_URL,
  GECKOTERMINAL_URL,
  fetchTokenPriceUsd,
  pickDeepestPair,
};
