const crypto = require("crypto");
const {
  getSessionFromRequest,
  handleCors,
  json,
  parseJsonBody,
} = require("../_lib/auth");
const {
  applyFallbackNarration,
  generateBattleNarrationWithBudget,
} = require("../_lib/battle-narration");
const {
  buildBattleRevealBundle,
  buildBattleParticipant,
  buildReadyBattleRecord,
  buildGeneratingBattleRecord,
  createBattleFinalizationState,
  createBattleSimulation,
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
const {
  reconcileBattleFinalization,
  reconcileWalletBattleFinalization,
} = require("../_lib/battle-finalization");
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

async function restoreWalletProfile(wallet, profile) {
  if (!wallet || !profile) {
    return;
  }

  await saveWalletProfile(wallet, profile);
}

function getRequestUrl(req) {
  return new URL(req.url, `http://${req.headers.host || "localhost"}`);
}

async function markBattleFailed(battleId, error, failureStage = "battle_generation") {
  if (!battleId) {
    return;
  }

  await updateBattleRecord(battleId, (current) => {
    if (!current) {
      return null;
    }

    return {
      ...current,
      status: "failed",
      completedAt: new Date().toISOString(),
      error: error?.code || "BATTLE_GENERATION_FAILED",
      rounds: [],
      result: null,
      narrationMode: null,
      failureStage,
      finalizationState: createBattleFinalizationState({
        rewardStatus: "not_applied",
        lastAttemptAt: new Date().toISOString(),
        lastAttemptResult: error?.code || "BATTLE_GENERATION_FAILED",
      }),
      rewardTransitions: {
        attacker: null,
        defender: null,
      },
    };
  }).catch(() => null);
}

async function reserveAttackerBattleEnergy(wallet) {
  let previousProfile = null;

  await updateWalletProfile(wallet, async (current) => {
    previousProfile = current;
    const nextBattleState = consumeBattleEnergy(current.battleState, { wallet });

    return {
      ...current,
      battleState: nextBattleState,
    };
  });

  return previousProfile;
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
    await reconcileWalletBattleFinalization(session.wallet).catch(() => null);
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
  let attacker = null;
  let defender = null;
  let readyBattlePersisted = false;
  let failureStage = "request_validation";

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
    const generatingRecord = buildGeneratingBattleRecord(simulation.battle);

    failureStage = "energy_reservation";
    attackerPreviousProfile = await reserveAttackerBattleEnergy(attacker.wallet);

    failureStage = "attempt_persistence";
    await saveBattleRecord(generatingRecord);

    failureStage = "narration";
    const narration = await generateBattleNarrationWithBudget(simulation.battle, {
      timeoutMs: Number(process.env.BATTLE_NARRATION_BUDGET_MS) || 4000,
    }).catch(() => applyFallbackNarration(simulation.battle));
    const readyBattle = buildReadyBattleRecord({
      battle: simulation.battle,
      progression: simulation.progression,
      narration,
    });

    failureStage = "ready_persistence";
    await saveBattleRecord(readyBattle);
    readyBattlePersisted = true;

    failureStage = "reward_finalization";
    await reconcileBattleFinalization(battleId).catch(() => null);

    json(res, 200, {
      battleId,
      status: "generating",
      recovery: {
        statusUrl: `/api/battles/${encodeURIComponent(battleId)}`,
        historyVisible: false,
        message:
          "Battle is still preparing. Keep this battle id for recovery until the result becomes ready.",
      },
      reveal,
    });
  } catch (error) {
    if (!readyBattlePersisted && attackerPreviousProfile && attacker?.wallet) {
      await restoreWalletProfile(attacker.wallet, attackerPreviousProfile).catch(() => null);
    }

    if (battleId && !readyBattlePersisted) {
      await markBattleFailed(battleId, error, failureStage);
    } else if (battleId && readyBattlePersisted) {
      await updateBattleRecord(battleId, (current) => {
        if (!current) {
          return null;
        }

        return {
          ...current,
          failureStage: current.failureStage || failureStage || "reward_finalization",
          finalizationState: createBattleFinalizationState({
            ...current.finalizationState,
            rewardStatus: current.finalizationState?.rewardStatus || "pending",
            lastAttemptAt: new Date().toISOString(),
            lastAttemptResult: error?.code || error?.message || "reward_finalization_failed",
          }),
        };
      }).catch(() => null);
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

    const attackerProfile = await getWalletProfile(session.wallet, { fresh: true }).catch(() => null);
    const hasNoEnergy = attackerProfile?.battleState?.energyCurrent === 0;

    json(res, 400, {
      error: hasNoEnergy ? "DAILY_BATTLE_LIMIT_REACHED" : error.message || "Bad request.",
      message: error.message || "Bad request.",
    });
  }
};
