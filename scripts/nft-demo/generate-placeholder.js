// Generates assets/nft-demo/placeholder.png — the neutral "empty slot" image
// (1024×1024, dark ground, ring + plus glyph). No external deps: raw RGB
// scanlines deflated with zlib and wrapped into a minimal PNG by hand.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const SIZE = 1024;
const OUT_PATH = path.resolve(__dirname, "../../assets/nft-demo/placeholder.png");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

const top = [0x17, 0x19, 0x21];
const bottom = [0x24, 0x28, 0x36];
const line = [0x8d, 0x93, 0xa6];

const center = SIZE / 2;
const ringRadius = 300;
const ringWidth = 14;
const plusArm = 150;
const plusThickness = 22;

const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
for (let y = 0; y < SIZE; y += 1) {
  const rowStart = y * (SIZE * 3 + 1);
  raw[rowStart] = 0; // filter: None
  const t = y / (SIZE - 1);
  const bg = [mix(top[0], bottom[0], t), mix(top[1], bottom[1], t), mix(top[2], bottom[2], t)];

  for (let x = 0; x < SIZE; x += 1) {
    const dx = x - center;
    const dy = y - center;
    const distance = Math.sqrt(dx * dx + dy * dy);

    let color = bg;
    const onRing = Math.abs(distance - ringRadius) <= ringWidth / 2;
    const onPlus =
      (Math.abs(dx) <= plusThickness / 2 && Math.abs(dy) <= plusArm) ||
      (Math.abs(dy) <= plusThickness / 2 && Math.abs(dx) <= plusArm);
    if (onRing || onPlus) {
      color = line;
    }

    const offset = rowStart + 1 + x * 3;
    raw[offset] = color[0];
    raw[offset + 1] = color[1];
    raw[offset + 2] = color[2];
  }
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // color type: truecolor
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, png);
console.log(`Wrote ${OUT_PATH} (${png.length} bytes)`);
