require('dotenv').config();
const { Telegraf, session } = require('telegraf');
const authMiddleware = require('./middleware/auth');
const maintenanceMiddleware = require('./middleware/maintenance');

const startHandler = require('./handlers/start');
const adminHandlers = require('./handlers/admin');
const channelRegistryHandler = require('./handlers/channelRegistry');
const userHandlers = require('./handlers/user');

const bot = new Telegraf(process.env.BOT_TOKEN);

bot.use(session({
  defaultSession: () => ({
    adminDraft: null,
  }),
}));
bot.use(authMiddleware);
bot.use(maintenanceMiddleware);

startHandler(bot);
adminHandlers(bot);
channelRegistryHandler(bot);
userHandlers(bot);

bot.catch((err, ctx) => {
  console.error(`[bot error] update type: ${ctx.updateType}`, err);
  if (ctx.message?.chat?.id) {
    ctx.reply('An error occurred. Please try again.').catch(() => {});
  }
});

module.exports = bot;
