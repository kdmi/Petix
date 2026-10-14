const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeRolls, recordRoll } = require("../../api/_lib/roll-ledger");
const { buildAudit } = require("../../server-routes/admin/creation-audit");

// Feature 035. Доля редких среди живых питомцев отвечала на вопрос «что игрок
// оставил», а не «что выпало»: брошенный черновик и сожжённый питомец из
// профиля исчезают. Журнал считает сами броски.

test("журнал считает каждый бросок и раскладывает его по рарности", () => {
  const profile = {};
  recordRoll(profile, { rarity: "Common", characterId: "char_1" });
  recordRoll(profile, { rarity: "Epic", characterId: "char_2", charged: 2500 });

  assert.equal(profile.rolls.total, 2);
  assert.equal(profile.rolls.byRarity.Common, 1);
  assert.equal(profile.rolls.byRarity.Epic, 1);
  assert.equal(profile.rolls.paid, 1, "платным считается бросок, за который списали Points");
  assert.equal(profile.rolls.recent.length, 2);
  assert.equal(profile.rolls.recent[1].id, "char_2");
});

test("мусор в рарности не ломает счёт бросков", () => {
  const profile = { rolls: { total: "нет", byRarity: { Epic: -5 } } };
  recordRoll(profile, { rarity: "Mythic", characterId: "char_3" });

  assert.equal(profile.rolls.total, 1);
  assert.equal(profile.rolls.byRarity.Epic, 0);
  assert.equal(profile.rolls.recent[0].rarity, null);
});

test("журнал обрезается сверху и не растит профиль без предела", () => {
  const profile = {};
  for (let index = 0; index < 200; index += 1) {
    recordRoll(profile, { rarity: "Common", characterId: `char_${index}` });
  }

  assert.equal(profile.rolls.total, 200);
  assert.equal(profile.rolls.recent.length, 60);
  assert.equal(profile.rolls.recent[59].id, "char_199");
});

test("профиль переживает запись и чтение вместе со счётчиком", () => {
  const profile = {};
  recordRoll(profile, { rarity: "Legendary", characterId: "char_9" });
  const roundTripped = normalizeRolls(JSON.parse(JSON.stringify(profile.rolls)));

  assert.equal(roundTripped.total, 1);
  assert.equal(roundTripped.byRarity.Legendary, 1);
});

test("store не выбрасывает счётчик при нормализации профиля", () => {
  // Повтор ошибки с movedAt: белый список полей молча терял новое поле.
  const { readFileSync } = require("fs");
  const source = readFileSync(require.resolve("../../api/_lib/store.js"), "utf8");
  assert.ok(
    /rolls:\s*normalizeRolls\(profile\?\.rolls\)/.test(source),
    "cloneWalletProfile должен переносить rolls"
  );
});

test("аудит считает разницу между нарисованным и живым", () => {
  const images = [
    { id: "char_a", uploadedAt: "2026-10-01T10:00:00.000Z" },
    { id: "char_b", uploadedAt: "2026-10-01T11:00:00.000Z" },
    { id: "char_c", uploadedAt: "2026-10-01T12:00:00.000Z" },
    { id: "char_d", uploadedAt: "2026-10-02T09:00:00.000Z" },
  ];
  const records = {
    "0xaa": {
      characters: [
        { id: "char_c", status: "completed", rarity: "Epic", createdAt: "2026-10-01T12:00:05.000Z" },
      ],
      currency: { balance: 10, totalEarned: 100 },
      rolls: {
        total: 3,
        byRarity: { Common: 2, Rare: 0, Epic: 1, Legendary: 0 },
        recent: [
          { at: "2026-10-01T10:00:00.000Z", id: "char_a", rarity: "Common" },
          { at: "2026-10-01T11:00:00.000Z", id: "char_b", rarity: "Common" },
          { at: "2026-10-01T12:00:00.000Z", id: "char_c", rarity: "Epic" },
        ],
      },
    },
  };

  const audit = buildAudit(images, records);

  assert.equal(audit.totals.rolled, 4);
  assert.equal(audit.totals.alive, 1);
  assert.equal(audit.totals.dropped, 3);

  const first = audit.days.find((day) => day.date === "2026-10-01");
  assert.equal(first.rolled, 3);
  assert.equal(first.kept, 1);
  assert.equal(first.dropped, 2);
  assert.equal(first.rareShare, 100, "среди оставленных за день один Epic из одного");

  const wallet = audit.wallets[0];
  assert.equal(wallet.rolls, 3);
  assert.equal(wallet.alive, 1);
  assert.equal(wallet.droppedInLog, 2, "два броска из журнала не дожили до профиля");
});

test("аудит переживает профиль без журнала", () => {
  const audit = buildAudit([], { "0xbb": { characters: [], currency: {} } });
  assert.equal(audit.totals.rolled, 0);
  assert.equal(audit.totals.ledgerRolls, 0);
});
