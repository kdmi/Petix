// Gemini 2.5 text models think by default, and those thoughts are billed as
// output tokens. Measured against the live prompts on 2026-09-19: the two-word
// name prompt spent 882 thought tokens on a 3-token answer, the powers prompt
// 1392 on 55, battle narration 1404 on 482 — roughly 96% of that day's output
// bill was thinking nobody reads. Every call site now sends an explicit budget
// instead of letting the API pick one.
//
// A budget of 0 disables thinking, -1 restores the API's dynamic behaviour
// (the pre-2026-09-20 state, kept as a per-prompt rollback switch).

const MAX_THINKING_BUDGET = 24576;
const DYNAMIC_THINKING_BUDGET = -1;

const warnedEnvKeys = new Set();

function resolveThinkingBudget(envKey, fallbackBudget) {
  const raw = String(process.env[envKey] || "").trim();
  if (!raw) {
    return fallbackBudget;
  }

  const parsed = Number(raw);
  const isValid =
    Number.isInteger(parsed) &&
    (parsed === DYNAMIC_THINKING_BUDGET || (parsed >= 0 && parsed <= MAX_THINKING_BUDGET));

  if (isValid) {
    return parsed;
  }

  if (!warnedEnvKeys.has(envKey)) {
    warnedEnvKeys.add(envKey);
    console.warn(
      "[gemini:thinking]",
      `${envKey}="${raw}" must be -1 or an integer between 0 and ${MAX_THINKING_BUDGET}, falling back to ${fallbackBudget}.`
    );
  }

  return fallbackBudget;
}

// Thoughts count against maxOutputTokens, so a cap is only safe when it leaves
// room for the budget on top of the answer itself. Deriving it here means a
// raised env budget can never truncate a reply into the fallback path.
function resolveMaxOutputTokens(thinkingBudget, answerReserve) {
  const spentOnThoughts = thinkingBudget === DYNAMIC_THINKING_BUDGET ? MAX_THINKING_BUDGET : thinkingBudget;
  return spentOnThoughts + answerReserve;
}

module.exports = {
  DYNAMIC_THINKING_BUDGET,
  MAX_THINKING_BUDGET,
  resolveMaxOutputTokens,
  resolveThinkingBudget,
};
