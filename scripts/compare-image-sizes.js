// Control run for feature 021: render the same pet prompts at two image sizes
// and lay them out side by side so a human can judge cube-shape compliance.
//
//   node scripts/compare-image-sizes.js --source=prod --limit=30 --sizes=512,1K --out=specs/021-pet-image-512px/control-run
//   node scripts/compare-image-sizes.js --summarize --out=specs/021-pet-image-512px/control-run
//
// --source=prod reads the newest characters from the production admin API with
// the internal header (same mechanism as api/_lib/character-proxy.js); needs
// CHARACTER_API_BASE_URL, INTERNAL_API_SECRET and ADMIN_WALLETS in .env.local.
// --source=local reads .data/local-dev/characters.json instead.
//
// Rendering goes through the real requestGeminiImage() so the request body is
// exactly what production sends; the size is switched per call via
// GEMINI_IMAGE_SIZE (read synchronously when the body is built). Output images
// are gitignored; results.csv (with a manual `shapeOk` column), summary.json
// and the markdown report are what gets committed.

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function loadEnvFiles() {
  for (const file of [".env.local", ".env"]) {
    let contents = "";
    try {
      contents = fs.readFileSync(path.join(ROOT, file), "utf8");
    } catch (_error) {
      continue;
    }
    for (const line of contents.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || match[1] in process.env) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function parseArgs(argv) {
  const args = {
    source: "prod",
    limit: 30,
    sizes: ["512", "1K"],
    out: path.join("specs", "021-pet-image-512px", "control-run"),
    concurrency: 3,
    summarize: false,
  };
  for (const raw of argv) {
    let m;
    if ((m = raw.match(/^--source=(prod|local)$/))) args.source = m[1];
    else if ((m = raw.match(/^--limit=(\d+)$/))) args.limit = Number(m[1]);
    else if ((m = raw.match(/^--sizes=(.+)$/))) args.sizes = m[1].split(",").map((s) => s.trim()).filter(Boolean);
    else if ((m = raw.match(/^--out=(.+)$/))) args.out = m[1];
    else if ((m = raw.match(/^--concurrency=(\d+)$/))) args.concurrency = Math.max(1, Number(m[1]));
    else if (raw === "--summarize") args.summarize = true;
    else throw new Error(`Unknown argument: ${raw}`);
  }
  return args;
}

const slug = (s) => String(s || "pet").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "pet";

function jpegDimensions(buffer) {
  let i = 2;
  while (i < buffer.length) {
    if (buffer[i] !== 0xff) break;
    const marker = buffer[i + 1];
    const length = buffer.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { width: buffer.readUInt16BE(i + 7), height: buffer.readUInt16BE(i + 5) };
    }
    i += 2 + length;
  }
  return { width: 0, height: 0 };
}

async function loadProdCharacters(limit) {
  const base = String(process.env.CHARACTER_API_BASE_URL || "").replace(/\/+$/, "");
  const secret = process.env.INTERNAL_API_SECRET;
  const wallet = String(process.env.ADMIN_WALLETS || process.env.ADMIN_WALLET || "").split(",")[0].trim();
  if (!base || !secret || !wallet) {
    throw new Error("--source=prod needs CHARACTER_API_BASE_URL, INTERNAL_API_SECRET and ADMIN_WALLETS.");
  }
  const response = await fetch(`${base}/api/admin/characters`, {
    headers: {
      "x-petix-internal-secret": secret,
      "x-petix-wallet": wallet,
      "x-petix-wallet-name": "control-run",
      "x-petix-wallet-type": "internal",
    },
  });
  if (!response.ok) {
    throw new Error(`admin/characters → HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const { characters } = await response.json();
  return characters
    .filter((c) => c.prompts?.image && c.imageUrl)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit)
    .map((c) => ({
      id: c.id,
      name: c.name || c.displayName || c.id,
      creatureType: c.creatureType,
      rarity: c.rarity,
      createdAt: c.createdAt,
      prompt: c.prompts.image,
      imageUrl: c.imageUrl.startsWith("http") ? c.imageUrl : `${base}${c.imageUrl}`,
    }));
}

function loadLocalCharacters(limit) {
  const db = JSON.parse(fs.readFileSync(path.join(ROOT, ".data", "local-dev", "characters.json"), "utf8"));
  const records = Array.isArray(db.records) ? db.records : Object.values(db.records || {});
  const all = [];
  for (const profile of records) {
    for (const c of profile.characters || []) {
      if (!c.prompts?.image) continue;
      all.push({
        id: c.id,
        name: c.name || c.displayName || c.id,
        creatureType: c.creatureType,
        rarity: c.rarity,
        createdAt: c.createdAt,
        prompt: c.prompts.image,
        imageUrl: c.image?.filePath ? `file://${c.image.filePath}` : null,
      });
    }
  }
  return all.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, limit);
}

async function downloadOriginal(pet, outDir) {
  if (!pet.imageUrl) return null;
  const file = path.join(outDir, `${slug(pet.name)}__orig.jpg`);
  if (pet.imageUrl.startsWith("file://")) {
    fs.copyFileSync(pet.imageUrl.slice(7), file);
    return file;
  }
  const response = await fetch(pet.imageUrl);
  if (!response.ok) return null;
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

async function runPool(items, concurrency, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index++];
      await worker(current);
    }
  });
  await Promise.all(runners);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function parseCsv(text) {
  const [header, ...lines] = text.replace(/\r\n?/g, "\n").trim().split("\n");
  const keys = header.split(",");
  return lines.filter(Boolean).map((line) => {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = !quoted;
      } else if (ch === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else cell += ch;
    }
    cells.push(cell);
    return Object.fromEntries(keys.map((key, i) => [key, cells[i] ?? ""]));
  });
}

function summarize(outDir) {
  const rows = parseCsv(fs.readFileSync(path.join(outDir, "results.csv"), "utf8"));
  const bySize = {};
  for (const row of rows) {
    const bucket = (bySize[row.size] ||= { images: 0, ms: [], outTokens: [], marked: 0, shapeBroken: 0 });
    bucket.images += 1;
    if (row.ms) bucket.ms.push(Number(row.ms));
    if (row.outTokens) bucket.outTokens.push(Number(row.outTokens));
    if (row.shapeOk === "0" || row.shapeOk === "1") {
      bucket.marked += 1;
      if (row.shapeOk === "0") bucket.shapeBroken += 1;
    }
  }
  const avg = (list) => (list.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null);
  const summary = {};
  for (const [size, b] of Object.entries(bySize)) {
    summary[size] = {
      images: b.images,
      avgMs: avg(b.ms),
      avgOutTokens: avg(b.outTokens),
      marked: b.marked,
      shapeBroken: b.shapeBroken,
      shapeBrokenShare: b.marked ? Number((b.shapeBroken / b.marked).toFixed(3)) : null,
    };
  }
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log("\nsize   images  avg ms  avg out-tokens  marked  shape broken  share");
  for (const [size, s] of Object.entries(summary)) {
    console.log(
      `${size.padEnd(6)} ${String(s.images).padEnd(7)} ${String(s.avgMs ?? "-").padEnd(7)} ${String(s.avgOutTokens ?? "-").padEnd(15)} ${String(s.marked).padEnd(7)} ${String(s.shapeBroken).padEnd(13)} ${s.shapeBrokenShare == null ? "-" : `${Math.round(s.shapeBrokenShare * 100)}%`}`
    );
  }
  return summary;
}

function buildHtml(outDir, pets, sizes, results) {
  const dataUri = (file) => `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`;
  const figure = (title, file, meta) => {
    if (!file || !fs.existsSync(file)) {
      return `<figure><figcaption><b>${title}</b><span>no image</span></figcaption></figure>`;
    }
    const { width, height } = jpegDimensions(fs.readFileSync(file));
    const src = dataUri(file);
    return `<figure><figcaption><b>${title}</b><span>${width}×${height} · ${(fs.statSync(file).size / 1024).toFixed(0)} KB${meta ? " · " + meta : ""}</span></figcaption><img class="fit" src="${src}"><div class="crop"><img src="${src}"></div></figure>`;
  };
  const rows = pets
    .map((pet) => {
      const own = results.filter((r) => r.id === pet.id);
      const cells = [figure("prod", pet.origFile, "")].concat(
        sizes.map((size) => {
          const r = own.find((x) => x.size === size);
          return figure(size, r?.file, r ? `${r.ms} ms · ${r.outTokens} tok` : r?.error || "");
        })
      );
      return `<section><h2>${pet.name} <small>${pet.creatureType || ""} · ${pet.rarity || ""} · ${pet.id}</small></h2><div class="row">${cells.join("")}</div><details><summary>prompt</summary><pre>${pet.prompt.replace(/[<&]/g, (c) => ({ "<": "&lt;", "&": "&amp;" })[c])}</pre></details></section>`;
    })
    .join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Control run: ${sizes.join(" vs ")}</title><style>
:root{--bg:#f6f3ee;--fg:#1c1b1a;--muted:#6b665e;--card:#fff;--line:#e3ded6}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]){--bg:#15161a;--fg:#ececec;--muted:#9a9a9a;--card:#1f2026;--line:#2c2d34}}
body{margin:0;padding:24px 16px;background:var(--bg);color:var(--fg);font:15px/1.4 -apple-system,Inter,system-ui,sans-serif}
h1{font-size:20px;margin:0 0 16px}h2{font-size:16px;margin:28px 0 10px}h2 small{color:var(--muted);font-weight:400;margin-left:8px;font-size:12px}
.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
figure{margin:0;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px}
figcaption{display:flex;flex-direction:column;gap:2px}figcaption span{color:var(--muted);font-size:12px}
img.fit{width:100%;aspect-ratio:1;object-fit:contain;border-radius:8px;background:#fff}
.crop{width:100%;aspect-ratio:1;overflow:hidden;border-radius:8px;border:1px dashed var(--line);position:relative}
.crop img{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);max-width:none}
details{margin-top:8px;color:var(--muted);font-size:12px}pre{white-space:pre-wrap}
</style></head><body><h1>Control run: prod vs ${sizes.join(" vs ")} — ${pets.length} prompts</h1>${rows}</body></html>`;
  fs.writeFileSync(path.join(outDir, "compare.html"), html);
}

async function main() {
  loadEnvFiles();
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(ROOT, args.out);
  fs.mkdirSync(outDir, { recursive: true });

  if (args.summarize) {
    summarize(outDir);
    return;
  }

  // Force the live path regardless of NODE_ENV so requestGeminiImage() talks to Gemini.
  process.env.ENABLE_LIVE_CHARACTER_GENERATION = "true";
  const { loadShapeReferenceImage, requestGeminiImage, getImageExtension } = require("../api/_lib/character");

  const pets = args.source === "prod" ? await loadProdCharacters(args.limit) : loadLocalCharacters(args.limit);
  if (!pets.length) throw new Error("No characters with stored image prompts found.");
  console.log(`source=${args.source} pets=${pets.length} sizes=${args.sizes.join(",")} model=${process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image"}`);

  const referenceImage = await loadShapeReferenceImage();
  if (!referenceImage) console.warn("shape reference image missing — prompts run text-only");

  for (const pet of pets) pet.origFile = await downloadOriginal(pet, outDir);
  fs.writeFileSync(path.join(outDir, "pets.json"), JSON.stringify(pets, null, 1));

  const jobs = [];
  for (const pet of pets) for (const size of args.sizes) jobs.push({ pet, size });
  const results = [];

  await runPool(jobs, args.concurrency, async ({ pet, size }) => {
    const startedAt = Date.now();
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        // Set the size right before the call: the request body (and the size) is
        // built synchronously before the first await inside requestGeminiImage.
        process.env.GEMINI_IMAGE_SIZE = size;
        const image = await requestGeminiImage(pet.prompt, referenceImage);
        if (!image?.base64) throw new Error("response carried no image");
        const buffer = Buffer.from(image.base64, "base64");
        const file = path.join(outDir, `${slug(pet.name)}__${size}.${getImageExtension(image.mimeType)}`);
        fs.writeFileSync(file, buffer);
        const { width, height } = jpegDimensions(buffer);
        const ms = Date.now() - startedAt;
        results.push({ id: pet.id, name: pet.name, size, file, ms, outTokens: "", width, height, shapeOk: "" });
        console.log(`OK   ${pet.name.padEnd(24)} ${size.padEnd(4)} ${width}×${height} ${ms} ms`);
        return;
      } catch (error) {
        lastError = error;
        console.log(`RETRY ${pet.name} ${size} (${attempt}): ${error.message.slice(0, 120)}`);
      }
    }
    results.push({ id: pet.id, name: pet.name, size, file: "", ms: "", outTokens: "", width: 0, height: 0, shapeOk: "", error: lastError?.message });
    console.log(`FAIL ${pet.name} ${size}: ${lastError?.message.slice(0, 160)}`);
  });

  const header = "id,name,size,file,ms,outTokens,width,height,shapeOk";
  const lines = results
    .sort((a, b) => a.name.localeCompare(b.name) || a.size.localeCompare(b.size))
    .map((r) => [r.id, r.name, r.size, r.file ? path.basename(r.file) : "", r.ms, r.outTokens, r.width, r.height, r.shapeOk].map(csvEscape).join(","));
  fs.writeFileSync(path.join(outDir, "results.csv"), [header, ...lines].join("\n") + "\n");
  buildHtml(outDir, pets, args.sizes, results);
  summarize(outDir);
  console.log(`\nwrote ${path.relative(ROOT, outDir)}/{compare.html,results.csv,summary.json}. Mark shapeOk (1/0) in results.csv, then re-run with --summarize.`);
}

main().catch((error) => {
  console.error("ERROR", error.message);
  process.exit(1);
});
