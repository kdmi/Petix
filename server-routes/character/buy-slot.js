const {
  getSessionFromRequest,
  handleCors,
  json,
} = require("../../api/_lib/auth");
const { debitCurrency } = require("../../api/_lib/currency");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { canBuySlot, getMaxCharacters, getNextSlotPrice } = require("../../api/_lib/slots");
const { updateWalletProfile } = require("../../api/_lib/store");

function fail(status, message, code, extra) {
  const error = new Error(message);
  error.httpStatus = status;
  if (code) error.httpCode = code;
  if (extra) Object.assign(error, extra);
  return error;
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }
  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  try {
    const cfg = await getEconomyConfig();
    let purchase = null;

    const profile = await updateWalletProfile(session.wallet, (current) => {
      const check = canBuySlot(current, cfg);
      if (!check.ok) {
        if (check.reason === "MAX_SLOTS") {
          throw fail(409, "All slots already unlocked.", "MAX_SLOTS");
        }
        if (check.reason === "INSUFFICIENT_FUNDS") {
          throw fail(402, "Not enough Points.", "INSUFFICIENT_FUNDS", {
            required: check.required,
            balance: check.balance,
          });
        }
        throw fail(400, "Cannot buy slot.");
      }
      const debited = debitCurrency(current, check.price);
      current.paidSlots = (Number(current.paidSlots) || 0) + 1;
      purchase = { slotIndex: check.slotIndex, price: debited };
      return current;
    });

    json(res, 200, {
      purchasedSlotIndex: purchase.slotIndex,
      pricePaid: purchase.price,
      paidSlots: profile.paidSlots,
      maxCharacters: getMaxCharacters(profile, cfg),
      balance: profile.currency.balance,
      nextSlot:
        getNextSlotPrice(profile, cfg) === null
          ? null
          : { index: profile.paidSlots + 4, price: getNextSlotPrice(profile, cfg) },
    });
  } catch (error) {
    if (error.httpStatus) {
      const payload = { error: error.message, code: error.httpCode };
      if (error.required != null) payload.required = error.required;
      if (error.balance != null) payload.balance = error.balance;
      json(res, error.httpStatus, payload);
      return;
    }
    json(res, 400, { error: error.message || "Bad request." });
  }
};
