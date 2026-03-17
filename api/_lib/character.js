const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const TOTAL_ATTRIBUTE_POINTS = 15;
const POWER_MAX_LENGTH = 60;
const NAME_MAX_LENGTH = 20;
const ATTRIBUTE_KEYS = ["stamina", "agility", "strength", "intelligence"];
const DEFAULT_RARITY_LABEL = "Legendary";
const RARITY_CONFIG = {
  Common: { label: "Common", attributePoints: 10 },
  Rare: { label: "Rare", attributePoints: 12 },
  Epic: { label: "Epic", attributePoints: 13 },
  Legendary: { label: "Legendary", attributePoints: 15 },
};
const VARIABLE_HEADERS = [
  "ELEMENT",
  "PROFESSION_STYLE",
  "TOP_ITEM",
  "ELEMENT_EFFECTS",
  "BODY_COLOR",
  "FACIAL_FEATURES",
  "SIDE_DETAILS",
];
const MIN_ACTIVE_VARIABLE_COUNT = 2;
const MAX_ACTIVE_VARIABLE_COUNT = 6;
const FALLBACK_VARIABLES_CSV_PATH = path.join(
  process.cwd(),
  "api",
  "_data",
  "character-variables.csv"
);
const FALLBACK_RARITY_CHANCES_CSV_PATH = path.join(
  process.cwd(),
  "api",
  "_data",
  "rarity-chances.csv"
);
const IMAGE_GENERATION_ERROR_MESSAGE =
  "Character image generation failed. Please restart the creation.";
const SHEET_FETCH_TIMEOUT_MS = 6000;
const GEMINI_TEXT_TIMEOUT_MS = 20000;
const GEMINI_IMAGE_TIMEOUT_MS = 45000;
const LEVEL_UP_EXPERIENCE = 500;
const LOCAL_FALLBACK_IMAGE_PATH = path.join(
  process.cwd(),
  "assets",
  "character",
  "current-pet.jpg"
);

const IMAGE_PROMPT_TEMPLATE = [
  "Perfectly square 1:1 image canvas. Focused tight medium shot centered on the main body, which occupies a significant portion (around 70%) of the frame. Clean, minimal padding around the creature to ensure that accessories, hats, or effects are contained and not cropped by the edges.",
  "",
  "High-quality stylized hand-painted 3D game asset illustration of a cute creature, isolated on a very light, soft pastel mono-color background that complements the overall palette. The aesthetic is that of a collectible toy with clean lines, soft gradients, and hand-drawn details.",
  "",
  "The main body is a simple, rounded cube with absolutely no legs, lower appendages, or distinct feet, presenting a pure cubic form featuring a [CREATURE_TYPE] design.",
  "",
  "[IF ELEMENT]The creature is themed after [ELEMENT].[/IF]",
  "[IF PROFESSION_STYLE]The creature is dressed in the style of [PROFESSION_STYLE].[/IF]",
  "[IF BODY_COLOR]Its body color and material treatment should clearly reflect [BODY_COLOR].[/IF]",
  "[IF TOP_ITEM]On its top, it has [TOP_ITEM].[/IF]",
  "[IF ELEMENT_EFFECTS]It is surrounded by stylized [ELEMENT_EFFECTS].[/IF]",
  "[IF FACIAL_FEATURES]Its face includes [FACIAL_FEATURES].[/IF]",
  "[IF SIDE_DETAILS]Additional visible detail: [SIDE_DETAILS].[/IF]",
  "",
  "Use a cohesive color palette and keep the design readable, charming, and not overloaded with too many details.",
  "",
  "The camera is at a moderate front-above angle (a gentle 3/4 front view), displaying the creature's full face and a portion of the top.",
  "IMPORTANT ORIENTATION RULE: the creature must face LEFT from the viewer's perspective.",
  "The final image must be clearly left-facing.",
  "The creature's face, muzzle, eyes, and body angle must point to the LEFT.",
  "Do not show the creature facing right, turning right, angled right, mirrored, flipped, or in a right-facing 3/4 view.",
  "If there is any ambiguity, choose a clearly LEFT-facing pose.",
  "LEFT-facing orientation is mandatory and higher priority than stylistic interpretation.",
  "",
  "The main cubic body maintains a consistent larger size relative to the canvas.",
  "",
  "FINAL DIRECTION REQUIREMENT: the character is facing LEFT. The face points LEFT. The body points LEFT. Never face RIGHT.",
].join("\n");

const POWERS_PROMPT_TEMPLATE = [
  "You create combat superpowers for a turn-based battle game.",
  "Return valid JSON only.",
  'Use this exact schema: {"powers":["string","string","string"]}',
  "Rules:",
  "- exactly 3 different powers",
  "- every power must fit on one line and be 60 characters or fewer",
  "- no numbering, no markdown, no extra keys, no explanations",
  "- each string must be a plain superpower description only",
  "- every power must be an attacking superpower used to damage, strike, blast, stab, slam, burn, shock, crush, or otherwise hit an enemy",
  "- do not generate defense, shielding, healing, buffing, reviving, blocking, dodging, protecting, or support abilities",
  "- every power should read like a direct offensive action during an attack turn",
  "- do not use a title, label, colon, dash, or title + description format",
  "- if a line is too long, rewrite it shorter instead of truncating",
  "- make powers practical for fighting and visually tied to the character",
  "",
  "Character profile:",
  "- Creature type: [CREATURE_TYPE]",
  "[IF ELEMENT]- Element: [ELEMENT][/IF]",
  "[IF PROFESSION_STYLE]- Profession style: [PROFESSION_STYLE][/IF]",
  "[IF TOP_ITEM]- Top item: [TOP_ITEM][/IF]",
  "[IF ELEMENT_EFFECTS]- Element effects: [ELEMENT_EFFECTS][/IF]",
  "[IF BODY_COLOR]- Body color: [BODY_COLOR][/IF]",
  "[IF FACIAL_FEATURES]- Facial features: [FACIAL_FEATURES][/IF]",
  "[IF SIDE_DETAILS]- Side details: [SIDE_DETAILS][/IF]",
].join("\n");

const NAME_PROMPT_TEMPLATE = [
  "You create original character names for a game.",
  "Return only the final name as plain text.",
  "Rules:",
  "- exactly 2 words",
  "- total length must be 20 characters or fewer, including the space",
  "- no quotes, no markdown, no numbering, no explanation",
  "- make it fun, original, and fitting for the character design",
  "- if your first idea is longer than 20 characters, rewrite it shorter",
  "",
  "Character profile:",
  "My creature is [CREATURE_TYPE].",
  "[IF ELEMENT]The creature is themed after the [ELEMENT] element.[/IF]",
  "[IF PROFESSION_STYLE]The creature is dressed in the style of a [PROFESSION_STYLE].[/IF]",
  "[IF BODY_COLOR]Its body color and material treatment reflect [BODY_COLOR].[/IF]",
  "[IF TOP_ITEM]On its top, it has [TOP_ITEM].[/IF]",
  "[IF ELEMENT_EFFECTS]It has stylized [ELEMENT_EFFECTS].[/IF]",
  "[IF FACIAL_FEATURES]It has integrated [FACIAL_FEATURES].[/IF]",
  "[IF SIDE_DETAILS]It also features [SIDE_DETAILS].[/IF]",
].join("\n");

let variablesCache = null;
let rarityChancesCache = null;
let rarityChancesCacheExpiresAt = 0;

function pickRandom(list) {
  return list[crypto.randomInt(0, list.length)];
}

function createCharacterId() {
  return `char_${crypto.randomUUID()}`;
}

function normalizeCreatureType(input) {
  const creatureType = String(input || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);

  if (!creatureType) {
    throw new Error("Creature type is required.");
  }

  return creatureType;
}

function fillTemplate(template, values) {
  const conditionalRendered = template.replace(
    /\[IF ([A-Z_]+)\]([\s\S]*?)\[\/IF\]/g,
    (_, key, block) => {
      const value = String(values[key] || "").trim();
      return value ? block : "";
    }
  );

  return conditionalRendered
    .replace(/\[([A-Z_]+)\]/g, (_, key) => String(values[key] || "").trim())
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function shouldUseLiveCharacterGeneration() {
  if (process.env.NODE_ENV === "production") {
    return true;
  }

  const override = String(process.env.ENABLE_LIVE_CHARACTER_GENERATION || "")
    .trim()
    .toLowerCase();

  if (override === "false") {
    return false;
  }

  if (override === "true") {
    return true;
  }

  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY);
}

async function fetchWithTimeout(url, options, timeoutMs, label) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`${label} timed out after ${timeoutMs}ms.`));
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${label} timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function createPromptContext(creatureType, variables) {
  return {
    CREATURE_TYPE: creatureType,
    ...variables,
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const current = text[index];
    const next = text[index + 1];

    if (current === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && current === ",") {
      row.push(value);
      value = "";
      continue;
    }

    if (!inQuotes && (current === "\n" || current === "\r")) {
      if (current === "\r" && next === "\n") {
        index += 1;
      }
      row.push(value);
      if (row.some((cell) => cell !== "")) {
        rows.push(row);
      }
      row = [];
      value = "";
      continue;
    }

    value += current;
  }

  if (value !== "" || row.length > 0) {
    row.push(value);
    if (row.some((cell) => cell !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .replace(/^\[|\]$/g, "");
}

function normalizeRarityLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();

  if (normalized === "legendary") return "Legendary";
  if (normalized === "epic" || normalized === "epix") return "Epic";
  if (normalized === "rare") return "Rare";
  if (normalized === "common") return "Common";
  return "";
}

function getRarityConfig(label) {
  return RARITY_CONFIG[normalizeRarityLabel(label)] || RARITY_CONFIG[DEFAULT_RARITY_LABEL];
}

function parseChanceWeight(value) {
  const numeric = Number.parseFloat(String(value || "").replace("%", "").trim());
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

function buildVariablesTable(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    throw new Error("Variables sheet is empty.");
  }

  const headers = rows[0].map(normalizeHeader);
  const columns = {};

  VARIABLE_HEADERS.forEach((header) => {
    columns[header] = [];
  });

  rows.slice(1).forEach((row) => {
    headers.forEach((header, columnIndex) => {
      if (!VARIABLE_HEADERS.includes(header)) return;
      const value = String(row[columnIndex] || "").trim();
      if (value) {
        columns[header].push(value);
      }
    });
  });

  const missing = VARIABLE_HEADERS.filter((header) => !columns[header].length);
  if (missing.length) {
    throw new Error(`Variables sheet is missing data for: ${missing.join(", ")}`);
  }

  return columns;
}

function buildRarityChancesTable(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) {
    throw new Error("Rarity chances sheet is empty.");
  }

  const weights = rows
    .map((row) => {
      const label = normalizeRarityLabel(row[0]);
      const weight = parseChanceWeight(row[1]);
      if (!label || !weight) {
        return null;
      }

      return {
        label,
        weight,
      };
    })
    .filter(Boolean);

  const missing = Object.keys(RARITY_CONFIG).filter(
    (label) => !weights.some((entry) => entry.label === label)
  );

  if (missing.length) {
    throw new Error(`Rarity chances sheet is missing data for: ${missing.join(", ")}`);
  }

  return weights;
}

async function loadFallbackVariablesTable() {
  const csvText = await fs.readFile(FALLBACK_VARIABLES_CSV_PATH, "utf8");
  return buildVariablesTable(csvText);
}

async function loadFallbackRarityChancesTable() {
  const csvText = await fs.readFile(FALLBACK_RARITY_CHANCES_CSV_PATH, "utf8");
  return buildRarityChancesTable(csvText);
}

async function loadVariablesTable() {
  if (variablesCache) {
    return variablesCache;
  }

  variablesCache = await loadFallbackVariablesTable();
  return variablesCache;
}

async function loadRarityChancesTable() {
  const now = Date.now();
  if (rarityChancesCache && rarityChancesCacheExpiresAt > now) {
    return rarityChancesCache;
  }

  rarityChancesCache = await loadFallbackRarityChancesTable();
  rarityChancesCacheExpiresAt = now + 5 * 60 * 1000;
  return rarityChancesCache;
}

function pickVariables(table) {
  const maxActiveCount = Math.min(MAX_ACTIVE_VARIABLE_COUNT, VARIABLE_HEADERS.length);
  const minActiveCount = Math.min(MIN_ACTIVE_VARIABLE_COUNT, maxActiveCount);
  const activeCount = crypto.randomInt(minActiveCount, maxActiveCount + 1);
  const shuffledHeaders = [...VARIABLE_HEADERS];

  for (let index = shuffledHeaders.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [shuffledHeaders[index], shuffledHeaders[swapIndex]] = [
      shuffledHeaders[swapIndex],
      shuffledHeaders[index],
    ];
  }

  const activeHeaders = new Set(shuffledHeaders.slice(0, activeCount));

  return VARIABLE_HEADERS.reduce((acc, header) => {
    acc[header] = activeHeaders.has(header) ? pickRandom(table[header]) : "";
    return acc;
  }, {});
}

function pickRarity(chancesTable) {
  const totalWeight = chancesTable.reduce((sum, entry) => sum + entry.weight, 0);
  if (!totalWeight) {
    return getRarityConfig(DEFAULT_RARITY_LABEL);
  }

  let roll = Math.random() * totalWeight;
  for (const entry of chancesTable) {
    roll -= entry.weight;
    if (roll <= 0) {
      return getRarityConfig(entry.label);
    }
  }

  return getRarityConfig(chancesTable[chancesTable.length - 1]?.label);
}

function normalizePowerLine(text) {
  let normalized = String(text || "")
    .replace(/\s+/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim();

  if (!normalized) {
    return "";
  }

  const colonIndex = normalized.indexOf(":");
  if (colonIndex > 0) {
    const afterColon = normalized.slice(colonIndex + 1).trim();
    if (afterColon && afterColon.length <= POWER_MAX_LENGTH) {
      normalized = afterColon;
    }
  }

  return normalized;
}

function isValidPowerLine(text) {
  if (!text || text.length > POWER_MAX_LENGTH) {
    return false;
  }

  return !/^.+\s[-:]\s.+$/.test(text);
}

function toTitleCaseWord(word) {
  const normalized = String(word || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, "");

  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeName(text) {
  let raw = String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/["'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return "";

  const colonIndex = raw.indexOf(":");
  if (colonIndex > 0) {
    const afterColon = raw.slice(colonIndex + 1).trim();
    if (afterColon) {
      raw = afterColon;
    }
  }

  const tokens = raw
    .split(" ")
    .map(toTitleCaseWord)
    .filter(Boolean);

  if (tokens.length < 2) {
    return "";
  }

  return `${tokens[0]} ${tokens[1]}`.trim();
}

function isValidName(name) {
  if (!name || name.length > NAME_MAX_LENGTH) {
    return false;
  }

  const parts = name.split(" ").filter(Boolean);
  return parts.length === 2;
}

function buildFallbackName(context) {
  const elementToken = toTitleCaseWord(String(context.ELEMENT || "").split(/[\s&/-]+/)[0]);
  const typeToken = toTitleCaseWord(String(context.CREATURE_TYPE || "").split(/[\s&/-]+/)[0]);
  const professionToken = toTitleCaseWord(String(context.PROFESSION_STYLE || "").split(/[\s&/-]+/)[0]);
  const topItemToken = toTitleCaseWord(String(context.TOP_ITEM || "").split(/[\s&/-]+/)[0]);

  const candidates = [
    `${elementToken} ${typeToken}`.trim(),
    `${professionToken} ${typeToken}`.trim(),
    `${topItemToken} ${typeToken}`.trim(),
    "Nova Cub",
    "Rune Puff",
    "Blip Spark",
  ];

  for (const candidate of candidates) {
    const normalized = normalizeName(candidate);
    if (isValidName(normalized)) {
      return normalized;
    }
  }

  return "Nova Cub";
}

function buildFallbackPowerLines(context) {
  const lines = [
    `Unleashes a ${context.ELEMENT.toLowerCase()} blast on one target`,
    `${context.TOP_ITEM.toLowerCase()} smashes into the nearest enemy`,
    `${context.ELEMENT_EFFECTS} explode across nearby enemies`,
    `${context.SIDE_DETAILS} crashes through the front line`,
    `${context.FACIAL_FEATURES} unleash a vicious strike`,
  ];
  const reserveLines = [
    "Lunges forward with a heavy finishing blow",
    "Stuns the nearest enemy with one quick strike",
    "Slams the ground to damage enemies ahead",
  ];

  const unique = [];
  for (const line of lines) {
    const next = normalizePowerLine(line);
    if (isValidPowerLine(next) && !unique.includes(next)) {
      unique.push(next);
    }
    if (unique.length === 3) break;
  }

  for (const line of reserveLines) {
    if (!unique.includes(line)) {
      unique.push(line);
    }
    if (unique.length === 3) break;
  }

  return unique;
}

function parsePowerLinesFromText(text, context) {
  const raw = String(text || "").trim();
  if (!raw) {
    return buildFallbackPowerLines(context);
  }

  const candidates = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.powers)) {
      parsed.powers.forEach((power) => {
        if (typeof power === "string") {
          candidates.push(power);
        }
      });
    }
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed?.powers)) {
          parsed.powers.forEach((power) => {
            if (typeof power === "string") {
              candidates.push(power);
            }
          });
        }
      } catch {
        // Ignore and fall back to line parsing below.
      }
    }
  }

  if (!candidates.length) {
    raw
      .split(/\r?\n/)
      .map((line) => line.replace(/^[\s\-*0-9.)]+/, "").trim())
      .filter(Boolean)
      .forEach((line) => candidates.push(line));
  }

  const unique = [];
  for (const line of candidates) {
    const next = normalizePowerLine(line);
    if (isValidPowerLine(next) && !unique.includes(next)) {
      unique.push(next);
    }
    if (unique.length === 3) break;
  }

  if (unique.length < 3) {
    return buildFallbackPowerLines(context);
  }

  return unique;
}

function mapPowerLinesToOptions(powerLines) {
  return powerLines.slice(0, 3).map((line, index) => ({
    id: `power-${index + 1}`,
    title: line,
    description: line,
  }));
}

function parseNameFromText(text, context) {
  const raw = String(text || "").trim();
  if (!raw) {
    return buildFallbackName(context);
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const normalized = normalizeName(line);
    if (isValidName(normalized)) {
      return normalized;
    }
  }

  return buildFallbackName(context);
}

async function requestGeminiText(prompt) {
  if (!shouldUseLiveCharacterGeneration()) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    },
    GEMINI_TEXT_TIMEOUT_MS,
    "Gemini text request"
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini text request failed with ${response.status}.`);
  }

  const text = (payload?.candidates || [])
    .flatMap((candidate) => candidate?.content?.parts || [])
    .map((part) => part?.text || "")
    .join("\n")
    .trim();

  return text || null;
}

function getImageExtension(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/jpeg") return "jpg";
  return "png";
}

async function requestGeminiImage(prompt) {
  if (!shouldUseLiveCharacterGeneration()) {
    return null;
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image-preview";
  const response = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    },
    GEMINI_IMAGE_TIMEOUT_MS,
    "Gemini image request"
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `Gemini image request failed with ${response.status}.`
    );
  }

  for (const candidate of payload?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      if (part?.inlineData?.data) {
        return {
          base64: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "image/png",
        };
      }
    }
  }

  return null;
}

async function generateCharacterImage(prompt, characterId, imageStore) {
  if (!shouldUseLiveCharacterGeneration()) {
    const storedImage = await imageStore.copyFallbackImage(characterId, LOCAL_FALLBACK_IMAGE_PATH);
    return {
      provider: "mock",
      prompt,
      mimeType: "image/jpeg",
      ...storedImage,
      generatedAt: new Date().toISOString(),
    };
  }

  try {
    const image = await requestGeminiImage(prompt);
    if (!image?.base64) {
      console.warn("[character:image]", "Gemini image response did not include inline image data.");
      throw new Error(IMAGE_GENERATION_ERROR_MESSAGE);
    }

    const extension = getImageExtension(image.mimeType);
    const buffer = Buffer.from(image.base64, "base64");
    const storedImage = await imageStore.writeImageBuffer(
      characterId,
      extension,
      buffer,
      image.mimeType
    );

    return {
      provider: "gemini",
      prompt,
      mimeType: image.mimeType,
      ...storedImage,
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    console.warn("[character:image]", error.message);
    throw new Error(IMAGE_GENERATION_ERROR_MESSAGE);
  }
}

async function generatePowerOptions(prompt, context) {
  try {
    const text = await requestGeminiText(prompt);
    const lines = parsePowerLinesFromText(text, context);
    return {
      provider: text ? "gemini" : "fallback",
      prompt,
      options: mapPowerLinesToOptions(lines),
    };
  } catch (error) {
    console.warn("[character:powers]", error.message);
    return {
      provider: "fallback",
      prompt,
      options: mapPowerLinesToOptions(buildFallbackPowerLines(context)),
      error: error.message,
    };
  }
}

async function generateCharacterName(prompt, context) {
  try {
    const text = await requestGeminiText(prompt);
    const name = parseNameFromText(text, context);
    return {
      provider: text ? "gemini" : "fallback",
      prompt,
      name,
    };
  } catch (error) {
    console.warn("[character:name]", error.message);
    return {
      provider: "fallback",
      prompt,
      name: buildFallbackName(context),
      error: error.message,
    };
  }
}

async function buildCharacterDraft(creatureTypeInput, imageStore) {
  const creatureType = normalizeCreatureType(creatureTypeInput);
  const [variablesTable, rarityChancesTable] = await Promise.all([
    loadVariablesTable(),
    loadRarityChancesTable(),
  ]);
  const variables = pickVariables(variablesTable);
  const rarity = pickRarity(rarityChancesTable);
  const context = createPromptContext(creatureType, variables);
  const characterId = createCharacterId();
  const imagePrompt = fillTemplate(IMAGE_PROMPT_TEMPLATE, context);
  const powerPrompt = fillTemplate(POWERS_PROMPT_TEMPLATE, context);
  const namePrompt = fillTemplate(NAME_PROMPT_TEMPLATE, context);

  const [image, powerGeneration, nameGeneration] = await Promise.all([
    generateCharacterImage(imagePrompt, characterId, imageStore),
    generatePowerOptions(powerPrompt, context),
    generateCharacterName(namePrompt, context),
  ]);

  return {
    id: characterId,
    status: "draft",
    creatureType,
    name: nameGeneration.name,
    displayName: nameGeneration.name,
    rarity: rarity.label,
    attributePoints: rarity.attributePoints,
    variables,
    prompts: {
      image: imagePrompt,
      powers: powerPrompt,
      name: namePrompt,
    },
    generation: {
      nameProvider: nameGeneration.provider,
      powersProvider: powerGeneration.provider,
      imageProvider: image.provider,
      nameError: nameGeneration.error || null,
      imageError: image.error || null,
      powersError: powerGeneration.error || null,
    },
    image,
    powers: powerGeneration.options,
    selectedPowerId: "",
    attributes: {
      stamina: 0,
      agility: 0,
      strength: 0,
      intelligence: 0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draftExpiresAt: new Date(Date.now() + DRAFT_TTL_MS).toISOString(),
  };
}

function normalizeAttributes(stats) {
  return ATTRIBUTE_KEYS.reduce((acc, key) => {
    acc[key] = Number(stats?.[key] ?? 0);
    return acc;
  }, {});
}

function normalizeCharacterProgress(record) {
  return {
    level: Math.max(1, Math.floor(Number(record?.level) || 1)),
    experience: Math.max(0, Math.floor(Number(record?.experience) || 0)),
    softCurrency: Math.max(0, Math.floor(Number(record?.softCurrency) || 0)),
    attributePointsAvailable: Math.max(0, Math.floor(Number(record?.attributePointsAvailable) || 0)),
  };
}

function getAttributePointBudget(record) {
  const explicitBudget = Number(record?.attributePoints);
  if (Number.isInteger(explicitBudget) && explicitBudget > 0) {
    return explicitBudget;
  }

  return getRarityConfig(record?.rarity).attributePoints;
}

function validateSkillAllocation(stats, expectedTotal = TOTAL_ATTRIBUTE_POINTS) {
  const normalized = normalizeAttributes(stats);
  const sum = ATTRIBUTE_KEYS.reduce((total, key) => total + normalized[key], 0);

  const isValid = ATTRIBUTE_KEYS.every((key) => Number.isInteger(normalized[key]) && normalized[key] >= 0);
  return isValid && sum === expectedTotal;
}

function serializeCharacterRecord(record) {
  if (!record) return null;

  const rarity = getRarityConfig(record.rarity);
  const powers = Array.isArray(record.powers) ? record.powers : [];
  const selectedPower = powers.find((power) => power.id === record.selectedPowerId) || null;
  const progress = normalizeCharacterProgress(record);
  const version = encodeURIComponent(record.updatedAt || record.createdAt || Date.now());
  const characterId = encodeURIComponent(record.id);
  const imageUrl = record.image?.url || `/api/character/image?id=${characterId}&v=${version}`;

  return {
    id: record.id,
    status: record.status,
    creatureType: record.creatureType,
    name: record.name || record.displayName || record.creatureType,
    displayName: record.displayName || record.name || record.creatureType,
    rarity: rarity.label,
    level: progress.level,
    experience: progress.experience,
    experienceForNextLevel: LEVEL_UP_EXPERIENCE,
    softCurrency: progress.softCurrency,
    attributePointsAvailable: progress.attributePointsAvailable,
    attributePoints: getAttributePointBudget(record),
    variables: record.variables,
    prompts: record.prompts,
    generation: record.generation,
    imageUrl,
    imageProvider: record.image?.provider || "placeholder",
    powers,
    selectedPowerId: record.selectedPowerId || "",
    selectedPower,
    attributes: normalizeAttributes(record.attributes),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt || null,
  };
}

module.exports = {
  ATTRIBUTE_KEYS,
  DRAFT_TTL_MS,
  TOTAL_ATTRIBUTE_POINTS,
  buildCharacterDraft,
  getAttributePointBudget,
  LEVEL_UP_EXPERIENCE,
  normalizeAttributes,
  normalizeCharacterProgress,
  normalizeCreatureType,
  serializeCharacterRecord,
  validateSkillAllocation,
};
