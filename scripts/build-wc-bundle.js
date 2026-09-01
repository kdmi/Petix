// Builds the self-hosted WalletConnect bundle used by the wallet picker.
// Output: assets/vendor/wc-ethereum-provider.min.js (loaded lazily on the
// first WalletConnect click — see loadWalletConnectBundle in app.js).
// Rebuild after bumping the @walletconnect/ethereum-provider devDependency:
//   node scripts/build-wc-bundle.js
const path = require("path");
const esbuild = require("esbuild");

const fs = require("fs");
const pkg = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "node_modules", "@walletconnect", "ethereum-provider", "package.json"),
    "utf8"
  )
);

esbuild
  .build({
    stdin: {
      contents: 'module.exports = require("@walletconnect/ethereum-provider");',
      resolveDir: __dirname,
      loader: "js",
    },
    bundle: true,
    minify: true,
    format: "iife",
    globalName: "WalletConnectEthereumProvider",
    platform: "browser",
    target: ["es2020"],
    outfile: path.join(__dirname, "..", "assets", "vendor", "wc-ethereum-provider.min.js"),
    banner: {
      js: `/* @walletconnect/ethereum-provider v${pkg.version} — self-contained IIFE build (scripts/build-wc-bundle.js) */`,
    },
    define: {
      "process.env.NODE_ENV": '"production"',
      global: "globalThis",
    },
    logLevel: "info",
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
