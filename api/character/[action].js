const path = require("path");

const HANDLERS = {
  create: require("../../server-routes/character/create"),
  image: require("../../server-routes/character/image"),
  me: require("../../server-routes/character/me"),
  "select-power": require("../../server-routes/character/select-power"),
  start: require("../../server-routes/character/start"),
  upgrade: require("../../server-routes/character/upgrade"),
};

module.exports = async (req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");
  const action = path.basename(requestUrl.pathname).replace(/\.js$/i, "");
  const handler = HANDLERS[action];

  if (!handler) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Not found." }));
    return;
  }

  await handler(req, res);
};
