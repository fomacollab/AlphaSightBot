require('dotenv').config({ override: true });
const connectDB = require('./db');
const Admin = require('./models/Admin');
const { ensureDefaultSettings } = require('./services/settingsService');
const { ensureDefaultTemplates } = require('./services/templateService');
const { ensureAssetDefinitions } = require('./services/archiveService');

const SEED_ADMINS = [
  { telegramId: 1632962204, username: '@endurenow', isSuperAdmin: true },
  { telegramId: null, username: '@charlie', isSuperAdmin: false },
  { telegramId: null, username: '@griffo', isSuperAdmin: false },
];

async function seedAdmins() {
  for (const data of SEED_ADMINS) {
    const query = data.telegramId ? { telegramId: data.telegramId } : { username: data.username };
    const existing = await Admin.findOne(query);
    if (!existing) {
      await Admin.create(data);
      console.log(`[seed] added admin ${data.telegramId ?? data.username}`);
      continue;
    }
    let changed = false;
    if (data.username && existing.username !== data.username) {
      existing.username = data.username;
      changed = true;
    }
    if (data.isSuperAdmin && !existing.isSuperAdmin) {
      existing.isSuperAdmin = true;
      changed = true;
    }
    if (changed) await existing.save();
  }
}

async function seed() {
  await connectDB();
  await seedAdmins();
  if (!process.argv.includes('--admins-only')) {
    await ensureDefaultSettings();
    await ensureDefaultTemplates();
    await ensureAssetDefinitions();
  }
  console.log('[seed] complete');
  process.exit(0);
}

module.exports = { seedAdmins };

if (require.main === module) {
  seed().catch((err) => {
    console.error('[seed] error', err);
    process.exit(1);
  });
}
