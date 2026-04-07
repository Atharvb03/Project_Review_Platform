const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const multer = require("multer");
const AWS = require("aws-sdk");
const crypto = require("crypto");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const passport = require("passport");
const session = require("express-session");
require("dotenv").config();

const { MongoClient, ObjectId } = require("mongodb");
const { verifyToken, checkRole, requireRole } = require("./middleware/auth");
const { generateToken } = require("./utils/jwt");
const bcrypt = require("bcryptjs");
const { COLLECTION: FILE_COL, ALLOWED_EXTENSIONS, MAX_SIZE_MB, MIME_MAP } = require("./models/fileMetadata");
const { getUploadUrl, getDownloadUrl } = require("./controllers/s3Controller");
// ADDED: centralized phase config
const { getAllowedPhases } = require("./constants/phases");
// ADDED: email service
const {
  sendEmail,
  remarkAddedEmail,
  finalRemarkEmail,
  deadlineSetEmail,
  deadlineExtendedEmail,
  fileUploadedEmail,
  assignmentCreatedMenteeEmail,
  assignmentCreatedMentorEmail,
  phaseApprovedEmail,
  mentorChangedOldMentorEmail,
  mentorChangedNewMentorEmail,
  mentorChangedMenteeEmail,
} = require("./utils/emailService");
// ADDED: deadline reminder cron job
const { initDeadlineReminder } = require("./jobs/deadlineReminder");
// ADDED: Security and validation middleware
const { errorHandler, asyncHandler } = require("./middleware/errorHandler");
const { validateObjectId, sanitizeBody, sanitizeQuery } = require("./middleware/validation");
const { createIndexes } = require("./config/indexes");

const app = express();
const PORT = process.env.PORT || 5000;
const mongoURI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

// Helmet for security headers (CSP, XSS protection, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    }
  }
}));

// Rate limiting to prevent brute force and DoS attacks
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || (process.env.NODE_ENV === 'production' ? 200 : 1000),
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Include CORS headers even on rate-limited responses
  handler: (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.status(429).json({ success: false, message: 'Too many requests, please try again later.' });
  },
});
app.use('/api/', limiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 5 : 50,
  message: { success: false, message: 'Too many authentication attempts, please try again later.' },
  handler: (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || 'http://localhost:5173');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.status(429).json({ success: false, message: 'Too many authentication attempts, please try again later.' });
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// BASIC MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

// CORS must come first — before session and passport
const corsOptions = {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // handle preflight for all routes

app.use(bodyParser.json());

// Session middleware for passport — saveUninitialized: true so session is saved before OAuth redirect
app.use(session({
  secret: process.env.SESSION_SECRET || 'prp_session_secret_key_2024',
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false, // must be false for localhost (no HTTPS)
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Input sanitization to prevent NoSQL injection
app.use(sanitizeBody);
app.use(sanitizeQuery);

// ═══════════════════════════════════════════════════════════════════════════
// DATABASE CONNECTION WITH ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════

// MongoDB Setup
const client = new MongoClient(mongoURI);
let db, usersCollection, projectsCollection, batchesCollection;

async function connectDB() {
    try {
        await client.connect();
        db = client.db("project_management");
        usersCollection = db.collection("users");
        projectsCollection = db.collection("projects");
        batchesCollection = db.collection("batches");
        console.log("✅ Connected to MongoDB");
        
        // Initialize Passport with database connection
        require('./config/passport')(usersCollection);
        
        // Create database indexes for performance
        await createIndexes(db);
        
        // Start deadline reminder cron job after DB is ready
        initDeadlineReminder(db, usersCollection);
    } catch (err) {
        console.error("❌ MongoDB connection error:", err);
        console.error("❌ Server cannot start without database connection");
        process.exit(1); // Exit if database connection fails
    }
}

// Handle MongoDB connection errors after initial connection
client.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
  process.exit(1);
});

client.on('close', () => {
  console.error('❌ MongoDB connection closed unexpectedly');
  process.exit(1);
});

connectDB();

// AWS S3 Setup
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

// ── S3 helper: extract key from any S3 URL ──────────────────────────────────
function extractS3Key(fileUrl) {
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  const patterns = [
    `https://${bucket}.s3.${region}.amazonaws.com/`,
    `https://${bucket}.s3.amazonaws.com/`,
    `https://s3.${region}.amazonaws.com/${bucket}/`,
    `https://s3.amazonaws.com/${bucket}/`,
  ];
  for (const p of patterns) {
    if (fileUrl.startsWith(p)) return decodeURIComponent(fileUrl.slice(p.length));
  }
  // Fallback: parse pathname
  const url = new URL(fileUrl);
  let key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  if (key.startsWith(bucket + '/')) key = key.slice(bucket.length + 1);
  return decodeURIComponent(key);
}

/*************** FILE ROUTES (Pre-signed S3) ***************/

/**
 * POST /api/files/generate-upload-url
 * Roles: mentee
 * Body: { fileName, fileType, section, menteeEmail }
 * Returns: { uploadUrl (PUT), s3Key, objectUrl }
 */
app.post('/api/files/generate-upload-url', requireRole('mentee'), async (req, res) => {
  const { fileName, fileType, section, menteeEmail } = req.body;

  if (!fileName || !section || !menteeEmail) {
    return res.status(400).json({ success: false, message: 'fileName, section and menteeEmail are required' });
  }

  // Validate extension
  const ext = fileName.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return res.status(400).json({
      success: false,
      message: `File type .${ext} not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
    });
  }

  // Resolve content type: prefer browser-supplied, fall back to MIME_MAP
  const resolvedContentType = (fileType && fileType !== 'application/octet-stream')
    ? fileType
    : (MIME_MAP[ext] || 'application/octet-stream');

  // Verify mentee has an assignment (only check active assignments)
  const assignment = await db.collection('assignments').findOne({ 
    menteeEmail: menteeEmail.toLowerCase(),
    isArchived: { $ne: true } // Only check active assignments
  });
  if (!assignment) {
    return res.status(403).json({ success: false, message: 'Your project is not yet assigned to a mentor. Please wait for the coordinator to assign a mentor before uploading files.' });
  }

  // Block upload if project has been finalised by mentor
  if (assignment.finalRemark) {
    return res.status(403).json({ success: false, message: 'Your project has been finalised by your mentor. Uploads are no longer accepted.' });
  }

  // ADDED: validate phase against project duration (only check active projects)
  const project = await projectsCollection.findOne({ 
    menteeEmail: menteeEmail.toLowerCase(),
    isArchived: { $ne: true } // Only check active projects
  });
  const duration = project?.duration || assignment?.duration || '6_months';
  const allowedPhases = getAllowedPhases(duration);
  if (!allowedPhases.includes(section)) {
    return res.status(400).json({
      success: false,
      message: `This phase is not allowed for this project duration (${duration.replace('_', ' ')})`,
    });
  }

  // Unique S3 key — private bucket, no public access
  const uniqueId = crypto.randomBytes(8).toString('hex');
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const s3Key = `uploads/${assignment._id}/${section}/${uniqueId}_${safeFileName}`;

  const params = {
    Bucket:      process.env.S3_BUCKET_NAME,
    Key:         s3Key,
    ContentType: resolvedContentType,
    Expires:     300, // 5 min window to complete the PUT
    // NOTE: Do NOT add ContentDisposition here — it becomes a required signed
    // header and the browser XHR won't send it, causing a SignatureDoesNotMatch error.
  };

  try {
    const uploadUrl = s3.getSignedUrl('putObject', params);
    const objectUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${encodeURIComponent(s3Key).replace(/%2F/g, '/')}`;
    res.json({ success: true, uploadUrl, s3Key, objectUrl, contentType: resolvedContentType });
  } catch (err) {
    console.error('Pre-signed PUT error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate upload URL' });
  }
});

/**
 * POST /api/files/save-metadata
 * Roles: mentee
 * Body: { fileName, s3Key, fileType, section, menteeEmail }
 * Saves file metadata to DB after successful S3 PUT
 */
app.post('/api/files/save-metadata', requireRole('mentee'), async (req, res) => {
  const { fileName, s3Key, fileType, section, menteeEmail } = req.body;

  if (!fileName || !s3Key || !fileType || !section || !menteeEmail) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const assignment = await db.collection('assignments').findOne({ 
      menteeEmail: menteeEmail.toLowerCase(),
      isArchived: { $ne: true } // Only check active assignments
    });
    if (!assignment) {
      return res.status(403).json({ success: false, message: 'No assignment found for this mentee' });
    }

    const fileCol = db.collection(FILE_COL);
    const now = new Date();

    // Compute finalDeadline: extendedDeadline takes priority over original deadline
    const finalDeadline = assignment.extendedDeadline
      ? new Date(assignment.extendedDeadline)
      : assignment.deadline
        ? new Date(assignment.deadline)
        : null;

    const isLate = finalDeadline ? now > finalDeadline : false;
    const submissionStatus = isLate ? 'Late Submission' : 'Submitted';

    // Upsert: replace existing metadata for same mentee+section
    await fileCol.updateOne(
      { 
        uploaded_by: menteeEmail.toLowerCase(), 
        section,
        isArchived: { $ne: true } // Only update active files
      },
      {
        $set: {
          file_name:   fileName,
          file_url:    s3Key,
          file_type:   fileType,
          section,
          project_id:  assignment._id.toString(),
          uploaded_by: menteeEmail.toLowerCase(),
          remark:      'Pending Review',
          submittedAt: now,
          isLate,
          submissionStatus,
          updatedAt:   now,
        },
        $setOnInsert: { createdAt: now, isArchived: false },
      },
      { upsert: true }
    );

    res.json({ success: true, message: 'File metadata saved' });

    // Fire-and-forget: email mentor about new upload
    setImmediate(async () => {
      try {
        const mentee = await usersCollection.findOne({ email: menteeEmail.toLowerCase() });
        const mentor = await usersCollection.findOne({ email: assignment.mentorEmail });
        const { PHASE_LABELS } = require('./constants/phases');
        const phaseName = PHASE_LABELS[section] || section;
        if (mentor?.email) {
          const tpl = fileUploadedEmail({
            menteeName:  mentee?.name || menteeEmail,
            menteeEmail: menteeEmail.toLowerCase(),
            projectName: assignment.projectName || 'Your Project',
            phaseName,
          });
          await sendEmail({ to: mentor.email, ...tpl });
        }
      } catch (e) { console.error('[Email] save-metadata trigger:', e.message); }
    });
  } catch (err) {
    console.error('Save metadata error:', err);
    res.status(500).json({ success: false, message: 'Failed to save metadata' });
  }
});

/**
 * POST /api/files/secure-url
 * Roles: mentee (own files), mentor (assigned mentees), hod
 * Body: { s3Key, menteeEmail }
 * Returns a pre-signed GET URL valid for 5 minutes
 */
app.post('/api/files/secure-url', requireRole('mentee', 'mentor', 'hod', 'project_coordinator'), async (req, res) => {
  const { s3Key, menteeEmail, download, fileName } = req.body;

  if (!s3Key || !menteeEmail) {
    return res.status(400).json({ success: false, message: 's3Key and menteeEmail are required' });
  }

  try {
    // Check for both active and archived assignments for access control
    const activeAssignment = await db.collection('assignments').findOne({ 
      menteeEmail: menteeEmail.toLowerCase(),
      isArchived: { $ne: true }
    });
    const archivedAssignment = await db.collection('assignments').findOne({ 
      menteeEmail: menteeEmail.toLowerCase(),
      isArchived: true
    });

    // Access control
    const role  = req.userRole;
    const email = req.userEmail;

    if (role === 'mentee' && email !== menteeEmail.toLowerCase()) {
      return res.status(403).json({ success: false, message: 'You can only access your own files' });
    }

    if (role === 'mentor') {
      // Check if mentor is assigned to either active or archived assignment
      const isAssignedMentor = (activeAssignment?.mentorEmail === email) || (archivedAssignment?.mentorEmail === email);
      if (!isAssignedMentor) {
        return res.status(403).json({ success: false, message: 'You are not the assigned mentor for this mentee' });
      }
    }

    // HOD and PC have unrestricted read access

    const params = {
      Bucket:  process.env.S3_BUCKET_NAME,
      Key:     s3Key,
      Expires: role === 'mentee' ? 300 : 604800, // mentee: 5min | mentor/hod/pc: 7 days
    };

    // Force browser download instead of inline preview
    if (download) {
      const safeFileName = (fileName || s3Key.split('/').pop() || 'download').replace(/[^a-zA-Z0-9._-]/g, '_');
      params.ResponseContentDisposition = `attachment; filename="${safeFileName}"`;
    }

    const signedUrl = s3.getSignedUrl('getObject', params);
    res.json({ success: true, url: signedUrl });
  } catch (err) {
    console.error('Secure URL error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate secure URL' });
  }
});

/**
 * GET /api/files/metadata/:menteeEmail
 * Roles: mentee (own), mentor (assigned), hod, project_coordinator
 * Returns all file metadata for a mentee
 */
app.get('/api/files/metadata/:menteeEmail', requireRole('mentee', 'mentor', 'hod', 'project_coordinator'), async (req, res) => {
  const menteeEmail = req.params.menteeEmail.toLowerCase();
  const { projectName } = req.query; // Optional: filter archived files by specific project

  try {
    // Check for both active and archived assignments for access control
    const activeAssignment = await db.collection('assignments').findOne({ 
      menteeEmail,
      isArchived: { $ne: true }
    });
    const archivedAssignments = await db.collection('assignments').find({ 
      menteeEmail,
      isArchived: true
    }).toArray();
    
    const role  = req.userRole;
    const email = req.userEmail;

    if (role === 'mentee' && email !== menteeEmail) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (role === 'mentor') {
      // Check if mentor is assigned to either active or any archived assignment
      const isAssignedMentor = (activeAssignment?.mentorEmail === email) || 
        archivedAssignments.some(a => a.mentorEmail === email);
      if (!isAssignedMentor) {
        return res.status(403).json({ success: false, message: 'You are not the assigned mentor for this mentee' });
      }
    }

    // Get active (non-archived) files
    const activeFiles = await db.collection(FILE_COL).find({ 
      uploaded_by: menteeEmail,
      isArchived: { $ne: true }
    }).toArray();
    
    // Get archived files (from previous projects)
    // If projectName is provided, filter by that specific project
    const archivedQuery = { 
      uploaded_by: menteeEmail,
      isArchived: true
    };
    if (projectName) {
      archivedQuery.archivedProjectName = projectName;
    }
    
    const archivedFiles = await db.collection(FILE_COL).find(archivedQuery)
      .sort({ archivedAt: -1, archivedProjectName: 1, section: 1 })
      .toArray();

    // Enrich archived files with academic year (batch) name
    // Batch lookup: collect unique batchIds from archived assignments, fetch all at once
    const batchIdSet = new Set(archivedAssignments.map(a => a.batchId?.toString()).filter(Boolean));
    const batches = batchIdSet.size > 0
      ? await batchesCollection.find({ _id: { $in: archivedAssignments.map(a => a.batchId).filter(Boolean) } }).toArray()
      : [];
    const batchMap = Object.fromEntries(batches.map(b => [b._id.toString(), b.name]));

    const enrichedArchivedFiles = archivedFiles.map(f => {
      const matchingAssignment = archivedAssignments.find(a => a.projectName === f.archivedProjectName);
      const batchName = matchingAssignment?.batchId ? batchMap[matchingAssignment.batchId.toString()] || null : null;
      return { ...f, batchName };
    });
    
    console.log(`[FILES] Found ${activeFiles.length} active files and ${archivedFiles.length} archived files for ${menteeEmail}${projectName ? ` (project: ${projectName})` : ''}`);
    
    res.json({
      success: true,
      data: activeFiles,
      archivedFiles: enrichedArchivedFiles,
      deadline: activeAssignment?.deadline || null,
      extendedDeadline: activeAssignment?.extendedDeadline || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch metadata' });
  }
});

/**
 * DELETE /api/files/metadata
 * Roles: mentee (own files only)
 * Body: { menteeEmail, section }
 */
app.delete('/api/files/metadata', requireRole('mentee'), async (req, res) => {
  const { menteeEmail, section } = req.body;
  if (!menteeEmail || !section) {
    return res.status(400).json({ success: false, message: 'menteeEmail and section are required' });
  }
  if (req.userEmail !== menteeEmail.toLowerCase()) {
    return res.status(403).json({ success: false, message: 'You can only delete your own files' });
  }
  try {
    // Check if file is archived
    const file = await db.collection(FILE_COL).findOne({ 
      uploaded_by: menteeEmail.toLowerCase(), 
      section 
    });
    if (file?.isArchived) {
      return res.status(403).json({ success: false, message: 'Archived files cannot be deleted. They are kept for historical records.' });
    }
    
    // Block delete if project has been finalised
    const assignment = await db.collection('assignments').findOne({ 
      menteeEmail: menteeEmail.toLowerCase(),
      isArchived: { $ne: true }
    });
    if (assignment?.finalRemark) {
      return res.status(403).json({ success: false, message: 'Your project has been finalised. Files cannot be deleted.' });
    }
    await db.collection(FILE_COL).deleteOne({ uploaded_by: menteeEmail.toLowerCase(), section });
    res.json({ success: true, message: 'File metadata removed' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete metadata' });
  }
});

/**
 * PATCH /api/files/remark
 * Roles: mentor only
 * Body: { menteeEmail, section, remark }
 */
app.patch('/api/files/remark', requireRole('mentor'), async (req, res) => {
  const { menteeEmail, section, remark } = req.body;

  if (!menteeEmail || !section || !remark) {
    return res.status(400).json({ success: false, message: 'menteeEmail, section and remark are required' });
  }

  try {
    const assignment = await db.collection('assignments').findOne({ 
      menteeEmail: menteeEmail.toLowerCase(),
      isArchived: { $ne: true } // Only check active assignments
    });
    if (!assignment || assignment.mentorEmail !== req.userEmail) {
      return res.status(403).json({ success: false, message: 'You are not the assigned mentor for this mentee' });
    }

    // Block remarks after final remark is submitted
    if (assignment.finalRemark) {
      return res.status(403).json({ success: false, message: 'Project has been finalised. No further remarks can be added.' });
    }

    const result = await db.collection(FILE_COL).updateOne(
      { 
        uploaded_by: menteeEmail.toLowerCase(), 
        section,
        isArchived: { $ne: true } // Only update active files
      },
      { $set: { remark, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'File not found for this section' });
    }

    res.json({ success: true, message: 'Remark updated' });

    // Fire-and-forget: notify mentee + in-app notification
    setImmediate(async () => {
      try {
        const mentee = await usersCollection.findOne({ email: menteeEmail.toLowerCase() });
        const { PHASE_LABELS } = require('./constants/phases');
        const phaseName = PHASE_LABELS[section] || section;
        // In-app notification
        await db.collection('notifications').insertOne({
          recipientEmail: menteeEmail.toLowerCase(),
          recipientRole: 'mentee',
          message: `Your mentor added a remark on "${phaseName}": ${remark}`,
          read: false,
          createdAt: new Date(),
        });
        // Email — remark added
        if (mentee?.email) {
          const tpl = remarkAddedEmail({
            menteeName:  mentee.name || menteeEmail,
            projectName: assignment.projectName || 'Your Project',
            phaseName,
            remark,
          });
          await sendEmail({ to: mentee.email, ...tpl });
          // Extra email if remark is an approval
          if (remark.toLowerCase().includes('approved') || remark.toLowerCase().includes('approve')) {
            const approvalTpl = phaseApprovedEmail({
              menteeName:  mentee.name || menteeEmail,
              projectName: assignment.projectName || 'Your Project',
              phaseName,
            });
            await sendEmail({ to: mentee.email, ...approvalTpl });
          }
        }
      } catch (e) { console.error('[Email] remark trigger:', e.message); }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update remark' });
  }
});

// Legacy fallback: direct upload — deprecated, kept for backward compat
const uploadToMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 } });
app.post('/api/files/upload', verifyToken, uploadToMemory.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file provided' });

  const ext = req.file.originalname.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return res.status(400).json({ success: false, message: `File type .${ext} not allowed` });
  }

  const s3Key = `uploads/legacy/${Date.now()}_${req.file.originalname}`;
  const params = {
    Bucket:      process.env.S3_BUCKET_NAME,
    Key:         s3Key,
    Body:        req.file.buffer,
    ContentType: req.file.mimetype,
  };

  try {
    await s3.upload(params).promise();
    // Return the S3 key as url so existing frontend still works
    const objectUrl = `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
    res.status(200).json({ success: true, message: 'File uploaded', url: objectUrl, s3Key });
  } catch (err) {
    console.error('Legacy upload error:', err);
    res.status(500).json({ success: false, message: 'S3 upload failed', error: err.message });
  }
});

/*************** USER ROUTES ***************/

// Signup
// Signup with rate limiting and password validation
app.post("/api/signup", authLimiter, async (req, res) => {
    try {
        const { name, email, password, role, rollNo, contactNo, inviteCode } = req.body;

        if (!name?.trim() || !email || !password || !role) {
            return res.status(400).json({ success: false, message: "name, email, password and role are required" });
        }

        // Validate email format
        const { validateEmail, validatePassword } = require('./middleware/validation');
        if (!validateEmail(email)) {
            return res.status(400).json({ success: false, message: "Invalid email format" });
        }

        // Validate password strength
        if (!validatePassword(password)) {
            return res.status(400).json({ 
                success: false, 
                message: "Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number" 
            });
        }

        // ── Role access control ──────────────────────────────────────────────
        const VALID_ROLES = ['mentee', 'mentor', 'project_coordinator', 'hod'];

        if (!VALID_ROLES.includes(role)) {
            console.warn(`[SIGNUP] Unknown role attempt: "${role}" — email: ${email}`);
            return res.status(400).json({ success: false, message: "Invalid role selected." });
        }

        // ── Invite code validation for protected roles ───────────────────────
        if (role === 'mentor') {
            if (!inviteCode?.trim() || inviteCode.trim() !== process.env.MENTOR_INVITE_CODE) {
                console.warn(`[SIGNUP] Invalid mentor invite code — email: ${email}`);
                return res.status(403).json({ success: false, message: "Invalid invite code." });
            }
        }

        if (role === 'project_coordinator') {
            if (!inviteCode?.trim() || inviteCode.trim() !== process.env.COORD_CODE) {
                console.warn(`[SIGNUP] Invalid coordinator invite code — email: ${email}`);
                return res.status(403).json({ success: false, message: "Invalid invite code." });
            }
        }

        if (role === 'hod') {
            // Check if any HOD already exists
            const existingHOD = await usersCollection.findOne({
                $or: [{ role: 'hod' }, { roles: 'hod' }]
            });
            if (existingHOD) {
                // HOD exists — require HOD_CODE to add another (admin override)
                if (!inviteCode?.trim() || inviteCode.trim() !== process.env.HOD_CODE) {
                    console.warn(`[SIGNUP] HOD already exists, blocked attempt — email: ${email}`);
                    return res.status(403).json({ success: false, message: "HOD already exists. Contact administrator." });
                }
            }
            // No HOD yet — first HOD can sign up freely (no code required)
        }

        const normalizedEmail = email.toLowerCase();
        const existingUser    = await usersCollection.findOne({ email: normalizedEmail });
        const hashedPassword  = await bcrypt.hash(password, 10);

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');

        // ── Mentee: single-role, one account per email ───────────────────────
        if (role === 'mentee') {
            if (existingUser) {
                // If account exists but is not verified, resend the verification email
                if (!existingUser.isVerified) {
                    const newToken = crypto.randomBytes(32).toString('hex');
                    await usersCollection.updateOne(
                        { email: normalizedEmail },
                        { $set: { verificationToken: newToken } }
                    );
                    const verificationLink = `${process.env.FRONTEND_URL}/verify/${newToken}`;
                    const { emailVerificationEmail } = require('./utils/emailService');
                    setImmediate(async () => {
                        try {
                            const emailTemplate = emailVerificationEmail({ name: existingUser.name || name.trim(), verificationLink });
                            await sendEmail({ to: normalizedEmail, ...emailTemplate });
                            console.log('[Signup] Re-sent verification email to:', normalizedEmail);
                        } catch (e) {
                            console.error('[Email] Re-send verification email failed:', e.message);
                        }
                    });
                    return res.status(200).json({
                        success: true,
                        message: "Account already exists but is not verified. A new verification email has been sent — please check your inbox.",
                        requiresVerification: true
                    });
                }
                return res.status(400).json({ success: false, message: "User already exists" });
            }
            
            console.log('[Signup] Creating mentee account:', normalizedEmail);
            console.log('[Signup] Verification token:', verificationToken);
            
            await usersCollection.insertOne({
                name: name.trim(),
                email: normalizedEmail,
                password: hashedPassword,
                role: 'mentee',
                roles: ['mentee'],
                rollNo: rollNo?.trim() || '',
                contactNo: contactNo?.toString().trim() || '',
                projectStatus: 'pending',
                isVerified: false,
                verificationToken,
                createdAt: new Date(),
            });

            // Send verification email
            const verificationLink = `${process.env.FRONTEND_URL}/verify/${verificationToken}`;
            console.log('[Signup] Verification link:', verificationLink);
            
            const { emailVerificationEmail } = require('./utils/emailService');
            setImmediate(async () => {
                try {
                    const emailTemplate = emailVerificationEmail({ 
                        name: name.trim(), 
                        verificationLink 
                    });
                    await sendEmail({ to: normalizedEmail, ...emailTemplate });
                    console.log('[Signup] Verification email sent to:', normalizedEmail);
                } catch (e) {
                    console.error('[Email] Verification email failed:', e.message);
                }
            });

            return res.status(201).json({ 
                success: true, 
                message: "Account created! Please check your email to verify your account.",
                requiresVerification: true
            });
        }

        // ── Mentor: multi-role merge on same email ───────────────────────────
        if (existingUser) {
            const passwordMatch = existingUser.password.startsWith('$2')
                ? await bcrypt.compare(password, existingUser.password)
                : existingUser.password === password;
            if (!passwordMatch) {
                return res.status(400).json({ success: false, message: "Email already registered with a different password." });
            }
            const currentRoles = existingUser.roles || [existingUser.role];
            if (currentRoles.includes(role)) {
                return res.status(400).json({ success: false, message: `You are already registered as ${role}.` });
            }
            // Add new role — keep roles array updated, don't overwrite primary role field
            await usersCollection.updateOne(
                { email: normalizedEmail },
                { $addToSet: { roles: role } }
            );
            const updatedRoles = [...currentRoles, role];
            const token = generateToken({ email: normalizedEmail, roles: updatedRoles, name: existingUser.name || '' }, role);
            return res.status(200).json({
                success: true,
                message: `Role '${role}' added. Please re-login to continue with your new role.`,
                token,
                roles: updatedRoles,
                requireReLogin: true,
            });
        }

        // New account (mentor / coordinator / hod) - auto-verified for non-mentee roles
        await usersCollection.insertOne({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role,
            roles: [role],
            isVerified: true, // Auto-verify for staff roles
            createdAt: new Date(),
        });
        res.status(201).json({ success: true, message: "Account created successfully. You can now log in." });

    } catch (err) {
        console.error("Signup error:", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// POST /api/mentee/create-project — mentee creates a new project with details and members
app.post("/api/mentee/create-project", requireRole('mentee'), async (req, res) => {
    console.log('[CREATE PROJECT] Request received');
    console.log('[CREATE PROJECT] Body:', req.body);
    console.log('[CREATE PROJECT] User email:', req.userEmail);
    
    const { projectName, projectDuration, description, groupMembers } = req.body;
    
    if (!projectName?.trim()) {
        console.log('[CREATE PROJECT] Validation failed: Project name missing');
        return res.status(400).json({ success: false, message: "Project name is required" });
    }
    if (!projectDuration) {
        console.log('[CREATE PROJECT] Validation failed: Duration missing');
        return res.status(400).json({ success: false, message: "Project duration is required" });
    }
    if (!['6_months', '1_year'].includes(projectDuration)) {
        console.log('[CREATE PROJECT] Validation failed: Invalid duration');
        return res.status(400).json({ success: false, message: "Invalid project duration" });
    }

    // Check for duplicate project name across all mentees (active projects only)
    try {
        const duplicate = await usersCollection.findOne({
            email: { $ne: req.userEmail },
            projectName: { $regex: new RegExp(`^${projectName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        if (duplicate) {
            return res.status(409).json({ success: false, message: `Project name "${projectName.trim()}" is already taken by another student. Please choose a unique name.` });
        }
    } catch (_) {}
    
    // Validate group members if provided
    if (groupMembers && !Array.isArray(groupMembers)) {
        return res.status(400).json({ success: false, message: "groupMembers must be an array" });
    }
    if (groupMembers && groupMembers.length > 5) {
        return res.status(400).json({ success: false, message: "Maximum 5 group members allowed" });
    }
    if (groupMembers) {
        for (const m of groupMembers) {
            if (!m.name?.trim()) {
                return res.status(400).json({ success: false, message: "Each member must have a name" });
            }
        }
        // Check for duplicate emails (ignore empty emails)
        const emails = groupMembers.map(m => m.email?.toLowerCase()).filter(Boolean);
        if (new Set(emails).size !== emails.length) {
            return res.status(400).json({ success: false, message: "Duplicate member emails are not allowed" });
        }
    }
    
    try {
        const user = await usersCollection.findOne({ email: req.userEmail });
        if (!user) {
            console.log('[CREATE PROJECT] User not found');
            return res.status(404).json({ success: false, message: "User not found" });
        }
        
        console.log('[CREATE PROJECT] User found:', user.email);
        console.log('[CREATE PROJECT] Existing project name:', user.projectName);
        
        // Get active batch first (needed for all checks)
        const activeBatch = await batchesCollection.findOne({ isActive: true });
        if (!activeBatch) {
            console.log('[CREATE PROJECT] No active academic year found');
            return res.status(400).json({ 
                success: false, 
                message: "No active academic year. Please contact the coordinator to set up the current academic year." 
            });
        }
        console.log('[CREATE PROJECT] Active batch:', activeBatch.name);
        console.log('[CREATE PROJECT] Active batch ID:', activeBatch._id);
        
        // CRITICAL: Check ALL projects in current batch (including archived ones)
        const allProjectsInBatch = await projectsCollection.find({
            menteeEmail: req.userEmail,
            $or: [
                { batchId: activeBatch._id },
                { batchId: { $exists: false } },
                { batchId: null }
            ]
        }).toArray();

        console.log('[CREATE PROJECT] Total projects in current batch:', allProjectsInBatch.length);

        // Check if any completed 1-year project exists in this batch
        const has1YearProjectInBatch = allProjectsInBatch.some(p =>
            p.duration === '1_year' && p.isCompleted
        );

        if (has1YearProjectInBatch) {
            console.log('[CREATE PROJECT] Already has a completed 1-year project in this batch - BLOCKED');
            return res.status(400).json({
                success: false,
                message: "You cannot create another project in the same academic year after completing a 1-year project. Please wait for the next academic year."
            });
        }

        // Count ALL 6-month projects in current batch (both completed and active)
        const total6MonthProjects = allProjectsInBatch.filter(p =>
            p.duration === '6_months'
        ).length;

        console.log('[CREATE PROJECT] Total 6-month projects in current batch:', total6MonthProjects);

        // Check if already has 2 six-month projects (regardless of completion status)
        if (total6MonthProjects >= 2) {
            console.log('[CREATE PROJECT] Already has 2 six-month projects in this batch - BLOCKED');
            return res.status(400).json({
                success: false,
                message: "You have already created 2 projects in this academic year. Maximum 2 projects (6-months each) allowed per year."
            });
        }

        // If a 6-month project already exists in this batch, second project must also be 6-month
        if (total6MonthProjects >= 1 && projectDuration === '1_year') {
            return res.status(400).json({
                success: false,
                message: "Your second project in the same academic year must be 6 months. A 1-year project is only allowed as your first project."
            });
        }
        
        // Check if previous project is completed (declare variables here for later use)
        const previousProject = await projectsCollection.findOne({ 
            menteeEmail: req.userEmail,
            isArchived: { $ne: true } // Only check active project
        });
        const previousAssignment = await db.collection('assignments').findOne({ 
            menteeEmail: req.userEmail,
            isArchived: { $ne: true } // Only check active assignment
        });
        const isCompleted = previousProject?.isCompleted || previousAssignment?.finalRemark;
        const isRejected = user.projectStatus === 'rejected';
        
        // Check if project already exists
        if (user.projectName) {
            console.log('[CREATE PROJECT] Project already exists');
            
            // Allow new project only if:
            // 1. Previous project is completed (has finalRemark) OR
            // 2. Previous project was rejected
            if (!isCompleted && !isRejected) {
                console.log('[CREATE PROJECT] Previous project not completed');
                return res.status(400).json({ 
                    success: false, 
                    message: "Complete your current project before creating a new one. Your mentor must submit a final remark first." 
                });
            }
            
            // If completed or rejected, allow creating new project by clearing old data
            console.log('[CREATE PROJECT] Previous project completed/rejected, allowing new project');
        }
        
        // Sanitize group members
        const sanitizedMembers = groupMembers ? groupMembers.map(m => ({
            name: m.name.trim(),
            email: m.email?.trim().toLowerCase() || '',
            rollNo: m.rollNo?.trim() || '',
            contactNo: m.contactNo?.toString().trim() || '',
        })) : [];
        
        console.log('[CREATE PROJECT] Updating user document...');
        
        // If this is a new project after completion, archive old data
        if (user.projectName && (isCompleted || isRejected)) {
            console.log('[CREATE PROJECT] Marking old project data as archived (keeping for view-only access)...');
            
            // Mark old assignment as archived (keep in assignments collection for viewing)
            const oldAssignment = await db.collection('assignments').findOne({ 
                menteeEmail: req.userEmail,
                isArchived: { $ne: true } // Only find active assignments
            });
            if (oldAssignment) {
                console.log('[CREATE PROJECT] Found old assignment:', oldAssignment._id);
                // Mark as archived instead of deleting
                await db.collection('assignments').updateMany(
                    { 
                        menteeEmail: req.userEmail,
                        isArchived: { $ne: true } // Only archive active assignments
                    },
                    { 
                        $set: { 
                            isArchived: true, 
                            archivedAt: new Date(),
                            archivedProjectName: oldAssignment.projectName 
                        } 
                    }
                );
                console.log('[CREATE PROJECT] Old assignment(s) marked as archived');
            } else {
                console.log('[CREATE PROJECT] No old assignment found');
            }
            
            // Mark old files as archived (keep for viewing)
            const oldFiles = await db.collection(FILE_COL).find({ 
                uploaded_by: req.userEmail,
                isArchived: { $ne: true } // Only find active files
            }).toArray();
            console.log('[CREATE PROJECT] Found', oldFiles.length, 'old files');
            if (oldFiles.length > 0) {
                // Mark all files as archived instead of deleting
                const filesUpdateResult = await db.collection(FILE_COL).updateMany(
                    { 
                        uploaded_by: req.userEmail,
                        isArchived: { $ne: true } // Only archive active files
                    },
                    { 
                        $set: { 
                            isArchived: true, 
                            archivedAt: new Date(),
                            archivedProjectName: user.projectName 
                        } 
                    }
                );
                console.log('[CREATE PROJECT] Files marked as archived:', filesUpdateResult.modifiedCount);
            }
            
            // Mark old project as archived (keep for viewing)
            const oldProject = await projectsCollection.findOne({ 
                menteeEmail: req.userEmail,
                isArchived: { $ne: true } // Only find active projects
            });
            if (oldProject) {
                console.log('[CREATE PROJECT] Found old project:', oldProject._id);
                await projectsCollection.updateMany(
                    { 
                        menteeEmail: req.userEmail,
                        isArchived: { $ne: true } // Only archive active projects
                    },
                    { 
                        $set: { 
                            isArchived: true, 
                            archivedAt: new Date() 
                        } 
                    }
                );
                console.log('[CREATE PROJECT] Old project(s) marked as archived');
            } else {
                console.log('[CREATE PROJECT] No old project found');
            }
            
            console.log('[CREATE PROJECT] Archiving complete - all data kept for view-only access');
        }
        
        // Update user with project details
        await usersCollection.updateOne(
            { email: req.userEmail },
            {
                $set: {
                    projectName: projectName.trim(),
                    projectDuration: projectDuration,
                    projectDescription: description?.trim() || '',
                    groupMembers: sanitizedMembers,
                    projectStatus: 'pending',
                    projectCreatedAt: new Date(),
                    projectCompleted: false, // Reset completion status
                }
            }
        );
        
        console.log('[CREATE PROJECT] User document updated');
        console.log('[CREATE PROJECT] Updating projects collection...');
        
        // Active batch already fetched above
        console.log('[CREATE PROJECT] Using active batch:', activeBatch.name);
        
        // Check if there's an existing active project
        const existingActiveProject = await projectsCollection.findOne({
            menteeEmail: req.userEmail,
            isArchived: { $ne: true }
        });
        
        if (existingActiveProject) {
            // Update existing active project (e.g., editing project details before assignment)
            console.log('[CREATE PROJECT] Updating existing active project');
            await projectsCollection.updateOne(
                { _id: existingActiveProject._id },
                {
                    $set: {
                        projectName: projectName.trim(),
                        duration: projectDuration,
                        description: description?.trim() || '',
                        groupMembers: sanitizedMembers,
                        status: 'pending',
                        updatedAt: new Date(),
                    }
                }
            );
        } else {
            // Create NEW project document (after completing previous project)
            console.log('[CREATE PROJECT] Creating new project document');
            await projectsCollection.insertOne({
                menteeEmail: req.userEmail,
                menteeName: user.name,
                projectName: projectName.trim(),
                duration: projectDuration,
                description: description?.trim() || '',
                groupMembers: sanitizedMembers,
                status: 'pending',
                isCompleted: false,
                isArchived: false,
                batchId: activeBatch._id, // Assign to CURRENT active academic year
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
        
        console.log('[CREATE PROJECT] Projects collection updated');
        console.log('[CREATE PROJECT] Success!');
        
        res.json({
            success: true,
            message: "Project created successfully",
            project: {
                projectName: projectName.trim(),
                projectDuration,
                description: description?.trim() || '',
                groupMembers: sanitizedMembers,
            }
        });
    } catch (err) {
        console.error("Create project error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// PUT /api/mentee/group-members — mentee sets/updates group members (locked after assignment)
app.put("/api/mentee/group-members", requireRole('mentee'), async (req, res) => {
    const { groupMembers } = req.body;
    if (!Array.isArray(groupMembers)) {
        return res.status(400).json({ success: false, message: "groupMembers must be an array" });
    }
    if (groupMembers.length > 5) {
        return res.status(400).json({ success: false, message: "Maximum 5 group members allowed" });
    }
    // Validate each member
    for (const m of groupMembers) {
        if (!m.name?.trim()) return res.status(400).json({ success: false, message: "Each member must have a name" });
    }
    // Check for duplicate emails (ignore empty emails)
    const emails = groupMembers.map(m => m.email?.toLowerCase()).filter(Boolean);
    if (new Set(emails).size !== emails.length) {
        return res.status(400).json({ success: false, message: "Duplicate member emails are not allowed" });
    }
    try {
        const user = await usersCollection.findOne({ email: req.userEmail });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        // Block if project has been finalised
        const assignment = await db.collection('assignments').findOne({ 
            menteeEmail: req.userEmail,
            isArchived: { $ne: true } // Only check active assignments
        });
        if (assignment?.finalRemark) {
            return res.status(403).json({ success: false, message: "Your project has been finalised. Group members cannot be modified." });
        }
        const sanitized = groupMembers.map(m => ({
            name: m.name.trim(),
            email: m.email?.trim().toLowerCase() || '',
            rollNo: m.rollNo?.trim() || '',
            contactNo: m.contactNo?.toString().trim() || '',
        }));
        await usersCollection.updateOne({ email: req.userEmail }, { $set: { groupMembers: sanitized } });
        res.json({ success: true, message: "Group members updated", groupMembers: sanitized });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// GET /api/mentee/group-members — get group members for a mentee (mentor/coordinator/hod can also access)
app.get("/api/mentee/group-members", requireRole('mentee', 'mentor', 'project_coordinator', 'hod'), async (req, res) => {
    const targetEmail = (req.query.email || req.userEmail).toLowerCase();
    try {
        const user = await usersCollection.findOne({ email: targetEmail });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        res.json({ success: true, groupMembers: user.groupMembers || [] });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// PATCH /api/mentee/profile — mentee updates name, contactNo, rollNo
app.patch("/api/mentee/profile", requireRole('mentee'), async (req, res) => {
    const { name, contactNo, rollNo } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, message: "Name is required" });
    try {
        await usersCollection.updateOne(
            { email: req.userEmail },
            { $set: { name: name.trim(), contactNo: contactNo?.toString().trim() || '', rollNo: rollNo?.trim() || '' } }
        );
        res.json({ success: true, message: "Profile updated" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// PATCH /api/mentee/project-name — mentee updates their own project name (only if not assigned)
app.patch("/api/mentee/project-name", requireRole('mentee'), async (req, res) => {
    const { projectName } = req.body;
    if (!projectName?.trim()) return res.status(400).json({ success: false, message: "projectName is required" });
    try {
        const user = await usersCollection.findOne({ email: req.userEmail });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        if (user.projectStatus === 'assigned') {
            return res.status(403).json({ success: false, message: "Project name is locked after mentor assignment" });
        }
        // Check for duplicate project name
        const duplicate = await usersCollection.findOne({
            email: { $ne: req.userEmail },
            projectName: { $regex: new RegExp(`^${projectName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        });
        if (duplicate) {
            return res.status(409).json({ success: false, message: `Project name "${projectName.trim()}" is already taken by another student. Please choose a unique name.` });
        }
        await usersCollection.updateOne({ email: req.userEmail }, { $set: { projectName: projectName.trim(), projectStatus: 'pending' } });
        res.json({ success: true, message: "Project name updated" });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// GET /api/mentee/status — get mentee's project status and assignment info
app.get("/api/mentee/status", requireRole('mentee'), async (req, res) => {
    try {
        const user = await usersCollection.findOne({ email: req.userEmail });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        const assignment = await db.collection("assignments").findOne({ 
            menteeEmail: req.userEmail,
            isArchived: { $ne: true } // Only get active assignment
        });
        // ADDED: fetch project duration — check project doc first, fall back to assignment doc
        const project = await projectsCollection.findOne({ 
            menteeEmail: req.userEmail,
            isArchived: { $ne: true } // Only get active project
        });

        // ADDED: Check project limits in current academic year
        const activeBatch = await batchesCollection.findOne({ isActive: true });

        // If the active project belongs to a DIFFERENT batch than the current active one,
        // treat it as "no project in this batch" so the mentee sees the create form
        const projectInCurrentBatch = project && activeBatch
            ? (!project.batchId || project.batchId.toString() === activeBatch._id.toString())
            : !!project;
        const effectiveActiveProject = projectInCurrentBatch ? project : null;
        const effectiveActiveAssignment = projectInCurrentBatch ? assignment : null;

        // If no active assignment/project IN CURRENT BATCH, fall back to most recent archived ones for display
        const archivedAssignment = !effectiveActiveAssignment ? await db.collection("assignments").findOne(
            { menteeEmail: req.userEmail, isArchived: true },
            { sort: { archivedAt: -1 } }
        ) : null;
        const archivedProject = !effectiveActiveProject ? await projectsCollection.findOne(
            { menteeEmail: req.userEmail, isArchived: true },
            { sort: { archivedAt: -1 } }
        ) : null;

        const archivedCount = !effectiveActiveAssignment ? await db.collection("assignments").countDocuments(
            { menteeEmail: req.userEmail, isArchived: true }
        ) : 0;
        const use6MonthFallback = archivedCount >= 1 && archivedProject?.duration === '6_months';
        const use1YearFallback  = archivedProject?.duration === '1_year';
        const useArchivedFallback = use1YearFallback || use6MonthFallback;

        const effectiveAssignment = effectiveActiveAssignment || (useArchivedFallback ? archivedAssignment : null);
        const effectiveProject    = effectiveActiveProject    || (useArchivedFallback ? archivedProject    : null);

        const resolvedDuration = effectiveProject?.duration || effectiveAssignment?.duration || '6_months';
        const isProjectCompleted = effectiveProject?.isCompleted || effectiveAssignment?.finalRemark || false;

        // canCreateNewProject: true if no active project in current batch
        let canCreateNewProject = !effectiveActiveProject || isProjectCompleted || user.projectStatus === 'rejected';
        let projectLimitReason = null;
        let completed6MonthCount = 0;
        let has1YearCompleted = false;
        
        if (activeBatch && canCreateNewProject) {
            // Get all projects in current batch — also include projects with no batchId (legacy data)
            const allProjectsInBatch = await projectsCollection.find({
                menteeEmail: req.userEmail,
                $or: [
                    { batchId: activeBatch._id },
                    { batchId: { $exists: false } },
                    { batchId: null }
                ]
            }).toArray();

            // Check if has completed 1-year project in this batch
            has1YearCompleted = allProjectsInBatch.some(p =>
                p.duration === '1_year' && p.isCompleted
            );

            // Count ALL 6-month projects in this batch (both completed and active)
            const total6MonthProjects = allProjectsInBatch.filter(p =>
                p.duration === '6_months'
            ).length;

            // For display purposes, also count completed ones
            completed6MonthCount = allProjectsInBatch.filter(p =>
                p.duration === '6_months' && p.isCompleted
            ).length;

            // Block if already has completed 1-year project OR 2 six-month projects
            if (has1YearCompleted) {
                canCreateNewProject = false;
                projectLimitReason = '1_year_completed';
            } else if (total6MonthProjects >= 2) {
                canCreateNewProject = false;
                projectLimitReason = 'max_6_month_reached';
            }
        }
        
        // Check for unread notifications
        const notifications = await db.collection("notifications")
            .find({ recipientEmail: req.userEmail, read: false })
            .sort({ createdAt: -1 }).toArray();
        res.json({
            success: true,
            data: {
                name: user.name || '',
                rollNo: user.rollNo || '',
                contactNo: user.contactNo || '',
                projectName: effectiveActiveProject?.projectName || (useArchivedFallback ? effectiveProject?.projectName || effectiveAssignment?.projectName : '') || '',
                projectDuration: effectiveActiveProject?.duration || user.projectDuration || effectiveProject?.duration || '6_months',
                projectDescription: effectiveActiveProject?.description || user.projectDescription || (useArchivedFallback ? effectiveProject?.description : '') || '',
                projectStatus: effectiveActiveProject ? (user.projectStatus || 'pending') : 'pending',
                groupMembers: user.groupMembers || [],
                assignment: (useArchivedFallback ? effectiveAssignment : effectiveActiveAssignment) || null,
                deadline: (useArchivedFallback ? effectiveAssignment : effectiveActiveAssignment)?.deadline || null,
                extendedDeadline: (useArchivedFallback ? effectiveAssignment : effectiveActiveAssignment)?.extendedDeadline || null,
                duration: resolvedDuration,
                isProjectCompleted,
                canCreateNewProject,
                projectLimitReason,
                completed6MonthCount,
                has1YearCompleted, // ADDED: whether 1-year project is completed
                notifications,
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// POST /api/notifications/read — mark notifications as read
app.post("/api/notifications/read", requireRole('mentee', 'mentor'), async (req, res) => {
    try {
        await db.collection("notifications").updateMany(
            { recipientEmail: req.userEmail, read: false },
            { $set: { read: true } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Login with rate limiting
app.post("/api/login", authLimiter, async (req, res) => {
    const { email, password, role } = req.body;
    const normalizedEmail = email.toLowerCase();

    try {
        const user = await usersCollection.findOne({ email: normalizedEmail });
        if (!user) return res.status(400).json({ success: false, message: "User not found" });

        // Google-only users have no password — direct them to use Google Sign In
        if (!user.password && user.authProvider === 'google') {
            return res.status(400).json({ 
                success: false, 
                message: "This account uses Google Sign In. Please click 'Sign in with Google' instead.",
                googleOnly: true
            });
        }

        // Support both bcrypt hashed and legacy plaintext passwords
        let passwordValid = false;
        if (user.password.startsWith('$2')) {
            passwordValid = await bcrypt.compare(password, user.password);
        } else {
            passwordValid = user.password === password;
        }
        if (!passwordValid) return res.status(400).json({ success: false, message: "Invalid password" });

        // Check email verification for mentees
        console.log('[Login] User:', user.email, 'Role:', user.role, 'isVerified:', user.isVerified);
        if (user.role === 'mentee' && user.isVerified === false) {
            return res.status(403).json({ 
                success: false, 
                message: "Please verify your email before logging in. Check your inbox for the verification link.",
                requiresVerification: true
            });
        }

        // Build effective roles array (support both old `role` string and new `roles` array)
        const effectiveRoles = (user.roles?.length ? user.roles : null) || [user.role];

        // If a specific role was requested, validate it
        if (role && !effectiveRoles.includes(role)) {
            return res.status(403).json({ success: false, message: `You are not registered as ${role}` });
        }

        // Default to first staff role (not mentee) if no role specified
        const staffRoles = effectiveRoles.filter(r => r !== 'mentee');
        const resolvedRole = role || (staffRoles.length > 0 ? staffRoles[0] : effectiveRoles[0]);
        const token = generateToken({ email: user.email, roles: effectiveRoles, name: user.name || '' }, resolvedRole);

        res.json({ success: true, token, role: resolvedRole, roles: effectiveRoles, name: user.name || '', email: user.email, userId: user._id });
    } catch (err) {
        console.error("Login error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/*************** EMAIL VERIFICATION ***************/

// GET /api/verify/:token — verify email address
app.get("/api/verify/:token", async (req, res) => {
    const { token } = req.params;

    try {
        console.log('[Verify] Received token:', token);
        const user = await usersCollection.findOne({ verificationToken: token });
        console.log('[Verify] User found:', user ? `${user.email} (isVerified: ${user.isVerified})` : 'null');

        if (!user) {
            // Check if user exists but is already verified (token was removed)
            // This can happen if the link is clicked twice
            return res.status(400).json({ 
                success: false, 
                message: "Invalid or expired verification link. If you already verified, please try logging in." 
            });
        }

        if (user.isVerified) {
            return res.status(200).json({ 
                success: true, 
                message: "Email already verified. You can now log in.",
                alreadyVerified: true
            });
        }

        // Verify the user
        await usersCollection.updateOne(
            { _id: user._id },
            { 
                $set: { isVerified: true },
                $unset: { verificationToken: "" }
            }
        );

        console.log('[Verify] Successfully verified:', user.email);
        res.json({ 
            success: true, 
            message: "Email verified successfully! You can now log in." 
        });
    } catch (err) {
        console.error("Verification error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/*************** GOOGLE OAUTH AUTHENTICATION ***************/

// Rate limiter for Google OAuth attempts
const googleAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per window
  message: { success: false, message: 'Too many Google authentication attempts, please try again later.' }
});

// TEST ROUTE — verify callback URL is reachable
app.get('/auth/google/callback/test', (req, res) => {
  res.json({ success: true, message: 'Callback route is reachable', callbackURL: process.env.GOOGLE_CALLBACK_URL });
});

// GET /auth/google — initiate Google OAuth
app.get('/auth/google', googleAuthLimiter, (req, res, next) => {
  // Guard: detect if Google is actually calling back here (has 'code' AND 'state' from Google)
  // Our frontend uses 'accessCode' not 'code', so req.query.code = Google's OAuth code
  if (req.query.code && req.query.state && !req.query.role) {
    console.warn('[Google OAuth] ⚠️  Google redirected to /auth/google instead of /auth/google/callback');
    console.warn('[Google OAuth] Fix: In Google Console, set redirect URI to:', process.env.GOOGLE_CALLBACK_URL);
    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?error=misconfigured_redirect`);
  }

  const { role, accessCode } = req.query;

  // Encode role and code into base64 state with our marker — survives the OAuth redirect round-trip
  const stateData = Buffer.from(JSON.stringify({
    _prp: 'prp_v1',       // our marker — distinguishes signup state from passport's internal state
    role: role || 'mentee',
    code: accessCode || null
  })).toString('base64');

  console.log('[Google OAuth] Initiating for role:', role || 'mentee');
  console.log('[Google OAuth] Callback URL configured as:', process.env.GOOGLE_CALLBACK_URL);

  passport.authenticate('google', {
    scope: ['profile', 'email'],
    state: stateData,
    session: false
  })(req, res, next);
});

// GET /auth/google/callback — Google OAuth callback
app.get('/auth/google/callback',
  (req, res, next) => {
    passport.authenticate('google', { session: false }, async (err, user, info) => {
      if (err) {
        console.error('[Google OAuth] Auth error:', err.message);
        return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?error=server_error`);
      }
      if (!user) {
        const reason = info?.message === 'invalid_code' ? 'invalid_code'
          : info?.message === 'not_registered' ? 'not_registered'
          : 'google_auth_failed';
        console.warn('[Google OAuth] Auth failed:', info?.message);
        return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?error=${reason}`);
      }

      try {
        const effectiveRoles = (user.roles?.length ? user.roles : null) || [user.role];
        const primaryRole = user.role;
        const token = generateToken(
          { email: user.email, roles: effectiveRoles, name: user.name || '' },
          primaryRole
        );

        console.log('[Google OAuth] Success:', user.email, '| Role:', primaryRole, '| All roles:', effectiveRoles);

        // New user needs to complete their profile (choose role)
        if (user.needsProfile) {
          const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback#token=${token}&needsProfile=true&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name || '')}`;
          return res.redirect(redirectUrl);
        }

        // Pass all roles so frontend can show role picker if needed
        const redirectUrl = `${process.env.FRONTEND_URL}/auth/callback#token=${token}&role=${primaryRole}&roles=${encodeURIComponent(JSON.stringify(effectiveRoles))}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name || '')}`;
        res.redirect(redirectUrl);
      } catch (tokenErr) {
        console.error('[Google OAuth] Token generation error:', tokenErr);
        res.redirect(`${process.env.FRONTEND_URL}/auth/callback?error=server_error`);
      }
    })(req, res, next);
  }
);

/*************** PASSWORD RESET ROUTES ***************/

// GET /api/auth/profile-status — check if current token user needs profile completion
app.get("/api/auth/profile-status", verifyToken, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ email: req.user.email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, needsProfile: !!user.needsProfile, role: user.role || null });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// POST /api/auth/complete-profile — finalize Google user's role after OAuth
app.post("/api/auth/complete-profile", verifyToken, async (req, res) => {
  const { role, inviteCode, rollNo, contactNo } = req.body;
  const email = req.user?.email;
  if (!email) return res.status(401).json({ success: false, message: "Unauthorized" });

  const VALID_ROLES = ['mentee', 'mentor', 'project_coordinator', 'hod'];
  if (!VALID_ROLES.includes(role))
    return res.status(400).json({ success: false, message: "Invalid role selected." });

  // Validate invite codes for staff roles
  if (role === 'mentor' && inviteCode?.trim() !== process.env.MENTOR_INVITE_CODE)
    return res.status(403).json({ success: false, message: "Invalid invite code for Mentor." });
  if (role === 'project_coordinator' && inviteCode?.trim() !== process.env.COORD_CODE)
    return res.status(403).json({ success: false, message: "Invalid invite code for Coordinator." });
  if (role === 'hod' && inviteCode?.trim() !== process.env.HOD_CODE)
    return res.status(403).json({ success: false, message: "Invalid invite code for HOD." });

  try {
    const user = await usersCollection.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ success: false, message: "User not found." });
    if (!user.needsProfile)
      return res.status(400).json({ success: false, message: "Profile already completed." });

    const update = {
      role,
      roles: [role],
      needsProfile: false,
    };
    if (role === 'mentee') {
      update.rollNo = rollNo?.trim() || '';
      update.contactNo = contactNo?.toString().trim() || '';
      update.projectStatus = 'pending';
    }

    await usersCollection.updateOne({ email: email.toLowerCase() }, { $set: update });

    // Generate a fresh token with the real role
    const token = generateToken({ email: email.toLowerCase(), roles: [role], name: user.name || '' }, role);
    res.json({ success: true, role, token });
  } catch (err) {
    console.error('[complete-profile] Error:', err);
    res.status(500).json({ success: false, message: "Server error." });
  }
});



const { generateOTP, hashOTP, verifyOTP } = require('./utils/otpService');
const { passwordResetOTPEmail } = require('./utils/emailService');
const { COLLECTION: RESET_COL, OTP_EXPIRY_MINUTES, MAX_ATTEMPTS } = require('./models/passwordReset');

/**
 * POST /api/password/forgot
 * Request password reset OTP
 * Body: { email }
 */
app.post("/api/password/forgot", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    const normalizedEmail = email.toLowerCase();

    try {
        // Check if user exists
        const user = await usersCollection.findOne({ email: normalizedEmail });
        if (!user) {
            // Security: Don't reveal if email exists or not
            return res.json({ success: true, message: "If this email is registered, you will receive an OTP shortly." });
        }

        const resetCol = db.collection(RESET_COL);

        // Rate limiting: Check if there's a recent unexpired OTP
        const existingReset = await resetCol.findOne({
            email: normalizedEmail,
            expiresAt: { $gt: new Date() },
            verified: false,
        });

        if (existingReset) {
            const timeLeft = Math.ceil((existingReset.expiresAt - new Date()) / 1000 / 60);
            return res.status(429).json({
                success: false,
                message: `An OTP was already sent. Please wait ${timeLeft} minute(s) before requesting a new one.`,
            });
        }

        // Generate OTP
        const otp = generateOTP();
        const hashedOTP = hashOTP(otp);
        const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

        // Save to DB
        await resetCol.insertOne({
            email: normalizedEmail,
            otp: hashedOTP,
            createdAt: new Date(),
            expiresAt,
            attempts: 0,
            verified: false,
        });

        // Send email (fire-and-forget)
        setImmediate(async () => {
            try {
                const tpl = passwordResetOTPEmail({ userName: user.name || normalizedEmail, otp });
                await sendEmail({ to: normalizedEmail, ...tpl });
            } catch (e) {
                console.error('[Email] Password reset OTP send failed:', e.message);
            }
        });

        res.json({ success: true, message: "OTP sent to your email. Valid for 5 minutes." });
    } catch (err) {
        console.error("Forgot password error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/**
 * POST /api/password/verify-otp
 * Verify OTP before allowing password reset
 * Body: { email, otp }
 */
app.post("/api/password/verify-otp", authLimiter, async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ success: false, message: "Email and OTP are required" });

    const normalizedEmail = email.toLowerCase();

    try {
        const resetCol = db.collection(RESET_COL);

        // Find the most recent unexpired OTP
        const resetDoc = await resetCol.findOne({
            email: normalizedEmail,
            expiresAt: { $gt: new Date() },
            verified: false,
        });

        if (!resetDoc) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
        }

        // Check max attempts
        if (resetDoc.attempts >= MAX_ATTEMPTS) {
            await resetCol.deleteOne({ _id: resetDoc._id });
            return res.status(403).json({ success: false, message: "Too many failed attempts. Please request a new OTP." });
        }

        // Verify OTP
        if (!verifyOTP(otp, resetDoc.otp)) {
            await resetCol.updateOne({ _id: resetDoc._id }, { $inc: { attempts: 1 } });
            const attemptsLeft = MAX_ATTEMPTS - (resetDoc.attempts + 1);
            return res.status(400).json({
                success: false,
                message: `Invalid OTP. ${attemptsLeft} attempt(s) remaining.`,
            });
        }

        // Mark as verified
        await resetCol.updateOne({ _id: resetDoc._id }, { $set: { verified: true } });

        res.json({ success: true, message: "OTP verified successfully. You can now reset your password." });
    } catch (err) {
        console.error("Verify OTP error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/**
 * POST /api/password/reset
 * Reset password after OTP verification
 * Body: { email, otp, newPassword }
 */
app.post("/api/password/reset", async (req, res) => {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
        return res.status(400).json({ success: false, message: "Email, OTP, and new password are required" });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: "Password must be at least 6 characters" });
    }

    const normalizedEmail = email.toLowerCase();

    try {
        const resetCol = db.collection(RESET_COL);

        // Find verified OTP
        const resetDoc = await resetCol.findOne({
            email: normalizedEmail,
            expiresAt: { $gt: new Date() },
            verified: true,
        });

        if (!resetDoc) {
            return res.status(400).json({ success: false, message: "Invalid or expired OTP. Please verify OTP first." });
        }

        // Double-check OTP matches
        if (!verifyOTP(otp, resetDoc.otp)) {
            return res.status(400).json({ success: false, message: "Invalid OTP" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user password
        const result = await usersCollection.updateOne(
            { email: normalizedEmail },
            { $set: { password: hashedPassword } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        // Delete used OTP
        await resetCol.deleteOne({ _id: resetDoc._id });

        res.json({ success: true, message: "Password reset successfully. You can now log in with your new password." });
    } catch (err) {
        console.error("Reset password error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// GET /api/role-availability — check if singleton roles still have open slots
app.get("/api/role-availability", async (req, res) => {
    try {
        const pcCount = await usersCollection.countDocuments({ $or: [{ roles: 'project_coordinator' }, { role: 'project_coordinator', roles: { $exists: false } }] });
        const hodCount = await usersCollection.countDocuments({ $or: [{ roles: 'hod' }, { role: 'hod', roles: { $exists: false } }] });
        res.json({
            success: true,
            data: {
                project_coordinator: { available: pcCount === 0, filled: pcCount > 0 },
                hod: { available: hodCount === 0, filled: hodCount > 0 },
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// GET /api/public/stats — no auth, for homepage
app.get("/api/public/stats", async (req, res) => {
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

// Get mentors — accessible by coordinator and hod only
app.get("/api/mentors", verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
    try {
        const mentors = await usersCollection.find({ $or: [{ role: "mentor" }, { roles: "mentor" }] }).toArray();
        res.json({ success: true, data: mentors });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch mentors" });
    }
});

// Get mentees — accessible by coordinator and hod only
app.get("/api/mentees", verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
    try {
        const mentees = await usersCollection.find({ $or: [{ role: "mentee" }, { roles: "mentee" }] })
            .project({ email: 1, name: 1, rollNo: 1, contactNo: 1, projectName: 1, projectDuration: 1, projectStatus: 1, groupMembers: 1 }).toArray();
        res.json({ success: true, data: mentees });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch mentees" });
    }
});

// DELETE /api/users/:email — remove a user account with full cascade (coordinator only)
app.delete("/api/users/:email", verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
    const email = req.params.email.toLowerCase();
    try {
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        // Cascade delete all related data in parallel
        await Promise.all([
            usersCollection.deleteOne({ email }),
            db.collection('assignments').deleteMany({ $or: [{ menteeEmail: email }, { mentorEmail: email }] }),
            projectsCollection.deleteMany({ menteeEmail: email }),
            db.collection('notifications').deleteMany({ recipientEmail: email }),
            db.collection('file_metadata').deleteMany({ uploaded_by: email }),
        ]);

        res.json({ success: true, message: `User ${email} and all related data removed successfully` });
    } catch (err) {
        console.error('[DELETE USER]', err);
        res.status(500).json({ success: false, message: "Failed to remove user" });
    }
});

// PATCH /api/coordinator/project-status — approve or reject a mentee's project
app.patch("/api/coordinator/project-status", verifyToken, checkRole('project_coordinator'), async (req, res) => {
    const { menteeEmail, status } = req.body; // status: 'approved' | 'rejected'
    if (!menteeEmail || !['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, message: "menteeEmail and valid status required" });
    }
    try {
        const mentee = await usersCollection.findOne({ email: menteeEmail.toLowerCase(), $or: [{ role: 'mentee' }, { roles: 'mentee' }] });
        if (!mentee) return res.status(404).json({ success: false, message: "Mentee not found" });

        await usersCollection.updateOne(
            { email: menteeEmail.toLowerCase() },
            { $set: { projectStatus: status } }
        );

        // Notify mentee
        await db.collection("notifications").insertOne({
            recipientEmail: menteeEmail.toLowerCase(),
            recipientRole: 'mentee',
            message: status === 'approved'
                ? `Your project "${mentee.projectName}" has been approved by the coordinator.`
                : `Your project "${mentee.projectName}" has been rejected. Please update your project name.`,
            read: false,
            createdAt: new Date(),
        });

        res.json({ success: true, message: `Project ${status}` });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

/*************** BATCH (ACADEMIC YEAR) ROUTES ***************/

// GET /api/batches — get all academic years
app.get("/api/batches", verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
    try {
        const batches = await batchesCollection.find({}).sort({ createdAt: -1 }).toArray();
        res.json({ success: true, data: batches });
    } catch (err) {
        console.error('[BATCH FETCH] Error:', err);
        res.status(500).json({ success: false, message: "Failed to fetch batches" });
    }
});

// GET /api/batches/active — get active academic year
app.get("/api/batches/active", async (req, res) => {
    try {
        const activeBatch = await batchesCollection.findOne({ isActive: true });
        if (!activeBatch) {
            return res.json({ success: true, data: null });
        }
        res.json({ success: true, data: activeBatch });
    } catch (err) {
        console.error('[BATCH ACTIVE] Error:', err);
        res.status(500).json({ success: false, message: "Failed to fetch active batch" });
    }
});

// POST /api/batches — create new academic year (coordinator only)
app.post("/api/batches", verifyToken, checkRole('project_coordinator'), async (req, res) => {
    const { name, isActive } = req.body;
    if (!name?.trim()) {
        return res.status(400).json({ success: false, message: "Batch name is required (e.g., '2025-26')" });
    }
    try {
        // Check if batch already exists
        const existing = await batchesCollection.findOne({ name: name.trim() });
        if (existing) {
            return res.status(409).json({ success: false, message: "Academic year already exists" });
        }
        
        // If this batch is active, deactivate all others
        if (isActive) {
            await batchesCollection.updateMany({}, { $set: { isActive: false } });
        }
        
        const batch = {
            name: name.trim(),
            isActive: isActive || false,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        
        const result = await batchesCollection.insertOne(batch);
        batch._id = result.insertedId;
        
        res.status(201).json({ success: true, message: "Academic year created", data: batch });
    } catch (err) {
        console.error('[BATCH CREATE] Error:', err);
        res.status(500).json({ success: false, message: "Failed to create batch", error: err.message });
    }
});

// PATCH /api/batches/:id/activate — set batch as active (coordinator only)
app.patch("/api/batches/:id/activate", verifyToken, checkRole('project_coordinator'), async (req, res) => {
    try {
        const batchId = new ObjectId(req.params.id);
        const batch = await batchesCollection.findOne({ _id: batchId });
        
        if (!batch) {
            return res.status(404).json({ success: false, message: "Academic year not found" });
        }
        
        // Deactivate all other batches
        await batchesCollection.updateMany(
            { _id: { $ne: batchId } }, 
            { $set: { isActive: false, updatedAt: new Date() } }
        );
        
        // Activate this batch
        await batchesCollection.updateOne(
            { _id: batchId },
            { $set: { isActive: true, updatedAt: new Date() } }
        );
        
        res.json({ success: true, message: `Academic year ${batch.name} is now active` });
    } catch (err) {
        console.error('[BATCH ACTIVATE] Error:', err);
        res.status(500).json({ success: false, message: "Failed to activate batch" });
    }
});

// DELETE /api/batches/:id — delete a batch (coordinator only)
app.delete("/api/batches/:id", verifyToken, checkRole('project_coordinator'), async (req, res) => {
    try {
        const batchId = new ObjectId(req.params.id);
        const batch = await batchesCollection.findOne({ _id: batchId });
        
        if (!batch) {
            return res.status(404).json({ success: false, message: "Academic year not found" });
        }
        
        // Check if batch is active
        if (batch.isActive) {
            return res.status(400).json({ 
                success: false, 
                message: "Cannot delete active academic year. Please activate another batch first." 
            });
        }
        
        // Check if any projects are assigned to this batch
        const projectsCount = await projectsCollection.countDocuments({ batchId: batchId });
        if (projectsCount > 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Cannot delete this academic year. ${projectsCount} project(s) are assigned to it.` 
            });
        }
        
        // Delete the batch
        await batchesCollection.deleteOne({ _id: batchId });
        
        res.json({ success: true, message: `Academic year ${batch.name} deleted successfully` });
    } catch (err) {
        console.error('[BATCH DELETE] Error:', err);
        res.status(500).json({ success: false, message: "Failed to delete batch" });
    }
});

/*************** PROJECT ROUTES ***************/

// Add project and assign mentor + mentee — coordinator only
app.post("/api/add-project", verifyToken, checkRole('project_coordinator'), async (req, res) => {
    // ADDED: duration field
    const { projectName, mentorEmail, menteeEmail, duration } = req.body;

    if (!projectName || !mentorEmail || !menteeEmail) {
        return res.status(400).json({ success: false, message: "All fields are required" });
    }

    // ADDED: validate duration
    const validDurations = ['6_months', '1_year'];
    const resolvedDuration = validDurations.includes(duration) ? duration : '6_months';

    try {
        const mentor = await usersCollection.findOne({ email: mentorEmail, $or: [{ role: "mentor" }, { roles: "mentor" }] });
        const mentee = await usersCollection.findOne({ email: menteeEmail, $or: [{ role: "mentee" }, { roles: "mentee" }] });

        if (!mentor || !mentee) {
            return res.status(400).json({ success: false, message: "Invalid mentor or mentee email" });
        }

        const result = await projectsCollection.insertOne({
            projectName,
            mentorEmail,
            menteeEmail,
            duration: resolvedDuration, // ADDED
            createdAt: new Date(),
        });

        res.json({ success: true, message: "Project added successfully", projectId: result.insertedId });
    } catch (error) {
        console.error("Error adding project:", error);
        res.status(500).json({ success: false, message: "Server error while adding project" });
    }
});

// Get all projects — coordinator and hod
app.get("/api/projects", verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
    try {
        const projects = await projectsCollection.find({}).toArray();
        res.json({ success: true, data: projects });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch projects" });
    }
});

// Get mentor's projects — mentor only
app.get("/api/mentor-projects", verifyToken, checkRole('mentor'), async (req, res) => {
    const { mentorEmail } = req.query;
    if (!mentorEmail) {
        return res.status(400).json({ success: false, message: "Mentor email is required" });
    }

    try {
        const projects = await projectsCollection.find({ mentorEmail }).toArray();
        res.json({ success: true, data: projects });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch mentor's projects" });
    }
});

// HOD view: All assignments enriched with mentor + mentee info
app.get("/api/hod/project-details", verifyToken, checkRole('hod', 'project_coordinator'), async (req, res) => {
    try {
        const assignments = await db.collection("assignments").find({}).toArray();

        // Batch fetch all unique mentors, mentees, and projects in parallel
        const mentorEmails = [...new Set(assignments.map(a => a.mentorEmail).filter(Boolean))];
        const menteeEmails = [...new Set(assignments.map(a => a.menteeEmail).filter(Boolean))];

        const [mentorDocs, menteeDocs, projectDocs] = await Promise.all([
            usersCollection.find({ email: { $in: mentorEmails } }).toArray(),
            usersCollection.find({ email: { $in: menteeEmails } }).toArray(),
            projectsCollection.find({ menteeEmail: { $in: menteeEmails } }).toArray(),
        ]);

        const mentorMap  = Object.fromEntries(mentorDocs.map(u => [u.email, u]));
        const menteeMap  = Object.fromEntries(menteeDocs.map(u => [u.email, u]));

        const detailed = assignments.map(a => {
            const mentor = mentorMap[a.mentorEmail];
            const mentee = menteeMap[a.menteeEmail];

            // Match project: archived assignment → archived project with same name; active → active project
            const project = a.isArchived
                ? projectDocs.find(p => p.menteeEmail === a.menteeEmail && p.projectName === a.projectName && p.isArchived)
                : projectDocs.find(p => p.menteeEmail === a.menteeEmail && !p.isArchived);

            const duration = project?.duration || a.duration || '6_months';
            return {
                _id: a._id,
                projectName: a.projectName,
                duration,
                batchId: project?.batchId || a.batchId || null,
                isArchived: a.isArchived || false,
                mentor: mentor ? { email: mentor.email, name: mentor.name || '' } : { email: a.mentorEmail, name: '' },
                mentee: mentee ? { email: mentee.email, name: mentee.name || '', rollNo: mentee.rollNo || '', contactNo: mentee.contactNo || '' } : { email: a.menteeEmail, name: '', rollNo: '', contactNo: '' },
                groupMembers: mentee?.groupMembers || [],
                assignedBy: a.assignedBy,
                createdAt: a.createdAt,
                updatedAt: a.updatedAt,
                finalRemark: a.finalRemark || null,
                finalRemarkedAt: a.finalRemarkedAt || null,
            };
        });

        res.json({ success: true, data: detailed });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch HOD project details" });
    }
});

// HOD: Generate pre-signed S3 URL for secure file access
app.post("/api/hod/presigned-url", verifyToken, checkRole('hod', 'project_coordinator'), async (req, res) => {
    const { fileUrl } = req.body;
    if (!fileUrl) return res.status(400).json({ success: false, message: "fileUrl is required" });

    try {
        const key = extractS3Key(fileUrl);
        const params = { Bucket: process.env.S3_BUCKET_NAME, Key: key, Expires: 300 };
        const signedUrl = s3.getSignedUrl("getObject", params);
        res.json({ success: true, url: signedUrl });
    } catch (err) {
        console.error("Pre-signed URL error:", err);
        res.status(500).json({ success: false, message: "Failed to generate pre-signed URL" });
    }
});

// HOD: Stats summary
app.get("/api/hod/stats", verifyToken, checkRole('hod', 'project_coordinator'), async (req, res) => {
    try {
        const [mentorCount, menteeCount, assignmentCount] = await Promise.all([
            usersCollection.countDocuments({ $or: [{ role: "mentor" }, { roles: "mentor" }] }),
            usersCollection.countDocuments({ $or: [{ role: "mentee" }, { roles: "mentee" }] }),
            db.collection("assignments").countDocuments(),
        ]);
        res.json({ success: true, data: { mentors: mentorCount, mentees: menteeCount, assignments: assignmentCount } });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch stats" });
    }
});

/*************** ASSIGNMENT ROUTES ***************/

// POST /api/assignments — assign mentor to mentee+project — coordinator only
app.post("/api/assignments", verifyToken, checkRole('project_coordinator'), async (req, res) => {
    const { menteeEmail, mentorEmail, assignedBy } = req.body;
    let { projectName } = req.body;
    // ADDED: accept duration, default to 6_months for backward compat
    const validDurations = ['6_months', '1_year'];
    const duration = validDurations.includes(req.body.duration) ? req.body.duration : '6_months';

    if (!menteeEmail || !mentorEmail || !assignedBy) {
        return res.status(400).json({ success: false, message: "menteeEmail, mentorEmail and assignedBy are required" });
    }

    try {
        const mentor = await usersCollection.findOne({ email: mentorEmail.toLowerCase(), $or: [{ role: "mentor" }, { roles: "mentor" }] });
        const mentee = await usersCollection.findOne({ email: menteeEmail.toLowerCase(), $or: [{ role: "mentee" }, { roles: "mentee" }] });

        if (!mentor) return res.status(400).json({ success: false, message: "Mentor not found or invalid role" });
        if (!mentee) return res.status(400).json({ success: false, message: "Mentee not found or invalid role" });

        // Auto-fetch project name from mentee record if not provided
        if (!projectName) projectName = mentee.projectName || '';
        if (!projectName) return res.status(400).json({ success: false, message: "Mentee has no project name set" });

        // Check active batch BEFORE making any changes
        const activeBatch = await db.collection('batches').findOne({ isActive: true });
        if (!activeBatch) {
            return res.status(400).json({ success: false, message: "No active academic year found. Please set one first." });
        }

        // Prevent duplicate: one mentee can only have one active assignment
        const existing = await db.collection("assignments").findOne({ 
            menteeEmail: menteeEmail.toLowerCase(),
            isArchived: { $ne: true } // Only check for non-archived assignments
        });
        if (existing) {
            // Check if the existing assignment is for a completed project
            const existingProject = await projectsCollection.findOne({ menteeEmail: menteeEmail.toLowerCase() });
            if (existingProject?.isCompleted || existing.finalRemark) {
                return res.status(409).json({ 
                    success: false, 
                    message: "This mentee's previous project is completed but not archived. Ask the mentee to create a new project first." 
                });
            }
            // Sync projectStatus in case it's out of date — no side effects, just a repair
            await usersCollection.updateOne(
                { email: menteeEmail.toLowerCase(), projectStatus: { $ne: 'assigned' } },
                { $set: { projectStatus: 'assigned' } }
            );
            return res.status(409).json({ success: false, message: "This mentee already has an active assignment." });
        }

        const result = await db.collection("assignments").insertOne({
            projectName,
            menteeEmail: menteeEmail.toLowerCase(),
            mentorEmail: mentorEmail.toLowerCase(),
            assignedBy: assignedBy.toLowerCase(),
            duration, // ADDED
            isArchived: false, // Explicitly set as not archived
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        // Lock project name on mentee record
        await usersCollection.updateOne(
            { email: menteeEmail.toLowerCase() },
            { $set: { projectStatus: 'assigned', projectName } }
        );

        // ADDED: upsert project doc with duration so phase validation works
        await projectsCollection.updateOne(
            { 
                menteeEmail: menteeEmail.toLowerCase(),
                isArchived: { $ne: true } // Only update active project
            },
            { 
                $set: { 
                    projectName, 
                    mentorEmail: mentorEmail.toLowerCase(), 
                    duration, 
                    batchId: activeBatch._id, // Ensure project is in current active academic year
                    updatedAt: new Date() 
                }, 
                $setOnInsert: { 
                    createdAt: new Date(), 
                    isArchived: false,
                    menteeEmail: menteeEmail.toLowerCase(),
                    menteeName: mentee.name || menteeEmail
                } 
            },
            { upsert: true }
        );

        // Notify mentee
        await db.collection("notifications").insertOne({
            recipientEmail: menteeEmail.toLowerCase(),
            recipientRole: 'mentee',
            message: `You have been assigned a mentor: ${mentorEmail}. Your project "${projectName}" is now active.`,
            read: false,
            createdAt: new Date(),
        });

        // Notify mentor
        await db.collection("notifications").insertOne({
            recipientEmail: mentorEmail.toLowerCase(),
            recipientRole: 'mentor',
            message: `Project "${projectName}" by ${menteeEmail} has been assigned to you.`,
            read: false,
            createdAt: new Date(),
        });

        res.status(201).json({ success: true, message: "Assignment created successfully", assignmentId: result.insertedId });

        // Fire-and-forget emails
        setImmediate(async () => {
          try {
            const tplMentee = assignmentCreatedMenteeEmail({ menteeName: mentee.name || menteeEmail, projectName, mentorEmail });
            await sendEmail({ to: menteeEmail.toLowerCase(), ...tplMentee });
            const tplMentor = assignmentCreatedMentorEmail({ mentorName: mentor.name || mentorEmail, projectName, menteeName: mentee.name || menteeEmail, menteeEmail: menteeEmail.toLowerCase() });
            await sendEmail({ to: mentorEmail.toLowerCase(), ...tplMentor });
          } catch (e) { console.error('[Email] assignment trigger:', e.message); }
        });
    } catch (err) {
        console.error("Assignment error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// POST /api/assignments/bulk-csv — bulk assign mentors via CSV — coordinator only
// CSV format (header row required): menteeEmail,mentorEmail,duration
app.post("/api/assignments/bulk-csv", verifyToken, checkRole('project_coordinator'), async (req, res) => {
    const { rows } = req.body; // [{ menteeEmail, mentorEmail, duration? }]
    if (!Array.isArray(rows) || rows.length === 0) {
        return res.status(400).json({ success: false, message: "No rows provided" });
    }

    const assignedBy = req.userEmail;
    const validDurations = ['6_months', '1_year'];
    const results = [];

    for (const row of rows) {
        const menteeEmail = row.menteeEmail?.trim().toLowerCase();
        const mentorEmail = row.mentorEmail?.trim().toLowerCase();
        const duration    = validDurations.includes(row.duration?.trim()) ? row.duration.trim() : '6_months';

        if (!menteeEmail || !mentorEmail) {
            results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: 'Missing email' });
            continue;
        }

        try {
            const mentor = await usersCollection.findOne({ email: mentorEmail, $or: [{ role: 'mentor' }, { roles: 'mentor' }] });
            const mentee = await usersCollection.findOne({ email: menteeEmail, $or: [{ role: 'mentee' }, { roles: 'mentee' }] });

            if (!mentor) { results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: 'Mentor not found' }); continue; }
            if (!mentee) { results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: 'Mentee not found' }); continue; }

            const projectName = mentee.projectName || '';
            if (!projectName) { results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: 'Mentee has no project name set — ask them to set it first' }); continue; }

            const existing = await db.collection('assignments').findOne({ 
                menteeEmail,
                isArchived: { $ne: true } // Only check active assignments
            });
            if (existing) { results.push({ menteeEmail, mentorEmail, duration, status: 'skipped', reason: 'Already assigned' }); continue; }

            if (mentee.projectStatus === 'rejected') {
                results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: 'Project was manually rejected — approve it first before assigning' }); continue;
            }

            await db.collection('assignments').insertOne({
                projectName,
                menteeEmail,
                mentorEmail,
                assignedBy,
                duration, // ADDED
                isArchived: false, // Explicitly set as not archived
                createdAt: new Date(),
                updatedAt: new Date(),
            });

            // Upsert project doc so phase validation works
            // Get current active batch to ensure project is in correct academic year
            const activeBatch = await db.collection('batches').findOne({ isActive: true });
            if (!activeBatch) {
                results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: 'No active academic year found' });
                continue;
            }
            
            await projectsCollection.updateOne(
                { 
                    menteeEmail,
                    isArchived: { $ne: true } // Only update active project
                },
                { 
                    $set: { 
                        projectName, 
                        mentorEmail, 
                        duration, 
                        batchId: activeBatch._id, // Ensure project is in current active academic year
                        updatedAt: new Date() 
                    }, 
                    $setOnInsert: { 
                        createdAt: new Date(), 
                        isArchived: false,
                        menteeEmail,
                        menteeName: mentee.name || menteeEmail
                    } 
                },
                { upsert: true }
            );

            await usersCollection.updateOne({ email: menteeEmail }, { $set: { projectStatus: 'assigned', projectName } });

            await db.collection('notifications').insertOne({
                recipientEmail: menteeEmail, recipientRole: 'mentee',
                message: `You have been assigned a mentor: ${mentorEmail}. Your project "${projectName}" is now active.`,
                read: false, createdAt: new Date(),
            });
            await db.collection('notifications').insertOne({
                recipientEmail: mentorEmail, recipientRole: 'mentor',
                message: `Project "${projectName}" by ${menteeEmail} has been assigned to you.`,
                read: false, createdAt: new Date(),
            });

            results.push({ menteeEmail, mentorEmail, projectName, duration, status: 'success' });
        } catch (err) {
            results.push({ menteeEmail, mentorEmail, duration, status: 'error', reason: err.message });
        }
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    const failed    = results.filter(r => r.status === 'error').length;
    const skipped   = results.filter(r => r.status === 'skipped').length;

    res.json({ success: true, message: `${succeeded} assigned, ${skipped} skipped, ${failed} failed`, results });
});

// GET /api/assignments — get all assignments — coordinator and hod
app.get("/api/assignments", verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
    try {
        // Return ALL assignments — active and archived — so coordinator sees full history
        const assignments = await db.collection("assignments").find({}).sort({ createdAt: -1 }).toArray();
        res.json({ success: true, data: assignments });
    } catch (err) {
        res.status(500).json({ success: false, message: "Failed to fetch assignments" });
    }
});

// GET /api/assignments/mentee/:email — get assignment for a specific mentee
app.get("/api/assignments/mentee/:email", verifyToken, checkRole('mentee', 'project_coordinator', 'hod'), async (req, res) => {
    try {
        // Only return active (non-archived) assignment
        const assignment = await db.collection("assignments").findOne({ 
            menteeEmail: req.params.email.toLowerCase(),
            isArchived: { $ne: true }
        });
        if (!assignment) return res.status(404).json({ success: false, message: "No assignment found" });
        res.json({ success: true, data: assignment }); // includes finalRemark if set
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// GET /api/assignments/mentor/:email — get all mentees assigned to a mentor
app.get("/api/assignments/mentor/:email", verifyToken, checkRole('mentor', 'project_coordinator', 'hod'), async (req, res) => {
    try {
        // Get active academic year
        const activeBatch = await db.collection('batches').findOne({ isActive: true });
        if (!activeBatch) {
            return res.json({ success: true, data: [] }); // No active batch, return empty
        }
        
        // Return ALL assignments (both active and archived) for this mentor
        const assignments = await db.collection("assignments").find({ 
            mentorEmail: req.params.email.toLowerCase()
        })
        .sort({ isArchived: 1, updatedAt: -1 }) // Active first, then by most recent
        .toArray();
        
        // Batch fetch all mentees and projects at once
        const menteeEmails = [...new Set(assignments.map(a => a.menteeEmail).filter(Boolean))];
        const [menteeDocs, projectDocs] = await Promise.all([
            usersCollection.find({ email: { $in: menteeEmails } }).toArray(),
            projectsCollection.find({ menteeEmail: { $in: menteeEmails } }).toArray(),
        ]);
        const menteeMap  = Object.fromEntries(menteeDocs.map(u => [u.email, u]));

        const enriched = assignments.map(a => {
            const mentee = menteeMap[a.menteeEmail];
            const project = a.isArchived
                ? projectDocs.find(p => p.menteeEmail === a.menteeEmail && p.projectName === a.projectName && p.isArchived)
                : projectDocs.find(p => p.menteeEmail === a.menteeEmail && !p.isArchived);

            const duration = project?.duration || a.duration || '6_months';
            const batchId  = project?.batchId || a.batchId || null;
            return { ...a, duration, groupMembers: mentee?.groupMembers || [], menteeName: mentee?.name || '', batchId };
        });
        
        // Filter to only show projects from the active academic year
        // Include assignments with no batchId (legacy data) so they're not silently hidden
        const filtered = enriched.filter(a => 
            !a.batchId || a.batchId.toString() === activeBatch._id.toString()
        );
        
        res.json({ success: true, data: filtered });
    } catch (err) {
        console.error('Mentor assignments error:', err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// PATCH /api/assignments/:id/final-remark — mentor marks project as Done/Accepted
// Only callable by the assigned mentor, only when all uploaded files have been remarked
app.patch("/api/assignments/:id/final-remark", requireRole('mentor'), async (req, res) => {
  const { finalRemark } = req.body;
  if (!finalRemark?.trim()) {
    return res.status(400).json({ success: false, message: 'finalRemark is required' });
  }
  try {
    const assignment = await db.collection("assignments").findOne({ _id: new ObjectId(req.params.id) });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    if (assignment.mentorEmail !== req.userEmail) {
      return res.status(403).json({ success: false, message: 'You are not the assigned mentor' });
    }

    // Verify all uploaded files have a non-pending remark (only check active files)
    const files = await db.collection(FILE_COL).find({ 
        uploaded_by: assignment.menteeEmail,
        isArchived: { $ne: true } // Only check active files
    }).toArray();
    const allRemarked = files.length > 0 && files.every(f => f.remark && f.remark !== 'Pending Review');
    if (!allRemarked) {
      return res.status(400).json({ success: false, message: 'All uploaded files must be reviewed before marking as done' });
    }

    await db.collection("assignments").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { 
          finalRemark: finalRemark.trim(), 
          finalRemarkedAt: new Date(), 
          updatedAt: new Date(),
          isArchived: true,
          archivedAt: new Date(),
          archivedProjectName: assignment.projectName
      }}
    );

    console.log('[FINAL REMARK] Marking project as completed for mentee:', assignment.menteeEmail);

    // Mark project as completed AND archived
    await projectsCollection.updateOne(
      { menteeEmail: assignment.menteeEmail, isArchived: { $ne: true } },
      { $set: { isCompleted: true, completedAt: new Date(), isArchived: true, archivedAt: new Date() } }
    );

    // Archive active files
    await db.collection(FILE_COL).updateMany(
      { uploaded_by: assignment.menteeEmail, isArchived: { $ne: true } },
      { $set: { isArchived: true, archivedAt: new Date(), archivedProjectName: assignment.projectName } }
    );

    // Reset mentee so they can submit a new project
    await usersCollection.updateOne(
      { email: assignment.menteeEmail },
      { $set: { projectCompleted: true, projectStatus: 'pending', projectName: '' } }
    );

    console.log('[FINAL REMARK] Project completed and archived successfully');
    
    res.json({ success: true, message: 'Final remark saved' });

    // Fire-and-forget: notify mentee
    setImmediate(async () => {
      try {
        const mentee = await usersCollection.findOne({ email: assignment.menteeEmail });
        await db.collection('notifications').insertOne({
          recipientEmail: assignment.menteeEmail,
          recipientRole: 'mentee',
          message: `Your project "${assignment.projectName}" has received a final evaluation: ${finalRemark.trim()}`,
          read: false,
          createdAt: new Date(),
        });
        if (mentee?.email) {
          const tpl = finalRemarkEmail({
            menteeName:  mentee.name || assignment.menteeEmail,
            projectName: assignment.projectName || 'Your Project',
            finalRemark: finalRemark.trim(),
          });
          await sendEmail({ to: mentee.email, ...tpl });
        }
      } catch (e) { console.error('[Email] final-remark trigger:', e.message); }
    });
  } catch (err) {
    console.error('Final remark error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/admin/repair-completed-files — archive files for already-finalised assignments
// Run once to fix existing data where finalRemark was set but files weren't archived
app.post("/api/admin/repair-completed-files", verifyToken, checkRole('project_coordinator', 'hod'), async (req, res) => {
  try {
    const finalised = await db.collection("assignments").find({
      finalRemark: { $exists: true, $ne: null, $ne: '' }
    }).toArray();

    let fixed = 0;
    for (const a of finalised) {
      // Archive files that are still active
      const r1 = await db.collection(FILE_COL).updateMany(
        { uploaded_by: a.menteeEmail, isArchived: { $ne: true } },
        { $set: { isArchived: true, archivedAt: new Date(), archivedProjectName: a.projectName } }
      );
      // Archive project doc
      await projectsCollection.updateOne(
        { menteeEmail: a.menteeEmail, isArchived: { $ne: true } },
        { $set: { isCompleted: true, isArchived: true, archivedAt: new Date(), completedAt: a.finalRemarkedAt || new Date() } }
      );
      // Ensure assignment itself is archived
      await db.collection("assignments").updateOne(
        { _id: a._id, isArchived: { $ne: true } },
        { $set: { isArchived: true, archivedAt: new Date(), archivedProjectName: a.projectName } }
      );
      // Reset mentee status if still showing as assigned
      await usersCollection.updateOne(
        { email: a.menteeEmail, projectStatus: { $in: ['assigned', 'approved'] } },
        { $set: { projectStatus: 'pending', projectName: '', projectCompleted: true } }
      );
      if (r1.modifiedCount > 0) fixed++;
    }
    res.json({ success: true, message: `Repaired ${fixed} mentee(s) with unarchived files`, total: finalised.length });
  } catch (err) {
    console.error('[REPAIR]', err);
    res.status(500).json({ success: false, message: 'Repair failed' });
  }
});

// PATCH /api/assignments/:id/deadline — coordinator sets submission deadline
app.patch("/api/assignments/:id/deadline", verifyToken, checkRole('project_coordinator'), async (req, res) => {
    const { deadline } = req.body;
    if (!deadline) return res.status(400).json({ success: false, message: "deadline is required" });
    const parsed = new Date(deadline);
    if (isNaN(parsed)) return res.status(400).json({ success: false, message: "Invalid date format" });
    try {
        const result = await db.collection("assignments").updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { deadline: parsed, updatedAt: new Date() } }
        );
        if (result.matchedCount === 0) return res.status(404).json({ success: false, message: "Assignment not found" });
        res.json({ success: true, message: "Deadline set successfully" });
    } catch (err) {
        console.error("Deadline error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// PUT /api/assignments/:id/set-deadline — mentor sets the original deadline (one-time only)
app.put("/api/assignments/:id/set-deadline", requireRole('mentor'), async (req, res) => {
    const { deadline } = req.body;
    if (!deadline) return res.status(400).json({ success: false, message: "deadline is required" });
    const parsed = new Date(deadline);
    if (isNaN(parsed)) return res.status(400).json({ success: false, message: "Invalid date format" });
    try {
        const assignment = await db.collection("assignments").findOne({ _id: new ObjectId(req.params.id) });
        if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });
        if (assignment.mentorEmail !== req.userEmail) {
            return res.status(403).json({ success: false, message: "Only the assigned mentor can set the deadline" });
        }
        // One-time only — block if already set
        if (assignment.deadline) {
            return res.status(400).json({ success: false, message: "Deadline already set. Use extend-deadline to give more time." });
        }
        await db.collection("assignments").updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { deadline: parsed, updatedAt: new Date() } }
        );
        await db.collection("notifications").insertOne({
            recipientEmail: assignment.menteeEmail,
            recipientRole: 'mentee',
            message: `Your mentor has set a submission deadline: ${parsed.toLocaleString()}.`,
            read: false,
            createdAt: new Date(),
        });
        res.json({ success: true, message: "Deadline set successfully" });

        // Fire-and-forget email
        setImmediate(async () => {
          try {
            const mentee = await usersCollection.findOne({ email: assignment.menteeEmail });
            if (mentee?.email) {
              const tpl = deadlineSetEmail({
                menteeName:  mentee.name || assignment.menteeEmail,
                projectName: assignment.projectName || 'Your Project',
                deadline:    parsed,
              });
              await sendEmail({ to: mentee.email, ...tpl });
            }
          } catch (e) { console.error('[Email] set-deadline trigger:', e.message); }
        });
    } catch (err) {
        console.error("Set deadline error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// PUT /api/assignments/:id/extend-deadline — mentor extends the deadline (one-time only)
app.put("/api/assignments/:id/extend-deadline", requireRole('mentor'), async (req, res) => {
    const { extendedDeadline } = req.body;
    if (!extendedDeadline) return res.status(400).json({ success: false, message: "extendedDeadline is required" });
    const parsed = new Date(extendedDeadline);
    if (isNaN(parsed)) return res.status(400).json({ success: false, message: "Invalid date format" });
    try {
        const assignment = await db.collection("assignments").findOne({ _id: new ObjectId(req.params.id) });
        if (!assignment) return res.status(404).json({ success: false, message: "Assignment not found" });
        if (assignment.mentorEmail !== req.userEmail) {
            return res.status(403).json({ success: false, message: "Only the assigned mentor can extend the deadline" });
        }
        if (!assignment.deadline) {
            return res.status(400).json({ success: false, message: "Set an original deadline before extending" });
        }
        // One-time only — block if already extended
        if (assignment.extendedDeadline) {
            return res.status(400).json({ success: false, message: "Deadline has already been extended once. No further changes allowed." });
        }
        if (parsed <= new Date(assignment.deadline)) {
            return res.status(400).json({ success: false, message: "Extended deadline must be after the original deadline" });
        }
        await db.collection("assignments").updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: { extendedDeadline: parsed, updatedAt: new Date() } }
        );
        await db.collection("notifications").insertOne({
            recipientEmail: assignment.menteeEmail,
            recipientRole: 'mentee',
            message: `Your mentor has extended the deadline to: ${parsed.toLocaleString()}.`,
            read: false,
            createdAt: new Date(),
        });
        res.json({ success: true, message: "Deadline extended successfully" });

        // Fire-and-forget email
        setImmediate(async () => {
          try {
            const mentee = await usersCollection.findOne({ email: assignment.menteeEmail });
            if (mentee?.email) {
              const tpl = deadlineExtendedEmail({
                menteeName:  mentee.name || assignment.menteeEmail,
                projectName: assignment.projectName || 'Your Project',
                oldDeadline: assignment.deadline,
                newDeadline: parsed,
              });
              await sendEmail({ to: mentee.email, ...tpl });
            }
          } catch (e) { console.error('[Email] extend-deadline trigger:', e.message); }
        });
    } catch (err) {
        console.error("Extend deadline error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// PUT /api/assignments/:id — update an assignment — coordinator only
app.put("/api/assignments/:id", verifyToken, checkRole('project_coordinator'), async (req, res) => {
    const { projectName, mentorEmail } = req.body;
    // ADDED: optional duration update
    const validDurations = ['6_months', '1_year'];
    const duration = validDurations.includes(req.body.duration) ? req.body.duration : null;

    if (!projectName && !mentorEmail && !duration) {
        return res.status(400).json({ success: false, message: "Provide at least one field to update" });
    }

    try {
        let updateFields = { updatedAt: new Date() };
        if (projectName) updateFields.projectName = projectName;
        if (duration) updateFields.duration = duration;
        if (mentorEmail) {
            const mentor = await usersCollection.findOne({ email: mentorEmail.toLowerCase(), $or: [{ role: "mentor" }, { roles: "mentor" }] });
            if (!mentor) return res.status(400).json({ success: false, message: "Mentor not found or invalid role" });
            updateFields.mentorEmail = mentorEmail.toLowerCase();
        }

        // Fetch BEFORE update so we have the old values
        const oldAssignment = await db.collection("assignments").findOne({ _id: new ObjectId(req.params.id) });
        if (!oldAssignment) return res.status(404).json({ success: false, message: "Assignment not found" });

        // Block changing to 1_year if mentee already has a completed (archived) 6-month project IN THE SAME batch
        if (duration === '1_year') {
            const activeBatch = await batchesCollection.findOne({ isActive: true });
            if (activeBatch) {
                const archivedInBatch = await projectsCollection.findOne({
                    menteeEmail: oldAssignment.menteeEmail,
                    isArchived: true,
                    batchId: activeBatch._id
                });
                if (archivedInBatch) {
                    return res.status(400).json({
                        success: false,
                        message: "Cannot change to 1-year — this is the 2nd project in the same academic year. Only 6-month duration is allowed."
                    });
                }
            }
        }

        const result = await db.collection("assignments").updateOne(
            { _id: new ObjectId(req.params.id) },
            { $set: updateFields }
        );

        if (result.matchedCount === 0) return res.status(404).json({ success: false, message: "Assignment not found" });

        // Update user's project details if project name or duration changed
        if (projectName || duration) {
            const userUpdateFields = {};
            if (projectName) userUpdateFields.projectName = projectName;
            if (duration) userUpdateFields.projectDuration = duration;
            
            await usersCollection.updateOne(
                { email: oldAssignment.menteeEmail },
                { $set: userUpdateFields }
            );
        }

        // keep project doc in sync — upsert so it works even if no project doc exists yet
        if (duration || projectName) {
            const projectUpdateFields = { updatedAt: new Date() };
            if (duration) projectUpdateFields.duration = duration;
            if (projectName) projectUpdateFields.projectName = projectName;
            
            await projectsCollection.updateOne(
                { 
                    menteeEmail: oldAssignment.menteeEmail,
                    isArchived: { $ne: true } // Only update active project
                },
                {
                    $set: projectUpdateFields,
                    $setOnInsert: { menteeEmail: oldAssignment.menteeEmail, createdAt: new Date(), isArchived: false },
                },
                { upsert: true }
            );
        }

        res.json({ success: true, message: "Assignment updated successfully" });

        // Fire-and-forget: notifications for all changes
        setImmediate(async () => {
            try {
                const mentee = await usersCollection.findOne({ email: oldAssignment.menteeEmail });
                const menteeName = mentee?.name || oldAssignment.menteeEmail;
                const oldProjectName = oldAssignment.projectName || 'Project';
                const newProjectName = projectName || oldProjectName;
                
                // Notify mentee about project name change
                if (projectName && projectName !== oldAssignment.projectName) {
                    await db.collection('notifications').insertOne({
                        recipientEmail: oldAssignment.menteeEmail,
                        recipientRole: 'mentee',
                        message: `Your project name has been updated from "${oldProjectName}" to "${projectName}" by the coordinator.`,
                        read: false,
                        createdAt: new Date(),
                    });
                }
                
                // Notify mentee about duration change
                if (duration && duration !== oldAssignment.duration) {
                    const oldDurationLabel = oldAssignment.duration === '1_year' ? '1 Year' : '6 Months';
                    const newDurationLabel = duration === '1_year' ? '1 Year' : '6 Months';
                    await db.collection('notifications').insertOne({
                        recipientEmail: oldAssignment.menteeEmail,
                        recipientRole: 'mentee',
                        message: `Your project duration has been updated from ${oldDurationLabel} to ${newDurationLabel} by the coordinator.`,
                        read: false,
                        createdAt: new Date(),
                    });
                }
                
                // Notify mentee about mentor change
                if (mentorEmail && oldAssignment.mentorEmail !== mentorEmail.toLowerCase()) {
                    const oldMentor = await usersCollection.findOne({ email: oldAssignment.mentorEmail });
                    const newMentor = await usersCollection.findOne({ email: mentorEmail.toLowerCase() });
                    
                    // Email notifications
                    await sendEmail({ to: oldAssignment.mentorEmail, ...mentorChangedOldMentorEmail({ oldMentorName: oldMentor?.name || oldAssignment.mentorEmail, projectName: newProjectName, menteeName, newMentorEmail: mentorEmail.toLowerCase() }) });
                    await sendEmail({ to: mentorEmail.toLowerCase(), ...mentorChangedNewMentorEmail({ newMentorName: newMentor?.name || mentorEmail, projectName: newProjectName, menteeName, menteeEmail: oldAssignment.menteeEmail, oldMentorEmail: oldAssignment.mentorEmail }) });
                    
                    if (mentee?.email) {
                        await sendEmail({ to: mentee.email, ...mentorChangedMenteeEmail({ menteeName, projectName: newProjectName, oldMentorEmail: oldAssignment.mentorEmail, newMentorEmail: mentorEmail.toLowerCase() }) });
                    }
                    
                    // In-app notification for mentee
                    await db.collection('notifications').insertOne({
                        recipientEmail: oldAssignment.menteeEmail,
                        recipientRole: 'mentee',
                        message: `Your mentor has been changed from ${oldAssignment.mentorEmail} to ${mentorEmail.toLowerCase()} for project "${newProjectName}".`,
                        read: false,
                        createdAt: new Date(),
                    });
                }
            } catch (e) { 
                console.error('[Notification] assignment update trigger:', e.message); 
            }
        });
    } catch (err) {
        console.error("Update error:", err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// GET /api/mentor/notifications — get unread notifications for mentor
app.get("/api/mentor/notifications", requireRole('mentor'), async (req, res) => {
    try {
        const notifications = await db.collection("notifications")
            .find({ recipientEmail: req.userEmail, read: false })
            .sort({ createdAt: -1 }).toArray();
        res.json({ success: true, data: notifications });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ── S3 Pre-signed URL Routes (v3 SDK) ────────────────────────────────────────
app.post("/api/upload-url",   verifyToken, getUploadUrl);
app.post("/api/download-url", verifyToken, getDownloadUrl);

/*************** DASHBOARD ROUTES ***************/

// GET /api/dashboard/mentee/:email
app.get("/api/dashboard/mentee/:email", requireRole('mentee'), async (req, res) => {
    const email = req.params.email.toLowerCase();
    if (req.userEmail !== email) return res.status(403).json({ success: false, message: "Access denied" });
    try {
        const user = await usersCollection.findOne({ email });
        const assignment = await db.collection("assignments").findOne({ 
            menteeEmail: email,
            isArchived: { $ne: true } // Only get active assignment
        });
        // Only get active (non-archived) files for current project
        const files = await db.collection(FILE_COL).find({ 
            uploaded_by: email,
            isArchived: { $ne: true }
        }).toArray();
        const notifications = await db.collection("notifications")
            .find({ recipientEmail: email })
            .sort({ createdAt: -1 }).toArray();

        // Dynamic total sections based on project duration
        const projectDuration = user?.projectDuration || '6_months';
        const allowedPhases = getAllowedPhases(projectDuration);
        const totalSections = allowedPhases.length;
        
        const submitted = files.length;
        const lateCount = files.filter(f => f.isLate).length;
        const pendingReview = files.filter(f => f.remark === 'Pending Review').length;
        const reviewed = files.filter(f => f.remark && f.remark !== 'Pending Review').length;

        // Per-section submission info
        const sectionStatus = files.map(f => ({
            section: f.section,
            filename: f.file_name,
            submittedAt: f.submittedAt,
            isLate: f.isLate,
            submissionStatus: f.submissionStatus || (f.isLate ? 'Late Submission' : 'Submitted'),
            remark: f.remark,
        }));

        res.json({
            success: true,
            data: {
                name: user?.name || '',
                projectName: user?.projectName || '',
                projectStatus: user?.projectStatus || 'pending',
                mentorEmail: assignment?.mentorEmail || null,
                deadline: assignment?.deadline || null,
                extendedDeadline: assignment?.extendedDeadline || null,
                finalRemark: assignment?.finalRemark || null,
                stats: { totalSections, submitted, lateCount, pendingReview, reviewed },
                sectionStatus,
                notifications,
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// GET /api/dashboard/mentor/:email
app.get("/api/dashboard/mentor/:email", requireRole('mentor'), async (req, res) => {
    const email = req.params.email.toLowerCase();
    if (req.userEmail !== email) return res.status(403).json({ success: false, message: "Access denied" });
    try {
        // Get active academic year
        const activeBatch = await db.collection('batches').findOne({ isActive: true });
        if (!activeBatch) {
            return res.json({ success: true, data: { stats: { totalAssigned: 0, totalPendingReview: 0, totalLate: 0, totalAccepted: 0, currentProjects: 0, completedProjects: 0 }, mentees: [] } });
        }
        
        // Get ALL assignments for this mentor (both active and archived)
        const allAssignments = await db.collection("assignments").find({ 
            mentorEmail: email
        }).toArray();
        
        // Filter assignments to only those from active academic year
        const assignmentsWithProjects = await Promise.all(allAssignments.map(async (a) => {
            const project = await projectsCollection.findOne({ 
                menteeEmail: a.menteeEmail,
                isArchived: a.isArchived ? true : { $ne: true }
            });
            return { ...a, batchId: project?.batchId };
        }));
        
        const assignments = assignmentsWithProjects.filter(a => 
            a.batchId && a.batchId.toString() === activeBatch._id.toString()
        );

        const menteeData = await Promise.all(assignments.map(async (a) => {
            // Get files based on whether assignment is archived
            const files = await db.collection(FILE_COL).find({ 
                uploaded_by: a.menteeEmail,
                isArchived: a.isArchived ? true : { $ne: true }
            }).toArray();
            const menteeUser = await usersCollection.findOne({ email: a.menteeEmail });
            const submitted = files.length;
            const lateCount = files.filter(f => f.isLate).length;
            const pendingReview = files.filter(f => f.remark === 'Pending Review').length;
            return {
                menteeEmail: a.menteeEmail,
                menteeName: menteeUser?.name || '',
                projectName: a.projectName,
                assignmentId: a._id,
                deadline: a.deadline || null,
                extendedDeadline: a.extendedDeadline || null,
                finalRemark: a.finalRemark || null,
                isArchived: a.isArchived || false,
                stats: { submitted, lateCount, pendingReview },
            };
        }));

        const totalAssigned = assignments.length;
        const totalPendingReview = menteeData.reduce((s, m) => s + m.stats.pendingReview, 0);
        const totalLate = menteeData.reduce((s, m) => s + m.stats.lateCount, 0);
        const totalAccepted = assignments.filter(a => a.finalRemark).length;
        
        // Calculate current vs completed projects
        const currentProjects = assignments.filter(a => !a.finalRemark && !a.isArchived).length;
        const completedProjects = assignments.filter(a => a.finalRemark || a.isArchived).length;

        res.json({
            success: true,
            data: {
                stats: { 
                    totalAssigned, 
                    totalPendingReview, 
                    totalLate, 
                    totalAccepted,
                    currentProjects,
                    completedProjects
                },
                mentees: menteeData,
            }
        });
    } catch (err) {
        console.error('Mentor dashboard error:', err);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// GET /api/dashboard/coordinator
app.get("/api/dashboard/coordinator", verifyToken, checkRole('project_coordinator'), async (req, res) => {
    try {
        const [totalStudents, totalMentors, assignments, allFiles] = await Promise.all([
            usersCollection.countDocuments({ $or: [{ role: 'mentee' }, { roles: 'mentee' }] }),
            usersCollection.countDocuments({ $or: [{ role: 'mentor' }, { roles: 'mentor' }] }),
            // Only get active (non-archived) assignments
            db.collection("assignments").find({ isArchived: { $ne: true } }).toArray(),
            // Only get active (non-archived) files
            db.collection(FILE_COL).find({ isArchived: { $ne: true } }).toArray(),
        ]);

        const assignedStudents = assignments.length;
        const pendingApproval = await usersCollection.countDocuments({ $or: [{ role: 'mentee' }, { roles: 'mentee' }], projectStatus: 'pending' });
        const approvedNotAssigned = await usersCollection.countDocuments({ $or: [{ role: 'mentee' }, { roles: 'mentee' }], projectStatus: 'approved' });
        const rejectedProjects = await usersCollection.countDocuments({ $or: [{ role: 'mentee' }, { roles: 'mentee' }], projectStatus: 'rejected' });
        const acceptedProjects = assignments.filter(a => a.finalRemark).length;

        // Unique mentees who submitted at least one file
        const submittedMentees = new Set(allFiles.map(f => f.uploaded_by)).size;
        const lateSubmissions = allFiles.filter(f => f.isLate).length;
        const onTimeSubmissions = allFiles.filter(f => !f.isLate && f.submittedAt).length;

        // Per-assignment summary for table
        const assignmentSummary = await Promise.all(assignments.map(async (a) => {
            // Only get active (non-archived) files for current project
            const files = await db.collection(FILE_COL).find({ 
                uploaded_by: a.menteeEmail,
                isArchived: { $ne: true }
            }).toArray();
            const menteeUser = await usersCollection.findOne({ email: a.menteeEmail });
            return {
                menteeEmail: a.menteeEmail,
                menteeName: menteeUser?.name || '',
                mentorEmail: a.mentorEmail,
                projectName: a.projectName,
                submitted: files.length,
                lateCount: files.filter(f => f.isLate).length,
                pendingReview: files.filter(f => f.remark === 'Pending Review').length,
                accepted: !!a.finalRemark,
                deadline: a.deadline || null,
            };
        }));

        res.json({
            success: true,
            data: {
                stats: {
                    totalStudents, totalMentors, assignedStudents,
                    pendingApproval, approvedNotAssigned, rejectedProjects,
                    submittedMentees, lateSubmissions, onTimeSubmissions, acceptedProjects,
                },
                assignments: assignmentSummary,
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// ═══════════════════════════════════════════════════════════════════════════
// ERROR HANDLING MIDDLEWARE (Must be last)
// ═══════════════════════════════════════════════════════════════════════════
app.use(errorHandler);

// Handle 404 routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// ═══════════════════════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 CORS Origin: ${process.env.CORS_ORIGIN || 'http://localhost:5173'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server gracefully...');
  await client.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server gracefully...');
  await client.close();
  process.exit(0);
});
