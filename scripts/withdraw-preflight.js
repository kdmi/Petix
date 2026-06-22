#!/usr/bin/env node
// Preflight для on-chain вывода (013/withdraw). Проверяет, что креды из .env.local
// корректны и казначей готов раздавать токены. Секреты НЕ печатает — только публичные
// данные (pubkey, mint, балансы). Запуск: node scripts/withdraw-preflight.js
"use strict";

const fs = require("fs");
const path = require("path");

// Грузим .env.local затем .env — как dev-server.js (только отсутствующие ключи).
for (const file of [".env.local", ".env"]) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) {
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

const { Connection, Keypair, PublicKey } = require("@solana/web3.js");
const {
  getAssociatedTokenAddress,
  getMint,
  getAccount,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} = require("@solana/spl-token");
const bs58Package = require("bs58");
const bs58 = bs58Package.default || bs58Package;

const ok = (m) => console.log("  ✅ " + m);
const bad = (m) => console.log("  ❌ " + m);
const info = (m) => console.log("  •  " + m);

function parseKeypair(secret) {
  const s = (secret || "").trim();
  if (!s) throw new Error("SOLANA_TREASURY_SECRET пуст");
  if (s.startsWith("[")) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s)));
  return Keypair.fromSecretKey(bs58.decode(s));
}

(async () => {
  let failed = false;

  console.log("\n=== Withdraw preflight ===\n");

  // 1. Наличие переменных
  console.log("1) Переменные окружения:");
  const rpc = process.env.SOLANA_RPC_URL;
  const mintStr = process.env.PETIX_MINT;
  const secret = process.env.SOLANA_TREASURY_SECRET;
  const decimalsEnv = process.env.PETIX_DECIMALS;
  const network = process.env.SOLANA_NETWORK;

  rpc ? ok("SOLANA_RPC_URL задан (host=" + safeHost(rpc) + ")") : (bad("SOLANA_RPC_URL отсутствует"), (failed = true));
  mintStr ? ok("PETIX_MINT=" + mintStr) : (bad("PETIX_MINT отсутствует"), (failed = true));
  secret ? ok("SOLANA_TREASURY_SECRET задан (длина " + secret.trim().length + ")") : (bad("SOLANA_TREASURY_SECRET отсутствует"), (failed = true));
  info("PETIX_DECIMALS=" + (decimalsEnv ?? "(не задан)"));
  info("SOLANA_NETWORK=" + (network ?? "(не задан)"));
  if (failed) return finish(true);

  // 2. Ключ казначея
  console.log("\n2) Кошелёк-раздатчик (treasury):");
  let kp;
  try {
    kp = parseKeypair(secret);
    ok("Ключ распарсился. Публичный адрес: " + kp.publicKey.toBase58());
  } catch (e) {
    bad("Не удалось распарсить ключ: " + e.message);
    info("Ожидаю base58-строку (Phantom → Export Private Key) или JSON-массив байт.");
    return finish(true);
  }

  // 3. Mint
  console.log("\n3) Токен (mint):");
  let mint;
  try {
    mint = new PublicKey(mintStr);
    ok("Mint-адрес валиден");
  } catch (e) {
    bad("PETIX_MINT не является валидным адресом: " + e.message);
    return finish(true);
  }

  // 4. RPC + он-чейн данные
  console.log("\n4) RPC и он-чейн состояние:");
  const conn = new Connection(rpc, "confirmed");
  let version;
  try {
    version = await conn.getVersion();
    ok("RPC отвечает (solana-core " + version["solana-core"] + ")");
  } catch (e) {
    bad("RPC недоступен: " + e.message);
    return finish(true);
  }

  // SOL баланс (нужен минимально — газ платит игрок, но казначею иногда нужен SOL под rent при первом ATA)
  try {
    const sol = (await conn.getBalance(kp.publicKey)) / 1e9;
    info("SOL на казначее: " + sol + " (газ за выводы платит игрок; казначею SOL почти не нужен)");
  } catch (e) {
    info("Не смог прочитать SOL-баланс: " + e.message);
  }

  // Mint info — определяем программу (classic SPL vs token-2022) и decimals
  let mintInfo;
  let tokenProgramId = TOKEN_PROGRAM_ID;
  try {
    mintInfo = await getMint(conn, mint, "confirmed", TOKEN_PROGRAM_ID);
    ok("Mint найден в classic SPL Token program");
  } catch (e1) {
    try {
      mintInfo = await getMint(conn, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
      tokenProgramId = TOKEN_2022_PROGRAM_ID;
      ok("Mint найден в Token-2022 program (учтём при сборке транзакции)");
    } catch (e2) {
      bad("Mint не найден ни в classic, ни в token-2022. Проверь PETIX_MINT/сеть. (" + e1.message + ")");
      return finish(true);
    }
  }

  info("decimals (on-chain): " + mintInfo.decimals);
  info("supply (on-chain, raw): " + mintInfo.supply.toString());
  if (decimalsEnv != null && Number(decimalsEnv) !== mintInfo.decimals) {
    bad("PETIX_DECIMALS=" + decimalsEnv + " не совпадает с on-chain " + mintInfo.decimals + " → исправь .env.local");
    failed = true;
  } else if (decimalsEnv != null) {
    ok("PETIX_DECIMALS совпадает с on-chain (" + mintInfo.decimals + ")");
  }

  // Токен-баланс казначея
  try {
    const ata = await getAssociatedTokenAddress(mint, kp.publicKey, false, tokenProgramId);
    const acc = await getAccount(conn, ata, "confirmed", tokenProgramId);
    const human = Number(acc.amount) / 10 ** mintInfo.decimals;
    ok("Токен-аккаунт казначея найден. Баланс: " + human.toLocaleString("en-US") + " токенов (raw " + acc.amount.toString() + ")");
    info("Этого хватит на вывод суммарно ~" + Math.floor(human).toLocaleString("en-US") + " Points (при 1:1).");
  } catch (e) {
    bad("У казначея НЕТ токен-аккаунта/баланса по этому mint (0). Переведи тест-токены на адрес выше. (" + e.message + ")");
    failed = true;
  }

  return finish(failed);
})().catch((e) => {
  console.log("\n❌ Непредвиденная ошибка: " + (e && e.message));
  process.exit(1);
});

function safeHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(не URL)";
  }
}

function finish(failed) {
  console.log("\n=== Итог: " + (failed ? "❌ есть проблемы (см. выше)" : "✅ всё готово к выводу") + " ===\n");
  process.exit(failed ? 1 : 0);
}
