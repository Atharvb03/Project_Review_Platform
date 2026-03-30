import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';
import { useTheme } from '../context/ThemeContext';
import ProjectsView from './ProjectsView';
import { logout } from '../utils/auth';

const API = 'http://localhost:5000/api';

// Reusable styled input/select for the dark/light theme
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function StatusBadge({ text }) {
  const colors = {
    success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
    error:   'bg-red-500/15 text-red-400 border-red-500/20',
    info:    'bg-pink-500/15 text-pink-400 border-pink-500/20',
  };
  const type = text?.type || 'info';
  return (
    <div className={`flex items-center gap-2 rounded-xl px-4 py-3 border text-sm ${colors[type]}`}>
      <span>{type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️'}</span>
      {text?.msg}
    </div>
  );
}

export default function ProjectCoordinatorDashboard() {
  const { dark, toggle } = useTheme();
  const [tab, setTab] = useState('mentees'); // 'dashboard' | 'mentees' | 'assign' | 'bulk' | 'list' | 'update' | 'projects'
  const [mentors, setMentors] = useState([]);
  const [mentees, setMentees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dashData, setDashData] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);

  // Assign form
  const [form, setForm] = useState({ menteeEmail: '', mentorEmail: '', duration: '6_months' });
  // Update form
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ projectName: '', mentorEmail: '', duration: '' });

  // Bulk CSV state
  const [csvRows, setCsvRows] = useState([]);       // parsed rows
  const [csvError, setCsvError] = useState('');
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);

  const pcEmail = localStorage.getItem('userEmail') || localStorage.getItem('pcEmail') || 'coordinator@platform.com';

  const fetchProjects = () =>
    axios.get(`${API}/hod/project-details`).then(r => setProjects(r.data.data || [])).catch(() => {});

  useEffect(() => {
    axios.get(`${API}/mentors`).then(r => setMentors(r.data.data || [])).catch(() => {});
    axios.get(`${API}/mentees`).then(r => setMentees(r.data.data || [])).catch(() => {});
    fetchProjects();
    fetchAssignments();
  }, []);

  const fetchAssignments = () => {
    axios.get(`${API}/assignments`).then(r => {
      setAssignments(r.data.data || []);
    }).catch(() => {});
  };

  const fetchDashboard = () => {
    setDashLoading(true);
    axios.get(`${API}/dashboard/coordinator`)
      .then(r => setDashData(r.data.data))
      .catch(() => {})
      .finally(() => setDashLoading(false));
  };

  const flash = (msg, type = 'info') => {
    setMsg({ msg, type });
    setTimeout(() => setMsg(null), 4000);
  };

  const handleAssign = async () => {
    if (!form.menteeEmail || !form.mentorEmail) {
      return flash('Please select a mentee and mentor.', 'error');
    }
    setLoading(true);
    try {
      await axios.post(`${API}/assignments`, { menteeEmail: form.menteeEmail, mentorEmail: form.mentorEmail, assignedBy: pcEmail, duration: form.duration });
      flash('Assignment created successfully!', 'success');
      setForm({ menteeEmail: '', mentorEmail: '', duration: '6_months' });
      fetchAssignments();
      // Refresh mentees to show updated status
      axios.get(`${API}/mentees`).then(r => setMentees(r.data.data || [])).catch(() => {});
    } catch (err) {
      flash(err.response?.data?.message || 'Failed to create assignment.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleProjectStatus = async (menteeEmail, status) => {
    setLoading(true);
    try {
      await axios.patch(`${API}/coordinator/project-status`, { menteeEmail, status });
      flash(`Project ${status}!`, 'success');
      axios.get(`${API}/mentees`).then(r => setMentees(r.data.data || [])).catch(() => {});
    } catch (err) {
      flash(err.response?.data?.message || 'Action failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!editId) return flash('Select an assignment to update.', 'error');
    if (!editForm.projectName && !editForm.mentorEmail && !editForm.duration) return flash('Provide at least one field to update.', 'error');
    setLoading(true);
    try {
      await axios.put(`${API}/assignments/${editId}`, editForm);
      flash('Assignment updated!', 'success');
      setEditId(''); setEditForm({ projectName: '', mentorEmail: '', duration: '' });
      fetchAssignments();
    } catch (err) {
      flash(err.response?.data?.message || 'Update failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const selectForEdit = (a) => {
    setEditId(a._id);
    setEditForm({ projectName: a.projectName, mentorEmail: a.mentorEmail, duration: a.duration || '' });
    setTab('update');
  };

  const handleCsvFile = (e) => {
    setCsvError('');
    setBulkResults(null);
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { setCsvError('CSV must have a header row and at least one data row.'); return; }
      const header = lines[0].toLowerCase().split(',').map(h => h.trim());
      const menteeIdx   = header.indexOf('menteeemail');
      const mentorIdx   = header.indexOf('mentoremail');
      const durationIdx = header.indexOf('duration'); // optional
      if (menteeIdx === -1 || mentorIdx === -1) {
        setCsvError('CSV must have columns: menteeEmail, mentorEmail (duration is optional: 6_months or 1_year)');
        return;
      }
      const validDurations = ['6_months', '1_year'];
      const parsed = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim());
        const duration = durationIdx !== -1 && validDurations.includes(cols[durationIdx]) ? cols[durationIdx] : '6_months';
        return { menteeEmail: cols[menteeIdx] || '', mentorEmail: cols[mentorIdx] || '', duration };
      }).filter(r => r.menteeEmail && r.mentorEmail);
      if (parsed.length === 0) { setCsvError('No valid rows found in CSV.'); return; }
      setCsvRows(parsed);
    };
    reader.readAsText(file);
  };

  const handleBulkSubmit = async () => {
    if (csvRows.length === 0) return;
    setBulkLoading(true);
    setBulkResults(null);
    try {
      const r = await axios.post(`${API}/assignments/bulk-csv`, { rows: csvRows });
      setBulkResults(r.data);
      setCsvRows([]);
      fetchAssignments();
      axios.get(`${API}/mentees`).then(r => setMentees(r.data.data || [])).catch(() => {});
    } catch (err) {
      flash(err.response?.data?.message || 'Bulk assign failed.', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  const inputCls = "w-full px-3 py-2.5 rounded-xl text-sm input-custom";
  const tabBtn = (id, label, icon) => (
    <button
      onClick={() => { setTab(id); if (id === 'dashboard') fetchDashboard(); }}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
      style={{
        background: tab === id ? 'linear-gradient(135deg,#ec4899,#a855f7)' : 'transparent',
        color: tab === id ? '#fff' : 'var(--text-muted)',
        boxShadow: tab === id ? '0 0 16px rgba(236,72,153,0.35)' : 'none',
      }}
    >
      <span>{icon}</span>{label}
    </button>
  );

  return (
    <div className="flex min-h-screen transition-colors duration-300" style={{ backgroundColor: 'var(--bg-primary)' }}>

      {/* Sidebar */}
      <aside
        className="w-64 shrink-0 flex flex-col p-5 gap-3"
        style={{
          background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(236,72,153,0.04)',
          borderRight: '1px solid rgba(236,72,153,0.12)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7)', boxShadow: '0 0 16px rgba(236,72,153,0.5)' }}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Coordinator</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Panel</p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          {tabBtn('dashboard', 'Dashboard', '📊')}
          {tabBtn('mentees', 'Mentees & Projects', '👥')}
          {tabBtn('assign', 'Assign Mentor', '➕')}
          {tabBtn('bulk', 'Bulk CSV Assign', '📥')}
          {tabBtn('update', 'Update Assignment', '✏️')}
          {tabBtn('list',   'All Assignments', '📋')}
          {tabBtn('projects', 'All Projects', '📁')}
        </nav>

        <div className="flex flex-col gap-2 mt-auto pt-4" style={{ borderTop: '1px solid rgba(236,72,153,0.1)' }}>
          <div className="flex items-center justify-between px-1">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Theme</span>
            <button onClick={toggle} className="text-lg hover:scale-110 transition-transform">{dark ? '☀️' : '🌙'}</button>
          </div>
          <button
            onClick={() => logout()}
            className="w-full py-2 rounded-xl text-sm font-medium transition-all"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-3xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {tab === 'dashboard' && 'Dashboard'}
              {tab === 'mentees'  && 'Mentees & Projects'}
              {tab === 'assign' && 'Assign Mentor'}
              {tab === 'bulk'   && 'Bulk CSV Assign'}
              {tab === 'list'   && 'All Assignments'}
              {tab === 'update' && 'Update Assignment'}
              {tab === 'projects' && 'All Projects'}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {tab === 'dashboard' && 'System-wide stats and assignment overview'}
              {tab === 'mentees'  && 'View mentees, approve/reject projects, and assign mentors'}
              {tab === 'assign' && 'Assign a mentor to a mentee (project name auto-fetched)'}
              {tab === 'bulk'   && 'Upload a CSV to assign multiple mentors at once'}
              {tab === 'list'   && 'View and manage all existing assignments'}
              {tab === 'update' && 'Modify an existing assignment'}
              {tab === 'projects' && 'Browse all projects and view submitted files'}
            </p>
          </div>

          {msg && <div className="mb-5"><StatusBadge text={msg} /></div>}

          {/* ── DASHBOARD TAB ── */}
          {tab === 'dashboard' && (
            <div>
              {dashLoading ? (
                <div className="flex items-center justify-center py-20">
                  <svg className="animate-spin w-8 h-8" style={{ color: '#ec4899' }} fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                </div>
              ) : dashData ? (
                <div className="space-y-5">
                  {/* Top stat cards */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Total Students', value: dashData.stats.totalStudents, color: '#f472b6', bg: 'rgba(236,72,153,0.1)', icon: '🎓' },
                      { label: 'Assigned', value: dashData.stats.assignedStudents, color: '#818cf8', bg: 'rgba(99,102,241,0.1)', icon: '🔗' },
                      { label: 'Submitted', value: dashData.stats.submittedMentees, color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: '📤' },
                      { label: 'Late Submissions', value: dashData.stats.lateSubmissions, color: '#f87171', bg: 'rgba(239,68,68,0.1)', icon: '🔴' },
                    ].map(s => (
                      <div key={s.label} className="glass rounded-2xl p-4 flex flex-col gap-1"
                        style={{ border: `1px solid ${s.bg.replace('0.1','0.25')}` }}>
                        <span className="text-lg">{s.icon}</span>
                        <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Secondary stats */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: 'Pending Approval', value: dashData.stats.pendingApproval, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: '⏳' },
                      { label: 'Approved (Unassigned)', value: dashData.stats.approvedNotAssigned, color: '#c084fc', bg: 'rgba(168,85,247,0.1)', icon: '✔' },
                      { label: 'Rejected', value: dashData.stats.rejectedProjects, color: '#f87171', bg: 'rgba(239,68,68,0.1)', icon: '✗' },
                      { label: 'Accepted Projects', value: dashData.stats.acceptedProjects, color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: '🏁' },
                    ].map(s => (
                      <div key={s.label} className="glass rounded-2xl p-4 flex flex-col gap-1"
                        style={{ border: `1px solid ${s.bg.replace('0.1','0.25')}` }}>
                        <span className="text-lg">{s.icon}</span>
                        <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Assignment table */}
                  {dashData.assignments.length > 0 && (
                    <div className="glass rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(236,72,153,0.1)', background: 'rgba(236,72,153,0.04)' }}>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Assignment Overview</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(236,72,153,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                              {['Mentee','Mentor','Project','Submitted','Late','Pending Review','Deadline','Status'].map(h => (
                                <th key={h} className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dashData.assignments.map((a, i) => (
                              <tr key={a.menteeEmail} style={{ borderBottom: i < dashData.assignments.length - 1 ? '1px solid rgba(236,72,153,0.06)' : 'none' }}>
                                <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>{a.menteeName || a.menteeEmail}</td>
                                <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{a.mentorEmail}</td>
                                <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{a.projectName}</td>
                                <td className="px-4 py-2.5 text-center" style={{ color: '#10b981' }}>{a.submitted}</td>
                                <td className="px-4 py-2.5 text-center">
                                  <span style={{ color: a.lateCount > 0 ? '#f87171' : 'var(--text-muted)' }}>{a.lateCount}</span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                  <span style={{ color: a.pendingReview > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{a.pendingReview}</span>
                                </td>
                                <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {a.deadline ? new Date(a.deadline).toLocaleDateString() : '—'}
                                </td>
                                <td className="px-4 py-2.5">
                                  {a.accepted
                                    ? <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>✅ Accepted</span>
                                    : a.lateCount > 0
                                      ? <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>🔴 Late</span>
                                      : a.submitted > 0
                                        ? <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>🟢 On Time</span>
                                        : <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>⏳ Pending</span>
                                  }
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="glass rounded-2xl p-12 text-center" style={{ border: '1px solid rgba(236,72,153,0.1)' }}>
                  <p className="text-4xl mb-3">📊</p>
                  <p style={{ color: 'var(--text-muted)' }}>No data available yet.</p>
                </div>
              )}
            </div>
          )}

          {/* ── MENTEES TAB ── */}
          {tab === 'mentees' && (
            <div className="space-y-3">
              {mentees.length === 0 ? (
                <div className="glass rounded-2xl p-10 text-center" style={{ border: '1px solid rgba(236,72,153,0.1)' }}>
                  <p className="text-4xl mb-3">👥</p>
                  <p style={{ color: 'var(--text-muted)' }}>No mentees registered yet.</p>
                </div>
              ) : mentees.map((m) => {
                const status = m.projectStatus || 'pending';
                const statusColor = status === 'assigned' ? '#10b981' : status === 'approved' ? '#818cf8' : status === 'rejected' ? '#f87171' : '#f59e0b';
                const statusBg = status === 'assigned' ? 'rgba(16,185,129,0.1)' : status === 'approved' ? 'rgba(99,102,241,0.1)' : status === 'rejected' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)';
                return (
                  <div key={m._id || m.email} className="glass rounded-2xl p-5"
                    style={{ border: '1px solid rgba(236,72,153,0.1)' }}>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 space-y-1">
                        <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{m.name || m.email}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.email}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          📁 {m.projectName || <span style={{ fontStyle: 'italic' }}>No project name</span>}
                        </p>
                        <span className="inline-block text-xs px-2 py-0.5 rounded-full mt-1"
                          style={{ background: statusBg, color: statusColor }}>
                          {status === 'assigned' ? '✅ Assigned' : status === 'approved' ? '✔ Approved' : status === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
                        </span>
                        {/* Group Members */}
                        {m.groupMembers?.length > 0 && (
                          <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(99,102,241,0.1)' }}>
                            <p className="text-xs font-semibold mb-1" style={{ color: '#818cf8' }}>👥 Group Members</p>
                            <div className="flex flex-wrap gap-1.5">
                              {m.groupMembers.map((gm, gi) => (
                                <span key={gi} className="text-xs px-2 py-0.5 rounded-lg"
                                  style={{ background: 'rgba(99,102,241,0.08)', color: 'var(--text-secondary)', border: '1px solid rgba(99,102,241,0.12)' }}>
                                  {gi + 1}. {gm.name}{gm.rollNo ? ` · ${gm.rollNo}` : ''}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      {status !== 'assigned' && (
                        <div className="flex gap-2 flex-wrap">
                          {status !== 'approved' && (
                            <button
                              onClick={() => handleProjectStatus(m.email, 'approved')}
                              disabled={loading || !m.projectName}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                              style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
                              ✔ Approve
                            </button>
                          )}
                          {status !== 'rejected' && (
                            <button
                              onClick={() => handleProjectStatus(m.email, 'rejected')}
                              disabled={loading}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
                              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                              ✗ Reject
                            </button>
                          )}
                          {(status === 'approved') && (
                            <button
                              onClick={() => { setForm({ menteeEmail: m.email, mentorEmail: '', duration: '6_months' }); setTab('assign'); }}
                              className="px-3 py-1.5 rounded-lg text-xs font-medium"
                              style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}>
                              ➕ Assign Mentor
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── ASSIGN TAB ── */}
          {tab === 'assign' && (
            <div className="glass rounded-2xl p-6 space-y-4"
              style={{ border: '1px solid rgba(236,72,153,0.12)', boxShadow: '0 0 40px rgba(236,72,153,0.06)' }}>

              <Field label="Select Mentee">
                <select className={inputCls} value={form.menteeEmail} onChange={e => setForm({ ...form, menteeEmail: e.target.value })}>
                  <option value="">-- Choose Mentee --</option>
                  {mentees
                    .filter(m => m.projectStatus === 'approved')
                    .filter(m => !assignments.find(a => a.menteeEmail === m.email && a.finalRemark))
                    .map(m => (
                      <option key={m.email} value={m.email}>{m.name || m.email} — {m.projectName}</option>
                    ))}
                </select>
              </Field>

              {form.menteeEmail && (
                <div className="px-3 py-2 rounded-xl text-xs" style={{ background: 'rgba(99,102,241,0.08)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.15)' }}>
                  📁 Project: {mentees.find(m => m.email === form.menteeEmail)?.projectName || '—'}
                  <span className="ml-2 opacity-60">(auto-fetched, will be locked after assignment)</span>
                </div>
              )}

              <Field label="Select Mentor">
                <select className={inputCls} value={form.mentorEmail} onChange={e => setForm({ ...form, mentorEmail: e.target.value })}>
                  <option value="">-- Choose Mentor --</option>
                  {mentors.map(m => <option key={m.email} value={m.email}>{m.email}</option>)}
                </select>
              </Field>

              <Field label="Project Duration">
                <select className={inputCls} value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })}>
                  <option value="6_months">6 Months</option>
                  <option value="1_year">1 Year</option>
                </select>
              </Field>

              <button
                onClick={handleAssign}
                disabled={loading}
                className="btn-primary-custom w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading
                  ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Assigning...</>
                  : '➕ Create Assignment'
                }
              </button>
            </div>
          )}

          {/* ── BULK CSV TAB ── */}
          {tab === 'bulk' && (
            <div className="space-y-4">

              {/* Format guide */}
              <div className="glass rounded-2xl p-4" style={{ border: '1px solid rgba(99,102,241,0.15)' }}>
                <p className="text-xs font-semibold mb-2" style={{ color: '#818cf8' }}>📄 CSV Format</p>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                  First row must be the header. Required: <code style={{ color: '#f472b6' }}>menteeEmail</code>, <code style={{ color: '#f472b6' }}>mentorEmail</code> — Optional: <code style={{ color: '#a78bfa' }}>duration</code> (<code>6_months</code> or <code>1_year</code>, defaults to <code>6_months</code>)
                </p>
                <pre className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.04)', color: 'var(--text-secondary)', border: '1px solid rgba(255,255,255,0.06)' }}>
{`menteeEmail,mentorEmail,duration
student1@college.com,mentor1@college.com,6_months
student2@college.com,mentor2@college.com,1_year`}
                </pre>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  Mentees must have a project name set and status approved. Already-assigned mentees are skipped.
                </p>
              </div>

              {/* File upload */}
              <div className="glass rounded-2xl p-5" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                <label className="block text-xs font-semibold mb-3 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                  Upload CSV File
                </label>
                <label className="flex items-center justify-center gap-3 px-4 py-6 rounded-xl cursor-pointer transition-all"
                  style={{ border: '2px dashed rgba(236,72,153,0.25)', background: 'rgba(236,72,153,0.03)' }}>
                  <input type="file" accept=".csv" onChange={handleCsvFile} className="hidden" />
                  <span className="text-2xl">📥</span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Click to select CSV</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Only .csv files accepted</p>
                  </div>
                </label>

                {csvError && (
                  <p className="mt-3 text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                    ⚠ {csvError}
                  </p>
                )}
              </div>

              {/* Preview parsed rows */}
              {csvRows.length > 0 && (
                <div className="glass rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                  <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(236,72,153,0.08)', background: 'rgba(236,72,153,0.04)' }}>
                    <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Preview — {csvRows.length} row{csvRows.length > 1 ? 's' : ''}</p>
                    <button onClick={() => setCsvRows([])} className="text-xs" style={{ color: '#f87171' }}>Clear</button>
                  </div>
                  <div className="overflow-x-auto max-h-60 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(236,72,153,0.08)' }}>
                          {['#', 'Mentee Email', 'Mentor Email', 'Duration'].map(h => (
                            <th key={h} className="px-4 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.map((r, i) => (
                          <tr key={i} style={{ borderBottom: i < csvRows.length - 1 ? '1px solid rgba(236,72,153,0.06)' : 'none' }}>
                            <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                            <td className="px-4 py-2" style={{ color: '#c084fc' }}>{r.menteeEmail}</td>
                            <td className="px-4 py-2" style={{ color: '#f472b6' }}>{r.mentorEmail}</td>
                            <td className="px-4 py-2">
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                                style={{ background: r.duration === '1_year' ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.12)', color: r.duration === '1_year' ? '#818cf8' : '#10b981' }}>
                                {r.duration === '1_year' ? '1 Year' : '6 Months'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-5 py-3" style={{ borderTop: '1px solid rgba(236,72,153,0.08)' }}>
                    <button onClick={handleBulkSubmit} disabled={bulkLoading}
                      className="btn-primary-custom w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
                      {bulkLoading
                        ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Assigning...</>
                        : `📥 Assign ${csvRows.length} Mentee${csvRows.length > 1 ? 's' : ''}`
                      }
                    </button>
                  </div>
                </div>
              )}

              {/* Results */}
              {bulkResults && (
                <div className="glass rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(16,185,129,0.15)' }}>
                  <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(16,185,129,0.08)', background: 'rgba(16,185,129,0.04)' }}>
                    <p className="text-sm font-semibold" style={{ color: '#10b981' }}>✅ {bulkResults.message}</p>
                  </div>
                  <div className="overflow-x-auto max-h-72 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(16,185,129,0.08)' }}>
                          {['Mentee', 'Mentor', 'Project', 'Duration', 'Status', 'Reason'].map(h => (
                            <th key={h} className="px-4 py-2 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {bulkResults.results.map((r, i) => (
                          <tr key={i} style={{ borderBottom: i < bulkResults.results.length - 1 ? '1px solid rgba(16,185,129,0.06)' : 'none' }}>
                            <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>{r.menteeEmail}</td>
                            <td className="px-4 py-2" style={{ color: 'var(--text-secondary)' }}>{r.mentorEmail}</td>
                            <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{r.projectName || '—'}</td>
                            <td className="px-4 py-2">
                              {r.duration ? (
                                <span className="px-2 py-0.5 rounded-full font-medium"
                                  style={{ background: r.duration === '1_year' ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.12)', color: r.duration === '1_year' ? '#818cf8' : '#10b981' }}>
                                  {r.duration === '1_year' ? '1 Year' : '6 Months'}
                                </span>
                              ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                            </td>
                            <td className="px-4 py-2">
                              <span className="px-2 py-0.5 rounded-full font-medium" style={{
                                background: r.status === 'success' ? 'rgba(16,185,129,0.12)' : r.status === 'skipped' ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)',
                                color:      r.status === 'success' ? '#10b981'              : r.status === 'skipped' ? '#f59e0b'              : '#f87171',
                              }}>
                                {r.status === 'success' ? '✅ Assigned' : r.status === 'skipped' ? '⏭ Skipped' : '❌ Error'}
                              </span>
                            </td>
                            <td className="px-4 py-2" style={{ color: 'var(--text-muted)' }}>{r.reason || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── LIST TAB ── */}
          {tab === 'list' && (
            <div className="space-y-3">
              {assignments.length === 0 ? (
                <div className="glass rounded-2xl p-10 text-center" style={{ border: '1px solid rgba(236,72,153,0.1)' }}>
                  <p className="text-4xl mb-3">📭</p>
                  <p style={{ color: 'var(--text-muted)' }}>No assignments yet. Create one first.</p>
                </div>
              ) : assignments.map((a) => (
                <div key={a._id} className="glass rounded-2xl p-5 flex items-start justify-between gap-4"
                  style={{ border: '1px solid rgba(236,72,153,0.1)' }}>
                  <div className="flex-1 space-y-1">
                    <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{a.projectName}</p>
                    <div className="flex flex-wrap gap-3 text-xs mt-2">
                      <span className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6' }}>
                        🎓 {a.mentorEmail}
                      </span>
                      <span className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(168,85,247,0.1)', color: '#c084fc' }}>
                        📚 {mentees.find(m => m.email === a.menteeEmail)?.name || a.menteeEmail}
                      </span>
                      <span className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>
                        👤 by {a.assignedBy}
                      </span>
                      <span className="flex items-center gap-1 px-2 py-1 rounded-lg" style={{
                        background: a.duration === '1_year' ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.12)',
                        color:      a.duration === '1_year' ? '#818cf8'               : '#10b981',
                      }}>
                        🗓 {a.duration === '1_year' ? '1 Year' : '6 Months'}
                      </span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Assigned {new Date(a.createdAt).toLocaleDateString()}
                      {a.updatedAt !== a.createdAt && ` · Updated ${new Date(a.updatedAt).toLocaleDateString()}`}
                    </p>
                    {a.deadline && (
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        📅 Deadline: {new Date(a.deadline).toLocaleString()}
                        {a.extendedDeadline && <span style={{ color: '#10b981' }}> → Extended: {new Date(a.extendedDeadline).toLocaleString()}</span>}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => selectForEdit(a)}
                    className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                    style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* ── UPDATE TAB ── */}
          {tab === 'update' && (
            <div className="glass rounded-2xl p-6 space-y-4"
              style={{ border: '1px solid rgba(236,72,153,0.12)', boxShadow: '0 0 40px rgba(236,72,153,0.06)' }}>

              <Field label="Select Assignment to Update">
                <select
                  className={inputCls}
                  value={editId}
                  onChange={e => {
                    const a = assignments.find(x => x._id === e.target.value);
                    setEditId(e.target.value);
                    if (a) setEditForm({ projectName: a.projectName, mentorEmail: a.mentorEmail, duration: a.duration || '' });
                  }}
                >
                  <option value="">-- Choose Assignment --</option>
                  {assignments
                    .filter(a => !a.finalRemark)
                    .map(a => {
                      const mentee = mentees.find(m => m.email === a.menteeEmail);
                      return (
                        <option key={a._id} value={a._id}>{a.projectName} ({mentee?.name || a.menteeEmail})</option>
                      );
                    })}
                </select>
              </Field>

              <Field label="New Project Name (optional)">
                <input
                  className={inputCls}
                  placeholder="Leave blank to keep current"
                  value={editForm.projectName}
                  onChange={e => setEditForm({ ...editForm, projectName: e.target.value })}
                />
              </Field>

              <Field label="New Mentor (optional)">
                <select className={inputCls} value={editForm.mentorEmail} onChange={e => setEditForm({ ...editForm, mentorEmail: e.target.value })}>
                  <option value="">-- Keep current mentor --</option>
                  {mentors.map(m => <option key={m.email} value={m.email}>{m.email}</option>)}
                </select>
              </Field>

              <Field label="Project Duration (optional)">
                <select className={inputCls} value={editForm.duration} onChange={e => setEditForm({ ...editForm, duration: e.target.value })}>
                  <option value="">-- Keep current duration --</option>
                  <option value="6_months">6 Months</option>
                  <option value="1_year">1 Year</option>
                </select>
              </Field>

              <button
                onClick={handleUpdate}
                disabled={loading}
                className="btn-primary-custom w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading
                  ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Updating...</>
                  : '✏️ Save Changes'
                }
              </button>
            </div>
          )}

          {/* ── ALL PROJECTS TAB ── */}
          {tab === 'projects' && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  onClick={fetchProjects}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all"
                  style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}
                >
                  🔄 Refresh
                </button>
              </div>
              <ProjectsView projects={projects} userEmail={pcEmail} userRole="project_coordinator" />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
