const crypto = require("crypto");
const { updateWalletProfile } = require("./store");

function buildPassiveBattleNotification({
  wallet,
  petId,
  petName,
  battleId,
  xpGained,
  levelUp = false,
  newLevel,
}) {
  if (!wallet || wallet === "system" || !petId || !battleId) {
    return null;
  }

  const body = levelUp && newLevel
    ? `Your pet ${petName} was challenged, earned +${xpGained} passive XP, and reached Level ${newLevel}.`
    : `Your pet ${petName} was challenged and earned +${xpGained} passive XP.`;

  return {
    id: `notif_${crypto.randomUUID()}`,
    wallet,
    type: "pet_was_challenged",
    petId,
    battleId,
    title: "Your pet was challenged",
    body,
    createdAt: new Date().toISOString(),
    isRead: false,
  };
}

async function createPassiveBattleNotification(args) {
  const notification = buildPassiveBattleNotification(args);
  if (!notification) {
    return null;
  }

  await updateWalletProfile(notification.wallet, async (current) => {
    const nextNotifications = [notification, ...(current.notifications || [])].slice(0, 100);
    return {
      ...current,
      notifications: nextNotifications,
    };
  });

  return notification;
}

module.exports = {
  buildPassiveBattleNotification,
  createPassiveBattleNotification,
};
