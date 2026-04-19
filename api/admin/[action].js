const path = require("path");

const HANDLERS = {
  battles: require("../../server-routes/admin/battles"),
  characters: require("../../server-routes/admin/characters"),
  "delete-character": require("../../server-routes/admin/delete-character"),
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
