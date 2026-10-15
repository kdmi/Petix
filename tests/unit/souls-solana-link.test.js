const test = require("node:test");
const assert = require("node:assert/strict");
const nacl = require("tweetnacl");
const bs58pkg = require("bs58");
const bs58 = bs58pkg.default || bs58pkg;

const { linkSolanaWallet, buildLinkMessage } = require("../../api/_lib/solana-link");

// Linking a Solana wallet to a Petix profile (031): once, with a wallet
// signature, one address per profile, and a one-time 3 000 souls reward.

const WALLET = `0x${"ab".repeat(20)}`;

test("Solana link: valid Phantom signature links once; another profile can't take the same address", async () => {
  const keys = nacl.sign.keyPair();
  const address = bs58.encode(Buffer.from(keys.publicKey));
  const now = Date.parse("2026-10-13T12:00:00Z");
  const sign = (wallet) => {
    const message = buildLinkMessage({ wallet, address, nonce: "n1", issuedAt: new Date(now).toISOString() });
    const signature = Buffer.from(nacl.sign.detached(Buffer.from(message, "utf8"), keys.secretKey)).toString("base64");
    return { address, message, signature };
  };
  const store = {};
  const profiles = {
    getWalletProfile: async (w) => store[w] || { solana: null },
    updateWalletProfile: async (w, mutate) => { store[w] = mutate({ ...(store[w] || { solana: null }) }); return store[w]; },
  };
  let doc = { version: 1, links: {} };
  const links = { mutate: async (fn) => { doc = (await fn(JSON.parse(JSON.stringify(doc)))) || doc; return doc; } };

  const ok = await linkSolanaWallet(WALLET, sign(WALLET), { now, links, profiles, reward: 3000 });
  assert.equal(ok.solana.address, address);
  // Linking pays 3 000 souls once (owner 2026-10-16); a second try is refused, so no second reward.
  assert.equal(ok.soulsGained, 3000);
  assert.deepEqual(store[WALLET].souls, { balance: 3000, totalEarned: 3000 });
  await assert.rejects(() => linkSolanaWallet(WALLET, sign(WALLET), { now, links, profiles, reward: 3000 }), (e) => e.httpCode === "ALREADY_LINKED");
  assert.equal(store[WALLET].souls.balance, 3000);
  const OTHER = `0x${"cd".repeat(20)}`;
  await assert.rejects(() => linkSolanaWallet(OTHER, sign(OTHER), { now, links, profiles }), (e) => e.httpCode === "ADDRESS_TAKEN");
  const forged = { ...sign(OTHER), signature: Buffer.from(new Uint8Array(64)).toString("base64") };
  await assert.rejects(() => linkSolanaWallet(OTHER, forged, { now, links, profiles }), (e) => e.httpCode === "BAD_SIGNATURE");
  await assert.rejects(() => linkSolanaWallet(OTHER, sign(OTHER), { now: now + 3600000, links, profiles }), (e) => e.httpCode === "MESSAGE_EXPIRED");
});
