const { handleCors, json } = require("../../api/_lib/auth");
const { publicLedger } = require("../../api/_lib/token");
const { requireMethod, sendDomainError } = require("./_shared");

// GET /api/token/ledger?page=N — the public transparency feed (/transparency).
// No session: this is the same money movement anyone can read on the chain,
// just grouped and masked. Building it walks every wallet with token history,
// so the answer is cached here (per lambda) and at the CDN edge — a viral page
// must not turn into one profile read per visitor. Paging slices that one
// cached build, so page 7 costs no more than page 1.
const CACHE_TTL_MS = 120000;
const EDGE_MAX_AGE_S = 120;
const EDGE_STALE_S = 600;
const PAGE_SIZE = 20;

let cache = null; // { at, payload }

function readPage(url) {
  const raw = new URL(url, "http://localhost").searchParams.get("page");
  const page = Math.floor(Number(raw));
  return Number.isFinite(page) && page > 0 ? page : 1;
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireMethod(req, res, "GET")) return;

  try {
    const now = Date.now();
    if (!cache || now - cache.at > CACHE_TTL_MS) {
      cache = { at: now, payload: await publicLedger() };
    }
    const full = cache.payload;
    const entries = full.entries || [];
    const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
    // A page past the end (stale link, shrinking journal) answers the last one
    // rather than an empty list that reads as "nothing ever moved".
    const page = Math.min(readPage(req.url), pageCount);
    const start = (page - 1) * PAGE_SIZE;

    res.setHeader(
      "Cache-Control",
      `public, max-age=30, s-maxage=${EDGE_MAX_AGE_S}, stale-while-revalidate=${EDGE_STALE_S}`
    );
    json(res, 200, {
      ...full,
      entries: entries.slice(start, start + PAGE_SIZE),
      page,
      pageCount,
      pageSize: PAGE_SIZE,
      from: entries.length ? start + 1 : 0,
      to: Math.min(start + PAGE_SIZE, entries.length),
    });
  } catch (error) {
    if (sendDomainError(res, error)) return;
    json(res, 500, { error: error.message || "Failed to load the ledger." });
  }
};
