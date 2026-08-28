const test = require("node:test");
const assert = require("node:assert/strict");

const { buildFreshPathname } = require("../../api/_lib/blob-read");

test("buildFreshPathname appends a unique cache-busting query", () => {
  const a = buildFreshPathname("wallet-profiles/abc.json");
  const b = buildFreshPathname("wallet-profiles/abc.json");

  assert.match(a, /^wallet-profiles\/abc\.json\?fresh=[a-z0-9-]+$/);
  assert.match(b, /^wallet-profiles\/abc\.json\?fresh=[a-z0-9-]+$/);
  // Every read must produce a distinct cache key, otherwise the edge cache
  // could serve a stale profile after an overwrite.
  assert.notEqual(a, b);
});

test("buildFreshPathname uses & when the pathname already has a query", () => {
  const result = buildFreshPathname("system/db.json?x=1");
  assert.match(result, /^system\/db\.json\?x=1&fresh=[a-z0-9-]+$/);
});
