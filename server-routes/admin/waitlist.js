const { getSessionFromRequest, handleCors, isAdminSession, json } = require("../../api/_lib/auth");
const { listWaitlistEntries } = require("../../api/_lib/waitlist");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }

  if (!isAdminSession(session)) {
    json(res, 403, { error: "Forbidden." });
    return;
  }

  const entries = await listWaitlistEntries();

  json(res, 200, {
    entries: entries.map((entry) => ({
      id: entry.id,
      email: entry.email,
      source: entry.source,
      pagePath: entry.pagePath,
      userAgent: entry.userAgent,
      createdAt: entry.createdAt,
    })),
  });
};
