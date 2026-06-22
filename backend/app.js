/**
 * app.js — Express app setup and route mounting.
 * This file configures middleware and mounts all route files.
 * The actual server start (app.listen) is in server.js.
 *
 * NEW STRUCTURE vs OLD server.js:
 *   server.js (old, 3000 lines) → split into:
 *   ├── app.js              — middleware + route mounting (this file)
 *   ├── db.js               — MongoDB connection shared across routes
 *   ├── s3.js               — AWS S3 client shared across routes
 *   └── routes/
 *       ├── auth.js         — signup, login, Google OAuth, password reset
 *       ├── files.js        — S3 file upload/download/metadata/remarks
 *       ├── mentee.js       — mentee project, profile, status, notifications
 *       ├── assignments.js  — create/update/list assignments, deadlines, final remark
 *       ├── batches.js      — academic year CRUD
 *       ├── coordinator.js  — mentors/mentees lists, project approval, user delete
 *       └── dashboard.js    — mentee/mentor/coordinator/HOD dashboard data
 *
 * HOW TO RUN:
 *   node server.js   (same as before — server.js now just calls app.js + listens)
 */

const express  = require('express');
const cors     = require('cors');
const helmet   = require('helmet');
const rateLimit = require('express-rate-limit');
const session  = require('express-session');
const passport = require('passport');
const bodyParser = require('body-parser');
require('dotenv').config();

const { sanitizeBody, sanitizeQuery } = require('./middleware/validation');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

// ── SECURITY HEADERS ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'"],
      imgSrc:     ["'self'", 'data:', 'https:'],
    }
  }
}));
app.set('trust proxy', 1);
// ── RATE LIMITING ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || (process.env.NODE_ENV === 'production' ? 200 : 1000),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.status(429).json({ success: false, message: 'Too many requests, please try again later.' });
  },
});
app.use('/api/', limiter);

// ── CORS ──────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin:         process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── BODY PARSING ──────────────────────────────────────────────────────────────
app.use(bodyParser.json());

// ── SESSION (for Passport Google OAuth) ──────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'prp_session_secret_key_2024',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
}));
app.use(passport.initialize());
app.use(passport.session());

// ── INPUT SANITIZATION ────────────────────────────────────────────────────────
app.use(sanitizeBody);
app.use(sanitizeQuery);

// ── ROUTE MOUNTING ────────────────────────────────────────────────────────────
// Auth routes: /api/signup, /api/login, /api/verify/:token,
//              /api/auth/*, /api/password/*, /api/role-availability
//              /auth/google, /auth/google/callback
const authRouter = require('./routes/auth');
app.use('/api', authRouter);          // covers /api/signup, /api/login, /api/verify/:token, /api/password/*, /api/role-availability, /api/auth/*
app.use('/auth', authRouter);         // covers /auth/google, /auth/google/callback

// File routes: /api/files/*
app.use('/api/files', require('./routes/files'));

// Mentee routes: /api/mentee/*, /api/notifications/*
app.use('/api', require('./routes/mentee'));

// Assignment routes: /api/assignments/*, /api/admin/*
app.use('/api', require('./routes/assignments'));

// Batch routes: /api/batches/*
app.use('/api/batches', require('./routes/batches'));

// Coordinator routes: /api/mentors, /api/mentees, /api/users/:email,
//                     /api/coordinator/*, /api/projects, /api/mentor-projects,
//                     /api/hod/*, /api/upload-url, /api/download-url
app.use('/api', require('./routes/coordinator'));

// Dashboard routes: /api/dashboard/*
app.use('/api/dashboard', require('./routes/dashboard'));

// ── ERROR HANDLING ────────────────────────────────────────────────────────────
app.use(errorHandler);
app.use((req, res) => res.status(404).json({ success: false, message: 'Route not found' }));

module.exports = app;
