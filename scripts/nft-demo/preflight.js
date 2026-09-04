// Проверка готовности NFT-слотов: env, сеть, контракт, метаданные, ключи.
// Гоняется и для демо, и перед боевым запуском — все проверки одинаковы,
// отличаются только значения в env.
//
// Запуск:  node scripts/nft-demo/preflight.js
//          NFT_METADATA_BASE=https://petix.fun node scripts/nft-demo/preflight.js
const fs = require("fs");
const path = require("path");
const { Contract, JsonRpcProvider, Wallet, formatEther } = require("ethers");

require("./load-env");

const ARTIFACT_PATH = path.join(__dirname, "artifacts", "DemoSlots.json");

// Минимальный ABI: работает и с нашим DemoSlots, и с ERC721SeaDrop от OpenSea.
const ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function MAX_SUPPLY() view returns (uint256)",
  "function owner() view returns (address)",
  "function baseURI() view returns (string)",
  "function contractURI() view returns (string)",
  "function service() view returns (address)",
];

const problems = [];
const warnings = [];

function ok(label, detail = "") {
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ""}`);
}
function bad(label, detail = "") {
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  problems.push(label);
}
function warn(label, detail = "") {
  console.log(`  ! ${label}${detail ? ` — ${detail}` : ""}`);
  warnings.push(label);
}

async function main() {
  const env = {
    enabled: process.env.NFT_DEMO_ENABLED,
    contract: process.env.NFT_DEMO_CONTRACT,
    chainId: Number(process.env.NFT_DEMO_CHAIN_ID),
    rpcUrl: process.env.NFT_DEMO_RPC_URL,
    explorer: process.env.NFT_DEMO_EXPLORER_URL,
    serviceSecret: process.env.NFT_DEMO_SERVICE_SECRET,
    openseaKey: process.env.NFT_DEMO_OPENSEA_API_KEY,
    marketplace: process.env.NFT_DEMO_MARKETPLACE_URL,
    maxSupply: process.env.NFT_DEMO_MAX_SUPPLY,
    startBlock: process.env.NFT_DEMO_START_BLOCK,
    metadataBase: process.env.NFT_METADATA_BASE, // домен, на котором живут метаданные
  };

  console.log("\n1. Переменные окружения");
  env.enabled === "1" ? ok("NFT_DEMO_ENABLED=1") : bad("NFT_DEMO_ENABLED не равен 1", "фича выключена");
  env.contract ? ok("NFT_DEMO_CONTRACT", env.contract) : bad("NFT_DEMO_CONTRACT не задан");
  Number.isFinite(env.chainId) ? ok("NFT_DEMO_CHAIN_ID", String(env.chainId)) : bad("NFT_DEMO_CHAIN_ID не задан");
  env.rpcUrl ? ok("NFT_DEMO_RPC_URL", env.rpcUrl) : bad("NFT_DEMO_RPC_URL не задан");
  // Ключ нужен только для ончейн-событий, а они отключены — отсутствие не ошибка.
  env.serviceSecret
    ? ok("NFT_DEMO_SERVICE_SECRET задан", "не используется: ончейн-события выключены")
    : ok("NFT_DEMO_SERVICE_SECRET не задан", "и не нужен — приложение не шлёт транзакций");
  env.explorer ? ok("NFT_DEMO_EXPLORER_URL", env.explorer) : warn("NFT_DEMO_EXPLORER_URL не задан", "ссылки на эксплорер не появятся");
  env.marketplace
    ? ok("NFT_DEMO_MARKETPLACE_URL", env.marketplace)
    : bad("NFT_DEMO_MARKETPLACE_URL не задан", "кнопка «Get capsules» не появится");
  env.openseaKey
    ? ok("NFT_DEMO_OPENSEA_API_KEY задан", "обновление метаданных ~3 мин")
    : warn("NFT_DEMO_OPENSEA_API_KEY не задан", "метаданные будут обновляться до получаса");
  env.maxSupply ? ok("NFT_DEMO_MAX_SUPPLY", env.maxSupply) : warn("NFT_DEMO_MAX_SUPPLY не задан", "по умолчанию 10000");
  env.startBlock
    ? ok("NFT_DEMO_START_BLOCK", env.startBlock)
    : warn("NFT_DEMO_START_BLOCK не задан", "блок деплоя будет искаться сканированием логов (медленнее)");

  if (!env.contract || !env.rpcUrl || !Number.isFinite(env.chainId)) {
    console.log("\nБез contract/RPC/chainId дальше проверять нечего.");
    process.exit(1);
  }

  console.log("\n2. Сеть и контракт");
  const provider = new JsonRpcProvider(env.rpcUrl, env.chainId);
  const network = await provider.getNetwork().catch(() => null);
  network && Number(network.chainId) === env.chainId
    ? ok("RPC отвечает, chainId совпадает", String(network.chainId))
    : bad("RPC недоступен или chainId не совпадает", network ? String(network.chainId) : "нет ответа");

  const code = await provider.getCode(env.contract).catch(() => "0x");
  code && code !== "0x" ? ok("контракт задеплоен", `${(code.length - 2) / 2} байт`) : bad("по адресу нет контракта");

  const contract = new Contract(env.contract, ABI, provider);
  const read = async (fn, ...args) => {
    try {
      return await contract[fn](...args);
    } catch {
      return null;
    }
  };

  const [name, symbol, total, maxA, maxB, owner, baseURI] = await Promise.all([
    read("name"),
    read("symbol"),
    read("totalSupply"),
    read("maxSupply"),
    read("MAX_SUPPLY"),
    read("owner"),
    read("baseURI"),
  ]);
  const max = maxA ?? maxB;
  name ? ok("коллекция", `${name} / ${symbol}`) : bad("не читается name()");
  max ? ok("supply", `${total}/${max}`) : warn("не читается maxSupply()");
  owner ? ok("владелец контракта", owner) : warn("не читается owner()");

  console.log("\n3. Метаданные");
  if (!baseURI) {
    bad("baseURI пуст", "в контракте не задан адрес метаданных");
  } else {
    ok("baseURI", baseURI);
    baseURI.endsWith("/")
      ? ok("слэш на конце есть", "у каждого токена свои метаданные")
      : bad("НЕТ слэша на конце", "SeaDrop отдаст всем токенам одну заглушку");
    /nft-demo/.test(baseURI) &&
      warn("в публичном baseURI слово «demo»", "для боевой коллекции используйте /api/nft/metadata/");
    if (env.metadataBase && !baseURI.startsWith(env.metadataBase)) {
      bad("baseURI ведёт не на ожидаемый домен", `ожидали ${env.metadataBase}`);
    }
  }

  // Живая проверка эндпоинта: то, что реально увидит маркетплейс.
  const metadataUrl = baseURI ? `${baseURI}1` : null;
  if (metadataUrl && /^https?:/.test(metadataUrl)) {
    try {
      const response = await fetch(metadataUrl, { signal: AbortSignal.timeout(15000) });
      if (response.ok) {
        const body = await response.json();
        ok("метаданные токена #1 отдаются", `name="${body.name}"`);
        const raw = JSON.stringify(body).toLowerCase();
        raw.includes("prompt") && bad("в метаданных есть prompts", "служебные данные не должны утекать");
        Array.isArray(body.attributes) && body.attributes.length
          ? ok("трейты на месте", `${body.attributes.length} шт.`)
          : warn("трейтов нет", "токен ещё пустой?");
      } else if (response.status === 404 && Number(total) === 0) {
        ok("метаданные отвечают 404", "ничего ещё не заминчено — это нормально");
      } else {
        bad(`метаданные отвечают HTTP ${response.status}`);
      }
    } catch (error) {
      bad("метаданные недоступны", error.message);
    }
  }

  console.log("\n4. Сервисный кошелёк (нужен только при включённых ончейн-событиях)");
  if (env.serviceSecret) {
    try {
      const wallet = new Wallet(env.serviceSecret, provider);
      ok("ключ валиден", wallet.address);
      const balance = await provider.getBalance(wallet.address);
      // Газ нужен только если вернём ончейн-события; сейчас они отключены.
      Number(balance) > 0
        ? ok("баланс", `${formatEther(balance)} ETH`)
        : warn("баланс 0", "сейчас ончейн-транзакции не используются, но запас лишним не будет");
      if (owner && wallet.address.toLowerCase() !== String(owner).toLowerCase()) {
        ok("сервисный ключ ≠ владелец", "правильно: компрометация env не даёт прав на коллекцию");
      } else if (owner) {
        warn("сервисный ключ совпадает с владельцем", "для боевого запуска лучше разделить");
      }
    } catch (error) {
      bad("ключ невалиден", error.shortMessage || error.message);
    }
  }

  console.log("\n5. Артефакты");
  fs.existsSync(ARTIFACT_PATH)
    ? ok("контракт скомпилирован", "scripts/nft-demo/artifacts/")
    : warn("артефактов нет", "нужны только если деплоите свой контракт");
  const placeholder = path.join(process.cwd(), "assets", "nft-demo", "placeholder.png");
  if (fs.existsSync(placeholder)) {
    const kb = Math.round(fs.statSync(placeholder).size / 1024);
    kb > 500
      ? warn("заглушка капсулы весит много", `${kb} КБ — в интерфейсе показывается 64px`)
      : ok("заглушка капсулы", `${kb} КБ`);
  } else {
    bad("нет assets/nft-demo/placeholder.png");
  }

  console.log("");
  if (problems.length) {
    console.log(`ИТОГ: ${problems.length} проблем(ы), ${warnings.length} предупреждени(я).`);
    problems.forEach((p) => console.log(`  ✗ ${p}`));
    process.exit(1);
  }
  console.log(
    warnings.length
      ? `ИТОГ: критичных проблем нет, ${warnings.length} предупреждени(я) выше.`
      : "ИТОГ: всё готово."
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
