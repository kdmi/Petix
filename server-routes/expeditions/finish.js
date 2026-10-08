const { json } = require("../../api/_lib/auth");
const { assertExpeditionsAccess } = require("./_shared");

// Placeholder until Phase 3 (US1) lands; still gated so a disabled feature stays invisible.
module.exports = async (req, res) => {
  const access = await assertExpeditionsAccess(req, res);
  if (!access) return;
  json(res, 501, { error: "Not implemented yet." });
};
