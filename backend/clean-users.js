require('dotenv').config();
const { MongoClient } = require('mongodb');

const KEEP_EMAILS = [
  'hod@gmail.com',
  'projectco@gmail.com',
  'mentor1@gmail.com'
];

async function run() {
  const client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  const db = client.db('project_management');

  // Delete all users except the 3 specified emails
  const result = await db.collection('users').deleteMany({
    email: { $nin: KEEP_EMAILS }
  });
  console.log(`✅ Deleted ${result.deletedCount} users`);

  // Show remaining
  const remaining = await db.collection('users').find({}, { projection: { email: 1, role: 1, roles: 1, _id: 0 } }).toArray();
  console.log('\nRemaining users:');
  remaining.forEach(u => console.log(`  ${u.email} | role: ${u.role} | roles: [${(u.roles||[]).join(', ')}]`));

  await client.close();
}

run().catch(console.error);
