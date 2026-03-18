const API_BASE_URL = window.PETIX_API_BASE_URL || "";
const INTRO_DELAY = 1500;
const ROUND_START_DELAY = 400;
const LOG_REVEAL_DELAY = 500;
const HP_ANIMATION_DURATION = 700;
const ROUND_END_DELAY = 700;
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 20000;

const RARITY_META = {
  legendary: { label: "Legendary", color: "#f79009" },
  epic: { label: "Epic", color: "#7a5af8" },
  rare: { label: "Rare", color: "#0ba5ec" },
  common: { label: "Common", color: "#667085" },
};

const loadingState = document.getElementById("loadingState");
const loadingTitle = document.getElementById("loadingTitle");
const loadingMessage = document.getElementById("loadingMessage");
const errorState = document.getElementById("errorState");
const errorTitle = document.getElementById("errorTitle");
const errorMessage = document.getElementById("errorMessage");
const retryBattleBtn = document.getElementById("retryBattleBtn");
const battleScreen = document.getElementById("battleScreen");
const battleStatusCopy = document.getElementById("battleStatusCopy");
const battleRoundIndicator = document.getElementById("battleRoundIndicator");
const attackerCard = document.getElementById("attackerCard");
const defenderCard = document.getElementById("defenderCard");
const battleLogFeed = document.getElementById("battleLogFeed");
const battleFeedCount = document.getElementById("battleFeedCount");
const playbackTitle = document.getElementById("playbackTitle");
const playbackCopy = document.getElementById("playbackCopy");
const pauseResumeBtn = document.getElementById("pauseResumeBtn");
const skipToResultBtn = document.getElementById("skipToResultBtn");
const battleResultCard = document.getElementById("battleResultCard");
const battleResultBadge = document.getElementById("battleResultBadge");
const battleResultTitle = document.getElementById("battleResultTitle");
const battleResultSubtitle = document.getElementById("battleResultSubtitle");
const battleResultSummary = document.getElementById("battleResultSummary");
const attackerRewards = document.getElementById("attackerRewards");
const defenderRewards = document.getElementById("defenderRewards");
const viewPetBtn = document.getElementById("viewPetBtn");
const fightAgainBtn = document.getElementById("fightAgainBtn");

const state = {
  battleId: "",
  battle: null,
  screenState: "loading",
  visibleRounds: [],
  activeActorId: "",
  displayedHp: {
    attacker: 0,
    defender: 0,
  },
  roundCursor: 0,
  runToken: 0,
  isPaused: false,
  pauseWaiters: [],
};

function toApiUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

async function apiRequest(path, method = "GET") {
  const response = await fetch(toApiUrl(path), {
    method,
    credentials: "include",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error || "Request failed.");
  }

  return data;
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitWithPlaybackControls(ms, token) {
  let elapsed = 0;

  while (elapsed < ms) {
    if (token !== state.runToken) {
      return false;
    }

    if (state.isPaused) {
      await new Promise((resolve) => {
        state.pauseWaiters.push(resolve);
      });
      if (token !== state.runToken) {
        return false;
      }
    }

    const step = Math.min(50, ms - elapsed);
    await wait(step);
    elapsed += step;
  }

  return token === state.runToken;
}

function flushPauseWaiters() {
  const waiters = [...state.pauseWaiters];
  state.pauseWaiters = [];
  waiters.forEach((resolve) => resolve());
}

function normalizeRarity(label) {
  const normalized = String(label || "").trim().toLowerCase();
  return RARITY_META[normalized] ? normalized : "legendary";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getBattleIdFromLocation() {
  const pathParts = window.location.pathname.split("/").filter(Boolean);
  if (pathParts[0] === "battle" && pathParts[1]) {
    return pathParts[1];
  }

  const queryId = new URLSearchParams(window.location.search).get("battleId");
  return String(queryId || "").trim();
}

function normalizeBattlePayload(payload) {
  return {
    ...payload,
    rounds: Array.isArray(payload.rounds) ? payload.rounds : [],
    attacker: payload.attacker || null,
    defender: payload.defender || null,
    startingHp: payload.startingHp || {
      attacker: payload.attacker?.maxHp || 0,
      defender: payload.defender?.maxHp || 0,
    },
    result: payload.result || null,
  };
}

async function preloadImages(urls) {
  await Promise.all(
    urls
      .filter(Boolean)
      .map(
        (src) =>
          new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve();
            image.onerror = () => resolve();
            image.src = src;
          })
      )
  );
}

function getCurrentHpForFighter(role) {
  return role === "attacker" ? state.displayedHp.attacker : state.displayedHp.defender;
}

function buildTraitChips(fighter) {
  const traits = fighter?.traits || {};
  const values = [traits.element, traits.professionStyle, fighter?.selectedPower?.name].filter(Boolean).slice(0, 3);

  return values
    .map((value) => `<span class="battle-trait-chip">${escapeHtml(value)}</span>`)
    .join("");
}

function buildFighterCardMarkup(fighter, role) {
  if (!fighter) return "";

  const rarity = RARITY_META[normalizeRarity(fighter.rarity)];
  const currentHp = getCurrentHpForFighter(role);
  const maxHp = Number(fighter.maxHp || 0);
  const hpPercent = maxHp > 0 ? Math.max(0, Math.min(100, (currentHp / maxHp) * 100)) : 0;
  const isActive = state.activeActorId === fighter.id;
  const isKo = currentHp <= 0;

  return `
    <div class="battle-fighter-portrait">
      <img src="${escapeHtml(fighter.imageUrl || "/assets/character/current-pet.jpg")}" alt="${escapeHtml(fighter.type || "Pet")} portrait" width="248" height="248" />
      <span class="battle-rarity-badge" style="background-color: ${rarity.color};">${rarity.label}</span>
    </div>
    <div class="battle-fighter-meta${isActive ? " is-active" : ""}">
      <div class="battle-fighter-heading">
        <div>
          <h2 class="battle-fighter-name">${escapeHtml(fighter.name || "Unknown pet")}</h2>
          <p class="battle-fighter-type">${escapeHtml(fighter.type || "Pet")}</p>
        </div>
        <span class="battle-level-chip">Lvl. ${Number(fighter.level || 1)}</span>
      </div>
      <p class="battle-power-name">${escapeHtml(fighter.selectedPower?.name || "Basic attack")}</p>
      <div class="battle-traits-row">${buildTraitChips(fighter)}</div>
      <div class="battle-hp-meta">
        <span>HP</span>
        <span>${currentHp} / ${maxHp}</span>
      </div>
      <div class="battle-hp-track">
        <span class="battle-hp-fill" style="width: ${hpPercent}%;"></span>
      </div>
      ${isKo ? '<span class="battle-trait-chip">KO</span>' : ""}
    </div>
  `;
}

function getActionLabel(round, battle) {
  const actor =
    round.actorPetId === battle.attacker.id ? battle.attacker : battle.defender;

  if (round.actionType === "ability" && round.abilityName) {
    return `${actor.name} uses ${round.abilityName}`;
  }

  return `${actor.name} attacks`;
}

function buildResultChip(round) {
  if (round.actionType === "ability") {
    return '<span class="battle-log-chip is-ability">Ability</span>';
  }

  const label = String(round.hitResult || "hit").toUpperCase();
  const modifierClass =
    round.hitResult === "crit"
      ? " is-crit"
      : round.hitResult === "miss"
        ? " is-miss"
        : round.hitResult === "dodge"
          ? " is-dodge"
          : "";

  return `<span class="battle-log-chip${modifierClass}">${label}</span>`;
}

function buildRoundCardMarkup(round, battle) {
  const hpChangeLabel =
    round.hpBeforeTarget === round.hpAfterTarget
      ? `HP stays ${round.hpAfterTarget}`
      : `HP: ${round.hpBeforeTarget} → ${round.hpAfterTarget}`;

  const extraChip =
    round.actionType === "ability" && round.hitResult
      ? `<span class="battle-log-chip${
          round.hitResult === "crit"
            ? " is-crit"
            : round.hitResult === "miss"
              ? " is-miss"
              : round.hitResult === "dodge"
                ? " is-dodge"
                : ""
        }">${String(round.hitResult).toUpperCase()}</span>`
      : "";

  return `
    <article class="battle-log-card">
      <div class="battle-log-top">
        <div>
          <p class="battle-log-round">Round ${round.roundNumber}</p>
          <h3 class="battle-log-title">${escapeHtml(getActionLabel(round, battle))}</h3>
        </div>
        <div class="battle-log-chips">
          ${buildResultChip(round)}
          ${extraChip}
        </div>
      </div>
      <p class="battle-log-text">${escapeHtml(round.narrationText || "The strike lands with a flash of motion.")}</p>
      <div class="battle-log-meta">
        <span>Damage: ${round.damage}</span>
        <span>${escapeHtml(hpChangeLabel)}</span>
      </div>
    </article>
  `;
}

function buildRewardChips(rewards, isDefender = false) {
  const chips = [];
  if (Number(rewards?.xpGained || 0) > 0) {
    chips.push(`<span class="battle-reward-chip">+${Number(rewards.xpGained)} XP</span>`);
  }

  if (Number(rewards?.softCurrencyGained || 0) > 0) {
    chips.push(
      `<span class="battle-reward-chip">+${Number(rewards.softCurrencyGained)} Arena Coins</span>`
    );
  }

  if (rewards?.levelUp) {
    const levelLabel = rewards.newLevel ? `Reached Level ${rewards.newLevel}` : "Level Up";
    chips.push(`<span class="battle-reward-chip is-level">${escapeHtml(levelLabel)}</span>`);
  }

  if (rewards?.attributePointsGained) {
    chips.push(
      `<span class="battle-reward-chip is-level">+${Number(rewards.attributePointsGained)} Attribute Point</span>`
    );
  }

  if (isDefender && rewards?.passiveParticipationXp) {
    chips.push('<span class="battle-reward-chip is-passive">Passive XP</span>');
  }

  if (!chips.length && isDefender) {
    chips.push('<span class="battle-reward-chip">No passive rewards</span>');
  }

  return chips.join("");
}

function renderBattleView() {
  if (!state.battle) return;

  const battle = state.battle;
  const totalRounds = battle.rounds.length;
  const visibleRounds = state.visibleRounds;
  const isFinished = state.screenState === "battle_finished";
  const isPlayback = state.screenState === "round_playback";

  attackerCard.className = `battle-fighter-card${
    state.activeActorId === battle.attacker.id ? " is-active" : ""
  }${state.displayedHp.attacker <= 0 ? " is-ko" : ""}`;
  attackerCard.innerHTML = buildFighterCardMarkup(battle.attacker, "attacker");

  defenderCard.className = `battle-fighter-card${
    state.activeActorId === battle.defender.id ? " is-active" : ""
  }${state.displayedHp.defender <= 0 ? " is-ko" : ""}`;
  defenderCard.innerHTML = buildFighterCardMarkup(battle.defender, "defender");

  battleRoundIndicator.textContent = `Round ${Math.min(visibleRounds.length, totalRounds)} / ${totalRounds}`;
  battleFeedCount.textContent = `${visibleRounds.length} entr${visibleRounds.length === 1 ? "y" : "ies"}`;
  battleLogFeed.innerHTML = visibleRounds.map((round) => buildRoundCardMarkup(round, battle)).join("");

  if (visibleRounds.length) {
    battleLogFeed.scrollTop = battleLogFeed.scrollHeight;
  }

  if (state.screenState === "intro") {
    battleStatusCopy.textContent = "Both fighters lock in. The first move is seconds away.";
    playbackTitle.textContent = "Battle intro";
    playbackCopy.textContent = "Two pets square up before the replay begins.";
  } else if (isPlayback) {
    battleStatusCopy.textContent = "Combat playback is live.";
    playbackTitle.textContent = state.isPaused ? "Playback paused" : "Battle playback";
    playbackCopy.textContent = state.isPaused
      ? "Resume whenever you want to continue the round-by-round replay."
      : "Backend simulation is now being replayed exactly as stored.";
  } else if (isFinished) {
    battleStatusCopy.textContent = "The replay is complete.";
    playbackTitle.textContent = "Battle complete";
    playbackCopy.textContent = "Every logged action has now been revealed.";
  } else {
    battleStatusCopy.textContent = "Preparing battle...";
    playbackTitle.textContent = "Preparing battle";
    playbackCopy.textContent = "Fetching the replay payload.";
  }

  pauseResumeBtn.textContent = state.isPaused ? "Resume" : "Pause";
  pauseResumeBtn.disabled = !isPlayback;
  skipToResultBtn.disabled = !isPlayback;

  if (!battle.result) {
    battleResultCard.classList.add("hidden");
    return;
  }

  if (isFinished) {
    const winner =
      battle.result.winnerPetId === battle.attacker.id ? battle.attacker : battle.defender;
    const loser =
      battle.result.loserPetId === battle.attacker.id ? battle.attacker : battle.defender;

    battleResultCard.classList.remove("hidden");
    battleResultBadge.textContent = winner.id === battle.attacker.id ? "Victory" : "Defeat";
    battleResultTitle.textContent =
      winner.id === battle.attacker.id ? `${winner.name} wins` : `${winner.name} holds the line`;
    battleResultSubtitle.textContent = `${winner.name} defeated ${loser.name}.`;
    battleResultSummary.textContent =
      battle.result.finalSummaryText || `${winner.name} outlasted ${loser.name}.`;
    attackerRewards.innerHTML = buildRewardChips(battle.result.attackerRewards);
    defenderRewards.innerHTML = buildRewardChips(battle.result.defenderRewards, true);
    viewPetBtn.href = `/dashboard/?screen=cabinet&petId=${encodeURIComponent(battle.attacker.id)}`;
    fightAgainBtn.href = `/dashboard/?screen=arena&petId=${encodeURIComponent(battle.attacker.id)}`;
  } else {
    battleResultCard.classList.add("hidden");
  }
}

function render() {
  const isLoading = state.screenState === "loading";
  const isError = state.screenState === "error";
  const hasBattle = Boolean(state.battle);

  loadingState.classList.toggle("hidden", !isLoading);
  errorState.classList.toggle("hidden", !isError);
  battleScreen.classList.toggle("hidden", !hasBattle || isLoading || isError);

  if (hasBattle && !isLoading && !isError) {
    renderBattleView();
  }
}

function showError(title, message) {
  state.screenState = "error";
  errorTitle.textContent = title;
  errorMessage.textContent = message;
  render();
}

async function fetchBattleWithPolling() {
  const timeoutAt = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < timeoutAt) {
    const payload = await apiRequest(`/api/battles/${encodeURIComponent(state.battleId)}`, "GET");
    if (payload.status === "generating") {
      loadingTitle.textContent = "Preparing battle...";
      loadingMessage.textContent = "The backend is finishing simulation and storing the replay payload.";
      await wait(POLL_INTERVAL_MS);
      continue;
    }

    return normalizeBattlePayload(payload);
  }

  throw new Error("The battle took too long to prepare.");
}

function resetPlaybackState(battle) {
  state.battle = battle;
  state.visibleRounds = [];
  state.activeActorId = "";
  state.roundCursor = 0;
  state.isPaused = false;
  state.pauseWaiters = [];
  state.displayedHp = {
    attacker: Number(battle.startingHp?.attacker || battle.attacker?.maxHp || 0),
    defender: Number(battle.startingHp?.defender || battle.defender?.maxHp || 0),
  };
}

function finishBattlePlayback() {
  if (!state.battle) return;

  state.runToken += 1;
  state.screenState = "battle_finished";
  state.visibleRounds = [...state.battle.rounds];
  const lastRound = state.battle.rounds[state.battle.rounds.length - 1];

  state.activeActorId = "";
  if (lastRound) {
    if (lastRound.targetPetId === state.battle.attacker.id) {
      state.displayedHp.attacker = lastRound.hpAfterTarget;
    }
    if (lastRound.targetPetId === state.battle.defender.id) {
      state.displayedHp.defender = lastRound.hpAfterTarget;
    }
  }

  flushPauseWaiters();
  render();
}

async function runBattlePlayback() {
  if (!state.battle) return;

  const token = state.runToken + 1;
  state.runToken = token;
  state.screenState = "intro";
  render();

  if (!(await waitWithPlaybackControls(INTRO_DELAY, token))) {
    return;
  }

  state.screenState = "round_playback";
  render();

  for (let index = 0; index < state.battle.rounds.length; index += 1) {
    const round = state.battle.rounds[index];
    state.activeActorId = round.actorPetId;
    render();

    if (!(await waitWithPlaybackControls(ROUND_START_DELAY, token))) {
      return;
    }

    state.visibleRounds = [...state.visibleRounds, round];
    state.roundCursor = index + 1;
    render();

    if (!(await waitWithPlaybackControls(LOG_REVEAL_DELAY, token))) {
      return;
    }

    if (round.targetPetId === state.battle.attacker.id) {
      state.displayedHp.attacker = round.hpAfterTarget;
    }
    if (round.targetPetId === state.battle.defender.id) {
      state.displayedHp.defender = round.hpAfterTarget;
    }
    render();

    if (!(await waitWithPlaybackControls(HP_ANIMATION_DURATION + ROUND_END_DELAY, token))) {
      return;
    }

    if (round.hpAfterTarget <= 0) {
      break;
    }
  }

  if (token !== state.runToken) {
    return;
  }

  state.activeActorId = "";
  state.screenState = "battle_finished";
  render();
}

async function loadBattleReplay() {
  const battleId = getBattleIdFromLocation();
  if (!battleId) {
    showError("Battle id missing", "This replay link is incomplete. Open the battle again from your dashboard.");
    return;
  }

  state.battleId = battleId;
  state.screenState = "loading";
  state.battle = null;
  render();

  try {
    const battle = await fetchBattleWithPolling();
    await preloadImages([battle.attacker?.imageUrl, battle.defender?.imageUrl]);
    resetPlaybackState(battle);
    render();
    await runBattlePlayback();
  } catch (error) {
    showError("Replay unavailable", error.message || "The battle replay could not be loaded.");
  }
}

function togglePause() {
  if (state.screenState !== "round_playback") return;

  state.isPaused = !state.isPaused;
  if (!state.isPaused) {
    flushPauseWaiters();
  }
  render();
}

function bindEvents() {
  retryBattleBtn.addEventListener("click", () => {
    loadBattleReplay();
  });

  pauseResumeBtn.addEventListener("click", () => {
    togglePause();
  });

  skipToResultBtn.addEventListener("click", () => {
    finishBattlePlayback();
  });
}

bindEvents();
loadBattleReplay();
