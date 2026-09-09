// Переключает baseURI коллекции — это и есть ревил.
//
// До ревила Studio держит baseURI на одном IPFS-снимке, и все капсулы выглядят
// одинаково. Ревил = указать на наш эндпоинт (со слэшем на конце, иначе SeaDrop
// снова отдаст всем один и тот же JSON). Операция обратима: тем же скриптом
// можно вернуть IPFS-ссылку и прогнать всё заново.
//
// Запуск:
//   node scripts/nft/set-base-uri.js https://slot-box-demo.vercel.app/api/nft/metadata/
//
// Ключ владельца берётся из .env.local (NFT_OWNER_SECRET) и никуда не уходит.

require("./load-env.js");

const { JsonRpcProvider, Wallet, Contract } = require("ethers");

const ABI = [
  "function setBaseURI(string) external",
  "function baseURI() view returns (string)",
  "function owner() view returns (address)",
];

async function main() {
  const nextUri = process.argv[2];
  if (!nextUri) {
    throw new Error("Укажи новый baseURI аргументом.");
  }

  const { NFT_RPC_URL, NFT_CHAIN_ID, NFT_CONTRACT, NFT_OWNER_SECRET } = process.env;
  if (!NFT_CONTRACT) throw new Error("NFT_CONTRACT не задан в .env.local.");
  if (!NFT_OWNER_SECRET) throw new Error("NFT_OWNER_SECRET не задан в .env.local.");

  // Слэш на конце — единственная деталь, из-за которой ревил может тихо не
  // сработать: без него все токены получат одинаковые метаданные.
  if (!nextUri.endsWith("/") && !nextUri.startsWith("ipfs://")) {
    throw new Error("HTTP-адрес обязан заканчиваться слэшем.");
  }

  const provider = new JsonRpcProvider(NFT_RPC_URL, Number(NFT_CHAIN_ID));
  const owner = new Wallet(NFT_OWNER_SECRET, provider);
  const contract = new Contract(NFT_CONTRACT, ABI, owner);

  const onChainOwner = await contract.owner();
  if (onChainOwner.toLowerCase() !== owner.address.toLowerCase()) {
    throw new Error(
      `Ключ не от владельца коллекции: ключ ${owner.address}, владелец ${onChainOwner}.`
    );
  }

  console.log("контракт:  ", NFT_CONTRACT);
  console.log("было:      ", (await contract.baseURI()) || "(пусто)");
  console.log("станет:    ", nextUri);

  const tx = await contract.setBaseURI(nextUri);
  console.log("транзакция:", tx.hash);
  await tx.wait();

  console.log("стало:     ", await contract.baseURI());
  console.log("\nГотово. Маркетплейсу нужно время перечитать метаданные.");
}

main().catch((error) => {
  console.error("Не получилось:", error.shortMessage || error.message);
  process.exit(1);
});
