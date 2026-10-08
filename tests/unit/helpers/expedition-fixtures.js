const fs = require("fs/promises");
const os = require("os");
const path = require("path");

// Isolated env for the Expeditions (026) tests: temp cwd for the JSON stores,
// deterministic wallets, pets with known attributes, and a fresh require of
// every module that caches config or storage. No real addresses anywhere.

const ROOT = path.resolve(__dirname, "../../..");
const MODULES = [
  "api/_lib/store.js",
  "api/_lib/economy-config.js",
  "api/_lib/economy-config-store.js",
  "api/_lib/battle-energy.js",
  "api/_lib/expeditions-config.js",
  "api/_lib/expeditions.js",
  "api/_lib/roster.js",
  "api/expeditions/[action].js",
];
const ROUTES_DIR = path.join(ROOT, "server-routes/expeditions");
const ADMIN_ROUTES_DIR = path.join(ROOT, "server-routes/admin");
const ADMIN_DISPATCHER = path.join(ROOT, "api/admin/[action].js");

const ENV_KEYS = [
  "NODE_ENV",
  "BLOB_READ_WRITE_TOKEN",
  "INTERNAL_API_SECRET",
  "SOLANA_AUTH_SECRET",
  "ADMIN_WALLETS",
  "CRON_SECRET",
  "NFT_RPC_URL",
  "NFT_EXPLORER_URL",
  "NFT_ENABLED",
  "ECONOMY_CONFIG_CACHE_TTL_MS",
  "ROSTER_INDEX_ENABLED",
];

function evmWallet(digit) {
  return `0x${String(digit).repeat(40)}`.toLowerCase();
}

const ADMIN = evmWallet("a");
const PLAYER = evmWallet("1");
const OTHER = evmWallet("2");

function clearProjectModules() {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(ROOT, "api")) || key.startsWith(path.join(ROOT, "server-routes"))) {
      delete require.cache[key];
    }
  }
}

function fresh(relative) {
  const full = path.join(ROOT, relative);
  delete require.cache[full];
  return require(full);
}

/** A completed character record the way store.js keeps them (minimal fields the engine needs). */
function makePet(id, { level = 5, stamina = 6, strength = 6, agility = 5, intelligence = 5, name } = {}) {
  return {
    id,
    status: "completed",
    name: name || `Pet ${id}`,
    rarity: "Common",
    level,
    experience: 0,
    attributes: { stamina, strength, agility, intelligence },
    imageUrl: `/character-images/${id}.png`,
    completedAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

const PLAYER_PETS = [makePet("pet-1"), makePet("pet-2", { strength: 8 }), makePet("pet-3", { intelligence: 8 }), makePet("pet-4", { agility: 8 })];
const OTHER_PETS = [makePet("wild-1", { level: 3 }), makePet("wild-2", { level: 4 }), makePet("wild-3", { level: 2 })];

/**
 * Runs `fn({ store, economy, energy, expeditionsConfig, engine, dispatcher, ... })`
 * inside a temp cwd with the feature enabled. `overrides` patches the economy
 * config through the real store (what the admin panel would write).
 */
async function withExpeditionEnv(fn, { env = {}, overrides = {}, seedProfiles = true } = {}) {
  const originalCwd = process.cwd();
  const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "petix-expeditions-"));
  try {
    process.chdir(tempDir);
    process.env.NODE_ENV = "test";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.NFT_RPC_URL;
    delete process.env.NFT_EXPLORER_URL;
    delete process.env.NFT_ENABLED;
    delete process.env.ROSTER_INDEX_ENABLED;
    process.env.INTERNAL_API_SECRET = "petix-expeditions-internal-secret-0123";
    process.env.SOLANA_AUTH_SECRET = "petix-expeditions-test-session-secret-0123456789";
    process.env.ADMIN_WALLETS = ADMIN;
    process.env.CRON_SECRET = "petix-expeditions-cron-secret";
    process.env.ECONOMY_CONFIG_CACHE_TTL_MS = "0";
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined || value === null) delete process.env[key];
      else process.env[key] = String(value);
    }
    clearProjectModules();
    const store = fresh("api/_lib/store.js");
    const economyStore = fresh("api/_lib/economy-config-store.js");
    const economy = fresh("api/_lib/economy-config.js");
    const energy = fresh("api/_lib/battle-energy.js");
    const expeditionsConfig = fresh("api/_lib/expeditions-config.js");
    const engine = require(path.join(ROOT, "assets/expeditions/engine.js"));
    await economyStore.writeOverrides({ EXPEDITIONS_ENABLED: 1, EXPEDITIONS_ADMIN_ONLY: 0, ...overrides });
    if (typeof economy.invalidateCache === "function") economy.invalidateCache();
    if (seedProfiles) {
      await store.updateWalletProfile(PLAYER, (current) => ({ ...current, characters: PLAYER_PETS.map((p) => ({ ...p })), currency: { balance: 5000, totalEarned: 5000 } }));
      await store.updateWalletProfile(OTHER, (current) => ({ ...current, characters: OTHER_PETS.map((p) => ({ ...p })), currency: { balance: 100, totalEarned: 100 } }));
    }
    const dispatcher = () => fresh("api/expeditions/[action].js");
    const adminDispatcher = () => {
      for (const key of Object.keys(require.cache)) if (key.startsWith(ADMIN_ROUTES_DIR) || key === ADMIN_DISPATCHER) delete require.cache[key];
      return require(ADMIN_DISPATCHER);
    };
    const patchConfig = async (patch) => {
      const current = await economyStore.readOverrides();
      await economyStore.writeOverrides({ ...current, ...patch });
      if (typeof economy.invalidateCache === "function") economy.invalidateCache();
    };
    return await fn({ store, economy, economyStore, energy, expeditionsConfig, engine, dispatcher, adminDispatcher, patchConfig, tempDir });
  } finally {
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    clearProjectModules();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function sessionHeaders(wallet, walletType = "metamask") {
  const auth = require(path.join(ROOT, "api/_lib/auth.js"));
  const { sessionToken } = auth.createSession(wallet, walletType);
  return { cookie: `${auth.SESSION_COOKIE}=${encodeURIComponent(sessionToken)}` };
}

async function invoke(handler, { method = "GET", url = "/", headers = {}, body } = {}) {
  const listeners = { data: [], end: [], error: [] };
  const raw = body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body);
  let emitted = false;
  const req = {
    method,
    url,
    headers: { host: "localhost:3000", ...headers },
    // Handlers may attach their body listeners after an await (config/session
    // lookups come first), so replay the buffered body to late subscribers.
    on(event, callback) {
      if (!listeners[event]) return this;
      if (emitted) {
        if (event === "data" && raw) callback(raw);
        if (event === "end") callback();
      } else {
        listeners[event].push(callback);
      }
      return this;
    },
  };
  const res = {
    statusCode: 200,
    headersSent: {},
    bodyText: "",
    getHeader(name) {
      return this.headersSent[name.toLowerCase()];
    },
    setHeader(name, value) {
      this.headersSent[name.toLowerCase()] = value;
    },
    end(chunk) {
      this.bodyText = chunk ? String(chunk) : "";
    },
  };
  const pending = Promise.resolve().then(() => handler(req, res));
  process.nextTick(() => {
    emitted = true;
    if (raw) listeners.data.forEach((cb) => cb(raw));
    listeners.end.forEach((cb) => cb());
  });
  await pending;
  return { status: res.statusCode, body: res.bodyText ? JSON.parse(res.bodyText) : null, headers: res.headersSent };
}

/** Plays a battle to the end with the greedy AI; returns the move list the client would send. */
function playGreedy(engine, state, { maxMoves = 300 } = {}) {
  const moves = [];
  let guard = 0;
  while (!state.over && guard++ < maxMoves) {
    let used = false;
    state.squad.forEach((pet, slot) => {
      if (!state.over && pet.charge >= engine.CHARGE_MAX) {
        engine.useAbility(state, slot);
        moves.push({ hit: slot });
        used = true;
      }
    });
    if (state.over) break;
    const move = engine.bestMoveGreedy(state) || engine.findMove(state);
    if (!move) break;
    engine.playMove(state, move[0], move[1]);
    moves.push({ a: move[0], b: move[1] });
    if (used && state.over) break;
  }
  return moves;
}

module.exports = {
  ADMIN,
  OTHER,
  OTHER_PETS,
  PLAYER,
  PLAYER_PETS,
  evmWallet,
  invoke,
  makePet,
  playGreedy,
  sessionHeaders,
  withExpeditionEnv,
};
