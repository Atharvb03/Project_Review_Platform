# Password Reset Feature Documentation

## Overview
This project now includes a complete **Forgot Password / Reset Password** feature using Email OTP (One-Time Password) with security protections.

## Features Implemented

### 1. Email OTP System
- 6-digit OTP generation
- OTP sent via email using Nodemailer
- OTP hashed before storage (SHA-256)
- 5-minute expiry time

### 2. Security Protections
- **OTP Expiry**: OTPs expire after 5 minutes
- **Rate Limiting**: Users must wait for current OTP to expire before requesting a new one
- **Attempt Limiting**: Maximum 3 verification attempts per OTP
- **Password Hashing**: New passwords are hashed with bcrypt before storage
- **Secure Storage**: OTPs are hashed in database, never stored in plain text

### 3. User Flow
1. User clicks "Forgot password?" on login page
2. User enters email address
3. System sends 6-digit OTP to email
4. User enters OTP to verify
5. User creates new password
6. User is redirected to login page

## Backend Implementation

### New Files Created
- `backend/models/passwordReset.js` - Password reset schema and constants
- `backend/utils/otpService.js` - OTP generation, hashing, and verification

### New Routes Added to `server.js`

#### 1. Request OTP
```
POST /api/password/forgot
Body: { email }
Response: { success, message }
```

#### 2. Verify OTP
```
POST /api/password/verify-otp
Body: { email, otp }
Response: { success, message }
```

#### 3. Reset Password
```
POST /api/password/reset
Body: { email, otp, newPassword }
Response: { success, message }
```

### Email Template
- Added `passwordResetOTPEmail()` template in `utils/emailService.js`
- Professional HTML email with OTP display
- Security warnings included

## Frontend Implementation

### New Component
- `frontend/src/components/ForgotPassword.jsx` - Complete 3-step password reset flow

### Updated Components
- `App.jsx` - Added `/forgot-password` route
- `Login.jsx` - Added "Forgot password?" link

### UI Features
- 3-step wizard interface
- Real-time validation
- Loading states
- Success/error messages
- Theme support (dark/light mode)
- Responsive design

## Database Collections

### `password_resets` Collection
```javascript
{
  email: String,        // User email
  otp: String,          // Hashed OTP
  createdAt: Date,      // Creation timestamp
  expiresAt: Date,      // Expiry timestamp (5 min)
  attempts: Number,     // Failed verification attempts
  verified: Boolean     // OTP verification status
}
```

## Configuration

### Environment Variables Required
Make sure these are set in your `.env` file:
```env
EMAIL_USER=your_gmail@gmail.com
EMAIL_PASS=your_gmail_app_password
```

**Note**: Use Gmail App Password, not your regular password.
Generate at: https://myaccount.google.com/apppasswords

## Security Best Practices Implemented

1. **OTP Hashing**: OTPs are hashed with SHA-256 before storage
2. **Password Hashing**: Passwords are hashed with bcrypt (10 rounds)
3. **Rate Limiting**: Prevents OTP spam
4. **Attempt Limiting**: Prevents brute force attacks
5. **Time-based Expiry**: OTPs expire after 5 minutes
6. **Email Verification**: Only registered emails receive OTPs
7. **No Email Enumeration**: Same response whether email exists or not

## Usage Instructions

### For Users
1. Go to login page
2. Click "Forgot password?"
3. Enter your registered email
4. Check email for 6-digit OTP
5. Enter OTP on verification page
6. Create new password (min 6 characters)
7. Login with new password

### For Developers
The feature is fully integrated and requires no additional setup beyond:
1. Ensure MongoDB is running
2. Configure email credentials in `.env`
3. Start backend server
4. Start frontend dev server

## Testing

### Test the Flow
1. Create a test user account
2. Navigate to `/forgot-password`
3. Enter test user email
4. Check email inbox for OTP
5. Verify OTP
6. Reset password
7. Login with new password

### Edge Cases Handled
- Invalid email format
- Non-existent email
- Expired OTP
- Wrong OTP (with attempt limiting)
- Password mismatch
- Short passwords (< 6 chars)
- Multiple OTP requests (rate limited)

## Customization Options

### Change OTP Expiry Time
Edit `backend/models/passwordReset.js`:
```javascript
OTP_EXPIRY_MINUTES: 5, // Change to desired minutes
```

### Change Max Attempts
Edit `backend/models/passwordReset.js`:
```javascript
MAX_ATTEMPTS: 3, // Change to desired attempts
```

### Change Rate Limit
Edit `backend/models/passwordReset.js`:
```javascript
RATE_LIMIT_MINUTES: 15, // Change to desired minutes
```

### Customize Email Template
Edit `backend/utils/emailService.js` - `passwordResetOTPEmail()` function

## Troubleshooting

### OTP Email Not Received
1. Check spam/junk folder
2. Verify `EMAIL_USER` and `EMAIL_PASS` in `.env`
3. Ensure Gmail App Password is used (not regular password)
4. Check backend console for email errors

### OTP Verification Fails
1. Ensure OTP is entered within 5 minutes
2. Check for typos in OTP
3. Don't exceed 3 attempts
4. Request new OTP if expired

### Password Reset Fails
1. Ensure OTP was verified first
2. Check password meets minimum length (6 chars)
3. Ensure passwords match
4. Check backend console for errors

## Future Enhancements (Optional)

- SMS OTP as alternative to email
- Password strength meter
- Account lockout after multiple failed attempts
- Password reset history tracking
- Two-factor authentication (2FA)
- Biometric authentication support

## Support

For issues or questions, check:
1. Backend console logs
2. Frontend browser console
3. MongoDB connection status
4. Email service configuration
