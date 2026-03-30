// Password Reset OTP Model
// Schema:
// {
//   email:      String   — user email
//   otp:        String   — 6-digit OTP
//   createdAt:  Date     — timestamp
//   expiresAt:  Date     — OTP expiry (5 minutes)
//   attempts:   Number   — failed verification attempts
//   verified:   Boolean  — whether OTP was verified
// }

module.exports = {
  COLLECTION: 'password_resets',
  OTP_EXPIRY_MINUTES: 5,
  MAX_ATTEMPTS: 3,
  RATE_LIMIT_MINUTES: 15, // Can request new OTP after 15 mins if previous one expires
};
