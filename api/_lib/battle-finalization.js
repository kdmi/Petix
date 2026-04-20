const {
  BATTLE_REWARD_STATUS,
  applyProgressionToCharacterRecord,
  createBattleFinalizationState,
  getBattleRewardStatus,
} = require("./battle");
const { createPassiveBattleNotification } = require("./notification");
const {
  getWalletBattleRewardLedgerEntry,
  recordWalletBattleReward,
  updateWalletProfile,
} = require("./store");
const {
  getBattleRecord,
  listFinalizableBattleRecordsForWallet,
  updateBattleRecord,
} = require("./battle-store");

function buildRewardAttemptResultLabel(results) {
  if (results.some((result) => result?.status === "applied")) {
    return results.some((result) => result?.status === "already_applied")
      ? "reconciled"
      : "applied";
  }

  if (results.some((result) => result?.status === "already_applied")) {
    return "already_applied";
  }

  return "no_changes";
}

function buildFailedAttemptResult(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").trim();

  if (code) {
    return `failed:${code}`;
  }

  if (message) {
    return `failed:${message.slice(0, 120)}`;
  }

  return "failed:unknown";
}

function resolveAppliedAt(record, rewardKind, fallback) {
  if (rewardKind === "attacker") {
    return record?.finalizationState?.attackerAppliedAt || fallback || null;
  }

  if (rewardKind === "defender") {
    return record?.finalizationState?.defenderAppliedAt || fallback || null;
  }

  return fallback || null;
}

async function applyRewardTransitionToWallet({ battleId, transition }) {
  const normalizedBattleId = String(battleId || "").trim();
  if (!normalizedBattleId || !transition?.wallet || !transition?.petId) {
    return {
      status: "skipped",
      appliedAt: null,
      rewardKind: String(transition?.rewardKind || "").trim() || null,
    };
  }

  const rewardKind = String(transition.rewardKind || "").trim();
  const now = new Date().toISOString();
  let result = {
    status: "skipped",
    appliedAt: null,
    rewardKind,
  };

  await updateWalletProfile(transition.wallet, async (current) => {
    const ledgerEntry = getWalletBattleRewardLedgerEntry(current, normalizedBattleId);
    const existingReward = ledgerEntry?.rewards?.[rewardKind];

    if (existingReward) {
      result = {
        status: "already_applied",
        appliedAt: existingReward.appliedAt || ledgerEntry?.appliedAt || now,
        rewardKind,
      };
      return current;
    }

    let characterFound = false;
    const characters = current.characters.map((character) => {
      if (String(character.id || "") !== String(transition.petId || "")) {
        return character;
      }

      characterFound = true;
      return applyProgressionToCharacterRecord(character, transition.progressionState, now);
    });

    if (!characterFound) {
      const error = new Error("Battle participant was not found during reward finalization.");
      error.code = "BATTLE_REWARD_CHARACTER_NOT_FOUND";
      throw error;
    }

    result = {
      status: "applied",
      appliedAt: now,
      rewardKind,
    };

    return recordWalletBattleReward(
      {
        ...current,
        characters,
      },
      normalizedBattleId,
      {
        rewardKind,
        petId: transition.petId,
        appliedAt: now,
      }
    );
  });

  return result;
}

async function finalizeBattleRewardsForRecord(record) {
  if (!record?.id || record.status !== "ready") {
    return record;
  }

  if (getBattleRewardStatus(record) === BATTLE_REWARD_STATUS.APPLIED) {
    return record;
  }

  const battleId = String(record.id || "").trim();
  const lastAttemptAt = new Date().toISOString();
  const attackerTransition = record.rewardTransitions?.attacker || null;
  const defenderTransition = record.rewardTransitions?.defender || null;

  await updateBattleRecord(battleId, (current) => {
    if (!current) {
      return null;
    }

    return {
      ...current,
      finalizationState: createBattleFinalizationState({
        ...current.finalizationState,
        rewardStatus: BATTLE_REWARD_STATUS.PENDING,
        lastAttemptAt,
        lastAttemptResult: "in_progress",
      }),
    };
  });

  try {
    const attackerResult = await applyRewardTransitionToWallet({
      battleId,
      transition: attackerTransition,
    });
    const defenderResult = await applyRewardTransitionToWallet({
      battleId,
      transition: defenderTransition,
    });
    const attemptResult = buildRewardAttemptResultLabel([attackerResult, defenderResult]);

    const nextRecord = await updateBattleRecord(battleId, (current) => {
      if (!current) {
        return null;
      }

      return {
        ...current,
        failureStage: null,
        finalizationState: createBattleFinalizationState({
          ...current.finalizationState,
          rewardStatus: BATTLE_REWARD_STATUS.APPLIED,
          attackerAppliedAt: resolveAppliedAt(
            current,
            "attacker",
            attackerResult.appliedAt
          ),
          defenderAppliedAt: resolveAppliedAt(
            current,
            "defender",
            defenderResult.appliedAt
          ),
          lastAttemptAt,
          lastAttemptResult: attemptResult,
        }),
      };
    });

    if (defenderResult.status === "applied") {
      await createPassiveBattleNotification({
        wallet: defenderTransition?.wallet,
        petId: defenderTransition?.petId,
        petName:
          nextRecord?.defenderSnapshot?.name ||
          nextRecord?.defenderSnapshot?.displayName ||
          nextRecord?.defenderSnapshot?.type ||
          "Pet",
        battleId,
        xpGained: nextRecord?.result?.defenderRewards?.xpGained || 0,
        levelUp: Boolean(nextRecord?.result?.defenderRewards?.levelUp),
        newLevel: nextRecord?.result?.defenderRewards?.newLevel,
      }).catch(() => null);
    }

    return nextRecord;
  } catch (error) {
    await updateBattleRecord(battleId, (current) => {
      if (!current) {
        return null;
      }

      return {
        ...current,
        failureStage: current.failureStage || "reward_finalization",
        finalizationState: createBattleFinalizationState({
          ...current.finalizationState,
          rewardStatus: BATTLE_REWARD_STATUS.PENDING,
          lastAttemptAt,
          lastAttemptResult: buildFailedAttemptResult(error),
        }),
      };
    }).catch(() => null);

    return getBattleRecord(battleId, { fresh: true });
  }
}

async function reconcileBattleFinalization(battleId) {
  const record = await getBattleRecord(battleId, { fresh: true });
  if (!record || record.status !== "ready") {
    return record;
  }

  if (getBattleRewardStatus(record) === BATTLE_REWARD_STATUS.APPLIED) {
    return record;
  }

  return finalizeBattleRewardsForRecord(record);
}

async function reconcileWalletBattleFinalization(wallet) {
  const records = await listFinalizableBattleRecordsForWallet(wallet);
  const reconciled = [];

  for (const record of records) {
    const nextRecord = await finalizeBattleRewardsForRecord(record);
    if (nextRecord) {
      reconciled.push(nextRecord);
    }
  }

  return reconciled;
}

module.exports = {
  finalizeBattleRewardsForRecord,
  reconcileBattleFinalization,
  reconcileWalletBattleFinalization,
};
