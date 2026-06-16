require('dotenv').config({ override: true });
const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME || 'client_rex_alphasight_capital';

  if (!uri) throw new Error('MONGODB_URI is required');

  let attempt = 0;
  while (true) {
    attempt++;
    try {
      await mongoose.connect(uri, {
        dbName,
        autoIndex: true,
      });
      console.log(`[db] connected to ${mongoose.connection.db.databaseName}`);
      return;
    } catch (err) {
      const delay = Math.min(5000 * attempt, 30000);
      console.error(
        `[db] Connection failed (attempt ${attempt}), retrying in ${delay / 1000}s: ${err.message}`
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

module.exports = connectDB;
