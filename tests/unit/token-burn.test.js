const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { evmWallet, withTokenEnv } = require("./helpers/token-test-utils");

const TOKEN_BURN_PATH = path.resolve(__dirname, "../../api/_lib/token-burn.js");

function freshBurn() {
  delete require.cache[require.resolve(TOKEN_BURN_PATH)];
  return require(TOKEN_BURN_PATH);
}

// Фейковая цепь подтверждает транзакцию только по явной команде, поэтому
// подменяем чтение квитанции: 1 — подтверждена, 0 — отвергнута, null — ещё в пути.
function burnDeps({ chain, tokenStore, clock, receipt = 1 }) {
  const wrapped = {
    ...chain,
    async getReceipt(txHash) {
      if (receipt === null) return null;
      return { status: receipt, blockNumber: 1, confirmations: 1, to: null, logs: [] };
    },
  };
  return {
    chain: wrapped,
    tokenStore,
    now: () => clock.now,
    sleep: async () => {},
    receiptPollAttempts: 2,
    receiptPollMs: 0,
    lockWaitMs: 1,
    lockPollMs: 1,
  };
}

async function queueSpend(tokenStore, points, reason = "pet_creation") {
  await tokenStore.withTokenState((state) => tokenStore.addSpend(state, { points, reason }));
}

test("burning sends the queued amount to the burn address and empties the queue", async () => {
  await withTokenEnv(
    async ({ chain, clock, tokenStore }) => {
      const { burnQueued, BURN_ADDRESS } = freshBurn();
      await queueSpend(tokenStore, 25200);

      const result = await burnQueued({}, burnDeps({ chain, tokenStore, clock }));

      assert.equal(result.points, 25200);
      assert.equal(result.burnAddress, BURN_ADDRESS);
      assert.equal(result.status, "confirmed");

      const sent = chain.state.sentTxs.at(-1);
      assert.equal(String(sent.to).toLowerCase(), BURN_ADDRESS.toLowerCase());
      assert.equal(sent.amountRaw, (25200n * 10n ** 18n).toString());

      const state = await tokenStore.readTokenState();
      assert.equal(state.burnQueue.points, 0, "the queue is empty");
      assert.deepEqual(state.burnQueue.byReason, {}, "and so is its breakdown");
      assert.equal(state.burnedTotalPoints, 25200);
      assert.equal(state.burns.length, 1);
      assert.equal(state.burns[0].status, "confirmed");
      assert.equal(state.burns[0].txHash, sent.txHash);
    },
    { env: { TOKEN_PAYOUT_SOURCE: evmWallet("d") } }
  );
});

test("a partial burn leaves the rest queued", async () => {
  await withTokenEnv(
    async ({ chain, clock, tokenStore }) => {
      const { burnQueued } = freshBurn();
      await queueSpend(tokenStore, 25200);
      await queueSpend(tokenStore, 4800);

      const result = await burnQueued({ points: 20000 }, burnDeps({ chain, tokenStore, clock }));

      assert.equal(result.points, 20000);
      const state = await tokenStore.readTokenState();
      assert.equal(state.burnQueue.points, 10000);
      // The largest reason is drained first, so the totals always add up.
      assert.equal(
        Object.values(state.burnQueue.byReason).reduce((sum, n) => sum + n, 0),
        10000
      );
    },
    { env: { TOKEN_PAYOUT_SOURCE: evmWallet("d") } }
  );
});

test("a failed transaction puts the amount back in the queue", async () => {
  await withTokenEnv(
    async ({ chain, clock, tokenStore }) => {
      const { burnQueued } = freshBurn();
      await queueSpend(tokenStore, 25200);
      // The chain rejects the transfer.
      const result = await burnQueued({}, burnDeps({ chain, tokenStore, clock, receipt: 0 }));

      assert.equal(result.status, "failed");
      const state = await tokenStore.readTokenState();
      assert.equal(state.burnQueue.points, 25200, "nothing was burned, nothing is lost");
      assert.deepEqual(state.burnQueue.byReason, { pet_creation: 25200 });
      assert.equal(state.burnedTotalPoints, 0, "a failed burn counts for nothing");
      assert.equal(state.burns[0].status, "failed");
    },
    { env: { TOKEN_PAYOUT_SOURCE: evmWallet("d") } }
  );
});

test("a burn that is still in flight does not stay in the queue", async () => {
  await withTokenEnv(
    async ({ chain, clock, tokenStore }) => {
      const { burnQueued } = freshBurn();
      await queueSpend(tokenStore, 25200);
      // No receipt within the poll window.
      const result = await burnQueued({}, burnDeps({ chain, tokenStore, clock, receipt: null }));

      assert.equal(result.status, "sent");
      const state = await tokenStore.readTokenState();
      // Pressing BURN again must not send the same amount a second time.
      assert.equal(state.burnQueue.points, 0);
      assert.equal(state.burnedTotalPoints, 0, "counted only once it is confirmed");
      assert.equal(state.burns[0].status, "sent");
    },
    { env: { TOKEN_PAYOUT_SOURCE: evmWallet("d") } }
  );
});

test("burning is refused when there is nothing queued or too much is asked for", async () => {
  await withTokenEnv(
    async ({ chain, clock, tokenStore }) => {
      const { burnQueued } = freshBurn();
      const deps = burnDeps({ chain, tokenStore, clock });

      await assert.rejects(() => burnQueued({}, deps), /Nothing to burn/);

      await queueSpend(tokenStore, 1000);
      await assert.rejects(() => burnQueued({ points: 2000 }, deps), /Only 1000 Points/);
      await assert.rejects(() => burnQueued({ points: 0 }, deps), /positive number/);

      assert.equal(chain.state.sentTxs.length, 0, "no transaction left the process");
    },
    { env: { TOKEN_PAYOUT_SOURCE: evmWallet("d") } }
  );
});

test("burning is refused when the allowance is below the queue", async () => {
  await withTokenEnv(
    async ({ chain, clock, tokenStore }) => {
      const { burnQueued, getBurnState } = freshBurn();
      await queueSpend(tokenStore, 25200);
      chain.state.source.allowanceRaw = 1000n * 10n ** 18n;

      const state = await getBurnState(burnDeps({ chain, tokenStore, clock }));
      assert.equal(state.canBurn, false);
      assert.equal(state.blockedReason, "NOT_ENOUGH_ALLOWANCE");

      await assert.rejects(
        () => burnQueued({}, burnDeps({ chain, tokenStore, clock })),
        /allowance or the pool balance/
      );

      const after = await tokenStore.readTokenState();
      assert.equal(after.burnQueue.points, 25200, "the queue is untouched");
    },
    { env: { TOKEN_PAYOUT_SOURCE: evmWallet("d") } }
  );
});

test("getBurnState explains why the button is off", async () => {
  await withTokenEnv(
    async ({ chain, clock, tokenStore }) => {
      const { getBurnState } = freshBurn();
      const deps = burnDeps({ chain, tokenStore, clock });

      const empty = await getBurnState(deps);
      assert.equal(empty.canBurn, false);
      assert.equal(empty.blockedReason, "NOTHING_TO_BURN");
      assert.equal(empty.queue.points, 0);
      assert.equal(empty.burnedTotalPoints, 0);

      await queueSpend(tokenStore, 5000);
      const ready = await getBurnState(deps);
      assert.equal(ready.canBurn, true);
      assert.equal(ready.blockedReason, null);
      assert.equal(ready.queue.points, 5000);
    },
    { env: { TOKEN_PAYOUT_SOURCE: evmWallet("d") } }
  );
});
