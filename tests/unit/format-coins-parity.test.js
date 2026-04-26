const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { formatCoins: backendFormatCoins } = require("../../api/_lib/currency");

function extractFrontendFormatCoins() {
  const appJsPath = path.resolve(__dirname, "../../pet-creation/app.js");
  const source = fs.readFileSync(appJsPath, "utf8");
  const regex = /\/\/ BEGIN format-coins-mirror\s*([\s\S]*?)\s*\/\/ END format-coins-mirror/;
  const match = source.match(regex);
  if (!match) {
    throw new Error(
      "format-coins-mirror sentinel comments not found in pet-creation/app.js — parity test cannot run."
    );
  }
  const body = match[1];
  const sandbox = { POINTS_FORMAT_ABBREV_THRESHOLD: 10000 };
  const factory = new Function(
    "POINTS_FORMAT_ABBREV_THRESHOLD",
    `${body}\nreturn formatCoins;`
  );
  return factory(sandbox.POINTS_FORMAT_ABBREV_THRESHOLD);
}

const FIXTURES = [
  0,
  1,
  9999,
  10000,
  10499,
  12345,
  99999,
  100000,
  500000,
  999999,
  1000000,
  1200000,
  12345678,
  999999999,
  1000000000,
  3200000000,
  9999999999,
];

test("frontend format-coins-mirror block exists and is parseable", () => {
  const frontend = extractFrontendFormatCoins();
  assert.equal(typeof frontend, "function");
});

test("frontend and backend formatCoins produce identical output on every fixture", () => {
  const frontend = extractFrontendFormatCoins();
  for (const value of FIXTURES) {
    const backendOut = backendFormatCoins(value);
    const frontendOut = frontend(value);
    assert.equal(
      frontendOut,
      backendOut,
      `formatCoins(${value}) drift: backend="${backendOut}" frontend="${frontendOut}"`
    );
  }
});

test("frontend formatCoins defends against negative / NaN / string input (same as backend)", () => {
  const frontend = extractFrontendFormatCoins();
  assert.equal(frontend(-100), backendFormatCoins(-100));
  assert.equal(frontend(NaN), backendFormatCoins(NaN));
  assert.equal(frontend("abc"), backendFormatCoins("abc"));
  assert.equal(frontend(null), backendFormatCoins(null));
  assert.equal(frontend(undefined), backendFormatCoins(undefined));
});
