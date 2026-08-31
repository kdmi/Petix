const { get } = require("@vercel/blob");

// Vercel Blob serves public blobs through an edge cache that can keep
// returning the OLD content for a while after an overwrite (documented
// behaviour; `useCache: false` only works for private blobs). For our
// read-modify-write JSON state (wallet profiles, battles, economy config)
// a stale read after a write both shows rolled-back state to the user and
// can clobber the previous write on the next mutation. The documented
// workaround is a unique query string — it changes the cache key, so the
// read always goes to origin storage.

let bustCounter = 0;

function buildFreshPathname(pathname) {
  bustCounter += 1;
  const bust = `${Date.now().toString(36)}-${bustCounter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const separator = String(pathname).includes("?") ? "&" : "?";
  return `${pathname}${separator}fresh=${bust}`;
}

/** get() that bypasses the Blob edge cache — always reads the latest write. */
async function getFreshBlob(pathname, options = {}) {
  return get(buildFreshPathname(pathname), { access: "public", ...options });
}

// @vercel/blob error classes do NOT set `error.name` (it stays "Error"), so a
// `name === "BlobNotFoundError"` check never matches the real SDK — match on
// the constructor name and the SDK's message instead.
function isBlobNotFoundError(error) {
  if (!error) return false;
  return (
    error.name === "BlobNotFoundError" ||
    error.constructor?.name === "BlobNotFoundError" ||
    /blob does not exist/i.test(String(error.message || ""))
  );
}

module.exports = {
  buildFreshPathname,
  getFreshBlob,
  isBlobNotFoundError,
};
