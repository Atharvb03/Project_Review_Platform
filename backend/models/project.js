// models/Project.js
const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  projectName: String,
  mentorEmail: String,
  menteeEmail: String,
  // ADDED: project duration — set at creation by mentor/coordinator only
  duration: {
    type: String,
    enum: ['6_months', '1_year'],
    default: '6_months',
  },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
