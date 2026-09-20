const test = require("node:test");
const assert = require("node:assert/strict");

const { withFakeBlobEnv } = require("./helpers/blob-call-counter");

// Feature 023 — roster index. Matchmaking must stop reading every wallet
// profile per battle (the 2026-09-20 "fetch failed" incident): one compact
// index, refreshed incrementally from the `uploadedAt` the blob listing
// reports, with a full scan as the fallback.

const OLD_UPLOADED_AT = "2026-09-01T00:00:00.000Z";

// Fixture wallets are deliberately NOT 0x-addresses: the repo forbids
// committing anything address-shaped (feature 019, FR-016).
function walletAt(index) {
  return `test-wallet-${String(index).padStart(3, "0")}`;
}

function completedCharacter(index, overrides = {}) {
  return {
    id: `pet_${index}`,
    status: "completed",
    name: `Pet ${index}`,
    creatureType: "Panda",
    rarity: "Rare",
    level: 3,
    powers: [{ id: "pw1", name: "Nacho Beam", description: "Zap" }],
    selectedPowerId: "pw1",
    completedAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

async function seedWallets(store, count) {
  for (let index = 0; index < count; index += 1) {
    await store.saveWalletProfile(walletAt(index), { characters: [completedCharacter(index)] });
  }
}

// The fake blob stamps every write with "now"; backdating the profile blobs
// makes the watermark meaningful, exactly like a store that has been idle.
function backdateProfileBlobs(state, uploadedAt = OLD_UPLOADED_AT) {
  for (const [pathname, entry] of state.entries()) {
    if (pathname.startsWith("wallet-profiles/")) {
      entry.uploadedAt = uploadedAt;
    }
  }
}

function rosterBlobPath(state) {
  for (const pathname of state.keys()) {
    if (pathname.endsWith("-roster.json") && !pathname.includes("-roster-v/")) {
      return pathname;
    }
  }
  return null;
}

async function withRosterEnv(overrides, run) {
  const previous = {};
  const defaults = {
    ROSTER_ENABLED: "1",
    ROSTER_CACHE_TTL_MS: "0",
    ROSTER_MAX_AGE_MS: "600000",
    ROSTER_WATERMARK_OVERLAP_MS: "0",
    ROSTER_FULL_EVERY: "1000",
    WALLET_PROFILE_SCAN_TTL_MS: "0",
  };
  const applied = { ...defaults, ...overrides };

  for (const [key, value] of Object.entries(applied)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("buildRosterEntry projects only what matchmaking and the reveal cards need", async () => {
  await withRosterEnv({}, async () => {
    await withFakeBlobEnv(async ({ roster }) => {
      const entry = roster.buildRosterEntry(walletAt(1), completedCharacter(1));

      assert.equal(entry.wallet, walletAt(1));
      assert.equal(entry.character.id, "pet_1");
      assert.equal(entry.character.level, 3);
      assert.equal(entry.character.rarity, "Rare");
      assert.ok(entry.character.imageUrl, "the card cannot render without an image url");
      assert.deepEqual(entry.character.selectedPower, { id: "pw1", name: "Nacho Beam" });
      assert.equal(entry.character.powers, undefined, "full power list must not be carried");
      assert.equal(entry.character.attributes, undefined, "battle stats must not be carried");

      assert.equal(
        roster.buildRosterEntry(walletAt(2), completedCharacter(2, { status: "draft" })),
        null,
        "drafts can never be an opponent"
      );
      assert.equal(roster.buildRosterEntry("", completedCharacter(3)), null);
    });
  });
});

test("a full refresh indexes every completed character and records a watermark", async () => {
  await withRosterEnv({}, async () => {
    await withFakeBlobEnv(async ({ store, roster, state }) => {
      await seedWallets(store, 4);
      await store.saveWalletProfile(walletAt(99), {
        draft: { id: "draft_99", status: "draft", name: "Half-baked" },
      });
      backdateProfileBlobs(state);
      store.clearWalletProfileCache();

      const stats = await roster.refreshRoster({ force: true });

      assert.equal(stats.mode, "full");
      assert.equal(stats.entries, 4, "the draft-only wallet must not be indexed");
      assert.ok(stats.watermark, "a full build must record a watermark");

      const entries = await roster.getRoster();
      assert.equal(entries.length, 4);
      assert.deepEqual(
        entries.map((entry) => entry.character.id).sort(),
        ["pet_0", "pet_1", "pet_2", "pet_3"]
      );

      const status = await roster.getRosterStatus();
      assert.equal(status.entries, 4);
      assert.equal(status.wallets, 4);
      assert.ok(status.builtAt);
      assert.ok(rosterBlobPath(state), "the index must be persisted");
    });
  });
});

test("an incremental refresh re-reads only the profiles that changed", async () => {
  await withRosterEnv({}, async () => {
    await withFakeBlobEnv(async ({ store, roster, state, counts, resetCounts }) => {
      await seedWallets(store, 6);
      backdateProfileBlobs(state);
      store.clearWalletProfileCache();
      await roster.refreshRoster({ force: true });

      // One player levels up; its blob gets a fresh uploadedAt, the rest stay old.
      await store.updateWalletProfile(walletAt(2), (profile) => {
        profile.characters[0].level = 9;
        return profile;
      });
      resetCounts();

      const stats = await roster.refreshRoster();

      assert.equal(stats.mode, "incremental");
      assert.equal(stats.profilesRead, 1, `expected one profile re-read, got ${stats.profilesRead}`);
      assert.equal(stats.entries, 6, "untouched wallets keep their indexed entries");
      assert.ok(counts.get < 6, `a single change must not re-read the store, got ${counts.get} gets`);

      const entries = await roster.getRoster();
      const updated = entries.find((entry) => entry.character.id === "pet_2");
      assert.equal(updated.character.level, 9, "the changed profile must be reflected");
    });
  });
});

test("characters and wallets that disappear leave the index", async () => {
  await withRosterEnv({}, async () => {
    await withFakeBlobEnv(async ({ store, roster, state }) => {
      await store.saveWalletProfile(walletAt(1), {
        characters: [completedCharacter(1), completedCharacter(11)],
      });
      await store.saveWalletProfile(walletAt(2), { characters: [completedCharacter(2)] });
      backdateProfileBlobs(state);
      store.clearWalletProfileCache();
      await roster.refreshRoster({ force: true });

      // Burn one of the two pets of wallet 1.
      await store.updateWalletProfile(walletAt(1), (profile) => {
        profile.characters = profile.characters.filter((record) => record.id !== "pet_11");
        return profile;
      });
      // Wallet 2 vanishes from storage entirely.
      for (const pathname of [...state.keys()]) {
        if (pathname.startsWith(`wallet-profiles/${walletAt(2)}`)) {
          state.delete(pathname);
        }
      }
      store.clearWalletProfileCache();

      await roster.refreshRoster();
      const ids = (await roster.getRoster()).map((entry) => entry.character.id).sort();

      assert.deepEqual(ids, ["pet_1"], "burned pet and vanished wallet must be gone");
    });
  });
});

test("a missing or corrupt index is rebuilt instead of failing the caller", async () => {
  await withRosterEnv({}, async () => {
    await withFakeBlobEnv(async ({ store, roster, state, setEntry }) => {
      await seedWallets(store, 3);
      backdateProfileBlobs(state);
      store.clearWalletProfileCache();
      await roster.refreshRoster({ force: true });

      const pathname = rosterBlobPath(state);
      setEntry(pathname, "{ this is not json");
      roster.clearRosterCache();

      const entries = await roster.getRoster();
      assert.equal(entries.length, 3, "a corrupt index must fall back to the full scan");

      roster.clearRosterCache();
      const rebuilt = await roster.getRoster();
      assert.equal(rebuilt.length, 3);
    });
  });
});

test("an index older than ROSTER_MAX_AGE_MS is rebuilt lazily", async () => {
  await withRosterEnv({ ROSTER_MAX_AGE_MS: "1000" }, async () => {
    await withFakeBlobEnv(async ({ store, roster, state, setEntry }) => {
      await seedWallets(store, 2);
      backdateProfileBlobs(state);
      store.clearWalletProfileCache();
      await roster.refreshRoster({ force: true });

      const pathname = rosterBlobPath(state);
      const stale = JSON.parse(state.get(pathname).content);
      stale.builtAt = "2026-09-01T00:00:00.000Z";
      stale.entries = [];
      setEntry(pathname, JSON.stringify(stale));
      roster.clearRosterCache();

      const entries = await roster.getRoster();
      assert.equal(entries.length, 2, "a stale index must be rebuilt, not served empty");
    });
  });
});

test("ROSTER_ENABLED=0 keeps the pre-023 behaviour and never touches the index", async () => {
  await withRosterEnv({ ROSTER_ENABLED: "0" }, async () => {
    await withFakeBlobEnv(async ({ store, roster, state }) => {
      await seedWallets(store, 3);
      store.clearWalletProfileCache();

      const entries = await roster.getRoster();
      assert.equal(entries.length, 3, "the full scan still answers");
      assert.equal(rosterBlobPath(state), null, "no index blob may be written while disabled");

      const stats = await roster.refreshRoster();
      assert.equal(stats.mode, "skipped");
      assert.equal(stats.reason, "ROSTER_DISABLED");
    });
  });
});

// FR-003: the index is only a candidate list. Once an opponent is chosen, the
// fight must be computed from that opponent's CURRENT profile — otherwise a
// player could be matched against a snapshot that is up to a minute out of date.
const { withFakeBlobIntegrationEnv } = require("./helpers/blob-call-counter");

function battleReadyCharacter(id, name, level) {
  return {
    id,
    status: "completed",
    creatureType: "Arena Cub",
    rarity: "Rare",
    name,
    displayName: name,
    level,
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
    powers: [{ id: "power_1", title: "Chaos Burst", description: "A noisy finishing blast." }],
    image: {},
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:00.000Z",
  };
}

function battleProfile(character) {
  return {
    draft: null,
    characters: [character],
    notifications: [],
    battleState: { energyCurrent: 3, energyMax: 3, refillDate: null },
    currency: { balance: 0, totalEarned: 0 },
  };
}

test("the fight uses the defender's current profile, not the indexed snapshot", async () => {
  await withRosterEnv({ ROSTER_CACHE_TTL_MS: "60000" }, async () => {
    await withFakeBlobIntegrationEnv(async ({ store, roster, battlesRoute, auth, internalSecret }) => {
      // Base58-looking fixtures: the internal session only accepts wallets that
      // look like a real address (base58 or 0x), and 0x is banned in the repo.
      const attackerWallet = "g".repeat(32);
      const defenderWallet = "h".repeat(32);
      const attacker = battleReadyCharacter("pet_fresh_atk", "FreshAtk", 4);

      await store.saveWalletProfile(attackerWallet, battleProfile(attacker));
      await store.saveWalletProfile(
        defenderWallet,
        battleProfile(battleReadyCharacter("pet_fresh_def", "FreshDef", 4))
      );
      store.clearWalletProfileCache();

      // Index the roster, then let the defender level up behind its back.
      await roster.refreshRoster({ force: true });
      await store.updateWalletProfile(defenderWallet, (profile) => {
        profile.characters[0].level = 11;
        return profile;
      });

      const indexedLevel = (await roster.getRoster()).find(
        (entry) => entry.character.id === "pet_fresh_def"
      ).character.level;
      assert.equal(indexedLevel, 4, "the index is deliberately stale for this test");

      const listeners = { data: [], end: [], error: [] };
      const req = {
        method: "POST",
        url: "/api/battles",
        headers: {
          host: "localhost:3000",
          [auth.INTERNAL_AUTH_HEADER]: internalSecret,
          [auth.INTERNAL_WALLET_HEADER]: attackerWallet,
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
        const raw = JSON.stringify({ attackerPetId: attacker.id });
        listeners.data.forEach((cb) => cb(raw));
        listeners.end.forEach((cb) => cb());
      });
      await pending;

      assert.equal(res.statusCode, 200, `battle must succeed, got ${res.bodyText}`);
      const body = JSON.parse(res.bodyText);
      assert.equal(
        body.battle.defender.level,
        11,
        "the simulation must use the defender's fresh level, not the indexed one"
      );
    });
  });
});
