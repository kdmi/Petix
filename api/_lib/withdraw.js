"use strict";

// On-chain выплата Points → $PETIX (013/withdraw).
// Custodial-модель: наш treasury = fee payer и источник токенов; бэкенд полностью подписывает
// и САМ отправляет транзакцию. Игрок ничего не подписывает в кошельке (нет промпта/
// предупреждения). Газ и аренду ATA получателя платим мы.
// Программа токена (classic SPL vs Token-2022) определяется по владельцу mint-аккаунта,
// поэтому код одинаково работает и с тест-токеном, и с боевым $PETIX.

const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} = require("@solana/web3.js");
const splToken = require("@solana/spl-token");
const bs58Package = require("bs58");
const bs58 = bs58Package.default || bs58Package;

const {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
} = splToken;

let cachedConnection = null;
let cachedTreasury = null;
let cachedMint = null;
let cachedProgramId = null;

function getConfig() {
  return {
    rpcUrl: process.env.SOLANA_RPC_URL || "",
    mint: process.env.PETIX_MINT || "",
    decimals: Number.isFinite(Number(process.env.PETIX_DECIMALS))
      ? Math.max(0, Math.floor(Number(process.env.PETIX_DECIMALS)))
      : 6,
    network: process.env.SOLANA_NETWORK || "mainnet-beta",
    tokenSymbol: process.env.PETIX_TOKEN_SYMBOL || "$PETIX",
  };
}

// Готов ли бэкенд физически отправлять выводы (есть все секреты/конфиг).
function isConfigured() {
  const c = getConfig();
  return Boolean(c.rpcUrl && c.mint && (process.env.SOLANA_TREASURY_SECRET || "").trim());
}

function getConnection() {
  if (cachedConnection) return cachedConnection;
  const { rpcUrl } = getConfig();
  if (!rpcUrl) throw configError("SOLANA_RPC_URL is not set");
  cachedConnection = new Connection(rpcUrl, "confirmed");
  return cachedConnection;
}

function getMintPubkey() {
  if (cachedMint) return cachedMint;
  const { mint } = getConfig();
  if (!mint) throw configError("PETIX_MINT is not set");
  cachedMint = new PublicKey(mint);
  return cachedMint;
}

function getTreasuryKeypair() {
  if (cachedTreasury) return cachedTreasury;
  const secret = (process.env.SOLANA_TREASURY_SECRET || "").trim();
  if (!secret) throw configError("SOLANA_TREASURY_SECRET is not set");
  cachedTreasury = secret.startsWith("[")
    ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)))
    : Keypair.fromSecretKey(bs58.decode(secret));
  return cachedTreasury;
}

// Определяем программу токена по владельцу mint-аккаунта (classic SPL vs Token-2022).
async function getTokenProgramId() {
  if (cachedProgramId) return cachedProgramId;
  const info = await getConnection().getAccountInfo(getMintPubkey());
  if (!info) throw configError("Mint account not found on-chain — проверь PETIX_MINT/сеть");
  cachedProgramId = info.owner.equals(TOKEN_2022_PROGRAM_ID)
    ? TOKEN_2022_PROGRAM_ID
    : TOKEN_PROGRAM_ID;
  return cachedProgramId;
}

// Points → базовые единицы токена (BigInt). Курс 1:1.
function toBaseUnits(points) {
  const n = Math.max(0, Math.floor(Number(points) || 0));
  return BigInt(n) * 10n ** BigInt(getConfig().decimals);
}

async function getTreasuryTokenBalanceRaw() {
  const pid = await getTokenProgramId();
  const ata = await getAssociatedTokenAddress(getMintPubkey(), getTreasuryKeypair().publicKey, false, pid);
  const acc = await getAccount(getConnection(), ata, "confirmed", pid);
  return acc.amount; // BigInt, raw
}

// Custodial-отправка: наш treasury = fee payer и источник токенов, полностью подписывает
// и САМ отправляет транзакцию (игрок ничего не подписывает → нет промпта/предупреждения
// кошелька). Газ и аренду ATA получателя платим мы. Возвращает сигнатуру после сабмита.
async function sendWithdrawFromTreasury({ playerWallet, points }) {
  const conn = getConnection();
  const treasury = getTreasuryKeypair();
  const mint = getMintPubkey();
  const pid = await getTokenProgramId();
  const { decimals } = getConfig();
  const player = new PublicKey(playerWallet);
  const amount = toBaseUnits(points);
  if (amount <= 0n) throw badRequest("amount must be > 0");

  const treasuryAta = await getAssociatedTokenAddress(mint, treasury.publicKey, false, pid);
  const treasuryAcc = await getAccount(conn, treasuryAta, "confirmed", pid);
  if (treasuryAcc.amount < amount) {
    const e = new Error("Treasury has insufficient token balance");
    e.code = "INSUFFICIENT_TREASURY";
    throw e;
  }

  const playerAta = await getAssociatedTokenAddress(mint, player, false, pid);
  const instructions = [];
  const playerAtaInfo = await conn.getAccountInfo(playerAta);
  if (!playerAtaInfo) {
    // Аренду ATA получателя платим МЫ (payer = treasury).
    instructions.push(
      createAssociatedTokenAccountInstruction(treasury.publicKey, playerAta, player, mint, pid, ASSOCIATED_TOKEN_PROGRAM_ID),
    );
  }
  instructions.push(
    createTransferCheckedInstruction(treasuryAta, mint, playerAta, treasury.publicKey, amount, decimals, [], pid),
  );

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const tx = new Transaction();
  tx.add(...instructions);
  tx.feePayer = treasury.publicKey; // мы платим газ
  tx.recentBlockhash = blockhash;
  tx.sign(treasury); // полностью подписываем

  // skipPreflight:false → симуляция отсеет очевидные ошибки до сабмита (бросит throw).
  const signature = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });

  return {
    signature,
    blockhash,
    lastValidBlockHeight,
    createdRecipientAta: !playerAtaInfo,
    amountRaw: amount.toString(),
  };
}

// Проверка статуса транзакции по сигнатуре (после того, как кошелёк игрока её отправил).
async function confirmWithdrawTransaction(signature) {
  const conn = getConnection();
  const res = await conn.getSignatureStatuses([signature], { searchTransactionHistory: true });
  const s = res && res.value && res.value[0];
  if (!s) return { confirmed: false, status: "unknown" };
  if (s.err) return { confirmed: false, status: "failed", err: s.err };
  const ok = s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized";
  return { confirmed: ok, status: s.confirmationStatus || "processed", slot: s.slot };
}

// Истёк ли blockhash заявки (значит tx уже никогда не подтвердится → безопасно вернуть Points).
async function isBlockhashExpired(lastValidBlockHeight) {
  if (!Number.isFinite(Number(lastValidBlockHeight))) return false;
  const height = await getConnection().getBlockHeight("confirmed");
  return height > Number(lastValidBlockHeight);
}

function configError(msg) {
  const e = new Error(msg);
  e.code = "WITHDRAW_NOT_CONFIGURED";
  return e;
}
function badRequest(msg) {
  const e = new Error(msg);
  e.code = "BAD_REQUEST";
  return e;
}

module.exports = {
  getConfig,
  isConfigured,
  getConnection,
  getTreasuryKeypair,
  getMintPubkey,
  getTokenProgramId,
  toBaseUnits,
  getTreasuryTokenBalanceRaw,
  sendWithdrawFromTreasury,
  confirmWithdrawTransaction,
  isBlockhashExpired,
};
