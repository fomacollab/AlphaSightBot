const Template = require('../models/Template');
const { DEFAULT_TEMPLATES } = require('../constants/app');

async function ensureDefaultTemplates() {
  for (const item of DEFAULT_TEMPLATES) {
    const existing = await Template.findOne({ key: item.key });
    if (!existing) {
      await Template.create(item);
      continue;
    }

    let changed = false;
    if (existing.group !== item.group) {
      existing.group = item.group;
      changed = true;
    }
    if (existing.label !== item.label) {
      existing.label = item.label;
      changed = true;
    }
    if (!String(existing.value || '').trim()) {
      existing.value = item.value;
      changed = true;
    }
    if (changed) {
      existing.updatedAt = new Date();
      await existing.save();
    }
  }
}

async function getTemplate(key, fallback = '') {
  const template = await Template.findOne({ key }).lean();
  return template ? template.value : fallback;
}

async function listTemplates(group = null) {
  const query = group ? { group } : {};
  return Template.find(query).sort({ group: 1, label: 1 }).lean();
}

async function setTemplate(key, value) {
  return Template.findOneAndUpdate(
    { key },
    { value, updatedAt: new Date() },
    { new: true, upsert: true },
  );
}

function renderTemplate(value, variables = {}) {
  return String(value || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_full, key) => variables[key] ?? '');
}

module.exports = { ensureDefaultTemplates, getTemplate, listTemplates, setTemplate, renderTemplate };
