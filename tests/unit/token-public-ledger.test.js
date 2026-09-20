const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evmWallet,
  freshDispatcher,
  invokeJsonHandler,
  seedBalance,
  withTokenEnv,
} = require("./helpers/token-test-utils");

// Public transparency feed (/transparency → GET /api/token/ledger): the money
// that moved through the pool wallet, readable without a session and without
// leaking the ops side (operator address, allowance, gas).

const PLAYER = evmWallet("1");
const OTHER = evmWallet("2");

/** Mines every payout as soon as it is broadcast, so records land `confirmed`. */
function autoConfirm(chain) {
  const originalSend = chain.sendTransfer;
  chain.sendTransfer = async (...args) => {
    const sent = await originalSend(...args);
    chain.confirm(sent.txHash);
    return sent;
  };
}

test("public ledger: no session needed, totals per direction, masked wallets, tx links", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    autoConfirm(chain);
    await seedBalance(store, PLAYER, 3000);
    await seedBalance(store, OTHER, 1000);
    await token.requestWithdraw(PLAYER, 500, deps, { isAdmin: true });
    await token.requestWithdraw(OTHER, 700, deps, { isAdmin: true });
    const depositTx = chain.mineIncoming(PLAYER, 150);
    chain.advance(12);
    await token.syncDeposits(deps);

    const dispatcher = freshDispatcher(token, deps);
    const res = await invokeJsonHandler(dispatcher, { url: "/api/token/ledger" });
    assert.equal(res.status, 200);
    const body = res.body;

    assert.equal(body.totals.withdrawnPoints, 1200);
    assert.equal(body.totals.withdrawnCount, 2);
    assert.equal(body.totals.walletsPaid, 2);
    assert.equal(body.totals.depositedPoints, 150);
    assert.equal(body.totals.depositedCount, 1);
    assert.equal(body.today.outPoints, 1200);
    assert.equal(body.today.inPoints, 150);
    assert.equal(body.last7Days.outPoints, 1200);
    assert.equal(body.pending.count, 0);

    // The pool wallet's own balance, the token and the chain, all public already.
    assert.equal(body.pool.address, chain.state.depositAddress);
    assert.equal(body.pool.addressUrl, `https://explorer.test/address/${chain.state.depositAddress}`);
    assert.equal(body.pool.tokens, (BigInt(chain.state.treasury.tokensRaw) / 10n ** 18n).toString());
    assert.equal(body.token.contract, chain.state.tokenContract);
    assert.equal(body.rules.feePct, 0);
    assert.equal(body.rules.minWithdraw, 200);

    // Newest first, wallets masked, deposits carry their explorer link.
    assert.equal(body.entries.length, 3);
    const stamps = body.entries.map((entry) => Date.parse(entry.at));
    assert.deepEqual(stamps, [...stamps].sort((a, b) => b - a));
    const deposit = body.entries.find((entry) => entry.kind === "deposit");
    assert.equal(deposit.status, "credited");
    assert.equal(deposit.points, 150);
    assert.equal(deposit.explorerUrl, `https://explorer.test/tx/${depositTx}`);
    for (const entry of body.entries) {
      assert.ok(/^0x[0-9a-f]{4}…[0-9a-f]{4}$/.test(entry.wallet), `masked wallet: ${entry.wallet}`);
    }

    // Ops numbers stay in the admin panel.
    const text = JSON.stringify(body);
    assert.ok(!text.includes(chain.state.treasury.address) || chain.state.treasury.address === chain.state.depositAddress);
    assert.equal(body.treasury, undefined);
    assert.ok(!Object.prototype.hasOwnProperty.call(body.pool, "allowance"));
    assert.ok(!Object.prototype.hasOwnProperty.call(body.pool, "eth"));
    assert.ok(!text.includes(PLAYER), "full player wallets must not be published");

    // Cacheable at the edge: the page must not cost one profile read per visitor.
    assert.match(String(res.headers["cache-control"]), /s-maxage=\d+/);

    assert.equal(body.totalEntries, 3);
  });
});

test("public ledger: the whole journal ships in one snapshot, newest first", async () => {
  await withTokenEnv(async ({ chain, clock, deps, store, token }) => {
    await seedBalance(store, PLAYER, 0);
    for (let index = 0; index < 25; index += 1) {
      chain.mineIncoming(PLAYER, 10 + index);
      clock.now += 60000;
    }
    chain.advance(12);
    await token.syncDeposits(deps);

    const dispatcher = freshDispatcher(token, deps);
    const body = (await invokeJsonHandler(dispatcher, { url: "/api/token/ledger" })).body;

    // One response carries the journal the page pages through: a viewer can
    // never read two pages built from two different snapshots.
    assert.equal(body.totalEntries, 25);
    assert.equal(body.entries.length, 25);
    assert.equal(new Set(body.entries.map((entry) => entry.txHash)).size, 25);
    const stamps = body.entries.map((entry) => Date.parse(entry.at));
    assert.deepEqual(stamps, [...stamps].sort((a, b) => b - a));
    assert.equal(body.totals.depositedCount, 25);
    // Paging lives in the page now — no page/pageCount in the payload.
    assert.equal(body.page, undefined);
    assert.equal(body.pageCount, undefined);
  });
});

test("public ledger: a build that cannot read a profile fails instead of under-reporting", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    autoConfirm(chain);
    await seedBalance(store, PLAYER, 3000);
    await seedBalance(store, OTHER, 3000);
    await token.requestWithdraw(PLAYER, 500, deps, { isAdmin: true });
    await token.requestWithdraw(OTHER, 700, deps, { isAdmin: true });

    const realRead = deps.profiles.getWalletProfile;
    const failFor = (wallet) => async (target) => {
      if (target === wallet) throw new Error("blob unavailable");
      return realRead(target);
    };

    // Skipping the unreadable wallet would answer 500 instead of 1200 — the
    // build must refuse rather than publish a total that walked backwards.
    deps.profiles.getWalletProfile = failFor(OTHER);
    await assert.rejects(() => token.publicLedger(deps), /blob unavailable/);
    deps.profiles.getWalletProfile = realRead;
  });
});

test("public ledger: a failed rebuild keeps serving the last complete snapshot", async () => {
  await withTokenEnv(
    async ({ chain, deps, store, token }) => {
      autoConfirm(chain);
      await seedBalance(store, PLAYER, 3000);
      await seedBalance(store, OTHER, 3000);
      await token.requestWithdraw(PLAYER, 500, deps, { isAdmin: true });
      await token.requestWithdraw(OTHER, 700, deps, { isAdmin: true });

      // TOKEN_LEDGER_CACHE_MS=0 → every request rebuilds, so the next call
      // really does go through the failure path.
      const dispatcher = freshDispatcher(token, deps);
      const good = await invokeJsonHandler(dispatcher, { url: "/api/token/ledger" });
      assert.equal(good.body.totals.withdrawnPoints, 1200);
      assert.equal(good.body.stale, undefined);

      const realRead = deps.profiles.getWalletProfile;
      deps.profiles.getWalletProfile = async (target) => {
        if (target === OTHER) throw new Error("blob unavailable");
        return realRead(target);
      };
      try {
        const fallback = await invokeJsonHandler(dispatcher, { url: "/api/token/ledger" });
        assert.equal(fallback.status, 200);
        assert.equal(fallback.body.stale, true);
        assert.equal(fallback.body.totals.withdrawnPoints, 1200, "totals must not drop when a profile is unreadable");
        assert.equal(fallback.body.updatedAt, good.body.updatedAt, "the page shows the snapshot it actually got");
      } finally {
        deps.profiles.getWalletProfile = realRead;
      }
    },
    { env: { TOKEN_LEDGER_CACHE_MS: "0" } }
  );
});

test("public ledger: a first build that fails answers an error, not an empty journal", async () => {
  await withTokenEnv(
    async ({ chain, deps, store, token }) => {
      autoConfirm(chain);
      await seedBalance(store, PLAYER, 3000);
      await token.requestWithdraw(PLAYER, 500, deps, { isAdmin: true });

      const realRead = deps.profiles.getWalletProfile;
      deps.profiles.getWalletProfile = async () => {
        throw new Error("blob unavailable");
      };
      try {
        const dispatcher = freshDispatcher(token, deps);
        const res = await invokeJsonHandler(dispatcher, { url: "/api/token/ledger" });
        assert.equal(res.status, 500);
      } finally {
        deps.profiles.getWalletProfile = realRead;
      }
    },
    { env: { TOKEN_LEDGER_CACHE_MS: "0" } }
  );
});

test("public ledger: payouts in flight are pending, refunded ones are not listed", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    await seedBalance(store, PLAYER, 2000);
    // left unmined → `sent`
    await token.requestWithdraw(PLAYER, 300, deps, { isAdmin: true });
    // send blows up → `failed`, Points refunded, nothing left the wallet
    chain.state.failNextSend = Object.assign(new Error("boom"), { code: "SEND_FAILED" });
    await token.requestWithdraw(PLAYER, 400, deps, { isAdmin: true }).catch(() => null);

    const dispatcher = freshDispatcher(token, deps);
    const body = (await invokeJsonHandler(dispatcher, { url: "/api/token/ledger" })).body;

    assert.equal(body.totals.withdrawnPoints, 0);
    assert.equal(body.totals.walletsPaid, 0);
    assert.equal(body.pending.count, 1);
    assert.equal(body.pending.points, 300);
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].status, "pending");
  });
});

test("public ledger: the journal is capped and says so", async () => {
  await withTokenEnv(async ({ deps, store, token, tokenStore }) => {
    await store.updateWalletProfile(PLAYER, (current) => ({
      ...current,
      deposits: Array.from({ length: 505 }, (_, index) => ({
        key: `dep-${index}`,
        points: 10,
        txHash: `0x${String(index).padStart(64, "0")}`,
        creditedAt: new Date(Date.parse("2026-09-12T12:00:00.000Z") - index * 60000).toISOString(),
        source: PLAYER,
      })),
    }));
    await tokenStore.withTokenState((state) => tokenStore.rememberWallet(state, PLAYER));

    const dispatcher = freshDispatcher(token, deps);
    const body = (await invokeJsonHandler(dispatcher, { url: "/api/token/ledger" })).body;
    assert.equal(body.totalEntries, 500);
    assert.equal(body.entries.length, 500);
    assert.equal(body.capped, true);
    // Totals still count everything, only the listing is trimmed.
    assert.equal(body.totals.depositedCount, 505);
  });
});

test("public ledger: reverted deposits are excluded", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    await seedBalance(store, PLAYER, 0);
    chain.mineIncoming(PLAYER, 100);
    chain.advance(12);
    await token.syncDeposits(deps);
    await store.updateWalletProfile(PLAYER, (current) => ({
      ...current,
      deposits: (current.deposits || []).map((record) => ({ ...record, reverted: true })),
    }));

    const dispatcher = freshDispatcher(token, deps);
    const body = (await invokeJsonHandler(dispatcher, { url: "/api/token/ledger" })).body;
    assert.equal(body.totals.depositedPoints, 0);
    assert.equal(body.entries.length, 0);
  });
});

test("public ledger: 404 while the token flag is off", async () => {
  await withTokenEnv(
    async ({ deps, token }) => {
      const dispatcher = freshDispatcher(token, deps);
      const res = await invokeJsonHandler(dispatcher, { url: "/api/token/ledger" });
      assert.equal(res.status, 404);
      assert.equal(res.body.code, "TOKEN_DISABLED");
    },
    { env: { TOKEN_ENABLED: "0" } }
  );
});

test("public ledger: RPC down → pool balance null, journal still served", async () => {
  await withTokenEnv(async ({ chain, deps, store, token }) => {
    autoConfirm(chain);
    await seedBalance(store, PLAYER, 1000);
    await token.requestWithdraw(PLAYER, 500, deps, { isAdmin: true });
    chain.state.rpcDown = true;

    const dispatcher = freshDispatcher(token, deps);
    const body = (await invokeJsonHandler(dispatcher, { url: "/api/token/ledger" })).body;
    assert.equal(body.rpcDegraded, true);
    assert.equal(body.pool.tokens, null);
    assert.equal(body.entries.length, 1);
    assert.equal(body.totals.withdrawnPoints, 500);
  });
});

test("public ledger: burns are published with their tx, pending ones are not", async () => {
  await withTokenEnv(async ({ deps, token, tokenStore }) => {
    await tokenStore.withTokenState((state) => {
      tokenStore.addSpend(state, { points: 30000, reason: "pet_creation" });
      // One burn confirmed on the chain, one still in flight.
      tokenStore.recordBurn(state, {
        id: "burn_done",
        points: 20000,
        txHash: "0xburned",
        status: "sent",
        at: "2026-09-20T10:00:00.000Z",
        byReason: { pet_creation: 20000 },
      });
      tokenStore.drainBurnQueue(state, 20000);
      tokenStore.settleBurn(state, "burn_done", {
        status: "confirmed",
        at: "2026-09-20T10:00:20.000Z",
      });
      tokenStore.recordBurn(state, {
        id: "burn_flying",
        points: 5000,
        txHash: "0xflying",
        status: "sent",
        at: "2026-09-20T11:00:00.000Z",
        byReason: { pet_creation: 5000 },
      });
      tokenStore.drainBurnQueue(state, 5000);
      return state;
    });

    const ledger = await token.publicLedger(deps);

    assert.equal(ledger.burned.totalPoints, 20000, "only the confirmed burn counts");
    assert.equal(ledger.burned.count, 1);
    assert.equal(ledger.burned.queuedPoints, 5000, "what is left waiting for the next burn");
    assert.equal(ledger.burned.entries.length, 1, "the in-flight burn is not published yet");
    assert.equal(ledger.burned.entries[0].points, 20000);
    assert.equal(ledger.burned.entries[0].txHash, "0xburned");
    assert.match(ledger.burned.entries[0].txUrl, /0xburned$/);
  });
});
