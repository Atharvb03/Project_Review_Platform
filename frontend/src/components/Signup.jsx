import axios from 'axios';
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

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
    if (password.length < 6) { setPasswordError('Password must be at least 6 characters.'); return; }
    if (role === 'mentee' && !rollNo.trim()) { setServerMessage('Roll number is required for mentees.'); setIsSuccess(false); return; }
    if (role === 'mentee' && !contactNo.trim()) { setServerMessage('Contact number is required for mentees.'); setIsSuccess(false); return; }
    if (['mentor', 'project_coordinator'].includes(role) && !inviteCode.trim()) { setServerMessage('Invite code is required for this role.'); setIsSuccess(false); return; }
    setLoading(true);
    try {
      const response = await axios.post('http://localhost:5000/api/signup', {
        name: name.trim(),
        email,
        password,
        role,
        inviteCode: ['mentor', 'project_coordinator', 'hod'].includes(role) ? inviteCode.trim() : undefined,
        rollNo: role === 'mentee' ? rollNo.trim() : undefined,
        contactNo: role === 'mentee' ? contactNo.trim() : undefined,
      });
      setIsSuccess(true);
      // If a new role was added to an existing account, clear old token and force re-login
      if (response.data.requireReLogin) {
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
          <div
            className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #ec4899, #a855f7)', boxShadow: '0 0 30px rgba(236,72,153,0.5)' }}
          >
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
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
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
          Project Review Platform &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

export default Signup;
