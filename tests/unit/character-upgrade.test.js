const test = require("node:test");
const assert = require("node:assert/strict");

const {
  applyAttributeIncrements,
  getAttributeIncrementSpend,
  normalizeAttributeIncrements,
  validateAttributeIncrements,
} = require("../../api/_lib/character");
const {
  getLevelAwareUpgradeScaleBudget,
  getUpgradeCtaState,
} = require("../../pet-creation/upgrade-screen-state");

test("normalizeAttributeIncrements fills missing stat keys with zero", () => {
  assert.deepEqual(normalizeAttributeIncrements({ stamina: 2, intelligence: 1 }), {
    stamina: 2,
    agility: 0,
    strength: 0,
    intelligence: 1,
  });
});

test("validateAttributeIncrements accepts a positive partial spend within available points", () => {
  assert.equal(
    validateAttributeIncrements(
      {
        stamina: 1,
        strength: 2,
      },
      4
    ),
    true
  );
  assert.equal(
    getAttributeIncrementSpend({
      stamina: 1,
      strength: 2,
    }),
    3
  );
});

test("validateAttributeIncrements rejects overspend, empty payloads, and unknown stats", () => {
  assert.equal(validateAttributeIncrements({}, 3), false);
  assert.equal(validateAttributeIncrements({ stamina: 0 }, 3), false);
  assert.equal(validateAttributeIncrements({ stamina: -1 }, 3), false);
  assert.equal(validateAttributeIncrements({ stamina: 4 }, 3), false);
  assert.equal(validateAttributeIncrements({ luck: 1 }, 3), false);
});

test("applyAttributeIncrements adds staged values onto the saved pet attributes", () => {
  const nextAttributes = applyAttributeIncrements(
    {
      stamina: 4,
      agility: 3,
      strength: 5,
      intelligence: 2,
    },
    {
      agility: 2,
      intelligence: 1,
    }
  );

  assert.deepEqual(nextAttributes, {
    stamina: 4,
    agility: 5,
    strength: 5,
    intelligence: 3,
  });
});

test("getLevelAwareUpgradeScaleBudget keeps a 15-segment minimum and grows with level", () => {
  const levelOneBudget = getLevelAwareUpgradeScaleBudget({
    availablePoints: 0,
    attributes: {
      stamina: 4,
      agility: 4,
      strength: 4,
      intelligence: 4,
    },
    level: 1,
    stagedIncrements: {},
  });
  const levelEightBudget = getLevelAwareUpgradeScaleBudget({
    availablePoints: 0,
    attributes: {
      stamina: 4,
      agility: 4,
      strength: 4,
      intelligence: 4,
    },
    level: 8,
    stagedIncrements: {},
  });

  assert.equal(levelOneBudget, 15);
  assert.equal(levelEightBudget, 22);
});

test("getLevelAwareUpgradeScaleBudget still covers visible staged totals for higher-value pets", () => {
  const budget = getLevelAwareUpgradeScaleBudget({
    availablePoints: 3,
    attributes: {
      stamina: 12,
      agility: 8,
      strength: 9,
      intelligence: 7,
    },
    level: 3,
    stagedIncrements: {
      strength: 2,
      intelligence: 1,
    },
  });

  assert.equal(budget, 17);
});

test("getUpgradeCtaState exposes mobile points-left copy until the final point is spent", () => {
  assert.deepEqual(
    getUpgradeCtaState({
      availablePoints: 3,
      isMobileUpgradeViewport: true,
      remainingPoints: 2,
    }),
    {
      label: "Points left: 2",
      ready: false,
    }
  );

  assert.deepEqual(
    getUpgradeCtaState({
      availablePoints: 3,
      isMobileUpgradeViewport: true,
      remainingPoints: 0,
    }),
    {
      label: "Save",
      ready: true,
    }
  );
});

test("getUpgradeCtaState preserves saving and desktop upgrade labels", () => {
  assert.deepEqual(
    getUpgradeCtaState({
      availablePoints: 3,
      isMobileUpgradeViewport: true,
      isSaving: true,
      remainingPoints: 0,
    }),
    {
      label: "Saving...",
      ready: false,
    }
  );

  assert.deepEqual(
    getUpgradeCtaState({
      availablePoints: 3,
      isMobileUpgradeViewport: false,
      remainingPoints: 1,
    }),
    {
      label: "Save Upgrade",
      ready: true,
    }
  );
});
