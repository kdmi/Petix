const test = require("node:test");
const assert = require("node:assert/strict");

const C = require("../../api/_lib/expedition-collections");

const W = "0x" + "1".repeat(40), CONTRACT = "0x" + "c".repeat(40);

// Owner 2026-10-11: holding is enough — no rule about how the token arrived.
test("holding any token of the collection is enough; nothing held → not eligible", async () => {
  const rpc = { balanceOf: async () => 2 };
  const r = await C.checkCollection({ wallet: W, contract: CONTRACT, rpc });
  assert.equal(r.held, 2);
  assert.deepEqual(r.eligible, ["held:2"]);
  assert.deepEqual(r.rejected, []);
  assert.equal(r.source, "rpc");

  const none = await C.checkCollection({ wallet: W, contract: CONTRACT, rpc: { balanceOf: async () => 0 } });
  assert.equal(none.held, 0);
  assert.deepEqual(none.eligible, []);
});

test("RPC down → explorer fallback; both down → CHECK_UNAVAILABLE; results are cached", async () => {
  const rpc = { balanceOf: async () => { throw new Error("rpc down"); } };
  const explorer = { listNfts: async () => ["9"] };
  const cache = new Map();
  let now = 1000;
  const r = await C.checkCollection({ wallet: W, contract: CONTRACT, explorer, rpc, cache, now: () => now });
  assert.equal(r.source, "explorer");
  assert.deepEqual(r.eligible, ["held:1"]);
  explorer.listNfts = async () => { throw new Error("down"); };
  const cached = await C.checkCollection({ wallet: W, contract: CONTRACT, explorer, rpc, cache, now: () => now });
  assert.deepEqual(cached.eligible, ["held:1"], "served from cache");
  now += C.CACHE_TTL_MS + 1;
  await assert.rejects(() => C.checkCollection({ wallet: W, contract: CONTRACT, explorer, rpc, cache, now: () => now }), { httpCode: "CHECK_UNAVAILABLE" });
});

test("withTimeout rejects slow checks with CHECK_TIMEOUT", async () => {
  await assert.rejects(() => C.withTimeout(new Promise((resolve) => setTimeout(resolve, 50)), 5), { httpCode: "CHECK_TIMEOUT" });
  assert.equal(await C.withTimeout(Promise.resolve("ok"), 50), "ok");
});
