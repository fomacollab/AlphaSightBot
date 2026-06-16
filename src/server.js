require('dotenv').config({ override: true });
const express = require('express');
const connectDB = require('./db');
const Admin = require('./models/Admin');
const adminCache = require('./cache');
const botState = require('./services/botState');
const bot = require('./bot');
const { getSetting } = require('./services/settingsService');
const { processNudges } = require('./services/nudgeService');
const userKeyboards = require('./keyboards/user');
const { ensureUser } = require('./services/userService');
const { showAdminSection, ADMIN_SECTIONS } = require('./services/adminPanelService');
const { SETTINGS_KEYS } = require('./constants/app');

const PORT = process.env.PORT || 3000;
const SCHEDULE_INTERVAL_MS = 60 * 1000;

process.on('uncaughtException', (err) => console.error('[uncaughtException]', err));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

const app = express();
app.use(express.json());
app.get('/ping', (_req, res) => res.send('hello world'));
app.use((err, _req, res, _next) => {
  console.error('[express error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

async function boot() {
  try {
    await connectDB();

    const admins = await Admin.find().lean();
    adminCache.set(admins);
    console.log(`Admin cache loaded: ${admins.length} admin(s)`);

    const enabled = await getSetting(SETTINGS_KEYS.BOT_ENABLED);
    botState.set(enabled !== false);
    console.log(`Bot state: ${botState.get() ? 'enabled' : 'disabled'}`);

    app.listen(PORT, () => console.log(`HTTP server listening on port ${PORT}`));

    const me = await bot.telegram.getMe();
    console.log(`Bot connected: @${me.username} (ID: ${me.id})`);

    await bot.telegram.setMyCommands([
      { command: 'start', description: 'Open AlphaSight Capital' },
      { command: 'menu', description: 'Show the persistent menu' },
    ]);
    console.log('Bot commands registered.');

    bot.command('menu', async (ctx) => {
      if (ctx.state.isAdmin) {
        const user = await ensureUser(ctx);
        return showAdminSection(ctx, user, user.adminSection || ADMIN_SECTIONS.HOME);
      }
      const user = await ensureUser(ctx);
      return ctx.reply('Main menu', userKeyboards.withMainMenu([], user));
    });

    const runScheduledJobs = async () => {
      try {
        await processNudges(bot, userKeyboards);
      } catch (err) {
        console.error('[schedule] nudge cycle failed:', err);
      }
    };

    runScheduledJobs().catch((err) => console.error('[schedule] boot run failed:', err));
    setInterval(() => runScheduledJobs().catch((err) => console.error('[schedule] periodic run failed:', err)), SCHEDULE_INTERVAL_MS);

    process.once('SIGINT', () => bot.stop('SIGINT'));
    process.once('SIGTERM', () => bot.stop('SIGTERM'));

    bot.launch().catch((err) => {
      if (err?.message !== 'Aborted') console.error('[bot]', err);
    });
  } catch (err) {
    console.error('[boot error]', err.message);
  }
}

boot();
