// Expeditions (026): the Season 1 boss roster plus the runtime levers from the
// economy config. Stats and art were calibrated in expedition-demo/ (bosses.js,
// DESIGN.md §6); `par` is the fixed turn limit for the third star — the same for
// every player. Collection contract addresses never live here: they come from
// economy-config overrides (admin) so the repository stays address-free.
const { getEconomyConfig, EXPEDITION_BOSS_COUNT } = require("./economy-config");

const ART_BASE = "/assets/expeditions";

// title = the boss, name = the partner collection it pays tribute to.
const ROSTER = Object.freeze(
  [
    { title: "Sporebeak", name: "Rubber Hoodie Ducks", slug: "rubber-hoodie-ducks", bg: "#caf3fd", art: [5.7, 4.9, 86.3], hp: 2600, power: 9, shields: 2, par: 18 },
    { title: "Minty Pix", name: "Pixel Hood Minis", slug: "pixelhoodminis", bg: "#d5f7df", art: [-1.3, -3.15, 102.6], hp: 3600, power: 17, shields: 3, par: 22 },
    { title: "Mr. Pressstart", name: "Never Fucking Trade", slug: "never-fucking-trade", bg: "#d1d1fd", art: [6.9, 5, 86.2], hp: 5000, power: 29, shields: 4, par: 27 },
    { title: "Jean Phil", name: "Jean Phil NFT", slug: "jeanphil-nft", bg: "#fce2cb", art: [2.7, 3.3, 95.6], hp: 5600, power: 36, shields: 4, par: 26 },
    { title: "Nova Bro", name: "STARHOODZ", slug: "starhoodz", bg: "#e4e6fd", art: [10, 9.3, 79.9], hp: 6200, power: 42, shields: 5, par: 25 },
    { title: "Chainface", name: "OnChainHoodies", slug: "onchainhoodies-", bg: "#eef991", art: [4.9, 3.4, 90.1], hp: 6800, power: 50, shields: 7, par: 26 },
    { title: "Hatlaw", name: "WIF Outlaws", slug: "wif-outlaws", bg: "#c1e7fc", art: [2.2, 1.9, 95.6], hp: 9500, power: 58, shields: 6, par: 26 },
    { title: "Ninja Bear", name: "Clay StonKz", slug: "claystonkz", bg: "#f7d1cc", art: [10.2, 7.6, 78.5], hp: 9500, power: 68, shields: 7, par: 24 },
    { title: "Forest Hero", name: "CCFF00", slug: "ccff00-161927574", bg: "#ccff00", art: [0, -5.2, 100], hp: 11500, power: 80, shields: 8, par: 24 },
    { title: "Sad Cat", name: "Cash Cats", slug: "cashcatss", bg: "#feebd9", art: [0.2, -3.5, 100.2], hp: 13000, power: 95, shields: 8, par: 22 },
  ].map((boss, i) =>
    Object.freeze({
      index: i + 1,
      ...boss,
      url: `https://opensea.io/collection/${boss.slug}`,
      img: `${ART_BASE}/bosses/${i + 1}.png`,
      nftImage: `${ART_BASE}/nft/${i + 1}.png`, // trophy art: card art with the background baked in (owner set, 2026-10-10)
      hero: `${ART_BASE}/hero/${i + 1}-hero.jpg`,
      squadBg: `${ART_BASE}/hero/${i + 1}-squad.jpg`,
    })
  )
);

if (ROSTER.length !== EXPEDITION_BOSS_COUNT) {
  throw new Error(`Expedition roster has ${ROSTER.length} bosses, economy config expects ${EXPEDITION_BOSS_COUNT}`);
}

function listAt(cfg, key, index, fallback = 0) {
  const list = Array.isArray(cfg?.[key]) ? cfg[key] : [];
  const value = list[index - 1];
  return value === undefined || value === null ? fallback : value;
}

/** Engine rules derived from the config (fees, star multipliers, free-boss base). */
function rulesFromConfig(cfg) {
  return {
    fees: ROSTER.map((boss) => Number(listAt(cfg, "EXPEDITION_FEES", boss.index, 0)) || 0),
    rewardMults: { ...(cfg?.EXPEDITION_REWARD_MULTS || { 1: 0.5, 2: 1, 3: 2 }) },
    freeBossRewardBase: Number(cfg?.EXPEDITION_FREE_BOSS_REWARD_BASE) || 1000,
  };
}

function isExpeditionsEnabled(cfg) {
  return Number(cfg?.EXPEDITIONS_ENABLED) === 1;
}

function isAdminOnly(cfg) {
  return Number(cfg?.EXPEDITIONS_ADMIN_ONLY) === 1;
}

function isMintEnabled(cfg) {
  return Number(cfg?.EXPEDITION_NFT_MINT_ENABLED) === 1;
}

function isBossOpen(cfg, index) {
  return Number(listAt(cfg, "EXPEDITION_BOSS_OPEN", index, 0)) === 1;
}

function getBoss(index) {
  return ROSTER[Number(index) - 1] || null;
}

/** Full boss record with runtime levers. Internal: includes the collection contract. */
function getBossSettings(cfg, index) {
  const boss = getBoss(index);
  if (!boss) return null;
  return {
    ...boss,
    open: isBossOpen(cfg, index),
    openedBlock: Math.max(0, Math.floor(Number(listAt(cfg, "EXPEDITION_BOSS_OPENED_BLOCK", index, 0)) || 0)),
    fee: Number(listAt(cfg, "EXPEDITION_FEES", index, 0)) || 0,
    contract: String(listAt(cfg, "EXPEDITION_COLLECTION_CONTRACTS", index, "") || "").trim().toLowerCase(),
    energy: Math.max(0, Math.floor(Number(listAt(cfg, "EXPEDITION_COLLECTION_ENERGY", index, 0)) || 0)),
  };
}

/**
 * What the map shows for each boss. `progress` is the wallet's
 * `expeditions.progress` map ({ [index]: { bestStars } }).
 * hidden = not opened by the admin · locked = opened but the previous boss is
 * not cleared · current = the next one to beat · done = cleared (stars > 0).
 */
function bossViews(cfg, progress = {}) {
  let blocked = false;
  return ROSTER.map((boss) => {
    const settings = getBossSettings(cfg, boss.index);
    const stars = Math.max(0, Math.floor(Number(progress?.[boss.index]?.bestStars) || 0));
    let state;
    if (!settings.open) state = "hidden";
    else if (stars > 0) state = "done";
    else if (!blocked) state = "current";
    else state = "locked";
    if (settings.open && stars === 0) blocked = true;
    if (!settings.open) blocked = true;
    return {
      index: boss.index,
      title: boss.title,
      name: boss.name,
      url: boss.url,
      img: boss.img,
      hero: boss.hero,
      squadBg: boss.squadBg,
      bg: boss.bg,
      art: boss.art,
      hp: boss.hp,
      power: boss.power,
      shields: boss.shields,
      par: boss.par,
      fee: settings.fee,
      state,
      stars,
    };
  });
}

/** Can this wallet start a fight with boss `index`? Returns { ok, code }. */
function attemptGate(cfg, progress, index) {
  const views = bossViews(cfg, progress);
  const view = views[Number(index) - 1];
  if (!view) return { ok: false, code: "BOSS_UNKNOWN" };
  if (view.state === "hidden") return { ok: false, code: "BOSS_HIDDEN" };
  if (view.state === "locked") return { ok: false, code: "BOSS_LOCKED" };
  return { ok: true, code: null, view };
}

async function getExpeditionConfig() {
  return getEconomyConfig();
}

module.exports = {
  ART_BASE,
  ROSTER,
  attemptGate,
  bossViews,
  getBoss,
  getBossSettings,
  getExpeditionConfig,
  isAdminOnly,
  isBossOpen,
  isExpeditionsEnabled,
  isMintEnabled,
  rulesFromConfig,
};
