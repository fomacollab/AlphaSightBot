const { Markup } = require('telegraf');
const { USER_BUTTONS, LIBRARY_VIDEOS, FAQ_VIDEOS } = require('../constants/app');

function buildKeyboard(rows) {
  return Markup.keyboard(rows).resize();
}

function withMainMenu(extraRows = [], user = null) {
  const menuRows = [
    [USER_BUTTONS.GET_STARTED, USER_BUTTONS.SEE_HOW],
    [USER_BUTTONS.FAQ, USER_BUTTONS.SPEAK_TO_CHARLES],
  ];
  if (!user?.onboardingComplete) {
    menuRows.push([USER_BUTTONS.RESTART]);
  }
  return buildKeyboard([...extraRows, ...menuRows]);
}

function s1Keyboard(user = null) {
  return withMainMenu([
    [USER_BUTTONS.FIRST_TIME, USER_BUTTONS.TRADED_BEFORE],
    [USER_BUTTONS.I_HAVE_A_QUESTION],
  ], user);
}

function s2Keyboard(user = null) {
  return withMainMenu([
    [USER_BUTTONS.HAPPY_TO_CONTINUE],
    [USER_BUTTONS.I_HAVE_A_QUESTION],
  ], user);
}

function countryKeyboard(user = null) {
  return withMainMenu([
    [USER_BUTTONS.AUSTRALIA, USER_BUTTONS.EUROPE],
    [USER_BUTTONS.NEW_ZEALAND, USER_BUTTONS.OTHER],
  ], user);
}

function auNzKeyboard(user = null) {
  return withMainMenu([
    [USER_BUTTONS.CONTINUE, USER_BUTTONS.CHAT_WITH_CHRIS],
  ], user);
}

function capitalKeyboard(user = null) {
  return withMainMenu([
    [USER_BUTTONS.CAPITAL_500_1000],
    [USER_BUTTONS.CAPITAL_1000_5000],
    [USER_BUTTONS.CAPITAL_5000_PLUS],
  ], user);
}

function s5Keyboard(user = null) {
  return withMainMenu([
    [USER_BUTTONS.ACCOUNT_OPENED],
    [USER_BUTTONS.I_HAVE_A_QUESTION],
  ], user);
}

function s6Keyboard(user = null) {
  return withMainMenu([
    [USER_BUTTONS.DEPOSIT_MADE],
    [USER_BUTTONS.I_HAVE_A_QUESTION],
  ], user);
}

function s7RetryKeyboard(user = null) {
  return withMainMenu([
    [USER_BUTTONS.TRY_DIFFERENT_EMAIL, USER_BUTTONS.SPEAK_TO_CHARLES],
  ], user);
}

function s8Keyboard(user = null) {
  return withMainMenu([
    [USER_BUTTONS.DONE_FUNDS_TRANSFERRED],
    [USER_BUTTONS.I_HAVE_A_QUESTION],
  ], user);
}

function libraryKeyboard(user = null) {
  const videoRows = LIBRARY_VIDEOS.map((item) => [item.label]);
  return withMainMenu([...videoRows, [USER_BUTTONS.BACK_TO_MENU]], user);
}

function libraryFollowupKeyboard(user = null) {
  return withMainMenu([
    [USER_BUTTONS.NEXT_VIDEO, USER_BUTTONS.IM_READY],
    [USER_BUTTONS.BACK_TO_MENU],
  ], user);
}

function faqKeyboard(user = null) {
  const rows = FAQ_VIDEOS.map((item) => [item.label]);
  return withMainMenu([...rows, [USER_BUTTONS.BACK_TO_MENU]], user);
}

module.exports = {
  withMainMenu,
  s1Keyboard,
  s2Keyboard,
  countryKeyboard,
  auNzKeyboard,
  capitalKeyboard,
  s5Keyboard,
  s6Keyboard,
  s7RetryKeyboard,
  s8Keyboard,
  libraryKeyboard,
  libraryFollowupKeyboard,
  faqKeyboard,
};
