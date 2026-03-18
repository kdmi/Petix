const {
  CHALLENGE_COOKIE,
  SESSION_COOKIE,
  clearCookie,
  handleCors,
  json,
} = require("../../../api/_lib/auth");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  clearCookie(res, CHALLENGE_COOKIE);
  clearCookie(res, SESSION_COOKIE);
  json(res, 200, { authenticated: false });
};
