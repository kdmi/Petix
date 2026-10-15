const { createBlobDocument } = require("./blob-doc");
const { isLikelySolanaAddress, verifySignedMessage } = require("./auth");
const { getWalletProfile, updateWalletProfile } = require("./store");
const { creditSouls, fail } = require("./souls");

// Linking a Solana wallet to a Petix profile (031). Sign-in stays on the main
// (EVM) wallet; the Solana address is only attached, once, with a Phantom
// signature over a plain text message (no transaction, no gas).
//
// One Solana address belongs to one profile: `solana-links.json` maps address →
// profile wallet, so a single Solana wallet can't serve several accounts.
// A linked wallet can't be changed or unlinked.
// Linking pays SOULS_SOLANA_LINK_REWARD souls once (owner 2026-10-16: 3 000):
// a profile links only once, so it is paid only once.

const MESSAGE_MAX_AGE_MS = 10 * 60 * 1000;
const linksDoc = createBlobDocument({ path: "solana-links.json", empty: () => ({ version: 1, links: {} }), normalize: (d) => ({ version: 1, links: (d && d.links) || {} }) });

function buildLinkMessage({ wallet, address, nonce, issuedAt }) {
  return [
    "Petix: link this Solana wallet to my Petix profile.",
    `Petix profile: ${wallet}`,
    `Solana wallet: ${address}`,
    "This is a one-time link and can't be changed later.",
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join("\n");
}

function parseLinkMessage(message) {
  const text = String(message || "");
  const pick = (label) => {
    const line = text.split("\n").find((l) => l.startsWith(`${label}: `));
    return line ? line.slice(label.length + 2).trim() : "";
  };
  return { wallet: pick("Petix profile").toLowerCase(), address: pick("Solana wallet"), nonce: pick("Nonce"), issuedAt: pick("Issued At") };
}

async function linkSolanaWallet(wallet, { address, message, signature }, { now = Date.now(), links = linksDoc, profiles = { getWalletProfile, updateWalletProfile }, reward = 0 } = {}) {
  const sol = String(address || "").trim();
  if (!isLikelySolanaAddress(sol)) throw fail(400, "BAD_ADDRESS", "That doesn't look like a Solana address.");
  const parsed = parseLinkMessage(message);
  if (parsed.wallet !== String(wallet).toLowerCase() || parsed.address !== sol) throw fail(400, "BAD_MESSAGE", "The signed message doesn't match this profile.");
  const issued = Date.parse(parsed.issuedAt);
  if (!Number.isFinite(issued) || Math.abs(now - issued) > MESSAGE_MAX_AGE_MS) throw fail(400, "MESSAGE_EXPIRED", "The signature is too old — sign again.");
  let valid = false;
  try { valid = verifySignedMessage(sol, String(message), String(signature || "")); } catch { valid = false; }
  if (!valid) throw fail(400, "BAD_SIGNATURE", "The signature doesn't match the Solana wallet.");

  const existing = await profiles.getWalletProfile(wallet);
  if (existing.solana) throw fail(409, "ALREADY_LINKED", "A Solana wallet is already linked to this profile.", { solana: existing.solana });

  // Claim the address first: one Solana wallet, one profile.
  await links.mutate((doc) => {
    const owner = doc.links[sol];
    if (owner && owner.wallet !== String(wallet).toLowerCase()) throw fail(409, "ADDRESS_TAKEN", "This Solana wallet is already linked to another Petix profile.");
    doc.links[sol] = { wallet: String(wallet).toLowerCase(), at: new Date(now).toISOString() };
    return doc;
  });
  let soulsGained = 0;
  const profile = await profiles.updateWalletProfile(wallet, (current) => {
    if (current.solana) throw fail(409, "ALREADY_LINKED", "A Solana wallet is already linked to this profile.");
    current.solana = { address: sol, linkedAt: new Date(now).toISOString() };
    soulsGained = creditSouls(current, reward);
    return current;
  });
  return { solana: profile.solana, soulsGained, souls: profile.souls };
}

module.exports = { MESSAGE_MAX_AGE_MS, buildLinkMessage, linkSolanaWallet, linksDoc, parseLinkMessage };
