// Compiles contracts/DemoSlots.sol with solc-js (no Hardhat/Foundry), resolving
// @openzeppelin/contracts imports from node_modules. Writes the ABI, bytecode
// and the standard-json input (for Blockscout source verification) into
// scripts/nft-demo/artifacts/.
const fs = require("fs");
const path = require("path");
const solc = require("solc");

const ROOT = path.resolve(__dirname, "../..");
const CONTRACT_PATH = path.join(ROOT, "contracts", "DemoSlots.sol");
const ARTIFACTS_DIR = path.join(__dirname, "artifacts");

function findImport(importPath) {
  const candidates = importPath.startsWith("@")
    ? [path.join(ROOT, "node_modules", importPath)]
    : [path.resolve(path.dirname(CONTRACT_PATH), importPath)];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { contents: fs.readFileSync(candidate, "utf8") };
    }
  }
  return { error: `Import not found: ${importPath}` };
}

const input = {
  language: "Solidity",
  sources: {
    "contracts/DemoSlots.sol": { content: fs.readFileSync(CONTRACT_PATH, "utf8") },
  },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode.object", "metadata"] },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

const errors = (output.errors || []).filter((entry) => entry.severity === "error");
const warnings = (output.errors || []).filter((entry) => entry.severity !== "error");
warnings.forEach((entry) => console.warn(entry.formattedMessage));
if (errors.length) {
  errors.forEach((entry) => console.error(entry.formattedMessage));
  process.exit(1);
}

const contract = output.contracts["contracts/DemoSlots.sol"].DemoSlots;
if (!contract) {
  console.error("DemoSlots not found in compiler output.");
  process.exit(1);
}

// Blockscout "standard JSON input" verification needs the exact sources fed to
// the compiler — collect every import solc resolved through findImport.
const verificationSources = { "contracts/DemoSlots.sol": input.sources["contracts/DemoSlots.sol"] };
const seen = new Set(Object.keys(verificationSources));
const queue = [...(fs.readFileSync(CONTRACT_PATH, "utf8").match(/import\s.*?"([^"]+)";/g) || [])];
function collectImports(sourcePath, contents) {
  const matches = contents.match(/import\s.*?"([^"]+)";/g) || [];
  for (const statement of matches) {
    const importPath = statement.match(/"([^"]+)"/)[1];
    const resolved = importPath.startsWith("@")
      ? importPath
      : path
          .join(path.dirname(sourcePath), importPath)
          .split(path.sep)
          .join("/");
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    const loaded = findImport(resolved);
    if (loaded.error) {
      console.error(loaded.error);
      process.exit(1);
    }
    verificationSources[resolved] = { content: loaded.contents };
    collectImports(resolved, loaded.contents);
  }
}
void queue;
collectImports("contracts/DemoSlots.sol", input.sources["contracts/DemoSlots.sol"].content);

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
fs.writeFileSync(
  path.join(ARTIFACTS_DIR, "DemoSlots.json"),
  JSON.stringify(
    {
      contractName: "DemoSlots",
      solcVersion: solc.version(),
      abi: contract.abi,
      bytecode: `0x${contract.evm.bytecode.object}`,
    },
    null,
    2
  )
);
fs.writeFileSync(
  path.join(ARTIFACTS_DIR, "DemoSlots.standard-input.json"),
  JSON.stringify({ ...input, sources: verificationSources }, null, 2)
);

console.log(`Compiled DemoSlots with solc ${solc.version()}`);
console.log(`  abi+bytecode → ${path.join(ARTIFACTS_DIR, "DemoSlots.json")}`);
console.log(`  verification input → ${path.join(ARTIFACTS_DIR, "DemoSlots.standard-input.json")}`);
