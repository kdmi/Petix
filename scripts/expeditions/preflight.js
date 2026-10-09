// Read-only check of the trophy collection setup before enabling minting:
// contract answers, minter matches our operator, ETH for gas, baseURI points at us.
//   node scripts/expeditions/preflight.js [wallet-to-check]
require("./load-env");
const { formatEther } = require("ethers");
const { createMintClient, getMintEnv } = require("../../api/_lib/expedition-nft");

async function main() {
  const env = getMintEnv();
  console.log(`chain ${env.chainId} · contract ${env.contract ? "set" : "MISSING"} · minter key ${env.minterAddress ? "set" : "MISSING"}`);
  if (!env.configured) throw new Error("EXPEDITION_NFT_CONTRACT / minter secret / NFT_RPC_URL missing.");
  const chain = createMintClient();
  const snap = await chain.getMinterSnapshot();
  console.log(`minter ${snap.minterAddress} · on-chain minter ${snap.contractMinter} · ${snap.minterMatches ? "OK" : "MISMATCH — call setMinter() from the owner"}`);
  console.log(`ETH for gas: ${formatEther(snap.ethWei)} · minted so far: ${snap.totalMinted}`);
  console.log(`baseURI: ${snap.baseUri}`);
  const wallet = process.argv[2];
  if (wallet) {
    for (let boss = 1; boss <= 10; boss++) {
      const has = await chain.hasClaimed(wallet, boss);
      if (has) console.log(`  ${wallet} already holds the trophy of boss ${boss}`);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
