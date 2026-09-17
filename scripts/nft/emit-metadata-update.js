// Шлёт ERC-4906 BatchMetadataUpdate(from, to) от владельца коллекции.
// Маркетплейс слушает это событие и перечитывает метаданные диапазона —
// рычаг на случай, когда запросы через API он принимает, но не исполняет.
//
//   node scripts/nft/emit-metadata-update.js 1 777
//
// Ключ владельца берётся из .env.local (NFT_OWNER_SECRET) и никуда не уходит.

require("./load-env.js");

const { JsonRpcProvider, Wallet, Contract, formatEther } = require("ethers");

const ABI = [
  "function emitBatchMetadataUpdate(uint256 fromTokenId, uint256 toTokenId) external",
  "function owner() view returns (address)",
  "function totalSupply() view returns (uint256)",
];

async function main() {
  const from = Math.max(1, Math.floor(Number(process.argv[2]) || 1));
  const { NFT_RPC_URL, NFT_CHAIN_ID, NFT_CONTRACT, NFT_OWNER_SECRET } = process.env;
  if (!NFT_CONTRACT) throw new Error("NFT_CONTRACT не задан в .env.local.");
  if (!NFT_OWNER_SECRET) throw new Error("NFT_OWNER_SECRET не задан в .env.local.");

  const provider = new JsonRpcProvider(NFT_RPC_URL, Number(NFT_CHAIN_ID));
  const owner = new Wallet(NFT_OWNER_SECRET, provider);
  const contract = new Contract(NFT_CONTRACT, ABI, owner);

  const onChainOwner = await contract.owner();
  if (onChainOwner.toLowerCase() !== owner.address.toLowerCase()) {
    throw new Error(`Ключ не от владельца коллекции: ключ ${owner.address}, владелец ${onChainOwner}.`);
  }

  const supply = Number(await contract.totalSupply());
  const to = Math.min(supply, Math.floor(Number(process.argv[3]) || supply));
  if (to < from) throw new Error(`Пустой диапазон ${from}–${to}.`);

  const before = await provider.getBalance(owner.address);
  console.log("контракт:  ", NFT_CONTRACT);
  console.log("диапазон:  ", `${from}–${to}`);

  const tx = await contract.emitBatchMetadataUpdate(from, to);
  console.log("транзакция:", tx.hash);
  const receipt = await tx.wait();
  const after = await provider.getBalance(owner.address);
  console.log("блок:      ", receipt.blockNumber, "| статус:", receipt.status === 1 ? "успех" : "ОШИБКА");
  console.log("газ:       ", formatEther(before - after), "ETH");
}

main().catch((error) => {
  console.error("Не получилось:", error.shortMessage || error.message);
  process.exit(1);
});
