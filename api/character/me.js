const {
  CHARACTER_COOKIE,
  json,
  parseCookies,
  verifyToken,
  getSessionFromRequest,
} = require("../_lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  const cookies = parseCookies(req);
  const raw = cookies[CHARACTER_COOKIE];
  if (!raw) {
    json(res, 200, { hasCharacter: false });
    return;
  }

  const token = verifyToken(raw);
  if (
    !token ||
    token.type !== "character_profile" ||
    token.exp < Date.now() ||
    token.wallet !== session.wallet
  ) {
    json(res, 200, { hasCharacter: false });
    return;
  }

  json(res, 200, {
    hasCharacter: true,
    character: token.character,
  });
};
