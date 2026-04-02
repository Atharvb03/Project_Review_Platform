/**
 * Fix users who have roles array out of sync with role field
 * Run once to repair existing data
 */
require('dotenv').config();
const { MongoClient } = require('mongodb');

const client = new MongoClient(process.env.MONGO_URI);

async function fixRoles() {
  await client.connect();
  const db = client.db('project_management');
  const users = db.collection('users');

  const allUsers = await users.find({}).toArray();
  console.log(`Total users: ${allUsers.length}\n`);

  for (const user of allUsers) {
    const roleField = user.role;
    const rolesArray = user.roles || [];

    // Ensure roles array contains the role field value
    if (roleField && !rolesArray.includes(roleField)) {
      await users.updateOne(
        { _id: user._id },
        { $addToSet: { roles: roleField } }
      );
      console.log(`Fixed: ${user.email} — added '${roleField}' to roles array`);
    }

    // Ensure roles array is not empty
    if (!rolesArray.length && roleField) {
      await users.updateOne(
        { _id: user._id },
        { $set: { roles: [roleField] } }
      );
      console.log(`Fixed: ${user.email} — initialized roles array with '${roleField}'`);
    }

    console.log(`OK: ${user.email} | role: ${user.role} | roles: [${(user.roles || []).join(', ')}]`);
  }

  console.log('\n✅ Done');
  await client.close();
}

fixRoles().catch(console.error);
