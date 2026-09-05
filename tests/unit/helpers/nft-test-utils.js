const fs = require("fs/promises");
const os = require("os");
const path = require("path");

// Isolated env + fake chain for NFT slots demo tests (feature 016). Profiles
// and the nft state use the real stores against a temp cwd; the chain is
// always injected.

const STORE_PATH = path.resolve(__dirname, "../../../api/_lib/store.js");
const NFT_STORE_PATH = path.resolve(__dirname, "../../../api/_lib/nft-store.js");
const NFT_PATH = path.resolve(__dirname, "../../../api/_lib/nft.js");
const NFT_CHAIN_PATH = path.resolve(__dirname, "../../../api/_lib/nft-chain.js");
const ECONOMY_CONFIG_PATH = path.resolve(__dirname, "../../../api/_lib/economy-config.js");

const BASE_NOW = Date.parse("2026-09-02T12:00:00.000Z");

function clearModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
}

function freshRequire(modulePath) {
  clearModule(modulePath);
  return require(modulePath);
}

function evmWallet(digit) {
  return `0x${String(digit).repeat(40)}`.toLowerCase();
}

function createFakeChain({ owners = {}, blockNumber = 100, enumerable = true } = {}) {
  const state = {
    owners: new Map(
      Object.entries(owners).map(([tokenId, wallet]) => [Number(tokenId), wallet.toLowerCase()])
    ),
    transfers: [],
    blockNumber,
    emitted: [],
    failEmit: false,
    // OpenSea's ERC721SeaDrop is ERC721A: no tokenOfOwnerByIndex, so
    // tokensOfOwner returns null and callers use the Transfer-log index.
    enumerable,
    deploymentBlock: 1,
  };

  return {
    state,
    async getTotalSupply() {
      return state.owners.size ? Math.max(...state.owners.keys()) : 0;
    },
    async ownerOf(tokenId) {
      return state.owners.get(Number(tokenId)) || null;
    },
    async tokensOfOwner(wallet) {
      if (!state.enumerable) return null;
      const target = String(wallet).toLowerCase();
      return [...state.owners.entries()]
        .filter(([, owner]) => owner === target)
        .map(([tokenId]) => tokenId)
        .sort((a, b) => a - b);
    },
    async getBlockNumber() {
      return state.blockNumber;
    },
    async findDeploymentBlock() {
      return state.deploymentBlock;
    },
    async scanTransfers(fromBlock, { maxBlocks = null } = {}) {
      // Mirrors the real chunking cap so tests can exercise a cold-start backlog.
      let toBlock = state.blockNumber;
      if (maxBlocks && toBlock - fromBlock > maxBlocks) toBlock = fromBlock + maxBlocks;
      return {
        toBlock,
        transfers: state.transfers.filter(
          (entry) => entry.blockNumber >= fromBlock && entry.blockNumber <= toBlock
        ),
      };
    },
    async emitMetadataUpdate(tokenId) {
      if (state.failEmit) return false;
      state.emitted.push(Number(tokenId));
      return true;
    },
    /** Test helper: perform an on-chain transfer (updates owners + log). */
    transfer(tokenId, toWallet) {
      const id = Number(tokenId);
      const from = state.owners.get(id) || null;
      state.blockNumber += 1;
      state.owners.set(id, toWallet.toLowerCase());
      state.transfers.push({
        tokenId: id,
        from,
        to: toWallet.toLowerCase(),
        blockNumber: state.blockNumber,
      });
    },
    /** Test helper: mint (Transfer from the zero address), as a drop would. */
    mintTo(tokenId, toWallet) {
      const id = Number(tokenId);
      state.blockNumber += 1;
      state.owners.set(id, toWallet.toLowerCase());
      state.transfers.push({
        tokenId: id,
        from: "0x0000000000000000000000000000000000000000",
        to: toWallet.toLowerCase(),
        blockNumber: state.blockNumber,
      });
    },
  };
}

function makeCharacter(overrides = {}) {
  return {
    id: overrides.id || "char_aaaa1111-2222-3333-4444-555566667777",
    status: "completed",
    creatureType: "cat",
    rarity: "Epic",
    name: "Nova Cub",
    displayName: "Nova Cub",
    level: 1,
    experience: 0,
    softCurrency: 0,
    attributePointsAvailable: 0,
    attributes: { stamina: 4, agility: 2, strength: 3, intelligence: 4 },
    variables: {
      ELEMENT: "Origami paper",
      PROFESSION_STYLE: "Twitch streamer",
      TOP_ITEM: "",
      ELEMENT_EFFECTS: "Floating jigsaw pieces",
      BODY_COLOR: "",
      FACIAL_FEATURES: "Half-closed lazy eyes",
      SIDE_DETAILS: "",
    },
    selectedPowerId: "power-2",
    powers: [
      { id: "power-1", title: "Paper Cut", description: "Slice." },
      { id: "power-2", title: "Paper Storm", description: "Storm." },
      { id: "power-3", title: "Fold Guard", description: "Guard." },
    ],
    image: {},
    farmState: { active: false, startedAt: null, lastClaimedAt: null },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    completedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

async function withNftEnv(run) {
  const originalCwd = process.cwd();
  const originalEnv = {
    NODE_ENV: process.env.NODE_ENV,
    NFT_ENABLED: process.env.NFT_ENABLED,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    NFT_PINATA_JWT: process.env.NFT_PINATA_JWT,
    INTERNAL_API_SECRET: process.env.INTERNAL_API_SECRET,
  };
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "petix-nft-"));

  try {
    process.chdir(tempDir);
    process.env.NODE_ENV = "test";
    process.env.NFT_ENABLED = "1";
    process.env.INTERNAL_API_SECRET = "petix-nft-internal-secret";
    delete process.env.BLOB_READ_WRITE_TOKEN;
    delete process.env.NFT_PINATA_JWT;

    const store = freshRequire(STORE_PATH);
    const economyConfig = freshRequire(ECONOMY_CONFIG_PATH);
    freshRequire(NFT_CHAIN_PATH);
    const nftStore = freshRequire(NFT_STORE_PATH);
    const nft = freshRequire(NFT_PATH);

    const chain = createFakeChain();
    const configOverrides = {};
    const deps = {
      chain,
      store: nftStore,
      profiles: {
        getWalletProfile: store.getWalletProfile,
        saveWalletProfile: store.saveWalletProfile,
        updateWalletProfile: store.updateWalletProfile,
      },
      getConfig: async () => ({ ...economyConfig.getDefaults(), ...configOverrides }),
      deleteStoredImage: async () => {},
      snapshotImage: async (tokenId, character) => ({
        imageUri: `ipfs://fake-${tokenId}-${character.id}`,
        imageGatewayUrl: `https://gateway.test/ipfs/fake-${tokenId}-${character.id}`,
      }),
      now: () => BASE_NOW,
    };

    return await run({
      chain,
      configOverrides,
      deps,
      economyConfig,
      nft,
      nftStore,
      store,
      tempDir,
    });
  } finally {
    clearModule(NFT_PATH);
    clearModule(NFT_STORE_PATH);
    clearModule(NFT_CHAIN_PATH);
    clearModule(ECONOMY_CONFIG_PATH);
    clearModule(STORE_PATH);
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function seedCharacters(store, wallet, characters, extra = {}) {
  await store.updateWalletProfile(wallet, (current) => ({
    ...current,
    ...extra,
    characters,
  }));
}

module.exports = {
  BASE_NOW,
  createFakeChain,
  evmWallet,
  makeCharacter,
  seedCharacters,
  withNftEnv,
};
