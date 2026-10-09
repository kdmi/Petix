const { handleCors, json } = require("../../api/_lib/auth");
const { readAuditEntries } = require("../../api/_lib/economy-config-store");
const { requireAdmin, sendError } = require("./_expeditions-shared");

// GET ?limit=30 — latest economy-config changes: who, when, why, which keys (values included for EXPEDITION_* keys).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "GET") { json(res, 405, { error: "Method not allowed." }); return; }
  if (!requireAdmin(req, res)) return;
  try {
    const url = new URL(req.url, "http://localhost");
    const limit = Math.min(200, Math.max(1, Math.floor(Number(url.searchParams.get("limit")) || 30)));
    const entries = (await readAuditEntries()).slice(-limit).reverse();
    json(res, 200, { entries: entries.map((e) => ({ ts: e.ts, adminWallet: e.adminWallet, reason: e.reason, patch: e.patch })) });
  } catch (error) {
    sendError(res, error, "Could not read the audit log.");
  }
};
