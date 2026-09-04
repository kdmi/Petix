// Mints the remaining supply to the owner wallet so the slots can be listed
// for sale on a marketplace (OpenSea sells existing tokens — the collection
// must be minted out first).
//
// Temporarily sets mintPrice=0 and walletLimit=MAX_SUPPLY (owner-only calls),
// then mints sequentially with explicit nonces in small concurrent batches.
//
// Usage: node scripts/nft-demo/mint-all.js [count]
const fs = require("fs");
const path = require("path");
const { Contract, JsonRpcProvider, Wallet, formatEther } = require("ethers");

require("./load-env");

const ARTIFACT_PATH = path.join(__dirname, "artifacts", "DemoSlots.json");
const BATCH_SIZE = 10;

async function main() {
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
  const { NFT_DEMO_RPC_URL, NFT_DEMO_CHAIN_ID, NFT_DEMO_CONTRACT, NFT_DEMO_OWNER_SECRET } =
    process.env;
  if (!NFT_DEMO_CONTRACT || !NFT_DEMO_OWNER_SECRET) {
    throw new Error("NFT_DEMO_CONTRACT and NFT_DEMO_OWNER_SECRET are required.");
  }

  const provider = new JsonRpcProvider(NFT_DEMO_RPC_URL, Number(NFT_DEMO_CHAIN_ID));
  const owner = new Wallet(NFT_DEMO_OWNER_SECRET, provider);
  const contract = new Contract(NFT_DEMO_CONTRACT, artifact.abi, owner);

  const [maxSupply, totalSupply, price, limit] = await Promise.all([
    contract.MAX_SUPPLY(),
    contract.totalSupply(),
    contract.mintPrice(),
    contract.walletLimit(),
  ]);

  const requested = Number(process.argv[2] || 0);
  const remaining = Number(maxSupply) - Number(totalSupply);
  const count = requested > 0 ? Math.min(requested, remaining) : remaining;
  if (count <= 0) {
    console.log("Nothing to mint — collection is already minted out.");
    return;
  }

  const balanceBefore = await provider.getBalance(owner.address);
  console.log(`Owner ${owner.address} · ${formatEther(balanceBefore)} ETH`);
  console.log(`Supply ${totalSupply}/${maxSupply} → minting ${count} slot(s) to owner`);

  // Owner-only prerequisites: free mint + no per-wallet cap for this batch.
  if (price > 0n) {
    console.log("Setting mintPrice = 0 …");
    await (await contract.setMintPrice(0)).wait();
  }
  if (Number(limit) < Number(maxSupply)) {
    console.log(`Setting walletLimit = ${maxSupply} …`);
    await (await contract.setWalletLimit(maxSupply)).wait();
  }

  let nonce = await provider.getTransactionCount(owner.address, "pending");
  let minted = 0;

  for (let start = 0; start < count; start += BATCH_SIZE) {
    const size = Math.min(BATCH_SIZE, count - start);
    const sent = [];
    for (let i = 0; i < size; i += 1) {
      sent.push(contract.mint({ nonce: nonce++ }));
    }
    const txs = await Promise.all(sent);
    await Promise.all(txs.map((tx) => tx.wait()));
    minted += size;
    process.stdout.write(`  minted ${minted}/${count}\r`);
  }

  const [finalSupply, balanceAfter] = await Promise.all([
    contract.totalSupply(),
    provider.getBalance(owner.address),
  ]);
  console.log(`\nDone. Supply is now ${finalSupply}/${maxSupply}`);
  console.log(`Gas spent: ${formatEther(balanceBefore - balanceAfter)} ETH`);
  const explorer = (process.env.NFT_DEMO_EXPLORER_URL || "").replace(/\/$/, "");
  if (explorer) {
    console.log(`Collection: ${explorer}/token/${NFT_DEMO_CONTRACT}`);
  }
}

main().catch((error) => {
  console.error(error.shortMessage || error.message || error);
  process.exit(1);
});
