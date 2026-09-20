const {
  appendAuditEntry,
  readAuditEntries,
  readOverrides,
  writeOverrides,
} = require("./economy-config-store");

// Runtime-tunable economy configuration (Farm-экономика, feature 013).
// Effective config = DEFAULTS ⊕ overrides (persisted via economy-config-store).
// Pure helpers (getDefaults / mergeConfig / validateConfigPatch) are FS-free and unit-tested;
// async helpers (getEconomyConfig / setEconomyConfig) hit the store and cache with a short TTL.

const RARITY_KEYS = ["Common", "Rare", "Epic", "Legendary"];
const TIER_KEYS = ["glass", "bronze", "silver", "gold", "prismatic"];
// Карты «тир капсулы → число» (018). Мержатся и валидируются одинаково.
const TIER_MAP_KEYS = ["NFT_TIER_EXTRA_BATTLES", "NFT_TIER_FARM_BONUS_PCT", "NFT_TIER_WIN_BONUS_PCT"];

const DEFAULTS = Object.freeze({
  FARM_BASE: 10, // Points/hour for Common L1 (×10 scale)
  rarityMult: Object.freeze({ Common: 1.0, Rare: 1.2, Epic: 1.4, Legendary: 1.6 }),
  FARM_LEVEL_K: 0.05,
  FARM_CAP_HOURS: 24,
  BATTLE_REWARD_BASE: 100,
  BATTLE_LEVEL_K: 0.05,
  // Один бесплатный питомец на кошелёк (решение владельца 2026-09-20; было 3).
  // Три бесплатных приводили к тому, что 78% кошельков заводили ровно 2-3 пета
  // и ставили их на ферму, а каждая генерация стоит нам денег.
  FREE_SLOTS: 1,
  // Лестница в долларах, а не в Points: она считается от окупаемости питомца
  // собственной фермой (второй окупается примерно за три месяца, десятый — за
  // одиннадцать лет) и раз в час пересчитывается в Points по курсу монеты,
  // чтобы при движении курса цена в деньгах оставалась предсказуемой.
  PET_PRICES_USD: Object.freeze([1.2, 1.91, 3.11, 4.78, 7.65, 12.43, 20.08, 32.03, 51.15]),
  MAX_CHARACTER_SLOTS: 10,
  // Пересчёт доллара в Points. Защита одна на всю лестницу: ограничиваем сам
  // курс, а не девять цен. Пул монеты тонкий (~$21k), поэтому скачок за один
  // пересчёт ограничен, а границы не дают экономике уехать при обвале или
  // разгоне цены.
  PRICE_MAX_STEP_PCT: 25,
  PRICE_MIN_POINTS_PER_USD: 1000,
  PRICE_MAX_POINTS_PER_USD: 2000000,
  // Курс на момент выката: $0.0000478 за монету. Действует, пока не получена
  // первая живая котировка.
  PRICE_BOOTSTRAP_POINTS_PER_USD: 20920,
  PRICE_TTL_MINUTES: 60,
  PRICE_MIN_LIQUIDITY_USD: 1000,
  // Цена сжигания персонажа (014). Поднята с 1 000 до 10 000 вместе с платным
  // созданием (024): сжигание освобождает уже открытое место, и следующий
  // питомец в нём бесплатен — значит сжигание и есть цена перерисовки, и она
  // должна быть заметно выше нашей себестоимости генерации.
  BURN_COST: 10000,
  MIN_WITHDRAW: 1000, // порог вывода (решение владельца 2026-09-17; было 200)
  WITHDRAW_FEE_PCT: 0, // курс 1:1 без комиссии (решение 013/withdraw); остаётся тюнингуемым рычагом
  WITHDRAW_ENABLED: 0, // рубильник вывода (0=выкл, 1=вкл). По умолчанию выкл до запуска токена.
  WITHDRAW_MAX_PER_TX: 0, // разовый лимит вывода в Points (019); 0 = без лимита. Защита от багов начисления, не от кражи ключа.
  WITHDRAW_REQUIRE_NFT: 1, // вывод только держателям капсулы коллекции (019/US7); админы освобождены
  WITHDRAW_NFT_HOLD_HOURS: 36, // сколько часов капсула должна непрерывно лежать на кошельке (решение 2026-09-18; было 48)
  POINTS_PER_PETIX: 1,
  // Рубильник заливки питомцев в капсулы (0=выкл, 1=вкл). По умолчанию выкл:
  // сперва ревил тиров, и только когда все капсулы доехали до витрины —
  // открываем заливку из админки, не трогая цепочку.
  NFT_BIND_ENABLED: 0,
  NFT_BIND_LEVEL: 1, // мин. уровень персонажа для заливки в NFT-слот (016; 1 = порог отключён)
  NFT_MINT_LIMIT: 5, // лимит бесплатного минта слотов на кошелёк (инфо для фронта; on-chain лимит задаётся в контракте)
  NFT_UNBIND_COST: 10000, // цена очистки капсулы (сжигание привязанного персонажа)
  NFT_UNBIND_DELAY_MS: 3600000, // отсрочка сжигания: час на то, чтобы статус разошёлся по маркетплейсам
  // Бонусы за редкость капсулы (018). Действуют, только пока в капсуле сидит
  // питомец, и суммируются по всем капсулам кошелька.
  NFT_TIER_EXTRA_BATTLES: Object.freeze({
    glass: 0,
    bronze: 0,
    silver: 1,
    gold: 2,
    prismatic: 3,
  }),
  // Процент к ферме питомца, сидящего в капсуле (решение 2026-09-10).
  NFT_TIER_FARM_BONUS_PCT: Object.freeze({
    glass: 5,
    bronze: 10,
    silver: 15,
    gold: 20,
    prismatic: 30,
  }),
  // Процент к Points за победу. Из правил убран (2026-09-10), рычаг оставлен
  // нулевым — включается из админки, если передумаем.
  NFT_TIER_WIN_BONUS_PCT: Object.freeze({
    glass: 0,
    bronze: 0,
    silver: 0,
    gold: 0,
    prismatic: 0,
  }),
  // Магазин энергии (020): доп. бои за Points. Кулдаун — на каждый пакет отдельно,
  // так что потолок за сутки = сумма боёв всех пакетов (по умолчанию 9 за 1 050).
  ENERGY_SHOP_ENABLED: 1,
  ENERGY_PACKS: Object.freeze([
    Object.freeze({ fights: 1, price: 150 }),
    Object.freeze({ fights: 3, price: 400 }),
    Object.freeze({ fights: 5, price: 500 }),
  ]),
  ENERGY_PACK_COOLDOWN_HOURS: 24,
});

const CACHE_TTL_MS = Number(process.env.ECONOMY_CONFIG_CACHE_TTL_MS) || 15000;
let cachedConfig = null;
let cacheExpiresAt = 0;

function deepCloneDefaults() {
  return {
    ...DEFAULTS,
    rarityMult: { ...DEFAULTS.rarityMult },
    PET_PRICES_USD: [...DEFAULTS.PET_PRICES_USD],
    ENERGY_PACKS: cloneEnergyPacks(DEFAULTS.ENERGY_PACKS),
    NFT_TIER_EXTRA_BATTLES: { ...DEFAULTS.NFT_TIER_EXTRA_BATTLES },
    NFT_TIER_FARM_BONUS_PCT: { ...DEFAULTS.NFT_TIER_FARM_BONUS_PCT },
    NFT_TIER_WIN_BONUS_PCT: { ...DEFAULTS.NFT_TIER_WIN_BONUS_PCT },
  };
}

function cloneEnergyPacks(packs) {
  return (Array.isArray(packs) ? packs : []).map((pack) => ({
    fights: Number(pack?.fights),
    price: Number(pack?.price),
  }));
}

function getDefaults() {
  return deepCloneDefaults();
}

/** Merge validated overrides onto defaults (overrides win; nested rarityMult merged). */
function mergeConfig(overrides) {
  const base = deepCloneDefaults();
  if (!overrides || typeof overrides !== "object") return base;

  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in overrides)) continue;
    if (key === "rarityMult" && overrides.rarityMult && typeof overrides.rarityMult === "object") {
      base.rarityMult = { ...base.rarityMult, ...overrides.rarityMult };
    } else if (TIER_MAP_KEYS.includes(key) && overrides[key] && typeof overrides[key] === "object") {
      // Карты по тирам капсул: частичный патч дополняет дефолты, а не заменяет их.
      base[key] = { ...base[key], ...overrides[key] };
    } else if (key === "PET_PRICES_USD" && Array.isArray(overrides.PET_PRICES_USD)) {
      base.PET_PRICES_USD = [...overrides.PET_PRICES_USD];
    } else if (key === "ENERGY_PACKS" && Array.isArray(overrides.ENERGY_PACKS)) {
      base.ENERGY_PACKS = cloneEnergyPacks(overrides.ENERGY_PACKS);
    } else if (typeof overrides[key] === "number" && Number.isFinite(overrides[key])) {
      base[key] = overrides[key];
    }
  }
  return base;
}

/**
 * Validate a patch of config changes. Returns { ok, errors:[{field,message}] }.
 * Validates the RESULTING effective config so invariants hold post-merge.
 */
function validateConfigPatch(patch) {
  const errors = [];
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) {
    return { ok: false, errors: [{ field: "patch", message: "patch must be an object" }] };
  }

  const numericKeys = [
    "FARM_BASE",
    "FARM_LEVEL_K",
    "FARM_CAP_HOURS",
    "BATTLE_REWARD_BASE",
    "BATTLE_LEVEL_K",
    "MAX_CHARACTER_SLOTS",
    "FREE_SLOTS",
    "PRICE_MAX_STEP_PCT",
    "PRICE_MIN_POINTS_PER_USD",
    "PRICE_MAX_POINTS_PER_USD",
    "PRICE_BOOTSTRAP_POINTS_PER_USD",
    "PRICE_TTL_MINUTES",
    "PRICE_MIN_LIQUIDITY_USD",
    "BURN_COST",
    "MIN_WITHDRAW",
    "WITHDRAW_FEE_PCT",
    "WITHDRAW_ENABLED",
    "WITHDRAW_MAX_PER_TX",
    "WITHDRAW_REQUIRE_NFT",
    "WITHDRAW_NFT_HOLD_HOURS",
    "POINTS_PER_PETIX",
    "NFT_BIND_ENABLED",
    "NFT_BIND_LEVEL",
    "NFT_MINT_LIMIT",
    "NFT_UNBIND_COST",
    "NFT_UNBIND_DELAY_MS",
    "ENERGY_SHOP_ENABLED",
    "ENERGY_PACK_COOLDOWN_HOURS",
  ];
  for (const key of numericKeys) {
    if (key in patch) {
      const v = patch[key];
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        errors.push({ field: key, message: `${key} must be a number ≥ 0` });
      }
    }
  }

  if ("rarityMult" in patch) {
    const rm = patch.rarityMult;
    if (!rm || typeof rm !== "object" || Array.isArray(rm)) {
      errors.push({ field: "rarityMult", message: "rarityMult must be an object" });
    } else {
      for (const key of RARITY_KEYS) {
        if (!(key in rm)) {
          errors.push({ field: "rarityMult", message: `rarityMult missing ${key}` });
        } else if (typeof rm[key] !== "number" || !Number.isFinite(rm[key]) || rm[key] < 0) {
          errors.push({ field: "rarityMult", message: `rarityMult.${key} must be a number ≥ 0` });
        }
      }
    }
  }

  for (const mapKey of TIER_MAP_KEYS) {
    if (!(mapKey in patch)) continue;
    const table = patch[mapKey];
    if (!table || typeof table !== "object" || Array.isArray(table)) {
      errors.push({ field: mapKey, message: `${mapKey} must be an object` });
      continue;
    }
    for (const [tier, value] of Object.entries(table)) {
      if (!TIER_KEYS.includes(tier)) {
        errors.push({ field: mapKey, message: `${mapKey}.${tier} is not a capsule tier` });
      } else if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        errors.push({ field: mapKey, message: `${mapKey}.${tier} must be a number ≥ 0` });
      }
    }
  }

  if ("ENERGY_PACKS" in patch) {
    const packs = patch.ENERGY_PACKS;
    if (!Array.isArray(packs) || packs.length === 0) {
      errors.push({ field: "ENERGY_PACKS", message: "ENERGY_PACKS must be a non-empty array" });
    } else {
      packs.forEach((pack, index) => {
        const fights = pack && pack.fights;
        const price = pack && pack.price;
        if (!Number.isInteger(fights) || fights < 1) {
          errors.push({ field: "ENERGY_PACKS", message: `ENERGY_PACKS[${index}].fights must be an integer ≥ 1` });
        }
        if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
          errors.push({ field: "ENERGY_PACKS", message: `ENERGY_PACKS[${index}].price must be a number ≥ 0` });
        }
      });
    }
  }

  // Evaluate effective config for cross-field invariants.
  const effective = mergeConfig(patch);

  if (effective.FREE_SLOTS < 1 || effective.FREE_SLOTS > effective.MAX_CHARACTER_SLOTS) {
    errors.push({
      field: "FREE_SLOTS",
      message: "FREE_SLOTS must be between 1 and MAX_CHARACTER_SLOTS",
    });
  }

  const prices = effective.PET_PRICES_USD;
  if ("PET_PRICES_USD" in patch || "FREE_SLOTS" in patch || "MAX_CHARACTER_SLOTS" in patch) {
    if (!Array.isArray(prices)) {
      errors.push({ field: "PET_PRICES_USD", message: "PET_PRICES_USD must be an array" });
    } else {
      const expectedLen = effective.MAX_CHARACTER_SLOTS - effective.FREE_SLOTS;
      if (prices.length !== expectedLen) {
        errors.push({
          field: "PET_PRICES_USD",
          message: `PET_PRICES_USD length must equal MAX_CHARACTER_SLOTS-FREE_SLOTS (${expectedLen})`,
        });
      }
      for (let i = 0; i < prices.length; i += 1) {
        if (typeof prices[i] !== "number" || !Number.isFinite(prices[i]) || prices[i] <= 0) {
          errors.push({ field: "PET_PRICES_USD", message: `PET_PRICES_USD[${i}] must be a number > 0` });
        }
        if (i > 0 && prices[i] <= prices[i - 1]) {
          errors.push({ field: "PET_PRICES_USD", message: "PET_PRICES_USD must be strictly increasing" });
          break;
        }
      }
    }
  }

  if (effective.PRICE_MIN_POINTS_PER_USD >= effective.PRICE_MAX_POINTS_PER_USD) {
    errors.push({
      field: "PRICE_MIN_POINTS_PER_USD",
      message: "PRICE_MIN_POINTS_PER_USD must be below PRICE_MAX_POINTS_PER_USD",
    });
  }

  return { ok: errors.length === 0, errors };
}

function invalidateCache() {
  cachedConfig = null;
  cacheExpiresAt = 0;
}

/** Async: effective config (defaults ⊕ persisted overrides), cached for CACHE_TTL_MS. */
async function getEconomyConfig({ now = Date.now() } = {}) {
  if (cachedConfig && now < cacheExpiresAt) {
    return cachedConfig;
  }
  const overrides = await readOverrides();
  cachedConfig = mergeConfig(overrides);
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedConfig;
}

/**
 * Async: apply a validated patch, persist overrides, invalidate cache, append audit.
 * Throws { code:"INVALID_CONFIG", errors } on validation failure.
 */
async function setEconomyConfig(patch, { adminWallet = "", reason = "", now = Date.now() } = {}) {
  const { ok, errors } = validateConfigPatch(patch);
  if (!ok) {
    const error = new Error("Invalid economy config patch.");
    error.code = "INVALID_CONFIG";
    error.errors = errors;
    throw error;
  }

  const current = await readOverrides();
  const nextOverrides = { ...current };
  for (const key of Object.keys(DEFAULTS)) {
    if (key in patch) nextOverrides[key] = patch[key];
  }
  nextOverrides.updatedAt = new Date(now).toISOString();
  nextOverrides.updatedBy = adminWallet || "unknown";

  await writeOverrides(nextOverrides);
  await appendAuditEntry({
    ts: new Date(now).toISOString(),
    adminWallet: adminWallet || "unknown",
    patch,
    reason: String(reason || "").slice(0, 500),
  });
  invalidateCache();
  return mergeConfig(nextOverrides);
}

module.exports = {
  DEFAULTS,
  RARITY_KEYS,
  getDefaults,
  mergeConfig,
  validateConfigPatch,
  invalidateCache,
  getEconomyConfig,
  setEconomyConfig,
  readAuditEntries,
};
