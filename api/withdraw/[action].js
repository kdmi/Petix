const path = require("path");

// Вывод Points → $PETIX (013/withdraw). Диспетчер: последний сегмент пути → handler.
const HANDLERS = {
  config: require("../../server-routes/withdraw/config"),
  prepare: require("../../server-routes/withdraw/prepare"),
  confirm: require("../../server-routes/withdraw/confirm"),
  cancel: require("../../server-routes/withdraw/cancel"),
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
