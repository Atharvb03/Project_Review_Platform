import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';
import { API_BASE } from '../config';
import Logo from './Logo';

const features = [
  {
    icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    title: 'Structured Reviews',
    desc: 'Get detailed, structured feedback on your projects from experienced mentors.',
  },
  {
    icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
    title: 'Role-Based Access',
    desc: 'Mentors, mentees, coordinators and HODs each get a tailored experience.',
  },
  {
    icon: 'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12',
    title: 'File Submissions',
    desc: 'Upload project files and documents directly through the platform.',
  },
  {
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    title: 'Progress Tracking',
    desc: 'Track project progress and review history in one centralized dashboard.',
  },
];

// Animate a number from 0 to target
function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!target) return;
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) { setValue(target); clearInterval(timer); }
      else setValue(start);
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return value;
}

function StatCard({ value, label, loading, bodyText, statCard }) {
  const animated = useCountUp(loading ? 0 : value);
  return (
    <div className={`rounded-2xl p-5 text-center transition-all ${statCard}`}>
      {loading ? (
        <div className="h-9 w-16 mx-auto rounded-lg mb-1"
          style={{ background: 'rgba(236,72,153,0.1)', animation: 'prp-shimmer 1.4s infinite', backgroundSize: '200% 100%' }} />
      ) : (
        <div className="text-3xl font-extrabold gradient-text">
          {animated}{value >= 10 ? '+' : ''}
        </div>
      )}
      <div className={`text-sm mt-1 ${bodyText}`}>{label}</div>
    </div>
  );
}

function Banner() {
  const navigate = useNavigate();
  const { dark } = useTheme();
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/public/stats`)
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d.data); })
      .catch(() => {})
      .finally(() => setStatsLoading(false));
  }, []);

  const statItems = [
    { value: stats?.mentees   || 0, label: 'Registered Students' },
    { value: stats?.mentors   || 0, label: 'Active Mentors' },
    { value: stats?.completedProjects || 0, label: 'Projects Completed' },
    { value: stats?.filesSubmitted    || 0, label: 'Files Submitted' },
  ];

  const cardClass = dark
    ? 'glass border border-pink-500/10 hover:border-pink-500/30'
    : 'bg-white/80 border border-pink-200 hover:border-pink-400 shadow-sm hover:shadow-pink-100';

  const subText = dark ? 'text-purple-300' : 'text-purple-700';
  const bodyText = dark ? 'text-purple-200/70' : 'text-purple-800/70';
  const statCard = dark ? 'glass border border-pink-500/10' : 'bg-white/90 border border-pink-200 shadow-sm';

  return (
    <div
      className="bg-grid min-h-screen relative overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Orbs */}
      <div className="orb w-[500px] h-[500px] top-[-150px] left-[-150px]" style={{ background: 'var(--orb1)' }} />
      <div className="orb w-[400px] h-[400px] top-[200px] right-[-100px]" style={{ background: 'var(--orb2)' }} />
      <div className="orb w-[300px] h-[300px] bottom-[100px] left-[30%]" style={{ background: 'var(--orb1)', opacity: 0.5 }} />

      {/* Hero */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-20">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 glass rounded-full px-4 py-2 mb-8 text-sm border"
            style={{ color: dark ? '#f9a8d4' : '#be185d', borderColor: 'rgba(236,72,153,0.25)' }}
          >
            <span className="w-2 h-2 rounded-full bg-pink-400 animate-pulse-slow" />
            Project Review Platform
          </div>

          <h1
            className="text-5xl sm:text-6xl lg:text-7xl font-extrabold leading-tight mb-6"
            style={{ color: 'var(--text-primary)' }}
          >
            Review. Improve.{' '}
            <span className="gradient-text">Succeed.</span>
          </h1>

          <p className={`text-lg sm:text-xl leading-relaxed mb-10 max-w-2xl mx-auto ${bodyText}`}>
            A collaborative platform connecting students with mentors for structured project reviews,
            real-time feedback, and academic excellence.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate('/signup')}
              className="btn-primary-custom text-white font-semibold px-8 py-4 rounded-xl text-base w-full sm:w-auto"
            >
              Get Started Free
            </button>
            <button
              onClick={() => navigate('/login')}
              className={`glass border font-semibold px-8 py-4 rounded-xl text-base transition-all w-full sm:w-auto ${
                dark ? 'text-pink-200 border-pink-500/20 hover:bg-pink-500/10' : 'text-pink-700 border-pink-300 hover:bg-pink-50'
              }`}
            >
              Sign In →
            </button>
          </div>
        </div>

        {/* Stats — live from DB */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-20 max-w-3xl mx-auto">
          {statItems.map((s) => (
            <StatCard
              key={s.label}
              value={s.value}
              label={s.label}
              loading={statsLoading}
              bodyText={bodyText}
              statCard={statCard}
            />
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            Everything you need to <span className="gradient-text">excel</span>
          </h2>
          <p className={`max-w-xl mx-auto ${bodyText}`}>
            Built for academic institutions to streamline the project review process from submission to approval.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {features.map((f) => (
            <div key={f.title} className={`rounded-2xl p-6 transition-all duration-300 group ${cardClass}`}>
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 transition-all"
                style={{
                  background: dark ? 'rgba(236,72,153,0.12)' : 'rgba(236,72,153,0.1)',
                  color: '#f472b6',
                  boxShadow: '0 0 12px rgba(244,114,182,0.15)',
                }}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={f.icon} />
                </svg>
              </div>
              <h3 className="font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>{f.title}</h3>
              <p className={`text-sm leading-relaxed ${bodyText}`}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* About */}
      <section id="about" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div
          className="rounded-3xl p-10 sm:p-16 relative overflow-hidden"
          style={{
            background: dark
              ? 'linear-gradient(135deg, rgba(236,72,153,0.08), rgba(168,85,247,0.08))'
              : 'linear-gradient(135deg, rgba(253,242,248,0.9), rgba(243,232,255,0.9))',
            border: dark ? '1px solid rgba(236,72,153,0.2)' : '1px solid rgba(236,72,153,0.3)',
            boxShadow: dark ? '0 0 60px rgba(236,72,153,0.08)' : '0 0 40px rgba(236,72,153,0.06)',
          }}
        >
          <div className="orb w-64 h-64 top-[-50px] right-[-50px]" style={{ background: 'var(--orb1)' }} />
          <div className="relative z-10 max-w-3xl">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>
              About the <span className="gradient-text">Platform</span>
            </h2>
            <p className={`text-base leading-relaxed mb-4 ${bodyText}`}>
              The Project Review Platform is an end-to-end academic project management system built for engineering
              and technology institutions. It digitizes the entire project lifecycle — from initial idea submission
              to final acceptance — replacing scattered emails and manual tracking with a structured, role-based workflow.
            </p>
            <p className={`text-base leading-relaxed mb-4 ${bodyText}`}>
              Students submit project files stage-by-stage (idea presentation, progress reports, phase reports, final
              demo, PPT, codebook, and achievements). Each submission is reviewed by an assigned mentor who provides
              remarks and sets deadlines. The system automatically flags late submissions and tracks overall progress.
            </p>
            <p className={`text-base leading-relaxed mb-6 ${bodyText}`}>
              Project Coordinators manage mentor assignments and project approvals, while the Head of Department (HOD)
              gets a complete overview of all ongoing projects, mentors, and mentees — all in one place.
            </p>
            <button
              onClick={() => navigate('/signup')}
              className="btn-primary-custom text-white font-semibold px-8 py-3 rounded-xl text-base"
            >
              Get Started
            </button>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            Get in <span className="gradient-text">Touch</span>
          </h2>
          <p className={`max-w-xl mx-auto ${bodyText}`}>
            Have questions or need assistance? Feel free to reach out to our team.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {[
            { name: 'Atharv Bendkhale', phone: '8446379837', email: 'atharvb03@gmail.com', initials: 'AB' },
            { name: 'Raj Kadu',         phone: '8261825587', email: 'rajkadu2700@gmail.com', initials: 'RK' },
            { name: 'Prathamesh Pabe',  phone: '9503583713', email: 'prathameshpabe@gmail.com', initials: 'PP' },
          ].map((contact) => (
            <div
              key={contact.email}
              className={`rounded-2xl p-6 transition-all duration-300 group ${cardClass}`}
            >
              <div className="flex flex-col items-center text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold text-white mb-4 transition-transform group-hover:scale-110"
                  style={{ background: 'linear-gradient(135deg,#ff4ecd,#a855f7)' }}
                >
                  {contact.initials}
                </div>
                <h3 className="font-semibold text-lg mb-3" style={{ color: 'var(--text-primary)' }}>
                  {contact.name}
                </h3>
                <div className="space-y-2 w-full">
                  <a
                    href={`tel:${contact.phone}`}
                    className="flex items-center justify-center gap-2 text-sm transition-colors hover:text-pink-400"
                    style={{ color: dark ? '#c084fc' : '#7c3aed' }}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.61 21 3 13.39 3 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.25 1.01l-2.2 2.2z"/>
                    </svg>
                    {contact.phone}
                  </a>
                  <a
                    href={`mailto:${contact.email}`}
                    className="flex items-center justify-center gap-2 text-sm transition-colors hover:text-pink-400 break-all"
                    style={{ color: dark ? '#c084fc' : '#7c3aed' }}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/>
                    </svg>
                    {contact.email}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default Banner;
