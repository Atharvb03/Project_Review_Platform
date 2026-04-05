/**
 * Database indexes for performance optimization
 * Creates indexes on frequently queried fields
 */
async function createIndexes(db) {
  try {
    console.log('📊 Creating database indexes...');

    // Users collection indexes
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ role: 1 });
    await db.collection('users').createIndex({ projectStatus: 1 });

    // Assignments collection indexes
    await db.collection('assignments').createIndex({ menteeEmail: 1, isArchived: 1 });
    await db.collection('assignments').createIndex({ mentorEmail: 1, isArchived: 1 });
    await db.collection('assignments').createIndex({ isArchived: 1 });
    await db.collection('assignments').createIndex({ finalRemark: 1 });

    // Projects collection indexes
    await db.collection('projects').createIndex({ menteeEmail: 1, isArchived: 1 });
    await db.collection('projects').createIndex({ menteeEmail: 1, projectName: 1, isArchived: 1 }); // for archived lookup by name
    await db.collection('projects').createIndex({ batchId: 1 });
    await db.collection('projects').createIndex({ isArchived: 1 });

    // Files collection indexes
    await db.collection('file_metadata').createIndex({ uploaded_by: 1, isArchived: 1 });
    await db.collection('file_metadata').createIndex({ uploaded_by: 1, section: 1, isArchived: 1 });
    await db.collection('file_metadata').createIndex({ project_id: 1 });
    await db.collection('file_metadata').createIndex({ isArchived: 1 });

    // Batches collection indexes
    await db.collection('batches').createIndex({ name: 1 }, { unique: true });
    await db.collection('batches').createIndex({ isActive: 1 });

    // Notifications collection indexes
    await db.collection('notifications').createIndex({ recipientEmail: 1, read: 1 });
    await db.collection('notifications').createIndex({ createdAt: -1 });

    console.log('✅ Database indexes created successfully');
  } catch (err) {
    console.error('❌ Error creating indexes:', err.message);
    // Don't throw - indexes are optimization, not critical
  }
}

module.exports = { createIndexes };
