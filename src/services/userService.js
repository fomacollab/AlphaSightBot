const User = require('../models/User');

/**
 * Ensures a user record exists and keeps profile fields reasonably current.
 * This is reused across handlers so each interaction has a persisted base.
 */
async function ensureUser(ctx) {
  const update = {
    username: ctx.from.username ? `@${ctx.from.username.replace(/^@/, '')}` : null,
    firstName: ctx.from.first_name || null,
    lastName: ctx.from.last_name || null,
    lastActionAt: new Date(),
  };

  const user = await User.findOneAndUpdate(
    { telegramId: ctx.from.id },
    { $set: update, $setOnInsert: { createdAt: new Date() } },
    { new: true, upsert: true },
  );

  return user;
}

async function updateUserState(userId, patch) {
  return User.findByIdAndUpdate(userId, { $set: patch }, { new: true });
}

function normalizeRegistrationEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function isRegistrationEmailTaken(email, excludeTelegramId = null) {
  const normalized = normalizeRegistrationEmail(email);
  if (!normalized) return false;

  const query = { registrationEmail: normalized };
  if (excludeTelegramId !== null && excludeTelegramId !== undefined) {
    query.telegramId = { $ne: excludeTelegramId };
  }

  const existing = await User.findOne(query).select('_id').lean();
  return Boolean(existing);
}

module.exports = {
  ensureUser,
  updateUserState,
  normalizeRegistrationEmail,
  isRegistrationEmailTaken,
};
