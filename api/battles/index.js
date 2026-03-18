const crypto = require("crypto");
const {
  getSessionFromRequest,
  handleCors,
  json,
  parseJsonBody,
} = require("../_lib/auth");
const { generateBattleNarration } = require("../_lib/battle-narration");
const {
  createSimulatedBattle,
  validateBattleRequest,
} = require("../_lib/battle");
const { createPassiveBattleNotification } = require("../_lib/notification");
const {
  listBattleRecords,
  saveBattleRecord,
} = require("../_lib/battle-store");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const attackerPetId = String(body.attackerPetId || "").trim();
    const defenderPetId = String(body.defenderPetId || "").trim();
    const existingBattles = await listBattleRecords();
    const { attacker, defender } = await validateBattleRequest({
      attackerPetId,
      defenderPetId,
      attackerWallet: session.wallet,
      existingBattles,
    });

    const battleId = `battle_${crypto.randomUUID()}`;
    await saveBattleRecord({
      id: battleId,
      status: "generating",
      attackerPetId,
      defenderPetId,
      attackerOwnerWallet: attacker.wallet,
      defenderOwnerWallet: defender.wallet,
      battleType: "pvp_random",
      createdAt: new Date().toISOString(),
      rounds: [],
      result: null,
      narrationMode: "template",
    });

    const battle = await createSimulatedBattle({
      battleId,
      attackerParticipant: attacker,
      defenderParticipant: defender,
    });
    const narration = await generateBattleNarration(battle);
    const persistedBattle = {
      ...battle,
      narrationMode: narration.narrationMode || "template",
      rounds: narration.rounds,
      result: {
        ...battle.result,
        finalSummaryText: narration.finalSummaryText,
      },
    };

    await saveBattleRecord(persistedBattle);

    if (
      defender.wallet &&
      defender.wallet !== "system" &&
      persistedBattle.result?.defenderRewards?.passiveParticipationXp
    ) {
      await createPassiveBattleNotification({
        wallet: defender.wallet,
        petId: defender.character.id,
        petName: defender.character.name || defender.character.displayName || defender.character.creatureType || "Pet",
        battleId,
        xpGained: persistedBattle.result.defenderRewards.xpGained,
        levelUp: Boolean(persistedBattle.result.defenderRewards.levelUp),
        newLevel: persistedBattle.result.defenderRewards.newLevel,
      });
    }

    json(res, 200, {
      battleId,
      status: "generating",
    });
  } catch (error) {
    if (error?.code === "DAILY_BATTLE_LIMIT_REACHED") {
      json(res, 400, {
        error: "DAILY_BATTLE_LIMIT_REACHED",
        message: error.message || "You have used all battles for today.",
      });
      return;
    }

    json(res, 400, {
      error: error.message || "Bad request.",
    });
  }
};
