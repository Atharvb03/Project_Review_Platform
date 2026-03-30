const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'prp_jwt_super_secret_key_2024';
const JWT_EXPIRES_IN = '7d';

/**
 * Generate a signed JWT for a user.
 * @param {Object} user - { email, roles, name }
 * @param {string} activeRole - the role the user logged in with
 */
function generateToken(user, activeRole) {
  return jwt.sign(
    {
      email:      user.email,
      roles:      user.roles || [user.role],
      activeRole: activeRole || (user.roles?.[0] ?? user.role),
      name:       user.name || '',
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

module.exports = { generateToken };
