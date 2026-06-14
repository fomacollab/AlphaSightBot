const User = require('../models/User');
const Admin = require('../models/Admin');
const botState = require('./botState');
const { ADMIN_SETTING_OPTIONS, SETTINGS_KEYS } = require('../constants/app');
const { getSetting, getSettingsBatch } = require('./settingsService');
const { getKnownChannelById } = require('./channelRegistryService');
const {
  adminMainKeyboard,
  adminContentKeyboard,
  adminMediaKeyboard,
  adminAdminsKeyboard,
  adminBackKeyboard,
  adminSelectionKeyboard,
} = require('../keyboards/admin');

function formatPreviewValue(value) {
  if (value === null || value === undefined || value === '') return '(empty)';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function buildSettingsSummary() {
  const values = await getSettingsBatch(ADMIN_SETTING_OPTIONS.map((item) => item.key));

  return ADMIN_SETTING_OPTIONS
    .map((item) => `<b>${formatPreviewValue(item.label)}:</b>\n${formatPreviewValue(values[item.key])}`)
    .join('\n\n');
}

async function getSettingsPickView() {
  return {
    text: `<b>Current settings:</b>\n\n${await buildSettingsSummary()}\n\nTap the exact setting you want to edit.`,
    keyboard: {
      ...adminSelectionKeyboard(ADMIN_SETTING_OPTIONS.map((item) => item.label)),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    },
  };
}

async function buildMediaSummary() {
  const channelId = await getSetting(SETTINGS_KEYS.ARCHIVE_CHANNEL_ID);
  if (!channelId) return 'Current file channel: (not set)';

  const channel = await getKnownChannelById(channelId);
  if (!channel) return `Current file channel: ${channelId}`;

  const parts = [channel.title || 'Untitled channel'];
  if (channel.username) parts.push(channel.username);
  parts.push(channel.chatId);
  return `Current file channel: ${parts.join(' | ')}`;
}

const ADMIN_SECTIONS = {
  HOME: 'HOME',
  CONTENT: 'CONTENT',
  MEDIA: 'MEDIA',
  SETTINGS: 'SETTINGS',
  ADMINS: 'ADMINS',
  USERS: 'USERS',
};

const SECTION_DRAFT = {
  [ADMIN_SECTIONS.SETTINGS]: { kind: 'setting_pick' },
};

function sectionToPage(section) {
  if (section === ADMIN_SECTIONS.SETTINGS) {
    return { kind: 'setting_pick' };
  }
  return { kind: 'section', section };
}

function syncAdminSession(ctx, section = ADMIN_SECTIONS.HOME) {
  if (!ctx?.session) return;
  ctx.session.adminDraft = SECTION_DRAFT[section] || null;
  ctx.session.adminCurrentPage = sectionToPage(section);
}

/**
 * Returns the text and keyboard for an admin subsection. This is reused by
 * `/start`, `/menu`, and normal admin button handlers so admins always reopen
 * into the same subsection they were last using.
 *
 * @param {string} section
 * @returns {Promise<{text: string, keyboard: ReturnType<typeof adminMainKeyboard>}>}
 */
async function getAdminSectionView(section) {
  switch (section) {
    case ADMIN_SECTIONS.CONTENT:
      return { text: 'Content section', keyboard: adminContentKeyboard() };
    case ADMIN_SECTIONS.MEDIA:
      return { text: `Media section\n\n${await buildMediaSummary()}`, keyboard: adminMediaKeyboard() };
    case ADMIN_SECTIONS.SETTINGS:
      return getSettingsPickView();
    case ADMIN_SECTIONS.ADMINS:
      return { text: 'Admin management', keyboard: adminAdminsKeyboard() };
    case ADMIN_SECTIONS.USERS: {
      const count = await User.countDocuments();
      return { text: `Users: ${count}`, keyboard: adminBackKeyboard() };
    }
    case ADMIN_SECTIONS.HOME:
    default:
      return { text: 'Admin panel', keyboard: adminMainKeyboard(botState.get()) };
  }
}

async function rememberAdminSection(userId, section) {
  return User.findByIdAndUpdate(userId, { $set: { adminSection: section } }, { new: true });
}

async function showAdminSection(ctx, user, section = ADMIN_SECTIONS.HOME) {
  syncAdminSession(ctx, section);

  const view = await getAdminSectionView(section);
  if (user?._id) {
    await rememberAdminSection(user._id, section);
  }
  await ctx.reply(view.text, view.keyboard);
}

async function listAdminsView() {
  const admins = await Admin.find().sort({ isSuperAdmin: -1, createdAt: 1 }).lean();
  const text = admins
    .map((item, index) => `${index + 1}. ${item.username || 'n/a'} | ${item.telegramId || 'no id'}${item.isSuperAdmin ? ' | superadmin' : ''}`)
    .join('\n');
  return text || 'No admins found.';
}

module.exports = {
  ADMIN_SECTIONS,
  getAdminSectionView,
  rememberAdminSection,
  showAdminSection,
  listAdminsView,
  buildSettingsSummary,
  buildMediaSummary,
  getSettingsPickView,
  syncAdminSession,
  sectionToPage,
};
