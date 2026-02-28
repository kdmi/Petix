const crypto = require("crypto");

const DRAFT_TTL_MS = 15 * 60 * 1000;

const archetypeFallbacks = [
  "hunter",
  "wizard",
  "engineer",
  "dj",
  "scout",
  "alchemist",
  "guardian",
];

const styleDescriptors = [
  "neon-lined jacket",
  "weathered utility cloak",
  "holographic visor",
  "runed gloves",
  "solar shoulder armor",
  "vinyl-pattern cape",
  "glitched mask",
];

const moodDescriptors = [
  "calm strategist",
  "reckless improviser",
  "charming trickster",
  "disciplined tactician",
  "silent observer",
  "loud crowd favorite",
];

const sidekicks = [
  "mini drone",
  "ghost fox",
  "pulse raven",
  "tiny mech cat",
  "holo jellyfish",
];

const adjectivePool = [
  "Storm",
  "Neon",
  "Echo",
  "Iron",
  "Solar",
  "Pulse",
  "Rune",
  "Vector",
  "Nova",
  "Sonic",
];

const nounPool = [
  "Whisper",
  "Rider",
  "Smith",
  "Breaker",
  "Spark",
  "Bloom",
  "Drifter",
  "Shift",
  "Scout",
  "Vibe",
];

const powerThemes = {
  dj: ["beat", "sound", "rhythm", "crowd", "bass"],
  wizard: ["arcane", "rune", "spell", "focus", "mana"],
  hunter: ["track", "trap", "precision", "mark", "predator"],
  engineer: ["gadget", "turret", "overclock", "shield", "protocol"],
  scout: ["stealth", "dash", "vision", "path", "recon"],
  alchemist: ["elixir", "fusion", "mist", "vial", "transmute"],
  guardian: ["barrier", "aegis", "protect", "anchor", "ward"],
};

function pickRandom(list) {
  return list[crypto.randomInt(0, list.length)];
}

function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function normalizeArchetype(input) {
  const raw = String(input || "")
    .trim()
    .toLowerCase()
    .slice(0, 40);
  if (!raw) return pickRandom(archetypeFallbacks);
  return raw;
}

function buildName(archetype) {
  const first = pickRandom(adjectivePool);
  const second = pickRandom(nounPool);
  const normalized = archetype.charAt(0).toUpperCase() + archetype.slice(1);
  return `${first} ${second} the ${normalized}`;
}

function buildPowerOptions(archetype) {
  const tags = powerThemes[archetype] || [archetype, "focus", "momentum", "impact"];
  return [
    {
      id: "alpha",
      title: `Signature ${tags[0]} Surge`,
      description: `Empowers allies for 2 turns and grants +2 initiative after every ${tags[0]} action.`,
    },
    {
      id: "beta",
      title: `${tags[1].charAt(0).toUpperCase() + tags[1].slice(1)} Lock`,
      description: `Targets one enemy: applies control effect and reduces their next action power by 30%.`,
    },
    {
      id: "gamma",
      title: `${tags[2].charAt(0).toUpperCase() + tags[2].slice(1)} Overdrive`,
      description: `Consumes extra stamina to trigger a high-risk burst combo with DnD-style critical scaling.`,
    },
  ];
}

function buildCharacterDraft(archetypeInput) {
  const archetype = normalizeArchetype(archetypeInput);
  const style = pickRandom(styleDescriptors);
  const mood = pickRandom(moodDescriptors);
  const sidekick = pickRandom(sidekicks);
  const name = buildName(archetype);
  const powers = buildPowerOptions(archetype);
  const prompt = `Stylized full-body character portrait, ${archetype} class, ${style}, ${mood}, with a ${sidekick}, dynamic pose, game concept art`;
  const seed = toSlug(`${name}-${style}-${mood}-${sidekick}`) || "petix-hero";
  const imageUrl = `https://api.dicebear.com/9.x/adventurer-neutral/png?seed=${encodeURIComponent(seed)}&size=512`;

  return {
    archetype,
    style,
    mood,
    sidekick,
    name,
    prompt,
    imageUrl,
    powers,
  };
}

function validateSkillAllocation(stats) {
  const required = ["power", "agility", "intellect", "charisma", "endurance"];
  if (!stats || typeof stats !== "object") return false;
  let sum = 0;
  for (const key of required) {
    const value = stats[key];
    if (!Number.isInteger(value) || value < 0 || value > 15) {
      return false;
    }
    sum += value;
  }
  return sum === 15;
}

module.exports = {
  DRAFT_TTL_MS,
  buildCharacterDraft,
  validateSkillAllocation,
};
