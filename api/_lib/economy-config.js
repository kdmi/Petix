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

const DEFAULTS = Object.freeze({
  FARM_BASE: 10, // Points/hour for Common L1 (×10 scale)
  rarityMult: Object.freeze({ Common: 1.0, Rare: 1.2, Epic: 1.4, Legendary: 1.6 }),
  FARM_LEVEL_K: 0.05,
  FARM_CAP_HOURS: 24,
  BATTLE_REWARD_BASE: 100,
  BATTLE_LEVEL_K: 0.05,
  SLOT_PRICES: Object.freeze([5000, 10000, 20000, 35000, 60000, 100000, 160000]),
  MAX_CHARACTER_SLOTS: 10,
  MIN_WITHDRAW: 200,
  WITHDRAW_FEE_PCT: 5,
  POINTS_PER_PETIX: 1,
});

const CACHE_TTL_MS = Number(process.env.ECONOMY_CONFIG_CACHE_TTL_MS) || 15000;
let cachedConfig = null;
let cacheExpiresAt = 0;

function deepCloneDefaults() {
  return {
    ...DEFAULTS,
    rarityMult: { ...DEFAULTS.rarityMult },
    SLOT_PRICES: [...DEFAULTS.SLOT_PRICES],
  };
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
    } else if (key === "SLOT_PRICES" && Array.isArray(overrides.SLOT_PRICES)) {
      base.SLOT_PRICES = [...overrides.SLOT_PRICES];
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
    "MIN_WITHDRAW",
    "WITHDRAW_FEE_PCT",
    "POINTS_PER_PETIX",
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

  // Evaluate effective config for cross-field invariants.
  const effective = mergeConfig(patch);
  const prices = effective.SLOT_PRICES;
  if ("SLOT_PRICES" in patch) {
    if (!Array.isArray(prices)) {
      errors.push({ field: "SLOT_PRICES", message: "SLOT_PRICES must be an array" });
    } else {
      const expectedLen = effective.MAX_CHARACTER_SLOTS - 3;
      if (prices.length !== expectedLen) {
        errors.push({
          field: "SLOT_PRICES",
          message: `SLOT_PRICES length must equal MAX_CHARACTER_SLOTS-3 (${expectedLen})`,
        });
      }
      for (let i = 0; i < prices.length; i += 1) {
        if (typeof prices[i] !== "number" || !Number.isFinite(prices[i]) || prices[i] < 0) {
          errors.push({ field: "SLOT_PRICES", message: `SLOT_PRICES[${i}] must be a number ≥ 0` });
        }
        if (i > 0 && prices[i] <= prices[i - 1]) {
          errors.push({ field: "SLOT_PRICES", message: "SLOT_PRICES must be strictly increasing" });
          break;
        }
      }
    }
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
