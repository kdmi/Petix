const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evmWallet,
  makeCharacter,
  seedCharacters,
  withNftEnv,
} = require("./helpers/nft-test-utils");

const ORIGIN = "https://demo.test";

test("metadata: minted empty slot serves the neutral placeholder", async () => {
  await withNftEnv(async ({ chain, deps, nft }) => {
    chain.state.owners.set(12, evmWallet("a"));

    const metadata = await nft.getTokenMetadata(12, ORIGIN, deps);

    assert.equal(metadata.name, "Slot #12");
    assert.equal(metadata.image, `${ORIGIN}/assets/nft/placeholder.png`);
    assert.deepEqual(metadata.attributes, [{ trait_type: "Status", value: "Empty Slot" }]);
    assert.ok(!JSON.stringify(metadata).toLowerCase().includes("petix"));
  });
});

test("metadata: unminted and out-of-range tokens resolve to null (404)", async () => {
  await withNftEnv(async ({ deps, nft }) => {
    assert.equal(await nft.getTokenMetadata(42, ORIGIN, deps), null);
    assert.equal(await nft.getTokenMetadata(101, ORIGIN, deps), null);
    assert.equal(await nft.getTokenMetadata(0, ORIGIN, deps), null);
    assert.equal(await nft.getTokenMetadata("abc", ORIGIN, deps), null);
  });
});

test("metadata: bound slot serves the character with full traits and no prompts", async () => {
  await withNftEnv(async ({ chain, deps, nft, store }) => {
    const wallet = evmWallet("a");
    const character = makeCharacter({
      level: 3,
      prompts: { image: "SECRET PROMPT", powers: "SECRET", name: "SECRET" },
      generation: { imageProvider: "gemini" },
    });
    await seedCharacters(store, wallet, [character]);
    chain.state.owners.set(8, wallet);
    await nft.bindCharacterToSlot(wallet, 8, character.id, deps);

    const metadata = await nft.getTokenMetadata(8, ORIGIN, deps);

    assert.equal(metadata.name, "Nova Cub");
    assert.equal(metadata.image, `https://gateway.test/ipfs/fake-8-${character.id}`);

    const byTrait = Object.fromEntries(
      metadata.attributes.map((entry) => [entry.trait_type, entry.value])
    );
    assert.equal(byTrait.Status, "Bound");
    assert.equal(byTrait.Rarity, "Epic");
    assert.equal(byTrait.Creature, "Cat");
    assert.equal(byTrait.Element, "Origami paper");
    assert.equal(byTrait["Profession Style"], "Twitch streamer");
    assert.equal(byTrait["Element Effects"], "Floating jigsaw pieces");
    assert.equal(byTrait["Facial Features"], "Half-closed lazy eyes");
    // пустые variables не попадают в трейты
    assert.ok(!("Top Item" in byTrait));
    assert.ok(!("Body Color" in byTrait));
    assert.ok(!("Side Details" in byTrait));
    assert.equal(byTrait.Power, "Paper Storm");
    assert.equal(byTrait.Level, 3);
    assert.equal(byTrait.Stamina, 4);
    assert.equal(byTrait.Agility, 2);
    assert.equal(byTrait.Strength, 3);
    assert.equal(byTrait.Intelligence, 4);

    const raw = JSON.stringify(metadata).toLowerCase();
    assert.ok(!raw.includes("prompt"));
    assert.ok(!raw.includes("secret"));
    assert.ok(!raw.includes("petix"));
    assert.ok(!raw.includes(wallet));
  });
});

test("metadata: reflects the live character level after progression", async () => {
  await withNftEnv(async ({ chain, deps, nft, store }) => {
    const wallet = evmWallet("a");
    const character = makeCharacter({ level: 1 });
    await seedCharacters(store, wallet, [character]);
    chain.state.owners.set(3, wallet);
    await nft.bindCharacterToSlot(wallet, 3, character.id, deps);

    await store.updateWalletProfile(wallet, (current) => {
      current.characters[0].level = 6;
      return current;
    });

    const metadata = await nft.getTokenMetadata(3, ORIGIN, deps);
    const level = metadata.attributes.find((entry) => entry.trait_type === "Level");
    assert.equal(level.value, 6);
  });
});

test("metadata: Unbinding во время заявки, затем снова пустой слот", async () => {
  await withNftEnv(async ({ chain, deps, nft, store }) => {
    const wallet = evmWallet("a");
    const character = makeCharacter();
    await seedCharacters(store, wallet, [character], {
      currency: { balance: 25000, totalEarned: 25000 },
    });
    chain.state.owners.set(6, wallet);
    await nft.bindCharacterToSlot(wallet, 6, character.id, deps);

    await nft.requestUnbindSlot(wallet, 6, deps);
    const pending = await nft.getTokenMetadata(6, ORIGIN, deps);
    assert.deepEqual(pending.attributes, [{ trait_type: "Status", value: "Unbinding" }]);
    assert.equal(pending.image, `${ORIGIN}/assets/nft/placeholder.png`);

    await nft.processPendingUnbinds({ ...deps, now: () => Date.parse("2026-09-02T14:00:00.000Z") });
    const cleared = await nft.getTokenMetadata(6, ORIGIN, deps);
    assert.deepEqual(cleared.attributes, [{ trait_type: "Status", value: "Empty Slot" }]);
  });
});

test("metadata: collection-level document is neutral", async () => {
  await withNftEnv(async ({ nft }) => {
    const metadata = nft.buildCollectionMetadata(ORIGIN);
    assert.equal(metadata.name, "Slot Box");
    assert.match(metadata.description, /10,000 capsules/, "supply берётся из конфига");
    assert.equal(metadata.image, `${ORIGIN}/assets/nft/placeholder.png`);
    assert.ok(!JSON.stringify(metadata).toLowerCase().includes("petix"));
  });
});
