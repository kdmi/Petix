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

const connectTrigger = document.getElementById("connectTrigger");
const walletOverlay = document.getElementById("walletOverlay");
const walletClose = document.getElementById("walletClose");
const walletMenu = document.getElementById("walletMenu");
let walletMenuCreatePet = document.getElementById("walletMenuCreatePet");
let walletMenuDashboard = document.getElementById("walletMenuDashboard");
let walletMenuAdmin = document.getElementById("walletMenuAdmin");
const walletMenuLogout = document.getElementById("walletMenuLogout");
const walletAuthPanel = document.getElementById("walletAuthPanel");
const walletLoggedPanel = document.getElementById("walletLoggedPanel");
const walletStatus = document.getElementById("walletStatus");
const loggedWalletAddress = document.getElementById("loggedWalletAddress");
const continueBtn = document.getElementById("continueBtn");
const walletButtons = document.querySelectorAll(".wallet-item");
const detectedBadges = document.querySelectorAll("[data-detected-for]");
const shouldOpenAuthModal = new URLSearchParams(window.location.search).get("auth") === "1";
let isAuthenticated = false;
let isAdmin = false;
let characterCount = 0;
let toastTimeoutId = 0;

function ensureWalletMenuItem(id, label, hidden = false) {
  if (!walletMenu) return null;

  let button = document.getElementById(id);
  if (button) return button;

  button = document.createElement("button");
  button.className = "wallet-menu-item";
  if (hidden) {
    button.classList.add("hidden");
  }
  button.id = id;
  button.type = "button";
  button.textContent = label;

  if (walletMenuLogout) {
    walletMenu.insertBefore(button, walletMenuLogout);
  } else {
    walletMenu.appendChild(button);
  }

  return button;
}

function ensureWalletMenuItems() {
  walletMenuCreatePet = ensureWalletMenuItem("walletMenuCreatePet", "Create pet");
  walletMenuDashboard = ensureWalletMenuItem("walletMenuDashboard", "Dashboard");
  walletMenuAdmin = ensureWalletMenuItem("walletMenuAdmin", "Admin panel", true);
}

function shortenAddress(address) {
  if (!address || address.length < 12) return address || "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function isAdminWalletAddress(address) {
  const normalized = String(address || "").trim();
  return Boolean(normalized) && ADMIN_WALLETS.includes(normalized);
}

function setStatus(message, type = "neutral") {
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

async function apiRequest(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function openModal() {
  hideWalletMenu();
  walletOverlay.classList.remove("hidden");
  walletOverlay.setAttribute("aria-hidden", "false");
}

function closeModal() {
  walletOverlay.classList.add("hidden");
  walletOverlay.setAttribute("aria-hidden", "true");
}

function hasCharacterCreationCapacity() {
  return isAdmin || characterCount < MAX_CHARACTERS_PER_WALLET;
}

function updateCreatePetMenuState() {
  if (!walletMenuCreatePet) return;

  const isBlocked = isAuthenticated && !hasCharacterCreationCapacity();
  walletMenuCreatePet.classList.toggle("disabled", isBlocked);
  walletMenuCreatePet.setAttribute("aria-disabled", isBlocked ? "true" : "false");
  walletMenuCreatePet.title = isBlocked
    ? `Character limit reached. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`
    : "";
}

async function refreshCharacterCapacity() {
  if (!isAuthenticated) {
    characterCount = 0;
    updateCreatePetMenuState();
    return null;
  }

  try {
    const response = await fetch("/api/character/me", {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to load character count.");
    }

    const data = await response.json();
    characterCount = Array.isArray(data?.characters) ? data.characters.length : 0;
    updateCreatePetMenuState();
    return data;
  } catch {
    characterCount = 0;
    updateCreatePetMenuState();
    return null;
  }
}

function redirectAuthenticatedUser(data = null) {
  const characters = Array.isArray(data?.characters) ? data.characters : [];
  const targetPath = characters.length > 0 ? "/dashboard/" : "/pet-creation/";
  const targetUrl = new URL(targetPath, window.location.origin).toString();
  window.location.replace(targetUrl);
}

function showLoggedState({ walletAddress, isAdmin: nextIsAdmin = false }) {
  isAuthenticated = true;
  isAdmin = Boolean(nextIsAdmin) || isAdminWalletAddress(walletAddress);
  walletAuthPanel.classList.add("hidden");
  walletLoggedPanel.classList.remove("hidden");
  walletClose.classList.add("hidden");
  loggedWalletAddress.textContent = walletAddress;
  connectTrigger.textContent = shortenAddress(walletAddress);
  if (walletMenuAdmin) {
    walletMenuAdmin.classList.toggle("hidden", !isAdmin);
  }
  updateCreatePetMenuState();
}

function showAuthState() {
  isAuthenticated = false;
  isAdmin = false;
  characterCount = 0;
  walletLoggedPanel.classList.add("hidden");
  walletAuthPanel.classList.remove("hidden");
  walletClose.classList.remove("hidden");
  setStatus("");
  connectTrigger.textContent = "Connect wallet";
  if (walletMenuAdmin) {
    walletMenuAdmin.classList.add("hidden");
  }
  updateCreatePetMenuState();
  hideWalletMenu();
}

function openPetCreation(target = "type") {
  if (target === "cabinet") {
    window.location.href = new URL("/dashboard/", window.location.origin).toString();
    return;
  }

  if (target === "admin") {
    window.location.href = new URL("/admin/", window.location.origin).toString();
    return;
  }

  window.location.href = new URL("/pet-creation/", window.location.origin).toString();
}

ensureWalletMenuItems();

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
    if (canUseWalletBrowseDeeplink() && typeof wallet.mobileBrowseUrl === "function") {
      setStatus(`Opening ${wallet.label} app...`);
      window.location.href = wallet.mobileBrowseUrl(window.location.href);
      return;
    }

    setStatus(`${wallet.label} is not detected. Opening install page...`);
    window.open(wallet.installUrl, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    setStatus(`Connecting ${wallet.label}...`);
    const connectResult = await provider.connect();
    const address =
      connectResult?.publicKey?.toString?.() ||
      provider.publicKey?.toString?.() ||
      "";

    if (!address) {
      throw new Error("Wallet address was not returned.");
    }

    setStatus("Creating sign-in challenge...");
    const challenge = await apiRequest("/api/auth/solana/challenge", { wallet: address });

    const encodedMessage = new TextEncoder().encode(challenge.message);
    if (!provider.signMessage) {
      throw new Error("Wallet does not support message signing.");
    }

    setStatus("Please confirm signature in your wallet...");
    const signatureResult = await provider.signMessage(encodedMessage, "utf8");
    const signatureBytes = extractSignatureBytes(signatureResult);
    const signatureBase64 = bytesToBase64(signatureBytes);

    setStatus("Verifying signature...");
    const verified = await apiRequest("/api/auth/solana/verify", {
      wallet: address,
      walletType: walletKey,
      message: challenge.message,
      signature: signatureBase64,
      challengeToken: challenge.challengeToken,
    });

    showLoggedState({
      walletAddress: verified.wallet,
      isAdmin: verified.isAdmin,
    });
    const characterData = await refreshCharacterCapacity();
    setStatus("Wallet connected successfully.", "success");
    redirectAuthenticatedUser(characterData);
  } catch (error) {
    const message =
      typeof error?.message === "string" ? error.message : "Connection failed.";
    setStatus(message, "error");
  }
}

async function logoutWallet() {
  await apiRequest("/api/auth/solana/logout", {});
  showAuthState();
}

function refreshDetectedBadges() {
  detectedBadges.forEach((badge) => {
    const walletKey = badge.dataset.detectedFor;
    const isDetected = Boolean(walletConfigs[walletKey]?.getProvider());
    badge.classList.toggle("hidden", !isDetected);
  });
}

function toggleWalletMenu() {
  if (!isAuthenticated) return;
  walletMenu.classList.toggle("hidden");
}

function hideWalletMenu() {
  walletMenu.classList.add("hidden");
}

async function restoreSession() {
  try {
    const response = await fetch("/api/auth/solana/me", {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) throw new Error("No active session");
    const data = await response.json();
    if (!data?.authenticated || !data?.wallet) throw new Error("No active session");
    showLoggedState({
      walletAddress: data.wallet,
      isAdmin: data.isAdmin,
    });
    const characterData = await refreshCharacterCapacity();
    redirectAuthenticatedUser(characterData);
  } catch {
    showAuthState();
  }
}

connectTrigger.addEventListener("click", () => {
  if (isAuthenticated) {
    toggleWalletMenu();
    return;
  }
  openModal();
});

walletClose.addEventListener("click", closeModal);

walletOverlay.addEventListener("click", (event) => {
  if (event.target === walletOverlay) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && walletOverlay.getAttribute("aria-hidden") === "false") {
    closeModal();
  }
  if (event.key === "Escape") hideWalletMenu();
});

walletButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const walletKey = button.dataset.wallet;
    await connectWallet(walletKey);
  });
});

continueBtn.addEventListener("click", () => {
  closeModal();
});

walletMenuLogout.addEventListener("click", async () => {
  try {
    await logoutWallet();
  } catch {
    showAuthState();
  }
});

if (walletMenuCreatePet) {
  walletMenuCreatePet.addEventListener("click", async () => {
    await refreshCharacterCapacity();
    if (!hasCharacterCreationCapacity()) {
      hideWalletMenu();
      showToast(`Character limit reached. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`);
      return;
    }
    openPetCreation("type");
  });
}

if (walletMenuDashboard) {
  walletMenuDashboard.addEventListener("click", () => {
    openPetCreation("cabinet");
  });
}

if (walletMenuAdmin) {
  walletMenuAdmin.addEventListener("click", () => {
    if (!isAdmin) return;
    openPetCreation("admin");
  });
}

document.addEventListener("click", (event) => {
  if (
    !walletMenu.classList.contains("hidden") &&
    event.target !== connectTrigger &&
    !walletMenu.contains(event.target)
  ) {
    hideWalletMenu();
  }
});

window.addEventListener("load", async () => {
  refreshDetectedBadges();
  await restoreSession();
  if (!isAuthenticated && shouldOpenAuthModal) {
    setStatus("Connect wallet to continue.", "error");
    openModal();
    return;
  }
  closeModal();
});

window.addEventListener("storage", () => {
  refreshDetectedBadges();
});
