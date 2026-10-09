const test = require("node:test");
const assert = require("node:assert/strict");

const { ADMIN, PLAYER, invoke, sessionHeaders, withExpeditionEnv } = require("./helpers/expedition-fixtures");

test("feature off → every action 404 EXPEDITIONS_DISABLED, nothing leaks", async () => {
  await withExpeditionEnv(
    async ({ dispatcher }) => {
      const handler = dispatcher();
      for (const action of ["config", "state", "start", "finish", "nope"]) {
        const res = await invoke(handler, { url: `/api/expeditions/${action}`, headers: sessionHeaders(ADMIN) });
        assert.equal(res.status, 404, action);
        assert.equal(/0x[0-9a-f]{40}/i.test(JSON.stringify(res.body)), false);
      }
    },
    { overrides: { EXPEDITIONS_ENABLED: 0 } }
  );
});

test("admin-only → non-admin and anonymous get 404, admin gets the config", async () => {
  await withExpeditionEnv(
    async ({ dispatcher }) => {
      const handler = dispatcher();
      const anon = await invoke(handler, { url: "/api/expeditions/config" });
      assert.equal(anon.status, 404);
      const player = await invoke(handler, { url: "/api/expeditions/config", headers: sessionHeaders(PLAYER) });
      assert.equal(player.status, 404);
      const admin = await invoke(handler, { url: "/api/expeditions/config", headers: sessionHeaders(ADMIN) });
      assert.equal(admin.status, 200);
      assert.equal(admin.body.adminOnly, true);
      assert.equal(admin.body.admin, true);
    },
    { overrides: { EXPEDITIONS_ADMIN_ONLY: 1 } }
  );
});

test("everyone → config is public, lists 10 bosses with open/hidden and fees, no contracts", async () => {
  await withExpeditionEnv(async ({ dispatcher }) => {
    const res = await invoke(dispatcher(), { url: "/api/expeditions/config", headers: sessionHeaders(PLAYER) });
    assert.equal(res.status, 200);
    assert.equal(res.body.bosses.length, 10);
    assert.deepEqual(res.body.bosses.slice(0, 4).map((b) => b.state), ["open", "open", "open", "hidden"]);
    assert.equal(res.body.bosses[1].fee, 1000);
    assert.equal(res.body.rules.rewardMults[3], 2);
    assert.equal(JSON.stringify(res.body).includes("contract"), false);
    const anon = await invoke(dispatcher(), { url: "/api/expeditions/config" });
    assert.equal(anon.status, 200);
  });
});
