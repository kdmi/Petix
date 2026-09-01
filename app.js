// Public WalletConnect project id (dashboard.reown.com). Safe to keep in static JS.
const WALLETCONNECT_PROJECT_ID = window.PETIX_WALLETCONNECT_PROJECT_ID || "";
const WALLETCONNECT_BUNDLE_URL = "/assets/vendor/wc-ethereum-provider.min.js";

// EIP-6963: collect announced providers so MetaMask is picked correctly even
// when several wallet extensions fight over window.ethereum.
const eip6963Providers = [];
window.addEventListener("eip6963:announceProvider", (event) => {
  if (event?.detail?.provider) eip6963Providers.push(event.detail);
});
try {
  window.dispatchEvent(new Event("eip6963:requestProvider"));
} catch {}

function getMetaMaskProvider() {
  const announced = eip6963Providers.find((entry) => entry.info?.rdns === "io.metamask");
  if (announced) return announced.provider;
  const candidates = Array.isArray(window.ethereum?.providers) ? window.ethereum.providers : [];
  const nested = candidates.find((provider) => provider?.isMetaMask);
  if (nested) return nested;
  if (window.ethereum?.isMetaMask) return window.ethereum;
  return null;
}

const walletConfigs = {
  metamask: {
    label: "MetaMask",
    installUrl: "https://metamask.io/download/",
    mobileBrowseUrl: (targetUrl) =>
      `https://metamask.app.link/dapp/${targetUrl.replace(/^https?:\/\//, "")}`,
    getProvider: () => getMetaMaskProvider(),
  },
  walletconnect: {
    label: "WalletConnect",
    installUrl: "https://walletguide.walletconnect.network/",
    // Provider is created lazily (QR modal / deep link live inside the bundle).
    getProvider: () => null,
  },
};
const ADMIN_WALLETS = [
  "AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9",
  "0x0e8caf9eca5e45df0e6f50f58a5bf664db1740c1",
];
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
const walletFooter = document.querySelector(".wallet-footer");
const loggedWalletAddress = document.getElementById("loggedWalletAddress");
const continueBtn = document.getElementById("continueBtn");
const walletButtons = document.querySelectorAll(".wallet-item");
const detectedBadges = document.querySelectorAll("[data-detected-for]");
const shouldOpenAuthModal = new URLSearchParams(window.location.search).get("auth") === "1";
const shouldRedirectAuthenticatedVisitor =
  document.body?.dataset?.authRedirectMode !== "manual";
let isAuthenticated = false;
let isAdmin = false;
let characterCount = 0;
let toastTimeoutId = 0;

let walletConnectBundlePromise = null;
function loadWalletConnectBundle() {
  if (window.WalletConnectEthereumProvider || window.EthereumProvider) return Promise.resolve();
  if (!walletConnectBundlePromise) {
    walletConnectBundlePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = WALLETCONNECT_BUNDLE_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        walletConnectBundlePromise = null;
        reject(new Error("WalletConnect failed to load. Check your connection and try again."));
      };
      document.head.appendChild(script);
    });
  }
  return walletConnectBundlePromise;
}

function resolveWalletConnectFactory() {
  const candidates = [
    window.WalletConnectEthereumProvider,
    window.EthereumProvider,
    window["@walletconnect/ethereum-provider"],
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (typeof candidate.init === "function") return candidate;
    if (candidate.EthereumProvider && typeof candidate.EthereumProvider.init === "function") {
      return candidate.EthereumProvider;
    }
  }
  return null;
}

let walletConnectProvider = null;
async function getWalletConnectProvider() {
  if (!WALLETCONNECT_PROJECT_ID) {
    throw new Error("WalletConnect is not configured yet. Please use MetaMask.");
  }
  if (walletConnectProvider) return walletConnectProvider;
  await loadWalletConnectBundle();
  const factory = resolveWalletConnectFactory();
  if (!factory) throw new Error("WalletConnect failed to initialize.");
  walletConnectProvider = await factory.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    showQrModal: true,
    optionalChains: [1],
    metadata: {
      name: "PETIX",
      description: "Petix pet battler",
      url: window.location.origin,
      icons: [`${window.location.origin}/assets/character/current-pet.jpg`],
    },
  });
  walletConnectProvider.on?.("disconnect", () => {
    walletConnectProvider = null;
  });
  return walletConnectProvider;
}

// The bundle persists its session/pairing state under wc@2:* localStorage
// keys; init() restores it and silently pushes requests to the previously
// paired wallet. Purge BEFORE the single init() — a disconnect+re-init dance
// races the bundle's async storage cleanup and breaks the new pairing.
function clearWalletConnectStorage() {
  try {
    const keys = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith("wc@2:")) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {}
}

// Sign-in must never reuse the previous wallet's pairing: drop the in-memory
// provider, purge persisted state, then init exactly once.
async function getFreshWalletConnectProvider() {
  const existing = walletConnectProvider;
  walletConnectProvider = null;
  if (existing) {
    try {
      await existing.disconnect();
    } catch {}
  }
  clearWalletConnectStorage();
  return getWalletConnectProvider();
}

function utf8ToHex(value) {
  const bytes = new TextEncoder().encode(value);
  let hex = "0x";
  for (const byte of bytes) hex += byte.toString(16).padStart(2, "0");
  return hex;
}

function isUserRejectionError(error) {
  const code = error?.code;
  const message = String(error?.message || "").toLowerCase();
  return (
    code === 4001 ||
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("rejected by user") ||
    message.includes("user cancelled") ||
    message.includes("user canceled") ||
    message.includes("modal closed") ||
    message.includes("connection request reset") ||
    message.includes("proposal expired")
  );
}

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
  // 0x-addresses keep the hex prefix readable: 0x0e8c...40c1
  if (address.toLowerCase().startsWith("0x")) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function isAdminWalletAddress(address) {
  let normalized = String(address || "").trim();
  // EVM addresses are case-insensitive; base58 stays case-significant.
  if (normalized.toLowerCase().startsWith("0x")) normalized = normalized.toLowerCase();
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

function showWalletAuthPanel() {
  walletAuthPanel.classList.remove("hidden");
  walletLoggedPanel.classList.add("hidden");
}

function showWalletChoiceState() {
  walletButtons.forEach((button) => {
    button.classList.remove("hidden");
  });
  if (walletFooter) {
    walletFooter.classList.remove("hidden");
  }
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
  showWalletChoiceState();
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

async function connectWallet(walletKey) {
  const wallet = walletConfigs[walletKey];
  if (!wallet) return;

  try {
    let provider = null;
    if (walletKey === "walletconnect") {
      setStatus("Opening WalletConnect...");
      provider = await getFreshWalletConnectProvider();
    } else {
      provider = wallet.getProvider();
      if (!provider) {
        if (isMobileDevice() && typeof wallet.mobileBrowseUrl === "function") {
          setStatus(`Opening ${wallet.label} app...`);
          window.location.href = wallet.mobileBrowseUrl(window.location.href);
          return;
        }

        setStatus(`${wallet.label} is not detected. Opening install page...`);
        window.open(wallet.installUrl, "_blank", "noopener,noreferrer");
        return;
      }
    }

    setStatus(`Connecting ${wallet.label}...`);
    let accounts;
    if (walletKey === "walletconnect") {
      accounts = await provider.enable();
    } else {
      // Never remember the previously connected account: revoke the site
      // permission first, so the connect dialog opens fresh and defaults to
      // the account currently active in the extension. (The permissions
      // picker alone keeps the old account pre-checked — not enough.)
      let revoked = false;
      try {
        await provider.request({
          method: "wallet_revokePermissions",
          params: [{ eth_accounts: {} }],
        });
        revoked = true;
      } catch {
        // Method not supported (older wallets / in-app browsers).
      }
      if (!revoked) {
        try {
          await provider.request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }],
          });
        } catch (permissionError) {
          if (isUserRejectionError(permissionError)) throw permissionError;
        }
      }
      accounts = await provider.request({ method: "eth_requestAccounts" });
    }
    const address = String(accounts?.[0] || "").toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(address)) {
      throw new Error("Wallet address was not returned.");
    }

    setStatus("Creating sign-in challenge...");
    const challenge = await apiRequest("/api/auth/evm/challenge", { wallet: address });

    setStatus("Please confirm signature in your wallet...");
    const signature = await provider.request({
      method: "personal_sign",
      params: [utf8ToHex(challenge.message), address],
    });

    setStatus("Verifying signature...");
    const verified = await apiRequest("/api/auth/evm/verify", {
      wallet: address,
      walletType: walletKey,
      message: challenge.message,
      signature,
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
    if (isUserRejectionError(error)) {
      setStatus("Sign-in cancelled.");
      return;
    }
    const message =
      typeof error?.message === "string" ? error.message : "Connection failed.";
    setStatus(message, "error");
  }
}

async function logoutWallet() {
  await apiRequest("/api/auth/evm/logout", {});
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
    const response = await fetch("/api/auth/evm/me", {
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
    if (shouldRedirectAuthenticatedVisitor) {
      redirectAuthenticatedUser(characterData);
    }
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
  // One-time cleanup of the retired Solana mobile-deeplink auth state.
  try {
    window.localStorage.removeItem("petix_mobile_wallet_auth");
  } catch {}
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
