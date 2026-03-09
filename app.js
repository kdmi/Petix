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
const walletButtons = document.querySelectorAll(".wallet-item");
const detectedBadges = document.querySelectorAll("[data-detected-for]");
let isAuthenticated = false;
let isAdmin = false;

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
}

function showAuthState() {
  isAuthenticated = false;
  isAdmin = false;
  walletLoggedPanel.classList.add("hidden");
  walletAuthPanel.classList.remove("hidden");
  walletClose.classList.remove("hidden");
  setStatus("");
  connectTrigger.textContent = "Connect wallet";
  if (walletMenuAdmin) {
    walletMenuAdmin.classList.add("hidden");
  }
  hideWalletMenu();
}

function openPetCreation(target = "type") {
  const nextUrl = new URL("/pet-creation/", window.location.origin);
  if (target && target !== "type") {
    nextUrl.searchParams.set("screen", target);
  }
  window.location.href = nextUrl.toString();
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
    setStatus("Wallet connected successfully.", "success");
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
  walletMenuCreatePet.addEventListener("click", () => {
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
  closeModal();
});

window.addEventListener("storage", () => {
  refreshDetectedBadges();
});
