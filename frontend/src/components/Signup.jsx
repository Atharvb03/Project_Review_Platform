import axios from 'axios';
import { API } from '../config';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import Logo from './Logo';

const roles = [
  { value: 'mentee', label: 'Mentee', icon: '📚', desc: 'Submit and get feedback on projects' },
  { value: 'mentor', label: 'Mentor', icon: '🎓', desc: 'Guide and review student projects' },
  { value: 'project_coordinator', label: 'Coordinator', icon: '📋', desc: 'Coordinate and manage projects' },
  { value: 'hod', label: 'HOD', icon: '🏛️', desc: 'Head of Department oversight' },
];

function Signup() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('mentee');
  const [inviteCode, setInviteCode] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [serverMessage, setServerMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { dark, toggle } = useTheme();

  const navigate = useNavigate();

  const validateEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setEmailError(''); setPasswordError(''); setServerMessage('');
    if (!name.trim()) { setServerMessage('Full name is required.'); setIsSuccess(false); return; }
    if (!validateEmail(email)) { setEmailError('Please enter a valid email address.'); return; }
    if (password.length < 8) { 
      setPasswordError('Password must be at least 8 characters with 1 uppercase, 1 lowercase, and 1 number.'); 
      return; 
    }
    if (role === 'mentee' && !rollNo.trim()) { setServerMessage('Roll number is required for mentees.'); setIsSuccess(false); return; }
    if (role === 'mentee' && !contactNo.trim()) { setServerMessage('Contact number is required for mentees.'); setIsSuccess(false); return; }
    if (['mentor', 'project_coordinator'].includes(role) && !inviteCode.trim()) { setServerMessage('Invite code is required for this role.'); setIsSuccess(false); return; }
    setLoading(true);
    try {
      const response = await axios.post(`${API}/signup`, {
        name: name.trim(),
        email,
        password,
        role,
        inviteCode: ['mentor', 'project_coordinator', 'hod'].includes(role) ? inviteCode.trim() : undefined,
        rollNo: role === 'mentee' ? rollNo.trim() : undefined,
        contactNo: role === 'mentee' ? contactNo.trim() : undefined,
      });
      setIsSuccess(true);
      
      // Check if email verification is required
      if (response.data.requiresVerification) {
        setServerMessage('✅ ' + response.data.message + ' Please check your email inbox (and spam folder) for the verification link.');
        setName(''); setEmail(''); setPassword(''); setRole('mentee'); setInviteCode(''); setRollNo(''); setContactNo('');
      } else if (response.data.requireReLogin) {
        // If a new role was added to an existing account, clear old token and force re-login
        localStorage.removeItem('token');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userRole');
        setServerMessage(response.data.message);
      } else {
        setServerMessage(response.data.message);
        setName(''); setEmail(''); setPassword(''); setRole('mentee'); setInviteCode(''); setRollNo(''); setContactNo('');
      }
    } catch (error) {
      setServerMessage(error.response?.data?.message || 'Error: Unable to register user');
      setIsSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-grid flex items-center justify-center px-4 py-10 relative overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Orbs */}
      <div className="orb w-96 h-96 top-[-100px] right-[-100px]" style={{ background: 'var(--orb2)' }} />
      <div className="orb w-80 h-80 bottom-[-80px] left-[-80px]" style={{ background: 'var(--orb1)' }} />

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

      {/* Theme toggle */}
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
            <Logo variant="icon" size={56} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Create your account</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Join the Project Review Platform</p>
        </div>

        <div className="glass card-glow rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Full Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  id="name" type="text" placeholder="Your full name"
                  value={name} onChange={(e) => setName(e.target.value)} required
                  className="input-custom w-full pl-10 pr-4 py-3 rounded-xl text-sm"
                />
              </div>
            </div>

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
                  value={email} onChange={(e) => { setEmail(e.target.value); setEmailError(''); }} required
                  className="input-custom w-full pl-10 pr-4 py-3 rounded-xl text-sm"
                />
              </div>
              {emailError && <p className="text-red-400 text-xs mt-1.5">⚠ {emailError}</p>}
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
                  id="password" type={showPassword ? 'text' : 'password'} placeholder="Min. 6 characters"
                  value={password} onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }} required
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
              {passwordError && <p className="text-red-400 text-xs mt-1.5">⚠ {passwordError}</p>}
            </div>

            {/* Role picker */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Select your role
              </label>
              <div className="grid grid-cols-2 gap-2">
                {roles.map((r) => (
                  <button
                    key={r.value} type="button"
                    onClick={() => { setRole(r.value); setInviteCode(''); }}
                    className="p-3 rounded-xl text-left transition-all duration-200"
                    style={{
                      border: role === r.value ? '1px solid #ec4899' : '1px solid var(--input-border)',
                      background: role === r.value ? 'rgba(236,72,153,0.12)' : 'var(--input-bg)',
                      boxShadow: role === r.value ? '0 0 12px rgba(236,72,153,0.2)' : 'none',
                      color: role === r.value ? 'var(--text-primary)' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="text-lg mb-0.5">{r.icon}</div>
                    <div className="text-xs font-semibold">{r.label}</div>
                    <div className="text-xs opacity-60 leading-tight mt-0.5">{r.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Invite Code — mentor / coordinator / hod */}
            {['mentor', 'project_coordinator', 'hod'].includes(role) && (
              <div>
                <label htmlFor="inviteCode" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  {role === 'hod' ? 'HOD Setup Code' : role === 'project_coordinator' ? 'Coordinator Invite Code' : 'Mentor Invite Code'}
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <input
                    id="inviteCode" type="text" placeholder="Enter your invite code"
                    value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required
                    className="input-custom w-full pl-10 pr-4 py-3 rounded-xl text-sm"
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {role === 'hod'
                    ? 'Required only if an HOD already exists. First HOD can register freely.'
                    : 'Contact your administrator to get an invite code.'}
                </p>
              </div>
            )}

            {/* Roll No and Contact No — mentee only */}
            {role === 'mentee' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rollNo" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Roll No <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="rollNo" type="text" placeholder="e.g. 21CS001"
                    value={rollNo} onChange={(e) => setRollNo(e.target.value)} required
                    className="input-custom w-full px-4 py-3 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="contactNo" className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    Contact No <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="contactNo" type="tel" placeholder="e.g. 9876543210"
                    value={contactNo} onChange={(e) => setContactNo(e.target.value)} required
                    className="input-custom w-full px-4 py-3 rounded-xl text-sm"
                  />
                </div>
              </div>
            )}

            {serverMessage && (
              <div className="flex items-center gap-2 rounded-xl px-4 py-3"
                style={{
                  background: isSuccess ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                  border: isSuccess ? '1px solid rgba(16,185,129,0.2)' : '1px solid rgba(239,68,68,0.2)',
                }}>
                <span className="text-sm">{isSuccess ? '✅' : '⚠️'}</span>
                <p className={`text-sm ${isSuccess ? 'text-emerald-400' : 'text-red-400'}`}>{serverMessage}</p>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-primary-custom w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Creating account...</>
              ) : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--text-muted)' }}>
            Already have an account?{' '}
            <Link to="/login" className="font-medium transition-colors" style={{ color: '#f472b6' }}>
              Sign in
            </Link>
          </p>

          {/* Divider */}
          <div className="relative flex items-center py-3 mt-2">
            <div className="flex-grow border-t" style={{ borderColor: 'rgba(236,72,153,0.2)' }}></div>
            <span className="flex-shrink mx-4 text-xs" style={{ color: 'var(--text-muted)' }}>or sign up with</span>
            <div className="flex-grow border-t" style={{ borderColor: 'rgba(236,72,153,0.2)' }}></div>
          </div>

          {/* Google Signup Button */}
          <button
            type="button"
            onClick={() => navigate('/google-login?mode=signup')}
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
            Sign up with Google
          </button>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
          Project Review Platform &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

export default Signup;
