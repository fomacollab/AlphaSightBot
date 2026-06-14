const KnownChannel = require('../models/KnownChannel');

/**
 * Telegram updates do not guarantee the same chat metadata every time, so this
 * helper normalizes what we receive and keeps the latest useful details.
 *
 * @param {import('telegraf/typings/core/types/typegram').Chat} chat
 * @returns {{ chatId: string, title: string|null, username: string|null, type: string }|null}
 */
function normalizeKnownChat(chat) {
  if (!chat?.id || !chat?.type) return null;
  if (!['channel', 'supergroup', 'group'].includes(chat.type)) return null;

  const title = chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim() || null;
  const username = chat.username ? `@${String(chat.username).replace(/^@/, '')}` : null;

  return {
    chatId: String(chat.id),
    title,
    username,
    type: chat.type,
  };
}

/**
 * Stores or refreshes a chat entry whenever the bot sees itself inside a
 * channel-like chat. This makes admin channel selection tapable later.
 *
 * @param {import('telegraf/typings/core/types/typegram').Chat} chat
 * @param {boolean} [isBotMember=true]
 * @returns {Promise<import('../models/KnownChannel')|null>}
 */
async function rememberKnownChannel(chat, isBotMember = true) {
  const normalized = normalizeKnownChat(chat);
  if (!normalized) return null;

  return KnownChannel.findOneAndUpdate(
    { chatId: normalized.chatId },
    {
      ...normalized,
      isBotMember,
      lastSeenAt: new Date(),
    },
    { new: true, upsert: true },
  );
}

/**
 * Returns the most recently seen channels first so the admin panel can show
 * practical choices before older archive chats.
 *
 * @returns {Promise<Array<object>>}
 */
async function listKnownChannels() {
  return KnownChannel.find({ isBotMember: true }).sort({ lastSeenAt: -1, title: 1 }).lean();
}

/**
 * Looks up a known channel by its stored chat ID.
 *
 * @param {string|number|null|undefined} chatId
 * @returns {Promise<object|null>}
 */
async function getKnownChannelById(chatId) {
  if (!chatId) return null;
  return KnownChannel.findOne({ chatId: String(chatId) }).lean();
}

/**
 * Builds a keyboard-friendly label that stays readable while still uniquely
 * hinting which saved channel the admin is choosing.
 *
 * @param {{ title?: string|null, username?: string|null, chatId: string }} channel
 * @returns {string}
 */
function formatKnownChannelLabel(channel) {
  const name = channel.title || channel.username || channel.chatId;
  const suffix = channel.username || channel.chatId;
  const raw = `${name} | ${suffix}`;
  return raw.length <= 60 ? raw : `${raw.slice(0, 57)}...`;
}

/**
 * Finds a remembered channel by the tap label shown in the admin picker.
 *
 * @param {string} label
 * @returns {Promise<object|null>}
 */
async function findKnownChannelByLabel(label) {
  const normalized = String(label || '').trim();
  if (!normalized) return null;

  const channels = await listKnownChannels();
  return channels.find((channel) => formatKnownChannelLabel(channel) === normalized) || null;
}

module.exports = {
  rememberKnownChannel,
  listKnownChannels,
  getKnownChannelById,
  formatKnownChannelLabel,
  findKnownChannelByLabel,
};
