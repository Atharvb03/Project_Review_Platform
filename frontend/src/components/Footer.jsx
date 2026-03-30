import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

function Footer() {
  const [openSection, setOpenSection] = useState(null);
  const { dark } = useTheme();
  const toggle = (s) => setOpenSection(openSection === s ? null : s);

  const borderTop = dark ? 'border-pink-500/10' : 'border-pink-200/50';
  const textMuted = dark ? 'text-purple-300/50' : 'text-purple-400/70';
  const textSub = dark ? 'text-purple-200/60' : 'text-purple-700/60';
  const btnClass = dark
    ? 'text-pink-300 hover:text-pink-200'
    : 'text-pink-600 hover:text-pink-800';

  return (
    <footer
      id="contact"
      className={`border-t ${borderTop} relative z-10 transition-colors duration-300`}
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-10 mb-10">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #ec4899, #a855f7)', boxShadow: '0 0 14px rgba(236,72,153,0.4)' }}
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>PROJECT REVIEW PLATFORM</span>
            </div>
            <p className={`text-sm leading-relaxed ${textSub}`}>
              Empowering students and mentors to collaborate, review, and build better academic projects together.
            </p>
          </div>

          {/* About */}
          <div>
            <button onClick={() => toggle('about')} className={`flex items-center gap-2 font-semibold text-sm mb-3 transition-colors ${btnClass}`}>
              About Us
              <svg className={`w-4 h-4 transition-transform ${openSection === 'about' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openSection === 'about' && (
              <p className={`text-sm leading-relaxed ${textSub}`}>
                The Project Review Platform is built to streamline academic project management for engineering and
                technology institutions. It enables students (mentees) to submit project files stage-by-stage, receive
                structured feedback from assigned mentors, and track progress through a centralized dashboard. Coordinators
                manage approvals and mentor assignments, while the HOD gets a full bird's-eye view of all ongoing projects.
                The system enforces submission deadlines, flags late submissions, and ensures every project goes through a
                proper review lifecycle — from idea presentation to final acceptance.
              </p>
            )}
          </div>

          {/* Contact */}
          <div>
            <button onClick={() => toggle('contact')} className={`flex items-center gap-2 font-semibold text-sm mb-3 transition-colors ${btnClass}`}>
              Contact Us
              <svg className={`w-4 h-4 transition-transform ${openSection === 'contact' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openSection === 'contact' && (
              <div className={`space-y-3 text-sm ${textSub}`}>
                <div>
                  <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Atharv Bendkhale</p>
                  <p>📞 8446379837</p>
                  <p>📧 atharvb03@gmail.com</p>
                </div>
                <div>
                  <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Raj Kadu</p>
                  <p>📞 8261825587</p>
                  <p>📧 rajkadu2700@gmail.com</p>
                </div>
                <div>
                  <p className="font-medium" style={{ color: 'var(--text-secondary)' }}>Prathamesh Pabe</p>
                  <p>📞 9503583713</p>
                  <p>📧 prathameshpabe@gmail.com</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={`border-t ${borderTop} pt-8 flex flex-col sm:flex-row items-center justify-between gap-4`}>
          <p className={`text-sm ${textMuted}`}>
            &copy; {new Date().getFullYear()} Project Review Platform. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {[
              { href: 'https://twitter.com', d: 'M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z' },
              { href: 'https://youtube.com', d: 'M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zm-10.615 12.816v-8l8 3.993-8 4.007z' },
              { href: 'https://facebook.com', d: 'M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z' },
            ].map((s) => (
              <a key={s.href} href={s.href} target="_blank" rel="noopener noreferrer"
                className={`transition-colors ${textMuted} hover:text-pink-400`}>
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" className="fill-current">
                  <path d={s.d} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
