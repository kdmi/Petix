const test = require("node:test");
const assert = require("node:assert/strict");

const C = require("../../api/_lib/expedition-collections");

const W = "0x" + "1".repeat(40), SELLER = "0x" + "2".repeat(40), CONTRACT = "0x" + "c".repeat(40), SEAPORT = "0x" + "5".repeat(40), WETH = "0x" + "e".repeat(40);
const ZERO = "0x" + "0".repeat(40);
const pad = (a) => "0x" + a.replace(/^0x/, "").padStart(64, "0");

function fakeSources({ tokens, incoming = [], txs = {}, owners = null }) {
  const explorer = { listNfts: async () => tokens, listIncoming: async (_w, _c, from) => incoming.filter((t) => t.blockNumber >= from) };
  const rpc = {
    transaction: async (hash) => txs[hash],
    balanceOf: async () => tokens.length,
    ownerOf: async (_c, id) => (owners && owners[id]) || W,
    listIncoming: explorer.listIncoming,
  };
  return { explorer, rpc };
}

test("held before the boss opened → every token is eligible; nothing held → not held", async () => {
  const { explorer, rpc } = fakeSources({ tokens: ["1", "2"], incoming: [{ tokenId: "1", from: SELLER, blockNumber: 50, txHash: "0xa" }] });
  const r = await C.checkCollection({ wallet: W, contract: CONTRACT, openedBlock: 100, explorer, rpc });
  assert.deepEqual(r.eligible, ["held-before-opening:2"]);
  assert.equal(r.held, 2);
  const none = await C.checkCollection({ wallet: W, contract: CONTRACT, openedBlock: 100, ...fakeSources({ tokens: [] }) });
  assert.equal(none.held, 0);
});

test("after opening: mint counts, Seaport purchase counts, payment to the previous owner counts, plain transfer does not", async () => {
  const incoming = [
    { tokenId: "1", from: ZERO, blockNumber: 120, txHash: "0xmint" },
    { tokenId: "2", from: SELLER, blockNumber: 130, txHash: "0xbuy" },
    { tokenId: "3", from: SELLER, blockNumber: 140, txHash: "0xpaid" },
    { tokenId: "4", from: SELLER, blockNumber: 150, txHash: "0xplain" },
  ];
  const txs = {
    "0xbuy": { to: SEAPORT, value: 0n, logs: [] },
    "0xpaid": { to: CONTRACT, value: 0n, logs: [{ address: WETH, topics: [C.TRANSFER_TOPIC, pad(W), pad(SELLER)], data: "0x01" }] },
    "0xplain": { to: CONTRACT, value: 0n, logs: [{ address: CONTRACT, topics: [C.TRANSFER_TOPIC, pad(SELLER), pad(W), pad("1")], data: "0x" }] },
  };
  const { explorer, rpc } = fakeSources({ tokens: ["1", "2", "3", "4", "5"], incoming, txs });
  const r = await C.checkCollection({ wallet: W, contract: CONTRACT, openedBlock: 100, marketplaces: [SEAPORT], explorer, rpc });
  assert.deepEqual(r.eligible, ["held-before-opening:1", "1", "2", "3"]);
  assert.deepEqual(r.rejected, [{ tokenId: "4", reason: "plain_transfer_after_open" }]);

  // Only one token, it arrived by plain transfer after opening → nothing eligible.
  const only = fakeSources({ tokens: ["4"], incoming: [incoming[3]], txs });
  const r2 = await C.checkCollection({ wallet: W, contract: CONTRACT, openedBlock: 100, marketplaces: [SEAPORT], ...only });
  assert.deepEqual(r2.eligible, []);
  assert.equal(r2.rejected.length, 1);

  // A token that arrived after opening but already left again is ignored (ownerOf ≠ wallet).
  const gone = fakeSources({ tokens: ["9"], incoming: [{ tokenId: "4", from: SELLER, blockNumber: 150, txHash: "0xplain" }], txs, owners: { 4: SELLER } });
  const r3 = await C.checkCollection({ wallet: W, contract: CONTRACT, openedBlock: 100, ...gone });
  assert.deepEqual(r3.eligible, ["held-before-opening:1"]);
});

test("RPC down → explorer fallback; both down → CHECK_UNAVAILABLE; results are cached", async () => {
  const rpc = { balanceOf: async () => { throw new Error("rpc down"); }, listIncoming: async () => { throw new Error("rpc down"); }, transaction: async () => null };
  const explorer = { listNfts: async () => ["9"], listIncoming: async () => [] };
  const cache = new Map();
  let now = 1000;
  const r = await C.checkCollection({ wallet: W, contract: CONTRACT, openedBlock: 10, explorer, rpc, cache, now: () => now });
  assert.equal(r.source, "explorer");
  assert.deepEqual(r.eligible, ["held-before-opening:1"]);
  explorer.listNfts = async () => { throw new Error("down"); };
  const cached = await C.checkCollection({ wallet: W, contract: CONTRACT, openedBlock: 10, explorer, rpc, cache, now: () => now });
  assert.deepEqual(cached.eligible, ["held-before-opening:1"], "served from cache");
  now += C.CACHE_TTL_MS + 1;
  await assert.rejects(() => C.checkCollection({ wallet: W, contract: CONTRACT, openedBlock: 10, explorer, rpc, cache, now: () => now }), { httpCode: "CHECK_UNAVAILABLE" });
});

test("withTimeout rejects slow checks with CHECK_TIMEOUT", async () => {
  await assert.rejects(() => C.withTimeout(new Promise((resolve) => setTimeout(resolve, 50)), 5), { httpCode: "CHECK_TIMEOUT" });
  assert.equal(await C.withTimeout(Promise.resolve("ok"), 50), "ok");
});
