const express = require("express");
const User = require("../models/user");

const router = express.Router();

// Login Route
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email, password });
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    res.json({ success: true, role: user.role, userId: user._id });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
