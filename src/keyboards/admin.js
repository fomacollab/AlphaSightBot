const { Markup } = require('telegraf');
const { ADMIN_BUTTONS } = require('../constants/app');

function keyboard(rows) {
  return Markup.keyboard(rows).resize();
}

function adminMainKeyboard(botEnabled = true) {
  return keyboard([
    [ADMIN_BUTTONS.CONTENT, ADMIN_BUTTONS.MEDIA],
    [ADMIN_BUTTONS.SETTINGS, ADMIN_BUTTONS.ADMINS],
    [ADMIN_BUTTONS.USERS, botEnabled ? ADMIN_BUTTONS.TOGGLE : ADMIN_BUTTONS.ENABLE],
    [ADMIN_BUTTONS.USER_VIEW],
  ]);
}

function adminContentKeyboard() {
  return keyboard([
    [ADMIN_BUTTONS.FLOW_TEXTS, ADMIN_BUTTONS.NUDGE_TEXTS],
    [ADMIN_BUTTONS.LINKS],
    [ADMIN_BUTTONS.BACK],
  ]);
}

function adminMediaKeyboard() {
  return keyboard([
    [ADMIN_BUTTONS.SET_FILE_CHANNEL],
    [ADMIN_BUTTONS.VOICE_NOTES, ADMIN_BUTTONS.CORE_VIDEOS],
    [ADMIN_BUTTONS.PATH2_VIDEOS, ADMIN_BUTTONS.FAQ_VIDEOS],
    [ADMIN_BUTTONS.TIER_CARDS, ADMIN_BUTTONS.NUDGE_MEDIA],
    [ADMIN_BUTTONS.BACK],
  ]);
}

function adminAdminsKeyboard() {
  return keyboard([
    [ADMIN_BUTTONS.ADD_ADMIN, ADMIN_BUTTONS.REMOVE_ADMIN],
    [ADMIN_BUTTONS.LIST_ADMINS],
    [ADMIN_BUTTONS.BACK],
  ]);
}

function adminBackKeyboard() {
  return keyboard([[ADMIN_BUTTONS.BACK]]);
}

/**
 * Builds a simple single-column selection keyboard for long admin labels so
 * the chosen template/media slot is obvious and easy to tap.
 *
 * @param {string[]} labels
 * @returns {ReturnType<typeof keyboard>}
 */
function adminSelectionKeyboard(labels = []) {
  const rows = labels.map((label) => [label]);
  rows.push([ADMIN_BUTTONS.BACK]);
  return keyboard(rows);
}

module.exports = {
  adminMainKeyboard,
  adminContentKeyboard,
  adminMediaKeyboard,
  adminAdminsKeyboard,
  adminBackKeyboard,
  adminSelectionKeyboard,
};
