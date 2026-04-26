const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const APP_JS_PATH = path.resolve(__dirname, "../../pet-creation/app.js");

function extractResultLayerMarkup() {
  const source = fs.readFileSync(APP_JS_PATH, "utf8");
  const begin = source.indexOf("// BEGIN result-layer-markup");
  const end = source.indexOf("// END result-layer-markup");
  assert.ok(
    begin !== -1 && end !== -1 && end > begin,
    "Sentinel comments // BEGIN result-layer-markup / // END result-layer-markup must wrap buildArenaBattleResultLayerMarkup template literal"
  );
  return source.slice(begin, end);
}

test("result-layer markup contains the new .arena-live-result-cta block", () => {
  const markup = extractResultLayerMarkup();
  assert.ok(
    markup.includes("arena-live-result-cta"),
    "expected .arena-live-result-cta container in result-layer markup"
  );
  assert.ok(
    markup.includes("arena-live-result-cta-amount"),
    "expected .arena-live-result-cta-amount span in result-layer markup"
  );
  assert.ok(
    markup.includes("arena-live-result-cta-icon"),
    "expected .arena-live-result-cta-icon img in result-layer markup"
  );
  assert.ok(
    markup.includes("/assets/dashboard/points-coin.svg"),
    "expected reward block to reference points-coin.svg asset"
  );
});

test("result-layer markup no longer contains the legacy .arena-live-result-points element", () => {
  const markup = extractResultLayerMarkup();
  assert.ok(
    !markup.includes("arena-live-result-points--winner"),
    "legacy .arena-live-result-points--winner element must be removed (FR-004)"
  );
  assert.ok(
    !markup.includes("arena-live-result-points-text"),
    "legacy .arena-live-result-points-text span must be removed (FR-004)"
  );
});
