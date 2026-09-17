const {
  getRequestSiweOrigin,
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  json,
} = require("../../api/_lib/auth");
const {
  MAX_SUPPLY,
  getCapsuleTier,
  getTokenMetadata,
  readMarketplaceToken,
  requestMarketplaceRefresh,
} = require("../../api/_lib/nft");

// Дошёл ли ревил до витрины. Отвечает по диапазону токенов, потому что каждый
// номер — это запрос к OpenSea, и вся коллекция в одну лямбду не укладывается.
// Гонять диапазоны и складывать ответы — работа scripts/nft/reveal-audit.js.
//
// GET /api/admin/nft-reveal-audit?from=1&to=50[&refresh=1]
//   refresh=1 — дополнительно пнуть отставшие токены на перечитывание.

const MAX_RANGE = 50;
const CONCURRENCY = 8;

function traitsOf(metadata) {
  const out = {};
  for (const trait of metadata?.attributes || []) {
    if (trait?.trait_type) out[trait.trait_type] = String(trait.value);
  }
  return out;
}

async function auditToken(tokenId, origin, { refresh }) {
  const [ours, theirs] = await Promise.all([
    getTokenMetadata(tokenId, origin),
    readMarketplaceToken(tokenId),
  ]);

  if (!ours) return { tokenId, status: "not-minted" };
  // Витрина не ответила: ключ, сеть или просто ещё не знает токена. Это не
  // «отстал», это «нечего сравнивать» — иначе отчёт врёт в обе стороны.
  if (!theirs) return { tokenId, status: "unknown", expected: traitsOf(ours) };

  const expected = traitsOf(ours);
  const mismatched = Object.entries(expected).filter(
    ([key, value]) => theirs.traits[key] !== value
  );

  if (!mismatched.length) return { tokenId, status: "ok", tier: getCapsuleTier(tokenId) };

  if (refresh) {
    try {
      await requestMarketplaceRefresh(tokenId);
    } catch (error) {
      console.warn(`[nft:audit] refresh ${tokenId} failed: ${error.message}`);
    }
  }

  return {
    tokenId,
    status: "stale",
    tier: getCapsuleTier(tokenId),
    expected,
    actual: theirs.traits,
    refreshed: Boolean(refresh),
  };
}

async function mapWithLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
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

  const requestUrl = new URL(req.url, "http://localhost");
  const from = Math.max(1, Math.floor(Number(requestUrl.searchParams.get("from")) || 1));
  const requestedTo = Math.floor(Number(requestUrl.searchParams.get("to")) || from);
  const to = Math.min(MAX_SUPPLY, Math.max(from, requestedTo), from + MAX_RANGE - 1);
  const refresh = requestUrl.searchParams.get("refresh") === "1";

  if (!process.env.NFT_OPENSEA_API_KEY) {
    json(res, 503, {
      error: "NFT_OPENSEA_API_KEY is not configured — there is nothing to compare against.",
      code: "NO_MARKETPLACE_KEY",
    });
    return;
  }

  const tokenIds = [];
  for (let tokenId = from; tokenId <= to; tokenId += 1) tokenIds.push(tokenId);

  const { uri: origin } = getRequestSiweOrigin(req);

  try {
    const rows = await mapWithLimit(tokenIds, CONCURRENCY, (tokenId) =>
      auditToken(tokenId, origin, { refresh })
    );

    const summary = { ok: 0, stale: 0, unknown: 0, "not-minted": 0 };
    for (const row of rows) summary[row.status] += 1;

    res.setHeader("Cache-Control", "no-store");
    json(res, 200, {
      from,
      to,
      maxSupply: MAX_SUPPLY,
      summary,
      stale: rows.filter((row) => row.status === "stale"),
      unknown: rows.filter((row) => row.status === "unknown").map((row) => row.tokenId),
      notMinted: rows.filter((row) => row.status === "not-minted").map((row) => row.tokenId),
    });
  } catch (error) {
    console.error("[nft:reveal-audit]", error);
    json(res, 500, { error: "Audit failed." });
  }
};
