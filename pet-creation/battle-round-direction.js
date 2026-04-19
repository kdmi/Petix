(function attachBattleRoundDirection(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.PetixBattleRoundDirection = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createBattleRoundDirection() {
  const LEFT_PILL_ASSETS = Object.freeze({
    left: "/assets/battle/round-pill-left-alt.svg",
    right: "/assets/battle/round-pill-right-alt.svg",
  });

  const RIGHT_PILL_ASSETS = Object.freeze({
    left: "/assets/battle/round-pill-left-default.svg",
    right: "/assets/battle/round-pill-right-default.svg",
  });

  function normalizeRoundSideKeyword(value) {
    const normalized = String(value || "").trim().toLowerCase();

    if (normalized === "initiator" || normalized === "left") {
      return "left";
    }

    if (normalized === "opponent" || normalized === "right") {
      return "right";
    }

    return "";
  }

  function mapAttackerSideToPillDirection(value) {
    const attackerSide = normalizeRoundSideKeyword(value);
    if (attackerSide === "left") return "right";
    if (attackerSide === "right") return "left";
    return "";
  }

  function getArenaRoundPillDirection(input = {}) {
    if (typeof input === "string") {
      return normalizeRoundSideKeyword(input) || "right";
    }

    const record = input && typeof input === "object" ? input : {};
    const explicitDirection = normalizeRoundSideKeyword(record.pillDirection);
    if (explicitDirection) return explicitDirection;

    const attackerSide = mapAttackerSideToPillDirection(record.attackerSide);
    if (attackerSide) return attackerSide;

    if (record.leftIcon === "swords") return "right";
    if (record.rightIcon === "swords") return "left";

    return "right";
  }

  function buildArenaRoundVisualState(input = {}) {
    const record = input && typeof input === "object" ? input : {};
    const initiatorId = String(record.initiatorId || "").trim();
    const actorPetId = String(record.actorPetId || "").trim();
    const targetPetId = String(record.targetPetId || "").trim();
    const actorIsInitiator = actorPetId !== "" && actorPetId === initiatorId;
    const targetIsInitiator = targetPetId !== "" && targetPetId === initiatorId;
    const attackerSide = actorPetId
      ? actorIsInitiator
        ? "initiator"
        : "opponent"
      : targetPetId && targetIsInitiator
        ? "opponent"
        : "initiator";
    const defenderSide = targetPetId
      ? targetIsInitiator
        ? "initiator"
        : "opponent"
      : attackerSide === "initiator"
        ? "opponent"
        : "initiator";

    return {
      attackerSide,
      defenderSide,
      pillDirection: attackerSide === "initiator" ? "right" : "left",
      accentSide: defenderSide === "initiator" ? "left" : "right",
      leftIcon: attackerSide === "initiator" ? "swords" : "shield",
      rightIcon: attackerSide === "initiator" ? "shield" : "swords",
    };
  }

  function getArenaRoundPillAssets(input = {}) {
    const direction = getArenaRoundPillDirection(input);
    const assets = direction === "left" ? LEFT_PILL_ASSETS : RIGHT_PILL_ASSETS;

    return {
      left: assets.left,
      right: assets.right,
    };
  }

  return {
    buildArenaRoundVisualState,
    getArenaRoundPillAssets,
    getArenaRoundPillDirection,
  };
});
