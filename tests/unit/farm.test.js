const test = require("node:test");
const assert = require("node:assert/strict");

const {
  computeFarmRate,
  computeFarmEarned,
  startFarm,
  claimFarm,
} = require("../../api/_lib/farm");
const { getDefaults } = require("../../api/_lib/economy-config");
const { BASE_NOW, makeCharacter, makeProfile, startedAgo } = require("./helpers/economy-fixtures");

const cfg = getDefaults();

test("computeFarmRate scales with rarity and level", () => {
  assert.equal(computeFarmRate(1, "Common", cfg), 10);
  assert.equal(computeFarmRate(1, "Legendary", cfg), 16);
  assert.ok(Math.abs(computeFarmRate(10, "Common", cfg) - 14.5) < 1e-9); // 10*(1+0.05*9)
  assert.ok(Math.abs(computeFarmRate(20, "Legendary", cfg) - 31.2) < 1e-9); // 16*1.95
});

test("computeFarmRate is tolerant of unknown/blank rarity (→ Common)", () => {
  assert.equal(computeFarmRate(1, "weird", cfg), 10);
  assert.equal(computeFarmRate(1, "", cfg), 10);
});

test("computeFarmEarned credits only completed whole hours (partial forfeited)", () => {
  const c = makeCharacter({ level: 1, rarity: "Legendary", farmState: { active: true, startedAt: startedAgo(2, 40), lastClaimedAt: null } });
  const r = computeFarmEarned(c.farmState, BASE_NOW, c.level, c.rarity, cfg);
  assert.equal(r.completedHours, 2);
  assert.equal(r.earned, 32); // floor(2 * 16)
  assert.equal(r.forfeitedMinutes, 40);
  assert.equal(r.capped, false);
});

test("computeFarmEarned caps at FARM_CAP_HOURS (24h)", () => {
  const c = makeCharacter({ level: 1, rarity: "Legendary", farmState: { active: true, startedAt: startedAgo(30), lastClaimedAt: null } });
  const r = computeFarmEarned(c.farmState, BASE_NOW, c.level, c.rarity, cfg);
  assert.equal(r.completedHours, 24);
  assert.equal(r.earned, 384); // 24 * 16
  assert.equal(r.capped, true);
  assert.equal(r.forfeitedMinutes, 0);
  assert.equal(r.secondsRemaining, 0);
});

test("computeFarmEarned floors fractional rates", () => {
  // Legendary L10 rate = 23.2 → 3h = floor(69.6) = 69
  const c = makeCharacter({ level: 10, rarity: "Legendary", farmState: { active: true, startedAt: startedAgo(3), lastClaimedAt: null } });
  const r = computeFarmEarned(c.farmState, BASE_NOW, c.level, c.rarity, cfg);
  assert.equal(r.earned, 69);
});

test("computeFarmEarned under 1h yields 0", () => {
  const c = makeCharacter({ farmState: { active: true, startedAt: startedAgo(0, 40), lastClaimedAt: null } });
  const r = computeFarmEarned(c.farmState, BASE_NOW, c.level, c.rarity, cfg);
  assert.equal(r.completedHours, 0);
  assert.equal(r.earned, 0);
  assert.equal(r.forfeitedMinutes, 40);
});

test("computeFarmEarned inactive cycle is all zeros", () => {
  const c = makeCharacter();
  const r = computeFarmEarned(c.farmState, BASE_NOW, c.level, c.rarity, cfg);
  assert.equal(r.active, false);
  assert.equal(r.earned, 0);
});

test("startFarm activates a fresh cycle and throws when already farming", () => {
  const c = makeCharacter();
  const next = startFarm(c, BASE_NOW);
  assert.equal(next.active, true);
  assert.equal(typeof next.startedAt, "string");

  const farming = makeCharacter({ farmState: { active: true, startedAt: startedAgo(1), lastClaimedAt: null } });
  assert.throws(() => startFarm(farming, BASE_NOW), /already farming/i);
});

test("claimFarm credits completed hours and resets the cycle", () => {
  const profile = makeProfile();
  const c = makeCharacter({ level: 1, rarity: "Common", farmState: { active: true, startedAt: startedAgo(5), lastClaimedAt: null } });
  profile.characters = [c];
  const r = claimFarm(profile, c, BASE_NOW, cfg);
  assert.equal(r.claimed, 50); // 5 * 10
  assert.equal(profile.currency.balance, 50);
  assert.equal(profile.currency.totalEarned, 50);
  assert.equal(c.farmState.active, false);
  assert.equal(c.farmState.startedAt, null);
  assert.equal(typeof c.farmState.lastClaimedAt, "string");
});

test("claimFarm credits the full 24h cap when the cycle has completed", () => {
  const profile = makeProfile();
  const c = makeCharacter({ level: 1, rarity: "Legendary", farmState: { active: true, startedAt: startedAgo(30), lastClaimedAt: null } });
  profile.characters = [c];
  const r = claimFarm(profile, c, BASE_NOW, cfg);
  assert.equal(r.claimed, 384); // 24 * 16, capped
  assert.equal(profile.currency.balance, 384);
  assert.equal(c.farmState.active, false);
});
