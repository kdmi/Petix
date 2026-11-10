const path = require("path");

// Lazy: each request loads only its own handler (keeps /me cheap under load).
const HANDLERS = {
  challenge: () => require("../../../server-routes/auth/evm/challenge"),
  logout: () => require("../../../server-routes/auth/evm/logout"),
  me: () => require("../../../server-routes/auth/evm/me"),
  verify: () => require("../../../server-routes/auth/evm/verify"),
};

module.exports = async (req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");
  const action = path.basename(requestUrl.pathname).replace(/\.js$/i, "");
  const loadHandler = Object.hasOwn(HANDLERS, action) ? HANDLERS[action] : null;
  const handler = loadHandler ? loadHandler() : null;

  if (!handler) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Not found." }));
    return;
  }

  await handler(req, res);
};
