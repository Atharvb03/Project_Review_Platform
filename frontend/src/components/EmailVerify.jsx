import axios from 'axios';
import { API } from '../config';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

function EmailVerify() {
  const { token } = useParams();
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('Verifying your email...');
  const { dark } = useTheme();
  const navigate = useNavigate();
  const hasVerified = React.useRef(false); // Prevent duplicate calls

  useEffect(() => {
    const verifyEmail = async () => {
      // Prevent duplicate verification attempts
      if (hasVerified.current) {
        console.log('[EmailVerify] Already verified, skipping duplicate call');
        return;
      }
      hasVerified.current = true;

      try {
        console.log('[EmailVerify] Verifying token:', token);
        const response = await axios.get(`${API}/verify/${token}`);
        console.log('[EmailVerify] Success:', response.data);
        setStatus('success');
        setMessage(response.data.message);
      } catch (error) {
        console.error('[EmailVerify] Error:', error.response?.data || error.message);
        setStatus('error');
        setMessage(error.response?.data?.message || 'Verification failed. Please try again.');
      }
    };

    if (token) {
      verifyEmail();
    } else {
      setStatus('error');
      setMessage('Invalid verification link.');
    }
  }, [token]);

  return (
    <div
      className="min-h-screen bg-grid flex items-center justify-center px-4 py-10 relative overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Orbs */}
      <div className="orb w-96 h-96 top-[-100px] right-[-100px]" style={{ background: 'var(--orb2)' }} />
      <div className="orb w-80 h-80 bottom-[-80px] left-[-80px]" style={{ background: 'var(--orb1)' }} />

      {/* Card */}
      <div
        className="glass rounded-3xl p-8 w-full max-w-md relative z-10 text-center"
        style={{
          border: '1px solid rgba(236,72,153,0.2)',
          boxShadow: '0 0 40px rgba(236,72,153,0.15)',
        }}
      >
        {/* Icon */}
        <div className="mb-6">
          {status === 'verifying' && (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full"
              style={{ background: 'rgba(236,72,153,0.1)' }}>
              <svg className="animate-spin w-10 h-10" style={{ color: '#ec4899' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
              </svg>
            </div>
          )}
          {status === 'success' && (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full"
              style={{ background: 'rgba(16,185,129,0.1)' }}>
              <svg className="w-10 h-10" style={{ color: '#10b981' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}
          {status === 'error' && (
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full"
              style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg className="w-10 h-10" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
          {status === 'verifying' && 'Verifying Email'}
          {status === 'success' && 'Email Verified!'}
          {status === 'error' && 'Verification Failed'}
        </h1>

        {/* Message */}
        <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
          {message}
        </p>

        {/* Actions */}
        {status === 'success' && (
          <button
            onClick={() => navigate('/login')}
            className="w-full py-3 rounded-xl font-medium transition-all hover:scale-105"
            style={{
              background: 'linear-gradient(135deg,#ec4899,#a855f7)',
              color: '#fff',
              boxShadow: '0 0 20px rgba(236,72,153,0.4)',
            }}
          >
            Go to Login
          </button>
        )}

        {status === 'error' && (
          <div className="space-y-3">
            <button
              onClick={() => navigate('/signup')}
              className="w-full py-3 rounded-xl font-medium transition-all hover:scale-105"
              style={{
                background: 'linear-gradient(135deg,#ec4899,#a855f7)',
                color: '#fff',
                boxShadow: '0 0 20px rgba(236,72,153,0.4)',
              }}
            >
              Sign Up Again
            </button>
            <button
              onClick={() => navigate('/login')}
              className="w-full py-3 rounded-xl font-medium transition-all"
              style={{
                background: 'rgba(236,72,153,0.1)',
                color: 'var(--text-primary)',
                border: '1px solid rgba(236,72,153,0.3)',
              }}
            >
              Try Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default EmailVerify;
