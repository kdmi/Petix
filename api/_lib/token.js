"use strict";

const crypto = require("crypto");

const { isAdminWallet, isLikelyEvmAddress } = require("./auth");
const { getEconomyConfig } = require("./economy-config");
const { normalizeCurrency } = require("./currency");
const { getWalletProfile, updateWalletProfile } = require("./store");
const tokenChain = require("./token-chain");
const tokenStoreModule = require("./token-store");
const {
  attachTx,
  confirmWithdrawal,
  dropWithdrawal,
  failWithdrawal,
  findWithdrawal,
  listUnsettled,
  reserveWithdrawal,
} = require("./withdrawal-store");

// Domain logic for the $PETIX token flows (feature 019, custodial model):
//   withdraw — reserve Points → treasury sends ERC-20 → settle by receipt
//   deposit  — player transfers to the treasury → credited 1:1 (Phase 5)
// Every chain/storage side effect goes through `deps` so tests inject fakes.
// Errors carry { httpStatus, httpCode, code } and are mapped by the handlers.

const DEFAULTS = {
  receiptPollAttempts: 4,
  receiptPollMs: 2000,
  lockTtlMs: 20000,
  lockWaitMs: 10000,
  lockPollMs: 250,
  // A `sent` record with no receipt whose nonce has been consumed by another tx
  // is considered displaced only after this age — gives slow RPCs time to index.
  dropAgeMs: 120000,
  // Capsule-gate lookups (index read, live ownerOf) must never hang the modal.
  nftTimeoutMs: 8000,
};

function withTimeout(promise, ms, label) {
  let timer = null;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`${label} timed out`);
      error.code = "RPC_UNAVAILABLE";
      reject(error);
    }, ms);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

let testDepOverrides = null;

/** Test hook: handlers resolve deps through here so a fake chain can be injected. */
function configureDeps(overrides) {
  testDepOverrides = overrides || null;
}

// Capsule index + live ownership for the "held ≥ N hours" withdrawal gate
// (US7). Lazy requires keep token.js loadable without the NFT stack in tests.
function buildDefaultNftClient() {
  return {
    isEnabled: () => require("./nft-chain").isNftEnabled(),
    marketplaceUrl: () => require("./nft-chain").getNftEnv().marketplaceUrl,
    getHoldings: (wallet) => require("./nft").getWalletHoldings(wallet),
    ownerOf: (tokenId) => require("./nft-chain").createChainClient().ownerOf(tokenId),
  };
}

function buildDefaultDeps() {
  return {
    chain: tokenChain.createChainClient(),
    tokenStore: tokenStoreModule,
    nft: buildDefaultNftClient(),
    profiles: { getWalletProfile, updateWalletProfile },
    getConfig: () => getEconomyConfig(),
    now: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    ...DEFAULTS,
  };
}

function resolveDeps(overrides) {
  return { ...buildDefaultDeps(), ...(testDepOverrides || {}), ...(overrides || {}) };
}

function fail(status, message, code, extra) {
  const error = new Error(message);
  error.httpStatus = status;
  error.httpCode = code;
  error.code = code;
  if (extra) Object.assign(error, extra);
  return error;
}

/** Re-throws chain-client errors as HTTP-mapped domain errors. */
function mapChainError(error) {
  if (error?.httpStatus) return error;
  if (error?.code === "RPC_UNAVAILABLE") {
    return fail(503, "Chain RPC is unavailable — try again.", "RPC_UNAVAILABLE");
  }
  if (error?.code === "SEND_FAILED") {
    return fail(502, "Failed to send the payout.", "SEND_FAILED");
  }
  return error;
}

function toBaseUnits(points, decimals) {
  return (BigInt(Math.max(0, Math.floor(Number(points) || 0))) * 10n ** BigInt(decimals)).toString();
}

function fromBaseUnits(raw, decimals) {
  try {
    return (BigInt(String(raw || "0")) / 10n ** BigInt(decimals)).toString();
  } catch (error) {
    return "0";
  }
}

function explorerTxUrl(env, txHash) {
  return env.explorerUrl && txHash ? `${env.explorerUrl}/tx/${txHash}` : null;
}

function ageMs(record, now) {
  const stamp = Date.parse(record.updatedAt || record.createdAt || "");
  return Number.isFinite(stamp) ? now - stamp : Infinity;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

function availabilityReason({ env, isEvm, cfg, isAdmin }) {
  if (!env.enabled) return "TOKEN_DISABLED";
  if (!isEvm) return "EVM_ONLY";
  if (!env.configured) return "TOKEN_NOT_CONFIGURED";
  if (!Number(cfg.WITHDRAW_ENABLED) && !isAdmin) return "ADMIN_ONLY";
  return null;
}

const NFT_GATE_MESSAGES = {
  NFT_REQUIRED: "Withdrawals are for capsule holders: keep a Petix capsule on this wallet.",
  NFT_HOLD_TOO_SHORT: "Your capsule has to stay on this wallet a little longer before you can withdraw.",
  NFT_INDEX_UNAVAILABLE: "Capsule ownership cannot be verified right now. Try again later.",
};

/**
 * Capsule gate (US7): the wallet must hold at least one collection token for
 * ≥ WITHDRAW_NFT_HOLD_HOURS, counted from the block the token arrived in.
 * `live: true` additionally asks the chain who owns the qualifying token,
 * closing the minute-long window between a sale and the next index sync.
 * Returns a summary for the UI plus `reason` (null when the wallet may withdraw).
 */
async function evaluateNftGate(wallet, cfg, isAdmin, deps, { live = false } = {}) {
  const required = Number(cfg.WITHDRAW_REQUIRE_NFT) === 1;
  const holdHours = Math.max(0, Number(cfg.WITHDRAW_NFT_HOLD_HOURS) || 0);
  const summary = {
    required,
    holdHours,
    exempt: Boolean(isAdmin),
    held: 0,
    tokens: [],
    oldestSince: null,
    eligibleAt: null,
    eligible: !required || Boolean(isAdmin),
    qualifyingTokenId: null,
    reason: null,
    marketplaceUrl: null,
  };
  try {
    summary.marketplaceUrl = deps.nft && typeof deps.nft.marketplaceUrl === "function" ? deps.nft.marketplaceUrl() || null : null;
  } catch (error) {
    summary.marketplaceUrl = null;
  }
  if (!required) return summary;
  // Admins are exempt from the rule but still get the holding data: during the
  // silent prod test the owner wants to SEE how the index reads the test wallet.
  const exempt = Boolean(isAdmin);
  const bypass = (reason) => (exempt ? { ...summary, eligible: true, reason: null, wouldBlock: reason } : { ...summary, reason });

  if (!deps.nft || !deps.nft.isEnabled()) return bypass("NFT_INDEX_UNAVAILABLE");
  let holdings;
  try {
    holdings = await withTimeout(deps.nft.getHoldings(wallet), deps.nftTimeoutMs, "capsule index");
  } catch (error) {
    return bypass("NFT_INDEX_UNAVAILABLE");
  }
  const tokens = (holdings && holdings.tokens) || [];
  summary.held = tokens.length;
  summary.tokens = tokens.map((entry) => ({ tokenId: entry.tokenId, since: entry.since || null }));
  if (!tokens.length) return bypass("NFT_REQUIRED");

  const now = deps.now();
  const holdMs = holdHours * 3600000;
  const dated = tokens
    .filter((entry) => entry.since && Number.isFinite(Date.parse(entry.since)))
    .sort((a, b) => Date.parse(a.since) - Date.parse(b.since));
  if (dated.length) {
    summary.oldestSince = new Date(Date.parse(dated[0].since)).toISOString();
    summary.eligibleAt = new Date(Date.parse(dated[0].since) + holdMs).toISOString();
  }
  let qualifying = dated.filter((entry) => now - Date.parse(entry.since) >= holdMs);
  if (!qualifying.length) return bypass("NFT_HOLD_TOO_SHORT");
  if (exempt) return { ...summary, eligible: true, qualifyingTokenId: qualifying[0].tokenId };

  if (live) {
    const target = String(wallet).toLowerCase();
    const confirmed = [];
    for (const entry of qualifying) {
      let owner = null;
      try {
        owner = await withTimeout(deps.nft.ownerOf(entry.tokenId), deps.nftTimeoutMs, "capsule ownerOf");
      } catch (error) {
        return { ...summary, reason: "NFT_INDEX_UNAVAILABLE" };
      }
      if (String(owner || "").toLowerCase() === target) {
        confirmed.push(entry);
        break;
      }
    }
    if (!confirmed.length) return { ...summary, reason: "NFT_REQUIRED" };
    qualifying = confirmed;
  }
  return { ...summary, eligible: true, qualifyingTokenId: qualifying[0].tokenId };
}

function nftGateError(gate) {
  return fail(403, NFT_GATE_MESSAGES[gate.reason] || "Withdrawal is not available.", gate.reason, {
    eligibleAt: gate.eligibleAt,
    holdHours: gate.holdHours,
  });
}

/**
 * Everything the modals need. Also settles the wallet's unsettled withdrawals
 * lazily (like farm accrual) so a player who closed the tab sees the truth.
 */
async function getTokenConfigForWallet(wallet, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const env = tokenChain.getTokenEnv();
  const cfg = await deps.getConfig();
  const isEvm = isLikelyEvmAddress(wallet);
  const isAdmin = isAdminWallet(wallet);
  let reason = availabilityReason({ env, isEvm, cfg, isAdmin });
  let nftGate = null;
  if (reason === null) {
    nftGate = await evaluateNftGate(wallet, cfg, isAdmin, deps);
    reason = nftGate.reason;
  }
  const enabled = reason === null;

  const base = {
    enabled,
    public: Boolean(Number(cfg.WITHDRAW_ENABLED)),
    configured: env.configured,
    isAdmin,
    reason,
    tokenSymbol: env.tokenSymbol,
    decimals: env.decimals,
    min: Math.max(0, Math.floor(Number(cfg.MIN_WITHDRAW) || 0)),
    feePct: Math.max(0, Number(cfg.WITHDRAW_FEE_PCT) || 0),
    maxPerTx: Math.max(0, Math.floor(Number(cfg.WITHDRAW_MAX_PER_TX) || 0)),
    ...(nftGate
      ? {
          nft: {
            required: nftGate.required,
            holdHours: nftGate.holdHours,
            exempt: nftGate.exempt,
            held: nftGate.held,
            tokens: nftGate.tokens,
            oldestSince: nftGate.oldestSince,
            eligibleAt: nftGate.eligibleAt,
            eligible: nftGate.eligible,
            // For exempt admins: what the rule WOULD have said (null = would pass).
            wouldBlock: nftGate.wouldBlock || null,
            marketplaceUrl: nftGate.marketplaceUrl,
          },
        }
      : {}),
    chain: {
      chainId: env.chainId,
      chainIdHex: env.chainIdHex,
      name: env.chainName,
      explorerUrl: env.explorerUrl,
      currencySymbol: env.currencySymbol,
    },
  };
  if (!enabled) return base;

  let pending = [];
  try {
    await reconcileWalletUnsettled(wallet, deps);
  } catch (error) {
    // RPC hiccup: show what we have, do not block the modal.
  }
  const profile = await deps.profiles.getWalletProfile(wallet);
  pending = listUnsettled(profile).map((record) => ({
    id: record.id,
    points: record.points,
    petixSent: record.petixSent,
    status: record.status,
    txHash: record.txHash || null,
    explorerUrl: explorerTxUrl(env, record.txHash),
    createdAt: record.createdAt,
  }));

  let treasury = { available: null };
  let rpcDegraded = false;
  try {
    const snapshot = await deps.chain.getTreasurySnapshot();
    treasury = { available: fromBaseUnits(snapshot.availableRaw ?? snapshot.tokensRaw, env.decimals) };
  } catch (error) {
    rpcDegraded = true;
  }

  return {
    ...base,
    deposit: {
      address: env.depositAddress,
      tokenContract: env.contract,
      confirmations: env.confirmations,
    },
    treasury,
    pending,
    balance: normalizeCurrency(profile.currency).balance,
    ...(rpcDegraded ? { rpcDegraded: true } : {}),
  };
}

// ---------------------------------------------------------------------------
// Withdraw
// ---------------------------------------------------------------------------

async function acquireLock(deps, owner) {
  const attempts = Math.max(1, Math.ceil(deps.lockWaitMs / Math.max(1, deps.lockPollMs)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const ok = await deps.tokenStore.acquireSendLock(owner, { ttlMs: deps.lockTtlMs, now: deps.now() });
    if (ok) return true;
    await deps.sleep(deps.lockPollMs);
  }
  return false;
}

async function refundRecord(deps, wallet, id, reason) {
  const now = deps.now();
  return deps.profiles.updateWalletProfile(wallet, (profile) => {
    failWithdrawal(profile, id, { now, reason });
    return profile;
  });
}

/**
 * Custodial withdrawal: validate → preflight the treasury → reserve Points →
 * send under the treasury lock → settle by receipt (short poll).
 * Refunds happen only on proven failure (send threw / receipt.status == 0).
 */
async function requestWithdraw(wallet, amountPoints, depOverrides, { isAdmin = false } = {}) {
  const deps = resolveDeps(depOverrides);
  const env = tokenChain.getTokenEnv();
  if (!env.enabled) throw fail(404, "Token features are disabled.", "TOKEN_DISABLED");
  if (!isLikelyEvmAddress(wallet)) throw fail(403, "Withdrawals require an EVM wallet.", "EVM_ONLY");
  if (!env.configured) throw fail(503, "Withdrawals are not configured on the server.", "TOKEN_NOT_CONFIGURED");

  const cfg = await deps.getConfig();
  if (!Number(cfg.WITHDRAW_ENABLED) && !isAdmin) {
    throw fail(403, "Withdrawals are in admin-only mode right now.", "WITHDRAW_ADMIN_ONLY");
  }
  // Capsule gate with a live owner check — before any Points move.
  const gate = await evaluateNftGate(wallet, cfg, isAdmin, deps, { live: true });
  if (gate.reason) throw nftGateError(gate);

  const amount = Number(amountPoints);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    throw fail(400, "amount must be a positive integer.", "BAD_REQUEST");
  }
  const min = Math.max(0, Math.floor(Number(cfg.MIN_WITHDRAW) || 0));
  if (amount < min) throw fail(400, `Minimum withdrawal is ${min}.`, "BELOW_MIN", { min });
  const maxPerTx = Math.max(0, Math.floor(Number(cfg.WITHDRAW_MAX_PER_TX) || 0));
  if (maxPerTx > 0 && amount > maxPerTx) {
    throw fail(400, `Maximum per withdrawal is ${maxPerTx}.`, "ABOVE_MAX_PER_TX", { maxPerTx });
  }
  const feePct = Math.max(0, Number(cfg.WITHDRAW_FEE_PCT) || 0);
  const petixSent = Math.floor(amount * (1 - feePct / 100));
  if (petixSent <= 0) throw fail(400, "Resulting payout is zero.", "BAD_REQUEST");
  const amountRaw = toBaseUnits(petixSent, env.decimals);

  // Fast-fail on balance (authoritative check happens inside the reserve mutator).
  const snapshotProfile = await deps.profiles.getWalletProfile(wallet);
  if (normalizeCurrency(snapshotProfile.currency).balance < amount) {
    throw fail(400, "Insufficient balance.", "INSUFFICIENT_BALANCE");
  }

  // Preflight the treasury before touching Points.
  let treasury;
  try {
    treasury = await deps.chain.getTreasurySnapshot();
  } catch (error) {
    throw mapChainError(error);
  }
  // With a payout source this is min(source balance, allowance granted to the operator).
  if (BigInt(treasury.availableRaw ?? treasury.tokensRaw) < BigInt(amountRaw)) {
    throw fail(503, "Withdrawal pool is temporarily empty. Try again later.", "INSUFFICIENT_TREASURY");
  }
  const minGasWei = BigInt(Math.round(Number(env.minGasEth) * 1e9)) * 10n ** 9n;
  if (BigInt(treasury.ethWei) < minGasWei) {
    throw fail(503, "Withdrawals are temporarily unavailable (treasury gas).", "TREASURY_LOW_GAS");
  }
  try {
    await deps.chain.estimateTransferGas(wallet, amountRaw);
  } catch (error) {
    throw mapChainError(error);
  }

  // Settle whatever this wallet still has in flight, then reserve.
  try {
    await reconcileWalletUnsettled(wallet, deps);
  } catch (error) {
    // Non-fatal: the request itself does not depend on old records.
  }
  const recordId = crypto.randomUUID();
  const reservedAt = deps.now();
  try {
    await deps.profiles.updateWalletProfile(wallet, (profile) => {
      reserveWithdrawal(profile, { id: recordId, points: amount, feePct, amountRaw, now: reservedAt });
      return profile;
    });
  } catch (error) {
    if (error?.code === "INSUFFICIENT_BALANCE") throw fail(400, "Insufficient balance.", "INSUFFICIENT_BALANCE");
    if (error?.code === "BAD_REQUEST") throw fail(400, error.message, "BAD_REQUEST");
    throw error;
  }

  // Send under the treasury lock: one nonce at a time across all lambdas.
  const locked = await acquireLock(deps, recordId);
  if (!locked) {
    await refundRecord(deps, wallet, recordId, "BUSY");
    throw fail(503, "Payouts are busy right now. Try again in a moment.", "BUSY");
  }

  let sent;
  try {
    let fresh = await deps.chain.getTreasurySnapshot();
    try {
      sent = await deps.chain.sendTransfer(wallet, amountRaw, fresh.noncePending);
    } catch (error) {
      if (error?.code !== "NONCE_CONFLICT") throw error;
      fresh = await deps.chain.getTreasurySnapshot();
      sent = await deps.chain.sendTransfer(wallet, amountRaw, fresh.noncePending);
    }
  } catch (error) {
    await deps.tokenStore.releaseSendLock(recordId);
    const mapped = mapChainError(error);
    const reason = mapped.httpCode || error?.code || "SEND_FAILED";
    await refundRecord(deps, wallet, recordId, reason);
    if (mapped.httpStatus) throw mapped;
    throw fail(502, "Failed to submit the payout. Your Points were refunded.", "SEND_FAILED");
  }

  const sentAt = deps.now();
  await deps.profiles.updateWalletProfile(wallet, (profile) => {
    attachTx(profile, recordId, {
      txHash: sent.txHash,
      nonce: sent.nonce,
      treasury: sent.from || treasury.sourceAddress || treasury.address,
      now: sentAt,
    });
    return profile;
  });
  await deps.tokenStore.withTokenState((state) => {
    deps.tokenStore.bumpDailyOut(state, amount, sentAt);
    deps.tokenStore.rememberWallet(state, wallet);
    if (state.sendLock && state.sendLock.owner === recordId) state.sendLock = null;
    return state;
  });

  // Short confirmation poll; anything unresolved stays `sent` and settles lazily.
  let outcome = { status: "sent" };
  for (let attempt = 0; attempt < deps.receiptPollAttempts; attempt += 1) {
    let receipt = null;
    try {
      receipt = await deps.chain.getReceipt(sent.txHash);
    } catch (error) {
      break; // RPC hiccup — leave as sent
    }
    if (receipt) {
      outcome = { status: receipt.status === 1 ? "confirmed" : "failed" };
      break;
    }
    if (attempt < deps.receiptPollAttempts - 1) await deps.sleep(deps.receiptPollMs);
  }

  const settledAt = deps.now();
  const profile = await deps.profiles.updateWalletProfile(wallet, (current) => {
    if (outcome.status === "confirmed") confirmWithdrawal(current, recordId, { txHash: sent.txHash, now: settledAt });
    if (outcome.status === "failed") failWithdrawal(current, recordId, { now: settledAt, reason: "TX_FAILED" });
    return current;
  });

  if (outcome.status === "failed") {
    throw fail(400, "Transaction failed on-chain. Your Points were refunded.", "TX_FAILED", {
      txHash: sent.txHash,
    });
  }

  return {
    id: recordId,
    status: outcome.status,
    txHash: sent.txHash,
    amount,
    petixSent,
    balance: normalizeCurrency(profile.currency).balance,
    explorerUrl: explorerTxUrl(env, sent.txHash),
    tokenSymbol: env.tokenSymbol,
  };
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Decide what the network says about one unsettled record. Pure of storage:
 * returns { action: "confirm" | "fail" | "drop" | "none", reason }.
 */
async function decideSettlement(record, deps, snapshotCache) {
  const now = deps.now();
  if (record.status === "reserved") {
    // The lambda died between reserve and broadcast — nothing was ever sent.
    return ageMs(record, now) >= deps.dropAgeMs ? { action: "fail", reason: "NEVER_SENT" } : { action: "none" };
  }
  if (record.status !== "sent") return { action: "none" };

  if (record.txHash) {
    const receipt = await deps.chain.getReceipt(record.txHash);
    if (receipt) {
      return receipt.status === 1 ? { action: "confirm" } : { action: "fail", reason: "TX_FAILED" };
    }
  }
  if (ageMs(record, now) < deps.dropAgeMs) return { action: "none" };
  if (!snapshotCache.snapshot) snapshotCache.snapshot = await deps.chain.getTreasurySnapshot();
  const consumed = record.nonce != null && snapshotCache.snapshot.nonceLatest > Number(record.nonce);
  return consumed ? { action: "drop", reason: "DISPLACED" } : { action: "none" };
}

function applySettlement(profile, record, decision, now) {
  if (decision.action === "confirm") return confirmWithdrawal(profile, record.id, { txHash: record.txHash, now });
  if (decision.action === "fail") return failWithdrawal(profile, record.id, { now, reason: decision.reason });
  if (decision.action === "drop") return dropWithdrawal(profile, record.id, { now, reason: decision.reason });
  return null;
}

/** Settles one record by chain data. Returns the record (or null when unknown). */
async function reconcileWithdrawal(wallet, id, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const profile = await deps.profiles.getWalletProfile(wallet);
  const record = findWithdrawal(profile, id);
  if (!record) return null;
  if (record.chain !== "evm" || !["reserved", "sent"].includes(record.status)) return record;

  let decision;
  try {
    decision = await decideSettlement(record, deps, {});
  } catch (error) {
    throw mapChainError(error);
  }
  if (decision.action === "none") return record;

  const now = deps.now();
  const updated = await deps.profiles.updateWalletProfile(wallet, (current) => {
    const live = findWithdrawal(current, id);
    if (live) applySettlement(current, live, decision, now);
    return current;
  });
  return findWithdrawal(updated, id);
}

/** Settles every unsettled record of a wallet in one profile mutation. */
async function reconcileWalletUnsettled(wallet, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const profile = await deps.profiles.getWalletProfile(wallet);
  const unsettled = listUnsettled(profile);
  const summary = { checked: unsettled.length, confirmed: 0, refunded: 0, pending: 0 };
  if (!unsettled.length) return summary;

  const decisions = [];
  const cache = {};
  for (const record of unsettled) {
    try {
      decisions.push([record.id, await decideSettlement(record, deps, cache)]);
    } catch (error) {
      throw mapChainError(error);
    }
  }
  if (!decisions.some(([, decision]) => decision.action !== "none")) {
    summary.pending = unsettled.length;
    return summary;
  }

  const now = deps.now();
  await deps.profiles.updateWalletProfile(wallet, (current) => {
    for (const [id, decision] of decisions) {
      const live = findWithdrawal(current, id);
      if (!live) continue;
      const result = applySettlement(current, live, decision, now);
      if (!result) summary.pending += 1;
      else if (result.status === "confirmed") summary.confirmed += 1;
      else summary.refunded += 1;
    }
    return current;
  });
  return summary;
}

// ---------------------------------------------------------------------------
// Deposit (plain ERC-20 transfer to the treasury address)
// ---------------------------------------------------------------------------

/** Operator, payout source and TOKEN_INTERNAL_WALLETS: their transfers are never deposits. */
function isProjectWallet(env, address) {
  const value = String(address || "").toLowerCase();
  return (
    env.internalWallets.includes(value) ||
    value === env.treasuryAddress ||
    (env.payoutSource && value === env.payoutSource)
  );
}

function assertDepositAccess(env, wallet, cfg, isAdmin) {
  if (!env.enabled) throw fail(404, "Token features are disabled.", "TOKEN_DISABLED");
  if (!isLikelyEvmAddress(wallet)) throw fail(403, "Deposits require an EVM wallet.", "EVM_ONLY");
  if (!env.configured) throw fail(503, "Deposits are not configured on the server.", "TOKEN_NOT_CONFIGURED");
  if (!Number(cfg.WITHDRAW_ENABLED) && !isAdmin) {
    throw fail(403, "Deposits are in admin-only mode right now.", "WITHDRAW_ADMIN_ONLY");
  }
}

/** Address + ready-to-send `transfer(treasury, amount)` payload for the wallet button. */
async function prepareDeposit(wallet, amountTokens, depOverrides, { isAdmin = false } = {}) {
  const deps = resolveDeps(depOverrides);
  const env = tokenChain.getTokenEnv();
  const cfg = await deps.getConfig();
  assertDepositAccess(env, wallet, cfg, isAdmin);

  const amount = Number(amountTokens);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    throw fail(400, "amount must be a positive integer.", "BAD_REQUEST");
  }
  const amountRaw = toBaseUnits(amount, env.decimals);
  return {
    address: env.depositAddress,
    tokenContract: env.contract,
    amount,
    amountRaw,
    confirmations: env.confirmations,
    tx: deps.chain.encodeTransferTx(env.depositAddress, amountRaw),
  };
}

function depositKey(event) {
  return `${event.txHash}:${event.logIndex}`;
}

/**
 * Credits one Transfer(to=treasury) event to the sender's profile exactly once.
 * The profile record is the source of truth (checked inside the mutator);
 * `recentKeys` in the token state is a cheap pre-check shared across profiles.
 * Returns { credited, points, balance }.
 */
async function creditDeposit(wallet, event, source, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const env = tokenChain.getTokenEnv();
  const key = depositKey(event);
  const points = Number(fromBaseUnits(event.amountRaw, env.decimals));
  if (!Number.isFinite(points) || points <= 0) {
    throw fail(400, "Deposit is below one whole token.", "BAD_REQUEST");
  }

  let credited = false;
  const creditedAt = new Date(deps.now()).toISOString();
  const profile = await deps.profiles.updateWalletProfile(wallet, (current) => {
    if (!Array.isArray(current.deposits)) current.deposits = [];
    if (current.deposits.some((record) => record.key === key)) {
      const duplicate = new Error("already credited");
      duplicate.code = "DUPLICATE_DEPOSIT";
      throw duplicate;
    }
    const currency = normalizeCurrency(current.currency);
    current.currency = { balance: currency.balance + points, totalEarned: currency.totalEarned };
    current.deposits.push({
      key,
      txHash: event.txHash,
      logIndex: Number(event.logIndex) || 0,
      blockNumber: Number(event.blockNumber) || 0,
      amountRaw: String(event.amountRaw),
      points,
      creditedAt,
      source,
    });
    credited = true;
    return current;
  }).catch(async (error) => {
    if (error?.code !== "DUPLICATE_DEPOSIT") throw error;
    return deps.profiles.getWalletProfile(wallet);
  });

  if (credited) {
    await deps.tokenStore.withTokenState((state) => {
      deps.tokenStore.rememberKeys(state, [key]);
      deps.tokenStore.rememberWallet(state, wallet);
      return state;
    });
  }
  return { credited, points, balance: normalizeCurrency(profile.currency).balance };
}

/**
 * Fast path: the player pastes/sends the txHash right after their transfer.
 * Verifies the receipt on-chain and credits immediately (idempotent).
 */
async function confirmDeposit(wallet, txHash, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const env = tokenChain.getTokenEnv();
  if (!env.enabled) throw fail(404, "Token features are disabled.", "TOKEN_DISABLED");
  if (!isLikelyEvmAddress(wallet)) throw fail(403, "Deposits require an EVM wallet.", "EVM_ONLY");
  if (!env.configured) throw fail(503, "Deposits are not configured on the server.", "TOKEN_NOT_CONFIGURED");
  const hash = String(txHash || "").trim().toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(hash)) throw fail(400, "txHash is invalid.", "BAD_REQUEST");
  const sender = String(wallet).toLowerCase();
  if (isProjectWallet(env, sender)) {
    throw fail(400, "Project wallets cannot deposit.", "BAD_REQUEST");
  }

  let receipt;
  try {
    receipt = await deps.chain.getReceipt(hash);
  } catch (error) {
    throw mapChainError(error);
  }
  if (!receipt) throw fail(404, "Transaction not found yet.", "NOT_FOUND");
  if (receipt.status !== 1) throw fail(400, "Transaction failed on-chain.", "TX_FAILED");

  const matching = (receipt.logs || []).filter(
    (log) =>
      String(log.address || "").toLowerCase() === env.contract &&
      String(log.to || "").toLowerCase() === env.depositAddress &&
      String(log.from || "").toLowerCase() === sender
  );
  if (!matching.length) {
    throw fail(400, "This transaction is not a $PETIX transfer from your wallet to the deposit address.", "BAD_REQUEST");
  }
  if (receipt.confirmations < env.confirmations) {
    return { status: "pending", confirmations: receipt.confirmations, required: env.confirmations, txHash: hash };
  }

  let credited = false;
  let points = 0;
  let balance = 0;
  for (const log of matching) {
    const event = {
      txHash: hash,
      logIndex: Number(log.logIndex) || 0,
      blockNumber: receipt.blockNumber,
      amountRaw: String(log.amountRaw),
    };
    const outcome = await creditDeposit(sender, event, "fast", deps);
    credited = credited || outcome.credited;
    points += outcome.credited ? outcome.points : 0;
    balance = outcome.balance;
  }
  return {
    status: credited ? "credited" : "already_credited",
    points: credited ? points : Number(fromBaseUnits(matching[0].amountRaw, env.decimals)),
    balance,
    txHash: hash,
    explorerUrl: explorerTxUrl(env, hash),
  };
}

/**
 * Cron/background path: scan Transfer(to=treasury) from the cursor up to
 * latest − confirmations, credit senders, then settle `sent` withdrawals of
 * recently active wallets. Cursor advances only on a successful scan.
 */
async function syncDeposits(depOverrides) {
  const deps = resolveDeps(depOverrides);
  const env = tokenChain.getTokenEnv();
  const result = {
    scannedFromBlock: null,
    toBlock: null,
    credited: [],
    skippedInternal: 0,
    skippedDuplicate: 0,
    reconciled: 0,
    errors: [],
  };
  if (!env.enabled) return { ...result, skipped: true, reason: "TOKEN_DISABLED" };
  if (!env.configured) return { ...result, skipped: true, reason: "TOKEN_NOT_CONFIGURED" };

  // Cursor belongs to (treasury, token); a change resets it.
  const state = await deps.tokenStore.withTokenState((current) => {
    deps.tokenStore.resetIfChanged(current, {
      treasury: env.depositAddress,
      token: env.contract,
      startBlock: env.startBlock,
    });
    if (!current.startBlock && env.startBlock) current.startBlock = env.startBlock;
    return current;
  });

  let fromBlock;
  if (state.lastSyncedBlock) fromBlock = state.lastSyncedBlock + 1;
  else if (state.startBlock) fromBlock = state.startBlock;
  else {
    // No start block configured: do not walk the whole chain — start near the head.
    try {
      fromBlock = Math.max(0, (await deps.chain.getBlockNumber()) - env.syncMaxBlocks);
    } catch (error) {
      fromBlock = 0;
    }
  }
  result.scannedFromBlock = fromBlock;

  let scan;
  try {
    scan = await deps.chain.scanIncomingTransfers(fromBlock, {
      maxBlocks: env.syncMaxBlocks,
      confirmations: env.confirmations,
    });
  } catch (error) {
    const message = error?.code === "RPC_UNAVAILABLE" ? "RPC unavailable" : error?.message || String(error);
    result.errors.push(message);
    await deps.tokenStore.withTokenState((current) => {
      current.lastRunAt = new Date(deps.now()).toISOString();
      current.lastError = message;
      return current;
    });
    return result;
  }
  result.toBlock = scan.toBlock;

  for (const transfer of scan.transfers) {
    const from = String(transfer.from || "").toLowerCase();
    if (!isLikelyEvmAddress(from)) continue;
    if (isProjectWallet(env, from)) {
      result.skippedInternal += 1;
      continue;
    }
    if (deps.tokenStore.hasKey(state, depositKey(transfer))) {
      result.skippedDuplicate += 1;
      continue;
    }
    try {
      const outcome = await creditDeposit(from, transfer, "sync", deps);
      if (outcome.credited) {
        result.credited.push({ wallet: from, points: outcome.points, txHash: transfer.txHash });
      } else {
        result.skippedDuplicate += 1;
      }
    } catch (error) {
      if (error?.httpCode === "BAD_REQUEST") continue; // sub-token dust: ignore silently
      result.errors.push(`${transfer.txHash}: ${error.message}`);
    }
  }

  // Settle in-flight withdrawals for wallets we have seen recently.
  const latestState = await deps.tokenStore.readTokenState();
  for (const wallet of latestState.recentWallets) {
    try {
      const summary = await reconcileWalletUnsettled(wallet, deps);
      result.reconciled += summary.confirmed + summary.refunded;
    } catch (error) {
      result.errors.push(`reconcile ${wallet}: ${error.message}`);
    }
  }

  await deps.tokenStore.withTokenState((current) => {
    if (scan.toBlock >= fromBlock - 1) current.lastSyncedBlock = Math.max(current.lastSyncedBlock, scan.toBlock);
    current.lastRunAt = new Date(deps.now()).toISOString();
    current.lastError = result.errors.length ? result.errors[0] : null;
    return current;
  });
  return result;
}

/** Last 50 withdrawals and deposits of a wallet with explorer links. */
async function getWalletHistory(wallet, depOverrides) {
  const deps = resolveDeps(depOverrides);
  const env = tokenChain.getTokenEnv();
  const profile = await deps.profiles.getWalletProfile(wallet);
  const withdrawals = (profile.withdrawals || [])
    .filter((record) => record.chain === "evm")
    .slice(-50)
    .reverse()
    .map((record) => ({
      id: record.id,
      points: record.points,
      petixSent: record.petixSent,
      status: record.status,
      txHash: record.txHash || null,
      explorerUrl: explorerTxUrl(env, record.txHash),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    }));
  const deposits = (profile.deposits || [])
    .slice(-50)
    .reverse()
    .map((record) => ({
      key: record.key,
      points: record.points,
      txHash: record.txHash,
      explorerUrl: explorerTxUrl(env, record.txHash),
      creditedAt: record.creditedAt,
      source: record.source,
    }));
  return { withdrawals, deposits };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;
const LOW_GAS_ETH = 0.01;

function formatEthFromWei(wei) {
  try {
    return tokenChain.formatEther(BigInt(String(wei)));
  } catch (error) {
    return null;
  }
}

/** Operator view: treasury health, today's flows, in-flight payouts, sync state, journal. */
async function adminStats(depOverrides) {
  const deps = resolveDeps(depOverrides);
  const env = tokenChain.getTokenEnv();
  if (!env.enabled) throw fail(404, "Token features are disabled.", "TOKEN_DISABLED");
  const now = deps.now();
  const todayIndex = Math.floor(now / DAY_MS);
  const weekAgo = now - 7 * DAY_MS;

  const state = await deps.tokenStore.readTokenState();
  const recent = [];
  let pendingCount = 0;
  let pendingPoints = 0;
  let depositedToday = 0;
  let paidLast7Days = 0;

  for (const wallet of state.recentWallets) {
    const profile = await deps.profiles.getWalletProfile(wallet);
    for (const record of profile.withdrawals || []) {
      if (record.chain !== "evm") continue;
      const createdAt = Date.parse(record.createdAt || "") || 0;
      if (["reserved", "sent"].includes(record.status)) {
        pendingCount += 1;
        pendingPoints += Number(record.petixSent) || 0;
      }
      if (["sent", "confirmed"].includes(record.status) && createdAt >= weekAgo) {
        paidLast7Days += Number(record.petixSent) || 0;
      }
      recent.push({
        kind: "withdrawal",
        wallet,
        points: record.points,
        petix: record.petixSent,
        status: record.status,
        reason: record.reason || null,
        txHash: record.txHash || null,
        explorerUrl: explorerTxUrl(env, record.txHash),
        at: record.updatedAt || record.createdAt,
      });
    }
    for (const record of profile.deposits || []) {
      const creditedAt = Date.parse(record.creditedAt || "") || 0;
      if (Math.floor(creditedAt / DAY_MS) === todayIndex) depositedToday += Number(record.points) || 0;
      recent.push({
        kind: "deposit",
        wallet,
        points: record.points,
        petix: record.points,
        status: "credited",
        reason: null,
        txHash: record.txHash,
        explorerUrl: explorerTxUrl(env, record.txHash),
        at: record.creditedAt,
        source: record.source,
      });
    }
  }
  recent.sort((a, b) => (Date.parse(b.at || "") || 0) - (Date.parse(a.at || "") || 0));

  let treasury = {
    address: env.treasuryAddress,
    source: env.payoutSource,
    depositAddress: env.depositAddress,
    tokens: null,
    allowance: null,
    eth: null,
    lowGas: false,
    lowTokens: false,
    lowAllowance: false,
  };
  let rpcDegraded = false;
  try {
    const snapshot = await deps.chain.getTreasurySnapshot();
    const tokens = fromBaseUnits(snapshot.tokensRaw, env.decimals);
    const allowance = snapshot.allowanceRaw == null ? null : fromBaseUnits(snapshot.allowanceRaw, env.decimals);
    const eth = formatEthFromWei(snapshot.ethWei);
    treasury = {
      address: env.treasuryAddress,
      source: env.payoutSource,
      depositAddress: env.depositAddress,
      tokens,
      allowance,
      available: fromBaseUnits(snapshot.availableRaw ?? snapshot.tokensRaw, env.decimals),
      eth,
      lowGas: Number(eth) < LOW_GAS_ETH,
      lowTokens: Number(tokens) < paidLast7Days,
      lowAllowance: allowance != null && Number(allowance) < paidLast7Days,
      nonceLatest: snapshot.nonceLatest,
      noncePending: snapshot.noncePending,
    };
  } catch (error) {
    rpcDegraded = true;
  }

  return {
    treasury,
    today: {
      withdrawnPoints: deps.tokenStore.dailyOutFor(state, now),
      depositedPoints: depositedToday,
    },
    paidLast7Days,
    pending: { count: pendingCount, points: pendingPoints },
    sync: {
      startBlock: state.startBlock,
      lastSyncedBlock: state.lastSyncedBlock,
      lastRunAt: state.lastRunAt,
      lastError: state.lastError,
      sendLock: state.sendLock,
    },
    config: {
      chainId: env.chainId,
      explorerUrl: env.explorerUrl,
      confirmations: env.confirmations,
      internalWallets: env.internalWallets.length,
    },
    recent: recent.slice(0, 100),
    ...(rpcDegraded ? { rpcDegraded: true } : {}),
  };
}

module.exports = {
  DEFAULTS,
  NFT_GATE_MESSAGES,
  adminStats,
  configureDeps,
  evaluateNftGate,
  confirmDeposit,
  creditDeposit,
  getWalletHistory,
  prepareDeposit,
  syncDeposits,
  explorerTxUrl,
  fail,
  fromBaseUnits,
  getTokenConfigForWallet,
  mapChainError,
  reconcileWalletUnsettled,
  reconcileWithdrawal,
  requestWithdraw,
  resolveDeps,
  toBaseUnits,
};
