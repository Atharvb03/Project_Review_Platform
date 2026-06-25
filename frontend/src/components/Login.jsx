import axios from 'axios';
import { API } from '../config';
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import Logo from './Logo';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // If a pending-profile token exists, go straight to complete-profile
  React.useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const isPending = payload.activeRole === 'pending' ||
                        payload.roles?.length === 0 ||
                        (payload.roles?.length === 1 && payload.roles[0] === 'pending');
      if (isPending) window.location.replace('/complete-profile');
    } catch (_) {}
  }, []);
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // multi-role picker
  const [availableRoles, setAvailableRoles] = useState(null); // null = not yet fetched
  const [pendingData, setPendingData] = useState(null);       // holds response while user picks
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();

  const roleLabels = {
    mentor: { label: 'Mentor', icon: '🎓' },
    mentee: { label: 'Mentee', icon: '📚' },
    project_coordinator: { label: 'Coordinator', icon: '📋' },
    hod: { label: 'HOD', icon: '🏛️' },
  };

  const redirectToRole = (activeRole, storedEmail, token) => {
    localStorage.setItem('userEmail', storedEmail);
    localStorage.setItem('userRole', activeRole);
    if (token) localStorage.setItem('token', token);
    if (activeRole === 'mentor') {
      navigate('/mentor-dashboard');
    } else if (activeRole === 'mentee') {
      navigate('/mentee-dashboard');
    } else if (activeRole === 'project_coordinator') {
      localStorage.setItem('pcEmail', storedEmail);
      navigate('/project-coordinator-dashboard');
    } else if (activeRole === 'hod') {
      navigate('/hod-dashboard');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setLoginError('');
    setAvailableRoles(null);
    setPendingData(null);
    try {
      const response = await axios.post(`${API}/login`, { email, password });
      const { success, roles, email: normalizedEmail, name, token } = response.data;
      if (success) {
        const storedEmail = normalizedEmail || email.toLowerCase();
        if (name) localStorage.setItem('userName', name);
        const effectiveRoles = roles?.length ? roles : [response.data.role];
        
        // Filter out mentee from staff role picker
        // Mentee is a separate account — staff roles are mentor, hod, project_coordinator
        const staffRoles = effectiveRoles.filter(r => r !== 'mentee');
        const displayRoles = staffRoles.length > 0 ? staffRoles : effectiveRoles;
        
        if (displayRoles.length > 1) {
          // Multiple staff roles — ask user to pick
          setAvailableRoles(displayRoles);
          setPendingData({ storedEmail, token });
        } else {
          redirectToRole(displayRoles[0], storedEmail, token);
        }
      } else {
        setLoginError('Invalid email or password. Please try again.');
      }
    } catch (err) {
      const errorData = err.response?.data;
      // User not found (deleted) — redirect to signup
      if (err.response?.status === 400 && errorData?.message === 'User not found') {
        navigate('/signup');
        return;
      }
      if (errorData?.requiresVerification) {
        setLoginError('⚠️ ' + errorData.message);
      } else if (errorData?.googleOnly) {
        setLoginError('🔵 ' + errorData.message);
      } else {
        setLoginError(errorData?.message || 'An error occurred. Please try again later.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRolePick = (role) => {
    redirectToRole(role, pendingData.storedEmail, pendingData.token);
  };

  return (
    <div
      className="min-h-screen bg-grid flex items-center justify-center px-4 relative overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Orbs */}
      <div className="orb w-96 h-96 top-[-100px] left-[-100px]" style={{ background: 'var(--orb1)' }} />
      <div className="orb w-80 h-80 bottom-[-80px] right-[-80px]" style={{ background: 'var(--orb2)' }} />

      {/* Back button — top left */}
      <button
        onClick={() => navigate('/')}
        aria-label="Back to homepage"
        className="fixed top-4 left-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl glass text-sm font-medium transition-all hover:scale-105"
        style={{ border: '1px solid rgba(236,72,153,0.3)', boxShadow: '0 0 12px rgba(236,72,153,0.15)', color: 'var(--text-secondary)' }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Home
      </button>

      {/* Theme toggle — top right */}
      <button
        onClick={toggle}
        aria-label="Toggle theme"
        className="fixed top-4 right-4 z-50 w-10 h-10 rounded-full glass flex items-center justify-center text-lg transition-all hover:scale-110"
        style={{ border: '1px solid rgba(236,72,153,0.3)', boxShadow: '0 0 12px rgba(236,72,153,0.2)' }}
      >
        {dark ? '☀️' : '🌙'}
      </button>

      <div className="w-full max-w-md relative z-10">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center mb-4">
            <Logo variant="icon" size={83} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Welcome back</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Sign in to your account to continue</p>
        </div>

        {/* Card */}
        <div className="glass card-glow rounded-2xl p-8">

          {/* ── Role picker (shown after login when account has multiple roles) ── */}
          {availableRoles ? (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Choose how to sign in</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Your account has multiple roles</p>
              </div>
              <div className="flex flex-col gap-2">
                {availableRoles.map(r => (
                  <button key={r} onClick={() => handleRolePick(r)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all hover:scale-[1.01]"
                    style={{ background: 'rgba(236,72,153,0.08)', border: '1px solid rgba(236,72,153,0.2)', color: 'var(--text-primary)' }}>
                    <span className="text-lg">{roleLabels[r]?.icon || '👤'}</span>
                    <span>Continue as <span style={{ color: '#f472b6' }}>{roleLabels[r]?.label || r}</span></span>
                  </button>
                ))}
              </div>
              <button onClick={() => { setAvailableRoles(null); setPendingData(null); }}
                className="w-full text-xs text-center mt-1 py-2"
                style={{ color: 'var(--text-muted)' }}>
                ← Back
              </button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                </div>
                <input
                  id="email" type="email" placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)} required
                  className="input-custom w-full pl-10 pr-4 py-3 rounded-xl text-sm"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  id="password" type={showPassword ? 'text' : 'password'} placeholder="Enter your password"
                  value={password} onChange={(e) => setPassword(e.target.value)} required
                  className="input-custom w-full pl-10 pr-12 py-3 rounded-xl text-sm"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {showPassword
                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                    }
                  </svg>
                </button>
              </div>
            </div>

            {loginError && (
              <div className="flex items-center gap-2 rounded-xl px-4 py-3"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-400 text-sm">{loginError}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-primary-custom w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Signing in...</>
              ) : 'Sign In'}
            </button>

            {/* Divider */}
            <div className="relative flex items-center py-2">
              <div className="flex-grow border-t" style={{ borderColor: 'rgba(236,72,153,0.2)' }}></div>
              <span className="flex-shrink mx-4 text-xs" style={{ color: 'var(--text-muted)' }}>or continue with</span>
              <div className="flex-grow border-t" style={{ borderColor: 'rgba(236,72,153,0.2)' }}></div>
            </div>

            {/* Google Sign In — if account exists goes to dashboard, if not redirects to /signup */}
            <button
              type="button"
              onClick={() => navigate('/google-login?mode=login')}
              className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-3 transition-all hover:scale-[1.02]"
              style={{ 
                background: 'rgba(255,255,255,0.05)', 
                border: '1px solid rgba(236,72,153,0.2)',
                color: 'var(--text-primary)'
              }}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Sign in with Google
            </button>



            <div className="text-center">
              <Link to="/forgot-password" className="text-sm transition-colors" style={{ color: '#f472b6' }}>
                Forgot password?
              </Link>
            </div>
          </form>
          )}

          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="font-medium transition-colors" style={{ color: '#f472b6' }}>
              Create one
            </Link>
          </p>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
          Project Review Platform &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

export default Login;
