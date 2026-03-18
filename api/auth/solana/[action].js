const path = require("path");

const HANDLERS = {
  challenge: require("../../../server-routes/auth/solana/challenge"),
  logout: require("../../../server-routes/auth/solana/logout"),
  me: require("../../../server-routes/auth/solana/me"),
  verify: require("../../../server-routes/auth/solana/verify"),
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
