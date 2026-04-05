import { useEffect } from 'react';
import { API_BASE } from '../config';

function GoogleLogin() {
  useEffect(() => {
    window.location.href = `${API_BASE}/auth/google`;
  }, []);
  return null;
}

export default GoogleLogin;
