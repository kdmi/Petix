// Re-renders every stored character image with the current image prompt.
//
// Character records keep `creatureType` + `variables`, so the prompt is rebuilt
// from scratch and each pet keeps its own identity — only the art style changes.
//
//   node scripts/regenerate-character-images.js --dry-run
//   node scripts/regenerate-character-images.js --limit=1
//   node scripts/regenerate-character-images.js
//
// Blob images are served to players by direct URL with a one-year cache, so a
// new image must never reuse the old pathname. Each render is stored under a
// content-addressed name. The previous image is kept by default so a bad batch
// can be rolled back from a database backup; pass --prune-old once the new art
// is confirmed good.

const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const {
  buildImagePrompt,
  createPromptContext,
  getImageExtension,
  loadShapeReferenceImage,
  requestGeminiImage,
} = require("../api/_lib/character");
const {
  clearWalletProfileCache,
  deleteStoredImage,
  getWalletProfile,
  isBlobImageStoreEnabled,
  readDb,
  updateWalletProfile,
} = require("../api/_lib/store");

const RETRIES_PER_CHARACTER = 3;
const RETRY_DELAY_MS = 4000;
// Blob reads can lag a write by a moment. Without a read-back the next write to
// the same wallet can be built on a stale profile and silently drop this one.
const WRITE_VERIFY_ATTEMPTS = 4;
const WRITE_VERIFY_DELAY_MS = 1500;

function parseArgs(argv) {
  const args = { dryRun: false, limit: Infinity, wallet: "", pruneOld: false, ids: [] };

  for (const raw of argv) {
    if (raw === "--dry-run") {
      args.dryRun = true;
      continue;
    }

    if (raw === "--prune-old") {
      args.pruneOld = true;
      continue;
    }

    const limit = raw.match(/^--limit=(\d+)$/);
    if (limit) {
      args.limit = Number(limit[1]);
      continue;
    }

    const wallet = raw.match(/^--wallet=(.+)$/);
    if (wallet) {
      args.wallet = wallet[1].trim();
      continue;
    }

    const ids = raw.match(/^--ids=(.+)$/);
    if (ids) {
      args.ids = ids[1]
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  return args;
}

function loadEnvFiles() {
  const root = process.cwd();

  for (const file of [".env.local", ".env"]) {
    let contents = "";
    try {
      contents = require("fs").readFileSync(path.join(root, file), "utf8");
    } catch {
      continue;
    }

    for (const line of contents.split("\n")) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function listTargets(db, { wallet: walletFilter, ids }) {
  const idFilter = ids.length ? new Set(ids) : null;
  const targets = [];

  for (const [wallet, profile] of Object.entries(db.records || {})) {
    if (walletFilter && wallet !== walletFilter) {
      continue;
    }

    for (const character of profile.characters || []) {
      if (!character?.id || !character.creatureType) {
        continue;
      }
      if (idFilter && !idFilter.has(character.id)) {
        continue;
      }
      targets.push({ wallet, character });
    }
  }

  return targets;
}

// Mirrors store.js so renders land next to the images the app writes itself.
function blobImagePrefix() {
  return String(process.env.BLOB_CHARACTER_IMAGE_PREFIX || "characters").replace(/^\/+|\/+$/g, "");
}

// Content-addressed pathname: a fresh URL per render, so no CDN cache can hand
// players the previous art.
async function storeImage(characterId, buffer, mimeType) {
  const extension = getImageExtension(mimeType);
  const digest = crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 10);

  if (isBlobImageStoreEnabled()) {
    const { put } = require("@vercel/blob");
    const pathname = `${blobImagePrefix()}/${characterId}-${digest}.${extension}`;
    const blob = await put(pathname, buffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: mimeType,
      cacheControlMaxAge: 31536000,
    });
    return { url: blob.url, blobPathname: blob.pathname };
  }

  const filePath = path.join(
    process.cwd(),
    ".data",
    "local-dev",
    "character-images",
    `${characterId}-${digest}.${extension}`
  );
  await fs.writeFile(filePath, buffer);
  return { filePath };
}

async function renderImage(character, referenceImage) {
  const context = createPromptContext(character.creatureType, character.variables || {});
  const prompt = buildImagePrompt(context, referenceImage);

  let lastError = null;
  for (let attempt = 1; attempt <= RETRIES_PER_CHARACTER; attempt += 1) {
    try {
      const image = await requestGeminiImage(prompt, referenceImage);
      if (!image?.base64) {
        throw new Error("Gemini returned no inline image data.");
      }

      return {
        prompt,
        mimeType: image.mimeType,
        buffer: Buffer.from(image.base64, "base64"),
      };
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES_PER_CHARACTER) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError || new Error("Image generation failed.");
}

async function applyImage(wallet, characterId, rendered, stored) {
  let previousImage = null;

  await updateWalletProfile(wallet, (profile) => {
    const characters = profile.characters || [];
    const index = characters.findIndex((entry) => entry?.id === characterId);
    if (index === -1) {
      throw new Error(`Character ${characterId} vanished from ${wallet}.`);
    }

    const character = characters[index];
    previousImage = character.image || null;

    // Whole profile is preserved; only the character's image + stored prompt move.
    const nextCharacters = characters.slice();
    nextCharacters[index] = {
      ...character,
      image: {
        provider: "gemini",
        prompt: rendered.prompt,
        mimeType: rendered.mimeType,
        ...stored,
        generatedAt: new Date().toISOString(),
      },
      prompts: {
        ...(character.prompts || {}),
        image: rendered.prompt,
      },
      updatedAt: new Date().toISOString(),
    };

    return { ...profile, characters: nextCharacters };
  });

  return previousImage;
}

// Reads the profile back until the new image is visible, so the next wallet
// write is never built on a pre-write snapshot.
async function confirmImage(wallet, characterId, stored) {
  const expected = stored.blobPathname || stored.filePath || "";

  for (let attempt = 1; attempt <= WRITE_VERIFY_ATTEMPTS; attempt += 1) {
    clearWalletProfileCache(wallet);
    const profile = await getWalletProfile(wallet);
    const character = (profile.characters || []).find((entry) => entry?.id === characterId);
    const actual = character?.image?.blobPathname || character?.image?.filePath || "";

    if (actual === expected) {
      return true;
    }

    if (attempt < WRITE_VERIFY_ATTEMPTS) {
      await sleep(WRITE_VERIFY_DELAY_MS * attempt);
    }
  }

  return false;
}

async function main() {
  loadEnvFiles();
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_AI_API_KEY) {
    throw new Error("GEMINI_API_KEY (or GOOGLE_AI_API_KEY) is required.");
  }
  process.env.ENABLE_LIVE_CHARACTER_GENERATION = "true";

  const db = await readDb();
  const targets = listTargets(db, args);
  const storage = isBlobImageStoreEnabled() ? "blob" : "local";

  console.log(
    JSON.stringify({
      storage,
      wallets: new Set(targets.map((entry) => entry.wallet)).size,
      characters: targets.length,
      willProcess: Math.min(targets.length, args.limit),
      dryRun: args.dryRun,
      pruneOld: args.pruneOld,
    })
  );

  if (args.dryRun) {
    return;
  }

  const referenceImage = await loadShapeReferenceImage();
  if (!referenceImage) {
    throw new Error("Shape reference image is missing — aborting.");
  }

  const failures = [];
  let done = 0;

  for (const { wallet, character } of targets.slice(0, args.limit)) {
    const label = `${character.id} (${character.creatureType})`;
    try {
      const rendered = await renderImage(character, referenceImage);
      const stored = await storeImage(character.id, rendered.buffer, rendered.mimeType);
      const previousImage = await applyImage(wallet, character.id, rendered, stored);

      if (!(await confirmImage(wallet, character.id, stored))) {
        throw new Error("Profile write did not become visible — image not applied.");
      }

      // Compare on whichever locator the active backend uses, so a same-named
      // file is never deleted out from under the record that now points at it.
      const previousLocator = previousImage?.blobPathname || previousImage?.filePath || "";
      const nextLocator = stored.blobPathname || stored.filePath || "";
      if (args.pruneOld && previousLocator && previousLocator !== nextLocator) {
        await deleteStoredImage(previousImage);
      }

      done += 1;
      console.log(`ok   ${done}/${Math.min(targets.length, args.limit)} ${label}`);
    } catch (error) {
      failures.push({ wallet, characterId: character.id, error: error.message });
      console.error(`fail ${label}: ${error.message}`);
    }
  }

  console.log(JSON.stringify({ regenerated: done, failed: failures.length, failures }, null, 2));

  if (failures.length) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
