const Admin = require('../models/Admin');
const adminCache = require('../cache');

async function authMiddleware(ctx, next) {
  const username = ctx.from?.username ? `@${ctx.from.username.replace(/^@/, '')}` : null;
  const telegramId = ctx.from?.id || null;
  let admins = adminCache.getAll();

  if (!admins.length) {
    admins = await Admin.find().lean();
    adminCache.set(admins);
  }

  let admin = admins.find((item) => item.telegramId === telegramId);
  if (!admin && username) {
    admin = admins.find((item) => item.username === username);
    if (admin && !admin.telegramId && telegramId) {
      const saved = await Admin.findOneAndUpdate({ _id: admin._id }, { telegramId }, { new: true });
      admins = await Admin.find().lean();
      adminCache.set(admins);
      admin = saved.toObject();
    }
  }

  ctx.state.isAdmin = Boolean(admin);
  ctx.state.isSuperAdmin = Boolean(admin?.isSuperAdmin);
  ctx.state.adminRecord = admin || null;
  return next();
}

module.exports = authMiddleware;
