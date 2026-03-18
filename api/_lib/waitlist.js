const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { get, list, put } = require("@vercel/blob");

const LOCAL_DATA_DIR = path.join(process.cwd(), ".data", "local-dev");
const LOCAL_WAITLIST_PATH = path.join(LOCAL_DATA_DIR, "waitlist.json");
const WAITLIST_BLOB_PREFIX = String(process.env.WAITLIST_BLOB_PREFIX || "waitlist")
  .trim()
  .replace(/^\/+|\/+$/g, "");

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function isBlobStorageEnabled() {
  return process.env.NODE_ENV === "production" && Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

function buildWaitlistBlobPath(entry) {
  return `${WAITLIST_BLOB_PREFIX}/${entry.createdAt.slice(0, 10)}/${entry.id}.json`;
}

async function ensureLocalDataDir() {
  await fs.mkdir(LOCAL_DATA_DIR, { recursive: true });
}

async function readLocalWaitlist() {
  await ensureLocalDataDir();

  try {
    const raw = await fs.readFile(LOCAL_WAITLIST_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function writeLocalWaitlist(entries) {
  await ensureLocalDataDir();
  await fs.writeFile(LOCAL_WAITLIST_PATH, JSON.stringify(entries, null, 2));
}

async function appendToLocalWaitlist(entry) {
  const current = await readLocalWaitlist();
  current.push(entry);
  await writeLocalWaitlist(current);
}

async function appendToBlobWaitlist(entry) {
  await put(buildWaitlistBlobPath(entry), JSON.stringify(entry, null, 2), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
    cacheControlMaxAge: 31536000,
  });
}

async function readBlobText(stream) {
  if (!stream) return "";

  const reader = stream.getReader();
  const chunks = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function loadWaitlistEntryFromBlob(pathname) {
  const blobResult = await get(pathname, {
    access: "public",
  }).catch((error) => {
    if (error?.name === "BlobNotFoundError") {
      return null;
    }
    throw error;
  });

  if (!blobResult || blobResult.statusCode !== 200) {
    return null;
  }

  const raw = await readBlobText(blobResult.stream);
  return raw ? JSON.parse(raw) : null;
}

async function listBlobPathnames(prefix) {
  const blobs = [];
  let cursor;

  while (true) {
    const page = await list({
      prefix,
      cursor,
      limit: 1000,
    });

    blobs.push(...page.blobs);

    if (!page.hasMore || !page.cursor) {
      break;
    }

    cursor = page.cursor;
  }

  return blobs;
}

async function listWaitlistEntries() {
  if (isBlobStorageEnabled()) {
    const blobs = await listBlobPathnames(`${WAITLIST_BLOB_PREFIX}/`);
    const entries = await Promise.all(
      blobs.map(async (blob) => loadWaitlistEntryFromBlob(blob.pathname))
    );

    return entries
      .filter(Boolean)
      .sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
  }

  const entries = await readLocalWaitlist();
  return entries.sort((left, right) => Date.parse(right.createdAt || 0) - Date.parse(left.createdAt || 0));
}

async function subscribeWaitlist(payload) {
  const email = normalizeEmail(payload?.email);
  if (!isValidEmail(email)) {
    const error = new Error("Please enter a valid email address.");
    error.statusCode = 400;
    throw error;
  }

  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    email,
    source: String(payload?.source || "landing"),
    pagePath: String(payload?.pagePath || "/"),
    userAgent: String(payload?.userAgent || ""),
  };

  if (isBlobStorageEnabled()) {
    await appendToBlobWaitlist(entry);
    return { destination: "blob-storage", entry };
  }

  await appendToLocalWaitlist(entry);
  return { destination: "local-file", entry };
}

module.exports = {
  listWaitlistEntries,
  subscribeWaitlist,
};
