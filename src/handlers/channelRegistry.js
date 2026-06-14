const { rememberKnownChannel } = require('../services/channelRegistryService');

/**
 * Saves channels/groups the bot is added to, so later admin flows can offer a
 * tap-to-select list instead of requiring a pasted chat ID every time.
 *
 * @param {import('telegraf').Telegraf} bot
 */
module.exports = function channelRegistryHandler(bot) {
  bot.on('my_chat_member', async (ctx, next) => {
    const chat = ctx.update?.my_chat_member?.chat;
    const status = ctx.update?.my_chat_member?.new_chat_member?.status;
    const isBotMember = ['administrator', 'member'].includes(status);

    try {
      await rememberKnownChannel(chat, isBotMember);
    } catch (err) {
      console.error('[channel registry] my_chat_member failed:', err.message);
    }

    return next();
  });

  bot.on('channel_post', async (ctx, next) => {
    try {
      await rememberKnownChannel(ctx.chat, true);
    } catch (err) {
      console.error('[channel registry] channel_post failed:', err.message);
    }

    return next();
  });
};
