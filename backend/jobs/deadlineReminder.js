/**
 * Deadline Reminder Cron Job
 * Runs daily at 8:00 AM.
 * Finds assignments whose deadline is within the next 2 days,
 * checks which phases the mentee hasn't uploaded yet,
 * and sends a reminder email if any are missing.
 */
const cron = require('node-cron');
const { sendEmail, deadlineReminderEmail } = require('../utils/emailService');
const { getAllowedPhases, PHASE_CONFIG } = require('../constants/phases');

let _db, _usersCollection;

function initDeadlineReminder(db, usersCollection) {
  _db = db;
  _usersCollection = usersCollection;

  // Run every day at 8:00 AM
  cron.schedule('0 8 * * *', runReminders, { timezone: 'Asia/Kolkata' });
  console.log('[Cron] Deadline reminder job scheduled — runs daily at 08:00 IST');
}

async function runReminders() {
  if (!_db) return;
  console.log('[Cron] Running deadline reminder check...');

  try {
    const now      = new Date();
    const in2Days  = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    // Find assignments with a deadline in the next 2 days that haven't been finalised
    const assignments = await _db.collection('assignments').find({
      $or: [
        { deadline:         { $gte: now, $lte: in2Days } },
        { extendedDeadline: { $gte: now, $lte: in2Days } },
      ],
      finalRemark: { $exists: false },
    }).toArray();

    console.log(`[Cron] Found ${assignments.length} assignment(s) with upcoming deadlines`);

    for (const a of assignments) {
      try {
        const mentee = await _usersCollection.findOne({ email: a.menteeEmail });
        if (!mentee?.email) continue;

        // Get uploaded phases for this mentee
        const files = await _db.collection('file_metadata').find({ uploaded_by: a.menteeEmail }).toArray();
        const uploadedSections = new Set(files.map(f => f.section));

        // Get allowed phases for this project's duration
        const allowedPhases = getAllowedPhases(a.duration || '6_months');
        const missingPhases = allowedPhases
          .filter(key => !uploadedSections.has(key))
          .map(key => PHASE_CONFIG[key]?.label || key);

        if (missingPhases.length === 0) continue; // all phases uploaded — no reminder needed

        const effectiveDeadline = a.extendedDeadline || a.deadline;

        const tpl = deadlineReminderEmail({
          menteeName:    mentee.name || a.menteeEmail,
          projectName:   a.projectName || 'Your Project',
          deadline:      effectiveDeadline,
          missingPhases,
        });

        await sendEmail({ to: mentee.email, ...tpl });

        // In-app notification
        await _db.collection('notifications').insertOne({
          recipientEmail: a.menteeEmail,
          recipientRole:  'mentee',
          message: `⚠️ Deadline reminder: ${missingPhases.length} phase(s) still pending for "${a.projectName}". Deadline: ${new Date(effectiveDeadline).toLocaleString()}.`,
          read:      false,
          createdAt: new Date(),
        });

        console.log(`[Cron] Reminder sent to ${mentee.email} — ${missingPhases.length} missing phase(s)`);
      } catch (err) {
        console.error('[Cron] Error processing assignment', a._id, ':', err.message);
      }
    }
  } catch (err) {
    console.error('[Cron] Deadline reminder job failed:', err.message);
  }
}

module.exports = { initDeadlineReminder };
