const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");

const {
  createCompletedCharacter,
  createInternalHeaders,
  createWallet,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
} = require("./helpers/battle-history-test-utils");
const { getDefaults } = require("../../api/_lib/economy-config");
const { buildLadder } = require("../../api/_lib/pet-price");
const { getUnlockedSlots } = require("../../api/_lib/slots");

const REPO_ROOT = path.resolve(__dirname, "../..");
const cfg = getDefaults();
// No quote is stored in the isolated env, so the bootstrap rate is in force.
const LADDER = buildLadder(cfg.PRICE_BOOTSTRAP_POINTS_PER_USD, cfg);
const SECOND_PLACE = LADDER[0].points;
const THIRD_PLACE = LADDER[1].points;

// The start route resolves its data paths when it first loads, and every
// isolated env runs from a temp dir that is deleted afterwards — so the route
// is reloaded per test and re-binds to the env that is actually live.
function forgetStartRoute() {
  delete require.cache[require.resolve("../../server-routes/character/start")];
  delete require.cache[require.resolve("../../api/character/[action].js")];
}

// Generation reads its tables and the placeholder image relative to the cwd.
async function seedGenerationAssets(tempDir) {
  await fs.mkdir(path.join(tempDir, "api", "_data"), { recursive: true });
  await fs.mkdir(path.join(tempDir, "assets", "character"), { recursive: true });
  for (const file of ["character-variables.csv", "rarity-chances.csv"]) {
    await fs.copyFile(
      path.join(REPO_ROOT, "api", "_data", file),
      path.join(tempDir, "api", "_data", file)
    );
  }
  await fs.copyFile(
    path.join(REPO_ROOT, "assets", "character", "current-pet.jpg"),
    path.join(tempDir, "assets", "character", "current-pet.jpg")
  );
}

function startRequest(auth, wallet, body = {}) {
  return {
    method: "POST",
    url: "/api/character/start",
    headers: createInternalHeaders(auth, wallet),
    body: { creatureType: "panda", ...body },
  };
}

async function seedWallet(store, wallet, { pets = 0, balance = 0, unlockedSlots, sealed = 0 } = {}) {
  await store.updateWalletProfile(wallet, async (current) => {
    const characters = [];
    for (let i = 0; i < pets; i += 1) {
      characters.push(createCompletedCharacter({ id: `char_own_${i}`, name: `Own ${i}` }));
    }
    for (let i = 0; i < sealed; i += 1) {
      characters.push({
        ...createCompletedCharacter({ id: `char_sealed_${i}`, name: `Sealed ${i}` }),
        nft: { tokenId: 100 + i, tier: "gold" },
      });
    }
    return {
      ...current,
      draft: null,
      characters,
      unlockedSlots: unlockedSlots === undefined ? null : unlockedSlots,
      currency: { balance, totalEarned: balance },
    };
  });
}

test("a free place costs nothing and leaves the balance alone", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("a");
    await seedWallet(store, wallet, { pets: 0, balance: 5000 });

    const response = await invokeJsonHandler(characterActionRoute, startRequest(auth, wallet));

    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.equal(response.body.charged, 0);

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.currency.balance, 5000, "nothing is debited for the free place");
    assert.deepEqual(profile.spend, [], "a free creation writes no spend record");
    assert.equal(profile.unlockedSlots, 1, "the free place is the one it already had");
  });
});

test("opening the next place debits exactly the ladder price and logs the spend", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(
    async ({ auth, characterActionRoute, store, tempDir, battleStore }) => {
      await seedGenerationAssets(tempDir);
      const wallet = createWallet("b");
      await seedWallet(store, wallet, { pets: 1, balance: SECOND_PLACE + 700 });

      const response = await invokeJsonHandler(
        characterActionRoute,
        startRequest(auth, wallet, { expectedPrice: SECOND_PLACE })
      );

      assert.equal(response.statusCode, 200, JSON.stringify(response.body));
      assert.equal(response.body.charged, SECOND_PLACE);
      assert.equal(response.body.balance, 700);
      assert.equal(response.body.currency.balance, 700, "the header balance rides along");

      const profile = await store.getWalletProfile(wallet);
      assert.equal(profile.currency.balance, 700);
      assert.equal(
        profile.currency.totalEarned,
        SECOND_PLACE + 700,
        "spending is not earning: totalEarned stays put"
      );
      assert.equal(profile.unlockedSlots, 2, "the place is now owned");
      assert.equal(profile.spend.length, 1);
      assert.equal(profile.spend[0].points, SECOND_PLACE);
      assert.equal(profile.spend[0].reason, "pet_creation");
      assert.equal(profile.spend[0].ref, profile.draft.id);
      assert.equal(profile.draft.chargedPoints, SECOND_PLACE);

      // The burn queue is the operator's side of the same debit.
      const tokenStore = require("../../api/_lib/token-store");
      const state = await tokenStore.readTokenState();
      assert.equal(state.burnQueue.points, SECOND_PLACE);
      assert.equal(state.burnQueue.byReason.pet_creation, SECOND_PLACE);
      assert.ok(state.burnQueue.since, "the burn period is stamped on the first spend");
      assert.ok(battleStore, "isolated env is live");
    }
  );
});

test("an unaffordable place is refused with the exact shortfall and touches nothing", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("c");
    await seedWallet(store, wallet, { pets: 1, balance: SECOND_PLACE - 1 });

    const response = await invokeJsonHandler(
      characterActionRoute,
      startRequest(auth, wallet, { expectedPrice: SECOND_PLACE })
    );

    assert.equal(response.statusCode, 402);
    assert.equal(response.body.code, "INSUFFICIENT_FUNDS");
    assert.equal(response.body.required, SECOND_PLACE);
    assert.equal(response.body.balance, SECOND_PLACE - 1);
    assert.equal(response.body.missing, 1);

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.currency.balance, SECOND_PLACE - 1, "balance untouched");
    assert.equal(profile.draft, null, "no generation was paid for");
    // A refusal writes nothing at all, so the count is still uncomputed on disk
    // while reading it gives the one free place.
    assert.equal(profile.unlockedSlots, null);
    assert.equal(getUnlockedSlots(profile, cfg), 1);
  });
});

test("a stale price is refused and the fresh one comes back with it", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("d");
    await seedWallet(store, wallet, { pets: 1, balance: SECOND_PLACE * 2 });

    const response = await invokeJsonHandler(
      characterActionRoute,
      startRequest(auth, wallet, { expectedPrice: SECOND_PLACE - 100 })
    );

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, "PRICE_CHANGED");
    assert.equal(response.body.price, SECOND_PLACE);
    assert.equal(response.body.priceUsd, LADDER[0].usd);

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.currency.balance, SECOND_PLACE * 2, "nothing is debited on a mismatch");
  });
});

test("a failed generation costs the player nothing", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    // The generation tables are deliberately NOT seeded: buildCharacterDraft
    // fails, and the debit must not have happened before it.
    const wallet = createWallet("e");
    await seedWallet(store, wallet, { pets: 1, balance: SECOND_PLACE + 500 });

    const response = await invokeJsonHandler(
      characterActionRoute,
      startRequest(auth, wallet, { expectedPrice: SECOND_PLACE })
    );

    assert.equal(response.statusCode, 400, "the generation error surfaces as a plain failure");

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.currency.balance, SECOND_PLACE + 500, "Points stay with the player");
    assert.equal(getUnlockedSlots(profile, cfg), 1, "no place was opened");
    assert.deepEqual(profile.spend, []);
    assert.equal(profile.draft, null);
    assert.ok(tempDir);
  });
});

test("a paid draft is returned as-is and never charged twice", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("f");
    await seedWallet(store, wallet, { pets: 1, balance: SECOND_PLACE * 2 });

    const first = await invokeJsonHandler(
      characterActionRoute,
      startRequest(auth, wallet, { expectedPrice: SECOND_PLACE })
    );
    assert.equal(first.statusCode, 200, JSON.stringify(first.body));
    assert.equal(first.body.charged, SECOND_PLACE);
    const draftId = first.body.draft.id;

    const second = await invokeJsonHandler(
      characterActionRoute,
      startRequest(auth, wallet, { expectedPrice: THIRD_PLACE })
    );

    assert.equal(second.statusCode, 200, JSON.stringify(second.body));
    assert.equal(second.body.charged, 0);
    assert.equal(second.body.resumed, true);
    assert.equal(second.body.draft.id, draftId, "the same pet comes back");

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.currency.balance, SECOND_PLACE, "debited once, not twice");
    assert.equal(profile.spend.length, 1);
  });
});

test("a burned pet leaves its place open, so the next pet is free again", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("g");
    // Two places owned, one pet left after a burn.
    await seedWallet(store, wallet, { pets: 1, balance: 300, unlockedSlots: 2 });

    const response = await invokeJsonHandler(characterActionRoute, startRequest(auth, wallet));

    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.equal(response.body.charged, 0, "the wallet already paid for this place");

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.currency.balance, 300);
    assert.equal(profile.unlockedSlots, 2, "refilling a place does not open another");
  });
});

test("pets sealed in capsules neither occupy places nor move the price", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("h");
    // One ordinary pet and three in capsules: the price is still the second place.
    await seedWallet(store, wallet, { pets: 1, sealed: 3, balance: SECOND_PLACE });

    const response = await invokeJsonHandler(
      characterActionRoute,
      startRequest(auth, wallet, { expectedPrice: SECOND_PLACE })
    );

    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.equal(response.body.charged, SECOND_PLACE);

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.unlockedSlots, 2, "three capsules opened no places");
  });
});

test("wallets from the old rules keep their pets and pay the price of the next place", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("j");
    // Three pets created for free under the old rules, no purchases, no balance.
    await seedWallet(store, wallet, { pets: 3, balance: 0 });

    const refused = await invokeJsonHandler(
      characterActionRoute,
      startRequest(auth, wallet, { expectedPrice: LADDER[2].points })
    );

    assert.equal(refused.statusCode, 402);
    assert.equal(refused.body.required, LADDER[2].points, "the fourth place costs the fourth step");

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.characters.length, 3, "nothing is taken away");
    assert.equal(profile.currency.balance, 0, "and nothing is charged retroactively");
    assert.equal(getUnlockedSlots(profile, cfg), 3, "three pets are three owned places");
  });
});

test("a wallet that bought slots under the old rules does not pay for them twice", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("k");
    await seedWallet(store, wallet, { pets: 1, balance: 0 });
    await store.updateWalletProfile(wallet, async (current) => ({
      ...current,
      paidSlots: 2,
      unlockedSlots: null,
    }));

    const response = await invokeJsonHandler(characterActionRoute, startRequest(auth, wallet));

    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.equal(response.body.charged, 0, "a purchased place is still paid for");

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.unlockedSlots, 3, "one free place plus two purchased ones");
  });
});

test("admin wallets create without paying", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("m");
    const savedAdmins = process.env.ADMIN_WALLETS;
    process.env.ADMIN_WALLETS = wallet;

    try {
      await seedWallet(store, wallet, { pets: 5, balance: 0 });

      const response = await invokeJsonHandler(characterActionRoute, startRequest(auth, wallet));

      assert.equal(response.statusCode, 200, JSON.stringify(response.body));
      assert.equal(response.body.charged, 0);

      const profile = await store.getWalletProfile(wallet);
      assert.equal(profile.currency.balance, 0);
      assert.deepEqual(profile.spend, [], "an admin creation is not a spend");
    } finally {
      if (savedAdmins === undefined) delete process.env.ADMIN_WALLETS;
      else process.env.ADMIN_WALLETS = savedAdmins;
    }
  });
});

test("a paid creation without a confirmed price is refused, not charged silently", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("n");
    // The wallet can easily afford it — the point is that nobody confirmed.
    await seedWallet(store, wallet, { pets: 1, balance: SECOND_PLACE * 3 });

    const response = await invokeJsonHandler(characterActionRoute, startRequest(auth, wallet));

    assert.equal(response.statusCode, 409);
    assert.equal(response.body.code, "CONFIRMATION_REQUIRED");
    assert.equal(response.body.price, SECOND_PLACE, "the client is told what to confirm");

    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.currency.balance, SECOND_PLACE * 3, "not a single Point moved");
    assert.equal(profile.draft, null, "and no generation was paid for");
  });
});

test("a free creation needs no confirmation", async () => {
  forgetStartRoute();
  await withIsolatedBattleHistoryEnv(async ({ auth, characterActionRoute, store, tempDir }) => {
    await seedGenerationAssets(tempDir);
    const wallet = createWallet("p");
    await seedWallet(store, wallet, { pets: 0, balance: 0 });

    const response = await invokeJsonHandler(characterActionRoute, startRequest(auth, wallet));

    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.equal(response.body.charged, 0);
  });
});
