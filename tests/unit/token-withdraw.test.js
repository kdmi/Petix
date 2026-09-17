const test = require("node:test");
const assert = require("node:assert/strict");

const { evmWallet, seedBalance, toRaw, withTokenEnv } = require("./helpers/token-test-utils");

const PLAYER = evmWallet("1");

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

test("withdraw: happy path → confirmed, Points debited, tx recorded, dailyOut bumped", async () => {
  await withTokenEnv(async ({ chain, deps, store, token, tokenStore, clock }) => {
    await seedBalance(store, PLAYER, 1000);
    // the network mines our transfer as soon as it is broadcast
    const originalSend = chain.sendTransfer;
    chain.sendTransfer = async (...args) => {
      const sent = await originalSend(...args);
      chain.confirm(sent.txHash);
      return sent;
    };

    const result = await token.requestWithdraw(PLAYER, 500, deps, { isAdmin: true });

    assert.equal(result.status, "confirmed");
    assert.equal(result.amount, 500);
    assert.equal(result.petixSent, 500);
    assert.equal(result.balance, 500);
    assert.match(result.txHash, /^0x[0-9a-f]{64}$/);
    assert.equal(result.explorerUrl, `https://explorer.test/tx/${result.txHash}`);

    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 500);
    const record = profile.withdrawals[0];
    assert.equal(record.status, "confirmed");
    assert.equal(record.txHash, result.txHash);
    assert.equal(record.nonce, 7);
    assert.equal(record.amountRaw, toRaw(500));
    assert.equal(record.treasury, chain.state.treasury.address);

    assert.equal(chain.state.sentTxs[0].to, PLAYER);
    assert.equal(chain.state.sentTxs[0].amountRaw, toRaw(500));

    const state = await tokenStore.readTokenState();
    assert.equal(tokenStore.dailyOutFor(state, clock.now), 500);
    assert.deepEqual(state.recentWallets, [PLAYER]);
    assert.equal(state.sendLock, null);
  });
});

test("withdraw: receipt not yet mined → status sent, Points stay debited", async () => {
  await withTokenEnv(async ({ deps, store, token }) => {
    await seedBalance(store, PLAYER, 1000);
    const result = await token.requestWithdraw(PLAYER, 300, deps, { isAdmin: true });
    assert.equal(result.status, "sent");
    assert.match(result.txHash, /^0x/);
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 700);
    assert.equal(profile.withdrawals[0].status, "sent");
  });
});

test("withdraw: validation and preflight failures never debit Points", async () => {
  await withTokenEnv(async ({ chain, configOverrides, deps, store, token }) => {
    await seedBalance(store, PLAYER, 1000);
    const balanceUnchanged = async () => {
      const profile = await store.getWalletProfile(PLAYER);
      assert.equal(profile.currency.balance, 1000);
      assert.equal((profile.withdrawals || []).length, 0);
    };

    await expectFail(token.requestWithdraw(PLAYER, 0, deps, { isAdmin: true }), "BAD_REQUEST");
    await expectFail(token.requestWithdraw(PLAYER, 12.5, deps, { isAdmin: true }), "BAD_REQUEST");
    await expectFail(token.requestWithdraw(PLAYER, 100, deps, { isAdmin: true }), "BELOW_MIN");
    await expectFail(token.requestWithdraw(PLAYER, 5000, deps, { isAdmin: true }), "INSUFFICIENT_BALANCE");

    configOverrides.WITHDRAW_MAX_PER_TX = 250;
    const capped = await expectFail(token.requestWithdraw(PLAYER, 300, deps, { isAdmin: true }), "ABOVE_MAX_PER_TX");
    assert.equal(capped.maxPerTx, 250);
    delete configOverrides.WITHDRAW_MAX_PER_TX;

    // admin-only mode
    await expectFail(token.requestWithdraw(PLAYER, 300, deps, { isAdmin: false }), "WITHDRAW_ADMIN_ONLY");
    configOverrides.WITHDRAW_ENABLED = 1;

    chain.state.treasury.tokensRaw = BigInt(toRaw(100));
    await expectFail(token.requestWithdraw(PLAYER, 300, deps, { isAdmin: false }), "INSUFFICIENT_TREASURY");
    chain.state.treasury.tokensRaw = BigInt(toRaw(1_000_000));

    chain.state.treasury.ethWei = 1n;
    await expectFail(token.requestWithdraw(PLAYER, 300, deps, { isAdmin: false }), "TREASURY_LOW_GAS");
    chain.state.treasury.ethWei = 10n ** 18n;

    chain.state.gasEstimateFails = true;
    await expectFail(token.requestWithdraw(PLAYER, 300, deps, { isAdmin: false }), "SEND_FAILED");
    chain.state.gasEstimateFails = false;

    chain.state.rpcDown = true;
    await expectFail(token.requestWithdraw(PLAYER, 300, deps, { isAdmin: false }), "RPC_UNAVAILABLE");
    chain.state.rpcDown = false;

    await balanceUnchanged();
    assert.equal(chain.state.sentTxs.length, 0);
  });
});

test("withdraw: broadcast failure refunds in the same call and records failed", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    await seedBalance(store, PLAYER, 1000);
    const boom = new Error("insufficient funds for gas");
    boom.code = "SEND_FAILED";
    chain.state.failNextSend = boom;

    await expectFail(token.requestWithdraw(PLAYER, 300, deps, { isAdmin: true }), "SEND_FAILED");

    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 1000);
    assert.equal(profile.withdrawals.length, 1);
    assert.equal(profile.withdrawals[0].status, "failed");
    assert.equal(profile.withdrawals[0].reason, "SEND_FAILED");
    const state = await deps.tokenStore.readTokenState();
    assert.equal(state.sendLock, null, "lock must be released after a failed send");
  });
});

test("withdraw: a single nonce conflict is retried with a fresh nonce", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    await seedBalance(store, PLAYER, 1000);
    chain.state.nonceConflictOnce = true;
    const result = await token.requestWithdraw(PLAYER, 300, deps, { isAdmin: true });
    assert.equal(result.status, "sent");
    assert.equal(chain.state.sentTxs.length, 1);
    assert.equal(chain.state.sentTxs[0].nonce, chain.state.treasury.noncePending - 1);
  });
});

test("withdraw: receipt with status 0 → failed + refund → TX_FAILED", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    await seedBalance(store, PLAYER, 1000);
    const originalSend = chain.sendTransfer;
    chain.sendTransfer = async (...args) => {
      const sent = await originalSend(...args);
      chain.confirm(sent.txHash, { status: 0 });
      return sent;
    };
    await expectFail(token.requestWithdraw(PLAYER, 300, deps, { isAdmin: true }), "TX_FAILED");
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 1000);
    assert.equal(profile.withdrawals[0].status, "failed");
  });
});

test("withdraw: two concurrent requests for the whole balance → exactly one succeeds", async () => {
  await withTokenEnv(async ({ deps, store, token }) => {
    await seedBalance(store, PLAYER, 1000);
    const results = await Promise.allSettled([
      token.requestWithdraw(PLAYER, 1000, deps, { isAdmin: true }),
      token.requestWithdraw(PLAYER, 1000, deps, { isAdmin: true }),
    ]);
    const ok = results.filter((entry) => entry.status === "fulfilled");
    const failed = results.filter((entry) => entry.status === "rejected");
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    assert.equal(failed[0].reason.httpCode, "INSUFFICIENT_BALANCE");
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 0);
    assert.equal(profile.withdrawals.filter((record) => record.status !== "failed").length, 1);
  });
});
