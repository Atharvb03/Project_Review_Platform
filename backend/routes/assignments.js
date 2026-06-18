/**
 * routes/assignments.js
 * Handles: create/bulk/list/update assignments, deadlines, final remark
 * Mounted at: /api
 */

const express = require('express');
const router  = express.Router();
const { ObjectId } = require('mongodb');

const { getCollections }         = require('../db');
const { verifyToken, checkRole, requireRole } = require('../middleware/auth');
const { sendEmail, assignmentCreatedMenteeEmail, assignmentCreatedMentorEmail, finalRemarkEmail, deadlineSetEmail, deadlineExtendedEmail, mentorChangedOldMentorEmail, mentorChangedNewMentorEmail, mentorChangedMenteeEmail } = require('../utils/emailService');
const { COLLECTION: FILE_COL }   = require('../models/fileMetadata');
const cache                      = require('../services/cacheService');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

// POST /assignments
router.post('/assignments', verifyToken, checkRole('project_coordinator'), async (req, res) => {
  const { db, usersCollection, projectsCollection } = getCollections();
  const { menteeEmail, mentorEmail, assignedBy } = req.body;
  let { projectName } = req.body;
  const validDurations = ['6_months', '1_year'];
  const duration = validDurations.includes(req.body.duration) ? req.body.duration : '6_months';
  if (!menteeEmail || !mentorEmail || !assignedBy) return res.status(400).json({ success: false, message: 'menteeEmail, mentorEmail and assignedBy are required' });
  try {
    const mentor = await usersCollection.findOne({ email: mentorEmail.toLowerCase(), $or: [{ role: 'mentor' }, { roles: 'mentor' }] });
    const mentee = await usersCollection.findOne({ email: menteeEmail.toLowerCase(), $or: [{ role: 'mentee' }, { roles: 'mentee' }] });
    if (!mentor) return res.status(400).json({ success: false, message: 'Mentor not found or invalid role' });
    if (!mentee) return res.status(400).json({ success: false, message: 'Mentee not found or invalid role' });
    if (!projectName) projectName = mentee.projectName || '';
    if (!projectName) return res.status(400).json({ success: false, message: 'Mentee has no project name set' });

    const activeBatch = await db.collection('batches').findOne({ isActive: true });
    if (!activeBatch) return res.status(400).json({ success: false, message: 'No active academic year found. Please set one first.' });

    const existing = await db.collection('assignments').findOne({ menteeEmail: menteeEmail.toLowerCase(), isArchived: { $ne: true } });
    if (existing) {
      const existingProject = await projectsCollection.findOne({ menteeEmail: menteeEmail.toLowerCase() });
      if (existingProject?.isCompleted || existing.finalRemark)
        return res.status(409).json({ success: false, message: "This mentee's previous project is completed but not archived." });
      await usersCollection.updateOne({ email: menteeEmail.toLowerCase(), projectStatus: { $ne: 'assigned' } }, { $set: { projectStatus: 'assigned' } });
      return res.status(409).json({ success: false, message: 'This mentee already has an active assignment.' });
    }

    const result = await db.collection('assignments').insertOne({ projectName, menteeEmail: menteeEmail.toLowerCase(), mentorEmail: mentorEmail.toLowerCase(), assignedBy: assignedBy.toLowerCase(), duration, isArchived: false, createdAt: new Date(), updatedAt: new Date() });
    await usersCollection.updateOne({ email: menteeEmail.toLowerCase() }, { $set: { projectStatus: 'assigned', projectName } });
    await projectsCollection.updateOne({ menteeEmail: menteeEmail.toLowerCase(), isArchived: { $ne: true } }, { $set: { projectName, mentorEmail: mentorEmail.toLowerCase(), duration, batchId: activeBatch._id, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date(), isArchived: false, menteeEmail: menteeEmail.toLowerCase(), menteeName: mentee.name || menteeEmail } }, { upsert: true });
    await db.collection('notifications').insertOne({ recipientEmail: menteeEmail.toLowerCase(), recipientRole: 'mentee', message: `You have been assigned a mentor: ${mentorEmail}. Your project "${projectName}" is now active.`, read: false, createdAt: new Date() });
    await db.collection('notifications').insertOne({ recipientEmail: mentorEmail.toLowerCase(), recipientRole: 'mentor', message: `Project "${projectName}" by ${menteeEmail} has been assigned to you.`, read: false, createdAt: new Date() });
    res.status(201).json({ success: true, message: 'Assignment created successfully', assignmentId: result.insertedId });
    cache.invalidatePattern('mentees'); // projectStatus changed to 'assigned'
    setImmediate(async () => {
      try {
        await sendEmail({ to: menteeEmail.toLowerCase(), ...assignmentCreatedMenteeEmail({ menteeName: mentee.name || menteeEmail, projectName, mentorEmail }) });
        await sendEmail({ to: mentorEmail.toLowerCase(), ...assignmentCreatedMentorEmail({ mentorName: mentor.name || mentorEmail, projectName, menteeName: mentee.name || menteeEmail, menteeEmail: menteeEmail.toLowerCase() }) });
      } catch (e) { console.error('[Email] assignment trigger:', e.message); }
    });
  } catch (err) {
    console.error('Assignment error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /assignments/bulk-csv
router.post('/assignments/bulk-csv', verifyToken, checkRole('project_coordinator'), async (req, res) => {
  const { db, usersCollection, projectsCollection } = getCollections();
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ success: false, message: 'No rows provided' });
  const assignedBy = req.userEmail;
  const validDurations = ['6_months', '1_year'];
  const results = [];
  for (const row of rows) {
    const menteeEmail = row.menteeEmail?.trim().toLowerCase();
    const mentorEmail = row.mentorEmail?.trim().toLowerCase();
    const duration    = validDurations.includes(row.duration?.trim()) ? row.duration.trim() : '6_months';
    if (!menteeEmail || !mentorEmail) { results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: 'Missing email' }); continue; }
    try {
      const mentor = await usersCollection.findOne({ email: mentorEmail, $or: [{ role: 'mentor' }, { roles: 'mentor' }] });
      const mentee = await usersCollection.findOne({ email: menteeEmail, $or: [{ role: 'mentee' }, { roles: 'mentee' }] });
      if (!mentor) { results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: 'Mentor not found' }); continue; }
      if (!mentee) { results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: 'Mentee not found' }); continue; }
      const projectName = mentee.projectName || '';
      if (!projectName) { results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: 'Mentee has no project name set' }); continue; }
      const existing = await db.collection('assignments').findOne({ menteeEmail, isArchived: { $ne: true } });
      if (existing) { results.push({ menteeEmail, mentorEmail, duration, status: 'skipped', reason: 'Already assigned' }); continue; }
      if (mentee.projectStatus === 'rejected') { results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: 'Project was rejected — approve it first' }); continue; }
      await db.collection('assignments').insertOne({ projectName, menteeEmail, mentorEmail, assignedBy, duration, isArchived: false, createdAt: new Date(), updatedAt: new Date() });
      const activeBatch = await db.collection('batches').findOne({ isActive: true });
      if (!activeBatch) { results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: 'No active academic year found' }); continue; }
      await projectsCollection.updateOne({ menteeEmail, isArchived: { $ne: true } }, { $set: { projectName, mentorEmail, duration, batchId: activeBatch._id, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date(), isArchived: false, menteeEmail, menteeName: mentee.name || menteeEmail } }, { upsert: true });
      await usersCollection.updateOne({ email: menteeEmail }, { $set: { projectStatus: 'assigned', projectName } });
      await db.collection('notifications').insertOne({ recipientEmail: menteeEmail, recipientRole: 'mentee', message: `You have been assigned a mentor: ${mentorEmail}. Your project "${projectName}" is now active.`, read: false, createdAt: new Date() });
      await db.collection('notifications').insertOne({ recipientEmail: mentorEmail, recipientRole: 'mentor', message: `Project "${projectName}" by ${menteeEmail} has been assigned to you.`, read: false, createdAt: new Date() });
      results.push({ menteeEmail, mentorEmail, projectName, duration, status: 'success' });
    } catch (err) { results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: err.message }); }
  }
  const succeeded = results.filter(r => r.status === 'success').length;
  const failed    = results.filter(r => r.status === 'error').length;
  const skipped   = results.filter(r => r.status === 'skipped').length;
  res.json({ success: true, message: `${succeeded} assigned, ${skipped} skipped, ${failed} failed`, results });
});

// GET /assignments — paginated, filtered by active batch
router.get('/assignments', verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
  const { db } = getCollections();
  const { page, limit, skip } = parsePagination(req.query);
  try {
    const activeBatch = await db.collection('batches').findOne({ isActive: true });
    // Build filter: if active batch exists, filter by batchId; otherwise return all
    const filter = activeBatch
      ? { $or: [{ batchId: activeBatch._id }, { batchId: null }, { batchId: { $exists: false } }] }
      : {};
    const [assignments, totalRecords] = await Promise.all([
      db.collection('assignments').find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).toArray(),
      db.collection('assignments').countDocuments(filter),
    ]);
    res.json(paginatedResponse(assignments, totalRecords, page, limit));
  } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch assignments' }); }
});

// GET /assignments/mentee/:email
router.get('/assignments/mentee/:email', verifyToken, checkRole('mentee', 'project_coordinator', 'hod'), async (req, res) => {
  const { db } = getCollections();
  try {
    const assignment = await db.collection('assignments').findOne({ menteeEmail: req.params.email.toLowerCase(), isArchived: { $ne: true } });
    if (!assignment) return res.status(404).json({ success: false, message: 'No assignment found' });
    res.json({ success: true, data: assignment });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /assignments/mentor/:email
router.get('/assignments/mentor/:email', verifyToken, checkRole('mentor', 'project_coordinator', 'hod'), async (req, res) => {
  const { db, usersCollection, projectsCollection } = getCollections();
  try {
    const activeBatch = await db.collection('batches').findOne({ isActive: true });
    if (!activeBatch) return res.json({ success: true, data: [] });
    const assignments = await db.collection('assignments').find({ mentorEmail: req.params.email.toLowerCase() }).sort({ isArchived: 1, updatedAt: -1 }).toArray();
    const menteeEmails = [...new Set(assignments.map(a => a.menteeEmail).filter(Boolean))];
    const [menteeDocs, projectDocs] = await Promise.all([
      usersCollection.find({ email: { $in: menteeEmails } }).toArray(),
      projectsCollection.find({ menteeEmail: { $in: menteeEmails } }).toArray(),
    ]);
    const menteeMap = Object.fromEntries(menteeDocs.map(u => [u.email, u]));
    const enriched = assignments.map(a => {
      const mentee  = menteeMap[a.menteeEmail];
      const project = a.isArchived ? projectDocs.find(p => p.menteeEmail === a.menteeEmail && p.projectName === a.projectName && p.isArchived) : projectDocs.find(p => p.menteeEmail === a.menteeEmail && !p.isArchived);
      return { ...a, duration: project?.duration || a.duration || '6_months', groupMembers: mentee?.groupMembers || [], menteeName: mentee?.name || '', batchId: project?.batchId || a.batchId || null };
    });
    const filtered = enriched.filter(a => !a.batchId || a.batchId.toString() === activeBatch._id.toString());
    res.json({ success: true, data: filtered });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// PATCH /assignments/:id/final-remark
router.patch('/assignments/:id/final-remark', requireRole('mentor'), async (req, res) => {
  const { db, usersCollection, projectsCollection } = getCollections();
  const { finalRemark } = req.body;
  if (!finalRemark?.trim()) return res.status(400).json({ success: false, message: 'finalRemark is required' });
  try {
    const assignment = await db.collection('assignments').findOne({ _id: new ObjectId(req.params.id) });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    if (assignment.mentorEmail !== req.userEmail) return res.status(403).json({ success: false, message: 'You are not the assigned mentor' });
    const files = await db.collection(FILE_COL).find({ uploaded_by: assignment.menteeEmail, isArchived: { $ne: true } }).toArray();
    const allRemarked = files.length > 0 && files.every(f => f.remark && f.remark !== 'Pending Review');
    if (!allRemarked) return res.status(400).json({ success: false, message: 'All uploaded files must be reviewed before marking as done' });
    await db.collection('assignments').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { finalRemark: finalRemark.trim(), finalRemarkedAt: new Date(), updatedAt: new Date(), isArchived: true, archivedAt: new Date(), archivedProjectName: assignment.projectName } });
    await projectsCollection.updateOne({ menteeEmail: assignment.menteeEmail, isArchived: { $ne: true } }, { $set: { isCompleted: true, completedAt: new Date(), isArchived: true, archivedAt: new Date() } });
    await db.collection(FILE_COL).updateMany({ uploaded_by: assignment.menteeEmail, isArchived: { $ne: true } }, { $set: { isArchived: true, archivedAt: new Date(), archivedProjectName: assignment.projectName } });
    await usersCollection.updateOne({ email: assignment.menteeEmail }, { $set: { projectCompleted: true, projectStatus: 'pending', projectName: '' } });
    cache.invalidatePattern('mentees'); // projectStatus reset to 'pending'
    res.json({ success: true, message: 'Final remark saved' });
    setImmediate(async () => {
      try {
        const mentee = await usersCollection.findOne({ email: assignment.menteeEmail });
        await db.collection('notifications').insertOne({ recipientEmail: assignment.menteeEmail, recipientRole: 'mentee', message: `Your project "${assignment.projectName}" has received a final evaluation: ${finalRemark.trim()}`, read: false, createdAt: new Date() });
        if (mentee?.email) await sendEmail({ to: mentee.email, ...finalRemarkEmail({ menteeName: mentee.name || assignment.menteeEmail, projectName: assignment.projectName || 'Your Project', finalRemark: finalRemark.trim() }) });
      } catch (e) { console.error('[Email] final-remark trigger:', e.message); }
    });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// PATCH /assignments/:id/deadline (coordinator)
router.patch('/assignments/:id/deadline', verifyToken, checkRole('project_coordinator'), async (req, res) => {
  const { db } = getCollections();
  const { deadline } = req.body;
  if (!deadline) return res.status(400).json({ success: false, message: 'deadline is required' });
  const parsed = new Date(deadline);
  if (isNaN(parsed)) return res.status(400).json({ success: false, message: 'Invalid date format' });
  try {
    const result = await db.collection('assignments').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { deadline: parsed, updatedAt: new Date() } });
    if (result.matchedCount === 0) return res.status(404).json({ success: false, message: 'Assignment not found' });
    res.json({ success: true, message: 'Deadline set successfully' });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// PUT /assignments/:id/set-deadline (mentor)
router.put('/assignments/:id/set-deadline', requireRole('mentor'), async (req, res) => {
  const { db, usersCollection } = getCollections();
  const { deadline } = req.body;
  if (!deadline) return res.status(400).json({ success: false, message: 'deadline is required' });
  const parsed = new Date(deadline);
  if (isNaN(parsed)) return res.status(400).json({ success: false, message: 'Invalid date format' });
  try {
    const assignment = await db.collection('assignments').findOne({ _id: new ObjectId(req.params.id) });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    if (assignment.mentorEmail !== req.userEmail) return res.status(403).json({ success: false, message: 'Only the assigned mentor can set the deadline' });
    if (assignment.deadline) return res.status(400).json({ success: false, message: 'Deadline already set. Use extend-deadline to give more time.' });
    await db.collection('assignments').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { deadline: parsed, updatedAt: new Date() } });
    await db.collection('notifications').insertOne({ recipientEmail: assignment.menteeEmail, recipientRole: 'mentee', message: `Your mentor has set a submission deadline: ${parsed.toLocaleString()}.`, read: false, createdAt: new Date() });
    res.json({ success: true, message: 'Deadline set successfully' });
    setImmediate(async () => {
      try {
        const mentee = await usersCollection.findOne({ email: assignment.menteeEmail });
        if (mentee?.email) await sendEmail({ to: mentee.email, ...deadlineSetEmail({ menteeName: mentee.name || assignment.menteeEmail, projectName: assignment.projectName || 'Your Project', deadline: parsed }) });
      } catch (e) { console.error('[Email] set-deadline trigger:', e.message); }
    });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// PUT /assignments/:id/extend-deadline (mentor)
router.put('/assignments/:id/extend-deadline', requireRole('mentor'), async (req, res) => {
  const { db, usersCollection } = getCollections();
  const { extendedDeadline } = req.body;
  if (!extendedDeadline) return res.status(400).json({ success: false, message: 'extendedDeadline is required' });
  const parsed = new Date(extendedDeadline);
  if (isNaN(parsed)) return res.status(400).json({ success: false, message: 'Invalid date format' });
  try {
    const assignment = await db.collection('assignments').findOne({ _id: new ObjectId(req.params.id) });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    if (assignment.mentorEmail !== req.userEmail) return res.status(403).json({ success: false, message: 'Only the assigned mentor can extend the deadline' });
    if (!assignment.deadline) return res.status(400).json({ success: false, message: 'Set an original deadline before extending' });
    if (assignment.extendedDeadline) return res.status(400).json({ success: false, message: 'Deadline has already been extended once.' });
    if (parsed <= new Date(assignment.deadline)) return res.status(400).json({ success: false, message: 'Extended deadline must be after the original deadline' });
    await db.collection('assignments').updateOne({ _id: new ObjectId(req.params.id) }, { $set: { extendedDeadline: parsed, updatedAt: new Date() } });
    await db.collection('notifications').insertOne({ recipientEmail: assignment.menteeEmail, recipientRole: 'mentee', message: `Your mentor has extended the deadline to: ${parsed.toLocaleString()}.`, read: false, createdAt: new Date() });
    res.json({ success: true, message: 'Deadline extended successfully' });
    setImmediate(async () => {
      try {
        const mentee = await usersCollection.findOne({ email: assignment.menteeEmail });
        if (mentee?.email) await sendEmail({ to: mentee.email, ...deadlineExtendedEmail({ menteeName: mentee.name || assignment.menteeEmail, projectName: assignment.projectName || 'Your Project', oldDeadline: assignment.deadline, newDeadline: parsed }) });
      } catch (e) { console.error('[Email] extend-deadline trigger:', e.message); }
    });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// PUT /assignments/:id (coordinator update)
router.put('/assignments/:id', verifyToken, checkRole('project_coordinator'), async (req, res) => {
  const { db, usersCollection, projectsCollection } = getCollections();
  const { projectName, mentorEmail } = req.body;
  const validDurations = ['6_months', '1_year'];
  const duration = validDurations.includes(req.body.duration) ? req.body.duration : null;
  if (!projectName && !mentorEmail && !duration) return res.status(400).json({ success: false, message: 'Provide at least one field to update' });
  try {
    let updateFields = { updatedAt: new Date() };
    if (projectName) updateFields.projectName = projectName;
    if (duration) updateFields.duration = duration;
    if (mentorEmail) {
      const mentor = await usersCollection.findOne({ email: mentorEmail.toLowerCase(), $or: [{ role: 'mentor' }, { roles: 'mentor' }] });
      if (!mentor) return res.status(400).json({ success: false, message: 'Mentor not found or invalid role' });
      updateFields.mentorEmail = mentorEmail.toLowerCase();
    }
    const oldAssignment = await db.collection('assignments').findOne({ _id: new ObjectId(req.params.id) });
    if (!oldAssignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    if (duration === '1_year') {
      const activeBatch = await db.collection('batches').findOne({ isActive: true });
      if (activeBatch) {
        const archivedInBatch = await projectsCollection.findOne({ menteeEmail: oldAssignment.menteeEmail, isArchived: true, batchId: activeBatch._id });
        if (archivedInBatch) return res.status(400).json({ success: false, message: 'Cannot change to 1-year — this is the 2nd project in the same academic year.' });
      }
    }
    const result = await db.collection('assignments').updateOne({ _id: new ObjectId(req.params.id) }, { $set: updateFields });
    if (result.matchedCount === 0) return res.status(404).json({ success: false, message: 'Assignment not found' });
    if (projectName || duration) {
      const userUpdateFields = {};
      if (projectName) userUpdateFields.projectName = projectName;
      if (duration) userUpdateFields.projectDuration = duration;
      await usersCollection.updateOne({ email: oldAssignment.menteeEmail }, { $set: userUpdateFields });
    }
    if (duration || projectName) {
      const projectUpdateFields = { updatedAt: new Date() };
      if (duration) projectUpdateFields.duration = duration;
      if (projectName) projectUpdateFields.projectName = projectName;
      await projectsCollection.updateOne({ menteeEmail: oldAssignment.menteeEmail, isArchived: { $ne: true } }, { $set: projectUpdateFields, $setOnInsert: { menteeEmail: oldAssignment.menteeEmail, createdAt: new Date(), isArchived: false } }, { upsert: true });
    }
    res.json({ success: true, message: 'Assignment updated successfully' });
    setImmediate(async () => {
      try {
        const mentee = await usersCollection.findOne({ email: oldAssignment.menteeEmail });
        const menteeName = mentee?.name || oldAssignment.menteeEmail;
        const oldProjectName = oldAssignment.projectName || 'Project';
        const newProjectName = projectName || oldProjectName;
        if (projectName && projectName !== oldAssignment.projectName) await db.collection('notifications').insertOne({ recipientEmail: oldAssignment.menteeEmail, recipientRole: 'mentee', message: `Your project name has been updated from "${oldProjectName}" to "${projectName}".`, read: false, createdAt: new Date() });
        if (duration && duration !== oldAssignment.duration) await db.collection('notifications').insertOne({ recipientEmail: oldAssignment.menteeEmail, recipientRole: 'mentee', message: `Your project duration has been updated to ${duration === '1_year' ? '1 Year' : '6 Months'}.`, read: false, createdAt: new Date() });
        if (mentorEmail && oldAssignment.mentorEmail !== mentorEmail.toLowerCase()) {
          const oldMentor = await usersCollection.findOne({ email: oldAssignment.mentorEmail });
          const newMentor = await usersCollection.findOne({ email: mentorEmail.toLowerCase() });
          await sendEmail({ to: oldAssignment.mentorEmail, ...mentorChangedOldMentorEmail({ oldMentorName: oldMentor?.name || oldAssignment.mentorEmail, projectName: newProjectName, menteeName, newMentorEmail: mentorEmail.toLowerCase() }) });
          await sendEmail({ to: mentorEmail.toLowerCase(), ...mentorChangedNewMentorEmail({ newMentorName: newMentor?.name || mentorEmail, projectName: newProjectName, menteeName, menteeEmail: oldAssignment.menteeEmail, oldMentorEmail: oldAssignment.mentorEmail }) });
          if (mentee?.email) await sendEmail({ to: mentee.email, ...mentorChangedMenteeEmail({ menteeName, projectName: newProjectName, oldMentorEmail: oldAssignment.mentorEmail, newMentorEmail: mentorEmail.toLowerCase() }) });
          await db.collection('notifications').insertOne({ recipientEmail: oldAssignment.menteeEmail, recipientRole: 'mentee', message: `Your mentor has been changed to ${mentorEmail.toLowerCase()} for project "${newProjectName}".`, read: false, createdAt: new Date() });
        }
      } catch (e) { console.error('[Notification] assignment update trigger:', e.message); }
    });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = router;
