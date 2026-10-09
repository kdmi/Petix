#!/usr/bin/env node
// Static metadata for the THROWAWAY test collection (026, quiet test on prod).
// The test contract must not point at petix.fun anywhere, so its tokenURI base
// is a neutral host (IPFS folder) with files generated here from test images the
// owner provides. Files are written WITHOUT an extension because ERC721.tokenURI
// is `baseURI + tokenId` and contractURI is `baseURI + "collection"`.
//
//   node scripts/expeditions/test-metadata.js --images ./test-art --image-base ipfs://<CID of test-art>/ \
//        --count 30 --name "Quiet trophies" --out scripts/expeditions/artifacts/test-metadata
//
// Then upload the output folder to Pinata (folder upload) and deploy with
// EXPEDITION_NFT_BASE_URI=ipfs://<CID of the folder>/ (trailing slash).
const fs = require("fs");
const path = require("path");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const imagesDir = arg("images", "");
const imageBase = String(arg("image-base", "")).replace(/\/?$/, "/");
const count = Math.max(1, Number(arg("count", 30)) || 30);
const name = arg("name", "Quiet trophies");
const out = arg("out", path.join(__dirname, "artifacts", "test-metadata"));

if (!imagesDir || !fs.existsSync(imagesDir)) throw new Error("--images <dir with test pictures> is required");
if (!/^(ipfs:\/\/|https?:\/\/)/.test(imageBase)) throw new Error("--image-base must be ipfs://<CID>/ or https://…/");
const images = fs.readdirSync(imagesDir).filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f)).sort();
if (!images.length) throw new Error(`no images in ${imagesDir}`);

fs.mkdirSync(out, { recursive: true });
for (let id = 1; id <= count; id += 1) {
  const image = images[(id - 1) % images.length];
  const meta = { name: `${name} #${id}`, description: `${name}, test collection.`, image: imageBase + image, attributes: [] };
  fs.writeFileSync(path.join(out, String(id)), JSON.stringify(meta, null, 2));
}
fs.writeFileSync(path.join(out, "collection"), JSON.stringify({ name, description: `${name}, test collection.`, image: imageBase + images[0] }, null, 2));
const text = fs.readdirSync(out).map((f) => fs.readFileSync(path.join(out, f), "utf8")).join("\n");
if (/petix/i.test(text)) throw new Error("test metadata mentions Petix — pick neutral names and image paths");
console.log(`${count} token files + collection → ${out} (images: ${images.length} from ${imagesDir}, base ${imageBase})`);
console.log("Next: upload the folder to Pinata, then deploy with EXPEDITION_NFT_BASE_URI=ipfs://<folder CID>/");
