(function attachUpgradeScreenState(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.PetixUpgradeScreenState = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createUpgradeScreenState() {
  const ATTRIBUTE_KEYS = ["stamina", "agility", "strength", "intelligence"];

  function toWholeNumber(value, fallback = 0) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized)) {
      return fallback;
    }
    return Math.max(0, Math.floor(normalized));
  }

  function getLevelAwareUpgradeScaleBudget(input = {}) {
    const attributes = input.attributes && typeof input.attributes === "object" ? input.attributes : {};
    const stagedIncrements =
      input.stagedIncrements && typeof input.stagedIncrements === "object" ? input.stagedIncrements : {};
    const availablePoints = toWholeNumber(input.availablePoints);
    const level = Math.max(1, toWholeNumber(input.level, 1));
    const baseMax = Math.max(
      0,
      ...ATTRIBUTE_KEYS.map((key) => toWholeNumber(attributes[key]))
    );
    const stagedTotal = ATTRIBUTE_KEYS.reduce(
      (total, key) => total + toWholeNumber(stagedIncrements[key]),
      0
    );
    const levelFloor = 14 + level;

    return Math.max(15, levelFloor, baseMax + availablePoints, baseMax + stagedTotal);
  }

  function getUpgradeCtaState(input = {}) {
    const remainingPoints = toWholeNumber(input.remainingPoints);
    const availablePoints = toWholeNumber(input.availablePoints);
    const isSaving = Boolean(input.isSaving);
    const isMobileUpgradeViewport = Boolean(input.isMobileUpgradeViewport);
    const hasStagedSpend = remainingPoints >= 0 && remainingPoints !== availablePoints;
    const ready = isMobileUpgradeViewport
      ? remainingPoints === 0 && hasStagedSpend && !isSaving
      : hasStagedSpend && !isSaving;

    if (isSaving) {
      return {
        label: "Saving...",
        ready: false,
      };
    }

    if (isMobileUpgradeViewport) {
      return {
        label: ready ? "Save" : `Points left: ${remainingPoints}`,
        ready,
      };
    }

    return {
      label: "Save Upgrade",
      ready,
    };
  }

  return {
    getLevelAwareUpgradeScaleBudget,
    getUpgradeCtaState,
  };
});
