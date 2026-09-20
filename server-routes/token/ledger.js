const { handleCors, json } = require("../../api/_lib/auth");
const { publicLedger } = require("../../api/_lib/token");
const { requireMethod, sendDomainError } = require("./_shared");

// GET /api/token/ledger — the public transparency feed (/transparency).
// No session: this is the same money movement anyone can read on the chain,
// just grouped and masked. Building it walks every wallet with token history,
// so the answer is cached here (per lambda) and at the CDN edge — a viral page
// must not turn into one profile read per visitor.
const CACHE_TTL_MS = 120000;
const EDGE_MAX_AGE_S = 120;
const EDGE_STALE_S = 600;

let cache = null; // { at, payload }

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireMethod(req, res, "GET")) return;

  try {
    const now = Date.now();
    if (!cache || now - cache.at > CACHE_TTL_MS) {
      cache = { at: now, payload: await publicLedger() };
    }
    res.setHeader(
      "Cache-Control",
      `public, max-age=30, s-maxage=${EDGE_MAX_AGE_S}, stale-while-revalidate=${EDGE_STALE_S}`
    );
    json(res, 200, cache.payload);
  } catch (error) {
    if (sendDomainError(res, error)) return;
    json(res, 500, { error: error.message || "Failed to load the ledger." });
  }
};
