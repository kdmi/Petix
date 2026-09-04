const { handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { cancelUnbindRequest, requestUnbindSlot } = require("../../api/_lib/nft-demo");
const { requireEvmSession, sendDomainError } = require("./_shared");

// Очистка капсулы. Мгновенно ничего не сжигается: заявка стоит Points и
// исполняется с отсрочкой (см. api/_lib/nft-demo.js). `cancel: true` снимает
// заявку и возвращает Points.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const session = requireEvmSession(req, res);
  if (!session) return;

  try {
    const body = await parseJsonBody(req);
    if (!body.tokenId) {
      json(res, 400, { error: "tokenId is required." });
      return;
    }

    const result = body.cancel
      ? await cancelUnbindRequest(session.wallet, body.tokenId)
      : await requestUnbindSlot(session.wallet, body.tokenId);
    json(res, 200, result);
  } catch (error) {
    if (sendDomainError(res, error)) return;
    console.error("[nft-demo:unbind]", error);
    json(res, 500, { error: "Unbind failed." });
  }
};
