const { getSessionFromRequest, handleCors, json } = require("../../api/_lib/auth");

// Слоты выведены из эксплуатации (feature 024): место больше не покупается
// заранее, игрок платит за самого питомца в момент создания. Роут оставлен,
// чтобы открытые вкладки получали объяснимый ответ, а не 404 — так же, как
// поступили с отключённым входом через Solana.
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  if (!getSessionFromRequest(req)) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  json(res, 410, {
    error: "Slots are retired — pets are paid for at creation.",
    code: "SLOTS_RETIRED",
  });
};
