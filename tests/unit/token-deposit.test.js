const test = require("node:test");
const assert = require("node:assert/strict");

const { evmWallet, seedBalance, toRaw, withTokenEnv } = require("./helpers/token-test-utils");

const PLAYER = evmWallet("1");
const INTERNAL = evmWallet("e"); // in TOKEN_INTERNAL_WALLETS of the test env

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

test("deposit-prepare: address + raw amount + a ready-to-send ERC-20 transfer payload", async () => {
  await withTokenEnv(async ({ chain, deps, token }) => {
    const prepared = await token.prepareDeposit(PLAYER, 1000, deps, { isAdmin: true });
    assert.equal(prepared.address, chain.state.treasury.address);
    assert.equal(prepared.amount, 1000);
    assert.equal(prepared.amountRaw, toRaw(1000));
    assert.equal(prepared.tx.to, chain.state.tokenContract);
    assert.equal(prepared.tx.value, "0x0");
    assert.equal(prepared.tx.chainId, "0x1237");
    assert.ok(prepared.tx.data.startsWith("0xa9059cbb"), "transfer(address,uint256) selector");
    assert.ok(prepared.tx.data.includes(chain.state.treasury.address.slice(2)));

    await expectFail(token.prepareDeposit(PLAYER, 0, deps, { isAdmin: true }), "BAD_REQUEST");
    await expectFail(token.prepareDeposit(PLAYER, 1.5, deps, { isAdmin: true }), "BAD_REQUEST");
  });
});

test("deposit-confirm: credits once, keeps totalEarned, is idempotent", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    await seedBalance(store, PLAYER, 100);
    const txHash = chain.mineIncoming(PLAYER, 1000);
    chain.advance(12); // confirmations

    const first = await token.confirmDeposit(PLAYER, txHash, deps);
    assert.equal(first.status, "credited");
    assert.equal(first.points, 1000);
    assert.equal(first.balance, 1100);

    const again = await token.confirmDeposit(PLAYER, txHash, deps);
    assert.equal(again.status, "already_credited");
    assert.equal(again.balance, 1100);

    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 1100);
    assert.equal(profile.currency.totalEarned, 100, "deposits are not emission");
    assert.equal(profile.deposits.length, 1);
    assert.equal(profile.deposits[0].source, "fast");
    assert.equal(profile.deposits[0].txHash, txHash);
    assert.equal(profile.deposits[0].key, `${txHash}:0`);

    const state = await deps.tokenStore.readTokenState();
    assert.equal(deps.tokenStore.hasKey(state, `${txHash}:0`), true);
    assert.deepEqual(state.recentWallets, [PLAYER]);
  });
});

test("deposit-confirm: fractional tokens are floored, zero whole tokens is rejected", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    const txHash = chain.mineIncoming(PLAYER, (BigInt(toRaw(2)) + 10n ** 17n).toString()); // 2.1 tokens
    chain.advance(12);
    const result = await token.confirmDeposit(PLAYER, txHash, deps);
    assert.equal(result.points, 2);
    const tiny = chain.mineIncoming(PLAYER, "1"); // 1 wei
    chain.advance(12);
    await expectFail(token.confirmDeposit(PLAYER, tiny, deps), "BAD_REQUEST");
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 2);
  });
});

test("deposit-confirm: pending while confirmations are short", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    const txHash = chain.mineIncoming(PLAYER, 500);
    chain.advance(3);
    const result = await token.confirmDeposit(PLAYER, txHash, deps);
    assert.equal(result.status, "pending");
    assert.equal(result.confirmations, 4);
    assert.equal(result.required, 12);
    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 0);
  });
});

test("deposit-confirm: rejects wrong contract, wrong recipient, foreign sender, internal wallets, failed tx, unknown tx", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    // failed tx
    const failed = chain.mineIncoming(PLAYER, 100);
    chain.state.receipts.get(failed).status = 0;
    // transfer of another token
    const otherToken = chain.mineIncoming(PLAYER, 100);
    chain.state.receipts.get(otherToken).logs[0].address = evmWallet("d");
    // transfer to someone else
    const elsewhere = chain.mineIncoming(PLAYER, 100);
    chain.state.receipts.get(elsewhere).logs[0].to = evmWallet("9");
    // sent by another wallet
    const foreign = chain.mineIncoming(evmWallet("2"), 100);
    // top-up from an internal (project) wallet
    const internal = chain.mineIncoming(INTERNAL, 100);
    chain.advance(12);

    await expectFail(token.confirmDeposit(PLAYER, failed, deps), "TX_FAILED");
    await expectFail(token.confirmDeposit(PLAYER, otherToken, deps), "BAD_REQUEST");
    await expectFail(token.confirmDeposit(PLAYER, elsewhere, deps), "BAD_REQUEST");
    await expectFail(token.confirmDeposit(PLAYER, foreign, deps), "BAD_REQUEST");
    await expectFail(token.confirmDeposit(INTERNAL, internal, deps), "BAD_REQUEST");
    await expectFail(token.confirmDeposit(PLAYER, "0x" + "0".repeat(64), deps), "NOT_FOUND");
    await expectFail(token.confirmDeposit(PLAYER, "garbage", deps), "BAD_REQUEST");

    const profile = await store.getWalletProfile(PLAYER);
    assert.equal(profile.currency.balance, 0);
    assert.equal((profile.deposits || []).length, 0);
  });
});
