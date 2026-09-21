const {
  getSessionFromRequest,
  handleCors,
  isAdminSession,
  json,
  parseJsonBody,
} = require("../../api/_lib/auth");
const { listAllCharacters, updateWalletProfile } = require("../../api/_lib/store");
const { listBattleRecords } = require("../../api/_lib/battle-store");
const { buildProgressionAudit, sumAttributes } = require("../../api/_lib/progression-audit");

// Admin: find (GET) and undo (POST { "apply": true }) the attribute points the
// refund bug handed out before 2026-09-21. The report replays the snapshots in
// the battle records, so it names the exact attributes to take back rather than
// guessing from the totals.

function summarize(report) {
  return {
    checkedPets: report.checkedPets,
    checkedBattles: report.checkedBattles,
    affectedPets: report.affectedPets,
    affectedWallets: report.affectedWallets,
    extraPointsSpent: report.extraPointsSpent,
    extraPointsUnspent: report.extraPointsUnspent,
    unplaceablePoints: report.unplaceablePoints,
    applicable: report.applicable,
  };
}

function publicFinding(finding) {
  return {
    petId: finding.petId,
    wallet: finding.wallet,
    name: finding.name,
    rarity: finding.rarity,
    level: finding.level,
    battleSamples: finding.battleSamples,
    extraSpent: finding.extraSpent,
    extraUnspent: finding.extraUnspent,
    corrections: finding.corrections,
    attributesBefore: finding.attributesBefore,
    attributesAfter: finding.attributesAfter,
    availableBefore: finding.availableBefore,
    availableAfter: finding.availableAfter,
    unattributed: finding.unattributed,
    applicable: finding.invariantAfter.ok,
  };
}

async function loadReport() {
  const [characters, battles] = await Promise.all([listAllCharacters(), listBattleRecords()]);
  return buildProgressionAudit({ characters, battles });
}

// Applies one pet's correction, but only if the pet still looks exactly the way
// the report saw it — anything else means it moved since, and a blind write
// would take away points the player has meanwhile earned honestly.
async function applyFinding(finding) {
  let outcome = "skipped_changed";

  await updateWalletProfile(finding.wallet, (profile) => {
    const index = (profile.characters || []).findIndex((record) => record.id === finding.petId);
    if (index < 0) {
      outcome = "skipped_missing";
      return profile;
    }

    const record = profile.characters[index];
    const sameAttributes = sumAttributes(record.attributes) === sumAttributes(finding.attributesBefore);
    const sameAvailable =
      Math.max(0, Math.floor(Number(record.attributePointsAvailable) || 0)) === finding.availableBefore;

    if (!sameAttributes || !sameAvailable) {
      return profile;
    }

    // Only the attributes and the unspent points move. Level stays as it is —
    // it was earned with real XP, and it is the one progress trait published in
    // the capsule metadata (the four attributes are deliberately not there, see
    // buildBoundMetadata). If a future correction ever touches the level, this
    // write has to call refreshBoundCharacterMetadata for bound pets, otherwise
    // marketplaces keep showing the old number.
    profile.characters[index] = {
      ...record,
      attributes: { ...finding.attributesAfter },
      attributePointsAvailable: finding.availableAfter,
      updatedAt: new Date().toISOString(),
    };
    outcome = "applied";
    return profile;
  });

  return outcome;
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== "GET" && req.method !== "POST") {
    json(res, 405, { error: "Method not allowed." });
    return;
  }

  const session = getSessionFromRequest(req);
  if (!session) {
    json(res, 401, { error: "Unauthorized." });
    return;
  }
  if (!isAdminSession(session)) {
    json(res, 403, { error: "Forbidden." });
    return;
  }

  const report = await loadReport();

  if (req.method === "GET") {
    json(res, 200, {
      mode: "dry-run",
      ...summarize(report),
      findings: report.findings.map(publicFinding),
    });
    return;
  }

  const body = await parseJsonBody(req).catch(() => ({}));
  if (body?.apply !== true) {
    json(res, 400, { error: "Pass { \"apply\": true } to write the corrections." });
    return;
  }

  const results = { applied: 0, skipped: 0, failed: 0, pets: [] };
  for (const finding of report.findings) {
    if (!finding.invariantAfter.ok) {
      results.skipped += 1;
      results.pets.push({ petId: finding.petId, outcome: "skipped_invariant" });
      continue;
    }

    try {
      const outcome = await applyFinding(finding);
      if (outcome === "applied") results.applied += 1;
      else results.skipped += 1;
      results.pets.push({
        petId: finding.petId,
        wallet: finding.wallet,
        outcome,
        removedPoints: finding.extraSpent + finding.extraUnspent,
      });
    } catch (error) {
      results.failed += 1;
      results.pets.push({ petId: finding.petId, outcome: "failed", error: error.message });
    }
  }

  json(res, 200, { mode: "apply", ...summarize(report), ...results });
};
