const path = require("path");

// Profile (031): attach a Solana wallet.
const HANDLERS = {
  "solana-link": require("../../server-routes/profile/solana-link"),
};

module.exports = async (req, res) => {
  const action = path.basename(new URL(req.url, "http://localhost").pathname).replace(/\.js$/i, "");
  const handler = HANDLERS[action];
  if (!handler) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Not found." }));
    return;
  }
  await handler(req, res);
};
