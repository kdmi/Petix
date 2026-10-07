const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { isSameBattleDay, getBattleDateKey } = require("../../api/_lib/battle-energy");
const { serializeCharacterRecord } = require("../../api/_lib/character");

// Feature 027. Energy belongs to the wallet, XP belongs to the pet — so a pet
// walked from wallet to wallet collected a fresh day's energy from each one.
// Production, September 2026: one pet ran 344 battles in 13 days across seven
// wallets (72 in a single day) and reached level 39 while the next best pet in
// the game was 28. Everyone else tops out near 10 battles a day.
//
// The rule: whatever arrives in a wallet is dormant for the rest of that
// battle day — the pet cannot attack, and its capsule pays no bonuses. It is
// written in battle days, not in hours, because the energy reset is the
// boundary the rotation was timed against.

const APP_JS = path.resolve(__dirname, "../../pet-creation/app.js");

function hoursAgo(hours) {
  return new Date(Date.now() - hours * 3600000).toISOString();
}

test("the lock is measured in battle days, so a transfer cannot buy a second allowance", () => {
  const now = new Date("2026-10-08T22:30:00.000Z"); // 18:30 in New York

  // Arrived earlier the same battle day — still locked, however many hours ago.
  assert.equal(isSameBattleDay("2026-10-08T05:00:00.000Z", now), true);
  // Arrived before the reset — free, even though that was only minutes ago.
  assert.equal(isSameBattleDay("2026-10-08T03:59:00.000Z", now), false);

  // The end-of-day move the rotation relied on: hand the pet over at 23:59 and
  // claim the next wallet's allowance for the very same day.
  const lateEvening = new Date("2026-10-09T03:50:00.000Z"); // 23:50 in New York
  assert.equal(
    isSameBattleDay("2026-10-09T03:45:00.000Z", lateEvening),
    true,
    "a pet handed over late in the evening still cannot fight that evening"
  );
  // Ten minutes later the day rolls over and it is free — with one allowance,
  // the same as a pet that never moved.
  const afterMidnight = new Date("2026-10-09T04:05:00.000Z");
  assert.equal(isSameBattleDay("2026-10-09T03:45:00.000Z", afterMidnight), false);
  assert.notEqual(getBattleDateKey(lateEvening), getBattleDateKey(afterMidnight));
});

test("a timestamp that is missing or unreadable never locks a pet", () => {
  assert.equal(isSameBattleDay(null), false);
  assert.equal(isSameBattleDay(undefined), false);
  assert.equal(isSameBattleDay(""), false);
  assert.equal(isSameBattleDay("not a date"), false);
});

test("the card is told when the pet is free again", () => {
  const base = {
    id: "char_moved",
    status: "completed",
    creatureType: "Panda",
    rarity: "Epic",
    name: "Turf Byte",
    level: 7,
    experience: 0,
    attributes: { stamina: 5, agility: 5, strength: 5, intelligence: 5 },
    variables: {},
    powers: [{ id: "p1", title: "Zap", description: "A jolt." }],
    selectedPowerId: "p1",
  };

  const justArrived = serializeCharacterRecord({ ...base, transferredAt: new Date().toISOString() });
  assert.ok(justArrived.settlingUntil, "a pet that arrived today carries the unlock time");
  assert.ok(
    new Date(justArrived.settlingUntil).getTime() > Date.now(),
    "and that time is in the future"
  );

  const settled = serializeCharacterRecord({ ...base, transferredAt: hoursAgo(48) });
  assert.equal(settled.settlingUntil, null, "a pet that has been here since yesterday is free");

  const neverMoved = serializeCharacterRecord(base);
  assert.equal(neverMoved.settlingUntil, null, "a pet that never moved is never locked");
});

test("the dashboard blocks the fight and says the same sentence everywhere", () => {
  const source = require("fs").readFileSync(APP_JS, "utf8");

  assert.match(
    source,
    /const settlingUntil = getSettlingDeadline\(record\);/,
    "the card reads the lock from the server, not from its own clock"
  );
  assert.match(
    source,
    /data-settling-at="\$\{settlingUntil\}" aria-disabled="true"/,
    "the fight button stays clickable while locked, so it can explain itself"
  );

  // One sentence, in the tooltip, in the toast and on the button.
  const copy = /Fights and capsule bonuses available from the next battle day|Fights available from the next battle day/g;
  assert.ok((source.match(copy) || []).length >= 3, "the same wording in every place it is said");
});

const {
  evmWallet,
  makeCharacter,
  seedCharacters,
  withNftEnv,
} = require("./helpers/nft-test-utils");

test("a capsule that changed hands today pays no bonus today", async () => {
  await withNftEnv(async ({ chain, deps, nft, nftStore, store }) => {
    const owner = evmWallet("a");
    const buyer = evmWallet("b");

    chain.state.owners.set(1, owner);
    const character = makeCharacter();
    await seedCharacters(store, owner, [character]);
    await nft.bindCharacterToSlot(owner, 1, character.id, deps);

    const tier = nft.getCapsuleTier(1);
    const perTier = { glass: 0, bronze: 0, silver: 1, gold: 2, prismatic: 3 }[tier];
    const settled = await nft.getWalletCapsuleBonus(owner, deps);
    assert.equal(settled.extraBattles, perTier, "the owner who had it all along gets the bonus");

    // Sold: the capsule and the pet inside it land in another wallet today.
    chain.transfer(1, buyer);
    await nft.syncTransfers(deps);

    const binding = await nftStore.getBinding(1);
    assert.equal(binding.wallet, buyer, "the capsule followed the sale");
    assert.ok(binding.movedAt, "and remembers when it arrived");

    const fresh = await nft.getWalletCapsuleBonus(buyer, deps);
    assert.equal(
      fresh.extraBattles,
      0,
      "but it pays the new wallet nothing until the next battle day"
    );
    assert.equal(fresh.winBonusPct, 0);

    // Yesterday's arrival is a settled capsule and pays normally.
    await nftStore.withNftState((state) => {
      state.bindings["1"].movedAt = hoursAgo(48);
      return state;
    });
    const tomorrow = await nft.getWalletCapsuleBonus(buyer, deps);
    assert.equal(tomorrow.extraBattles, perTier, "from the next battle day the bonus is back");
  });
});

test("the pet that changed hands today carries the lock with it", async () => {
  await withNftEnv(async ({ chain, deps, nft, store }) => {
    const owner = evmWallet("c");
    const buyer = evmWallet("d");

    chain.state.owners.set(2, owner);
    const character = makeCharacter();
    await seedCharacters(store, owner, [character]);
    await nft.bindCharacterToSlot(owner, 2, character.id, deps);

    chain.transfer(2, buyer);
    await nft.syncTransfers(deps);

    const profile = await store.getWalletProfile(buyer);
    const moved = profile.characters.find((record) => record.id === character.id);
    assert.ok(moved, "the pet moved with the capsule");
    assert.ok(moved.transferredAt, "and the arrival is stamped on the pet itself");
    // The harness runs on a fixed clock, so judge the stamp against that clock
    // rather than against the wall clock of the test run.
    assert.equal(
      isSameBattleDay(moved.transferredAt, new Date(moved.transferredAt)),
      true,
      "the stamp is the moment of arrival, which is what the battle route compares"
    );
    assert.equal(
      isSameBattleDay(moved.transferredAt, new Date(Date.parse(moved.transferredAt) + 48 * 3600000)),
      false,
      "and two days later the same pet is free"
    );
  });
});

const { withFakeBlobIntegrationEnv } = require("./helpers/blob-call-counter");

function arenaPet(id, name) {
  return {
    id,
    status: "completed",
    creatureType: "Arena Cub",
    rarity: "Rare",
    name,
    displayName: name,
    level: 3,
    experience: 0,
    softCurrency: 0,
    attributePointsAvailable: 0,
    attributes: { stamina: 4, agility: 5, strength: 6, intelligence: 7 },
    variables: {
      ELEMENT: "Arc static",
      TOP_ITEM: "Tiny visor",
      PROFESSION_STYLE: "Arena gremlin",
      SIDE_DETAILS: "Loose sparks",
      FACIAL_FEATURES: "Wide grin",
      ELEMENT_EFFECTS: "Neon crackles",
    },
    selectedPowerId: "power_1",
    powers: [{ id: "power_1", title: "Chaos Burst", description: "A noisy blast." }],
    image: {},
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:00.000Z",
  };
}

async function fight(battlesRoute, auth, secret, wallet, petId) {
  const listeners = { data: [], end: [], error: [] };
  const req = {
    method: "POST",
    url: "/api/battles",
    headers: {
      host: "localhost:3000",
      [auth.INTERNAL_AUTH_HEADER]: secret,
      [auth.INTERNAL_WALLET_HEADER]: wallet,
      [auth.INTERNAL_WALLET_NAME_HEADER]: "Tester",
      [auth.INTERNAL_WALLET_TYPE_HEADER]: "internal",
    },
    on(event, callback) {
      if (listeners[event]) listeners[event].push(callback);
      return this;
    },
  };
  const res = {
    statusCode: 200,
    bodyText: "",
    setHeader() {},
    getHeader() {
      return undefined;
    },
    end(value = "") {
      this.bodyText = String(value || "");
    },
  };

  const pending = Promise.resolve().then(() => battlesRoute(req, res));
  process.nextTick(() => {
    listeners.data.forEach((cb) => cb(JSON.stringify({ attackerPetId: petId })));
    listeners.end.forEach((cb) => cb());
  });
  await pending;
  return { statusCode: res.statusCode, body: res.bodyText ? JSON.parse(res.bodyText) : null };
}

test("the battle route refuses a pet that arrived today and keeps its energy", async () => {
  await withFakeBlobIntegrationEnv(async ({ store, battlesRoute, auth, internalSecret }) => {
    const attacker = "e".repeat(32);
    const defender = "f".repeat(32);

    const profile = (records) => ({
      draft: null,
      characters: records,
      notifications: [],
      battleState: { energyUsed: 0, energyPurchased: 0 },
      currency: { balance: 0, totalEarned: 0 },
    });

    await store.saveWalletProfile(
      attacker,
      profile([
        { ...arenaPet("pet_arrived", "Newcomer"), transferredAt: new Date().toISOString() },
        { ...arenaPet("pet_resident", "Local") },
      ])
    );
    await store.saveWalletProfile(defender, profile([arenaPet("pet_rival", "Rival")]));

    const blocked = await fight(battlesRoute, auth, internalSecret, attacker, "pet_arrived");
    assert.equal(blocked.statusCode, 400);
    assert.equal(blocked.body.error, "PET_SETTLING");
    assert.ok(blocked.body.readyAt, "the answer says when the pet is free");

    const after = await store.getWalletProfile(attacker);
    assert.equal(after.battleState.energyUsed || 0, 0, "a refused fight costs no energy");

    // The wallet's other pets are unaffected — the lock is on the pet, not the
    // wallet, so a legitimate purchase does not freeze the whole roster.
    const allowed = await fight(battlesRoute, auth, internalSecret, attacker, "pet_resident");
    assert.equal(allowed.statusCode, 200, "the pet that was already here fights as usual");
  });
});
