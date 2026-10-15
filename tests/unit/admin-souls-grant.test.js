const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

// Выдача душ из админки (031): начислить, списать не ниже нуля,
// не пускать не-админа, требовать причину.

const STORE_PATH = path.resolve(__dirname, "../../api/_lib/store.js");
const ROUTE_PATH = path.resolve(__dirname, "../../server-routes/admin/souls-grant.js");

const INTERNAL_SECRET = "petix-souls-grant-test-internal-secret";
const ADMIN = "0x0e8Caf9eca5E45df0E6f50f58A5bF664db1740c1";
const PLAYER = `0x${"d".repeat(38)}Ab`; // синтетический, не настоящий кошелёк
const STRANGER = `0x${"c".repeat(40)}`;

function freshRequire(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

async function invoke(handler, { as, body, method = "POST" }) {
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
    method,
    url: "/api/admin/souls-grant",
    headers: { host: "localhost:3000", "x-petix-internal-secret": INTERNAL_SECRET, "x-petix-wallet": as },
    on(event, cb) {
      if (listeners[event]) listeners[event].push(cb);
      if (event === "end") flush();
      return this;
    },
  };
  const res = {
    statusCode: 200,
    bodyText: "",
    headersSent: {},
    getHeader(name) { return this.headersSent[name.toLowerCase()]; },
    setHeader(name, value) { this.headersSent[name.toLowerCase()] = value; },
    end(chunk) { this.bodyText = chunk ? String(chunk) : ""; },
  };
  await handler(req, res);
  return { statusCode: res.statusCode, body: res.bodyText ? JSON.parse(res.bodyText) : null };
}

async function withTempStore(run) {
  const originalCwd = process.cwd();
  const saved = {};
  for (const key of ["NODE_ENV", "INTERNAL_API_SECRET", "SOLANA_AUTH_SECRET", "ADMIN_WALLETS", "BLOB_READ_WRITE_TOKEN"]) {
    saved[key] = process.env[key];
  }
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "petix-souls-grant-"));
  try {
    process.chdir(tempDir);
    process.env.NODE_ENV = "test";
    process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
    process.env.SOLANA_AUTH_SECRET = "petix-adjust-balance-secret-0123456789abcdef";
    process.env.ADMIN_WALLETS = ADMIN;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    const store = freshRequire(STORE_PATH);
    const route = freshRequire(ROUTE_PATH);
    await run({ store, route });
  } finally {
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[require.resolve(ROUTE_PATH)];
    delete require.cache[require.resolve(STORE_PATH)];
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("souls-grant: admin gives souls, the wallet sees them, lifetime total stays", async () => {
  await withTempStore(async ({ store, route }) => {
    const res = await invoke(route, { as: ADMIN, body: { wallet: PLAYER, amount: 50000, reason: "gift" } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual([res.body.before, res.body.after, res.body.applied], [0, 50000, 50000]);
    assert.equal(res.body.wallet, PLAYER.toLowerCase());

    const profile = await store.getWalletProfile(PLAYER.toLowerCase());
    // A gift is not earned: totalEarned counts burns only.
    assert.deepEqual(profile.souls, { balance: 50000, totalEarned: 0 });
  });
});

test("souls-grant: taking souls never goes below zero and reports what it took", async () => {
  await withTempStore(async ({ route }) => {
    await invoke(route, { as: ADMIN, body: { wallet: PLAYER, amount: 300, reason: "seed" } });
    const res = await invoke(route, { as: ADMIN, body: { wallet: PLAYER, amount: -1000, reason: "rollback" } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.after, 0);
    assert.equal(res.body.applied, -300);
  });
});

test("souls-grant: refuses non-admins, zero or fractional amounts, missing reasons and bad wallets", async () => {
  await withTempStore(async ({ route }) => {
    assert.equal((await invoke(route, { as: STRANGER, body: { wallet: PLAYER, amount: 5, reason: "nope" } })).statusCode, 403);
    assert.equal((await invoke(route, { as: ADMIN, body: { wallet: PLAYER, amount: 0, reason: "zero" } })).statusCode, 400);
    assert.equal((await invoke(route, { as: ADMIN, body: { wallet: PLAYER, amount: 1.5, reason: "half" } })).statusCode, 400);
    assert.equal((await invoke(route, { as: ADMIN, body: { wallet: PLAYER, amount: 5 } })).statusCode, 400);
    assert.equal((await invoke(route, { as: ADMIN, body: { wallet: "not-a-wallet", amount: 5, reason: "x" } })).statusCode, 400);
  });
});
