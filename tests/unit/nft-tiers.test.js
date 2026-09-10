const test = require("node:test");
const assert = require("node:assert/strict");

const {
  TIER_LABELS,
  TIER_ORDER,
  buildTierMap,
  computeTierCounts,
  hashTierMap,
} = require("../../api/_lib/nft-tiers");

const {
  evmWallet,
  makeCharacter,
  seedCharacters,
  withNftEnv,
} = require("./helpers/nft-test-utils");

function countBy(tierMap) {
  const counts = {};
  for (const tier of TIER_ORDER) counts[tier] = 0;
  for (const tier of tierMap) counts[tier] += 1;
  return counts;
}

test("тиры: раскладка на 777 ложится на семёрки и сходится в тираж", () => {
  const counts = computeTierCounts(777);
  assert.deepEqual(counts, { glass: 469, bronze: 210, silver: 70, gold: 21, prismatic: 7 });
  assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), 777);
});

test("тиры: любой тираж раскладывается без потерь и без пустых тиров", () => {
  for (const supply of [50, 100, 500, 777, 1000, 10000]) {
    const counts = computeTierCounts(supply);
    assert.equal(
      Object.values(counts).reduce((a, b) => a + b, 0),
      supply,
      `сумма должна быть равна тиражу ${supply}`
    );
    for (const tier of TIER_ORDER) {
      assert.ok(counts[tier] >= 1, `${tier} не должен обнуляться при тираже ${supply}`);
    }
  }
});

test("тиры: один сид всегда даёт одну и ту же раскладку", () => {
  const first = buildTierMap(777, "petix-capsules");
  const second = buildTierMap(777, "petix-capsules");
  assert.deepEqual(first, second);
  assert.equal(hashTierMap(first), hashTierMap(second));

  // Отпечаток и есть то, что публикуется до старта продаж: другой сид обязан
  // давать другой хеш, иначе фиксация распределения ничего не доказывает.
  const other = buildTierMap(777, "another-seed");
  assert.notEqual(hashTierMap(first), hashTierMap(other));
});

test("тиры: распределение перемешано, а не выдано подряд", () => {
  const map = buildTierMap(777, "petix-capsules");
  assert.deepEqual(countBy(map), computeTierCounts(777));

  // Если бы пул не перемешался, первые 469 номеров были бы сплошь Glass.
  const head = map.slice(0, 469);
  assert.ok(
    head.some((tier) => tier !== "glass"),
    "редкие капсулы должны встречаться и в начале нумерации"
  );
});

test("тиры: витрина кладёт по одному каждого вида в первые пять номеров", () => {
  const map = buildTierMap(777, "petix-capsules", { showcase: true });
  assert.deepEqual(map.slice(0, 5), TIER_ORDER);
  // Тираж по тирам от перестановки не меняется.
  assert.deepEqual(countBy(map), computeTierCounts(777));
});

test("бонус: занятая капсула поднимает лимит боёв, пустая — нет", async () => {
  await withNftEnv(async (env) => {
    const { chain, deps, nft, nftStore, store } = env;
    const wallet = evmWallet("a");

    // Пустая капсула ничего не даёт.
    chain.state.owners.set(1, wallet);
    let bonus = await nft.getWalletCapsuleBonus(wallet, deps);
    assert.deepEqual(bonus, { extraBattles: 0, winBonusPct: 0 });

    // Сажаем питомца и подменяем тир на Silver — он даёт +1 бой.
    const character = makeCharacter();
    await seedCharacters(store, wallet, [character]);
    await nft.bindCharacterToSlot(wallet, 1, character.id, deps);

    const tier = nft.getCapsuleTier(1);
    const expected = { glass: 0, bronze: 0, silver: 1, gold: 2, prismatic: 3 }[tier];
    bonus = await nft.getWalletCapsuleBonus(wallet, deps);
    assert.equal(bonus.extraBattles, expected, `тир ${tier} должен давать ${expected}`);

    const binding = await nftStore.getBinding(1);
    assert.equal(binding.characterId, character.id);
  });
});

test("бонус: капсула на очистке перестаёт давать бафы сразу", async () => {
  await withNftEnv(async (env) => {
    const { chain, deps, nft, store } = env;
    const wallet = evmWallet("a");
    const character = makeCharacter();
    await seedCharacters(store, wallet, [character], {
      currency: { balance: 25000, totalEarned: 25000 },
    });
    chain.state.owners.set(1, wallet);
    await nft.bindCharacterToSlot(wallet, 1, character.id, deps);

    const before = await nft.getWalletCapsuleBonus(wallet, deps);
    await nft.requestUnbindSlot(wallet, 1, deps);
    const after = await nft.getWalletCapsuleBonus(wallet, deps);

    assert.equal(after.extraBattles, 0, "питомец приговорён — буста быть не должно");
    assert.equal(after.winBonusPct, 0);
    assert.ok(before.extraBattles >= 0);
  });
});

test("бонус: с выключенной фичей игра считается ровно как раньше", async () => {
  await withNftEnv(async (env) => {
    const { chain, deps, nft, store } = env;
    const wallet = evmWallet("a");
    const character = makeCharacter();
    await seedCharacters(store, wallet, [character]);
    chain.state.owners.set(1, wallet);
    await nft.bindCharacterToSlot(wallet, 1, character.id, deps);

    // Питомец в капсуле есть, но флаг выключен — общий боевой код обязан
    // получить нули и не заглядывать в хранилище капсул вовсе.
    const previous = process.env.NFT_ENABLED;
    delete process.env.NFT_ENABLED;
    let touchedStore = false;
    const spyDeps = {
      ...deps,
      store: {
        ...deps.store,
        readNftState: async () => {
          touchedStore = true;
          return deps.store.readNftState();
        },
      },
    };
    try {
      const bonus = await nft.getWalletCapsuleBonus(wallet, spyDeps);
      assert.deepEqual(bonus, { extraBattles: 0, winBonusPct: 0 });
      assert.equal(touchedStore, false, "выключенная фича не должна читать хранилище");
    } finally {
      if (previous === undefined) delete process.env.NFT_ENABLED;
      else process.env.NFT_ENABLED = previous;
    }
  });
});

test("обновление: витрину не берём на слово — проверяем и переспрашиваем", async () => {
  await withNftEnv(async (env) => {
    const { chain, deps, nft, nftStore } = env;
    for (let id = 1; id <= 3; id += 1) chain.state.owners.set(id, evmWallet("a"));

    process.env.NFT_OPENSEA_API_KEY = "test-key";
    process.env.NFT_CONTRACT = "0xcontract";
    const originalFetch = global.fetch;

    // Витрина «обновила» только первый токен, у остальных остался Sealed.
    const refreshCalls = [];
    global.fetch = async (url) => {
      const raw = String(url);
      if (raw.endsWith("/refresh")) {
        refreshCalls.push(Number(raw.match(/nfts\/(\d+)\/refresh/)[1]));
        return { ok: true, status: 200, text: async () => "" };
      }
      const tokenId = Number(raw.match(/nfts\/(\d+)$/)[1]);
      const traits =
        tokenId === 1
          ? [{ trait_type: "Status", value: "Empty" }, { trait_type: "Capsule Tier", value: TIER_LABELS[nft.getCapsuleTier(1)] }]
          : [{ trait_type: "Status", value: "Sealed" }];
      return { ok: true, status: 200, json: async () => ({ nft: { traits } }) };
    };

    try {
      await nft.scheduleFullRefresh(3, deps);
      await nft.drainRefreshQueue(deps); // обход: просим перечитать 1..3
      assert.deepEqual(refreshCalls, [1, 2, 3], "обход просит перечитать все токены");

      let state = await nftStore.readNftState();
      assert.ok(state.refreshAudit, "после обхода ставится проверка");

      // Пауза перед проверкой читается при загрузке модуля, поэтому просто
      // отматываем срок в прошлое.
      await nftStore.withNftState((current) => {
        current.refreshAudit = { ...current.refreshAudit, notBefore: 0 };
        return current;
      });

      refreshCalls.length = 0;
      const audit = await nft.drainRefreshQueue(deps);
      assert.equal(audit.auditing, true);
      // Первый сошёлся, второй и третий — нет, их переспрашиваем.
      assert.deepEqual(refreshCalls, [2, 3], "переспрашиваем только несошедшиеся");

      state = await nftStore.readNftState();
      assert.ok(state.refreshAudit, "остались расхождения — назначен ещё заход");
      assert.equal(state.refreshAudit.attempt, 2);
    } finally {
      global.fetch = originalFetch;
      delete process.env.NFT_OPENSEA_API_KEY;
      delete process.env.NFT_CONTRACT;
    }
  });
});

test("тир едет с питомцем: метка при посадке и список капсул несут tier", async () => {
  await withNftEnv(async (env) => {
    const { chain, deps, nft, store } = env;
    const wallet = evmWallet("a");
    const character = makeCharacter();
    await seedCharacters(store, wallet, [character]);
    chain.state.owners.set(3, wallet);
    chain.state.owners.set(4, wallet);

    await nft.bindCharacterToSlot(wallet, 3, character.id, deps);

    const profile = await store.getWalletProfile(wallet);
    const bound = profile.characters.find((record) => record.id === character.id);
    assert.equal(bound.nft.tokenId, 3);
    assert.equal(bound.nft.tier, nft.getCapsuleTier(3), "фронт красит рамку по этому полю");

    const { slots } = await nft.listWalletSlots(wallet, deps);
    const byToken = Object.fromEntries(slots.map((slot) => [slot.tokenId, slot]));
    assert.equal(byToken[3].state, "bound");
    assert.equal(byToken[3].tier, nft.getCapsuleTier(3));
    assert.equal(byToken[4].state, "empty");
    assert.equal(byToken[4].tier, nft.getCapsuleTier(4), "пустая капсула тоже знает свой тир");
  });
});

test("сериализатор выводит тир из номера, даже если метка его не хранит", async () => {
  await withNftEnv(async (env) => {
    const { chain, deps, nft, store } = env;
    const character = require("../../api/_lib/character");
    const wallet = evmWallet("a");
    const record = makeCharacter();
    await seedCharacters(store, wallet, [record]);
    chain.state.owners.set(2, wallet);
    await nft.bindCharacterToSlot(wallet, 2, record.id, deps);

    // Метка старше тиров — поля tier нет.
    await store.updateWalletProfile(wallet, (current) => {
      const stored = current.characters.find((item) => item.id === record.id);
      delete stored.nft.tier;
      return current;
    });

    const profile = await store.getWalletProfile(wallet);
    const stored = profile.characters.find((item) => item.id === record.id);
    const serialized = character.serializeCharacterRecord(stored);
    assert.equal(serialized.nft.tier, nft.getCapsuleTier(2), "тир не зависит от того, что записано в метке");
  });
});

test("лимит боёв в ответе учитывает бонус капсул", async () => {
  await withNftEnv(async () => {
    const character = require("../../api/_lib/character");
    const plain = character.serializeBattleState(null, { wallet: evmWallet("a") });
    const boosted = character.serializeBattleState(null, { wallet: evmWallet("a"), bonusEnergy: 1 });
    assert.equal(plain.energyMax, 3);
    assert.equal(boosted.energyMax, 4, "иначе игрок видит 3, хотя бой пустит четвёртый");
  });
});

test("тир доезжает до клиента через сериализацию персонажа", async () => {
  await withNftEnv(async (env) => {
    const { chain, deps, nft, store } = env;
    const character = require("../../api/_lib/character");
    const wallet = evmWallet("a");
    const record = makeCharacter();
    await seedCharacters(store, wallet, [record]);
    chain.state.owners.set(5, wallet);
    await nft.bindCharacterToSlot(wallet, 5, record.id, deps);

    const profile = await store.getWalletProfile(wallet);
    const stored = profile.characters.find((item) => item.id === record.id);
    const serialized = character.serializeCharacterRecord(stored);
    assert.equal(serialized.nft.tokenId, 5);
    assert.equal(serialized.nft.tier, nft.getCapsuleTier(5), "без этого поля фронт красит всё фиолетовым");
  });
});
