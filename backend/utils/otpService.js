const crypto = require('crypto');

/**
 * Generate a 6-digit OTP
 */
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Hash OTP for secure storage
 */
function hashOTP(otp) {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

/**
 * Verify OTP against hash
 */
function verifyOTP(otp, hash) {
  return hashOTP(otp) === hash;
}

module.exports = {
  generateOTP,
  hashOTP,
  verifyOTP,
};
