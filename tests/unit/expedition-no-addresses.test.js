const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

// No wallet or contract address may ever be committed with the expeditions code:
// partner collections, Seaport, the trophy contract and the minter all come from
// runtime config / env (plan 026 FR-018).
const ROOT = path.resolve(__dirname, "../..");
const SCAN = ["api/_lib/expeditions-config.js", "api/_lib/expeditions.js", "api/_lib/expedition-nft.js", "api/_lib/expedition-collections.js", "api/expeditions", "server-routes/expeditions", "server-routes/admin/expedition-stats.js", "server-routes/admin/expedition-boss.js", "server-routes/admin/energy-grant.js", "server-routes/admin/capsule-airdrop.js", "assets/expeditions/engine.js", "contracts/ExpeditionTrophies.sol", "scripts/expeditions"];
const ADDRESS = /0x[0-9a-fA-F]{40}/g;
const ALLOWED = new Set([`0x${"0".repeat(40)}`]);

function walk(target, out) {
  if (!fs.existsSync(target)) return;
  const stat = fs.statSync(target);
  if (stat.isDirectory()) {
    if (path.basename(target) === "artifacts") return; // compiled bytecode (gitignored) is not an address
    for (const entry of fs.readdirSync(target)) walk(path.join(target, entry), out);
  } else if (/\.(js|sol|json|html|css)$/.test(target)) {
    out.push(target);
  }
}

test("expedition sources contain no 0x addresses", () => {
  const files = [];
  for (const rel of SCAN) walk(path.join(ROOT, rel), files);
  assert.ok(files.length > 0);
  const offenders = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.match(ADDRESS) || []) {
      if (!ALLOWED.has(match.toLowerCase())) offenders.push(`${path.relative(ROOT, file)}: ${match}`);
    }
  }
  assert.deepEqual(offenders, []);
});
