const crypto = require("crypto");
const { findCharacterRecordById, updateWalletProfile } = require("./store");

const DAILY_BATTLE_LIMIT = 3;
const MAX_BATTLE_ACTIONS = 12;
const LEVEL_UP_EXPERIENCE = 500;
const DEFAULT_SOFT_CURRENCY = 0;
const DEFAULT_LEVEL = 1;
const DEFAULT_EXPERIENCE = 0;
const DEFAULT_ATTRIBUTE_POINTS_AVAILABLE = 0;

const SYSTEM_OPPONENTS = [
  {
    id: "opponent-benny-bonnie",
    name: "Benny Bonnie",
    creatureType: "Burger Moth",
    rarity: "Rare",
    imageUrl: "https://www.figma.com/api/mcp/asset/f02fbff3-bf67-4c57-9434-55e9c86a3666",
    attributes: { stamina: 4, agility: 6, strength: 5, intelligence: 5 },
    selectedPower: { id: "power-1", title: "Skeleton Warrior", description: "At the beginning of the battle, summons a skeleton warrior" },
    variables: {
      ELEMENT: "Neon cheese",
      TOP_ITEM: "Sesame crown",
      PROFESSION_STYLE: "Arcade duelist",
      SIDE_DETAILS: "Buzzing wing shards",
      FACIAL_FEATURES: "Bright arcade visor",
      ELEMENT_EFFECTS: "glowing mustard sparks",
    },
  },
  {
    id: "opponent-sweet-bombino",
    name: "Sweet Bombino",
    creatureType: "Cyber Bunny",
    rarity: "Rare",
    imageUrl: "https://www.figma.com/api/mcp/asset/b2560924-0557-4db8-9bd7-3548e6deb26d",
    attributes: { stamina: 4, agility: 6, strength: 5, intelligence: 5 },
    selectedPower: { id: "power-1", title: "Candy Burst", description: "At the beginning of the battle, summons a skeleton warrior" },
    variables: {
      ELEMENT: "Sugar static",
      TOP_ITEM: "Candy pilot goggles",
      PROFESSION_STYLE: "Sky courier",
      SIDE_DETAILS: "Ribbon stabilizers",
      FACIAL_FEATURES: "Soft neon whiskers",
      ELEMENT_EFFECTS: "electric sugar trails",
    },
  },
  {
    id: "opponent-frost-fizz",
    name: "Frost Fizz",
    creatureType: "Bubble Cake",
    rarity: "Rare",
    imageUrl: "https://www.figma.com/api/mcp/asset/b2bb3e64-9975-4a40-82ee-13865f31cfa5",
    attributes: { stamina: 5, agility: 4, strength: 4, intelligence: 6 },
    selectedPower: { id: "power-1", title: "Sparkling Frost", description: "Covers the arena with sparkling frost and slows the target." },
    variables: {
      ELEMENT: "Frost syrup",
      TOP_ITEM: "Crystal swirl",
      PROFESSION_STYLE: "Dessert mage",
      SIDE_DETAILS: "Floating glaze rings",
      FACIAL_FEATURES: "Icy candy eyes",
      ELEMENT_EFFECTS: "sparkling frost ribbons",
    },
  },
  {
    id: "opponent-ember-crust",
    name: "Ember Crust",
    creatureType: "Molten Pastry",
    rarity: "Rare",
    imageUrl: "https://www.figma.com/api/mcp/asset/948e3ddd-1038-45b2-ae85-365d527547e8",
    attributes: { stamina: 5, agility: 3, strength: 6, intelligence: 4 },
    selectedPower: { id: "power-1", title: "Ignite Ground", description: "Ignites the ground and gains bonus damage on the next strike." },
    variables: {
      ELEMENT: "Molten jam",
      TOP_ITEM: "Baked magma crest",
      PROFESSION_STYLE: "Forge bruiser",
      SIDE_DETAILS: "Scorched crumb mantle",
      FACIAL_FEATURES: "Fierce ember grin",
      ELEMENT_EFFECTS: "rolling lava sparks",
    },
  },
  {
    id: "opponent-toast-rider",
    name: "Toast Rider",
    creatureType: "Toast Sprite",
    rarity: "Rare",
    imageUrl: "https://www.figma.com/api/mcp/asset/44ad6112-e6ec-4098-a95b-272d791909bd",
    attributes: { stamina: 4, agility: 5, strength: 4, intelligence: 6 },
    selectedPower: { id: "power-1", title: "Hot Gust", description: "Summons a hot gust that raises critical chance for one round." },
    variables: {
      ELEMENT: "Solar crumbs",
      TOP_ITEM: "Speed scarf",
      PROFESSION_STYLE: "Road captain",
      SIDE_DETAILS: "Trail of toasted sparks",
      FACIAL_FEATURES: "Confident butter-smile",
      ELEMENT_EFFECTS: "heatwave gusts",
    },
  },
  {
    id: "opponent-gilded-core",
    name: "Gilded Core",
    creatureType: "Clockwork Relic",
    rarity: "Rare",
    imageUrl: "https://www.figma.com/api/mcp/asset/e6270898-8c2a-4bcf-af64-fd36f2e6d117",
    attributes: { stamina: 6, agility: 3, strength: 5, intelligence: 5 },
    selectedPower: { id: "power-1", title: "Brass Shell", description: "Deploys a brass shell and reduces incoming damage." },
    variables: {
      ELEMENT: "Brass light",
      TOP_ITEM: "Clock crown",
      PROFESSION_STYLE: "Vault guardian",
      SIDE_DETAILS: "Orbiting cog fragments",
      FACIAL_FEATURES: "Etched golden eyes",
      ELEMENT_EFFECTS: "metallic light motes",
    },
  },
  {
    id: "opponent-jelly-spark",
    name: "Jelly Spark",
    creatureType: "Arc Jelly",
    rarity: "Rare",
    imageUrl: "https://www.figma.com/api/mcp/asset/c57367f5-f7c1-4b17-bad0-dd9bc3b4f301",
    attributes: { stamina: 3, agility: 6, strength: 4, intelligence: 6 },
    selectedPower: { id: "power-1", title: "Static Arcs", description: "Releases static arcs that chain between targets in the arena." },
    variables: {
      ELEMENT: "Charged gel",
      TOP_ITEM: "Pulse halo",
      PROFESSION_STYLE: "Storm trickster",
      SIDE_DETAILS: "Crackling gel droplets",
      FACIAL_FEATURES: "Blinking plasma pupils",
      ELEMENT_EFFECTS: "electric arc ribbons",
    },
  },
  {
    id: "opponent-night-captain",
    name: "Night Captain",
    creatureType: "Abyss Corsair",
    rarity: "Rare",
    imageUrl: "https://www.figma.com/api/mcp/asset/995470d1-ccbd-4b11-91aa-85ed21eea56b",
    attributes: { stamina: 4, agility: 5, strength: 5, intelligence: 5 },
    selectedPower: { id: "power-1", title: "Shadow Tide", description: "Summons a shadow tide and slips out of the first hit." },
    variables: {
      ELEMENT: "Moon tide",
      TOP_ITEM: "Captain plume",
      PROFESSION_STYLE: "Abyss raider",
      SIDE_DETAILS: "Dark current ribbons",
      FACIAL_FEATURES: "Cut-glass grin",
      ELEMENT_EFFECTS: "shadow spray",
    },
  },
  {
    id: "opponent-panda-drift",
    name: "Panda Drift",
    creatureType: "Turbo Panda",
    rarity: "Rare",
    imageUrl: "https://www.figma.com/api/mcp/asset/ec89c239-bdf2-43a8-b95a-b356e985f24f",
    attributes: { stamina: 6, agility: 4, strength: 5, intelligence: 3 },
    selectedPower: { id: "power-1", title: "Lane Charge", description: "Charges through the lane and gains bonus armor on impact." },
    variables: {
      ELEMENT: "Turbo smoke",
      TOP_ITEM: "Racing visor",
      PROFESSION_STYLE: "Street bruiser",
      SIDE_DETAILS: "Drift exhaust stripes",
      FACIAL_FEATURES: "Focused panda mask",
      ELEMENT_EFFECTS: "smoky speed bursts",
    },
  },
  {
    id: "opponent-sand-cube",
    name: "Sand Cube",
    creatureType: "Rune Block",
    rarity: "Rare",
    imageUrl: "https://www.figma.com/api/mcp/asset/8f5b9a53-464d-4e6e-bdc8-8b96b2dd9576",
    attributes: { stamina: 5, agility: 4, strength: 4, intelligence: 6 },
    selectedPower: { id: "power-1", title: "Dust Mirage", description: "Builds a dust mirage that weakens the enemy's next ability." },
    variables: {
      ELEMENT: "Rune sand",
      TOP_ITEM: "Ancient shard crown",
      PROFESSION_STYLE: "Desert tactician",
      SIDE_DETAILS: "Shifting rune flakes",
      FACIAL_FEATURES: "Stone-carved gaze",
      ELEMENT_EFFECTS: "sand mirages",
    },
  },
  {
    id: "opponent-bloom-byte",
    name: "Bloom Byte",
    creatureType: "Pixel Bloom",
    rarity: "Rare",
    imageUrl: "https://www.figma.com/api/mcp/asset/736bdcba-4025-41ba-93f5-a199245bbc1f",
    attributes: { stamina: 4, agility: 5, strength: 3, intelligence: 7 },
    selectedPower: { id: "power-1", title: "Neon Petals", description: "Splits into neon petals and boosts spell effectiveness." },
    variables: {
      ELEMENT: "Pixel bloom",
      TOP_ITEM: "Petal antennae",
      PROFESSION_STYLE: "Lightweaver",
      SIDE_DETAILS: "Shimmering petals",
      FACIAL_FEATURES: "Soft digital eyes",
      ELEMENT_EFFECTS: "floating neon petals",
    },
  },
  {
    id: "opponent-hex-crate",
    name: "Hex Crate",
    creatureType: "Curse Box",
    rarity: "Rare",
    imageUrl: "https://www.figma.com/api/mcp/asset/60debe2b-c983-453d-adb9-af86adfc3421",
    attributes: { stamina: 4, agility: 4, strength: 5, intelligence: 6 },
    selectedPower: { id: "power-1", title: "Hex Mark", description: "Marks the target with a hex and amplifies the next direct hit." },
    variables: {
      ELEMENT: "Hex smoke",
      TOP_ITEM: "Runed latch",
      PROFESSION_STYLE: "Curse artisan",
      SIDE_DETAILS: "Leaking sigil sparks",
      FACIAL_FEATURES: "Glowing lock-eyes",
      ELEMENT_EFFECTS: "cursed smoke curls",
    },
  },
];

const SYSTEM_OPPONENTS_BY_ID = new Map(SYSTEM_OPPONENTS.map((record) => [record.id, record]));

function randomInt(min, max) {
  return crypto.randomInt(min, max + 1);
}

function randomFloat() {
  return crypto.randomInt(0, 10_000) / 10_000;
}

function normalizeNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function normalizeProgression(record) {
  return {
    level: Math.max(DEFAULT_LEVEL, Math.floor(normalizeNumber(record?.level, DEFAULT_LEVEL))),
    experience: Math.max(
      0,
      Math.floor(
        normalizeNumber(
          record?.experience,
          normalizeNumber(record?.experienceBefore, DEFAULT_EXPERIENCE)
        )
      )
    ),
    softCurrency: Math.max(0, Math.floor(normalizeNumber(record?.softCurrency, DEFAULT_SOFT_CURRENCY))),
    attributePointsAvailable: Math.max(
      0,
      Math.floor(normalizeNumber(record?.attributePointsAvailable, DEFAULT_ATTRIBUTE_POINTS_AVAILABLE))
    ),
  };
}

function getPowerSourceText(power) {
  return `${power?.title || ""} ${power?.description || ""}`.trim().toLowerCase();
}

function normalizePowerEffect(power, record) {
  const text = getPowerSourceText(power);
  const attributes = record?.attributes || {};
  let effectType = "direct_damage";

  if (/shield|shell|barrier|armor|guard|brace|reduce incoming/.test(text)) {
    effectType = "shield";
  } else if (/stun|slow|freeze|bind|shock|hex|daze|paraly/.test(text)) {
    effectType = "stun";
  }

  let effectValue = 4 + Math.floor((normalizeNumber(attributes.strength) + normalizeNumber(attributes.intelligence)) / 4);
  if (effectType === "shield") {
    effectValue = 5 + Math.floor(normalizeNumber(attributes.stamina) / 2);
  }
  if (effectType === "stun") {
    effectValue = 1;
  }

  return {
    id: String(power?.id || "power-1"),
    name: String(power?.title || power?.description || "Mystic Surge"),
    description: String(power?.description || power?.title || "A battle technique."),
    effectType,
    effectValue,
  };
}

function buildTraits(record) {
  const variables = record?.variables || {};
  return {
    element: variables.ELEMENT || "",
    topItem: variables.TOP_ITEM || "",
    professionStyle: variables.PROFESSION_STYLE || "",
    sideDetails: variables.SIDE_DETAILS || "",
    facialFeatures: variables.FACIAL_FEATURES || "",
    elementEffects: variables.ELEMENT_EFFECTS || "",
  };
}

function buildBattlePetSnapshot(participant) {
  const { character } = participant;
  const progression = normalizeProgression(character);
  const selectedPower = normalizePowerEffect(
    character?.selectedPower ||
      character?.powers?.find((power) => power.id === character.selectedPowerId) ||
      character?.powers?.[0],
    character
  );
  const version = encodeURIComponent(character?.updatedAt || character?.createdAt || Date.now());
  const characterId = encodeURIComponent(character?.id || "");
  const imageUrl =
    character?.imageUrl ||
    character?.image?.url ||
    (characterId ? `/api/character/image?id=${characterId}&v=${version}` : "");

  return {
    id: String(character.id),
    name: String(character.name || character.displayName || character.creatureType || "Unknown pet"),
    type: String(character.creatureType || "Pet"),
    rarity: String(character.rarity || "legendary").trim().toLowerCase(),
    imageUrl: String(imageUrl || ""),
    level: progression.level,
    experienceBefore: progression.experience,
    stamina: normalizeNumber(character?.attributes?.stamina),
    strength: normalizeNumber(character?.attributes?.strength),
    agility: normalizeNumber(character?.attributes?.agility),
    intelligence: normalizeNumber(character?.attributes?.intelligence),
    selectedPower,
    traits: buildTraits(character),
  };
}

function computeDerivedStats(snapshot) {
  return {
    maxHp: 40 + snapshot.stamina * 12 + snapshot.level * 3,
    attackBase: snapshot.strength * 2 + snapshot.level,
    defenseBase: snapshot.stamina + Math.floor(snapshot.agility / 2),
    critChance: 0.05 + snapshot.intelligence * 0.01,
    dodgeChance: snapshot.agility * 0.025,
    initiativeScore: snapshot.agility + snapshot.intelligence * 0.5,
  };
}

function cloneRound(round) {
  return JSON.parse(JSON.stringify(round));
}

function buildParticipantState(snapshot) {
  const derived = computeDerivedStats(snapshot);

  return {
    snapshot,
    derived,
    currentHp: derived.maxHp,
    totalDamageDealt: 0,
    actionsTaken: 0,
    hasUsedAbility: false,
    shieldValue: 0,
    skipTurn: false,
  };
}

function shouldUseAbility(actorState) {
  if (actorState.hasUsedAbility) return false;

  const power = actorState.snapshot.selectedPower;
  if (!power) return false;

  if (power.effectType === "shield") {
    return actorState.currentHp / actorState.derived.maxHp < 0.6;
  }

  if (power.effectType === "stun") {
    return actorState.actionsTaken + 1 >= 2;
  }

  return actorState.actionsTaken + 1 >= 3;
}

function resolveAttackOutcome(actorState, targetState) {
  const attackRoll = randomInt(1, 20);
  const attackScore = attackRoll + actorState.derived.attackBase;
  const defenseScore = 10 + targetState.derived.defenseBase;

  if (attackRoll === 1) {
    return { attackRoll, hitResult: "miss" };
  }

  if (attackRoll === 20) {
    return { attackRoll, hitResult: "crit" };
  }

  if (randomFloat() < targetState.derived.dodgeChance) {
    return { attackRoll, hitResult: "dodge" };
  }

  if (attackScore >= defenseScore) {
    if (randomFloat() < actorState.derived.critChance) {
      return { attackRoll, hitResult: "crit" };
    }
    return { attackRoll, hitResult: "hit" };
  }

  return { attackRoll, hitResult: "miss" };
}

function resolveBaseDamage(actorState, targetState, hitResult) {
  if (hitResult === "miss" || hitResult === "dodge") {
    return 0;
  }

  const rolledBaseDamage =
    actorState.derived.attackBase + randomInt(1, 4) - targetState.derived.defenseBase;
  const normalDamage = Math.max(1, rolledBaseDamage);

  if (hitResult === "crit") {
    return Math.max(2, Math.floor(normalDamage * 1.75));
  }

  return normalDamage;
}

function applyShieldReduction(targetState, incomingDamage) {
  if (incomingDamage <= 0 || targetState.shieldValue <= 0) {
    return incomingDamage;
  }

  const reducedDamage = Math.max(0, incomingDamage - targetState.shieldValue);
  targetState.shieldValue = 0;
  return reducedDamage;
}

function buildSkipRound(roundNumber, actorState, targetState) {
  const hpBeforeTarget = targetState.currentHp;
  actorState.skipTurn = false;
  actorState.actionsTaken += 1;

  return {
    roundNumber,
    actorPetId: actorState.snapshot.id,
    targetPetId: targetState.snapshot.id,
    actorRoll: 0,
    actionType: "basic_attack",
    hitResult: "miss",
    damage: 0,
    hpBeforeTarget,
    hpAfterTarget: hpBeforeTarget,
    abilityUsed: false,
    narrationText: "",
    meta: {
      skipReason: "stun",
    },
  };
}

function resolveBattleAction(roundNumber, actorState, targetState) {
  if (actorState.skipTurn) {
    return buildSkipRound(roundNumber, actorState, targetState);
  }

  const useAbility = shouldUseAbility(actorState);
  const actionType = useAbility ? "ability" : "basic_attack";
  const outcome = resolveAttackOutcome(actorState, targetState);
  const hpBeforeTarget = targetState.currentHp;
  let damage = resolveBaseDamage(actorState, targetState, outcome.hitResult);
  let statusApplied;

  actorState.actionsTaken += 1;

  if (useAbility) {
    actorState.hasUsedAbility = true;

    if (actorState.snapshot.selectedPower.effectType === "direct_damage") {
      damage += outcome.hitResult === "miss" || outcome.hitResult === "dodge"
        ? 0
        : actorState.snapshot.selectedPower.effectValue;
    }

    if (actorState.snapshot.selectedPower.effectType === "shield") {
      actorState.shieldValue = actorState.snapshot.selectedPower.effectValue;
      statusApplied = {
        type: "shield",
        value: actorState.snapshot.selectedPower.effectValue,
        duration: 1,
      };
      damage = 0;
    }

    if (
      actorState.snapshot.selectedPower.effectType === "stun" &&
      outcome.hitResult !== "miss" &&
      outcome.hitResult !== "dodge"
    ) {
      targetState.skipTurn = true;
      statusApplied = {
        type: "stun",
        value: actorState.snapshot.selectedPower.effectValue,
        duration: 1,
      };
    }
  }

  damage = applyShieldReduction(targetState, damage);
  targetState.currentHp = Math.max(0, targetState.currentHp - damage);
  actorState.totalDamageDealt += damage;

  return {
    roundNumber,
    actorPetId: actorState.snapshot.id,
    targetPetId: targetState.snapshot.id,
    actorRoll: outcome.attackRoll,
    actionType,
    hitResult: outcome.hitResult,
    damage,
    hpBeforeTarget,
    hpAfterTarget: targetState.currentHp,
    abilityUsed: useAbility,
    abilityName: useAbility ? actorState.snapshot.selectedPower.name : undefined,
    statusApplied,
    narrationText: "",
  };
}

function resolveWinner(attackerState, defenderState, starterId) {
  if (attackerState.currentHp <= 0) {
    return defenderState.snapshot.id;
  }

  if (defenderState.currentHp <= 0) {
    return attackerState.snapshot.id;
  }

  if (attackerState.currentHp !== defenderState.currentHp) {
    return attackerState.currentHp > defenderState.currentHp
      ? attackerState.snapshot.id
      : defenderState.snapshot.id;
  }

  if (attackerState.totalDamageDealt !== defenderState.totalDamageDealt) {
    return attackerState.totalDamageDealt > defenderState.totalDamageDealt
      ? attackerState.snapshot.id
      : defenderState.snapshot.id;
  }

  return starterId;
}

function calculateRewardOutcome(progression, xpGained, softCurrencyGained) {
  let experience = progression.experience + xpGained;
  let level = progression.level;
  let attributePointsAvailable = progression.attributePointsAvailable;
  let leveledUp = false;

  while (experience >= LEVEL_UP_EXPERIENCE) {
    experience -= LEVEL_UP_EXPERIENCE;
    level += 1;
    attributePointsAvailable += 1;
    leveledUp = true;
  }

  return {
    xpGained,
    softCurrencyGained,
    levelUp: leveledUp,
    newLevel: leveledUp ? level : undefined,
    attributePointsGained: leveledUp ? level - progression.level : undefined,
    nextState: {
      level,
      experience,
      softCurrency: progression.softCurrency + softCurrencyGained,
      attributePointsAvailable,
    },
  };
}

function buildBattleResult(
  attackerState,
  defenderState,
  winnerPetId,
  attackerProgression,
  defenderProgression
) {
  const attackerWins = attackerState.snapshot.id === winnerPetId;

  const attackerRewards = attackerWins
    ? calculateRewardOutcome(attackerProgression, 20, 8)
    : calculateRewardOutcome(attackerProgression, 8, 3);
  const defenderRewards = attackerWins
    ? calculateRewardOutcome(defenderProgression, 4, 0)
    : calculateRewardOutcome(defenderProgression, 6, 0);

  return {
    winnerPetId,
    loserPetId: winnerPetId === attackerState.snapshot.id ? defenderState.snapshot.id : attackerState.snapshot.id,
    attackerRewards: {
      xpGained: attackerRewards.xpGained,
      softCurrencyGained: attackerRewards.softCurrencyGained,
      levelUp: attackerRewards.levelUp,
      newLevel: attackerRewards.newLevel,
      attributePointsGained: attackerRewards.attributePointsGained,
    },
    defenderRewards: {
      xpGained: defenderRewards.xpGained,
      softCurrencyGained: defenderRewards.softCurrencyGained,
      levelUp: defenderRewards.levelUp,
      newLevel: defenderRewards.newLevel,
      attributePointsGained: defenderRewards.attributePointsGained,
      passiveParticipationXp: true,
    },
    finalSummaryText: "",
    _nextAttackerState: attackerRewards.nextState,
    _nextDefenderState: defenderRewards.nextState,
  };
}

function finalizeRounds(rounds) {
  return rounds.map((round) => {
    const clone = cloneRound(round);
    delete clone.meta;
    return clone;
  });
}

function serializeBattleParticipant(snapshot) {
  const derived = computeDerivedStats(snapshot);

  return {
    id: snapshot.id,
    name: snapshot.name,
    type: snapshot.type,
    rarity: snapshot.rarity,
    imageUrl: snapshot.imageUrl,
    level: snapshot.level,
    maxHp: derived.maxHp,
    selectedPower: {
      name: snapshot.selectedPower.name,
      description: snapshot.selectedPower.description,
    },
    traits: snapshot.traits,
  };
}

function formatBattleResponse(battle) {
  return {
    id: battle.id,
    status: battle.status,
    narrationMode: battle.narrationMode,
    attacker: serializeBattleParticipant(battle.attackerSnapshot),
    defender: serializeBattleParticipant(battle.defenderSnapshot),
    startingHp: battle.startingHp,
    rounds: battle.rounds,
    result: battle.result,
  };
}

async function resolveParticipantById(characterId) {
  const foundCharacter = await findCharacterRecordById(characterId);
  if (foundCharacter?.character?.status === "completed") {
    return {
      wallet: foundCharacter.wallet,
      character: foundCharacter.character,
    };
  }

  const systemOpponent = SYSTEM_OPPONENTS_BY_ID.get(String(characterId));
  if (systemOpponent) {
    return {
      wallet: "system",
      character: {
        ...systemOpponent,
        status: "completed",
        displayName: systemOpponent.name,
        selectedPowerId: systemOpponent.selectedPower.id,
        powers: [systemOpponent.selectedPower],
        level: 1,
        experience: 0,
        softCurrency: 0,
        attributePointsAvailable: 0,
      },
    };
  }

  return null;
}

async function validateBattleRequest({ attackerPetId, defenderPetId, attackerWallet, existingBattles }) {
  if (!attackerPetId || !defenderPetId) {
    throw new Error("Both attackerPetId and defenderPetId are required.");
  }

  const attackerCountToday = existingBattles.filter((battle) => {
    return (
      battle?.attackerOwnerWallet === attackerWallet &&
      String(battle?.createdAt || "").slice(0, 10) === new Date().toISOString().slice(0, 10)
    );
  }).length;

  if (attackerCountToday >= DAILY_BATTLE_LIMIT) {
    const error = new Error("You have used all battles for today.");
    error.code = "DAILY_BATTLE_LIMIT_REACHED";
    throw error;
  }

  const [attacker, defender] = await Promise.all([
    resolveParticipantById(attackerPetId),
    resolveParticipantById(defenderPetId),
  ]);

  if (!attacker?.character) {
    throw new Error("Attacker pet was not found.");
  }
  if (!defender?.character) {
    throw new Error("Defender pet was not found.");
  }
  if (attacker.wallet !== attackerWallet) {
    throw new Error("Attacker pet does not belong to this wallet.");
  }
  if (attacker.character.status !== "completed" || defender.character.status !== "completed") {
    throw new Error("Only completed pets can battle.");
  }
  if (attacker.character.id === defender.character.id) {
    throw new Error("A pet cannot battle itself.");
  }
  if (defender.wallet !== "system" && attacker.wallet === defender.wallet) {
    throw new Error("Choose an opponent from another wallet.");
  }

  return { attacker, defender };
}

function applyProgressionToRecord(record, nextState) {
  return {
    ...record,
    level: nextState.level,
    experience: nextState.experience,
    softCurrency: nextState.softCurrency,
    attributePointsAvailable: nextState.attributePointsAvailable,
    updatedAt: new Date().toISOString(),
  };
}

async function persistBattleRewards({ attackerParticipant, defenderParticipant, battleResult }) {
  await updateWalletProfile(attackerParticipant.wallet, async (current) => {
    const nextCharacters = current.characters.map((character) => {
      if (character.id !== attackerParticipant.character.id) {
        return character;
      }
      return applyProgressionToRecord(character, battleResult._nextAttackerState);
    });

    return {
      ...current,
      characters: nextCharacters,
    };
  });

  if (defenderParticipant.wallet && defenderParticipant.wallet !== "system") {
    await updateWalletProfile(defenderParticipant.wallet, async (current) => {
      const nextCharacters = current.characters.map((character) => {
        if (character.id !== defenderParticipant.character.id) {
          return character;
        }
        return applyProgressionToRecord(character, battleResult._nextDefenderState);
      });

      return {
        ...current,
        characters: nextCharacters,
      };
    });
  }
}

async function createSimulatedBattle({ battleId, attackerParticipant, defenderParticipant }) {
  const attackerSnapshot = buildBattlePetSnapshot(attackerParticipant);
  const defenderSnapshot = buildBattlePetSnapshot(defenderParticipant);
  const attackerState = buildParticipantState(attackerSnapshot);
  const defenderState = buildParticipantState(defenderSnapshot);
  const attackerProgression = normalizeProgression(attackerParticipant.character);
  const defenderProgression = normalizeProgression(defenderParticipant.character);
  const starter =
    attackerState.derived.initiativeScore > defenderState.derived.initiativeScore
      ? attackerState
      : defenderState.derived.initiativeScore > attackerState.derived.initiativeScore
        ? defenderState
        : randomInt(0, 1) === 0
          ? attackerState
          : defenderState;
  const other = starter === attackerState ? defenderState : attackerState;
  let actorState = starter;
  let targetState = other;
  const rounds = [];

  for (let roundNumber = 1; roundNumber <= MAX_BATTLE_ACTIONS; roundNumber += 1) {
    const round = resolveBattleAction(roundNumber, actorState, targetState);
    rounds.push(round);

    if (targetState.currentHp <= 0) {
      break;
    }

    const previousActor = actorState;
    actorState = targetState;
    targetState = previousActor;
  }

  const winnerPetId = resolveWinner(attackerState, defenderState, starter.snapshot.id);
  const battleResult = buildBattleResult(
    attackerState,
    defenderState,
    winnerPetId,
    attackerProgression,
    defenderProgression
  );

  if (defenderParticipant.wallet === "system") {
    battleResult.defenderRewards = {
      xpGained: 0,
      softCurrencyGained: 0,
      levelUp: false,
      passiveParticipationXp: false,
    };
    battleResult._nextDefenderState = defenderProgression;
  }

  await persistBattleRewards({
    attackerParticipant,
    defenderParticipant,
    battleResult,
  });

  const result = {
    ...battleResult,
  };
  delete result._nextAttackerState;
  delete result._nextDefenderState;

  return {
    id: battleId,
    status: "ready",
    attackerPetId: attackerSnapshot.id,
    defenderPetId: defenderSnapshot.id,
    attackerOwnerWallet: attackerParticipant.wallet,
    defenderOwnerWallet: defenderParticipant.wallet,
    battleType: "pvp_random",
    createdAt: new Date().toISOString(),
    winnerPetId: result.winnerPetId,
    loserPetId: result.loserPetId,
    rounds,
    result,
    narrationMode: "template",
    attackerSnapshot,
    defenderSnapshot,
    startingHp: {
      attacker: attackerState.derived.maxHp,
      defender: defenderState.derived.maxHp,
    },
  };
}

module.exports = {
  DAILY_BATTLE_LIMIT,
  LEVEL_UP_EXPERIENCE,
  MAX_BATTLE_ACTIONS,
  createSimulatedBattle,
  finalizeRounds,
  formatBattleResponse,
  normalizeProgression,
  resolveParticipantById,
  SYSTEM_OPPONENTS,
  validateBattleRequest,
};
