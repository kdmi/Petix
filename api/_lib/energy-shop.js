const { debitCurrency, normalizeCurrency } = require("./currency");
const { normalizeBattleState } = require("./battle-energy");

// Магазин энергии (020): доп. бои за Points. Чистые функции над профилем кошелька —
// запись делает вызывающий через updateWalletProfile, а любая проверка здесь
// `throw`-ит с кодом до мутации, чтобы отказ не порождал запись.

const HOUR_MS = 3600000;

function fail(code, message, extra) {
  const error = new Error(message);
  error.code = code;
  if (extra) Object.assign(error, extra);
  return error;
}

function isShopEnabled(cfg) {
  return Number(cfg?.ENERGY_SHOP_ENABLED) > 0;
}

function getEnergyPacks(cfg) {
  const packs = Array.isArray(cfg?.ENERGY_PACKS) ? cfg.ENERGY_PACKS : [];
  return packs
    .map((pack, index) => ({
      index,
      fights: Math.max(0, Math.floor(Number(pack?.fights) || 0)),
      price: Math.max(0, Math.floor(Number(pack?.price) || 0)),
    }))
    .filter((pack) => pack.fights > 0);
}

function getCooldownMs(cfg) {
  const hours = Number(cfg?.ENERGY_PACK_COOLDOWN_HOURS);
  return Math.max(0, Number.isFinite(hours) ? hours : 24) * HOUR_MS;
}

/** Когда пакет `index` снова доступен (ms) или null, если доступен сейчас / не покупался. */
function getPackAvailableAt(battleState, index, cfg, { now = Date.now() } = {}) {
  const packs = battleState?.energyPacks || {};
  const record = packs[String(index)];
  const purchasedAtMs = Date.parse(record?.purchasedAt || "");
  if (!Number.isFinite(purchasedAtMs)) return null;
  const availableAtMs = purchasedAtMs + getCooldownMs(cfg);
  return availableAtMs > now ? availableAtMs : null;
}

function buildEnergyShopView(rawBattleState, cfg, { now = Date.now() } = {}) {
  const battleState = normalizeBattleState(rawBattleState, { now: new Date(now) });
  return {
    enabled: isShopEnabled(cfg),
    cooldownHours: getCooldownMs(cfg) / HOUR_MS,
    packs: getEnergyPacks(cfg).map((pack) => {
      const availableAtMs = getPackAvailableAt(battleState, pack.index, cfg, { now });
      return {
        index: pack.index,
        fights: pack.fights,
        price: pack.price,
        availableAt: availableAtMs === null ? null : new Date(availableAtMs).toISOString(),
        remainingSec: availableAtMs === null ? 0 : Math.ceil((availableAtMs - now) / 1000),
      };
    }),
  };
}

/**
 * Мутирует профиль: списывает цену, добавляет бои, ставит отметку покупки пакета.
 * Бросает { code: SHOP_DISABLED | INVALID_PACK | PACK_COOLDOWN | INSUFFICIENT_FUNDS }.
 */
function purchaseEnergyPack(profile, packIndex, cfg, { now = Date.now() } = {}) {
  if (!isShopEnabled(cfg)) {
    throw fail("SHOP_DISABLED", "Energy shop is closed.");
  }

  const index = Number(packIndex);
  const pack = Number.isInteger(index) ? getEnergyPacks(cfg).find((entry) => entry.index === index) : null;
  if (!pack) {
    throw fail("INVALID_PACK", "Unknown energy pack.");
  }

  const battleState = normalizeBattleState(profile.battleState, { now: new Date(now) });
  const availableAtMs = getPackAvailableAt(battleState, index, cfg, { now });
  if (availableAtMs !== null) {
    throw fail("PACK_COOLDOWN", "This pack was bought recently.", {
      availableAt: new Date(availableAtMs).toISOString(),
    });
  }

  const balance = normalizeCurrency(profile.currency).balance;
  if (balance < pack.price) {
    throw fail("INSUFFICIENT_FUNDS", "Not enough Points.", { required: pack.price, balance });
  }

  const pricePaid = pack.price > 0 ? debitCurrency(profile, pack.price) : 0;
  profile.battleState = {
    ...battleState,
    energyPurchased: battleState.energyPurchased + pack.fights,
    energyPacks: {
      ...battleState.energyPacks,
      [String(index)]: { purchasedAt: new Date(now).toISOString() },
    },
    updatedAt: new Date(now).toISOString(),
  };

  return { index, fights: pack.fights, pricePaid };
}

module.exports = {
  buildEnergyShopView,
  getEnergyPacks,
  getPackAvailableAt,
  isShopEnabled,
  purchaseEnergyPack,
};
