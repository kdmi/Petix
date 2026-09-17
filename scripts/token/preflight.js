// Preflight для custodial-вывода $PETIX (feature 019): env, сеть, монета,
// раздатчик, оценка газа. Секреты НЕ печатает — только адреса, остатки и
// расчёты. Гоняется одинаково для тестовой монеты и перед боевым запуском.
//
// Запуск:  node scripts/token/preflight.js
//          node scripts/token/preflight.js --eth-usd 2550   # цена одного вывода в центах
const path = require("path");
const { Contract, JsonRpcProvider, Wallet, formatEther, formatUnits, parseUnits } = require("ethers");

require(path.join(__dirname, "../nft/load-env"));

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
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

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function isAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(String(value || "").trim());
}

async function main() {
  const env = {
    enabled: process.env.TOKEN_ENABLED,
    contract: String(process.env.TOKEN_CONTRACT || "").trim(),
    chainId: Number(process.env.TOKEN_CHAIN_ID),
    rpcUrl: String(process.env.TOKEN_RPC_URL || process.env.NFT_RPC_URL || "").trim(),
    explorer: String(process.env.TOKEN_EXPLORER_URL || process.env.NFT_EXPLORER_URL || "").trim(),
    treasurySecret: String(process.env.TOKEN_TREASURY_SECRET || "").trim(),
    decimals: process.env.TOKEN_DECIMALS,
    confirmations: process.env.TOKEN_CONFIRMATIONS,
    startBlock: process.env.TOKEN_START_BLOCK,
    internalWallets: String(process.env.TOKEN_INTERNAL_WALLETS || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
    minGasEth: Number(process.env.TOKEN_MIN_GAS_ETH || 0.001),
  };
  const ethUsd = Number(argValue("--eth-usd")) || 0;

  console.log("\n1. Переменные окружения");
  env.enabled === "1" ? ok("TOKEN_ENABLED=1") : warn("TOKEN_ENABLED не равен 1", "на сайте контур выключен");
  isAddress(env.contract) ? ok("TOKEN_CONTRACT", env.contract) : bad("TOKEN_CONTRACT не задан или не адрес");
  env.chainId ? ok("TOKEN_CHAIN_ID", String(env.chainId)) : bad("TOKEN_CHAIN_ID не задан");
  env.rpcUrl ? ok("TOKEN_RPC_URL", env.rpcUrl.replace(/\/v2\/.+$/, "/v2/***")) : bad("TOKEN_RPC_URL не задан");
  env.explorer ? ok("TOKEN_EXPLORER_URL", env.explorer) : warn("TOKEN_EXPLORER_URL не задан", "ссылок на транзакции не будет");
  let treasury = null;
  if (!env.treasurySecret) {
    bad("TOKEN_TREASURY_SECRET не задан");
  } else {
    try {
      treasury = new Wallet(env.treasurySecret);
      ok("TOKEN_TREASURY_SECRET валиден", `раздатчик ${treasury.address}`);
    } catch (error) {
      bad("TOKEN_TREASURY_SECRET не парсится как приватный ключ");
    }
  }
  const badInternal = env.internalWallets.filter((entry) => !isAddress(entry));
  if (badInternal.length) bad("TOKEN_INTERNAL_WALLETS содержит не-адреса", badInternal.join(", "));
  else if (env.internalWallets.length) ok("TOKEN_INTERNAL_WALLETS", `${env.internalWallets.length} кошельков`);
  else warn("TOKEN_INTERNAL_WALLETS пуст", "пополнения раздатчика с холодного кошелька зачтутся ему как ввод");
  if (treasury && env.internalWallets.map((w) => w.toLowerCase()).includes(treasury.address.toLowerCase())) {
    warn("раздатчик указан в TOKEN_INTERNAL_WALLETS", "не нужно — его переводы и так игнорируются");
  }
  const startBlock = Number(env.startBlock);
  Number.isFinite(startBlock) && startBlock > 0
    ? ok("TOKEN_START_BLOCK", String(startBlock))
    : warn("TOKEN_START_BLOCK не задан", "первый синк начнёт с головы цепи минус TOKEN_SYNC_MAX_BLOCKS");

  if (problems.length) {
    console.log("\nДальше без RPC не пойти — исправь ошибки выше.\n");
    process.exit(1);
  }

  console.log("\n2. Сеть");
  const provider = new JsonRpcProvider(env.rpcUrl, env.chainId);
  let latest;
  try {
    const network = await provider.getNetwork();
    Number(network.chainId) === env.chainId
      ? ok("RPC отвечает", `chainId ${network.chainId}`)
      : bad("chainId RPC не совпадает с TOKEN_CHAIN_ID", `${network.chainId} vs ${env.chainId}`);
    latest = await provider.getBlockNumber();
    ok("Последний блок", String(latest));
    if (Number.isFinite(startBlock) && startBlock > latest) bad("TOKEN_START_BLOCK больше головы цепи");
  } catch (error) {
    bad("RPC недоступен", error.shortMessage || error.message);
    process.exit(1);
  }

  console.log("\n3. Монета");
  const token = new Contract(env.contract, ERC20_ABI, provider);
  let decimals = 18;
  try {
    const [name, symbol, dec, supply] = await Promise.all([
      token.name().catch(() => "?"),
      token.symbol().catch(() => "?"),
      token.decimals(),
      token.totalSupply().catch(() => null),
    ]);
    decimals = Number(dec);
    ok("Контракт монеты читается", `${name} (${symbol}), decimals ${decimals}`);
    if (env.decimals && Number(env.decimals) !== decimals) {
      bad("TOKEN_DECIMALS не совпадает с контрактом", `${env.decimals} vs ${decimals}`);
    }
    if (supply != null) ok("Общий саплай", `${formatUnits(supply, decimals)} ${symbol}`);
  } catch (error) {
    bad("Не удалось прочитать ERC-20 по TOKEN_CONTRACT", error.shortMessage || error.message);
    process.exit(1);
  }

  console.log("\n4. Раздатчик");
  const signer = treasury.connect(provider);
  const [tokensRaw, ethWei, nonceLatest, noncePending] = await Promise.all([
    token.balanceOf(treasury.address),
    provider.getBalance(treasury.address),
    provider.getTransactionCount(treasury.address, "latest"),
    provider.getTransactionCount(treasury.address, "pending"),
  ]);
  const tokens = formatUnits(tokensRaw, decimals);
  const eth = Number(formatEther(ethWei));
  Number(tokens) > 0 ? ok("Монет на раздатчике", tokens) : bad("На раздатчике нет монет");
  eth >= env.minGasEth ? ok("ETH на комиссии", `${eth}`) : bad("ETH ниже TOKEN_MIN_GAS_ETH", `${eth} < ${env.minGasEth}`);
  nonceLatest === noncePending
    ? ok("Nonce", `${nonceLatest} (очередь пуста)`)
    : warn("Есть неподтверждённые транзакции раздатчика", `latest ${nonceLatest}, pending ${noncePending}`);

  console.log("\n5. Оценка одного вывода");
  try {
    const amount = parseUnits("1", decimals);
    const gas = await token.connect(signer).transfer.estimateGas(treasury.address, amount);
    const feeData = await provider.getFeeData();
    const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 0n;
    const costWei = gas * gasPrice;
    const costEth = Number(formatEther(costWei));
    ok("estimateGas transfer()", `${gas} газа × ${formatUnits(gasPrice, "gwei")} gwei = ${costEth.toFixed(9)} ETH`);
    if (ethUsd > 0) {
      const cents = costEth * ethUsd * 100;
      ok("Стоимость одного вывода", `≈ ${cents.toFixed(3)} ¢ при ETH=$${ethUsd}`);
      cents <= 1 ? ok("Укладывается в SC-005 (≤ 1 ¢)") : warn("Дороже 1 ¢ за вывод", "SC-005 под вопросом");
    }
    if (costEth > 0) ok("Переводов хватит на", `≈ ${Math.floor(eth / costEth)} выводов при текущем ETH`);
  } catch (error) {
    bad("estimateGas упал", error.shortMessage || error.message);
  }

  console.log("\n" + "=".repeat(60));
  if (problems.length) {
    console.log(`Проблем: ${problems.length}. Предупреждений: ${warnings.length}.`);
    process.exit(1);
  }
  console.log(`Готово. Предупреждений: ${warnings.length}.`);
}

main().catch((error) => {
  console.error("preflight упал:", error.shortMessage || error.message);
  process.exit(1);
});
