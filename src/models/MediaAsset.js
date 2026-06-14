const mongoose = require('mongoose');

/**
 * Media assets are stored as archive-channel references first, not just
 * `file_id`s, so a future bot token can still re-copy the original media.
 */
const mediaAssetSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  group: { type: String, required: true },
  label: { type: String, required: true },
  kind: { type: String, required: true },
  archiveChannelId: { type: String, default: null },
  archiveMessageId: { type: Number, default: null },
  latestFileId: { type: String, default: null },
  fileUniqueId: { type: String, default: null },
  mimeType: { type: String, default: null },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('MediaAsset', mediaAssetSchema);
