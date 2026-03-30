const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  projectName:  { type: String, required: true },
  menteeEmail:  { type: String, required: true },
  mentorEmail:  { type: String, required: true },
  assignedBy:   { type: String, required: true }, // PC email
}, { timestamps: true });

// Prevent duplicate: same mentee cannot be assigned twice
assignmentSchema.index({ menteeEmail: 1 }, { unique: true });

module.exports = mongoose.model('Assignment', assignmentSchema);
