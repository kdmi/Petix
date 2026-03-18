const { getSessionFromRequest, handleCors, isAdminSession } = require("../../api/_lib/auth");
const { listWaitlistEntries } = require("../../api/_lib/waitlist");

function escapeCsv(value) {
  const normalized = String(value ?? "");
  if (!/[",\n]/.test(normalized)) {
    return normalized;
  }
  return `"${normalized.replace(/"/g, '""')}"`;
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Method not allowed.");
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Unauthorized.");
    return;
  }

  if (!isAdminSession(session)) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("Forbidden.");
    return;
  }

  const url = new URL(req.url, "http://localhost");
  const query = String(url.searchParams.get("q") || "")
    .trim()
    .toLowerCase();
  const entries = await listWaitlistEntries();
  const filtered = !query
    ? entries
    : entries.filter((entry) =>
        [entry.email, entry.source, entry.pagePath, entry.userAgent].some((field) =>
          String(field || "")
            .toLowerCase()
            .includes(query)
        )
      );

  const rows = [
    ["Email", "Source", "Page", "Submitted At", "User Agent"],
    ...filtered.map((entry) => [
      entry.email,
      entry.source,
      entry.pagePath,
      entry.createdAt,
      entry.userAgent,
    ]),
  ];

  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="petix-waitlist.csv"');
  res.end(csv);
};
