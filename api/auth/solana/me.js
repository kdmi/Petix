const { SESSION_COOKIE, json, parseCookies, verifyToken } = require("../../_lib/auth");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const cookies = parseCookies(req);
  const sessionToken = cookies[SESSION_COOKIE];
  if (!sessionToken) {
    json(res, 401, { authenticated: false });
    return;
  }

  const session = verifyToken(sessionToken);
  if (!session || session.type !== "session" || session.exp < Date.now()) {
    json(res, 401, { authenticated: false });
    return;
  }

  json(res, 200, {
    authenticated: true,
    wallet: session.wallet,
    walletType: session.walletType,
    walletName: session.walletName,
  });
};
