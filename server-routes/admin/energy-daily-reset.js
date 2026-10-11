const { handleCors, json } = require("../../api/_lib/auth");
const { resetDailyEnergy } = require("../../api/_lib/energy-daily-reset");
const { parseJsonBody, requireAdmin, sendError } = require("./_expeditions-shared");

// POST { confirm: true, label? } — give everyone today's free battle energy back
// (bonus and purchased energy untouched). Without confirm: dry run with counts.
// Works in batches under a time budget; call again until `remaining` is 0 — the
// label keeps it idempotent (default daily-reset-YYYY-MM-DD).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireAdmin(req, res)) return;
  try {
    if (req.method !== "POST") { json(res, 405, { error: "Method not allowed." }); return; }
    const body = await parseJsonBody(req);
    json(res, 200, await resetDailyEnergy({ label: body?.label, dryRun: body?.confirm !== true }));
  } catch (error) {
    sendError(res, error, "Could not reset daily energy.");
  }
};
