const fs = require("fs/promises");
const http = require("http");
const path = require("path");
const { pathToFileURL } = require("url");

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 3000);
const ROOT = process.cwd();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isSafeResolvedPath(filePath) {
  const normalizedRoot = `${ROOT}${path.sep}`;
  return filePath === ROOT || filePath.startsWith(normalizedRoot);
}

async function resolveStaticPath(urlPath) {
  const decodedPath = decodeURIComponent(urlPath);
  if (/^\/battle\/[^/.]+\/?$/.test(decodedPath)) {
    const battleIndexPath = path.resolve(ROOT, "./battle/index.html");
    return (await pathExists(battleIndexPath)) ? battleIndexPath : null;
  }

  const relativePath = decodedPath === "/" ? "/index.html" : decodedPath;
  const directPath = path.resolve(ROOT, `.${relativePath}`);

  if (!isSafeResolvedPath(directPath)) {
    return null;
  }

  if (await pathExists(directPath)) {
    const stats = await fs.stat(directPath);
    if (stats.isDirectory()) {
      const indexPath = path.join(directPath, "index.html");
      return (await pathExists(indexPath)) ? indexPath : null;
    }
    return directPath;
  }

  if (!path.extname(directPath)) {
    const nestedIndexPath = path.join(directPath, "index.html");
    if (await pathExists(nestedIndexPath)) {
      return nestedIndexPath;
    }
  }

  return null;
}

async function resolveApiPath(pathname) {
  const directPath = path.resolve(ROOT, `.${pathname}.js`);
  if (isSafeResolvedPath(directPath) && (await pathExists(directPath))) {
    return directPath;
  }

  const directoryIndexPath = path.resolve(ROOT, `.${pathname}`, "index.js");
  if (isSafeResolvedPath(directoryIndexPath) && (await pathExists(directoryIndexPath))) {
    return directoryIndexPath;
  }

  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) {
    return null;
  }

  const directoryPath = path.resolve(ROOT, `.${path.join("/", ...segments.slice(0, -1))}`);
  if (!isSafeResolvedPath(directoryPath) || !(await pathExists(directoryPath))) {
    return null;
  }

  const entries = await fs.readdir(directoryPath).catch(() => []);
  const dynamicEntry = entries.find((entry) => /^\[[^/]+\]\.js$/.test(entry));
  if (!dynamicEntry) {
    return null;
  }

  const dynamicPath = path.join(directoryPath, dynamicEntry);
  return isSafeResolvedPath(dynamicPath) ? dynamicPath : null;
}

function clearModuleCache(modulePath) {
  const resolved = require.resolve(modulePath);
  delete require.cache[resolved];
}

async function handleApi(req, res, pathname) {
  const filePath = await resolveApiPath(pathname);
  if (!filePath) {
    res.statusCode = 404;
    res.end("Not found.");
    return;
  }

  try {
    clearModuleCache(filePath);
    const handler = require(filePath);
    await Promise.resolve(handler(req, res));
  } catch (error) {
    console.error("[dev-server:api]", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: "Internal server error." }));
    }
  }
}

async function handleStatic(res, filePath) {
  const buffer = await fs.readFile(filePath);
  res.statusCode = 200;
  res.setHeader("Content-Type", getMimeType(filePath));
  res.end(buffer);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  const { pathname } = requestUrl;

  if (pathname.startsWith("/api/")) {
    await handleApi(req, res, pathname);
    return;
  }

  const filePath = await resolveStaticPath(pathname);
  if (!filePath) {
    res.statusCode = 404;
    res.end("Not found.");
    return;
  }

  try {
    await handleStatic(res, filePath);
  } catch (error) {
    console.error("[dev-server:static]", error);
    res.statusCode = 500;
    res.end("Internal server error.");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Dev server ready at http://${HOST}:${PORT}`);
});
