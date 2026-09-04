const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BASE_NOW,
  evmWallet,
  makeCharacter,
  seedCharacters,
  withNftDemoEnv,
} = require("./helpers/nft-demo-test-utils");

const HOUR_MS = 3600000;

async function bindTo(env, wallet, tokenId, character) {
  await seedCharacters(env.store, wallet, [character]);
  env.chain.state.owners.set(tokenId, wallet);
  await env.nftDemo.bindCharacterToSlot(wallet, tokenId, character.id, env.deps);
}

test("sync: a transfer moves the character with full progression to the buyer", async () => {
  await withNftDemoEnv(async (env) => {
    const seller = evmWallet("a");
    const buyer = evmWallet("b");
    const character = makeCharacter({
      level: 7,
      experience: 420,
      attributes: { stamina: 9, agility: 5, strength: 6, intelligence: 8 },
    });
    await bindTo(env, seller, 10, character);

    env.chain.transfer(10, buyer);
    const result = await env.nftDemo.syncTransfers(env.deps);

    assert.equal(result.moved.length, 1);
    assert.equal(result.moved[0].tokenId, 10);
    assert.equal(result.moved[0].fromWallet, seller);
    assert.equal(result.moved[0].toWallet, buyer);
    assert.equal(result.errors.length, 0);

    const sellerProfile = await env.store.getWalletProfile(seller);
    assert.equal(sellerProfile.characters.length, 0);

    const buyerProfile = await env.store.getWalletProfile(buyer);
    assert.equal(buyerProfile.characters.length, 1);
    const movedCharacter = buyerProfile.characters[0];
    assert.equal(movedCharacter.level, 7);
    assert.equal(movedCharacter.experience, 420);
    assert.equal(movedCharacter.attributes.stamina, 9);
    assert.deepEqual(movedCharacter.nftDemo.tokenId, 10);
    assert.equal(movedCharacter.farmState.active, false);

    const binding = await env.nftDemoStore.getBinding(10);
    assert.equal(binding.wallet, buyer);

    const state = await env.nftDemoStore.readNftDemoState();
    assert.equal(state.transfers.length, 1);
    assert.equal(state.transfers[0].detectedBy, "sync");
    assert.equal(state.lastSyncedBlock, env.chain.state.blockNumber);
  });
});

test("sync: an active farm settles in favour of the seller before the move", async () => {
  await withNftDemoEnv(async (env) => {
    const seller = evmWallet("a");
    const buyer = evmWallet("b");
    // 5 полных часов фарма Common L1 при FARM_BASE=10 → 50 Points продавцу.
    const character = makeCharacter({
      rarity: "Common",
      level: 1,
      farmState: {
        active: true,
        startedAt: new Date(BASE_NOW - 5 * HOUR_MS - 600000).toISOString(),
        lastClaimedAt: null,
      },
    });
    await seedCharacters(env.store, seller, [character]);
    env.chain.state.owners.set(2, seller);
    // Привязываем через прямую вставку binding — bind заблокировал бы фарм? Нет:
    // bind не проверяет фарм, но снапшот-мок не трогает farmState. Обычный bind ок.
    await env.nftDemo.bindCharacterToSlot(seller, 2, character.id, env.deps);

    env.chain.transfer(2, buyer);
    await env.nftDemo.syncTransfers(env.deps);

    const sellerProfile = await env.store.getWalletProfile(seller);
    assert.equal(sellerProfile.currency.balance, 50);

    const buyerProfile = await env.store.getWalletProfile(buyer);
    assert.equal(buyerProfile.currency.balance, 0);
    assert.equal(buyerProfile.characters[0].farmState.active, false);
  });
});

test("sync: multiple transfers between syncs collapse into one move to the final owner", async () => {
  await withNftDemoEnv(async (env) => {
    const seller = evmWallet("a");
    const middleman = evmWallet("b");
    const finalOwner = evmWallet("c");
    const character = makeCharacter();
    await bindTo(env, seller, 5, character);

    env.chain.transfer(5, middleman);
    env.chain.transfer(5, finalOwner);
    const result = await env.nftDemo.syncTransfers(env.deps);

    assert.equal(result.moved.length, 1);
    assert.equal(result.moved[0].toWallet, finalOwner);

    const middlemanProfile = await env.store.getWalletProfile(middleman);
    assert.equal(middlemanProfile.characters.length, 0);
    const finalProfile = await env.store.getWalletProfile(finalOwner);
    assert.equal(finalProfile.characters[0].id, character.id);

    // Повторный синк идемпотентен.
    const second = await env.nftDemo.syncTransfers(env.deps);
    assert.equal(second.moved.length, 0);
  });
});

test("sync: transferring an EMPTY slot moves nothing", async () => {
  await withNftDemoEnv(async (env) => {
    const seller = evmWallet("a");
    const buyer = evmWallet("b");
    env.chain.state.owners.set(1, seller);
    env.chain.transfer(1, buyer);

    const result = await env.nftDemo.syncTransfers(env.deps);
    assert.equal(result.moved.length, 0);
  });
});

test("login sync: listWalletSlots reconciles foreign bindings and reports them", async () => {
  await withNftDemoEnv(async (env) => {
    const seller = evmWallet("a");
    const buyer = evmWallet("b");
    const character = makeCharacter();
    await bindTo(env, seller, 3, character);

    // Прямой перевод без прогона syncTransfers — покупатель просто заходит на сайт.
    env.chain.state.owners.set(3, buyer);

    const result = await env.nftDemo.listWalletSlots(buyer, env.deps);

    assert.equal(result.synced.length, 1);
    assert.equal(result.synced[0].tokenId, 3);
    assert.equal(result.synced[0].from, seller);
    assert.equal(result.slots.length, 1);
    assert.equal(result.slots[0].state, "bound");
    assert.equal(result.slots[0].character.id, character.id);
    assert.equal(result.slots[0].character.name, "Nova Cub");

    const buyerProfile = await env.store.getWalletProfile(buyer);
    assert.equal(buyerProfile.characters[0].id, character.id);

    const state = await env.nftDemoStore.readNftDemoState();
    assert.equal(state.transfers[0].detectedBy, "login");
  });
});

test("move rollback: a failing buyer-profile write restores the seller profile", async () => {
  await withNftDemoEnv(async (env) => {
    const seller = evmWallet("a");
    const buyer = evmWallet("b");
    const character = makeCharacter();
    await bindTo(env, seller, 6, character);
    env.chain.transfer(6, buyer);

    const binding = await env.nftDemoStore.getBinding(6);
    let calls = 0;
    const failingDeps = {
      ...env.deps,
      profiles: {
        ...env.deps.profiles,
        updateWalletProfile: async (wallet, updater) => {
          calls += 1;
          if (calls === 2) throw new Error("buyer write failed"); // вторая запись — покупателю
          return env.deps.profiles.updateWalletProfile(wallet, updater);
        },
      },
    };

    await assert.rejects(() =>
      env.nftDemo.moveBoundCharacter(binding, buyer, { detectedBy: "sync" }, failingDeps)
    );

    const sellerProfile = await env.store.getWalletProfile(seller);
    assert.equal(sellerProfile.characters.length, 1);
    assert.equal(sellerProfile.characters[0].id, character.id);
    const buyerProfile = await env.store.getWalletProfile(buyer);
    assert.equal(buyerProfile.characters.length, 0);

    const unchangedBinding = await env.nftDemoStore.getBinding(6);
    assert.equal(unchangedBinding.wallet, seller);
  });
});

test("move: a buyer with no profile (or an escrow contract address) gets one on the fly", async () => {
  await withNftDemoEnv(async (env) => {
    const seller = evmWallet("a");
    const escrow = evmWallet("e"); // адрес-контракт неотличим от EOA — просто адрес
    const character = makeCharacter();
    await bindTo(env, seller, 4, character);

    env.chain.transfer(4, escrow);
    await env.nftDemo.syncTransfers(env.deps);

    const escrowProfile = await env.store.getWalletProfile(escrow);
    assert.equal(escrowProfile.characters.length, 1);
    assert.equal(escrowProfile.characters[0].id, character.id);
  });
});
