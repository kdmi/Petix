const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { evmWallet, withTokenEnv } = require("./helpers/token-test-utils");

const PRICE_QUOTE_PATH = path.resolve(__dirname, "../../api/_lib/price-quote.js");
const PRICE_FEED_PATH = path.resolve(__dirname, "../../api/_lib/price-feed.js");
const ADMIN_ROUTE_PATH = path.resolve(__dirname, "../../api/admin/[action].js");
const ADMIN_PRICE_PATH = path.resolve(__dirname, "../../server-routes/admin/price.js");

// The quote module holds the store and the feed, so every env takes a fresh copy.
function freshPriceQuote() {
  for (const modulePath of [PRICE_FEED_PATH, PRICE_QUOTE_PATH, ADMIN_PRICE_PATH, ADMIN_ROUTE_PATH]) {
    delete require.cache[require.resolve(modulePath)];
  }
  return require(PRICE_QUOTE_PATH);
}

function freshAdminRoute() {
  freshPriceQuote();
  return require(ADMIN_ROUTE_PATH);
}

function withFakePrice(usd, fn) {
  const saved = process.env.PRICE_FAKE_USD;
  if (usd === null) delete process.env.PRICE_FAKE_USD;
  else process.env.PRICE_FAKE_USD = String(usd);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (saved === undefined) delete process.env.PRICE_FAKE_USD;
      else process.env.PRICE_FAKE_USD = saved;
    });
}

async function invoke(handler, { method = "GET", url = "/api/admin/price", headers = {}, body } = {}) {
  const listeners = { data: [], end: [], error: [] };
  const req = {
    method,
    url,
    headers: { host: "localhost:3000", ...headers },
    on(event, callback) {
      if (listeners[event]) listeners[event].push(callback);
      return this;
    },
  };
  let statusCode = 200;
  const chunks = [];
  const res = {
    statusCode,
    setHeader() {},
    getHeader() {},
    end(chunk) {
      if (chunk) chunks.push(chunk);
    },
    writeHead(code) {
      statusCode = code;
      res.statusCode = code;
    },
  };
  const pending = Promise.resolve().then(() => handler(req, res));
  const raw = body === undefined ? "" : JSON.stringify(body);
  process.nextTick(() => {
    if (raw) listeners.data.forEach((cb) => cb(raw));
    listeners.end.forEach((cb) => cb());
  });
  await pending;
  const text = chunks.join("");
  return { statusCode: res.statusCode, body: text ? JSON.parse(text) : null };
}

function adminHeaders() {
  const auth = require("../../api/_lib/auth");
  return {
    [auth.INTERNAL_AUTH_HEADER]: process.env.INTERNAL_API_SECRET,
    [auth.INTERNAL_WALLET_HEADER]: process.env.ADMIN_WALLETS,
    [auth.INTERNAL_WALLET_TYPE_HEADER]: "internal",
    "content-type": "application/json",
  };
}

function playerHeaders(wallet) {
  const auth = require("../../api/_lib/auth");
  return {
    [auth.INTERNAL_AUTH_HEADER]: process.env.INTERNAL_API_SECRET,
    [auth.INTERNAL_WALLET_HEADER]: wallet,
    [auth.INTERNAL_WALLET_TYPE_HEADER]: "internal",
  };
}

test("storeQuote turns the coin price into a rate and remembers the previous one", async () => {
  await withTokenEnv(async ({ tokenStore, economyConfig }) => {
    const { storeQuote } = freshPriceQuote();
    const cfg = economyConfig.getDefaults();

    const first = await storeQuote({ usd: 0.00005, source: "dexscreener" }, cfg);
    assert.equal(first.usd, 0.00005);
    assert.equal(first.pointsPerUsd, 20000, "one dollar buys 20 000 coins");
    assert.equal(first.previousPointsPerUsd, null);
    assert.equal(first.clamped, false);

    // The coin doubled: the rate would halve, but one step is capped at 25%.
    const second = await storeQuote({ usd: 0.0001, source: "dexscreener" }, cfg);
    assert.equal(second.pointsPerUsd, 15000);
    assert.equal(second.previousPointsPerUsd, 20000);
    assert.equal(second.clamped, true, "the operator sees that the price is catching up");

    const state = await tokenStore.readTokenState();
    assert.equal(state.price.pointsPerUsd, 15000, "persisted, not just returned");
  });
});

test("refreshQuote survives a dead source and keeps the last good rate", async () => {
  await withTokenEnv(async () => {
    const quote = freshPriceQuote();
    const cfg = require("../../api/_lib/economy-config").getDefaults();

    await withFakePrice(0.00005, () => quote.refreshQuote(cfg));

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
    let failure;
    try {
      failure = await withFakePrice(null, () => quote.refreshQuote(cfg));
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(failure.ok, false);
    assert.match(failure.error, /unavailable/i);

    const stored = await quote.readQuote();
    assert.equal(stored.pointsPerUsd, 20000, "the good rate is still in force");
    assert.equal(stored.rejections, 1, "the failure is counted for the operator");
    assert.match(stored.lastError, /dexscreener/);
  });
});

test("describeQuote reports the bootstrap rate and marks a stale quote", async () => {
  await withTokenEnv(async ({ tokenStore }) => {
    const quote = freshPriceQuote();
    const cfg = require("../../api/_lib/economy-config").getDefaults();

    const empty = await quote.describeQuote(cfg);
    assert.equal(empty.bootstrap, true);
    assert.equal(empty.stale, true);
    assert.equal(
      empty.pointsPerUsd,
      cfg.PRICE_BOOTSTRAP_POINTS_PER_USD,
      "purchases work before the first quote ever arrives"
    );

    await withFakePrice(0.00005, () => quote.refreshQuote(cfg));
    const fresh = await quote.describeQuote(cfg);
    assert.equal(fresh.stale, false);
    assert.equal(fresh.bootstrap, false);
    assert.equal(fresh.ageMinutes, 0);

    // Age it past two refresh periods.
    await tokenStore.withTokenState((state) => {
      state.price.fetchedAt = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      return state;
    });
    const aged = await quote.describeQuote(cfg);
    assert.equal(aged.stale, true);
    assert.ok(aged.ageMinutes >= 180);
  });
});

test("ensureFreshQuote only goes out when the quote is older than its period", async () => {
  await withTokenEnv(async ({ tokenStore }) => {
    const quote = freshPriceQuote();
    const cfg = require("../../api/_lib/economy-config").getDefaults();

    await withFakePrice(0.00005, async () => {
      const first = await quote.ensureFreshQuote(cfg);
      assert.equal(first.ok, true);
      assert.notEqual(first.skipped, true, "the first run has nothing to skip");

      const second = await quote.ensureFreshQuote(cfg);
      assert.equal(second.skipped, true, "a fresh quote is left alone");

      await tokenStore.withTokenState((state) => {
        state.price.fetchedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        return state;
      });

      const third = await quote.ensureFreshQuote(cfg);
      assert.notEqual(third.skipped, true, "an hour-old quote is refreshed");
      assert.equal(third.ok, true);
    });
  });
});

test("GET /api/admin/price serves the quote, the ladder and the burn queue", async () => {
  await withTokenEnv(async ({ tokenStore }) => {
    const route = freshAdminRoute();
    await withFakePrice(0.00005, async () => {
      const quote = require("../../api/_lib/price-quote");
      await quote.refreshQuote();
    });
    await tokenStore.withTokenState((state) =>
      tokenStore.addSpend(state, { points: 25200, reason: "pet_creation" })
    );

    const response = await invoke(route, { headers: adminHeaders() });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.quote.pointsPerUsd, 20000);
    assert.equal(response.body.quote.source, "fake");
    assert.equal(response.body.quote.stale, false);
    assert.equal(response.body.ladder.length, 9);
    assert.equal(response.body.ladder[0].index, 2);
    assert.equal(response.body.ladder[0].points, 24000, "$1.20 at 20 000 per dollar");
    assert.equal(response.body.burnQueue.points, 25200);
    assert.equal(response.body.burnQueue.byReason.pet_creation, 25200);
  });
});

test("POST /api/admin/price sets a rate by hand, under the same clamp", async () => {
  await withTokenEnv(async () => {
    const route = freshAdminRoute();
    await withFakePrice(0.00005, async () => {
      await require("../../api/_lib/price-quote").refreshQuote();
    });

    const response = await invoke(route, {
      method: "POST",
      headers: adminHeaders(),
      body: { usd: 0.0001 },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.quote.source, "manual");
    assert.equal(response.body.quote.pointsPerUsd, 15000, "a manual rate is clamped too");
    assert.equal(response.body.quote.clamped, true);
  });
});

test("/api/admin/price is closed to everyone but admins", async () => {
  await withTokenEnv(async () => {
    const route = freshAdminRoute();

    const anonymous = await invoke(route, {});
    assert.equal(anonymous.statusCode, 401);

    const player = await invoke(route, {
      headers: playerHeaders(evmWallet("9")),
    });
    assert.equal(player.statusCode, 403);
  });
});
