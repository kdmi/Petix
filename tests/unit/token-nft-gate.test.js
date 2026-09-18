const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BASE_NOW,
  evmWallet,
  freshDispatcher,
  invokeJsonHandler,
  seedBalance,
  sessionHeaders,
  withTokenEnv,
} = require("./helpers/token-test-utils");

const ADMIN = evmWallet("a");
const PLAYER = evmWallet("1");
const HOUR = 3600000;

async function expectFail(promise, code) {
  let caught = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `expected failure ${code}`);
  assert.equal(caught.httpCode, code);
  return caught;
}

function requireNft(configOverrides, hours = 48) {
  configOverrides.WITHDRAW_ENABLED = 1;
  configOverrides.WITHDRAW_REQUIRE_NFT = 1;
  configOverrides.WITHDRAW_NFT_HOLD_HOURS = hours;
}

test("nft gate: no capsule → NFT_REQUIRED, nothing debited", async () => {
  await withTokenEnv(async ({ chain, configOverrides, deps, store, token }) => {
    requireNft(configOverrides);
    await seedBalance(store, PLAYER, 5000);
    const config = await token.getTokenConfigForWallet(PLAYER, deps);
    assert.equal(config.enabled, false);
    assert.equal(config.reason, "NFT_REQUIRED");
    assert.equal(config.nft.required, true);
    assert.equal(config.nft.holdHours, 48);
    assert.equal(config.nft.held, 0);
    assert.equal(config.nft.eligible, false);
    assert.equal(config.nft.marketplaceUrl, "https://market.test/capsules");
    // Deposits stay open for a wallet the capsule rule blocks from withdrawing.
    assert.equal(config.deposit.address, chain.state.treasury.address);

    await expectFail(token.requestWithdraw(PLAYER, 1000, deps, { isAdmin: false }), "NFT_REQUIRED");
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 5000);
    assert.equal((profile.withdrawals || []).length, 0);
  });
});

test("nft gate: young capsule → NFT_HOLD_TOO_SHORT with eligibleAt; old capsule → allowed", async () => {
  await withTokenEnv(async ({ configOverrides, deps, nftFake, store, token }) => {
    requireNft(configOverrides);
    await seedBalance(store, PLAYER, 5000);
    nftFake.setHoldings(PLAYER, [{ tokenId: 5, since: BASE_NOW - 10 * HOUR }]);

    let config = await token.getTokenConfigForWallet(PLAYER, deps);
    assert.equal(config.reason, "NFT_HOLD_TOO_SHORT");
    assert.equal(config.nft.held, 1);
    assert.equal(config.nft.eligibleAt, new Date(BASE_NOW - 10 * HOUR + 48 * HOUR).toISOString());
    const refused = await expectFail(token.requestWithdraw(PLAYER, 1000, deps, { isAdmin: false }), "NFT_HOLD_TOO_SHORT");
    assert.equal(refused.eligibleAt, config.nft.eligibleAt);

    // several capsules: the oldest continuous hold counts
    nftFake.setHoldings(PLAYER, [
      { tokenId: 5, since: BASE_NOW - 10 * HOUR },
      { tokenId: 6, since: BASE_NOW - 72 * HOUR },
    ]);
    config = await token.getTokenConfigForWallet(PLAYER, deps);
    assert.equal(config.enabled, true);
    assert.equal(config.reason, null);
    assert.equal(config.nft.eligible, true);
    assert.equal(config.nft.oldestSince, new Date(BASE_NOW - 72 * HOUR).toISOString());

    const result = await token.requestWithdraw(PLAYER, 1000, deps, { isAdmin: false });
    assert.equal(result.status, "sent");
    assert.deepEqual(nftFake.ownerOfCalls, [6], "the qualifying token is verified live on-chain");
  });
});

test("nft gate: live ownerOf disagrees with the index → refused, nothing debited", async () => {
  await withTokenEnv(async ({ configOverrides, deps, nftFake, store, token }) => {
    requireNft(configOverrides);
    await seedBalance(store, PLAYER, 5000);
    nftFake.setHoldings(PLAYER, [{ tokenId: 5, since: BASE_NOW - 72 * HOUR }]);
    nftFake.liveOwners.set(5, evmWallet("2")); // sold a minute ago, index not yet updated
    await expectFail(token.requestWithdraw(PLAYER, 1000, deps, { isAdmin: false }), "NFT_REQUIRED");
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 5000);
  });
});

test("nft gate: NFT feature off or index failing → NFT_INDEX_UNAVAILABLE for players", async () => {
  await withTokenEnv(async ({ configOverrides, deps, nftFake, store, token }) => {
    requireNft(configOverrides);
    await seedBalance(store, PLAYER, 5000);
    nftFake.enabled = false;
    let config = await token.getTokenConfigForWallet(PLAYER, deps);
    assert.equal(config.reason, "NFT_INDEX_UNAVAILABLE");
    await expectFail(token.requestWithdraw(PLAYER, 1000, deps, { isAdmin: false }), "NFT_INDEX_UNAVAILABLE");

    nftFake.enabled = true;
    nftFake.failHoldings = true;
    config = await token.getTokenConfigForWallet(PLAYER, deps);
    assert.equal(config.reason, "NFT_INDEX_UNAVAILABLE");
  });
});

test("nft gate: admins are exempt; WITHDRAW_REQUIRE_NFT=0 disables the rule; hold hours are tunable", async () => {
  await withTokenEnv(async ({ configOverrides, deps, nftFake, store, token }) => {
    requireNft(configOverrides);
    await seedBalance(store, ADMIN, 5000);
    await seedBalance(store, PLAYER, 5000);

    const adminConfig = await token.getTokenConfigForWallet(ADMIN, deps);
    assert.equal(adminConfig.enabled, true);
    assert.equal(adminConfig.nft.exempt, true);
    assert.equal(adminConfig.nft.wouldBlock, "NFT_REQUIRED", "exempt admins still see what the rule would say");
    const adminResult = await token.requestWithdraw(ADMIN, 1000, deps, { isAdmin: true });
    assert.equal(adminResult.status, "sent");

    // an exempt admin holding a young capsule sees the hold data and the would-be verdict
    nftFake.setHoldings(ADMIN, [{ tokenId: 21, since: BASE_NOW - 40 * HOUR }]);
    const adminHolding = await token.getTokenConfigForWallet(ADMIN, deps);
    assert.equal(adminHolding.enabled, true);
    assert.equal(adminHolding.nft.held, 1);
    assert.equal(adminHolding.nft.oldestSince, new Date(BASE_NOW - 40 * HOUR).toISOString());
    assert.equal(adminHolding.nft.eligibleAt, new Date(BASE_NOW + 8 * HOUR).toISOString());
    assert.equal(adminHolding.nft.wouldBlock, "NFT_HOLD_TOO_SHORT");

    nftFake.setHoldings(PLAYER, [{ tokenId: 5, since: BASE_NOW - 2 * HOUR }]);
    configOverrides.WITHDRAW_NFT_HOLD_HOURS = 1;
    let config = await token.getTokenConfigForWallet(PLAYER, deps);
    assert.equal(config.enabled, true, "a 1h threshold makes a 2h-old capsule eligible");

    configOverrides.WITHDRAW_NFT_HOLD_HOURS = 48;
    configOverrides.WITHDRAW_REQUIRE_NFT = 0;
    config = await token.getTokenConfigForWallet(PLAYER, deps);
    assert.equal(config.enabled, true);
    assert.equal(config.nft.required, false);
  });
});

test("nft gate over HTTP: config carries the nft block, withdraw-request maps to 403", async () => {
  await withTokenEnv(async ({ configOverrides, deps, economyConfig, nftFake, store, token }) => {
    requireNft(configOverrides);
    await economyConfig.setEconomyConfig(
      { WITHDRAW_ENABLED: 1, WITHDRAW_REQUIRE_NFT: 1, WITHDRAW_NFT_HOLD_HOURS: 48 },
      { adminWallet: ADMIN }
    );
    await seedBalance(store, PLAYER, 5000);
    nftFake.setHoldings(PLAYER, [{ tokenId: 5, since: BASE_NOW - 3 * HOUR }]);
    const dispatcher = freshDispatcher(token, deps);
    const headers = sessionHeaders(PLAYER);

    const config = await invokeJsonHandler(dispatcher, { url: "/api/token/config", headers });
    assert.equal(config.body.reason, "NFT_HOLD_TOO_SHORT");
    assert.equal(typeof config.body.nft.eligibleAt, "string");

    const refused = await invokeJsonHandler(dispatcher, {
      method: "POST",
      url: "/api/token/withdraw-request",
      headers,
      body: { amount: 1000 },
    });
    assert.equal(refused.status, 403);
    assert.equal(refused.body.code, "NFT_HOLD_TOO_SHORT");
    assert.equal(refused.body.eligibleAt, config.body.nft.eligibleAt);
  });
});
