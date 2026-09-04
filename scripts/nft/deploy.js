// Deploys DemoSlots to the chain in NFT_RPC_URL / NFT_CHAIN_ID with
// the owner key (NFT_OWNER_SECRET — keep it OUT of Vercel env).
//
// Usage:
//   NFT_OWNER_SECRET=0x… node scripts/nft/deploy.js
// Optional env: NFT_COLLECTION_NAME, NFT_COLLECTION_SYMBOL,
//   NFT_BASE_URI, NFT_SERVICE_ADDRESS (or NFT_SERVICE_SECRET),
//   NFT_ROYALTY_BPS, NFT_WALLET_LIMIT.
const fs = require("fs");
const path = require("path");
const { Contract, ContractFactory, JsonRpcProvider, Wallet, parseEther, formatEther } = require("ethers");

require("./load-env");

const ARTIFACT_PATH = path.join(__dirname, "artifacts", "DemoSlots.json");

async function main() {
  if (!fs.existsSync(ARTIFACT_PATH)) {
    throw new Error("Artifact missing — run `node scripts/nft/compile.js` first.");
  }
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));

  const rpcUrl = process.env.NFT_RPC_URL;
  const chainId = Number(process.env.NFT_CHAIN_ID);
  const ownerSecret = process.env.NFT_OWNER_SECRET;
  if (!rpcUrl || !Number.isFinite(chainId)) {
    throw new Error("NFT_RPC_URL and NFT_CHAIN_ID are required.");
  }
  if (!ownerSecret) {
    throw new Error("NFT_OWNER_SECRET (deployer/owner private key) is required.");
  }

  const name = process.env.NFT_COLLECTION_NAME || "Slot Box";
  const symbol = process.env.NFT_COLLECTION_SYMBOL || "SBOX";
  const baseUri = process.env.NFT_BASE_URI || "";
  if (!baseUri || !/\/$/.test(baseUri)) {
    throw new Error(
      'NFT_BASE_URI is required and must end with "/", e.g. https://<neutral>.vercel.app/api/nft/metadata/'
    );
  }
  // Service address: explicit env → derived from the service key → derived from
  // the owner key (single-wallet demo setup, so owner doubles as service).
  const serviceAddress =
    process.env.NFT_SERVICE_ADDRESS ||
    (process.env.NFT_SERVICE_SECRET
      ? new Wallet(process.env.NFT_SERVICE_SECRET).address
      : new Wallet(ownerSecret).address);
  if (!serviceAddress) {
    throw new Error("NFT_SERVICE_ADDRESS or NFT_SERVICE_SECRET is required.");
  }
  const royaltyBps = Number(process.env.NFT_ROYALTY_BPS || 250);
  const walletLimit = Number(process.env.NFT_WALLET_LIMIT || 5);
  const mintPrice = parseEther(String(process.env.NFT_MINT_PRICE_ETH || "0.001"));

  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const owner = new Wallet(ownerSecret, provider);
  const balance = await provider.getBalance(owner.address);
  console.log(`Deployer ${owner.address} · balance ${balance} wei · chain ${chainId}`);
  if (balance === 0n) {
    throw new Error("Deployer balance is 0 — top it up before deploying.");
  }

  const factory = new ContractFactory(artifact.abi, artifact.bytecode, owner);
  console.log(
    `Deploying DemoSlots("${name}", "${symbol}", "${baseUri}", ${serviceAddress}, ${royaltyBps}, ${walletLimit}, ${formatEther(mintPrice)} ETH)…`
  );
  const contract = await factory.deploy(
    name,
    symbol,
    baseUri,
    serviceAddress,
    royaltyBps,
    walletLimit,
    mintPrice
  );
  const receipt = await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();

  const explorer = process.env.NFT_EXPLORER_URL || "";
  console.log("");
  console.log(`DemoSlots deployed at: ${address}`);
  console.log(`  tx: ${receipt.hash}`);
  if (explorer) {
    console.log(`  explorer: ${explorer.replace(/\/$/, "")}/address/${address}`);
  }
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Set NFT_CONTRACT=${address} in the demo env`);
  console.log("  2. Run node scripts/nft/preflight.js");
  console.log(
    "  3. Verify the source in Blockscout with artifacts/DemoSlots.standard-input.json (standard JSON input)"
  );

  const deployed = new Contract(address, artifact.abi, provider);
  const [uri, price] = await Promise.all([deployed.contractURI(), deployed.mintPrice()]);
  console.log(`  contractURI(): ${uri}`);
  console.log(`  mintPrice(): ${formatEther(price)} ETH per slot`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
