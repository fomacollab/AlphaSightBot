const User = require('../models/User');
const { USER_STAGE } = require('../constants/app');
const { sendAsset } = require('./archiveService');
const { getTemplate } = require('./templateService');
const { sendText } = require('./flowService');

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function hasNudge(user, key) {
  return Array.isArray(user.nudgeHistory) && user.nudgeHistory.includes(key);
}

async function markNudge(user, key) {
  if (!Array.isArray(user.nudgeHistory)) user.nudgeHistory = [];
  if (!user.nudgeHistory.includes(key)) user.nudgeHistory.push(key);
  user.lastNudgeAt = new Date();
  await user.save();
}

async function processNudges(bot, keyboards) {
  const users = await User.find({ onboardingComplete: false, handedToCharles: false });
  const now = Date.now();

  for (const user of users) {
    const elapsed = now - new Date(user.lastActionAt || user.updatedAt).getTime();

    if (user.currentStage === USER_STAGE.S1_OPENING && elapsed >= 45 * MINUTE && !hasNudge(user, 'nudge1')) {
      await sendAsset(bot, user.telegramId, 'nudge1_voice');
      await markNudge(user, 'nudge1');
      continue;
    }

    if (user.currentStage === USER_STAGE.S5_BROKER && elapsed >= 60 * MINUTE && !hasNudge(user, 'nudge2')) {
      const assetKey = user.country === 'Australia' || user.country === 'New Zealand' ? 'nudge2_aus_voice' : 'nudge2_global_voice';
      await sendAsset(bot, user.telegramId, assetKey);
      await markNudge(user, 'nudge2');
      continue;
    }

    if (user.currentStage === USER_STAGE.S6_FUNDING && elapsed >= 60 * MINUTE && !hasNudge(user, 'nudge3')) {
      await sendAsset(bot, user.telegramId, 'nudge3_chris_video');
      await sendText(bot, user.telegramId, await getTemplate('nudge3_text'), keyboards.s6Keyboard(user));
      await markNudge(user, 'nudge3');
      continue;
    }

    if (user.currentStage === USER_STAGE.S8_MT5 && elapsed >= 60 * MINUTE && !hasNudge(user, 'nudge4')) {
      await sendAsset(bot, user.telegramId, 'nudge4_voice');
      await markNudge(user, 'nudge4');
      continue;
    }

    if (elapsed >= 24 * HOUR && !hasNudge(user, 'nudge5')) {
      await sendAsset(bot, user.telegramId, 'nudge5_voice');
      await markNudge(user, 'nudge5');
      continue;
    }

  }
}

module.exports = { processNudges };
