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
 * Разовый зачёт вместимости, купленной по прежним правилам. Кошелёк, купивший
 * слоты и не заполнивший их, получает столько же бесплатных созданий — иначе он
 * заплатил бы за одно и то же дважды.
 *
 * Бесплатные места старого правила (три вместо одного) в кредит НЕ переводятся:
 * это изменившееся правило, а не оплаченное право.
 *
 * Возвращает true, если профиль изменён; вызывающий код сохраняет его в составе
 * своей записи.
 */
function ensurePrepaidCreations(profile, cfg) {
  if (!profile || typeof profile !== "object") return false;
  if (Number.isFinite(Number(profile.prepaidCreations))) return false;

  const owned = countSlotCharacters(profile);
  const beyondFree = Math.max(0, owned - getFreeSlots(cfg));
  profile.prepaidCreations = Math.max(0, getPaidSlots(profile) - beyondFree);
  return true;
}

module.exports = {
  DEFAULT_FREE_SLOTS,
  countSlotCharacters,
  ensurePrepaidCreations,
  getFreeSlots,
  getMaxCharacters,
  getPaidSlots,
};
