const test = require("node:test");
const assert = require("node:assert/strict");

const { fetchTokenPriceUsd, pickDeepestPair } = require("../../api/_lib/price-feed");

const CONTRACT = "0x" + "b7".repeat(20);

function stubFetch(handlers) {
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = String(url);
    seen.push(target);
    for (const [fragment, respond] of handlers) {
      if (target.includes(fragment)) return respond();
    }
    throw new Error(`unexpected request: ${target}`);
  };
  return {
    seen,
    restore() {
      globalThis.fetch = original;
    },
  };
}

function ok(body) {
  return () => ({ ok: true, status: 200, json: async () => body });
}

function fails(status = 502) {
  return () => ({ ok: false, status, json: async () => ({}) });
}

function withoutFake(fn) {
  const saved = process.env.PRICE_FAKE_USD;
  delete process.env.PRICE_FAKE_USD;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (saved === undefined) delete process.env.PRICE_FAKE_USD;
      else process.env.PRICE_FAKE_USD = saved;
    });
}

test("pickDeepestPair takes the deepest pool, not the first one", () => {
  const pairs = [
    { priceUsd: "0.00005068", liquidity: { usd: 165 }, pairAddress: "dust-1" },
    { priceUsd: "0.0000478", liquidity: { usd: 21000 }, pairAddress: "real" },
    { priceUsd: "0.00004767", liquidity: { usd: 8 }, pairAddress: "dust-2" },
  ];

  const best = pickDeepestPair(pairs, 1000);
  assert.equal(best.pairAddress, "real");
  assert.equal(best.usd, 0.0000478);
  assert.equal(best.liquidityUsd, 21000);
});

test("pickDeepestPair drops everything below the liquidity floor", () => {
  const dustOnly = [{ priceUsd: "0.00005", liquidity: { usd: 12 } }];
  assert.equal(pickDeepestPair(dustOnly, 1000), null);
  assert.equal(pickDeepestPair([], 1000), null);
  assert.equal(pickDeepestPair(null, 1000), null);
  // A pair without a usable price is ignored even when it is deep.
  assert.equal(pickDeepestPair([{ priceUsd: "0", liquidity: { usd: 90000 } }], 1000), null);
});

test("fetchTokenPriceUsd reads the deepest pair from the primary source", async () => {
  await withoutFake(async () => {
    const stub = stubFetch([
      [
        "dexscreener",
        ok([
          { priceUsd: "0.00005068", liquidity: { usd: 165 } },
          { priceUsd: "0.0000478", liquidity: { usd: 21000 }, pairAddress: "real" },
        ]),
      ],
    ]);
    try {
      const quote = await fetchTokenPriceUsd({ contract: CONTRACT, minLiquidityUsd: 1000 });
      assert.equal(quote.usd, 0.0000478);
      assert.equal(quote.source, "dexscreener");
      assert.equal(stub.seen.length, 1, "the backup source is not touched");
      assert.ok(stub.seen[0].endsWith(CONTRACT));
    } finally {
      stub.restore();
    }
  });
});

test("fetchTokenPriceUsd falls back when the primary source fails or has only dust", async () => {
  for (const primary of [fails(503), ok([{ priceUsd: "0.00005", liquidity: { usd: 12 } }])]) {
    await withoutFake(async () => {
      const stub = stubFetch([
        ["dexscreener", primary],
        [
          "geckoterminal",
          ok({ data: { attributes: { token_prices: { [CONTRACT]: "0.0000501" } } } }),
        ],
      ]);
      try {
        const quote = await fetchTokenPriceUsd({ contract: CONTRACT, minLiquidityUsd: 1000 });
        assert.equal(quote.usd, 0.0000501);
        assert.equal(quote.source, "geckoterminal");
        assert.equal(stub.seen.length, 2);
      } finally {
        stub.restore();
      }
    });
  }
});

test("fetchTokenPriceUsd throws with both source errors when nobody answers", async () => {
  await withoutFake(async () => {
    const stub = stubFetch([
      ["dexscreener", fails(500)],
      ["geckoterminal", fails(429)],
    ]);
    try {
      await assert.rejects(
        () => fetchTokenPriceUsd({ contract: CONTRACT, minLiquidityUsd: 1000 }),
        (error) => {
          assert.match(error.message, /dexscreener: HTTP 500/);
          assert.match(error.message, /geckoterminal: HTTP 429/);
          return true;
        }
      );
    } finally {
      stub.restore();
    }
  });
});

test("PRICE_FAKE_USD short-circuits the network for local demos", async () => {
  const saved = process.env.PRICE_FAKE_USD;
  process.env.PRICE_FAKE_USD = "0.0000478";
  const stub = stubFetch([]);
  try {
    const quote = await fetchTokenPriceUsd({ contract: CONTRACT });
    assert.equal(quote.usd, 0.0000478);
    assert.equal(quote.source, "fake");
    assert.equal(stub.seen.length, 0, "no request leaves the process");
  } finally {
    stub.restore();
    if (saved === undefined) delete process.env.PRICE_FAKE_USD;
    else process.env.PRICE_FAKE_USD = saved;
  }
});

test("fetchTokenPriceUsd refuses to work without a contract", async () => {
  await withoutFake(async () => {
    await assert.rejects(() => fetchTokenPriceUsd({ contract: "" }), /not configured/);
  });
});
