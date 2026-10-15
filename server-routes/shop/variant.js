const fs = require("fs/promises");
const { handleCors, json } = require("../../api/_lib/auth");
const { variantImage } = require("../../api/_lib/shop");
const { requireSession, sendShopError } = require("./_shared");

// GET ?id= — one render of the fitting in progress (owner only).
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const id = new URL(req.url, "http://localhost").searchParams.get("id");
    const image = await variantImage(session.wallet, id);
    if (image.url) {
      res.statusCode = 302;
      res.setHeader("Location", image.url);
      res.setHeader("Cache-Control", "no-store");
      res.end();
      return;
    }
    const buffer = await fs.readFile(image.filePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", image.mimeType || "image/png");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.end(buffer);
  } catch (error) {
    sendShopError(res, error, "Could not load the picture.");
  }
};
