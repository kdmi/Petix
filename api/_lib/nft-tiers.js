"use strict";

// Редкость капсулы (018). Тир — свойство самого токена, а не питомца внутри:
// он назначается один раз на всю коллекцию, не меняется при продаже и даёт
// владельцу боевой бонус, пока в капсуле сидит питомец.
//
// Распределение считается детерминированно из номера токена и сида. Ничего не
// хранится в базе: одинаковый сид всегда даёт одинаковую раскладку, а её хеш
// можно опубликовать до старта продаж, чтобы потом любой мог проверить, что мы
// не раздали редкие капсулы себе, посмотрев, кто что купил.

const crypto = require("node:crypto");

const TIER_ORDER = ["glass", "bronze", "silver", "gold", "prismatic"];

const TIER_LABELS = {
  glass: "Glass",
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  prismatic: "Prismatic",
};

// Доли, а не штуки: тираж коллекции решается при создании дропа, и раскладка
// должна считаться под любой. На 777 даёт 469 / 210 / 70 / 21 / 7.
const TIER_SHARES = {
  glass: 0.603,
  bronze: 0.27,
  silver: 0.09,
  gold: 0.027,
  prismatic: 0.009,
};

/**
 * Штуки по тирам под конкретный тираж. Остаток от округления отдаётся тирам с
 * наибольшей дробной частью, чтобы сумма сошлась ровно в maxSupply и ни один
 * тир не обнулился на маленьких коллекциях.
 */
function computeTierCounts(maxSupply) {
  const total = Math.max(1, Math.floor(Number(maxSupply) || 0));
  const exact = TIER_ORDER.map((tier) => ({ tier, value: total * TIER_SHARES[tier] }));

  const counts = {};
  let assigned = 0;
  for (const { tier, value } of exact) {
    counts[tier] = Math.floor(value);
    assigned += counts[tier];
  }

  const remainders = exact
    .map(({ tier, value }) => ({ tier, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);

  let leftover = total - assigned;
  let index = 0;
  while (leftover > 0) {
    counts[remainders[index % remainders.length].tier] += 1;
    leftover -= 1;
    index += 1;
  }

  // На маленьких тиражах доля Prismatic (0,9%) округляется в ноль, и верхний
  // тир просто исчезает. Занимаем ему по одной штуке у самого массового тира:
  // лестница без своей вершины бессмысленна.
  if (total >= TIER_ORDER.length) {
    for (const tier of TIER_ORDER) {
      if (counts[tier] > 0) continue;
      const donor = TIER_ORDER.reduce((a, b) => (counts[a] >= counts[b] ? a : b));
      if (counts[donor] <= 1) break;
      counts[donor] -= 1;
      counts[tier] += 1;
    }
  }

  return counts;
}

/** Строковый хеш → 32-битный сид (xmur3). */
function seedFrom(text) {
  let h = 1779033703 ^ String(text).length;
  for (let i = 0; i < String(text).length; i += 1) {
    h = Math.imul(h ^ String(text).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** Детерминированный PRNG (mulberry32) — одинаковый в любой среде и версии Node. */
function randomFrom(seedValue) {
  let a = seedValue >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Раскладка «номер токена → тир» для всей коллекции.
 *
 * showcase ставит по одному каждого тира в первые пять номеров. Нужно для
 * тестовой коллекции: Prismatic это меньше процента тиража, случайным минтом в
 * него не попасть, а посмотреть все пять оформлений хочется с пяти капсул.
 * На боевой коллекции выключено — иначе первые покупатели забирали бы лучшее.
 */
function buildTierMap(maxSupply, seed, { showcase = false } = {}) {
  const total = Math.max(1, Math.floor(Number(maxSupply) || 0));
  const counts = computeTierCounts(total);

  const pool = [];
  for (const tier of TIER_ORDER) {
    for (let i = 0; i < counts[tier]; i += 1) pool.push(tier);
  }

  const random = randomFrom(seedFrom(String(seed))());
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  if (showcase) {
    for (let position = 0; position < TIER_ORDER.length && position < pool.length; position += 1) {
      const wanted = TIER_ORDER[position];
      if (pool[position] === wanted) continue;
      const donor = pool.indexOf(wanted, TIER_ORDER.length);
      if (donor === -1) continue;
      [pool[position], pool[donor]] = [pool[donor], pool[position]];
    }
  }

  return pool;
}

/**
 * Отпечаток раскладки. Публикуется до старта продаж; после ревила любой может
 * пересчитать его из опубликованного списка и убедиться, что тиры не двигали.
 */
function hashTierMap(tierMap) {
  return crypto.createHash("sha256").update(tierMap.join(",")).digest("hex");
}

module.exports = {
  TIER_ORDER,
  TIER_LABELS,
  TIER_SHARES,
  computeTierCounts,
  buildTierMap,
  hashTierMap,
};
