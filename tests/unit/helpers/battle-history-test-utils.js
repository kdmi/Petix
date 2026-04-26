const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const INTERNAL_SECRET = "petix-battle-history-internal-secret";
const BATTLE_STORE_PATH = path.resolve(__dirname, "../../../api/_lib/battle-store.js");
const BATTLE_LIB_PATH = path.resolve(__dirname, "../../../api/_lib/battle.js");
const BATTLE_MATCHMAKING_PATH = path.resolve(__dirname, "../../../api/_lib/battle-matchmaking.js");
const CHARACTER_LIB_PATH = path.resolve(__dirname, "../../../api/_lib/character.js");
const CHARACTER_ACTION_ROUTE_PATH = path.resolve(__dirname, "../../../api/character/[action].js");
const ADMIN_ACTION_ROUTE_PATH = path.resolve(__dirname, "../../../api/admin/[action].js");
const BATTLES_ROUTE_PATH = path.resolve(__dirname, "../../../api/battles/index.js");
const BATTLE_BY_ID_ROUTE_PATH = path.resolve(__dirname, "../../../api/battles/[battleId].js");
const OPPONENTS_ROUTE_PATH = path.resolve(__dirname, "../../../api/battles/opponents.js");
const CHARACTER_IMAGE_ROUTE_PATH = path.resolve(__dirname, "../../../server-routes/character/image.js");
const CHARACTER_UPGRADE_ROUTE_PATH = path.resolve(__dirname, "../../../server-routes/character/upgrade.js");
const AUTH_PATH = path.resolve(__dirname, "../../../api/_lib/auth.js");
const STORE_PATH = path.resolve(__dirname, "../../../api/_lib/store.js");

function clearModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

function freshRequire(modulePath) {
  clearModule(modulePath);
  return require(modulePath);
}

async function withIsolatedBattleHistoryEnv(run, options = {}) {
  const originalCwd = process.cwd();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalInternalSecret = process.env.INTERNAL_API_SECRET;
  const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const originalDisableBattleAi = process.env.DISABLE_BATTLE_AI;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "petix-battle-history-"));

  try {
    process.chdir(tempDir);
    process.env.NODE_ENV = "test";
    process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
    process.env.DISABLE_BATTLE_AI = "true";
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const battleStore = freshRequire(BATTLE_STORE_PATH);
    const store = freshRequire(STORE_PATH);
    const auth = freshRequire(AUTH_PATH);
    freshRequire(CHARACTER_LIB_PATH);
    freshRequire(BATTLE_MATCHMAKING_PATH);
    freshRequire(BATTLE_LIB_PATH);
    freshRequire(CHARACTER_UPGRADE_ROUTE_PATH);
    const characterActionRoute = freshRequire(CHARACTER_ACTION_ROUTE_PATH);
    const adminActionRoute = freshRequire(ADMIN_ACTION_ROUTE_PATH);

    if (typeof options.beforeRoutes === "function") {
      await options.beforeRoutes({ battleStore, store, auth });
    }

    const battlesRoute = freshRequire(BATTLES_ROUTE_PATH);
    const battleByIdRoute = freshRequire(BATTLE_BY_ID_ROUTE_PATH);
    const opponentsRoute = freshRequire(OPPONENTS_ROUTE_PATH);
    const characterImageRoute = freshRequire(CHARACTER_IMAGE_ROUTE_PATH);

    return await run({
      auth,
      adminActionRoute,
      battleStore,
      battleByIdRoute,
      battlesRoute,
      characterActionRoute,
      characterImageRoute,
      opponentsRoute,
      store,
      tempDir,
    });
  } finally {
    clearModule(CHARACTER_ACTION_ROUTE_PATH);
    clearModule(ADMIN_ACTION_ROUTE_PATH);
    clearModule(CHARACTER_UPGRADE_ROUTE_PATH);
    clearModule(BATTLE_LIB_PATH);
    clearModule(BATTLE_MATCHMAKING_PATH);
    clearModule(CHARACTER_LIB_PATH);
    clearModule(OPPONENTS_ROUTE_PATH);
    clearModule(CHARACTER_IMAGE_ROUTE_PATH);
    clearModule(BATTLE_BY_ID_ROUTE_PATH);
    clearModule(BATTLES_ROUTE_PATH);
    clearModule(AUTH_PATH);
    clearModule(BATTLE_STORE_PATH);
    clearModule(STORE_PATH);
    process.chdir(originalCwd);

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalInternalSecret === undefined) {
      delete process.env.INTERNAL_API_SECRET;
    } else {
      process.env.INTERNAL_API_SECRET = originalInternalSecret;
    }

    if (originalBlobToken === undefined) {
      delete process.env.BLOB_READ_WRITE_TOKEN;
    } else {
      process.env.BLOB_READ_WRITE_TOKEN = originalBlobToken;
    }

    if (originalDisableBattleAi === undefined) {
      delete process.env.DISABLE_BATTLE_AI;
    } else {
      process.env.DISABLE_BATTLE_AI = originalDisableBattleAi;
    }

    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function createWallet(digit) {
  return String(digit || "1").repeat(32);
}

function createBattleSnapshot({
  id,
  name,
  imageUrl,
  level = 1,
  rarity = "Rare",
  type = "Arena Cub",
  maxHp = 120,
  attributes = {},
  selectedPower = {},
}) {
  return {
    id,
    name,
    type,
    rarity,
    imageUrl: imageUrl || `/api/character/image?id=${encodeURIComponent(id)}&v=1`,
    level,
    derivedStats: {
      maxHp,
    },
    attributes: {
      stamina: 4,
      agility: 5,
      strength: 6,
      intelligence: 7,
      ...attributes,
    },
    selectedPower: {
      name: selectedPower.name || "Nova Burst",
      description: selectedPower.description || "Unleashes a bright finishing pulse.",
    },
    traits: null,
  };
}

function createBattleRound({
  roundNumber = 1,
  actorPetId = "pet_attacker",
  targetPetId = "pet_defender",
  turnType = "basic",
  hitResult = "hit",
  damage = 18,
  narrationText,
  usedSuperpower = false,
  hpAfterTarget = 100,
}) {
  return {
    roundNumber,
    actorPetId,
    targetPetId,
    turnType,
    hitResult,
    damage,
    narrationText: narrationText || `Round ${roundNumber} action resolves.`,
    usedSuperpower,
    hpAfterTarget,
  };
}

function createReadyBattleRecord({
  id,
  createdAt = "2026-04-17T10:00:00.000Z",
  completedAt = "2026-04-17T10:02:00.000Z",
  attackerOwnerWallet,
  defenderOwnerWallet,
  attackerPetId = "pet_attacker",
  attackerPetName = "Attacker",
  attackerLevel = 4,
  defenderPetId = "pet_defender",
  defenderPetName = "Defender",
  defenderLevel = 4,
  winnerPetId = attackerPetId,
  finalSummaryText = "Attacker lands the finishing blow.",
  rounds,
}) {
  return {
    id,
    status: "ready",
    battleType: "pvp_random",
    createdAt,
    completedAt,
    attackerPetId,
    defenderPetId,
    attackerOwnerWallet,
    defenderOwnerWallet,
    narrationMode: "template",
    startingHp: {
      attacker: 120,
      defender: 120,
    },
    attackerSnapshot: createBattleSnapshot({
      id: attackerPetId,
      name: attackerPetName,
      level: attackerLevel,
    }),
    defenderSnapshot: createBattleSnapshot({
      id: defenderPetId,
      name: defenderPetName,
      level: defenderLevel,
    }),
    rounds:
      Array.isArray(rounds) && rounds.length
        ? rounds
        : [
            createBattleRound({
              roundNumber: 1,
              actorPetId: attackerPetId,
              targetPetId: defenderPetId,
            }),
          ],
    result: {
      winnerPetId,
      finalSummaryText,
      attackerRewards: {
        xpGained: winnerPetId === attackerPetId ? 200 : 25,
      },
      defenderRewards: {
        xpGained: winnerPetId === defenderPetId ? 25 : 5,
      },
    },
  };
}

function createCompletedCharacter({
  id,
  name,
  level = 4,
  rarity = "Rare",
  image = {},
  attributes = {},
}) {
  return {
    id,
    status: "completed",
    creatureType: "Arena Cub",
    rarity,
    name,
    displayName: name,
    level,
    experience: 0,
    softCurrency: 0,
    attributePointsAvailable: 0,
    attributes: {
      stamina: 4,
      agility: 5,
      strength: 6,
      intelligence: 7,
      ...attributes,
    },
    variables: {
      ELEMENT: "Arc static",
      TOP_ITEM: "Tiny visor",
      PROFESSION_STYLE: "Arena gremlin",
      SIDE_DETAILS: "Loose sparks",
      FACIAL_FEATURES: "Wide grin",
      ELEMENT_EFFECTS: "Neon crackles",
    },
    selectedPowerId: "power_1",
    powers: [
      {
        id: "power_1",
        title: "Chaos Burst",
        description: "A noisy finishing blast.",
      },
    ],
    image,
    createdAt: "2026-04-17T00:00:00.000Z",
    updatedAt: "2026-04-17T00:00:00.000Z",
    completedAt: "2026-04-17T00:00:00.000Z",
  };
}

function createMockResponse() {
  const headers = new Map();

  return {
    bodyText: "",
    headersSent: false,
    statusCode: 200,
    writableEnded: false,
    end(value = "") {
      this.bodyText = Buffer.isBuffer(value) ? value.toString("utf8") : String(value || "");
      this.headersSent = true;
      this.writableEnded = true;
    },
    getHeader(name) {
      return headers.get(String(name).toLowerCase());
    },
    setHeader(name, value) {
      headers.set(String(name).toLowerCase(), value);
    },
  };
}

async function invokeHandler(handler, { method = "GET", url = "/", headers = {}, body } = {}) {
  const listeners = {
    data: [],
    end: [],
    error: [],
  };
  const req = {
    method,
    url,
    headers: {
      host: "localhost:3000",
      ...headers,
    },
    on(event, callback) {
      if (listeners[event]) {
        listeners[event].push(callback);
      }
      return this;
    },
  };
  const res = createMockResponse();

  const handlerPromise = Promise.resolve().then(() => handler(req, res));
  const rawBody =
    body === undefined
      ? ""
      : typeof body === "string"
        ? body
        : JSON.stringify(body);

  process.nextTick(() => {
    if (rawBody) {
      listeners.data.forEach((callback) => callback(rawBody));
    }
    listeners.end.forEach((callback) => callback());
  });

  await handlerPromise;

  return {
    bodyText: res.bodyText,
    headers: res.headersSent,
    response: res,
    statusCode: res.statusCode,
  };
}

async function invokeJsonHandler(handler, options = {}) {
  const response = await invokeHandler(handler, options);

  return {
    body: response.bodyText ? JSON.parse(response.bodyText) : null,
    statusCode: response.statusCode,
  };
}

function createInternalHeaders(auth, wallet) {
  return {
    [auth.INTERNAL_AUTH_HEADER]: INTERNAL_SECRET,
    [auth.INTERNAL_WALLET_HEADER]: wallet,
    [auth.INTERNAL_WALLET_NAME_HEADER]: "Arena Tester",
    [auth.INTERNAL_WALLET_TYPE_HEADER]: "internal",
  };
}

module.exports = {
  createBattleRound,
  createCompletedCharacter,
  createInternalHeaders,
  createReadyBattleRecord,
  createWallet,
  invokeHandler,
  invokeJsonHandler,
  withIsolatedBattleHistoryEnv,
};
