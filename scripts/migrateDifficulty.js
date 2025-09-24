// scripts/migrateDifficulty.js
require('dotenv').config();
const mongoose = require('mongoose');
const QA       = require('../models/QA');

async function backfill() {
  await mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser:    true,
    useUnifiedTopology: true
  });

  const res = await QA.updateMany(
    { difficulty: { $exists: false } },        // only docs missing the field
    { $set: { difficulty: 'medium' } }          // default to "medium"
  );

  console.log(`🎯 Backfilled difficulty on ${res.modifiedCount} docs.`);
  await mongoose.disconnect();
}

backfill().catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
