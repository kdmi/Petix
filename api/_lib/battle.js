const crypto = require("crypto");
const { findCharacterRecordById } = require("./store");
const {
  buildBattleRewardOutcome,
  normalizeProgression,
} = require("./battle-progression");
const { isCompletedBattlePet, resolveSelectedPower } = require("./battle-matchmaking");
const { buildCharacterImageUrl, serializeCharacterRecord } = require("./character");

const MAX_BATTLE_STEPS = 200;
const ATTACK_ADVANTAGE = 3;
const DAMAGE_VARIANCE_TABLE = [
  { threshold: 0.25, multiplier: 0.9 },
  { threshold: 0.75, multiplier: 1.0 },
  { threshold: 1.0, multiplier: 1.1 },
];

function cloneValue(value) {
  return value ? JSON.parse(JSON.stringify(value)) : null;
}

function normalizeNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function createRandomSource(random = {}) {
  return {
    int(min, max) {
      if (typeof random.int === "function") {
        return random.int(min, max);
      }

      return crypto.randomInt(min, max + 1);
    },
    float() {
      if (typeof random.float === "function") {
        return random.float();
      }

      return crypto.randomInt(0, 10_000) / 10_000;
    },
  };
}

function rollD20(randomSource) {
  return randomSource.int(1, 20);
}

function rollDamageVariance(randomSource) {
  const roll = randomSource.float();
  return DAMAGE_VARIANCE_TABLE.find((entry) => roll <= entry.threshold)?.multiplier || 1.0;
}

function buildImageUrl(record) {
  return buildCharacterImageUrl(record);
}

function buildTraits(record) {
  const variables = record?.variables || {};

  return {
    element: String(variables.ELEMENT || ""),
    topItem: String(variables.TOP_ITEM || ""),
    professionStyle: String(variables.PROFESSION_STYLE || ""),
    sideDetails: String(variables.SIDE_DETAILS || ""),
    facialFeatures: String(variables.FACIAL_FEATURES || ""),
    elementEffects: String(variables.ELEMENT_EFFECTS || ""),
  };
}

function normalizeSelectedPower(power) {
  if (!power || typeof power !== "object") {
    throw new Error("Battle-ready pet is missing a selected superpower.");
  }

  const name = String(power.title || power.name || power.description || "Mystic Strike").trim();
  const description = String(power.description || power.title || power.name || name).trim();

  return {
    id: String(power.id || "power_1"),
    name,
    description,
  };
}

function computeDerivedStats(attributes) {
  const stamina = Math.max(0, normalizeNumber(attributes?.stamina));
  const agility = Math.max(0, normalizeNumber(attributes?.agility));
  const strength = Math.max(0, normalizeNumber(attributes?.strength));
  const intelligence = Math.max(0, normalizeNumber(attributes?.intelligence));

  return {
    maxHp: Math.round(52 + 8 * stamina),
    baseDamage: 7 + 2 * strength,
    superpowerDamageMultiplier: 1.2 + (0.6 * intelligence) / (intelligence + 50),
    bonusCritChance: 0.02 + (0.13 * agility) / (agility + 50),
    critMultiplier: 1.5 + (0.5 * intelligence) / (intelligence + 50),
    counterChance: 0.03 + (0.17 * agility) / (agility + 40),
    counterDamageMultiplier: 0.3 + (0.3 * intelligence) / (intelligence + 50),
  };
}

function buildBattleParticipant({ wallet, character }) {
  if (!wallet || !isCompletedBattlePet(character)) {
    throw new Error("Only completed pets with a selected superpower can battle.");
  }

  return {
    wallet,
    character: cloneValue(character),
  };
}

function buildBattleSnapshot(participant, role) {
  const character = participant.character;
  const progression = normalizeProgression(character);
  const attributes = {
    stamina: Math.max(0, Math.floor(normalizeNumber(character?.attributes?.stamina))),
    agility: Math.max(0, Math.floor(normalizeNumber(character?.attributes?.agility))),
    strength: Math.max(0, Math.floor(normalizeNumber(character?.attributes?.strength))),
    intelligence: Math.max(0, Math.floor(normalizeNumber(character?.attributes?.intelligence))),
  };
  const derivedStats = computeDerivedStats(attributes);

  return {
    id: String(character.id),
    wallet: participant.wallet,
    role,
    name: String(character.name || character.displayName || character.creatureType || "Pet"),
    type: String(character.creatureType || "Pet"),
    rarity: String(character.rarity || "Legendary"),
    imageUrl: buildImageUrl(character),
    level: progression.level,
    experienceBefore: progression.experience,
    attributePointsAvailable: progression.attributePointsAvailable,
    attributes,
    selectedPower: normalizeSelectedPower(resolveSelectedPower(character)),
    traits: buildTraits(character),
    derivedStats,
  };
}

function createCombatState(snapshot) {
  return {
    snapshot,
    currentHp: snapshot.derivedStats.maxHp,
    ownTurnsTaken: 0,
    superpowerUsed: false,
    totalDamageDealt: 0,
  };
}

function shouldUseSuperpower(state) {
  if (state.superpowerUsed) {
    return false;
  }

  const triggerTurn = state.snapshot.role === "attacker" ? 3 : 4;
  return state.ownTurnsTaken + 1 === triggerTurn;
}

function roundDamage(value) {
  return Math.max(1, Math.round(value));
}

function buildRound({
  roundNumber,
  actorPetId,
  targetPetId,
  turnType,
  attackRoll,
  defenseRoll,
  hitResult,
  counterEligible,
  counterTriggered,
  damage,
  hpBeforeTarget,
  hpAfterTarget,
  usedSuperpower = false,
  usedCritical = false,
}) {
  return {
    roundNumber,
    actorPetId,
    targetPetId,
    turnType,
    attackRoll,
    defenseRoll,
    hitResult,
    counterEligible,
    counterTriggered,
    damage,
    hpBeforeTarget,
    hpAfterTarget,
    usedSuperpower,
    usedCritical,
    narrationText: "",
  };
}

function resolveCounterattack({
  roundNumber,
  attackerState,
  defenderState,
  attackRoll,
  defenseRoll,
}) {
  const damage = roundDamage(
    defenderState.snapshot.derivedStats.baseDamage *
      defenderState.snapshot.derivedStats.counterDamageMultiplier
  );
  const hpBeforeTarget = attackerState.currentHp;
  attackerState.currentHp = Math.max(0, attackerState.currentHp - damage);
  defenderState.totalDamageDealt += damage;

  return buildRound({
    roundNumber,
    actorPetId: defenderState.snapshot.id,
    targetPetId: attackerState.snapshot.id,
    turnType: "counterattack",
    attackRoll: defenseRoll,
    defenseRoll: attackRoll,
    hitResult: "counter",
    counterEligible: false,
    counterTriggered: false,
    damage,
    hpBeforeTarget,
    hpAfterTarget: attackerState.currentHp,
  });
}

function resolveTurn({
  roundNumber,
  actorState,
  targetState,
  randomSource,
}) {
  const usedSuperpower = shouldUseSuperpower(actorState);
  actorState.ownTurnsTaken += 1;
  actorState.superpowerUsed = actorState.superpowerUsed || usedSuperpower;

  const attackRoll = rollD20(randomSource);
  const defenseRoll = rollD20(randomSource);
  const turnType = usedSuperpower ? "superpower" : "normal";
  const attackScore = attackRoll + (usedSuperpower ? 5 : 0) + ATTACK_ADVANTAGE;
  const didHit = attackScore > defenseRoll;
  const hpBeforeTarget = targetState.currentHp;

  if (!didHit) {
    const counterEligible =
      !usedSuperpower && (defenseRoll >= attackScore + 5 || defenseRoll === 20);
    const counterTriggered =
      counterEligible &&
      randomSource.float() < targetState.snapshot.derivedStats.counterChance;

    const defendedRound = buildRound({
      roundNumber,
      actorPetId: actorState.snapshot.id,
      targetPetId: targetState.snapshot.id,
      turnType,
      attackRoll,
      defenseRoll,
      hitResult: "defended",
      counterEligible,
      counterTriggered,
      damage: 0,
      hpBeforeTarget,
      hpAfterTarget: hpBeforeTarget,
      usedSuperpower,
      usedCritical: false,
    });

    if (!counterTriggered) {
      return {
        rounds: [defendedRound],
        nextRoundNumber: roundNumber + 1,
      };
    }

    const counterRound = resolveCounterattack({
      roundNumber: roundNumber + 1,
      attackerState: actorState,
      defenderState: targetState,
      attackRoll,
      defenseRoll,
    });

    return {
      rounds: [defendedRound, counterRound],
      nextRoundNumber: roundNumber + 2,
    };
  }

  const varianceMultiplier = rollDamageVariance(randomSource);
  const baseDamage = actorState.snapshot.derivedStats.baseDamage * varianceMultiplier;
  const usedCritical =
    !usedSuperpower &&
    (attackRoll === 20 ||
      randomSource.float() < actorState.snapshot.derivedStats.bonusCritChance);
  const damage = roundDamage(
    usedSuperpower
      ? baseDamage * actorState.snapshot.derivedStats.superpowerDamageMultiplier
      : usedCritical
        ? baseDamage * actorState.snapshot.derivedStats.critMultiplier
        : baseDamage
  );

  targetState.currentHp = Math.max(0, targetState.currentHp - damage);
  actorState.totalDamageDealt += damage;

  return {
    rounds: [
      buildRound({
        roundNumber,
        actorPetId: actorState.snapshot.id,
        targetPetId: targetState.snapshot.id,
        turnType,
        attackRoll,
        defenseRoll,
        hitResult: usedCritical ? "critical" : "hit",
        counterEligible: false,
        counterTriggered: false,
        damage,
        hpBeforeTarget,
        hpAfterTarget: targetState.currentHp,
        usedSuperpower,
        usedCritical,
      }),
    ],
    nextRoundNumber: roundNumber + 1,
  };
}

function buildPublicRewardOutcome(reward) {
  return {
    xpGained: reward.xpGained,
    levelUp: reward.levelUp,
    newLevel: reward.newLevel,
    newExperience: reward.newExperience,
    xpForNextLevel: reward.xpForNextLevel,
    attributePointsGained: reward.attributePointsGained,
    newAttributePointsAvailable: reward.newAttributePointsAvailable,
    isPassiveReward: reward.isPassiveReward,
  };
}

function buildBattleResult({
  attackerParticipant,
  defenderParticipant,
  attackerState,
  defenderState,
  completedAt,
}) {
  const attackerWins = defenderState.currentHp <= 0;
  const attackerReward = buildBattleRewardOutcome({
    petId: attackerParticipant.character.id,
    role: "attacker",
    isWinner: attackerWins,
    progression: normalizeProgression(attackerParticipant.character),
  });
  const defenderReward = buildBattleRewardOutcome({
    petId: defenderParticipant.character.id,
    role: "defender",
    isWinner: !attackerWins,
    progression: normalizeProgression(defenderParticipant.character),
  });

  return {
    result: {
      winnerPetId: attackerWins ? attackerState.snapshot.id : defenderState.snapshot.id,
      loserPetId: attackerWins ? defenderState.snapshot.id : attackerState.snapshot.id,
      attackerEndingHp: attackerState.currentHp,
      defenderEndingHp: defenderState.currentHp,
      attackerRewards: buildPublicRewardOutcome(attackerReward),
      defenderRewards: buildPublicRewardOutcome(defenderReward),
      completedAt,
      finalSummaryText: "",
    },
    progression: {
      attacker: attackerReward.nextState,
      defender: defenderReward.nextState,
    },
  };
}

function buildGeneratingBattleRecord(battle) {
  return {
    id: battle.id,
    status: "generating",
    battleType: battle.battleType,
    createdAt: battle.createdAt,
    completedAt: null,
    attackerPetId: battle.attackerPetId,
    defenderPetId: battle.defenderPetId,
    attackerOwnerWallet: battle.attackerOwnerWallet,
    defenderOwnerWallet: battle.defenderOwnerWallet,
    matchmaking: cloneValue(battle.matchmaking),
    narrationMode: null,
    startingHp: cloneValue(battle.startingHp),
    attackerSnapshot: cloneValue(battle.attackerSnapshot),
    defenderSnapshot: cloneValue(battle.defenderSnapshot),
    rounds: [],
    result: null,
    error: null,
  };
}

function applyProgressionToCharacterRecord(record, nextState, updatedAt = new Date().toISOString()) {
  return {
    ...record,
    level: nextState.level,
    experience: nextState.experience,
    softCurrency: nextState.softCurrency,
    attributePointsAvailable: nextState.attributePointsAvailable,
    updatedAt,
  };
}

async function resolveAttackerParticipant({ attackerPetId, attackerWallet }) {
  const foundCharacter = await findCharacterRecordById(attackerPetId);

  if (!foundCharacter?.character) {
    throw new Error("Attacker pet was not found.");
  }

  if (foundCharacter.wallet !== attackerWallet) {
    throw new Error("Attacker pet does not belong to this wallet.");
  }

  if (!isCompletedBattlePet(foundCharacter.character)) {
    throw new Error("Only completed pets can battle.");
  }

  return buildBattleParticipant(foundCharacter);
}

function createBattleSimulation({
  battleId,
  attackerParticipant,
  defenderParticipant,
  matchmaking,
  createdAt = new Date().toISOString(),
  random,
}) {
  const randomSource = createRandomSource(random);
  const attackerSnapshot = buildBattleSnapshot(attackerParticipant, "attacker");
  const defenderSnapshot = buildBattleSnapshot(defenderParticipant, "defender");
  const attackerState = createCombatState(attackerSnapshot);
  const defenderState = createCombatState(defenderSnapshot);
  const rounds = [];
  let roundNumber = 1;
  let actorState = attackerState;
  let targetState = defenderState;

  while (
    roundNumber <= MAX_BATTLE_STEPS &&
    attackerState.currentHp > 0 &&
    defenderState.currentHp > 0
  ) {
    const resolved = resolveTurn({
      roundNumber,
      actorState,
      targetState,
      randomSource,
    });

    rounds.push(...resolved.rounds);
    roundNumber = resolved.nextRoundNumber;

    if (attackerState.currentHp <= 0 || defenderState.currentHp <= 0) {
      break;
    }

    const previousActor = actorState;
    actorState = targetState;
    targetState = previousActor;
  }

  if (attackerState.currentHp > 0 && defenderState.currentHp > 0) {
    const error = new Error("Battle simulation did not resolve.");
    error.code = "BATTLE_SIMULATION_TIMEOUT";
    throw error;
  }

  const completedAt = new Date().toISOString();
  const { result, progression } = buildBattleResult({
    attackerParticipant,
    defenderParticipant,
    attackerState,
    defenderState,
    completedAt,
  });

  const battle = {
    id: battleId,
    status: "ready",
    battleType: "pvp_random",
    createdAt,
    completedAt,
    attackerPetId: attackerSnapshot.id,
    defenderPetId: defenderSnapshot.id,
    attackerOwnerWallet: attackerParticipant.wallet,
    defenderOwnerWallet: defenderParticipant.wallet,
    matchmaking: cloneValue(matchmaking || null),
    narrationMode: "template",
    startingHp: {
      attacker: attackerSnapshot.derivedStats.maxHp,
      defender: defenderSnapshot.derivedStats.maxHp,
    },
    attackerSnapshot,
    defenderSnapshot,
    rounds,
    result,
    error: null,
  };

  return {
    battle,
    progression,
  };
}

function serializeBattleParticipant(snapshot) {
  return {
    id: snapshot.id,
    name: snapshot.name,
    type: snapshot.type,
    rarity: snapshot.rarity,
    imageUrl: snapshot.imageUrl,
    level: snapshot.level,
    maxHp: snapshot.derivedStats.maxHp,
    attributes: cloneValue(snapshot.attributes),
    selectedPower: {
      name: snapshot.selectedPower.name,
      description: snapshot.selectedPower.description,
    },
    traits: snapshot.traits,
  };
}

function serializeBattlePreviewCandidate(entry) {
  if (!entry?.character) {
    return null;
  }

  const serialized = serializeCharacterRecord(entry.character);
  if (!serialized?.id || !serialized.imageUrl) {
    return null;
  }

  return {
    id: serialized.id,
    name: serialized.name,
    imageUrl: serialized.imageUrl,
    level: serialized.level,
    rarity: serialized.rarity,
    creatorWallet: entry.wallet || "",
    matchTier: entry.matchTier || "",
    levelDistance:
      Number.isFinite(Number(entry.levelDistance)) && Number(entry.levelDistance) >= 0
        ? Math.floor(Number(entry.levelDistance))
        : null,
  };
}

function buildBattleRevealBundle({
  selectedOpponent,
  carouselCandidates = [],
  matchmaking = null,
}) {
  const selectedPreview = serializeBattlePreviewCandidate(selectedOpponent);
  if (!selectedPreview) {
    return null;
  }

  const normalizedCandidates = [];
  const seen = new Set();

  [selectedOpponent, ...carouselCandidates].forEach((entry) => {
    const candidate = serializeBattlePreviewCandidate(entry);
    const candidateId = String(candidate?.id || "").trim();
    if (!candidateId || seen.has(candidateId)) {
      return;
    }

    seen.add(candidateId);
    normalizedCandidates.push(candidate);
  });

  if (!normalizedCandidates.some((entry) => entry.id === selectedPreview.id)) {
    normalizedCandidates.unshift(selectedPreview);
  }

  return {
    selectedOpponent: selectedPreview,
    carouselCandidates: normalizedCandidates,
    matchmaking: cloneValue(matchmaking || null),
  };
}

function formatBattleResponse(battle) {
  if (!battle) {
    return null;
  }

  if (battle.status === "generating") {
    return {
      id: battle.id,
      status: "generating",
    };
  }

  if (battle.status === "failed") {
    return {
      id: battle.id,
      status: "failed",
      error: battle.error || "BATTLE_GENERATION_FAILED",
    };
  }

  return {
    id: battle.id,
    status: "ready",
    narrationMode: battle.narrationMode || "template",
    attacker: serializeBattleParticipant(battle.attackerSnapshot),
    defender: serializeBattleParticipant(battle.defenderSnapshot),
    startingHp: battle.startingHp,
    rounds: Array.isArray(battle.rounds) ? battle.rounds.map((round) => ({ ...round })) : [],
    result: cloneValue(battle.result),
    coinReward: Math.max(0, Math.floor(Number(battle.coinReward) || 0)),
  };
}

module.exports = {
  MAX_BATTLE_STEPS,
  applyProgressionToCharacterRecord,
  buildBattleParticipant,
  buildBattleRevealBundle,
  buildGeneratingBattleRecord,
  createBattleSimulation,
  formatBattleResponse,
  resolveAttackerParticipant,
  serializeBattlePreviewCandidate,
};
