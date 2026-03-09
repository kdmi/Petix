const crypto = require("crypto");
const bs58Package = require("bs58");
const nacl = require("tweetnacl");

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CHARACTER_TTL_MS = 365 * 24 * 60 * 60 * 1000;
const CHALLENGE_COOKIE = "petix_challenge";
const SESSION_COOKIE = "petix_session";
const CHARACTER_COOKIE = "petix_character";
const ADMIN_WALLET = "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9";
const INTERNAL_AUTH_HEADER = "x-petix-internal-secret";
const INTERNAL_WALLET_HEADER = "x-petix-wallet";
const INTERNAL_WALLET_NAME_HEADER = "x-petix-wallet-name";
const INTERNAL_WALLET_TYPE_HEADER = "x-petix-wallet-type";

function getSecret() {
  const secret = process.env.SOLANA_AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SOLANA_AUTH_SECRET is missing or too short.");
  }
  return secret;
}

function getInternalApiSecret() {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || secret.length < 24) {
    return "";
  }
  return secret;
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const normalized = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
  return Buffer.from(normalized, "base64").toString("utf8");
}

function signToken(payload) {
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(payloadEncoded)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${payloadEncoded}.${signature}`;
}

function verifyToken(token) {
  if (!token || !token.includes(".")) return null;
  const [payloadEncoded, signature] = token.split(".");
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(payloadEncoded)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  if (signature.length !== expected.length) {
    return null;
  }
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return null;
  }

  try {
    return JSON.parse(base64UrlDecode(payloadEncoded));
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  if (!header) return {};

  return header.split(";").reduce((acc, raw) => {
    const [key, ...rest] = raw.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("=") || "");
    return acc;
  }, {});
}

function appendSetCookie(res, cookieValue) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", [cookieValue]);
    return;
  }
  const next = Array.isArray(current) ? [...current, cookieValue] : [current, cookieValue];
  res.setHeader("Set-Cookie", next);
}

function appendVaryHeader(res, value) {
  const current = res.getHeader("Vary");
  if (!current) {
    res.setHeader("Vary", value);
    return;
  }

  const values = Array.isArray(current)
    ? current.flatMap((item) => String(item).split(","))
    : String(current).split(",");
  const normalized = values.map((item) => item.trim()).filter(Boolean);
  if (!normalized.includes(value)) {
    normalized.push(value);
  }
  res.setHeader("Vary", normalized.join(", "));
}

function getAllowedOrigins() {
  const configured = String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured.length) {
    return configured;
  }

  return ["http://localhost:3000", "https://petix.fun", "https://www.petix.fun"];
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  appendVaryHeader(res, "Origin");

  if (!origin) {
    return false;
  }

  if (!getAllowedOrigins().includes(origin)) {
    return false;
  }

  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return true;
}

function handleCors(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

function setCookie(res, name, value, maxAgeMs) {
  const isProd = process.env.NODE_ENV === "production";
  const maxAge = Math.floor(maxAgeMs / 1000);
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    isProd ? "SameSite=None" : "SameSite=Lax",
  ];
  if (isProd) parts.push("Secure");
  appendSetCookie(res, parts.join("; "));
}

function clearCookie(res, name) {
  const isProd = process.env.NODE_ENV === "production";
  const parts = [
    `${name}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    isProd ? "SameSite=None" : "SameSite=Lax",
  ];
  if (isProd) parts.push("Secure");
  appendSetCookie(res, parts.join("; "));
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("Request body is too large."));
      }
    });
    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function isLikelySolanaAddress(value) {
  return typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
}

function createChallenge(wallet) {
  const now = Date.now();
  const expiresAt = now + CHALLENGE_TTL_MS;
  const nonce = crypto.randomBytes(16).toString("hex");
  const challenge = {
    type: "challenge",
    wallet,
    nonce,
    iat: now,
    exp: expiresAt,
  };
  const message = buildChallengeMessage(challenge);

  return {
    challenge,
    challengeToken: signToken(challenge),
    message,
    expiresAt,
  };
}

function buildChallengeMessage(challenge) {
  return [
    "PETIX wants you to sign in with your Solana account:",
    challenge.wallet,
    "",
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${new Date(challenge.iat).toISOString()}`,
    `Expiration Time: ${new Date(challenge.exp).toISOString()}`,
  ].join("\n");
}

function verifySignedMessage(wallet, message, signatureBase64) {
  const bs58 = bs58Package.default || bs58Package;
  const publicKey = bs58.decode(wallet);
  const signature = Buffer.from(signatureBase64, "base64");
  const messageBytes = Buffer.from(message, "utf8");
  return nacl.sign.detached.verify(messageBytes, signature, publicKey);
}

function walletTypeToName(walletType) {
  const map = {
    phantom: "Phantom",
    solflare: "Solflare",
    trust: "Trust Wallet",
  };
  return map[walletType] || "Wallet";
}

function getAdminWallets() {
  const configured = [
    process.env.ADMIN_WALLETS || "",
    process.env.ADMIN_WALLET || "",
    ADMIN_WALLET,
  ]
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return Array.from(new Set(configured));
}

function isAdminWallet(wallet) {
  const normalizedWallet = String(wallet || "").trim();
  return Boolean(normalizedWallet) && getAdminWallets().includes(normalizedWallet);
}

function isAdminSession(session) {
  return Boolean(session?.wallet) && isAdminWallet(session.wallet);
}

function createSession(wallet, walletType) {
  const now = Date.now();
  const session = {
    type: "session",
    wallet,
    walletType,
    walletName: walletTypeToName(walletType),
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
  return {
    session,
    sessionToken: signToken(session),
  };
}

function createToken(payload, ttlMs) {
  const now = Date.now();
  return signToken({
    ...payload,
    iat: now,
    exp: now + ttlMs,
  });
}

function getSessionFromRequest(req) {
  const internalSecret = getInternalApiSecret();
  const internalWallet = String(req.headers[INTERNAL_WALLET_HEADER] || "").trim();
  if (
    internalSecret &&
    String(req.headers[INTERNAL_AUTH_HEADER] || "") === internalSecret &&
    isLikelySolanaAddress(internalWallet)
  ) {
    return {
      type: "internal-session",
      wallet: internalWallet,
      walletName: String(req.headers[INTERNAL_WALLET_NAME_HEADER] || "Wallet").trim() || "Wallet",
      walletType:
        String(req.headers[INTERNAL_WALLET_TYPE_HEADER] || "internal").trim() || "internal",
      iat: Date.now(),
      exp: Date.now() + SESSION_TTL_MS,
    };
  }

  const cookies = parseCookies(req);
  const sessionToken = cookies[SESSION_COOKIE];
  if (!sessionToken) return null;
  const session = verifyToken(sessionToken);
  if (!session || session.type !== "session" || session.exp < Date.now()) {
    return null;
  }
  return session;
}

module.exports = {
  ADMIN_WALLET,
  CHALLENGE_COOKIE,
  CHALLENGE_TTL_MS,
  CHARACTER_COOKIE,
  CHARACTER_TTL_MS,
  INTERNAL_AUTH_HEADER,
  INTERNAL_WALLET_HEADER,
  INTERNAL_WALLET_NAME_HEADER,
  INTERNAL_WALLET_TYPE_HEADER,
  applyCors,
  SESSION_COOKIE,
  SESSION_TTL_MS,
  clearCookie,
  buildChallengeMessage,
  createToken,
  createChallenge,
  createSession,
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  isAdminWallet,
  isLikelySolanaAddress,
  json,
  parseCookies,
  parseJsonBody,
  setCookie,
  verifySignedMessage,
  verifyToken,
  walletTypeToName,
};
