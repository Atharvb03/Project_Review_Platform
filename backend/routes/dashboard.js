/**
 * routes/dashboard.js
 * Handles: mentee/mentor/coordinator dashboard data endpoints
 * Mounted at: /api/dashboard
 */

const express = require('express');
const router  = express.Router();

const { getCollections }         = require('../db');
const { verifyToken, checkRole, requireRole } = require('../middleware/auth');
const { COLLECTION: FILE_COL }   = require('../models/fileMetadata');
const { getAllowedPhases }        = require('../constants/phases');

// GET /mentee/:email
router.get('/mentee/:email', requireRole('mentee'), async (req, res) => {
  const { db, usersCollection } = getCollections();
  const email = req.params.email.toLowerCase();
  if (req.userEmail !== email) return res.status(403).json({ success: false, message: 'Access denied' });
  try {
    const user = await usersCollection.findOne({ email });
    const assignment = await db.collection('assignments').findOne({ menteeEmail: email, isArchived: { $ne: true } });
    const files = await db.collection(FILE_COL).find({ uploaded_by: email, isArchived: { $ne: true } }).toArray();
    const notifications = await db.collection('notifications').find({ recipientEmail: email }).sort({ createdAt: -1 }).toArray();
    const projectDuration = user?.projectDuration || '6_months';
    const allowedPhases = getAllowedPhases(projectDuration);
    const submitted = files.length;
    const lateCount = files.filter(f => f.isLate).length;
    const pendingReview = files.filter(f => f.remark === 'Pending Review').length;
    const reviewed = files.filter(f => f.remark && f.remark !== 'Pending Review').length;
    const sectionStatus = files.map(f => ({ section: f.section, filename: f.file_name, submittedAt: f.submittedAt, isLate: f.isLate, submissionStatus: f.submissionStatus || (f.isLate ? 'Late Submission' : 'Submitted'), remark: f.remark }));
    res.json({ success: true, data: { name: user?.name || '', projectName: user?.projectName || '', projectStatus: user?.projectStatus || 'pending', mentorEmail: assignment?.mentorEmail || null, deadline: assignment?.deadline || null, extendedDeadline: assignment?.extendedDeadline || null, finalRemark: assignment?.finalRemark || null, stats: { totalSections: allowedPhases.length, submitted, lateCount, pendingReview, reviewed }, sectionStatus, notifications } });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /mentor/:email
router.get('/mentor/:email', requireRole('mentor'), async (req, res) => {
  const { db, usersCollection, projectsCollection } = getCollections();
  const email = req.params.email.toLowerCase();
  if (req.userEmail !== email) return res.status(403).json({ success: false, message: 'Access denied' });
  try {
    const activeBatch = await db.collection('batches').findOne({ isActive: true });
    if (!activeBatch) return res.json({ success: true, data: { stats: { totalAssigned: 0, totalPendingReview: 0, totalLate: 0, totalAccepted: 0, currentProjects: 0, completedProjects: 0 }, mentees: [] } });

    const allAssignments = await db.collection('assignments').find({ mentorEmail: email }).toArray();
    const assignmentsWithProjects = await Promise.all(allAssignments.map(async (a) => {
      const project = await projectsCollection.findOne({ menteeEmail: a.menteeEmail, isArchived: a.isArchived ? true : { $ne: true } });
      return { ...a, batchId: project?.batchId };
    }));
    const assignments = assignmentsWithProjects.filter(a => a.batchId && a.batchId.toString() === activeBatch._id.toString());

    const menteeData = await Promise.all(assignments.map(async (a) => {
      const files = await db.collection(FILE_COL).find({ uploaded_by: a.menteeEmail, isArchived: a.isArchived ? true : { $ne: true } }).toArray();
      const menteeUser = await usersCollection.findOne({ email: a.menteeEmail });
      return { menteeEmail: a.menteeEmail, menteeName: menteeUser?.name || '', projectName: a.projectName, assignmentId: a._id, deadline: a.deadline || null, extendedDeadline: a.extendedDeadline || null, finalRemark: a.finalRemark || null, isArchived: a.isArchived || false, stats: { submitted: files.length, lateCount: files.filter(f => f.isLate).length, pendingReview: files.filter(f => f.remark === 'Pending Review').length } };
    }));

    res.json({ success: true, data: { stats: { totalAssigned: assignments.length, totalPendingReview: menteeData.reduce((s, m) => s + m.stats.pendingReview, 0), totalLate: menteeData.reduce((s, m) => s + m.stats.lateCount, 0), totalAccepted: assignments.filter(a => a.finalRemark).length, currentProjects: assignments.filter(a => !a.finalRemark && !a.isArchived).length, completedProjects: assignments.filter(a => a.finalRemark || a.isArchived).length }, mentees: menteeData } });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

// GET /coordinator — filtered by active batch
router.get('/coordinator', verifyToken, checkRole('project_coordinator'), async (req, res) => {
  const { db, usersCollection } = getCollections();
  try {
    const activeBatch = await db.collection('batches').findOne({ isActive: true });
    const batchFilter = activeBatch
      ? { $or: [{ batchId: activeBatch._id }, { batchId: null }, { batchId: { $exists: false } }] }
      : {};

    const [totalStudents, totalMentors, assignments, allFiles] = await Promise.all([
      usersCollection.countDocuments({ $or: [{ role: 'mentee' }, { roles: 'mentee' }] }),
      usersCollection.countDocuments({ $or: [{ role: 'mentor' }, { roles: 'mentor' }] }),
      db.collection('assignments').find({ ...batchFilter, isArchived: { $ne: true } }).toArray(),
      db.collection(FILE_COL).find({ isArchived: { $ne: true } }).toArray(),
    ]);
    const [pendingApproval, approvedNotAssigned, rejectedProjects] = await Promise.all([
      usersCollection.countDocuments({ $or: [{ role: 'mentee' }, { roles: 'mentee' }], projectStatus: 'pending' }),
      usersCollection.countDocuments({ $or: [{ role: 'mentee' }, { roles: 'mentee' }], projectStatus: 'approved' }),
      usersCollection.countDocuments({ $or: [{ role: 'mentee' }, { roles: 'mentee' }], projectStatus: 'rejected' }),
    ]);
    const submittedMentees = new Set(allFiles.map(f => f.uploaded_by)).size;
    const lateSubmissions  = allFiles.filter(f => f.isLate).length;
    const acceptedProjects = assignments.filter(a => a.finalRemark).length;
    const assignmentSummary = await Promise.all(assignments.map(async (a) => {
      const files = await db.collection(FILE_COL).find({ uploaded_by: a.menteeEmail, isArchived: { $ne: true } }).toArray();
      const menteeUser = await usersCollection.findOne({ email: a.menteeEmail });
      return { menteeEmail: a.menteeEmail, menteeName: menteeUser?.name || '', mentorEmail: a.mentorEmail, projectName: a.projectName, submitted: files.length, lateCount: files.filter(f => f.isLate).length, pendingReview: files.filter(f => f.remark === 'Pending Review').length, accepted: !!a.finalRemark, deadline: a.deadline || null };
    }));
    res.json({ success: true, data: { stats: { totalStudents, totalMentors, assignedStudents: assignments.length, pendingApproval, approvedNotAssigned, rejectedProjects, submittedMentees, lateSubmissions, onTimeSubmissions: allFiles.filter(f => !f.isLate && f.submittedAt).length, acceptedProjects }, assignments: assignmentSummary } });
  } catch (err) { res.status(500).json({ success: false, message: 'Server error' }); }
});

module.exports = router;
