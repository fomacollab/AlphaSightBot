require('dotenv').config({ override: true });
const mongoose = require('mongoose');

/**
 * Connects Mongoose using the same pattern as the existing bot, while allowing
 * a bot-specific `DB_NAME` so this codebase stays isolated from other bots.
 *
 * @returns {Promise<void>}
 */
async function connectDB() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME;

  if (!uri) throw new Error('MONGODB_URI is required');
  if (!dbName) throw new Error('DB_NAME is required');

  await mongoose.connect(uri, {
    dbName,
    autoIndex: true,
  });

  console.log(`[db] connected to ${dbName}`);
}

module.exports = connectDB;
