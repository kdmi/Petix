const path = require("path");
const { json } = require("../_lib/auth");
const { isNftEnabled } = require("../_lib/nft-chain");

const HANDLERS = {
  bind: require("../../server-routes/nft/bind"),
  config: require("../../server-routes/nft/config"),
  image: require("../../server-routes/nft/image"),
  slots: require("../../server-routes/nft/slots"),
  sync: require("../../server-routes/nft/sync"),
  unbind: require("../../server-routes/nft/unbind"),
};

module.exports = async (req, res) => {
  const requestUrl = new URL(req.url, "http://localhost");
  const action = path.basename(requestUrl.pathname).replace(/\.js$/i, "");
  const handler = HANDLERS[action];

  if (!handler) {
    json(res, 404, { error: "Not found." });
    return;
  }

  if (!isNftEnabled()) {
    // Синк дёргает Vercel Cron раз в минуту. Пока фича выключена (код выкачен,
    // коллекции ещё нет), отвечаем 200 — иначе логи забиты ежеминутными 404 и
    // крон выглядит сломанным. Пользовательские маршруты по-прежнему 404.
    if (action === "sync") {
      json(res, 200, { skipped: true, reason: "NFT_DISABLED" });
      return;
    }
    json(res, 404, { error: "NFT capsules are disabled.", code: "NFT_DISABLED" });
    return;
  }

  await handler(req, res);
};
