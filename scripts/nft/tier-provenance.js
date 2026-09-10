// Раскладка тиров капсул под конкретный тираж и сид — и её хеш для публикации.
//
// Зачем: тиры назначаем мы, и покупатель должен иметь возможность проверить,
// что распределение не переписали задним числом, посмотрев, кто что купил.
// Порядок действий на боевой коллекции:
//   1. Придумать секретный сид, положить в NFT_TIER_SEED на проде. Дефолтный
//      сид лежит в публичном репозитории — с ним карту тиров посчитает любой
//      и будет ждать нужный номер при минте.
//   2. До старта продаж опубликовать ХЕШ карты (этот скрипт).
//   3. После ревила опубликовать сид и саму карту — любой пересчитает хеш.
//
// Запуск (сид и тираж — из .env.local или переданные явно):
//   node scripts/nft/tier-provenance.js
//   NFT_TIER_SEED=… NFT_MAX_SUPPLY=777 node scripts/nft/tier-provenance.js --map > tiers.json

require("./load-env.js");

const { buildTierMap, computeTierCounts, hashTierMap, TIER_ORDER } = require("../../api/_lib/nft-tiers");

const maxSupply = Math.max(1, Math.floor(Number(process.env.NFT_MAX_SUPPLY) || 0));
const seed = process.env.NFT_TIER_SEED || "";
const showcase = process.env.NFT_TIER_SHOWCASE === "1";
const wantMap = process.argv.includes("--map");

if (!maxSupply) {
  console.error("NFT_MAX_SUPPLY не задан — тираж нужен, чтобы посчитать раскладку.");
  process.exit(1);
}
if (!seed) {
  console.error("NFT_TIER_SEED не задан. С дефолтным сидом карта тиров публична — для боевой коллекции так нельзя.");
  process.exit(1);
}
if (showcase) {
  console.error("NFT_TIER_SHOWCASE=1 — это тестовый режим, кладёт по одному тиру в первые пять номеров. На проде выключить.");
  process.exit(1);
}

const map = buildTierMap(maxSupply, seed, { showcase: false });
const counts = computeTierCounts(maxSupply);
const hash = hashTierMap(map);

if (wantMap) {
  process.stdout.write(
    JSON.stringify({ maxSupply, hash, tiers: Object.fromEntries(map.map((tier, i) => [i + 1, tier])) }, null, 2) + "\n"
  );
} else {
  console.log("тираж:      ", maxSupply);
  console.log("раскладка:  ", TIER_ORDER.map((tier) => `${tier} ${counts[tier]}`).join(" · "));
  console.log("хеш карты:  ", hash);
  console.log("\nОпубликовать хеш до старта продаж. Сид и карту (--map) — после ревила.");
}
