/**
 * routes/mentee.js
 * Handles: mentee project creation, profile, project-name, group-members, status, notifications
 * Mounted at: /api
 */

const express = require('express');
const router  = express.Router();

const { getCollections } = require('../db');
const { requireRole }    = require('../middleware/auth');
const { COLLECTION: FILE_COL } = require('../models/fileMetadata');
const { getAllowedPhases } = require('../constants/phases');
const cache = require('../services/cacheService');

// POST /mentee/create-project
router.post('/mentee/create-project', requireRole('mentee'), async (req, res) => {
  const { db, usersCollection, projectsCollection, batchesCollection } = getCollections();
  const { projectName, projectDuration, description, groupMembers } = req.body;
  if (!projectName?.trim()) return res.status(400).json({ success: false, message: 'Project name is required' });
  if (!projectDuration) return res.status(400).json({ success: false, message: 'Project duration is required' });
  if (!['6_months', '1_year'].includes(projectDuration)) return res.status(400).json({ success: false, message: 'Invalid project duration' });
  // Check for duplicate project name across all mentees
  try {
    const duplicate = await usersCollection.findOne({
      email: { $ne: req.userEmail },
      projectName: { $regex: new RegExp(`^${projectName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (duplicate) return res.status(409).json({ success: false, message: `Project name "${projectName.trim()}" is already taken. Please choose a unique name.` });
  } catch (_) {}
  if (groupMembers && !Array.isArray(groupMembers)) return res.status(400).json({ success: false, message: 'groupMembers must be an array' });
  if (groupMembers && groupMembers.length > 5) return res.status(400).json({ success: false, message: 'Maximum 5 group members allowed' });
  if (groupMembers) {
    for (const m of groupMembers) { if (!m.name?.trim()) return res.status(400).json({ success: false, message: 'Each member must have a name' }); }
    const emails = groupMembers.map(m => m.email?.toLowerCase()).filter(Boolean);
    if (new Set(emails).size !== emails.length) return res.status(400).json({ success: false, message: 'Duplicate member emails are not allowed' });
  }
  try {
    const user = await usersCollection.findOne({ email: req.userEmail });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const activeBatch = await batchesCollection.findOne({ isActive: true });
    if (!activeBatch) return res.status(400).json({ success: false, message: 'No active academic year. Please contact the coordinator.' });

    const allProjectsInBatch = await projectsCollection.find({ menteeEmail: req.userEmail, $or: [{ batchId: activeBatch._id }, { batchId: { $exists: false } }, { batchId: null }] }).toArray();
    if (allProjectsInBatch.some(p => p.duration === '1_year' && p.isCompleted))
      return res.status(400).json({ success: false, message: 'You cannot create another project in the same academic year after completing a 1-year project.' });
    const total6Month = allProjectsInBatch.filter(p => p.duration === '6_months').length;
    if (total6Month >= 2) return res.status(400).json({ success: false, message: 'You have already created 2 projects in this academic year.' });
    if (total6Month >= 1 && projectDuration === '1_year') return res.status(400).json({ success: false, message: 'Your second project in the same academic year must be 6 months.' });

    const previousProject    = await projectsCollection.findOne({ menteeEmail: req.userEmail, isArchived: { $ne: true } });
    const previousAssignment = await db.collection('assignments').findOne({ menteeEmail: req.userEmail, isArchived: { $ne: true } });
    const isCompleted = previousProject?.isCompleted || previousAssignment?.finalRemark;
    const isRejected  = user.projectStatus === 'rejected';

    if (user.projectName && !isCompleted && !isRejected)
      return res.status(400).json({ success: false, message: 'Complete your current project before creating a new one.' });

    const sanitizedMembers = (groupMembers || []).map(m => ({ name: m.name.trim(), email: m.email?.trim().toLowerCase() || '', rollNo: m.rollNo?.trim() || '', contactNo: m.contactNo?.toString().trim() || '' }));

    if (user.projectName && (isCompleted || isRejected)) {
      const oldAssignment = await db.collection('assignments').findOne({ menteeEmail: req.userEmail, isArchived: { $ne: true } });
      if (oldAssignment) await db.collection('assignments').updateMany({ menteeEmail: req.userEmail, isArchived: { $ne: true } }, { $set: { isArchived: true, archivedAt: new Date(), archivedProjectName: oldAssignment.projectName } });
      await db.collection(FILE_COL).updateMany({ uploaded_by: req.userEmail, isArchived: { $ne: true } }, { $set: { isArchived: true, archivedAt: new Date(), archivedProjectName: user.projectName } });
      await projectsCollection.updateMany({ menteeEmail: req.userEmail, isArchived: { $ne: true } }, { $set: { isArchived: true, archivedAt: new Date() } });
    }

    await usersCollection.updateOne({ email: req.userEmail }, { $set: { projectName: projectName.trim(), projectDuration, projectDescription: description?.trim() || '', groupMembers: sanitizedMembers, projectStatus: 'pending', projectCreatedAt: new Date(), projectCompleted: false } });

    const existingActiveProject = await projectsCollection.findOne({ menteeEmail: req.userEmail, isArchived: { $ne: true } });
    if (existingActiveProject) {
      await projectsCollection.updateOne({ _id: existingActiveProject._id }, { $set: { projectName: projectName.trim(), duration: projectDuration, description: description?.trim() || '', groupMembers: sanitizedMembers, status: 'pending', updatedAt: new Date() } });
    } else {
      await projectsCollection.insertOne({ menteeEmail: req.userEmail, menteeName: user.name, projectName: projectName.trim(), duration: projectDuration, description: description?.trim() || '', groupMembers: sanitizedMembers, status: 'pending', isCompleted: false, isArchived: false, batchId: activeBatch._id, createdAt: new Date(), updatedAt: new Date() });
    }

    res.json({ success: true, message: 'Project created successfully', project: { projectName: projectName.trim(), projectDuration, description: description?.trim() || '', groupMembers: sanitizedMembers } });
    cache.invalidatePattern('mentees'); // projectName/projectStatus changed
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PUT /mentee/group-members
router.put('/mentee/group-members', requireRole('mentee'), async (req, res) => {
  const { db, usersCollection } = getCollections();
  const { groupMembers } = req.body;
  if (!Array.isArray(groupMembers)) return res.status(400).json({ success: false, message: 'groupMembers must be an array' });
  if (groupMembers.length > 5) return res.status(400).json({ success: false, message: 'Maximum 5 group members allowed' });
  for (const m of groupMembers) { if (!m.name?.trim()) return res.status(400).json({ success: false, message: 'Each member must have a name' }); }
  const emails = groupMembers.map(m => m.email?.toLowerCase()).filter(Boolean);
  if (new Set(emails).size !== emails.length) return res.status(400).json({ success: false, message: 'Duplicate member emails are not allowed' });
  try {
    const user = await usersCollection.findOne({ email: req.userEmail });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const assignment = await db.collection('assignments').findOne({ menteeEmail: req.userEmail, isArchived: { $ne: true } });
    if (assignment?.finalRemark) return res.status(403).json({ success: false, message: 'Your project has been finalised. Group members cannot be modified.' });
    const sanitized = groupMembers.map(m => ({ name: m.name.trim(), email: m.email?.trim().toLowerCase() || '', rollNo: m.rollNo?.trim() || '', contactNo: m.contactNo?.toString().trim() || '' }));
    await usersCollection.updateOne({ email: req.userEmail }, { $set: { groupMembers: sanitized } });
    res.json({ success: true, message: 'Group members updated', groupMembers: sanitized });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /mentee/group-members
router.get('/mentee/group-members', requireRole('mentee', 'mentor', 'project_coordinator', 'hod'), async (req, res) => {
  const { usersCollection } = getCollections();
  const targetEmail = (req.query.email || req.userEmail).toLowerCase();
  try {
    const user = await usersCollection.findOne({ email: targetEmail });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, groupMembers: user.groupMembers || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /mentee/profile
router.patch('/mentee/profile', requireRole('mentee'), async (req, res) => {
  const { usersCollection } = getCollections();
  const { name, contactNo, rollNo } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
  try {
    await usersCollection.updateOne({ email: req.userEmail }, { $set: { name: name.trim(), contactNo: contactNo?.toString().trim() || '', rollNo: rollNo?.trim() || '' } });
    res.json({ success: true, message: 'Profile updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// PATCH /mentee/project-name
router.patch('/mentee/project-name', requireRole('mentee'), async (req, res) => {
  const { usersCollection } = getCollections();
  const { projectName } = req.body;
  if (!projectName?.trim()) return res.status(400).json({ success: false, message: 'projectName is required' });
  try {
    const user = await usersCollection.findOne({ email: req.userEmail });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.projectStatus === 'assigned') return res.status(403).json({ success: false, message: 'Project name is locked after mentor assignment' });
    // Check for duplicate project name
    const duplicate = await usersCollection.findOne({
      email: { $ne: req.userEmail },
      projectName: { $regex: new RegExp(`^${projectName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
    });
    if (duplicate) return res.status(409).json({ success: false, message: `Project name "${projectName.trim()}" is already taken. Please choose a unique name.` });
    await usersCollection.updateOne({ email: req.userEmail }, { $set: { projectName: projectName.trim(), projectStatus: 'pending' } });
    res.json({ success: true, message: 'Project name updated' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /mentee/status — full mentee status for dashboard
router.get('/mentee/status', requireRole('mentee'), async (req, res) => {
  const { db, usersCollection, projectsCollection, batchesCollection } = getCollections();
  try {
    const user = await usersCollection.findOne({ email: req.userEmail });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const assignment = await db.collection('assignments').findOne({ menteeEmail: req.userEmail, isArchived: { $ne: true } });
    const project    = await projectsCollection.findOne({ menteeEmail: req.userEmail, isArchived: { $ne: true } });

    const activeBatch = await batchesCollection.findOne({ isActive: true });

    // If active project belongs to a different batch, treat as "no project in current batch"
    const projectInCurrentBatch = project && activeBatch
      ? (!project.batchId || project.batchId.toString() === activeBatch._id.toString())
      : !!project;
    const effectiveActiveProject    = projectInCurrentBatch ? project : null;
    const effectiveActiveAssignment = projectInCurrentBatch ? assignment : null;

    const archivedAssignment = !effectiveActiveAssignment ? await db.collection('assignments').findOne({ menteeEmail: req.userEmail, isArchived: true }, { sort: { archivedAt: -1 } }) : null;
    const archivedProject    = !effectiveActiveProject    ? await projectsCollection.findOne({ menteeEmail: req.userEmail, isArchived: true }, { sort: { archivedAt: -1 } }) : null;

    const archivedCount = !effectiveActiveAssignment ? await db.collection('assignments').countDocuments({ menteeEmail: req.userEmail, isArchived: true }) : 0;
    const use6MonthFallback = archivedCount >= 1 && archivedProject?.duration === '6_months';
    const use1YearFallback  = archivedProject?.duration === '1_year';
    const useArchivedFallback = use1YearFallback || use6MonthFallback;

    const effectiveAssignment = effectiveActiveAssignment || (useArchivedFallback ? archivedAssignment : null);
    const effectiveProject    = effectiveActiveProject    || (useArchivedFallback ? archivedProject    : null);
    const resolvedDuration    = effectiveProject?.duration || effectiveAssignment?.duration || '6_months';
    const isProjectCompleted  = effectiveProject?.isCompleted || effectiveAssignment?.finalRemark || false;

    let canCreateNewProject = !effectiveActiveProject || isProjectCompleted || user.projectStatus === 'rejected';
    let projectLimitReason = null, completed6MonthCount = 0, has1YearCompleted = false;

    if (activeBatch && canCreateNewProject) {
      const allProjectsInBatch = await projectsCollection.find({ menteeEmail: req.userEmail, $or: [{ batchId: activeBatch._id }, { batchId: { $exists: false } }, { batchId: null }] }).toArray();
      has1YearCompleted = allProjectsInBatch.some(p => p.duration === '1_year' && p.isCompleted);
      const total6Month = allProjectsInBatch.filter(p => p.duration === '6_months').length;
      completed6MonthCount = allProjectsInBatch.filter(p => p.duration === '6_months' && p.isCompleted).length;
      if (has1YearCompleted) { canCreateNewProject = false; projectLimitReason = '1_year_completed'; }
      else if (total6Month >= 2) { canCreateNewProject = false; projectLimitReason = 'max_6_month_reached'; }
    }

    const notifications = await db.collection('notifications').find({ recipientEmail: req.userEmail, read: false }).sort({ createdAt: -1 }).toArray();

    res.json({ success: true, data: {
      name: user.name || '', rollNo: user.rollNo || '', contactNo: user.contactNo || '',
      projectName: effectiveActiveProject?.projectName || (useArchivedFallback ? effectiveProject?.projectName || effectiveAssignment?.projectName : '') || '',
      projectDuration: effectiveActiveProject?.duration || user.projectDuration || effectiveProject?.duration || '6_months',
      projectDescription: effectiveActiveProject?.description || user.projectDescription || (useArchivedFallback ? effectiveProject?.description : '') || '',
      projectStatus: effectiveActiveProject ? (user.projectStatus || 'pending') : 'pending',
      groupMembers: user.groupMembers || [],
      assignment: (useArchivedFallback ? effectiveAssignment : effectiveActiveAssignment) || null,
      deadline: (useArchivedFallback ? effectiveAssignment : effectiveActiveAssignment)?.deadline || null,
      extendedDeadline: (useArchivedFallback ? effectiveAssignment : effectiveActiveAssignment)?.extendedDeadline || null,
      duration: resolvedDuration, isProjectCompleted, canCreateNewProject, projectLimitReason, completed6MonthCount, has1YearCompleted, notifications,
    }});
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /notifications/read
router.post('/notifications/read', requireRole('mentee', 'mentor'), async (req, res) => {
  const { db } = getCollections();
  try {
    await db.collection('notifications').updateMany({ recipientEmail: req.userEmail, read: false }, { $set: { read: true } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
