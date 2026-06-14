/**
 * Small in-memory admin cache used by auth middleware and admin guard checks.
 * The cache keeps reads cheap during normal bot interactions while still being
 * refreshed from MongoDB on boot and after admin mutations.
 */
const state = { admins: [] };

function set(admins) {
  state.admins = Array.isArray(admins) ? admins : [];
}

function getAll() {
  return state.admins;
}

function isAdminByTelegramId(telegramId) {
  return state.admins.some((admin) => admin.telegramId === telegramId);
}

function isAdminByUsername(username) {
  if (!username) return false;
  return state.admins.some((admin) => admin.username === username);
}

module.exports = { set, getAll, isAdminByTelegramId, isAdminByUsername };
