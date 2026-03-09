const {
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_MS,
  createChallenge,
  handleCors,
  isLikelySolanaAddress,
  json,
  parseJsonBody,
  setCookie,
} = require("../../_lib/auth");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const wallet = String(body.wallet || "").trim();

    if (!isLikelySolanaAddress(wallet)) {
      json(res, 400, { error: "Invalid Solana wallet address." });
      return;
    }

    const { challengeToken, message, expiresAt } = createChallenge(wallet);
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
