import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

function ThemeToggle() {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="relative w-14 h-7 rounded-full transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-pink-500/50"
      style={{
        background: dark
          ? 'linear-gradient(135deg, #1a0a2e, #2d1b4e)'
          : 'linear-gradient(135deg, #fce7f3, #f9a8d4)',
        border: dark ? '1px solid rgba(244,114,182,0.3)' : '1px solid rgba(236,72,153,0.4)',
        boxShadow: dark ? '0 0 12px rgba(244,114,182,0.2)' : '0 0 12px rgba(236,72,153,0.15)',
      }}
    >
      {/* Track icons */}
      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-xs">🌙</span>
      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-xs">☀️</span>
      {/* Thumb */}
      <span
        className="absolute top-0.5 w-6 h-6 rounded-full transition-all duration-300 flex items-center justify-center text-xs shadow-lg"
        style={{
          left: dark ? '2px' : 'calc(100% - 26px)',
          background: dark
            ? 'linear-gradient(135deg, #ec4899, #a855f7)'
            : 'linear-gradient(135deg, #f97316, #eab308)',
          boxShadow: dark
            ? '0 0 10px rgba(236,72,153,0.6)'
            : '0 0 10px rgba(251,191,36,0.6)',
        }}
      />
    </button>
  );
}

function Navbar() {
  const navigate = useNavigate();
  const { dark } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeBatch, setActiveBatch] = useState(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Fetch active academic year
  useEffect(() => {
    fetch('http://localhost:5000/api/batches/active')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data) {
          setActiveBatch(data.data.name);
        }
      })
      .catch(() => {});
  }, []);

  const navBg = scrolled
    ? dark
      ? 'bg-[#0d0d14]/90 backdrop-blur-xl border-b border-pink-500/10 shadow-xl shadow-black/30'
      : 'bg-white/90 backdrop-blur-xl border-b border-pink-300/30 shadow-xl shadow-pink-100/30'
    : 'bg-transparent';

  const linkClass = dark
    ? 'text-purple-300 hover:text-pink-300'
    : 'text-purple-700 hover:text-pink-600';

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${navBg}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shadow-lg"
              style={{ background: 'linear-gradient(135deg, #ec4899, #a855f7)', boxShadow: '0 0 16px rgba(236,72,153,0.5)' }}>
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
            </div>
            <span className={`font-bold text-sm tracking-wide hidden sm:block ${dark ? 'text-white' : 'text-purple-900'}`}>
              PROJECT REVIEW PLATFORM
            </span>
          </div>

          {/* Desktop nav links */}
          <div className="hidden md:flex items-center gap-8">
            {activeBatch && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" 
                style={{ 
                  background: dark ? 'rgba(236,72,153,0.1)' : 'rgba(236,72,153,0.08)', 
                  border: '1px solid rgba(236,72,153,0.2)' 
                }}>
                <span className="text-xs font-semibold" style={{ color: '#f472b6' }}>
                  📅 Academic Year: {activeBatch}
                </span>
              </div>
            )}
            {['Features', 'About', 'Contact'].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`} className={`text-sm font-medium transition-colors ${linkClass}`}>
                {item}
              </a>
            ))}
          </div>

          {/* Right side */}
          <div className="hidden md:flex items-center gap-4">
            <ThemeToggle />
            <button
              onClick={() => navigate('/login')}
              className={`text-sm font-medium px-4 py-2 rounded-lg transition-all ${
                dark
                  ? 'text-pink-300 hover:text-white hover:bg-pink-500/10'
                  : 'text-pink-700 hover:text-pink-900 hover:bg-pink-100'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/signup')}
              className="btn-primary-custom text-white text-sm font-semibold px-5 py-2 rounded-lg"
            >
              Get Started
            </button>
          </div>

          {/* Mobile: theme toggle + hamburger */}
          <div className="md:hidden flex items-center gap-3">
            <ThemeToggle />
            <button
              className={`p-2 ${dark ? 'text-pink-300' : 'text-pink-700'}`}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden glass rounded-xl mb-4 p-4 space-y-3">
            {['Features', 'About', 'Contact'].map((item) => (
              <a key={item} href={`#${item.toLowerCase()}`} className={`block text-sm py-2 ${linkClass}`}>{item}</a>
            ))}
            <div className="flex gap-2 pt-2 border-t border-pink-500/10">
              <button onClick={() => navigate('/login')} className={`flex-1 text-center text-sm py-2 rounded-lg border transition-all ${dark ? 'border-pink-500/20 text-pink-300 hover:bg-pink-500/10' : 'border-pink-300 text-pink-700 hover:bg-pink-50'}`}>
                Sign In
              </button>
              <button onClick={() => navigate('/signup')} className="flex-1 text-center text-sm text-white py-2 rounded-lg btn-primary-custom">
                Get Started
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
