const test = require("node:test");
const assert = require("node:assert/strict");

const ENV_KEYS = [
  "GEMINI_IMAGE_SIZE",
  "GEMINI_IMAGE_MODEL",
  "GEMINI_API_KEY",
  "GOOGLE_AI_API_KEY",
  "ENABLE_LIVE_CHARACTER_GENERATION",
  "NODE_ENV",
];

function freshCharacterModule() {
  // The module caches the "warned once" flag, so every test gets a fresh copy.
  const modulePath = require.resolve("../../api/_lib/character");
  delete require.cache[modulePath];
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

function captureWarn(fn) {
  const calls = [];
  const original = console.warn;
  console.warn = (...args) => calls.push(args.join(" "));
  return Promise.resolve()
    .then(fn)
    .then((result) => ({ result, calls }))
    .finally(() => {
      console.warn = original;
    });
}

test("resolveGeminiImageSize defaults to 512 when the env is empty", async () => {
  await withEnv({}, () => {
    const { resolveGeminiImageSize } = freshCharacterModule();
    assert.equal(resolveGeminiImageSize(), "512");
  });
});

test("resolveGeminiImageSize normalizes the 1K spellings", async () => {
  for (const value of ["1K", "1k", "1024", " 1K "]) {
    await withEnv({ GEMINI_IMAGE_SIZE: value }, () => {
      const { resolveGeminiImageSize } = freshCharacterModule();
      assert.equal(resolveGeminiImageSize(), "1K", `value ${JSON.stringify(value)}`);
    });
  }
});

test("resolveGeminiImageSize normalizes the 512 spellings", async () => {
  for (const value of ["512", "512px", "0.5K", "0.5k"]) {
    await withEnv({ GEMINI_IMAGE_SIZE: value }, () => {
      const { resolveGeminiImageSize } = freshCharacterModule();
      assert.equal(resolveGeminiImageSize(), "512", `value ${JSON.stringify(value)}`);
    });
  }
});

test("resolveGeminiImageSize falls back to 512 and warns once for unsupported values", async () => {
  await withEnv({ GEMINI_IMAGE_SIZE: "2K" }, async () => {
    const { resolveGeminiImageSize } = freshCharacterModule();
    const { calls } = await captureWarn(() => {
      assert.equal(resolveGeminiImageSize(), "512");
      assert.equal(resolveGeminiImageSize(), "512");
      assert.equal(resolveGeminiImageSize(), "512");
    });
    assert.equal(calls.length, 1, "warns exactly once per process");
    assert.match(calls[0], /GEMINI_IMAGE_SIZE="2K"/);
    assert.match(calls[0], /512/);
  });
});

function stubFetch(responseBody) {
  const seen = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push({ url: String(url), body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      json: async () => responseBody,
    };
  };
  return {
    seen,
    restore() {
      globalThis.fetch = original;
    },
  };
}

const IMAGE_RESPONSE = {
  candidates: [
    {
      content: {
        parts: [{ text: "ok" }, { inlineData: { mimeType: "image/jpeg", data: "QUJD" } }],
      },
    },
  ],
};

const LIVE_ENV = {
  ENABLE_LIVE_CHARACTER_GENERATION: "true",
  GEMINI_API_KEY: "test-key",
};

test("requestGeminiImage targets the stable model id and asks for a 512 square by default", async () => {
  await withEnv(LIVE_ENV, async () => {
    const { requestGeminiImage } = freshCharacterModule();
    const fetchStub = stubFetch(IMAGE_RESPONSE);
    try {
      const reference = { mimeType: "image/png", base64: "UkVG" };
      const image = await requestGeminiImage("draw a cube", reference);

      assert.deepEqual(image, { base64: "QUJD", mimeType: "image/jpeg" });
      assert.equal(fetchStub.seen.length, 1);

      const { url, body } = fetchStub.seen[0];
      assert.match(url, /\/models\/gemini-3\.1-flash-image:generateContent\?/);
      assert.doesNotMatch(url, /preview/);

      assert.deepEqual(body.generationConfig.responseModalities, ["TEXT", "IMAGE"]);
      assert.deepEqual(body.generationConfig.imageConfig, { aspectRatio: "1:1", imageSize: "512" });

      const parts = body.contents[0].parts;
      assert.deepEqual(parts[0], { inlineData: { mimeType: "image/png", data: "UkVG" } });
      assert.deepEqual(parts[parts.length - 1], { text: "draw a cube" });
    } finally {
      fetchStub.restore();
    }
  });
});

test("requestGeminiImage honours GEMINI_IMAGE_SIZE=1K and GEMINI_IMAGE_MODEL overrides", async () => {
  await withEnv(
    { ...LIVE_ENV, GEMINI_IMAGE_SIZE: "1K", GEMINI_IMAGE_MODEL: "custom-image-model" },
    async () => {
      const { requestGeminiImage } = freshCharacterModule();
      const fetchStub = stubFetch(IMAGE_RESPONSE);
      try {
        await requestGeminiImage("draw a cube", null);
        const { url, body } = fetchStub.seen[0];
        assert.match(url, /\/models\/custom-image-model:generateContent\?/);
        assert.equal(body.generationConfig.imageConfig.imageSize, "1K");
        assert.equal(body.generationConfig.imageConfig.aspectRatio, "1:1");
        // Without a reference image the prompt is the only part.
        assert.deepEqual(body.contents[0].parts, [{ text: "draw a cube" }]);
      } finally {
        fetchStub.restore();
      }
    }
  );
});

test("requestGeminiImage returns null when the response carries no image", async () => {
  await withEnv(LIVE_ENV, async () => {
    const { requestGeminiImage } = freshCharacterModule();
    const fetchStub = stubFetch({ candidates: [{ content: { parts: [{ text: "no image" }] } }] });
    try {
      assert.equal(await requestGeminiImage("draw a cube", null), null);
    } finally {
      fetchStub.restore();
    }
  });
});
