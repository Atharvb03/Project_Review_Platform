/**
 * routes/coordinator.js
 * Handles: mentors/mentees lists, user delete, project approval, projects, HOD views, S3 URLs
 * Mounted at: /api
 */

const express = require('express');
const router  = express.Router();

const { getCollections }         = require('../db');
const { s3, extractS3Key }       = require('../s3');
const { verifyToken, checkRole } = require('../middleware/auth');
const { getUploadUrl, getDownloadUrl } = require('../controllers/s3Controller');
const { sendEmail }              = require('../utils/emailService');
const { COLLECTION: FILE_COL }   = require('../models/fileMetadata');
const cache                      = require('../services/cacheService');
const { parsePagination, paginatedResponse } = require('../utils/pagination');

// GET /public/stats — no auth required, for homepage display
router.get('/public/stats', async (req, res) => {
  const { db, usersCollection } = getCollections();
  try {
    const [mentees, mentors, completedProjects, filesSubmitted] = await Promise.all([
      usersCollection.countDocuments({ $or: [{ role: 'mentee' }, { roles: 'mentee' }] }),
      usersCollection.countDocuments({ $or: [{ role: 'mentor' }, { roles: 'mentor' }] }),
      db.collection('assignments').countDocuments({ finalRemark: { $exists: true, $ne: null, $ne: '' } }),
      db.collection('file_metadata').countDocuments({}),
    ]);
    res.json({ success: true, data: { mentees, mentors, completedProjects, filesSubmitted } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

// GET /mentors
router.get('/mentors', verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
  const { usersCollection } = getCollections();
  try {
    const mentors = await usersCollection.find({ $or: [{ role: 'mentor' }, { roles: 'mentor' }] }).toArray();
    res.json({ success: true, data: mentors });
  } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch mentors' }); }
});

// GET /mentees — paginated + cached, filtered by active batch
router.get('/mentees', verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
  const { db, usersCollection, projectsCollection } = getCollections();
  const { page, limit, skip } = parsePagination(req.query);

  try {
    const activeBatch = await db.collection('batches').findOne({ isActive: true });
    const batchKey = activeBatch?._id?.toString() || 'no-batch';
    const cacheKey = `mentees:${batchKey}:${page}:${limit}`;

    const cached = cache.get(cacheKey);
    if (cached) return res.json({ ...cached, fromCache: true });

    // Only show mentees who have a project in the current active batch
    let emailFilter = null;
    if (activeBatch) {
      const projectsInBatch = await projectsCollection
        .find({ batchId: activeBatch._id }, { projection: { menteeEmail: 1 } })
        .toArray();
      emailFilter = [...new Set(projectsInBatch.map(p => p.menteeEmail).filter(Boolean))];
    }

    const filter = emailFilter !== null
      ? { $or: [{ role: 'mentee' }, { roles: 'mentee' }], email: { $in: emailFilter } }
      : { $or: [{ role: 'mentee' }, { roles: 'mentee' }] };

    const projection = { email: 1, name: 1, rollNo: 1, contactNo: 1, projectName: 1, projectDuration: 1, projectStatus: 1, groupMembers: 1 };

    const [mentees, totalRecords] = await Promise.all([
      usersCollection.find(filter).project(projection).skip(skip).limit(limit).toArray(),
      usersCollection.countDocuments(filter),
    ]);

    const response = paginatedResponse(mentees, totalRecords, page, limit);
    cache.set(cacheKey, response, 60);
    res.json(response);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch mentees' });
  }
});

// DELETE /users/:email — cascade delete
router.delete('/users/:email', verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
  const { db, usersCollection, projectsCollection } = getCollections();
  const email = req.params.email.toLowerCase();
  try {
    const user = await usersCollection.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    await Promise.all([
      usersCollection.deleteOne({ email }),
      db.collection('assignments').deleteMany({ $or: [{ menteeEmail: email }, { mentorEmail: email }] }),
      projectsCollection.deleteMany({ menteeEmail: email }),
      db.collection('notifications').deleteMany({ recipientEmail: email }),
      db.collection('file_metadata').deleteMany({ uploaded_by: email }),
    ]);
    cache.invalidatePattern('mentees'); // mentee removed — clear all mentee pages
    res.json({ success: true, message: `User ${email} and all related data removed successfully` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to remove user' });
  }
});

// PATCH /coordinator/project-status
router.patch('/coordinator/project-status', verifyToken, checkRole('project_coordinator'), async (req, res) => {
  const { db, usersCollection } = getCollections();
  const { menteeEmail, status } = req.body;
  if (!menteeEmail || !['approved', 'rejected'].includes(status))
    return res.status(400).json({ success: false, message: 'menteeEmail and valid status required' });
  try {
    const mentee = await usersCollection.findOne({ email: menteeEmail.toLowerCase(), $or: [{ role: 'mentee' }, { roles: 'mentee' }] });
    if (!mentee) return res.status(404).json({ success: false, message: 'Mentee not found' });
    await usersCollection.updateOne({ email: menteeEmail.toLowerCase() }, { $set: { projectStatus: status } });
    await db.collection('notifications').insertOne({ recipientEmail: menteeEmail.toLowerCase(), recipientRole: 'mentee', message: status === 'approved' ? `Your project "${mentee.projectName}" has been approved.` : `Your project "${mentee.projectName}" has been rejected.`, read: false, createdAt: new Date() });
    cache.invalidatePattern('mentees'); // projectStatus changed — stale cache
    res.json({ success: true, message: `Project ${status}` });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /projects
router.get('/projects', verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
  const { projectsCollection } = getCollections();
  try {
    const projects = await projectsCollection.find({}).toArray();
    res.json({ success: true, data: projects });
  } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch projects' }); }
});

// GET /mentor-projects
router.get('/mentor-projects', verifyToken, checkRole('mentor'), async (req, res) => {
  const { projectsCollection } = getCollections();
  const { mentorEmail } = req.query;
  if (!mentorEmail) return res.status(400).json({ success: false, message: 'Mentor email is required' });
  try {
    const projects = await projectsCollection.find({ mentorEmail }).toArray();
    res.json({ success: true, data: projects });
  } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch mentor projects' }); }
});

// GET /hod/project-details — active batch projects + all archived projects from all years
router.get('/hod/project-details', verifyToken, checkRole('hod', 'project_coordinator'), async (req, res) => {
  const { db, usersCollection, projectsCollection } = getCollections();
  try {
    const activeBatch = await db.collection('batches').findOne({ isActive: true });

    // Active batch assignments (current year) + ALL archived assignments (all years)
    const activeFilter   = activeBatch
      ? { isArchived: { $ne: true }, $or: [{ batchId: activeBatch._id }, { batchId: null }, { batchId: { $exists: false } }] }
      : { isArchived: { $ne: true } };
    const archivedFilter = { isArchived: true }; // all years

    const [activeAssignments, archivedAssignments] = await Promise.all([
      db.collection('assignments').find(activeFilter).toArray(),
      db.collection('assignments').find(archivedFilter).toArray(),
    ]);
    const assignments = [...activeAssignments, ...archivedAssignments];
    const mentorEmails = [...new Set(assignments.map(a => a.mentorEmail).filter(Boolean))];
    const menteeEmails = [...new Set(assignments.map(a => a.menteeEmail).filter(Boolean))];
    const [mentorDocs, menteeDocs, projectDocs] = await Promise.all([
      usersCollection.find({ email: { $in: mentorEmails } }).toArray(),
      usersCollection.find({ email: { $in: menteeEmails } }).toArray(),
      projectsCollection.find({ menteeEmail: { $in: menteeEmails } }).toArray(),
    ]);
    const mentorMap = Object.fromEntries(mentorDocs.map(u => [u.email, u]));
    const menteeMap = Object.fromEntries(menteeDocs.map(u => [u.email, u]));
    const detailed = assignments.map(a => {
      const mentor  = mentorMap[a.mentorEmail];
      const mentee  = menteeMap[a.menteeEmail];
      const project = a.isArchived
        ? projectDocs.find(p => p.menteeEmail === a.menteeEmail && p.projectName === a.projectName && p.isArchived)
        : projectDocs.find(p => p.menteeEmail === a.menteeEmail && !p.isArchived);
      return { _id: a._id, projectName: a.projectName, duration: project?.duration || a.duration || '6_months', batchId: project?.batchId || a.batchId || null, isArchived: a.isArchived || false, mentor: mentor ? { email: mentor.email, name: mentor.name || '' } : { email: a.mentorEmail, name: '' }, mentee: mentee ? { email: mentee.email, name: mentee.name || '', rollNo: mentee.rollNo || '', contactNo: mentee.contactNo || '' } : { email: a.menteeEmail, name: '', rollNo: '', contactNo: '' }, groupMembers: mentee?.groupMembers || [], assignedBy: a.assignedBy, createdAt: a.createdAt, updatedAt: a.updatedAt, finalRemark: a.finalRemark || null, finalRemarkedAt: a.finalRemarkedAt || null };
    });
    res.json({ success: true, data: detailed });
  } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch HOD project details' }); }
});

// POST /hod/presigned-url
router.post('/hod/presigned-url', verifyToken, checkRole('hod', 'project_coordinator'), async (req, res) => {
  const { fileUrl } = req.body;
  if (!fileUrl) return res.status(400).json({ success: false, message: 'fileUrl is required' });
  try {
    const key = extractS3Key(fileUrl);
    const signedUrl = s3.getSignedUrl('getObject', { Bucket: process.env.S3_BUCKET_NAME, Key: key, Expires: 300 });
    res.json({ success: true, url: signedUrl });
  } catch (err) { res.status(500).json({ success: false, message: 'Failed to generate pre-signed URL' }); }
});

// GET /hod/stats — filtered by active batch
router.get('/hod/stats', verifyToken, checkRole('hod', 'project_coordinator'), async (req, res) => {
  const { db, usersCollection } = getCollections();
  try {
    const activeBatch = await db.collection('batches').findOne({ isActive: true });
    const assignmentFilter = activeBatch
      ? { $or: [{ batchId: activeBatch._id }, { batchId: null }, { batchId: { $exists: false } }] }
      : {};
    const [mentorCount, menteeCount, assignmentCount] = await Promise.all([
      usersCollection.countDocuments({ $or: [{ role: 'mentor' }, { roles: 'mentor' }] }),
      usersCollection.countDocuments({ $or: [{ role: 'mentee' }, { roles: 'mentee' }] }),
      db.collection('assignments').countDocuments(assignmentFilter),
    ]);
    res.json({ success: true, data: { mentors: mentorCount, mentees: menteeCount, assignments: assignmentCount } });
  } catch (err) { res.status(500).json({ success: false, message: 'Failed to fetch stats' }); }
});

// POST /admin/repair-completed-files
router.post('/admin/repair-completed-files', verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
  const { db, usersCollection, projectsCollection } = getCollections();
  try {
    const finalised = await db.collection('assignments').find({ finalRemark: { $exists: true, $ne: null, $ne: '' } }).toArray();
    let fixed = 0;
    for (const a of finalised) {
      const r1 = await db.collection(FILE_COL).updateMany({ uploaded_by: a.menteeEmail, isArchived: { $ne: true } }, { $set: { isArchived: true, archivedAt: new Date(), archivedProjectName: a.projectName } });
      await projectsCollection.updateOne({ menteeEmail: a.menteeEmail, isArchived: { $ne: true } }, { $set: { isCompleted: true, isArchived: true, archivedAt: new Date(), completedAt: a.finalRemarkedAt || new Date() } });
      await db.collection('assignments').updateOne({ _id: a._id, isArchived: { $ne: true } }, { $set: { isArchived: true, archivedAt: new Date(), archivedProjectName: a.projectName } });
      await usersCollection.updateOne({ email: a.menteeEmail, projectStatus: { $in: ['assigned', 'approved'] } }, { $set: { projectStatus: 'pending', projectName: '', projectCompleted: true } });
      if (r1.modifiedCount > 0) fixed++;
    }
    res.json({ success: true, message: `Repaired ${fixed} mentee(s) with unarchived files`, total: finalised.length });
  } catch (err) { res.status(500).json({ success: false, message: 'Repair failed' }); }
});

// S3 v3 SDK routes
router.post('/upload-url',   verifyToken, getUploadUrl);
router.post('/download-url', verifyToken, getDownloadUrl);

// GET /mentor/notifications
router.get('/mentor/notifications', require('../middleware/auth').requireRole('mentor'), async (req, res) => {
  const { db } = getCollections();
  try {
    const notifications = await db.collection('notifications').find({ recipientEmail: req.userEmail, read: false }).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, data: notifications });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = router;
