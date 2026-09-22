const crypto = require("crypto");
const {
  getSessionFromRequest,
  handleCors,
  json,
  parseJsonBody,
} = require("../_lib/auth");
const { generateBattleNarration } = require("../_lib/battle-narration");
const { refreshBoundCharacterMetadata, getWalletCapsuleBonus } = require("../_lib/nft");
const {
  applyProgressionToCharacterRecord,
  buildBattleRevealBundle,
  buildBattleParticipant,
  buildGeneratingBattleRecord,
  createBattleSimulation,
  formatBattleResponse,
  resolveAttackerParticipant,
} = require("../_lib/battle");
const {
  assertBattleEnergyAvailable,
  consumeBattleEnergy,
  refundBattleEnergy,
} = require("../_lib/battle-energy");
const { applyBattleXpReward, revertBattleXpReward } = require("../_lib/battle-progression");
const { serializeBattleState } = require("../_lib/character");
const {
  buildRevealOpponentCandidates,
  selectAuthoritativeOpponent,
} = require("../_lib/battle-matchmaking");
const { buildPassiveBattleNotification } = require("../_lib/notification");
const { getWalletProfile, updateWalletProfile } = require("../_lib/store");
const { getRoster } = require("../_lib/roster");
const {
  listBattleHistoryForWallet,
  saveBattleRecord,
  updateBattleRecord,
} = require("../_lib/battle-store");
const { computeCoinReward, creditCurrency, normalizeCurrency } = require("../_lib/currency");
const { getEconomyConfig } = require("../_lib/economy-config");

// How many times a stale roster pick may be discarded before giving up: the
// index can name a pet that was burned or transferred since the last sync.
const OPPONENT_RESOLVE_ATTEMPTS = 3;

// Undoing a failed battle used to mean writing the whole pre-battle profile
// back over whatever was there. That is an absolute write from a stale base:
// an energy pack bought, Points earned or a deposit credited while the battle
// was running would be silently erased. The two helpers below take back
// exactly what the battle gave, as a delta against the profile as it is now.
async function compensateAttackerBattleMutation({
  wallet,
  petId,
  appliedReward,
  coinReward = 0,
  bonusEnergy = 0,
}) {
  await updateWalletProfile(wallet, (current) => {
    current.battleState = refundBattleEnergy(current.battleState, { wallet, bonusEnergy });
    revertCharacterProgression(current, petId, appliedReward);
    revertCoinReward(current, coinReward);
    return current;
  });
}

async function compensateDefenderBattleMutation({
  wallet,
  petId,
  appliedReward,
  coinReward = 0,
  notificationId = "",
}) {
  await updateWalletProfile(wallet, (current) => {
    revertCharacterProgression(current, petId, appliedReward);
    revertCoinReward(current, coinReward);

    if (notificationId && Array.isArray(current.notifications)) {
      // The fight never happened; a notification about it would only confuse.
      current.notifications = current.notifications.filter(
        (record) => record?.id !== notificationId
      );
    }

    return current;
  });
}

function revertCharacterProgression(profile, petId, appliedReward) {
  if (!appliedReward || !petId) return;

  const index = (profile.characters || []).findIndex((record) => record.id === petId);
  if (index < 0) return;

  const record = profile.characters[index];
  const reverted = revertBattleXpReward(record, {
    xpGained: appliedReward.xpGained,
    attributePointsGained: appliedReward.attributePointsGained,
  });

  profile.characters[index] = {
    ...record,
    level: reverted.level,
    experience: reverted.experience,
    attributePointsAvailable: reverted.attributePointsAvailable,
    updatedAt: new Date().toISOString(),
  };
}

function revertCoinReward(profile, coinReward) {
  const amount = Math.max(0, Math.floor(Number(coinReward) || 0));
  if (!amount) return;

  const currency = normalizeCurrency(profile.currency);
  const taken = Math.min(amount, currency.balance);
  profile.currency = {
    balance: currency.balance - taken,
    // The reward never happened, so it must leave the emission total too.
    totalEarned: Math.max(0, currency.totalEarned - amount),
  };
}

function getRequestUrl(req) {
  return new URL(req.url, `http://${req.headers.host || "localhost"}`);
}

async function markBattleFailed(battleId, error, baseRecord = null) {
  if (!battleId) {
    return;
  }

  await updateBattleRecord(battleId, (current) => {
    const source = current || baseRecord;
    const completedAt = new Date().toISOString();
    const errorCode = error?.code || "BATTLE_GENERATION_FAILED";

    if (!source) {
      return {
        id: battleId,
        status: "failed",
        battleType: "pvp_random",
        createdAt: completedAt,
        completedAt,
        attackerPetId: null,
        defenderPetId: null,
        attackerOwnerWallet: null,
        defenderOwnerWallet: null,
        rounds: [],
        result: null,
        narrationMode: null,
        error: errorCode,
      };
    }

    return {
      ...source,
      id: battleId,
      status: "failed",
      completedAt,
      error: errorCode,
      rounds: [],
      result: null,
      narrationMode: null,
    };
  }).catch(() => null);
}

async function applyAttackerBattleMutation({
  wallet,
  petId,
  xpGained,
  coinReward = 0,
  bonusEnergy = 0,
}) {
  let previousProfile = null;
  let updatedCurrency = null;
  let appliedReward = null;
  let updatedBattleState = null;
  const now = new Date().toISOString();

  await updateWalletProfile(wallet, async (current) => {
    previousProfile = current;
    const nextBattleState = consumeBattleEnergy(current.battleState, { wallet, bonusEnergy });
    updatedBattleState = nextBattleState;
    let characterFound = false;

    const characters = current.characters.map((character) => {
      if (character.id !== petId) {
        return character;
      }

      characterFound = true;
      // XP is applied as a delta to the record as it is RIGHT NOW, never as the
      // absolute state computed before the fight: a point the player spent
      // meanwhile would otherwise come back and could be spent again (the free
      // stats players found on 2026-09-21).
      appliedReward = applyBattleXpReward(character, xpGained);
      return applyProgressionToCharacterRecord(character, appliedReward.nextState, now);
    });

    if (!characterFound) {
      throw new Error("Attacker pet was not found.");
    }

    const next = {
      ...current,
      battleState: nextBattleState,
      characters,
    };

    if (coinReward > 0) {
      creditCurrency(next, coinReward);
    }

    updatedCurrency = next.currency
      ? { balance: next.currency.balance, totalEarned: next.currency.totalEarned }
      : null;

    return next;
  });

  return { previousProfile, updatedCurrency, appliedReward, updatedBattleState };
}

async function applyDefenderBattleMutation({
  wallet,
  petId,
  xpGained,
  coinReward = 0,
  notification = null,
}) {
  let previousProfile = null;
  let appliedReward = null;
  const now = new Date().toISOString();

  await updateWalletProfile(wallet, async (current) => {
    previousProfile = current;
    let characterFound = false;

    const characters = current.characters.map((character) => {
      if (character.id !== petId) {
        return character;
      }

      characterFound = true;
      // Same delta rule as the attacker: the defender may be spending points
      // on their own screen while this fight is being written.
      appliedReward = applyBattleXpReward(character, xpGained);
      return applyProgressionToCharacterRecord(character, appliedReward.nextState, now);
    });

    if (!characterFound) {
      throw new Error("Defender pet was not found.");
    }

    const next = {
      ...current,
      characters,
    };

    if (coinReward > 0) {
      creditCurrency(next, coinReward);
    }

    if (notification) {
      next.notifications = [notification, ...(current.notifications || [])].slice(0, 100);
    }

    return next;
  });

  return { previousProfile, appliedReward };
}

// The public reward block of a battle, filled from the progression that was
// actually applied to the record.
function buildAppliedRewardFields(applied) {
  return {
    xpGained: applied.xpGained,
    levelUp: applied.levelUp,
    newLevel: applied.newLevel,
    newExperience: applied.newExperience,
    xpForNextLevel: applied.xpForNextLevel,
    attributePointsGained: applied.attributePointsGained,
    newAttributePointsAvailable: applied.newAttributePointsAvailable,
  };
}

function resolveWinnerCoinReward({ simulation, attacker, defender, config, winBonusPct = {} }) {
  const winnerPetId = simulation?.battle?.result?.winnerPetId || null;
  if (!winnerPetId) {
    return { amount: 0, winnerRole: null };
  }

  // Reward base/level-multiplier come from the runtime-tunable economy config (feature 013).
  const rewardOptions = config
    ? { base: config.BATTLE_REWARD_BASE, levelMultiplier: config.BATTLE_LEVEL_K }
    : {};

  // Надбавка за редкость капсулы достаётся тому, кто выиграл (018). Без капсул
  // множитель равен единице и сумма не меняется.
  const withCapsuleBonus = (amount, role) => {
    const pct = Math.max(0, Number(winBonusPct[role]) || 0);
    return pct ? Math.round(amount * (1 + pct / 100)) : amount;
  };

  if (winnerPetId === attacker?.character?.id) {
    const level = Number(attacker.character?.level) || 1;
    const base = computeCoinReward(level, rewardOptions);
    return { amount: withCapsuleBonus(base, "attacker"), winnerRole: "attacker" };
  }

  if (winnerPetId === defender?.character?.id) {
    const level = Number(defender.character?.level) || 1;
    const base = computeCoinReward(level, rewardOptions);
    return { amount: withCapsuleBonus(base, "defender"), winnerRole: "defender" };
  }

  return { amount: 0, winnerRole: null };
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method === "GET") {
    const session = getSessionFromRequest(req);
    if (!session) {
      json(res, 401, { error: "Unauthorized.", message: "Connect wallet to view battle history." });
      return;
    }

    const requestUrl = getRequestUrl(req);
    const limit = requestUrl.searchParams.get("limit");
    const cursor = requestUrl.searchParams.get("cursor");
    const history = await listBattleHistoryForWallet(session.wallet, { limit, cursor });

    json(res, 200, history);
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed.", message: "Method not allowed." });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  let battleId = "";
  // What each side's write actually applied — the undo is built from this, not
  // from a snapshot of the whole profile.
  let attackerApplied = null;
  let defenderApplied = null;
  let attacker = null;
  let attackerCapsuleBonus = { extraBattles: 0, winBonusPct: 0 };
  let defender = null;

  try {
    const body = await parseJsonBody(req);
    const attackerPetId = String(body.attackerPetId || "").trim();

    if (!attackerPetId) {
      throw new Error("attackerPetId is required.");
    }

    attacker = await resolveAttackerParticipant({
      attackerPetId,
      attackerWallet: session.wallet,
    });
    const attackerProfile = await getWalletProfile(attacker.wallet);
    // Редкие капсулы поднимают дневной лимит боёв (018). Без капсул — ноль, и
    // проверка остаётся ровно прежней.
    attackerCapsuleBonus = await getWalletCapsuleBonus(attacker.wallet);
    assertBattleEnergyAvailable(attackerProfile.battleState, {
      wallet: attacker.wallet,
      bonusEnergy: attackerCapsuleBonus.extraBattles,
    });

    // Farm and Fight are independent (feature 013): farming no longer blocks battles.
    const economyConfig = await getEconomyConfig();
    // Roster index (023): compact candidates instead of every wallet profile.
    // The index may lag by up to a minute, so a pick whose pet is already gone
    // is dropped and the selection re-runs on the remaining candidates.
    let characters = await getRoster();
    let opponent = null;
    let matchmaking = null;
    let defenderCharacter = null;

    for (let attempt = 0; attempt < OPPONENT_RESOLVE_ATTEMPTS; attempt += 1) {
      const selection = selectAuthoritativeOpponent({ attacker, candidates: characters });
      const candidate = selection.opponent;

      // Authoritative record for the simulation comes from the owner's profile,
      // never from the index (spec 023, FR-003).
      const defenderProfile = await getWalletProfile(candidate.wallet);
      const record = (defenderProfile.characters || []).find(
        (entry) => entry.id === candidate.character.id
      );

      if (record) {
        opponent = candidate;
        matchmaking = selection.matchmaking;
        defenderCharacter = record;
        break;
      }

      characters = characters.filter((entry) => entry.character?.id !== candidate.character.id);
    }

    if (!opponent) {
      const staleError = new Error("No eligible opponent could be assembled.");
      staleError.code = "NO_ELIGIBLE_OPPONENT";
      throw staleError;
    }
    const reveal = buildBattleRevealBundle({
      selectedOpponent: opponent,
      carouselCandidates: buildRevealOpponentCandidates({
        attacker,
        candidates: characters,
        selectedOpponent: opponent,
        limit: 6,
      }),
      matchmaking,
    });

    if (!reveal?.selectedOpponent || !Array.isArray(reveal.carouselCandidates) || !reveal.carouselCandidates.length) {
      const revealError = new Error("Couldn't prepare a trustworthy rival reveal. Please retry.");
      revealError.code = "BATTLE_REVEAL_UNAVAILABLE";
      throw revealError;
    }

    defender = buildBattleParticipant({ wallet: opponent.wallet, character: defenderCharacter });
    battleId = `battle_${crypto.randomUUID()}`;

    const simulation = createBattleSimulation({
      battleId,
      attackerParticipant: attacker,
      defenderParticipant: defender,
      matchmaking,
    });
    const defenderCapsuleBonus = await getWalletCapsuleBonus(defender.wallet);
    const { amount: coinReward, winnerRole } = resolveWinnerCoinReward({
      simulation,
      attacker,
      defender,
      config: economyConfig,
      winBonusPct: {
        attacker: attackerCapsuleBonus.winBonusPct,
        defender: defenderCapsuleBonus.winBonusPct,
      },
    });

    const attackerMutation = await applyAttackerBattleMutation({
      bonusEnergy: attackerCapsuleBonus.extraBattles,
      wallet: attacker.wallet,
      petId: attacker.character.id,
      xpGained: simulation.battle.result?.attackerRewards?.xpGained || 0,
      coinReward: winnerRole === "attacker" ? coinReward : 0,
    });
    attackerApplied = {
      appliedReward: attackerMutation.appliedReward,
      coinReward: winnerRole === "attacker" ? coinReward : 0,
      bonusEnergy: attackerCapsuleBonus.extraBattles,
    };
    let attackerCurrency = attackerMutation.updatedCurrency;

    const passiveNotification = buildPassiveBattleNotification({
      wallet: defender.wallet,
      petId: defender.character.id,
      petName:
        defender.character.name ||
        defender.character.displayName ||
        defender.character.creatureType ||
        "Pet",
      battleId,
      xpGained: simulation.battle.result?.defenderRewards?.xpGained || 0,
      levelUp: Boolean(simulation.battle.result?.defenderRewards?.levelUp),
      newLevel: simulation.battle.result?.defenderRewards?.newLevel,
    });

    const defenderMutation = await applyDefenderBattleMutation({
      wallet: defender.wallet,
      petId: defender.character.id,
      xpGained: simulation.battle.result?.defenderRewards?.xpGained || 0,
      coinReward: winnerRole === "defender" ? coinReward : 0,
      notification: passiveNotification,
    });
    defenderApplied = {
      appliedReward: defenderMutation.appliedReward,
      coinReward: winnerRole === "defender" ? coinReward : 0,
      notificationId: passiveNotification?.id || "",
    };

    // Report what was actually written, not what the simulation predicted: the
    // two differ whenever the pet's progress moved between the fight and the
    // write (an upgrade spent, another battle landed).
    const mergeRewards = (predicted, applied) =>
      applied ? { ...predicted, ...buildAppliedRewardFields(applied) } : predicted;

    const narration = await generateBattleNarration(simulation.battle);
    const readyBattle = {
      ...simulation.battle,
      narrationMode: narration.narrationMode || "template",
      rounds: narration.rounds,
      result: {
        ...simulation.battle.result,
        attackerRewards: mergeRewards(
          simulation.battle.result?.attackerRewards,
          attackerMutation.appliedReward
        ),
        defenderRewards: mergeRewards(
          simulation.battle.result?.defenderRewards,
          defenderMutation.appliedReward
        ),
        finalSummaryText: narration.finalSummaryText,
      },
      coinReward,
    };

    await saveBattleRecord(readyBattle);

    // Уровень виден в трейтах NFT. Обновляем витрину только при левел-апе и
    // только после финализации боя (до этого возможен откат профилей).
    // Без await: маркетплейс не должен задерживать ответ игроку.
    if (simulation.battle.result?.attackerRewards?.levelUp) {
      void refreshBoundCharacterMetadata(attacker.character.id);
    }
    if (simulation.battle.result?.defenderRewards?.levelUp) {
      void refreshBoundCharacterMetadata(defender.character.id);
    }

    if (!attackerCurrency && attacker?.wallet) {
      const freshAttackerProfile = await getWalletProfile(attacker.wallet).catch(() => null);
      if (freshAttackerProfile?.currency) {
        attackerCurrency = {
          balance: freshAttackerProfile.currency.balance,
          totalEarned: freshAttackerProfile.currency.totalEarned,
        };
      }
    }

    json(res, 200, {
      battleId,
      status: "ready",
      reveal,
      battle: formatBattleResponse(readyBattle),
      coinReward: winnerRole === "attacker" ? coinReward : 0,
      currency: attackerCurrency || { balance: 0, totalEarned: 0 },
      // Without this the dashboard can only guess: it decremented its own
      // counter and had nothing to reconcile against until the next poll, so
      // players saw 0 fights left while the server still had some (2026-09-22).
      battleState: serializeBattleState(attackerMutation.updatedBattleState, {
        wallet: attacker.wallet,
        bonusEnergy: attackerCapsuleBonus.extraBattles,
      }),
    });
  } catch (error) {
    if (defenderApplied && defender?.wallet) {
      await compensateDefenderBattleMutation({
        wallet: defender.wallet,
        petId: defender.character?.id,
        ...defenderApplied,
      }).catch(() => null);
    }

    if (attackerApplied && attacker?.wallet) {
      await compensateAttackerBattleMutation({
        wallet: attacker.wallet,
        petId: attacker.character?.id,
        ...attackerApplied,
      }).catch(() => null);
    }

    if (battleId) {
      await markBattleFailed(battleId, error, {
        attackerPetId: attacker?.character?.id || null,
        defenderPetId: defender?.character?.id || null,
        attackerOwnerWallet: attacker?.wallet || null,
        defenderOwnerWallet: defender?.wallet || null,
      });
    }

    if (error?.code === "DAILY_BATTLE_LIMIT_REACHED") {
      json(res, 400, {
        error: "DAILY_BATTLE_LIMIT_REACHED",
        message: error.message || "You have used all battles for today.",
      });
      return;
    }

    if (error?.code === "NO_ELIGIBLE_OPPONENT") {
      json(res, 400, {
        error: "NO_ELIGIBLE_OPPONENT",
        message: error.message || "No eligible opponent could be assembled.",
      });
      return;
    }

    if (error?.code === "BATTLE_REVEAL_UNAVAILABLE") {
      json(res, 500, {
        error: "BATTLE_REVEAL_UNAVAILABLE",
        message: error.message || "Couldn't prepare a trustworthy rival reveal. Please retry.",
      });
      return;
    }

    if (error?.code === "BATTLE_SIMULATION_TIMEOUT") {
      json(res, 500, {
        error: "BATTLE_GENERATION_FAILED",
        message: "Battle generation failed. Please retry.",
      });
      return;
    }

    const attackerProfile =
      attacker?.wallet === session.wallet
        ? await getWalletProfile(session.wallet).catch(() => null)
        : null;
    const hasNoEnergy = attackerProfile?.battleState?.energyCurrent === 0;

    json(res, 400, {
      error: hasNoEnergy ? "DAILY_BATTLE_LIMIT_REACHED" : error.message || "Bad request.",
      message: error.message || "Bad request.",
    });
  }
};

module.exports.applyAttackerBattleMutation = applyAttackerBattleMutation;
module.exports.applyDefenderBattleMutation = applyDefenderBattleMutation;
module.exports.compensateAttackerBattleMutation = compensateAttackerBattleMutation;
module.exports.compensateDefenderBattleMutation = compensateDefenderBattleMutation;
module.exports.resolveWinnerCoinReward = resolveWinnerCoinReward;
