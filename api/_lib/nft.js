const fs = require("fs/promises");
const path = require("path");

const { getEconomyConfig } = require("./economy-config");
const { claimFarm, normalizeFarmState } = require("./farm");
const { debitCurrency } = require("./currency");
const { createChainClient, getNftEnv, isNftEnabled } = require("./nft-chain");
const nftStore = require("./nft-store");
const {
  deleteStoredImage,
  getWalletProfile,
  saveWalletProfile,
  updateWalletProfile,
} = require("./store");

// Business logic for the NFT slots demo (feature 016): bind / unbind / move /
// sync. Every on-chain or storage side effect goes through `deps`, so tests
// inject fakes. Errors carry { httpStatus, httpCode } and are mapped straight
// to responses by the handlers.

// Collection size comes from env: the demo collection is deployed via OpenSea
// Studio, so the cap lives on their contract, not ours.
const MAX_SUPPLY = Math.max(1, Math.floor(Number(process.env.NFT_MAX_SUPPLY) || 10000));

// One sync run scans a bounded window of blocks. Without a cap, the very first
// run after launch has to walk from the deployment block to the chain head in a
// single invocation — on Robinhood Chain that is ~864k blocks per day of gap,
// which outgrows the function timeout. Worse, a run that dies never advances the
// watermark, so every later run repeats the same doomed scan and ownership sync
// stops for good. With the cap the watermark moves every run and the per-minute
// cron walks any backlog down on its own.
const SYNC_MAX_BLOCKS = Math.max(
  1000,
  Math.floor(Number(process.env.NFT_SYNC_MAX_BLOCKS) || 250000)
);
const LOCAL_IMAGE_PREFIX = "local:";
const LOCAL_IMAGES_DIR = path.join(
  process.cwd(),
  ".data",
  process.env.NODE_ENV === "production" ? "" : "local-dev",
  "nft-images"
);
const BLOB_SNAPSHOT_PREFIX = "nft-images";

const VARIABLE_TRAIT_LABELS = {
  ELEMENT: "Element",
  PROFESSION_STYLE: "Profession Style",
  TOP_ITEM: "Top Item",
  ELEMENT_EFFECTS: "Element Effects",
  BODY_COLOR: "Body Color",
  FACIAL_FEATURES: "Facial Features",
  SIDE_DETAILS: "Side Details",
};

// Marketplaces cache token metadata and only re-read it lazily: the on-chain
// ERC-4906 event alone took ~30 minutes to land on OpenSea. Their refresh
// endpoint queues an immediate re-read (minutes, not hours). Best-effort and
// non-blocking — the demo works without a key, just slower.
async function requestMarketplaceRefresh(tokenId) {
  const apiKey = process.env.NFT_OPENSEA_API_KEY;
  const contract = process.env.NFT_CONTRACT;
  if (!apiKey || !contract) return false;

  const chain = process.env.NFT_OPENSEA_CHAIN || "robinhood";
  const url = `https://api.opensea.io/api/v2/chain/${chain}/contract/${contract}/nfts/${tokenId}/refresh`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "x-api-key": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      console.warn(`[nft] marketplace refresh ${tokenId}: HTTP ${response.status} ${body.slice(0, 120)}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn(`[nft] marketplace refresh ${tokenId} failed: ${error.message}`);
    return false;
  }
}

/**
 * Просит маркетплейс перечитать метаданные питомца после прокачки (уровень и
 * статы видны в трейтах). Дебаунс на токен: активный игрок может апнуть
 * несколько уровней подряд, а лимит записей у API конечен.
 *
 * Тихая операция: персонажа уже сохранили, обновление витрины — не повод
 * ломать бой или апгрейд. Вызывать без await.
 */
async function refreshBoundCharacterMetadata(characterId, depOverrides) {
  // Зовётся из боя и апгрейда — то есть на каждом левел-апе всех игроков.
  // Пока фича выключена, не должно быть даже чтения хранилища.
  if (!isNftEnabled()) return false;
  if (!characterId || !process.env.NFT_OPENSEA_API_KEY) return false;

  const deps = resolveDeps(depOverrides);
  const debounceMs =
    Math.max(0, Number(process.env.NFT_REFRESH_DEBOUNCE_MS) || 10 * 60 * 1000);

  try {
    const binding = await deps.store.getBindingByCharacterId(characterId);
    if (!binding) return false;

    const now = deps.now();
    const lastAt = Date.parse(binding.refreshedAt || 0);
    if (Number.isFinite(lastAt) && now - lastAt < debounceMs) return false;

    // Метку ставим ДО запроса: параллельные бои не должны выстрелить пачкой.
    await deps.store.withNftState((state) => {
      const stored = state.bindings[String(binding.tokenId)];
      if (stored) stored.refreshedAt = new Date(now).toISOString();
      return state;
    });

    return await requestMarketplaceRefresh(binding.tokenId);
  } catch (error) {
    console.warn(`[nft] progression refresh failed: ${error.message}`);
    return false;
  }
}

function fail(status, message, code, extra) {
  const error = new Error(message);
  error.httpStatus = status;
  error.httpCode = code;
  if (extra) Object.assign(error, extra);
  return error;
}

function normalizeTokenId(rawValue) {
  const tokenId = Math.floor(Number(rawValue));
  if (!Number.isFinite(tokenId) || tokenId < 1 || tokenId > MAX_SUPPLY) {
    return null;
  }
  return tokenId;
}

function buildDefaultDeps() {
  return {
    chain: createChainClient(),
    store: nftStore,
    profiles: { getWalletProfile, saveWalletProfile, updateWalletProfile },
    getConfig: getEconomyConfig,
    deleteStoredImage,
    now: () => Date.now(),
  };
}

function resolveDeps(overrides) {
  return { ...buildDefaultDeps(), ...(overrides || {}) };
}

// ---------------------------------------------------------------------------
// Image snapshot (FR-007): the game image is overwritable and deleted on burn,
// so bind copies the bytes into permanent storage. Pinata (ipfs://) when the
// JWT is configured, write-once blob otherwise, local file in bare dev.
// ---------------------------------------------------------------------------

function getImageMeta(character) {
  const source =
    character?.image?.url || character?.image?.filePath || character?.imageUrl || null;
  const extensionMatch = String(source || "").match(/\.(png|jpe?g|webp)(\?|$)/i);
  const extension = extensionMatch ? extensionMatch[1].toLowerCase().replace("jpeg", "jpg") : "png";
  const mimeType =
    extension === "jpg" ? "image/jpeg" : extension === "webp" ? "image/webp" : "image/png";
  return { extension, mimeType };
}

async function readCharacterImageBytes(character) {
  const image = character?.image || {};
  if (image.filePath) {
    return fs.readFile(image.filePath);
  }
  const url = image.url || character?.imageUrl || null;
  if (url && /^https?:\/\//.test(url)) {
    const response = await fetch(url);
    if (!response.ok) {
      throw fail(502, "Character image is unavailable.", "IMAGE_UNAVAILABLE");
    }
    return Buffer.from(await response.arrayBuffer());
  }
  throw fail(502, "Character image is unavailable.", "IMAGE_UNAVAILABLE");
}

async function pinToPinata(buffer, fileName, mimeType, jwt) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: mimeType }), fileName);
  form.append("pinataMetadata", JSON.stringify({ name: fileName }));
  const response = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw fail(502, `Pinata pin failed (${response.status}): ${text.slice(0, 200)}`, "PIN_FAILED");
  }
  const payload = await response.json();
  if (!payload?.IpfsHash) {
    throw fail(502, "Pinata pin returned no CID.", "PIN_FAILED");
  }
  const gatewayHost = String(process.env.NFT_IPFS_GATEWAY || "https://gateway.pinata.cloud")
    .replace(/\/$/, "");
  return {
    imageUri: `ipfs://${payload.IpfsHash}`,
    imageGatewayUrl: `${gatewayHost}/ipfs/${payload.IpfsHash}`,
  };
}

async function snapshotCharacterImage(tokenId, character) {
  const { extension, mimeType } = getImageMeta(character);
  const fileName = `${tokenId}-${character.id}.${extension}`;
  const buffer = await readCharacterImageBytes(character);

  const pinataJwt = process.env.NFT_PINATA_JWT;
  if (pinataJwt) {
    return pinToPinata(buffer, fileName, mimeType, pinataJwt);
  }

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = require("@vercel/blob");
    const blob = await put(`${BLOB_SNAPSHOT_PREFIX}/${fileName}`, buffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: false, // write-once: the NFT image must never change
      contentType: mimeType,
      cacheControlMaxAge: 31536000,
    }).catch((error) => {
      // Re-binding the same character to the same token after a rollback hits
      // the existing blob — that's the identical content, reuse it.
      if (/already exists/i.test(String(error?.message || ""))) {
        return null;
      }
      throw error;
    });
    if (blob) {
      return { imageUri: blob.url, imageGatewayUrl: null };
    }
    const { list } = require("@vercel/blob");
    const existing = await list({ prefix: `${BLOB_SNAPSHOT_PREFIX}/${fileName}`, limit: 1 });
    const match = existing?.blobs?.[0];
    if (match) {
      return { imageUri: match.url, imageGatewayUrl: null };
    }
    throw fail(502, "Image snapshot failed.", "SNAPSHOT_FAILED");
  }

  // Bare local dev: keep a copy on disk, served by the public image handler.
  await fs.mkdir(LOCAL_IMAGES_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_IMAGES_DIR, fileName), buffer);
  return { imageUri: `${LOCAL_IMAGE_PREFIX}${fileName}`, imageGatewayUrl: null };
}

// ---------------------------------------------------------------------------
// Metadata (public contract — see specs/016 data-model.md)
// ---------------------------------------------------------------------------

function titleCaseCreature(value) {
  const text = String(value || "").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "Companion";
}

function resolveImageUrl(binding, origin) {
  if (binding.imageGatewayUrl) return binding.imageGatewayUrl;
  const uri = String(binding.imageUri || "");
  if (uri.startsWith(LOCAL_IMAGE_PREFIX)) {
    return `${origin}/api/nft/image?file=${encodeURIComponent(uri.slice(LOCAL_IMAGE_PREFIX.length))}`;
  }
  return uri || null;
}

function buildPlaceholderMetadata(tokenId, origin) {
  return {
    name: `Slot #${tokenId}`,
    description: "An empty slot. Bind a companion to turn it into a collectible.",
    image: `${origin}/assets/nft/placeholder.png`,
    attributes: [{ trait_type: "Status", value: "Empty Slot" }],
  };
}

function buildCollectionMetadata(origin) {
  return {
    name: process.env.NFT_COLLECTION_NAME || "Slot Box",
    description:
      `A fixed collection of ${MAX_SUPPLY.toLocaleString("en-US")} capsules. ` +
      "Each capsule starts empty and can be turned into a unique companion collectible.",
    image: `${origin}/assets/nft/placeholder.png`,
  };
}

function buildBoundMetadata(tokenId, binding, character, origin) {
  const attributes = [
    { trait_type: "Status", value: "Bound" },
    { trait_type: "Rarity", value: character.rarity || "Common" },
    { trait_type: "Creature", value: titleCaseCreature(character.creatureType) },
  ];

  const variables = character.variables || {};
  for (const [header, label] of Object.entries(VARIABLE_TRAIT_LABELS)) {
    const value = String(variables[header] || "").trim();
    if (value) {
      attributes.push({ trait_type: label, value });
    }
  }

  const selectedPower = Array.isArray(character.powers)
    ? character.powers.find((power) => power?.id === character.selectedPowerId)
    : null;
  if (selectedPower?.title) {
    attributes.push({ trait_type: "Power", value: selectedPower.title });
  }

  attributes.push({
    trait_type: "Level",
    display_type: "number",
    value: Math.max(1, Math.floor(Number(character.level) || 1)),
  });
  const stats = character.attributes || {};
  for (const [key, label] of [
    ["stamina", "Stamina"],
    ["agility", "Agility"],
    ["strength", "Strength"],
    ["intelligence", "Intelligence"],
  ]) {
    attributes.push({
      trait_type: label,
      display_type: "number",
      value: Math.max(0, Math.floor(Number(stats[key]) || 0)),
    });
  }

  return {
    name: character.name || character.displayName || `Slot #${tokenId}`,
    description: `${character.rarity || "Common"} ${titleCaseCreature(character.creatureType).toLowerCase()}.`,
    image: resolveImageUrl(binding, origin),
    attributes,
  };
}

/**
 * Public token metadata. Returns null for an unminted/out-of-range token.
 * `origin` is the absolute origin serving the request (for placeholder/local
 * image URLs).
 */
async function getTokenMetadata(rawTokenId, origin, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const tokenId = normalizeTokenId(rawTokenId);
  if (!tokenId) return null;

  const owner = await deps.chain.ownerOf(tokenId);
  if (!owner) return null; // not minted

  const binding = await deps.store.getBinding(tokenId);
  if (!binding) {
    return buildPlaceholderMetadata(tokenId, origin);
  }

  // Заявка на очистку: питомец скоро сгорит. Показываем предупреждение вместо
  // трейтов, чтобы никто не купил капсулу, рассчитывая на её содержимое.
  if (binding.pendingUnbind) {
    return {
      name: `Slot #${tokenId}`,
      description:
        "The companion inside is scheduled to be released. This capsule will be empty soon.",
      image: `${origin}/assets/nft/placeholder.png`,
      attributes: [{ trait_type: "Status", value: "Unbinding" }],
    };
  }

  const profile = await deps.profiles.getWalletProfile(binding.wallet);
  const character = (profile.characters || []).find(
    (record) => record.id === binding.characterId
  );
  if (!character) {
    // Integrity fallback: binding without a reachable character — show the
    // placeholder rather than erroring in marketplaces.
    return buildPlaceholderMetadata(tokenId, origin);
  }

  return buildBoundMetadata(tokenId, binding, character, origin);
}

// ---------------------------------------------------------------------------
// Move: the on-chain owner changed — carry the character (with all its
// progression) to the new owner's profile. Snapshot/rollback mirrors the
// battle POST flow.
// ---------------------------------------------------------------------------

async function moveBoundCharacter(binding, toWallet, meta = {}, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const fromWallet = binding.wallet;
  const target = String(toWallet || "").toLowerCase();
  if (!target || fromWallet === target) {
    return null;
  }

  // Капсулу продали, пока висела заявка на очистку — отменяем сжигание и
  // возвращаем Points. Покупатель получает персонажа живым.
  if (binding.pendingUnbind) {
    await releasePendingUnbind(binding.tokenId, deps);
  }

  const cfg = await deps.getConfig();
  const now = deps.now();

  const fromSnapshot = await deps.profiles.getWalletProfile(fromWallet);
  const toSnapshot = await deps.profiles.getWalletProfile(target);

  let movedCharacter = null;
  await deps.profiles.updateWalletProfile(fromWallet, (current) => {
    const characters = current.characters || [];
    const index = characters.findIndex((record) => record.id === binding.characterId);
    if (index === -1) {
      return current; // already gone (double-run) — binding update below still applies
    }
    const character = characters[index];
    if (normalizeFarmState(character.farmState).active) {
      // Active farm settles in favour of the previous owner (FR-015).
      claimFarm(current, character, now, cfg);
    } else {
      character.farmState = normalizeFarmState(null);
    }
    characters.splice(index, 1);
    movedCharacter = character;
    return current;
  });

  if (movedCharacter) {
    try {
      await deps.profiles.updateWalletProfile(target, (current) => {
        const characters = current.characters || (current.characters = []);
        if (!characters.some((record) => record.id === movedCharacter.id)) {
          movedCharacter.nft = { tokenId: binding.tokenId, boundAt: binding.boundAt };
          characters.push(movedCharacter);
        }
        return current;
      });
    } catch (error) {
      await deps.profiles.saveWalletProfile(fromWallet, fromSnapshot);
      throw error;
    }
  }

  const entry = {
    tokenId: binding.tokenId,
    characterId: binding.characterId,
    fromWallet,
    toWallet: target,
    detectedBy: meta.detectedBy || "sync",
    txBlock: meta.txBlock ?? null,
    movedAt: new Date(now).toISOString(),
  };

  try {
    await deps.store.withNftState((state) => {
      const stored = state.bindings[String(binding.tokenId)];
      if (stored && stored.characterId === binding.characterId) {
        stored.wallet = target;
      }
      return deps.store.appendTransferEntry(state, entry);
    });
  } catch (error) {
    await deps.profiles.saveWalletProfile(fromWallet, fromSnapshot);
    await deps.profiles.saveWalletProfile(target, toSnapshot);
    throw error;
  }

  return entry;
}

/**
 * Keeps the Transfer-log ownership index current and returns the fresh state.
 * Needed because OpenSea's ERC721SeaDrop has no tokenOfOwnerByIndex — the only
 * portable way to know "which tokens does this wallet hold" is to replay
 * Transfer events. The first run finds the deployment block by binary search
 * so the scan never starts at genesis.
 */
async function ensureOwnerIndex(depOverrides) {
  const deps = resolveDeps(depOverrides);
  let state = await deps.store.readNftState();

  let startBlock = state.startBlock;
  if (!startBlock) {
    startBlock = await deps.chain.findDeploymentBlock();
    state = await deps.store.withNftState((current) => {
      current.startBlock = startBlock;
      return current;
    });
  }

  const fromBlock = state.lastSyncedBlock ? state.lastSyncedBlock + 1 : startBlock;
  const { toBlock, transfers } = await deps.chain.scanTransfers(fromBlock, {
    maxBlocks: SYNC_MAX_BLOCKS,
  });
  if (!transfers.length && toBlock <= state.lastSyncedBlock) {
    return state;
  }

  return deps.store.withNftState((current) => {
    for (const transfer of transfers) {
      const key = String(transfer.tokenId);
      if (!transfer.to || /^0x0{40}$/.test(transfer.to)) delete current.owners[key];
      else current.owners[key] = transfer.to;
    }
    current.lastSyncedBlock = Math.max(current.lastSyncedBlock, toBlock);
    return current;
  });
}

/** Token ids held by the wallet: enumerable contract when available, index otherwise. */
async function getWalletTokenIds(wallet, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const enumerated = await deps.chain.tokensOfOwner(wallet);
  if (enumerated) return enumerated;

  await ensureOwnerIndex(deps);
  return deps.store.listTokensOfOwnerFromIndex(wallet);
}

/** Login-time sync: tokens owned by `wallet` whose binding points elsewhere. */
async function syncWalletSlots(wallet, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const tokenIds = await getWalletTokenIds(wallet, deps);
  const moved = [];
  for (const tokenId of tokenIds) {
    const binding = await deps.store.getBinding(tokenId);
    if (binding && binding.wallet !== wallet) {
      const entry = await moveBoundCharacter(binding, wallet, { detectedBy: "login" }, deps);
      if (entry) moved.push(entry);
    }
  }
  return { tokenIds, moved };
}

/** Full sync: scan Transfer logs since the watermark, reconcile touched bindings. */
async function syncTransfers(depOverrides) {
  const deps = resolveDeps(depOverrides);
  const state = await deps.store.readNftState();
  const fromBlock = state.lastSyncedBlock + 1;
  const { toBlock, transfers } = await deps.chain.scanTransfers(fromBlock, {
    maxBlocks: SYNC_MAX_BLOCKS,
  });

  const touched = new Map();
  for (const transfer of transfers) {
    touched.set(transfer.tokenId, transfer);
  }

  // Keep the ownership index in step with the same scan.
  if (transfers.length) {
    await deps.store.withNftState((current) => {
      for (const transfer of transfers) {
        const key = String(transfer.tokenId);
        if (!transfer.to || /^0x0{40}$/.test(transfer.to)) delete current.owners[key];
        else current.owners[key] = transfer.to;
      }
      return current;
    });
  }

  const moved = [];
  const errors = [];
  for (const [tokenId, transfer] of touched) {
    try {
      const binding = await deps.store.getBinding(tokenId);
      if (!binding) continue;
      const owner = await deps.chain.ownerOf(tokenId);
      if (owner && binding.wallet !== owner) {
        const entry = await moveBoundCharacter(
          binding,
          owner,
          { detectedBy: "sync", txBlock: transfer.blockNumber },
          deps
        );
        if (entry) moved.push(entry);
      }
    } catch (error) {
      errors.push({ tokenId, error: error.message });
    }
  }

  if (toBlock >= fromBlock - 1) {
    await deps.store.withNftState((current) => {
      current.lastSyncedBlock = Math.max(current.lastSyncedBlock, toBlock);
      return current;
    });
  }

  // Переносы разнесли — теперь можно исполнять созревшие заявки на очистку:
  // владение уже актуально, а внутри всё равно перепроверяем ownerOf.
  const unbinds = await processPendingUnbinds(deps);

  return {
    scannedFromBlock: fromBlock,
    scannedToBlock: toBlock,
    moved,
    burned: unbinds.burned,
    cancelledUnbinds: unbinds.cancelled,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Bind / unbind
// ---------------------------------------------------------------------------

async function bindCharacterToSlot(wallet, rawTokenId, characterId, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const tokenId = normalizeTokenId(rawTokenId);
  if (!tokenId) throw fail(404, "Token not found.", "TOKEN_NOT_FOUND");

  const owner = await deps.chain.ownerOf(tokenId);
  if (!owner) throw fail(404, "Token not found.", "TOKEN_NOT_FOUND");
  if (owner !== wallet) throw fail(403, "You do not own this token.", "NOT_TOKEN_OWNER");

  const existingBinding = await deps.store.getBinding(tokenId);
  if (existingBinding) throw fail(409, "This slot is already occupied.", "SLOT_OCCUPIED");

  const boundElsewhere = await deps.store.getBindingByCharacterId(characterId);
  if (boundElsewhere) {
    throw fail(409, "This character is already bound to a slot.", "CHARACTER_ALREADY_BOUND");
  }

  const profile = await deps.profiles.getWalletProfile(wallet);
  const character = (profile.characters || []).find((record) => record.id === characterId);
  if (!character) throw fail(404, "Character not found.", "CHARACTER_NOT_FOUND");
  if (character.status !== "completed") {
    throw fail(403, "Only completed characters can be bound.", "NOT_CHARACTER_OWNER");
  }
  if (character.nft?.tokenId) {
    throw fail(409, "This character is already bound to a slot.", "CHARACTER_ALREADY_BOUND");
  }

  const cfg = await deps.getConfig();
  const requiredLevel = Math.max(1, Math.floor(Number(cfg.NFT_BIND_LEVEL) || 1));
  const level = Math.max(1, Math.floor(Number(character.level) || 1));
  if (level < requiredLevel) {
    throw fail(422, "Character level is too low.", "LEVEL_TOO_LOW", {
      required: requiredLevel,
      current: level,
    });
  }

  const snapshot = deps.snapshotImage
    ? await deps.snapshotImage(tokenId, character)
    : await snapshotCharacterImage(tokenId, character);

  const boundAt = new Date(deps.now()).toISOString();
  await deps.store.withNftState((state) => {
    // Re-check inside the CAS mutation: a concurrent bind may have landed.
    if (state.bindings[String(tokenId)]) {
      throw fail(409, "A bind for this slot is already in progress.", "BIND_IN_PROGRESS");
    }
    for (const raw of Object.values(state.bindings)) {
      if (raw.characterId === characterId) {
        throw fail(409, "This character is already bound to a slot.", "CHARACTER_ALREADY_BOUND");
      }
    }
    state.bindings[String(tokenId)] = {
      characterId,
      wallet,
      imageUri: snapshot.imageUri,
      imageGatewayUrl: snapshot.imageGatewayUrl || null,
      boundAt,
    };
    return state;
  });

  try {
    await deps.profiles.updateWalletProfile(wallet, (current) => {
      const record = (current.characters || []).find((item) => item.id === characterId);
      if (!record) throw fail(404, "Character not found.", "CHARACTER_NOT_FOUND");
      record.nft = { tokenId, boundAt };
      return current;
    });
  } catch (error) {
    await deps.store.withNftState((state) => {
      const stored = state.bindings[String(tokenId)];
      if (stored && stored.characterId === characterId) {
        delete state.bindings[String(tokenId)];
      }
      return state;
    });
    throw error;
  }

  // Никаких on-chain событий: ERC-4906 обходился в ~$0.09 газа за привязку
  // и доносил новость до OpenSea за ~30 мин, тогда как их API — за ~3 мин и
  // бесплатно. Вернуть событие можно, если появится площадка без нашего ключа.
  const marketplaceRefreshed = await requestMarketplaceRefresh(tokenId);

  return {
    tokenId,
    characterId,
    imageUri: snapshot.imageUri,
    marketplaceRefreshed,
  };
}

// ---------------------------------------------------------------------------
// Очистка капсулы — двухфазная.
//
// Мгновенное сжигание позволяло бы обмануть покупателя: выставить капсулу с
// прокачанным персонажем, дождаться сделки и сжечь его в последний момент —
// продавцу это ничего не стоит, он персонажа и так отдавал. Поэтому:
//   1) заявка: списываем Points, помечаем капсулу, метаданные сразу показывают
//      Unbinding и прячут трейты — у кэша маркетплейсов есть час, чтобы это
//      разошлось;
//   2) исполнение (через час, из синка): свежий ownerOf. Владелец сменился —
//      значит капсулу продали, сжигание отменяем и возвращаем Points, персонаж
//      достаётся покупателю живым.
// ---------------------------------------------------------------------------

/** Возвращает Points, не раздувая totalEarned (это возврат, а не заработок). */
function refundPoints(profile, amount) {
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (!safeAmount) return profile;
  const current = profile.currency || { balance: 0, totalEarned: 0 };
  profile.currency = {
    balance: Math.max(0, Math.floor(Number(current.balance) || 0)) + safeAmount,
    totalEarned: Math.max(0, Math.floor(Number(current.totalEarned) || 0)),
  };
  return profile;
}

/** Best-effort: есть ли активный листинг на маркетплейсе. null — не смогли узнать. */
async function hasActiveMarketplaceListing(tokenId) {
  const apiKey = process.env.NFT_OPENSEA_API_KEY;
  const contract = process.env.NFT_CONTRACT;
  if (!apiKey || !contract) return null;

  const chain = process.env.NFT_OPENSEA_CHAIN || "robinhood";
  const url = `https://api.opensea.io/api/v2/orders/${chain}/seaport/listings?asset_contract_address=${contract}&token_ids=${tokenId}&order_by=created_date&order_direction=desc&limit=1`;
  try {
    const response = await fetch(url, {
      headers: { "x-api-key": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    const payload = await response.json();
    return Array.isArray(payload?.orders) && payload.orders.length > 0;
  } catch {
    return null; // API недоступен — не блокируем, отсрочка всё равно прикрывает
  }
}

/** Фаза 1: заявка на очистку. Списывает Points, ставит отметку, прячет трейты. */
async function requestUnbindSlot(wallet, rawTokenId, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const tokenId = normalizeTokenId(rawTokenId);
  if (!tokenId) throw fail(404, "Token not found.", "TOKEN_NOT_FOUND");

  const owner = await deps.chain.ownerOf(tokenId);
  if (!owner) throw fail(404, "Token not found.", "TOKEN_NOT_FOUND");
  if (owner !== wallet) throw fail(403, "You do not own this token.", "NOT_TOKEN_OWNER");

  let binding = await deps.store.getBinding(tokenId);
  if (!binding) throw fail(409, "This slot is already empty.", "SLOT_EMPTY");
  if (binding.pendingUnbind) {
    throw fail(409, "This slot is already being cleared.", "UNBIND_PENDING", {
      executeAt: binding.pendingUnbind.executeAt,
    });
  }

  // Guard: привязка могла отстать от блокчейна — сначала переносим персонажа.
  if (binding.wallet !== owner) {
    await moveBoundCharacter(binding, owner, { detectedBy: "guard" }, deps);
    binding = await deps.store.getBinding(tokenId);
    if (!binding) throw fail(409, "This slot is already empty.", "SLOT_EMPTY");
  }

  const listed = await hasActiveMarketplaceListing(tokenId);
  if (listed === true) {
    throw fail(409, "Cancel the marketplace listing first.", "TOKEN_LISTED");
  }

  const cfg = await deps.getConfig();
  const cost = Math.max(0, Math.floor(Number(cfg.NFT_UNBIND_COST) || 0));
  const delayMs = Math.max(0, Math.floor(Number(cfg.NFT_UNBIND_DELAY_MS) || 0));
  const now = deps.now();
  const executeAt = new Date(now + delayMs).toISOString();

  let pricePaid = 0;
  await deps.profiles.updateWalletProfile(owner, (current) => {
    const balance = Math.max(0, Math.floor(Number(current.currency?.balance) || 0));
    if (balance < cost) {
      throw fail(402, "Not enough Points.", "INSUFFICIENT_FUNDS", { required: cost, balance });
    }
    pricePaid = cost > 0 ? debitCurrency(current, cost) : 0;
    return current;
  });

  try {
    await deps.store.withNftState((state) => {
      const stored = state.bindings[String(tokenId)];
      if (!stored) throw fail(409, "This slot is already empty.", "SLOT_EMPTY");
      if (stored.pendingUnbind) throw fail(409, "This slot is already being cleared.", "UNBIND_PENDING");
      stored.pendingUnbind = {
        executeAt,
        requestedBy: owner,
        pricePaid,
        requestedAt: new Date(now).toISOString(),
      };
      return state;
    });
  } catch (error) {
    if (pricePaid > 0) {
      await deps.profiles
        .updateWalletProfile(owner, (current) => refundPoints(current, pricePaid))
        .catch(() => null);
    }
    throw error;
  }

  // Метка на самом персонаже: дашборд рисует по ней огонёк с обратным отсчётом.
  await deps.profiles
    .updateWalletProfile(owner, (current) => {
      const record = (current.characters || []).find((item) => item.id === binding.characterId);
      if (record?.nft) record.nft.pendingUnbindAt = executeAt;
      return current;
    })
    .catch(() => null);

  // Просим маркетплейс перечитать СРАЗУ: статус Unbinding должен разойтись за
  // час ожидания, иначе покупатель увидит питомца, которого уже нет.
  const marketplaceRefreshed = await requestMarketplaceRefresh(tokenId);

  return { tokenId, executeAt, pricePaid, marketplaceRefreshed, status: "pending" };
}

/** Отмена заявки владельцем: возврат Points, трейты возвращаются. */
async function cancelUnbindRequest(wallet, rawTokenId, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const tokenId = normalizeTokenId(rawTokenId);
  if (!tokenId) throw fail(404, "Token not found.", "TOKEN_NOT_FOUND");

  const owner = await deps.chain.ownerOf(tokenId);
  if (owner !== wallet) throw fail(403, "You do not own this token.", "NOT_TOKEN_OWNER");

  const binding = await deps.store.getBinding(tokenId);
  if (!binding?.pendingUnbind) throw fail(409, "Nothing to cancel.", "NO_PENDING_UNBIND");

  const { pricePaid, requestedBy } = binding.pendingUnbind;
  await deps.store.withNftState((state) => {
    const stored = state.bindings[String(tokenId)];
    if (stored) stored.pendingUnbind = null;
    return state;
  });

  await deps.profiles
    .updateWalletProfile(requestedBy || owner, (current) => {
      const record = (current.characters || []).find((item) => item.id === binding.characterId);
      if (record?.nft) delete record.nft.pendingUnbindAt;
      if (pricePaid > 0) refundPoints(current, pricePaid);
      return current;
    })
    .catch(() => null);

  const marketplaceRefreshed = await requestMarketplaceRefresh(tokenId);
  return { tokenId, refunded: pricePaid, marketplaceRefreshed };
}

/** Снимает заявку и возвращает Points — используется при переносе владения. */
async function releasePendingUnbind(tokenId, deps) {
  const binding = await deps.store.getBinding(tokenId);
  if (!binding?.pendingUnbind) return null;

  const { pricePaid, requestedBy } = binding.pendingUnbind;
  await deps.store.withNftState((state) => {
    const stored = state.bindings[String(tokenId)];
    if (stored) stored.pendingUnbind = null;
    return state;
  });
  if (requestedBy) {
    await deps.profiles
      .updateWalletProfile(requestedBy, (current) => {
        const record = (current.characters || []).find(
          (item) => item.id === binding.characterId
        );
        if (record?.nft) delete record.nft.pendingUnbindAt;
        if (pricePaid > 0) refundPoints(current, pricePaid);
        return current;
      })
      .catch(() => null);
  }
  return { tokenId, refunded: pricePaid, refundedTo: requestedBy };
}

/** Фаза 2: исполнение созревших заявок. Зовётся из синка (крон раз в минуту). */
async function processPendingUnbinds(depOverrides) {
  const deps = resolveDeps(depOverrides);
  const state = await deps.store.readNftState();
  const now = deps.now();

  const due = Object.values(state.bindings).filter(
    (binding) =>
      binding.pendingUnbind && Date.parse(binding.pendingUnbind.executeAt) <= now
  );

  const burned = [];
  const cancelled = [];
  for (const binding of due) {
    try {
      // Единственная надёжная проверка: спрашиваем блокчейн, а не свою базу —
      // она обновляется кроном и может отставать от только что прошедшей продажи.
      const owner = await deps.chain.ownerOf(binding.tokenId);
      if (!owner || owner !== binding.pendingUnbind.requestedBy) {
        const released = await releasePendingUnbind(binding.tokenId, deps);
        if (released) cancelled.push(released);
        continue;
      }

      const result = await executeUnbind(binding, owner, deps);
      if (result) burned.push(result);
    } catch (error) {
      console.warn(`[nft] pending unbind ${binding.tokenId} failed: ${error.message}`);
    }
  }

  return { burned, cancelled };
}

/** Собственно сжигание: персонаж исчезает, капсула пустеет. */
async function executeUnbind(binding, owner, deps) {
  const cfg = await deps.getConfig();
  const now = deps.now();
  const ownerSnapshot = await deps.profiles.getWalletProfile(owner);

  let removed = null;
  await deps.profiles.updateWalletProfile(owner, (current) => {
    const characters = current.characters || [];
    const index = characters.findIndex((record) => record.id === binding.characterId);
    if (index === -1) return current; // целостность: привязка без персонажа — просто чистим
    const character = characters[index];
    if (normalizeFarmState(character.farmState).active) {
      claimFarm(current, character, now, cfg); // накопленный фарм остаётся владельцу
    }
    characters.splice(index, 1);
    removed = { characterId: character.id, image: character.image || null };
    return current;
  });

  try {
    await deps.store.withNftState((state) => {
      delete state.bindings[String(binding.tokenId)];
      return state;
    });
  } catch (error) {
    await deps.profiles.saveWalletProfile(owner, ownerSnapshot);
    throw error;
  }

  if (removed?.image) {
    // Снапшот-копия для NFT остаётся, удаляем только игровую картинку.
    try {
      await deps.deleteStoredImage(removed.image);
    } catch (error) {
      console.warn("[nft:unbind:image]", error.message);
    }
  }

  const marketplaceRefreshed = await requestMarketplaceRefresh(binding.tokenId);
  return {
    tokenId: binding.tokenId,
    burnedCharacterId: removed ? removed.characterId : binding.characterId,
    marketplaceRefreshed,
  };
}

// ---------------------------------------------------------------------------
// Slots listing (dashboard)
// ---------------------------------------------------------------------------

async function listWalletSlots(wallet, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const { tokenIds, moved } = await syncWalletSlots(wallet, deps);

  const profile = await deps.profiles.getWalletProfile(wallet);
  const characterById = new Map((profile.characters || []).map((record) => [record.id, record]));

  const slots = [];
  for (const tokenId of tokenIds) {
    const binding = await deps.store.getBinding(tokenId);
    if (!binding) {
      slots.push({ tokenId, state: "empty" });
      continue;
    }
    const character = characterById.get(binding.characterId) || null;
    slots.push({
      tokenId,
      state: "bound",
      character: character
        ? {
            id: character.id,
            name: character.name || character.displayName || null,
            level: Math.max(1, Math.floor(Number(character.level) || 1)),
            rarity: character.rarity || "Common",
            imageUrl: character.imageUrl || character.image?.url || null,
          }
        : { id: binding.characterId, name: null, level: null, rarity: null, imageUrl: null },
    });
  }

  return {
    slots,
    synced: moved.map((entry) => ({
      tokenId: entry.tokenId,
      characterId: entry.characterId,
      from: entry.fromWallet,
    })),
  };
}

module.exports = {
  LOCAL_IMAGES_DIR,
  LOCAL_IMAGE_PREFIX,
  MAX_SUPPLY,
  bindCharacterToSlot,
  buildCollectionMetadata,
  buildPlaceholderMetadata,
  ensureOwnerIndex,
  getWalletTokenIds,
  getTokenMetadata,
  listWalletSlots,
  moveBoundCharacter,
  cancelUnbindRequest,
  normalizeTokenId,
  processPendingUnbinds,
  refreshBoundCharacterMetadata,
  requestUnbindSlot,
  requestMarketplaceRefresh,
  snapshotCharacterImage,
  syncTransfers,
  syncWalletSlots,
};
