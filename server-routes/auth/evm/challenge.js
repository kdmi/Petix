const {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_MS,
  buildEvmChallengeMessage,
  createChallenge,
  getRequestSiweOrigin,
  handleCors,
  json,
  normalizeEvmAddress,
  parseJsonBody,
  setCookie,
} = require("../../../api/_lib/auth");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const wallet = normalizeEvmAddress(String(body.wallet || ""));

    if (!wallet) {
      json(res, 400, { error: "Invalid wallet address." });
      return;
    }

    const { challenge, challengeToken, expiresAt } = createChallenge(
      wallet,
      getRequestSiweOrigin(req)
    );
    const message = buildEvmChallengeMessage(challenge);
    setCookie(res, CHALLENGE_COOKIE, challengeToken, CHALLENGE_TTL_MS);
    json(res, 200, {
      message,
      challengeToken,
      expiresAt,
    });
  } catch (error) {
    json(res, 400, { error: error.message || "Bad request." });
  }
};
