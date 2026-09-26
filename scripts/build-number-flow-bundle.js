// Builds the self-hosted NumberFlow bundle used by the transparency page.
// Output: assets/vendor/number-flow.min.mjs (imported lazily — see the
// upgradeBigNumbers() call in transparency/index.html).
// The published dist is split across modules and pulls in `esm-env`, so it
// cannot be served straight from the package; this flattens it into one file.
// Rebuild after bumping the number-flow devDependency:
//   node scripts/build-number-flow-bundle.js
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const pkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "node_modules", "number-flow", "package.json"), "utf8")
);

esbuild
  .build({
    stdin: {
      contents: 'import "number-flow";',
      resolveDir: path.join(__dirname, ".."),
      loader: "js",
    },
    bundle: true,
    minify: true,
    format: "esm",
    platform: "browser",
    target: ["es2020"],
    outfile: path.join(__dirname, "..", "assets", "vendor", "number-flow.min.mjs"),
    banner: {
      js: `/* number-flow v${pkg.version} (MIT, https://number-flow.barvian.me) — self-contained ESM build (scripts/build-number-flow-bundle.js) */`,
    },
    logLevel: "info",
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
