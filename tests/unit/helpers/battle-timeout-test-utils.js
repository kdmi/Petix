const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const INTERNAL_SECRET = "petix-battle-timeout-internal-secret";
const paths = {
  adminActionRoute: path.resolve(__dirname, "../../../api/admin/[action].js"),
  adminBattlesRoute: path.resolve(__dirname, "../../../server-routes/admin/battles.js"),
  auth: path.resolve(__dirname, "../../../api/_lib/auth.js"),
  battleByIdRoute: path.resolve(__dirname, "../../../api/battles/[battleId].js"),
  battleFinalization: path.resolve(__dirname, "../../../api/_lib/battle-finalization.js"),
  battleLib: path.resolve(__dirname, "../../../api/_lib/battle.js"),
  battleNarration: path.resolve(__dirname, "../../../api/_lib/battle-narration.js"),
  battleStore: path.resolve(__dirname, "../../../api/_lib/battle-store.js"),
  battlesRoute: path.resolve(__dirname, "../../../api/battles/index.js"),
  characterMeRoute: path.resolve(__dirname, "../../../server-routes/character/me.js"),
  store: path.resolve(__dirname, "../../../api/_lib/store.js"),
};

const baseHelpers = require("./battle-history-test-utils");

function clearModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

function freshRequire(modulePath) {
  clearModule(modulePath);
  return require(modulePath);
}

function applyModuleMock(modulePath, override) {
  clearModule(modulePath);
  const resolvedPath = require.resolve(modulePath);
  const actual = require(modulePath);
  const nextExports = typeof override === "function" ? override(actual) : override;
  require.cache[resolvedPath].exports = nextExports;
  return nextExports;
}

async function withBattleTimeoutEnv(run, { mocks = {} } = {}) {
  const originalCwd = process.cwd();
  const originalNodeEnv = process.env.NODE_ENV;
  const originalInternalSecret = process.env.INTERNAL_API_SECRET;
  const originalBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const originalDisableBattleAi = process.env.DISABLE_BATTLE_AI;
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "petix-battle-timeout-"));

  try {
    process.chdir(tempDir);
    process.env.NODE_ENV = "test";
    process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
    process.env.DISABLE_BATTLE_AI = "true";
    delete process.env.BLOB_READ_WRITE_TOKEN;

    Object.values(paths).forEach((modulePath) => clearModule(modulePath));

    Object.entries(mocks).forEach(([key, override]) => {
      const modulePath = paths[key] || key;
      applyModuleMock(modulePath, override);
    });

    const loadModule = (modulePath) => {
      const isMocked = Object.keys(mocks).some((key) => (paths[key] || key) === modulePath);
      return isMocked ? require(modulePath) : freshRequire(modulePath);
    };

    const auth = loadModule(paths.auth);
    const battleStore = loadModule(paths.battleStore);
    const store = loadModule(paths.store);
    const battleLib = loadModule(paths.battleLib);
    const battleFinalization = loadModule(paths.battleFinalization);
    const battleNarration = loadModule(paths.battleNarration);
    const battlesRoute = loadModule(paths.battlesRoute);
    const battleByIdRoute = loadModule(paths.battleByIdRoute);
    const characterMeRoute = loadModule(paths.characterMeRoute);
    const adminBattlesRoute = loadModule(paths.adminBattlesRoute);
    const adminActionRoute = loadModule(paths.adminActionRoute);

    return await run({
      adminActionRoute,
      adminBattlesRoute,
      auth,
      battleByIdRoute,
      battleFinalization,
      battleLib,
      battleNarration,
      battleStore,
      battlesRoute,
      characterMeRoute,
      store,
      tempDir,
    });
  } finally {
    Object.values(paths).forEach((modulePath) => clearModule(modulePath));
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

function createInternalHeaders(auth, wallet) {
  return {
    [auth.INTERNAL_AUTH_HEADER]: INTERNAL_SECRET,
    [auth.INTERNAL_WALLET_HEADER]: wallet,
    [auth.INTERNAL_WALLET_NAME_HEADER]: "Arena Tester",
    [auth.INTERNAL_WALLET_TYPE_HEADER]: "internal",
  };
}

module.exports = {
  ...baseHelpers,
  createInternalHeaders,
  paths,
  withBattleTimeoutEnv,
};
