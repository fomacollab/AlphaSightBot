const User = require('../models/User');
const { USER_BUTTONS, USER_STAGE, SETTINGS_KEYS, LIBRARY_VIDEOS, FAQ_VIDEOS } = require('../constants/app');
const { getTemplate, renderTemplate } = require('./templateService');
const { getSetting } = require('./settingsService');
const { sendAsset } = require('./archiveService');
const { enqueue, withRetry, isSkippableTelegramError } = require('./queue');

async function sendText(bot, chatId, text, extra = {}) {
  if (!text) return false;
  try {
    await enqueue(async () => withRetry(async () => {
      await bot.telegram.sendMessage(chatId, text, extra);
    }));
    return true;
  } catch (err) {
    if (isSkippableTelegramError(err)) return false;
    throw err;
  }
}

async function safeSendStageAsset(bot, chatId, assetKey) {
  return sendAsset(bot, chatId, assetKey);
}

function touch(user) {
  user.lastActionAt = new Date();
  return user;
}

function buildCharlesUrl(username) {
  const clean = String(username || 'AlphaSightGlobal').replace(/^@/, '');
  return `https://t.me/${clean}`;
}

function buildCharlesEscalationSummary(user, reason) {
  return [
    'New AlphaSight escalation',
    `User: ${user.firstName || 'Unknown'} ${user.lastName || ''}`.trim(),
    `Telegram ID: ${user.telegramId}`,
    `Username: ${user.username || 'n/a'}`,
    `Country: ${user.country || 'n/a'}`,
    `Capital: ${user.capitalRange || 'n/a'}`,
    `Last step: ${user.lastStageReached || user.currentStage}`,
    `Reason: ${reason}`,
  ].join('\n');
}

async function notifyCharlesEscalation(bot, user, reason) {
  const charlesChatId = await getSetting(SETTINGS_KEYS.CHARLES_CHAT_ID);
  if (!charlesChatId) return false;
  const summary = buildCharlesEscalationSummary(user, reason);
  await sendText(bot, charlesChatId, summary).catch(() => false);
  return true;
}

async function markCharlesHandoff(user, reason) {
  user.handedToCharles = true;
  user.currentStage = USER_STAGE.HANDOFF_TO_CHARLES;
  user.awaitingEmailInput = false;
  user.lastEscalationReason = reason;
  touch(user);
  await user.save();
}

async function sendMainWelcome(bot, ctx, user, keyboardBuilder) {
  const username = await getSetting(SETTINGS_KEYS.CHARLES_USERNAME);
  await sendText(bot, ctx.chat.id, `Welcome to AlphaSight Capital.\n\nUse the menu below to get started, see how it works, explore FAQs, or speak to Charles directly.\n\nCharles: ${buildCharlesUrl(username)}`, keyboardBuilder.withMainMenu([], user));
  user.currentStage = USER_STAGE.IDLE;
  await user.save();
}

async function restartUser(bot, ctx, user, keyboardBuilder) {
  user.country = null;
  user.capitalRange = null;
  user.currentStage = USER_STAGE.IDLE;
  user.lastStageReached = USER_STAGE.IDLE;
  user.awaitingEmailInput = false;
  user.emailLookupAttempts = 0;
  user.registrationEmail = null;
  user.selectedLibraryIndex = 0;
  user.nudgeHistory = [];
  user.lastEscalationReason = null;
  user.handedToCharles = false;
  user.onboardingComplete = false;
  touch(user);
  await user.save();
  return sendMainWelcome(bot, ctx, user, keyboardBuilder);
}

async function sendS1(bot, user, keyboardBuilder) {
  await safeSendStageAsset(bot, user.telegramId, 's1_opening_voice');
  await sendText(bot, user.telegramId, 'Choose the option that fits you best.', keyboardBuilder.s1Keyboard(user));
  user.currentStage = USER_STAGE.S1_OPENING;
  user.lastStageReached = USER_STAGE.S1_OPENING;
  user.awaitingEmailInput = false;
  touch(user);
  await user.save();
}

async function sendS2Pitch(bot, user, isFirstTime, keyboardBuilder) {
  const templateKey = isFirstTime ? 's2_first_time_pitch' : 's2_traded_pitch';
  await sendText(bot, user.telegramId, await getTemplate(templateKey), keyboardBuilder.s2Keyboard(user));
  user.currentStage = USER_STAGE.S2_PITCH;
  user.lastStageReached = USER_STAGE.S2_PITCH;
  touch(user);
  await user.save();
}

async function sendS3(bot, user, keyboardBuilder) {
  await sendText(bot, user.telegramId, await getTemplate('s3_country_prompt'), keyboardBuilder.countryKeyboard(user));
  user.currentStage = USER_STAGE.S3_COUNTRY;
  user.lastStageReached = USER_STAGE.S3_COUNTRY;
  touch(user);
  await user.save();
}

async function handleCountryChoice(bot, user, country, keyboardBuilder) {
  user.country = country;
  user.lastStageReached = USER_STAGE.S3_COUNTRY;
  touch(user);
  if (country === 'Australia' || country === 'New Zealand') {
    await sendText(bot, user.telegramId, await getTemplate('s3_au_nz_intro'), keyboardBuilder.auNzKeyboard(user));
    user.currentStage = USER_STAGE.S3_AU_NZ_INTRO;
  } else {
    await user.save();
    return sendS4(bot, user, keyboardBuilder);
  }
  await user.save();
}

async function sendS4(bot, user, keyboardBuilder) {
  await sendText(bot, user.telegramId, await getTemplate('s4_capital_gate'), keyboardBuilder.capitalKeyboard(user));
  user.currentStage = USER_STAGE.S4_CAPITAL_GATE;
  user.lastStageReached = USER_STAGE.S4_CAPITAL_GATE;
  touch(user);
  await user.save();
}

async function sendBrokerLinkText(bot, user, keyboardBuilder) {
  const country = user.country || 'Other';
  const settingKey = country === 'Australia'
    ? SETTINGS_KEYS.BROKER_LINK_AUSTRALIA
    : SETTINGS_KEYS.BROKER_LINK_OTHER;
  const brokerLink = await getSetting(settingKey);
  const templateKey = country === 'Australia' ? 's5_aus_text' : 's5_global_text';
  const text = renderTemplate(await getTemplate(templateKey), { brokerLink });
  await sendText(bot, user.telegramId, text, keyboardBuilder.s5Keyboard(user));
}

async function sendS5(bot, user, keyboardBuilder) {
  await safeSendStageAsset(bot, user.telegramId, 's5_charles_voice');
  await safeSendStageAsset(bot, user.telegramId, 's5_intro_video');
  await sendBrokerLinkText(bot, user, keyboardBuilder);
  user.currentStage = USER_STAGE.S5_BROKER;
  user.lastStageReached = USER_STAGE.S5_BROKER;
  touch(user);
  await user.save();
}

async function handleCapitalRange(bot, user, rangeKey, keyboardBuilder) {
  const map = {
    '$500 - $1,000': { asset: 'tier_card_500_1000', template: 's4_caption_500_1000' },
    '$1,000 - $5,000': { asset: 'tier_card_1000_5000', template: 's4_caption_1000_5000' },
    '$5,000+': { asset: 'tier_card_5000_plus', template: 's4_caption_5000_plus' },
  };
  user.capitalRange = rangeKey;
  const config = map[rangeKey];
  if (config) {
    await safeSendStageAsset(bot, user.telegramId, config.asset);
    await sendText(bot, user.telegramId, await getTemplate(config.template));
  }
  await user.save();
  return sendS5(bot, user, keyboardBuilder);
}

async function sendS6(bot, user, keyboardBuilder) {
  await safeSendStageAsset(bot, user.telegramId, 's6_funding_video');
  await sendText(bot, user.telegramId, await getTemplate('s6_text'), keyboardBuilder.s6Keyboard(user));
  user.currentStage = USER_STAGE.S6_FUNDING;
  user.lastStageReached = USER_STAGE.S6_FUNDING;
  touch(user);
  await user.save();
}

async function sendS7(bot, user, keyboardBuilder) {
  await sendText(bot, user.telegramId, await getTemplate('s7_prompt'), keyboardBuilder.withMainMenu([[USER_BUTTONS.BACK_TO_MENU]], user));
  user.currentStage = USER_STAGE.S7_EMAIL;
  user.lastStageReached = USER_STAGE.S7_EMAIL;
  user.awaitingEmailInput = true;
  touch(user);
  await user.save();
}

async function sendS8(bot, user, keyboardBuilder) {
  await safeSendStageAsset(bot, user.telegramId, 's8_mt5_video');
  await sendText(bot, user.telegramId, await getTemplate('s8_text'), keyboardBuilder.s8Keyboard(user));
  user.currentStage = USER_STAGE.S8_MT5;
  user.lastStageReached = USER_STAGE.S8_MT5;
  user.awaitingEmailInput = false;
  touch(user);
  await user.save();
}

async function sendS9(bot, user, keyboardBuilder) {
  const onboardingFormUrl = await getSetting(SETTINGS_KEYS.ONBOARDING_FORM_URL);
  await safeSendStageAsset(bot, user.telegramId, 's9_onboarding_voice');
  user.currentStage = USER_STAGE.S9_COMPLETE;
  user.lastStageReached = USER_STAGE.S9_COMPLETE;
  user.onboardingComplete = true;
  touch(user);
  await user.save();
  await sendText(bot, user.telegramId, renderTemplate(await getTemplate('s9_text'), { onboardingFormUrl }), keyboardBuilder.withMainMenu([], user));
}

async function showLibraryMenu(bot, user, keyboardBuilder) {
  await sendText(bot, user.telegramId, await getTemplate('library_menu_intro'), keyboardBuilder.libraryKeyboard(user));
  user.currentStage = USER_STAGE.PATH2_LIBRARY;
  user.lastStageReached = USER_STAGE.PATH2_LIBRARY;
  touch(user);
  await user.save();
}

async function showLibraryVideo(bot, user, label, keyboardBuilder) {
  const item = LIBRARY_VIDEOS.find((entry) => entry.label === label) || LIBRARY_VIDEOS[0];
  user.selectedLibraryIndex = LIBRARY_VIDEOS.findIndex((entry) => entry.key === item.key);
  await safeSendStageAsset(bot, user.telegramId, item.key);
  await sendText(bot, user.telegramId, item.label, keyboardBuilder.libraryFollowupKeyboard(user));
  user.currentStage = USER_STAGE.PATH2_LIBRARY;
  touch(user);
  await user.save();
}

async function showNextLibraryVideo(bot, user, keyboardBuilder) {
  const nextIndex = (user.selectedLibraryIndex + 1) % LIBRARY_VIDEOS.length;
  const item = LIBRARY_VIDEOS[nextIndex];
  return showLibraryVideo(bot, user, item.label, keyboardBuilder);
}

async function showFaqMenu(bot, user, keyboardBuilder) {
  await sendText(bot, user.telegramId, 'Got a question? Pick from the most common ones below. There is a short video for each one.', keyboardBuilder.faqKeyboard(user));
  user.currentStage = USER_STAGE.FAQ;
  touch(user);
  await user.save();
}

async function showFaqVideo(bot, user, label, keyboardBuilder) {
  const item = FAQ_VIDEOS.find((entry) => entry.label === label);
  if (!item) return false;
  await safeSendStageAsset(bot, user.telegramId, item.key);
  await sendText(bot, user.telegramId, item.label, keyboardBuilder.faqKeyboard(user));
  touch(user);
  await user.save();
  return true;
}

async function escalateToCharles(bot, user, reason, keyboardBuilder) {
  const charlesUsername = await getSetting(SETTINGS_KEYS.CHARLES_USERNAME);
  const url = buildCharlesUrl(charlesUsername);
  await notifyCharlesEscalation(bot, user, reason);

  await sendText(bot, user.telegramId, `Charles will take it from here.\n\nSpeak to Charles: ${url}`, keyboardBuilder.withMainMenu([], user));
  await markCharlesHandoff(user, reason);
}

async function handoffToCharlesSilently(bot, user, reason) {
  await notifyCharlesEscalation(bot, user, reason);
  await markCharlesHandoff(user, reason);
}

module.exports = {
  buildCharlesUrl,
  sendText,
  sendMainWelcome,
  restartUser,
  sendS1,
  sendS2Pitch,
  sendS3,
  handleCountryChoice,
  sendS4,
  handleCapitalRange,
  sendS5,
  sendS6,
  sendS7,
  sendS8,
  sendS9,
  showLibraryMenu,
  showLibraryVideo,
  showNextLibraryVideo,
  showFaqMenu,
  showFaqVideo,
  escalateToCharles,
  handoffToCharlesSilently,
};
