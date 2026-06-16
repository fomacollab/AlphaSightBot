const { ensureUser, normalizeRegistrationEmail, isRegistrationEmailTaken } = require('../services/userService');
const { findRegistrationByEmail } = require('../services/cellxpertService');
const { getTemplate } = require('../services/templateService');
const { getSetting } = require('../services/settingsService');
const { isStageAllowed, isFlowButton, canStartOnboarding, canResumeGetStarted } = require('../services/stageGuard');
const logger = require('../services/logger');
const flow = require('../services/flowService');
const keyboards = require('../keyboards/user');
const { USER_BUTTONS, USER_STAGE, SETTINGS_KEYS, LIBRARY_VIDEOS, FAQ_VIDEOS } = require('../constants/app');

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

async function handleS7LookupFailure(bot, ctx, user, attemptedEmail, reason, err = null) {
  const meta = {
    userId: user.telegramId,
    username: user.username,
    email: attemptedEmail,
    attempts: user.emailLookupAttempts,
    reason,
  };

  if (err) {
    logger.warn('s7-email-check', 'Registration lookup failed', {
      ...meta,
      error: err?.stack || err?.message || String(err),
    });
  } else {
    logger.info('s7-email-check', 'Registration lookup not found', meta);
  }

  if (user.emailLookupAttempts < 2) {
    await flow.sendText(bot, ctx.chat.id, await getTemplate('s7_not_found_first'), keyboards.s7RetryKeyboard(user));
    user.currentStage = USER_STAGE.S7_RETRY_EMAIL;
    user.awaitingEmailInput = false;
    await user.save();
    return;
  }

  await flow.sendText(bot, ctx.chat.id, await getTemplate('s7_not_found_second'), keyboards.withMainMenu([[USER_BUTTONS.SPEAK_TO_CHARLES]], user));
  await flow.handoffToCharlesSilently(bot, user, reason);
}

async function resumeGetStarted(bot, ctx, user) {
  switch (user.currentStage) {
    case USER_STAGE.S1_OPENING:
      return flow.sendS1(bot, user, keyboards);
    case USER_STAGE.S3_COUNTRY:
      return flow.sendS3(bot, user, keyboards);
    case USER_STAGE.S3_AU_NZ_INTRO:
      return ctx.reply('Continue below.', keyboards.auNzKeyboard(user));
    case USER_STAGE.S4_CAPITAL_GATE:
      return flow.sendS4(bot, user, keyboards);
    case USER_STAGE.S5_BROKER:
      return flow.sendS5(bot, user, keyboards);
    case USER_STAGE.S6_FUNDING:
      return flow.sendS6(bot, user, keyboards);
    case USER_STAGE.S7_EMAIL:
    case USER_STAGE.S7_RETRY_EMAIL:
      if (user.awaitingEmailInput || user.currentStage === USER_STAGE.S7_EMAIL) {
        return flow.sendS7(bot, user, keyboards);
      }
      await flow.sendText(bot, ctx.chat.id, await getTemplate('s7_not_found_first'), keyboards.s7RetryKeyboard(user));
      user.currentStage = USER_STAGE.S7_RETRY_EMAIL;
      user.awaitingEmailInput = false;
      await user.save();
      return;
    case USER_STAGE.S8_MT5:
      return flow.sendS8(bot, user, keyboards);
    default:
      return;
  }
}

module.exports = function userHandlers(bot) {
  const PAST_STAGE_COOLDOWN_MS = 30 * 1000;

  async function maybeNotifyPastStage(ctx, user, label) {
    if (!isFlowButton(label)) return;

    const now = Date.now();
    if (ctx.session?.lastPastStageNoticeAt && now - ctx.session.lastPastStageNoticeAt < PAST_STAGE_COOLDOWN_MS) {
      return;
    }

    if (ctx.session) ctx.session.lastPastStageNoticeAt = now;

    const text = await getTemplate('past_stage_notice');
    await flow.sendText(bot, ctx.chat.id, text, keyboards.withMainMenu([], user));
  }

  function withStageGuard(buttonLabel, handler) {
    return async (ctx) => {
      const user = await ensureUser(ctx);
      const label = ctx.message?.text?.trim() || buttonLabel;
      if (!isStageAllowed(user, label)) {
        await maybeNotifyPastStage(ctx, user, label);
        return;
      }
      return handler(ctx, user);
    };
  }

  bot.hears(USER_BUTTONS.GET_STARTED, async (ctx) => {
    const user = await ensureUser(ctx);
    if (canResumeGetStarted(user)) {
      return resumeGetStarted(bot, ctx, user);
    }
    if (canStartOnboarding(user)) {
      return flow.sendS1(bot, user, keyboards);
    }
  });

  bot.hears(USER_BUTTONS.SEE_HOW, withStageGuard(USER_BUTTONS.SEE_HOW, async (ctx, user) => {
    return flow.showLibraryMenu(bot, user, keyboards);
  }));

  bot.hears(USER_BUTTONS.FAQ, withStageGuard(USER_BUTTONS.FAQ, async (ctx, user) => {
    return flow.showFaqMenu(bot, user, keyboards);
  }));

  bot.hears(USER_BUTTONS.SPEAK_TO_CHARLES, withStageGuard(USER_BUTTONS.SPEAK_TO_CHARLES, async (ctx, user) => {
    return flow.escalateToCharles(bot, user, 'User tapped Speak to Charles', keyboards);
  }));

  bot.hears(USER_BUTTONS.RESTART, async (ctx) => {
    const user = await ensureUser(ctx);
    if (user.onboardingComplete) return;
    return flow.restartUser(bot, ctx, user, keyboards);
  });

  bot.hears(USER_BUTTONS.FIRST_TIME, withStageGuard(USER_BUTTONS.FIRST_TIME, async (ctx, user) => {
    return flow.sendS2Pitch(bot, user, true, keyboards);
  }));

  bot.hears(USER_BUTTONS.TRADED_BEFORE, withStageGuard(USER_BUTTONS.TRADED_BEFORE, async (ctx, user) => {
    return flow.sendS2Pitch(bot, user, false, keyboards);
  }));

  bot.hears(USER_BUTTONS.HAPPY_TO_CONTINUE, withStageGuard(USER_BUTTONS.HAPPY_TO_CONTINUE, async (ctx, user) => {
    return flow.sendS3(bot, user, keyboards);
  }));

  bot.hears(USER_BUTTONS.AUSTRALIA, withStageGuard(USER_BUTTONS.AUSTRALIA, async (ctx, user) => {
    return flow.handleCountryChoice(bot, user, 'Australia', keyboards);
  }));

  bot.hears(USER_BUTTONS.EUROPE, withStageGuard(USER_BUTTONS.EUROPE, async (ctx, user) => {
    return flow.handleCountryChoice(bot, user, 'Europe', keyboards);
  }));

  bot.hears(USER_BUTTONS.NEW_ZEALAND, withStageGuard(USER_BUTTONS.NEW_ZEALAND, async (ctx, user) => {
    return flow.handleCountryChoice(bot, user, 'New Zealand', keyboards);
  }));

  bot.hears(USER_BUTTONS.OTHER, withStageGuard(USER_BUTTONS.OTHER, async (ctx, user) => {
    return flow.handleCountryChoice(bot, user, 'Other', keyboards);
  }));

  bot.hears(USER_BUTTONS.CONTINUE, withStageGuard(USER_BUTTONS.CONTINUE, async (ctx, user) => {
    return flow.sendS4(bot, user, keyboards);
  }));

  bot.hears(USER_BUTTONS.CHAT_WITH_CHRIS, withStageGuard(USER_BUTTONS.CHAT_WITH_CHRIS, async (ctx, user) => {
    const chrisUsername = await getSetting(SETTINGS_KEYS.CHRIS_USERNAME);
    const chrisUrl = `https://t.me/${String(chrisUsername || 'Griffo1324').replace(/^@/, '')}`;
    await flow.sendText(bot, ctx.chat.id, `Chris link: ${chrisUrl}`, keyboards.auNzKeyboard(user));
    await user.save();
  }));

  bot.hears(USER_BUTTONS.CAPITAL_500_1000, withStageGuard(USER_BUTTONS.CAPITAL_500_1000, async (ctx, user) => {
    return flow.handleCapitalRange(bot, user, USER_BUTTONS.CAPITAL_500_1000, keyboards);
  }));

  bot.hears(USER_BUTTONS.CAPITAL_1000_5000, withStageGuard(USER_BUTTONS.CAPITAL_1000_5000, async (ctx, user) => {
    return flow.handleCapitalRange(bot, user, USER_BUTTONS.CAPITAL_1000_5000, keyboards);
  }));

  bot.hears(USER_BUTTONS.CAPITAL_5000_PLUS, withStageGuard(USER_BUTTONS.CAPITAL_5000_PLUS, async (ctx, user) => {
    return flow.handleCapitalRange(bot, user, USER_BUTTONS.CAPITAL_5000_PLUS, keyboards);
  }));

  bot.hears(USER_BUTTONS.ACCOUNT_OPENED, withStageGuard(USER_BUTTONS.ACCOUNT_OPENED, async (ctx, user) => {
    return flow.sendS6(bot, user, keyboards);
  }));

  bot.hears(USER_BUTTONS.DEPOSIT_MADE, withStageGuard(USER_BUTTONS.DEPOSIT_MADE, async (ctx, user) => {
    return flow.sendS7(bot, user, keyboards);
  }));

  bot.hears(USER_BUTTONS.TRY_DIFFERENT_EMAIL, withStageGuard(USER_BUTTONS.TRY_DIFFERENT_EMAIL, async (ctx, user) => {
    return flow.sendS7(bot, user, keyboards);
  }));

  bot.hears(USER_BUTTONS.DONE_FUNDS_TRANSFERRED, withStageGuard(USER_BUTTONS.DONE_FUNDS_TRANSFERRED, async (ctx, user) => {
    return flow.sendS9(bot, user, keyboards);
  }));

  bot.hears(USER_BUTTONS.I_HAVE_A_QUESTION, withStageGuard(USER_BUTTONS.I_HAVE_A_QUESTION, async (ctx, user) => {
    if (user.currentStage === USER_STAGE.S8_MT5) {
      return flow.escalateToCharles(bot, user, 'Question raised during S8', keyboards);
    }
    return flow.showFaqMenu(bot, user, keyboards);
  }));

  bot.hears(USER_BUTTONS.IM_READY, withStageGuard(USER_BUTTONS.IM_READY, async (ctx, user) => {
    user.currentStage = USER_STAGE.PATH2_LIBRARY;
    await user.save();
    return flow.sendS3(bot, user, keyboards);
  }));

  bot.hears(USER_BUTTONS.NEXT_VIDEO, withStageGuard(USER_BUTTONS.NEXT_VIDEO, async (ctx, user) => {
    return flow.showNextLibraryVideo(bot, user, keyboards);
  }));

  bot.hears([USER_BUTTONS.BACK_TO_MENU, USER_BUTTONS.BACK], withStageGuard(USER_BUTTONS.BACK_TO_MENU, async (ctx, user) => {
    return flow.sendMainWelcome(bot, ctx, user, keyboards);
  }));

  for (const item of LIBRARY_VIDEOS) {
    bot.hears(item.label, withStageGuard(item.label, async (ctx, user) => {
      return flow.showLibraryVideo(bot, user, item.label, keyboards);
    }));
  }

  for (const item of FAQ_VIDEOS) {
    bot.hears(item.label, withStageGuard(item.label, async (ctx, user) => {
      return flow.showFaqVideo(bot, user, item.label, keyboards);
    }));
  }

  bot.on('text', async (ctx) => {
    if (ctx.state.isAdmin) return;
    const user = await ensureUser(ctx);
    const text = ctx.message.text.trim();
    const knownButtons = new Set([
      ...Object.values(USER_BUTTONS),
      ...LIBRARY_VIDEOS.map((item) => item.label),
      ...FAQ_VIDEOS.map((item) => item.label),
    ]);

    if (knownButtons.has(text) || text.startsWith('/')) return;

    if (Array.isArray(user.nudgeHistory) && user.nudgeHistory.includes('nudge5') && !user.handedToCharles) {
      await flow.escalateToCharles(bot, user, 'User re-engaged after Nudge 5', keyboards);
      return;
    }

    if (isEmail(text) && user.awaitingEmailInput) {
      const normalizedEmail = normalizeRegistrationEmail(text);

      if (await isRegistrationEmailTaken(normalizedEmail, user.telegramId)) {
        logger.info('s7-email-check', 'Registration email already used by another user', {
          userId: user.telegramId,
          username: user.username,
          email: normalizedEmail,
        });
        await flow.sendText(
          bot,
          ctx.chat.id,
          await getTemplate('s7_email_already_used'),
          keyboards.withMainMenu([[USER_BUTTONS.BACK_TO_MENU]], user),
        );
        user.currentStage = USER_STAGE.S7_EMAIL;
        user.awaitingEmailInput = true;
        await user.save();
        return;
      }

      user.emailLookupAttempts += 1;
      await user.save();
      logger.info('s7-email-check', 'Checking registration email', {
        userId: user.telegramId,
        username: user.username,
        email: normalizedEmail,
        attempts: user.emailLookupAttempts,
      });
      try {
        const result = await findRegistrationByEmail(normalizedEmail);
        if (result.found) {
          user.registrationEmail = normalizedEmail;
          await user.save();
          logger.info('s7-email-check', 'Registration confirmed', {
            userId: user.telegramId,
            username: user.username,
            email: user.registrationEmail,
            attempts: user.emailLookupAttempts,
            rows: result.rows.length,
          });
          await flow.sendText(bot, ctx.chat.id, await getTemplate('s7_confirmed'));
          return flow.sendS8(bot, user, keyboards);
        }
        return handleS7LookupFailure(bot, ctx, user, normalizedEmail, 'S7 registration lookup not found');
      } catch (err) {
        return handleS7LookupFailure(bot, ctx, user, normalizedEmail, `S7 API failure: ${err.message}`, err);
      }
    }

    if (user.currentStage === USER_STAGE.S4_CAPITAL_GATE) {
      const number = Number(text.replace(/[^\d.]/g, ''));
      const threshold = user.country === 'Australia' || user.country === 'New Zealand' ? 800 : 500;
      if (!Number.isNaN(number) && number > 0 && number < threshold) {
        await flow.sendText(bot, ctx.chat.id, await getTemplate('s4_below_minimum'), keyboards.withMainMenu([], user));
        return;
      }
    }
    await flow.escalateToCharles(bot, user, 'Unrecognised free-text question', keyboards);
  });
};
