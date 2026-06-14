const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
  updatedAt: { type: Date, default: Date.now },
});

settingsSchema.statics.get = async function get(key, fallback = null) {
  const item = await this.findOne({ key }).lean();
  return item ? item.value : fallback;
};

settingsSchema.statics.set = async function set(key, value) {
  const doc = await this.findOneAndUpdate(
    { key },
    { value, updatedAt: new Date() },
    { new: true, upsert: true },
  );
  return doc.value;
};

module.exports = mongoose.model('Settings', settingsSchema);
