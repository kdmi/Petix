const { handleCors, json, parseJsonBody } = require("./_lib/auth");

const ALLOWED_EVENTS = new Set([
  "power_select_submit",
  "power_select_slow",
  "power_select_error",
  "window_error",
  "unhandled_rejection",
]);

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const event = String(body?.event || "").trim();

    if (!ALLOWED_EVENTS.has(event)) {
      json(res, 400, { error: "Unsupported event." });
      return;
    }

    const payload = {
      event,
      step: String(body?.step || "").trim().slice(0, 48),
      selectedPowerId: String(body?.selectedPowerId || "").trim().slice(0, 64),
      draftId: String(body?.draftId || "").trim().slice(0, 80),
      path: String(body?.path || "").trim().slice(0, 200),
      message: String(body?.message || "").trim().slice(0, 400),
      userAgent: String(req.headers["user-agent"] || "").trim().slice(0, 200),
      timestamp: new Date().toISOString(),
    };

    console.warn("[client-log]", JSON.stringify(payload));
    json(res, 200, { success: true });
  } catch (error) {
    json(res, 400, { error: error.message || "Bad request." });
  }
};
