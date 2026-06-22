const { getSessionFromRequest, handleCors, json, parseJsonBody } = require("../../api/_lib/auth");
const { serializeCharacterRecord } = require("../../api/_lib/character");
const { isCharacterProxyEnabled, proxyCharacterJson } = require("../../api/_lib/character-proxy");
const { clearWalletProfileCache, updateWalletProfile } = require("../../api/_lib/store");

const DRAFT_NOT_FOUND_MESSAGE = "Character draft not found. Start again.";
const DRAFT_RETRY_DELAYS_MS = [200, 400, 800];

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (isCharacterProxyEnabled()) {
    await proxyCharacterJson(req, res, "/api/character/select-power");
    return;
  }

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
    const draftId = String(body.draftId || "").trim();
    const selectedPowerId = String(body.selectedPowerId || "").trim();
    console.log(
      "[character:select-power:request]",
      JSON.stringify({
        wallet: session.wallet,
        draftId,
        selectedPowerId,
      })
    );
    if (!selectedPowerId) {
      json(res, 400, { error: "Selected superpower is required." });
      return;
    }

    const runUpdate = () =>
      updateWalletProfile(session.wallet, async (current) => {
        if (!current.draft) {
          throw new Error(DRAFT_NOT_FOUND_MESSAGE);
        }

        if (draftId && String(current.draft.id || "") !== draftId) {
          throw new Error("Character draft changed. Start again.");
        }

        const selectedPower = current.draft.powers.find((power) => power.id === selectedPowerId);
        if (!selectedPower) {
          throw new Error("Selected superpower is invalid.");
        }

        return {
          ...current,
          draft: {
            ...current.draft,
            selectedPowerId,
            updatedAt: new Date().toISOString(),
          },
        };
      });

    let profile;
    let lastError;
    for (let attempt = 0; attempt <= DRAFT_RETRY_DELAYS_MS.length; attempt++) {
      try {
        profile = await runUpdate();
        if (attempt > 0) {
          console.log(
            "[character:select-power:retry-recovered]",
            JSON.stringify({ wallet: session.wallet, attempt })
          );
        }
        break;
      } catch (error) {
        lastError = error;
        const retryable = draftId && error.message === DRAFT_NOT_FOUND_MESSAGE;
        if (!retryable || attempt === DRAFT_RETRY_DELAYS_MS.length) {
          throw error;
        }
        clearWalletProfileCache(session.wallet);
        await wait(DRAFT_RETRY_DELAYS_MS[attempt]);
      }
    }
    if (!profile) {
      throw lastError;
    }

    console.log(
      "[character:select-power:success]",
      JSON.stringify({
        wallet: session.wallet,
        draftId: profile.draft?.id || null,
        selectedPowerId: profile.draft?.selectedPowerId || selectedPowerId,
      })
    );

    json(res, 200, {
      draft: serializeCharacterRecord(profile.draft),
      characters: profile.characters.map(serializeCharacterRecord),
    });
  } catch (error) {
    console.warn(
      "[character:select-power:error]",
      JSON.stringify({
        wallet: session.wallet,
        message: error.message || "Bad request.",
      })
    );
    json(res, 400, { error: error.message || "Bad request." });
  }
};
