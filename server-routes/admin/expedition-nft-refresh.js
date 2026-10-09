const { handleCors, json } = require("../../api/_lib/auth");
const { getMintEnv, normalizeQueue, queueDocFor, requestTrophyRefresh } = require("../../api/_lib/expedition-nft");
const { parseJsonBody, requireAdmin, sendError } = require("./_expeditions-shared");

// POST { tokenId } | { all: true } — ask OpenSea to re-read trophy metadata (after an art change).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
  if (!requireAdmin(req, res)) return;
  try {
    const body = await parseJsonBody(req);
    let ids = [];
    if (body && body.all === true) {
      const { data } = await queueDocFor(getMintEnv().contract).read();
      ids = Object.keys(normalizeQueue(data).minted).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
    } else {
      const id = Math.floor(Number(body && body.tokenId));
      if (!(id > 0)) { json(res, 400, { error: "tokenId or all:true is required." }); return; }
      ids = [id];
    }
    const results = [];
    for (const tokenId of ids) results.push({ tokenId, ...(await requestTrophyRefresh(tokenId)) });
    json(res, 200, { requested: results.filter((r) => r.ok).length, results });
  } catch (error) {
    sendError(res, error, "Could not request the refresh.");
  }
};
