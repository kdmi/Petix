const test = require("node:test");
const assert = require("node:assert/strict");

const { PLAYER, withExpeditionEnv } = require("./helpers/expedition-fixtures");

test("wallet profile carries a normalized expeditions block", async () => {
  await withExpeditionEnv(async ({ store }) => {
    const profile = await store.getWalletProfile(PLAYER);
    assert.deepEqual(profile.expeditions, { active: null, progress: {}, energyClaims: {}, tutorialSeen: false });

    await store.updateWalletProfile(PLAYER, (current) => ({
      ...current,
      expeditions: { ...current.expeditions, progress: { 1: { bestStars: 2, paidStars: [1, 2] } }, tutorialSeen: true, junk: 1 },
    }));
    const saved = await store.getWalletProfile(PLAYER);
    assert.equal(saved.expeditions.progress[1].bestStars, 2);
    assert.equal(saved.expeditions.tutorialSeen, true);
    assert.equal("junk" in saved.expeditions, false);
    assert.equal(saved.expeditions.active, null);
  });
});

test("legacy profile without the field normalizes on read", async () => {
  await withExpeditionEnv(async ({ store }) => {
    await store.updateWalletProfile(PLAYER, (current) => {
      const copy = { ...current };
      delete copy.expeditions;
      return copy;
    });
    const profile = await store.getWalletProfile(PLAYER);
    assert.deepEqual(profile.expeditions.progress, {});
    assert.equal(profile.expeditions.tutorialSeen, false);
  });
});
