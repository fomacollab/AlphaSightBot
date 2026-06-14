const mongoose = require('mongoose');

/**
 * Template documents keep all editable copy in MongoDB so admins can change
 * every nudge and flow message without code edits.
 */
const templateSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  group: { type: String, required: true },
  label: { type: String, required: true },
  value: { type: String, default: '' },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Template', templateSchema);
