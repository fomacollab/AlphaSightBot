const Admin = require('../models/Admin');
const User = require('../models/User');
const { ensureUser } = require('../services/userService');
const flow = require('../services/flowService');
const keyboards = require('../keyboards/user');
const { showAdminSection, ADMIN_SECTIONS } = require('../services/adminPanelService');

function buildNewUserJoinedMessage(user) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  const lines = ['New user Joined✅'];

  if (fullName) lines.push(`Name: ${fullName}`);
  if (user.username) lines.push(`Username: ${user.username}`);
  if (user.telegramId !== null && user.telegramId !== undefined) lines.push(`User Id: ${user.telegramId}`);

  return lines.join('\n');
}

async function notifyAdminsOfNewUser(bot, user) {
  const admins = await Admin.find({ telegramId: { $ne: null } }).lean();
  const adminIds = [...new Set(admins.map((admin) => admin.telegramId).filter((value) => value !== null && value !== undefined))];
  if (!adminIds.length) return;

  const text = buildNewUserJoinedMessage(user);

  for (const adminId of adminIds) {
    await flow.sendText(bot, adminId, text).catch(() => false);
  }
}

module.exports = function startHandler(bot) {
  bot.start(async (ctx) => {
    const existingUser = await User.findOne({ telegramId: ctx.from.id }).lean();
    const user = await ensureUser(ctx);
    if (ctx.state.isAdmin) {
      await showAdminSection(ctx, user, user.adminSection || ADMIN_SECTIONS.HOME);
      return;
    }
    if (!existingUser) {
      await notifyAdminsOfNewUser(bot, user);
    }
    await flow.sendMainWelcome(bot, ctx, user, keyboards);
  });
};
