const path = require("path");

const HANDLERS = {
  "adjust-balance": require("../../server-routes/admin/adjust-balance"),
  battles: require("../../server-routes/admin/battles"),
  burn: require("../../server-routes/admin/burn"),
  characters: require("../../server-routes/admin/characters"),
  "delete-character": require("../../server-routes/admin/delete-character"),
  "economy-config": require("../../server-routes/admin/economy-config"),
  "farm-stats": require("../../server-routes/admin/farm-stats"),
  price: require("../../server-routes/admin/price"),
  "nft-reveal-audit": require("../../server-routes/admin/nft-reveal-audit"),
  "token-stats": require("../../server-routes/admin/token-stats"),
  waitlist: require("../../server-routes/admin/waitlist"),
  "waitlist-export": require("../../server-routes/admin/waitlist-export"),
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
