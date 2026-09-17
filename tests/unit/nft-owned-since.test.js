const test = require("node:test");
const assert = require("node:assert/strict");

const { BASE_NOW, evmWallet, withNftEnv } = require("./helpers/nft-test-utils");

// Feature 019 / US7: the ownership index must know WHEN each capsule reached
// its current owner (block timestamp), so withdrawals can require a 48h hold.

test("owned-since: normalizeState carries ownedSince and the backfill marker", async () => {
  await withNftEnv(async ({ nftStore }) => {
    const empty = nftStore.normalizeState(null);
    assert.deepEqual(empty.ownedSince, {});
    assert.equal(empty.ownedSinceBackfilledAt, null);

    const parsed = nftStore.normalizeState({
      owners: { 7: evmWallet("1") },
      ownedSince: { 7: { blockNumber: 120, at: "2026-09-14T10:00:00.000Z" }, 8: { garbage: true } },
      ownedSinceBackfilledAt: "2026-09-15T00:00:00.000Z",
    });
    assert.deepEqual(parsed.ownedSince, { 7: { blockNumber: 120, at: "2026-09-14T10:00:00.000Z" } });
    assert.equal(parsed.ownedSinceBackfilledAt, "2026-09-15T00:00:00.000Z");
  });
});

test("owned-since: applyTransferToIndex records owner + since, burn clears both, holdingsOf aggregates", async () => {
  await withNftEnv(async ({ nftStore }) => {
    const state = nftStore.normalizeState(null);
    const a = evmWallet("1");
    const b = evmWallet("2");
    nftStore.applyTransferToIndex(state, { tokenId: 1, from: null, to: a, blockNumber: 100 }, "2026-09-10T00:00:00.000Z");
    nftStore.applyTransferToIndex(state, { tokenId: 2, from: null, to: a, blockNumber: 150 }, "2026-09-12T00:00:00.000Z");
    nftStore.applyTransferToIndex(state, { tokenId: 3, from: null, to: b, blockNumber: 160 }, "2026-09-13T00:00:00.000Z");
    assert.equal(state.owners["1"], a);
    assert.deepEqual(state.ownedSince["1"], { blockNumber: 100, at: "2026-09-10T00:00:00.000Z" });

    // token 2 moves a → b: b's since restarts at the new block, a keeps token 1
    nftStore.applyTransferToIndex(state, { tokenId: 2, from: a, to: b, blockNumber: 200 }, "2026-09-16T00:00:00.000Z");
    assert.equal(state.owners["2"], b);
    assert.deepEqual(state.ownedSince["2"], { blockNumber: 200, at: "2026-09-16T00:00:00.000Z" });

    const holdingsA = nftStore.holdingsOf(state, a);
    assert.deepEqual(holdingsA.tokens.map((entry) => entry.tokenId), [1]);
    assert.equal(holdingsA.oldestSince, "2026-09-10T00:00:00.000Z");
    const holdingsB = nftStore.holdingsOf(state, b.toUpperCase());
    assert.deepEqual(holdingsB.tokens.map((entry) => entry.tokenId).sort(), [2, 3]);
    assert.equal(holdingsB.oldestSince, "2026-09-13T00:00:00.000Z");

    // burn
    nftStore.applyTransferToIndex(state, { tokenId: 3, from: b, to: "0x" + "0".repeat(40), blockNumber: 210 }, "2026-09-17T00:00:00.000Z");
    assert.equal("3" in state.owners, false);
    assert.equal("3" in state.ownedSince, false);
    assert.deepEqual(nftStore.holdingsOf(state, evmWallet("9")), { tokens: [], oldestSince: null });
  });
});

test("owned-since: sync fills ownedSince from block timestamps, falls back to sync time", async () => {
  await withNftEnv(async ({ chain, deps, nft, nftStore }) => {
    const a = evmWallet("1");
    chain.mintTo(11, a); // block 101
    chain.mintTo(12, a); // block 102
    await nft.syncTransfers(deps);

    let state = await nftStore.readNftState();
    assert.equal(state.owners["11"], a);
    assert.equal(state.ownedSince["11"].blockNumber, 101);
    assert.equal(state.ownedSince["11"].at, new Date(chain.blockTimestamp(101)).toISOString());
    assert.equal(state.ownedSince["12"].at, new Date(chain.blockTimestamp(102)).toISOString());

    // block lookups fail → the sync time is used, the index still advances
    chain.state.failBlockTimestamps = true;
    chain.transfer(11, evmWallet("2"));
    await nft.syncTransfers(deps);
    state = await nftStore.readNftState();
    assert.equal(state.owners["11"], evmWallet("2"));
    assert.equal(state.ownedSince["11"].at, new Date(BASE_NOW).toISOString());
  });
});

test("owned-since: backfill restores since for tokens indexed before the field existed", async () => {
  await withNftEnv(async ({ chain, deps, nft, nftStore }) => {
    const a = evmWallet("1");
    const b = evmWallet("2");
    chain.mintTo(21, a); // 101
    chain.mintTo(22, b); // 102
    chain.transfer(22, a); // 103 — a acquired 22 at block 103
    await nft.syncTransfers(deps);

    // simulate a pre-feature index: owners known, since unknown
    await nftStore.withNftState((current) => {
      current.ownedSince = {};
      current.ownedSinceBackfilledAt = null;
      return current;
    });
    let state = await nftStore.readNftState();
    assert.deepEqual(nftStore.holdingsOf(state, a).oldestSince, null);

    await nft.syncTransfers(deps); // triggers the one-off backfill
    state = await nftStore.readNftState();
    assert.equal(state.ownedSince["21"].blockNumber, 101);
    assert.equal(state.ownedSince["22"].blockNumber, 103, "last transfer to the CURRENT owner, not the mint");
    assert.ok(state.ownedSinceBackfilledAt);
    const holdings = nftStore.holdingsOf(state, a);
    assert.equal(holdings.oldestSince, new Date(chain.blockTimestamp(101)).toISOString());

    // getWalletHoldings is the API token.js consumes
    const viaApi = await nft.getWalletHoldings(a, deps);
    assert.deepEqual(viaApi.tokens.map((entry) => entry.tokenId).sort(), [21, 22]);
    assert.equal(viaApi.oldestSince, holdings.oldestSince);
  });
});
