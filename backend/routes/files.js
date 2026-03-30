// backend/routes/files.js

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Assuming connection already created in app.js or db.js
let gfs;
const conn = mongoose.connection;
conn.once('open', () => {
  gfs = new mongoose.mongo.GridFSBucket(conn.db, {
    bucketName: 'uploads'
  });
});

// Route to fetch all files for a given project name
router.get('/api/files/:projectName', async (req, res) => {
  const projectName = req.params.projectName;

  try {
    const files = await conn.db.collection('uploads.files')
      .find({ 'metadata.projectName': projectName }).toArray();

    if (!files || files.length === 0) {
      return res.status(404).json({ success: false, message: 'No files found' });
    }

    res.status(200).json({ success: true, data: files });
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
