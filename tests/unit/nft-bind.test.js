const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BASE_NOW,
  evmWallet,
  makeCharacter,
  seedCharacters,
  withNftEnv,
} = require("./helpers/nft-test-utils");

test("bind: level-1 character binds under the default (disabled) threshold", async () => {
  await withNftEnv(async ({ chain, deps, nft, nftStore, store }) => {
    const wallet = evmWallet("a");
    const character = makeCharacter({ level: 1 });
    await seedCharacters(store, wallet, [character]);
    chain.state.owners.set(7, wallet);

    const result = await nft.bindCharacterToSlot(wallet, 7, character.id, deps);

    assert.equal(result.tokenId, 7);
    assert.equal(result.characterId, character.id);
    assert.match(result.imageUri, /^ipfs:\/\/fake-7-/);
    // Ончейн-событие ERC-4906 сознательно не шлём: ~$0.09 газа за привязку и
    // ~30 мин до OpenSea против ~3 мин через их API бесплатно.
    assert.deepEqual(chain.state.emitted, []);
    assert.equal(result.metadataUpdateEmitted, undefined);

    const binding = await nftStore.getBinding(7);
    assert.equal(binding.characterId, character.id);
    assert.equal(binding.wallet, wallet);
    assert.equal(binding.boundAt, "2026-09-02T12:00:00.000Z");

    const profile = await store.getWalletProfile(wallet);
    assert.deepEqual(profile.characters[0].nft, {
      tokenId: 7,
      boundAt: "2026-09-02T12:00:00.000Z",
    });
  });
});

test("bind: LEVEL_TOO_LOW only when the threshold is raised in config", async () => {
  await withNftEnv(async ({ chain, configOverrides, deps, nft, store }) => {
    const wallet = evmWallet("a");
    const character = makeCharacter({ level: 2 });
    await seedCharacters(store, wallet, [character]);
    chain.state.owners.set(1, wallet);
    configOverrides.NFT_BIND_LEVEL = 3;

    await assert.rejects(
      () => nft.bindCharacterToSlot(wallet, 1, character.id, deps),
      (error) => {
        assert.equal(error.httpStatus, 422);
        assert.equal(error.httpCode, "LEVEL_TOO_LOW");
        assert.equal(error.required, 3);
        assert.equal(error.current, 2);
        return true;
      }
    );
  });
});

test("bind: rejects an unminted token and a foreign token", async () => {
  await withNftEnv(async ({ chain, deps, nft, store }) => {
    const wallet = evmWallet("a");
    const stranger = evmWallet("b");
    const character = makeCharacter();
    await seedCharacters(store, wallet, [character]);

    await assert.rejects(
      () => nft.bindCharacterToSlot(wallet, 3, character.id, deps),
      (error) => error.httpCode === "TOKEN_NOT_FOUND"
    );
    await assert.rejects(
      () => nft.bindCharacterToSlot(wallet, 999, character.id, deps),
      (error) => error.httpCode === "TOKEN_NOT_FOUND"
    );

    chain.state.owners.set(3, stranger);
    await assert.rejects(
      () => nft.bindCharacterToSlot(wallet, 3, character.id, deps),
      (error) => error.httpCode === "NOT_TOKEN_OWNER"
    );
  });
});

test("bind: occupied slot and already-bound character are rejected", async () => {
  await withNftEnv(async ({ chain, deps, nft, store }) => {
    const wallet = evmWallet("a");
    const first = makeCharacter({ id: "char_11111111-1111-1111-1111-111111111111" });
    const second = makeCharacter({ id: "char_22222222-2222-2222-2222-222222222222" });
    await seedCharacters(store, wallet, [first, second]);
    chain.state.owners.set(1, wallet);
    chain.state.owners.set(2, wallet);

    await nft.bindCharacterToSlot(wallet, 1, first.id, deps);

    await assert.rejects(
      () => nft.bindCharacterToSlot(wallet, 1, second.id, deps),
      (error) => error.httpCode === "SLOT_OCCUPIED"
    );
    await assert.rejects(
      () => nft.bindCharacterToSlot(wallet, 2, first.id, deps),
      (error) => error.httpCode === "CHARACTER_ALREADY_BOUND"
    );
  });
});

test("bind: concurrent CAS re-check rejects a second bind of the same slot", async () => {
  await withNftEnv(async ({ chain, deps, nft, nftStore, store }) => {
    const wallet = evmWallet("a");
    const first = makeCharacter({ id: "char_11111111-1111-1111-1111-111111111111" });
    const second = makeCharacter({ id: "char_22222222-2222-2222-2222-222222222222" });
    await seedCharacters(store, wallet, [first, second]);
    chain.state.owners.set(5, wallet);

    // Simulate the race: the slot gets taken between the pre-check and the CAS
    // mutation by having the pre-check see an empty store.
    const originalGetBinding = deps.store.getBinding;
    deps.store = {
      ...nftStore,
      getBinding: async () => null, // pre-check always sees empty
    };
    await nft.bindCharacterToSlot(wallet, 5, first.id, {
      ...deps,
      store: nftStore,
    });

    await assert.rejects(
      () => nft.bindCharacterToSlot(wallet, 5, second.id, deps),
      (error) => error.httpCode === "BIND_IN_PROGRESS"
    );
    deps.store = nftStore;
    void originalGetBinding;
  });
});

test("bind: profile-mark failure rolls the binding back", async () => {
  await withNftEnv(async ({ chain, deps, nft, nftStore, store }) => {
    const wallet = evmWallet("a");
    const character = makeCharacter();
    await seedCharacters(store, wallet, [character]);
    chain.state.owners.set(9, wallet);

    const failingDeps = {
      ...deps,
      profiles: {
        ...deps.profiles,
        updateWalletProfile: async () => {
          throw new Error("profile write failed");
        },
      },
    };

    await assert.rejects(() => nft.bindCharacterToSlot(wallet, 9, character.id, failingDeps));

    assert.equal(await nftStore.getBinding(9), null);
    const profile = await store.getWalletProfile(wallet);
    assert.equal(profile.characters[0].nft, undefined);
  });
});

test("очистка: заявка списывает Points, прячет трейты, сжигает по сроку", async () => {
  await withNftEnv(async ({ chain, deps, nft, nftStore, store }) => {
    const wallet = evmWallet("a");
    const character = makeCharacter();
    await seedCharacters(store, wallet, [character], {
      currency: { balance: 25000, totalEarned: 25000 },
    });
    chain.state.owners.set(4, wallet);
    await nft.bindCharacterToSlot(wallet, 4, character.id, deps);

    // Фаза 1: заявка
    const request = await nft.requestUnbindSlot(wallet, 4, deps);
    assert.equal(request.status, "pending");
    assert.equal(request.pricePaid, 10000);
    assert.equal(request.executeAt, new Date(BASE_NOW + 3600000).toISOString());

    const afterRequest = await store.getWalletProfile(wallet);
    assert.equal(afterRequest.currency.balance, 15000, "Points списаны");
    assert.equal(afterRequest.characters.length, 1, "персонаж пока жив");

    // Метаданные скрывают питомца, чтобы его не купили «вслепую»
    const pendingMeta = await nft.getTokenMetadata(4, "https://demo.test", deps);
    assert.deepEqual(pendingMeta.attributes, [{ trait_type: "Status", value: "Unbinding" }]);
    assert.equal(pendingMeta.name, "Slot #4");

    // Срок ещё не наступил — ничего не происходит
    assert.deepEqual((await nft.processPendingUnbinds(deps)).burned, []);
    assert.equal((await store.getWalletProfile(wallet)).characters.length, 1);

    // Фаза 2: срок пришёл
    const later = { ...deps, now: () => BASE_NOW + 3600001 };
    const result = await nft.processPendingUnbinds(later);
    assert.equal(result.burned.length, 1);
    assert.equal(result.burned[0].burnedCharacterId, character.id);

    const afterBurn = await store.getWalletProfile(wallet);
    assert.equal(afterBurn.characters.length, 0, "персонаж сгорел");
    assert.equal(afterBurn.currency.balance, 15000, "Points не возвращены");
    assert.equal(await nftStore.getBinding(4), null, "капсула свободна");
  });
});

test("очистка: продажа до срока отменяет сжигание и возвращает Points", async () => {
  await withNftEnv(async ({ chain, deps, nft, nftStore, store }) => {
    const seller = evmWallet("a");
    const buyer = evmWallet("b");
    const character = makeCharacter({ level: 6 });
    await seedCharacters(store, seller, [character], {
      currency: { balance: 25000, totalEarned: 25000 },
    });
    chain.state.owners.set(8, seller);
    await nft.bindCharacterToSlot(seller, 8, character.id, deps);
    await nft.requestUnbindSlot(seller, 8, deps);
    assert.equal((await store.getWalletProfile(seller)).currency.balance, 15000);

    // Продажа за 5 минут до срока — ровно тот случай, которого мы боялись
    chain.transfer(8, buyer);
    const later = { ...deps, now: () => BASE_NOW + 3600001 };
    const result = await nft.syncTransfers(later);

    assert.equal(result.moved.length, 1, "персонаж переехал");
    assert.deepEqual(result.burned, [], "сжигание НЕ состоялось");

    const buyerProfile = await store.getWalletProfile(buyer);
    assert.equal(buyerProfile.characters[0].id, character.id, "покупатель получил живого");
    assert.equal(buyerProfile.characters[0].level, 6, "со всей прокачкой");

    const sellerProfile = await store.getWalletProfile(seller);
    assert.equal(sellerProfile.currency.balance, 25000, "Points возвращены продавцу");
    assert.equal(sellerProfile.currency.totalEarned, 25000, "возврат не раздул totalEarned");

    const binding = await nftStore.getBinding(8);
    assert.equal(binding.pendingUnbind, null, "заявка снята");
  });
});

test("очистка: владелец может отменить заявку и вернуть Points", async () => {
  await withNftEnv(async ({ chain, deps, nft, nftStore, store }) => {
    const wallet = evmWallet("a");
    const character = makeCharacter();
    await seedCharacters(store, wallet, [character], {
      currency: { balance: 25000, totalEarned: 25000 },
    });
    chain.state.owners.set(2, wallet);
    await nft.bindCharacterToSlot(wallet, 2, character.id, deps);
    await nft.requestUnbindSlot(wallet, 2, deps);

    const cancelled = await nft.cancelUnbindRequest(wallet, 2, deps);
    assert.equal(cancelled.refunded, 10000);
    assert.equal((await store.getWalletProfile(wallet)).currency.balance, 25000);
    assert.equal((await nftStore.getBinding(2)).pendingUnbind, null);

    // Трейты вернулись
    const meta = await nft.getTokenMetadata(2, "https://demo.test", deps);
    assert.equal(meta.name, "Nova Cub");
  });
});

test("очистка: не хватает Points, пустой слот, чужой токен, двойная заявка", async () => {
  await withNftEnv(async ({ chain, deps, nft, store }) => {
    const owner = evmWallet("a");
    const stranger = evmWallet("b");
    const character = makeCharacter();
    await seedCharacters(store, owner, [character], {
      currency: { balance: 500, totalEarned: 500 },
    });
    chain.state.owners.set(2, owner);

    await assert.rejects(
      () => nft.requestUnbindSlot(owner, 2, deps),
      (error) => error.httpCode === "SLOT_EMPTY"
    );

    await nft.bindCharacterToSlot(owner, 2, character.id, deps);

    await assert.rejects(
      () => nft.requestUnbindSlot(stranger, 2, deps),
      (error) => error.httpCode === "NOT_TOKEN_OWNER"
    );
    await assert.rejects(
      () => nft.requestUnbindSlot(owner, 2, deps),
      (error) => {
        assert.equal(error.httpCode, "INSUFFICIENT_FUNDS");
        assert.equal(error.required, 10000);
        assert.equal(error.balance, 500);
        return true;
      }
    );

    // Points не списались при отказе
    assert.equal((await store.getWalletProfile(owner)).currency.balance, 500);

    // С деньгами заявка проходит, повторная — отклоняется
    await store.updateWalletProfile(owner, (c) => ({ ...c, currency: { balance: 25000, totalEarned: 25000 } }));
    await nft.requestUnbindSlot(owner, 2, deps);
    await assert.rejects(
      () => nft.requestUnbindSlot(owner, 2, deps),
      (error) => error.httpCode === "UNBIND_PENDING"
    );
  });
});

test("refresh при прокачке: дебаунс не даёт спамить API маркетплейса", async () => {
  await withNftEnv(async ({ chain, deps, nft, nftStore, store }) => {
    const wallet = evmWallet("a");
    const character = makeCharacter();
    await seedCharacters(store, wallet, [character]);
    chain.state.owners.set(3, wallet);
    await nft.bindCharacterToSlot(wallet, 3, character.id, deps);

    // Без ключа маркетплейса обновление вообще не запускается.
    delete process.env.NFT_OPENSEA_API_KEY;
    assert.equal(await nft.refreshBoundCharacterMetadata(character.id, deps), false);

    const calls = [];
    process.env.NFT_OPENSEA_API_KEY = "test-key";
    process.env.NFT_CONTRACT = "0xcontract";
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      calls.push(String(url));
      return { ok: true, status: 200, text: async () => "" };
    };

    try {
      assert.equal(await nft.refreshBoundCharacterMetadata(character.id, deps), true);
      assert.equal(calls.length, 1);
      assert.match(calls[0], /\/nfts\/3\/refresh$/);

      // Повторный левел-ап сразу же — дебаунс гасит второй вызов.
      assert.equal(await nft.refreshBoundCharacterMetadata(character.id, deps), false);
      assert.equal(calls.length, 1);

      const binding = await nftStore.getBinding(3);
      assert.ok(binding.refreshedAt, "метка времени обновления сохранена");
    } finally {
      global.fetch = originalFetch;
      delete process.env.NFT_OPENSEA_API_KEY;
      delete process.env.NFT_CONTRACT;
    }
  });
});

test("refresh при прокачке: непривязанный персонаж игнорируется", async () => {
  await withNftEnv(async ({ deps, nft, store }) => {
    const wallet = evmWallet("a");
    const character = makeCharacter();
    await seedCharacters(store, wallet, [character]);

    process.env.NFT_OPENSEA_API_KEY = "test-key";
    const originalFetch = global.fetch;
    let called = 0;
    global.fetch = async () => { called += 1; return { ok: true, status: 200, text: async () => "" }; };
    try {
      assert.equal(await nft.refreshBoundCharacterMetadata(character.id, deps), false);
      assert.equal(called, 0);
    } finally {
      global.fetch = originalFetch;
      delete process.env.NFT_OPENSEA_API_KEY;
    }
  });
});
