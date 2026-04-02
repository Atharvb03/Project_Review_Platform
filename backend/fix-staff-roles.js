/**
 * Remove 'mentee' from staff users' roles array
 * Staff = mentor, hod, project_coordinator
 * A staff user should NEVER have 'mentee' in their roles
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URI);

async function fixStaffRoles() {
  await client.connect();
  const db = client.db('project_management');
  const users = db.collection('users');

  // Find staff users who incorrectly have 'mentee' in their roles
  const staffWithMentee = await users.find({
    role: { $in: ['mentor', 'hod', 'project_coordinator'] },
    roles: 'mentee'
  }).toArray();

  console.log(`Found ${staffWithMentee.length} staff users with 'mentee' in roles\n`);

  for (const user of staffWithMentee) {
    await users.updateOne(
      { _id: user._id },
      { $pull: { roles: 'mentee' } }
    );
    console.log(`Fixed: ${user.email} | role: ${user.role} | removed 'mentee' from roles`);
  }

  // Show final state
  console.log('\nFinal state of all users:');
  const allUsers = await users.find({}).toArray();
  allUsers.forEach(u => {
    console.log(`  ${u.email} | role: ${u.role} | roles: [${(u.roles || []).join(', ')}]`);
  });

  console.log('\n✅ Done');
  await client.close();
}

fixStaffRoles().catch(console.error);
