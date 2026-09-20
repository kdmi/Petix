// Вместимость кошелька (feature 013 → 024). Чистая логика: конфиг и профиль
// передаются аргументами, сети и файловой системы здесь нет.
//
// Слоты как покупаемая сущность выведены из эксплуатации (024): игрок больше не
// покупает место заранее, он платит за самого питомца в момент создания (см.
// pet-price.js). Здесь остались вместимость, подсчёт занятых мест и разовый
// зачёт того, что кошелёк оплатил по прежним правилам.

// Запасное значение для конфигов, где ключа ещё нет (старые переопределения).
const DEFAULT_FREE_SLOTS = 1;

function getFreeSlots(cfg) {
  const n = Math.floor(Number(cfg && cfg.FREE_SLOTS));
  return Number.isFinite(n) && n >= 1 ? n : DEFAULT_FREE_SLOTS;
}

function getPaidSlots(profile) {
  const n = Math.floor(Number(profile && profile.paidSlots) || 0);
  return Math.max(0, n);
}

/** Предел питомцев на кошелёк. Одинаков для всех: места больше не покупаются. */
function getMaxCharacters(profile, cfg) {
  const cap = Math.floor(Number(cfg && cfg.MAX_CHARACTER_SLOTS) || 10);
  return Math.max(1, cap);
}

/**
 * Питомцы, занимающие места кошелька. Питомец, запечатанный в капсулу, живёт
 * в NFT, а не в кошельке (решение владельца 2026-09-18): он не мешает создать
 * следующего, а у покупателя капсулы не съедает лимит.
 */
function countSlotCharacters(profile) {
  const characters = Array.isArray(profile && profile.characters) ? profile.characters : [];
  return characters.filter((record) => !(record && record.nft && record.nft.tokenId)).length;
}

/**
 * Открытые места кошелька. Место открывается один раз — бесплатным первым
 * питомцем или покупкой — и остаётся за кошельком навсегда: сожжённый питомец
 * освобождает место, но не закрывает его, и следующий питомец в этом месте
 * бесплатен (решение владельца 2026-09-20). Платой за перерисовку служит
 * стоимость сжигания.
 *
 * Считается один раз при первом обращении. Кошельки прежних правил ничего не
 * теряют: им засчитываются и купленные слоты, и места, которые они уже
 * занимают питомцами.
 *
 * Возвращает true, если профиль изменён; вызывающий код сохраняет его в
 * составе своей записи.
 */
function ensureUnlockedSlots(profile, cfg) {
  if (!profile || typeof profile !== "object") return false;
  // Number(null) === 0, а null здесь означает «ещё не считалось».
  if (profile.unlockedSlots != null && Number.isFinite(Number(profile.unlockedSlots))) {
    return false;
  }

  const cap = getMaxCharacters(profile, cfg);
  const fromPurchases = getFreeSlots(cfg) + getPaidSlots(profile);
  profile.unlockedSlots = Math.min(cap, Math.max(fromPurchases, countSlotCharacters(profile)));
  return true;
}

/** Открытые места с запасным вычислением для профилей, где поле ещё не считалось. */
function getUnlockedSlots(profile, cfg) {
  const free = getFreeSlots(cfg);
  const cap = getMaxCharacters(profile, cfg);
  const raw = profile ? profile.unlockedSlots : null;
  const stored = raw == null ? NaN : Number(raw);
  // Бесплатное место есть у любого кошелька, поэтому оно же и нижняя граница:
  // испорченное или недосчитанное значение не запирает создание питомцев.
  if (Number.isFinite(stored)) return Math.min(cap, Math.max(free, Math.floor(stored)));
  return Math.min(cap, Math.max(free + getPaidSlots(profile), countSlotCharacters(profile)));
}

module.exports = {
  DEFAULT_FREE_SLOTS,
  countSlotCharacters,
  ensureUnlockedSlots,
  getFreeSlots,
  getUnlockedSlots,
  getMaxCharacters,
  getPaidSlots,
};
