const mongoose = require('mongoose');

/**
 * Tracks chats the bot has already seen so admins can reuse them later from
 * the panel instead of memorizing Telegram chat IDs.
 */
const knownChannelSchema = new mongoose.Schema({
  chatId: { type: String, required: true, unique: true },
  title: { type: String, default: null },
  username: { type: String, default: null },
  type: { type: String, required: true },
  isBotMember: { type: Boolean, default: true },
  lastSeenAt: { type: Date, default: Date.now },
}, {
  timestamps: true,
});

module.exports = mongoose.model('KnownChannel', knownChannelSchema);
