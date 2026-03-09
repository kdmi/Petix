const fs = require("fs/promises");
const path = require("path");

const { getSessionFromRequest, handleCors, isAdminSession } = require("../_lib/auth");
const { isCharacterProxyEnabled, proxyCharacterImage } = require("../_lib/character-proxy");
const { findCharacterRecordById, getWalletProfile } = require("../_lib/store");

const FALLBACK_IMAGE_PATH = path.join(process.cwd(), "assets", "character", "current-pet.jpg");

function resolveRecordById(profile, characterId) {
  if (!characterId) {
    return profile.draft || profile.characters[profile.characters.length - 1] || null;
  }

  if (profile.draft?.id === characterId) {
    return profile.draft;
  }

  return profile.characters.find((record) => record.id === characterId) || null;
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (isCharacterProxyEnabled()) {
    const requestUrl = new URL(req.url, "http://localhost");
    await proxyCharacterImage(req, res, `/api/character/image${requestUrl.search || ""}`);
    return;
  }

  if (req.method !== "GET") {
    res.statusCode = 405;
    res.end("Method not allowed.");
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    res.statusCode = 401;
    res.end("Unauthorized.");
    return;
  }

  try {
    const requestUrl = new URL(req.url, "http://localhost");
    const characterId = String(requestUrl.searchParams.get("id") || "").trim();
    let record = null;

    if (characterId && isAdminSession(session)) {
      record = (await findCharacterRecordById(characterId))?.character || null;
    }

    if (!record) {
      const profile = await getWalletProfile(session.wallet);
      record = resolveRecordById(profile, characterId);
    }

    if (record?.image?.url) {
      res.statusCode = 302;
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Location", record.image.url);
      res.end();
      return;
    }

    const filePath = record?.image?.filePath || FALLBACK_IMAGE_PATH;
    const mimeType = record?.image?.mimeType || "image/jpeg";
    const buffer = await fs.readFile(filePath);

    res.statusCode = 200;
    res.setHeader("Content-Type", mimeType);
    res.setHeader("Cache-Control", "no-store");
    res.end(buffer);
  } catch {
    const buffer = await fs.readFile(FALLBACK_IMAGE_PATH);
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.end(buffer);
  }
};
