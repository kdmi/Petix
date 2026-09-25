const fs = require("fs/promises");
const path = require("path");

const { getSessionFromRequest, handleCors, isAdminSession } = require("../../api/_lib/auth");
const { isCharacterProxyEnabled, proxyCharacterImage } = require("../../api/_lib/character-proxy");
const { findCharacterRecordById, getWalletProfile } = require("../../api/_lib/store");

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

function canAccessCharacterImage({ record, ownerWallet, sessionWallet, isAdmin }) {
  if (!record) {
    return false;
  }

  if (isAdmin) {
    return true;
  }

  if (ownerWallet && ownerWallet === sessionWallet) {
    return true;
  }

  return record.status === "completed";
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

  // Картинка завершённого пета публична: её и так видит любой авторизованный
  // игрок, а с 2026-09-25 бой можно смотреть по ссылке без входа — иначе в
  // публичном реплее у пета без блоб-ссылки вместо картинки была бы дыра.
  const session = getSessionFromRequest(req);

  try {
    const requestUrl = new URL(req.url, "http://localhost");
    const characterId = String(requestUrl.searchParams.get("id") || "").trim();
    let record = null;
    const isAdmin = Boolean(session) && isAdminSession(session);

    if (characterId) {
      const globalMatch = await findCharacterRecordById(characterId);
      if (
        globalMatch &&
        canAccessCharacterImage({
          record: globalMatch.character,
          ownerWallet: globalMatch.wallet,
          sessionWallet: session?.wallet || "",
          isAdmin,
        })
      ) {
        record = globalMatch.character;
      }
    }

    // Свой черновик (и пет без id в запросе) — только для своей сессии; у гостя
    // профиля нет, для него работает лишь публичный поиск выше.
    if (!record && session) {
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
    // Last resort is the placeholder; if even that cannot be read, answer 404
    // instead of throwing — a broken image is better than a 500 in a replay.
    try {
      const buffer = await fs.readFile(FALLBACK_IMAGE_PATH);
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "no-store");
      res.end(buffer);
    } catch {
      res.statusCode = 404;
      res.end("Image not found.");
    }
  }
};
