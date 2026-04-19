const PREFERRED_LEVEL_DISTANCE = 3;

function normalizeLevel(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 1;
  }

  return Math.max(1, Math.floor(numeric));
}

function resolveSelectedPower(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  if (record.selectedPower && typeof record.selectedPower === "object") {
    return record.selectedPower;
  }

  const powers = Array.isArray(record.powers) ? record.powers : [];
  return powers.find((power) => power?.id === record.selectedPowerId) || powers[0] || null;
}

function isCompletedBattlePet(record) {
  return Boolean(
    record &&
      record.status === "completed" &&
      record.id &&
      resolveSelectedPower(record)
  );
}

function compareCandidates(left, right) {
  const tierRank = {
    preferred: 0,
    fallback: 1,
  };

  const leftTier = tierRank[left?.matchTier] ?? 99;
  const rightTier = tierRank[right?.matchTier] ?? 99;
  if (leftTier !== rightTier) {
    return leftTier - rightTier;
  }

  if (left.levelDistance !== right.levelDistance) {
    return left.levelDistance - right.levelDistance;
  }

  if (left.level !== right.level) {
    return right.level - left.level;
  }

  const leftTime = Date.parse(left?.character?.completedAt || left?.character?.updatedAt || 0);
  const rightTime = Date.parse(right?.character?.completedAt || right?.character?.updatedAt || 0);
  if (leftTime !== rightTime) {
    return rightTime - leftTime;
  }

  return String(left?.character?.id || "").localeCompare(String(right?.character?.id || ""));
}

function annotateCandidate(attacker, entry) {
  if (!entry?.character || !isCompletedBattlePet(entry.character)) {
    return null;
  }

  if (entry.wallet === attacker.wallet) {
    return null;
  }

  if (entry.character.id === attacker.character.id) {
    return null;
  }

  const attackerLevel = normalizeLevel(attacker.character.level);
  const defenderLevel = normalizeLevel(entry.character.level);
  const levelDistance = Math.abs(defenderLevel - attackerLevel);

  if (levelDistance <= PREFERRED_LEVEL_DISTANCE) {
    return {
      ...entry,
      level: defenderLevel,
      levelDistance,
      matchTier: "preferred",
    };
  }

  if (defenderLevel < attackerLevel) {
    return {
      ...entry,
      level: defenderLevel,
      levelDistance,
      matchTier: "fallback",
    };
  }

  return null;
}

function buildMatchPools({ attacker, candidates = [] }) {
  const annotated = candidates
    .map((entry) => annotateCandidate(attacker, entry))
    .filter(Boolean)
    .sort(compareCandidates);

  const preferred = annotated.filter((entry) => entry.matchTier === "preferred");
  const fallback = annotated.filter((entry) => entry.matchTier === "fallback");

  return {
    preferred,
    fallback,
  };
}

function getPreviewOpponentCandidates({ attacker, candidates = [], limit = 10 }) {
  const pools = buildMatchPools({ attacker, candidates });
  const activePool = pools.preferred.length ? pools.preferred : pools.fallback;
  return activePool.slice(0, Math.max(1, Math.floor(limit)));
}

function buildRevealOpponentCandidates({
  attacker,
  candidates = [],
  selectedOpponent = null,
  limit = 10,
}) {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  const previewCandidates = getPreviewOpponentCandidates({
    attacker,
    candidates,
    limit: normalizedLimit,
  });
  const revealCandidates = [];
  const seen = new Set();

  [selectedOpponent, ...previewCandidates].forEach((entry) => {
    const candidateId = String(entry?.character?.id || "").trim();
    if (!candidateId || seen.has(candidateId)) {
      return;
    }

    seen.add(candidateId);
    revealCandidates.push(entry);
  });

  return revealCandidates.slice(0, normalizedLimit);
}

function pickRandomCandidate(list, randomIndex) {
  if (!Array.isArray(list) || !list.length) {
    return null;
  }

  const index =
    typeof randomIndex === "function"
      ? randomIndex(list.length)
      : Math.floor(Math.random() * list.length);

  return list[Math.max(0, Math.min(index, list.length - 1))];
}

function selectAuthoritativeOpponent({ attacker, candidates = [], randomIndex }) {
  const pools = buildMatchPools({ attacker, candidates });

  if (pools.preferred.length) {
    const selected = pickRandomCandidate(pools.preferred, randomIndex);
    return {
      opponent: selected,
      matchmaking: {
        preferredBandApplied: true,
        levelDistance: selected.levelDistance,
        selectionMode: "preferred_band",
      },
    };
  }

  if (pools.fallback.length) {
    const closestDistance = pools.fallback[0].levelDistance;
    const closestLowerPool = pools.fallback.filter(
      (entry) => entry.levelDistance === closestDistance
    );
    const selected = pickRandomCandidate(closestLowerPool, randomIndex);

    return {
      opponent: selected,
      matchmaking: {
        preferredBandApplied: false,
        levelDistance: selected.levelDistance,
        selectionMode: "closest_lower_fallback",
      },
    };
  }

  const error = new Error("No eligible opponent could be assembled.");
  error.code = "NO_ELIGIBLE_OPPONENT";
  throw error;
}

module.exports = {
  buildRevealOpponentCandidates,
  PREFERRED_LEVEL_DISTANCE,
  buildMatchPools,
  getPreviewOpponentCandidates,
  isCompletedBattlePet,
  normalizeLevel,
  resolveSelectedPower,
  selectAuthoritativeOpponent,
};
