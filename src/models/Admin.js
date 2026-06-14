const mongoose = require('mongoose');

/**
 * Admin records support both username-only seeding and later telegram-id
 * backfilling once that admin interacts with the bot.
 */
const adminSchema = new mongoose.Schema({
  telegramId: { type: Number, default: null },
  username: { type: String, default: null },
  isSuperAdmin: { type: Boolean, default: false },
  addedBy: { type: Number, default: null },
  createdAt: { type: Date, default: Date.now },
});

adminSchema.index({ telegramId: 1 }, { sparse: true });
adminSchema.index({ username: 1 }, { sparse: true });

module.exports = mongoose.model('Admin', adminSchema);
