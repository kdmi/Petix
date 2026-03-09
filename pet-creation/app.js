const TYPES = ["Dragon", "Phoenix", "Cat", "Owl", "Ape", "Panda", "Undead", "Other"];
const DEFAULT_ATTRIBUTE_POINTS = 15;
const DEFAULT_CHARACTER_IMAGE = "/assets/character/current-pet.jpg";
const API_BASE_URL = window.PETIX_API_BASE_URL || "";
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
    getProvider: () => {
      if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
      if (window.solana?.isPhantom) return window.solana;
      return null;
    },
  },
  solflare: {
    label: "Solflare",
    installUrl: "https://solflare.com/",
    getProvider: () => {
      if (window.solflare?.isSolflare) return window.solflare;
      if (window.SolflareApp) return window.SolflareApp;
      return null;
    },
  },
  trust: {
    label: "Trust Wallet",
    installUrl: "https://trustwallet.com/browser-extension",
    getProvider: () => {
      if (window.trustwallet?.solana) return window.trustwallet.solana;
      if (window.trustWallet?.solana) return window.trustWallet.solana;
      if (window.solana?.isTrust) return window.solana;
      return null;
    },
  },
};
const ADMIN_WALLETS = ["AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9"];
const CREATION_ROUTE = "/pet-creation/";
const DASHBOARD_ROUTE = "/dashboard/";
const ADMIN_ROUTE = "/admin/";

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
const adminSearchInput = document.getElementById("adminSearchInput");
const adminTableBody = document.getElementById("adminTableBody");
const adminEmpty = document.getElementById("adminEmpty");
const adminRefreshBtn = document.getElementById("adminRefreshBtn");
const adminBackToDashboardBtn = document.getElementById("adminBackToDashboardBtn");
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
  adminCharacters: [],
  adminWalletQuery: "",
  isAdminLoading: false,
  deletingAdminCharacterId: "",
  adminErrorMessage: "",
  attrs: createEmptyAttrs(),
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

function setWalletStatus(message, type = "neutral") {
  walletStatus.textContent = message;
  walletStatus.classList.toggle("success", type === "success");
  walletStatus.classList.toggle("error", type === "error");
}

function updateAdminAccessUi() {
  if (!walletMenuAdmin) return;
  walletMenuAdmin.classList.toggle("hidden", !state.isAdmin);
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
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function toApiUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

function normalizeCharacterRecord(record) {
  if (!record) return null;

  return {
    ...record,
    imageUrl: record.imageUrl ? toApiUrl(record.imageUrl) : DEFAULT_CHARACTER_IMAGE,
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
}

function showWalletAuthState() {
  state.isAuthenticated = false;
  state.isAdmin = false;
  state.walletAddress = "";
  state.adminCharacters = [];
  state.adminWalletQuery = "";
  state.isAdminLoading = false;
  state.deletingAdminCharacterId = "";
  state.adminErrorMessage = "";
  walletLoggedPanel.classList.add("hidden");
  walletAuthPanel.classList.remove("hidden");
  walletClose.classList.remove("hidden");
  setWalletStatus("");
  connectTrigger.textContent = "Connect wallet";
  if (adminSearchInput) adminSearchInput.value = "";
  hideWalletMenu();
  updateAdminAccessUi();
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
  }

  if ("draft" in payload) {
    state.draft = normalizeCharacterRecord(payload.draft);
  }

  if ("character" in payload) {
    state.character = normalizeCharacterRecord(payload.character);
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
    return;
  }

  setCharacterImages(DEFAULT_CHARACTER_IMAGE, "");
  syncDisplayedRarity(null);
}

function resetCharacterState({ keepTypeSelection = false, keepCharacters = false } = {}) {
  state.draft = null;
  state.character = null;
  if (!keepCharacters) {
    state.characters = [];
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
  window.location.href = new URL(CREATION_ROUTE, window.location.origin).toString();
}

function openDashboardFromMenu() {
  hideWalletMenu();
  window.location.href = new URL(DASHBOARD_ROUTE, window.location.origin).toString();
}

function openAdminPanelFromMenu() {
  hideWalletMenu();
  window.location.href = new URL(ADMIN_ROUTE, window.location.origin).toString();
}

function getRequestedScreen() {
  const screen = new URLSearchParams(window.location.search).get("screen");
  return ["type", "cabinet", "admin"].includes(screen) ? screen : "";
}

function getPageMode() {
  const explicitPage = String(document.body?.dataset?.page || "").trim().toLowerCase();
  if (["creation", "dashboard", "admin"].includes(explicitPage)) {
    return explicitPage;
  }

  const requestedScreen = getRequestedScreen();
  if (requestedScreen === "cabinet") return "dashboard";
  if (requestedScreen === "admin") return "admin";
  return "creation";
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
      moveTo(requestedScreen === "admin" ? "admin" : "cabinet");
      return true;
    }

    syncStateWithPayload(data);

    if (pageMode === "admin" && state.isAdmin) {
      moveTo("admin");
      return true;
    }

    if (pageMode === "dashboard") {
      moveTo("cabinet");
      return true;
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
    const data = await apiRequest("/api/auth/solana/me", {}, "GET");
    if (!data?.authenticated || !data?.wallet) throw new Error("No active session");
    showLoggedWalletState({ walletAddress: data.wallet, isAdmin: data.isAdmin });
    await restoreCharacterState();
  } catch {
    showWalletAuthState();
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
  [screenType, screenProcess, screenPowers, screenAttrs, screenSuccess, screenCabinet, screenAdmin].forEach(
    (screen) => {
      screen.classList.toggle("hidden", screen.id !== targetId);
    }
  );

  document.body.classList.toggle("success-screen-active", targetId === "screenSuccess");
}

function setProgress(step) {
  if (progressWrap) {
    progressWrap.classList.toggle("hidden", step === "success" || step === "cabinet" || step === "admin");
  }

  barType.classList.toggle("active", ["type", "process"].includes(step));
  barPowers.classList.toggle("active", step === "powers");
  barAttrs.classList.toggle("active", ["attrs", "success", "cabinet"].includes(step));

  barType.classList.toggle("completed", ["powers", "attrs", "success", "cabinet"].includes(step));
  barPowers.classList.toggle("completed", ["attrs", "success", "cabinet"].includes(step));
  barAttrs.classList.remove("completed");

  labelType.classList.toggle("active", step === "type" || step === "process");
  labelPowers.classList.toggle("active", step === "powers");
  labelAttrs.classList.toggle("active", step === "attrs" || step === "success" || step === "cabinet");
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

function renderCabinet() {
  const records = [...state.characters].reverse();
  if (cabinetCount) {
    const total = records.length;
    cabinetCount.textContent = `${total} character${total === 1 ? "" : "s"}`;
  }

  if (!records.length) {
    cabinetCard.innerHTML = '<p class="cabinet-empty">No characters created yet.</p>';
    return;
  }

  cabinetCard.innerHTML = records
    .map((record) => {
      const rarity = getRarityMeta(record.rarity);
      const statsMarkup = ATTRS.map((attr) => {
        const value = record.attributes[attr.key];
        return `
          <div class="success-card-stat">
            <img src="${attr.icon}" alt="" width="20" height="20" />
            <span>${value}</span>
          </div>
        `;
      }).join("");

      return `
        <article class="cabinet-character">
          <div class="success-card cabinet-success-card" aria-hidden="true">
            <div class="success-card-title">${record.name || record.displayName || record.creatureType}</div>
            <div class="success-card-image-wrap">
              <img class="success-card-image" src="${record.imageUrl}" alt="${record.creatureType} character" width="248" height="248" />
              <span class="success-card-level">Lvl. 1</span>
              <span class="success-card-rarity" style="background-color: ${rarity.color};">${rarity.label}</span>
              <span class="success-card-exp-label">Experience</span>
              <span class="success-card-exp-value">0/500</span>
              <span class="success-card-exp-track"></span>
              <span class="success-card-exp-progress"></span>
            </div>
            <div class="success-card-stats">${statsMarkup}</div>
            <div class="success-card-power">
              <img class="success-card-power-icon" src="${SUCCESS_POWER_ICON}" alt="" width="20" height="20" />
              <p class="success-card-power-text">${getSelectedPowerDescription(record)}</p>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
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

function updateAdminCount(records) {
  if (!adminCount) return;

  const total = records.length;
  const baseLabel = `${total} created character${total === 1 ? "" : "s"}`;
  adminCount.textContent = state.adminWalletQuery.trim()
    ? `${baseLabel} found`
    : baseLabel;
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

function renderAdminTable() {
  if (!adminTableBody) return;

  const records = getFilteredAdminCharacters();
  updateAdminCount(records);
  adminTableBody.innerHTML = "";

  if (!state.isAdmin) {
    setAdminEmptyState("Admin access is not available for this wallet.", true);
    return;
  }

  if (state.isAdminLoading) {
    setAdminEmptyState("Loading created characters...", true);
    return;
  }

  if (state.adminErrorMessage) {
    setAdminEmptyState(state.adminErrorMessage, true);
    return;
  }

  if (!records.length) {
    const message = state.adminWalletQuery.trim()
      ? "No characters found for this wallet search."
      : "No created characters yet.";
    setAdminEmptyState(message, true);
    return;
  }

  setAdminEmptyState("", false);

  records.forEach((record) => {
    const row = document.createElement("tr");

    const characterCell = document.createElement("td");
    characterCell.className = "admin-character-cell";

    const thumb = document.createElement("img");
    thumb.className = "admin-character-thumb";
    thumb.src = record.imageUrl;
    thumb.alt = record.creatureType ? `${record.creatureType} character` : "Character preview";
    thumb.width = 56;
    thumb.height = 56;

    const summary = document.createElement("div");
    summary.className = "admin-character-summary";

    const title = document.createElement("strong");
    title.textContent = record.name || record.displayName || record.creatureType;

    const meta = document.createElement("span");
    meta.textContent = record.rarity || "Unknown";

    summary.append(title, meta);
    characterCell.append(thumb, summary);

    const typeCell = document.createElement("td");
    typeCell.textContent = record.creatureType || "Unknown";

    const powerCell = document.createElement("td");
    powerCell.className = "admin-power-cell";
    powerCell.textContent = getSelectedPowerDescription(record);

    const walletCell = document.createElement("td");
    walletCell.className = "admin-wallet-cell";
    walletCell.textContent = record.creatorWallet || "";

    const createdCell = document.createElement("td");
    createdCell.textContent = formatDateTime(record.completedAt || record.createdAt);

    const actionCell = document.createElement("td");
    const deleteBtn = document.createElement("button");
    const isDeleting = state.deletingAdminCharacterId === record.id;
    deleteBtn.type = "button";
    deleteBtn.className = "admin-delete-btn";
    deleteBtn.disabled = isDeleting;
    deleteBtn.textContent = isDeleting ? "Deleting..." : "Delete";
    deleteBtn.addEventListener("click", async () => {
      await deleteAdminCharacter(record);
    });
    actionCell.appendChild(deleteBtn);

    row.append(characterCell, typeCell, powerCell, walletCell, createdCell, actionCell);
    adminTableBody.appendChild(row);
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
  } catch (error) {
    state.adminCharacters = [];
    state.adminErrorMessage =
      typeof error?.message === "string" ? error.message : "Failed to load characters.";
  } finally {
    state.isAdminLoading = false;
    renderAdminTable();
  }
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
  if (step === "admin") {
    showScreen("screenAdmin");
    renderAdminTable();
    loadAdminCharacters();
  }

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

  state.pendingStartAfterAuth = false;
  state.isStarting = true;
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

  try {
    const data = await apiRequest("/api/character/select-power", {
      selectedPowerId: state.selectedPowerId,
    });

    syncStateWithPayload(data);
    moveTo("attrs");
  } catch (error) {
    if (/already exists/i.test(error.message)) {
      await restoreCharacterState();
      return;
    }
    handleFlowError(error, "Unable to save superpower.");
    renderPowersStep();
  } finally {
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
    window.location.href = new URL(CREATION_ROUTE, window.location.origin).toString();
  });

  walletMenuCreatePet.addEventListener("click", () => {
    openCreatePetFromMenu();
  });

  walletMenuDashboard.addEventListener("click", () => {
    openDashboardFromMenu();
  });

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

  if (claimRewardsBtn) {
    claimRewardsBtn.addEventListener("click", () => {
      claimRewardsBtn.blur();
    });
  }

  if (adminSearchInput) {
    adminSearchInput.addEventListener("input", (event) => {
      state.adminWalletQuery = event.target.value || "";
      renderAdminTable();
    });
  }

  if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener("click", async () => {
      await loadAdminCharacters({ force: true });
    });
  }

  if (adminBackToDashboardBtn) {
    adminBackToDashboardBtn.addEventListener("click", () => {
      window.location.href = new URL(DASHBOARD_ROUTE, window.location.origin).toString();
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
    moveTo("cabinet");
    return;
  }

  if (getPageMode() === "admin") {
    moveTo("admin");
    return;
  }

  moveTo("type");
}

window.addEventListener("load", init);
