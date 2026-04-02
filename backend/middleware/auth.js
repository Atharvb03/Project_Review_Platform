const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'prp_jwt_super_secret_key_2024';

function log(level, msg, meta = {}) {
  const ts = new Date().toISOString();
  console[level === 'warn' ? 'warn' : 'error'](`[${ts}] [AUTH:${level.toUpperCase()}] ${msg}`, meta);
}

/**
 * verifyToken — reads Bearer token from Authorization header,
 * verifies it, and attaches decoded payload to req.user
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    log('warn', 'Unauthorized access — no token', { path: req.path, ip: req.ip });
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    req.userEmail = decoded.email;
    req.userRole  = decoded.activeRole || decoded.roles?.[0] || '';

    // Block pending-role tokens from all routes except complete-profile
    const isPending = decoded.activeRole === 'pending' || 
                      (decoded.roles?.length === 0) ||
                      (decoded.roles?.length === 1 && decoded.roles[0] === 'pending');
    if (isPending && !req.path.includes('/auth/complete-profile')) {
      return res.status(403).json({ 
        success: false, 
        message: 'Profile setup required. Please complete your profile first.',
        needsProfile: true
      });
    }

    next();
  } catch (err) {
    log('warn', 'Invalid or expired token', { path: req.path, ip: req.ip, error: err.message });
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/**
 * checkRole(...roles) — must be used AFTER verifyToken.
 * Passes if the token's roles array contains at least one of the required roles.
 */
function checkRole(...roles) {
  return (req, res, next) => {
    const userRoles = req.user?.roles || [];
    const hasRole = roles.some(r => userRoles.includes(r));
    if (!hasRole) {
      log('warn', 'Role mismatch — access denied', {
        path: req.path,
        userEmail: req.user?.email,
        userRoles,
        requiredRoles: roles,
      });
      return res.status(403).json({ success: false, message: `Access denied. Required roles: ${roles.join(', ')}` });
    }
    // Set active role to the user's actual matching role (not the first allowed role)
    req.userRole = userRoles.find(r => roles.includes(r));
    next();
  };
}

/**
 * requireRole(...roles) — combined verifyToken + checkRole.
 * Drop-in replacement for the old header-based requireRole.
 */
function requireRole(...roles) {
  return [verifyToken, checkRole(...roles)];
}

module.exports = { verifyToken, checkRole, requireRole };
