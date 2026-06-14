const { USER_STAGE, USER_BUTTONS, LIBRARY_VIDEOS, FAQ_VIDEOS } = require('../constants/app');

const PERSISTENT_MENU_BUTTONS = new Set([
  USER_BUTTONS.SEE_HOW,
  USER_BUTTONS.FAQ,
  USER_BUTTONS.SPEAK_TO_CHARLES,
  USER_BUTTONS.RESTART,
]);

const BUTTON_ALLOWED_STAGES = {
  [USER_BUTTONS.FIRST_TIME]: [USER_STAGE.S1_OPENING],
  [USER_BUTTONS.TRADED_BEFORE]: [USER_STAGE.S1_OPENING],
  [USER_BUTTONS.HAPPY_TO_CONTINUE]: [USER_STAGE.S2_PITCH],
  [USER_BUTTONS.I_HAVE_A_QUESTION]: [
    USER_STAGE.S1_OPENING,
    USER_STAGE.S2_PITCH,
    USER_STAGE.S5_BROKER,
    USER_STAGE.S6_FUNDING,
    USER_STAGE.S8_MT5,
  ],
  [USER_BUTTONS.AUSTRALIA]: [USER_STAGE.S3_COUNTRY],
  [USER_BUTTONS.EUROPE]: [USER_STAGE.S3_COUNTRY],
  [USER_BUTTONS.NEW_ZEALAND]: [USER_STAGE.S3_COUNTRY],
  [USER_BUTTONS.OTHER]: [USER_STAGE.S3_COUNTRY],
  [USER_BUTTONS.CONTINUE]: [USER_STAGE.S3_AU_NZ_INTRO],
  [USER_BUTTONS.CHAT_WITH_CHRIS]: [USER_STAGE.S3_AU_NZ_INTRO],
  [USER_BUTTONS.CAPITAL_500_1000]: [USER_STAGE.S4_CAPITAL_GATE],
  [USER_BUTTONS.CAPITAL_1000_5000]: [USER_STAGE.S4_CAPITAL_GATE],
  [USER_BUTTONS.CAPITAL_5000_PLUS]: [USER_STAGE.S4_CAPITAL_GATE],
  [USER_BUTTONS.ACCOUNT_OPENED]: [USER_STAGE.S5_BROKER],
  [USER_BUTTONS.DEPOSIT_MADE]: [USER_STAGE.S6_FUNDING],
  [USER_BUTTONS.TRY_DIFFERENT_EMAIL]: [USER_STAGE.S7_RETRY_EMAIL],
  [USER_BUTTONS.DONE_FUNDS_TRANSFERRED]: [USER_STAGE.S8_MT5],
  [USER_BUTTONS.IM_READY]: [USER_STAGE.PATH2_LIBRARY],
  [USER_BUTTONS.NEXT_VIDEO]: [USER_STAGE.PATH2_LIBRARY],
  [USER_BUTTONS.BACK_TO_MENU]: [
    USER_STAGE.PATH2_LIBRARY,
    USER_STAGE.FAQ,
    USER_STAGE.S7_EMAIL,
    USER_STAGE.S7_RETRY_EMAIL,
  ],
  [USER_BUTTONS.BACK]: [
    USER_STAGE.PATH2_LIBRARY,
    USER_STAGE.FAQ,
    USER_STAGE.S7_EMAIL,
    USER_STAGE.S7_RETRY_EMAIL,
  ],
};

const LIBRARY_LABELS = new Set(LIBRARY_VIDEOS.map((item) => item.label));
const FAQ_LABELS = new Set(FAQ_VIDEOS.map((item) => item.label));

function isFlowButton(buttonOrLabel) {
  return Boolean(
    BUTTON_ALLOWED_STAGES[buttonOrLabel]
    || LIBRARY_LABELS.has(buttonOrLabel)
    || FAQ_LABELS.has(buttonOrLabel),
  );
}

function isStageAllowed(user, buttonOrLabel) {
  if (user.onboardingComplete) {
    return PERSISTENT_MENU_BUTTONS.has(buttonOrLabel);
  }

  if (PERSISTENT_MENU_BUTTONS.has(buttonOrLabel)) {
    if (buttonOrLabel === USER_BUTTONS.RESTART) return true;
    return true;
  }

  const allowedStages = BUTTON_ALLOWED_STAGES[buttonOrLabel];
  if (allowedStages) {
    return allowedStages.includes(user.currentStage);
  }

  if (LIBRARY_LABELS.has(buttonOrLabel)) {
    return user.currentStage === USER_STAGE.PATH2_LIBRARY;
  }

  if (FAQ_LABELS.has(buttonOrLabel)) {
    return user.currentStage === USER_STAGE.FAQ;
  }

  return false;
}

function canStartOnboarding(user) {
  if (user.onboardingComplete) return false;
  return [USER_STAGE.IDLE, USER_STAGE.HANDOFF_TO_CHARLES].includes(user.currentStage);
}

function canResumeGetStarted(user) {
  if (user.onboardingComplete) return false;

  const resumeStages = new Set([
    USER_STAGE.S1_OPENING,
    USER_STAGE.S3_COUNTRY,
    USER_STAGE.S3_AU_NZ_INTRO,
    USER_STAGE.S4_CAPITAL_GATE,
    USER_STAGE.S5_BROKER,
    USER_STAGE.S6_FUNDING,
    USER_STAGE.S7_EMAIL,
    USER_STAGE.S7_RETRY_EMAIL,
    USER_STAGE.S8_MT5,
  ]);

  return resumeStages.has(user.currentStage);
}

module.exports = {
  isStageAllowed,
  isFlowButton,
  canStartOnboarding,
  canResumeGetStarted,
};
