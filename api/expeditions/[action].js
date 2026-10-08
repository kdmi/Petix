const path = require("path");
const { json } = require("../_lib/auth");

// Expeditions (026): PvE bosses. Handlers live in server-routes/expeditions/*;
// add new actions to HANDLERS here. Access (feature flag, admin-only mode,
// session) is checked inside each handler via _shared.assertExpeditionsAccess so
// a disabled feature never reveals which actions exist.
const HANDLERS = {
  config: require("../../server-routes/expeditions/config"),
  state: require("../../server-routes/expeditions/state"),
  start: require("../../server-routes/expeditions/start"),
  finish: require("../../server-routes/expeditions/finish"),
};

module.exports = async (req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");
  const action = path.basename(requestUrl.pathname).replace(/\.js$/i, "");
  const handler = HANDLERS[action];
  if (!handler) {
    json(res, 404, { error: "Not found." });
    return;
  }
  await handler(req, res);
};
