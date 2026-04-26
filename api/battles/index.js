const crypto = require("crypto");
const {
  getSessionFromRequest,
  handleCors,
  json,
  parseJsonBody,
} = require("../_lib/auth");
const { generateBattleNarration } = require("../_lib/battle-narration");
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
} = require("../_lib/battle-energy");
const {
  buildRevealOpponentCandidates,
  selectAuthoritativeOpponent,
} = require("../_lib/battle-matchmaking");
const { buildPassiveBattleNotification } = require("../_lib/notification");
const {
  getWalletProfile,
  listAllCharacters,
  saveWalletProfile,
  updateWalletProfile,
} = require("../_lib/store");
const {
  listBattleHistoryForWallet,
  saveBattleRecord,
  updateBattleRecord,
} = require("../_lib/battle-store");
const { computeCoinReward, creditCurrency } = require("../_lib/currency");

async function restoreWalletProfile(wallet, profile) {
  if (!wallet || !profile) {
    return;
  }

  await saveWalletProfile(wallet, profile);
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
  progressionState,
  coinReward = 0,
}) {
  let previousProfile = null;
  let updatedCurrency = null;
  const now = new Date().toISOString();

  await updateWalletProfile(wallet, async (current) => {
    previousProfile = current;
    const nextBattleState = consumeBattleEnergy(current.battleState, { wallet });
    let characterFound = false;

    const characters = current.characters.map((character) => {
      if (character.id !== petId) {
        return character;
      }

      characterFound = true;
      return applyProgressionToCharacterRecord(character, progressionState, now);
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

  return { previousProfile, updatedCurrency };
}

async function applyDefenderBattleMutation({
  wallet,
  petId,
  progressionState,
  coinReward = 0,
  notification = null,
}) {
  let previousProfile = null;
  const now = new Date().toISOString();

  await updateWalletProfile(wallet, async (current) => {
    previousProfile = current;
    let characterFound = false;

    const characters = current.characters.map((character) => {
      if (character.id !== petId) {
        return character;
      }

      characterFound = true;
      return applyProgressionToCharacterRecord(character, progressionState, now);
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

  return previousProfile;
}

function resolveWinnerCoinReward({ simulation, attacker, defender }) {
  const winnerPetId = simulation?.battle?.result?.winnerPetId || null;
  if (!winnerPetId) {
    return { amount: 0, winnerRole: null };
  }

  if (winnerPetId === attacker?.character?.id) {
    const level = Number(attacker.character?.level) || 1;
    return { amount: computeCoinReward(level), winnerRole: "attacker" };
  }

  if (winnerPetId === defender?.character?.id) {
    const level = Number(defender.character?.level) || 1;
    return { amount: computeCoinReward(level), winnerRole: "defender" };
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
  let attackerPreviousProfile = null;
  let defenderPreviousProfile = null;
  let attacker = null;
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
    assertBattleEnergyAvailable(attackerProfile.battleState, { wallet: attacker.wallet });

    const characters = await listAllCharacters();
    const { opponent, matchmaking } = selectAuthoritativeOpponent({
      attacker,
      candidates: characters,
    });
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

    defender = buildBattleParticipant(opponent);
    battleId = `battle_${crypto.randomUUID()}`;

    const simulation = createBattleSimulation({
      battleId,
      attackerParticipant: attacker,
      defenderParticipant: defender,
      matchmaking,
    });
    const { amount: coinReward, winnerRole } = resolveWinnerCoinReward({
      simulation,
      attacker,
      defender,
    });

    const attackerMutation = await applyAttackerBattleMutation({
      wallet: attacker.wallet,
      petId: attacker.character.id,
      progressionState: simulation.progression.attacker,
      coinReward: winnerRole === "attacker" ? coinReward : 0,
    });
    attackerPreviousProfile = attackerMutation.previousProfile;
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

    defenderPreviousProfile = await applyDefenderBattleMutation({
      wallet: defender.wallet,
      petId: defender.character.id,
      progressionState: simulation.progression.defender,
      coinReward: winnerRole === "defender" ? coinReward : 0,
      notification: passiveNotification,
    });

    const narration = await generateBattleNarration(simulation.battle);
    const readyBattle = {
      ...simulation.battle,
      narrationMode: narration.narrationMode || "template",
      rounds: narration.rounds,
      result: {
        ...simulation.battle.result,
        finalSummaryText: narration.finalSummaryText,
      },
      coinReward,
    };

    await saveBattleRecord(readyBattle);

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
    });
  } catch (error) {
    if (defenderPreviousProfile && defender?.wallet) {
      await restoreWalletProfile(defender.wallet, defenderPreviousProfile).catch(() => null);
    }

    if (attackerPreviousProfile && attacker?.wallet) {
      await restoreWalletProfile(attacker.wallet, attackerPreviousProfile).catch(() => null);
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
module.exports.resolveWinnerCoinReward = resolveWinnerCoinReward;
module.exports.restoreWalletProfile = restoreWalletProfile;
