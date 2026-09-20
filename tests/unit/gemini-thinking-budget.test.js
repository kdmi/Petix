const test = require("node:test");
const assert = require("node:assert/strict");

const ENV_KEYS = [
  "GEMINI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "GEMINI_NAME_THINKING_BUDGET",
  "GEMINI_NARRATION_THINKING_BUDGET",
  "GEMINI_POWERS_THINKING_BUDGET",
  "ENABLE_LIVE_CHARACTER_GENERATION",
  "DISABLE_BATTLE_AI",
  "NODE_ENV",
];

function freshModule(relativePath) {
  // resolveThinkingBudget warns once per process, so tests take a fresh copy.
  const modulePath = require.resolve(relativePath);
  delete require.cache[modulePath];
  delete require.cache[require.resolve("../../api/_lib/gemini-thinking")];
  return require(modulePath);
}

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, overrides);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of ENV_KEYS) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    });
}

function stubFetch(responseBody) {
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => responseBody };
  };
  return {
    seen,
    restore() {
      globalThis.fetch = original;
    },
  };
}

const LIVE_ENV = {
  ENABLE_LIVE_CHARACTER_GENERATION: "true",
  GEMINI_API_KEY: "test-key",
};

test("resolveThinkingBudget falls back, accepts 0 and keeps -1 as the dynamic switch", async () => {
  await withEnv({}, () => {
    const { resolveThinkingBudget } = freshModule("../../api/_lib/gemini-thinking");
    assert.equal(resolveThinkingBudget("GEMINI_NAME_THINKING_BUDGET", 256), 256);
  });

  for (const [value, expected] of [
    ["0", 0],
    ["512", 512],
    [" 128 ", 128],
    ["-1", -1],
  ]) {
    await withEnv({ GEMINI_NAME_THINKING_BUDGET: value }, () => {
      const { resolveThinkingBudget } = freshModule("../../api/_lib/gemini-thinking");
      assert.equal(
        resolveThinkingBudget("GEMINI_NAME_THINKING_BUDGET", 256),
        expected,
        `value ${JSON.stringify(value)}`
      );
    });
  }
});

test("resolveThinkingBudget rejects junk and out-of-range values with a single warning", async () => {
  for (const value of ["lots", "12.5", "-2", "999999"]) {
    await withEnv({ GEMINI_POWERS_THINKING_BUDGET: value }, () => {
      const { resolveThinkingBudget } = freshModule("../../api/_lib/gemini-thinking");
      const calls = [];
      const originalWarn = console.warn;
      console.warn = (...args) => calls.push(args.join(" "));
      try {
        assert.equal(resolveThinkingBudget("GEMINI_POWERS_THINKING_BUDGET", 256), 256);
        assert.equal(resolveThinkingBudget("GEMINI_POWERS_THINKING_BUDGET", 256), 256);
      } finally {
        console.warn = originalWarn;
      }
      assert.equal(calls.length, 1, `value ${JSON.stringify(value)} warns once`);
      assert.match(calls[0], /GEMINI_POWERS_THINKING_BUDGET/);
    });
  }
});

test("resolveMaxOutputTokens always leaves the answer room on top of the thoughts", () => {
  const {
    MAX_THINKING_BUDGET,
    resolveMaxOutputTokens,
  } = freshModule("../../api/_lib/gemini-thinking");

  assert.equal(resolveMaxOutputTokens(0, 128), 128);
  assert.equal(resolveMaxOutputTokens(256, 512), 768);
  // Dynamic thinking can spend up to the model ceiling, so the cap allows it.
  assert.equal(resolveMaxOutputTokens(-1, 512), MAX_THINKING_BUDGET + 512);
});

const TEXT_RESPONSE = {
  candidates: [{ content: { parts: [{ text: '{"powers":["a","b","c"]}' }] } }],
};

test("the name prompt runs without thinking and the powers prompt on a small budget", async () => {
  await withEnv(LIVE_ENV, async () => {
    const character = freshModule("../../api/_lib/character");
    const fetchStub = stubFetch(TEXT_RESPONSE);
    try {
      await character.requestGeminiText("name prompt", { thinkingBudget: 0, answerReserve: 128 });
      await character.requestGeminiText("powers prompt", {
        thinkingBudget: 256,
        answerReserve: 512,
      });

      assert.deepEqual(fetchStub.seen[0].body.generationConfig, {
        maxOutputTokens: 128,
        thinkingConfig: { thinkingBudget: 0 },
      });
      assert.deepEqual(fetchStub.seen[1].body.generationConfig, {
        maxOutputTokens: 768,
        thinkingConfig: { thinkingBudget: 256 },
      });
    } finally {
      fetchStub.restore();
    }
  });
});

test("character generation sends the default budgets and honours the env overrides", async () => {
  await withEnv(LIVE_ENV, async () => {
    const character = freshModule("../../api/_lib/character");
    const fetchStub = stubFetch(TEXT_RESPONSE);
    try {
      const context = { creatureType: "panda" };
      await character.generatePowerOptions("powers prompt", context);
      await character.generateCharacterName("name prompt", context);

      assert.equal(fetchStub.seen[0].body.generationConfig.thinkingConfig.thinkingBudget, 256);
      assert.equal(fetchStub.seen[1].body.generationConfig.thinkingConfig.thinkingBudget, 0);
    } finally {
      fetchStub.restore();
    }
  });

  await withEnv(
    {
      ...LIVE_ENV,
      GEMINI_POWERS_THINKING_BUDGET: "0",
      GEMINI_NAME_THINKING_BUDGET: "-1",
    },
    async () => {
      const character = freshModule("../../api/_lib/character");
      const fetchStub = stubFetch(TEXT_RESPONSE);
      try {
        const context = { creatureType: "panda" };
        await character.generatePowerOptions("powers prompt", context);
        await character.generateCharacterName("name prompt", context);

        assert.equal(fetchStub.seen[0].body.generationConfig.thinkingConfig.thinkingBudget, 0);
        assert.equal(fetchStub.seen[1].body.generationConfig.thinkingConfig.thinkingBudget, -1);
      } finally {
        fetchStub.restore();
      }
    }
  );
});

function buildBattle(roundCount) {
  const snapshot = (id, name) => ({
    id,
    name,
    rarity: "Legendary",
    element: "fire",
    selectedPower: { name: "Ember Slam", description: "Slams with a burning fist" },
  });

  return {
    attackerSnapshot: snapshot("A", "Molten Panda"),
    defenderSnapshot: snapshot("B", "Gamma Arbiter"),
    rounds: Array.from({ length: roundCount }, (_, index) => ({
      roundNumber: index + 1,
      actorPetId: index % 2 ? "B" : "A",
      targetPetId: index % 2 ? "A" : "B",
      turnType: "attack",
      hitResult: "hit",
      damage: 10,
      remainingHp: 100 - index * 10,
    })),
  };
}

test("battle narration caps its output by the length of the fight", async () => {
  await withEnv({ GEMINI_API_KEY: "test-key" }, async () => {
    const narration = freshModule("../../api/_lib/battle-narration");
    const fetchStub = stubFetch({
      candidates: [
        {
          content: {
            parts: [{ text: '{"rounds":[],"finalSummaryText":"done"}' }],
          },
        },
      ],
    });

    try {
      await narration.generateBattleNarration(buildBattle(10));
      await narration.generateBattleNarration(buildBattle(30));

      const first = fetchStub.seen[0].body.generationConfig;
      const second = fetchStub.seen[1].body.generationConfig;

      assert.equal(first.responseMimeType, "application/json");
      assert.deepEqual(first.thinkingConfig, { thinkingBudget: 512 });
      assert.equal(first.maxOutputTokens, 512 + 10 * 80 + 512);
      assert.equal(second.maxOutputTokens, 512 + 30 * 80 + 512);
    } finally {
      fetchStub.restore();
    }
  });
});

test("GEMINI_NARRATION_THINKING_BUDGET overrides the narration budget", async () => {
  await withEnv(
    { GEMINI_API_KEY: "test-key", GEMINI_NARRATION_THINKING_BUDGET: "0" },
    async () => {
      const narration = freshModule("../../api/_lib/battle-narration");
      const fetchStub = stubFetch({
        candidates: [
          { content: { parts: [{ text: '{"rounds":[],"finalSummaryText":"done"}' }] } },
        ],
      });

      try {
        await narration.generateBattleNarration(buildBattle(8));
        const { generationConfig } = fetchStub.seen[0].body;
        assert.deepEqual(generationConfig.thinkingConfig, { thinkingBudget: 0 });
        assert.equal(generationConfig.maxOutputTokens, 8 * 80 + 512);
      } finally {
        fetchStub.restore();
      }
    }
  );
});
