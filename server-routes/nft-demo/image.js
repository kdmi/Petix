const fs = require("fs/promises");
const path = require("path");
const { json } = require("../../api/_lib/auth");
const { LOCAL_IMAGES_DIR } = require("../../api/_lib/nft-demo");

// Public image endpoint for LOCAL snapshot copies only (bare dev without blob
// storage). In production snapshots live in IPFS/blob and this route is unused.
const SAFE_FILE_PATTERN = /^[0-9]{1,3}-char_[0-9a-f-]+\.(png|jpg|webp)$/i;
const MIME_BY_EXT = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const requestUrl = new URL(req.url, "http://localhost");
  const file = String(requestUrl.searchParams.get("file") || "").trim();
  if (!SAFE_FILE_PATTERN.test(file)) {
    json(res, 404, { error: "Not found." });
    return;
  }

  try {
    const buffer = await fs.readFile(path.join(LOCAL_IMAGES_DIR, file));
    res.statusCode = 200;
    res.setHeader("Content-Type", MIME_BY_EXT[file.split(".").pop().toLowerCase()] || "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(buffer);
  } catch (error) {
    json(res, 404, { error: "Not found." });
  }
};
