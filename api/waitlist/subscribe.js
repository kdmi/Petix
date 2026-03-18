const { handleCors, json, parseJsonBody } = require("../_lib/auth");
const { subscribeWaitlist } = require("../_lib/waitlist");

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const result = await subscribeWaitlist({
      email: body?.email,
      source: body?.source,
      pagePath: body?.pagePath,
      userAgent: req.headers["user-agent"] || "",
    });

    json(res, 200, {
      ok: true,
      destination: result.destination,
    });
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    json(res, statusCode, {
      error: error?.message || "Unable to save your email right now.",
    });
  }
};
