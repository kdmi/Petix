// Deploys ExpeditionTrophies (feature 026) to NFT_RPC_URL / NFT_CHAIN_ID with the
// owner key EXPEDITION_OWNER_SECRET (keep it OUT of Vercel env). The server-side
// minter is the $PETIX operator by default (TOKEN_TREASURY_SECRET → address) or
// EXPEDITION_MINTER_ADDRESS / EXPEDITION_MINTER_SECRET.
//
// Usage:
//   EXPEDITION_OWNER_SECRET=0x… node scripts/expeditions/deploy.js
// Optional: EXPEDITION_NFT_NAME, EXPEDITION_NFT_SYMBOL, EXPEDITION_NFT_BASE_URI
//   (default PUBLIC_BASE_URL + /api/expeditions/metadata/), EXPEDITION_ROYALTY_BPS.
const fs = require("fs");
const path = require("path");
const { Contract, ContractFactory, JsonRpcProvider, Wallet } = require("ethers");

require("./load-env");

const ARTIFACT_PATH = path.join(__dirname, "artifacts", "ExpeditionTrophies.json");

async function main() {
  if (!fs.existsSync(ARTIFACT_PATH)) throw new Error("Artifact missing — run `node scripts/expeditions/compile.js` first.");
  const artifact = JSON.parse(fs.readFileSync(ARTIFACT_PATH, "utf8"));
  const rpcUrl = process.env.NFT_RPC_URL;
  const chainId = Number(process.env.NFT_CHAIN_ID);
  const ownerSecret = process.env.EXPEDITION_OWNER_SECRET;
  if (!rpcUrl || !Number.isFinite(chainId)) throw new Error("NFT_RPC_URL and NFT_CHAIN_ID are required.");
  if (!ownerSecret) throw new Error("EXPEDITION_OWNER_SECRET (deployer/owner private key) is required.");

  const name = process.env.EXPEDITION_NFT_NAME || "Petix Expeditions";
  const symbol = process.env.EXPEDITION_NFT_SYMBOL || "PXPD";
  const base = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const baseUri = process.env.EXPEDITION_NFT_BASE_URI || (base ? `${base}/api/expeditions/metadata/` : "");
  if (!baseUri || !/\/$/.test(baseUri)) throw new Error('EXPEDITION_NFT_BASE_URI must end with "/" (or set PUBLIC_BASE_URL).');
  const minterSecret = process.env.EXPEDITION_MINTER_SECRET || process.env.TOKEN_TREASURY_SECRET;
  const minter = process.env.EXPEDITION_MINTER_ADDRESS || (minterSecret ? new Wallet(minterSecret).address : "");
  if (!minter) throw new Error("EXPEDITION_MINTER_ADDRESS, EXPEDITION_MINTER_SECRET or TOKEN_TREASURY_SECRET is required.");
  const royaltyBps = Number(process.env.EXPEDITION_ROYALTY_BPS || 250);

  const provider = new JsonRpcProvider(rpcUrl, chainId);
  const owner = new Wallet(ownerSecret, provider);
  const balance = await provider.getBalance(owner.address);
  console.log(`Deployer ${owner.address} · balance ${balance} wei · chain ${chainId}`);
  if (balance === 0n) throw new Error("Deployer balance is 0 — top it up before deploying.");

  const factory = new ContractFactory(artifact.abi, artifact.bytecode, owner);
  console.log(`Deploying ExpeditionTrophies("${name}", "${symbol}", "${baseUri}", minter ${minter}, royalty ${royaltyBps} bps)…`);
  const contract = await factory.deploy(name, symbol, baseUri, minter, royaltyBps);
  const receipt = await contract.deploymentTransaction().wait();
  const address = await contract.getAddress();
  const explorer = String(process.env.NFT_EXPLORER_URL || "").replace(/\/$/, "");
  console.log("");
  console.log(`ExpeditionTrophies deployed at: ${address}`);
  console.log(`  tx: ${receipt.hash}`);
  if (explorer) console.log(`  explorer: ${explorer}/address/${address}`);
  console.log("");
  console.log("Next steps:");
  console.log(`  1. Vercel env: EXPEDITION_NFT_CONTRACT=${address} (+ EXPEDITION_MINTER_SECRET if not the token operator)`);
  console.log("  2. node scripts/expeditions/preflight.js");
  console.log("  3. Verify the source in Blockscout with artifacts/ExpeditionTrophies.standard-input.json");
  const deployed = new Contract(address, artifact.abi, provider);
  console.log(`  contractURI(): ${await deployed.contractURI()}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
