import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const ROLE_META = {
  mentor:              { label: 'Mentor',              icon: '🎓' },
  project_coordinator: { label: 'Project Coordinator', icon: '📋' },
  hod:                 { label: 'HOD',                 icon: '🏛️' },
  mentee:              { label: 'Mentee',              icon: '📚' },
};

function redirectToRole(role, email, navigate) {
  localStorage.setItem('userRole', role);
  if (role === 'project_coordinator') localStorage.setItem('pcEmail', email);
  switch (role) {
    case 'mentor':              navigate('/mentor-dashboard'); break;
    case 'mentee':              navigate('/mentee-dashboard'); break;
    case 'project_coordinator': navigate('/project-coordinator-dashboard'); break;
    case 'hod':                 navigate('/hod-dashboard'); break;
    default:                    navigate('/login');
  }
}

function GoogleCallback() {
  const [status, setStatus]       = useState('processing'); // 'processing' | 'pick' | 'success' | 'error'
  const [message, setMessage]     = useState('Completing sign in...');
  const [roles, setRoles]         = useState([]);
  const [token, setToken]         = useState('');
  const [email, setEmail]         = useState('');
  const navigate = useNavigate();
  const { dark } = useTheme();
  const processed = React.useRef(false); // prevent double-run in React 18 Strict Mode

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash       = window.location.hash.substring(1);
    const hashParams = new URLSearchParams(hash);
    const urlParams  = new URLSearchParams(window.location.search);

    const tkn      = hashParams.get('token');
    const em       = hashParams.get('email');
    const name     = hashParams.get('name');
    const error    = urlParams.get('error') || hashParams.get('error');

    if (tkn && em) {
      localStorage.setItem('token', tkn);
      localStorage.setItem('userEmail', decodeURIComponent(em));
      if (name) localStorage.setItem('userName', decodeURIComponent(name));

      // New user — needs to complete profile (choose role)
      if (hashParams.get('needsProfile') === 'true') {
        navigate('/complete-profile', { replace: true });
        return;
      }

      const role     = hashParams.get('role');
      const rolesRaw = hashParams.get('roles');

      let allRoles = [role];
      try {
        const parsed = JSON.parse(decodeURIComponent(rolesRaw || '[]'));
        if (Array.isArray(parsed) && parsed.length > 0) allRoles = parsed;
      } catch (_) {}

      const staffRoles = allRoles.filter(r => r !== 'mentee');

      if (staffRoles.length > 1) {
        setToken(tkn);
        setEmail(decodeURIComponent(em));
        setRoles(staffRoles);
        setStatus('pick');
      } else {
        const finalRole = staffRoles[0] || role;
        localStorage.setItem('userRole', finalRole);
        if (finalRole === 'project_coordinator') localStorage.setItem('pcEmail', decodeURIComponent(em));
        setStatus('success');
        setMessage('Sign in successful! Redirecting...');
        setTimeout(() => redirectToRole(finalRole, decodeURIComponent(em), navigate), 1200);
      }
    } else {
      if (error === 'not_registered') {
        navigate('/signup', { replace: true });
        return;
      }

      setStatus('error');
      const msgs = {
        invalid_code:           'Invalid access code. Please check your code and try again.',
        misconfigured_redirect: 'OAuth redirect URI is misconfigured. Contact the administrator.',
        google_auth_failed:     'Google authentication failed. Please try again.',
        server_error:           'Server error occurred. Please try again later.',
      };
      setMessage(msgs[error] || 'Authentication failed. Please try again.');
      // no auto-redirect — user clicks the button manually
    }
  }, [navigate]);

  const handleRolePick = (pickedRole) => {
    redirectToRole(pickedRole, email, navigate);
  };

  return (
    <div
      className="min-h-screen bg-grid flex items-center justify-center px-4 relative overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="orb w-96 h-96 top-[-100px] right-[-100px]" style={{ background: 'var(--orb2)' }} />
      <div className="orb w-80 h-80 bottom-[-80px] left-[-80px]"  style={{ background: 'var(--orb1)' }} />

      <div
        className="glass rounded-3xl p-8 w-full max-w-md relative z-10 text-center"
        style={{ border: '1px solid rgba(236,72,153,0.2)', boxShadow: '0 0 40px rgba(236,72,153,0.15)' }}
      >
        {/* ── PROCESSING ── */}
        {status === 'processing' && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
              style={{ background: 'rgba(236,72,153,0.1)' }}>
              <svg className="animate-spin w-10 h-10" style={{ color: '#ec4899' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Processing...</h1>
            <p style={{ color: 'var(--text-secondary)' }}>{message}</p>
          </>
        )}

        {/* ── ROLE PICKER ── */}
        {status === 'pick' && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
              style={{ background: 'rgba(236,72,153,0.1)' }}>
              <span className="text-4xl">👤</span>
            </div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Choose Role</h1>
            <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
              Your account has multiple roles. Select one to continue.
            </p>
            <div className="flex flex-col gap-3">
              {roles.map(r => (
                <button
                  key={r}
                  onClick={() => handleRolePick(r)}
                  className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl text-left transition-all hover:scale-[1.02]"
                  style={{
                    background: 'rgba(236,72,153,0.08)',
                    border: '1px solid rgba(236,72,153,0.2)',
                    color: 'var(--text-primary)'
                  }}
                >
                  <span className="text-3xl">{ROLE_META[r]?.icon || '👤'}</span>
                  <div>
                    <p className="font-semibold">{ROLE_META[r]?.label || r}</p>
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Continue as {ROLE_META[r]?.label || r}
                    </p>
                  </div>
                  <svg className="w-5 h-5 ml-auto" style={{ color: '#ec4899' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── SUCCESS ── */}
        {status === 'success' && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
              style={{ background: 'rgba(16,185,129,0.1)' }}>
              <svg className="w-10 h-10" style={{ color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Success!</h1>
            <p style={{ color: 'var(--text-secondary)' }}>{message}</p>
          </>
        )}

        {/* ── ERROR ── */}
        {status === 'error' && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full mb-6"
              style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg className="w-10 h-10" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>Authentication Failed</h1>
            <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>{message}</p>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 rounded-xl font-medium transition-all hover:scale-105"
              style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7)', color: '#fff', boxShadow: '0 0 20px rgba(236,72,153,0.4)' }}
            >
              Back to Login
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default GoogleCallback;
