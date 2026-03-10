const {
  INTERNAL_AUTH_HEADER,
  INTERNAL_WALLET_HEADER,
  INTERNAL_WALLET_NAME_HEADER,
  INTERNAL_WALLET_TYPE_HEADER,
  getSessionFromRequest,
  json,
  parseJsonBody,
} = require("./auth");

function getCharacterApiBaseUrl() {
  return String(process.env.CHARACTER_API_BASE_URL || "").trim().replace(/\/+$/, "");
}

function isCharacterProxyExplicitlyEnabled() {
  return String(process.env.ENABLE_CHARACTER_PROXY || "")
    .trim()
    .toLowerCase() === "true";
}

function isCharacterProxyEnabled() {
  return (
    process.env.NODE_ENV !== "production" &&
    isCharacterProxyExplicitlyEnabled() &&
    Boolean(getCharacterApiBaseUrl())
  );
}

function getInternalSecret() {
  return String(process.env.INTERNAL_API_SECRET || "").trim();
}

function buildProxyHeaders(session, extraHeaders = {}) {
  const internalSecret = getInternalSecret();
  if (!internalSecret) {
    throw new Error("INTERNAL_API_SECRET is missing.");
  }

  return {
    [INTERNAL_AUTH_HEADER]: internalSecret,
    [INTERNAL_WALLET_HEADER]: session.wallet,
    [INTERNAL_WALLET_NAME_HEADER]: session.walletName || "Wallet",
    [INTERNAL_WALLET_TYPE_HEADER]: session.walletType || "internal",
    ...extraHeaders,
  };
}

async function proxyCharacterJson(req, res, path) {
  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return true;
  }

  const method = req.method || "GET";
  const headers = buildProxyHeaders(
    session,
    {
      Origin: String(req.headers.origin || "http://localhost:3000"),
      ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
    }
  );
  const init = {
    method,
    headers,
  };

  if (method !== "GET") {
    init.body = JSON.stringify(await parseJsonBody(req));
  }

  const response = await fetch(`${getCharacterApiBaseUrl()}${path}`, init);
  const payload = await response.text();

  res.statusCode = response.status;
  res.setHeader("Content-Type", response.headers.get("content-type") || "application/json; charset=utf-8");
  res.end(payload);
  return true;
}

async function proxyCharacterImage(req, res, pathWithQuery) {
  const session = getSessionFromRequest(req);
  if (!session) {
    res.statusCode = 401;
    res.end("Unauthorized.");
    return true;
  }

  const response = await fetch(`${getCharacterApiBaseUrl()}${pathWithQuery}`, {
    method: "GET",
    headers: buildProxyHeaders(session, {
      Origin: String(req.headers.origin || "http://localhost:3000"),
    }),
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  res.statusCode = response.status;
  res.setHeader("Content-Type", response.headers.get("content-type") || "image/jpeg");
  res.setHeader("Cache-Control", response.headers.get("cache-control") || "no-store");
  res.end(buffer);
  return true;
}

module.exports = {
  isCharacterProxyEnabled,
  proxyCharacterImage,
  proxyCharacterJson,
};
