const { getEconomyConfig } = require("./economy-config");
const tokenChain = require("./token-chain");
const tokenStore = require("./token-store");

// Сжигание монет за созданных питомцев (024).
//
// Points, потраченные игроками внутри игры, — это погашенные требования к
// казне: мы больше не обязаны выдать их по выводу. Ровно на эту сумму монеты
// уходят из обращения. Технически это такой же перевод, как выплата игроку, но
// получатель — общеизвестный адрес сжигания, откуда монеты не вернутся.
//
// Платит тот же оператор и тем же разрешением, что и выводы, поэтому костёр
// уменьшает остаток разрешения — это видно в админке до нажатия.

// Общеизвестный адрес сжигания: приватного ключа к нему не существует.
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const MAX_HISTORY = 50;
const LOCK_TTL_MS = 20000;
const LOCK_WAIT_MS = 10000;
const LOCK_POLL_MS = 500;
const RECEIPT_POLL_ATTEMPTS = 4;
const RECEIPT_POLL_MS = 2000;

function fail(status, message, code) {
  const error = new Error(message);
  error.httpStatus = status;
  error.httpCode = code;
  return error;
}

function defaultDeps(overrides = {}) {
  return {
    chain: overrides.chain || tokenChain.createChainClient(),
    tokenStore: overrides.tokenStore || tokenStore,
    getConfig: overrides.getConfig || getEconomyConfig,
    now: overrides.now || (() => Date.now()),
    sleep: overrides.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    receiptPollAttempts: overrides.receiptPollAttempts ?? RECEIPT_POLL_ATTEMPTS,
    receiptPollMs: overrides.receiptPollMs ?? RECEIPT_POLL_MS,
    lockTtlMs: overrides.lockTtlMs ?? LOCK_TTL_MS,
    lockWaitMs: overrides.lockWaitMs ?? LOCK_WAIT_MS,
    lockPollMs: overrides.lockPollMs ?? LOCK_POLL_MS,
  };
}

function toBaseUnits(points, decimals) {
  return (BigInt(Math.max(0, Math.floor(points))) * 10n ** BigInt(decimals)).toString();
}

async function acquireLock(deps, owner) {
  const attempts = Math.max(1, Math.ceil(deps.lockWaitMs / Math.max(1, deps.lockPollMs)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const ok = await deps.tokenStore.acquireSendLock(owner, { ttlMs: deps.lockTtlMs, now: deps.now() });
    if (ok) return true;
    await deps.sleep(deps.lockPollMs);
  }
  return false;
}

/** Очередь, история и то, хватит ли казны и разрешения на костёр прямо сейчас. */
async function getBurnState(depsOverrides = {}) {
  const deps = defaultDeps(depsOverrides);
  const state = await deps.tokenStore.readTokenState();
  const queue = state.burnQueue;

  let treasury = null;
  let treasuryError = null;
  try {
    treasury = await deps.chain.getTreasurySnapshot();
  } catch (error) {
    treasuryError = error.message || "Treasury is unreachable.";
  }

  const env = tokenChain.getTokenEnv();
  const availableRaw = treasury ? BigInt(treasury.availableRaw) : null;
  const requiredRaw = queue.points > 0 ? BigInt(toBaseUnits(queue.points, env.decimals)) : 0n;
  const enoughTokens = availableRaw === null ? null : availableRaw >= requiredRaw;

  let blockedReason = null;
  if (!tokenChain.isTokenEnabled()) blockedReason = "TOKEN_DISABLED";
  else if (queue.points <= 0) blockedReason = "NOTHING_TO_BURN";
  else if (treasuryError) blockedReason = "TREASURY_UNREACHABLE";
  else if (treasury && treasury.lowGas) blockedReason = "LOW_GAS";
  else if (enoughTokens === false) blockedReason = "NOT_ENOUGH_ALLOWANCE";

  return {
    queue,
    burnAddress: BURN_ADDRESS,
    burnedTotalPoints: state.burnedTotalPoints,
    burns: state.burns,
    treasury: treasury
      ? {
          availableRaw: treasury.availableRaw,
          allowanceRaw: treasury.allowanceRaw,
          ethWei: treasury.ethWei,
          lowGas: treasury.lowGas,
        }
      : null,
    treasuryError,
    explorerUrl: env.explorerUrl || null,
    canBurn: blockedReason === null,
    blockedReason,
  };
}

/**
 * Сжечь Points из очереди. По умолчанию — всю очередь.
 *
 * Очередь уменьшается в момент отправки, а не подтверждения: если транзакция
 * подтвердится позже, чем мы успели прочитать receipt, повторное нажатие не
 * сожжёт ту же сумму второй раз. Явная неудача возвращает сумму в очередь.
 */
async function burnQueued({ points } = {}, depsOverrides = {}) {
  const deps = defaultDeps(depsOverrides);
  if (!tokenChain.isTokenEnabled()) {
    throw fail(409, "Token operations are disabled.", "TOKEN_DISABLED");
  }

  const state = await deps.tokenStore.readTokenState();
  const queued = state.burnQueue.points;
  if (queued <= 0) throw fail(409, "Nothing to burn.", "NOTHING_TO_BURN");

  const requested = points === undefined || points === null ? queued : Math.floor(Number(points));
  if (!Number.isFinite(requested) || requested <= 0) {
    throw fail(400, "Burn amount must be a positive number of Points.", "BAD_REQUEST");
  }
  if (requested > queued) {
    throw fail(400, `Only ${queued} Points are queued for burning.`, "BAD_REQUEST");
  }

  const env = tokenChain.getTokenEnv();
  const amountRaw = toBaseUnits(requested, env.decimals);

  const treasury = await deps.chain.getTreasurySnapshot();
  if (treasury.lowGas) {
    throw fail(409, "The operator is low on gas — top it up before burning.", "LOW_GAS");
  }
  if (BigInt(treasury.availableRaw) < BigInt(amountRaw)) {
    throw fail(
      409,
      "The allowance or the pool balance is below the amount to burn.",
      "NOT_ENOUGH_ALLOWANCE"
    );
  }

  const id = `burn_${deps.now()}`;
  const locked = await acquireLock(deps, id);
  if (!locked) {
    throw fail(503, "The treasury is busy right now. Try again in a moment.", "BUSY");
  }

  let sent;
  try {
    let fresh = await deps.chain.getTreasurySnapshot();
    try {
      sent = await deps.chain.sendTransfer(BURN_ADDRESS, amountRaw, fresh.noncePending);
    } catch (error) {
      if (error?.code !== "NONCE_CONFLICT") throw error;
      fresh = await deps.chain.getTreasurySnapshot();
      sent = await deps.chain.sendTransfer(BURN_ADDRESS, amountRaw, fresh.noncePending);
    }
  } catch (error) {
    await deps.tokenStore.releaseSendLock(id);
    throw fail(502, error.message || "Failed to submit the burn.", error.code || "SEND_FAILED");
  }

  // Списываем из очереди сразу: подтверждение может прийти после ответа, и
  // повторное нажатие не должно сжечь ту же сумму дважды.
  const sentAt = new Date(deps.now()).toISOString();
  let drained = {};
  await deps.tokenStore.withTokenState((current) => {
    drained = deps.tokenStore.drainBurnQueue(current, requested);
    deps.tokenStore.recordBurn(current, {
      id,
      points: requested,
      amountRaw,
      txHash: sent.txHash,
      status: "sent",
      at: sentAt,
      byReason: drained,
    });
    if (current.sendLock && current.sendLock.owner === id) current.sendLock = null;
    return current;
  });

  let status = "sent";
  for (let attempt = 0; attempt < deps.receiptPollAttempts; attempt += 1) {
    let receipt = null;
    try {
      receipt = await deps.chain.getReceipt(sent.txHash);
    } catch (error) {
      break; // RPC hiccup — settles lazily, the entry stays `sent`
    }
    if (receipt) {
      status = receipt.status === 1 ? "confirmed" : "failed";
      break;
    }
    if (attempt < deps.receiptPollAttempts - 1) await deps.sleep(deps.receiptPollMs);
  }

  await deps.tokenStore.withTokenState((current) => {
    deps.tokenStore.settleBurn(current, id, { status, at: new Date(deps.now()).toISOString() });
    // Явная неудача — возвращаем сумму в очередь: монеты не ушли.
    if (status === "failed") {
      deps.tokenStore.restoreBurnQueue(current, drained);
    }
    return current;
  });

  return {
    id,
    points: requested,
    txHash: sent.txHash,
    status,
    burnAddress: BURN_ADDRESS,
    explorerUrl: env.explorerUrl ? `${env.explorerUrl}/tx/${sent.txHash}` : null,
  };
}

module.exports = {
  BURN_ADDRESS,
  burnQueued,
  getBurnState,
};
