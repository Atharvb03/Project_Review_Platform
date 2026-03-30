import axios from 'axios';
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      const response = await axios.post('http://localhost:5000/api/login', { email, password });
      const { success, roles, email: normalizedEmail, name, token } = response.data;
      if (success) {
        const storedEmail = normalizedEmail || email.toLowerCase();
        if (name) localStorage.setItem('userName', name);
        const effectiveRoles = roles?.length ? roles : [response.data.role];
        if (effectiveRoles.length > 1) {
          // Multiple roles — ask user to pick
          setAvailableRoles(effectiveRoles);
          setPendingData({ storedEmail, token });
        } else {
          redirectToRole(effectiveRoles[0], storedEmail, token);
        }
      } else {
        setLoginError('Invalid email or password. Please try again.');
      }
    } catch (err) {
      setLoginError(err.response?.data?.message || 'An error occurred. Please try again later.');
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
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #ec4899, #a855f7)', boxShadow: '0 0 30px rgba(236,72,153,0.5)' }}
          >
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
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
