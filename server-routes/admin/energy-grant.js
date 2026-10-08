const { handleCors, json } = require("../../api/_lib/auth");
const { grantEnergy, summarizeGrants } = require("../../api/_lib/expedition-energy");
const { parseJsonBody, requireAdmin, sendError } = require("./_expeditions-shared");

// POST { label, grants: [{ wallet, amount }] } — manual bonus-energy grant (026).
// GET — labels granted so far.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method === "GET") { json(res, 200, { grants: await summarizeGrants() }); return; }
    if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
    const body = await parseJsonBody(req);
    json(res, 200, await grantEnergy({ label: body?.label, grants: body?.grants }));
  } catch (error) {
    sendError(res, error, "Could not grant energy.");
  }
};
