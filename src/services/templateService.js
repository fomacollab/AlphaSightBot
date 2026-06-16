const Template = require('../models/Template');
const { DEFAULT_TEMPLATES } = require('../constants/app');

const defaultTemplateMap = new Map(DEFAULT_TEMPLATES.map((item) => [item.key, item]));

function getDefaultTemplate(key) {
  return defaultTemplateMap.get(key) || null;
}

async function getTemplateRecord(key) {
  const stored = await Template.findOne({ key }).lean();
  if (stored) {
    const fallback = getDefaultTemplate(key);
    return {
      ...fallback,
      ...stored,
      value: stored.value ?? fallback?.value ?? '',
    };
  }

  const fallback = getDefaultTemplate(key);
  return fallback ? { ...fallback } : null;
}

async function getTemplateRecordByLabel(group, label) {
  const templates = await listTemplates(group);
  return templates.find((item) => item.label === label) || null;
}

async function getTemplate(key, fallback = '') {
  const template = await getTemplateRecord(key);
  return template ? template.value : fallback;
}

async function listTemplates(group = null) {
  const query = group ? { group } : {};
  const stored = await Template.find(query).sort({ group: 1, label: 1 }).lean();
  const merged = new Map();

  for (const item of DEFAULT_TEMPLATES) {
    if (!group || item.group === group) merged.set(item.key, { ...item });
  }

  for (const item of stored) {
    const fallback = merged.get(item.key) || {};
    merged.set(item.key, {
      ...fallback,
      ...item,
      value: item.value ?? fallback.value ?? '',
    });
  }

  return [...merged.values()].sort((a, b) => {
    if (a.group !== b.group) return String(a.group).localeCompare(String(b.group));
    return String(a.label).localeCompare(String(b.label));
  });
}

async function setTemplate(key, value) {
  const fallback = getDefaultTemplate(key);
  return Template.findOneAndUpdate(
    { key },
    {
      value,
      group: fallback?.group,
      label: fallback?.label,
      updatedAt: new Date(),
    },
    { new: true, upsert: true },
  );
}

function renderTemplate(value, variables = {}) {
  return String(value || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_full, key) => variables[key] ?? '');
}

module.exports = {
  getDefaultTemplate,
  getTemplate,
  getTemplateRecord,
  getTemplateRecordByLabel,
  listTemplates,
  setTemplate,
  renderTemplate,
};
