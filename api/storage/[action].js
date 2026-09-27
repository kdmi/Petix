const path = require("path");
const { json } = require("../_lib/auth");

const HANDLERS = {
  gc: require("../../server-routes/storage/gc"),
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
