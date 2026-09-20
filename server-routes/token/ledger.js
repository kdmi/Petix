const { handleCors, json } = require("../../api/_lib/auth");
const { publicLedger } = require("../../api/_lib/token");
const { requireMethod, sendDomainError } = require("./_shared");

// GET /api/token/ledger — the public transparency feed (/transparency).
// No session: this is the same money movement anyone can read on the chain,
// just grouped and masked. Building it walks every wallet with token history,
// so the answer is cached here (per lambda) and at the CDN edge — a viral page
// must not turn into one profile read per visitor.
//
// The whole journal goes out in one piece and the page slices it into pages
// itself. Paging server-side would let a viewer read page 1 from one build and
// page 2 from another (they expire independently), which can duplicate or skip
// a row at the boundary; one snapshot per load cannot.
//
// No stale-while-revalidate: a stale copy of a growing journal reads as money
// disappearing. Better a short wait for a fresh build than a number that walks
// backwards on refresh.
const DEFAULT_CACHE_TTL_MS = 120000;
const EDGE_MAX_AGE_S = 120;
// How long the last complete snapshot may still be served when a rebuild
// fails, before the page is told the truth instead of an old number.
const FALLBACK_MAX_AGE_MS = 900000;

let cache = null; // { at, payload }

// Read per request, not at require time, so a test can change it whenever it
// loads this module. Parsed explicitly: `Number(x) || default` would read a
// deliberate 0 as unset. Nothing sets it in production.
function cacheTtlMs() {
  const configured = Number(process.env.TOKEN_LEDGER_CACHE_MS);
  return Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_CACHE_TTL_MS;
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireMethod(req, res, "GET")) return;

  const now = Date.now();
  // Strict `<`: a TTL of 0 means "always rebuild", even for two requests that
  // land in the same millisecond.
  if (cache && now - cache.at < cacheTtlMs()) {
    res.setHeader("Cache-Control", `public, max-age=30, s-maxage=${EDGE_MAX_AGE_S}`);
    json(res, 200, cache.payload);
    return;
  }

  try {
    cache = { at: now, payload: await publicLedger() };
    res.setHeader("Cache-Control", `public, max-age=30, s-maxage=${EDGE_MAX_AGE_S}`);
    json(res, 200, cache.payload);
  } catch (error) {
    // A build that could not read every profile would under-report the totals.
    // Serve the last complete snapshot (the page shows its timestamp) rather
    // than a smaller number that looks like money went missing.
    if (cache && now - cache.at < FALLBACK_MAX_AGE_MS) {
      res.setHeader("Cache-Control", "public, max-age=15, s-maxage=15");
      json(res, 200, { ...cache.payload, stale: true });
      return;
    }
    if (sendDomainError(res, error)) return;
    json(res, 500, { error: error.message || "Failed to load the ledger." });
  }
};
