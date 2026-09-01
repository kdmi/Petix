const {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  buildEvmChallengeMessage,
  clearCookie,
  createSession,
  handleCors,
  isAdminWallet,
  json,
  normalizeEvmAddress,
  parseCookies,
  parseJsonBody,
  setCookie,
  verifyEvmSignedMessage,
  verifyToken,
  walletTypeToName,
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
    const walletType = String(body.walletType || "").trim();
    const message = String(body.message || "");
    const challengeToken = String(body.challengeToken || "");
    const signature = String(body.signature || "");

    if (!wallet) {
      json(res, 400, { error: "Invalid wallet address." });
      return;
    }
    if (!message || !challengeToken || !signature || !walletType) {
      json(res, 400, { error: "Missing required fields." });
      return;
    }
    if (!["metamask", "walletconnect"].includes(walletType)) {
      json(res, 400, { error: "Unsupported wallet type." });
      return;
    }

    const cookies = parseCookies(req);
    if (!cookies[CHALLENGE_COOKIE] || cookies[CHALLENGE_COOKIE] !== challengeToken) {
      json(res, 401, { error: "Challenge cookie is missing or invalid." });
      return;
    }

    const challenge = verifyToken(challengeToken);
    if (!challenge || challenge.type !== "challenge") {
      json(res, 401, { error: "Challenge token is invalid." });
      return;
    }

    const now = Date.now();
    if (challenge.exp < now) {
      json(res, 401, { error: "Challenge token has expired." });
      return;
    }
    if (challenge.wallet !== wallet) {
      json(res, 401, { error: "Challenge wallet mismatch." });
      return;
    }
    const expectedMessage = buildEvmChallengeMessage(challenge);
    if (message !== expectedMessage) {
      json(res, 401, { error: "Challenge message mismatch." });
      return;
    }

    let signatureValid = false;
    try {
      signatureValid = verifyEvmSignedMessage(wallet, message, signature);
    } catch {
      signatureValid = false;
    }

    if (!signatureValid) {
      json(res, 401, { error: "Invalid wallet signature." });
      return;
    }

    const { sessionToken } = createSession(wallet, walletType);
    setCookie(res, SESSION_COOKIE, sessionToken, SESSION_TTL_MS);
    clearCookie(res, CHALLENGE_COOKIE);

    json(res, 200, {
      authenticated: true,
      wallet,
      isAdmin: isAdminWallet(wallet),
      walletType,
      walletName: walletTypeToName(walletType),
    });
  } catch (error) {
    json(res, 400, { error: error.message || "Bad request." });
  }
};
