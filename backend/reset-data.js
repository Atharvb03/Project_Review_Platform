/**
 * reset-data.js
 * Clears ALL data from every collection WITHOUT dropping the collections.
 * Indexes and collection structure are preserved.
 *
 * Usage:
 *   node reset-data.js
 *
 * WARNING: This is irreversible. All documents will be deleted.
 */

require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const DB  = 'project_management';

const COLLECTIONS = [
  'users',
  'projects',
  'assignments',
  'notifications',
  'file_metadata',
  'batches',
  'password_resets',
];

async function resetData() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB\n');

    const db = client.db(DB);

    for (const col of COLLECTIONS) {
      const result = await db.collection(col).deleteMany({});
      console.log(`🗑  ${col.padEnd(20)} — deleted ${result.deletedCount} document(s)`);
    }

    console.log('\n✅ All data cleared. Collections and indexes are intact.');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.close();
  }
}

resetData();
