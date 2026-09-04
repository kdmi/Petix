const path = require("path");
const { json } = require("../_lib/auth");
const { isNftDemoEnabled } = require("../_lib/nft-demo-chain");

const HANDLERS = {
  bind: require("../../server-routes/nft-demo/bind"),
  config: require("../../server-routes/nft-demo/config"),
  image: require("../../server-routes/nft-demo/image"),
  slots: require("../../server-routes/nft-demo/slots"),
  sync: require("../../server-routes/nft-demo/sync"),
  unbind: require("../../server-routes/nft-demo/unbind"),
};

module.exports = async (req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");
  const action = path.basename(requestUrl.pathname).replace(/\.js$/i, "");
  const handler = HANDLERS[action];

  if (!handler) {
    json(res, 404, { error: "Not found." });
    return;
  }

  if (!isNftDemoEnabled()) {
    // Синк дёргает Vercel Cron раз в минуту. Пока фича выключена (код выкачен,
    // коллекции ещё нет), отвечаем 200 — иначе логи забиты ежеминутными 404 и
    // крон выглядит сломанным. Пользовательские маршруты по-прежнему 404.
    if (action === "sync") {
      json(res, 200, { skipped: true, reason: "NFT_DEMO_DISABLED" });
      return;
    }
    json(res, 404, { error: "NFT demo is disabled.", code: "NFT_DEMO_DISABLED" });
    return;
  }

  await handler(req, res);
};
