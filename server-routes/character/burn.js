const {
  getSessionFromRequest,
  handleCors,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { debitCurrency, normalizeCurrency } = require("../../api/_lib/currency");
const { computeFarmEarned, normalizeFarmState } = require("../../api/_lib/farm");
const { getEconomyConfig } = require("../../api/_lib/economy-config");
const { getMaxCharacters } = require("../../api/_lib/slots");
const { deleteStoredImage, updateWalletProfile } = require("../../api/_lib/store");

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
    const body = await parseJsonBody(req);
    const petId = String(body.petId || "").trim();
    if (!petId) {
      json(res, 400, { error: "petId is required." });
      return;
    }

    const cfg = await getEconomyConfig();
    const cost = Math.max(0, Math.floor(Number(cfg.BURN_COST) || 0));
    const now = Date.now();
    let burned = null;

    const profile = await updateWalletProfile(session.wallet, (current) => {
      const characters = current.characters || [];
      const index = characters.findIndex((record) => record.id === petId);
      if (index === -1) throw fail(404, "Character not found.", "NOT_FOUND");

      const character = characters[index];
      if (character.status !== "completed") {
        throw fail(400, "Only completed pets can be burned.", "NOT_COMPLETED");
      }

      if (character.nftDemo?.tokenId) {
        // Привязанный к NFT-слоту персонаж сжигается только очисткой слота
        // текущим on-chain владельцем токена (feature 016).
        throw fail(409, "This pet is bound to an NFT slot — clear the slot instead.", "CHARACTER_BOUND_TO_NFT");
      }

      const farmState = normalizeFarmState(character.farmState);
      if (farmState.active) {
        const farm = computeFarmEarned(farmState, now, character.level, character.rarity, cfg);
        throw fail(
          409,
          farm.capped
            ? "Collect your farm harvest first, then burn this pet."
            : "This pet is farming — wait for the farm cycle to finish before burning.",
          "FARM_ACTIVE"
        );
      }

      const balance = normalizeCurrency(current.currency).balance;
      if (balance < cost) {
        throw fail(402, "Not enough Points.", "INSUFFICIENT_FUNDS", {
          required: cost,
          balance,
        });
      }

      const pricePaid = cost > 0 ? debitCurrency(current, cost) : 0;
      characters.splice(index, 1);
      burned = { pricePaid, image: character.image || null };
      return current;
    });

    if (burned.image) {
      // Best-effort: сирота в сторадже допустима, откатывать burn из-за неё нельзя.
      try {
        await deleteStoredImage(burned.image);
      } catch (error) {
        console.warn("[character:burn:image]", error.message);
      }
    }

    json(res, 200, {
      burned: true,
      petId,
      pricePaid: burned.pricePaid,
      balance: profile.currency.balance,
      paidSlots: profile.paidSlots || 0,
      maxCharacters: getMaxCharacters(profile, cfg),
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
