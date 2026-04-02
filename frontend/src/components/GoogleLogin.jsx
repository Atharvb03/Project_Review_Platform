import React, { useEffect } from 'react';

// Pure pass-through — immediately redirects to Google OAuth.
// Role selection happens on /complete-profile for new users.
// Existing users go straight to their dashboard via GoogleCallback.
function GoogleLogin() {
  useEffect(() => {
    window.location.href = 'http://localhost:5000/auth/google';
  }, []);

  return null;
}

export default GoogleLogin;
