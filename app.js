const walletConfigs = {
  phantom: {
    label: "Phantom",
    installUrl: "https://phantom.app/",
    mobileConnectUrl: "https://phantom.app/ul/v1/connect",
    mobileSignMessageUrl: "https://phantom.app/ul/v1/signMessage",
    mobileEncryptionPublicKeyParam: "phantom_encryption_public_key",
    getProvider: () => {
      if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
      if (window.solana?.isPhantom) return window.solana;
      return null;
    },
  },
  solflare: {
    label: "Solflare",
    installUrl: "https://solflare.com/",
    mobileConnectUrl: "https://solflare.com/ul/v1/connect",
    mobileSignMessageUrl: "https://solflare.com/ul/v1/signMessage",
    mobileEncryptionPublicKeyParam: "solflare_encryption_public_key",
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
const MOBILE_WALLET_AUTH_STORAGE_KEY = "petix_mobile_wallet_auth";
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

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
const walletActionBtn = document.getElementById("walletActionBtn");
const walletFooter = document.querySelector(".wallet-footer");
const loggedWalletAddress = document.getElementById("loggedWalletAddress");
const continueBtn = document.getElementById("continueBtn");
const walletButtons = document.querySelectorAll(".wallet-item");
const detectedBadges = document.querySelectorAll("[data-detected-for]");
const shouldOpenAuthModal = new URLSearchParams(window.location.search).get("auth") === "1";
let isAuthenticated = false;
let isAdmin = false;
let characterCount = 0;
let toastTimeoutId = 0;
let pendingMobileWalletActionUrl = "";

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

function hideWalletActionButton() {
  pendingMobileWalletActionUrl = "";
  if (!walletActionBtn) return;
  walletActionBtn.textContent = "";
  walletActionBtn.classList.add("hidden");
}

function showWalletActionButton(label, nextUrl) {
  if (!walletActionBtn) return;
  pendingMobileWalletActionUrl = nextUrl;
  walletActionBtn.textContent = label;
  walletActionBtn.classList.remove("hidden");
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

function bytesToUtf8(bytes) {
  return new TextDecoder().decode(bytes);
}

function utf8ToBytes(value) {
  return new TextEncoder().encode(String(value || ""));
}

function bytesToBase58(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    bytes = new Uint8Array(bytes || []);
  }
  if (!bytes.length) return "";

  const digits = [0];
  bytes.forEach((byte) => {
    let carry = byte;
    for (let index = 0; index < digits.length; index += 1) {
      const current = digits[index] * 256 + carry;
      digits[index] = current % 58;
      carry = Math.floor(current / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  });

  let leadingZeroCount = 0;
  while (leadingZeroCount < bytes.length && bytes[leadingZeroCount] === 0) {
    leadingZeroCount += 1;
  }

  let output = "1".repeat(leadingZeroCount);
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    output += BASE58_ALPHABET[digits[index]];
  }

  return output;
}

function base58ToBytes(value) {
  const input = String(value || "").trim();
  if (!input) return new Uint8Array();

  const bytes = [0];
  for (const character of input) {
    const alphabetIndex = BASE58_ALPHABET.indexOf(character);
    if (alphabetIndex === -1) {
      throw new Error("Invalid base58 string.");
    }

    let carry = alphabetIndex;
    for (let index = 0; index < bytes.length; index += 1) {
      const current = bytes[index] * 58 + carry;
      bytes[index] = current & 0xff;
      carry = current >> 8;
    }

    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }

  let leadingZeroCount = 0;
  while (leadingZeroCount < input.length && input[leadingZeroCount] === "1") {
    leadingZeroCount += 1;
  }

  const output = new Uint8Array(leadingZeroCount + bytes.length);
  for (let index = 0; index < leadingZeroCount; index += 1) {
    output[index] = 0;
  }
  for (let index = 0; index < bytes.length; index += 1) {
    output[output.length - 1 - index] = bytes[index];
  }

  return output;
}

function getNacl() {
  if (!window.nacl?.box) {
    throw new Error("Secure mobile wallet auth is unavailable right now.");
  }
  return window.nacl;
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent || "");
}

function canUseWalletBrowseDeeplink() {
  return isMobileDevice() && window.location.protocol === "https:";
}

function canUseWalletDeeplinkAuth(walletKey) {
  return canUseWalletBrowseDeeplink() && ["phantom", "solflare"].includes(walletKey);
}

function saveMobileWalletAuthState(payload) {
  window.localStorage.setItem(MOBILE_WALLET_AUTH_STORAGE_KEY, JSON.stringify(payload));
}

function loadMobileWalletAuthState() {
  try {
    const raw = window.localStorage.getItem(MOBILE_WALLET_AUTH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearMobileWalletAuthState() {
  window.localStorage.removeItem(MOBILE_WALLET_AUTH_STORAGE_KEY);
}

function buildMobileWalletCallbackUrl(walletType, stage) {
  const url = new URL("/", window.location.origin);
  url.searchParams.set("mobileWallet", walletType);
  url.searchParams.set("mobileStage", stage);
  return url.toString();
}

function cleanupMobileWalletCallbackParams({ keepAuthPrompt = false } = {}) {
  const url = new URL(window.location.href);
  [
    "mobileWallet",
    "mobileStage",
    "phantom_encryption_public_key",
    "solflare_encryption_public_key",
    "nonce",
    "data",
    "errorCode",
    "errorMessage",
  ].forEach((key) => {
    url.searchParams.delete(key);
  });

  if (!keepAuthPrompt) {
    url.searchParams.delete("auth");
  }

  const normalized =
    url.pathname + (url.search ? url.search : "") + (url.hash ? url.hash : "");
  window.history.replaceState({}, "", normalized);
}

function decryptMobileWalletPayload(encryptionPublicKey, nonce, data, dappSecretKey) {
  const nacl = getNacl();
  const sharedSecret = nacl.box.before(
    base58ToBytes(encryptionPublicKey),
    base58ToBytes(dappSecretKey)
  );
  const decrypted = nacl.box.open.after(base58ToBytes(data), base58ToBytes(nonce), sharedSecret);

  if (!decrypted) {
    throw new Error("Unable to decrypt wallet response.");
  }

  return JSON.parse(bytesToUtf8(decrypted));
}

function encryptMobileWalletPayload(encryptionPublicKey, payload, dappSecretKey) {
  const nacl = getNacl();
  const sharedSecret = nacl.box.before(
    base58ToBytes(encryptionPublicKey),
    base58ToBytes(dappSecretKey)
  );
  const nonce = nacl.randomBytes(24);
  const encrypted = nacl.box.after(utf8ToBytes(JSON.stringify(payload)), nonce, sharedSecret);

  return {
    nonce: bytesToBase58(nonce),
    payload: bytesToBase58(encrypted),
  };
}

async function startMobileWalletAuth(walletKey) {
  const wallet = walletConfigs[walletKey];
  if (!wallet?.mobileConnectUrl) {
    throw new Error("Mobile wallet auth is not supported for this wallet.");
  }

  const nacl = getNacl();
  const keyPair = nacl.box.keyPair();
  saveMobileWalletAuthState({
    walletType: walletKey,
    dappPublicKey: bytesToBase58(keyPair.publicKey),
    dappSecretKey: bytesToBase58(keyPair.secretKey),
    walletPublicKey: "",
    walletEncryptionPublicKey: "",
    walletSession: "",
    challengeMessage: "",
    challengeToken: "",
  });

  const connectUrl = new URL(wallet.mobileConnectUrl);
  connectUrl.searchParams.set("app_url", window.location.origin);
  connectUrl.searchParams.set("dapp_encryption_public_key", bytesToBase58(keyPair.publicKey));
  connectUrl.searchParams.set("redirect_link", buildMobileWalletCallbackUrl(walletKey, "connect"));

  setStatus(`Opening ${wallet.label} app...`);
  window.location.href = connectUrl.toString();
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

function showWalletActionState(message, walletLabel, nextUrl) {
  showWalletAuthPanel();
  setStatus(message);
  showWalletActionButton(`Continue in ${walletLabel}`, nextUrl);
  walletButtons.forEach((button) => {
    button.classList.add("hidden");
  });
  if (walletFooter) {
    walletFooter.classList.add("hidden");
  }
  openModal();
}

function showWalletChoiceState() {
  hideWalletActionButton();
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

async function handleMobileWalletCallback() {
  const url = new URL(window.location.href);
  const walletType = url.searchParams.get("mobileWallet");
  const stage = url.searchParams.get("mobileStage");

  if (!walletType || !stage) {
    const pending = loadMobileWalletAuthState();
    const pendingWallet = pending?.walletType ? walletConfigs[pending.walletType] : null;
    if (pending?.pendingSignUrl && pendingWallet) {
      showWalletActionState(
        `Connected to ${pendingWallet.label}. Continue in the app to sign the message.`,
        pendingWallet.label,
        pending.pendingSignUrl
      );
      return true;
    }
    return false;
  }

  const pending = loadMobileWalletAuthState();
  if (!pending || pending.walletType !== walletType) {
    cleanupMobileWalletCallbackParams({ keepAuthPrompt: true });
    showAuthState();
    setStatus("Mobile sign-in session expired. Please try again.", "error");
    openModal();
    return true;
  }

  const errorCode = url.searchParams.get("errorCode");
  const errorMessage = url.searchParams.get("errorMessage");
  if (errorCode) {
    clearMobileWalletAuthState();
    cleanupMobileWalletCallbackParams({ keepAuthPrompt: true });
    showAuthState();
    setStatus(errorMessage || "Wallet request was cancelled.", "error");
    openModal();
    return true;
  }

  try {
    const wallet = walletConfigs[walletType];
    const nonce = url.searchParams.get("nonce");
    const data = url.searchParams.get("data");

    if (stage === "connect") {
      const encryptionPublicKey = url.searchParams.get(wallet.mobileEncryptionPublicKeyParam);
      if (!encryptionPublicKey || !nonce || !data) {
        throw new Error("Wallet connect callback is missing required fields.");
      }

      const decrypted = decryptMobileWalletPayload(
        encryptionPublicKey,
        nonce,
        data,
        pending.dappSecretKey
      );

      const walletPublicKey = String(decrypted.public_key || "").trim();
      const walletSession = String(decrypted.session || "");
      if (!walletPublicKey || !walletSession) {
        throw new Error("Wallet connect response is incomplete.");
      }

      const challenge = await apiRequest("/api/auth/solana/challenge", {
        wallet: walletPublicKey,
      });

      const messageBytes = utf8ToBytes(challenge.message);
      const signPayload = encryptMobileWalletPayload(
        encryptionPublicKey,
        {
          message: bytesToBase58(messageBytes),
          session: walletSession,
          display: "utf8",
        },
        pending.dappSecretKey
      );

      const signUrl = new URL(wallet.mobileSignMessageUrl);
      signUrl.searchParams.set("dapp_encryption_public_key", pending.dappPublicKey);
      signUrl.searchParams.set("nonce", signPayload.nonce);
      signUrl.searchParams.set("redirect_link", buildMobileWalletCallbackUrl(walletType, "sign"));
      signUrl.searchParams.set("payload", signPayload.payload);

      saveMobileWalletAuthState({
        ...pending,
        walletPublicKey,
        walletEncryptionPublicKey: encryptionPublicKey,
        walletSession,
        challengeMessage: challenge.message,
        challengeToken: challenge.challengeToken,
        pendingSignUrl: signUrl.toString(),
      });

      cleanupMobileWalletCallbackParams();
      showWalletActionState(
        `Connected to ${wallet.label}. Continue in the app to sign the message.`,
        wallet.label,
        signUrl.toString()
      );
      return true;
    }

    if (stage === "sign") {
      if (!pending.walletEncryptionPublicKey || !nonce || !data) {
        throw new Error("Wallet signature callback is missing required fields.");
      }

      const decrypted = decryptMobileWalletPayload(
        pending.walletEncryptionPublicKey,
        nonce,
        data,
        pending.dappSecretKey
      );
      const signatureBase58 = String(decrypted.signature || "");
      if (!signatureBase58) {
        throw new Error("Wallet signature response is incomplete.");
      }
      const signature = bytesToBase64(base58ToBytes(signatureBase58));

      const verified = await apiRequest("/api/auth/solana/verify", {
        wallet: pending.walletPublicKey,
        walletType,
        message: pending.challengeMessage,
        signature,
        challengeToken: pending.challengeToken,
      });

      clearMobileWalletAuthState();
      cleanupMobileWalletCallbackParams();
      showLoggedState({
        walletAddress: verified.wallet,
        isAdmin: verified.isAdmin,
      });
      const characterData = await refreshCharacterCapacity();
      setStatus("Wallet connected successfully.", "success");
      redirectAuthenticatedUser(characterData);
      return true;
    }

    throw new Error("Unknown mobile wallet callback stage.");
  } catch (error) {
    clearMobileWalletAuthState();
    cleanupMobileWalletCallbackParams({ keepAuthPrompt: true });
    showAuthState();
    setStatus(error.message || "Mobile wallet sign-in failed.", "error");
    openModal();
    return true;
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
  hideWalletActionButton();
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
    if (canUseWalletDeeplinkAuth(walletKey)) {
      try {
        await startMobileWalletAuth(walletKey);
      } catch (error) {
        const message =
          typeof error?.message === "string" ? error.message : "Unable to open wallet app.";
        setStatus(message, "error");
      }
      return;
    }

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
  clearMobileWalletAuthState();
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

if (walletActionBtn) {
  walletActionBtn.addEventListener("click", () => {
    if (!pendingMobileWalletActionUrl) return;
    window.location.href = pendingMobileWalletActionUrl;
  });
}

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
  if (await handleMobileWalletCallback()) {
    return;
  }
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
