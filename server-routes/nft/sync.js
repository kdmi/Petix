const {
  INTERNAL_AUTH_HEADER,
  getSessionFromRequest,
  handleCors,
  isLikelyEvmAddress,
  json,
} = require("../../api/_lib/auth");
const { syncTransfers, scheduleFullRefresh } = require("../../api/_lib/nft");
const { createChainClient } = require("../../api/_lib/nft-chain");
const nftStore = require("../../api/_lib/nft-store");
const { sendDomainError } = require("./_shared");

// Manual/periodic ownership sync. Three callers, three auth paths:
//   1. Vercel Cron — GET with `Authorization: Bearer $CRON_SECRET`
//   2. our own tooling — the internal secret header
//   3. the dashboard — a regular EVM session
/** Крон или наша тулза — им можно показать причину падения. */
function isTrustedCaller(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && String(req.headers.authorization || "") === `Bearer ${cronSecret}`) return true;
  const internalSecret = process.env.INTERNAL_API_SECRET;
  return Boolean(
    internalSecret &&
      internalSecret.length >= 24 &&
      String(req.headers[INTERNAL_AUTH_HEADER] || "") === internalSecret
  );
}

function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET;
  if (
    cronSecret &&
    String(req.headers.authorization || "") === `Bearer ${cronSecret}`
  ) {
    return true;
  }

  const internalSecret = process.env.INTERNAL_API_SECRET;
  if (
    internalSecret &&
    internalSecret.length >= 24 &&
    String(req.headers[INTERNAL_AUTH_HEADER] || "") === internalSecret
  ) {
    return true;
  }

  const session = getSessionFromRequest(req);
  return Boolean(session && isLikelyEvmAddress(session.wallet));
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  // Vercel Cron issues GET; everything else posts.
  if (req.method !== "POST" && req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  if (!isAuthorized(req)) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  try {
    // ?refreshAll=1 ставит обход всей коллекции. Дёргается вручную на ревиле:
    // метаданные меняются у всех токенов сразу, и витрине надо об этом сказать.
    const url = new URL(req.url || "/", "http://localhost");
    if (url.searchParams.get("refreshAll") === "1") {
      // Клиент цепочки создаётся здесь, а не при загрузке модуля: на проде с
      // выключенной фичей конфига нет, и падать на импорте нельзя.
      const supply = await createChainClient().getTotalSupply();
      const sweep = await scheduleFullRefresh(supply);
      json(res, 200, { scheduledRefresh: sweep });
      return;
    }

    const result = await syncTransfers();

    // Диагностика: без неё «пустой ответ» одинаково выглядит и когда всё
    // обновлено, и когда ключ маркетплейса не задан и мы вообще ничего не шлём.
    const state = await nftStore.readNftState();
    json(res, 200, {
      ...result,
      marketplace: {
        keyConfigured: Boolean(process.env.NFT_OPENSEA_API_KEY),
        contract: state.contract,
        sweep: state.refreshSweep,
        audit: state.refreshAudit,
        lastBaseUri: state.lastBaseUri,
        lastRevealState: state.lastRevealState,
      },
    });
  } catch (error) {
    if (sendDomainError(res, error)) return;
    console.error("[nft:sync]", error);
    // Крон и наши скрипты ходят сюда с секретом — им отдаём причину. Логи
    // Vercel читаются только вживую, а чинить синк приходится по факту.
    json(res, 500, {
      error: "Sync failed.",
      ...(isTrustedCaller(req) ? { detail: error.message, stack: String(error.stack || "").split("\n").slice(0, 4) } : {}),
    });
  }
};
