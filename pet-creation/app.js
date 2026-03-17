const TYPES = ["Dragon", "Phoenix", "Cat", "Owl", "Ape", "Panda", "Undead", "Other"];
const DEFAULT_ATTRIBUTE_POINTS = 15;
const DEFAULT_CHARACTER_IMAGE = "/assets/character/current-pet.jpg";
const ENABLE_ARENA = false;
const DEFAULT_DASHBOARD_ENERGY_MAX = 3;
const DEFAULT_DASHBOARD_ENERGY_CURRENT = 3;
const API_BASE_URL = window.PETIX_API_BASE_URL || "";
const DASHBOARD_DEMO_IMAGE_PATHS = [
  "/dashboard-demo/Image%20(Dragon%20character).png",
  "/dashboard-demo/Image%20(Cat%20character).png",
  "/dashboard-demo/Image%20(Owl%20character).png",
];
const RARITY_META = {
  legendary: { label: "Legendary", color: "#f79009", points: 15 },
  epic: { label: "Epic", color: "#7a5af8", points: 13 },
  rare: { label: "Rare", color: "#0ba5ec", points: 12 },
  common: { label: "Common", color: "#667085", points: 10 },
};

const walletConfigs = {
  phantom: {
    label: "Phantom",
    installUrl: "https://phantom.app/",
    mobileBrowseUrl: (targetUrl) => {
      const encodedTarget = encodeURIComponent(targetUrl);
      const encodedRef = encodeURIComponent(window.location.origin);
      return `https://phantom.app/ul/browse/${encodedTarget}?ref=${encodedRef}`;
    },
    getProvider: () => {
      if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
      if (window.solana?.isPhantom) return window.solana;
      return null;
    },
  },
  solflare: {
    label: "Solflare",
    installUrl: "https://solflare.com/",
    mobileBrowseUrl: (targetUrl) => {
      const encodedTarget = encodeURIComponent(targetUrl);
      const encodedRef = encodeURIComponent(window.location.origin);
      return `https://solflare.com/ul/v1/browse/${encodedTarget}?ref=${encodedRef}`;
    },
    getProvider: () => {
      if (window.solflare?.isSolflare) return window.solflare;
      if (window.SolflareApp) return window.SolflareApp;
      return null;
    },
  },
  trust: {
    label: "Trust Wallet",
    installUrl: "https://trustwallet.com/browser-extension",
    mobileBrowseUrl: (targetUrl) =>
      `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(targetUrl)}`,
    getProvider: () => {
      if (window.trustwallet?.solana) return window.trustwallet.solana;
      if (window.trustWallet?.solana) return window.trustWallet.solana;
      if (window.solana?.isTrust) return window.solana;
      return null;
    },
  },
};
const ADMIN_WALLETS = ["AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9"];
const MAX_CHARACTERS_PER_WALLET = 3;
const CUSTOM_CREATURE_TYPE_MAX_LENGTH = 24;
const ADMIN_PAGE_SIZE = 20;
const CREATION_ROUTE = "/pet-creation/";
const DASHBOARD_ROUTE = "/dashboard/";
const ADMIN_ROUTE = "/admin/";
const BATTLE_ROUTE = "/battle/";
const CLIENT_LOG_ENDPOINT = "/api/client-log";

const TYPE_META = {
  Dragon: {
    default: { primary: "/assets/pet-types/dragon-default.svg" },
    hover: { primary: "/assets/pet-types/dragon-hover.svg" },
    active: { primary: "/assets/pet-types/dragon-active.svg" },
  },
  Phoenix: {
    default: { primary: "/assets/pet-types/phoenix-default.svg" },
    hover: { primary: "/assets/pet-types/phoenix-hover.svg" },
    active: { primary: "/assets/pet-types/phoenix-active.svg" },
  },
  Cat: {
    default: { primary: "/assets/pet-types/cat-default.svg" },
    hover: { primary: "/assets/pet-types/cat-hover.svg" },
    active: { primary: "/assets/pet-types/cat-active.svg" },
  },
  Owl: {
    default: { primary: "/assets/pet-types/owl-default.svg" },
    hover: { primary: "/assets/pet-types/owl-hover.svg" },
    active: { primary: "/assets/pet-types/owl-active.svg" },
  },
  Ape: {
    default: { primary: "/assets/pet-types/ape-default.svg" },
    hover: { primary: "/assets/pet-types/ape-hover.svg" },
    active: { primary: "/assets/pet-types/ape-active.svg" },
  },
  Panda: {
    default: { primary: "/assets/pet-types/panda-default.svg" },
    hover: { primary: "/assets/pet-types/panda-hover.svg" },
    active: { primary: "/assets/pet-types/panda-active.svg" },
  },
  Undead: {
    default: { primary: "/assets/pet-types/undead-default.svg" },
    hover: { primary: "/assets/pet-types/undead-hover.svg" },
    active: { primary: "/assets/pet-types/undead-active.svg" },
  },
  Other: {
    default: { primary: "/assets/pet-types/other-default.svg" },
    hover: { primary: "/assets/pet-types/other-hover.svg" },
    active: { primary: "/assets/pet-types/other-active.svg" },
  },
};

const POWER_ICONS = {
  default: "/assets/powers-step/power-icon-default.svg",
  active: "/assets/powers-step/power-icon-active.svg",
};
const SUCCESS_POWER_ICON = "/assets/character/power-sparkle.svg";
const ARENA_ROULETTE_ITEM_SIZE = 160;
const ARENA_ROULETTE_GAP = 24;
const ARENA_ROULETTE_STEP = ARENA_ROULETTE_ITEM_SIZE + ARENA_ROULETTE_GAP;
const ARENA_ROULETTE_REPEAT_COUNT = 5;
const ARENA_ROULETTE_TRAVEL_ITEMS = 22;
const ARENA_ROULETTE_DURATION = 4800;
const ARENA_FOCUS_CARD_DELAY = 1100;
const ARENA_PREPARE_MIN_SPINNER_DURATION = 1600;
const ARENA_IMAGE_TARGET_SIZE = 512;
const ARENA_BATTLE_LAUNCH_DELAY = 900;

const ARENA_OPPONENT_POOL = [
  {
    id: "opponent-benny-bonnie",
    name: "Benny Bonnie",
    creatureType: "Burger Moth",
    imageUrl: "https://www.figma.com/api/mcp/asset/f02fbff3-bf67-4c57-9434-55e9c86a3666",
    rarity: "rare",
    attributes: { stamina: 4, agility: 6, strength: 5, intelligence: 5 },
    selectedPower: { description: "At the beginning of the battle, summons a skeleton warrior" },
  },
  {
    id: "opponent-sweet-bombino",
    name: "Sweet Bombino",
    creatureType: "Cyber Bunny",
    imageUrl: "https://www.figma.com/api/mcp/asset/b2560924-0557-4db8-9bd7-3548e6deb26d",
    rarity: "rare",
    attributes: { stamina: 4, agility: 6, strength: 5, intelligence: 5 },
    selectedPower: { description: "At the beginning of the battle, summons a skeleton warrior" },
  },
  {
    id: "opponent-frost-fizz",
    name: "Frost Fizz",
    creatureType: "Bubble Cake",
    imageUrl: "https://www.figma.com/api/mcp/asset/b2bb3e64-9975-4a40-82ee-13865f31cfa5",
    rarity: "rare",
    attributes: { stamina: 5, agility: 4, strength: 4, intelligence: 6 },
    selectedPower: { description: "Covers the arena with sparkling frost and slows the target." },
  },
  {
    id: "opponent-ember-crust",
    name: "Ember Crust",
    creatureType: "Molten Pastry",
    imageUrl: "https://www.figma.com/api/mcp/asset/948e3ddd-1038-45b2-ae85-365d527547e8",
    rarity: "rare",
    attributes: { stamina: 5, agility: 3, strength: 6, intelligence: 4 },
    selectedPower: { description: "Ignites the ground and gains bonus damage on the next strike." },
  },
  {
    id: "opponent-toast-rider",
    name: "Toast Rider",
    creatureType: "Toast Sprite",
    imageUrl: "https://www.figma.com/api/mcp/asset/44ad6112-e6ec-4098-a95b-272d791909bd",
    rarity: "rare",
    attributes: { stamina: 4, agility: 5, strength: 4, intelligence: 6 },
    selectedPower: { description: "Summons a hot gust that raises critical chance for one round." },
  },
  {
    id: "opponent-gilded-core",
    name: "Gilded Core",
    creatureType: "Clockwork Relic",
    imageUrl: "https://www.figma.com/api/mcp/asset/e6270898-8c2a-4bcf-af64-fd36f2e6d117",
    rarity: "rare",
    attributes: { stamina: 6, agility: 3, strength: 5, intelligence: 5 },
    selectedPower: { description: "Deploys a brass shell and reduces incoming damage." },
  },
  {
    id: "opponent-jelly-spark",
    name: "Jelly Spark",
    creatureType: "Arc Jelly",
    imageUrl: "https://www.figma.com/api/mcp/asset/c57367f5-f7c1-4b17-bad0-dd9bc3b4f301",
    rarity: "rare",
    attributes: { stamina: 3, agility: 6, strength: 4, intelligence: 6 },
    selectedPower: { description: "Releases static arcs that chain between targets in the arena." },
  },
  {
    id: "opponent-night-captain",
    name: "Night Captain",
    creatureType: "Abyss Corsair",
    imageUrl: "https://www.figma.com/api/mcp/asset/995470d1-ccbd-4b11-91aa-85ed21eea56b",
    rarity: "rare",
    attributes: { stamina: 4, agility: 5, strength: 5, intelligence: 5 },
    selectedPower: { description: "Summons a shadow tide and slips out of the first hit." },
  },
  {
    id: "opponent-panda-drift",
    name: "Panda Drift",
    creatureType: "Turbo Panda",
    imageUrl: "https://www.figma.com/api/mcp/asset/ec89c239-bdf2-43a8-b95a-b356e985f24f",
    rarity: "rare",
    attributes: { stamina: 6, agility: 4, strength: 5, intelligence: 3 },
    selectedPower: { description: "Charges through the lane and gains bonus armor on impact." },
  },
  {
    id: "opponent-sand-cube",
    name: "Sand Cube",
    creatureType: "Rune Block",
    imageUrl: "https://www.figma.com/api/mcp/asset/8f5b9a53-464d-4e6e-bdc8-8b96b2dd9576",
    rarity: "rare",
    attributes: { stamina: 5, agility: 4, strength: 4, intelligence: 6 },
    selectedPower: { description: "Builds a dust mirage that weakens the enemy's next ability." },
  },
  {
    id: "opponent-bloom-byte",
    name: "Bloom Byte",
    creatureType: "Pixel Bloom",
    imageUrl: "https://www.figma.com/api/mcp/asset/736bdcba-4025-41ba-93f5-a199245bbc1f",
    rarity: "rare",
    attributes: { stamina: 4, agility: 5, strength: 3, intelligence: 7 },
    selectedPower: { description: "Splits into neon petals and boosts spell effectiveness." },
  },
  {
    id: "opponent-hex-crate",
    name: "Hex Crate",
    creatureType: "Curse Box",
    imageUrl: "https://www.figma.com/api/mcp/asset/60debe2b-c983-453d-adb9-af86adfc3421",
    rarity: "rare",
    attributes: { stamina: 4, agility: 4, strength: 5, intelligence: 6 },
    selectedPower: { description: "Marks the target with a hex and amplifies the next direct hit." },
  },
];

const ATTRS = [
  {
    key: "stamina",
    icon: "/assets/attrs-step/stamina.svg",
    label: "Stamina",
    desc: "Increases endurance and ability to sustain prolonged activities.",
  },
  {
    key: "agility",
    icon: "/assets/attrs-step/agility.svg",
    label: "Agility",
    desc: "Enhances speed and dexterity, improving evasion and finesse.",
  },
  {
    key: "strength",
    icon: "/assets/attrs-step/strength.svg",
    label: "Strength",
    desc: "Boosts physical power, affecting melee damage and carrying capacity.",
  },
  {
    key: "intelligence",
    icon: "/assets/attrs-step/intelligence.svg",
    label: "Intelligence",
    desc: "Improves learning ability and effectiveness in magic or problem-solving.",
  },
];

const screenType = document.getElementById("screenType");
const screenProcess = document.getElementById("screenProcess");
const screenPowers = document.getElementById("screenPowers");
const screenAttrs = document.getElementById("screenAttrs");
const screenSuccess = document.getElementById("screenSuccess");
const screenCabinet = document.getElementById("screenCabinet");
const screenArena = document.getElementById("screenArena");
const screenAdmin = document.getElementById("screenAdmin");
const typeContinueBtn = document.getElementById("typeContinueBtn");
const otherInputWrap = document.getElementById("otherInputWrap");
const otherTypeInput = document.getElementById("otherTypeInput");
const powersGrid = document.getElementById("powersGrid");
const powersContinueBtn = document.getElementById("powersContinueBtn");
const powersTitle = document.getElementById("powersTitle");
const powersRarityBadge = document.querySelector(".pet-rarity-badge");
const attrsList = document.getElementById("attrsList");
const pointsLeft = document.getElementById("pointsLeft");
const attrsContinueBtn = document.getElementById("attrsContinueBtn");
const attrsPetRarity = document.querySelector(".attrs-pet-rarity");
const successPetName = document.getElementById("successPetName");
const successCardRarity = document.querySelector(".success-card-rarity");
const successStats = document.getElementById("successStats");
const successPowerText = document.getElementById("successPowerText");
const cabinetCard = document.getElementById("cabinetCard");
const cabinetCount = document.getElementById("cabinetCount");
const createAnotherBtn = document.getElementById("createAnotherBtn");
const dashboardTabMyPets = document.getElementById("dashboardTabMyPets");
const dashboardTabArena = document.getElementById("dashboardTabArena");
const arenaStartFightBtn = document.getElementById("arenaStartFightBtn");
const dashboardEnergy = document.getElementById("dashboardEnergy");
const dashboardEnergyCurrent = document.getElementById("dashboardEnergyCurrent");
const dashboardEnergyMax = document.getElementById("dashboardEnergyMax");
const arenaIdleState = document.getElementById("arenaIdleState");
const arenaBattleState = document.getElementById("arenaBattleState");
const arenaStageTitle = document.getElementById("arenaStageTitle");
const arenaRoulette = document.getElementById("arenaRoulette");
const arenaRouletteTrack = document.getElementById("arenaRouletteTrack");
const arenaRouletteFocus = document.getElementById("arenaRouletteFocus");
const arenaRouletteFocusImage = document.getElementById("arenaRouletteFocusImage");
const arenaFocusCard = document.getElementById("arenaFocusCard");
const arenaVersus = document.getElementById("arenaVersus");
const arenaOpponentCard = document.getElementById("arenaOpponentCard");
const arenaPlayerCard = document.getElementById("arenaPlayerCard");
const connectTrigger = document.getElementById("connectTrigger");
const walletOverlay = document.getElementById("walletOverlay");
const walletClose = document.getElementById("walletClose");
const walletMenu = document.getElementById("walletMenu");
const walletMenuCreatePet = document.getElementById("walletMenuCreatePet");
const walletMenuDashboard = document.getElementById("walletMenuDashboard");
const walletMenuAdmin = document.getElementById("walletMenuAdmin");
const walletMenuLogout = document.getElementById("walletMenuLogout");
const walletAuthPanel = document.getElementById("walletAuthPanel");
const walletLoggedPanel = document.getElementById("walletLoggedPanel");
const walletStatus = document.getElementById("walletStatus");
const loggedWalletAddress = document.getElementById("loggedWalletAddress");
const continueBtn = document.getElementById("continueBtn");
const claimRewardsBtn = document.getElementById("claimRewardsBtn");
const attrsSidePanel = document.querySelector(".attrs-side-panel");
const walletButtons = document.querySelectorAll(".wallet-item");
const detectedBadges = document.querySelectorAll("[data-detected-for]");
const progressWrap = document.querySelector(".progress-wrap");
const adminCount = document.getElementById("adminCount");
const adminUsersCount = document.getElementById("adminUsersCount");
const adminCharactersCount = document.getElementById("adminCharactersCount");
const adminRarityCommon = document.getElementById("adminRarityCommon");
const adminRarityRare = document.getElementById("adminRarityRare");
const adminRarityEpic = document.getElementById("adminRarityEpic");
const adminRarityLegendary = document.getElementById("adminRarityLegendary");
const adminSearchInput = document.getElementById("adminSearchInput");
const adminSearchLabel = document.getElementById("adminSearchLabel");
const adminTableBody = document.getElementById("adminTableBody");
const adminTableHeadRow = document.getElementById("adminTableHeadRow");
const adminEmpty = document.getElementById("adminEmpty");
const adminRefreshBtn = document.getElementById("adminRefreshBtn");
const adminExportBtn = document.getElementById("adminExportBtn");
const adminBackToDashboardBtn = document.getElementById("adminBackToDashboardBtn");
const adminNavCharacters = document.getElementById("adminNavCharacters");
const adminNavWaitlist = document.getElementById("adminNavWaitlist");
const adminPagination = document.getElementById("adminPagination");
const adminPageInfo = document.getElementById("adminPageInfo");
const adminPrevBtn = document.getElementById("adminPrevBtn");
const adminNextBtn = document.getElementById("adminNextBtn");
const adminStatLabel1 = document.getElementById("adminStatLabel1");
const adminStatLabel2 = document.getElementById("adminStatLabel2");
const adminStatLabel3 = document.getElementById("adminStatLabel3");
const adminStatLabel4 = document.getElementById("adminStatLabel4");
const adminStatLabel5 = document.getElementById("adminStatLabel5");
const adminStatLabel6 = document.getElementById("adminStatLabel6");
const processTitle = screenProcess.querySelector("h1");
const processText = screenProcess.querySelector("p");
const characterImages = document.querySelectorAll(
  ".pet-result-image, .attrs-pet-image, .success-card-image"
);

const barType = document.getElementById("barType");
const barPowers = document.getElementById("barPowers");
const barAttrs = document.getElementById("barAttrs");
const labelType = document.getElementById("labelType");
const labelPowers = document.getElementById("labelPowers");
const labelAttrs = document.getElementById("labelAttrs");

let suppressRewardsTooltipTimeout = null;
let attrsRowsBudget = 0;
let toastTimeoutId = 0;
let creatureTypeLimitToastAt = 0;
let adminImageLightbox = null;
let adminLightboxImage = null;
let adminLightboxCaption = null;
let arenaAnimationFrameId = 0;
let arenaTimeoutIds = [];
let arenaFocusedSequenceIndex = -1;
const arenaImagePromises = new Map();

const state = {
  step: "type",
  selectedType: "",
  selectedPowerId: "",
  isAuthenticated: false,
  isAdmin: false,
  isStarting: false,
  isSavingPower: false,
  isCreating: false,
  pendingStartAfterAuth: false,
  walletAddress: "",
  draft: null,
  character: null,
  characters: [],
  hasHydratedCharacters: false,
  adminSection: "characters",
  adminCharacters: [],
  hasLoadedAdminCharacters: false,
  adminWalletQuery: "",
  adminPage: 1,
  expandedAdminCharacterIds: [],
  isAdminLoading: false,
  deletingAdminCharacterId: "",
  adminErrorMessage: "",
  adminWaitlistEntries: [],
  hasLoadedAdminWaitlist: false,
  adminWaitlistQuery: "",
  adminWaitlistPage: 1,
  isAdminWaitlistLoading: false,
  adminWaitlistErrorMessage: "",
  attrs: createEmptyAttrs(),
  energyCurrent: DEFAULT_DASHBOARD_ENERGY_CURRENT,
  energyMax: DEFAULT_DASHBOARD_ENERGY_MAX,
  isFightPreparing: false,
  fightPreparingCharacterId: "",
  dashboardDemoImageById: {},
  activeBattle: null,
};

function createEmptyAttrs() {
  return {
    stamina: 0,
    agility: 0,
    strength: 0,
    intelligence: 0,
  };
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function shortenAddress(address) {
  if (!address || address.length < 12) return address || "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function isAdminWalletAddress(address) {
  const normalized = String(address || "").trim();
  return Boolean(normalized) && ADMIN_WALLETS.includes(normalized);
}

function formatDateTime(value) {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAdminFieldLabel(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getRecordLevel(record) {
  return Math.max(1, Math.floor(Number(record?.level) || 1));
}

function getRecordExperience(record) {
  return Math.max(0, Math.floor(Number(record?.experience) || 0));
}

function getRecordExperienceForNextLevel(record) {
  return Math.max(1, Math.floor(Number(record?.experienceForNextLevel) || 500));
}

function getRecordExperienceProgress(record) {
  const total = getRecordExperienceForNextLevel(record);
  const current = getRecordExperience(record);
  return Math.max(0, Math.min(100, (current / total) * 100));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function ensureAdminImageLightbox() {
  if (adminImageLightbox && adminLightboxImage && adminLightboxCaption) {
    return;
  }

  adminImageLightbox = document.createElement("div");
  adminImageLightbox.className = "admin-lightbox hidden";
  adminImageLightbox.setAttribute("aria-hidden", "true");

  const content = document.createElement("div");
  content.className = "admin-lightbox-content";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "admin-lightbox-close";
  closeBtn.setAttribute("aria-label", "Close preview");
  closeBtn.textContent = "x";

  adminLightboxImage = document.createElement("img");
  adminLightboxImage.className = "admin-lightbox-image";
  adminLightboxImage.alt = "";

  adminLightboxCaption = document.createElement("p");
  adminLightboxCaption.className = "admin-lightbox-caption";

  content.append(closeBtn, adminLightboxImage, adminLightboxCaption);
  adminImageLightbox.appendChild(content);
  document.body.appendChild(adminImageLightbox);

  closeBtn.addEventListener("click", closeAdminImageLightbox);
  adminImageLightbox.addEventListener("click", (event) => {
    if (event.target === adminImageLightbox) {
      closeAdminImageLightbox();
    }
  });
}

function openAdminImageLightbox(src, alt, caption) {
  if (!src) return;

  ensureAdminImageLightbox();
  adminLightboxImage.src = src;
  adminLightboxImage.alt = alt || "";
  adminLightboxCaption.textContent = caption || "";
  adminImageLightbox.classList.remove("hidden");
  adminImageLightbox.setAttribute("aria-hidden", "false");
}

function closeAdminImageLightbox() {
  if (!adminImageLightbox) return;

  adminImageLightbox.classList.add("hidden");
  adminImageLightbox.setAttribute("aria-hidden", "true");
  if (adminLightboxImage) {
    adminLightboxImage.src = "";
    adminLightboxImage.alt = "";
  }
  if (adminLightboxCaption) {
    adminLightboxCaption.textContent = "";
  }
}

function setWalletStatus(message, type = "neutral") {
  walletStatus.textContent = message;
  walletStatus.classList.toggle("success", type === "success");
  walletStatus.classList.toggle("error", type === "error");
}

function showToast(message) {
  if (!message) return;

  let toast = document.getElementById("appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("visible");

  if (toastTimeoutId) {
    window.clearTimeout(toastTimeoutId);
  }

  toastTimeoutId = window.setTimeout(() => {
    toast.classList.remove("visible");
    toastTimeoutId = 0;
  }, 3200);
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent || "");
}

function canUseWalletBrowseDeeplink() {
  return isMobileDevice() && window.location.protocol === "https:";
}

function showCreatureTypeLimitToast() {
  const now = Date.now();
  if (now - creatureTypeLimitToastAt < 1200) return;
  creatureTypeLimitToastAt = now;
  showToast(`Character type is limited to ${CUSTOM_CREATURE_TYPE_MAX_LENGTH} characters.`);
}

function willOtherTypeInputExceedLimit(input, insertedLength) {
  const maxLength = input.maxLength > 0 ? input.maxLength : CUSTOM_CREATURE_TYPE_MAX_LENGTH;
  const selectionStart = input.selectionStart ?? input.value.length;
  const selectionEnd = input.selectionEnd ?? input.value.length;
  const selectedLength = Math.max(0, selectionEnd - selectionStart);
  const nextLength = input.value.length - selectedLength + insertedLength;

  return insertedLength > 0 && nextLength > maxLength;
}

function updateAdminAccessUi() {
  if (!walletMenuAdmin) return;
  walletMenuAdmin.classList.toggle("hidden", !state.isAdmin);
}

function updateCreatePetMenuState() {
  if (!walletMenuCreatePet) return;

  const isBlocked = state.isAuthenticated && !hasCharacterCreationCapacity();
  walletMenuCreatePet.classList.toggle("disabled", isBlocked);
  walletMenuCreatePet.setAttribute("aria-disabled", isBlocked ? "true" : "false");
  walletMenuCreatePet.title = isBlocked
    ? `Character limit reached. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`
    : "";
}

async function apiRequest(path, body, method = "POST") {
  const response = await fetch(toApiUrl(path), {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    credentials: "include",
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "Request failed.");
  }
  return data;
}

function toApiUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

function reportClientIssue(event, details = {}) {
  if (!event) return;

  const payload = {
    event,
    step: state.step,
    selectedPowerId: state.selectedPowerId || "",
    draftId: state.draft?.id || "",
    path: window.location.pathname,
    ...details,
  };
  const url = toApiUrl(CLIENT_LOG_ENDPOINT);
  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(url, blob);
    return;
  }

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    keepalive: true,
    body,
  }).catch(() => {});
}

function normalizeCharacterRecord(record) {
  if (!record) return null;

  return {
    ...record,
    imageUrl: record.imageUrl ? toApiUrl(record.imageUrl) : DEFAULT_CHARACTER_IMAGE,
  };
}

function buildDashboardDemoImageMap(records = []) {
  if (!ENABLE_ARENA) {
    return {};
  }

  const map = {};

  records.slice(0, DASHBOARD_DEMO_IMAGE_PATHS.length).forEach((record, index) => {
    if (!record?.id) return;
    map[String(record.id)] = DASHBOARD_DEMO_IMAGE_PATHS[index];
  });

  return map;
}

function applyDashboardDemoImage(record) {
  if (!ENABLE_ARENA) {
    return record;
  }

  if (!record) return null;

  const demoImageUrl = state.dashboardDemoImageById[String(record.id)];
  if (!demoImageUrl) {
    return record;
  }

  return {
    ...record,
    imageUrl: demoImageUrl,
  };
}

function openWalletModal() {
  hideWalletMenu();
  walletOverlay.classList.remove("hidden");
  walletOverlay.setAttribute("aria-hidden", "false");
}

function closeWalletModal() {
  walletOverlay.classList.add("hidden");
  walletOverlay.setAttribute("aria-hidden", "true");
}

function showLoggedWalletState({ walletAddress, isAdmin = false }) {
  state.isAuthenticated = true;
  state.isAdmin = Boolean(isAdmin) || isAdminWalletAddress(walletAddress);
  state.walletAddress = walletAddress || "";
  walletAuthPanel.classList.add("hidden");
  walletLoggedPanel.classList.remove("hidden");
  walletClose.classList.add("hidden");
  loggedWalletAddress.textContent = walletAddress;
  connectTrigger.textContent = shortenAddress(walletAddress);
  updateAdminAccessUi();
  updateCreatePetMenuState();
}

function showWalletAuthState() {
  state.isAuthenticated = false;
  state.isAdmin = false;
  state.walletAddress = "";
  state.adminSection = "characters";
  state.adminCharacters = [];
  state.adminWalletQuery = "";
  state.isAdminLoading = false;
  state.deletingAdminCharacterId = "";
  state.adminErrorMessage = "";
  state.adminWaitlistEntries = [];
  state.adminWaitlistQuery = "";
  state.adminWaitlistPage = 1;
  state.isAdminWaitlistLoading = false;
  state.adminWaitlistErrorMessage = "";
  state.hasLoadedAdminCharacters = false;
  state.hasLoadedAdminWaitlist = false;
  state.activeBattle = null;
  state.energyCurrent = DEFAULT_DASHBOARD_ENERGY_CURRENT;
  state.isFightPreparing = false;
  state.fightPreparingCharacterId = "";
  state.dashboardDemoImageById = {};
  walletLoggedPanel.classList.add("hidden");
  walletAuthPanel.classList.remove("hidden");
  walletClose.classList.remove("hidden");
  setWalletStatus("");
  connectTrigger.textContent = "Connect wallet";
  if (adminSearchInput) adminSearchInput.value = "";
  clearArenaAnimation();
  updateEnergyUi();
  hideWalletMenu();
  updateAdminAccessUi();
  updateCreatePetMenuState();
}

function extractSignatureBytes(signatureResult) {
  if (signatureResult instanceof Uint8Array) return signatureResult;
  if (signatureResult?.signature instanceof Uint8Array) return signatureResult.signature;
  throw new Error("Wallet signature format is not supported.");
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function getActiveRecord() {
  return state.character || state.draft;
}

function getPowerOptions() {
  return getActiveRecord()?.powers || [];
}

function getSelectedPowerDescription(record) {
  return record?.selectedPower?.description || "Power not selected yet";
}

function normalizeRarityLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();

  if (normalized === "legendary") return "legendary";
  if (normalized === "epic" || normalized === "epix") return "epic";
  if (normalized === "rare") return "rare";
  if (normalized === "common") return "common";
  return "legendary";
}

function getRarityMeta(label) {
  return RARITY_META[normalizeRarityLabel(label)] || RARITY_META.legendary;
}

function getAttributePointBudget(record = getActiveRecord()) {
  const explicitBudget = Number(record?.attributePoints);
  if (Number.isInteger(explicitBudget) && explicitBudget > 0) {
    return explicitBudget;
  }

  return getRarityMeta(record?.rarity).points || DEFAULT_ATTRIBUTE_POINTS;
}

function applyRarityBadge(element, rarityLabel) {
  if (!element) return;

  const rarity = getRarityMeta(rarityLabel);
  element.textContent = rarity.label;
  element.style.backgroundColor = rarity.color;
}

function syncDisplayedRarity(record) {
  applyRarityBadge(powersRarityBadge, record?.rarity);
  applyRarityBadge(attrsPetRarity, record?.rarity);
  applyRarityBadge(successCardRarity, record?.rarity);
}

function getCurrentCreatureType() {
  return getActiveRecord()?.creatureType || getResolvedType() || "Pet";
}

function getCurrentCharacterName() {
  const record = getActiveRecord();
  if (record?.name) {
    return record.name;
  }

  if (record?.displayName && record.displayName !== record.creatureType) {
    return record.displayName;
  }

  return "";
}

function hasCharacterCreationCapacity() {
  return state.isAdmin || state.characters.length < MAX_CHARACTERS_PER_WALLET;
}

function setCharacterImages(src, creatureType) {
  characterImages.forEach((image) => {
    image.src = src || DEFAULT_CHARACTER_IMAGE;
    image.alt = creatureType ? `${creatureType} character` : "";
  });
}

function syncTypeSelectionWithRecord(record) {
  const creatureType = record?.creatureType || "";
  if (!creatureType) {
    state.selectedType = "";
    otherTypeInput.value = "";
    return;
  }

  if (TYPES.includes(creatureType)) {
    state.selectedType = creatureType;
    otherTypeInput.value = "";
    return;
  }

  state.selectedType = "Other";
  otherTypeInput.value = creatureType;
}

function syncStateWithPayload(payload = {}) {
  if (Array.isArray(payload.characters)) {
    state.characters = payload.characters.map(normalizeCharacterRecord);
    state.dashboardDemoImageById = buildDashboardDemoImageMap(state.characters);
    state.characters = state.characters.map(applyDashboardDemoImage);
    state.hasHydratedCharacters = true;
  }

  if ("draft" in payload) {
    state.draft = applyDashboardDemoImage(normalizeCharacterRecord(payload.draft));
  }

  if ("character" in payload) {
    state.character = applyDashboardDemoImage(normalizeCharacterRecord(payload.character));
    if (payload.character) {
      state.draft = null;
    }
  } else if (!state.draft) {
    state.character = state.characters[state.characters.length - 1] || null;
  }

  const activeRecord = state.draft || state.character;
  state.selectedPowerId = activeRecord?.selectedPowerId || "";
  state.attrs = {
    ...createEmptyAttrs(),
    ...(activeRecord?.attributes || {}),
  };

  if (activeRecord) {
    syncTypeSelectionWithRecord(activeRecord);
    setCharacterImages(activeRecord.imageUrl, activeRecord.creatureType);
    syncDisplayedRarity(activeRecord);
    updateCreatePetMenuState();
    return;
  }

  setCharacterImages(DEFAULT_CHARACTER_IMAGE, "");
  syncDisplayedRarity(null);
  updateCreatePetMenuState();
}

function resetCharacterState({ keepTypeSelection = false, keepCharacters = false } = {}) {
  state.draft = null;
  state.character = null;
  if (!keepCharacters) {
    state.characters = [];
    state.hasHydratedCharacters = false;
  }
  state.selectedPowerId = "";
  state.attrs = createEmptyAttrs();
  setCharacterImages(DEFAULT_CHARACTER_IMAGE, "");
  syncDisplayedRarity(null);

  if (!keepTypeSelection) {
    state.selectedType = "";
    otherTypeInput.value = "";
  }
}

function openCreatePetFromMenu() {
  hideWalletMenu();
  if (!hasCharacterCreationCapacity()) {
    showToast(`Character limit reached. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`);
    return;
  }
  window.location.href = new URL(CREATION_ROUTE, window.location.origin).toString();
}

function openDashboardFromMenu() {
  hideWalletMenu();
  window.location.href = new URL(DASHBOARD_ROUTE, window.location.origin).toString();
}

function syncDashboardTabs(step = state.step) {
  if (!dashboardTabMyPets || !dashboardTabArena) return;

  const isArena = step === "arena";
  dashboardTabMyPets.classList.toggle("active", !isArena);
  dashboardTabArena.classList.toggle("active", isArena);
  dashboardTabMyPets.setAttribute("aria-selected", isArena ? "false" : "true");
  dashboardTabArena.setAttribute("aria-selected", isArena ? "true" : "false");
}

function openAdminPanelFromMenu() {
  hideWalletMenu();
  window.location.href = new URL(ADMIN_ROUTE, window.location.origin).toString();
}

function redirectToLandingAuthPrompt() {
  const targetUrl = new URL("/", window.location.origin);
  targetUrl.searchParams.set("auth", "1");
  window.location.replace(targetUrl.toString());
}

function getRequestedScreen() {
  const screen = new URLSearchParams(window.location.search).get("screen");
  if (!ENABLE_ARENA && screen === "arena") {
    return "";
  }

  return ["type", "cabinet", "admin", "arena"].includes(screen) ? screen : "";
}

function getPageMode() {
  const explicitPage = String(document.body?.dataset?.page || "").trim().toLowerCase();
  if (["creation", "dashboard", "admin"].includes(explicitPage)) {
    return explicitPage;
  }

  const requestedScreen = getRequestedScreen();
  if (requestedScreen === "cabinet") return "dashboard";
  if (requestedScreen === "arena") return "dashboard";
  if (requestedScreen === "admin") return "admin";
  return "creation";
}

function buildBattleReplayUrl(battleId) {
  return new URL(`${BATTLE_ROUTE}${encodeURIComponent(battleId)}`, window.location.origin).toString();
}

function setProcessCopy(title, text) {
  processTitle.textContent = title;
  processText.textContent = text;
}

function handleFlowError(error, fallbackMessage) {
  const message = typeof error?.message === "string" ? error.message : fallbackMessage;
  if (/unauthorized/i.test(message)) {
    setWalletStatus("Connect wallet to create a character.", "error");
    openWalletModal();
    return;
  }
  window.alert(message || fallbackMessage);
}

async function restoreCharacterState() {
  if (!state.isAuthenticated) return false;

  try {
    const data = await apiRequest("/api/character/me", {}, "GET");
    const requestedScreen = getRequestedScreen();
    const pageMode = getPageMode();

    if (pageMode === "creation" && data?.hasDraft && data.draft) {
      syncStateWithPayload(data);
      moveTo(data.draft.selectedPowerId ? "attrs" : "powers");
      return true;
    }

    if ((pageMode === "dashboard" || pageMode === "admin") && data?.hasCharacter && data.character) {
      syncStateWithPayload(data);
      moveTo(
        pageMode === "admin" || requestedScreen === "admin"
          ? "admin"
          : requestedScreen === "arena"
            ? "arena"
            : "cabinet"
      );
      return true;
    }

    syncStateWithPayload(data);

    if (pageMode === "creation" && !state.isAdmin && state.characters.length >= MAX_CHARACTERS_PER_WALLET) {
      moveTo("cabinet");
      return true;
    }

    if (pageMode === "admin" && state.isAdmin) {
      moveTo("admin");
      return true;
    }

    if (pageMode === "dashboard") {
      moveTo(requestedScreen === "arena" ? "arena" : "cabinet");
      return true;
    }

    if (pageMode === "creation") {
      state.character = null;
      state.selectedPowerId = "";
      state.attrs = createEmptyAttrs();
      setCharacterImages(DEFAULT_CHARACTER_IMAGE, "");
      syncDisplayedRarity(null);
    }

    return false;
  } catch {
    return false;
  }
}

async function connectWallet(walletKey) {
  const wallet = walletConfigs[walletKey];
  if (!wallet) return;

  const provider = wallet.getProvider();
  if (!provider) {
    if (canUseWalletBrowseDeeplink() && typeof wallet.mobileBrowseUrl === "function") {
      setWalletStatus(`Opening ${wallet.label} app...`);
      window.location.href = wallet.mobileBrowseUrl(window.location.href);
      return;
    }

    setWalletStatus(`${wallet.label} is not detected. Opening install page...`);
    window.open(wallet.installUrl, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    setWalletStatus(`Connecting ${wallet.label}...`);
    const connectResult = await provider.connect();
    const address =
      connectResult?.publicKey?.toString?.() ||
      provider.publicKey?.toString?.() ||
      "";
    if (!address) throw new Error("Wallet address was not returned.");

    setWalletStatus("Creating sign-in challenge...");
    const challenge = await apiRequest("/api/auth/solana/challenge", { wallet: address });
    const encodedMessage = new TextEncoder().encode(challenge.message);
    if (!provider.signMessage) throw new Error("Wallet does not support message signing.");

    setWalletStatus("Please confirm signature in your wallet...");
    const signatureResult = await provider.signMessage(encodedMessage, "utf8");
    const signatureBase64 = bytesToBase64(extractSignatureBytes(signatureResult));

    setWalletStatus("Verifying signature...");
    const verified = await apiRequest("/api/auth/solana/verify", {
      wallet: address,
      walletType: walletKey,
      message: challenge.message,
      signature: signatureBase64,
      challengeToken: challenge.challengeToken,
    });

    showLoggedWalletState({ walletAddress: verified.wallet, isAdmin: verified.isAdmin });
    setWalletStatus("Wallet connected successfully.", "success");
    const restored = await restoreCharacterState();
    if (restored) {
      state.pendingStartAfterAuth = false;
    }
  } catch (error) {
    const message = typeof error?.message === "string" ? error.message : "Connection failed.";
    setWalletStatus(message, "error");
  }
}

function toggleWalletMenu() {
  if (!state.isAuthenticated) return;
  walletMenu.classList.toggle("hidden");
}

function hideWalletMenu() {
  walletMenu.classList.add("hidden");
}

function refreshDetectedBadges() {
  detectedBadges.forEach((badge) => {
    const walletKey = badge.dataset.detectedFor;
    badge.classList.toggle("hidden", !Boolean(walletConfigs[walletKey]?.getProvider()));
  });
}

async function restoreWalletSession() {
  try {
    const response = await fetch(toApiUrl("/api/auth/solana/me"), {
      method: "GET",
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.authenticated || !data?.wallet) {
      throw new Error("No active session");
    }
    showLoggedWalletState({ walletAddress: data.wallet, isAdmin: data.isAdmin });
    await restoreCharacterState();
  } catch {
    showWalletAuthState();
    redirectToLandingAuthPrompt();
  }
}

async function logoutWallet() {
  await apiRequest("/api/auth/solana/logout", {});
  resetCharacterState();
  showWalletAuthState();
  window.location.href = new URL("/", window.location.origin).toString();
}

function resetStepScroll() {
  if (!window.matchMedia("(max-width: 900px)").matches) return;

  window.requestAnimationFrame(() => {
    const root = document.scrollingElement || document.documentElement;
    if (root) root.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

function showScreen(targetId) {
  [screenType, screenProcess, screenPowers, screenAttrs, screenSuccess, screenCabinet, screenArena, screenAdmin].forEach(
    (screen) => {
      if (!screen) return;
      screen.classList.toggle("hidden", screen.id !== targetId);
    }
  );

  document.body.classList.toggle("success-screen-active", targetId === "screenSuccess");
}

function setProgress(step) {
  if (progressWrap) {
    progressWrap.classList.toggle("hidden", step === "success" || step === "cabinet" || step === "arena" || step === "admin");
  }

  barType.classList.toggle("active", ["type", "process"].includes(step));
  barPowers.classList.toggle("active", step === "powers");
  barAttrs.classList.toggle("active", ["attrs", "success", "cabinet", "arena"].includes(step));

  barType.classList.toggle("completed", ["powers", "attrs", "success", "cabinet", "arena"].includes(step));
  barPowers.classList.toggle("completed", ["attrs", "success", "cabinet", "arena"].includes(step));
  barAttrs.classList.remove("completed");

  labelType.classList.toggle("active", step === "type" || step === "process");
  labelPowers.classList.toggle("active", step === "powers");
  labelAttrs.classList.toggle("active", step === "attrs" || step === "success" || step === "cabinet" || step === "arena");
}

function getResolvedType() {
  if (state.selectedType === "Other") {
    return otherTypeInput.value.trim();
  }
  return state.selectedType;
}

function updateTypeContinueState() {
  const isValid = Boolean(getResolvedType()) && !state.isStarting;
  typeContinueBtn.disabled = !isValid;
  typeContinueBtn.classList.toggle("enabled", isValid);
}

function preloadTypeIcons() {
  const urls = new Set();
  Object.values(TYPE_META).forEach((states) => {
    Object.values(states).forEach((icons) => {
      if (icons?.primary) urls.add(icons.primary);
      if (icons?.secondary) urls.add(icons.secondary);
    });
  });
  urls.forEach((url) => {
    const img = new Image();
    img.src = url;
  });
}

function preloadPowersAssets() {
  [POWER_ICONS.default, POWER_ICONS.active].forEach((url) => {
    const img = new Image();
    img.src = url;
  });
}

function preloadAttrsAssets() {
  [
    DEFAULT_CHARACTER_IMAGE,
    "/assets/attrs-step/stamina.svg",
    "/assets/attrs-step/agility.svg",
    "/assets/attrs-step/strength.svg",
    "/assets/attrs-step/intelligence.svg",
    "/assets/attrs-step/minus.svg",
    "/assets/attrs-step/plus.svg",
    "/assets/attrs-step/wallet.svg",
  ].forEach((url) => {
    const img = new Image();
    img.src = url;
  });
}

function getFightButtonMarkup({ isLoading = false, label = "Fight" } = {}) {
  if (isLoading) {
    return `
      <span class="fight-btn-spinner" aria-hidden="true"></span>
      <span>Preparing...</span>
    `;
  }

  return `
    <img src="/assets/dashboard/fight-bolt-white.svg" alt="" width="20" height="20" />
    <span>${label}</span>
  `;
}

function loadImageAsset(src) {
  const tryLoad = (crossOriginValue) =>
    new Promise((resolve, reject) => {
      const image = new Image();

      if (crossOriginValue) {
        image.crossOrigin = crossOriginValue;
      }

      image.decoding = "async";
      image.onload = async () => {
        if (typeof image.decode === "function") {
          try {
            await image.decode();
          } catch (_error) {
            // Ignore decode failures and keep the loaded image.
          }
        }

        resolve(image);
      };
      image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
      image.src = src;
    });

  if (!/^https?:\/\//i.test(src)) {
    return tryLoad("");
  }

  return tryLoad("anonymous").catch(() => tryLoad(""));
}

async function downscaleArenaImage(image, fallbackSrc) {
  const maxSide = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
  if (maxSide <= ARENA_IMAGE_TARGET_SIZE) {
    return fallbackSrc;
  }

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      return fallbackSrc;
    }

    canvas.width = ARENA_IMAGE_TARGET_SIZE;
    canvas.height = ARENA_IMAGE_TARGET_SIZE;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(fallbackSrc);
            return;
          }

          resolve(URL.createObjectURL(blob));
        },
        "image/webp",
        0.86
      );
    });
  } catch (_error) {
    return fallbackSrc;
  }
}

function preloadAndOptimizeArenaImage(src) {
  const normalizedSrc = src || DEFAULT_CHARACTER_IMAGE;

  if (!arenaImagePromises.has(normalizedSrc)) {
    const imagePromise = loadImageAsset(normalizedSrc)
      .then((image) => downscaleArenaImage(image, normalizedSrc))
      .catch(() => normalizedSrc);

    arenaImagePromises.set(normalizedSrc, imagePromise);
  }

  return arenaImagePromises.get(normalizedSrc);
}

async function prepareArenaRecordImage(record) {
  const safeRecord = cloneBattleRecord(record);
  const preparedImageUrl = await preloadAndOptimizeArenaImage(safeRecord.imageUrl);

  return {
    ...safeRecord,
    imageUrl: preparedImageUrl || safeRecord.imageUrl,
  };
}

async function preloadArenaFightAssets(initiator, opponentPool) {
  const preparedInitiatorPromise = prepareArenaRecordImage(initiator);
  const preparedPoolPromise = Promise.all(opponentPool.map((record) => prepareArenaRecordImage(record)));
  const [preparedInitiator, preparedPool] = await Promise.all([preparedInitiatorPromise, preparedPoolPromise]);

  return {
    preparedInitiator,
    preparedPool,
  };
}

async function loadRealArenaOpponents(attackerPetId) {
  const query = new URLSearchParams({
    attackerPetId: String(attackerPetId || ""),
  });
  const payload = await apiRequest(`/api/battles/opponents?${query.toString()}`, undefined, "GET");

  return Array.isArray(payload?.opponents)
    ? payload.opponents.map((record) => cloneBattleRecord(normalizeCharacterRecord(record)))
    : [];
}

function applyChipIcon(chip, visualState) {
  const type = chip.dataset.type || "";
  const iconSet = TYPE_META[type]?.[visualState] || TYPE_META[type]?.default;
  if (!iconSet) return;

  const primary = chip.querySelector(".type-chip-icon-primary");
  const secondary = chip.querySelector(".type-chip-icon-secondary");
  if (primary) primary.src = iconSet.primary || "";
  if (secondary) {
    if (iconSet.secondary) {
      secondary.src = iconSet.secondary;
      secondary.classList.remove("hidden");
    } else {
      secondary.src = "";
      secondary.classList.add("hidden");
    }
  }
}

function renderTypeStep() {
  const chips = [...document.querySelectorAll(".type-chip")];
  chips.forEach((chip) => {
    const isActive = chip.dataset.type === state.selectedType;
    chip.classList.toggle("active", isActive);
    applyChipIcon(chip, isActive ? "active" : "default");
  });

  const isOther = state.selectedType === "Other";
  otherInputWrap.classList.toggle("hidden", !isOther);
  if (isOther) {
    window.requestAnimationFrame(() => {
      otherTypeInput.focus();
      const length = otherTypeInput.value.length;
      otherTypeInput.setSelectionRange(length, length);
    });
  }

  updateTypeContinueState();
}

function renderPowersStep() {
  const powers = getPowerOptions();
  const hasSelected = powers.some((item) => item.id === state.selectedPowerId);
  const characterName = getCurrentCharacterName();

  powersGrid.innerHTML = "";
  powersTitle.textContent = characterName
    ? `Choose a power for ${characterName}`
    : "Choose a power for your pet";
  powersContinueBtn.disabled = !hasSelected || state.isSavingPower;
  powersContinueBtn.classList.toggle("enabled", hasSelected && !state.isSavingPower);

  powers.forEach((power) => {
    const isActive = power.id === state.selectedPowerId;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "power-card";
    card.dataset.powerId = power.id;
    card.classList.toggle("active", isActive);
    card.innerHTML = `
      <img class="power-card-icon" src="${isActive ? POWER_ICONS.active : POWER_ICONS.default}" alt="" width="20" height="20" />
      <p>${power.description}</p>
    `;

    card.addEventListener("click", () => {
      if (state.isSavingPower || state.selectedPowerId === power.id) return;
      state.selectedPowerId = power.id;
      renderPowersStep();
    });

    powersGrid.appendChild(card);
  });
}

function pointsRemaining() {
  return getAttributePointBudget() - Object.values(state.attrs).reduce((sum, value) => sum + value, 0);
}

function updateAttrsButtonState() {
  const left = pointsRemaining();
  pointsLeft.textContent = String(left);
  const ready = left === 0 && !state.isCreating;

  attrsContinueBtn.disabled = !ready;
  attrsContinueBtn.classList.toggle("enabled", ready);
  attrsContinueBtn.classList.toggle("mobile-hidden", !ready);

  if (attrsSidePanel) {
    attrsSidePanel.classList.toggle("is-ready", ready);
  }
}

function ensureAttrsRows() {
  const totalSegments = DEFAULT_ATTRIBUTE_POINTS;
  if (attrsRowsBudget === totalSegments) return;

  attrsList.innerHTML = "";

  ATTRS.forEach((attr) => {
    const segments = Array.from({ length: totalSegments }, (_, index) => {
      const classes = ["attr-segment"];
      if (index === 0) classes.push("first");
      if (index === totalSegments - 1) classes.push("last");
      return `<span class="${classes.join(" ")}"></span>`;
    }).join("");

    const row = document.createElement("div");
    row.className = "attr-row";
    row.dataset.attr = attr.key;
    row.innerHTML = `
      <div class="attr-row-top">
        <div class="attr-info">
          <div class="attr-heading">
            <img class="attr-icon" src="${attr.icon}" alt="" width="20" height="20" />
            <h3>${attr.label}</h3>
          </div>
          <p>${attr.desc}</p>
        </div>
        <div class="attr-controls">
          <button class="attr-btn" type="button" data-action="minus" disabled>
            <img src="/assets/attrs-step/minus.svg" alt="" width="20" height="20" />
          </button>
          <button class="attr-btn" type="button" data-action="plus">
            <img src="/assets/attrs-step/plus.svg" alt="" width="20" height="20" />
          </button>
        </div>
      </div>
      <div class="attr-scale" style="grid-template-columns: repeat(${totalSegments}, minmax(0, 1fr));">${segments}</div>
    `;

    const minusBtn = row.querySelector('[data-action="minus"]');
    const plusBtn = row.querySelector('[data-action="plus"]');

    minusBtn.addEventListener("click", () => {
      if (state.attrs[attr.key] <= 0 || state.isCreating) return;
      state.attrs[attr.key] -= 1;
      updateAttrsStep();
    });

    plusBtn.addEventListener("click", () => {
      if (state.attrs[attr.key] >= DEFAULT_ATTRIBUTE_POINTS || pointsRemaining() <= 0 || state.isCreating) {
        return;
      }
      state.attrs[attr.key] += 1;
      updateAttrsStep();
    });

    attrsList.appendChild(row);
  });

  attrsRowsBudget = totalSegments;
}

function updateAttrsStep() {
  ensureAttrsRows();

  ATTRS.forEach((attr) => {
    const row = attrsList.querySelector(`[data-attr="${attr.key}"]`);
    if (!row) return;

    const value = state.attrs[attr.key];
    const canMinus = value > 0 && !state.isCreating;
    const canPlus = pointsRemaining() > 0 && value < DEFAULT_ATTRIBUTE_POINTS && !state.isCreating;
    const minusBtn = row.querySelector('[data-action="minus"]');
    const plusBtn = row.querySelector('[data-action="plus"]');
    const segments = row.querySelectorAll(".attr-segment");

    if (minusBtn) minusBtn.disabled = !canMinus;
    if (plusBtn) plusBtn.disabled = !canPlus;

    segments.forEach((segment, index) => {
      segment.classList.toggle("filled", index < value);
    });
  });

  updateAttrsButtonState();
}

function renderAttrsStep() {
  updateAttrsStep();
}

function suppressRewardsTooltip() {
  document.body.classList.add("suppress-rewards-tooltip");

  if (suppressRewardsTooltipTimeout) {
    window.clearTimeout(suppressRewardsTooltipTimeout);
  }

  const clearSuppression = () => {
    document.body.classList.remove("suppress-rewards-tooltip");
    window.removeEventListener("pointermove", handlePointerMove);
    suppressRewardsTooltipTimeout = null;
  };

  const handlePointerMove = () => {
    clearSuppression();
  };

  window.addEventListener("pointermove", handlePointerMove, { once: true });
  suppressRewardsTooltipTimeout = window.setTimeout(clearSuppression, 300);
}

function getRecordDisplayName(record) {
  return record?.name || record?.displayName || record?.creatureType || "Unknown pet";
}

function cloneBattleRecord(record) {
  if (!record) return null;

  return {
    ...record,
    level: getRecordLevel(record),
    experience: getRecordExperience(record),
    experienceForNextLevel: getRecordExperienceForNextLevel(record),
    imageUrl: record.imageUrl || DEFAULT_CHARACTER_IMAGE,
    attributes: {
      ...createEmptyAttrs(),
      ...(record.attributes || {}),
    },
    selectedPower: record.selectedPower
      ? { ...record.selectedPower }
      : { description: "Power not selected yet" },
  };
}

function updateEnergyUi() {
  if (!dashboardEnergy || !dashboardEnergyCurrent || !dashboardEnergyMax) return;

  dashboardEnergyCurrent.textContent = String(state.energyCurrent);
  dashboardEnergyMax.textContent = `of ${state.energyMax}`;
  dashboardEnergy.setAttribute("aria-label", `Energy ${state.energyCurrent} of ${state.energyMax}`);
}

function clearArenaAnimation() {
  if (arenaAnimationFrameId) {
    window.cancelAnimationFrame(arenaAnimationFrameId);
    arenaAnimationFrameId = 0;
  }

  arenaTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  arenaTimeoutIds = [];
  arenaFocusedSequenceIndex = -1;

  if (arenaVersus) {
    arenaVersus.classList.remove("is-revealed");
  }
}

function scheduleArenaTimeout(callback, delay) {
  const timeoutId = window.setTimeout(() => {
    arenaTimeoutIds = arenaTimeoutIds.filter((item) => item !== timeoutId);
    callback();
  }, delay);

  arenaTimeoutIds.push(timeoutId);
  return timeoutId;
}

function getArenaStarterRecord() {
  if (!state.characters.length) return null;
  return state.characters[state.characters.length - 1] || state.characters[0] || null;
}

function buildArenaSequence(pool) {
  const sequence = [];

  for (let repeat = 0; repeat < ARENA_ROULETTE_REPEAT_COUNT; repeat += 1) {
    pool.forEach((record) => {
      sequence.push({
        ...cloneBattleRecord(record),
        sequenceId: `${repeat}-${record.id}`,
      });
    });
  }

  return sequence;
}

function setArenaFocusImage(record) {
  if (!arenaRouletteFocusImage) return;

  arenaRouletteFocusImage.src = record?.imageUrl || DEFAULT_CHARACTER_IMAGE;
  arenaRouletteFocusImage.alt = record ? `${getRecordDisplayName(record)} preview` : "";
}

function renderArenaStageTitle(phase) {
  if (!arenaStageTitle) return;

  const titleText = phase === "versus" ? "Preparing fight" : "Looking for your opponent";
  arenaStageTitle.innerHTML = `
    <span class="arena-stage-title-text">${titleText}</span>
    <span class="arena-stage-dots" aria-hidden="true">
      <span></span><span></span><span></span>
    </span>
  `;
}

function buildBattleCardMarkup(record, extraClassName = "") {
  const safeRecord = cloneBattleRecord(record);
  const rarity = getRarityMeta(safeRecord?.rarity);
  const name = escapeHtml(getRecordDisplayName(safeRecord));
  const powerText = escapeHtml(getSelectedPowerDescription(safeRecord));
  const level = getRecordLevel(safeRecord);
  const statsMarkup = ATTRS.map((attr) => {
    const value = safeRecord?.attributes?.[attr.key] ?? 0;

    return `
      <div class="success-card-stat">
        <img src="${attr.icon}" alt="" width="16" height="16" />
        <span>${value}</span>
      </div>
    `;
  }).join("");

  return `
    <article class="success-card arena-card ${extraClassName}">
      <div class="success-card-title">${name}</div>
      <div class="success-card-image-wrap">
        <img
          class="success-card-image"
          src="${safeRecord?.imageUrl || DEFAULT_CHARACTER_IMAGE}"
          alt="${escapeHtml(safeRecord?.creatureType || "Pet")} character"
          width="248"
          height="248"
        />
        <span class="success-card-level">Lvl. ${level}</span>
        <span class="success-card-rarity" style="background-color: ${rarity.color};">${rarity.label}</span>
      </div>
      <div class="success-card-stats">${statsMarkup}</div>
      <div class="success-card-power">
        <img class="success-card-power-icon" src="${SUCCESS_POWER_ICON}" alt="" width="20" height="20" />
        <p class="success-card-power-text">${powerText}</p>
      </div>
    </article>
  `;
}

async function launchArenaBattleReplay(battle) {
  if (!battle || battle.isCreatingBattle) {
    return;
  }

  battle.isCreatingBattle = true;
  renderArena();

  try {
    const payload = await apiRequest("/api/battles", {
      attackerPetId: battle.initiator.id,
      defenderPetId: battle.opponent.id,
    });

    if (!payload?.battleId) {
      throw new Error("Battle id was not returned.");
    }

    window.location.href = buildBattleReplayUrl(payload.battleId);
  } catch (error) {
    if (!state.activeBattle || state.activeBattle.id !== battle.id) {
      return;
    }

    state.activeBattle = null;
    state.energyCurrent = Math.min(state.energyMax, state.energyCurrent + 1);
    updateEnergyUi();
    renderCabinet();
    renderArena();
    showToast(error.message || "Couldn't prepare the battle. Please try again.");
  }
}

function renderArenaRouletteTrack(battle) {
  if (!arenaRouletteTrack || !battle) return;

  if (arenaRouletteTrack.dataset.battleId === battle.id) {
    return;
  }

  arenaRouletteTrack.dataset.battleId = battle.id;
  arenaRouletteTrack.innerHTML = battle.sequence
    .map(
      (record, index) => `
        <div class="arena-roulette-thumb" data-sequence-index="${index}">
          <img src="${record.imageUrl}" alt="${escapeHtml(getRecordDisplayName(record))}" width="160" height="160" />
        </div>
      `
    )
    .join("");
}

function syncArenaThumbStates(battle) {
  if (!arenaRouletteTrack || !battle) return;

  const thumbs = arenaRouletteTrack.querySelectorAll(".arena-roulette-thumb");
  thumbs.forEach((thumb, index) => {
    thumb.classList.toggle("is-selected", index === battle.targetSequenceIndex);
  });

  if (arenaRoulette) {
    arenaRoulette.classList.toggle("is-settled", battle.phase !== "roulette");
  }
}

function updateArenaFocusByTrackPosition(battle, currentX) {
  if (!arenaRoulette || !battle?.sequence?.length) return;

  const focusCenter = arenaRoulette.clientWidth / 2;
  const centeredIndex = Math.max(
    0,
    Math.min(
      battle.sequence.length - 1,
      Math.round((focusCenter - currentX - ARENA_ROULETTE_ITEM_SIZE / 2) / ARENA_ROULETTE_STEP)
    )
  );

  if (centeredIndex === arenaFocusedSequenceIndex) return;

  arenaFocusedSequenceIndex = centeredIndex;
  setArenaFocusImage(battle.sequence[centeredIndex]);
}

function finishArenaRoulette(battle, finalX) {
  if (!state.activeBattle || state.activeBattle.id !== battle.id) return;

  state.activeBattle.trackX = finalX;
  state.activeBattle.phase = "focus";
  renderArena();
}

function runArenaRoulette(battle) {
  if (!arenaRouletteTrack || !arenaRoulette || !battle?.sequence?.length) return;

  const focusCenter = arenaRoulette.clientWidth / 2;
  const finalX = focusCenter - battle.targetSequenceIndex * ARENA_ROULETTE_STEP - ARENA_ROULETTE_ITEM_SIZE / 2;
  const startX = finalX + ARENA_ROULETTE_STEP * ARENA_ROULETTE_TRAVEL_ITEMS;
  const startedAt = performance.now();

  battle.trackX = startX;
  arenaRouletteTrack.style.transform = `translate3d(${startX}px, 0, 0)`;
  updateArenaFocusByTrackPosition(battle, startX);

  const animate = (now) => {
    if (!state.activeBattle || state.activeBattle.id !== battle.id) {
      arenaAnimationFrameId = 0;
      return;
    }

    const progress = Math.min((now - startedAt) / ARENA_ROULETTE_DURATION, 1);
    const eased = 1 - (1 - progress) ** 4;
    const currentX = startX + (finalX - startX) * eased;

    state.activeBattle.trackX = currentX;
    arenaRouletteTrack.style.transform = `translate3d(${currentX}px, 0, 0)`;
    updateArenaFocusByTrackPosition(battle, currentX);

    if (progress < 1) {
      arenaAnimationFrameId = window.requestAnimationFrame(animate);
      return;
    }

    arenaAnimationFrameId = 0;
    finishArenaRoulette(battle, finalX);
  };

  arenaAnimationFrameId = window.requestAnimationFrame(animate);
}

function renderArena() {
  if (!screenArena || !arenaIdleState || !arenaBattleState || !arenaStartFightBtn) return;

  const battle = state.activeBattle;
  const hasStarter = Boolean(getArenaStarterRecord());
  const isPreparingFight = state.isFightPreparing && !battle;
  const canStartFight = hasStarter && state.energyCurrent > 0 && !state.isFightPreparing;
  const idleCopy = arenaIdleState.querySelector(".arena-panel-copy p");

  arenaStartFightBtn.disabled = !canStartFight;
  arenaStartFightBtn.classList.toggle("disabled", !canStartFight);
  arenaStartFightBtn.classList.toggle("enabled", canStartFight);
  arenaStartFightBtn.classList.toggle("is-loading", isPreparingFight);
  arenaStartFightBtn.innerHTML = isPreparingFight
    ? getFightButtonMarkup({ isLoading: true })
    : "<span>Start Fight</span>";

  if (idleCopy) {
    idleCopy.textContent = hasStarter
      ? "Select any pet in My Pets or start with your latest one to match a real opponent."
      : "Create your first pet to unlock the battle preparation flow.";
  }

  arenaIdleState.classList.toggle("hidden", Boolean(battle));
  arenaBattleState.classList.toggle("hidden", !battle);

  if (!battle) {
    return;
  }

  renderArenaRouletteTrack(battle);
  syncArenaThumbStates(battle);

  if (typeof battle.trackX === "number" && arenaRouletteTrack) {
    arenaRouletteTrack.style.transform = `translate3d(${battle.trackX}px, 0, 0)`;
    updateArenaFocusByTrackPosition(battle, battle.trackX);
  } else {
    setArenaFocusImage(battle.opponent);
  }

  renderArenaStageTitle(battle.phase);

  if (arenaRoulette) {
    arenaRoulette.classList.toggle("is-fading-out", battle.phase === "versus");
  }

  if (arenaRouletteFocus) {
    arenaRouletteFocus.classList.toggle("is-hidden", battle.phase !== "roulette");
  }

  if (battle.phase === "roulette") {
    if (arenaFocusCard) {
      arenaFocusCard.classList.add("hidden");
    }
    if (arenaVersus) {
      arenaVersus.classList.add("hidden");
      arenaVersus.classList.remove("is-revealed");
      arenaVersus.setAttribute("aria-hidden", "true");
    }

    if (!battle.rouletteStarted) {
      battle.rouletteStarted = true;
      window.requestAnimationFrame(() => runArenaRoulette(battle));
    }

    return;
  }

  if (arenaFocusCard) {
    arenaFocusCard.innerHTML = buildBattleCardMarkup(battle.opponent, "arena-card--focus");
    arenaFocusCard.classList.toggle("hidden", battle.phase === "versus");
  }

  if (battle.phase === "focus") {
    if (arenaVersus) {
      arenaVersus.classList.add("hidden");
      arenaVersus.classList.remove("is-revealed");
      arenaVersus.setAttribute("aria-hidden", "true");
    }

    if (!battle.focusScheduled) {
      battle.focusScheduled = true;
      scheduleArenaTimeout(() => {
        if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
        state.activeBattle.phase = "versus";
        renderArena();
      }, ARENA_FOCUS_CARD_DELAY);
    }

    return;
  }

  if (arenaOpponentCard) {
    arenaOpponentCard.innerHTML = buildBattleCardMarkup(battle.opponent, "arena-card--versus");
  }

  if (arenaPlayerCard) {
    arenaPlayerCard.innerHTML = buildBattleCardMarkup(battle.initiator, "arena-card--versus");
  }

  if (arenaFocusCard) {
    arenaFocusCard.classList.add("hidden");
  }
  if (arenaVersus) {
    arenaVersus.classList.remove("hidden");
    arenaVersus.setAttribute("aria-hidden", "false");
  }

  if (!battle.versusRendered) {
    battle.versusRendered = true;
    if (arenaVersus) {
      arenaVersus.classList.remove("is-revealed");
    }
    scheduleArenaTimeout(() => {
      if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
      if (arenaVersus) {
        arenaVersus.classList.add("is-revealed");
      }
    }, 40);
  }

  if (!battle.battleLaunchScheduled) {
    battle.battleLaunchScheduled = true;
    scheduleArenaTimeout(() => {
      if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
      launchArenaBattleReplay(battle);
    }, ARENA_BATTLE_LAUNCH_DELAY);
  }
}

async function startFightFlow(characterId) {
  if (state.isFightPreparing) {
    return;
  }

  const sourceRecord =
    state.characters.find((record) => String(record.id) === String(characterId)) || getArenaStarterRecord();
  const initiator = cloneBattleRecord(sourceRecord);

  if (!initiator) {
    showToast("Create a pet before starting a fight.");
    return;
  }

  if (state.energyCurrent <= 0) {
    showToast("You need more energy before starting the next fight.");
    return;
  }

  clearArenaAnimation();

  state.energyCurrent = Math.max(0, state.energyCurrent - 1);
  state.isFightPreparing = true;
  state.fightPreparingCharacterId = String(initiator.id || characterId || "");
  updateEnergyUi();
  renderCabinet();
  renderArena();

  try {
    const opponentPool = await loadRealArenaOpponents(initiator.id);
    if (!opponentPool.length) {
      throw new Error("No real opponents are available yet. Create pets from another wallet and try again.");
    }

    const opponentIndex = Math.floor(Math.random() * opponentPool.length);
    const [{ preparedInitiator, preparedPool }] = await Promise.all([
      preloadArenaFightAssets(initiator, opponentPool),
      wait(ARENA_PREPARE_MIN_SPINNER_DURATION),
    ]);

    state.isFightPreparing = false;
    state.fightPreparingCharacterId = "";
    state.activeBattle = {
      id: `arena-${Date.now()}`,
      initiator: preparedInitiator,
      opponent: preparedPool[opponentIndex],
      pool: preparedPool,
      sequence: buildArenaSequence(preparedPool),
      targetSequenceIndex: preparedPool.length * 2 + opponentIndex,
      phase: "roulette",
      trackX: null,
      rouletteStarted: false,
      focusScheduled: false,
      versusRendered: false,
    };

    moveTo("arena");
  } catch (error) {
    state.energyCurrent = Math.min(state.energyMax, state.energyCurrent + 1);
    state.isFightPreparing = false;
    state.fightPreparingCharacterId = "";
    updateEnergyUi();
    renderCabinet();
    renderArena();
    showToast(error.message || "Couldn't prepare the fight. Please try again.");
    console.error(error);
  }
}

function renderCabinet() {
  const records = [...state.characters].reverse();
  const canCreateAnother = hasCharacterCreationCapacity();
  const canFight = ENABLE_ARENA && state.energyCurrent > 0 && !state.isFightPreparing;
  if (!state.hasHydratedCharacters) {
    if (cabinetCount) {
      cabinetCount.textContent = "Loading...";
    }

    if (createAnotherBtn) {
      createAnotherBtn.disabled = true;
      createAnotherBtn.classList.remove("enabled");
      createAnotherBtn.classList.add("disabled");
      createAnotherBtn.setAttribute("aria-disabled", "true");
      createAnotherBtn.title = "";
    }

    cabinetCard.innerHTML = '<p class="cabinet-empty">Loading characters...</p>';
    return;
  }

  if (cabinetCount) {
    const total = records.length;
    cabinetCount.textContent = `${total} character${total === 1 ? "" : "s"}`;
  }

  if (createAnotherBtn) {
    createAnotherBtn.disabled = false;
    createAnotherBtn.classList.toggle("disabled", !canCreateAnother);
    createAnotherBtn.classList.toggle("enabled", canCreateAnother);
    createAnotherBtn.setAttribute("aria-disabled", canCreateAnother ? "false" : "true");
    createAnotherBtn.title = canCreateAnother
      ? ""
      : `Character limit reached. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`;
  }

  if (!records.length) {
    cabinetCard.innerHTML = '<p class="cabinet-empty">No characters created yet.</p>';
    return;
  }

  cabinetCard.innerHTML = records
    .map((record) => {
      const rarity = getRarityMeta(record.rarity);
      const isPreparingThisFight =
        state.isFightPreparing && String(state.fightPreparingCharacterId) === String(record.id);
      const statsMarkup = ATTRS.map((attr) => {
        const value = record.attributes[attr.key];
        return `
          <div class="success-card-stat">
            <img src="${attr.icon}" alt="" width="16" height="16" />
            <span>${value}</span>
          </div>
        `;
      }).join("");

      return `
        <article class="cabinet-character" data-character-id="${record.id}">
          <div class="success-card cabinet-success-card" aria-hidden="true">
            <div class="success-card-title">${record.name || record.displayName || record.creatureType}</div>
            <div class="success-card-image-wrap">
              <img class="success-card-image" src="${record.imageUrl}" alt="${record.creatureType} character" width="248" height="248" />
              <span class="success-card-level">Lvl. ${getRecordLevel(record)}</span>
              <span class="success-card-rarity" style="background-color: ${rarity.color};">${rarity.label}</span>
              <span class="success-card-exp-label">Experience</span>
              <span class="success-card-exp-value">${getRecordExperience(record)}/${getRecordExperienceForNextLevel(record)}</span>
              <span class="success-card-exp-track"></span>
              <span class="success-card-exp-progress" style="width: ${getRecordExperienceProgress(record)}%;"></span>
            </div>
            <div class="success-card-stats">${statsMarkup}</div>
            <div class="success-card-power">
              <img class="success-card-power-icon" src="${SUCCESS_POWER_ICON}" alt="" width="20" height="20" />
              <p class="success-card-power-text">${getSelectedPowerDescription(record)}</p>
            </div>
            ${
              canFight
                ? `
            <button
              class="cabinet-fight-btn${isPreparingThisFight ? " is-loading" : ""}"
              type="button"
              data-character-id="${record.id}"
              ${isPreparingThisFight ? 'disabled aria-disabled="true"' : ""}
            >
              ${getFightButtonMarkup({ isLoading: isPreparingThisFight })}
            </button>
            `
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function getAdminActiveQuery() {
  return state.adminSection === "waitlist" ? state.adminWaitlistQuery : state.adminWalletQuery;
}

function setAdminActiveQuery(value) {
  if (state.adminSection === "waitlist") {
    state.adminWaitlistQuery = value;
    return;
  }

  state.adminWalletQuery = value;
}

function getAdminActivePage() {
  return state.adminSection === "waitlist" ? state.adminWaitlistPage : state.adminPage;
}

function setAdminActivePage(value) {
  if (state.adminSection === "waitlist") {
    state.adminWaitlistPage = value;
    return;
  }

  state.adminPage = value;
}

function getFilteredAdminCharacters() {
  const query = state.adminWalletQuery.trim().toLowerCase();
  if (!query) {
    return state.adminCharacters;
  }

  return state.adminCharacters.filter((record) =>
    String(record.creatorWallet || "")
      .toLowerCase()
      .includes(query)
  );
}

function getFilteredAdminWaitlistEntries() {
  const query = state.adminWaitlistQuery.trim().toLowerCase();
  if (!query) {
    return state.adminWaitlistEntries;
  }

  return state.adminWaitlistEntries.filter((entry) =>
    [entry.email, entry.source, entry.pagePath, entry.userAgent].some((field) =>
      String(field || "")
        .toLowerCase()
        .includes(query)
    )
  );
}

function getAdminCurrentRecords() {
  return state.adminSection === "waitlist"
    ? getFilteredAdminWaitlistEntries()
    : getFilteredAdminCharacters();
}

function getAdminPaginationState(records = getAdminCurrentRecords()) {
  const totalItems = records.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ADMIN_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, getAdminActivePage()), totalPages);
  const startIndex = (currentPage - 1) * ADMIN_PAGE_SIZE;

  setAdminActivePage(currentPage);

  return {
    totalItems,
    totalPages,
    currentPage,
    startIndex,
    endIndex: startIndex + ADMIN_PAGE_SIZE,
    pageRecords: records.slice(startIndex, startIndex + ADMIN_PAGE_SIZE),
  };
}

function renderAdminPagination(records) {
  if (!adminPagination || !adminPageInfo || !adminPrevBtn || !adminNextBtn) return;

  const isLoading =
    state.adminSection === "waitlist" ? state.isAdminWaitlistLoading : state.isAdminLoading;
  const hasLoaded =
    state.adminSection === "waitlist" ? state.hasLoadedAdminWaitlist : state.hasLoadedAdminCharacters;

  if (isLoading && !hasLoaded) {
    adminPagination.classList.add("hidden");
    return;
  }

  const { totalItems, totalPages, currentPage, startIndex, endIndex } =
    getAdminPaginationState(records);

  if (!totalItems || totalPages <= 1) {
    adminPagination.classList.add("hidden");
    return;
  }

  adminPagination.classList.remove("hidden");
  const visibleFrom = startIndex + 1;
  const visibleTo = Math.min(endIndex, totalItems);
  adminPageInfo.textContent = `${visibleFrom}-${visibleTo} of ${totalItems}`;
  adminPrevBtn.disabled = currentPage <= 1;
  adminNextBtn.disabled = currentPage >= totalPages;
}

function isAdminCharacterExpanded(characterId) {
  return state.expandedAdminCharacterIds.includes(characterId);
}

function toggleAdminCharacterExpanded(characterId) {
  if (!characterId) return;

  if (isAdminCharacterExpanded(characterId)) {
    state.expandedAdminCharacterIds = state.expandedAdminCharacterIds.filter((id) => id !== characterId);
  } else {
    state.expandedAdminCharacterIds = [...state.expandedAdminCharacterIds, characterId];
  }

  renderAdminTable();
}

function buildAdminInfoItems(items) {
  return items
    .map(
      ({ label, value, valueHtml }) => `
        <div class="admin-info-item">
          <span class="admin-info-label">${escapeHtml(label)}</span>
          <span class="admin-info-value">${valueHtml || escapeHtml(value)}</span>
        </div>
      `
    )
    .join("");
}

function createAdminDetailsMarkup(record) {
  const rarity = getRarityMeta(record?.rarity);
  const attributeItems = ATTRS.map((attr) => ({
    label: attr.label,
    value: record?.attributes?.[attr.key] ?? 0,
  }));
  const variableItems = Object.entries(record?.variables || {}).map(([key, value]) => ({
    label: formatAdminFieldLabel(key),
    value: value || "—",
  }));
  const metaItems = [
    { label: "Name", value: record.name || record.displayName || record.creatureType || "Unknown" },
    { label: "Creature type", value: record.creatureType || "Unknown" },
    {
      label: "Rarity",
      valueHtml: `<span class="admin-rarity-text" style="color: ${escapeHtml(rarity.color)};">${escapeHtml(record.rarity || "Unknown")}</span>`,
    },
    { label: "Selected power", value: getSelectedPowerDescription(record) },
    { label: "Attribute budget", value: record.attributePoints ?? 0 },
    { label: "Image provider", value: record.imageProvider || "Unknown" },
  ];

  return `
    <div class="admin-details-grid">
      <section class="admin-details-card">
        <h3>Character</h3>
        <div class="admin-info-grid">
          ${buildAdminInfoItems(metaItems)}
        </div>
      </section>
      <section class="admin-details-card">
        <h3>Attributes</h3>
        <div class="admin-info-grid">
          ${buildAdminInfoItems(attributeItems)}
        </div>
      </section>
      <section class="admin-details-card admin-details-card-wide">
        <h3>Random variables</h3>
        <div class="admin-info-grid">
          ${buildAdminInfoItems(variableItems.length ? variableItems : [{ label: "Variables", value: "No data" }])}
        </div>
      </section>
    </div>
  `;
}

function updateAdminCount(records) {
  if (!adminCount) return;

  if (state.adminSection === "waitlist") {
    if (state.isAdminWaitlistLoading && !state.hasLoadedAdminWaitlist) {
      adminCount.textContent = "Loading waitlist entries...";
      return;
    }

    const total = records.length;
    const baseLabel = `${total} waitlist entr${total === 1 ? "y" : "ies"}`;
    adminCount.textContent = state.adminWaitlistQuery.trim() ? `${baseLabel} found` : baseLabel;
    return;
  }

  if (state.isAdminLoading && !state.hasLoadedAdminCharacters) {
    adminCount.textContent = "Loading characters...";
    return;
  }

  const total = records.length;
  const baseLabel = `${total} created character${total === 1 ? "" : "s"}`;
  adminCount.textContent = state.adminWalletQuery.trim()
    ? `${baseLabel} found`
    : baseLabel;
}

function renderAdminStats() {
  const statLabels = [
    adminStatLabel1,
    adminStatLabel2,
    adminStatLabel3,
    adminStatLabel4,
    adminStatLabel5,
    adminStatLabel6,
  ];
  const statValues = [
    adminUsersCount,
    adminCharactersCount,
    adminRarityCommon,
    adminRarityRare,
    adminRarityEpic,
    adminRarityLegendary,
  ];

  if (
    (state.adminSection === "characters" && state.isAdminLoading && !state.hasLoadedAdminCharacters) ||
    (state.adminSection === "waitlist" &&
      state.isAdminWaitlistLoading &&
      !state.hasLoadedAdminWaitlist)
  ) {
    statValues.forEach((node) => {
      if (node) node.textContent = "—";
    });
    return;
  }

  if (state.adminSection === "waitlist") {
    const records = state.adminWaitlistEntries;
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
    const uniqueEmails = new Set(records.map((entry) => String(entry.email || "").trim()).filter(Boolean)).size;
    const todayCount = records.filter((entry) => Date.parse(entry.createdAt || 0) >= dayAgo).length;
    const weekCount = records.filter((entry) => Date.parse(entry.createdAt || 0) >= weekAgo).length;
    const monthCount = records.filter((entry) => Date.parse(entry.createdAt || 0) >= monthAgo).length;
    const landingCount = records.filter((entry) => String(entry.source || "") === "landing").length;

    const labels = ["Entries", "Unique Emails", "Today", "7 Days", "30 Days", "Landing"];
    const values = [records.length, uniqueEmails, todayCount, weekCount, monthCount, landingCount];

    statLabels.forEach((node, index) => {
      if (node) node.textContent = labels[index];
    });
    statValues.forEach((node, index) => {
      if (node) {
        node.textContent = String(values[index]);
        node.style.color = "#101828";
      }
    });
    return;
  }

  if (state.isAdminLoading && !state.hasLoadedAdminCharacters) {
    if (adminUsersCount) adminUsersCount.textContent = "—";
    if (adminCharactersCount) adminCharactersCount.textContent = "—";
    if (adminRarityCommon) adminRarityCommon.textContent = "—";
    if (adminRarityRare) adminRarityRare.textContent = "—";
    if (adminRarityEpic) adminRarityEpic.textContent = "—";
    if (adminRarityLegendary) adminRarityLegendary.textContent = "—";
    return;
  }

  const records = state.adminCharacters;
  const rarityCounts = {
    common: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  };

  records.forEach((record) => {
    const rarityKey = normalizeRarityLabel(record?.rarity);
    if (rarityKey in rarityCounts) {
      rarityCounts[rarityKey] += 1;
    }
  });

  const users = new Set(
    records
      .map((record) => String(record?.creatorWallet || "").trim())
      .filter(Boolean)
  ).size;

  if (adminUsersCount) adminUsersCount.textContent = String(users);
  if (adminCharactersCount) adminCharactersCount.textContent = String(records.length);
  if (adminRarityCommon) adminRarityCommon.textContent = String(rarityCounts.common);
  if (adminRarityRare) adminRarityRare.textContent = String(rarityCounts.rare);
  if (adminRarityEpic) adminRarityEpic.textContent = String(rarityCounts.epic);
  if (adminRarityLegendary) adminRarityLegendary.textContent = String(rarityCounts.legendary);
  if (adminUsersCount) adminUsersCount.style.color = "";
  if (adminCharactersCount) adminCharactersCount.style.color = "";
  if (adminRarityCommon) adminRarityCommon.style.color = "";
  if (adminRarityRare) adminRarityRare.style.color = "";
  if (adminRarityEpic) adminRarityEpic.style.color = "";
  if (adminRarityLegendary) adminRarityLegendary.style.color = "";

  if (adminStatLabel1) adminStatLabel1.textContent = "Users";
  if (adminStatLabel2) adminStatLabel2.textContent = "Characters";
  if (adminStatLabel3) adminStatLabel3.textContent = "Common";
  if (adminStatLabel4) adminStatLabel4.textContent = "Rare";
  if (adminStatLabel5) adminStatLabel5.textContent = "Epic";
  if (adminStatLabel6) adminStatLabel6.textContent = "Legendary";
}

function setAdminEmptyState(message, shouldShow) {
  if (!adminEmpty) return;
  adminEmpty.textContent = message;
  adminEmpty.classList.toggle("hidden", !shouldShow);
}

function syncDeletedCharacterLocally(creatorWallet, characterId) {
  if (!creatorWallet || creatorWallet !== state.walletAddress) {
    return;
  }

  state.characters = state.characters.filter((record) => record.id !== characterId);

  if (state.character?.id === characterId) {
    state.character = state.characters[state.characters.length - 1] || null;
  }
}

function copyAdminText(value, successMessage = "Copied.") {
  const text = String(value || "").trim();
  if (!text) return;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast(successMessage))
      .catch(() => window.prompt("Copy value:", text));
    return;
  }

  window.prompt("Copy value:", text);
}

function renderAdminWaitlistTable(records) {
  const { pageRecords } = getAdminPaginationState(records);

  if (adminTableHeadRow) {
    adminTableHeadRow.innerHTML = `
      <th scope="col">Email</th>
      <th scope="col">Source</th>
      <th scope="col">Page</th>
      <th scope="col">Submitted</th>
      <th scope="col">Action</th>
    `;
  }

  pageRecords.forEach((entry) => {
    const row = document.createElement("tr");
    row.className = "admin-row";

    const emailCell = document.createElement("td");
    emailCell.className = "admin-wallet-cell";
    emailCell.textContent = entry.email || "—";

    const sourceCell = document.createElement("td");
    sourceCell.textContent = entry.source || "—";

    const pageCell = document.createElement("td");
    pageCell.textContent = entry.pagePath || "/";

    const createdCell = document.createElement("td");
    createdCell.textContent = formatDateTime(entry.createdAt);

    const actionCell = document.createElement("td");
    actionCell.className = "admin-action-cell";
    const actionStack = document.createElement("div");
    actionStack.className = "admin-action-stack";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "admin-detail-btn";
    copyBtn.textContent = "Copy email";
    copyBtn.addEventListener("click", () => {
      copyAdminText(entry.email, "Email copied.");
    });

    actionStack.appendChild(copyBtn);
    actionCell.appendChild(actionStack);
    row.append(emailCell, sourceCell, pageCell, createdCell, actionCell);
    adminTableBody.appendChild(row);
  });
}

function renderAdminTable() {
  if (!adminTableBody) return;

  const records = getAdminCurrentRecords();
  renderAdminStats();
  updateAdminCount(records);
  renderAdminPagination(records);
  adminTableBody.innerHTML = "";

  if (adminSearchInput) {
    adminSearchInput.placeholder =
      state.adminSection === "waitlist"
        ? "Search by email, source, page or user agent"
        : "Search by wallet address";
    adminSearchInput.value = getAdminActiveQuery();
  }

  if (adminSearchLabel) {
    adminSearchLabel.textContent =
      state.adminSection === "waitlist"
        ? "Search by email, source, page or user agent"
        : "Search by wallet";
  }

  if (adminNavCharacters) {
    const isActive = state.adminSection === "characters";
    adminNavCharacters.classList.toggle("active", isActive);
    adminNavCharacters.setAttribute("aria-selected", isActive ? "true" : "false");
  }

  if (adminNavWaitlist) {
    const isActive = state.adminSection === "waitlist";
    adminNavWaitlist.classList.toggle("active", isActive);
    adminNavWaitlist.setAttribute("aria-selected", isActive ? "true" : "false");
  }

  if (adminExportBtn) {
    adminExportBtn.classList.toggle("hidden", state.adminSection !== "waitlist");
  }

  if (!state.isAdmin) {
    setAdminEmptyState("Admin access is not available for this wallet.", true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  if (state.adminSection === "characters" && state.isAdminLoading) {
    setAdminEmptyState("Loading created characters...", true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  if (state.adminSection === "waitlist" && state.isAdminWaitlistLoading) {
    setAdminEmptyState("Loading waitlist entries...", true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  if (state.adminSection === "characters" && state.adminErrorMessage) {
    setAdminEmptyState(state.adminErrorMessage, true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  if (state.adminSection === "waitlist" && state.adminWaitlistErrorMessage) {
    setAdminEmptyState(state.adminWaitlistErrorMessage, true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  if (!records.length) {
    const message =
      state.adminSection === "waitlist"
        ? state.adminWaitlistQuery.trim()
          ? "No waitlist entries found for this search."
          : "No waitlist entries yet."
        : state.adminWalletQuery.trim()
          ? "No characters found for this wallet search."
          : "No created characters yet.";
    setAdminEmptyState(message, true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  setAdminEmptyState("", false);

  if (state.adminSection === "waitlist") {
    renderAdminWaitlistTable(records);
    return;
  }

  const { pageRecords } = getAdminPaginationState(records);

  if (adminTableHeadRow) {
    adminTableHeadRow.innerHTML = `
      <th scope="col">Character</th>
      <th scope="col">Type</th>
      <th scope="col">Creator wallet</th>
      <th scope="col">Created</th>
      <th scope="col">Action</th>
    `;
  }

  pageRecords.forEach((record) => {
    const row = document.createElement("tr");
    row.className = "admin-row";

    const characterCell = document.createElement("td");
    characterCell.className = "admin-character-cell";

    const thumb = document.createElement("img");
    thumb.className = "admin-character-thumb";
    thumb.src = record.imageUrl;
    thumb.alt = record.creatureType ? `${record.creatureType} character` : "Character preview";
    thumb.width = 56;
    thumb.height = 56;
    thumb.tabIndex = 0;
    thumb.setAttribute("role", "button");
    thumb.setAttribute("aria-label", `Preview ${record.name || record.displayName || record.creatureType}`);
    const openPreview = () => {
      openAdminImageLightbox(
        record.imageUrl,
        thumb.alt,
        `${record.name || record.displayName || record.creatureType} · ${record.rarity || "Unknown"}`
      );
    };
    thumb.addEventListener("click", openPreview);
    thumb.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPreview();
      }
    });

    const summary = document.createElement("div");
    summary.className = "admin-character-summary";

    const title = document.createElement("strong");
    title.textContent = record.name || record.displayName || record.creatureType;

    const meta = document.createElement("span");
    meta.textContent = record.rarity || "Unknown";
    meta.className = "admin-rarity-text";
    meta.style.color = getRarityMeta(record.rarity).color;

    summary.append(title, meta);
    characterCell.append(thumb, summary);

    const typeCell = document.createElement("td");
    typeCell.textContent = record.creatureType || "Unknown";

    const walletCell = document.createElement("td");
    walletCell.className = "admin-wallet-cell";
    walletCell.textContent = record.creatorWallet || "";

    const createdCell = document.createElement("td");
    createdCell.textContent = formatDateTime(record.completedAt || record.createdAt);

    const actionCell = document.createElement("td");
    actionCell.className = "admin-action-cell";
    const actionStack = document.createElement("div");
    actionStack.className = "admin-action-stack";
    const isExpanded = isAdminCharacterExpanded(record.id);
    const detailsBtn = document.createElement("button");
    detailsBtn.type = "button";
    detailsBtn.className = "admin-detail-btn";
    detailsBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    detailsBtn.textContent = isExpanded ? "Hide" : "Details";
    detailsBtn.addEventListener("click", () => {
      toggleAdminCharacterExpanded(record.id);
    });

    const deleteBtn = document.createElement("button");
    const isDeleting = state.deletingAdminCharacterId === record.id;
    deleteBtn.type = "button";
    deleteBtn.className = "admin-delete-btn";
    deleteBtn.disabled = isDeleting;
    deleteBtn.textContent = isDeleting ? "Deleting..." : "Delete";
    deleteBtn.addEventListener("click", async () => {
      await deleteAdminCharacter(record);
    });
    actionStack.append(detailsBtn, deleteBtn);
    actionCell.appendChild(actionStack);

    row.append(characterCell, typeCell, walletCell, createdCell, actionCell);
    adminTableBody.appendChild(row);

    if (isExpanded) {
      const detailsRow = document.createElement("tr");
      detailsRow.className = "admin-details-row";

      const detailsCell = document.createElement("td");
      detailsCell.colSpan = 5;
      detailsCell.className = "admin-details-cell";
      detailsCell.innerHTML = createAdminDetailsMarkup(record);

      detailsRow.appendChild(detailsCell);
      adminTableBody.appendChild(detailsRow);
    }
  });
}

async function loadAdminCharacters({ force = false } = {}) {
  if (!state.isAdmin) return;
  if (state.isAdminLoading) return;
  if (!force && state.adminCharacters.length) {
    renderAdminTable();
    return;
  }

  state.isAdminLoading = true;
  state.adminErrorMessage = "";
  renderAdminTable();

  try {
    const data = await apiRequest("/api/admin/characters", {}, "GET");
    state.adminCharacters = Array.isArray(data.characters)
      ? data.characters.map(normalizeCharacterRecord)
      : [];
    state.adminPage = 1;
    const visibleIds = new Set(state.adminCharacters.map((record) => record.id));
    state.expandedAdminCharacterIds = state.expandedAdminCharacterIds.filter((id) =>
      visibleIds.has(id)
    );
  } catch (error) {
    state.adminCharacters = [];
    state.expandedAdminCharacterIds = [];
    state.adminErrorMessage =
      typeof error?.message === "string" ? error.message : "Failed to load characters.";
  } finally {
    state.isAdminLoading = false;
    state.hasLoadedAdminCharacters = true;
    renderAdminTable();
  }
}

async function loadAdminWaitlist({ force = false } = {}) {
  if (!state.isAdmin) return;
  if (state.isAdminWaitlistLoading) return;
  if (!force && state.adminWaitlistEntries.length) {
    renderAdminTable();
    return;
  }

  state.isAdminWaitlistLoading = true;
  state.adminWaitlistErrorMessage = "";
  renderAdminTable();

  try {
    const data = await apiRequest("/api/admin/waitlist", {}, "GET");
    state.adminWaitlistEntries = Array.isArray(data.entries) ? data.entries : [];
    state.adminWaitlistPage = 1;
  } catch (error) {
    state.adminWaitlistEntries = [];
    state.adminWaitlistErrorMessage =
      typeof error?.message === "string" ? error.message : "Failed to load waitlist.";
  } finally {
    state.isAdminWaitlistLoading = false;
    state.hasLoadedAdminWaitlist = true;
    renderAdminTable();
  }
}

function switchAdminSection(section) {
  const nextSection = section === "waitlist" ? "waitlist" : "characters";
  if (state.adminSection === nextSection) {
    renderAdminTable();
    return;
  }

  state.adminSection = nextSection;
  renderAdminTable();

  if (nextSection === "waitlist") {
    loadAdminWaitlist();
    return;
  }

  loadAdminCharacters();
}

async function deleteAdminCharacter(record) {
  if (!record?.id || state.deletingAdminCharacterId) {
    return;
  }

  const confirmed = window.confirm(
    `Delete character "${record.name || record.displayName || record.creatureType}"?`
  );
  if (!confirmed) {
    return;
  }

  state.deletingAdminCharacterId = record.id;
  renderAdminTable();

  try {
    const data = await apiRequest("/api/admin/delete-character", {
      characterId: record.id,
    });

    state.adminCharacters = state.adminCharacters.filter((item) => item.id !== record.id);
    state.expandedAdminCharacterIds = state.expandedAdminCharacterIds.filter((id) => id !== record.id);
    syncDeletedCharacterLocally(data.creatorWallet, record.id);
    renderAdminTable();
  } catch (error) {
    const message =
      typeof error?.message === "string" ? error.message : "Failed to delete character.";
    window.alert(message);
  } finally {
    state.deletingAdminCharacterId = "";
    renderAdminTable();
  }
}

function renderSuccessStep() {
  const record = state.character;
  if (!record) return;

  syncDisplayedRarity(record);

  if (successPetName) {
    successPetName.textContent = record.name || record.displayName || record.creatureType;
  }

  if (successStats) {
    successStats.innerHTML = ATTRS.map((attr) => {
      const value = record.attributes[attr.key];
      return `
        <div class="success-card-stat">
          <img src="${attr.icon}" alt="" width="20" height="20" />
          <span>${value}</span>
        </div>
      `;
    }).join("");
  }

  if (successPowerText) {
    successPowerText.textContent = getSelectedPowerDescription(record);
  }
}

function fireSuccessConfetti() {
  if (typeof window.confetti !== "function") return;

  const count = 200;
  const defaults = {
    disableForReducedMotion: true,
    origin: { y: 0.7 },
    zIndex: 1000,
  };

  const fire = (particleRatio, options) => {
    window.confetti({
      ...defaults,
      ...options,
      particleCount: Math.floor(count * particleRatio),
    });
  };

  window.requestAnimationFrame(() => {
    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { decay: 0.91, scalar: 0.8, spread: 100 });
    fire(0.1, { decay: 0.92, scalar: 1.2, spread: 120, startVelocity: 25 });
    fire(0.1, { spread: 120, startVelocity: 45 });
  });
}

function moveTo(step) {
  if (!ENABLE_ARENA && step === "arena") {
    step = "cabinet";
  }

  if (step === "admin" && !state.isAdmin) {
    step = state.isAuthenticated ? "cabinet" : "type";
  }

  state.step = step;
  setProgress(step);

  if (step === "type") {
    showScreen("screenType");
    renderTypeStep();
  }
  if (step === "process") {
    showScreen("screenProcess");
  }
  if (step === "powers") {
    showScreen("screenPowers");
    renderPowersStep();
  }
  if (step === "attrs") {
    showScreen("screenAttrs");
    renderAttrsStep();
    suppressRewardsTooltip();
  }
  if (step === "success") {
    showScreen("screenSuccess");
    renderSuccessStep();
    fireSuccessConfetti();
  }
  if (step === "cabinet") {
    showScreen("screenCabinet");
    renderCabinet();
  }
  if (step === "arena") {
    showScreen("screenArena");
    renderArena();
  }
  if (step === "admin") {
    showScreen("screenAdmin");
    renderAdminTable();
    loadAdminCharacters();
  }

  syncDashboardTabs(step);
  document.body.classList.remove("app-booting");
  resetStepScroll();
}

async function startCharacterCreation() {
  if (state.isStarting) return;

  const creatureType = getResolvedType();
  if (!creatureType) {
    renderTypeStep();
    return;
  }

  if (!state.isAuthenticated) {
    state.pendingStartAfterAuth = true;
    setWalletStatus("Connect wallet to create a character.", "error");
    openWalletModal();
    return;
  }

  if (!hasCharacterCreationCapacity()) {
    moveTo("cabinet");
    window.alert(`Character limit reached. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`);
    return;
  }

  state.pendingStartAfterAuth = false;
  state.isStarting = true;
  resetCharacterState({ keepTypeSelection: true, keepCharacters: true });
  updateTypeContinueState();
  setProcessCopy("Cooking up your pet...", "Please wait, it could take a few seconds");
  moveTo("process");

  try {
    const [data] = await Promise.all([
      apiRequest("/api/character/start", { creatureType }),
      wait(1200),
    ]);

    syncStateWithPayload(data);
    moveTo("powers");
  } catch (error) {
    moveTo("type");
    if (/already exists/i.test(error.message)) {
      await restoreCharacterState();
      return;
    }
    if (/limit reached/i.test(error.message)) {
      await restoreCharacterState();
      moveTo("cabinet");
      window.alert(error.message);
      return;
    }
    handleFlowError(error, "Unable to create character.");
  } finally {
    state.isStarting = false;
    renderTypeStep();
  }
}

async function savePowerSelectionAndContinue() {
  if (state.isSavingPower || !state.selectedPowerId) return;

  state.isSavingPower = true;
  renderPowersStep();
  reportClientIssue("power_select_submit");
  const slowRequestTimer = window.setTimeout(() => {
    reportClientIssue("power_select_slow", {
      message: "select-power request still pending after 8s",
    });
  }, 8000);

  try {
    const data = await apiRequest("/api/character/select-power", {
      selectedPowerId: state.selectedPowerId,
    });

    syncStateWithPayload(data);
    moveTo("attrs");
  } catch (error) {
    reportClientIssue("power_select_error", {
      message: typeof error?.message === "string" ? error.message : "Unable to save superpower.",
    });
    if (/already exists/i.test(error.message)) {
      await restoreCharacterState();
      return;
    }
    handleFlowError(error, "Unable to save superpower.");
    renderPowersStep();
  } finally {
    window.clearTimeout(slowRequestTimer);
    state.isSavingPower = false;
    if (state.step === "powers") {
      renderPowersStep();
    }
  }
}

async function completeCharacterCreation() {
  if (state.isCreating || pointsRemaining() !== 0) return;

  state.isCreating = true;
  updateAttrsStep();

  try {
    const data = await apiRequest("/api/character/create", {
      stats: state.attrs,
    });

    syncStateWithPayload(data);
    moveTo("success");
  } catch (error) {
    if (/already exists/i.test(error.message)) {
      await restoreCharacterState();
      return;
    }
    handleFlowError(error, "Unable to finalize character.");
  } finally {
    state.isCreating = false;
    if (state.step === "attrs") {
      updateAttrsStep();
    }
  }
}

function init() {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  preloadTypeIcons();
  preloadPowersAssets();
  preloadAttrsAssets();
  setCharacterImages(DEFAULT_CHARACTER_IMAGE, "");
  updateEnergyUi();

  const chips = [...document.querySelectorAll(".type-chip")];
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      state.selectedType = chip.dataset.type || "";
      if (state.selectedType !== "Other") {
        otherTypeInput.value = "";
      }
      renderTypeStep();
    });

    chip.addEventListener("mouseenter", () => {
      if (chip.classList.contains("active")) return;
      applyChipIcon(chip, "hover");
    });

    chip.addEventListener("mouseleave", () => {
      if (chip.classList.contains("active")) return;
      applyChipIcon(chip, "default");
    });

    chip.addEventListener("focus", () => {
      if (chip.classList.contains("active")) return;
      applyChipIcon(chip, "hover");
    });

    chip.addEventListener("blur", () => {
      if (chip.classList.contains("active")) return;
      applyChipIcon(chip, "default");
    });
  });

  otherTypeInput.addEventListener("beforeinput", (event) => {
    if (event.isComposing || String(event.inputType || "").startsWith("delete")) {
      return;
    }

    const insertedLength = typeof event.data === "string" ? event.data.length : 0;
    if (willOtherTypeInputExceedLimit(otherTypeInput, insertedLength)) {
      showCreatureTypeLimitToast();
    }
  });

  otherTypeInput.addEventListener("paste", (event) => {
    const pastedText = event.clipboardData?.getData("text") || "";
    if (willOtherTypeInputExceedLimit(otherTypeInput, pastedText.length)) {
      showCreatureTypeLimitToast();
    }
  });

  otherTypeInput.addEventListener("input", updateTypeContinueState);
  typeContinueBtn.addEventListener("click", () => {
    startCharacterCreation();
  });

  powersContinueBtn.addEventListener("click", () => {
    savePowerSelectionAndContinue();
  });

  attrsContinueBtn.addEventListener("click", () => {
    completeCharacterCreation();
  });

  document.getElementById("backToTypeBtn").addEventListener("click", () => {
    moveTo("type");
  });

  document.getElementById("backToPowersBtn").addEventListener("click", () => {
    moveTo("powers");
  });

  document.getElementById("openCabinetBtn").addEventListener("click", () => {
    window.location.href = new URL(DASHBOARD_ROUTE, window.location.origin).toString();
  });

  createAnotherBtn.addEventListener("click", () => {
    if (!hasCharacterCreationCapacity()) {
      showToast(`Character limit reached. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`);
      return;
    }
    window.location.href = new URL(CREATION_ROUTE, window.location.origin).toString();
  });

  walletMenuCreatePet.addEventListener("click", () => {
    openCreatePetFromMenu();
  });

  walletMenuDashboard.addEventListener("click", () => {
    openDashboardFromMenu();
  });

  if (dashboardTabMyPets) {
    dashboardTabMyPets.addEventListener("click", () => {
      moveTo("cabinet");
    });
  }

  if (dashboardTabArena) {
    dashboardTabArena.addEventListener("click", () => {
      moveTo("arena");
    });
  }

  if (arenaStartFightBtn) {
    arenaStartFightBtn.addEventListener("click", () => {
      startFightFlow();
    });
  }

  if (cabinetCard) {
    cabinetCard.addEventListener("click", (event) => {
      const fightButton = event.target.closest(".cabinet-fight-btn");
      if (!fightButton) return;
      if (fightButton.disabled) return;
      startFightFlow(fightButton.dataset.characterId);
    });
  }

  if (walletMenuAdmin) {
    walletMenuAdmin.addEventListener("click", () => {
      openAdminPanelFromMenu();
    });
  }

  connectTrigger.addEventListener("click", () => {
    if (state.isAuthenticated) {
      toggleWalletMenu();
      return;
    }
    openWalletModal();
  });

  walletClose.addEventListener("click", closeWalletModal);
  walletOverlay.addEventListener("click", (event) => {
    if (event.target === walletOverlay) closeWalletModal();
  });

  walletButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      await connectWallet(button.dataset.wallet);
    });
  });

  continueBtn.addEventListener("click", async () => {
    closeWalletModal();
    if (state.pendingStartAfterAuth) {
      await startCharacterCreation();
    }
  });

  window.addEventListener("error", (event) => {
    reportClientIssue("window_error", {
      message: event?.message || "Unknown window error",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      typeof event?.reason === "string"
        ? event.reason
        : typeof event?.reason?.message === "string"
          ? event.reason.message
          : "Unhandled promise rejection";
    reportClientIssue("unhandled_rejection", {
      message: reason,
    });
  });

  if (claimRewardsBtn) {
    claimRewardsBtn.addEventListener("click", () => {
      claimRewardsBtn.blur();
    });
  }

  if (adminSearchInput) {
    adminSearchInput.addEventListener("input", (event) => {
      setAdminActiveQuery(event.target.value || "");
      setAdminActivePage(1);
      renderAdminTable();
    });
  }

  if (adminNavCharacters) {
    adminNavCharacters.addEventListener("click", () => {
      switchAdminSection("characters");
    });
  }

  if (adminNavWaitlist) {
    adminNavWaitlist.addEventListener("click", () => {
      switchAdminSection("waitlist");
    });
  }

  if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener("click", async () => {
      if (state.adminSection === "waitlist") {
        await loadAdminWaitlist({ force: true });
        return;
      }
      await loadAdminCharacters({ force: true });
    });
  }

  if (adminExportBtn) {
    adminExportBtn.addEventListener("click", () => {
      const query = getAdminActiveQuery().trim();
      const url = new URL("/api/admin/waitlist-export", window.location.origin);
      if (query) {
        url.searchParams.set("q", query);
      }
      window.location.href = url.toString();
    });
  }

  if (adminBackToDashboardBtn) {
    adminBackToDashboardBtn.addEventListener("click", () => {
      window.location.href = new URL(DASHBOARD_ROUTE, window.location.origin).toString();
    });
  }

  if (adminPrevBtn) {
    adminPrevBtn.addEventListener("click", () => {
      const currentPage = getAdminActivePage();
      if (currentPage <= 1) return;
      setAdminActivePage(currentPage - 1);
      renderAdminTable();
    });
  }

  if (adminNextBtn) {
    adminNextBtn.addEventListener("click", () => {
      const { totalPages } = getAdminPaginationState();
      const currentPage = getAdminActivePage();
      if (currentPage >= totalPages) return;
      setAdminActivePage(currentPage + 1);
      renderAdminTable();
    });
  }

  walletMenuLogout.addEventListener("click", async () => {
    try {
      await logoutWallet();
    } catch {
      showWalletAuthState();
      window.location.href = new URL("/", window.location.origin).toString();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && walletOverlay.getAttribute("aria-hidden") === "false") {
      closeWalletModal();
    }
    if (event.key === "Escape") closeAdminImageLightbox();
    if (event.key === "Escape") hideWalletMenu();
  });

  document.addEventListener("click", (event) => {
    if (
      !walletMenu.classList.contains("hidden") &&
      event.target !== connectTrigger &&
      !walletMenu.contains(event.target)
    ) {
      hideWalletMenu();
    }
  });

  refreshDetectedBadges();
  restoreWalletSession();
  closeWalletModal();
  if (getPageMode() === "dashboard") {
    moveTo(getRequestedScreen() === "arena" ? "arena" : "cabinet");
    return;
  }

  if (getPageMode() === "admin") {
    moveTo("admin");
    return;
  }

  moveTo("type");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
