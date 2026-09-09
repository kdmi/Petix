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

    assert.equal(metadata.name, "Capsule #12");
    // Пустая капсула показывает сундук своего тира — это её единственное
    // отличие от соседних до того, как внутрь посадят питомца.
    const tier = nft.getCapsuleTier(12);
    assert.ok(tier, "у каждого номера в тираже есть тир");
    assert.equal(metadata.image, `${ORIGIN}/assets/nft/capsules/${tier}.png`);
    assert.deepEqual(metadata.attributes.map((a) => a.trait_type), ["Status", "Tier"]);
    assert.equal(metadata.attributes[0].value, "Empty");
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

test("metadata: an occupied capsule serves the trimmed trait set and no prompts", async () => {
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
    assert.equal(byTrait.Status, "Occupied");
    assert.equal(byTrait.Rarity, "Epic");
    assert.equal(byTrait.Obsession, "Origami paper");
    assert.equal(byTrait.Level, 3);
    // Top Item в этой фикстуре пуст — пустые variables в трейты не идут.
    assert.deepEqual(Object.keys(byTrait).sort(), ["Level", "Obsession", "Rarity", "Status", "Tier"]);

    // Всё остальное намеренно вне метаданных: внешность видна на картинке,
    // способность уникальна у каждого питомца, атрибуты растут от игры.
    for (const dropped of [
      "Creature",
      "Power",
      "Element",
      "Profession Style",
      "Element Effects",
      "Facial Features",
      "Body Color",
      "Side Details",
      "Stamina",
      "Agility",
      "Strength",
      "Intelligence",
    ]) {
      assert.ok(!(dropped in byTrait), `${dropped} не должен попадать в трейты`);
    }

    // Тип существа игрок вписывает свободным текстом — наружу он не идёт
    // ни трейтом, ни в описании: фильтровать его на всех языках нереально,
    // а картинку и так модерирует генератор.
    const raw = JSON.stringify(metadata).toLowerCase();
    assert.ok(!raw.includes("cat"), "тип существа не публикуется");
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

test("metadata: Clearing во время заявки, затем снова пустая капсула", async () => {
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
    assert.deepEqual(pending.attributes.map((a) => a.trait_type), ["Status", "Tier"]);
    assert.equal(pending.attributes[0].value, "Clearing");

    await nft.processPendingUnbinds({ ...deps, now: () => Date.parse("2026-09-02T14:00:00.000Z") });
    const cleared = await nft.getTokenMetadata(6, ORIGIN, deps);
    assert.equal(cleared.attributes[0].value, "Empty");
  });
});

test("metadata: collection-level document is neutral", async () => {
  await withNftEnv(async ({ nft }) => {
    const metadata = nft.buildCollectionMetadata(ORIGIN);
    assert.equal(metadata.name, "Slot Box");
    assert.match(metadata.description, /10,000 capsules/, "supply берётся из конфига");
    assert.match(metadata.image, /\/assets\/nft\/capsules\/[a-z]+\.png$/);
    assert.ok(!JSON.stringify(metadata).toLowerCase().includes("petix"));
  });
});

test("metadata: Top Item is served when the pet actually has one", async () => {
  await withNftEnv(async ({ chain, deps, nft, store }) => {
    const wallet = evmWallet("b");
    const character = makeCharacter({
      variables: {
        ELEMENT: "Pure caffeine",
        PROFESSION_STYLE: "Tired IT support",
        TOP_ITEM: "Traffic cone",
        BODY_COLOR: "Vantablack",
      },
    });
    await seedCharacters(store, wallet, [character]);
    chain.state.owners.set(9, wallet);
    await nft.bindCharacterToSlot(wallet, 9, character.id, deps);

    const metadata = await nft.getTokenMetadata(9, ORIGIN, deps);
    const byTrait = Object.fromEntries(
      metadata.attributes.map((entry) => [entry.trait_type, entry.value])
    );

    assert.equal(byTrait["Top Item"], "Traffic cone");
    assert.equal(byTrait.Obsession, "Pure caffeine");
    assert.ok(!("Body Color" in byTrait), "внешность остаётся на картинке");
    assert.ok(!("Profession Style" in byTrait));
  });
});
