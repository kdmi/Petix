const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const CSS = fs.readFileSync(path.resolve(__dirname, "../../pet-creation/styles.css"), "utf8");

function ruleBody(selector, from = 0) {
  const start = CSS.indexOf(`${selector} {`, from);
  assert.notEqual(start, -1, `не найдено правило ${selector}`);
  return CSS.slice(start, CSS.indexOf("}", start));
}

// Жалоба игрока 2026-10-18: на телефоне бургер-меню открывалось пустым белым
// прямоугольником. Пункты меню — кнопки, то есть инлайновые элементы, поэтому
// при `width: max-content` браузер мерил их в одну строку: меню выходило 584px
// на экране 375px и уезжало левым краем за экран. Колонка убирает причину,
// max-width — страховка.

test("меню раскладывается колонкой, иначе max-content меряет пункты в строку", () => {
  const base = ruleBody(".wallet-menu");
  assert.match(base, /display:\s*flex/);
  assert.match(base, /flex-direction:\s*column/);
});

test("на мобилке меню не шире экрана", () => {
  const mobile = ruleBody(".wallet-menu", CSS.indexOf("@media"));
  assert.match(mobile, /max-width:\s*calc\(100vw - 32px\)/);
  assert.match(mobile, /right:\s*16px/);
});
