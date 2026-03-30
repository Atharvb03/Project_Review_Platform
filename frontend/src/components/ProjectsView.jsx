/**
 * Shared "All Projects" view used by both HODDashboard and ProjectCoordinatorDashboard.
 * Props:
 *   userEmail  — logged-in user's email (for auth headers)
 *   userRole   — 'hod' | 'project_coordinator'
 */
import React, { useState } from 'react';
import axios from '../api/axiosInstance';
import { PHASE_CONFIG, getAllowedPhases } from '../utils/phases';

const API = 'http://localhost:5000/api';

function remarkColor(r) {
  if (!r || r === 'Pending Review') return '#f59e0b';
  if (r.toLowerCase().includes('approved')) return '#10b981';
  if (r.toLowerCase().includes('reject')) return '#ef4444';
  return 'var(--text-secondary)';
}

function FileRow({ sectionKey, upload, onView, userEmail, userRole, menteeEmail }) {
  const [loading, setLoading] = useState(false);

  const handleView = async () => {
    if (!upload?.fileURL) return;
    setLoading(true);
    try {
      const res = await axios.post(`${API}/files/secure-url`, {
        s3Key: upload.fileURL,
        menteeEmail,
      });
      if (res.data.success) onView(res.data.url);
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <tr style={{ borderBottom: '1px solid rgba(236,72,153,0.06)', opacity: upload ? 1 : 0.4 }}>
      <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>
        {PHASE_CONFIG[sectionKey]?.label ?? sectionKey}
      </td>
      <td className="px-4 py-2.5">
        {upload
          ? <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>Uploaded</span>
          : <span className="text-xs px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>Pending</span>
        }
      </td>
      <td className="px-4 py-2.5 text-xs" style={{ color: remarkColor(upload?.remark) }}>
        {upload?.remark || '—'}
      </td>
      <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-muted)' }}>
        {upload?.timestamp ? new Date(upload.timestamp).toLocaleDateString() : '—'}
      </td>
      <td className="px-4 py-2.5">
        {upload && (
          <button
            onClick={handleView}
            disabled={loading}
            className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 disabled:opacity-60"
            style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}
          >
            {loading
              ? <><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Loading</>
              : '🔒 View'
            }
          </button>
        )}
      </td>
    </tr>
  );
}

export default function ProjectsView({ projects, userEmail, userRole }) {
  const [search, setSearch]           = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [viewFile, setViewFile]       = useState(null);
  const [menteeFiles, setMenteeFiles] = useState({});   // menteeEmail -> section map
  const [filesLoading, setFilesLoading] = useState(null);

  const loadMenteeFiles = async (menteeEmail) => {
    if (!menteeEmail || menteeFiles[menteeEmail] !== undefined) return;
    setFilesLoading(menteeEmail);
    try {
      const res = await axios.get(`${API}/files/metadata/${menteeEmail}`);
      const map = {};
      (res.data.data || []).forEach(f => {
        map[f.section] = {
          fileURL:   f.file_url,
          filename:  f.file_name,
          remark:    f.remark,
          timestamp: f.updatedAt,
        };
      });
      setMenteeFiles(prev => ({ ...prev, [menteeEmail]: map }));
    } catch {
      setMenteeFiles(prev => ({ ...prev, [menteeEmail]: {} }));
    } finally {
      setFilesLoading(null);
    }
  };

  const filtered = projects.filter(p =>
    p.projectName?.toLowerCase().includes(search.toLowerCase()) ||
    p.mentor?.email?.toLowerCase().includes(search.toLowerCase()) ||
    p.mentee?.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="w-4 h-4" style={{ color: 'var(--text-muted)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          className="input-custom w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
          placeholder="Search by project, mentor or mentee..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="glass rounded-2xl p-16 text-center" style={{ border: '1px solid rgba(236,72,153,0.1)' }}>
          <p className="text-4xl mb-3">🔍</p>
          <p style={{ color: 'var(--text-muted)' }}>No projects match your search.</p>
        </div>
      ) : filtered.map((p, i) => (
        <div key={i} className="glass rounded-2xl overflow-hidden transition-all"
          style={{ border: expandedRow === i ? '1px solid rgba(236,72,153,0.3)' : '1px solid rgba(236,72,153,0.1)' }}>

          {/* Header row */}
          <button className="w-full flex items-center justify-between px-6 py-4 text-left"
            onClick={() => {
              const next = expandedRow === i ? null : i;
              setExpandedRow(next);
              if (next !== null) loadMenteeFiles(p.mentee?.email);
            }}>
            <div className="flex items-center gap-4">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm shrink-0"
                style={{ background: 'rgba(236,72,153,0.12)', color: '#f472b6' }}>📁</div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{p.projectName}</p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs" style={{ color: '#f472b6' }}>🎓 {p.mentor?.email || '—'}</span>
                  <span className="text-xs" style={{ color: '#c084fc' }}>📚 {p.mentee?.email || '—'}</span>
                  {p.finalRemark && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
                      ✅ Accepted
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : ''}
              </span>
              <svg className="w-4 h-4 transition-transform"
                style={{ color: 'var(--text-muted)', transform: expandedRow === i ? 'rotate(180deg)' : 'rotate(0deg)' }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>

          {/* Expanded file table */}
          {expandedRow === i && (
            <div style={{ borderTop: '1px solid rgba(236,72,153,0.1)' }}>
              <div className="px-6 py-3 text-xs font-semibold uppercase tracking-wider"
                style={{ background: 'rgba(236,72,153,0.04)', color: 'var(--text-muted)' }}>
                File Submissions — {p.mentee?.email}
                <span className="ml-3 normal-case font-normal px-2 py-0.5 rounded-full"
                  style={{ background: p.duration === '1_year' ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.12)', color: p.duration === '1_year' ? '#818cf8' : '#10b981', border: `1px solid ${p.duration === '1_year' ? 'rgba(99,102,241,0.25)' : 'rgba(16,185,129,0.25)'}` }}>
                  🗓 {p.duration === '1_year' ? '1 Year' : '6 Months'}
                </span>
                {p.finalRemark && (
                  <span className="ml-3 normal-case font-normal px-2 py-0.5 rounded-full"
                    style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                    ✅ {p.finalRemark}
                    {p.finalRemarkedAt && <> · {new Date(p.finalRemarkedAt).toLocaleDateString()}</>}
                  </span>
                )}
              </div>
              {filesLoading === p.mentee?.email ? (
                <div className="px-6 py-6 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span className="text-xs">Loading submissions...</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" style={{ minWidth: '600px' }}>
                    <thead>
                      <tr style={{ background: 'rgba(0,0,0,0.1)' }}>
                        {['Stage', 'Status', 'Mentor Remark', 'Uploaded On', 'Action'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--text-muted)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {getAllowedPhases(p.duration).map(key => (
                        <FileRow
                          key={key}
                          sectionKey={key}
                          upload={(menteeFiles[p.mentee?.email] || {})[key]}
                          menteeEmail={p.mentee?.email}
                          userEmail={userEmail}
                          userRole={userRole}
                          onView={url => setViewFile(url)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Secure file viewer modal */}
      {viewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)' }}
          onClick={() => setViewFile(null)}>
          <div className="w-full max-w-5xl rounded-2xl overflow-hidden flex flex-col"
            style={{ height: '85vh', border: '1px solid rgba(236,72,153,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 shrink-0"
              style={{ background: 'linear-gradient(135deg,rgba(236,72,153,0.15),rgba(168,85,247,0.15))', borderBottom: '1px solid rgba(236,72,153,0.2)' }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: '#ec4899', boxShadow: '0 0 6px #ec4899' }} />
                <span className="text-xs font-medium" style={{ color: '#f472b6' }}>🔒 Secure File Viewer — expires in 5 min</span>
              </div>
              <button onClick={() => setViewFile(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: 'rgba(239,68,68,0.8)', color: '#fff' }}>✕</button>
            </div>
            <iframe src={viewFile} className="w-full flex-1 border-0" title="Secure File Viewer" />
          </div>
        </div>
      )}
    </div>
  );
}
