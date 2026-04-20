const GEMINI_TEXT_TIMEOUT_MS = 20000;
const DEFAULT_BATTLE_NARRATION_BUDGET_MS = 4000;

const SYSTEM_PROMPT = [
  "You write battle narration for a cartoony sci-fi pet battleground game.",
  "",
  "Write each resolved round like the next beat in a tiny fight story, not like UI copy or a combat log.",
  "",
  "Use plain American English.",
  "",
  "Tone:",
  "- playful",
  "- ironic",
  "- lightly chaotic",
  "- visual",
  "- story-like",
  "- readable",
  "",
  "Hard rules:",
  "- Never change who acts, who gets hit, whether a move is turned aside, whether a superpower is used, or whether a counter-response happens.",
  "- Never invent extra attacks, healing, buffs, debuffs, status effects, knockback, shields, stuns, burns, poison, or any other new gameplay result.",
  "- Keep each round to 1 or 2 short sentences.",
  "- Describe what happened like a scene, not like a system message.",
  "- Avoid raw damage numbers, HP values, dice rolls, percentages, and technical combat phrasing.",
  "- Avoid dry phrases like 'deals damage', 'no damage taken', 'critical hit', 'counterattack', or 'blocked' when a more natural story phrasing can do the job.",
  "- If a move is defended, make it feel like a clash, deflection, denial, or shut-down moment.",
  "- If a superpower is used, make that round feel special and center the action around the named superpower.",
  "- Vary sentence openings and rhythm so the rounds do not all sound the same.",
  "- Return valid JSON only.",
  "",
  "Bad example:",
  '- \"Gamma Arbiter strikes Florida Panda for 9 damage.\"',
  "",
  "Better direction:",
  '- \"Gamma Arbiter jumps first, clips Florida Panda before the guard settles, and leaves the whole lane buzzing from the impact.\"',
  "",
  'Return format: {"rounds":[{"roundNumber":1,"narrationText":"..."}],"finalSummaryText":"..."}',
].join("\n");

function sanitizeNarrationText(text, fallback) {
  const normalized = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join("\n")
    .trim();

  return normalized || fallback;
}

function buildFallbackNarration(event, actor, target) {
  if (!event || !actor || !target) {
    return "The arena erupts in noise, but the replay catches only sparks and confusion.";
  }

  const powerName = actor.selectedPower?.name || "the superpower";

  if (event.turnType === "counterattack") {
    return sanitizeNarrationText(
      `${actor.name} turns the whole exchange inside out, batting the pressure away and snapping back at ${target.name} before the dust can settle.`,
      `${actor.name} turns the defense into a sharp answer.`
    );
  }

  if (event.hitResult === "defended" && event.usedSuperpower) {
    return sanitizeNarrationText(
      `${actor.name} unleashes ${powerName}, but ${target.name} reads the whole spectacle perfectly and knocks the moment flat before it can bloom.`,
      `${target.name} shuts the superpower down cold.`
    );
  }

  if (event.hitResult === "defended") {
    return sanitizeNarrationText(
      `${actor.name} surges in with intent, but ${target.name} meets the swing head-on and sends it skidding harmlessly off course.`,
      `${target.name} turns the attack aside cleanly.`
    );
  }

  if (event.usedSuperpower) {
    return sanitizeNarrationText(
      `${actor.name} cracks the arena open with ${powerName}, turning one sharp opening into a full-on spectacle that crashes straight through ${target.name}.`,
      `${actor.name} makes the superpower round count.`
    );
  }

  if (event.usedCritical || event.hitResult === "critical") {
    return sanitizeNarrationText(
      `${actor.name} spots the opening a heartbeat early and drives through it with the nastiest shot of the exchange, leaving ${target.name} scrambling to recover.`,
      `${actor.name} finds the opening and makes it hurt.`
    );
  }

  return sanitizeNarrationText(
    `${actor.name} slips inside ${target.name}'s guard and lands a clean shot that jolts the whole exchange off balance.`,
    `${actor.name} lands a clean hit on ${target.name}.`
  );
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
    return "One pet survives the chaos and leaves the arena in one piece.";
  }

  return sanitizeNarrationText(
    `${winner.name} rides out the chaos, leaves ${loser.name} behind in the wreckage, and takes the arena with style.`,
    `${winner.name} walks away with the win.`
  );
}

function applyFallbackNarration(battle) {
  const rounds = Array.isArray(battle?.rounds) ? battle.rounds : [];
  const snapshots = new Map(
    [battle?.attackerSnapshot, battle?.defenderSnapshot]
      .filter(Boolean)
      .map((snapshot) => [snapshot.id, snapshot])
  );

  return {
    rounds: rounds.map((round) => {
      const actor = snapshots.get(round.actorPetId);
      const target = snapshots.get(round.targetPetId);

      return {
        ...round,
        narrationText: buildFallbackNarration(round, actor, target),
      };
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
    rarity: snapshot.rarity,
    element: snapshot.traits?.element || "",
    professionStyle: snapshot.traits?.professionStyle || "",
    topItem: snapshot.traits?.topItem || "",
    sideDetails: snapshot.traits?.sideDetails || "",
    facialFeatures: snapshot.traits?.facialFeatures || "",
    elementEffects: snapshot.traits?.elementEffects || "",
    selectedPower: {
      name: snapshot.selectedPower?.name || "",
      description: snapshot.selectedPower?.description || "",
    },
  };
}

function buildFighterPromptProfile(snapshot) {
  const profile = sanitizeForPrompt(snapshot);
  if (!profile) {
    return "Unknown fighter.";
  }

  const visualBits = [
    profile.type ? `${profile.type} fighter` : "",
    profile.rarity ? `rarity: ${profile.rarity}` : "",
    profile.element ? `theme: ${profile.element}` : "",
    profile.professionStyle ? `style: ${profile.professionStyle}` : "",
    profile.topItem ? `signature item: ${profile.topItem}` : "",
    profile.sideDetails ? `extra details: ${profile.sideDetails}` : "",
    profile.facialFeatures ? `face: ${profile.facialFeatures}` : "",
    profile.elementEffects ? `visual effects: ${profile.elementEffects}` : "",
  ].filter(Boolean);

  return [
    `Name: ${profile.name}`,
    `Visual identity: ${visualBits.join("; ")}.`,
    `Superpower: ${profile.selectedPower.name || "Unknown power"}${profile.selectedPower.description ? ` — ${profile.selectedPower.description}` : ""}.`,
  ].join("\n");
}

function buildEventsForPrompt(battle) {
  const snapshots = new Map(
    [battle?.attackerSnapshot, battle?.defenderSnapshot]
      .filter(Boolean)
      .map((snapshot) => [snapshot.id, snapshot])
  );

  return (battle?.rounds || []).map((round) => ({
    roundNumber: round.roundNumber,
    actor:
      round.actorPetId === battle.attackerSnapshot.id
        ? battle.attackerSnapshot.name
        : battle.defenderSnapshot.name,
    target:
      round.targetPetId === battle.attackerSnapshot.id
        ? battle.attackerSnapshot.name
        : battle.defenderSnapshot.name,
    turnType: round.turnType,
    hitResult: round.hitResult,
    usedSuperpower: Boolean(round.usedSuperpower),
    usedCritical: Boolean(round.usedCritical),
    powerName: snapshots.get(round.actorPetId)?.selectedPower?.name || "",
    powerDescription: snapshots.get(round.actorPetId)?.selectedPower?.description || "",
    storyBeat:
      round.turnType === "counterattack"
        ? "This round is the immediate answer thrown back after a successful defense."
        : round.usedSuperpower
          ? "This is the signature superpower moment and should feel bigger than a normal exchange."
          : round.hitResult === "defended"
            ? "The move is denied cleanly and should feel like a clash, swat, interception, or shut-down."
            : round.usedCritical || round.hitResult === "critical"
              ? "The strike lands in a particularly sharp, nasty, or decisive way."
              : "This is a normal successful attack beat.",
  }));
}

function buildUserPrompt(battle) {
  return [
    "Write battle narration for the resolved fight below.",
    "",
    "Goal:",
    "- Turn each resolved round into a compact, vivid story beat.",
    "- Make the fight read like a narrated scene, not a system recap.",
    "- Describe what the audience would picture happening.",
    "",
    `Fighter A profile:\n${buildFighterPromptProfile(battle.attackerSnapshot)}`,
    "",
    `Fighter B profile:\n${buildFighterPromptProfile(battle.defenderSnapshot)}`,
    "",
    `Resolved rounds:\n${JSON.stringify(buildEventsForPrompt(battle), null, 2)}`,
    "",
    "Requirements:",
    "- Never change what actually happened in any round.",
    "- Do not mention raw damage numbers, HP values, dice rolls, percentages, or internal combat math.",
    "- Do not write dry log language like 'hits for damage', 'no damage taken', or 'critical hit' unless no better phrasing is possible.",
    "- If a move is defended, make it feel like a real clash or denial, not a boring miss.",
    "- If a counter round appears, write it as an immediate snap-back response.",
    "- If a superpower is used, mention the power by name and make the round feel distinct.",
    "- Keep each round narration to 1-2 short sentences.",
    "- Vary wording and sentence openings so the rounds do not all sound alike.",
    "- Keep the final summary short, flavorful, and non-technical.",
    "- Return JSON only.",
    "",
    "Bad direction:",
    '- "Gamma Arbiter strikes Florida Panda for 9 damage."',
    '- "Florida Panda attacks, but Gamma Arbiter blocks. No damage taken."',
    "",
    "Better direction:",
    '- "Gamma Arbiter jumps first and clips Florida Panda before the guard settles, leaving the whole lane buzzing."',
    '- "Florida Panda barrels in, but Gamma Arbiter meets the rush head-on and bats it away like the move was overdue."',
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

async function requestAiNarration(battle, { timeoutMs = GEMINI_TEXT_TIMEOUT_MS } = {}) {
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
    timeoutMs,
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
      const narrationText = sanitizeNarrationText(round?.narrationText, "");

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
    finalSummaryText: sanitizeNarrationText(
      parsed?.finalSummaryText,
      fallback.finalSummaryText
    ),
    narrationMode: "ai",
  };
}

async function generateBattleNarration(
  battle,
  {
    timeoutMs = GEMINI_TEXT_TIMEOUT_MS,
  } = {}
) {
  const fallback = applyFallbackNarration(battle);

  try {
    const aiText = await requestAiNarration(battle, { timeoutMs });
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

async function generateBattleNarrationWithBudget(
  battle,
  {
    timeoutMs = DEFAULT_BATTLE_NARRATION_BUDGET_MS,
  } = {}
) {
  return generateBattleNarration(battle, { timeoutMs });
}

module.exports = {
  applyFallbackNarration,
  buildFallbackNarration,
  buildFallbackFinalSummary,
  generateBattleNarration,
  generateBattleNarrationWithBudget,
};
