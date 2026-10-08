const { handleCors, json } = require("../../api/_lib/auth");
const { updateWalletProfile } = require("../../api/_lib/store");
const { assertExpeditionsAccess, requireMethod } = require("./_shared");

// POST /api/expeditions/tutorial-seen — the guide auto-opens once per wallet (US6).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  const access = await assertExpeditionsAccess(req, res);
  if (!access) return;
  if (!requireMethod(req, res, "POST")) return;
  await updateWalletProfile(access.session.wallet, (profile) => {
    if (profile.expeditions.tutorialSeen) throw Object.assign(new Error("already"), { skip: true });
    profile.expeditions.tutorialSeen = true;
    return profile;
  }).catch((error) => { if (!error.skip) throw error; });
  json(res, 200, { tutorialSeen: true });
};
