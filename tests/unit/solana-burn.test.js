const test = require("node:test");
const assert = require("node:assert/strict");

const B = require("../../api/_lib/solana-burn");

// Burning $PETIX on Solana for souls (031): we build the burn, the linked wallet
// signs and sends it, we read it back from the chain and pay souls once.

const WALLET = `0x${"ab".repeat(20)}`;
const OWNER = "CGs3UPsgfdVyfAexX1mexMCBBdPV2iMCktWybsCgWUpy";
const TOKEN_ACCOUNT = "9zqzfmVJ6m1wP2yZ1NGd5N7cXk9fN4ZpCwD9Tgm5XSh9";
const SIG = "5".repeat(88);
const CFG = { SOLANA_BURN_SMALL_COINS: 100000, SOLANA_BURN_SMALL_SOULS: 5000, SOLANA_BURN_BIG_COINS: 1000000, SOLANA_BURN_BIG_SOULS: 75000 };

function memory(profile) {
  let p = JSON.parse(JSON.stringify(profile));
  let doc = { version: 1, burns: {}, totalCoins: 0, totalSouls: 0 };
  return {
    get: () => p,
    doc: () => doc,
    deps: {
      getProfile: async () => JSON.parse(JSON.stringify(p)),
      updateProfile: async (_w, fn) => { p = fn(JSON.parse(JSON.stringify(p))); return JSON.parse(JSON.stringify(p)); },
      getConfig: async () => CFG,
      registry: {
        read: async () => ({ data: JSON.parse(JSON.stringify(doc)) }),
        mutate: async (fn) => { doc = (await fn(JSON.parse(JSON.stringify(doc)))) || doc; return doc; },
      },
      now: () => new Date("2026-10-16T12:00:00Z"),
    },
  };
}

function burnTx({ amount, mint = B.mintAddress(), authority = OWNER, err = null, type = "burnChecked" }) {
  const info = type === "burnChecked"
    ? { account: TOKEN_ACCOUNT, mint, authority, tokenAmount: { amount: String(amount), decimals: 6 } }
    : { account: TOKEN_ACCOUNT, mint, authority, amount: String(amount) };
  return { meta: { err, innerInstructions: [] }, transaction: { message: { instructions: [{ programId: B.TOKEN_2022_PROGRAM, program: "spl-token", parsed: { type, info } }] } } };
}

test("burn packs come from the config: 100K → 5 000 souls, 1M → 75 000 souls", () => {
  assert.deepEqual(B.burnPacks(CFG), [{ id: "small", coins: 100000, souls: 5000 }, { id: "big", coins: 1000000, souls: 75000 }]);
});

test("prepare: builds one Token-2022 burnChecked for the linked wallet's coin account", async () => {
  const m = memory({ solana: { address: OWNER } });
  const rpc = async (method) => {
    if (method === "getTokenAccountsByOwner") return { value: [{ pubkey: TOKEN_ACCOUNT, account: { data: { parsed: { info: { tokenAmount: { amount: String(250000n * 1000000n) } } } } } }] };
    if (method === "getLatestBlockhash") return { value: { blockhash: "GHtXQBsoZHVnNFa9YevAzFr17DJjgHXk3ycTKD5xD3Zi" } };
    throw new Error(method);
  };
  const r = await B.prepareBurn(WALLET, { packId: "small" }, { ...m.deps, rpc });
  assert.deepEqual([r.coins, r.souls, r.owner], [100000, 5000, OWNER]);
  const tx = Buffer.from(r.transaction, "base64");
  assert.equal(tx[0], 1, "one signature slot");
  const msg = tx.subarray(65);
  assert.deepEqual([...msg.subarray(0, 4)], [1, 0, 1, 4], "1 signer, 1 read-only program, 4 accounts");
  const data = msg.subarray(msg.length - 10);
  assert.equal(data[0], 15, "burnChecked");
  assert.equal(data.readBigUInt64LE(1), 100000n * 1000000n);
  assert.equal(data[9], 6, "decimals");
});

test("prepare: refuses without a linked Solana wallet or without enough coins", async () => {
  await assert.rejects(() => B.prepareBurn(WALLET, { packId: "small" }, memory({ solana: null }).deps), (e) => e.httpCode === "NO_SOLANA");
  const m = memory({ solana: { address: OWNER } });
  const rpc = async () => ({ value: [{ pubkey: TOKEN_ACCOUNT, account: { data: { parsed: { info: { tokenAmount: { amount: String(50000n * 1000000n) } } } } } }] });
  await assert.rejects(() => B.prepareBurn(WALLET, { packId: "small" }, { ...m.deps, rpc }), (e) => e.httpCode === "NOT_ENOUGH_COINS" && e.balance === 50000);
});

test("confirm: a confirmed burn of a pack pays souls once and lands in the registry", async () => {
  const m = memory({ solana: { address: OWNER }, souls: { balance: 1000, totalEarned: 1000 } });
  const rpc = async () => burnTx({ amount: 1000000n * 1000000n });
  const r = await B.confirmBurn(WALLET, { signature: SIG }, { ...m.deps, rpc });
  assert.deepEqual([r.status, r.coins, r.soulsGained], ["credited", 1000000, 75000]);
  assert.deepEqual(m.get().souls, { balance: 76000, totalEarned: 76000 });
  assert.equal(m.doc().burns[SIG].coins, 1000000);
  assert.equal(m.doc().totalCoins, 1000000);
  await assert.rejects(() => B.confirmBurn(WALLET, { signature: SIG }, { ...m.deps, rpc }), (e) => e.httpCode === "ALREADY_COUNTED");
  assert.equal(m.get().souls.balance, 76000, "no second payment");
});

test("confirm: pending until Solana has it; failed, foreign, wrong-mint and off-pack burns pay nothing", async () => {
  const m = memory({ solana: { address: OWNER }, souls: { balance: 0, totalEarned: 0 } });
  assert.deepEqual(await B.confirmBurn(WALLET, { signature: SIG }, { ...m.deps, rpc: async () => null }), { status: "pending" });
  const bad = async (tx, code) => assert.rejects(() => B.confirmBurn(WALLET, { signature: SIG }, { ...m.deps, rpc: async () => tx }), (e) => e.httpCode === code);
  await bad(burnTx({ amount: 100000n * 1000000n, err: { InstructionError: [0, "Custom"] } }), "TX_FAILED");
  await bad(burnTx({ amount: 100000n * 1000000n, authority: TOKEN_ACCOUNT }), "NOT_A_BURN");
  await bad(burnTx({ amount: 100000n * 1000000n, mint: TOKEN_ACCOUNT }), "NOT_A_BURN");
  await bad(burnTx({ amount: 123n * 1000000n }), "NOT_A_PACK");
  await assert.rejects(() => B.confirmBurn(WALLET, { signature: "nope" }, m.deps), (e) => e.httpCode === "BAD_SIGNATURE");
  assert.equal(m.get().souls.balance, 0);
  assert.deepEqual(m.doc().burns, {});
  // A plain `burn` (not burnChecked) of a pack counts too.
  const ok = await B.confirmBurn(WALLET, { signature: SIG }, { ...m.deps, rpc: async () => burnTx({ amount: 100000n * 1000000n, type: "burn" }) });
  assert.equal(ok.soulsGained, 5000);
});
