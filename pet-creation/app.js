const TYPES = ["Dragon", "Phoenix", "Cat", "Owl", "Ape", "Panda", "Undead", "Other"];
const DEFAULT_ATTRIBUTE_POINTS = 15;
const DEFAULT_CHARACTER_IMAGE = "/assets/character/current-pet.jpg";
const ENABLE_ARENA = true;
const DEFAULT_DASHBOARD_ENERGY_MAX = 3;
const DEFAULT_DASHBOARD_ENERGY_CURRENT = 3;
const API_BASE_URL = window.PETIX_API_BASE_URL || "";
const RARITY_META = {
  legendary: { label: "Legendary", color: "#f79009", points: 15 },
  epic: { label: "Epic", color: "#7a5af8", points: 13 },
  rare: { label: "Rare", color: "#0ba5ec", points: 12 },
  common: { label: "Common", color: "#667085", points: 10 },
};

const walletConfigs = {
  phantom: {
    label: "Phantom",
    installUrl: "https://phantom.app/",
    mobileBrowseUrl: (targetUrl) => {
      const encodedTarget = encodeURIComponent(targetUrl);
      const encodedRef = encodeURIComponent(window.location.origin);
      return `https://phantom.app/ul/browse/${encodedTarget}?ref=${encodedRef}`;
    },
    getProvider: () => {
      if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
      if (window.solana?.isPhantom) return window.solana;
      return null;
    },
  },
  solflare: {
    label: "Solflare",
    installUrl: "https://solflare.com/",
    mobileBrowseUrl: (targetUrl) => {
      const encodedTarget = encodeURIComponent(targetUrl);
      const encodedRef = encodeURIComponent(window.location.origin);
      return `https://solflare.com/ul/v1/browse/${encodedTarget}?ref=${encodedRef}`;
    },
    getProvider: () => {
      if (window.solflare?.isSolflare) return window.solflare;
      if (window.SolflareApp) return window.SolflareApp;
      return null;
    },
  },
  trust: {
    label: "Trust Wallet",
    installUrl: "https://trustwallet.com/browser-extension",
    mobileBrowseUrl: (targetUrl) =>
      `https://link.trustwallet.com/open_url?coin_id=501&url=${encodeURIComponent(targetUrl)}`,
    getProvider: () => {
      if (window.trustwallet?.solana) return window.trustwallet.solana;
      if (window.trustWallet?.solana) return window.trustWallet.solana;
      if (window.solana?.isTrust) return window.solana;
      return null;
    },
  },
};
const ADMIN_WALLETS = ["AwtqC9r5Wgvjfhqw5DrtzC5W73QRVF14DZVop8caECi9"];
const MAX_CHARACTERS_PER_WALLET = 3;
const CUSTOM_CREATURE_TYPE_MAX_LENGTH = 24;
const ADMIN_PAGE_SIZE = 20;
const CREATION_ROUTE = "/pet-creation/";
const DASHBOARD_ROUTE = "/dashboard/";
const ADMIN_ROUTE = "/admin/";
const CLIENT_LOG_ENDPOINT = "/api/client-log";

const TYPE_META = {
  Dragon: {
    default: { primary: "/assets/pet-types/dragon-default.svg" },
    hover: { primary: "/assets/pet-types/dragon-hover.svg" },
    active: { primary: "/assets/pet-types/dragon-active.svg" },
  },
  Phoenix: {
    default: { primary: "/assets/pet-types/phoenix-default.svg" },
    hover: { primary: "/assets/pet-types/phoenix-hover.svg" },
    active: { primary: "/assets/pet-types/phoenix-active.svg" },
  },
  Cat: {
    default: { primary: "/assets/pet-types/cat-default.svg" },
    hover: { primary: "/assets/pet-types/cat-hover.svg" },
    active: { primary: "/assets/pet-types/cat-active.svg" },
  },
  Owl: {
    default: { primary: "/assets/pet-types/owl-default.svg" },
    hover: { primary: "/assets/pet-types/owl-hover.svg" },
    active: { primary: "/assets/pet-types/owl-active.svg" },
  },
  Ape: {
    default: { primary: "/assets/pet-types/ape-default.svg" },
    hover: { primary: "/assets/pet-types/ape-hover.svg" },
    active: { primary: "/assets/pet-types/ape-active.svg" },
  },
  Panda: {
    default: { primary: "/assets/pet-types/panda-default.svg" },
    hover: { primary: "/assets/pet-types/panda-hover.svg" },
    active: { primary: "/assets/pet-types/panda-active.svg" },
  },
  Undead: {
    default: { primary: "/assets/pet-types/undead-default.svg" },
    hover: { primary: "/assets/pet-types/undead-hover.svg" },
    active: { primary: "/assets/pet-types/undead-active.svg" },
  },
  Other: {
    default: { primary: "/assets/pet-types/other-default.svg" },
    hover: { primary: "/assets/pet-types/other-hover.svg" },
    active: { primary: "/assets/pet-types/other-active.svg" },
  },
};

const POWER_ICONS = {
  default: "/assets/powers-step/power-icon-default.svg",
  active: "/assets/powers-step/power-icon-active.svg",
};
const SUCCESS_POWER_ICON = "/assets/character/power-sparkle.svg";
const BATTLE_SIDE_CARD_POWER_ICON = "/assets/battle/side-card-power.svg";
const BATTLE_ROUND_SKULL_ICON = "/assets/battle/round-skull.svg";
const BATTLE_CONTROL_PAUSE_ICON = "/assets/battle/control-pause.svg";
const BATTLE_CONTROL_PLAY_ICON = "/assets/battle/control-play.svg";
const BATTLE_CONTROL_RESTART_ICON = "/assets/battle/control-restart.svg";
const BATTLE_RESULT_REPLAY_ICON = "/assets/battle/result-replay-icon.svg";
const BATTLE_RESULT_TROPHY_COMPOSITE = "/assets/battle/result-trophy-composite.png";
const BATTLE_RESULT_LEVEL_UP_ICON = "/assets/battle/result-level-up-icon.svg";
const SUCCESS_SHARE_BACKGROUND = "/assets/cuddly-share/images/share_bg.png";
const SUCCESS_SHARE_INTENT_URL = "https://x.com/intent/tweet";
const SUCCESS_SHARE_WIDTH = 1600;
const SUCCESS_SHARE_HEIGHT = 1200;
const SUCCESS_SHARE_SCALE = 2;
const SUCCESS_SHARE_STAT_OFFSETS = [0, 65.33333587646484, 129.6666717529297, 194];
const SUCCESS_SHARE_BACKGROUND_BASE_WIDTH = 800;
const SUCCESS_SHARE_BACKGROUND_BASE_HEIGHT = 600;
const SUCCESS_SHARE_BACKGROUND_GRID_STEP = 122;
const SUCCESS_SHARE_BACKGROUND_GRID_COLOR = "rgba(208, 213, 221, 0.72)";
const SUCCESS_SHARE_BACKGROUND_GROUPS = [
  {
    items: [
      {
        src: "https://www.figma.com/api/mcp/asset/21c31f37-eaa1-4b06-a706-17711621ff47",
        x: 88.640625,
        y: 37.5,
        width: 141.50942993164062,
        height: 81.70051574707031,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/6d8afcb2-8965-46d1-b46c-3407386eac58",
        x: 88.640625,
        y: 78.0177001953125,
        width: 70.75471496582031,
        height: 60.28662109375,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/bb64b399-5c54-49de-90ab-42d2793bd2b1",
        x: 159.39453125,
        y: 77.830078125,
        width: 70.75470733642578,
        height: 60.47410202026367,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/0ea3203e-a95e-426f-b654-9607c0a5dfcc",
        x: 106.330078125,
        y: 0,
        width: 108.25472259521484,
        height: 108.25472259521484,
      },
    ],
  },
  {
    items: [
      {
        src: "https://www.figma.com/api/mcp/asset/58b13886-0604-4787-9f88-d30a74f936e2",
        x: 583,
        y: 90.4716796875,
        width: 141.50942993164062,
        height: 81.70051574707031,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/37de6413-e3b5-4dfe-9f0a-45e9d8d804c3",
        x: 583,
        y: 130.9892578125,
        width: 70.75471496582031,
        height: 48.96586608886719,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/93f3b3cf-47d8-45a6-a606-910f5ba6891e",
        x: 653.755859375,
        y: 130.8017578125,
        width: 70.75470733642578,
        height: 49.153343200683594,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/52b182e7-3846-4781-ad56-e3a70af15907",
        x: 602.810546875,
        y: 58.632080078125,
        width: 101.88679504394531,
        height: 101.88679504394531,
      },
    ],
  },
  {
    items: [
      {
        src: "https://www.figma.com/api/mcp/asset/26172055-47a8-4c72-a50f-b0bbc3cfd5a3",
        x: 17.669921875,
        y: 291.01904296875,
        width: 141.50942993164062,
        height: 81.70051574707031,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/3e96650b-7814-4ac4-ac9e-9bbaaf8b49c8",
        x: 17.669921875,
        y: 332.056640625,
        width: 70.75471496582031,
        height: 173.49417114257812,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/518ea7b7-e489-41b8-a628-c74ee0bac9f8",
        x: 88.42578125,
        y: 331.8692626953125,
        width: 70.75470733642578,
        height: 173.681640625,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/fde56130-b541-4bf9-8f08-076679550e97",
        x: 20.5,
        y: 233,
        width: 135.14151000976562,
        height: 135.14151000976562,
      },
    ],
  },
  {
    items: [
      {
        src: "https://www.figma.com/api/mcp/asset/8df2af08-8d64-48c0-9d63-3f0c224b00dc",
        x: 654.4140625,
        y: 330.234619140625,
        width: 141.50942993164062,
        height: 81.70051574707031,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/0f4e6fc6-1cd2-4a74-87d7-868dc3bae169",
        x: 654.4140625,
        y: 371.2723388671875,
        width: 141.50942993164062,
        height: 94.24888610839844,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/919e1627-24ca-494d-b221-d610a1b2ce92",
        x: 725.169921875,
        y: 371.0849609375,
        width: 70.75470733642578,
        height: 94.43637084960938,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/d57a3ec2-d70d-4810-9a6c-41b9cbca3870",
        x: 670.6875,
        y: 292.547119140625,
        width: 101.88679504394531,
        height: 101.88679504394531,
      },
    ],
  },
  {
    items: [
      {
        src: "https://www.figma.com/api/mcp/asset/fa6c7b6d-9192-4fcc-ad3a-eefef122f39b",
        x: 371,
        y: 527.6791839599609,
        width: 141.50942993164062,
        height: 81.70051574707031,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/22f35fde-7cc0-452b-9006-5d5848236f05",
        x: 371,
        y: 568.1967849731445,
        width: 70.75471496582031,
        height: 60.28662109375,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/9bb0c6cf-2e43-406a-98c6-f910151fec36",
        x: 441.75390625,
        y: 568.00927734375,
        width: 70.75470733642578,
        height: 60.47410202026367,
      },
      {
        src: "https://www.figma.com/api/mcp/asset/fb2a3e4b-a55f-4090-aab9-3640f70e9e92",
        x: 390.103515625,
        y: 486.641357421875,
        width: 106.132080078125,
        height: 106.132080078125,
      },
    ],
  },
];
const ARENA_ROULETTE_ITEM_SIZE = 160;
const ARENA_ROULETTE_GAP = 24;
const ARENA_ROULETTE_STEP = ARENA_ROULETTE_ITEM_SIZE + ARENA_ROULETTE_GAP;
const ARENA_ROULETTE_MOBILE_ITEM_SIZE = 80;
const ARENA_ROULETTE_MOBILE_GAP = 8;
const ARENA_ROULETTE_REPEAT_COUNT = 8;
const ARENA_ROULETTE_TRAVEL_ITEMS = 28;
const ARENA_ROULETTE_DURATION = 5800;
const ARENA_FOCUS_CARD_DELAY = 1100;
const ARENA_BATTLE_SCREEN_DELAY = 3000;
const ARENA_BATTLE_ENTER_DURATION = 900;
const ARENA_BATTLE_FIRST_ROUND_APPEAR_DELAY = 80;
const ARENA_BATTLE_FIRST_ROUND_APPEAR_DURATION = 520;
const ARENA_BATTLE_TYPING_START_DELAY = 240;
const ARENA_BATTLE_TEXT_CHAR_DELAY = 24;
const ARENA_BATTLE_TEXT_SPACE_DELAY = 12;
const ARENA_BATTLE_TEXT_PUNCTUATION_DELAY = 92;
const ARENA_BATTLE_TEXT_LINEBREAK_DELAY = 180;
const ARENA_BATTLE_AFTER_TEXT_DELAY = 180;
const ARENA_BATTLE_AFTER_DAMAGE_DELAY = 380;
const ARENA_BATTLE_AFTER_NOTE_DELAY = 520;
const ARENA_BATTLE_NEXT_ROUND_DELAY = 520;
const ARENA_BATTLE_RESULT_DELAY = 1000;
const ARENA_BATTLE_RESULT_ENTER_DURATION = 920;
const ARENA_BATTLE_FAST_FORWARD_FIRST_ROUND_APPEAR_DELAY = 16;
const ARENA_BATTLE_FAST_FORWARD_FIRST_ROUND_APPEAR_DURATION = 180;
const ARENA_BATTLE_FAST_FORWARD_TYPING_START_DELAY = 56;
const ARENA_BATTLE_FAST_FORWARD_TEXT_CHAR_DELAY = 4;
const ARENA_BATTLE_FAST_FORWARD_TEXT_SPACE_DELAY = 4;
const ARENA_BATTLE_FAST_FORWARD_TEXT_PUNCTUATION_DELAY = 10;
const ARENA_BATTLE_FAST_FORWARD_TEXT_LINEBREAK_DELAY = 16;
const ARENA_BATTLE_FAST_FORWARD_AFTER_TEXT_DELAY = 72;
const ARENA_BATTLE_FAST_FORWARD_AFTER_DAMAGE_DELAY = 96;
const ARENA_BATTLE_FAST_FORWARD_AFTER_NOTE_DELAY = 120;
const ARENA_BATTLE_FAST_FORWARD_NEXT_ROUND_DELAY = 120;
const ARENA_BATTLE_FAST_FORWARD_RESULT_DELAY = 180;
const ARENA_PREPARE_MIN_SPINNER_DURATION = 1600;
const ARENA_BATTLE_POLL_INTERVAL = 350;
const ARENA_BATTLE_POLL_ATTEMPTS = 40;
const ARENA_IMAGE_TARGET_SIZE = 512;
const ARENA_OPPONENT_CACHE_TTL = 2 * 60 * 1000;
const ARENA_OPPONENT_SELECTION_LIMIT = 10;

const ARENA_OPPONENT_POOL = [
  {
    id: "opponent-benny-bonnie",
    name: "Benny Bonnie",
    creatureType: "Burger Moth",
    imageUrl: "https://www.figma.com/api/mcp/asset/f02fbff3-bf67-4c57-9434-55e9c86a3666",
    rarity: "rare",
    attributes: { stamina: 4, agility: 6, strength: 5, intelligence: 5 },
    selectedPower: { description: "At the beginning of the battle, summons a skeleton warrior" },
  },
  {
    id: "opponent-sweet-bombino",
    name: "Sweet Bombino",
    creatureType: "Cyber Bunny",
    imageUrl: "https://www.figma.com/api/mcp/asset/b2560924-0557-4db8-9bd7-3548e6deb26d",
    rarity: "rare",
    attributes: { stamina: 4, agility: 6, strength: 5, intelligence: 5 },
    selectedPower: { description: "At the beginning of the battle, summons a skeleton warrior" },
  },
  {
    id: "opponent-frost-fizz",
    name: "Frost Fizz",
    creatureType: "Bubble Cake",
    imageUrl: "https://www.figma.com/api/mcp/asset/b2bb3e64-9975-4a40-82ee-13865f31cfa5",
    rarity: "rare",
    attributes: { stamina: 5, agility: 4, strength: 4, intelligence: 6 },
    selectedPower: { description: "Covers the arena with sparkling frost and slows the target." },
  },
  {
    id: "opponent-ember-crust",
    name: "Ember Crust",
    creatureType: "Molten Pastry",
    imageUrl: "https://www.figma.com/api/mcp/asset/948e3ddd-1038-45b2-ae85-365d527547e8",
    rarity: "rare",
    attributes: { stamina: 5, agility: 3, strength: 6, intelligence: 4 },
    selectedPower: { description: "Ignites the ground and gains bonus damage on the next strike." },
  },
  {
    id: "opponent-toast-rider",
    name: "Toast Rider",
    creatureType: "Toast Sprite",
    imageUrl: "https://www.figma.com/api/mcp/asset/44ad6112-e6ec-4098-a95b-272d791909bd",
    rarity: "rare",
    attributes: { stamina: 4, agility: 5, strength: 4, intelligence: 6 },
    selectedPower: { description: "Summons a hot gust that raises critical chance for one round." },
  },
  {
    id: "opponent-gilded-core",
    name: "Gilded Core",
    creatureType: "Clockwork Relic",
    imageUrl: "https://www.figma.com/api/mcp/asset/e6270898-8c2a-4bcf-af64-fd36f2e6d117",
    rarity: "rare",
    attributes: { stamina: 6, agility: 3, strength: 5, intelligence: 5 },
    selectedPower: { description: "Deploys a brass shell and reduces incoming damage." },
  },
  {
    id: "opponent-jelly-spark",
    name: "Jelly Spark",
    creatureType: "Arc Jelly",
    imageUrl: "https://www.figma.com/api/mcp/asset/c57367f5-f7c1-4b17-bad0-dd9bc3b4f301",
    rarity: "rare",
    attributes: { stamina: 3, agility: 6, strength: 4, intelligence: 6 },
    selectedPower: { description: "Releases static arcs that chain between targets in the arena." },
  },
  {
    id: "opponent-night-captain",
    name: "Night Captain",
    creatureType: "Abyss Corsair",
    imageUrl: "https://www.figma.com/api/mcp/asset/995470d1-ccbd-4b11-91aa-85ed21eea56b",
    rarity: "rare",
    attributes: { stamina: 4, agility: 5, strength: 5, intelligence: 5 },
    selectedPower: { description: "Summons a shadow tide and slips out of the first hit." },
  },
  {
    id: "opponent-panda-drift",
    name: "Panda Drift",
    creatureType: "Turbo Panda",
    imageUrl: "https://www.figma.com/api/mcp/asset/ec89c239-bdf2-43a8-b95a-b356e985f24f",
    rarity: "rare",
    attributes: { stamina: 6, agility: 4, strength: 5, intelligence: 3 },
    selectedPower: { description: "Charges through the lane and gains bonus armor on impact." },
  },
  {
    id: "opponent-sand-cube",
    name: "Sand Cube",
    creatureType: "Rune Block",
    imageUrl: "https://www.figma.com/api/mcp/asset/8f5b9a53-464d-4e6e-bdc8-8b96b2dd9576",
    rarity: "rare",
    attributes: { stamina: 5, agility: 4, strength: 4, intelligence: 6 },
    selectedPower: { description: "Builds a dust mirage that weakens the enemy's next ability." },
  },
  {
    id: "opponent-bloom-byte",
    name: "Bloom Byte",
    creatureType: "Pixel Bloom",
    imageUrl: "https://www.figma.com/api/mcp/asset/736bdcba-4025-41ba-93f5-a199245bbc1f",
    rarity: "rare",
    attributes: { stamina: 4, agility: 5, strength: 3, intelligence: 7 },
    selectedPower: { description: "Splits into neon petals and boosts spell effectiveness." },
  },
  {
    id: "opponent-hex-crate",
    name: "Hex Crate",
    creatureType: "Curse Box",
    imageUrl: "https://www.figma.com/api/mcp/asset/60debe2b-c983-453d-adb9-af86adfc3421",
    rarity: "rare",
    attributes: { stamina: 4, agility: 4, strength: 5, intelligence: 6 },
    selectedPower: { description: "Marks the target with a hex and amplifies the next direct hit." },
  },
];

const ATTRS = [
  {
    key: "stamina",
    icon: "/assets/attrs-step/stamina.svg",
    label: "Stamina",
    desc: "Increases max HP, helping your pet survive longer battles.",
  },
  {
    key: "agility",
    icon: "/assets/attrs-step/agility.svg",
    label: "Agility",
    desc: "Raises bonus crit chance and counterattack chance.",
  },
  {
    key: "strength",
    icon: "/assets/attrs-step/strength.svg",
    label: "Strength",
    desc: "Increases base damage dealt by successful attacks.",
  },
  {
    key: "intelligence",
    icon: "/assets/attrs-step/intelligence.svg",
    label: "Intelligence",
    desc: "Boosts crit damage, counterattack damage, and superpower damage.",
  },
];

const screenType = document.getElementById("screenType");
const screenProcess = document.getElementById("screenProcess");
const screenPowers = document.getElementById("screenPowers");
const screenAttrs = document.getElementById("screenAttrs");
const screenSuccess = document.getElementById("screenSuccess");
const screenCabinet = document.getElementById("screenCabinet");
const screenArena = document.getElementById("screenArena");
const screenAdmin = document.getElementById("screenAdmin");
const typeContinueBtn = document.getElementById("typeContinueBtn");
const otherInputWrap = document.getElementById("otherInputWrap");
const otherTypeInput = document.getElementById("otherTypeInput");
const powersGrid = document.getElementById("powersGrid");
const powersContinueBtn = document.getElementById("powersContinueBtn");
const powersTitle = document.getElementById("powersTitle");
const powersRarityBadge = document.querySelector(".pet-rarity-badge");
const backToPowersBtn = document.getElementById("backToPowersBtn");
const attrsTitle = document.getElementById("attrsTitle");
const attrsDescription = document.getElementById("attrsDescription");
const attrsList = document.getElementById("attrsList");
const attrsBlockedState = document.getElementById("attrsBlockedState");
const attrsBlockedTitle = document.getElementById("attrsBlockedTitle");
const attrsBlockedText = document.getElementById("attrsBlockedText");
const attrsBlockedBtn = document.getElementById("attrsBlockedBtn");
const attrsPetName = document.getElementById("attrsPetName");
const attrsPetLevel = document.getElementById("attrsPetLevel");
const pointsLeft = document.getElementById("pointsLeft");
const attrsPointsLabel = document.getElementById("attrsPointsLabel");
const attrsContinueBtn = document.getElementById("attrsContinueBtn");
const attrsPetRarity = document.getElementById("attrsPetRarity");
const attrsExpValue = document.getElementById("attrsExpValue");
const attrsExpProgress = document.getElementById("attrsExpProgress");
const attrsUpgradeSummary = document.getElementById("attrsUpgradeSummary");
const attrsUpgradeSummaryList = document.getElementById("attrsUpgradeSummaryList");
const attrsHoldCopy = document.getElementById("attrsHoldCopy");
const attrsRewardsWrap = document.getElementById("attrsRewardsWrap");
const successPetName = document.getElementById("successPetName");
const successCardRarity = document.querySelector(".success-card-rarity");
const successStats = document.getElementById("successStats");
const successPowerText = document.getElementById("successPowerText");
const shareSuccessBtn = document.getElementById("shareSuccessBtn");
const shareModalOverlay = document.getElementById("shareModalOverlay");
const shareModalPreviewImage = document.getElementById("shareModalPreviewImage");
const shareModalText = document.getElementById("shareModalText");
const shareModalClose = document.getElementById("shareModalClose");
const shareModalCopyBtn = document.getElementById("shareModalCopyBtn");
const shareModalShareBtn = document.getElementById("shareModalShareBtn");
const cabinetCard = document.getElementById("cabinetCard");
const cabinetCount = document.getElementById("cabinetCount");
const createAnotherBtn = document.getElementById("createAnotherBtn");
const dashboardTopbar = document.querySelector(".dashboard-topbar");
const dashboardTabs = document.getElementById("dashboardTabs");
const dashboardTabMyPets = document.getElementById("dashboardTabMyPets");
const dashboardTabArena = document.getElementById("dashboardTabArena");
const arenaStartFightBtn = document.getElementById("arenaStartFightBtn");
const dashboardEnergy = document.getElementById("dashboardEnergy");
const dashboardEnergyCurrent = document.getElementById("dashboardEnergyCurrent");
const dashboardEnergyTooltip = document.getElementById("dashboardEnergyTooltip");
const dashboardPoints = document.getElementById("dashboardPoints");
const arenaLayout = document.getElementById("arenaLayout");
const arenaIdleState = document.getElementById("arenaIdleState");
const arenaBattleState = document.getElementById("arenaBattleState");
const arenaStageTitle = document.getElementById("arenaStageTitle");
const arenaRoulette = document.getElementById("arenaRoulette");
const arenaRouletteTrack = document.getElementById("arenaRouletteTrack");
const arenaRouletteFocus = document.getElementById("arenaRouletteFocus");
const arenaRouletteFocusImage = document.getElementById("arenaRouletteFocusImage");
const arenaFocusCard = document.getElementById("arenaFocusCard");
const arenaVersus = document.getElementById("arenaVersus");
const arenaOpponentCard = document.getElementById("arenaOpponentCard");
const arenaPlayerCard = document.getElementById("arenaPlayerCard");
const arenaLiveBattle = document.getElementById("arenaLiveBattle");
const arenaReplayBanner = document.getElementById("arenaReplayBanner");
const arenaReplayBannerTitle = document.getElementById("arenaReplayBannerTitle");
const arenaReplayBackBtn = document.getElementById("arenaReplayBackBtn");
const arenaPanelEyebrow = document.getElementById("arenaPanelEyebrow");
const arenaPanelTitle = document.getElementById("arenaPanelTitle");
const arenaPanelDescription = document.getElementById("arenaPanelDescription");
const arenaIdleSecondaryBtn = document.getElementById("arenaIdleSecondaryBtn");
const arenaHistoryPanel = document.getElementById("arenaHistoryPanel");
const arenaHistoryCount = document.getElementById("arenaHistoryCount");
const arenaHistoryFeedback = document.getElementById("arenaHistoryFeedback");
const arenaHistoryList = document.getElementById("arenaHistoryList");
const arenaHistoryLoadMoreBtn = document.getElementById("arenaHistoryLoadMoreBtn");
const arenaBattleInitiator = document.getElementById("arenaBattleInitiator");
const arenaBattleOpponent = document.getElementById("arenaBattleOpponent");
const arenaBattleRoundValue = document.getElementById("arenaBattleRoundValue");
const arenaBattleRounds = document.getElementById("arenaBattleRounds");
const connectTrigger = document.getElementById("connectTrigger");
const walletOverlay = document.getElementById("walletOverlay");
const walletClose = document.getElementById("walletClose");
const walletMenu = document.getElementById("walletMenu");
const walletMenuCreatePet = document.getElementById("walletMenuCreatePet");
const walletMenuDashboard = document.getElementById("walletMenuDashboard");
const walletMenuAdmin = document.getElementById("walletMenuAdmin");
const walletMenuLogout = document.getElementById("walletMenuLogout");
const walletAuthPanel = document.getElementById("walletAuthPanel");
const walletLoggedPanel = document.getElementById("walletLoggedPanel");
const walletStatus = document.getElementById("walletStatus");
const loggedWalletAddress = document.getElementById("loggedWalletAddress");
const continueBtn = document.getElementById("continueBtn");
const claimRewardsBtn = document.getElementById("claimRewardsBtn");
const attrsSidePanel = document.querySelector(".attrs-side-panel");
const adminPanelStateHelpers = window.PetixAdminPanelState || {};
const upgradeScreenStateHelpers = window.PetixUpgradeScreenState || {};
const battleRoundDirectionHelpers = window.PetixBattleRoundDirection || {};
const walletButtons = document.querySelectorAll(".wallet-item");
const detectedBadges = document.querySelectorAll("[data-detected-for]");
const progressWrap = document.querySelector(".progress-wrap");
const adminCount = document.getElementById("adminCount");
const adminUsersCount = document.getElementById("adminUsersCount");
const adminCharactersCount = document.getElementById("adminCharactersCount");
const adminRarityCommon = document.getElementById("adminRarityCommon");
const adminRarityRare = document.getElementById("adminRarityRare");
const adminRarityEpic = document.getElementById("adminRarityEpic");
const adminRarityLegendary = document.getElementById("adminRarityLegendary");

const normalizeAdminSearchValue =
  adminPanelStateHelpers.normalizeAdminSearchValue ||
  function fallbackNormalizeAdminSearchValue(value) {
    return String(value || "").trim();
  };

const filterAdminCharacters =
  adminPanelStateHelpers.filterAdminCharacters ||
  function fallbackFilterAdminCharacters(records, query) {
    const normalizedQuery = normalizeAdminSearchValue(query).toLowerCase();
    const source = Array.isArray(records) ? records : [];
    if (!normalizedQuery) {
      return source;
    }

    return source.filter((record) =>
      String(record?.creatorWallet || "")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  };

const filterAdminWaitlistEntries =
  adminPanelStateHelpers.filterAdminWaitlistEntries ||
  function fallbackFilterAdminWaitlistEntries(records, query) {
    const normalizedQuery = normalizeAdminSearchValue(query).toLowerCase();
    const source = Array.isArray(records) ? records : [];
    if (!normalizedQuery) {
      return source;
    }

    return source.filter((entry) =>
      [entry?.email, entry?.source, entry?.pagePath, entry?.userAgent].some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    );
  };

const filterAdminBattles =
  adminPanelStateHelpers.filterAdminBattles ||
  function fallbackFilterAdminBattles(records, query) {
    const normalizedQuery = normalizeAdminSearchValue(query).toLowerCase();
    const source = Array.isArray(records) ? records : [];
    if (!normalizedQuery) {
      return source;
    }

    return source.filter((record) =>
      [
        record?.battleId,
        record?.attackerPet?.name,
        record?.attackerPet?.wallet,
        record?.defenderPet?.name,
        record?.defenderPet?.wallet,
        record?.winnerPetId,
      ].some((field) =>
        String(field || "")
          .toLowerCase()
          .includes(normalizedQuery)
      )
    );
  };

const getAdminWalletPivotState =
  adminPanelStateHelpers.getAdminWalletPivotState ||
  function fallbackGetAdminWalletPivotState(wallet) {
    return {
      query: normalizeAdminSearchValue(wallet),
      page: 1,
    };
  };

const getLevelAwareUpgradeScaleBudget =
  upgradeScreenStateHelpers.getLevelAwareUpgradeScaleBudget ||
  function fallbackLevelAwareUpgradeScaleBudget(input = {}) {
    const record = input && typeof input === "object" ? input : {};
    const attributes = record.attributes && typeof record.attributes === "object" ? record.attributes : {};
    const stagedIncrements =
      record.stagedIncrements && typeof record.stagedIncrements === "object" ? record.stagedIncrements : {};
    const level = Math.max(1, getRecordLevel(record));
    const availablePoints = getRecordAttributePointsAvailable(record);
    const baseMax = Math.max(
      0,
      ...ATTRS.map((attr) => Math.max(0, Math.floor(Number(attributes?.[attr.key]) || 0)))
    );
    const stagedTotal = ATTRS.reduce(
      (total, attr) => total + Math.max(0, Math.floor(Number(stagedIncrements?.[attr.key]) || 0)),
      0
    );

    return Math.max(15, 14 + level, baseMax + availablePoints, baseMax + stagedTotal);
  };

const getUpgradeCtaState =
  upgradeScreenStateHelpers.getUpgradeCtaState ||
  function fallbackUpgradeCtaState(input = {}) {
    const remainingPoints = Math.max(0, Math.floor(Number(input.remainingPoints) || 0));
    const availablePoints = Math.max(0, Math.floor(Number(input.availablePoints) || 0));
    const isSaving = Boolean(input.isSaving);
    const isMobileUpgradeViewport = Boolean(input.isMobileUpgradeViewport);
    const hasStagedSpend = remainingPoints >= 0 && remainingPoints !== availablePoints;
    const ready = isMobileUpgradeViewport
      ? remainingPoints === 0 && hasStagedSpend && !isSaving
      : hasStagedSpend && !isSaving;

    if (isSaving) {
      return { label: "Saving...", ready: false };
    }

    if (isMobileUpgradeViewport) {
      return {
        label: ready ? "Save" : `Points left: ${remainingPoints}`,
        ready,
      };
    }

    return {
      label: "Save Upgrade",
      ready,
    };
  };

const buildArenaRoundVisualState =
  battleRoundDirectionHelpers.buildArenaRoundVisualState ||
  function fallbackBuildArenaRoundVisualState(input = {}) {
    const record = input && typeof input === "object" ? input : {};
    const initiatorId = String(record.initiatorId || "").trim();
    const actorPetId = String(record.actorPetId || "").trim();
    const targetPetId = String(record.targetPetId || "").trim();
    const actorIsInitiator = actorPetId !== "" && actorPetId === initiatorId;
    const targetIsInitiator = targetPetId !== "" && targetPetId === initiatorId;
    const attackerSide = actorPetId
      ? actorIsInitiator
        ? "initiator"
        : "opponent"
      : targetPetId && targetIsInitiator
        ? "opponent"
        : "initiator";
    const defenderSide = targetPetId
      ? targetIsInitiator
        ? "initiator"
        : "opponent"
      : attackerSide === "initiator"
        ? "opponent"
        : "initiator";

    return {
      attackerSide,
      defenderSide,
      pillDirection: attackerSide === "initiator" ? "right" : "left",
      accentSide: defenderSide === "initiator" ? "left" : "right",
      leftIcon: attackerSide === "initiator" ? "swords" : "shield",
      rightIcon: attackerSide === "initiator" ? "shield" : "swords",
    };
  };

const getArenaRoundPillAssets =
  battleRoundDirectionHelpers.getArenaRoundPillAssets ||
  function fallbackGetArenaRoundPillAssets(input = {}) {
    const direction =
      input && typeof input === "object" && typeof input.pillDirection === "string"
        ? String(input.pillDirection).trim().toLowerCase()
        : typeof input === "string"
          ? String(input).trim().toLowerCase()
          : input?.leftIcon === "swords"
            ? "right"
            : input?.rightIcon === "swords"
              ? "left"
              : "right";

    if (direction === "left" || direction === "initiator") {
      return {
        left: "/assets/battle/round-pill-left-alt.svg",
        right: "/assets/battle/round-pill-right-alt.svg",
      };
    }

    return {
      left: "/assets/battle/round-pill-left-default.svg",
      right: "/assets/battle/round-pill-right-default.svg",
    };
  };
const adminSearchInput = document.getElementById("adminSearchInput");
const adminSearchLabel = document.getElementById("adminSearchLabel");
const adminTableBody = document.getElementById("adminTableBody");
const adminTableHeadRow = document.getElementById("adminTableHeadRow");
const adminEmpty = document.getElementById("adminEmpty");
const adminRefreshBtn = document.getElementById("adminRefreshBtn");
const adminExportBtn = document.getElementById("adminExportBtn");
const adminBackToDashboardBtn = document.getElementById("adminBackToDashboardBtn");
const adminNavCharacters = document.getElementById("adminNavCharacters");
const adminNavBattles = document.getElementById("adminNavBattles");
const adminNavWaitlist = document.getElementById("adminNavWaitlist");
const adminPagination = document.getElementById("adminPagination");
const adminPageInfo = document.getElementById("adminPageInfo");
const adminPrevBtn = document.getElementById("adminPrevBtn");
const adminNextBtn = document.getElementById("adminNextBtn");
const adminStatLabel1 = document.getElementById("adminStatLabel1");
const adminStatLabel2 = document.getElementById("adminStatLabel2");
const adminStatLabel3 = document.getElementById("adminStatLabel3");
const adminStatLabel4 = document.getElementById("adminStatLabel4");
const adminStatLabel5 = document.getElementById("adminStatLabel5");
const adminStatLabel6 = document.getElementById("adminStatLabel6");
const processTitle = screenProcess.querySelector("h1");
const processText = screenProcess.querySelector("p");
const characterImages = document.querySelectorAll(
  ".pet-result-image, .attrs-pet-image, .success-card-image"
);

const barType = document.getElementById("barType");
const barPowers = document.getElementById("barPowers");
const barAttrs = document.getElementById("barAttrs");
const labelType = document.getElementById("labelType");
const labelPowers = document.getElementById("labelPowers");
const labelAttrs = document.getElementById("labelAttrs");

let suppressRewardsTooltipTimeout = null;
let attrsRowsBudget = 0;
let attrsRowsMode = "";
let lastAttrTouchEndAt = 0;
let lastAttrsScreenTouchEndAt = 0;
let toastTimeoutId = 0;
let creatureTypeLimitToastAt = 0;
let battleStateRefreshTimeoutId = 0;
let battleStateRefreshPromise = null;
let lastBattleStateRefreshAt = 0;
let adminImageLightbox = null;
let adminLightboxImage = null;
let adminLightboxCaption = null;
let arenaAnimationFrameId = 0;
let arenaTimeoutIds = [];
let arenaFocusedSequenceIndex = -1;
const arenaImagePromises = new Map();
const arenaOpponentCache = {
  walletKey: "",
  attackerPetId: "",
  preparedPool: [],
  warmedAt: 0,
  warmPromise: null,
};
const shareAssetPromises = new Map();

const state = {
  step: "type",
  selectedType: "",
  selectedPowerId: "",
  isAuthenticated: false,
  isAdmin: false,
  isStarting: false,
  isSavingPower: false,
  isCreating: false,
  isSavingUpgrade: false,
  isSharing: false,
  isShareModalOpen: false,
  isCopyingShareImage: false,
  pendingStartAfterAuth: false,
  walletAddress: "",
  draft: null,
  character: null,
  sharePreviewCacheKey: "",
  sharePreviewBlob: null,
  sharePreviewUrl: "",
  sharePreviewFileName: "",
  sharePreviewText: "",
  characters: [],
  hasHydratedCharacters: false,
  adminSection: "characters",
  adminCharacters: [],
  hasLoadedAdminCharacters: false,
  adminWalletQuery: "",
  adminPage: 1,
  expandedAdminCharacterIds: [],
  isAdminLoading: false,
  deletingAdminCharacterId: "",
  adminErrorMessage: "",
  adminBattles: [],
  adminBattleSummary: null,
  hasLoadedAdminBattles: false,
  adminBattleQuery: "",
  adminBattlePage: 1,
  isAdminBattlesLoading: false,
  adminBattleErrorMessage: "",
  adminWaitlistEntries: [],
  hasLoadedAdminWaitlist: false,
  adminWaitlistQuery: "",
  adminWaitlistPage: 1,
  isAdminWaitlistLoading: false,
  adminWaitlistErrorMessage: "",
  attrs: createEmptyAttrs(),
  upgradePetId: "",
  energyCurrent: DEFAULT_DASHBOARD_ENERGY_CURRENT,
  energyMax: DEFAULT_DASHBOARD_ENERGY_MAX,
  battleStateResetsAt: "",
  battleStateTimezone: "",
  isFightPreparing: false,
  fightPreparingCharacterId: "",
  arenaRevealSession: null,
  activeBattle: null,
  arenaHistoryEntries: [],
  arenaHistoryNextCursor: "",
  arenaHistoryHasMore: false,
  hasLoadedArenaHistory: false,
  isArenaHistoryLoading: false,
  arenaHistoryErrorMessage: "",
  arenaHistoryWalletKey: "",
  arenaReplayRequest: null,
  arenaSelectedHistoryBattleId: "",
  currency: { balance: 0, totalEarned: 0 },
  pendingCurrency: null,
};

function createEmptyAttrs() {
  return {
    stamina: 0,
    agility: 0,
    strength: 0,
    intelligence: 0,
  };
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function shuffleArray(items = []) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function shortenAddress(address) {
  if (!address || address.length < 12) return address || "";
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function isAdminWalletAddress(address) {
  const normalized = String(address || "").trim();
  return Boolean(normalized) && ADMIN_WALLETS.includes(normalized);
}

function formatDateTime(value) {
  if (!value) return "Unknown";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatAdminFieldLabel(key) {
  return String(key || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getRecordLevel(record) {
  return Math.max(1, Math.floor(Number(record?.level) || 1));
}

function getRecordExperience(record) {
  return Math.max(0, Math.floor(Number(record?.experience) || 0));
}

function getRecordExperienceForNextLevel(record) {
  return Math.max(1, Math.floor(Number(record?.experienceForNextLevel) || 500));
}

function getRecordExperienceProgress(record) {
  const total = getRecordExperienceForNextLevel(record);
  const current = getRecordExperience(record);
  return Math.max(0, Math.min(100, (current / total) * 100));
}

function getRecordAttributePointsAvailable(record) {
  return Math.max(0, Math.floor(Number(record?.attributePointsAvailable) || 0));
}

function canUpgradeRecord(record) {
  return (
    String(record?.status || "").trim().toLowerCase() === "completed" &&
    getRecordAttributePointsAvailable(record) > 0
  );
}

function findCharacterById(characterId) {
  const normalizedId = String(characterId || "").trim();
  if (!normalizedId) return null;

  return (
    state.characters.find((record) => String(record?.id || "").trim() === normalizedId) || null
  );
}

function isUpgradeStep(step = state.step) {
  return step === "upgrade";
}

function isMobileUpgradeViewport() {
  return isUpgradeStep() && (window.innerWidth || 0) < 768;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const POINTS_FORMAT_ABBREV_THRESHOLD = 10000;

// BEGIN format-coins-mirror
function formatCoins(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (n < POINTS_FORMAT_ABBREV_THRESHOLD) {
    return String(n);
  }
  if (n < 1000000) {
    const truncatedTenths = Math.floor(n / 100) / 10;
    return truncatedTenths.toFixed(1) + "K";
  }
  if (n < 1000000000) {
    const truncatedTenths = Math.floor(n / 100000) / 10;
    return truncatedTenths.toFixed(1) + "M";
  }
  const truncatedTenths = Math.floor(n / 100000000) / 10;
  return truncatedTenths.toFixed(1) + "B";
}
// END format-coins-mirror

function ensureAdminImageLightbox() {
  if (adminImageLightbox && adminLightboxImage && adminLightboxCaption) {
    return;
  }

  adminImageLightbox = document.createElement("div");
  adminImageLightbox.className = "admin-lightbox hidden";
  adminImageLightbox.setAttribute("aria-hidden", "true");

  const content = document.createElement("div");
  content.className = "admin-lightbox-content";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "admin-lightbox-close";
  closeBtn.setAttribute("aria-label", "Close preview");
  closeBtn.textContent = "x";

  adminLightboxImage = document.createElement("img");
  adminLightboxImage.className = "admin-lightbox-image";
  adminLightboxImage.alt = "";

  adminLightboxCaption = document.createElement("p");
  adminLightboxCaption.className = "admin-lightbox-caption";

  content.append(closeBtn, adminLightboxImage, adminLightboxCaption);
  adminImageLightbox.appendChild(content);
  document.body.appendChild(adminImageLightbox);

  closeBtn.addEventListener("click", closeAdminImageLightbox);
  adminImageLightbox.addEventListener("click", (event) => {
    if (event.target === adminImageLightbox) {
      closeAdminImageLightbox();
    }
  });
}

function openAdminImageLightbox(src, alt, caption) {
  if (!src) return;

  ensureAdminImageLightbox();
  adminLightboxImage.src = src;
  adminLightboxImage.alt = alt || "";
  adminLightboxCaption.textContent = caption || "";
  adminImageLightbox.classList.remove("hidden");
  adminImageLightbox.setAttribute("aria-hidden", "false");
}

function closeAdminImageLightbox() {
  if (!adminImageLightbox) return;

  adminImageLightbox.classList.add("hidden");
  adminImageLightbox.setAttribute("aria-hidden", "true");
  if (adminLightboxImage) {
    adminLightboxImage.src = "";
    adminLightboxImage.alt = "";
  }
  if (adminLightboxCaption) {
    adminLightboxCaption.textContent = "";
  }
}

function setWalletStatus(message, type = "neutral") {
  walletStatus.textContent = message;
  walletStatus.classList.toggle("success", type === "success");
  walletStatus.classList.toggle("error", type === "error");
}

function showToast(message) {
  if (!message) return;

  let toast = document.getElementById("appToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    toast.className = "app-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("visible");

  if (toastTimeoutId) {
    window.clearTimeout(toastTimeoutId);
  }

  toastTimeoutId = window.setTimeout(() => {
    toast.classList.remove("visible");
    toastTimeoutId = 0;
  }, 3200);
}

function isMobileDevice() {
  return /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent || "");
}

function canUseWalletBrowseDeeplink() {
  return isMobileDevice() && window.location.protocol === "https:";
}

function showCreatureTypeLimitToast() {
  const now = Date.now();
  if (now - creatureTypeLimitToastAt < 1200) return;
  creatureTypeLimitToastAt = now;
  showToast(`Character type is limited to ${CUSTOM_CREATURE_TYPE_MAX_LENGTH} characters.`);
}

function willOtherTypeInputExceedLimit(input, insertedLength) {
  const maxLength = input.maxLength > 0 ? input.maxLength : CUSTOM_CREATURE_TYPE_MAX_LENGTH;
  const selectionStart = input.selectionStart ?? input.value.length;
  const selectionEnd = input.selectionEnd ?? input.value.length;
  const selectedLength = Math.max(0, selectionEnd - selectionStart);
  const nextLength = input.value.length - selectedLength + insertedLength;

  return insertedLength > 0 && nextLength > maxLength;
}

function updateAdminAccessUi() {
  if (!walletMenuAdmin) return;
  walletMenuAdmin.classList.toggle("hidden", !state.isAdmin);
}

function updateCreatePetMenuState() {
  if (!walletMenuCreatePet) return;

  const isBlocked = state.isAuthenticated && !hasCharacterCreationCapacity();
  walletMenuCreatePet.classList.toggle("disabled", isBlocked);
  walletMenuCreatePet.setAttribute("aria-disabled", isBlocked ? "true" : "false");
  walletMenuCreatePet.title = isBlocked
    ? `Character limit reached. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`
    : "";
}

async function apiRequest(path, body, method = "POST") {
  const response = await fetch(toApiUrl(path), {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    credentials: "include",
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || data.error || "Request failed.");
    if (data.error) {
      error.code = data.error;
    }
    throw error;
  }
  return data;
}

function toApiUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) return path;
  return `${API_BASE_URL}${path}`;
}

function reportClientIssue(event, details = {}) {
  if (!event) return;

  const payload = {
    event,
    step: state.step,
    selectedPowerId: state.selectedPowerId || "",
    draftId: state.draft?.id || "",
    path: window.location.pathname,
    ...details,
  };
  const url = toApiUrl(CLIENT_LOG_ENDPOINT);
  const body = JSON.stringify(payload);

  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    navigator.sendBeacon(url, blob);
    return;
  }

  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    keepalive: true,
    body,
  }).catch(() => {});
}

function normalizeCharacterRecord(record) {
  if (!record) return null;

  const imageUrl = record.imageUrl ? toApiUrl(record.imageUrl) : DEFAULT_CHARACTER_IMAGE;

  return {
    ...record,
    imageUrl,
    sourceImageUrl: imageUrl,
  };
}

function normalizeArenaOpponentRecord(record) {
  const normalizedRecord = normalizeCharacterRecord(record);
  if (!normalizedRecord?.id) {
    return null;
  }

  return cloneBattleRecord({
    ...normalizedRecord,
    creatorWallet: String(record?.creatorWallet || "").trim(),
    matchTier: String(record?.matchTier || "").trim(),
    levelDistance:
      Number.isFinite(Number(record?.levelDistance)) && Number(record.levelDistance) >= 0
        ? Math.floor(Number(record.levelDistance))
        : null,
  });
}

function createArenaRevealError(message, code = "BATTLE_REVEAL_UNAVAILABLE") {
  const error = new Error(message || "Couldn't prepare a trustworthy rival reveal. Please retry.");
  error.code = code;
  return error;
}

function mergeArenaRecordDetails(primary, secondary) {
  if (!primary) {
    return secondary ? cloneBattleRecord(secondary) : null;
  }

  if (!secondary) {
    return cloneBattleRecord(primary);
  }

  const primaryImageUrl = primary.imageUrl || primary.sourceImageUrl || "";
  const secondaryImageUrl = secondary.imageUrl || secondary.sourceImageUrl || "";

  return cloneBattleRecord({
    ...secondary,
    ...primary,
    imageUrl: primaryImageUrl || secondaryImageUrl || DEFAULT_CHARACTER_IMAGE,
    sourceImageUrl: primary.sourceImageUrl || primaryImageUrl || secondary.sourceImageUrl || secondaryImageUrl || "",
    selectedPower:
      primary.selectedPower ||
      secondary.selectedPower ||
      { description: "Power not selected yet" },
    attributes: {
      ...createEmptyAttrs(),
      ...(secondary.attributes || {}),
      ...(primary.attributes || {}),
    },
  });
}

function mergeArenaRecordCollections(collections = []) {
  const mergedRecords = new Map();

  collections.forEach((collection) => {
    (Array.isArray(collection) ? collection : []).forEach((record) => {
      const recordId = String(record?.id || "").trim();
      if (!recordId) {
        return;
      }

      const normalizedRecord = cloneBattleRecord(record);
      const existingRecord = mergedRecords.get(recordId);
      mergedRecords.set(
        recordId,
        existingRecord
          ? mergeArenaRecordDetails(existingRecord, normalizedRecord)
          : normalizedRecord
      );
    });
  });

  return Array.from(mergedRecords.values());
}

function setArenaRevealSession(nextSession) {
  state.arenaRevealSession = nextSession
    ? {
        attackerPetId: String(nextSession.attackerPetId || "").trim(),
        battleId: String(nextSession.battleId || "").trim(),
        selectedOpponentId: String(nextSession.selectedOpponentId || "").trim(),
        status: String(nextSession.status || "preparing").trim() || "preparing",
        visibleCandidateIds: Array.isArray(nextSession.visibleCandidateIds)
          ? nextSession.visibleCandidateIds.map((value) => String(value || "").trim()).filter(Boolean)
          : [],
        preparedCandidateIds: Array.isArray(nextSession.preparedCandidateIds)
          ? nextSession.preparedCandidateIds.map((value) => String(value || "").trim()).filter(Boolean)
          : [],
        recoveryMessage: String(nextSession.recoveryMessage || "").trim(),
      }
    : null;
}

function resetArenaRevealSession() {
  setArenaRevealSession(null);
}

function setArenaRevealRecovery(message) {
  setArenaRevealSession({
    ...(state.arenaRevealSession || {}),
    status: "recovery",
    recoveryMessage:
      String(message || "").trim() || "Couldn't prepare a trustworthy rival reveal. Please retry.",
  });
}

function normalizeArenaRevealBundle(reveal) {
  if (!reveal || typeof reveal !== "object") {
    return null;
  }

  const selectedOpponent = normalizeArenaOpponentRecord(reveal.selectedOpponent);
  const carouselCandidates = Array.isArray(reveal.carouselCandidates)
    ? reveal.carouselCandidates.map((record) => normalizeArenaOpponentRecord(record)).filter(Boolean)
    : [];

  if (!selectedOpponent) {
    return null;
  }

  const mergedCandidates = mergeArenaRecordCollections([
    [selectedOpponent],
    carouselCandidates,
  ]);

  return {
    selectedOpponent,
    carouselCandidates: mergedCandidates,
    matchmaking: reveal.matchmaking || null,
  };
}

function applyBattleStatePayload(battleState) {
  const parsedMax = Number(battleState?.energyMax);
  const parsedCurrent = Number(battleState?.energyCurrent);
  const nextMax = Math.max(
    1,
    Math.floor(Number.isFinite(parsedMax) ? parsedMax : DEFAULT_DASHBOARD_ENERGY_MAX)
  );
  const nextCurrent = Math.max(
    0,
    Math.floor(Number.isFinite(parsedCurrent) ? parsedCurrent : DEFAULT_DASHBOARD_ENERGY_CURRENT)
  );

  state.energyMax = nextMax;
  state.energyCurrent = Math.min(nextCurrent, nextMax);
  state.battleStateResetsAt =
    typeof battleState?.resetsAt === "string" ? String(battleState.resetsAt).trim() : "";
  state.battleStateTimezone =
    typeof battleState?.timezone === "string" ? String(battleState.timezone).trim() : "";
  lastBattleStateRefreshAt = Date.now();
  scheduleBattleStateRefresh();
}

function clearBattleStateRefreshTimer() {
  if (!battleStateRefreshTimeoutId) {
    return;
  }

  window.clearTimeout(battleStateRefreshTimeoutId);
  battleStateRefreshTimeoutId = 0;
}

function scheduleBattleStateRefresh() {
  clearBattleStateRefreshTimer();

  if (!state.isAuthenticated) {
    return;
  }

  const resetAtMs = Date.parse(state.battleStateResetsAt || "");
  if (!Number.isFinite(resetAtMs)) {
    return;
  }

  const delayMs = Math.max(0, resetAtMs - Date.now());
  battleStateRefreshTimeoutId = window.setTimeout(() => {
    battleStateRefreshTimeoutId = 0;
    void refreshBattleStateFromServer({ force: true }).catch(() => null);
  }, Math.min(delayMs, 2147483647));
}

async function refreshBattleStateFromServer({ force = false, minIntervalMs = 5000 } = {}) {
  if (!state.isAuthenticated) {
    return null;
  }

  const now = Date.now();
  if (!force && now - lastBattleStateRefreshAt < minIntervalMs) {
    return null;
  }

  if (battleStateRefreshPromise) {
    return battleStateRefreshPromise;
  }

  battleStateRefreshPromise = apiRequest("/api/character/me", {}, "GET")
    .then((payload) => {
      syncStateWithPayload(payload);
      return payload;
    })
    .catch((error) => {
      if (/unauthorized/i.test(String(error?.message || ""))) {
        return null;
      }
      throw error;
    })
    .finally(() => {
      battleStateRefreshPromise = null;
    });

  return battleStateRefreshPromise;
}

function maybeRefreshBattleStateOnResume() {
  if (!state.isAuthenticated) {
    return;
  }

  const resetAtMs = Date.parse(state.battleStateResetsAt || "");
  const shouldForce = Number.isFinite(resetAtMs) && Date.now() >= resetAtMs;
  void refreshBattleStateFromServer({
    force: shouldForce,
    minIntervalMs: 15000,
  }).catch(() => null);
}

function openWalletModal() {
  hideWalletMenu();
  walletOverlay.classList.remove("hidden");
  walletOverlay.setAttribute("aria-hidden", "false");
}

function closeWalletModal() {
  walletOverlay.classList.add("hidden");
  walletOverlay.setAttribute("aria-hidden", "true");
}

function showLoggedWalletState({ walletAddress, isAdmin = false }) {
  state.isAuthenticated = true;
  state.isAdmin = Boolean(isAdmin) || isAdminWalletAddress(walletAddress);
  state.walletAddress = walletAddress || "";
  walletAuthPanel.classList.add("hidden");
  walletLoggedPanel.classList.remove("hidden");
  walletClose.classList.add("hidden");
  loggedWalletAddress.textContent = walletAddress;
  updateAdminAccessUi();
  updateCreatePetMenuState();
  updateDashboardPointsUi();
}

function showWalletAuthState() {
  state.isAuthenticated = false;
  state.isAdmin = false;
  state.walletAddress = "";
  resetUpgradeSession();
  clearArenaOpponentCache();
  state.adminSection = "characters";
  state.adminCharacters = [];
  state.adminWalletQuery = "";
  state.isAdminLoading = false;
  state.deletingAdminCharacterId = "";
  state.adminErrorMessage = "";
  state.adminBattles = [];
  state.adminBattleSummary = null;
  state.adminBattleQuery = "";
  state.adminBattlePage = 1;
  state.isAdminBattlesLoading = false;
  state.adminBattleErrorMessage = "";
  state.adminWaitlistEntries = [];
  state.adminWaitlistQuery = "";
  state.adminWaitlistPage = 1;
  state.isAdminWaitlistLoading = false;
  state.adminWaitlistErrorMessage = "";
  state.hasLoadedAdminCharacters = false;
  state.hasLoadedAdminBattles = false;
  state.hasLoadedAdminWaitlist = false;
  state.activeBattle = null;
  state.energyCurrent = DEFAULT_DASHBOARD_ENERGY_CURRENT;
  state.energyMax = DEFAULT_DASHBOARD_ENERGY_MAX;
  state.battleStateResetsAt = "";
  state.battleStateTimezone = "";
  state.isFightPreparing = false;
  state.fightPreparingCharacterId = "";
  state.arenaHistoryEntries = [];
  state.arenaHistoryNextCursor = "";
  state.arenaHistoryHasMore = false;
  state.hasLoadedArenaHistory = false;
  clearBattleStateRefreshTimer();
  battleStateRefreshPromise = null;
  lastBattleStateRefreshAt = 0;
  state.isArenaHistoryLoading = false;
  state.arenaHistoryErrorMessage = "";
  state.arenaHistoryWalletKey = "";
  state.arenaReplayRequest = null;
  state.arenaSelectedHistoryBattleId = "";
  walletLoggedPanel.classList.add("hidden");
  walletAuthPanel.classList.remove("hidden");
  walletClose.classList.remove("hidden");
  state.currency = { balance: 0, totalEarned: 0 };
  setWalletStatus("");
  if (adminSearchInput) adminSearchInput.value = "";
  clearArenaAnimation();
  updateEnergyUi();
  updateDashboardPointsUi();
  hideWalletMenu();
  updateAdminAccessUi();
  updateCreatePetMenuState();
}

function extractSignatureBytes(signatureResult) {
  if (signatureResult instanceof Uint8Array) return signatureResult;
  if (signatureResult?.signature instanceof Uint8Array) return signatureResult.signature;
  throw new Error("Wallet signature format is not supported.");
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function getActiveRecord() {
  return state.draft || state.character;
}

function getPowerOptions() {
  return getActiveRecord()?.powers || [];
}

function getSelectedPowerDescription(record) {
  return record?.selectedPower?.description || "Power not selected yet";
}

function normalizeRarityLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();

  if (normalized === "legendary") return "legendary";
  if (normalized === "epic" || normalized === "epix") return "epic";
  if (normalized === "rare") return "rare";
  if (normalized === "common") return "common";
  return "legendary";
}

function getRarityMeta(label) {
  return RARITY_META[normalizeRarityLabel(label)] || RARITY_META.legendary;
}

function getAttributePointBudget(record = getActiveRecord()) {
  const explicitBudget = Number(record?.attributePoints);
  if (Number.isInteger(explicitBudget) && explicitBudget > 0) {
    return explicitBudget;
  }

  return getRarityMeta(record?.rarity).points || DEFAULT_ATTRIBUTE_POINTS;
}

function getRequestedUpgradePetId() {
  return String(new URLSearchParams(window.location.search).get("petId") || "").trim();
}

function getSelectedUpgradeRecord(characterId = state.upgradePetId) {
  return findCharacterById(characterId);
}

function getAttributeScreenMode(step = state.step) {
  return isUpgradeStep(step) ? "upgrade" : "create";
}

function getAttributeScreenRecord(step = state.step) {
  return isUpgradeStep(step) ? getSelectedUpgradeRecord() : getActiveRecord();
}

function getAttributeScreenScaleBudget(record = getAttributeScreenRecord()) {
  if (!isUpgradeStep()) {
    return getAttributePointBudget(record);
  }

  return getLevelAwareUpgradeScaleBudget({
    attributes: record?.attributes,
    availablePoints: getRecordAttributePointsAvailable(record),
    level: getRecordLevel(record),
    stagedIncrements: state.attrs,
  });
}

function getAttributeDisplayValue(attrKey, record = getAttributeScreenRecord()) {
  const baseValue = Math.max(0, Math.floor(Number(record?.attributes?.[attrKey]) || 0));
  const stagedValue = Math.max(0, Math.floor(Number(state.attrs?.[attrKey]) || 0));
  return isUpgradeStep() ? baseValue + stagedValue : stagedValue;
}

function getUpgradeRouteState(characterId = state.upgradePetId) {
  const normalizedId = String(characterId || "").trim();
  if (!normalizedId) {
    return {
      blocked: true,
      title: "Choose a pet to upgrade",
      description: "Open this screen from an Upgrade button on a pet card in My Pets.",
      record: null,
    };
  }

  const record = getSelectedUpgradeRecord(normalizedId);
  if (!record) {
    return {
      blocked: true,
      title: "Pet not found",
      description: "This pet is not available in your current wallet anymore. Return to My Pets and choose another one.",
      record: null,
    };
  }

  if (!canUpgradeRecord(record)) {
    return {
      blocked: true,
      title: "No upgrade points left",
      description: `${getRecordDisplayName(record)} has no unspent upgrade points right now.`,
      record,
    };
  }

  return {
    blocked: false,
    title: "",
    description: "",
    record,
  };
}

function primeUpgradeSession(characterId) {
  state.upgradePetId = String(characterId || "").trim();
  state.isSavingUpgrade = false;
  state.attrs = createEmptyAttrs();
}

function resetUpgradeSession() {
  state.upgradePetId = "";
  state.isSavingUpgrade = false;
}

function applyRarityBadge(element, rarityLabel) {
  if (!element) return;

  const rarity = getRarityMeta(rarityLabel);
  element.textContent = rarity.label;
  element.style.backgroundColor = rarity.color;
}

function syncDisplayedRarity(record) {
  applyRarityBadge(powersRarityBadge, record?.rarity);
  applyRarityBadge(attrsPetRarity, record?.rarity);
  applyRarityBadge(successCardRarity, record?.rarity);
}

function getCurrentCreatureType() {
  return getActiveRecord()?.creatureType || getResolvedType() || "Pet";
}

function getCurrentCharacterName() {
  const record = getActiveRecord();
  if (record?.name) {
    return record.name;
  }

  if (record?.displayName && record.displayName !== record.creatureType) {
    return record.displayName;
  }

  return "";
}

function hasCharacterCreationCapacity() {
  return state.isAdmin || state.characters.length < MAX_CHARACTERS_PER_WALLET;
}

function setCharacterImages(src, creatureType) {
  characterImages.forEach((image) => {
    image.src = src || DEFAULT_CHARACTER_IMAGE;
    image.alt = creatureType ? `${creatureType} character` : "";
  });
}

function syncTypeSelectionWithRecord(record) {
  const creatureType = record?.creatureType || "";
  if (!creatureType) {
    state.selectedType = "";
    otherTypeInput.value = "";
    return;
  }

  if (TYPES.includes(creatureType)) {
    state.selectedType = creatureType;
    otherTypeInput.value = "";
    return;
  }

  state.selectedType = "Other";
  otherTypeInput.value = creatureType;
}

function syncStateWithPayload(payload = {}) {
  if (payload?.battleState) {
    applyBattleStatePayload(payload.battleState);
    updateEnergyUi();
  }

  if (payload?.currency && typeof payload.currency === "object") {
    const newCurrency = {
      balance: Math.max(0, Math.floor(Number(payload.currency.balance) || 0)),
      totalEarned: Math.max(0, Math.floor(Number(payload.currency.totalEarned) || 0)),
    };
    if (state.isFightPreparing || (state.activeBattle && !isArenaBattleResultPhase(state.activeBattle.phase))) {
      state.pendingCurrency = newCurrency;
    } else {
      state.currency = newCurrency;
      state.pendingCurrency = null;
      updateDashboardPointsUi();
    }
  }

  if (Array.isArray(payload.characters)) {
    state.characters = payload.characters.map(normalizeCharacterRecord);
    state.hasHydratedCharacters = true;
    if (state.characters.length) {
      void warmArenaOpponentPool().catch(() => {});
    } else {
      clearArenaOpponentCache();
    }
  }

  if ("draft" in payload) {
    state.draft = normalizeCharacterRecord(payload.draft);
  }

  if ("character" in payload) {
    state.character = normalizeCharacterRecord(payload.character);
    if (payload.character) {
      state.draft = null;
    }
  } else if (!state.draft) {
    state.character = state.characters[state.characters.length - 1] || null;
  }

  invalidateSuccessSharePreview(state.character);

  const activeRecord = state.draft || state.character;
  state.selectedPowerId = activeRecord?.selectedPowerId || "";
  if (!isUpgradeStep()) {
    state.attrs = {
      ...createEmptyAttrs(),
      ...(activeRecord?.attributes || {}),
    };
  }

  if (activeRecord) {
    syncTypeSelectionWithRecord(activeRecord);
    setCharacterImages(activeRecord.imageUrl, activeRecord.creatureType);
    syncDisplayedRarity(activeRecord);
    updateCreatePetMenuState();
    return;
  }

  setCharacterImages(DEFAULT_CHARACTER_IMAGE, "");
  syncDisplayedRarity(null);
  updateCreatePetMenuState();
}

function resetCharacterState({ keepTypeSelection = false, keepCharacters = false } = {}) {
  closeSuccessShareModal({ restoreFocus: false });
  clearSuccessSharePreview();
  resetUpgradeSession();
  state.draft = null;
  state.character = null;
  if (!keepCharacters) {
    state.characters = [];
    state.hasHydratedCharacters = false;
    clearArenaOpponentCache();
  }
  state.selectedPowerId = "";
  state.attrs = createEmptyAttrs();
  setCharacterImages(DEFAULT_CHARACTER_IMAGE, "");
  syncDisplayedRarity(null);

  if (!keepTypeSelection) {
    state.selectedType = "";
    otherTypeInput.value = "";
  }
}

function openCreatePetFromMenu() {
  hideWalletMenu();
  if (!hasCharacterCreationCapacity()) {
    showToast(`Character limit reached. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`);
    return;
  }
  window.location.href = new URL(CREATION_ROUTE, window.location.origin).toString();
}

function openDashboardFromMenu() {
  hideWalletMenu();
  window.location.href = new URL(DASHBOARD_ROUTE, window.location.origin).toString();
}

function syncDashboardTabs(step = state.step) {
  if (!dashboardTabMyPets || !dashboardTabArena) return;

  const isArena = step === "arena";
  dashboardTabMyPets.classList.toggle("active", !isArena);
  dashboardTabArena.classList.toggle("active", isArena);
  dashboardTabMyPets.setAttribute("aria-selected", isArena ? "false" : "true");
  dashboardTabArena.setAttribute("aria-selected", isArena ? "true" : "false");
}

function openAdminPanelFromMenu() {
  hideWalletMenu();
  window.location.href = new URL(ADMIN_ROUTE, window.location.origin).toString();
}

function redirectToLandingAuthPrompt() {
  const targetUrl = new URL("/", window.location.origin);
  targetUrl.searchParams.set("auth", "1");
  window.location.replace(targetUrl.toString());
}

function getRequestedScreen() {
  const screen = new URLSearchParams(window.location.search).get("screen");
  if (!ENABLE_ARENA && screen === "arena") {
    return "";
  }

  return ["type", "cabinet", "admin", "arena", "upgrade"].includes(screen) ? screen : "";
}

function getArenaPreviewMode() {
  const preview = String(new URLSearchParams(window.location.search).get("arenaPreview") || "")
    .trim()
    .toLowerCase();

  return ["roulette", "focus", "versus", "battle", "result"].includes(preview) ? preview : "";
}

function getArenaRequestedBattleId() {
  return String(new URLSearchParams(window.location.search).get("battleId") || "").trim();
}

function syncDashboardRouteState(step, { battleId = "", petId = "", replace = true } = {}) {
  if (getPageMode() !== "dashboard") {
    return;
  }

  const url = new URL(window.location.href);
  const normalizedBattleId = String(battleId || "").trim();
  const normalizedPetId = String(petId || "").trim();

  if (step === "arena") {
    url.searchParams.set("screen", "arena");
  } else if (step === "upgrade") {
    url.searchParams.set("screen", "upgrade");
  } else if (step === "admin") {
    url.searchParams.set("screen", "admin");
  } else {
    url.searchParams.delete("screen");
  }

  if (normalizedBattleId) {
    url.searchParams.set("battleId", normalizedBattleId);
    url.searchParams.delete("arenaPreview");
  } else {
    url.searchParams.delete("battleId");
    if (step !== "arena" || !String(state.activeBattle?.id || "").startsWith("arena-preview-")) {
      url.searchParams.delete("arenaPreview");
    }
  }

  if (step === "upgrade" && normalizedPetId) {
    url.searchParams.set("petId", normalizedPetId);
  } else {
    url.searchParams.delete("petId");
  }

  const nextHref = url.toString();
  const currentHref = window.location.href;
  if (nextHref === currentHref) {
    return;
  }

  const method = replace ? "replaceState" : "pushState";
  window.history[method](null, "", nextHref);
}

function getPageMode() {
  const explicitPage = String(document.body?.dataset?.page || "").trim().toLowerCase();
  if (["creation", "dashboard", "admin"].includes(explicitPage)) {
    return explicitPage;
  }

  const requestedScreen = getRequestedScreen();
  if (requestedScreen === "cabinet") return "dashboard";
  if (requestedScreen === "arena") return "dashboard";
  if (requestedScreen === "upgrade") return "dashboard";
  if (requestedScreen === "admin") return "admin";
  return "creation";
}

function setProcessCopy(title, text) {
  processTitle.textContent = title;
  processText.textContent = text;
}

function handleFlowError(error, fallbackMessage) {
  const message = typeof error?.message === "string" ? error.message : fallbackMessage;
  if (/unauthorized/i.test(message)) {
    setWalletStatus("Connect wallet to create a character.", "error");
    openWalletModal();
    return;
  }
  window.alert(message || fallbackMessage);
}

async function restoreCharacterState() {
  if (!state.isAuthenticated) return false;

  try {
    const data = await apiRequest("/api/character/me", {}, "GET");
    const requestedScreen = getRequestedScreen();
    const arenaPreviewMode = getArenaPreviewMode();
    const requestedBattleId = getArenaRequestedBattleId();
    const pageMode = getPageMode();

    if (pageMode === "creation" && data?.hasDraft && data.draft) {
      syncStateWithPayload(data);
      moveTo(data.draft.selectedPowerId ? "attrs" : "powers");
      return true;
    }

    if ((pageMode === "dashboard" || pageMode === "admin") && data?.hasCharacter && data.character) {
      syncStateWithPayload(data);
      if (requestedScreen === "arena") {
        void ensureArenaHistoryLoaded().catch(() => {});
        if (requestedBattleId) {
          await ensureArenaReplayBattle(requestedBattleId, { source: "link" });
        } else if (arenaPreviewMode) {
          await ensureArenaPreviewBattle(arenaPreviewMode);
        }
      } else if (requestedScreen === "upgrade") {
        primeUpgradeSession(getRequestedUpgradePetId());
      }
      moveTo(
        pageMode === "admin" || requestedScreen === "admin"
          ? "admin"
          : requestedScreen === "arena"
            ? "arena"
            : requestedScreen === "upgrade"
              ? "upgrade"
            : "cabinet"
      );
      return true;
    }

    syncStateWithPayload(data);

    if (pageMode === "creation" && !state.isAdmin && state.characters.length >= MAX_CHARACTERS_PER_WALLET) {
      moveTo("cabinet");
      return true;
    }

    if (pageMode === "admin" && state.isAdmin) {
      moveTo("admin");
      return true;
    }

    if (pageMode === "dashboard") {
      if (requestedScreen === "arena") {
        void ensureArenaHistoryLoaded().catch(() => {});
        if (requestedBattleId) {
          await ensureArenaReplayBattle(requestedBattleId, { source: "link" });
        } else if (arenaPreviewMode) {
          await ensureArenaPreviewBattle(arenaPreviewMode);
        }
      } else if (requestedScreen === "upgrade") {
        primeUpgradeSession(getRequestedUpgradePetId());
      }
      moveTo(
        requestedScreen === "arena"
          ? "arena"
          : requestedScreen === "upgrade"
            ? "upgrade"
            : "cabinet"
      );
      return true;
    }

    if (pageMode === "creation") {
      state.character = null;
      state.selectedPowerId = "";
      state.attrs = createEmptyAttrs();
      setCharacterImages(DEFAULT_CHARACTER_IMAGE, "");
      syncDisplayedRarity(null);
    }

    return false;
  } catch {
    return false;
  }
}

async function connectWallet(walletKey) {
  const wallet = walletConfigs[walletKey];
  if (!wallet) return;

  const provider = wallet.getProvider();
  if (!provider) {
    if (canUseWalletBrowseDeeplink() && typeof wallet.mobileBrowseUrl === "function") {
      setWalletStatus(`Opening ${wallet.label} app...`);
      window.location.href = wallet.mobileBrowseUrl(window.location.href);
      return;
    }

    setWalletStatus(`${wallet.label} is not detected. Opening install page...`);
    window.open(wallet.installUrl, "_blank", "noopener,noreferrer");
    return;
  }

  try {
    setWalletStatus(`Connecting ${wallet.label}...`);
    const connectResult = await provider.connect();
    const address =
      connectResult?.publicKey?.toString?.() ||
      provider.publicKey?.toString?.() ||
      "";
    if (!address) throw new Error("Wallet address was not returned.");

    setWalletStatus("Creating sign-in challenge...");
    const challenge = await apiRequest("/api/auth/solana/challenge", { wallet: address });
    const encodedMessage = new TextEncoder().encode(challenge.message);
    if (!provider.signMessage) throw new Error("Wallet does not support message signing.");

    setWalletStatus("Please confirm signature in your wallet...");
    const signatureResult = await provider.signMessage(encodedMessage, "utf8");
    const signatureBase64 = bytesToBase64(extractSignatureBytes(signatureResult));

    setWalletStatus("Verifying signature...");
    const verified = await apiRequest("/api/auth/solana/verify", {
      wallet: address,
      walletType: walletKey,
      message: challenge.message,
      signature: signatureBase64,
      challengeToken: challenge.challengeToken,
    });

    showLoggedWalletState({ walletAddress: verified.wallet, isAdmin: verified.isAdmin });
    setWalletStatus("Wallet connected successfully.", "success");
    const restored = await restoreCharacterState();
    if (restored) {
      state.pendingStartAfterAuth = false;
    }
  } catch (error) {
    const message = typeof error?.message === "string" ? error.message : "Connection failed.";
    setWalletStatus(message, "error");
  }
}

function toggleWalletMenu() {
  if (!state.isAuthenticated) return;
  walletMenu.classList.toggle("hidden");
}

function hideWalletMenu() {
  walletMenu.classList.add("hidden");
}

function refreshDetectedBadges() {
  detectedBadges.forEach((badge) => {
    const walletKey = badge.dataset.detectedFor;
    badge.classList.toggle("hidden", !Boolean(walletConfigs[walletKey]?.getProvider()));
  });
}

async function restoreWalletSession() {
  try {
    const response = await fetch(toApiUrl("/api/auth/solana/me"), {
      method: "GET",
      credentials: "include",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.authenticated || !data?.wallet) {
      throw new Error("No active session");
    }
    showLoggedWalletState({ walletAddress: data.wallet, isAdmin: data.isAdmin });
    await restoreCharacterState();
  } catch {
    showWalletAuthState();
    redirectToLandingAuthPrompt();
  }
}

async function logoutWallet() {
  await apiRequest("/api/auth/solana/logout", {});
  resetCharacterState();
  showWalletAuthState();
  window.location.href = new URL("/", window.location.origin).toString();
}

function resetStepScroll() {
  if (!window.matchMedia("(max-width: 900px)").matches) return;

  window.requestAnimationFrame(() => {
    const root = document.scrollingElement || document.documentElement;
    if (root) root.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
}

function showScreen(targetId) {
  [screenType, screenProcess, screenPowers, screenAttrs, screenSuccess, screenCabinet, screenArena, screenAdmin].forEach(
    (screen) => {
      if (!screen) return;
      screen.classList.toggle("hidden", screen.id !== targetId);
    }
  );

  document.body.classList.toggle("success-screen-active", targetId === "screenSuccess");
}

function setProgress(step) {
  if (progressWrap) {
    progressWrap.classList.toggle(
      "hidden",
      step === "success" ||
        step === "cabinet" ||
        step === "arena" ||
        step === "admin" ||
        step === "upgrade"
    );
  }

  barType.classList.toggle("active", ["type", "process"].includes(step));
  barPowers.classList.toggle("active", step === "powers");
  barAttrs.classList.toggle("active", ["attrs", "success", "cabinet", "arena"].includes(step));

  barType.classList.toggle("completed", ["powers", "attrs", "success", "cabinet", "arena"].includes(step));
  barPowers.classList.toggle("completed", ["attrs", "success", "cabinet", "arena"].includes(step));
  barAttrs.classList.remove("completed");

  labelType.classList.toggle("active", step === "type" || step === "process");
  labelPowers.classList.toggle("active", step === "powers");
  labelAttrs.classList.toggle("active", step === "attrs" || step === "success" || step === "cabinet" || step === "arena");
}

function getResolvedType() {
  if (state.selectedType === "Other") {
    return otherTypeInput.value.trim();
  }
  return state.selectedType;
}

function updateTypeContinueState() {
  const isValid = Boolean(getResolvedType()) && !state.isStarting;
  typeContinueBtn.disabled = !isValid;
  typeContinueBtn.classList.toggle("enabled", isValid);
}

function preloadTypeIcons() {
  const urls = new Set();
  Object.values(TYPE_META).forEach((states) => {
    Object.values(states).forEach((icons) => {
      if (icons?.primary) urls.add(icons.primary);
      if (icons?.secondary) urls.add(icons.secondary);
    });
  });
  urls.forEach((url) => {
    const img = new Image();
    img.src = url;
  });
}

function preloadPowersAssets() {
  [POWER_ICONS.default, POWER_ICONS.active].forEach((url) => {
    const img = new Image();
    img.src = url;
  });
}

function preloadAttrsAssets() {
  [
    DEFAULT_CHARACTER_IMAGE,
    "/assets/attrs-step/stamina.svg",
    "/assets/attrs-step/agility.svg",
    "/assets/attrs-step/strength.svg",
    "/assets/attrs-step/intelligence.svg",
    "/assets/attrs-step/minus.svg",
    "/assets/attrs-step/plus.svg",
    "/assets/attrs-step/wallet.svg",
  ].forEach((url) => {
    const img = new Image();
    img.src = url;
  });
}

function getFightButtonMarkup({ isLoading = false, label = "Fight" } = {}) {
  if (isLoading) {
    return `
      <span class="fight-btn-spinner" aria-hidden="true"></span>
      <span>Preparing...</span>
    `;
  }

  return `
    <img src="/assets/dashboard/fight-bolt-white.svg" alt="" width="20" height="20" />
    <span>${label}</span>
  `;
}

function loadImageAsset(src) {
  const tryLoad = (crossOriginValue) =>
    new Promise((resolve, reject) => {
      const image = new Image();

      if (crossOriginValue) {
        image.crossOrigin = crossOriginValue;
      }

      image.decoding = "async";
      image.onload = async () => {
        if (typeof image.decode === "function") {
          try {
            await image.decode();
          } catch (_error) {
            // Ignore decode failures and keep the loaded image.
          }
        }

        resolve(image);
      };
      image.onerror = () => reject(new Error(`Unable to load image: ${src}`));
      image.src = src;
    });

  if (!/^https?:\/\//i.test(src)) {
    return tryLoad("");
  }

  return tryLoad("anonymous").catch(() => tryLoad(""));
}

async function downscaleArenaImage(image, fallbackSrc) {
  const maxSide = Math.max(image.naturalWidth || 0, image.naturalHeight || 0);
  if (maxSide <= ARENA_IMAGE_TARGET_SIZE) {
    return fallbackSrc;
  }

  try {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) {
      return fallbackSrc;
    }

    canvas.width = ARENA_IMAGE_TARGET_SIZE;
    canvas.height = ARENA_IMAGE_TARGET_SIZE;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(fallbackSrc);
            return;
          }

          resolve(URL.createObjectURL(blob));
        },
        "image/webp",
        0.86
      );
    });
  } catch (_error) {
    return fallbackSrc;
  }
}

function preloadAndOptimizeArenaImage(src) {
  const normalizedSrc = src || DEFAULT_CHARACTER_IMAGE;

  if (!arenaImagePromises.has(normalizedSrc)) {
    const imagePromise = loadImageAsset(normalizedSrc)
      .then((image) => downscaleArenaImage(image, normalizedSrc))
      .catch(() => normalizedSrc);

    arenaImagePromises.set(normalizedSrc, imagePromise);
  }

  return arenaImagePromises.get(normalizedSrc);
}

async function prepareArenaRecordImage(record) {
  const safeRecord = cloneBattleRecord(record);
  const sourceImageUrl = safeRecord.imageUrl || safeRecord.sourceImageUrl || DEFAULT_CHARACTER_IMAGE;
  const preparedImageUrl = await preloadAndOptimizeArenaImage(sourceImageUrl);

  return {
    ...safeRecord,
    sourceImageUrl,
    imageUrl: preparedImageUrl || sourceImageUrl,
  };
}

async function prepareArenaOpponentPool(opponentPool) {
  return Promise.all(opponentPool.map((record) => prepareArenaRecordImage(record)));
}

async function prepareArenaRevealCandidates(revealBundle, warmedPool = []) {
  const normalizedReveal = normalizeArenaRevealBundle(revealBundle);
  const selectedOpponentId = String(normalizedReveal?.selectedOpponent?.id || "").trim();

  if (!selectedOpponentId) {
    throw createArenaRevealError();
  }

  const mergedCandidates = mergeArenaRecordCollections([
    normalizedReveal.carouselCandidates,
    warmedPool,
  ]);
  const revealCandidates = mergedCandidates.filter((record) => String(record?.id || "").trim());

  if (!revealCandidates.length) {
    throw createArenaRevealError();
  }

  const preparedCandidates = await Promise.all(
    revealCandidates.map((record) => prepareArenaRecordImage(record))
  );
  const selectedOpponent =
    preparedCandidates.find((record) => String(record?.id || "") === selectedOpponentId) || null;

  if (!selectedOpponent) {
    throw createArenaRevealError();
  }

  setArenaRevealSession({
    ...(state.arenaRevealSession || {}),
    selectedOpponentId,
    status: "ready-to-spin",
    visibleCandidateIds: preparedCandidates.map((record) => String(record?.id || "")).filter(Boolean),
    preparedCandidateIds: preparedCandidates.map((record) => String(record?.id || "")).filter(Boolean),
    recoveryMessage: "",
  });

  return {
    selectedOpponent,
    preparedCandidates,
  };
}

function clearArenaOpponentCache() {
  arenaOpponentCache.walletKey = "";
  arenaOpponentCache.attackerPetId = "";
  arenaOpponentCache.preparedPool = [];
  arenaOpponentCache.warmedAt = 0;
  arenaOpponentCache.warmPromise = null;
}

function getArenaOpponentCacheKey() {
  return String(state.walletAddress || "").trim();
}

async function warmArenaOpponentPool(attackerPetId = getArenaStarterRecord()?.id, { force = false } = {}) {
  const normalizedAttackerPetId = String(attackerPetId || "").trim();
  const walletKey = getArenaOpponentCacheKey();

  if (!ENABLE_ARENA || !state.isAuthenticated || !walletKey || !normalizedAttackerPetId) {
    return [];
  }

  const isFresh =
    arenaOpponentCache.walletKey === walletKey &&
    arenaOpponentCache.preparedPool.length > 0 &&
    Date.now() - arenaOpponentCache.warmedAt < ARENA_OPPONENT_CACHE_TTL;

  if (!force && isFresh) {
    return arenaOpponentCache.preparedPool;
  }

  if (arenaOpponentCache.warmPromise && arenaOpponentCache.walletKey === walletKey) {
    return arenaOpponentCache.warmPromise;
  }

  arenaOpponentCache.walletKey = walletKey;
  arenaOpponentCache.attackerPetId = normalizedAttackerPetId;
  arenaOpponentCache.warmPromise = loadRealArenaOpponents(normalizedAttackerPetId)
    .then((opponentPool) => prepareArenaOpponentPool(opponentPool))
    .then((preparedPool) => {
      arenaOpponentCache.preparedPool = preparedPool;
      arenaOpponentCache.warmedAt = Date.now();
      arenaOpponentCache.warmPromise = null;
      return preparedPool;
    })
    .catch((error) => {
      arenaOpponentCache.warmPromise = null;
      throw error;
    });

  return arenaOpponentCache.warmPromise;
}

function preloadShareAsset(src) {
  const normalizedSrc = src || "";
  if (!normalizedSrc) {
    return Promise.reject(new Error("Share asset is missing."));
  }

  if (!shareAssetPromises.has(normalizedSrc)) {
    shareAssetPromises.set(normalizedSrc, loadImageAsset(normalizedSrc));
  }

  return shareAssetPromises.get(normalizedSrc);
}

function roundRectPath(context, x, y, width, height, radius) {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function fillRoundRect(context, x, y, width, height, radius, fillStyle) {
  context.save();
  context.fillStyle = fillStyle;
  roundRectPath(context, x, y, width, height, radius);
  context.fill();
  context.restore();
}

function strokeRoundRect(context, x, y, width, height, radius, strokeStyle, lineWidth) {
  context.save();
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  roundRectPath(context, x, y, width, height, radius);
  context.stroke();
  context.restore();
}

function drawCoverImage(context, image, x, y, width, height, radius = 0) {
  const sourceWidth = image.naturalWidth || image.width || width;
  const sourceHeight = image.naturalHeight || image.height || height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;

  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;

  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }

  context.save();
  if (radius > 0) {
    roundRectPath(context, x, y, width, height, radius);
    context.clip();
  }
  context.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  context.restore();
}

function fitCanvasFontSize(context, text, initialSize, minSize, maxWidth, weight = 700) {
  let fontSize = initialSize;

  while (fontSize > minSize) {
    context.font = `${weight} ${fontSize}px "Figtree", Arial, sans-serif`;
    if (context.measureText(text).width <= maxWidth) {
      return fontSize;
    }
    fontSize -= 2;
  }

  return minSize;
}

function trimCanvasLine(context, value, maxWidth) {
  const text = String(value || "");
  if (!text) return "";

  let trimmed = text;
  while (trimmed.length > 1 && context.measureText(`${trimmed}...`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }

  return `${trimmed}...`;
}

function wrapCanvasText(context, value, maxWidth, maxLines = Infinity) {
  const words = String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) {
    return [""];
  }

  const lines = [];
  let currentLine = words.shift() || "";

  words.forEach((word) => {
    const nextLine = `${currentLine} ${word}`.trim();
    if (context.measureText(nextLine).width <= maxWidth) {
      currentLine = nextLine;
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  lines.push(currentLine);

  if (lines.length <= maxLines) {
    return lines;
  }

  const limitedLines = lines.slice(0, maxLines);
  limitedLines[maxLines - 1] = trimCanvasLine(context, lines.slice(maxLines - 1).join(" "), maxWidth);
  return limitedLines;
}

function getCanvasLineTopOffset(fontSize, lineHeight) {
  return Math.max(0, (lineHeight - fontSize) / 2);
}

function getSuccessShareText(record = state.character) {
  const petName = getRecordDisplayName(record);
  return `Meet my pet ${petName}!\nHe is already prepared for battles on the @petixfun AI-driven battleground!`;
}

function getSuccessShareFileName(record = state.character) {
  const normalizedName = getRecordDisplayName(record)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return `${normalizedName || "pet"}-petix-share.png`;
}

function getSuccessShareCacheKey(record = state.character) {
  if (!record) return "";

  return JSON.stringify({
    id: record.id || "",
    name: getRecordDisplayName(record),
    imageUrl: record.imageUrl || "",
    level: getRecordLevel(record),
    experience: getRecordExperience(record),
    experienceForNextLevel: getRecordExperienceForNextLevel(record),
    rarity: record.rarity || "",
    attributes: record.attributes || {},
    power: getSelectedPowerDescription(record),
  });
}

function syncSuccessShareModalContent() {
  if (shareModalPreviewImage) {
    if (state.sharePreviewUrl) {
      shareModalPreviewImage.src = state.sharePreviewUrl;
    } else {
      shareModalPreviewImage.removeAttribute("src");
    }
  }

  if (shareModalText) {
    shareModalText.textContent = state.sharePreviewText || "";
  }
}

function syncSuccessShareModalState() {
  const hasPreview = Boolean(state.sharePreviewBlob && state.sharePreviewText);

  if (shareModalCopyBtn) {
    shareModalCopyBtn.disabled = !hasPreview || state.isSharing || state.isCopyingShareImage;
    shareModalCopyBtn.setAttribute("aria-busy", state.isCopyingShareImage ? "true" : "false");
    const label = shareModalCopyBtn.querySelector("span:last-child");
    if (label) {
      label.textContent = state.isCopyingShareImage ? "Copying..." : "Copy image";
    }
  }

  if (shareModalShareBtn) {
    shareModalShareBtn.disabled = !state.sharePreviewText || state.isSharing || state.isCopyingShareImage;
  }
}

function setSuccessSharePreview({
  cacheKey = "",
  blob = null,
  url = "",
  fileName = "",
  text = "",
} = {}) {
  if (state.sharePreviewUrl && state.sharePreviewUrl !== url) {
    URL.revokeObjectURL(state.sharePreviewUrl);
  }

  state.sharePreviewCacheKey = cacheKey;
  state.sharePreviewBlob = blob;
  state.sharePreviewUrl = url;
  state.sharePreviewFileName = fileName;
  state.sharePreviewText = text;

  syncSuccessShareModalContent();
  syncSuccessShareModalState();
}

function clearSuccessSharePreview() {
  setSuccessSharePreview();
}

function invalidateSuccessSharePreview(record = state.character) {
  if (!state.sharePreviewCacheKey) {
    return;
  }

  const nextCacheKey = getSuccessShareCacheKey(record);
  if (!nextCacheKey || nextCacheKey !== state.sharePreviewCacheKey) {
    clearSuccessSharePreview();
  }
}

function syncSuccessShareState() {
  if (shareSuccessBtn) {
    shareSuccessBtn.disabled = !state.character || state.isSharing;
    shareSuccessBtn.setAttribute("aria-busy", state.isSharing ? "true" : "false");

    const label = shareSuccessBtn.querySelector("span");
    if (label) {
      label.textContent = state.isSharing ? "Preparing..." : "Share";
    }
  }

  syncSuccessShareModalState();
}

function drawSuccessShareGrid(context) {
  const spacing = SUCCESS_SHARE_BACKGROUND_GRID_STEP * SUCCESS_SHARE_SCALE;

  context.save();
  context.strokeStyle = SUCCESS_SHARE_BACKGROUND_GRID_COLOR;
  context.lineWidth = 2;

  for (let offset = -SUCCESS_SHARE_HEIGHT; offset <= SUCCESS_SHARE_WIDTH + SUCCESS_SHARE_HEIGHT; offset += spacing) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset + SUCCESS_SHARE_HEIGHT, SUCCESS_SHARE_HEIGHT);
    context.stroke();
  }

  for (let offset = 0; offset <= SUCCESS_SHARE_WIDTH + SUCCESS_SHARE_HEIGHT; offset += spacing) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset - SUCCESS_SHARE_HEIGHT, SUCCESS_SHARE_HEIGHT);
    context.stroke();
  }

  context.restore();
}

function drawSuccessShareBackground(context, assets) {
  const scaleX = SUCCESS_SHARE_WIDTH / SUCCESS_SHARE_BACKGROUND_BASE_WIDTH;
  const scaleY = SUCCESS_SHARE_HEIGHT / SUCCESS_SHARE_BACKGROUND_BASE_HEIGHT;

  context.fillStyle = "#f9fafb";
  context.fillRect(0, 0, SUCCESS_SHARE_WIDTH, SUCCESS_SHARE_HEIGHT);
  drawSuccessShareGrid(context);

  SUCCESS_SHARE_BACKGROUND_GROUPS.forEach((group, groupIndex) => {
    group.items.forEach((item, itemIndex) => {
      const asset = assets.backgroundItems[groupIndex]?.[itemIndex];
      if (!asset) {
        return;
      }

      context.drawImage(
        asset,
        Math.round(item.x * scaleX),
        Math.round(item.y * scaleY),
        Math.round(item.width * scaleX),
        Math.round(item.height * scaleY)
      );
    });
  });

  context.drawImage(assets.logo, Math.round((SUCCESS_SHARE_WIDTH - 226) / 2), 48, 226, 78);
}

function drawSuccessShareCard(context, record, assets) {
  const cardWidth = 264 * SUCCESS_SHARE_SCALE;
  const cardHeight = 400 * SUCCESS_SHARE_SCALE;
  const cardX = Math.round((SUCCESS_SHARE_WIDTH - cardWidth) / 2);
  const cardY = Math.round((SUCCESS_SHARE_HEIGHT - cardHeight) / 2);
  const imageX = cardX + 8 * SUCCESS_SHARE_SCALE;
  const imageY = cardY + 48 * SUCCESS_SHARE_SCALE;
  const imageSize = 248 * SUCCESS_SHARE_SCALE;
  const expTrackWidth = 224 * SUCCESS_SHARE_SCALE;
  const rarity = getRarityMeta(record?.rarity);

  context.save();
  context.shadowColor = "rgba(16, 24, 40, 0.14)";
  context.shadowBlur = 64;
  context.shadowOffsetY = 32;
  fillRoundRect(context, cardX, cardY, cardWidth, cardHeight, 48, "#ffffff");
  context.restore();

  fillRoundRect(context, cardX, cardY, cardWidth, cardHeight, 48, "#ffffff");
  drawCoverImage(context, assets.character, imageX, imageY, imageSize, imageSize, 32);
  strokeRoundRect(context, imageX, imageY, imageSize, imageSize, 32, "#eaecf0", 4);
  strokeRoundRect(context, imageX + 2, imageY + 2, imageSize - 4, imageSize - 4, 30, "#ffffff", 2);

  context.save();
  context.fillStyle = "#101828";
  context.textAlign = "center";
  context.textBaseline = "top";
  const name = getRecordDisplayName(record);
  const titleFontSize = fitCanvasFontSize(
    context,
    name,
    32,
    24,
    cardWidth - 40 * SUCCESS_SHARE_SCALE,
    700
  );
  context.font = `700 ${titleFontSize}px "Figtree", Arial, sans-serif`;
  context.fillText(
    name,
    cardX + cardWidth / 2,
    cardY + 12 * SUCCESS_SHARE_SCALE + getCanvasLineTopOffset(titleFontSize, 24 * SUCCESS_SHARE_SCALE)
  );
  context.restore();

  context.save();
  context.fillStyle = "#101828";
  context.textAlign = "left";
  context.textBaseline = "top";
  const metaFontSize = 14 * SUCCESS_SHARE_SCALE;
  const metaLineHeight = 20 * SUCCESS_SHARE_SCALE;
  const metaTopOffset = getCanvasLineTopOffset(metaFontSize, metaLineHeight);
  context.font = `600 ${metaFontSize}px "Figtree", Arial, sans-serif`;
  context.fillText(
    `Lvl. ${getRecordLevel(record)}`,
    imageX + 12 * SUCCESS_SHARE_SCALE,
    imageY + 14 * SUCCESS_SHARE_SCALE + metaTopOffset
  );
  context.fillText(
    "Experience",
    imageX + 12 * SUCCESS_SHARE_SCALE,
    imageY + 204 * SUCCESS_SHARE_SCALE + metaTopOffset
  );
  context.textAlign = "right";
  context.fillText(
    `${getRecordExperience(record)}/${getRecordExperienceForNextLevel(record)}`,
    imageX + 236 * SUCCESS_SHARE_SCALE,
    imageY + 204 * SUCCESS_SHARE_SCALE + metaTopOffset
  );
  context.restore();

  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  const badgeText = rarity.label;
  context.font = `600 ${18 * SUCCESS_SHARE_SCALE}px "Figtree", Arial, sans-serif`;
  const badgePaddingX = 12 * SUCCESS_SHARE_SCALE;
  const badgeWidth = Math.ceil(context.measureText(badgeText).width + badgePaddingX * 2);
  const badgeHeight = 32 * SUCCESS_SHARE_SCALE;
  const badgeX = imageX + imageSize - badgeWidth - 8 * SUCCESS_SHARE_SCALE;
  const badgeY = imageY + 8 * SUCCESS_SHARE_SCALE;
  fillRoundRect(context, badgeX, badgeY, badgeWidth, badgeHeight, 16 * SUCCESS_SHARE_SCALE, rarity.color);
  strokeRoundRect(context, badgeX, badgeY, badgeWidth, badgeHeight, 16 * SUCCESS_SHARE_SCALE, "#ffffff", 4);
  context.fillStyle = "#ffffff";
  context.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + badgeHeight / 2 + 1);
  context.restore();

  fillRoundRect(
    context,
    imageX + 12 * SUCCESS_SHARE_SCALE,
    imageY + 228 * SUCCESS_SHARE_SCALE,
    expTrackWidth,
    8 * SUCCESS_SHARE_SCALE,
    8 * SUCCESS_SHARE_SCALE,
    "#ffffff"
  );
  strokeRoundRect(
    context,
    imageX + 12 * SUCCESS_SHARE_SCALE,
    imageY + 228 * SUCCESS_SHARE_SCALE,
    expTrackWidth,
    8 * SUCCESS_SHARE_SCALE,
    8 * SUCCESS_SHARE_SCALE,
    "#eaecf0",
    2
  );
  fillRoundRect(
    context,
    imageX + 12 * SUCCESS_SHARE_SCALE,
    imageY + 228 * SUCCESS_SHARE_SCALE,
    Math.max(12 * SUCCESS_SHARE_SCALE, (expTrackWidth * getRecordExperienceProgress(record)) / 100),
    8 * SUCCESS_SHARE_SCALE,
    8 * SUCCESS_SHARE_SCALE,
    "#101828"
  );

  const statsBaseX = cardX + 16 * SUCCESS_SHARE_SCALE;
  const statsBaseY = cardY + 312 * SUCCESS_SHARE_SCALE;

  ATTRS.forEach((attr, index) => {
    const icon = assets.attrIcons[index];
    const slotOffset = SUCCESS_SHARE_STAT_OFFSETS[index] ?? SUCCESS_SHARE_STAT_OFFSETS[0];
    const slotX = statsBaseX + slotOffset * SUCCESS_SHARE_SCALE;
    const value = Math.max(0, Math.floor(Number(record?.attributes?.[attr.key]) || 0));

    if (icon) {
      context.drawImage(icon, slotX, statsBaseY, 20 * SUCCESS_SHARE_SCALE, 20 * SUCCESS_SHARE_SCALE);
    }

    context.save();
    context.fillStyle = "#101828";
    context.textAlign = "left";
    context.textBaseline = "top";
    const statFontSize = 16 * SUCCESS_SHARE_SCALE;
    const statLineHeight = 20 * SUCCESS_SHARE_SCALE;
    context.font = `600 ${statFontSize}px "Figtree", Arial, sans-serif`;
    context.fillText(
      String(value),
      slotX + 28 * SUCCESS_SHARE_SCALE,
      statsBaseY + getCanvasLineTopOffset(statFontSize, statLineHeight)
    );
    context.restore();
  });

  const powerX = cardX + 8 * SUCCESS_SHARE_SCALE;
  const powerY = cardY + 344 * SUCCESS_SHARE_SCALE;
  const powerWidth = 248 * SUCCESS_SHARE_SCALE;
  const powerHeight = 48 * SUCCESS_SHARE_SCALE;
  const powerGradient = context.createLinearGradient(powerX, powerY, powerX + powerWidth, powerY);
  powerGradient.addColorStop(0, "rgba(255, 182, 215, 0.15)");
  powerGradient.addColorStop(0.44712, "rgba(255, 60, 255, 0.15)");
  powerGradient.addColorStop(1, "rgba(68, 227, 255, 0.15)");
  fillRoundRect(context, powerX, powerY, powerWidth, powerHeight, 20, powerGradient);

  context.drawImage(
    assets.powerIcon,
    powerX + 12 * SUCCESS_SHARE_SCALE,
    powerY + 14 * SUCCESS_SHARE_SCALE,
    20 * SUCCESS_SHARE_SCALE,
    20 * SUCCESS_SHARE_SCALE
  );

  context.save();
  context.fillStyle = "#101828";
  context.textAlign = "left";
  context.textBaseline = "top";
  const powerFontSize = 12 * SUCCESS_SHARE_SCALE;
  const powerLineHeight = 16 * SUCCESS_SHARE_SCALE;
  const powerTopOffset = getCanvasLineTopOffset(powerFontSize, powerLineHeight);
  context.font = `400 ${powerFontSize}px "Figtree", Arial, sans-serif`;
  const powerLines = wrapCanvasText(
    context,
    getSelectedPowerDescription(record),
    196 * SUCCESS_SHARE_SCALE,
    2
  );
  powerLines.forEach((line, index) => {
    context.fillText(
      line,
      powerX + 40 * SUCCESS_SHARE_SCALE,
      powerY + 8 * SUCCESS_SHARE_SCALE + powerTopOffset + index * powerLineHeight
    );
  });
  context.restore();
}

async function createSuccessShareBlob(record) {
  if (!record) {
    throw new Error("Character data is not ready yet.");
  }

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch (_error) {
      // Ignore font loading failures and continue with fallback fonts.
    }
  }

  const [background, character, powerIcon, ...attrIcons] = await Promise.all([
    preloadShareAsset(SUCCESS_SHARE_BACKGROUND),
    preloadShareAsset(record.imageUrl || DEFAULT_CHARACTER_IMAGE),
    preloadShareAsset(SUCCESS_POWER_ICON),
    ...ATTRS.map((attr) => preloadShareAsset(attr.icon)),
  ]);

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas is not available in this browser.");
  }

  canvas.width = SUCCESS_SHARE_WIDTH;
  canvas.height = SUCCESS_SHARE_HEIGHT;

  drawCoverImage(context, background, 0, 0, canvas.width, canvas.height);

  drawSuccessShareCard(context, record, {
    character,
    powerIcon,
    attrIcons,
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to generate the share image."));
          return;
        }
        resolve(blob);
      },
      "image/png",
      1
    );
  });
}

async function ensureSuccessSharePreview(record = state.character) {
  if (!record) {
    throw new Error("Character data is not ready yet.");
  }

  const cacheKey = getSuccessShareCacheKey(record);
  if (cacheKey && state.sharePreviewCacheKey === cacheKey && state.sharePreviewBlob && state.sharePreviewUrl) {
    return {
      blob: state.sharePreviewBlob,
      fileName: state.sharePreviewFileName,
      text: state.sharePreviewText,
      url: state.sharePreviewUrl,
    };
  }

  const shareText = getSuccessShareText(record);
  const shareBlob = await createSuccessShareBlob(record);
  const fileName = getSuccessShareFileName(record);
  const previewUrl = URL.createObjectURL(shareBlob);

  setSuccessSharePreview({
    cacheKey,
    blob: shareBlob,
    url: previewUrl,
    fileName,
    text: shareText,
  });

  return {
    blob: shareBlob,
    fileName,
    text: shareText,
    url: previewUrl,
  };
}

async function copyShareImageToClipboard(blob) {
  if (
    !navigator.clipboard?.write ||
    typeof window.ClipboardItem !== "function" ||
    !blob ||
    blob.type !== "image/png"
  ) {
    return false;
  }

  await navigator.clipboard.write([new window.ClipboardItem({ [blob.type]: blob })]);
  return true;
}

function openSuccessShareIntent(text) {
  const intentUrl = `${SUCCESS_SHARE_INTENT_URL}?${new URLSearchParams({ text }).toString()}`;
  const popup = window.open(intentUrl, "_blank", "noopener,noreferrer");
  return Boolean(popup);
}

function openSuccessShareModal() {
  if (!shareModalOverlay) {
    return;
  }

  state.isShareModalOpen = true;
  shareModalOverlay.classList.remove("hidden");
  shareModalOverlay.setAttribute("aria-hidden", "false");
  document.body.classList.add("share-modal-open");
  syncSuccessShareModalContent();
  syncSuccessShareModalState();
  window.requestAnimationFrame(() => {
    shareModalClose?.focus();
  });
}

function closeSuccessShareModal({ restoreFocus = true } = {}) {
  if (!shareModalOverlay) {
    return;
  }

  state.isShareModalOpen = false;
  shareModalOverlay.classList.add("hidden");
  shareModalOverlay.setAttribute("aria-hidden", "true");
  document.body.classList.remove("share-modal-open");

  if (restoreFocus) {
    window.requestAnimationFrame(() => {
      shareSuccessBtn?.focus();
    });
  }
}

async function shareSuccessCharacter() {
  if (state.isSharing || !state.character) {
    return;
  }

  state.isSharing = true;
  syncSuccessShareState();

  try {
    await ensureSuccessSharePreview(state.character);
    openSuccessShareModal();
  } catch (error) {
    const message =
      typeof error?.message === "string" ? error.message : "Couldn't prepare the share image.";
    showToast(message);
  } finally {
    state.isSharing = false;
    syncSuccessShareState();
  }
}

async function copySuccessShareImage() {
  if (state.isCopyingShareImage) {
    return;
  }

  state.isCopyingShareImage = true;
  syncSuccessShareModalState();

  try {
    const { blob } = await ensureSuccessSharePreview(state.character);
    const copied = await copyShareImageToClipboard(blob);

    if (!copied) {
      showToast("Image copy isn't supported in this browser.");
      return;
    }

    showToast("Image copied. Paste it into your X post.");
  } catch (error) {
    const message =
      typeof error?.message === "string" ? error.message : "Couldn't copy the share image.";
    showToast(message);
  } finally {
    state.isCopyingShareImage = false;
    syncSuccessShareModalState();
  }
}

function shareSuccessToX() {
  const shareText = state.sharePreviewText || getSuccessShareText(state.character);
  if (!shareText) {
    showToast("Couldn't prepare the tweet text.");
    return;
  }

  const composerOpened = openSuccessShareIntent(shareText);
  if (!composerOpened) {
    showToast("Couldn't open X. Please allow popups and try again.");
    return;
  }

  showToast("X composer opened in a new tab.");
}

async function loadRealArenaOpponents(attackerPetId) {
  const query = new URLSearchParams({
    attackerPetId: String(attackerPetId || ""),
    limit: String(ARENA_OPPONENT_SELECTION_LIMIT),
  });
  const payload = await apiRequest(`/api/battles/opponents?${query.toString()}`, undefined, "GET");

  return Array.isArray(payload?.opponents)
    ? payload.opponents.map((record) => normalizeArenaOpponentRecord(record)).filter(Boolean)
    : [];
}

async function createArenaBattleRecord(attackerPetId) {
  return apiRequest("/api/battles", {
    attackerPetId: String(attackerPetId || ""),
  });
}

async function fetchArenaBattleRecord(battleId) {
  return apiRequest(`/api/battles/${encodeURIComponent(String(battleId || ""))}`, undefined, "GET");
}

async function pollArenaBattleRecord(battleId, {
  attempts = ARENA_BATTLE_POLL_ATTEMPTS,
  interval = ARENA_BATTLE_POLL_INTERVAL,
} = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let payload = null;
    try {
      payload = await fetchArenaBattleRecord(battleId);
    } catch (error) {
      if (error?.code !== "BATTLE_NOT_FOUND") {
        throw error;
      }
    }

    if (payload?.status === "ready") {
      return payload;
    }

    if (payload?.status === "failed") {
      throw new Error(payload.error || "Battle generation failed.");
    }

    if (attempt < attempts - 1) {
      await wait(interval);
    }
  }

  throw new Error("Battle result is taking too long. Please try again.");
}

async function refreshArenaProfileState() {
  return refreshBattleStateFromServer({ force: true, minIntervalMs: 0 });
}

async function fetchArenaBattleHistory({ cursor = "", limit = 8 } = {}) {
  const query = new URLSearchParams();
  if (cursor) {
    query.set("cursor", String(cursor));
  }
  if (limit) {
    query.set("limit", String(limit));
  }

  const suffix = query.toString() ? `?${query.toString()}` : "";
  return apiRequest(`/api/battles${suffix}`, undefined, "GET");
}

function getArenaHistoryWalletKey() {
  return String(state.walletAddress || "").trim();
}

function getSelectedArenaBattleId() {
  return String(
    state.activeBattle?.battleId ||
      state.arenaReplayRequest?.battleId ||
      state.arenaSelectedHistoryBattleId ||
      ""
  ).trim();
}

function clearArenaReplayRequest() {
  state.arenaReplayRequest = null;
}

function resetArenaHistoryState() {
  state.arenaHistoryEntries = [];
  state.arenaHistoryNextCursor = "";
  state.arenaHistoryHasMore = false;
  state.hasLoadedArenaHistory = false;
  state.isArenaHistoryLoading = false;
  state.arenaHistoryErrorMessage = "";
  state.arenaHistoryWalletKey = getArenaHistoryWalletKey();
}

function normalizeArenaHistoryEntry(entry) {
  if (!entry?.battleId) {
    return null;
  }

  return {
    battleId: String(entry.battleId),
    playerRole: String(entry.playerRole || "attacker"),
    outcome: String(entry.outcome || "loss"),
    createdAt: entry.createdAt || null,
    completedAt: entry.completedAt || null,
    finalSummaryText: String(entry.finalSummaryText || "").trim(),
    replayUrl: String(entry.replayUrl || "").trim(),
    playerPet: entry.playerPet
      ? {
          ...entry.playerPet,
          imageUrl: toApiUrl(entry.playerPet.imageUrl || DEFAULT_CHARACTER_IMAGE),
        }
      : null,
    opponentPet: entry.opponentPet
      ? {
          ...entry.opponentPet,
          imageUrl: toApiUrl(entry.opponentPet.imageUrl || DEFAULT_CHARACTER_IMAGE),
        }
      : null,
  };
}

async function loadArenaHistory({ append = false, force = false } = {}) {
  if (!state.isAuthenticated) {
    resetArenaHistoryState();
    renderArena();
    return [];
  }

  const walletKey = getArenaHistoryWalletKey();
  const shouldReset = force || !append || state.arenaHistoryWalletKey !== walletKey;

  if (state.isArenaHistoryLoading) {
    return state.arenaHistoryEntries;
  }

  if (!shouldReset && state.hasLoadedArenaHistory && !state.arenaHistoryHasMore) {
    return state.arenaHistoryEntries;
  }

  state.isArenaHistoryLoading = true;
  state.arenaHistoryErrorMessage = "";
  if (shouldReset) {
    state.arenaHistoryWalletKey = walletKey;
  }
  renderArena();

  try {
    const payload = await fetchArenaBattleHistory({
      cursor: append ? state.arenaHistoryNextCursor : "",
    });
    const nextEntries = Array.isArray(payload?.history)
      ? payload.history.map(normalizeArenaHistoryEntry).filter(Boolean)
      : [];

    state.arenaHistoryEntries = append ? [...state.arenaHistoryEntries, ...nextEntries] : nextEntries;
    state.arenaHistoryNextCursor = String(payload?.page?.nextCursor || "").trim();
    state.arenaHistoryHasMore = Boolean(payload?.page?.hasMore && state.arenaHistoryNextCursor);
    state.hasLoadedArenaHistory = true;
    state.arenaHistoryWalletKey = walletKey;

    return state.arenaHistoryEntries;
  } catch (error) {
    state.arenaHistoryErrorMessage =
      error.message || "Couldn't load battle history right now. Please try again.";
    if (!append) {
      state.arenaHistoryEntries = [];
      state.arenaHistoryNextCursor = "";
      state.arenaHistoryHasMore = false;
    }
    throw error;
  } finally {
    state.isArenaHistoryLoading = false;
    renderArena();
  }
}

async function ensureArenaHistoryLoaded({ force = false } = {}) {
  if (!state.isAuthenticated) {
    return [];
  }

  if (!force && state.hasLoadedArenaHistory && state.arenaHistoryWalletKey === getArenaHistoryWalletKey()) {
    return state.arenaHistoryEntries;
  }

  return loadArenaHistory({ force });
}

async function loadMoreArenaHistory() {
  if (!state.arenaHistoryHasMore || state.isArenaHistoryLoading) {
    return;
  }

  try {
    await loadArenaHistory({ append: true });
  } catch (_error) {
    showToast(state.arenaHistoryErrorMessage || "Couldn't load older battles.");
  }
}

function resolveArenaReplayMessage(error) {
  const normalizedMessage = String(error?.message || "").trim();
  const normalizedCode = String(error?.code || "").trim();

  if (normalizedCode === "BATTLE_REPLAY_FORBIDDEN" || /not available to the current wallet/i.test(normalizedMessage)) {
    return "This replay is available only to the wallets that took part in the battle.";
  }

  if (normalizedCode === "BATTLE_NOT_FOUND" || /replay is not available/i.test(normalizedMessage)) {
    return "This replay couldn't be found anymore. Open Arena history to choose another battle.";
  }

  if (/timing|too long/i.test(normalizedMessage)) {
    return "This replay is still getting ready. Please try again in a moment.";
  }

  return normalizedMessage || "This replay isn't available right now. Try another battle from Arena history.";
}

function setArenaReplayRequest(battleId, status, message, source = "link") {
  state.arenaReplayRequest = {
    battleId: String(battleId || "").trim(),
    status,
    message: String(message || "").trim(),
    source,
  };
}

async function buildArenaReplayBattle(readyBattle) {
  const resolvedInitiator = mapBattleParticipantToArenaRecord(readyBattle?.attacker);
  const resolvedOpponent = mapBattleParticipantToArenaRecord(readyBattle?.defender);
  const [preparedInitiator, preparedOpponent] = await Promise.all([
    prepareArenaRecordImage(resolvedInitiator),
    prepareArenaRecordImage(resolvedOpponent),
  ]);

  return createResolvedArenaBattle({
    battlePayload: readyBattle,
    preparedInitiator,
    preparedOpponent,
    preparedPool: [preparedOpponent],
    initialPhase: "battle-enter",
    isReplay: true,
  });
}

async function ensureArenaReplayBattle(battleId, { source = "link" } = {}) {
  const normalizedBattleId = String(battleId || "").trim();
  if (!normalizedBattleId) {
    clearArenaReplayRequest();
    return false;
  }

  clearArenaAnimation();
  state.activeBattle = null;
  state.arenaSelectedHistoryBattleId = normalizedBattleId;
  setArenaReplayRequest(normalizedBattleId, "loading", "Loading battle replay...", source);
  renderArena();

  try {
    const initialBattle = await fetchArenaBattleRecord(normalizedBattleId);

    if (initialBattle?.status === "ready") {
      state.activeBattle = await buildArenaReplayBattle(initialBattle);
      clearArenaReplayRequest();
      return true;
    }

    if (initialBattle?.status === "generating") {
      setArenaReplayRequest(
        normalizedBattleId,
        "waiting",
        "This replay is still getting ready. We'll open it as soon as it finishes.",
        source
      );
      renderArena();
      const readyBattle = await pollArenaBattleRecord(normalizedBattleId);
      state.activeBattle = await buildArenaReplayBattle(readyBattle);
      clearArenaReplayRequest();
      return true;
    }

    throw new Error("This replay isn't available right now.");
  } catch (error) {
    setArenaReplayRequest(normalizedBattleId, "unavailable", resolveArenaReplayMessage(error), source);
    state.activeBattle = null;
    renderArena();
    return false;
  }
}

async function openArenaReplayBattle(battleId, { source = "history", pushRoute = true } = {}) {
  const normalizedBattleId = String(battleId || "").trim();
  if (!normalizedBattleId) {
    return false;
  }

  const isReady = await ensureArenaReplayBattle(normalizedBattleId, { source });
  syncDashboardRouteState("arena", {
    battleId: normalizedBattleId,
    replace: !pushRoute,
  });
  moveTo("arena");
  return isReady;
}

function closeArenaReplayBattle({ keepSelection = true } = {}) {
  const selectedBattleId = keepSelection ? getSelectedArenaBattleId() : "";
  clearArenaAnimation();
  state.activeBattle = null;
  clearArenaReplayRequest();
  state.isFightPreparing = false;
  state.fightPreparingCharacterId = "";
  state.arenaSelectedHistoryBattleId = keepSelection ? selectedBattleId : "";
  syncDashboardRouteState("arena", { battleId: "", replace: true });
  renderArena();
}

function mapBattleParticipantToArenaRecord(participant, fallbackRecord = null) {
  const baseRecord = fallbackRecord ? cloneBattleRecord(fallbackRecord) : cloneBattleRecord({
    id: participant?.id,
    name: participant?.name,
    displayName: participant?.name,
    creatureType: participant?.type,
    rarity: participant?.rarity,
    imageUrl: participant?.imageUrl ? toApiUrl(participant.imageUrl) : DEFAULT_CHARACTER_IMAGE,
    level: participant?.level,
    selectedPower: participant?.selectedPower,
    attributes: participant?.attributes,
  });

  return cloneBattleRecord({
    ...baseRecord,
    id: participant?.id || baseRecord?.id,
    name: participant?.name || baseRecord?.name,
    displayName: participant?.name || baseRecord?.displayName,
    creatureType: participant?.type || baseRecord?.creatureType,
    rarity: participant?.rarity || baseRecord?.rarity,
    imageUrl: participant?.imageUrl ? toApiUrl(participant.imageUrl) : baseRecord?.imageUrl,
    level: participant?.level ?? baseRecord?.level,
    maxHp: Math.max(1, Math.floor(Number(participant?.maxHp) || Number(baseRecord?.maxHp) || 1)),
    selectedPower: participant?.selectedPower
      ? { ...(baseRecord?.selectedPower || {}), ...participant.selectedPower }
      : baseRecord?.selectedPower,
    attributes: participant?.attributes
      ? {
          ...createEmptyAttrs(),
          ...participant.attributes,
        }
      : {
          ...createEmptyAttrs(),
          ...(baseRecord?.attributes || {}),
        },
    traits: participant?.traits || baseRecord?.traits || null,
  });
}

function mergeArenaBattlePool(preparedPool, preparedOpponent) {
  const safePool = Array.isArray(preparedPool) ? preparedPool : [];
  const opponentId = String(preparedOpponent?.id || "");
  const withoutOpponent = safePool.filter((record) => String(record?.id || "") !== opponentId);

  if (!opponentId) {
    return withoutOpponent;
  }

  return [preparedOpponent, ...withoutOpponent];
}

function createResolvedArenaBattle({
  battlePayload,
  preparedInitiator,
  preparedOpponent,
  preparedPool,
  initialPhase = "roulette",
  isReplay = false,
}) {
  const pool = mergeArenaBattlePool(preparedPool, preparedOpponent);
  const sequencePool = pool.length ? pool : [preparedOpponent];
  const { sequence, targetSequenceIndex } = buildArenaSequence(sequencePool, preparedOpponent);
  const isBattlePhase = isArenaBattleScreenPhase(initialPhase);
  const hasPassedFocusPhase = initialPhase !== "roulette" && initialPhase !== "focus";
  const hasPassedVersusPhase = hasPassedFocusPhase && initialPhase !== "versus";
  const battleRecordId = String(battlePayload?.id || battlePayload?.battleId || `arena-${Date.now()}`);
  const battlePublicId = String(battlePayload?.id || battlePayload?.battleId || "");

  return {
    id: battleRecordId,
    battleId: battlePublicId,
    initiator: preparedInitiator,
    opponent: preparedOpponent,
    pool: sequencePool,
    sequence,
    targetSequenceIndex,
    phase: initialPhase,
    trackX: isBattlePhase ? null : undefined,
    rouletteStarted: initialPhase !== "roulette",
    focusScheduled: hasPassedFocusPhase,
    versusRendered: hasPassedVersusPhase,
    battleEnterStarted: initialPhase === "battle",
    resultEnterStarted: initialPhase === "battle-result",
    resultScreenScheduled: initialPhase === "battle-result",
    resolvedBattle: battlePayload,
    isReplay,
  };
}

function applyChipIcon(chip, visualState) {
  const type = chip.dataset.type || "";
  const iconSet = TYPE_META[type]?.[visualState] || TYPE_META[type]?.default;
  if (!iconSet) return;

  const primary = chip.querySelector(".type-chip-icon-primary");
  const secondary = chip.querySelector(".type-chip-icon-secondary");
  if (primary) primary.src = iconSet.primary || "";
  if (secondary) {
    if (iconSet.secondary) {
      secondary.src = iconSet.secondary;
      secondary.classList.remove("hidden");
    } else {
      secondary.src = "";
      secondary.classList.add("hidden");
    }
  }
}

function renderTypeStep() {
  const chips = [...document.querySelectorAll(".type-chip")];
  chips.forEach((chip) => {
    const isActive = chip.dataset.type === state.selectedType;
    chip.classList.toggle("active", isActive);
    applyChipIcon(chip, isActive ? "active" : "default");
  });

  const isOther = state.selectedType === "Other";
  otherInputWrap.classList.toggle("hidden", !isOther);
  if (isOther) {
    window.requestAnimationFrame(() => {
      otherTypeInput.focus();
      const length = otherTypeInput.value.length;
      otherTypeInput.setSelectionRange(length, length);
    });
  }

  updateTypeContinueState();
}

function renderPowersStep() {
  const powers = getPowerOptions();
  const hasSelected = powers.some((item) => item.id === state.selectedPowerId);
  const characterName = getCurrentCharacterName();

  powersGrid.innerHTML = "";
  powersTitle.textContent = characterName
    ? `Choose a power for ${characterName}`
    : "Choose a power for your pet";
  powersContinueBtn.disabled = !hasSelected || state.isSavingPower;
  powersContinueBtn.classList.toggle("enabled", hasSelected && !state.isSavingPower);

  powers.forEach((power) => {
    const isActive = power.id === state.selectedPowerId;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "power-card";
    card.dataset.powerId = power.id;
    card.classList.toggle("active", isActive);
    card.innerHTML = `
      <img class="power-card-icon" src="${isActive ? POWER_ICONS.active : POWER_ICONS.default}" alt="" width="20" height="20" />
      <p>${power.description}</p>
    `;

    card.addEventListener("click", () => {
      if (state.isSavingPower || state.selectedPowerId === power.id) return;
      state.selectedPowerId = power.id;
      renderPowersStep();
    });

    powersGrid.appendChild(card);
  });
}

function pointsRemaining() {
  const spendTotal = Object.values(state.attrs).reduce(
    (sum, value) => sum + Math.max(0, Math.floor(Number(value) || 0)),
    0
  );

  if (isUpgradeStep()) {
    return getRecordAttributePointsAvailable(getSelectedUpgradeRecord()) - spendTotal;
  }

  return getAttributePointBudget() - spendTotal;
}

function updateAttrsButtonState() {
  const left = pointsRemaining();
  const clampedLeft = Math.max(0, left);
  const upgradeRecord = getSelectedUpgradeRecord();
  const availablePoints = getRecordAttributePointsAvailable(upgradeRecord);
  const ctaState = isUpgradeStep()
    ? getUpgradeCtaState({
        availablePoints,
        isMobileUpgradeViewport: isMobileUpgradeViewport(),
        isSaving: state.isSavingUpgrade,
        remainingPoints: clampedLeft,
      })
    : {
        label: "Continue",
        ready: left === 0 && !state.isCreating,
      };

  pointsLeft.textContent = String(clampedLeft);

  attrsContinueBtn.disabled = !ctaState.ready;
  attrsContinueBtn.textContent = ctaState.label;
  attrsContinueBtn.classList.toggle("enabled", ctaState.ready);
  attrsContinueBtn.classList.toggle("mobile-hidden", !ctaState.ready && !isUpgradeStep());

  if (attrsSidePanel) {
    attrsSidePanel.classList.toggle("is-ready", ctaState.ready && !isMobileUpgradeViewport());
  }
}

function suppressAttrsScreenDoubleTapZoom() {
  if (!screenAttrs || screenAttrs.dataset.doubleTapGuard === "true") return;

  screenAttrs.dataset.doubleTapGuard = "true";
  screenAttrs.style.touchAction = "manipulation";

  screenAttrs.addEventListener("dblclick", (event) => {
    event.preventDefault();
  });

  screenAttrs.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now();
      if (now - lastAttrsScreenTouchEndAt < 350) {
        event.preventDefault();
      }
      lastAttrsScreenTouchEndAt = now;
    },
    { passive: false }
  );
}

function suppressAttributeDoubleTapZoom(button) {
  if (!button || button.dataset.doubleTapGuard === "true") return;

  button.dataset.doubleTapGuard = "true";
  button.style.touchAction = "manipulation";

  button.addEventListener("dblclick", (event) => {
    event.preventDefault();
  });

  button.addEventListener(
    "touchend",
    (event) => {
      const now = Date.now();
      if (now - lastAttrTouchEndAt < 350) {
        event.preventDefault();
      }
      lastAttrTouchEndAt = now;
    },
    { passive: false }
  );
}

function ensureAttrsRows() {
  suppressAttrsScreenDoubleTapZoom();

  const totalSegments = getAttributeScreenScaleBudget();
  const mode = getAttributeScreenMode();
  if (attrsRowsBudget === totalSegments && attrsRowsMode === mode) return;

  attrsList.innerHTML = "";

  ATTRS.forEach((attr) => {
    const segments = Array.from({ length: totalSegments }, (_, index) => {
      const classes = ["attr-segment"];
      if (index === 0) classes.push("first");
      if (index === totalSegments - 1) classes.push("last");
      return `<span class="${classes.join(" ")}"></span>`;
    }).join("");

    const row = document.createElement("div");
    row.className = "attr-row";
    row.dataset.attr = attr.key;
    row.innerHTML = `
      <div class="attr-row-top">
        <div class="attr-info">
          <div class="attr-heading">
            <img class="attr-icon" src="${attr.icon}" alt="" width="20" height="20" />
            <h3>${attr.label}</h3>
          </div>
          <p>${attr.desc}</p>
        </div>
        <div class="attr-controls">
          <span class="attr-value" data-role="value">0</span>
          <span class="attr-delta hidden" data-role="delta">+0</span>
          <button class="attr-btn" type="button" data-action="minus" disabled>
            <img src="/assets/attrs-step/minus.svg" alt="" width="20" height="20" />
          </button>
          <button class="attr-btn" type="button" data-action="plus">
            <img src="/assets/attrs-step/plus.svg" alt="" width="20" height="20" />
          </button>
        </div>
      </div>
      <div class="attr-scale" style="grid-template-columns: repeat(${totalSegments}, minmax(0, 1fr));">${segments}</div>
    `;

    const minusBtn = row.querySelector('[data-action="minus"]');
    const plusBtn = row.querySelector('[data-action="plus"]');

    suppressAttributeDoubleTapZoom(minusBtn);
    suppressAttributeDoubleTapZoom(plusBtn);

    minusBtn.addEventListener("click", () => {
      if (state.attrs[attr.key] <= 0 || state.isCreating || state.isSavingUpgrade) return;
      state.attrs[attr.key] -= 1;
      updateAttrsStep();
    });

    plusBtn.addEventListener("click", () => {
      const reachedCreateCap = !isUpgradeStep() && state.attrs[attr.key] >= DEFAULT_ATTRIBUTE_POINTS;
      if (
        reachedCreateCap ||
        pointsRemaining() <= 0 ||
        state.isCreating ||
        state.isSavingUpgrade
      ) {
        return;
      }
      state.attrs[attr.key] += 1;
      updateAttrsStep();
    });

    attrsList.appendChild(row);
  });

  attrsRowsBudget = totalSegments;
  attrsRowsMode = mode;
}

function updateAttrsStep() {
  const upgradeState = isUpgradeStep() ? getUpgradeRouteState() : null;
  if (upgradeState?.blocked) {
    updateAttrsButtonState();
    return;
  }

  ensureAttrsRows();

  ATTRS.forEach((attr) => {
    const row = attrsList.querySelector(`[data-attr="${attr.key}"]`);
    if (!row) return;

    const value = Math.max(0, Math.floor(Number(state.attrs[attr.key]) || 0));
    const totalValue = getAttributeDisplayValue(attr.key, upgradeState?.record || undefined);
    const canMinus = value > 0 && !state.isCreating && !state.isSavingUpgrade;
    const canPlus =
      pointsRemaining() > 0 &&
      (!isUpgradeStep() ? value < DEFAULT_ATTRIBUTE_POINTS : true) &&
      !state.isCreating &&
      !state.isSavingUpgrade;
    const minusBtn = row.querySelector('[data-action="minus"]');
    const plusBtn = row.querySelector('[data-action="plus"]');
    const segments = row.querySelectorAll(".attr-segment");
    const valueLabel = row.querySelector('[data-role="value"]');
    const deltaLabel = row.querySelector('[data-role="delta"]');

    if (minusBtn) minusBtn.disabled = !canMinus;
    if (plusBtn) plusBtn.disabled = !canPlus;
    if (valueLabel) {
      valueLabel.textContent = isUpgradeStep() ? String(totalValue) : String(value);
    }
    if (deltaLabel) {
      deltaLabel.textContent = `+${value}`;
      deltaLabel.classList.toggle("hidden", !isUpgradeStep() || value <= 0);
    }

    segments.forEach((segment, index) => {
      segment.classList.toggle("filled", index < totalValue);
    });
  });

  updateAttrsButtonState();
}

function renderAttrsPetCard(record) {
  const resolvedRecord = record || getActiveRecord();
  const imageUrl = resolvedRecord?.imageUrl || DEFAULT_CHARACTER_IMAGE;
  const creatureType = resolvedRecord?.creatureType || "";

  setCharacterImages(imageUrl, creatureType);
  applyRarityBadge(attrsPetRarity, resolvedRecord?.rarity);

  if (attrsPetName) {
    attrsPetName.textContent = getRecordDisplayName(resolvedRecord);
  }
  if (attrsPetLevel) {
    attrsPetLevel.textContent = `Lvl. ${getRecordLevel(resolvedRecord)}`;
  }
  if (attrsExpValue) {
    attrsExpValue.textContent = `${getRecordExperience(resolvedRecord)}/${getRecordExperienceForNextLevel(resolvedRecord)}`;
  }
  if (attrsExpProgress) {
    attrsExpProgress.style.width = `${getRecordExperienceProgress(resolvedRecord)}%`;
  }
}

function renderUpgradeSummary() {
  if (!attrsUpgradeSummary || !attrsUpgradeSummaryList) return;
  attrsUpgradeSummary.classList.add("hidden");
  attrsUpgradeSummaryList.innerHTML = "";
}

function renderAttrsStep() {
  const upgradeState = isUpgradeStep() ? getUpgradeRouteState() : null;
  const isBlocked = Boolean(upgradeState?.blocked);
  const screenRecord = upgradeState?.record || getAttributeScreenRecord();
  const isUpgradeMode = isUpgradeStep();

  if (screenAttrs) {
    screenAttrs.classList.toggle("is-upgrade-mode", isUpgradeMode);
  }

  if (backToPowersBtn) {
    backToPowersBtn.classList.remove("hidden");
    backToPowersBtn.textContent = isUpgradeMode ? "← My Pets" : "← Back";
  }

  if (attrsTitle) {
    attrsTitle.textContent = isUpgradeMode
      ? upgradeState?.record
        ? `Upgrade ${getRecordDisplayName(upgradeState.record)}`
        : "Upgrade pet"
      : "Distribute attributes";
  }
  if (attrsDescription) {
    attrsDescription.textContent = isUpgradeMode
      ? "Spend newly earned upgrade points on your pet's combat stats."
      : "Attributes increase your battle advantage.";
  }
  if (attrsPointsLabel) {
    attrsPointsLabel.innerHTML = isUpgradeMode ? "Points<br />left to spend" : "Points<br />to distribute";
  }
  if (attrsContinueBtn) {
    attrsContinueBtn.classList.toggle("hidden", isBlocked);
  }
  if (attrsBlockedState) {
    attrsBlockedState.classList.toggle("hidden", !isBlocked);
  }
  if (attrsBlockedTitle) {
    attrsBlockedTitle.textContent = upgradeState?.title || "Upgrade unavailable";
  }
  if (attrsBlockedText) {
    attrsBlockedText.textContent =
      upgradeState?.description || "This pet can't be upgraded right now.";
  }
  if (attrsList) {
    attrsList.classList.toggle("hidden", isBlocked);
  }
  if (attrsHoldCopy) {
    attrsHoldCopy.classList.toggle("hidden", isUpgradeMode);
  }
  if (attrsRewardsWrap) {
    attrsRewardsWrap.classList.toggle("hidden", isUpgradeMode);
  }

  renderAttrsPetCard(screenRecord);
  renderUpgradeSummary();
  updateAttrsStep();
}

function suppressRewardsTooltip() {
  document.body.classList.add("suppress-rewards-tooltip");

  if (suppressRewardsTooltipTimeout) {
    window.clearTimeout(suppressRewardsTooltipTimeout);
  }

  const clearSuppression = () => {
    document.body.classList.remove("suppress-rewards-tooltip");
    window.removeEventListener("pointermove", handlePointerMove);
    suppressRewardsTooltipTimeout = null;
  };

  const handlePointerMove = () => {
    clearSuppression();
  };

  window.addEventListener("pointermove", handlePointerMove, { once: true });
  suppressRewardsTooltipTimeout = window.setTimeout(clearSuppression, 300);
}

function getRecordDisplayName(record) {
  return record?.name || record?.displayName || record?.creatureType || "Unknown pet";
}

function cloneBattleRecord(record) {
  if (!record) return null;

  return {
    ...record,
    level: getRecordLevel(record),
    experience: getRecordExperience(record),
    experienceForNextLevel: getRecordExperienceForNextLevel(record),
    imageUrl: record.imageUrl || DEFAULT_CHARACTER_IMAGE,
    attributes: {
      ...createEmptyAttrs(),
      ...(record.attributes || {}),
    },
    selectedPower: record.selectedPower
      ? { ...record.selectedPower }
      : { description: "Power not selected yet" },
  };
}

function updateEnergyUi() {
  if (!dashboardEnergy || !dashboardEnergyCurrent) return;

  dashboardEnergyCurrent.textContent = String(state.energyCurrent);
  dashboardEnergy.setAttribute("aria-label", `Energy ${state.energyCurrent}`);

  const isEmptyEnergy = state.energyCurrent <= 0;
  dashboardEnergy.classList.toggle("has-empty-energy", isEmptyEnergy);

  if (dashboardEnergyTooltip) {
    dashboardEnergyTooltip.setAttribute("aria-hidden", isEmptyEnergy ? "false" : "true");
  }

  if (isEmptyEnergy) {
    dashboardEnergy.setAttribute("tabindex", "0");
    if (dashboardEnergyTooltip) {
      dashboardEnergy.setAttribute("aria-describedby", "dashboardEnergyTooltip");
    }
  } else {
    dashboardEnergy.removeAttribute("tabindex");
    dashboardEnergy.removeAttribute("aria-describedby");
  }
}

function updateDashboardPointsUi() {
  if (!dashboardPoints) return;
  const balance = state.currency?.balance ?? 0;
  const valueEl = dashboardPoints.querySelector('[data-role="points-value"]');
  if (valueEl) valueEl.textContent = formatCoins(balance);
  dashboardPoints.classList.toggle("hidden", !state.isAuthenticated);
}

function clearArenaAnimation() {
  cancelArenaScheduledWork();
  arenaFocusedSequenceIndex = -1;

  if (arenaVersus) {
    arenaVersus.classList.remove("is-revealed");
  }
}

function cancelArenaScheduledWork() {
  if (arenaAnimationFrameId) {
    window.cancelAnimationFrame(arenaAnimationFrameId);
    arenaAnimationFrameId = 0;
  }

  arenaTimeoutIds.forEach((timeoutId) => window.clearTimeout(timeoutId));
  arenaTimeoutIds = [];
}

function scheduleArenaTimeout(callback, delay) {
  const timeoutId = window.setTimeout(() => {
    arenaTimeoutIds = arenaTimeoutIds.filter((item) => item !== timeoutId);
    callback();
  }, delay);

  arenaTimeoutIds.push(timeoutId);
  return timeoutId;
}

function getArenaStarterRecord() {
  if (!state.characters.length) return null;
  return state.characters[state.characters.length - 1] || state.characters[0] || null;
}

function buildArenaSequence(pool, targetRecord) {
  const sequence = [];
  const targetId = String(targetRecord?.id || "");
  const targetRepeatIndex = Math.max(ARENA_ROULETTE_REPEAT_COUNT - 2, 0);
  let targetSequenceIndex = -1;

  for (let repeat = 0; repeat < ARENA_ROULETTE_REPEAT_COUNT; repeat += 1) {
    let roundPool = shuffleArray(pool).map((record) => cloneBattleRecord(record));

    if (targetId && repeat === targetRepeatIndex) {
      const targetEntry = roundPool.find((record) => String(record.id) === targetId);
      if (targetEntry) {
        roundPool = roundPool.filter((record) => String(record.id) !== targetId);
        const targetSlot = Math.floor(Math.random() * (roundPool.length + 1));
        roundPool.splice(targetSlot, 0, cloneBattleRecord(targetEntry));
        targetSequenceIndex = sequence.length + targetSlot;
      }
    }

    roundPool.forEach((record, index) => {
      sequence.push({
        ...cloneBattleRecord(record),
        sequenceId: `${repeat}-${index}-${record.id}`,
      });
    });
  }

  if (targetSequenceIndex < 0) {
    targetSequenceIndex = Math.max(
      0,
      sequence.findIndex((record) => String(record.id) === targetId)
    );
  }

  return {
    sequence,
    targetSequenceIndex,
  };
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildFallbackArenaRoundText(round, battle) {
  const initiatorId = String(battle?.initiator?.id || "");
  const actorName =
    String(round?.actorPetId || "") === initiatorId
      ? getRecordDisplayName(battle?.initiator)
      : getRecordDisplayName(battle?.opponent);
  const targetName =
    String(round?.targetPetId || "") === initiatorId
      ? getRecordDisplayName(battle?.initiator)
      : getRecordDisplayName(battle?.opponent);

  if (round?.turnType === "counterattack") {
    return `${actorName} knocks the pressure aside and snaps right back before ${targetName} can reset.\nThe whole exchange turns in a single ugly heartbeat.`;
  }

  if (round?.hitResult === "defended") {
    return `${actorName} surges in first.\n${targetName} meets it cleanly and sends the attack harmlessly off line.`;
  }

  if (round?.usedSuperpower) {
    return `${actorName} tears into the round with a full superpower beat.\n${targetName} gets caught in the middle of the spectacle.`;
  }

  if (round?.usedCritical || round?.hitResult === "critical") {
    return `${actorName} spots the opening a split second early.\nThe follow-through lands nastier than anything else in the exchange.`;
  }

  return `${actorName} slips inside ${targetName}'s guard and lands clean.\nThe hit knocks the whole rhythm of the round sideways.`;
}

function getArenaRoundNote(round) {
  if (round?.turnType === "counterattack" || round?.hitResult === "counter") {
    return "COUNTER!";
  }

  if (round?.usedSuperpower) {
    return "SUPERPOWER!";
  }

  if (round?.usedCritical || round?.hitResult === "critical") {
    return "CRITICAL HIT!";
  }

  if (round?.hitResult === "defended") {
    return "BLOCKED!";
  }

  return "";
}

function buildArenaSummaryRoundFromResolvedBattle(round, battle, index) {
  const initiatorId = String(battle?.initiator?.id || "");
  const roundVisualState = buildArenaRoundVisualState({
    actorPetId: round?.actorPetId,
    initiatorId,
    targetPetId: round?.targetPetId,
  });
  const damage = Math.max(0, Math.floor(Number(round?.damage) || 0));

  return {
    number: Math.max(1, Math.floor(Number(round?.roundNumber) || index + 1)),
    ...roundVisualState,
    damage,
    damageLabel: damage > 0 ? `−${damage} HP` : "BLOCK",
    text: String(round?.narrationText || "").trim() || buildFallbackArenaRoundText(round, battle),
    note: getArenaRoundNote(round),
    skull: damage > 0 && Math.max(0, Math.floor(Number(round?.hpAfterTarget) || 0)) === 0,
  };
}

function buildArenaBattleSummaryFromResolvedBattle(battle) {
  const resolvedBattle = battle?.resolvedBattle;
  const rounds = Array.isArray(resolvedBattle?.rounds)
    ? resolvedBattle.rounds.map((round, index) =>
        buildArenaSummaryRoundFromResolvedBattle(round, battle, index)
      )
    : [];

  return {
    currentRound: rounds[0]?.number || 1,
    initiator: {
      ...cloneBattleRecord(battle?.initiator),
      currentHp: Math.max(
        0,
        Math.floor(
          Number(resolvedBattle?.startingHp?.attacker) ||
            Number(battle?.initiator?.maxHp) ||
            0
        )
      ),
      maxHp: Math.max(
        1,
        Math.floor(
          Number(resolvedBattle?.attacker?.maxHp) ||
            Number(resolvedBattle?.startingHp?.attacker) ||
            Number(battle?.initiator?.maxHp) ||
            1
        )
      ),
    },
    opponent: {
      ...cloneBattleRecord(battle?.opponent),
      currentHp: Math.max(
        0,
        Math.floor(
          Number(resolvedBattle?.startingHp?.defender) ||
            Number(battle?.opponent?.maxHp) ||
            0
        )
      ),
      maxHp: Math.max(
        1,
        Math.floor(
          Number(resolvedBattle?.defender?.maxHp) ||
            Number(resolvedBattle?.startingHp?.defender) ||
            Number(battle?.opponent?.maxHp) ||
            1
        )
      ),
    },
    rounds,
    result: resolvedBattle?.result || null,
    coinReward: Math.max(0, Math.floor(Number(resolvedBattle?.coinReward) || 0)),
  };
}

function buildArenaBattleSummary(battle) {
  if (battle?.resolvedBattle?.status === "ready") {
    return buildArenaBattleSummaryFromResolvedBattle(battle);
  }

  const initiator = cloneBattleRecord(battle?.initiator);
  const opponent = cloneBattleRecord(battle?.opponent);

  const initiatorName = getRecordDisplayName(initiator);
  const initiatorMaxHp = 45 + (Number(initiator?.attributes?.stamina) || 0) * 7;
  const opponentMaxHp = 45 + (Number(opponent?.attributes?.stamina) || 0) * 7;
  const initiatorOverviewHp = initiatorMaxHp;
  const opponentOverviewHp = opponentMaxHp;
  const sharedRoundText = `${initiatorName} Preparing attack charging the fist.\nAnd then he grabs him by the head and hits him on the floor.`;
  const buildPreviewRound = (number, actorSide, overrides = {}) => {
    const actorPetId =
      actorSide === "initiator" ? String(initiator?.id || "preview_initiator") : String(opponent?.id || "preview_opponent");
    const targetPetId =
      actorSide === "initiator" ? String(opponent?.id || "preview_opponent") : String(initiator?.id || "preview_initiator");

    return {
      number,
      ...buildArenaRoundVisualState({
        actorPetId,
        initiatorId: String(initiator?.id || "preview_initiator"),
        targetPetId,
      }),
      ...overrides,
    };
  };
  const rounds = [
    buildPreviewRound(1, "initiator", {
      damage: 21,
      text: sharedRoundText,
      note: "CRITICAL HIT!",
    }),
    buildPreviewRound(2, "opponent", {
      damage: 21,
      text: sharedRoundText,
    }),
    buildPreviewRound(3, "initiator", {
      damage: 13,
      text: sharedRoundText,
    }),
    buildPreviewRound(4, "opponent", {
      damage: 21,
      text: sharedRoundText,
    }),
    buildPreviewRound(5, "initiator", {
      damage: 21,
      text: sharedRoundText,
      skull: true,
    }),
  ];

  return {
    currentRound: 1,
    initiator: {
      ...initiator,
      currentHp: initiatorOverviewHp,
      maxHp: initiatorMaxHp,
    },
    opponent: {
      ...opponent,
      currentHp: opponentOverviewHp,
      maxHp: opponentMaxHp,
    },
    rounds,
  };
}

function isArenaBattleResultPhase(phase) {
  return phase === "battle-result-enter" || phase === "battle-result";
}

function isArenaBattleScreenPhase(phase) {
  return phase === "battle" || phase === "battle-enter" || isArenaBattleResultPhase(phase);
}

function getArenaBattleResult(summary) {
  if (summary?.result) {
    const initiator = cloneBattleRecord(summary?.initiator);
    const opponent = cloneBattleRecord(summary?.opponent);
    const initiatorId = String(initiator?.id || "");
    const winnerSide =
      String(summary.result?.winnerPetId || "") === initiatorId ? "initiator" : "opponent";
    const loserSide = winnerSide === "initiator" ? "opponent" : "initiator";
    const winner = winnerSide === "initiator" ? initiator : opponent;
    const loser = loserSide === "initiator" ? initiator : opponent;
    const winnerReward =
      winnerSide === "initiator"
        ? summary.result?.attackerRewards
        : summary.result?.defenderRewards;
    const loserReward =
      loserSide === "initiator"
        ? summary.result?.attackerRewards
        : summary.result?.defenderRewards;
    const coinReward = Math.max(0, Math.floor(Number(summary?.coinReward) || 0));
    const winnerPoints = winnerSide === "initiator" ? coinReward : 0;

    return {
      initiatorHp: Math.max(0, Math.floor(Number(summary.result?.attackerEndingHp) || 0)),
      opponentHp: Math.max(0, Math.floor(Number(summary.result?.defenderEndingHp) || 0)),
      winnerSide,
      loserSide,
      winner,
      loser,
      winnerExp: `+${Math.max(0, Math.floor(Number(winnerReward?.xpGained) || 0))} Exp.`,
      loserExp: `+${Math.max(0, Math.floor(Number(loserReward?.xpGained) || 0))} Exp.`,
      levelUpLabel: winnerReward?.levelUp ? `Lvl ${winnerReward.newLevel}` : "",
      winnerPoints,
      winnerPointsText: winnerPoints > 0 ? `+${formatCoins(winnerPoints)}` : "",
    };
  }

  const initiator = cloneBattleRecord(summary?.initiator);
  const opponent = cloneBattleRecord(summary?.opponent);
  let initiatorHp = Math.max(0, Number(initiator?.maxHp) || 0);
  let opponentHp = Math.max(0, Number(opponent?.maxHp) || 0);

  (summary?.rounds || []).forEach((round) => {
    if (round?.accentSide === "left") {
      initiatorHp = Math.max(0, initiatorHp - (Number(round?.damage) || 0));
      return;
    }

    opponentHp = Math.max(0, opponentHp - (Number(round?.damage) || 0));
  });

  const winnerSide = initiatorHp >= opponentHp ? "initiator" : "opponent";
  const loserSide = winnerSide === "initiator" ? "opponent" : "initiator";
  const winner = winnerSide === "initiator" ? initiator : opponent;
  const loser = loserSide === "initiator" ? initiator : opponent;

  return {
    initiatorHp,
    opponentHp,
    winnerSide,
    loserSide,
    winner,
    loser,
    winnerExp: "+200 Exp.",
    loserExp: "+25 Exp.",
    levelUpLabel: "Lvl up",
    winnerPoints: 0,
    winnerPointsText: "",
  };
}

async function ensureArenaPreviewBattle(previewPhase = "battle") {
  const resolvedPreviewPhase = previewPhase === "result" ? "battle-result" : previewPhase;
  const initiatorSource = getArenaStarterRecord() || state.character || state.characters[0] || null;
  const initiator = cloneBattleRecord(initiatorSource);

  if (!initiator) {
    return false;
  }

  let preparedPool = [];

  try {
    preparedPool = await warmArenaOpponentPool(initiator.id);
  } catch (_error) {
    preparedPool = [];
  }

  if (!preparedPool.length) {
    preparedPool = await prepareArenaOpponentPool(ARENA_OPPONENT_POOL.slice(0, ARENA_OPPONENT_SELECTION_LIMIT));
  }

  if (!preparedPool.length) {
    return false;
  }

  const preparedInitiator = await prepareArenaRecordImage(initiator);
  const opponent = preparedPool[0];
  const { sequence, targetSequenceIndex } = buildArenaSequence(preparedPool, opponent);
  const hasPassedFocusPhase =
    resolvedPreviewPhase !== "roulette" && resolvedPreviewPhase !== "focus";
  const hasPassedVersusPhase = hasPassedFocusPhase && resolvedPreviewPhase !== "versus";

  state.activeBattle = {
    id: `arena-preview-${previewPhase}`,
    initiator: preparedInitiator,
    opponent,
    pool: preparedPool,
    sequence,
    targetSequenceIndex,
    phase: resolvedPreviewPhase,
    trackX: resolvedPreviewPhase === "battle" || resolvedPreviewPhase === "battle-result" ? null : undefined,
    rouletteStarted: previewPhase !== "roulette",
    focusScheduled: hasPassedFocusPhase,
    versusRendered: hasPassedVersusPhase,
    battleScreenScheduled: resolvedPreviewPhase === "battle" || resolvedPreviewPhase === "battle-result",
    battleEnterStarted: resolvedPreviewPhase === "battle",
    resultEnterStarted: resolvedPreviewPhase === "battle-result",
  };

  if (resolvedPreviewPhase === "battle-result") {
    const previewAnimation = getArenaBattleAnimationState(state.activeBattle);
    const previewSummary = buildArenaBattleSummary(state.activeBattle);
    previewAnimation.started = true;
    previewAnimation.currentIndex = Math.max(0, previewSummary.rounds.length - 1);
    previewAnimation.introVisible = true;
    previewAnimation.introCompleted = true;
    previewAnimation.typedLength = previewSummary.rounds[previewAnimation.currentIndex]?.text?.length || 0;
    previewAnimation.damageVisible = true;
    previewAnimation.noteVisible = true;
    previewAnimation.finished = true;
  }

  return true;
}

function getArenaRoundIcon(iconType) {
  return iconType === "shield" ? "/assets/battle/round-shield.png" : "/assets/battle/round-swords.png";
}

function buildArenaCompactFighterMarkup(record, variant = "initiator") {
  const safeRecord = cloneBattleRecord(record);
  const rarity = getRarityMeta(safeRecord?.rarity);
  const currentHp = Math.max(0, Number(safeRecord?.currentHp) || 0);
  const maxHp = Math.max(1, Number(safeRecord?.maxHp) || 1);
  const hpProgress = clampNumber((currentHp / maxHp) * 100, 0, 100);
  const hpClassName = variant === "initiator" ? "arena-live-fighter-hp--healthy" : "arena-live-fighter-hp--danger";

  return `
    <article class="arena-live-fighter-card arena-live-fighter-card--${variant}">
      <img
        class="arena-live-fighter-image"
        src="${safeRecord?.imageUrl || DEFAULT_CHARACTER_IMAGE}"
        alt="${escapeHtml(safeRecord?.creatureType || "Pet")} character"
        width="104"
        height="104"
      />
      <p class="arena-live-fighter-name">${escapeHtml(getRecordDisplayName(safeRecord))}</p>
      <span class="arena-live-fighter-rarity" style="background-color: ${rarity.color};">${escapeHtml(rarity.label)}</span>
      <p class="arena-live-fighter-level">Lvl. ${getRecordLevel(safeRecord)}</p>
      <p class="arena-live-fighter-hp ${hpClassName}">${currentHp} HP</p>
      <div class="arena-live-fighter-hp-track">
        <span class="arena-live-fighter-hp-fill" style="width: ${hpProgress}%;"></span>
      </div>
    </article>
  `;
}

function buildArenaBattleSideCardMarkup(record, variant = "initiator") {
  const safeRecord = cloneBattleRecord(record);
  const rarity = getRarityMeta(safeRecord?.rarity);
  const name = escapeHtml(getRecordDisplayName(safeRecord));
  const level = getRecordLevel(safeRecord);
  const powerText = escapeHtml(getSelectedPowerDescription(safeRecord));
  const statsMarkup = ATTRS.map((attr) => {
    const value = safeRecord?.attributes?.[attr.key] ?? 0;

    return `
      <div class="arena-live-sidecard-stat">
        <img src="${attr.icon}" alt="" width="16" height="16" />
        <span>${value}</span>
      </div>
    `;
  }).join("");

  return `
    <article class="arena-live-sidecard arena-live-sidecard--${variant}">
      <p class="arena-live-sidecard-title">${name}</p>
      <div class="arena-live-sidecard-image-wrap">
        <img
          class="arena-live-sidecard-image"
          src="${safeRecord?.imageUrl || DEFAULT_CHARACTER_IMAGE}"
          alt="${escapeHtml(safeRecord?.creatureType || "Pet")} character"
          width="248"
          height="248"
        />
        <span class="arena-live-sidecard-level">Lvl. ${level}</span>
        <span class="arena-live-sidecard-rarity" style="background-color: ${rarity.color};">${escapeHtml(rarity.label)}</span>
      </div>
      <div class="arena-live-sidecard-stats">${statsMarkup}</div>
      <div class="arena-live-sidecard-power">
        <img class="arena-live-sidecard-power-icon" src="${BATTLE_SIDE_CARD_POWER_ICON}" alt="" width="20" height="20" />
        <p class="arena-live-sidecard-power-text">${powerText}</p>
      </div>
    </article>
  `;
}

function buildArenaBattleOverviewSideMarkup(record, variant = "initiator") {
  const safeRecord = cloneBattleRecord(record);
  const currentHp = Math.max(0, Number(safeRecord?.currentHp) || 0);
  const maxHp = Math.max(1, Number(safeRecord?.maxHp) || 1);
  const hpProgress = clampNumber((currentHp / maxHp) * 100, 0, 100);
  const nameMarkup = `<p class="arena-live-overview-name">${escapeHtml(getRecordDisplayName(safeRecord))}</p>`;
  const hpMarkup = `<p class="arena-live-overview-hp">${currentHp} HP</p>`;

  return `
    <div class="arena-live-overview-side arena-live-overview-side--${variant}">
      <div class="arena-live-overview-copy">
        ${variant === "initiator" ? `${nameMarkup}${hpMarkup}` : `${hpMarkup}${nameMarkup}`}
      </div>
      <div class="arena-live-overview-track arena-live-overview-track--${variant}">
        <span class="arena-live-overview-fill arena-live-overview-fill--${variant}" style="width: ${hpProgress}%;"></span>
      </div>
    </div>
  `;
}

function buildArenaRoundSkeletonMarkup(round, index) {
  const pillAssets = getArenaRoundPillAssets(round);
  const damageLabel = String(round.damageLabel || `−${round.damage} HP`);
  const damageExtras = round.skull && round.damage > 0
    ? `<img class="arena-live-round-skull" src="${BATTLE_ROUND_SKULL_ICON}" alt="" width="20" height="20" />`
    : "";
  const noteMarkup = round.note
    ? `
      <div class="arena-live-round-note">
        <span class="arena-live-round-note-text" aria-label="${escapeHtml(round.note)}">
          <span class="arena-live-round-text-shadow" aria-hidden="true">${escapeHtml(round.note)}</span>
          <span class="arena-live-round-text-face">${escapeHtml(round.note)}</span>
        </span>
      </div>
    `
    : "";

  return `
    <article
      class="arena-live-round-card arena-live-round-card--accent-${round.accentSide} is-hidden"
      data-round-index="${index}"
      data-round-number="${round.number}"
    >
      <div class="arena-live-round-main">
        <div class="arena-live-round-head">
          <div class="arena-live-round-icon-slot arena-live-round-icon-slot--left">
            <img src="${getArenaRoundIcon(round.leftIcon)}" alt="" width="32" height="32" />
          </div>
          <div class="arena-live-round-pill">
            <img class="arena-live-round-pill-ornament" src="${pillAssets.left}" alt="" width="31" height="20" />
            <span class="arena-live-round-pill-label">ROUND ${round.number}</span>
            <img class="arena-live-round-pill-ornament" src="${pillAssets.right}" alt="" width="31" height="20" />
          </div>
          <div class="arena-live-round-icon-slot arena-live-round-icon-slot--right">
            <img src="${getArenaRoundIcon(round.rightIcon)}" alt="" width="32" height="32" />
          </div>
        </div>
        <div class="arena-live-round-body">
          <p class="arena-live-round-text"></p>
        </div>
      </div>

      <div class="arena-live-round-accent arena-live-round-accent--${round.accentSide}">
        <div class="arena-live-round-damage-line">
          <p class="arena-live-round-damage" aria-label="${damageLabel}">
            <span class="arena-live-round-text-shadow" aria-hidden="true">${damageLabel}</span>
            <span class="arena-live-round-text-face">${damageLabel}</span>
          </p>
          ${damageExtras}
        </div>
        ${noteMarkup}
      </div>
    </article>
  `;
}

function buildArenaBattleResultLayerMarkup() {
  // BEGIN result-layer-markup
  return `
    <div class="arena-live-result-layer" aria-hidden="true">
      <p class="arena-live-result-title arena-live-result-title--winner">Winner</p>

      <div class="arena-live-result-reward arena-live-result-reward--winner">
        <p class="arena-live-result-exp arena-live-result-exp--winner">+200 Exp.</p>
      </div>

      <div class="arena-live-result-trophy-stack" aria-hidden="true">
        <img class="arena-live-result-trophy arena-live-result-trophy--composite" src="${BATTLE_RESULT_TROPHY_COMPOSITE}" alt="" width="305" height="311" />
      </div>

      <div class="arena-live-result-cta hidden">
        <p class="arena-live-result-cta-label">Your reward</p>
        <p class="arena-live-result-cta-value">
          <span class="arena-live-result-cta-amount"></span>
          <img class="arena-live-result-cta-icon" src="/assets/dashboard/points-coin.svg" alt="" width="20" height="20" />
        </p>
      </div>

      <p class="arena-live-result-title arena-live-result-title--loser">Loser</p>

      <div class="arena-live-result-reward arena-live-result-reward--loser">
        <p class="arena-live-result-exp arena-live-result-exp--loser">+25 Exp.</p>
      </div>

      <div class="arena-live-result-actions">
        <button class="arena-live-result-btn arena-live-result-btn--secondary" data-action="replay-battle" type="button">
          <img src="${BATTLE_RESULT_REPLAY_ICON}" alt="" width="24" height="24" />
          <span>Replay</span>
        </button>
        <button class="arena-live-result-btn arena-live-result-btn--primary" data-action="go-to-my-pets" type="button">
          <span>Go to My Pets</span>
        </button>
      </div>
    </div>
  `;
  // END result-layer-markup
}

function applyArenaResultCardMotion(card, role, side, shellWidth) {
  if (!card) return;

  card.classList.toggle("is-result-winner", role === "winner");
  card.classList.toggle("is-result-loser", role === "loser");

  if (!role) {
    card.style.removeProperty("--arena-result-x");
    card.style.removeProperty("--arena-result-y");
    card.style.removeProperty("--arena-result-scale");
    card.style.removeProperty("--arena-result-rotate");
    card.style.removeProperty("--arena-result-opacity");
    return;
  }

  const isMobileResultLayout = isMobileArenaViewport();
  const isTabletResultLayout = !isMobileResultLayout && shellWidth <= 768;
  const mobileLayoutWidth = Math.min(360, shellWidth);
  const mobileLayoutOffset = isMobileResultLayout ? (shellWidth - mobileLayoutWidth) / 2 : 0;
  const width = 264;
  const defaultLeft = isMobileResultLayout
    ? side === "initiator"
      ? mobileLayoutOffset + 16
      : mobileLayoutOffset + mobileLayoutWidth - 16 - width
    : side === "initiator"
      ? 0
      : shellWidth - width;
  const defaultTop = isMobileResultLayout ? -40 : -40;
  const target = isMobileResultLayout
    ? role === "winner"
      ? { left: mobileLayoutOffset + 32.68, top: 34.33, scale: 0.644, rotate: "-8.94deg", opacity: 1 }
      : { left: mobileLayoutOffset + 236.28, top: 104.72, scale: 0.409, rotate: "19.48deg", opacity: 0.6 }
    : isTabletResultLayout
    ? role === "winner"
      ? { left: 205.61, top: -39.07, scale: 1, rotate: "-8.94deg", opacity: 1 }
      : { left: 503.89, top: -11.98, scale: 0.586, rotate: "19.48deg", opacity: 0.6 }
    : role === "winner"
      ? { left: 468.61, top: -132.07, scale: 1, rotate: "-8.94deg", opacity: 1 }
      : { left: 766.89, top: -104.98, scale: 0.586, rotate: "19.48deg", opacity: 0.6 };
  const translateX = target.left - defaultLeft;
  const translateY = target.top - defaultTop;

  card.style.setProperty("--arena-result-x", `${translateX}px`);
  card.style.setProperty("--arena-result-y", `${translateY}px`);
  card.style.setProperty("--arena-result-scale", String(target.scale));
  card.style.setProperty("--arena-result-rotate", target.rotate);
  card.style.setProperty("--arena-result-opacity", String(target.opacity));
}

function getArenaBattleAnimationState(battle) {
  if (!battle) return null;

  if (!battle.roundAnimation) {
    battle.roundAnimation = {
      started: false,
      currentIndex: 0,
      introVisible: false,
      introCompleted: false,
      typedLength: 0,
      damageVisible: false,
      noteVisible: false,
      finished: false,
      isPaused: false,
      fastForward: false,
      lastHitEffectKey: "",
    };
  }

  return battle.roundAnimation;
}

function formatArenaRoundText(text, limit = text.length) {
  return escapeHtml(String(text || "").slice(0, Math.max(0, limit))).replace(/\n/g, "<br />");
}

function isArenaBattleFastForward(battle) {
  return Boolean(getArenaBattleAnimationState(battle)?.fastForward);
}

function getArenaBattleDelay(battle, normalDelay, fastForwardDelay) {
  return isArenaBattleFastForward(battle) ? fastForwardDelay : normalDelay;
}

function getArenaBattleTypingDelay(text, typedLength, battle = null) {
  if (isArenaBattleFastForward(battle)) {
    const currentCharacter = String(text || "").charAt(Math.max(0, typedLength - 1));

    if (currentCharacter === "\n") return ARENA_BATTLE_FAST_FORWARD_TEXT_LINEBREAK_DELAY;
    if (currentCharacter === " ") return ARENA_BATTLE_FAST_FORWARD_TEXT_SPACE_DELAY;
    if (/[.!?]/.test(currentCharacter)) return ARENA_BATTLE_FAST_FORWARD_TEXT_PUNCTUATION_DELAY;
    if (currentCharacter === ",") return Math.round(ARENA_BATTLE_FAST_FORWARD_TEXT_PUNCTUATION_DELAY * 0.7);
    return ARENA_BATTLE_FAST_FORWARD_TEXT_CHAR_DELAY;
  }

  const currentCharacter = String(text || "").charAt(Math.max(0, typedLength - 1));

  if (currentCharacter === "\n") return ARENA_BATTLE_TEXT_LINEBREAK_DELAY;
  if (currentCharacter === " ") return ARENA_BATTLE_TEXT_SPACE_DELAY;
  if (/[.!?]/.test(currentCharacter)) return ARENA_BATTLE_TEXT_PUNCTUATION_DELAY;
  if (currentCharacter === ",") return Math.round(ARENA_BATTLE_TEXT_PUNCTUATION_DELAY * 0.7);
  return ARENA_BATTLE_TEXT_CHAR_DELAY;
}

function getArenaBattlePresentation(summary, battle) {
  const animation = getArenaBattleAnimationState(battle);
  const rounds = summary.rounds || [];
  const maxIndex = Math.max(rounds.length - 1, 0);
  const isResultPhase = isArenaBattleResultPhase(battle?.phase);
  const currentIndex = isResultPhase ? maxIndex : clampNumber(animation?.currentIndex ?? 0, 0, maxIndex);
  const currentRound = rounds[currentIndex] || rounds[0] || { number: 1, text: "" };
  let initiatorHp = summary.initiator.maxHp;
  let opponentHp = summary.opponent.maxHp;

  rounds.forEach((round, index) => {
    const shouldApplyDamage =
      isResultPhase || index < currentIndex || (index === currentIndex && animation?.damageVisible);
    if (!shouldApplyDamage) return;

    if (round.accentSide === "left") {
      initiatorHp = Math.max(0, initiatorHp - round.damage);
      return;
    }

    opponentHp = Math.max(0, opponentHp - round.damage);
  });

  const roundStates = rounds.map((round, index) => {
    const isCurrent = !isResultPhase && index === currentIndex;
    const isCompleted = isResultPhase || index < currentIndex;
    const isFirstRoundIntro = index === 0 && isCurrent;
    const isVisible =
      isResultPhase || isCompleted || (isCurrent && (!isFirstRoundIntro || Boolean(animation?.introVisible)));
    const typedLength = isResultPhase
      ? round.text.length
      : isCompleted
        ? round.text.length
        : isCurrent
          ? animation?.typedLength ?? 0
          : 0;

    return {
      isCurrent,
      isCompleted,
      isVisible,
      isIntroEntering:
        !isResultPhase && isFirstRoundIntro && Boolean(animation?.introVisible) && !animation?.introCompleted,
      isTyping: !isResultPhase && isCurrent && typedLength < round.text.length && !animation?.damageVisible,
      showDamage: isResultPhase || isCompleted || (isCurrent && Boolean(animation?.damageVisible)),
      showNote:
        Boolean(round.note) &&
        (isResultPhase || isCompleted || (isCurrent && Boolean(animation?.noteVisible))),
      stackPosition: isVisible ? currentIndex - index : null,
      textHtml: formatArenaRoundText(round.text, typedLength),
    };
  });

  return {
    currentRoundIndex: currentIndex,
    currentRoundNumber: currentRound.number,
    initiatorHp,
    opponentHp,
    visibleRoundsCount: isResultPhase ? rounds.length : currentIndex + 1,
    roundStates,
  };
}

function syncArenaBattleScreen(battle, summary) {
  if (!arenaLiveBattle) return;

  const shell = arenaLiveBattle.querySelector(".arena-live-shell");
  if (!shell) return;

  const isBattleEnterPhase = battle?.phase === "battle-enter";
  const isResultPhase = isArenaBattleResultPhase(battle?.phase);
  const result = getArenaBattleResult(summary);

  shell.classList.toggle("is-entering", isBattleEnterPhase);
  shell.classList.toggle("is-result-entering", isResultPhase);
  shell.classList.toggle("is-result-final", battle?.phase === "battle-result");

  if (battle?.phase !== "battle-enter") {
    shell.classList.remove("is-landing");
  }

  if (battle?.phase === "battle-result") {
    shell.classList.add("is-result-landing");
  } else if (battle?.phase !== "battle-result-enter") {
    shell.classList.remove("is-result-landing");
  }

  const presentation = getArenaBattlePresentation(summary, battle);
  const initiatorOverview = shell.querySelector(".arena-live-overview-side--initiator");
  const opponentOverview = shell.querySelector(".arena-live-overview-side--opponent");
  const roundValue = shell.querySelector(".arena-live-round-value");
  const roundsWrap = shell.querySelector(".arena-live-rounds");
  const initiatorStageCard = shell.querySelector(".arena-live-stage-card--initiator");
  const opponentStageCard = shell.querySelector(".arena-live-stage-card--opponent");
  const pauseButton = shell.querySelector('[data-action="pause-battle"]');
  const pauseButtonIcon = pauseButton?.querySelector("img");
  const resultLayer = shell.querySelector(".arena-live-result-layer");
  const winnerExp = shell.querySelector(".arena-live-result-exp--winner");
  const loserExp = shell.querySelector(".arena-live-result-exp--loser");
  const resultPill = shell.querySelector(".arena-live-result-pill");
  const resultPillText = shell.querySelector(".arena-live-result-pill-text");

  if (initiatorOverview) {
    const hpLabel = initiatorOverview.querySelector(".arena-live-overview-hp");
    const hpFill = initiatorOverview.querySelector(".arena-live-overview-fill");
    if (hpLabel) hpLabel.textContent = `${presentation.initiatorHp} HP`;
    if (hpFill) {
      hpFill.style.width = `${clampNumber((presentation.initiatorHp / summary.initiator.maxHp) * 100, 0, 100)}%`;
    }
  }

  if (opponentOverview) {
    const hpLabel = opponentOverview.querySelector(".arena-live-overview-hp");
    const hpFill = opponentOverview.querySelector(".arena-live-overview-fill");
    if (hpLabel) hpLabel.textContent = `${presentation.opponentHp} HP`;
    if (hpFill) {
      hpFill.style.width = `${clampNumber((presentation.opponentHp / summary.opponent.maxHp) * 100, 0, 100)}%`;
    }
  }

  if (roundValue) {
    roundValue.textContent = String(presentation.currentRoundNumber);
  }

  if (resultLayer) {
    resultLayer.setAttribute("aria-hidden", isResultPhase ? "false" : "true");
  }
  if (winnerExp) winnerExp.textContent = result.winnerExp;
  if (loserExp) loserExp.textContent = result.loserExp;
  if (resultPill) {
    resultPill.classList.toggle("hidden", !result.levelUpLabel);
  }
  if (resultPillText) resultPillText.textContent = result.levelUpLabel;
  const ctaBlock = shell.querySelector(".arena-live-result-cta");
  const ctaAmount = shell.querySelector(".arena-live-result-cta-amount");
  if (ctaBlock) {
    ctaBlock.classList.toggle("hidden", !result.winnerPointsText);
  }
  if (ctaAmount) {
    ctaAmount.textContent = result.winnerPointsText || "";
  }

  const currentRound = summary.rounds[presentation.currentRoundIndex];
  const currentRoundState = presentation.roundStates[presentation.currentRoundIndex];
  const initiatorShouldHit = !isResultPhase && Boolean(
    currentRound &&
      currentRoundState?.isCurrent &&
      currentRoundState.showDamage &&
      currentRound.accentSide === "left"
  );
  const opponentShouldHit = !isResultPhase && Boolean(
    currentRound &&
      currentRoundState?.isCurrent &&
      currentRoundState.showDamage &&
      currentRound.accentSide === "right"
  );

  initiatorStageCard?.classList.toggle("is-hit", initiatorShouldHit);
  opponentStageCard?.classList.toggle("is-hit", opponentShouldHit);

  const shellWidth = shell.clientWidth || 1328;
  applyArenaResultCardMotion(
    initiatorStageCard,
    isResultPhase ? (result.winnerSide === "initiator" ? "winner" : "loser") : "",
    "initiator",
    shellWidth
  );
  applyArenaResultCardMotion(
    opponentStageCard,
    isResultPhase ? (result.winnerSide === "opponent" ? "winner" : "loser") : "",
    "opponent",
    shellWidth
  );

  if (pauseButton) {
    const isPaused = Boolean(getArenaBattleAnimationState(battle)?.isPaused);
    pauseButton.setAttribute("aria-pressed", isPaused ? "true" : "false");
    pauseButton.setAttribute("aria-label", isPaused ? "Resume fight" : "Pause fight");
    pauseButton.classList.toggle("is-paused", isPaused);
    if (pauseButtonIcon) {
      pauseButtonIcon.src = isPaused ? BATTLE_CONTROL_PLAY_ICON : BATTLE_CONTROL_PAUSE_ICON;
    }
  }

  summary.rounds.forEach((round, index) => {
    const roundState = presentation.roundStates[index];
    const card = shell.querySelector(`.arena-live-round-card[data-round-index="${index}"]`);

    if (!card || !roundState) return;

    card.classList.toggle("is-hidden", !roundState.isVisible);
    card.classList.toggle("is-current", roundState.isCurrent);
    card.classList.toggle("is-completed", roundState.isCompleted);
    card.classList.toggle("is-intro-entering", roundState.isIntroEntering);
    card.classList.toggle("is-typing", roundState.isTyping);
    card.style.opacity = roundState.isVisible ? "1" : "0";
    card.style.zIndex = roundState.isVisible ? String(20 - roundState.stackPosition) : "0";
    card.style.transform = roundState.isVisible
      ? `translate3d(0, ${roundState.stackPosition * 148}px, 0)`
      : "translate3d(0, 32px, 0) scale(0.96)";

    const textNode = card.querySelector(".arena-live-round-text");
    const damageLine = card.querySelector(".arena-live-round-damage-line");
    const noteNode = card.querySelector(".arena-live-round-note");

    if (textNode) {
      textNode.innerHTML = roundState.textHtml;
    }
    if (damageLine) {
      damageLine.classList.toggle("is-visible", roundState.showDamage);
    }
    if (noteNode) {
      noteNode.classList.toggle("is-visible", roundState.showNote);
    }
  });

  if (roundsWrap) {
    const visibleEntries = summary.rounds
      .map((round, index) => {
        const roundState = presentation.roundStates[index];
        const card = shell.querySelector(`.arena-live-round-card[data-round-index="${index}"]`);
        return { index, roundState, card };
      })
      .filter((entry) => entry.card && entry.roundState?.isVisible)
      .sort((left, right) => (left.roundState?.stackPosition ?? 0) - (right.roundState?.stackPosition ?? 0));

    const stackGap = 16;
    const stackOffsets = new Map();
    let totalHeight = 0;

    visibleEntries.forEach((entry, entryIndex) => {
      const roundMain = entry.card.querySelector(".arena-live-round-main");
      const cardHeight = Math.max(132, roundMain?.offsetHeight || entry.card.offsetHeight || 132);
      stackOffsets.set(entry.index, totalHeight);
      totalHeight += cardHeight;
      if (entryIndex < visibleEntries.length - 1) {
        totalHeight += stackGap;
      }
    });

    const wrapPaddingTop = parseFloat(window.getComputedStyle(roundsWrap).paddingTop) || 0;
    roundsWrap.style.height = `${Math.max(132, wrapPaddingTop + totalHeight)}px`;

    summary.rounds.forEach((round, index) => {
      const roundState = presentation.roundStates[index];
      const card = shell.querySelector(`.arena-live-round-card[data-round-index="${index}"]`);

      if (!card || !roundState) return;

      card.style.transform = roundState.isVisible
        ? `translate3d(0, ${stackOffsets.get(index) ?? 0}px, 0)`
        : "translate3d(0, 32px, 0) scale(0.96)";
    });
  }
}

function stepArenaBattleTyping(battle) {
  if (!state.activeBattle || state.activeBattle.id !== battle?.id) return;

  const summary = buildArenaBattleSummary(battle);
  const animation = getArenaBattleAnimationState(battle);
  const round = summary.rounds[animation.currentIndex];

  if (!round || animation.isPaused) return;

  if (animation.typedLength < round.text.length) {
    animation.typedLength += 1;
    syncArenaBattleScreen(battle, summary);
    scheduleArenaTimeout(
      () => stepArenaBattleTyping(battle),
      getArenaBattleTypingDelay(round.text, animation.typedLength, battle)
    );
    return;
  }

  scheduleArenaTimeout(
    () => revealArenaBattleDamage(battle, round),
    getArenaBattleDelay(battle, ARENA_BATTLE_AFTER_TEXT_DELAY, ARENA_BATTLE_FAST_FORWARD_AFTER_TEXT_DELAY)
  );
}

function advanceArenaBattleRound(battle) {
  if (!state.activeBattle || state.activeBattle.id !== battle?.id) return;

  const summary = buildArenaBattleSummary(battle);
  const animation = getArenaBattleAnimationState(battle);

  if (animation.isPaused) return;

  if (animation.currentIndex >= summary.rounds.length - 1) {
    animation.finished = true;
    syncArenaBattleScreen(battle, summary);
    if (!battle.resultScreenScheduled) {
      battle.resultScreenScheduled = true;
      scheduleArenaTimeout(() => {
        if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
        state.activeBattle.phase = "battle-result-enter";
        if (state.pendingCurrency) {
          state.currency = state.pendingCurrency;
          state.pendingCurrency = null;
          updateDashboardPointsUi();
        }
        renderArena();
      }, getArenaBattleDelay(battle, ARENA_BATTLE_RESULT_DELAY, ARENA_BATTLE_FAST_FORWARD_RESULT_DELAY));
    }
    return;
  }

  animation.currentIndex += 1;
  animation.typedLength = 0;
  animation.damageVisible = false;
  animation.noteVisible = false;
  syncArenaBattleScreen(battle, summary);
  scheduleArenaTimeout(
    () => stepArenaBattleTyping(battle),
    getArenaBattleDelay(battle, ARENA_BATTLE_TYPING_START_DELAY, ARENA_BATTLE_FAST_FORWARD_TYPING_START_DELAY)
  );
}

function revealArenaBattleDamage(battle, round) {
  if (!state.activeBattle || state.activeBattle.id !== battle?.id) return;

  const animation = getArenaBattleAnimationState(battle);
  if (animation.isPaused) return;

  animation.damageVisible = true;
  syncArenaBattleScreen(battle, buildArenaBattleSummary(battle));
  triggerArenaBattleHitEffects(battle, round);

  if (round.note) {
    scheduleArenaTimeout(
      () => revealArenaBattleNote(battle, round),
      getArenaBattleDelay(battle, ARENA_BATTLE_AFTER_DAMAGE_DELAY, ARENA_BATTLE_FAST_FORWARD_AFTER_DAMAGE_DELAY)
    );
    return;
  }

  scheduleArenaTimeout(
    () => advanceArenaBattleRound(battle),
    getArenaBattleDelay(battle, ARENA_BATTLE_NEXT_ROUND_DELAY, ARENA_BATTLE_FAST_FORWARD_NEXT_ROUND_DELAY)
  );
}

function revealArenaBattleNote(battle, round) {
  if (!state.activeBattle || state.activeBattle.id !== battle?.id) return;

  const animation = getArenaBattleAnimationState(battle);
  if (animation.isPaused) return;

  animation.noteVisible = true;
  syncArenaBattleScreen(battle, buildArenaBattleSummary(battle));
  scheduleArenaTimeout(
    () => advanceArenaBattleRound(battle),
    getArenaBattleDelay(battle, ARENA_BATTLE_AFTER_NOTE_DELAY, ARENA_BATTLE_FAST_FORWARD_AFTER_NOTE_DELAY)
  );
}

function continueArenaBattleFlow(battle) {
  if (!state.activeBattle || state.activeBattle.id !== battle?.id) return;

  const summary = buildArenaBattleSummary(battle);
  const animation = getArenaBattleAnimationState(battle);
  const round = summary.rounds[animation.currentIndex];

  if (!round || animation.isPaused || animation.finished) return;

  if (animation.currentIndex === 0 && !animation.introVisible) {
    startArenaBattleFirstRoundIntro(battle);
    return;
  }

  if (animation.typedLength < round.text.length) {
    scheduleArenaTimeout(
      () => stepArenaBattleTyping(battle),
      isArenaBattleFastForward(battle) ? ARENA_BATTLE_FAST_FORWARD_TEXT_CHAR_DELAY : Math.max(ARENA_BATTLE_TEXT_CHAR_DELAY, 32)
    );
    return;
  }

  if (!animation.damageVisible) {
    scheduleArenaTimeout(
      () => revealArenaBattleDamage(battle, round),
      getArenaBattleDelay(battle, ARENA_BATTLE_AFTER_TEXT_DELAY, ARENA_BATTLE_FAST_FORWARD_AFTER_TEXT_DELAY)
    );
    return;
  }

  if (round.note && !animation.noteVisible) {
    scheduleArenaTimeout(
      () => revealArenaBattleNote(battle, round),
      getArenaBattleDelay(battle, ARENA_BATTLE_AFTER_DAMAGE_DELAY, ARENA_BATTLE_FAST_FORWARD_AFTER_DAMAGE_DELAY)
    );
    return;
  }

  scheduleArenaTimeout(
    () => advanceArenaBattleRound(battle),
    round.note
      ? getArenaBattleDelay(battle, ARENA_BATTLE_AFTER_NOTE_DELAY, ARENA_BATTLE_FAST_FORWARD_AFTER_NOTE_DELAY)
      : getArenaBattleDelay(battle, ARENA_BATTLE_NEXT_ROUND_DELAY, ARENA_BATTLE_FAST_FORWARD_NEXT_ROUND_DELAY)
  );
}

function startArenaBattleRounds(battle) {
  const animation = getArenaBattleAnimationState(battle);
  if (animation.started) return;

  animation.started = true;
  animation.currentIndex = 0;
  animation.introVisible = false;
  animation.introCompleted = false;
  animation.typedLength = 0;
  animation.damageVisible = false;
  animation.noteVisible = false;
  animation.finished = false;
  animation.isPaused = false;
  animation.fastForward = false;
  animation.lastHitEffectKey = "";
  syncArenaBattleScreen(battle, buildArenaBattleSummary(battle));
  startArenaBattleFirstRoundIntro(battle);
}

function startArenaBattleFirstRoundIntro(battle) {
  if (!state.activeBattle || state.activeBattle.id !== battle?.id) return;

  const animation = getArenaBattleAnimationState(battle);
  if (!animation || animation.isPaused || animation.introVisible) return;

  scheduleArenaTimeout(() => {
    if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
    if (animation.isPaused || animation.introVisible) return;

    animation.introVisible = true;
    animation.introCompleted = false;
    syncArenaBattleScreen(battle, buildArenaBattleSummary(battle));

    scheduleArenaTimeout(() => {
      if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
      if (animation.isPaused) return;

      animation.introCompleted = true;
      syncArenaBattleScreen(battle, buildArenaBattleSummary(battle));
      scheduleArenaTimeout(() => stepArenaBattleTyping(battle), isArenaBattleFastForward(battle) ? 12 : 40);
    }, getArenaBattleDelay(
      battle,
      ARENA_BATTLE_FIRST_ROUND_APPEAR_DURATION,
      ARENA_BATTLE_FAST_FORWARD_FIRST_ROUND_APPEAR_DURATION
    ));
  }, getArenaBattleDelay(
    battle,
    ARENA_BATTLE_FIRST_ROUND_APPEAR_DELAY,
    ARENA_BATTLE_FAST_FORWARD_FIRST_ROUND_APPEAR_DELAY
  ));
}

function restartArenaBattle(battle) {
  if (!battle) return;

  cancelArenaScheduledWork();
  battle.roundAnimation = null;
  battle.phase = "battle";
  battle.resultEnterStarted = false;
  battle.resultScreenScheduled = false;
  renderArenaBattleScreen(battle);
  startArenaBattleRounds(battle);
}

function toggleArenaBattlePause(battle) {
  if (!battle) return;

  const animation = getArenaBattleAnimationState(battle);
  if (!animation) return;

  if (animation.isPaused) {
    animation.isPaused = false;
    syncArenaBattleScreen(battle, buildArenaBattleSummary(battle));
    continueArenaBattleFlow(battle);
    return;
  }

  animation.isPaused = true;
  cancelArenaScheduledWork();
  syncArenaBattleScreen(battle, buildArenaBattleSummary(battle));
}

function accelerateArenaBattle(battle) {
  if (!battle) return;

  const animation = getArenaBattleAnimationState(battle);
  if (!animation || animation.finished) return;

  animation.fastForward = true;
  animation.isPaused = false;
  cancelArenaScheduledWork();

  const summary = buildArenaBattleSummary(battle);
  const round = summary.rounds[animation.currentIndex];

  if (!round) {
    continueArenaBattleFlow(battle);
    return;
  }

  if (animation.currentIndex === 0 && !animation.introVisible) {
    startArenaBattleFirstRoundIntro(battle);
    return;
  }

  if (animation.typedLength < round.text.length) {
    animation.typedLength = round.text.length;
    syncArenaBattleScreen(battle, summary);
    scheduleArenaTimeout(
      () => revealArenaBattleDamage(battle, round),
      ARENA_BATTLE_FAST_FORWARD_AFTER_TEXT_DELAY
    );
    return;
  }

  if (!animation.damageVisible) {
    scheduleArenaTimeout(() => revealArenaBattleDamage(battle, round), ARENA_BATTLE_FAST_FORWARD_AFTER_TEXT_DELAY);
    return;
  }

  if (round.note && !animation.noteVisible) {
    scheduleArenaTimeout(() => revealArenaBattleNote(battle, round), ARENA_BATTLE_FAST_FORWARD_AFTER_DAMAGE_DELAY);
    return;
  }

  scheduleArenaTimeout(
    () => advanceArenaBattleRound(battle),
    round.note ? ARENA_BATTLE_FAST_FORWARD_AFTER_NOTE_DELAY : ARENA_BATTLE_FAST_FORWARD_NEXT_ROUND_DELAY
  );
}

function bindArenaBattleControls(battle) {
  if (!arenaLiveBattle) return;

  const restartButton = arenaLiveBattle.querySelector('[data-action="restart-battle"]');
  const skipButton = arenaLiveBattle.querySelector('[data-action="skip-battle"]');
  const pauseButton = arenaLiveBattle.querySelector('[data-action="pause-battle"]');
  const replayButton = arenaLiveBattle.querySelector('[data-action="replay-battle"]');
  const goToPetsButton = arenaLiveBattle.querySelector('[data-action="go-to-my-pets"]');

  if (restartButton) {
    restartButton.onclick = () => {
      if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
      restartArenaBattle(state.activeBattle);
    };
  }

  if (pauseButton) {
    pauseButton.onclick = () => {
      if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
      toggleArenaBattlePause(state.activeBattle);
    };
  }

  if (skipButton) {
    skipButton.onclick = () => {
      if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
      accelerateArenaBattle(state.activeBattle);
    };
  }

  if (replayButton) {
    replayButton.onclick = () => {
      if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
      restartArenaBattle(state.activeBattle);
    };
  }

  if (goToPetsButton) {
    goToPetsButton.onclick = () => {
      window.location.href = new URL(DASHBOARD_ROUTE, window.location.origin).toString();
    };
  }
}

function renderArenaBattleScreen(battle) {
  if (!arenaLiveBattle) {
    return;
  }

  const summary = buildArenaBattleSummary(battle);
  if (
    arenaLiveBattle.dataset.battleId !== battle.id ||
    !arenaLiveBattle.querySelector(".arena-live-result-layer")
  ) {
    arenaLiveBattle.dataset.battleId = battle.id;
    arenaLiveBattle.innerHTML = `
      <div class="arena-live-shell">
        <div class="arena-live-overview">
          ${buildArenaBattleOverviewSideMarkup(summary.initiator, "initiator")}
          <div class="arena-live-round-indicator">
            <p class="arena-live-round-value">${summary.currentRound}</p>
            <p class="arena-live-round-label">ROUND</p>
          </div>
          ${buildArenaBattleOverviewSideMarkup(summary.opponent, "opponent")}
        </div>

        <div class="arena-live-controls">
          <button class="arena-live-control-btn arena-live-control-btn--restart" data-action="restart-battle" type="button" aria-label="Restart fight">
            <img src="${BATTLE_CONTROL_RESTART_ICON}" alt="" width="24" height="24" />
          </button>
          <button class="arena-live-skip-btn" data-action="skip-battle" type="button">Speed Up</button>
          <button class="arena-live-control-btn arena-live-control-btn--pause" data-action="pause-battle" type="button" aria-label="Pause fight">
            <img src="${BATTLE_CONTROL_PAUSE_ICON}" alt="" width="24" height="24" />
          </button>
        </div>

        ${buildArenaBattleResultLayerMarkup()}

        <div class="arena-live-stage">
          <div class="arena-live-stage-card arena-live-stage-card--initiator">
            ${buildArenaBattleSideCardMarkup(summary.initiator, "initiator")}
          </div>

          <div class="arena-live-rounds">
            ${summary.rounds.map((round, index) => buildArenaRoundSkeletonMarkup(round, index)).join("")}
          </div>

          <div class="arena-live-stage-card arena-live-stage-card--opponent">
            ${buildArenaBattleSideCardMarkup(summary.opponent, "opponent")}
          </div>
        </div>
      </div>
    `;
  }

  bindArenaBattleControls(battle);
  syncArenaBattleScreen(battle, summary);
}

function getArenaRouletteViewportWidth() {
  if (arenaRoulette?.clientWidth) {
    return arenaRoulette.clientWidth;
  }

  return Math.min(1816, Math.max(window.innerWidth || 0, 320) + 88);
}

function isMobileArenaViewport() {
  return (window.innerWidth || 0) < 768;
}

function getArenaRouletteMetrics() {
  const itemSize = isMobileArenaViewport() ? ARENA_ROULETTE_MOBILE_ITEM_SIZE : ARENA_ROULETTE_ITEM_SIZE;
  const gap = isMobileArenaViewport() ? ARENA_ROULETTE_MOBILE_GAP : ARENA_ROULETTE_GAP;

  return {
    itemSize,
    gap,
    step: itemSize + gap,
  };
}

function getArenaRoulettePositions(battle) {
  if (!battle?.sequence?.length) return null;

  const { itemSize, step } = getArenaRouletteMetrics();
  const rouletteWidth = getArenaRouletteViewportWidth();
  const focusCenter = rouletteWidth / 2;
  const halfVisibleItems = Math.ceil(rouletteWidth / step / 2) + 1;
  const minCenteredStartIndex = Math.min(halfVisibleItems, Math.max(battle.sequence.length - 1, 0));
  const maxCenteredStartIndex = Math.max(minCenteredStartIndex, battle.sequence.length - halfVisibleItems - 1);
  const desiredStartIndex = battle.targetSequenceIndex - ARENA_ROULETTE_TRAVEL_ITEMS;
  const startSequenceIndex = Math.max(
    minCenteredStartIndex,
    Math.min(maxCenteredStartIndex, desiredStartIndex)
  );
  const finalX = focusCenter - battle.targetSequenceIndex * step - itemSize / 2;
  const startX = focusCenter - startSequenceIndex * step - itemSize / 2;

  return { startX, finalX };
}

function setArenaFocusImage(record) {
  if (!arenaRouletteFocusImage) return;

  arenaRouletteFocusImage.src = record?.imageUrl || DEFAULT_CHARACTER_IMAGE;
  arenaRouletteFocusImage.alt = record ? `${getRecordDisplayName(record)} preview` : "";
}

function renderArenaStageTitle(phase) {
  if (!arenaStageTitle) return;

  const titleText = phase === "versus" ? "Preparing fight" : "Looking for your opponent";
  if (isMobileArenaViewport()) {
    arenaStageTitle.innerHTML = `<span class="arena-stage-title-mobile">${titleText}</span>`;
    return;
  }
  arenaStageTitle.innerHTML = `
    <span class="arena-stage-title-text">${titleText}</span>
    <span class="arena-stage-dots" aria-hidden="true">
      <span></span><span></span><span></span>
    </span>
  `;
}

function buildBattleCardMarkup(record, extraClassName = "") {
  const safeRecord = cloneBattleRecord(record);
  const rarity = getRarityMeta(safeRecord?.rarity);
  const name = escapeHtml(getRecordDisplayName(safeRecord));
  const powerText = escapeHtml(getSelectedPowerDescription(safeRecord));
  const level = getRecordLevel(safeRecord);
  const statsMarkup = ATTRS.map((attr) => {
    const value = safeRecord?.attributes?.[attr.key] ?? 0;

    return `
      <div class="success-card-stat">
        <img src="${attr.icon}" alt="" width="16" height="16" />
        <span>${value}</span>
      </div>
    `;
  }).join("");

  return `
    <article class="success-card arena-card ${extraClassName}">
      <div class="success-card-title">${name}</div>
      <div class="success-card-image-wrap">
        <img
          class="success-card-image"
          src="${safeRecord?.imageUrl || DEFAULT_CHARACTER_IMAGE}"
          alt="${escapeHtml(safeRecord?.creatureType || "Pet")} character"
          width="248"
          height="248"
        />
        <span class="success-card-level">Lvl. ${level}</span>
        <span class="success-card-rarity" style="background-color: ${rarity.color};">${rarity.label}</span>
      </div>
      <div class="success-card-stats">${statsMarkup}</div>
      <div class="success-card-power">
        <img class="success-card-power-icon" src="${SUCCESS_POWER_ICON}" alt="" width="20" height="20" />
        <p class="success-card-power-text">${powerText}</p>
      </div>
    </article>
  `;
}

function renderArenaRouletteTrack(battle) {
  if (!arenaRouletteTrack || !battle) return;

  if (arenaRouletteTrack.dataset.battleId !== battle.id) {
    const { itemSize } = getArenaRouletteMetrics();
    arenaRouletteTrack.dataset.battleId = battle.id;
    arenaRouletteTrack.innerHTML = battle.sequence
      .map(
        (record, index) => `
          <div class="arena-roulette-thumb" data-sequence-index="${index}">
            <img src="${record.imageUrl}" alt="${escapeHtml(getRecordDisplayName(record))}" width="${itemSize}" height="${itemSize}" />
          </div>
        `
      )
      .join("");
  }

  if (battle.phase === "roulette" && typeof battle.trackX !== "number") {
    const positions = getArenaRoulettePositions(battle);
    if (positions) {
      battle.trackX = positions.startX;
    }
  }

  if (typeof battle.trackX === "number") {
    arenaRouletteTrack.style.transform = `translate3d(${battle.trackX}px, 0, 0)`;
    updateArenaFocusByTrackPosition(battle, battle.trackX);
  }
}

function syncArenaThumbStates(battle) {
  if (!arenaRouletteTrack || !battle) return;

  const thumbs = arenaRouletteTrack.querySelectorAll(".arena-roulette-thumb");
  thumbs.forEach((thumb, index) => {
    thumb.classList.toggle("is-selected", index === battle.targetSequenceIndex);
  });

  if (arenaRoulette) {
    arenaRoulette.classList.toggle("is-settled", battle.phase !== "roulette");
  }
}

function updateArenaFocusByTrackPosition(battle, currentX) {
  if (!arenaRoulette || !battle?.sequence?.length) return;

  const { itemSize, step } = getArenaRouletteMetrics();
  const focusCenter = arenaRoulette.clientWidth / 2;
  const centeredIndex = Math.max(
    0,
    Math.min(
      battle.sequence.length - 1,
      Math.round((focusCenter - currentX - itemSize / 2) / step)
    )
  );

  if (centeredIndex === arenaFocusedSequenceIndex) return;

  arenaFocusedSequenceIndex = centeredIndex;
  setArenaFocusImage(battle.sequence[centeredIndex]);
}

function finishArenaRoulette(battle, finalX) {
  if (!state.activeBattle || state.activeBattle.id !== battle.id) return;

  state.activeBattle.trackX = finalX;
  state.activeBattle.phase = "focus";
  renderArena();
}

function runArenaRoulette(battle) {
  if (!arenaRouletteTrack || !arenaRoulette || !battle?.sequence?.length) return;

  const positions = getArenaRoulettePositions(battle);
  if (!positions) return;

  const { startX, finalX } = positions;
  const startedAt = performance.now();

  battle.trackX = startX;
  arenaRouletteTrack.style.transform = `translate3d(${startX}px, 0, 0)`;
  updateArenaFocusByTrackPosition(battle, startX);

  const animate = (now) => {
    if (!state.activeBattle || state.activeBattle.id !== battle.id) {
      arenaAnimationFrameId = 0;
      return;
    }

    const progress = Math.min((now - startedAt) / ARENA_ROULETTE_DURATION, 1);
    const eased = 1 - (1 - progress) ** 4;
    const currentX = startX + (finalX - startX) * eased;

    state.activeBattle.trackX = currentX;
    arenaRouletteTrack.style.transform = `translate3d(${currentX}px, 0, 0)`;
    updateArenaFocusByTrackPosition(battle, currentX);

    if (progress < 1) {
      arenaAnimationFrameId = window.requestAnimationFrame(animate);
      return;
    }

    arenaAnimationFrameId = 0;
    finishArenaRoulette(battle, finalX);
  };

  arenaAnimationFrameId = window.requestAnimationFrame(animate);
}

function buildArenaHistorySummary(entry) {
  if (entry?.finalSummaryText) {
    return entry.finalSummaryText;
  }

  const playerName = entry?.playerPet?.name || "Your pet";
  const opponentName = entry?.opponentPet?.name || "the opponent";
  return entry?.outcome === "win"
    ? `${playerName} defeated ${opponentName}.`
    : `${playerName} fought ${opponentName}.`;
}

function buildArenaHistoryCardMarkup(entry) {
  const outcomeLabel = entry?.outcome === "win" ? "Victory" : "Defeat";
  const roleLabel = entry?.playerRole === "defender" ? "Defended" : "Started";
  const playerName = escapeHtml(entry?.playerPet?.name || "Your pet");
  const opponentName = escapeHtml(entry?.opponentPet?.name || "Unknown opponent");
  const summaryText = escapeHtml(buildArenaHistorySummary(entry));
  const battleTime = formatDateTime(entry?.completedAt || entry?.createdAt);
  const replayUrl = escapeHtml(entry?.replayUrl || `/dashboard/?screen=arena&battleId=${encodeURIComponent(String(entry?.battleId || ""))}`);

  return `
    <a
      class="arena-history-card"
      href="${replayUrl}"
      data-action="open-arena-history-battle"
      data-battle-id="${escapeHtml(entry?.battleId || "")}"
      data-replay-url="${replayUrl}"
    >
      <div class="arena-history-card-topline">
        <span class="arena-history-card-outcome arena-history-card-outcome--${escapeHtml(entry?.outcome || "loss")}">${outcomeLabel}</span>
        <span class="arena-history-card-role">${roleLabel}</span>
      </div>

      <div class="arena-history-card-fighters">
        <div class="arena-history-fighter">
          <img
            class="arena-history-fighter-image"
            src="${entry?.playerPet?.imageUrl || DEFAULT_CHARACTER_IMAGE}"
            alt="${playerName}"
            width="56"
            height="56"
          />
          <div class="arena-history-fighter-copy">
            <p class="arena-history-fighter-name">${playerName}</p>
            <p class="arena-history-fighter-meta">Lvl. ${Math.max(1, Math.floor(Number(entry?.playerPet?.level) || 1))}</p>
          </div>
        </div>

        <span class="arena-history-versus-pill">VS</span>

        <div class="arena-history-fighter arena-history-fighter--opponent">
          <img
            class="arena-history-fighter-image"
            src="${entry?.opponentPet?.imageUrl || DEFAULT_CHARACTER_IMAGE}"
            alt="${opponentName}"
            width="56"
            height="56"
          />
          <div class="arena-history-fighter-copy">
            <p class="arena-history-fighter-name">${opponentName}</p>
            <p class="arena-history-fighter-meta">Lvl. ${Math.max(1, Math.floor(Number(entry?.opponentPet?.level) || 1))}</p>
          </div>
        </div>
      </div>

      <p class="arena-history-card-summary">${summaryText}</p>

      <div class="arena-history-card-meta">
        <span>${escapeHtml(battleTime)}</span>
        ${
          Number(entry?.coinReward) > 0 && entry?.outcome === "win"
            ? `<span class="arena-history-card-points">
              <img class="arena-history-card-points-icon" src="/assets/dashboard/points-coin.svg" alt="" width="14" height="14" />
              +${escapeHtml(formatCoins(entry.coinReward))} Points
            </span>`
            : ""
        }
        <span>Open replay</span>
      </div>
    </a>
  `;
}

function renderArenaHistory() {
  if (!arenaHistoryPanel || !arenaHistoryList || !arenaHistoryFeedback || !arenaHistoryCount) {
    return;
  }

  const isAuthenticated = state.isAuthenticated;
  const hasEntries = state.arenaHistoryEntries.length > 0;

  arenaHistoryPanel.classList.toggle("is-loading", state.isArenaHistoryLoading);

  if (!isAuthenticated) {
    arenaHistoryCount.textContent = "Connect wallet to unlock Arena replays.";
    arenaHistoryFeedback.textContent = "Battle history appears here once you're connected.";
    arenaHistoryFeedback.classList.remove("hidden");
    arenaHistoryList.innerHTML = "";
    arenaHistoryLoadMoreBtn?.classList.add("hidden");
    return;
  }

  if (hasEntries) {
    arenaHistoryCount.textContent = `${state.arenaHistoryEntries.length} replay${state.arenaHistoryEntries.length === 1 ? "" : "s"} loaded`;
    arenaHistoryList.innerHTML = state.arenaHistoryEntries.map(buildArenaHistoryCardMarkup).join("");
    arenaHistoryFeedback.classList.add("hidden");
  } else {
    arenaHistoryList.innerHTML = "";
    if (state.isArenaHistoryLoading) {
      arenaHistoryCount.textContent = "Loading battle history...";
      arenaHistoryFeedback.textContent = "Pulling your latest Arena battles.";
    } else if (state.arenaHistoryErrorMessage) {
      arenaHistoryCount.textContent = "Battle history is unavailable";
      arenaHistoryFeedback.textContent = state.arenaHistoryErrorMessage;
    } else if (state.hasLoadedArenaHistory) {
      arenaHistoryCount.textContent = "No replays yet";
      arenaHistoryFeedback.textContent = "Start a real battle and it will show up here for replay.";
    } else {
      arenaHistoryCount.textContent = "Loading battle history...";
      arenaHistoryFeedback.textContent = "Pulling your latest Arena battles.";
    }
    arenaHistoryFeedback.classList.remove("hidden");
  }

  if (arenaHistoryLoadMoreBtn) {
    const shouldShowLoadMore =
      isAuthenticated && state.arenaHistoryHasMore && !state.isArenaHistoryLoading && hasEntries;
    arenaHistoryLoadMoreBtn.classList.toggle("hidden", !shouldShowLoadMore);
    arenaHistoryLoadMoreBtn.disabled = state.isArenaHistoryLoading;
  }
}

function renderArenaReplayBanner() {
  if (!arenaReplayBanner || !arenaReplayBannerTitle || !arenaReplayBackBtn) {
    return;
  }

  const replayBattleId = String(state.activeBattle?.isReplay ? state.activeBattle.battleId : state.arenaReplayRequest?.battleId || "").trim();
  const showBanner = Boolean(replayBattleId);

  arenaReplayBanner.classList.toggle("hidden", !showBanner);
  if (!showBanner) {
    return;
  }

  if (state.activeBattle?.isReplay) {
    const attackerName = getRecordDisplayName(state.activeBattle?.initiator);
    const defenderName = getRecordDisplayName(state.activeBattle?.opponent);
    arenaReplayBannerTitle.textContent = `${attackerName} vs ${defenderName}`;
  } else if (state.arenaReplayRequest?.status === "waiting") {
    arenaReplayBannerTitle.textContent = "Replay is still being prepared";
  } else if (state.arenaReplayRequest?.status === "unavailable") {
    arenaReplayBannerTitle.textContent = "Replay unavailable";
  } else {
    arenaReplayBannerTitle.textContent = "Loading replay";
  }
}

function renderArena() {
  if (!screenArena || !arenaIdleState || !arenaBattleState || !arenaStartFightBtn) return;

  const battle = state.activeBattle;
  const replayRequest = state.arenaReplayRequest;
  const isReplayPage = Boolean(battle || replayRequest?.battleId);
  const isBattleScreen = isArenaBattleScreenPhase(battle?.phase);
  const isArenaStagePhase = Boolean(battle && !isBattleScreen);
  const hasStarter = Boolean(getArenaStarterRecord());
  const isPreparingFight = state.isFightPreparing && !battle;
  const canStartFight = hasStarter && state.energyCurrent > 0 && !state.isFightPreparing;
  const isReplayStatusVisible = !battle && Boolean(replayRequest?.battleId);

  renderArenaHistory();
  renderArenaReplayBanner();

  if (arenaLayout) {
    arenaLayout.classList.toggle("is-history-only", !isReplayPage);
    arenaLayout.classList.toggle("is-replay-view", isReplayPage);
  }
  if (arenaHistoryPanel) {
    arenaHistoryPanel.classList.toggle("hidden", isReplayPage);
  }
  if (arenaIdleState?.parentElement) {
    arenaIdleState.parentElement.classList.toggle("hidden", !isReplayPage);
  }

  if (dashboardTabs) {
    dashboardTabs.classList.remove("hidden");
  }
  if (dashboardTopbar) {
    dashboardTopbar.classList.toggle("is-battle-header", isBattleScreen);
    dashboardTopbar.classList.toggle("is-arena-stage-header", isArenaStagePhase);
  }

  arenaBattleState.classList.toggle("is-live-battle", Boolean(isBattleScreen));

  arenaStartFightBtn.disabled = !canStartFight;
  arenaStartFightBtn.classList.toggle("disabled", !canStartFight);
  arenaStartFightBtn.classList.toggle("enabled", canStartFight);
  arenaStartFightBtn.classList.toggle("is-loading", isPreparingFight);
  arenaStartFightBtn.innerHTML = isPreparingFight
    ? getFightButtonMarkup({ isLoading: true })
    : "<span>Start Fight</span>";

  if (arenaPanelEyebrow) {
    arenaPanelEyebrow.textContent = isReplayStatusVisible ? "Battle replay" : "Arena";
  }
  if (arenaPanelTitle) {
    if (replayRequest?.status === "waiting") {
      arenaPanelTitle.textContent = "Replay is still getting ready";
    } else if (replayRequest?.status === "unavailable") {
      arenaPanelTitle.textContent = "Replay unavailable";
    } else if (replayRequest?.status === "loading") {
      arenaPanelTitle.textContent = "Loading replay";
    } else {
      arenaPanelTitle.textContent = "Arena";
    }
  }
  if (arenaPanelDescription) {
    if (replayRequest?.message) {
      arenaPanelDescription.textContent = replayRequest.message;
    } else {
      arenaPanelDescription.textContent = hasStarter
        ? "Select any pet in My Pets or start with your latest one to match a real opponent."
        : "Create your first pet to unlock the battle preparation flow.";
    }
  }
  if (arenaIdleSecondaryBtn) {
    arenaIdleSecondaryBtn.classList.toggle("hidden", !isReplayStatusVisible);
    arenaIdleSecondaryBtn.textContent = "Back to history";
  }
  if (arenaStartFightBtn) {
    arenaStartFightBtn.classList.toggle("hidden", isReplayStatusVisible);
  }

  arenaIdleState.classList.toggle("hidden", Boolean(battle));
  arenaBattleState.classList.toggle("hidden", !battle);

  if (!isReplayPage) {
    arenaIdleState.classList.add("hidden");
    arenaBattleState.classList.add("hidden");
    if (arenaLiveBattle) {
      arenaLiveBattle.classList.add("hidden");
      arenaLiveBattle.setAttribute("aria-hidden", "true");
    }
    return;
  }

  if (!battle) {
    if (arenaLiveBattle) {
      arenaLiveBattle.classList.add("hidden");
      arenaLiveBattle.setAttribute("aria-hidden", "true");
    }
    return;
  }

  if (isBattleScreen) {
    renderArenaBattleScreen(battle);
    if (arenaRoulette) {
      arenaRoulette.classList.remove("is-fading-out");
    }
    if (arenaRouletteFocus) {
      arenaRouletteFocus.classList.add("is-hidden");
    }
    if (arenaFocusCard) {
      arenaFocusCard.classList.add("hidden");
    }
    if (arenaVersus) {
      arenaVersus.classList.add("hidden");
      arenaVersus.setAttribute("aria-hidden", "true");
    }
    if (arenaLiveBattle) {
      arenaLiveBattle.classList.remove("hidden");
      arenaLiveBattle.setAttribute("aria-hidden", "false");
    }

    if (battle.phase === "battle-enter" && !battle.battleEnterStarted) {
      battle.battleEnterStarted = true;
      const battleShell = arenaLiveBattle?.querySelector(".arena-live-shell");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          battleShell?.classList.add("is-landing");
        });
      });
      scheduleArenaTimeout(() => {
        if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
        state.activeBattle.phase = "battle";
        renderArena();
      }, ARENA_BATTLE_ENTER_DURATION);
    }

    if (battle.phase === "battle") {
      startArenaBattleRounds(battle);
    }

    if (battle.phase === "battle-result-enter" && !battle.resultEnterStarted) {
      battle.resultEnterStarted = true;
      const battleShell = arenaLiveBattle?.querySelector(".arena-live-shell");
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          battleShell?.classList.add("is-result-landing");
        });
      });
      scheduleArenaTimeout(() => {
        if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
        state.activeBattle.phase = "battle-result";
        renderArena();
      }, ARENA_BATTLE_RESULT_ENTER_DURATION);
    }

    return;
  }

  if (arenaLiveBattle) {
    arenaLiveBattle.classList.add("hidden");
    arenaLiveBattle.setAttribute("aria-hidden", "true");
  }

  renderArenaRouletteTrack(battle);
  syncArenaThumbStates(battle);

  if (typeof battle.trackX === "number" && arenaRouletteTrack) {
    arenaRouletteTrack.style.transform = `translate3d(${battle.trackX}px, 0, 0)`;
    updateArenaFocusByTrackPosition(battle, battle.trackX);
  } else {
    setArenaFocusImage(battle.opponent);
  }

  renderArenaStageTitle(battle.phase);

  if (arenaRoulette) {
    arenaRoulette.classList.toggle("is-fading-out", battle.phase === "versus");
  }

  if (arenaRouletteFocus) {
    arenaRouletteFocus.classList.toggle("is-hidden", battle.phase !== "roulette");
  }

  if (battle.phase === "roulette") {
    if (arenaFocusCard) {
      arenaFocusCard.classList.add("hidden");
    }
    if (arenaVersus) {
      arenaVersus.classList.add("hidden");
      arenaVersus.classList.remove("is-revealed");
      arenaVersus.setAttribute("aria-hidden", "true");
    }

    if (!battle.rouletteStarted) {
      battle.rouletteStarted = true;
      window.requestAnimationFrame(() => runArenaRoulette(battle));
    }

    return;
  }

  if (arenaFocusCard) {
    arenaFocusCard.innerHTML = buildBattleCardMarkup(battle.opponent, "arena-card--focus");
    const isMobileVersusIntro = isMobileArenaViewport() && battle.phase === "versus";
    arenaFocusCard.classList.toggle("hidden", battle.phase === "versus" && !isMobileVersusIntro);
    arenaFocusCard.classList.toggle("is-fading-out", isMobileVersusIntro);
  }

  if (battle.phase === "focus") {
    if (arenaVersus) {
      arenaVersus.classList.add("hidden");
      arenaVersus.classList.remove("is-revealed");
      arenaVersus.setAttribute("aria-hidden", "true");
    }

    if (!battle.focusScheduled) {
      battle.focusScheduled = true;
      scheduleArenaTimeout(() => {
        if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
        state.activeBattle.phase = "versus";
        renderArena();
      }, ARENA_FOCUS_CARD_DELAY);
    }

    return;
  }

  if (arenaOpponentCard) {
    arenaOpponentCard.innerHTML = buildBattleCardMarkup(battle.opponent, "arena-card--versus");
  }

  if (arenaPlayerCard) {
    arenaPlayerCard.innerHTML = buildBattleCardMarkup(battle.initiator, "arena-card--versus");
  }

  if (arenaFocusCard) {
    arenaFocusCard.classList.add("hidden");
  }
  if (arenaVersus) {
    const revealImmediately = isMobileArenaViewport();
    arenaVersus.classList.remove("hidden");
    arenaVersus.setAttribute("aria-hidden", "false");
    arenaVersus.classList.toggle("is-revealed", revealImmediately);
  }

  if (!battle.versusRendered) {
    battle.versusRendered = true;
    if (arenaVersus && !isMobileArenaViewport()) {
      arenaVersus.classList.remove("is-revealed");
    }
    if (!isMobileArenaViewport()) {
      scheduleArenaTimeout(() => {
        if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
        if (arenaVersus) {
          arenaVersus.classList.add("is-revealed");
        }
      }, 40);
    }
  }

  if (!battle.battleScreenScheduled) {
    battle.battleScreenScheduled = true;
    scheduleArenaTimeout(() => {
      if (!state.activeBattle || state.activeBattle.id !== battle.id) return;
      state.activeBattle.phase = "battle-enter";
      renderArena();
    }, ARENA_BATTLE_SCREEN_DELAY);
  }

}

async function startFightFlow(characterId) {
  if (state.isFightPreparing) {
    return;
  }

  const sourceRecord =
    state.characters.find((record) => String(record.id) === String(characterId)) || getArenaStarterRecord();
  const initiator = cloneBattleRecord(sourceRecord);

  if (!initiator) {
    showToast("Create a pet before starting a fight.");
    return;
  }

  if (state.energyCurrent <= 0) {
    showToast("You need more energy before starting the next fight.");
    return;
  }

  let createdBattleId = "";
  clearArenaAnimation();
  resetArenaRevealSession();

  state.energyCurrent = Math.max(0, state.energyCurrent - 1);
  state.isFightPreparing = true;
  state.fightPreparingCharacterId = String(initiator.id || characterId || "");
  setArenaRevealSession({
    attackerPetId: state.fightPreparingCharacterId,
    battleId: "",
    selectedOpponentId: "",
    status: "preparing",
    visibleCandidateIds: [],
    preparedCandidateIds: [],
    recoveryMessage: "",
  });
  updateEnergyUi();
  renderCabinet();
  renderArena();

  try {
    const minimumSpinnerPromise = wait(ARENA_PREPARE_MIN_SPINNER_DURATION);
    const preparedPoolPromise = warmArenaOpponentPool(initiator.id).catch(() => []);
    const createBattlePayload = await createArenaBattleRecord(initiator.id);
    createdBattleId = String(createBattlePayload?.battleId || "").trim();
    const revealBundle = normalizeArenaRevealBundle(createBattlePayload?.reveal);

    const authoritativeCurrency =
      createBattlePayload?.currency && typeof createBattlePayload.currency === "object"
        ? {
            balance: Math.max(0, Math.floor(Number(createBattlePayload.currency.balance) || 0)),
            totalEarned: Math.max(0, Math.floor(Number(createBattlePayload.currency.totalEarned) || 0)),
          }
        : null;
    if (authoritativeCurrency) {
      state.pendingCurrency = authoritativeCurrency;
    }

    if (!createdBattleId) {
      throw new Error("Battle id was not returned.");
    }

    if (!revealBundle?.selectedOpponent || !revealBundle.carouselCandidates.length) {
      throw createArenaRevealError();
    }

    setArenaRevealSession({
      ...(state.arenaRevealSession || {}),
      battleId: createdBattleId,
      selectedOpponentId: String(revealBundle.selectedOpponent.id || "").trim(),
      status: "preparing",
      recoveryMessage: "",
    });

    const inlineBattle =
      createBattlePayload?.battle?.status === "ready" ? createBattlePayload.battle : null;
    const [readyBattle, preparedReveal] = await Promise.all([
      inlineBattle ? Promise.resolve(inlineBattle) : pollArenaBattleRecord(createdBattleId),
      preparedPoolPromise.then((preparedPool) =>
        prepareArenaRevealCandidates(revealBundle, preparedPool)
      ),
      minimumSpinnerPromise,
    ]);
    const fallbackOpponent =
      preparedReveal.preparedCandidates.find(
        (record) => String(record?.id || "") === String(readyBattle?.defender?.id || "")
      ) ||
      preparedReveal.selectedOpponent;
    const resolvedInitiator = mapBattleParticipantToArenaRecord(readyBattle?.attacker, initiator);
    const resolvedOpponent = mapBattleParticipantToArenaRecord(readyBattle?.defender, fallbackOpponent);

    const [preparedInitiator, preparedOpponent] = await Promise.all([
      prepareArenaRecordImage(resolvedInitiator),
      prepareArenaRecordImage(resolvedOpponent),
    ]);

    await refreshArenaProfileState().catch(() => null);

    // refreshArenaProfileState reads /api/character/me, which goes through the
    // same blob CDN that may briefly serve a stale snapshot (no Points credited
    // yet) right after a POST. The POST response itself, however, returns the
    // authoritative currency synchronously — so reassert it here in case the
    // refresh overwrote pendingCurrency with stale data.
    if (authoritativeCurrency) {
      state.pendingCurrency = authoritativeCurrency;
    }

    state.isFightPreparing = false;
    state.fightPreparingCharacterId = "";
    clearArenaReplayRequest();
    resetArenaRevealSession();
    state.activeBattle = createResolvedArenaBattle({
      battlePayload: readyBattle,
      preparedInitiator,
      preparedOpponent,
      preparedPool: preparedReveal.preparedCandidates,
    });
    state.arenaSelectedHistoryBattleId = createdBattleId;
    void loadArenaHistory({ force: true }).catch(() => null);

    moveTo("arena");
  } catch (error) {
    if (createdBattleId) {
      await refreshArenaProfileState().catch(() => null);
    } else {
      state.energyCurrent = Math.min(state.energyMax, state.energyCurrent + 1);
    }

    setArenaRevealRecovery(
      error.message || "Couldn't prepare a trustworthy rival reveal. Please retry."
    );
    state.isFightPreparing = false;
    state.fightPreparingCharacterId = "";
    if (state.pendingCurrency) {
      state.currency = state.pendingCurrency;
      state.pendingCurrency = null;
      updateDashboardPointsUi();
    }
    updateEnergyUi();
    renderCabinet();
    renderArena();
    showToast(error.message || "Couldn't prepare the fight. Please try again.");
    console.error(error);
  }
}

function renderCabinet() {
  if (dashboardTopbar) {
    dashboardTopbar.classList.remove("is-battle-header");
  }
  if (dashboardTabs) {
    dashboardTabs.classList.remove("hidden");
  }
  const records = [...state.characters].reverse();
  const canCreateAnother = hasCharacterCreationCapacity();
  const canFight = ENABLE_ARENA && state.energyCurrent > 0 && !state.isFightPreparing;
  if (!state.hasHydratedCharacters) {
    if (cabinetCount) {
      cabinetCount.textContent = "Loading...";
    }

    if (createAnotherBtn) {
      createAnotherBtn.disabled = true;
      createAnotherBtn.classList.remove("enabled");
      createAnotherBtn.classList.add("disabled");
      createAnotherBtn.setAttribute("aria-disabled", "true");
      createAnotherBtn.title = "";
    }

    cabinetCard.innerHTML = '<p class="cabinet-empty">Loading characters...</p>';
    return;
  }

  if (cabinetCount) {
    const total = records.length;
    cabinetCount.textContent = `${total} character${total === 1 ? "" : "s"}`;
  }

  if (createAnotherBtn) {
    createAnotherBtn.disabled = false;
    createAnotherBtn.classList.toggle("disabled", !canCreateAnother);
    createAnotherBtn.classList.toggle("enabled", canCreateAnother);
    createAnotherBtn.setAttribute("aria-disabled", canCreateAnother ? "false" : "true");
    createAnotherBtn.title = canCreateAnother
      ? ""
      : `Character limit reached. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`;
  }

  if (!records.length) {
    cabinetCard.innerHTML = '<p class="cabinet-empty">No characters created yet.</p>';
    return;
  }

  cabinetCard.innerHTML = records
    .map((record) => {
      const rarity = getRarityMeta(record.rarity);
      const upgradePoints = getRecordAttributePointsAvailable(record);
      const isUpgradeable = canUpgradeRecord(record);
      const isPreparingThisFight =
        state.isFightPreparing && String(state.fightPreparingCharacterId) === String(record.id);
      const shouldRenderFightButton = ENABLE_ARENA;
      const isFightButtonDisabled = !canFight || isPreparingThisFight;
      const hasNoEnergy = state.energyCurrent <= 0 && !state.isFightPreparing;
      const fightButtonMarkup = `
            <button
              class="cabinet-fight-btn${isPreparingThisFight ? " is-loading" : ""}${!canFight ? " disabled" : ""}"
              type="button"
              data-character-id="${record.id}"
              ${isFightButtonDisabled ? 'disabled aria-disabled="true"' : ""}
            >
              ${getFightButtonMarkup({ isLoading: isPreparingThisFight })}
            </button>
      `;
      const statsMarkup = ATTRS.map((attr) => {
        const value = record.attributes[attr.key];
        return `
          <div class="success-card-stat">
            <img src="${attr.icon}" alt="" width="16" height="16" />
            <span>${value}</span>
          </div>
        `;
      }).join("");

      return `
        <article class="cabinet-character${isUpgradeable ? " cabinet-character--upgradeable" : ""}" data-character-id="${record.id}">
          <div class="success-card cabinet-success-card" aria-hidden="true">
            <div class="success-card-title">${record.name || record.displayName || record.creatureType}</div>
            ${
              isUpgradeable
                ? `
            <button
              class="cabinet-upgrade-btn"
              type="button"
              data-action="open-upgrade"
              data-character-id="${record.id}"
              aria-label="Upgrade ${escapeHtml(getRecordDisplayName(record))}"
            >
              <img src="/assets/character/upgrade-indicator.svg" alt="" width="14" height="14" />
              <span>Upgrade</span>
            </button>
            `
                : ""
            }
            <div class="success-card-image-wrap">
              <img class="success-card-image" src="${record.imageUrl}" alt="${record.creatureType} character" width="248" height="248" />
              <span class="success-card-level">Lvl. ${getRecordLevel(record)}</span>
              <span class="success-card-rarity" style="background-color: ${rarity.color};">${rarity.label}</span>
              <span class="success-card-exp-label">Experience</span>
              <span class="success-card-exp-value">${getRecordExperience(record)}/${getRecordExperienceForNextLevel(record)}</span>
              <span class="success-card-exp-track"></span>
              <span class="success-card-exp-progress" style="width: ${getRecordExperienceProgress(record)}%;"></span>
            </div>
            <div class="success-card-stats">${statsMarkup}</div>
            <div class="success-card-power">
              <img class="success-card-power-icon" src="${SUCCESS_POWER_ICON}" alt="" width="20" height="20" />
              <p class="success-card-power-text">${getSelectedPowerDescription(record)}</p>
            </div>
            ${
              shouldRenderFightButton
                ? `
            ${
              hasNoEnergy
                ? `
            <div class="cabinet-fight-tooltip-wrap" tabindex="0" aria-describedby="cabinetFightTooltip-${record.id}">
              ${fightButtonMarkup}
              <span class="cabinet-action-tooltip" id="cabinetFightTooltip-${record.id}">
                Energy refills every day. Come back tomorrow!
              </span>
            </div>
            `
                : fightButtonMarkup
            }
            `
                : ""
            }
          </div>
        </article>
      `;
    })
    .join("");
}

function buildStagedUpgradePayload() {
  return ATTRS.reduce((acc, attr) => {
    const value = Math.max(0, Math.floor(Number(state.attrs?.[attr.key]) || 0));
    if (value > 0) {
      acc[attr.key] = value;
    }
    return acc;
  }, {});
}

function openUpgradeFlow(characterId, { pushRoute = true } = {}) {
  primeUpgradeSession(characterId);
  moveTo("upgrade", { replace: !pushRoute });
}

async function saveUpgradeAllocation() {
  if (!isUpgradeStep() || state.isSavingUpgrade) return;

  const upgradeState = getUpgradeRouteState();
  const attributeIncrements = buildStagedUpgradePayload();
  if (
    upgradeState.blocked ||
    !upgradeState.record ||
    !Object.keys(attributeIncrements).length ||
    pointsRemaining() < 0
  ) {
    renderAttrsStep();
    return;
  }

  state.isSavingUpgrade = true;
  renderAttrsStep();

  try {
    const data = await apiRequest("/api/character/upgrade", {
      characterId: upgradeState.record.id,
      attributeIncrements,
    });

    syncStateWithPayload(data);
    const updatedCharacter = normalizeCharacterRecord(data?.character) || findCharacterById(upgradeState.record.id);
    const remainingPoints = getRecordAttributePointsAvailable(updatedCharacter);

    resetUpgradeSession();
    moveTo("cabinet", { replace: true });
    showToast(
      remainingPoints > 0
        ? `Upgrade saved. ${remainingPoints} point${remainingPoints === 1 ? "" : "s"} still available.`
        : "Upgrade saved."
    );
  } catch (error) {
    if (/unauthorized/i.test(error?.message || "")) {
      handleFlowError(error, "Unable to save upgrade.");
    } else {
      showToast(error.message || "Unable to save upgrade.");
    }
  } finally {
    state.isSavingUpgrade = false;
    if (isUpgradeStep()) {
      renderAttrsStep();
    }
  }
}

async function syncDashboardStateFromLocation() {
  const requestedScreen = getRequestedScreen();
  if (requestedScreen === "arena") {
    const requestedBattleId = getArenaRequestedBattleId();
    const arenaPreviewMode = getArenaPreviewMode();

    if (requestedBattleId) {
      await ensureArenaReplayBattle(requestedBattleId, { source: "history-link" });
    } else if (arenaPreviewMode) {
      await ensureArenaPreviewBattle(arenaPreviewMode);
    } else {
      closeArenaReplayBattle();
    }

    moveTo("arena", { replace: true });
    return;
  }

  if (requestedScreen === "upgrade") {
    primeUpgradeSession(getRequestedUpgradePetId());
    moveTo("upgrade", { replace: true });
    return;
  }

  if (requestedScreen === "admin") {
    moveTo("admin", { replace: true });
    return;
  }

  moveTo("cabinet", { replace: true });
}

function getAdminActiveQuery() {
  if (state.adminSection === "waitlist") {
    return state.adminWaitlistQuery;
  }

  if (state.adminSection === "battles") {
    return state.adminBattleQuery;
  }

  return state.adminWalletQuery;
}

function setAdminActiveQuery(value) {
  const normalizedValue = normalizeAdminSearchValue(value);

  if (state.adminSection === "waitlist") {
    state.adminWaitlistQuery = normalizedValue;
    return;
  }

  if (state.adminSection === "battles") {
    state.adminBattleQuery = normalizedValue;
    return;
  }

  state.adminWalletQuery = normalizedValue;
}

function getAdminActivePage() {
  if (state.adminSection === "waitlist") {
    return state.adminWaitlistPage;
  }

  if (state.adminSection === "battles") {
    return state.adminBattlePage;
  }

  return state.adminPage;
}

function setAdminActivePage(value) {
  if (state.adminSection === "waitlist") {
    state.adminWaitlistPage = value;
    return;
  }

  if (state.adminSection === "battles") {
    state.adminBattlePage = value;
    return;
  }

  state.adminPage = value;
}

function getFilteredAdminCharacters() {
  return filterAdminCharacters(state.adminCharacters, state.adminWalletQuery);
}

function getFilteredAdminWaitlistEntries() {
  return filterAdminWaitlistEntries(state.adminWaitlistEntries, state.adminWaitlistQuery);
}

function getFilteredAdminBattles() {
  return filterAdminBattles(state.adminBattles, state.adminBattleQuery);
}

function getAdminCurrentRecords() {
  if (state.adminSection === "waitlist") {
    return getFilteredAdminWaitlistEntries();
  }

  if (state.adminSection === "battles") {
    return getFilteredAdminBattles();
  }

  return getFilteredAdminCharacters();
}

function getAdminPaginationState(records = getAdminCurrentRecords()) {
  const totalItems = records.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / ADMIN_PAGE_SIZE));
  const currentPage = Math.min(Math.max(1, getAdminActivePage()), totalPages);
  const startIndex = (currentPage - 1) * ADMIN_PAGE_SIZE;

  setAdminActivePage(currentPage);

  return {
    totalItems,
    totalPages,
    currentPage,
    startIndex,
    endIndex: startIndex + ADMIN_PAGE_SIZE,
    pageRecords: records.slice(startIndex, startIndex + ADMIN_PAGE_SIZE),
  };
}

function renderAdminPagination(records) {
  if (!adminPagination || !adminPageInfo || !adminPrevBtn || !adminNextBtn) return;

  const isLoading =
    state.adminSection === "waitlist"
      ? state.isAdminWaitlistLoading
      : state.adminSection === "battles"
        ? state.isAdminBattlesLoading
        : state.isAdminLoading;
  const hasLoaded =
    state.adminSection === "waitlist"
      ? state.hasLoadedAdminWaitlist
      : state.adminSection === "battles"
        ? state.hasLoadedAdminBattles
        : state.hasLoadedAdminCharacters;

  if (isLoading && !hasLoaded) {
    adminPagination.classList.add("hidden");
    return;
  }

  const { totalItems, totalPages, currentPage, startIndex, endIndex } =
    getAdminPaginationState(records);

  if (!totalItems || totalPages <= 1) {
    adminPagination.classList.add("hidden");
    return;
  }

  adminPagination.classList.remove("hidden");
  const visibleFrom = startIndex + 1;
  const visibleTo = Math.min(endIndex, totalItems);
  adminPageInfo.textContent = `${visibleFrom}-${visibleTo} of ${totalItems}`;
  adminPrevBtn.disabled = currentPage <= 1;
  adminNextBtn.disabled = currentPage >= totalPages;
}

function isAdminCharacterExpanded(characterId) {
  return state.expandedAdminCharacterIds.includes(characterId);
}

function toggleAdminCharacterExpanded(characterId) {
  if (!characterId) return;

  if (isAdminCharacterExpanded(characterId)) {
    state.expandedAdminCharacterIds = state.expandedAdminCharacterIds.filter((id) => id !== characterId);
  } else {
    state.expandedAdminCharacterIds = [...state.expandedAdminCharacterIds, characterId];
  }

  renderAdminTable();
}

function buildAdminInfoItems(items) {
  return items
    .map(
      ({ label, value, valueHtml }) => `
        <div class="admin-info-item">
          <span class="admin-info-label">${escapeHtml(label)}</span>
          <span class="admin-info-value">${valueHtml || escapeHtml(value)}</span>
        </div>
      `
    )
    .join("");
}

function createAdminDetailsMarkup(record) {
  const rarity = getRarityMeta(record?.rarity);
  const attributeItems = ATTRS.map((attr) => ({
    label: attr.label,
    value: record?.attributes?.[attr.key] ?? 0,
  }));
  const variableItems = Object.entries(record?.variables || {}).map(([key, value]) => ({
    label: formatAdminFieldLabel(key),
    value: value || "—",
  }));
  const metaItems = [
    { label: "Name", value: record.name || record.displayName || record.creatureType || "Unknown" },
    { label: "Creature type", value: record.creatureType || "Unknown" },
    {
      label: "Rarity",
      valueHtml: `<span class="admin-rarity-text" style="color: ${escapeHtml(rarity.color)};">${escapeHtml(record.rarity || "Unknown")}</span>`,
    },
    { label: "Selected power", value: getSelectedPowerDescription(record) },
    { label: "Attribute budget", value: record.attributePoints ?? 0 },
    { label: "Image provider", value: record.imageProvider || "Unknown" },
  ];

  return `
    <div class="admin-details-grid">
      <section class="admin-details-card">
        <h3>Character</h3>
        <div class="admin-info-grid">
          ${buildAdminInfoItems(metaItems)}
        </div>
      </section>
      <section class="admin-details-card">
        <h3>Attributes</h3>
        <div class="admin-info-grid">
          ${buildAdminInfoItems(attributeItems)}
        </div>
      </section>
      <section class="admin-details-card admin-details-card-wide">
        <h3>Random variables</h3>
        <div class="admin-info-grid">
          ${buildAdminInfoItems(variableItems.length ? variableItems : [{ label: "Variables", value: "No data" }])}
        </div>
      </section>
    </div>
  `;
}

function updateAdminCount(records) {
  if (!adminCount) return;

  if (state.adminSection === "waitlist") {
    if (state.isAdminWaitlistLoading && !state.hasLoadedAdminWaitlist) {
      adminCount.textContent = "Loading waitlist entries...";
      return;
    }

    const total = records.length;
    const baseLabel = `${total} waitlist entr${total === 1 ? "y" : "ies"}`;
    adminCount.textContent = state.adminWaitlistQuery.trim() ? `${baseLabel} found` : baseLabel;
    return;
  }

  if (state.adminSection === "battles") {
    if (state.isAdminBattlesLoading && !state.hasLoadedAdminBattles) {
      adminCount.textContent = "Loading completed battles...";
      return;
    }

    const total = records.length;
    const baseLabel = `${total} completed battle${total === 1 ? "" : "s"}`;
    adminCount.textContent = state.adminBattleQuery.trim() ? `${baseLabel} found` : baseLabel;
    return;
  }

  if (state.isAdminLoading && !state.hasLoadedAdminCharacters) {
    adminCount.textContent = "Loading characters...";
    return;
  }

  const total = records.length;
  const baseLabel = `${total} created character${total === 1 ? "" : "s"}`;
  adminCount.textContent = state.adminWalletQuery.trim() ? `${baseLabel} found` : baseLabel;
}

function renderAdminStats() {
  const statLabels = [
    adminStatLabel1,
    adminStatLabel2,
    adminStatLabel3,
    adminStatLabel4,
    adminStatLabel5,
    adminStatLabel6,
  ];
  const statValues = [
    adminUsersCount,
    adminCharactersCount,
    adminRarityCommon,
    adminRarityRare,
    adminRarityEpic,
    adminRarityLegendary,
  ];

  const isInitialLoading =
    (state.adminSection === "characters" && state.isAdminLoading && !state.hasLoadedAdminCharacters) ||
    (state.adminSection === "battles" && state.isAdminBattlesLoading && !state.hasLoadedAdminBattles) ||
    (state.adminSection === "waitlist" &&
      state.isAdminWaitlistLoading &&
      !state.hasLoadedAdminWaitlist);

  if (isInitialLoading) {
    statValues.forEach((node) => {
      if (node) {
        node.textContent = "—";
        node.style.color = "#101828";
      }
    });
    return;
  }

  if (state.adminSection === "battles") {
    const summary = state.adminBattleSummary || {};
    const labels = [
      "Completed Battles",
      "Avg Rounds (50)",
      "Sample Size",
      "AI Narration",
      "Template",
      "24h",
    ];
    const values = [
      summary.totalCompletedBattles || 0,
      Number.isFinite(Number(summary.averageRoundsLast50))
        ? Number(summary.averageRoundsLast50).toFixed(
            Number(summary.averageRoundsLast50) % 1 === 0 ? 0 : 1
          )
        : "0",
      summary.averageRoundsSampleSize || 0,
      summary.aiNarratedBattles || 0,
      summary.templateNarratedBattles || 0,
      summary.completedLast24Hours || 0,
    ];

    statLabels.forEach((node, index) => {
      if (node) node.textContent = labels[index];
    });
    statValues.forEach((node, index) => {
      if (node) {
        node.textContent = String(values[index]);
        node.style.color = "#101828";
      }
    });
    return;
  }

  if (state.adminSection === "waitlist") {
    const records = state.adminWaitlistEntries;
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
    const uniqueEmails = new Set(records.map((entry) => String(entry.email || "").trim()).filter(Boolean)).size;
    const todayCount = records.filter((entry) => Date.parse(entry.createdAt || 0) >= dayAgo).length;
    const weekCount = records.filter((entry) => Date.parse(entry.createdAt || 0) >= weekAgo).length;
    const monthCount = records.filter((entry) => Date.parse(entry.createdAt || 0) >= monthAgo).length;
    const landingCount = records.filter((entry) => String(entry.source || "") === "landing").length;

    const labels = ["Entries", "Unique Emails", "Today", "7 Days", "30 Days", "Landing"];
    const values = [records.length, uniqueEmails, todayCount, weekCount, monthCount, landingCount];

    statLabels.forEach((node, index) => {
      if (node) node.textContent = labels[index];
    });
    statValues.forEach((node, index) => {
      if (node) {
        node.textContent = String(values[index]);
        node.style.color = "#101828";
      }
    });
    return;
  }

  const records = state.adminCharacters;
  const rarityCounts = {
    common: 0,
    rare: 0,
    epic: 0,
    legendary: 0,
  };

  records.forEach((record) => {
    const rarityKey = normalizeRarityLabel(record?.rarity);
    if (rarityKey in rarityCounts) {
      rarityCounts[rarityKey] += 1;
    }
  });

  const users = new Set(
    records
      .map((record) => String(record?.creatorWallet || "").trim())
      .filter(Boolean)
  ).size;

  if (adminUsersCount) adminUsersCount.textContent = String(users);
  if (adminCharactersCount) adminCharactersCount.textContent = String(records.length);
  if (adminRarityCommon) adminRarityCommon.textContent = String(rarityCounts.common);
  if (adminRarityRare) adminRarityRare.textContent = String(rarityCounts.rare);
  if (adminRarityEpic) adminRarityEpic.textContent = String(rarityCounts.epic);
  if (adminRarityLegendary) adminRarityLegendary.textContent = String(rarityCounts.legendary);
  if (adminUsersCount) adminUsersCount.style.color = "";
  if (adminCharactersCount) adminCharactersCount.style.color = "";
  if (adminRarityCommon) adminRarityCommon.style.color = "";
  if (adminRarityRare) adminRarityRare.style.color = "";
  if (adminRarityEpic) adminRarityEpic.style.color = "";
  if (adminRarityLegendary) adminRarityLegendary.style.color = "";

  if (adminStatLabel1) adminStatLabel1.textContent = "Users";
  if (adminStatLabel2) adminStatLabel2.textContent = "Characters";
  if (adminStatLabel3) adminStatLabel3.textContent = "Common";
  if (adminStatLabel4) adminStatLabel4.textContent = "Rare";
  if (adminStatLabel5) adminStatLabel5.textContent = "Epic";
  if (adminStatLabel6) adminStatLabel6.textContent = "Legendary";
}

function setAdminEmptyState(message, shouldShow) {
  if (!adminEmpty) return;
  adminEmpty.textContent = message;
  adminEmpty.classList.toggle("hidden", !shouldShow);
}

function syncDeletedCharacterLocally(creatorWallet, characterId) {
  if (!creatorWallet || creatorWallet !== state.walletAddress) {
    return;
  }

  state.characters = state.characters.filter((record) => record.id !== characterId);

  if (state.character?.id === characterId) {
    state.character = state.characters[state.characters.length - 1] || null;
  }

  invalidateSuccessSharePreview(state.character);
}

function copyAdminText(value, successMessage = "Copied.") {
  const text = String(value || "").trim();
  if (!text) return;

  if (navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => showToast(successMessage))
      .catch(() => window.prompt("Copy value:", text));
    return;
  }

  window.prompt("Copy value:", text);
}

function normalizeAdminBattleRecord(record) {
  if (!record || typeof record !== "object" || !record.battleId) {
    return null;
  }

  return cloneBattleRecord({
    battleId: String(record.battleId),
    replayUrl:
      String(record.replayUrl || "").trim() ||
      `/dashboard/?screen=arena&battleId=${encodeURIComponent(String(record.battleId || "").trim())}`,
    createdAt: record.createdAt || null,
    completedAt: record.completedAt || null,
    roundCount: Math.max(0, Math.floor(Number(record.roundCount) || 0)),
    winnerPetId: String(record.winnerPetId || "").trim(),
    narrationMode: String(record.narrationMode || "template").trim() || "template",
    attackerPet: record.attackerPet
      ? {
          id: String(record.attackerPet.id || "").trim(),
          wallet: String(record.attackerPet.wallet || "").trim(),
          name: String(record.attackerPet.name || "Unknown").trim() || "Unknown",
          level: Math.max(1, Math.floor(Number(record.attackerPet.level) || 1)),
          rarity: String(record.attackerPet.rarity || "Common").trim() || "Common",
        }
      : null,
    defenderPet: record.defenderPet
      ? {
          id: String(record.defenderPet.id || "").trim(),
          wallet: String(record.defenderPet.wallet || "").trim(),
          name: String(record.defenderPet.name || "Unknown").trim() || "Unknown",
          level: Math.max(1, Math.floor(Number(record.defenderPet.level) || 1)),
          rarity: String(record.defenderPet.rarity || "Common").trim() || "Common",
        }
      : null,
  });
}

function getAdminBattleWinnerLabel(record) {
  const winnerPetId = String(record?.winnerPetId || "").trim();
  if (!winnerPetId) {
    return "Unknown";
  }

  if (winnerPetId === String(record?.attackerPet?.id || "").trim()) {
    return record?.attackerPet?.name || "Attacker";
  }

  if (winnerPetId === String(record?.defenderPet?.id || "").trim()) {
    return record?.defenderPet?.name || "Defender";
  }

  return "Unknown";
}

function applyAdminWalletPivot(wallet) {
  const next = getAdminWalletPivotState(wallet);
  state.adminSection = "characters";
  state.adminWalletQuery = next.query;
  state.adminPage = next.page;
  renderAdminTable();
}

function buildAdminWalletPivotButton(wallet) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-wallet-btn";
  button.textContent = shortenAddress(wallet || "");
  button.title = wallet || "";
  button.addEventListener("click", () => {
    applyAdminWalletPivot(wallet || "");
  });
  return button;
}

function renderAdminWaitlistTable(records) {
  const { pageRecords } = getAdminPaginationState(records);

  if (adminTableHeadRow) {
    adminTableHeadRow.innerHTML = `
      <th scope="col">Email</th>
      <th scope="col">Source</th>
      <th scope="col">Page</th>
      <th scope="col">Submitted</th>
      <th scope="col">Action</th>
    `;
  }

  pageRecords.forEach((entry) => {
    const row = document.createElement("tr");
    row.className = "admin-row";

    const emailCell = document.createElement("td");
    emailCell.className = "admin-wallet-cell";
    emailCell.textContent = entry.email || "—";

    const sourceCell = document.createElement("td");
    sourceCell.textContent = entry.source || "—";

    const pageCell = document.createElement("td");
    pageCell.textContent = entry.pagePath || "/";

    const createdCell = document.createElement("td");
    createdCell.textContent = formatDateTime(entry.createdAt);

    const actionCell = document.createElement("td");
    actionCell.className = "admin-action-cell";
    const actionStack = document.createElement("div");
    actionStack.className = "admin-action-stack";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "admin-detail-btn";
    copyBtn.textContent = "Copy email";
    copyBtn.addEventListener("click", () => {
      copyAdminText(entry.email, "Email copied.");
    });

    actionStack.appendChild(copyBtn);
    actionCell.appendChild(actionStack);
    row.append(emailCell, sourceCell, pageCell, createdCell, actionCell);
    adminTableBody.appendChild(row);
  });
}

function renderAdminBattlesTable(records) {
  const { pageRecords } = getAdminPaginationState(records);

  if (adminTableHeadRow) {
    adminTableHeadRow.innerHTML = `
      <th scope="col">Matchup</th>
      <th scope="col">Winner</th>
      <th scope="col">Rounds</th>
      <th scope="col">Completed</th>
      <th scope="col">Narration</th>
    `;
  }

  pageRecords.forEach((record) => {
    const row = document.createElement("tr");
    row.className = "admin-row";

    const matchupCell = document.createElement("td");
    matchupCell.className = "admin-battle-matchup-cell";

    const matchupStack = document.createElement("div");
    matchupStack.className = "admin-battle-matchup";

    const attackerLine = document.createElement("div");
    attackerLine.className = "admin-battle-participant";
    const attackerTitle = document.createElement("strong");
    attackerTitle.textContent = record.attackerPet?.name || "Unknown attacker";
    const attackerMeta = document.createElement("span");
    attackerMeta.className = "admin-battle-participant-meta";
    attackerMeta.append(
      document.createTextNode(
        `Lvl ${Math.max(1, Math.floor(Number(record.attackerPet?.level) || 1))} · ${record.attackerPet?.rarity || "Common"} · `
      ),
      buildAdminWalletPivotButton(record.attackerPet?.wallet || "")
    );
    attackerLine.append(attackerTitle, attackerMeta);

    const versusLine = document.createElement("span");
    versusLine.className = "admin-battle-versus";
    versusLine.textContent = "vs";

    const defenderLine = document.createElement("div");
    defenderLine.className = "admin-battle-participant";
    const defenderTitle = document.createElement("strong");
    defenderTitle.textContent = record.defenderPet?.name || "Unknown defender";
    const defenderMeta = document.createElement("span");
    defenderMeta.className = "admin-battle-participant-meta";
    defenderMeta.append(
      document.createTextNode(
        `Lvl ${Math.max(1, Math.floor(Number(record.defenderPet?.level) || 1))} · ${record.defenderPet?.rarity || "Common"} · `
      ),
      buildAdminWalletPivotButton(record.defenderPet?.wallet || "")
    );
    defenderLine.append(defenderTitle, defenderMeta);

    const battleMeta = document.createElement("a");
    battleMeta.className = "admin-battle-id admin-battle-link";
    battleMeta.href = record.replayUrl;
    battleMeta.target = "_blank";
    battleMeta.rel = "noreferrer";
    battleMeta.textContent = "Open replay";
    battleMeta.title = record.battleId;

    const battleIdMeta = document.createElement("span");
    battleIdMeta.className = "admin-battle-id";
    battleIdMeta.textContent = record.battleId;

    matchupStack.append(attackerLine, versusLine, defenderLine, battleMeta, battleIdMeta);
    matchupCell.appendChild(matchupStack);

    const winnerCell = document.createElement("td");
    winnerCell.className = "admin-battle-winner-cell";
    winnerCell.textContent = getAdminBattleWinnerLabel(record);

    const roundsCell = document.createElement("td");
    roundsCell.textContent = String(Math.max(0, Math.floor(Number(record.roundCount) || 0)));

    const completedCell = document.createElement("td");
    completedCell.textContent = formatDateTime(record.completedAt || record.createdAt);

    const narrationCell = document.createElement("td");
    const narrationBadge = document.createElement("span");
    narrationBadge.className = `admin-battle-mode-badge admin-battle-mode-badge--${record.narrationMode === "ai" ? "ai" : "template"}`;
    narrationBadge.textContent = record.narrationMode === "ai" ? "AI" : "Template";
    narrationCell.appendChild(narrationBadge);

    row.append(matchupCell, winnerCell, roundsCell, completedCell, narrationCell);
    adminTableBody.appendChild(row);
  });
}

function renderAdminTable() {
  if (!adminTableBody) return;

  const records = getAdminCurrentRecords();
  renderAdminStats();
  updateAdminCount(records);
  renderAdminPagination(records);
  adminTableBody.innerHTML = "";

  const searchPlaceholder =
    state.adminSection === "waitlist"
      ? "Search by email, source, page or user agent"
      : state.adminSection === "battles"
        ? "Search by battle id, pet or wallet"
        : "Search by wallet address";

  if (adminSearchInput) {
    adminSearchInput.placeholder = searchPlaceholder;
    adminSearchInput.value = getAdminActiveQuery();
  }

  if (adminSearchLabel) {
    adminSearchLabel.textContent = searchPlaceholder;
  }

  if (adminNavCharacters) {
    const isActive = state.adminSection === "characters";
    adminNavCharacters.classList.toggle("active", isActive);
    adminNavCharacters.setAttribute("aria-selected", isActive ? "true" : "false");
  }

  if (adminNavBattles) {
    const isActive = state.adminSection === "battles";
    adminNavBattles.classList.toggle("active", isActive);
    adminNavBattles.setAttribute("aria-selected", isActive ? "true" : "false");
  }

  if (adminNavWaitlist) {
    const isActive = state.adminSection === "waitlist";
    adminNavWaitlist.classList.toggle("active", isActive);
    adminNavWaitlist.setAttribute("aria-selected", isActive ? "true" : "false");
  }

  if (adminExportBtn) {
    adminExportBtn.classList.toggle("hidden", state.adminSection !== "waitlist");
  }

  if (!state.isAdmin) {
    setAdminEmptyState("Admin access is not available for this wallet.", true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  if (state.adminSection === "characters" && state.isAdminLoading) {
    setAdminEmptyState("Loading created characters...", true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  if (state.adminSection === "battles" && state.isAdminBattlesLoading) {
    setAdminEmptyState("Loading completed battles...", true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  if (state.adminSection === "waitlist" && state.isAdminWaitlistLoading) {
    setAdminEmptyState("Loading waitlist entries...", true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  if (state.adminSection === "characters" && state.adminErrorMessage) {
    setAdminEmptyState(state.adminErrorMessage, true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  if (state.adminSection === "battles" && state.adminBattleErrorMessage) {
    setAdminEmptyState(state.adminBattleErrorMessage, true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  if (state.adminSection === "waitlist" && state.adminWaitlistErrorMessage) {
    setAdminEmptyState(state.adminWaitlistErrorMessage, true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  if (!records.length) {
    const message =
      state.adminSection === "waitlist"
        ? state.adminWaitlistQuery.trim()
          ? "No waitlist entries found for this search."
          : "No waitlist entries yet."
        : state.adminSection === "battles"
          ? state.adminBattleQuery.trim()
            ? "No completed battles found for this search."
            : "No completed battles yet."
        : state.adminWalletQuery.trim()
          ? "No characters found for this wallet search."
          : "No created characters yet.";
    setAdminEmptyState(message, true);
    if (adminPagination) adminPagination.classList.add("hidden");
    return;
  }

  setAdminEmptyState("", false);

  if (state.adminSection === "waitlist") {
    renderAdminWaitlistTable(records);
    return;
  }

  if (state.adminSection === "battles") {
    renderAdminBattlesTable(records);
    return;
  }

  const { pageRecords } = getAdminPaginationState(records);

  if (adminTableHeadRow) {
    adminTableHeadRow.innerHTML = `
      <th scope="col">Character</th>
      <th scope="col">Type</th>
      <th scope="col">Creator wallet</th>
      <th scope="col">Created</th>
      <th scope="col">Action</th>
    `;
  }

  pageRecords.forEach((record) => {
    const row = document.createElement("tr");
    row.className = "admin-row";

    const characterCell = document.createElement("td");
    characterCell.className = "admin-character-cell";

    const thumb = document.createElement("img");
    thumb.className = "admin-character-thumb";
    thumb.src = record.imageUrl;
    thumb.alt = record.creatureType ? `${record.creatureType} character` : "Character preview";
    thumb.width = 56;
    thumb.height = 56;
    thumb.tabIndex = 0;
    thumb.setAttribute("role", "button");
    thumb.setAttribute("aria-label", `Preview ${record.name || record.displayName || record.creatureType}`);
    const openPreview = () => {
      openAdminImageLightbox(
        record.imageUrl,
        thumb.alt,
        `${record.name || record.displayName || record.creatureType} · ${record.rarity || "Unknown"}`
      );
    };
    thumb.addEventListener("click", openPreview);
    thumb.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPreview();
      }
    });

    const summary = document.createElement("div");
    summary.className = "admin-character-summary";

    const title = document.createElement("strong");
    title.textContent = record.name || record.displayName || record.creatureType;

    const meta = document.createElement("span");
    meta.textContent = record.rarity || "Unknown";
    meta.className = "admin-rarity-text";
    meta.style.color = getRarityMeta(record.rarity).color;

    const progression = document.createElement("span");
    progression.className = "admin-character-progression";
    progression.textContent = `Lvl ${getRecordLevel(record)} · XP ${Math.max(0, Math.floor(Number(record.experience) || 0))}/${Math.max(0, Math.floor(Number(record.experienceForNextLevel) || 0))}`;

    summary.append(title, meta, progression);
    characterCell.append(thumb, summary);

    const typeCell = document.createElement("td");
    typeCell.textContent = record.creatureType || "Unknown";

    const walletCell = document.createElement("td");
    walletCell.className = "admin-wallet-cell";
    const walletButton = document.createElement("button");
    walletButton.type = "button";
    walletButton.className = "admin-wallet-btn";
    walletButton.textContent = record.creatorWallet || "";
    walletButton.title = "Filter roster by this wallet";
    walletButton.addEventListener("click", () => {
      applyAdminWalletPivot(record.creatorWallet || "");
    });
    walletCell.appendChild(walletButton);

    const createdCell = document.createElement("td");
    createdCell.textContent = formatDateTime(record.completedAt || record.createdAt);

    const actionCell = document.createElement("td");
    actionCell.className = "admin-action-cell";
    const actionStack = document.createElement("div");
    actionStack.className = "admin-action-stack";
    const isExpanded = isAdminCharacterExpanded(record.id);
    const detailsBtn = document.createElement("button");
    detailsBtn.type = "button";
    detailsBtn.className = "admin-detail-btn";
    detailsBtn.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    detailsBtn.textContent = isExpanded ? "Hide" : "Details";
    detailsBtn.addEventListener("click", () => {
      toggleAdminCharacterExpanded(record.id);
    });

    const deleteBtn = document.createElement("button");
    const isDeleting = state.deletingAdminCharacterId === record.id;
    deleteBtn.type = "button";
    deleteBtn.className = "admin-delete-btn";
    deleteBtn.disabled = isDeleting;
    deleteBtn.textContent = isDeleting ? "Deleting..." : "Delete";
    deleteBtn.addEventListener("click", async () => {
      await deleteAdminCharacter(record);
    });
    actionStack.append(detailsBtn, deleteBtn);
    actionCell.appendChild(actionStack);

    row.append(characterCell, typeCell, walletCell, createdCell, actionCell);
    adminTableBody.appendChild(row);

    if (isExpanded) {
      const detailsRow = document.createElement("tr");
      detailsRow.className = "admin-details-row";

      const detailsCell = document.createElement("td");
      detailsCell.colSpan = 5;
      detailsCell.className = "admin-details-cell";
      detailsCell.innerHTML = createAdminDetailsMarkup(record);

      detailsRow.appendChild(detailsCell);
      adminTableBody.appendChild(detailsRow);
    }
  });
}

async function loadAdminCharacters({ force = false } = {}) {
  if (!state.isAdmin) return;
  if (state.isAdminLoading) return;
  if (!force && state.adminCharacters.length) {
    renderAdminTable();
    return;
  }

  state.isAdminLoading = true;
  state.adminErrorMessage = "";
  renderAdminTable();

  try {
    const data = await apiRequest("/api/admin/characters", {}, "GET");
    state.adminCharacters = Array.isArray(data.characters)
      ? data.characters.map(normalizeCharacterRecord)
      : [];
    state.adminPage = 1;
    const visibleIds = new Set(state.adminCharacters.map((record) => record.id));
    state.expandedAdminCharacterIds = state.expandedAdminCharacterIds.filter((id) =>
      visibleIds.has(id)
    );
  } catch (error) {
    state.adminCharacters = [];
    state.expandedAdminCharacterIds = [];
    state.adminErrorMessage =
      typeof error?.message === "string" ? error.message : "Failed to load characters.";
  } finally {
    state.isAdminLoading = false;
    state.hasLoadedAdminCharacters = true;
    renderAdminTable();
  }
}

async function loadAdminBattles({ force = false } = {}) {
  if (!state.isAdmin) return;
  if (state.isAdminBattlesLoading) return;
  if (!force && state.adminBattles.length) {
    renderAdminTable();
    return;
  }

  state.isAdminBattlesLoading = true;
  state.adminBattleErrorMessage = "";
  renderAdminTable();

  try {
    const data = await apiRequest("/api/admin/battles", {}, "GET");
    state.adminBattles = Array.isArray(data.battles)
      ? data.battles.map(normalizeAdminBattleRecord).filter(Boolean)
      : [];
    state.adminBattleSummary =
      data.summary && typeof data.summary === "object"
        ? {
            totalCompletedBattles: Math.max(
              0,
              Math.floor(Number(data.summary.totalCompletedBattles) || 0)
            ),
            averageRoundsLast50: Math.max(0, Number(data.summary.averageRoundsLast50) || 0),
            averageRoundsSampleSize: Math.max(
              0,
              Math.floor(Number(data.summary.averageRoundsSampleSize) || 0)
            ),
            aiNarratedBattles: Math.max(0, Math.floor(Number(data.summary.aiNarratedBattles) || 0)),
            templateNarratedBattles: Math.max(
              0,
              Math.floor(Number(data.summary.templateNarratedBattles) || 0)
            ),
            completedLast24Hours: Math.max(
              0,
              Math.floor(Number(data.summary.completedLast24Hours) || 0)
            ),
          }
        : null;
    state.adminBattlePage = 1;
  } catch (error) {
    state.adminBattles = [];
    state.adminBattleSummary = null;
    state.adminBattleErrorMessage =
      typeof error?.message === "string" ? error.message : "Failed to load completed battles.";
  } finally {
    state.isAdminBattlesLoading = false;
    state.hasLoadedAdminBattles = true;
    renderAdminTable();
  }
}

async function loadAdminWaitlist({ force = false } = {}) {
  if (!state.isAdmin) return;
  if (state.isAdminWaitlistLoading) return;
  if (!force && state.adminWaitlistEntries.length) {
    renderAdminTable();
    return;
  }

  state.isAdminWaitlistLoading = true;
  state.adminWaitlistErrorMessage = "";
  renderAdminTable();

  try {
    const data = await apiRequest("/api/admin/waitlist", {}, "GET");
    state.adminWaitlistEntries = Array.isArray(data.entries) ? data.entries : [];
    state.adminWaitlistPage = 1;
  } catch (error) {
    state.adminWaitlistEntries = [];
    state.adminWaitlistErrorMessage =
      typeof error?.message === "string" ? error.message : "Failed to load waitlist.";
  } finally {
    state.isAdminWaitlistLoading = false;
    state.hasLoadedAdminWaitlist = true;
    renderAdminTable();
  }
}

function loadActiveAdminSection({ force = false } = {}) {
  if (state.adminSection === "waitlist") {
    return loadAdminWaitlist({ force });
  }

  if (state.adminSection === "battles") {
    return loadAdminBattles({ force });
  }

  return loadAdminCharacters({ force });
}

function switchAdminSection(section) {
  const nextSection =
    section === "waitlist" ? "waitlist" : section === "battles" ? "battles" : "characters";
  if (state.adminSection === nextSection) {
    renderAdminTable();
    return;
  }

  state.adminSection = nextSection;
  loadActiveAdminSection();
}

async function deleteAdminCharacter(record) {
  if (!record?.id || state.deletingAdminCharacterId) {
    return;
  }

  const confirmed = window.confirm(
    `Delete character "${record.name || record.displayName || record.creatureType}"?`
  );
  if (!confirmed) {
    return;
  }

  state.deletingAdminCharacterId = record.id;
  renderAdminTable();

  try {
    const data = await apiRequest("/api/admin/delete-character", {
      characterId: record.id,
    });

    state.adminCharacters = state.adminCharacters.filter((item) => item.id !== record.id);
    state.expandedAdminCharacterIds = state.expandedAdminCharacterIds.filter((id) => id !== record.id);
    syncDeletedCharacterLocally(data.creatorWallet, record.id);
    renderAdminTable();
  } catch (error) {
    const message =
      typeof error?.message === "string" ? error.message : "Failed to delete character.";
    window.alert(message);
  } finally {
    state.deletingAdminCharacterId = "";
    renderAdminTable();
  }
}

function renderSuccessStep() {
  const record = state.character;
  if (!record) {
    closeSuccessShareModal({ restoreFocus: false });
    syncSuccessShareState();
    return;
  }

  syncDisplayedRarity(record);

  if (successPetName) {
    successPetName.textContent = record.name || record.displayName || record.creatureType;
  }

  if (successStats) {
    successStats.innerHTML = ATTRS.map((attr) => {
      const value = record.attributes[attr.key];
      return `
        <div class="success-card-stat">
          <img src="${attr.icon}" alt="" width="20" height="20" />
          <span>${value}</span>
        </div>
      `;
    }).join("");
  }

  if (successPowerText) {
    successPowerText.textContent = getSelectedPowerDescription(record);
  }

  syncSuccessShareModalContent();
  syncSuccessShareState();
}

function fireSuccessConfetti() {
  if (typeof window.confetti !== "function") return;

  const count = 200;
  const defaults = {
    disableForReducedMotion: true,
    origin: { y: 0.7 },
    zIndex: 1000,
  };

  const fire = (particleRatio, options) => {
    window.confetti({
      ...defaults,
      ...options,
      particleCount: Math.floor(count * particleRatio),
    });
  };

  window.requestAnimationFrame(() => {
    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2, { spread: 60 });
    fire(0.35, { decay: 0.91, scalar: 0.8, spread: 100 });
    fire(0.1, { decay: 0.92, scalar: 1.2, spread: 120, startVelocity: 25 });
    fire(0.1, { spread: 120, startVelocity: 45 });
  });
}

const ARENA_HIT_CONFETTI_EMOJIS = ["🍬", "🍫", "🍭", "🧁", "🍪"];
let arenaHitConfettiShapes = null;

function getArenaHitConfettiShapes() {
  if (arenaHitConfettiShapes) {
    return arenaHitConfettiShapes;
  }

  if (typeof window.confetti !== "function" || typeof window.confetti.shapeFromText !== "function") {
    arenaHitConfettiShapes = [];
    return arenaHitConfettiShapes;
  }

  arenaHitConfettiShapes = ARENA_HIT_CONFETTI_EMOJIS.map((text) =>
    window.confetti.shapeFromText({ text, scalar: 5.25 })
  );
  return arenaHitConfettiShapes;
}

function fireArenaHitConfetti(targetElement, accentSide = "right") {
  if (typeof window.confetti !== "function" || !targetElement) return;

  const rect = targetElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return;

  const viewportWidth = Math.max(window.innerWidth || 0, 1);
  const viewportHeight = Math.max(window.innerHeight || 0, 1);
  const origin = {
    x: clampNumber((rect.left + rect.width / 2) / viewportWidth, 0, 1),
    y: clampNumber((rect.top + rect.height * 0.42) / viewportHeight, 0, 1),
  };
  const direction = accentSide === "left" ? 1 : -1;
  const isMobile = isMobileArenaViewport();
  const defaults = {
    disableForReducedMotion: true,
    gravity: isMobile ? 1.05 : 1.15,
    origin,
    scalar: isMobile ? 1.05 : 1.15,
    startVelocity: isMobile ? 28 : 42,
    ticks: isMobile ? 120 : 180,
    zIndex: 1200,
  };
  const emojiShapes = getArenaHitConfettiShapes();

  window.requestAnimationFrame(() => {
    if (emojiShapes.length) {
      window.confetti({
        ...defaults,
        angle: direction > 0 ? 26 : 154,
        drift: direction * (isMobile ? 0.28 : 0.55),
        particleCount: isMobile ? 10 : 16,
        scalar: isMobile ? 3.2 : 4.6,
        shapes: emojiShapes,
        spread: isMobile ? 34 : 60,
      });
    }

    window.confetti({
      ...defaults,
      angle: direction > 0 ? 22 : 158,
      colors: ["#FDB022", "#F79009", "#F04438", "#FEC84B", "#FFFFFF"],
      drift: direction * (isMobile ? 0.35 : 0.7),
      particleCount: isMobile ? (emojiShapes.length ? 12 : 18) : (emojiShapes.length ? 20 : 30),
      scalar: isMobile ? 1.02 : 1.18,
      shapes: ["square", "circle"],
      spread: isMobile ? 42 : 72,
    });
  });
}

function triggerArenaBattleHitEffects(battle, round) {
  if (!arenaLiveBattle || !battle || !round) return;
  if (Math.max(0, Number(round.damage) || 0) <= 0) return;

  const animation = getArenaBattleAnimationState(battle);
  const hitKey = `${animation.currentIndex}:${round.number}`;
  if (animation.lastHitEffectKey === hitKey) return;
  animation.lastHitEffectKey = hitKey;

  const targetSelector =
    round.accentSide === "left" ? ".arena-live-stage-card--initiator" : ".arena-live-stage-card--opponent";
  const targetCard = arenaLiveBattle.querySelector(targetSelector);
  fireArenaHitConfetti(targetCard, round.accentSide);
}

function moveTo(step, { replace = true } = {}) {
  if (!ENABLE_ARENA && step === "arena") {
    step = "cabinet";
  }

  if (step === "admin" && !state.isAdmin) {
    step = state.isAuthenticated ? "cabinet" : "type";
  }

  if (step === "upgrade" && getPageMode() !== "dashboard") {
    step = "attrs";
  }

  if (step !== "success" && state.isShareModalOpen) {
    closeSuccessShareModal({ restoreFocus: false });
  }

  if (step !== "upgrade") {
    resetUpgradeSession();
  }

  state.step = step;
  setProgress(step);

  if (step === "type") {
    showScreen("screenType");
    renderTypeStep();
  }
  if (step === "process") {
    showScreen("screenProcess");
  }
  if (step === "powers") {
    showScreen("screenPowers");
    renderPowersStep();
  }
  if (step === "attrs") {
    showScreen("screenAttrs");
    renderAttrsStep();
    suppressRewardsTooltip();
  }
  if (step === "upgrade") {
    showScreen("screenAttrs");
    renderAttrsStep();
  }
  if (step === "success") {
    showScreen("screenSuccess");
    renderSuccessStep();
    fireSuccessConfetti();
  }
  if (step === "cabinet") {
    showScreen("screenCabinet");
    renderCabinet();
  }
  if (step === "arena") {
    showScreen("screenArena");
    renderArena();
    void ensureArenaHistoryLoaded().catch(() => {});
  }
  if (step === "admin") {
    showScreen("screenAdmin");
    renderAdminTable();
    loadActiveAdminSection();
  }

  syncDashboardTabs(step);
  if (getPageMode() === "dashboard") {
    syncDashboardRouteState(step, {
      battleId:
        step === "arena"
          ? getSelectedArenaBattleId() || getArenaRequestedBattleId()
          : "",
      petId: step === "upgrade" ? state.upgradePetId : "",
      replace,
    });
  }
  document.body.classList.remove("app-booting");
  resetStepScroll();
}

async function startCharacterCreation() {
  if (state.isStarting) return;

  const creatureType = getResolvedType();
  if (!creatureType) {
    renderTypeStep();
    return;
  }

  if (!state.isAuthenticated) {
    state.pendingStartAfterAuth = true;
    setWalletStatus("Connect wallet to create a character.", "error");
    openWalletModal();
    return;
  }

  if (!hasCharacterCreationCapacity()) {
    moveTo("cabinet");
    window.alert(`Character limit reached. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`);
    return;
  }

  state.pendingStartAfterAuth = false;
  state.isStarting = true;
  resetCharacterState({ keepTypeSelection: true, keepCharacters: true });
  updateTypeContinueState();
  setProcessCopy("Cooking up your pet...", "Please wait, it could take a few seconds");
  moveTo("process");

  try {
    const [data] = await Promise.all([
      apiRequest("/api/character/start", { creatureType }),
      wait(1200),
    ]);

    syncStateWithPayload(data);
    moveTo("powers");
  } catch (error) {
    moveTo("type");
    if (/already exists/i.test(error.message)) {
      await restoreCharacterState();
      return;
    }
    if (/limit reached/i.test(error.message)) {
      await restoreCharacterState();
      moveTo("cabinet");
      window.alert(error.message);
      return;
    }
    handleFlowError(error, "Unable to create character.");
  } finally {
    state.isStarting = false;
    renderTypeStep();
  }
}

async function savePowerSelectionAndContinue() {
  if (state.isSavingPower || !state.selectedPowerId) return;

  state.isSavingPower = true;
  renderPowersStep();
  reportClientIssue("power_select_submit");
  const slowRequestTimer = window.setTimeout(() => {
    reportClientIssue("power_select_slow", {
      message: "select-power request still pending after 8s",
    });
  }, 8000);

  try {
    const data = await apiRequest("/api/character/select-power", {
      draftId: state.draft?.id || "",
      selectedPowerId: state.selectedPowerId,
    });

    syncStateWithPayload(data);
    moveTo("attrs");
  } catch (error) {
    reportClientIssue("power_select_error", {
      message: typeof error?.message === "string" ? error.message : "Unable to save superpower.",
    });
    if (/already exists/i.test(error.message)) {
      await restoreCharacterState();
      return;
    }
    handleFlowError(error, "Unable to save superpower.");
    renderPowersStep();
  } finally {
    window.clearTimeout(slowRequestTimer);
    state.isSavingPower = false;
    if (state.step === "powers") {
      renderPowersStep();
    }
  }
}

async function completeCharacterCreation() {
  if (state.isCreating || pointsRemaining() !== 0) return;

  state.isCreating = true;
  updateAttrsStep();

  try {
    const data = await apiRequest("/api/character/create", {
      draftId: state.draft?.id || "",
      stats: state.attrs,
    });

    syncStateWithPayload(data);
    moveTo("success");
  } catch (error) {
    if (/already exists/i.test(error.message)) {
      await restoreCharacterState();
      return;
    }
    handleFlowError(error, "Unable to finalize character.");
  } finally {
    state.isCreating = false;
    if (state.step === "attrs") {
      updateAttrsStep();
    }
  }
}

function init() {
  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  preloadTypeIcons();
  preloadPowersAssets();
  preloadAttrsAssets();
  setCharacterImages(DEFAULT_CHARACTER_IMAGE, "");
  updateEnergyUi();
  syncSuccessShareState();

  const chips = [...document.querySelectorAll(".type-chip")];
  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      state.selectedType = chip.dataset.type || "";
      if (state.selectedType !== "Other") {
        otherTypeInput.value = "";
      }
      renderTypeStep();
    });

    chip.addEventListener("mouseenter", () => {
      if (chip.classList.contains("active")) return;
      applyChipIcon(chip, "hover");
    });

    chip.addEventListener("mouseleave", () => {
      if (chip.classList.contains("active")) return;
      applyChipIcon(chip, "default");
    });

    chip.addEventListener("focus", () => {
      if (chip.classList.contains("active")) return;
      applyChipIcon(chip, "hover");
    });

    chip.addEventListener("blur", () => {
      if (chip.classList.contains("active")) return;
      applyChipIcon(chip, "default");
    });
  });

  otherTypeInput.addEventListener("beforeinput", (event) => {
    if (event.isComposing || String(event.inputType || "").startsWith("delete")) {
      return;
    }

    const insertedLength = typeof event.data === "string" ? event.data.length : 0;
    if (willOtherTypeInputExceedLimit(otherTypeInput, insertedLength)) {
      showCreatureTypeLimitToast();
    }
  });

  otherTypeInput.addEventListener("paste", (event) => {
    const pastedText = event.clipboardData?.getData("text") || "";
    if (willOtherTypeInputExceedLimit(otherTypeInput, pastedText.length)) {
      showCreatureTypeLimitToast();
    }
  });

  otherTypeInput.addEventListener("input", updateTypeContinueState);
  typeContinueBtn.addEventListener("click", () => {
    startCharacterCreation();
  });

  powersContinueBtn.addEventListener("click", () => {
    savePowerSelectionAndContinue();
  });

  attrsContinueBtn.addEventListener("click", () => {
    if (isUpgradeStep()) {
      void saveUpgradeAllocation();
      return;
    }

    completeCharacterCreation();
  });

  document.getElementById("backToTypeBtn").addEventListener("click", () => {
    moveTo("type");
  });

  backToPowersBtn.addEventListener("click", () => {
    if (isUpgradeStep()) {
      moveTo("cabinet", { replace: true });
      return;
    }

    moveTo("powers");
  });

  if (attrsBlockedBtn) {
    attrsBlockedBtn.addEventListener("click", () => {
      moveTo("cabinet", { replace: true });
    });
  }

  document.getElementById("openCabinetBtn").addEventListener("click", () => {
    window.location.href = new URL(DASHBOARD_ROUTE, window.location.origin).toString();
  });

  if (shareSuccessBtn) {
    shareSuccessBtn.addEventListener("click", () => {
      shareSuccessCharacter();
    });
  }

  if (shareModalClose) {
    shareModalClose.addEventListener("click", () => {
      closeSuccessShareModal();
    });
  }

  if (shareModalOverlay) {
    shareModalOverlay.addEventListener("click", (event) => {
      if (event.target === shareModalOverlay) {
        closeSuccessShareModal();
      }
    });
  }

  if (shareModalCopyBtn) {
    shareModalCopyBtn.addEventListener("click", () => {
      copySuccessShareImage();
    });
  }

  if (shareModalShareBtn) {
    shareModalShareBtn.addEventListener("click", () => {
      shareSuccessToX();
    });
  }

  createAnotherBtn.addEventListener("click", () => {
    if (!hasCharacterCreationCapacity()) {
      showToast(`Character limit reached. Maximum is ${MAX_CHARACTERS_PER_WALLET}.`);
      return;
    }
    window.location.href = new URL(CREATION_ROUTE, window.location.origin).toString();
  });

  walletMenuCreatePet.addEventListener("click", () => {
    openCreatePetFromMenu();
  });

  walletMenuDashboard.addEventListener("click", () => {
    openDashboardFromMenu();
  });

  if (dashboardTabMyPets) {
    dashboardTabMyPets.addEventListener("click", () => {
      moveTo("cabinet");
    });
  }

  if (dashboardTabArena) {
    dashboardTabArena.addEventListener("click", () => {
      clearArenaAnimation();
      state.activeBattle = null;
      clearArenaReplayRequest();
      state.arenaSelectedHistoryBattleId = "";
      moveTo("arena");
    });
  }

  if (arenaStartFightBtn) {
    arenaStartFightBtn.addEventListener("click", () => {
      startFightFlow();
    });
  }

  if (arenaIdleSecondaryBtn) {
    arenaIdleSecondaryBtn.addEventListener("click", () => {
      closeArenaReplayBattle();
    });
  }

  if (arenaReplayBackBtn) {
    arenaReplayBackBtn.addEventListener("click", () => {
      closeArenaReplayBattle();
    });
  }

  if (arenaHistoryLoadMoreBtn) {
    arenaHistoryLoadMoreBtn.addEventListener("click", () => {
      loadMoreArenaHistory();
    });
  }

  if (arenaHistoryList) {
    arenaHistoryList.addEventListener("click", async (event) => {
      const trigger = event.target.closest('[data-action="open-arena-history-battle"]');
      if (!trigger) return;

      event.preventDefault();

      const battleId = String(trigger.dataset.battleId || "").trim();
      if (!battleId) return;

      await openArenaReplayBattle(battleId, {
        source: "history",
        pushRoute: true,
      });
    });
  }

  if (cabinetCard) {
    cabinetCard.addEventListener("click", (event) => {
      const upgradeButton = event.target.closest('[data-action="open-upgrade"]');
      if (upgradeButton) {
        event.preventDefault();
        openUpgradeFlow(upgradeButton.dataset.characterId, { pushRoute: true });
        return;
      }

      const fightButton = event.target.closest(".cabinet-fight-btn");
      if (!fightButton) return;
      if (fightButton.disabled) return;
      startFightFlow(fightButton.dataset.characterId);
    });
  }

  window.addEventListener("popstate", () => {
    if (!state.isAuthenticated || getPageMode() !== "dashboard") {
      return;
    }

    void syncDashboardStateFromLocation();
  });

  let attrsViewportSyncFrame = 0;
  window.addEventListener("resize", () => {
    if (state.step !== "upgrade" && state.step !== "attrs") {
      return;
    }

    if (attrsViewportSyncFrame) {
      window.cancelAnimationFrame(attrsViewportSyncFrame);
    }

    attrsViewportSyncFrame = window.requestAnimationFrame(() => {
      attrsViewportSyncFrame = 0;
      renderAttrsStep();
    });
  });

  if (walletMenuAdmin) {
    walletMenuAdmin.addEventListener("click", () => {
      openAdminPanelFromMenu();
    });
  }

  connectTrigger.addEventListener("click", () => {
    if (state.isAuthenticated) {
      toggleWalletMenu();
      return;
    }
    openWalletModal();
  });

  walletClose.addEventListener("click", closeWalletModal);
  walletOverlay.addEventListener("click", (event) => {
    if (event.target === walletOverlay) closeWalletModal();
  });

  walletButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      await connectWallet(button.dataset.wallet);
    });
  });

  continueBtn.addEventListener("click", async () => {
    closeWalletModal();
    if (state.pendingStartAfterAuth) {
      await startCharacterCreation();
    }
  });

  window.addEventListener("error", (event) => {
    reportClientIssue("window_error", {
      message: event?.message || "Unknown window error",
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason =
      typeof event?.reason === "string"
        ? event.reason
        : typeof event?.reason?.message === "string"
          ? event.reason.message
          : "Unhandled promise rejection";
    reportClientIssue("unhandled_rejection", {
      message: reason,
    });
  });

  window.addEventListener("focus", () => {
    maybeRefreshBattleStateOnResume();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      maybeRefreshBattleStateOnResume();
    }
  });

  if (claimRewardsBtn) {
    claimRewardsBtn.addEventListener("click", () => {
      claimRewardsBtn.blur();
    });
  }

  if (adminSearchInput) {
    adminSearchInput.addEventListener("input", (event) => {
      setAdminActiveQuery(event.target.value || "");
      setAdminActivePage(1);
      renderAdminTable();
    });
  }

  if (adminNavCharacters) {
    adminNavCharacters.addEventListener("click", () => {
      switchAdminSection("characters");
    });
  }

  if (adminNavBattles) {
    adminNavBattles.addEventListener("click", () => {
      switchAdminSection("battles");
    });
  }

  if (adminNavWaitlist) {
    adminNavWaitlist.addEventListener("click", () => {
      switchAdminSection("waitlist");
    });
  }

  if (adminRefreshBtn) {
    adminRefreshBtn.addEventListener("click", async () => {
      await loadActiveAdminSection({ force: true });
    });
  }

  if (adminExportBtn) {
    adminExportBtn.addEventListener("click", () => {
      const query = getAdminActiveQuery().trim();
      const url = new URL("/api/admin/waitlist-export", window.location.origin);
      if (query) {
        url.searchParams.set("q", query);
      }
      window.location.href = url.toString();
    });
  }

  if (adminBackToDashboardBtn) {
    adminBackToDashboardBtn.addEventListener("click", () => {
      window.location.href = new URL(DASHBOARD_ROUTE, window.location.origin).toString();
    });
  }

  if (adminPrevBtn) {
    adminPrevBtn.addEventListener("click", () => {
      const currentPage = getAdminActivePage();
      if (currentPage <= 1) return;
      setAdminActivePage(currentPage - 1);
      renderAdminTable();
    });
  }

  if (adminNextBtn) {
    adminNextBtn.addEventListener("click", () => {
      const { totalPages } = getAdminPaginationState();
      const currentPage = getAdminActivePage();
      if (currentPage >= totalPages) return;
      setAdminActivePage(currentPage + 1);
      renderAdminTable();
    });
  }

  walletMenuLogout.addEventListener("click", async () => {
    try {
      await logoutWallet();
    } catch {
      showWalletAuthState();
      window.location.href = new URL("/", window.location.origin).toString();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && walletOverlay.getAttribute("aria-hidden") === "false") {
      closeWalletModal();
    }
    if (event.key === "Escape" && state.isShareModalOpen) {
      closeSuccessShareModal();
    }
    if (event.key === "Escape") closeAdminImageLightbox();
    if (event.key === "Escape") hideWalletMenu();
  });

  document.addEventListener("click", (event) => {
    if (
      !walletMenu.classList.contains("hidden") &&
      !connectTrigger.contains(event.target) &&
      !walletMenu.contains(event.target)
    ) {
      hideWalletMenu();
    }
  });

  refreshDetectedBadges();
  restoreWalletSession();
  closeWalletModal();
  if (getPageMode() === "dashboard") {
    const requestedScreen = getRequestedScreen();
    moveTo(
      requestedScreen === "arena"
        ? "arena"
        : requestedScreen === "upgrade"
          ? "upgrade"
          : "cabinet"
    );
    return;
  }

  if (getPageMode() === "admin") {
    moveTo("admin");
    return;
  }

  moveTo("type");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
