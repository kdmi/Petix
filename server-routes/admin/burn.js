const {
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { burnQueued, getBurnState } = require("../../api/_lib/token-burn");

// Костёр за созданных питомцев (024). Только для администраторов и только
// вручную: кнопка нажимается, когда владелец решил сжечь накопленное.
// GET  — очередь, история, хватает ли разрешения и газа.
// POST — сжечь очередь (или её часть, если передан points).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "GET" && req.method !== "POST") {
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

  try {
    if (req.method === "GET") {
      json(res, 200, await getBurnState());
      return;
    }

    const body = await parseJsonBody(req).catch(() => ({}));
    const result = await burnQueued({ points: body && body.points });
    json(res, 200, { ...result, ...(await getBurnState()) });
  } catch (error) {
    if (error.httpStatus) {
      json(res, error.httpStatus, { error: error.message, code: error.httpCode });
      return;
    }
    json(res, 500, { error: error.message || "Burn failed." });
  }
};
