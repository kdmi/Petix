// Доехал ли ревил до витрины: проходит всю коллекцию и сверяет трейты каждой
// капсулы с тем, что о ней думает OpenSea.
//
// Сравнение делает прод: там лежат и ключ OpenSea, и сид тиров. Локально нужен
// только INTERNAL_API_SECRET из .env.local — тот же, которым ходим в админку.
//
// Запуск:
//   node scripts/nft/reveal-audit.js
//   node scripts/nft/reveal-audit.js --refresh        # заодно пнуть отставших
//   node scripts/nft/reveal-audit.js --from 200 --to 320
//   PETIX_BASE_URL=http://127.0.0.1:3000 node scripts/nft/reveal-audit.js

require("./load-env.js");

const BASE_URL = (process.env.PETIX_BASE_URL || "https://petix.fun").replace(/\/+$/, "");
const ADMIN_WALLET =
  process.env.NFT_AUDIT_WALLET ||
  String(process.env.ADMIN_WALLETS || process.env.ADMIN_WALLET || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^0x[0-9a-fA-F]{40}$/.test(item))[0];

const CHUNK = 50;

function readFlag(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return null;
  return process.argv[index + 1] || "";
}

async function auditRange(from, to, refresh) {
  const url = new URL(`${BASE_URL}/api/admin/nft-reveal-audit`);
  url.searchParams.set("from", String(from));
  url.searchParams.set("to", String(to));
  if (refresh) url.searchParams.set("refresh", "1");

  const response = await fetch(url, {
    headers: {
      "x-petix-internal-secret": process.env.INTERNAL_API_SECRET,
      "x-petix-wallet": ADMIN_WALLET,
      accept: "application/json",
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${body.error || "audit request failed"}`);
  }
  return body;
}

async function main() {
  if (!process.env.INTERNAL_API_SECRET) {
    throw new Error("INTERNAL_API_SECRET не задан в .env.local.");
  }
  if (!ADMIN_WALLET) {
    throw new Error("Не нашёл админский 0x-кошелёк: задай ADMIN_WALLETS или NFT_AUDIT_WALLET.");
  }

  const refresh = process.argv.includes("--refresh");
  const from = Math.max(1, Number(readFlag("from")) || 1);

  // Пробный запрос на один номер — только чтобы узнать тираж и не хардкодить
  // 777. Без --refresh, иначе первая капсула получила бы лишний пинок.
  const probe = await auditRange(from, from, false);
  const to = Math.min(Number(readFlag("to")) || probe.maxSupply, probe.maxSupply);

  console.log(`сайт: ${BASE_URL}`);
  console.log(`проверяю капсулы ${from}–${to}${refresh ? " (с пинком отставших)" : ""}\n`);

  const totals = { ok: 0, stale: 0, unknown: 0, "not-minted": 0 };
  const stale = [];
  const unknown = [];

  for (let start = from; start <= to; start += CHUNK) {
    const end = Math.min(start + CHUNK - 1, to);
    const batch = await auditRange(start, end, refresh);
    for (const [key, value] of Object.entries(batch.summary)) totals[key] += value;
    stale.push(...batch.stale);
    unknown.push(...batch.unknown);

    const done = end - from + 1;
    const total = to - from + 1;
    console.log(
      `  ${String(start).padStart(4)}–${String(end).padEnd(4)}  ` +
        `сошлось ${String(totals.ok).padStart(4)} из ${String(done).padStart(4)}  ` +
        `(${Math.round((done / total) * 100)}% пройдено)`
    );
  }

  const checked = to - from + 1;
  console.log(`\nсошлось:      ${totals.ok} из ${checked}`);
  if (totals.stale) console.log(`отстали:      ${totals.stale}`);
  if (totals.unknown) console.log(`не ответила:  ${totals.unknown}`);
  if (totals["not-minted"]) console.log(`не сминчены:  ${totals["not-minted"]}`);

  if (stale.length) {
    console.log("\nотставшие капсулы:");
    for (const row of stale.slice(0, 40)) {
      const expected = row.expected?.["Capsule Tier"] || "—";
      const actual = row.actual?.["Capsule Tier"] || "(нет трейта)";
      console.log(`  #${String(row.tokenId).padEnd(4)} ждём ${expected}, витрина показывает ${actual}`);
    }
    if (stale.length > 40) console.log(`  … и ещё ${stale.length - 40}`);
  }
  if (unknown.length) {
    console.log(`\nвитрина не ответила по: ${unknown.slice(0, 40).join(", ")}${unknown.length > 40 ? " …" : ""}`);
  }

  if (totals.ok === checked) {
    console.log("\nВся коллекция доехала. Можно открывать заливку питомцев.");
  } else {
    console.log("\nЕщё не всё. Прогони ещё раз позже, при необходимости с --refresh.");
  }
}

main().catch((error) => {
  console.error("Не получилось:", error.message);
  process.exit(1);
});
