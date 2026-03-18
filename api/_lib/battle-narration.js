const GEMINI_TEXT_TIMEOUT_MS = 20000;

const SYSTEM_PROMPT = [
  "You are writing battle narration for a fantasy-comedy AI pet battleground game.",
  "",
  "Your job is to convert structured combat events into short, vivid, DnD-like narration.",
  "",
  "Rules:",
  "- Never change battle outcome.",
  "- Never change damage numbers, hit/miss/crit result, or who used an ability.",
  "- Never invent extra turns or extra effects.",
  "- Use each fighter's traits, profession style, element, and item as flavor when relevant.",
  "- Keep each round narration to 2-3 sentences max.",
  "- Tone should feel dramatic, playful, and readable.",
  "- Return valid JSON only.",
  "",
  'Return format: {"rounds":[{"roundNumber":1,"narrationText":"..."}],"finalSummaryText":"..."}',
].join("\n");

function buildFallbackNarration(event, actor, target) {
  if (!event || !actor || !target) {
    return "The clash unfolds in a blur of dust and sparks.";
  }

  if (event.meta?.skipReason === "stun") {
    return `${actor.name} reels from the stun and cannot answer the attack this turn.`;
  }

  if (event.actionType === "ability" && event.statusApplied?.type === "shield") {
    return `${actor.name} braces behind ${event.abilityName}, raising a shield before ${target.name} can break through.`;
  }

  if (event.actionType === "ability" && event.statusApplied?.type === "stun") {
    return `${actor.name} unleashes ${event.abilityName}, cracking into ${target.name} for ${event.damage} damage and leaving them stunned.`;
  }

  if (event.actionType === "ability") {
    return `${actor.name} uses ${event.abilityName} and hits ${target.name} for ${event.damage} damage.`;
  }

  if (event.hitResult === "dodge") {
    return `${actor.name} strikes fast, but ${target.name} slips away at the last second.`;
  }

  if (event.hitResult === "miss") {
    return `${actor.name} lunges forward, but the attack misses cleanly.`;
  }

  if (event.hitResult === "crit") {
    return `${actor.name} lands a critical hit on ${target.name}, dealing ${event.damage} damage.`;
  }

  return `${actor.name} hits ${target.name} for ${event.damage} damage.`;
}

function buildFallbackFinalSummary(battle) {
  const winner =
    battle?.attackerSnapshot?.id === battle?.result?.winnerPetId
      ? battle.attackerSnapshot
      : battle?.defenderSnapshot;
  const loser =
    battle?.attackerSnapshot?.id === battle?.result?.loserPetId
      ? battle.attackerSnapshot
      : battle?.defenderSnapshot;

  if (!winner || !loser) {
    return "The battle ends with one fighter standing.";
  }

  return `${winner.name} outlasted ${loser.name} after a short but intense clash.`;
}

function applyFallbackNarration(battle) {
  const rounds = Array.isArray(battle?.rounds) ? battle.rounds : [];
  const snapshots = new Map(
    [battle?.attackerSnapshot, battle?.defenderSnapshot].filter(Boolean).map((snapshot) => [
      snapshot.id,
      snapshot,
    ])
  );

  return {
    rounds: rounds.map((round) => {
      const actor = snapshots.get(round.actorPetId);
      const target = snapshots.get(round.targetPetId);
      const nextRound = {
        ...round,
        narrationText: buildFallbackNarration(round, actor, target),
      };
      delete nextRound.meta;
      return nextRound;
    }),
    finalSummaryText: buildFallbackFinalSummary(battle),
    narrationMode: "template",
  };
}

function canUseAiNarration() {
  if (String(process.env.DISABLE_BATTLE_AI || "").trim().toLowerCase() === "true") {
    return false;
  }

  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
}

async function fetchWithTimeout(url, options, timeoutMs, label) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`${label} timed out after ${timeoutMs}ms.`));
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${label} timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sanitizeForPrompt(snapshot) {
  if (!snapshot) return null;

  return {
    name: snapshot.name,
    type: snapshot.type,
    element: snapshot.traits?.element || "",
    professionStyle: snapshot.traits?.professionStyle || "",
    topItem: snapshot.traits?.topItem || "",
    selectedPower: {
      name: snapshot.selectedPower?.name || "",
      description: snapshot.selectedPower?.description || "",
    },
  };
}

function buildEventsForPrompt(battle) {
  return (battle?.rounds || []).map((round) => ({
    roundNumber: round.roundNumber,
    actor: round.actorPetId === battle.attackerSnapshot.id ? battle.attackerSnapshot.name : battle.defenderSnapshot.name,
    target: round.targetPetId === battle.attackerSnapshot.id ? battle.attackerSnapshot.name : battle.defenderSnapshot.name,
    actionType: round.actionType,
    hitResult: round.hitResult,
    damage: round.damage,
    abilityUsed: Boolean(round.abilityUsed),
    abilityName: round.abilityName || "",
    statusApplied: round.statusApplied || null,
    skipReason: round.meta?.skipReason || null,
  }));
}

function buildUserPrompt(battle) {
  return [
    "Write battle narration for the following combat log.",
    "",
    `Fighter A:\n${JSON.stringify(sanitizeForPrompt(battle.attackerSnapshot), null, 2)}`,
    "",
    `Fighter B:\n${JSON.stringify(sanitizeForPrompt(battle.defenderSnapshot), null, 2)}`,
    "",
    `Combat events:\n${JSON.stringify(buildEventsForPrompt(battle), null, 2)}`,
    "",
    "Requirements:",
    "- Do not modify any numeric values or results.",
    "- If hitResult is miss or dodge, make that explicit in the text.",
    "- If abilityUsed is true, mention the ability by name.",
    "- Make the narration feel like a DnD combat recap.",
    "- Keep each round concise and visually descriptive.",
    "- Return JSON only.",
  ].join("\n");
}

function extractJsonText(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return "";

  const withoutFence = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (withoutFence.startsWith("{") && withoutFence.endsWith("}")) {
    return withoutFence;
  }

  const objectMatch = withoutFence.match(/\{[\s\S]*\}/);
  return objectMatch ? objectMatch[0] : withoutFence;
}

async function requestAiNarration(battle) {
  if (!canUseAiNarration()) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: buildUserPrompt(battle) }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
        },
      }),
    },
    GEMINI_TEXT_TIMEOUT_MS,
    "Battle narration request"
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `Battle narration request failed with ${response.status}.`
    );
  }

  const text = (payload?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || "")
    .join("\n")
    .trim();

  return text || null;
}

function parseAiNarrationResponse(rawText, battle) {
  const fallback = applyFallbackNarration(battle);
  const jsonText = extractJsonText(rawText);

  if (!jsonText) {
    return fallback;
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return fallback;
  }

  const roundsByNumber = new Map();
  if (Array.isArray(parsed?.rounds)) {
    parsed.rounds.forEach((round) => {
      const roundNumber = Number(round?.roundNumber);
      const narrationText = String(round?.narrationText || "").trim();

      if (!Number.isInteger(roundNumber) || !narrationText) {
        return;
      }

      roundsByNumber.set(roundNumber, narrationText);
    });
  }

  let aiRoundsUsed = 0;
  const rounds = fallback.rounds.map((round) => {
    const aiNarration = roundsByNumber.get(round.roundNumber);
    if (!aiNarration) {
      return round;
    }

    aiRoundsUsed += 1;
    return {
      ...round,
      narrationText: aiNarration,
    };
  });

  if (!aiRoundsUsed) {
    return fallback;
  }

  return {
    rounds,
    finalSummaryText: String(parsed?.finalSummaryText || "").trim() || fallback.finalSummaryText,
    narrationMode: "ai",
  };
}

async function generateBattleNarration(battle) {
  const fallback = applyFallbackNarration(battle);

  try {
    const aiText = await requestAiNarration(battle);
    if (!aiText) {
      return fallback;
    }

    return parseAiNarrationResponse(aiText, battle);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[battle:narration]", error.message);
    }
    return fallback;
  }
}

module.exports = {
  applyFallbackNarration,
  buildFallbackNarration,
  buildFallbackFinalSummary,
  generateBattleNarration,
};
