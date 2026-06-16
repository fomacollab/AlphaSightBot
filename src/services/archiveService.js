const MediaAsset = require('../models/MediaAsset');
const { ASSET_DEFINITIONS, SETTINGS_KEYS } = require('../constants/app');
const { getSetting } = require('./settingsService');
const { enqueue, withRetry, isSkippableTelegramError } = require('./queue');

const assetDefinitionMap = new Map(ASSET_DEFINITIONS.map((item) => [item.key, item]));

function getAssetDefinition(key) {
  return assetDefinitionMap.get(key) || null;
}

async function getAssetByKey(key) {
  const stored = await MediaAsset.findOne({ key }).lean();
  if (stored) {
    const fallback = getAssetDefinition(key);
    return { ...fallback, ...stored };
  }
  const fallback = getAssetDefinition(key);
  return fallback ? { ...fallback } : null;
}

function extractMessageFile(message) {
  if (message.voice) {
    return { kind: 'voice', fileId: message.voice.file_id, fileUniqueId: message.voice.file_unique_id, mimeType: message.voice.mime_type || null };
  }
  if (message.video) {
    return { kind: 'video', fileId: message.video.file_id, fileUniqueId: message.video.file_unique_id, mimeType: message.video.mime_type || null };
  }
  if (message.audio) {
    return { kind: 'audio', fileId: message.audio.file_id, fileUniqueId: message.audio.file_unique_id, mimeType: message.audio.mime_type || null };
  }
  if (Array.isArray(message.photo) && message.photo.length) {
    const photo = message.photo[message.photo.length - 1];
    return { kind: 'photo', fileId: photo.file_id, fileUniqueId: photo.file_unique_id, mimeType: 'image/jpeg' };
  }
  if (message.document) {
    return { kind: 'document', fileId: message.document.file_id, fileUniqueId: message.document.file_unique_id, mimeType: message.document.mime_type || null };
  }
  return null;
}

function getAcceptedKinds(kind) {
  if (kind === 'voice' || kind === 'audio') {
    return ['voice', 'audio'];
  }
  return [kind];
}

function describeExpectedMedia(kind) {
  switch (kind) {
    case 'voice':
    case 'audio':
      return 'audio. You can record a voice note or upload an audio file';
    case 'video':
      return 'a video';
    case 'photo':
      return 'an image';
    case 'document':
      return 'a document';
    default:
      return `a ${kind}`;
  }
}

async function archiveAssetFromMessage(bot, ctx, assetKey) {
  const archiveChannelId = await getSetting(SETTINGS_KEYS.ARCHIVE_CHANNEL_ID);
  if (!archiveChannelId) {
    throw new Error('Archive channel is not set. Use the admin panel first.');
  }

  let existing = await MediaAsset.findOne({ key: assetKey });
  if (!existing) {
    const fallback = getAssetDefinition(assetKey);
    if (!fallback) throw new Error(`Unknown asset key: ${assetKey}`);
    existing = await MediaAsset.create(fallback);
  }

  const fileMeta = extractMessageFile(ctx.message);
  if (!fileMeta) throw new Error(`Please send ${describeExpectedMedia(existing.kind)}.`);

  const acceptedKinds = getAcceptedKinds(existing.kind);
  if (existing.kind && !acceptedKinds.includes(fileMeta.kind)) {
    throw new Error(`This asset expects ${describeExpectedMedia(existing.kind)}, but you sent a ${fileMeta.kind}.`);
  }

  const copied = await enqueue(async () => withRetry(async () => (
    bot.telegram.copyMessage(archiveChannelId, ctx.chat.id, ctx.message.message_id)
  )));
  const copiedMessageId = copied?.message_id;
  if (typeof copiedMessageId !== 'number') {
    throw new Error('Archive upload did not return a valid copied message id.');
  }

  existing.archiveChannelId = String(archiveChannelId);
  existing.archiveMessageId = copiedMessageId;
  existing.latestFileId = fileMeta.fileId;
  existing.fileUniqueId = fileMeta.fileUniqueId;
  existing.mimeType = fileMeta.mimeType;
  existing.kind = existing.kind || fileMeta.kind;
  existing.updatedAt = new Date();
  await existing.save();
  return existing;
}

async function sendAsset(bot, chatId, assetKey) {
  const asset = await getAssetByKey(assetKey);
  if (!asset?.archiveChannelId || !asset?.archiveMessageId) return false;

  try {
    await enqueue(async () => withRetry(async () => {
      await bot.telegram.copyMessage(chatId, asset.archiveChannelId, asset.archiveMessageId);
    }));
    return true;
  } catch (err) {
    if (isSkippableTelegramError(err)) return false;
    throw err;
  }
}

async function getAssetsByGroup(group) {
  const stored = await MediaAsset.find(group ? { group } : {}).sort({ label: 1 }).lean();
  const merged = new Map();

  for (const item of ASSET_DEFINITIONS) {
    if (!group || item.group === group) merged.set(item.key, { ...item });
  }

  for (const item of stored) {
    const fallback = merged.get(item.key) || {};
    merged.set(item.key, { ...fallback, ...item });
  }

  return [...merged.values()].sort((a, b) => String(a.label).localeCompare(String(b.label)));
}

module.exports = {
  getAssetDefinition,
  getAssetByKey,
  extractMessageFile,
  archiveAssetFromMessage,
  sendAsset,
  getAssetsByGroup,
};
