const path = require("path");

// Souls shop (031): buy, try-on (render a pet wearing an item), apply (keep a render), variant (render image).
const HANDLERS = {
  apply: require("../../server-routes/shop/apply"),
  buy: require("../../server-routes/shop/buy"),
  "try-on": require("../../server-routes/shop/try-on"),
  variant: require("../../server-routes/shop/variant"),
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
