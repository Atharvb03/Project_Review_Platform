const express = require("express");
const Project = require("../models/project");

const router = express.Router();

// Add Project
router.post("/add-project", async (req, res) => {
  const { projectName, menteeEmail } = req.body;

  try {
    const newProject = new Project({ name: projectName, mentee_email: menteeEmail });
    await newProject.save();
    res.json({ success: true, message: "Project added successfully", project: newProject });
  } catch (err) {
    res.status(500).json({ message: "Failed to add project" });
  }
});

// Fetch Projects for a Mentee
router.get("/projects/:menteeEmail", async (req, res) => {
  try {
    const projects = await Project.find({ mentee_email: req.params.menteeEmail });
    res.json({ success: true, projects });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
