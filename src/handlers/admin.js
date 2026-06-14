const Admin = require('../models/Admin');
const User = require('../models/User');
const Template = require('../models/Template');
const MediaAsset = require('../models/MediaAsset');
const adminCache = require('../cache');
const botState = require('../services/botState');
const { archiveAssetFromMessage, getAssetsByGroup, extractMessageFile } = require('../services/archiveService');
const { getSetting, setSetting } = require('../services/settingsService');
const { listKnownChannels, getKnownChannelById, formatKnownChannelLabel, findKnownChannelByLabel } = require('../services/channelRegistryService');
const { listTemplates, setTemplate } = require('../services/templateService');
const logger = require('../services/logger');
const { adminMainKeyboard, adminContentKeyboard, adminMediaKeyboard, adminAdminsKeyboard, adminBackKeyboard, adminSelectionKeyboard } = require('../keyboards/admin');
const { withMainMenu } = require('../keyboards/user');
const { ADMIN_BUTTONS, SETTINGS_KEYS, ADMIN_SETTING_OPTIONS, DEFAULT_TEMPLATES, ASSET_DEFINITIONS } = require('../constants/app');
const {
  ADMIN_SECTIONS,
  rememberAdminSection,
  showAdminSection,
  listAdminsView,
  getSettingsPickView,
} = require('../services/adminPanelService');

async function getAdminUser(ctx) {
  return User.findOne({ telegramId: ctx.from.id });
}

function adminGuard(ctx) {
  if (!ctx.state.isAdmin) return false;
  return true;
}

async function saveKnownChannelSelection(ctx, channel, label) {
  await setSetting(SETTINGS_KEYS.ARCHIVE_CHANNEL_ID, channel.chatId);
  await setSetting(SETTINGS_KEYS.ARCHIVE_CHANNEL_USERNAME, channel.username || null);
  ensureSession(ctx);
  ctx.session.adminDraft = null;
  setAdminCurrentPage(ctx, { kind: 'section', section: ADMIN_SECTIONS.MEDIA }, false);
  await ctx.reply(`Saved file channel: ${label}`, adminMediaKeyboard());
}

const MEDIA_SLOT_STATUS_LABELS = ['New upload', 'Replacing existing file'];

async function refreshAdminCache() {
  adminCache.set(await Admin.find().lean());
}

function ensureSession(ctx) {
  if (!ctx.session) ctx.session = {};
  if (!('adminDraft' in ctx.session)) ctx.session.adminDraft = null;
  if (!Array.isArray(ctx.session.adminPageStack)) ctx.session.adminPageStack = [];
  if (!('adminCurrentPage' in ctx.session)) {
    ctx.session.adminCurrentPage = { kind: 'section', section: ADMIN_SECTIONS.HOME };
  }
}

async function getTemplateByLabel(group, label) {
  return Template.findOne({ group, label }).lean();
}

function getSettingOptionByLabel(label) {
  return ADMIN_SETTING_OPTIONS.find((item) => item.label === label) || null;
}

function formatChannelSummary(channelId, channel) {
  if (!channelId) return 'Not set';
  if (!channel) return `${channelId}`;

  const parts = [channel.title || 'Untitled channel'];
  if (channel.username) parts.push(channel.username);
  parts.push(channel.chatId);
  return parts.join(' | ');
}

function hasTextInput(ctx) {
  return typeof ctx.message?.text === 'string';
}

function normalizeSettingValue(key, rawValue) {
  const value = rawValue.trim();

  if (!value) {
    return { ok: false, error: 'Send a non-empty value.' };
  }

  if ([SETTINGS_KEYS.CHARLES_USERNAME, SETTINGS_KEYS.CHRIS_USERNAME].includes(key)) {
    const clean = value.replace(/^@/, '');
    if (!/^[A-Za-z0-9_]{5,32}$/.test(clean)) {
      return { ok: false, error: 'Send a valid Telegram username, for example `AlphaSightGlobal` or `@AlphaSightGlobal`.' };
    }
    return { ok: true, value: clean };
  }

  if (key === SETTINGS_KEYS.CHARLES_CHAT_ID) {
    if (!/^-?\d+$/.test(value)) {
      return { ok: false, error: 'Send a valid Telegram chat ID like `1632962204` or `-1001234567890`.' };
    }
    return { ok: true, value };
  }

  if (
    [
      SETTINGS_KEYS.ONBOARDING_FORM_URL,
      SETTINGS_KEYS.BROKER_LINK_AUSTRALIA,
      SETTINGS_KEYS.BROKER_LINK_OTHER,
    ].includes(key)
  ) {
    try {
      const parsed = new URL(value);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return { ok: false, error: 'Send a full `http://` or `https://` URL.' };
      }
      return { ok: true, value: parsed.toString() };
    } catch (_err) {
      return { ok: false, error: 'Send a valid full URL, for example `https://example.com/path`.' };
    }
  }

  return { ok: true, value };
}

function describeMediaInput(kind) {
  switch (kind) {
    case 'voice':
    case 'audio':
      return 'audio';
    case 'video':
      return 'video';
    case 'photo':
      return 'image';
    case 'document':
      return 'document';
    default:
      return 'media';
  }
}

function buildMediaUploadPrompt(label, kind) {
  if (kind === 'voice' || kind === 'audio') {
    return `Now send the audio for ${label}.\n\nYou can record it as a voice note or upload an audio file.`;
  }

  return `Now send the ${describeMediaInput(kind)} for ${label}.`;
}

function hasArchivedMedia(asset) {
  return Boolean(asset?.archiveChannelId && asset?.archiveMessageId);
}

function buildMediaSlotOption(asset) {
  const status = hasArchivedMedia(asset) ? 'Replacing existing file' : 'New upload';
  return {
    key: asset.key,
    label: asset.label,
    kind: asset.kind,
    hasArchive: hasArchivedMedia(asset),
    buttonLabel: `${asset.label} - ${status}`,
  };
}

function buildMediaSlotPrompt(option) {
  const actionLine = option.hasArchive
    ? 'A file is already saved for this slot. The next upload will replace it.'
    : 'No file is saved for this slot yet. The next upload will create it.';

  return `${actionLine}\n\n${buildMediaUploadPrompt(option.label, option.kind)}`;
}

async function ensureArchiveChannelConfigured(ctx) {
  const currentChannelId = await getSetting(SETTINGS_KEYS.ARCHIVE_CHANNEL_ID);
  if (currentChannelId) {
    return true;
  }

  await ctx.reply(
    'Set the file channel first before uploading any media.\n\nGo to `Media -> Set File Channel` and choose or enter the archive channel.',
    adminMediaKeyboard(),
  );
  return false;
}

function clonePage(page) {
  return page ? JSON.parse(JSON.stringify(page)) : null;
}

function samePage(a, b) {
  return JSON.stringify(a || null) === JSON.stringify(b || null);
}

function setAdminCurrentPage(ctx, page, pushHistory = true) {
  ensureSession(ctx);
  const nextPage = clonePage(page);
  const currentPage = clonePage(ctx.session.adminCurrentPage);

  if (pushHistory && currentPage && !samePage(currentPage, nextPage)) {
    ctx.session.adminPageStack.push(currentPage);
  }

  ctx.session.adminCurrentPage = nextPage;
}

function popAdminPage(ctx) {
  ensureSession(ctx);
  const previousPage = ctx.session.adminPageStack.pop();
  ctx.session.adminCurrentPage = previousPage || { kind: 'section', section: ADMIN_SECTIONS.HOME };
  return ctx.session.adminCurrentPage;
}

async function listUsersView() {
  const users = await User.find().sort({ updatedAt: -1 }).limit(20).lean();
  return users.map((user, index) => `${index + 1}. ${user.firstName || 'Unknown'} | ${user.telegramId} | ${user.currentStage}`).join('\n') || 'No users yet.';
}

async function renderAdminPage(ctx, user, page) {
  ensureSession(ctx);

  switch (page.kind) {
    case 'section':
      if (page.section === ADMIN_SECTIONS.SETTINGS) {
        await renderAdminPage(ctx, user, { kind: 'setting_pick' });
        return;
      }
      ctx.session.adminDraft = null;
      await showAdminSection(ctx, user, page.section);
      return;
    case 'list_admins': {
      ctx.session.adminDraft = null;
      await rememberAdminSection(user?._id, ADMIN_SECTIONS.ADMINS);
      const text = await listAdminsView();
      await ctx.reply(text || 'No admins found.', adminAdminsKeyboard());
      return;
    }
    case 'list_users': {
      ctx.session.adminDraft = null;
      await rememberAdminSection(user?._id, ADMIN_SECTIONS.USERS);
      await ctx.reply(await listUsersView(), adminBackKeyboard());
      return;
    }
    case 'add_admin': {
      await rememberAdminSection(user?._id, ADMIN_SECTIONS.ADMINS);
      const adminList = await listAdminsView();
      ctx.session.adminDraft = { kind: 'add_admin' };
      await ctx.reply(
        `Current admins:\n${adminList}\n\nSend the username or telegram id to add as admin.`,
        adminBackKeyboard(),
      );
      return;
    }
    case 'remove_admin': {
      await rememberAdminSection(user?._id, ADMIN_SECTIONS.ADMINS);
      const adminList = await listAdminsView();
      ctx.session.adminDraft = { kind: 'remove_admin' };
      await ctx.reply(
        `Current admins:\n${adminList}\n\nSend the username or telegram id to remove.`,
        adminBackKeyboard(),
      );
      return;
    }
    case 'channel_pick': {
      await rememberAdminSection(user?._id, ADMIN_SECTIONS.MEDIA);
      const currentChannelId = await getSetting(SETTINGS_KEYS.ARCHIVE_CHANNEL_ID);
      const currentChannel = await getKnownChannelById(currentChannelId);
      const knownChannels = await listKnownChannels();
      const options = knownChannels.map((item) => ({
        label: formatKnownChannelLabel(item),
        chatId: item.chatId,
        username: item.username || null,
      }));
      ctx.session.adminDraft = { kind: 'channel_pick', options };
      await ctx.reply(
        `Current file channel:\n${formatChannelSummary(currentChannelId, currentChannel)}\n\nTap a saved channel below or choose manual entry.`,
        adminSelectionKeyboard([...options.map((item) => item.label), ADMIN_BUTTONS.TYPE_CHANNEL_ID]),
      );
      return;
    }
    case 'channel_manual': {
      await rememberAdminSection(user?._id, ADMIN_SECTIONS.MEDIA);
      const currentChannelId = await getSetting(SETTINGS_KEYS.ARCHIVE_CHANNEL_ID);
      const currentChannel = await getKnownChannelById(currentChannelId);
      ctx.session.adminDraft = { kind: 'channel_manual' };
      await ctx.reply(
        `Current file channel:\n${formatChannelSummary(currentChannelId, currentChannel)}\n\nSend the new archive/file channel ID, for example -1001234567890.`,
        adminBackKeyboard(),
      );
      return;
    }
    case 'template_pick': {
      await rememberAdminSection(user?._id, ADMIN_SECTIONS.CONTENT);
      const items = await listTemplates(page.group);
      ctx.session.adminDraft = { kind: 'template_pick', group: page.group };
      await ctx.reply(
        page.group === 'nudge' ? 'Tap the exact nudge text you want to edit.' : 'Tap the exact flow text you want to edit.',
        adminSelectionKeyboard(items.map((item) => item.label)),
      );
      return;
    }
    case 'template_edit': {
      const selected = await Template.findOne({ key: page.key }).lean();
      if (!selected) {
        await ctx.reply('That template could not be found.', adminBackKeyboard());
        return;
      }
      ctx.session.adminDraft = { kind: 'template_edit', group: page.group, key: selected.key, label: selected.label };
      await ctx.reply(
        `Editing: ${selected.label}\n\nCurrent text:\n${selected.value || '(empty)'}\n\nNow send the full replacement text.`,
        adminBackKeyboard(),
      );
      return;
    }
    case 'setting_pick': {
      await rememberAdminSection(user?._id, ADMIN_SECTIONS.SETTINGS);
      ctx.session.adminDraft = { kind: 'setting_pick' };
      const view = await getSettingsPickView();
      await ctx.reply(view.text, view.keyboard);
      return;
    }
    case 'setting_edit': {
      const currentValue = await getSetting(page.key);
      ctx.session.adminDraft = { kind: 'setting_edit', key: page.key, label: page.label };
      await ctx.reply(
        `Editing: ${page.label}\n\nCurrent value:\n${currentValue ?? '(empty)'}\n\nNow send the new value.`,
        adminBackKeyboard(),
      );
      return;
    }
    case 'media_pick': {
      await rememberAdminSection(user?._id, ADMIN_SECTIONS.MEDIA);
      if (!(await ensureArchiveChannelConfigured(ctx))) return;
      const assets = await getAssetsByGroup(page.group);
      const options = assets.map(buildMediaSlotOption);
      ctx.session.adminDraft = { kind: 'media_pick', group: page.group, options };
      await ctx.reply(
        'Tap the exact media slot below.\n\nButtons marked "Replacing existing file" already have media saved. Buttons marked "New upload" are still empty.',
        adminSelectionKeyboard(options.map((item) => item.buttonLabel)),
      );
      return;
    }
    case 'media_upload': {
      await rememberAdminSection(user?._id, ADMIN_SECTIONS.MEDIA);
      if (!(await ensureArchiveChannelConfigured(ctx))) return;
      const asset = await MediaAsset.findOne({ key: page.assetKey }).lean();
      if (!asset) {
        await ctx.reply('That media slot could not be found.', adminBackKeyboard());
        return;
      }
      const option = buildMediaSlotOption(asset);
      ctx.session.adminDraft = {
        kind: 'media_upload',
        assetKey: asset.key,
        label: asset.label,
        assetKind: asset.kind,
        replacingExisting: option.hasArchive,
      };
      await ctx.reply(buildMediaSlotPrompt(option), adminBackKeyboard());
      return;
    }
    default:
      await showAdminSection(ctx, user, ADMIN_SECTIONS.HOME);
  }
}

async function navigateToAdminPage(ctx, user, page, options = {}) {
  const { pushHistory = true } = options;
  setAdminCurrentPage(ctx, page, pushHistory);
  await renderAdminPage(ctx, user, page);
}

function registerAdminSelectionHears(bot, navigate) {
  for (const option of ADMIN_SETTING_OPTIONS) {
    bot.hears(option.label, async (ctx) => {
      if (!adminGuard(ctx)) return;
      const user = await getAdminUser(ctx);
      await navigate(ctx, user, { kind: 'setting_edit', key: option.key, label: option.label });
    });
  }

  for (const template of DEFAULT_TEMPLATES) {
    bot.hears(template.label, async (ctx) => {
      if (!adminGuard(ctx)) return;
      const user = await getAdminUser(ctx);
      await navigate(ctx, user, { kind: 'template_edit', group: template.group, key: template.key });
    });
  }

  for (const asset of ASSET_DEFINITIONS) {
    for (const status of MEDIA_SLOT_STATUS_LABELS) {
      const buttonLabel = `${asset.label} - ${status}`;
      bot.hears(buttonLabel, async (ctx) => {
        if (!adminGuard(ctx)) return;
        const user = await getAdminUser(ctx);
        await navigate(ctx, user, { kind: 'media_upload', assetKey: asset.key });
      });
    }
  }

  bot.hears(ADMIN_BUTTONS.TYPE_CHANNEL_ID, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await getAdminUser(ctx);
    await navigate(ctx, user, { kind: 'channel_manual' });
  });
}

module.exports = function adminHandlers(bot) {
  registerAdminSelectionHears(bot, navigateToAdminPage);
  bot.hears(ADMIN_BUTTONS.OPEN, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'section', section: user?.adminSection || ADMIN_SECTIONS.HOME }, { pushHistory: false });
  });

  bot.hears(ADMIN_BUTTONS.USER_VIEW, async (ctx) => {
    if (!adminGuard(ctx)) return;
    await ctx.reply('User view restored.', withMainMenu());
  });

  bot.hears(ADMIN_BUTTONS.CONTENT, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'section', section: ADMIN_SECTIONS.CONTENT });
  });

  bot.hears(ADMIN_BUTTONS.MEDIA, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'section', section: ADMIN_SECTIONS.MEDIA });
  });

  bot.hears(ADMIN_BUTTONS.ADMINS, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'section', section: ADMIN_SECTIONS.ADMINS });
  });

  bot.hears(ADMIN_BUTTONS.SETTINGS, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'setting_pick' });
  });

  bot.hears(ADMIN_BUTTONS.USERS, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'section', section: ADMIN_SECTIONS.USERS });
  });

  bot.hears([ADMIN_BUTTONS.TOGGLE, ADMIN_BUTTONS.ENABLE], async (ctx) => {
    if (!adminGuard(ctx)) return;
    const nextValue = !botState.get();
    botState.set(nextValue);
    await setSetting(SETTINGS_KEYS.BOT_ENABLED, nextValue);
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'section', section: ADMIN_SECTIONS.HOME }, { pushHistory: false });
  });

  bot.hears(ADMIN_BUTTONS.BACK, async (ctx) => {
    if (!adminGuard(ctx)) return;
    ensureSession(ctx);
    ctx.session.adminDraft = null;
    const user = await User.findOne({ telegramId: ctx.from.id });
    const previousPage = popAdminPage(ctx);
    await renderAdminPage(ctx, user, previousPage);
  });

  bot.hears(ADMIN_BUTTONS.LIST_ADMINS, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'list_admins' });
  });

  bot.hears(ADMIN_BUTTONS.LIST_USERS, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'list_users' });
  });

  bot.hears(ADMIN_BUTTONS.ADD_ADMIN, async (ctx) => {
    if (!adminGuard(ctx) || !ctx.state.isSuperAdmin) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'add_admin' });
  });

  bot.hears(ADMIN_BUTTONS.REMOVE_ADMIN, async (ctx) => {
    if (!adminGuard(ctx) || !ctx.state.isSuperAdmin) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'remove_admin' });
  });

  bot.hears(ADMIN_BUTTONS.SET_FILE_CHANNEL, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'channel_pick' });
  });

  bot.hears(ADMIN_BUTTONS.FLOW_TEXTS, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'template_pick', group: 'flow' });
  });

  bot.hears(ADMIN_BUTTONS.NUDGE_TEXTS, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await User.findOne({ telegramId: ctx.from.id });
    await navigateToAdminPage(ctx, user, { kind: 'template_pick', group: 'nudge' });
  });

  bot.hears(ADMIN_BUTTONS.LINKS, async (ctx) => {
    if (!adminGuard(ctx)) return;
    const user = await getAdminUser(ctx);
    await navigateToAdminPage(ctx, user, { kind: 'setting_pick' });
  });

  const groupMap = {
    [ADMIN_BUTTONS.VOICE_NOTES]: 'voice_notes',
    [ADMIN_BUTTONS.CORE_VIDEOS]: 'core_videos',
    [ADMIN_BUTTONS.FAQ_VIDEOS]: 'faq_videos',
    [ADMIN_BUTTONS.PATH2_VIDEOS]: 'path2_videos',
    [ADMIN_BUTTONS.TIER_CARDS]: 'tier_cards',
    [ADMIN_BUTTONS.NUDGE_MEDIA]: 'nudge_media',
  };

  for (const [label, group] of Object.entries(groupMap)) {
    bot.hears(label, async (ctx) => {
      if (!adminGuard(ctx)) return;
      const user = await User.findOne({ telegramId: ctx.from.id });
      await navigateToAdminPage(ctx, user, { kind: 'media_pick', group });
    });
  }

  bot.on('message', async (ctx, next) => {
    if (!ctx.state.isAdmin) return next();
    ensureSession(ctx);

    const draft = ctx.session.adminDraft;
    const text = typeof ctx.message?.text === 'string' ? ctx.message.text.trim() : '';

    if (!draft) {
      if (text && text !== ADMIN_BUTTONS.BACK) {
        const knownChannel = await findKnownChannelByLabel(text);
        if (knownChannel) {
          await saveKnownChannelSelection(ctx, knownChannel, formatKnownChannelLabel(knownChannel));
          return;
        }
      }
      return next();
    }

    if (text === ADMIN_BUTTONS.BACK) return next();

    if (draft.kind === 'add_admin') {
      if (!hasTextInput(ctx)) {
        await ctx.reply('Send the username or Telegram ID as text only.', adminBackKeyboard());
        return;
      }
      const raw = ctx.message.text.trim();
      if (!raw) {
        await ctx.reply('Send a username or Telegram ID.', adminBackKeyboard());
        return;
      }
      const isTelegramId = /^\d+$/.test(raw);
      await Admin.findOneAndUpdate(
        isTelegramId ? { telegramId: Number(raw) } : { username: raw.startsWith('@') ? raw : `@${raw}` },
        isTelegramId ? { telegramId: Number(raw), isSuperAdmin: false } : { username: raw.startsWith('@') ? raw : `@${raw}`, isSuperAdmin: false },
        { upsert: true, new: true },
      );
      await refreshAdminCache();
      ctx.session.adminDraft = null;
      setAdminCurrentPage(ctx, { kind: 'section', section: ADMIN_SECTIONS.ADMINS }, false);
      await ctx.reply('Admin added.', adminAdminsKeyboard());
      return;
    }

    if (draft.kind === 'remove_admin') {
      if (!hasTextInput(ctx)) {
        await ctx.reply('Send the username or Telegram ID as text only.', adminBackKeyboard());
        return;
      }
      const raw = ctx.message.text.trim();
      if (!raw) {
        await ctx.reply('Send a username or Telegram ID.', adminBackKeyboard());
        return;
      }
      const query = /^\d+$/.test(raw) ? { telegramId: Number(raw) } : { username: raw.startsWith('@') ? raw : `@${raw}` };
      await Admin.deleteOne(query);
      await refreshAdminCache();
      ctx.session.adminDraft = null;
      setAdminCurrentPage(ctx, { kind: 'section', section: ADMIN_SECTIONS.ADMINS }, false);
      await ctx.reply('Admin removed if it existed.', adminAdminsKeyboard());
      return;
    }

    if (draft.kind === 'channel_pick') {
      if (!hasTextInput(ctx)) {
        await ctx.reply('Tap one of the saved channels or choose manual entry.', adminBackKeyboard());
        return;
      }
      if (ctx.message.text === ADMIN_BUTTONS.TYPE_CHANNEL_ID) {
        const user = await User.findOne({ telegramId: ctx.from.id });
        await navigateToAdminPage(ctx, user, { kind: 'channel_manual' });
        return;
      }

      const selected = draft.options?.find((item) => item.label === ctx.message.text.trim());
      if (!selected) {
        await ctx.reply('Tap one of the saved channels or choose manual entry.', adminBackKeyboard());
        return;
      }

      await saveKnownChannelSelection(ctx, selected, selected.label);
      return;
    }

    if (draft.kind === 'channel_manual') {
      if (!hasTextInput(ctx)) {
        await ctx.reply('Send the archive channel ID as text only.', adminBackKeyboard());
        return;
      }
      const value = ctx.message.text.trim();
      if (!/^-?\d+$/.test(value)) {
        await ctx.reply('Send a valid Telegram chat ID like -1001234567890.', adminBackKeyboard());
        return;
      }

      await setSetting(SETTINGS_KEYS.ARCHIVE_CHANNEL_ID, value);
      await setSetting(SETTINGS_KEYS.ARCHIVE_CHANNEL_USERNAME, null);
      ctx.session.adminDraft = null;
      setAdminCurrentPage(ctx, { kind: 'section', section: ADMIN_SECTIONS.MEDIA }, false);
      await ctx.reply(`Saved file channel ID: ${value}`, adminMediaKeyboard());
      return;
    }

    if (draft.kind === 'setting_pick') {
      if (!hasTextInput(ctx)) {
        await ctx.reply('Tap one of the listed setting buttons.', adminBackKeyboard());
        return;
      }
      const selected = getSettingOptionByLabel(ctx.message.text.trim());
      if (!selected) {
        await ctx.reply('Tap one of the listed setting buttons.', adminBackKeyboard());
        return;
      }
      const user = await User.findOne({ telegramId: ctx.from.id });
      await navigateToAdminPage(ctx, user, { kind: 'setting_edit', key: selected.key, label: selected.label });
      return;
    }

    if (draft.kind === 'setting_edit') {
      if (!hasTextInput(ctx)) {
        await ctx.reply('Send the new value as text only.', adminBackKeyboard());
        return;
      }
      const normalized = normalizeSettingValue(draft.key, ctx.message.text);
      if (!normalized.ok) {
        await ctx.reply(normalized.error, adminBackKeyboard());
        return;
      }
      await setSetting(draft.key, normalized.value);
      ctx.session.adminDraft = null;
      const user = await User.findOne({ telegramId: ctx.from.id });
      await ctx.reply(`Saved ${draft.label}.`);
      await navigateToAdminPage(ctx, user, { kind: 'setting_pick' }, { pushHistory: false });
      return;
    }

    if (draft.kind === 'template_pick') {
      if (!hasTextInput(ctx)) {
        await ctx.reply('Tap one of the listed template buttons.', adminBackKeyboard());
        return;
      }
      const selected = await getTemplateByLabel(draft.group, ctx.message.text.trim());
      if (!selected) {
        await ctx.reply('Tap one of the listed template buttons.', adminBackKeyboard());
        return;
      }
      const user = await User.findOne({ telegramId: ctx.from.id });
      await navigateToAdminPage(ctx, user, { kind: 'template_edit', group: draft.group, key: selected.key });
      return;
    }

    if (draft.kind === 'template_edit') {
      if (!hasTextInput(ctx)) {
        await ctx.reply('Send the replacement template as text only.', adminBackKeyboard());
        return;
      }
      const value = ctx.message.text.trim();
      if (!value) {
        await ctx.reply('Send the full replacement text for this template.', adminBackKeyboard());
        return;
      }
      await setTemplate(draft.key, value);
      ctx.session.adminDraft = null;
      const user = await getAdminUser(ctx);
      await ctx.reply(`Updated ${draft.label}.`);
      await navigateToAdminPage(ctx, user, { kind: 'template_pick', group: draft.group }, { pushHistory: false });
      return;
    }

    if (draft.kind === 'media_pick') {
      if (!hasTextInput(ctx)) {
        await ctx.reply('Tap one of the listed media slot buttons.', adminBackKeyboard());
        return;
      }
      const selected = draft.options?.find((item) => item.buttonLabel === ctx.message.text.trim());
      if (!selected) {
        await ctx.reply('Tap one of the listed media slot buttons.', adminBackKeyboard());
        return;
      }
      const user = await User.findOne({ telegramId: ctx.from.id });
      await navigateToAdminPage(ctx, user, { kind: 'media_upload', assetKey: selected.key });
      return;
    }

    if (draft.kind === 'media_upload') {
      if (!(await ensureArchiveChannelConfigured(ctx))) {
        ctx.session.adminDraft = null;
        return;
      }
      if (!extractMessageFile(ctx.message)) {
        await ctx.reply(buildMediaUploadPrompt(draft.label, draft.assetKind), adminBackKeyboard());
        return;
      }
      try {
        const asset = await archiveAssetFromMessage(bot, ctx, draft.assetKey);
        ctx.session.adminDraft = null;
        await ctx.reply(
          draft.replacingExisting ? `${asset.label} Updated✅` : `${asset.label} Uploaded✅`,
        );
        const user = await User.findOne({ telegramId: ctx.from.id });
        const previousPage = popAdminPage(ctx);
        await renderAdminPage(ctx, user, previousPage);
      } catch (err) {
        logger.error('admin-upload', 'Media upload failed', {
          assetKey: draft.assetKey,
          label: draft.label,
          adminId: ctx.from?.id,
          chatId: ctx.chat?.id,
          error: err?.stack || err?.message || String(err),
        });
        await ctx.reply(`Upload failed: ${err.message}`, adminBackKeyboard());
      }
      return;
    }

    return next();
  });
};
