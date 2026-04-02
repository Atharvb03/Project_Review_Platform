import axios from 'axios';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

const API = 'http://localhost:5000/api';

const ROLES = [
  { value: 'mentee',              label: 'Mentee',              icon: '📚', desc: 'Submit and get feedback on projects', requiresCode: false },
  { value: 'mentor',              label: 'Mentor',              icon: '🎓', desc: 'Guide and review student projects',   requiresCode: true  },
  { value: 'project_coordinator', label: 'Coordinator',         icon: '📋', desc: 'Coordinate and manage projects',     requiresCode: true  },
  { value: 'hod',                 label: 'HOD',                 icon: '🏛️', desc: 'Head of Department oversight',       requiresCode: true  },
];

function CompleteProfile() {
  const [role, setRole]             = useState('mentee');
  const [inviteCode, setInviteCode] = useState('');
  const [rollNo, setRollNo]         = useState('');
  const [contactNo, setContactNo]   = useState('');
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [checking, setChecking]     = useState(true);
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();

  const selected = ROLES.find(r => r.value === role);

  const redirectToRole = (r, email = '') => {
    localStorage.setItem('userRole', r);
    if (r === 'project_coordinator') localStorage.setItem('pcEmail', email);
    switch (r) {
      case 'mentor':              navigate('/mentor-dashboard'); break;
      case 'mentee':              navigate('/mentee-dashboard'); break;
      case 'project_coordinator': navigate('/project-coordinator-dashboard'); break;
      case 'hod':                 navigate('/hod-dashboard'); break;
      default:                    navigate('/login');
    }
  };

  // Route guard — verify token exists and user genuinely needs profile setup
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    axios.get(`${API}/auth/profile-status`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(res => {
      if (!res.data.needsProfile) {
        const savedRole  = localStorage.getItem('userRole');
        const savedEmail = localStorage.getItem('userEmail') || '';
        redirectToRole(savedRole, savedEmail);
      } else {
        setChecking(false);
      }
    }).catch(() => {
      localStorage.removeItem('token');
      navigate('/login', { replace: true });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = async () => {
    setError('');
    if (role === 'mentee' && !rollNo.trim())    return setError('Roll number is required.');
    if (role === 'mentee' && !contactNo.trim()) return setError('Contact number is required.');
    if (selected.requiresCode && !inviteCode.trim()) return setError('Access code is required for this role.');

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(`${API}/auth/complete-profile`,
        { role, inviteCode, rollNo, contactNo },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.data.success) {
        localStorage.setItem('token', res.data.token);
        const email = localStorage.getItem('userEmail') || '';
        redirectToRole(res.data.role, email);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3"
            style={{ borderColor: '#ec4899', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Verifying...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-grid flex items-center justify-center px-4 relative overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="orb w-96 h-96 top-[-100px] left-[-100px]" style={{ background: 'var(--orb1)' }} />
      <div className="orb w-80 h-80 bottom-[-80px] right-[-80px]"  style={{ background: 'var(--orb2)' }} />

      <button onClick={toggle}
        className="fixed top-4 right-4 z-50 w-10 h-10 rounded-full glass flex items-center justify-center text-lg transition-all hover:scale-110"
        style={{ border: '1px solid rgba(236,72,153,0.3)' }}>
        {dark ? '☀️' : '🌙'}
      </button>

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7)', boxShadow: '0 0 30px rgba(236,72,153,0.5)' }}>
            <span className="text-2xl">👤</span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Complete Your Profile</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Welcome! Choose your role to get started.</p>
        </div>

        <div className="glass card-glow rounded-2xl p-8 space-y-6">
          <div>
            <label className="block text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>Select your role</label>
            <div className="grid grid-cols-2 gap-3">
              {ROLES.map(r => (
                <button key={r.value} onClick={() => { setRole(r.value); setError(''); setInviteCode(''); }}
                  className="p-4 rounded-xl text-left text-sm font-medium transition-all hover:scale-[1.02]"
                  style={{
                    background: role === r.value ? 'rgba(236,72,153,0.15)' : 'rgba(236,72,153,0.05)',
                    border: `1px solid ${role === r.value ? '#ec4899' : 'rgba(236,72,153,0.2)'}`,
                    color: 'var(--text-primary)'
                  }}>
                  <div className="text-2xl mb-1">{r.icon}</div>
                  <div className="font-semibold">{r.label}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{r.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {role === 'mentee' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Roll No *</label>
                <input type="text" placeholder="e.g. 21CS001" value={rollNo}
                  onChange={e => setRollNo(e.target.value)}
                  className="input-custom w-full px-3 py-2.5 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>Contact No *</label>
                <input type="text" placeholder="e.g. 9876543210" value={contactNo}
                  onChange={e => setContactNo(e.target.value)}
                  className="input-custom w-full px-3 py-2.5 rounded-xl text-sm" />
              </div>
            </div>
          )}

          {selected.requiresCode && (
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                Access Code <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(required for {selected.label})</span>
              </label>
              <input type="password" placeholder="Enter access code" value={inviteCode}
                onChange={e => { setInviteCode(e.target.value); setError(''); }}
                className="input-custom w-full px-4 py-3 rounded-xl text-sm" />
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Contact your administrator if you don't have one.</p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl px-4 py-3"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span className="text-red-400 text-sm">⚠️ {error}</span>
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading}
            className="w-full py-3 rounded-xl text-white font-semibold text-sm transition-all hover:scale-[1.02] disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7)', boxShadow: '0 0 20px rgba(236,72,153,0.4)' }}>
            {loading ? 'Saving...' : 'Continue to Dashboard →'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CompleteProfile;
