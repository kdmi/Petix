const fs = require("fs/promises");
const path = require("path");

const { createImageStore, readDb, saveWalletProfile } = require("../api/_lib/store");

function inferExtension(filePath, mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";

  const ext = path.extname(String(filePath || "")).replace(/^\./, "").toLowerCase();
  if (ext === "jpeg") return "jpg";
  return ext || "jpg";
}

async function migrateRecordImage(record, imageStore) {
  if (!record?.id || !record.image?.filePath || record.image?.url) {
    return record;
  }

  const sourcePath = record.image.filePath;
  const mimeType = record.image.mimeType || "image/jpeg";
  const extension = inferExtension(sourcePath, mimeType);
  const buffer = await fs.readFile(sourcePath);
  const storedImage = await imageStore.writeImageBuffer(record.id, extension, buffer, mimeType);

  return {
    ...record,
    image: {
      ...record.image,
      ...storedImage,
    },
    updatedAt: new Date().toISOString(),
  };
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("BLOB_READ_WRITE_TOKEN is required.");
  }

  const db = await readDb();
  const imageStore = createImageStore();
  let migratedCount = 0;

  for (const [wallet, profile] of Object.entries(db.records || {})) {
    const nextProfile = {
      draft: profile.draft ? await migrateRecordImage(profile.draft, imageStore) : null,
      characters: [],
    };

    if (nextProfile.draft && nextProfile.draft !== profile.draft) {
      migratedCount += 1;
    }

    for (const character of profile.characters || []) {
      const nextCharacter = await migrateRecordImage(character, imageStore);
      if (nextCharacter !== character) {
        migratedCount += 1;
      }
      nextProfile.characters.push(nextCharacter);
    }

    await saveWalletProfile(wallet, nextProfile);
  }

  console.log(JSON.stringify({ migratedCount }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
