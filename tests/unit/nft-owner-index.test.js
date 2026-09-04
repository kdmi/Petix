const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evmWallet,
  makeCharacter,
  seedCharacters,
  withNftEnv,
} = require("./helpers/nft-test-utils");

// OpenSea's ERC721SeaDrop (the contract behind a Studio drop) is ERC721A and
// exposes no tokenOfOwnerByIndex. Ownership must then come from replaying
// Transfer logs into a local index.

test("non-enumerable contract: wallet slots come from the Transfer-log index", async (t) => {
  await withNftEnv(async (env) => {
    env.chain.state.enumerable = false;
    const buyer = evmWallet("b");

    // Дроп: покупатель минтит два токена на OpenSea.
    env.chain.mintTo(11, buyer);
    env.chain.mintTo(12, buyer);

    const tokenIds = await env.nft.getWalletTokenIds(buyer, env.deps);
    assert.deepEqual(tokenIds, [11, 12]);

    const state = await env.nftStore.readNftState();
    assert.equal(state.owners["11"], buyer);
    assert.equal(state.startBlock, 1);
    assert.ok(state.lastSyncedBlock >= 2);
  });
});

test("non-enumerable contract: index follows a resale to another wallet", async (t) => {
  await withNftEnv(async (env) => {
    env.chain.state.enumerable = false;
    const seller = evmWallet("a");
    const buyer = evmWallet("b");

    env.chain.mintTo(7, seller);
    assert.deepEqual(await env.nft.getWalletTokenIds(seller, env.deps), [7]);

    env.chain.transfer(7, buyer); // продажа на маркетплейсе
    assert.deepEqual(await env.nft.getWalletTokenIds(buyer, env.deps), [7]);
    assert.deepEqual(await env.nft.getWalletTokenIds(seller, env.deps), []);
  });
});

test("non-enumerable contract: bound pet moves with a marketplace sale", async (t) => {
  await withNftEnv(async (env) => {
    env.chain.state.enumerable = false;
    const seller = evmWallet("a");
    const buyer = evmWallet("b");
    const character = makeCharacter({ level: 4 });

    env.chain.mintTo(5, seller);
    await seedCharacters(env.store, seller, [character]);
    await env.nft.bindCharacterToSlot(seller, 5, character.id, env.deps);

    env.chain.transfer(5, buyer);
    const result = await env.nft.listWalletSlots(buyer, env.deps);

    assert.equal(result.slots.length, 1);
    assert.equal(result.slots[0].tokenId, 5);
    assert.equal(result.slots[0].state, "bound");
    assert.equal(result.synced.length, 1);

    const buyerProfile = await env.store.getWalletProfile(buyer);
    assert.equal(buyerProfile.characters[0].id, character.id);
    assert.equal(buyerProfile.characters[0].level, 4);
  });
});

test("index drops tokens burned to the zero address", async (t) => {
  await withNftEnv(async (env) => {
    env.chain.state.enumerable = false;
    const holder = evmWallet("a");
    env.chain.mintTo(3, holder);
    assert.deepEqual(await env.nft.getWalletTokenIds(holder, env.deps), [3]);

    env.chain.transfer(3, "0x0000000000000000000000000000000000000000");
    await env.nft.ensureOwnerIndex(env.deps);

    const state = await env.nftStore.readNftState();
    assert.equal(state.owners["3"], undefined);
    assert.deepEqual(await env.nft.getWalletTokenIds(holder, env.deps), []);
  });
});

test("enumerable contract still uses the direct path (no index needed)", async (t) => {
  await withNftEnv(async (env) => {
    const holder = evmWallet("a");
    env.chain.state.owners.set(2, holder); // enumerable: true по умолчанию

    assert.deepEqual(await env.nft.getWalletTokenIds(holder, env.deps), [2]);
    const state = await env.nftStore.readNftState();
    assert.deepEqual(state.owners, {}); // индекс не строился
  });
});
