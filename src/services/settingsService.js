const Settings = require('../models/Settings');
const { DEFAULT_SETTINGS } = require('../constants/app');

const cache = new Map();
let loaded = false;

function resolveValue(key) {
  if (cache.has(key)) return cache.get(key);
  if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) return DEFAULT_SETTINGS[key];
  return null;
}

async function loadSettingsCache() {
  const docs = await Settings.find().lean();
  cache.clear();
  for (const doc of docs) {
    cache.set(doc.key, doc.value);
  }
  loaded = true;
}

async function ensureCache() {
  if (!loaded) await loadSettingsCache();
}

async function ensureDefaultSettings() {
  const entries = Object.entries(DEFAULT_SETTINGS);
  for (const [key, value] of entries) {
    const exists = await Settings.findOne({ key }).lean();
    if (!exists) await Settings.create({ key, value });
  }
  await loadSettingsCache();
}

async function getSetting(key) {
  await ensureCache();
  if (cache.has(key) || Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
    return resolveValue(key);
  }

  const item = await Settings.findOne({ key }).lean();
  if (item) {
    cache.set(item.key, item.value);
    return item.value;
  }
  return null;
}

async function getSettingsBatch(keys = []) {
  await ensureCache();
  const result = {};
  for (const key of keys) {
    result[key] = resolveValue(key);
  }
  return result;
}

async function setSetting(key, value) {
  const storedValue = await Settings.set(key, value);
  cache.set(key, storedValue);
  return storedValue;
}

module.exports = {
  ensureDefaultSettings,
  getSetting,
  getSettingsBatch,
  setSetting,
  loadSettingsCache,
};
