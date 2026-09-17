const test = require("node:test");
const assert = require("node:assert/strict");

const { evmWallet, seedBalance, toRaw, withTokenEnv } = require("./helpers/token-test-utils");

// Decision 2026-09-17: tokens never leave the launch wallet. The server-side
// "operator" key only signs transferFrom() within an allowance the launch
// wallet granted once; deposits go to the launch wallet as well.

const PLAYER = evmWallet("1");
const SOURCE = evmWallet("5"); // launch wallet holding the pool
const withSource = { env: { TOKEN_PAYOUT_SOURCE: SOURCE } };

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

test("payout source: env exposes the source and uses it as the deposit address", async () => {
  await withTokenEnv(async ({ tokenChain }) => {
    const env = tokenChain.getTokenEnv();
    assert.equal(env.payoutSource, SOURCE);
    assert.equal(env.depositAddress, SOURCE);
    assert.notEqual(env.treasuryAddress, SOURCE, "operator (signer) is a different wallet");
    assert.equal(env.configured, true);
  }, withSource);
  await withTokenEnv(async ({ tokenChain }) => {
    const env = tokenChain.getTokenEnv();
    assert.equal(env.payoutSource, null);
    assert.equal(env.depositAddress, env.treasuryAddress, "without a source the operator itself holds the pool");
  });
});

test("payout source: available = min(source balance, allowance); withdrawals go out as transferFrom", async () => {
  await withTokenEnv(async ({ chain, configOverrides, deps, store, token }) => {
    configOverrides.WITHDRAW_ENABLED = 1;
    await seedBalance(store, PLAYER, 5000);
    chain.state.source.tokensRaw = BigInt(toRaw(100_000));
    chain.state.source.allowanceRaw = BigInt(toRaw(700));

    const snapshot = await chain.getTreasurySnapshot();
    assert.equal(snapshot.sourceAddress, SOURCE);
    assert.equal(snapshot.availableRaw, toRaw(700));

    const config = await token.getTokenConfigForWallet(PLAYER, deps);
    assert.equal(config.treasury.available, "700");
    assert.equal(config.deposit.address, SOURCE);

    // more than the allowance → refused before any debit, even though the source is rich
    await expectFail(token.requestWithdraw(PLAYER, 1000, deps, { isAdmin: false }), "INSUFFICIENT_TREASURY");
    let profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 5000);

    const result = await token.requestWithdraw(PLAYER, 500, deps, { isAdmin: false });
    assert.equal(result.status, "sent");
    const sent = chain.state.sentTxs[0];
    assert.equal(sent.from, SOURCE, "tokens leave the launch wallet, not the operator");
    assert.equal(sent.to, PLAYER);
    assert.equal(sent.amountRaw, toRaw(500));
    chain.confirm(sent.txHash);
    assert.equal(chain.state.source.allowanceRaw.toString(), toRaw(200), "allowance is consumed");
    assert.equal(chain.state.source.tokensRaw.toString(), toRaw(99_500));
    profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.withdrawals[0].treasury, SOURCE, "record keeps the payout source for audit");
  }, withSource);
});

test("payout source: deposits are credited only when sent to the source; operator/source transfers are ignored", async () => {
  await withTokenEnv(async ({ chain, deps, store, token, tokenChain }) => {
    const operator = tokenChain.getTokenEnv().treasuryAddress;
    const ok = chain.mineIncoming(PLAYER, 300); // fake mines to depositAddress (= source)
    const toOperator = chain.mineIncoming(PLAYER, 300, { to: operator });
    chain.mineIncoming(operator, 50); // operator → source (gas wallet shuffling) — never Points
    chain.advance(12);

    const credited = await token.confirmDeposit(PLAYER, ok, deps);
    assert.equal(credited.status, "credited");
    await expectFail(token.confirmDeposit(PLAYER, toOperator, deps), "BAD_REQUEST");

    const run = await token.syncDeposits(deps);
    assert.equal(run.credited.length, 0, "fast path already credited the good one");
    assert.equal(run.skippedInternal, 1, "operator → source is internal");
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 300);
  }, withSource);
});

test("payout source: admin stats show the source balance, allowance and a low-allowance warning", async () => {
  await withTokenEnv(async ({ chain, configOverrides, deps, store, token }) => {
    configOverrides.WITHDRAW_ENABLED = 1;
    await seedBalance(store, PLAYER, 5000);
    chain.state.source.tokensRaw = BigInt(toRaw(50_000));
    chain.state.source.allowanceRaw = BigInt(toRaw(1_500));
    await token.requestWithdraw(PLAYER, 1000, deps, { isAdmin: false });

    const stats = await token.adminStats(deps);
    assert.equal(stats.treasury.source, SOURCE);
    assert.equal(stats.treasury.tokens, "50000");
    assert.equal(stats.treasury.allowance, "1500");
    assert.equal(stats.treasury.lowAllowance, false, "1500 allowance ≥ 1000 paid in the last 7 days");

    chain.state.source.allowanceRaw = BigInt(toRaw(400));
    const again = await token.adminStats(deps);
    assert.equal(again.treasury.lowAllowance, true);
    assert.equal(again.treasury.lowTokens, false);
  }, withSource);
});
