/**
 * routes/batches.js
 * Handles: academic year (batch) CRUD
 * Mounted at: /api/batches
 */

const express  = require('express');
const router   = express.Router();
const { ObjectId } = require('mongodb');

const { getCollections }       = require('../db');
const { verifyToken, checkRole } = require('../middleware/auth');
const cache = require('../services/cacheService');

// GET / — list all batches
router.get('/', verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
  const { batchesCollection } = getCollections();
  try {
    const batches = await batchesCollection.find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, data: batches });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch batches' });
  }
});

// GET /active — get active batch (public)
router.get('/active', async (req, res) => {
  const { batchesCollection } = getCollections();
  try {
    const activeBatch = await batchesCollection.findOne({ isActive: true });
    res.json({ success: true, data: activeBatch || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch active batch' });
  }
});

// POST / — create new batch
router.post('/', verifyToken, checkRole('project_coordinator'), async (req, res) => {
  const { batchesCollection } = getCollections();
  const { name, isActive } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, message: "Batch name is required (e.g., '2025-26')" });
  try {
    const existing = await batchesCollection.findOne({ name: name.trim() });
    if (existing) return res.status(409).json({ success: false, message: 'Academic year already exists' });
    if (isActive) await batchesCollection.updateMany({}, { $set: { isActive: false } });
    const batch = { name: name.trim(), isActive: isActive || false, createdAt: new Date(), updatedAt: new Date() };
    const result = await batchesCollection.insertOne(batch);
    batch._id = result.insertedId;
    res.status(201).json({ success: true, message: 'Academic year created', data: batch });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create batch', error: err.message });
  }
});

// PATCH /:id/activate — set batch as active
router.patch('/:id/activate', verifyToken, checkRole('project_coordinator'), async (req, res) => {
  const { batchesCollection } = getCollections();
  try {
    const batchId = new ObjectId(req.params.id);
    const batch = await batchesCollection.findOne({ _id: batchId });
    if (!batch) return res.status(404).json({ success: false, message: 'Academic year not found' });
    await batchesCollection.updateMany({ _id: { $ne: batchId } }, { $set: { isActive: false, updatedAt: new Date() } });
    await batchesCollection.updateOne({ _id: batchId }, { $set: { isActive: true, updatedAt: new Date() } });
    cache.flush(); // batch changed — all cached data is now stale
    res.json({ success: true, message: `Academic year ${batch.name} is now active` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to activate batch' });
  }
});

// DELETE /:id — delete a batch
router.delete('/:id', verifyToken, checkRole('project_coordinator'), async (req, res) => {
  const { batchesCollection, projectsCollection } = getCollections();
  try {
    const batchId = new ObjectId(req.params.id);
    const batch = await batchesCollection.findOne({ _id: batchId });
    if (!batch) return res.status(404).json({ success: false, message: 'Academic year not found' });
    if (batch.isActive) return res.status(400).json({ success: false, message: 'Cannot delete active academic year. Please activate another batch first.' });
    const projectsCount = await projectsCollection.countDocuments({ batchId });
    if (projectsCount > 0) return res.status(400).json({ success: false, message: `Cannot delete this academic year. ${projectsCount} project(s) are assigned to it.` });
    await batchesCollection.deleteOne({ _id: batchId });
    res.json({ success: true, message: `Academic year ${batch.name} deleted successfully` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete batch' });
  }
});

module.exports = router;
