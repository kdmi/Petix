const {
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { buildLadder } = require("../../api/_lib/pet-price");
const { describeQuote, refreshQuote, storeQuote } = require("../../api/_lib/price-quote");
const { readTokenState } = require("../../api/_lib/token-store");

// Курс монеты и лестница цен на питомцев (feature 024).
// GET  — котировка, возраст, действующая лестница, очередь на сжигание.
// POST — принудительное обновление; с полем usd — ручная установка курса.
async function buildPayload(cfg) {
  const described = await describeQuote(cfg);
  const state = await readTokenState();

  return {
    quote: {
      usd: described.quote ? described.quote.usd : null,
      pointsPerUsd: described.pointsPerUsd,
      fetchedAt: described.quote ? described.quote.fetchedAt : null,
      ageMinutes: described.ageMinutes,
      stale: described.stale,
      bootstrap: described.bootstrap,
      source: described.quote ? described.quote.source : null,
      rejections: described.quote ? described.quote.rejections : 0,
      lastError: described.quote ? described.quote.lastError : null,
      clamped: described.quote ? described.quote.clamped === true : false,
    },
    ladder: buildLadder(described.pointsPerUsd, cfg),
    burnQueue: state.burnQueue,
  };
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "GET" && req.method !== "POST") {
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

  const cfg = await getEconomyConfig();

  if (req.method === "GET") {
    json(res, 200, await buildPayload(cfg));
    return;
  }

  const body = await parseJsonBody(req).catch(() => ({}));
  const manual = Number(body && body.usd);

  if (Number.isFinite(manual) && manual > 0) {
    await storeQuote({ usd: manual, source: "manual" }, cfg);
    json(res, 200, await buildPayload(cfg));
    return;
  }

  const result = await refreshQuote(cfg);
  if (!result.ok) {
    // Сохранённая котировка не тронута — покупки продолжают работать по ней.
    json(res, 502, { error: result.error, code: "PRICE_UNAVAILABLE", ...(await buildPayload(cfg)) });
    return;
  }

  json(res, 200, await buildPayload(cfg));
};
