const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

// Рубильник заливки питомцев в капсулы: ревил идёт первым, заливка
// открывается отдельно из админки. Проверяем обе стороны — сервер отказывает,
// а конфиг честно сообщает фронту, что пункт меню рисовать нельзя.

const ECONOMY_CONFIG_PATH = path.resolve(__dirname, "../../api/_lib/economy-config.js");
const ECONOMY_STORE_PATH = path.resolve(__dirname, "../../api/_lib/economy-config-store.js");
const BIND_ROUTE_PATH = path.resolve(__dirname, "../../server-routes/nft/bind.js");

const INTERNAL_SECRET = "petix-nft-bind-switch-internal-secret";
const WALLET = `0x${"a".repeat(40)}`;

function freshRequire(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

async function invoke(handler, { body } = {}) {
  // Тело отдаём не по таймеру, а когда обработчик действительно подпишется:
  // до parseJsonBody он успевает сходить за конфигом, и подписка приходит
  // позже любого nextTick.
  const raw = body === undefined ? "" : JSON.stringify(body);
  const listeners = { data: [], end: [] };
  let flushed = false;
  const flush = () => {
    if (flushed) return;
    flushed = true;
    setImmediate(() => {
      if (raw) listeners.data.forEach((cb) => cb(raw));
      listeners.end.forEach((cb) => cb());
    });
  };

  const req = {
    method: "POST",
    url: "/api/nft/bind",
    headers: {
      host: "localhost:3000",
      "x-petix-internal-secret": INTERNAL_SECRET,
      "x-petix-wallet": WALLET,
    },
    on(event, callback) {
      if (listeners[event]) listeners[event].push(callback);
      if (event === "end") flush();
      return this;
    },
  };
  const res = {
    statusCode: 200,
    bodyText: "",
    headersSent: {},
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

  await handler(req, res);
  return { statusCode: res.statusCode, body: res.bodyText ? JSON.parse(res.bodyText) : null };
}

async function withTempConfig(run) {
  const originalCwd = process.cwd();
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    NFT_ENABLED: process.env.NFT_ENABLED,
    INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
    SOLANA_AUTH_SECRET: process.env.SOLANA_AUTH_SECRET,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
  };
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "petix-bind-switch-"));

  try {
    process.chdir(tempDir);
    process.env.NODE_ENV = "test";
    process.env.NFT_ENABLED = "1";
    process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
    process.env.SOLANA_AUTH_SECRET = "petix-bind-switch-secret-0123456789abcdef";
    delete process.env.BLOB_READ_WRITE_TOKEN;

    freshRequire(ECONOMY_STORE_PATH);
    const economyConfig = freshRequire(ECONOMY_CONFIG_PATH);
    const bindRoute = freshRequire(BIND_ROUTE_PATH);

    await run({ economyConfig, bindRoute });
  } finally {
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[require.resolve(BIND_ROUTE_PATH)];
    delete require.cache[require.resolve(ECONOMY_CONFIG_PATH)];
    delete require.cache[require.resolve(ECONOMY_STORE_PATH)];
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("NFT_BIND_ENABLED defaults to closed", () => {
  const economyConfig = require(ECONOMY_CONFIG_PATH);
  assert.equal(economyConfig.getDefaults().NFT_BIND_ENABLED, 0);
});

test("NFT_BIND_ENABLED accepts 0/1 and rejects negatives", () => {
  const economyConfig = require(ECONOMY_CONFIG_PATH);
  assert.equal(economyConfig.validateConfigPatch({ NFT_BIND_ENABLED: 0 }).ok, true);
  assert.equal(economyConfig.validateConfigPatch({ NFT_BIND_ENABLED: 1 }).ok, true);
  assert.equal(economyConfig.validateConfigPatch({ NFT_BIND_ENABLED: -1 }).ok, false);
});

test("bind route refuses while the switch is closed", async () => {
  await withTempConfig(async ({ bindRoute }) => {
    const response = await invoke(bindRoute, { body: { tokenId: 7, characterId: "char-1" } });
    assert.equal(response.statusCode, 403);
    assert.equal(response.body.code, "NFT_BIND_DISABLED");
  });
});

test("bind route lets the request through once the switch is open", async () => {
  await withTempConfig(async ({ economyConfig, bindRoute }) => {
    await economyConfig.setEconomyConfig(
      { NFT_BIND_ENABLED: 1 },
      { adminWallet: WALLET, reason: "reveal finished" }
    );

    // Пустое тело: важно, что запрос дошёл до валидации, а не упёрся в рубильник.
    const response = await invoke(bindRoute, { body: {} });
    assert.equal(response.statusCode, 400);
    assert.match(response.body.error, /tokenId and characterId are required/);
  });
});
