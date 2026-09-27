const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { get, head, put } = require("@vercel/blob");

const { getFreshBlob, isBlobNotFoundError } = require("./blob-read");

// One JSON document in blob storage, read and written the only way that is
// safe here.
//
// The rules were learned the hard way and are the same in store.js,
// battle-store.js, nft-store.js and roster.js; feature 025 needed a fifth
// copy, so they live here instead:
//
// 1. An overwritten blob is served stale for tens of seconds in the functions
//    region. So every write also lands an immutable copy at
//    `<doc>-v/<md5>.json`, and a reader that must not be stale resolves the
//    pointer's etag (= the md5 of the current content) to that pathname.
// 2. The in-process write queue only serializes writes inside one lambda.
//    Concurrent invocations are kept apart by compare-and-swap: a write
//    carries the etag it was computed from, and a conflict re-runs the mutator
//    against a fresh read.
//
// The immutable copies are cleaned up by api/_lib/blob-gc.js — a document
// created here must expose its version prefix to that sweep.

const DEFAULT_CAS_ATTEMPTS = 5;
const DATA_DIR =
  process.env.NODE_ENV === "production"
    ? path.join(process.cwd(), ".data")
    : path.join(process.cwd(), ".data", "local-dev");

function md5Hex(text) {
  return crypto.createHash("md5").update(text).digest("hex");
}

function normalizeEtag(value) {
  return String(value || "")
    .replace(/^W\//i, "")
    .replace(/^"+|"+$/g, "");
}

function isEtagConflictError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("precondition") || message.includes("etag");
}

function isBlobEnabled() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && process.env.NODE_ENV === "production";
}

function versionPrefixFor(pathname) {
  return `${pathname.replace(/\.json$/, "")}-v/`;
}

async function readBlobText(stream) {
  if (!stream) return "";

  if (typeof stream.getReader === "function") {
    const reader = stream.getReader();
    const chunks = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function loadFromPath(pathname, { fresh }) {
  const read = fresh
    ? getFreshBlob(pathname, { access: "public" })
    : get(pathname, { access: "public" });

  const result = await read.catch((error) => {
    if (isBlobNotFoundError(error)) return null;
    throw error;
  });

  if (!result || result.statusCode !== 200) return null;

  const raw = await readBlobText(result.stream);
  return raw ? JSON.parse(raw) : null;
}

function localPathFor(pathname) {
  return path.join(DATA_DIR, "blob", pathname);
}

// Per-pathname write queue, so two mutations in the same instance never
// interleave their read-modify-write.
const writeQueues = new Map();

function enqueue(pathname, task) {
  const previous = writeQueues.get(pathname) || Promise.resolve();
  const next = previous.catch(() => null).then(task);
  writeQueues.set(pathname, next);
  // Keep the map from growing with one entry per battle ever played.
  next.catch(() => null).then(() => {
    if (writeQueues.get(pathname) === next) writeQueues.delete(pathname);
  });
  return next;
}

/**
 * @param {object} options
 * @param {string} options.path Pointer pathname, e.g. `system/abc-battles/xyz.json`.
 * @param {() => any} options.empty What a missing document reads as.
 * @param {(raw: any) => any} [options.normalize] Shape guard for whatever is stored.
 */
function createBlobDocument({ path: pathname, empty, normalize = (value) => value }) {
  const versionPrefix = versionPrefixFor(pathname);
  const emptyValue = () => normalize(empty());

  async function readLocal() {
    const raw = await fs.readFile(localPathFor(pathname), "utf8").catch(() => null);
    if (!raw) return { data: emptyValue(), etag: null, exists: false };
    try {
      return { data: normalize(JSON.parse(raw)), etag: null, exists: true };
    } catch {
      return { data: emptyValue(), etag: null, exists: false };
    }
  }

  async function writeLocal(data) {
    const file = localPathFor(pathname);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(data, null, 2), "utf8");
  }

  /** Cache-friendly read; may be tens of seconds stale right after a write. */
  async function read() {
    if (!isBlobEnabled()) return readLocal();

    const data = await loadFromPath(pathname, { fresh: false });
    return data === null
      ? { data: emptyValue(), etag: null, exists: false }
      : { data: normalize(data), etag: null, exists: true };
  }

  /** Authoritative read: head() the pointer, then the copy its etag names. */
  async function readConsistent() {
    if (!isBlobEnabled()) return readLocal();

    const meta = await head(pathname).catch((error) => {
      if (isBlobNotFoundError(error)) return null;
      throw error;
    });

    if (!meta) return { data: emptyValue(), etag: null, exists: false };

    const etag = meta.etag || null;
    const contentMd5 = normalizeEtag(etag);

    if (/^[a-f0-9]{32}$/.test(contentMd5)) {
      // A very recent write may not have replicated its copy yet; an old write
      // without one predates this scheme and must not stall the read.
      const uploadedMs = new Date(meta.uploadedAt).getTime();
      const isRecent = Number.isFinite(uploadedMs) && Date.now() - uploadedMs < 60000;
      const attempts = isRecent ? 3 : 1;

      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const data = await loadFromPath(`${versionPrefix}${contentMd5}.json`, { fresh: false });
        if (data !== null) return { data: normalize(data), etag, exists: true };
        if (attempt < attempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)));
        }
      }
    }

    const fallback = await loadFromPath(pathname, { fresh: true });
    return fallback === null
      ? { data: emptyValue(), etag, exists: false }
      : { data: normalize(fallback), etag, exists: true };
  }

  async function write(data, { ifMatch = null } = {}) {
    if (!isBlobEnabled()) {
      await writeLocal(data);
      return;
    }

    const json = JSON.stringify(data);

    // The copy goes first: a reader resolving the new etag must always find it.
    await put(`${versionPrefix}${md5Hex(json)}.json`, json, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true, // idempotent: same md5 ⇒ same bytes
      contentType: "application/json; charset=utf-8",
      cacheControlMaxAge: 31536000,
    });

    await put(pathname, json, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/json; charset=utf-8",
      cacheControlMaxAge: 0,
      ...(ifMatch ? { ifMatch } : {}),
    });
  }

  /**
   * Read-modify-write with CAS. The mutator may run several times, so it must
   * not have side effects of its own.
   */
  async function mutate(mutator, { attempts = DEFAULT_CAS_ATTEMPTS } = {}) {
    return enqueue(pathname, async () => {
      if (!isBlobEnabled()) {
        const { data } = await readLocal();
        const next = (await mutator(data)) || data;
        await writeLocal(next);
        return next;
      }

      let next = null;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const { data, etag } = await readConsistent();
        next = (await mutator(data)) || data;

        try {
          await write(next, { ifMatch: etag });
          return next;
        } catch (error) {
          if (!isEtagConflictError(error)) throw error;
        }
      }

      // Fail open, like the profile and battles stores: after several
      // re-read+retry rounds the base is at most about a second old, and
      // losing the write outright would fail a player's battle.
      console.warn(`[blob-doc] CAS kept conflicting on ${pathname} — unconditional write`);
      await write(next);
      return next;
    });
  }

  return { path: pathname, versionPrefix, read, readConsistent, write, mutate };
}

module.exports = {
  createBlobDocument,
  isBlobEnabled,
  md5Hex,
  normalizeEtag,
  versionPrefixFor,
};
