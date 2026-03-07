const TYPES = ["Dragon", "Phoenix", "Cat", "Owl", "Ape", "Panda", "Undead", "Other"];
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
    default: {
      primary: "/assets/pet-types/ape-default.svg",
    },
    hover: {
      primary: "/assets/pet-types/ape-hover.svg",
    },
    active: {
      primary: "/assets/pet-types/ape-active.svg",
    },
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
const POWERS = [
  {
    id: "p1",
    title: "Skeleton Call",
    description: "At the beginning of the battle, summons a skeleton warrior",
    iconDefault: "/assets/powers-step/power-icon-default.svg",
    iconActive: "/assets/powers-step/power-icon-active.svg",
  },
  {
    id: "p2",
    title: "Critical Momentum",
    description: "Each damage dealt increases the chance of a critical hit",
    iconDefault: "/assets/powers-step/power-icon-default.svg",
    iconActive: "/assets/powers-step/power-icon-active.svg",
  },
  {
    id: "p3",
    title: "Fire Shield",
    description: "Creates a fire shield that absorbs part of the damage",
    iconDefault: "/assets/powers-step/power-icon-default.svg",
    iconActive: "/assets/powers-step/power-icon-active.svg",
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
const typeContinueBtn = document.getElementById("typeContinueBtn");
const otherInputWrap = document.getElementById("otherInputWrap");
const otherTypeInput = document.getElementById("otherTypeInput");
const powersGrid = document.getElementById("powersGrid");
const powersContinueBtn = document.getElementById("powersContinueBtn");
const powersTitle = document.getElementById("powersTitle");
const attrsList = document.getElementById("attrsList");
const pointsLeft = document.getElementById("pointsLeft");
const attrsContinueBtn = document.getElementById("attrsContinueBtn");
const successPetName = document.getElementById("successPetName");
const successStats = document.getElementById("successStats");
const cabinetCard = document.getElementById("cabinetCard");
const connectTrigger = document.getElementById("connectTrigger");
const walletOverlay = document.getElementById("walletOverlay");
const walletClose = document.getElementById("walletClose");
const walletMenu = document.getElementById("walletMenu");
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

const barType = document.getElementById("barType");
const barPowers = document.getElementById("barPowers");
const barAttrs = document.getElementById("barAttrs");
const labelType = document.getElementById("labelType");
const labelPowers = document.getElementById("labelPowers");
const labelAttrs = document.getElementById("labelAttrs");

const state = {
  step: "type",
  selectedType: "",
  selectedPowerId: "",
  isAuthenticated: false,
  attrs: {
    stamina: 0,
    agility: 0,
    strength: 0,
    intelligence: 0,
  },
};

function shortenAddress(address) {
  if (!address || address.length < 12) return address || "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function setWalletStatus(message, type = "neutral") {
  walletStatus.textContent = message;
  walletStatus.classList.toggle("success", type === "success");
  walletStatus.classList.toggle("error", type === "error");
}

async function authRequest(path, body, method = "POST") {
  const response = await fetch(path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    credentials: "include",
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
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

function showLoggedWalletState({ walletAddress }) {
  state.isAuthenticated = true;
  walletAuthPanel.classList.add("hidden");
  walletLoggedPanel.classList.remove("hidden");
  walletClose.classList.add("hidden");
  loggedWalletAddress.textContent = walletAddress;
  connectTrigger.textContent = shortenAddress(walletAddress);
}

function showWalletAuthState() {
  state.isAuthenticated = false;
  walletLoggedPanel.classList.add("hidden");
  walletAuthPanel.classList.remove("hidden");
  walletClose.classList.remove("hidden");
  setWalletStatus("");
  connectTrigger.textContent = "Connect wallet";
  hideWalletMenu();
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
    const challenge = await authRequest("/api/auth/solana/challenge", { wallet: address });
    const encodedMessage = new TextEncoder().encode(challenge.message);
    if (!provider.signMessage) throw new Error("Wallet does not support message signing.");

    setWalletStatus("Please confirm signature in your wallet...");
    const signatureResult = await provider.signMessage(encodedMessage, "utf8");
    const signatureBase64 = bytesToBase64(extractSignatureBytes(signatureResult));

    setWalletStatus("Verifying signature...");
    const verified = await authRequest("/api/auth/solana/verify", {
      wallet: address,
      walletType: walletKey,
      message: challenge.message,
      signature: signatureBase64,
      challengeToken: challenge.challengeToken,
    });

    showLoggedWalletState({ walletAddress: verified.wallet });
    setWalletStatus("Wallet connected successfully.", "success");
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
    const data = await authRequest("/api/auth/solana/me", {}, "GET");
    if (!data?.authenticated || !data?.wallet) throw new Error("No active session");
    showLoggedWalletState({ walletAddress: data.wallet });
  } catch {
    showWalletAuthState();
  }
}

async function logoutWallet() {
  await authRequest("/api/auth/solana/logout", {});
  showWalletAuthState();
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
  [screenType, screenProcess, screenPowers, screenAttrs, screenSuccess, screenCabinet].forEach((screen) => {
    screen.classList.toggle("hidden", screen.id !== targetId);
  });

  document.body.classList.toggle("success-screen-active", targetId === "screenSuccess");
}

function setProgress(step) {
  if (progressWrap) {
    progressWrap.classList.toggle("hidden", step === "success" || step === "cabinet");
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
  const isValid = Boolean(getResolvedType());
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
  const assets = [
    "/assets/character/current-pet.jpg",
    "/assets/powers-step/power-icon-default.svg",
    "/assets/powers-step/power-icon-active.svg",
  ];
  assets.forEach((url) => {
    const img = new Image();
    img.src = url;
  });
}

function preloadAttrsAssets() {
  const assets = [
    "/assets/character/current-pet.jpg",
    "/assets/attrs-step/stamina.svg",
    "/assets/attrs-step/agility.svg",
    "/assets/attrs-step/strength.svg",
    "/assets/attrs-step/intelligence.svg",
    "/assets/attrs-step/minus.svg",
    "/assets/attrs-step/plus.svg",
    "/assets/attrs-step/wallet.svg",
  ];
  assets.forEach((url) => {
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
  powersGrid.innerHTML = "";
  const hasSelected = POWERS.some((item) => item.id === state.selectedPowerId);
  powersContinueBtn.disabled = !hasSelected;
  powersContinueBtn.classList.toggle("enabled", hasSelected);
  powersTitle.textContent = `The ${getResolvedType() || "Pet"} is now your Pet`;

  POWERS.forEach((power) => {
    const isActive = power.id === state.selectedPowerId;
    const iconSrc = isActive ? power.iconActive : power.iconDefault;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "power-card";
    card.classList.toggle("active", isActive);
    card.innerHTML = `<img class="power-card-icon" src="${iconSrc}" alt="" width="20" height="20" /><p>${power.description}</p>`;
    card.addEventListener("click", () => {
      if (state.selectedPowerId === power.id) return;
      state.selectedPowerId = power.id;
      renderPowersStep();
    });
    powersGrid.appendChild(card);
  });
}

function pointsRemaining() {
  return 15 - Object.values(state.attrs).reduce((sum, value) => sum + value, 0);
}

function updateAttrsButtonState() {
  const left = pointsRemaining();
  pointsLeft.textContent = String(left);
  const ready = left === 0;
  attrsContinueBtn.disabled = !ready;
  attrsContinueBtn.classList.toggle("enabled", ready);
  attrsContinueBtn.classList.toggle("mobile-hidden", !ready);
  if (attrsSidePanel) {
    attrsSidePanel.classList.toggle("is-ready", ready);
  }
}

function renderAttrsStep() {
  attrsList.innerHTML = "";

  ATTRS.forEach((attr) => {
    const value = state.attrs[attr.key];
    const canMinus = value > 0;
    const canPlus = pointsRemaining() > 0 && value < 15;
    const segments = Array.from({ length: 15 }, (_, index) => {
      const classes = ["attr-segment"];
      if (index === 0) classes.push("first");
      if (index === 14) classes.push("last");
      if (index < value) classes.push("filled");
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
          <button class="attr-btn" type="button" data-action="minus" ${canMinus ? "" : "disabled"}>
            <img src="/assets/attrs-step/minus.svg" alt="" width="20" height="20" />
          </button>
          <button class="attr-btn" type="button" data-action="plus" ${canPlus ? "" : "disabled"}>
            <img src="/assets/attrs-step/plus.svg" alt="" width="20" height="20" />
          </button>
        </div>
      </div>
      <div class="attr-scale">${segments}</div>
    `;

    const minusBtn = row.querySelector('[data-action="minus"]');
    const plusBtn = row.querySelector('[data-action="plus"]');

    minusBtn.addEventListener("click", () => {
      if (state.attrs[attr.key] <= 0) return;
      state.attrs[attr.key] -= 1;
      renderAttrsStep();
    });

    plusBtn.addEventListener("click", () => {
      if (state.attrs[attr.key] >= 15 || pointsRemaining() <= 0) return;
      state.attrs[attr.key] += 1;
      renderAttrsStep();
    });

    attrsList.appendChild(row);
  });

  updateAttrsButtonState();
}

function renderCabinet() {
  const power = POWERS.find((item) => item.id === state.selectedPowerId);
  cabinetCard.innerHTML = `
    <h2>${getResolvedType() || "Pet"}</h2>
    <p><strong>Power:</strong> ${power ? power.title : "-"}</p>
    <p><strong>Stamina:</strong> ${state.attrs.stamina}</p>
    <p><strong>Agility:</strong> ${state.attrs.agility}</p>
    <p><strong>Strength:</strong> ${state.attrs.strength}</p>
    <p><strong>Intelligence:</strong> ${state.attrs.intelligence}</p>
  `;
}

function renderSuccessStep() {
  if (successPetName) {
    successPetName.textContent = "Riche Lich";
  }

  if (successStats) {
    successStats.innerHTML = ATTRS.map((attr) => {
      const value = state.attrs[attr.key];
      return `
        <div class="success-card-stat">
          <img src="${attr.icon}" alt="" width="20" height="20" />
          <span>${value}</span>
        </div>
      `;
    }).join("");
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
    fire(0.25, {
      spread: 26,
      startVelocity: 55,
    });
    fire(0.2, {
      spread: 60,
    });
    fire(0.35, {
      decay: 0.91,
      scalar: 0.8,
      spread: 100,
    });
    fire(0.1, {
      decay: 0.92,
      scalar: 1.2,
      spread: 120,
      startVelocity: 25,
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 45,
    });
  });
}

function moveTo(step) {
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

  resetStepScroll();
}

function init() {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  preloadTypeIcons();
  preloadPowersAssets();
  preloadAttrsAssets();
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
    moveTo("process");
    window.setTimeout(() => {
      moveTo("powers");
    }, 5000);
  });

  powersContinueBtn.addEventListener("click", () => {
    moveTo("attrs");
  });

  attrsContinueBtn.addEventListener("click", () => {
    moveTo("success");
  });

  document.getElementById("backToTypeBtn").addEventListener("click", () => {
    moveTo("type");
  });

  document.getElementById("backToPowersBtn").addEventListener("click", () => {
    moveTo("powers");
  });

  document.getElementById("openCabinetBtn").addEventListener("click", () => {
    moveTo("cabinet");
  });

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

  continueBtn.addEventListener("click", closeWalletModal);

  if (claimRewardsBtn) {
    claimRewardsBtn.addEventListener("click", () => {
      claimRewardsBtn.blur();
    });
  }

  walletMenuLogout.addEventListener("click", async () => {
    try {
      await logoutWallet();
    } catch {
      showWalletAuthState();
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
  moveTo("type");
}

window.addEventListener("load", init);
