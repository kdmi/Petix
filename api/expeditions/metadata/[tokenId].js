const path = require("path");
const { getRequestSiweOrigin, json } = require("../../_lib/auth");
const { buildCollectionMetadata, getTrophyMetadata } = require("../../_lib/expedition-nft");
const { getExpeditionConfig, isExpeditionsEnabled } = require("../../_lib/expeditions-config");

// PUBLIC trophy metadata (tokenURI target): no session, open CORS. "collection"
// serves contractURI(). Images are the season-map art and can change later
// (ERC-4906 refresh), so the cache stays short.
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const cfg = await getExpeditionConfig();
  if (!isExpeditionsEnabled(cfg)) {
    json(res, 404, { error: "Not found." });
    return;
  }
  const requestUrl = new URL(req.url, "http://localhost");
  const rawTokenId = path.basename(requestUrl.pathname).replace(/\.json$/i, "");
  const { uri: origin } = getRequestSiweOrigin(req);
  try {
    if (rawTokenId === "collection") {
      res.setHeader("Cache-Control", "public, max-age=300");
      json(res, 200, buildCollectionMetadata(origin));
      return;
    }
    const metadata = await getTrophyMetadata(rawTokenId, origin);
    if (!metadata) {
      json(res, 404, { error: "Token not found." });
      return;
    }
    res.setHeader("Cache-Control", "public, max-age=60");
    json(res, 200, metadata);
  } catch (error) {
    console.error("[expeditions] metadata failed", error);
    json(res, 500, { error: "Metadata unavailable." });
  }
};
