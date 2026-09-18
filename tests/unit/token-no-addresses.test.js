const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// Feature 019 (FR-016): no token / treasury / wallet address of the token
// launch may ever land in the repository. Everything lives in env. This test
// walks the tracked source tree and fails on any 0x-address that is not an
// explicitly explained fixture or a pre-existing public constant.

const ROOT = path.resolve(__dirname, "../..");
const SKIP_DIRS = new Set([
  "node_modules",
  ".data",
  ".git",
  ".playwright-mcp",
  ".claude",
  ".vercel",
  ".vercel.bak",
  ".specify",
  ".tools",
  ".npm-cache",
  ".plea",
  "artifacts", // compiled contract artifacts (gitignored) embed bytecode-looking words
  "vendor", // third-party bundles
]);
const EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".json", ".md", ".html", ".css", ".sol", ".txt", ".yml", ".yaml"]);
const ADDRESS = /0x[0-9a-fA-F]{40}/g;

// A fixture address is one hex character repeated 40 times (evmWallet(seed)).
const FIXTURE = /^0x([0-9a-fA-F])\1{39}$/;

// Pre-existing public constants, each with the reason it is allowed to exist.
const ALLOWLIST = new Map([
  // The project's public admin wallet — documented in CLAUDE.md/README long before 019.
  ["0x0e8caf9eca5e45df0e6f50f58a5bf664db1740c1", "public admin wallet (pre-019 docs and admin allowlist)"],
  // Feature 016 demo NFT collection on Robinhood Chain — a throwaway public demo, not a token address.
  ["0x79093bb689264b05d9ed246d10f5fac3b679f4a3", "016 demo SLOT BOX collection (public demo, retired)"],
  ["0xdc3a8fa4774df5190341ac440ffe8bc697cdd6b3", "016 demo results (public demo, retired)"],
  // The launched $PETIX token contract — public by definition (landing header copies it). Wallets and keys stay in env.
  ["0xb79ec3cdffefe0ec6c806d715e4082d6be4dbf55", "public $PETIX token contract on Robinhood Chain (launched 2026-09-18)"],
]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name))) out.push(path.join(dir, entry.name));
  }
  return out;
}

test("no token/treasury/wallet addresses are committed to the repository", () => {
  const offenders = [];
  for (const file of walk(ROOT, [])) {
    const text = fs.readFileSync(file, "utf8");
    const lines = text.split("\n");
    lines.forEach((line, index) => {
      for (const match of line.match(ADDRESS) || []) {
        const address = match.toLowerCase();
        if (FIXTURE.test(match)) continue;
        if (ALLOWLIST.has(address)) continue;
        offenders.push(`${path.relative(ROOT, file)}:${index + 1} ${match}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `Unexpected 0x addresses in the repo (move them to env or explain them in ALLOWLIST):\n${offenders.join("\n")}`
  );
});
