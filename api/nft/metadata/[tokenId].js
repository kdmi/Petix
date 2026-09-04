const path = require("path");
const { getRequestSiweOrigin, json } = require("../../_lib/auth");
const {
  buildCollectionMetadata,
  getTokenMetadata,
} = require("../../_lib/nft");
const { isNftEnabled } = require("../../_lib/nft-chain");

// PUBLIC token metadata (tokenURI target): no session, open CORS — wallets,
// explorers and marketplaces fetch this without credentials. The special id
// "collection" serves contractURI() collection-level metadata.
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
  if (!isNftEnabled()) {
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

    const metadata = await getTokenMetadata(rawTokenId, origin);
    if (!metadata) {
      json(res, 404, { error: "Token not found." });
      return;
    }

    res.setHeader("Cache-Control", "public, max-age=60");
    json(res, 200, metadata);
  } catch (error) {
    if (error?.code === "RPC_UNAVAILABLE") {
      json(res, 503, { error: "Chain RPC is unavailable — try again." });
      return;
    }
    console.error("[nft:metadata]", error);
    json(res, 500, { error: "Metadata is unavailable." });
  }
};
