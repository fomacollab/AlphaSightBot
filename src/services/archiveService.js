const MediaAsset = require('../models/MediaAsset');
const { ASSET_DEFINITIONS, SETTINGS_KEYS } = require('../constants/app');
const { getSetting } = require('./settingsService');
const { enqueue, withRetry, isSkippableTelegramError } = require('./queue');

async function ensureAssetDefinitions() {
  for (const item of ASSET_DEFINITIONS) {
    const existing = await MediaAsset.findOne({ key: item.key });
    if (!existing) {
      await MediaAsset.create(item);
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
    if (existing.kind !== item.kind) {
      existing.kind = item.kind;
      changed = true;
    }
    if (changed) {
      existing.updatedAt = new Date();
      await existing.save();
    }
  }
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

  const existing = await MediaAsset.findOne({ key: assetKey });
  if (!existing) throw new Error(`Unknown asset key: ${assetKey}`);

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
  const asset = await MediaAsset.findOne({ key: assetKey }).lean();
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
  return MediaAsset.find({ group }).sort({ label: 1 }).lean();
}

module.exports = { ensureAssetDefinitions, extractMessageFile, archiveAssetFromMessage, sendAsset, getAssetsByGroup };
