import React, { useEffect, useState } from 'react';
import axios from '../api/axiosInstance';
import { useTheme } from '../context/ThemeContext';
import { logout } from '../utils/auth';
import { getAllowedPhases, PHASE_CONFIG } from '../utils/phases';

import { API } from '../config';

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
  const [tab, setTab] = useState(null); // null until fetchBatches determines the correct starting tab
  const initialTabSetRef = React.useRef(false); // use ref to avoid stale closure issues
  const [mentors, setMentors] = useState([]);
  const [mentees, setMentees] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [dashData, setDashData] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);

  // Batch management
  const [batches, setBatches] = useState([]);
  const [batchForm, setBatchForm] = useState({ name: '', isActive: false });
  const [activeBatch, setActiveBatch] = useState(null);
  const [batchLoading, setBatchLoading] = useState(false);
  
  // Projects hierarchical view
  const [expandedBatches, setExpandedBatches] = useState(new Set()); // Track which batches are expanded
  const [expandedProjects, setExpandedProjects] = useState(new Set()); // Track which projects are expanded
  const [menteeFiles, setMenteeFiles] = useState({}); // menteeEmail -> section map
  const [filesLoading, setFilesLoading] = useState(null);
  const [viewFile, setViewFile] = useState(null);

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

  const toggleBatch = (batchId) => {
    setExpandedBatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(batchId)) {
        newSet.delete(batchId);
      } else {
        newSet.add(batchId);
      }
      return newSet;
    });
  };

  const toggleProject = (projectId, menteeEmail, project) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
        // Load files when expanding
        if (menteeEmail && project) loadMenteeFiles(menteeEmail, project);
      }
      return newSet;
    });
  };

  const loadMenteeFiles = async (menteeEmail, project) => {
    // Use menteeEmail + projectName as cache key to support multiple projects per mentee
    const cacheKey = `${menteeEmail}__${project.projectName}`;
    if (!menteeEmail || menteeFiles[cacheKey] !== undefined) return;
    setFilesLoading(menteeEmail);
    try {
      // Build URL with projectName filter for archived/completed projects
      let url = `${API}/files/metadata/${menteeEmail}`;
      if (project?.isArchived || project?.finalRemark) {
        url += `?projectName=${encodeURIComponent(project.projectName)}`;
      }
      
      const res = await axios.get(url);
      const map = {};
      // If project is archived OR has finalRemark (completed), use archived files
      const filesToDisplay = (project?.isArchived || project?.finalRemark)
        ? (res.data.archivedFiles || [])
        : (res.data.data || []);
      
      filesToDisplay.forEach(f => {
        map[f.section] = {
          fileURL: f.file_url,
          filename: f.file_name,
          remark: f.remark,
          timestamp: f.updatedAt,
        };
      });
      setMenteeFiles(prev => ({ ...prev, [cacheKey]: map }));
    } catch {
      setMenteeFiles(prev => ({ ...prev, [cacheKey]: {} }));
    } finally {
      setFilesLoading(null);
    }
  };

  const handleViewFile = async (fileURL, menteeEmail) => {
    if (!fileURL) return;
    try {
      const res = await axios.post(`${API}/files/secure-url`, {
        s3Key: fileURL,
        menteeEmail,
      });
      if (res.data.success) setViewFile(res.data.url);
    } catch (err) {
      flash('Failed to load file', 'error');
    }
  };

  const remarkColor = (r) => {
    if (!r || r === 'Pending Review') return '#f59e0b';
    if (r.toLowerCase().includes('approved')) return '#10b981';
    if (r.toLowerCase().includes('reject')) return '#ef4444';
    return 'var(--text-secondary)';
  };

  const fetchProjects = () =>
    axios.get(`${API}/hod/project-details`).then(r => setProjects(r.data.data || [])).catch(() => {});

  useEffect(() => {
    axios.get(`${API}/mentors`).then(r => setMentors(r.data.data || [])).catch(() => {});
    axios.get(`${API}/mentees`).then(r => setMentees(r.data.data || [])).catch(() => {});
    fetchProjects();
    fetchAssignments();
    fetchBatches();
  }, []);

  const fetchAssignments = () => {
    return axios.get(`${API}/assignments`).then(r => {
      setAssignments(r.data.data || []);
    }).catch(() => {});
  };

  const fetchBatches = () => {
    // Timeout fallback — if API takes >8s, default to batches tab
    const fallback = setTimeout(() => {
      if (!initialTabSetRef.current) {
        initialTabSetRef.current = true;
        setTab('batches');
      }
    }, 8000);

    axios.get(`${API}/batches`).then(r => {
      clearTimeout(fallback);
      const batchList = r.data.data || [];
      setBatches(batchList);

      const active = batchList.find(b => b.isActive);
      if (active) setActiveBatch(active);

      if (!initialTabSetRef.current) {
        initialTabSetRef.current = true;
        setTab(batchList.length === 0 ? 'batches' : 'mentees');
      }
    }).catch(() => {
      clearTimeout(fallback);
      if (!initialTabSetRef.current) {
        initialTabSetRef.current = true;
        setTab('batches');
      }
    });
  };

  const handleCreateBatch = async () => {
    if (!batchForm.name?.trim()) {
      return flash('Batch name is required (e.g., "2025-26")', 'error');
    }
    setBatchLoading(true);
    try {
      await axios.post(`${API}/batches`, batchForm);
      flash('Academic year created successfully!', 'success');
      setBatchForm({ name: '', isActive: false });
      fetchBatches();
      
      // After creating first batch, switch to mentees tab
      if (batches.length === 0) {
        setTimeout(() => {
          setTab('mentees');
          flash('Academic year created! You can now manage mentees and projects.', 'success');
        }, 1500);
      }
    } catch (err) {
      flash(err.response?.data?.message || 'Failed to create batch', 'error');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleActivateBatch = async (id) => {
    try {
      const res = await axios.patch(`${API}/batches/${id}/activate`);
      flash(res.data.message, 'success');
      fetchBatches();
    } catch (err) {
      flash(err.response?.data?.message || 'Failed to activate batch', 'error');
    }
  };

  const handleDeleteBatch = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete academic year "${name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await axios.delete(`${API}/batches/${id}`);
      flash(res.data.message, 'success');
      fetchBatches();
    } catch (err) {
      flash(err.response?.data?.message || 'Failed to delete batch', 'error');
    }
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
      // Refresh data and switch back to mentees tab to show updated status
      const [menteesRes] = await Promise.all([
        axios.get(`${API}/mentees`).catch(() => null),
        fetchAssignments(),
      ]);
      if (menteesRes) setMentees(menteesRes.data.data || []);
      setTab('mentees');
    } catch (err) {
      flash(err.response?.data?.message || 'Failed to create assignment.', 'error');
      // Always refresh mentees to keep status in sync (handles 409 case where assignment already exists)
      const res2 = await axios.get(`${API}/mentees`).catch(() => null);
      if (res2) setMentees(res2.data.data || []);
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

  const handleDeleteUser = async (email) => {
    if (!window.confirm(`Remove user "${email}" from the platform? This cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/users/${encodeURIComponent(email)}`);
      flash(`User ${email} removed.`, 'success');
      axios.get(`${API}/mentees`).then(r => setMentees(r.data.data || [])).catch(() => {});
      axios.get(`${API}/mentors`).then(r => setMentors(r.data.data || [])).catch(() => {});
    } catch (err) {
      flash(err.response?.data?.message || 'Failed to remove user.', 'error');
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

  // Wait until fetchBatches has determined the correct starting tab
  if (!initialTabSetRef.current || tab === null) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3"
            style={{ borderColor: '#ec4899', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

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

        {/* Active Academic Year */}
        {activeBatch && (
          <div className="rounded-xl p-3 mb-2"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: '#818cf8' }}>📅 Active Academic Year</p>
            <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{activeBatch?.name || activeBatch}</p>
          </div>
        )}

        <nav className="flex flex-col gap-1 flex-1">
          {tabBtn('dashboard', 'Dashboard', '📊')}
          {tabBtn('batches', 'Academic Years', '📅')}
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
              {tab === 'batches' && 'Academic Years Management'}
              {tab === 'mentees'  && 'Mentees & Projects'}
              {tab === 'assign' && 'Assign Mentor'}
              {tab === 'bulk'   && 'Bulk CSV Assign'}
              {tab === 'list'   && 'All Assignments'}
              {tab === 'update' && 'Update Assignment'}
              {tab === 'projects' && 'All Projects'}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {tab === 'dashboard' && 'System-wide stats and assignment overview'}
              {tab === 'batches' && 'Create and manage academic years (batches) for project grouping'}
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
                // Check if this mentee's CURRENT (non-archived) assignment is finalised
                const isFinalised = assignments.some(a => a.menteeEmail === m.email && a.finalRemark && !a.isArchived);

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
                        {/* Past completed projects from archived assignments */}
                        {(() => {
                          const past = assignments.filter(a => a.isArchived && a.menteeEmail === m.email);
                          if (!past.length) return null;
                          return (
                            <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(16,185,129,0.12)' }}>
                              <p className="text-xs font-semibold mb-1.5" style={{ color: '#10b981' }}>📂 Past Projects</p>
                              <div className="flex flex-col gap-1">
                                {past.map((a, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs px-2 py-1 rounded-lg"
                                    style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.1)' }}>
                                    <span style={{ color: '#10b981' }}>✅</span>
                                    <span style={{ color: 'var(--text-secondary)' }}>{a.projectName}</span>
                                    {a.finalRemark && <span style={{ color: 'var(--text-muted)' }}>— {a.finalRemark.length > 25 ? a.finalRemark.slice(0,25)+'…' : a.finalRemark}</span>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="flex gap-2 flex-wrap items-start">
                        {/* Hide action buttons when: finalised, assigned, or completed but no new project yet */}
                        {!isFinalised && status !== 'assigned' && !!m.projectName && (
                          <>
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
                                onClick={() => { 
                                  const menteeDuration = m.projectDuration || '6_months';
                                  const activeBatchId = activeBatch?._id?.toString();
                                  const is2nd = activeBatchId
                                    ? projects.some(p => p.mentee?.email === m.email && p.isArchived && p.batchId?.toString() === activeBatchId)
                                    : false;
                                  setForm({ menteeEmail: m.email, mentorEmail: '', duration: is2nd ? '6_months' : menteeDuration }); 
                                  setTab('assign'); 
                                }}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium"
                                style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}>
                                ➕ Assign Mentor
                              </button>
                            )}
                          </>
                        )}
                        <button
                          onClick={() => handleDeleteUser(m.email)}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
                          🗑 Remove
                        </button>
                      </div>
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
                <select className={inputCls} value={form.menteeEmail} onChange={e => {
                  const selectedMentee = mentees.find(m => m.email === e.target.value);
                  const menteeDuration = selectedMentee?.projectDuration || '6_months';
                  setForm({ ...form, menteeEmail: e.target.value, duration: menteeDuration });
                }}>
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
                  <span className="ml-2">
                    • Duration: {form.duration === '1_year' ? '1 Year' : '6 Months'}
                  </span>
                  <span className="ml-2 opacity-60">(auto-fetched from mentee's project, can be changed below)</span>
                </div>
              )}

              <Field label="Select Mentor">
                <select className={inputCls} value={form.mentorEmail} onChange={e => setForm({ ...form, mentorEmail: e.target.value })}>
                  <option value="">-- Choose Mentor --</option>
                  {mentors.map(m => <option key={m.email} value={m.email}>{m.email}</option>)}
                </select>
              </Field>

              <Field label="Project Duration">
                {(() => {
                  // Only block 1-year if mentee has archived project IN THE CURRENT active batch
                  const activeBatchId = activeBatch?._id?.toString();
                  const is2ndProject = form.menteeEmail && activeBatchId
                    ? projects.some(p =>
                        p.mentee?.email === form.menteeEmail &&
                        p.isArchived &&
                        p.batchId?.toString() === activeBatchId
                      )
                    : false;
                  return (
                    <>
                      <select className={inputCls} value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })}>
                        <option value="6_months">6 Months</option>
                        {!is2ndProject && <option value="1_year">1 Year</option>}
                      </select>
                      {is2ndProject && (
                        <p className="text-xs mt-1" style={{ color: '#f59e0b' }}>
                          ⚠ 1-year option unavailable — this is the 2nd project in the same academic year.
                        </p>
                      )}
                    </>
                  );
                })()}
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
                  style={{ border: `1px solid ${a.isArchived ? 'rgba(16,185,129,0.2)' : 'rgba(236,72,153,0.1)'}` }}>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold" style={{ color: 'var(--text-primary)' }}>{a.projectName}</p>
                      {a.isArchived && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                          style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                          ✅ Completed
                        </span>
                      )}
                      {a.finalRemark && (
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{ background: 'rgba(16,185,129,0.08)', color: '#6ee7b7' }}>
                          "{a.finalRemark.length > 30 ? a.finalRemark.slice(0, 30) + '…' : a.finalRemark}"
                        </span>
                      )}
                    </div>
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
                {(() => {
                  // Only block 1-year if mentee has archived project IN THE CURRENT active batch
                  const selectedAssignment = assignments.find(a => a._id === editId);
                  const activeBatchId = activeBatch?._id?.toString();
                  const is2nd6Month = selectedAssignment && activeBatchId
                    ? projects.some(p =>
                        p.mentee?.email === selectedAssignment.menteeEmail &&
                        p.isArchived &&
                        p.batchId?.toString() === activeBatchId
                      )
                    : false;

                  return (
                    <select className={inputCls} value={editForm.duration} onChange={e => setEditForm({ ...editForm, duration: e.target.value })}>
                      <option value="">-- Keep current duration --</option>
                      <option value="6_months">6 Months</option>
                      {!is2nd6Month && <option value="1_year">1 Year</option>}
                    </select>
                  );
                })()}
                {assignments.find(a => a._id === editId) && (() => {
                  const sel = assignments.find(a => a._id === editId);
                  const activeBatchId = activeBatch?._id?.toString();
                  const show = activeBatchId && projects.some(p =>
                    p.mentee?.email === sel?.menteeEmail && p.isArchived && p.batchId?.toString() === activeBatchId
                  );
                  return show ? (
                    <p className="text-xs mt-1" style={{ color: '#f59e0b' }}>
                      ⚠ 1-year option unavailable — this is the 2nd project in the same academic year.
                    </p>
                  ) : null;
                })()}
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

          {/* ── ACADEMIC YEARS (BATCHES) TAB ── */}
          {tab === 'batches' && (
            <div className="space-y-6">
              {/* One-time repair tool for existing completed projects */}
              <div className="glass rounded-2xl p-4 flex items-center justify-between gap-4"
                style={{ border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.04)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#f59e0b' }}>🔧 Data Repair</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Archive files for mentees whose projects were already finalised by mentor.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      const res = await axios.post(`${API}/admin/repair-completed-files`);
                      flash(res.data.message, 'success');
                      axios.get(`${API}/mentees`).then(r => setMentees(r.data.data || [])).catch(() => {});
                    } catch (err) {
                      flash(err.response?.data?.message || 'Repair failed', 'error');
                    }
                  }}
                  className="shrink-0 px-4 py-2 rounded-xl text-xs font-semibold"
                  style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
                  Run Repair
                </button>
              </div>
              {/* Welcome Message for First-Time Setup */}
              {batches.length === 0 && (
                <div className="glass rounded-2xl p-6" style={{ 
                  border: '1px solid rgba(236,72,153,0.2)',
                  background: 'linear-gradient(135deg, rgba(236,72,153,0.05), rgba(168,85,247,0.05))'
                }}>
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">🎓</div>
                    <div>
                      <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                        Welcome to Project Review Platform!
                      </h3>
                      <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                        To get started, please create your first academic year below. Academic years help organize projects by year.
                      </p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        💡 Example: "2025-26" for academic year 2025-2026
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Create New Batch Form */}
              <div className="glass rounded-2xl p-6" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
                  Create New Academic Year
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Field label="Academic Year Name">
                    <input
                      type="text"
                      placeholder="e.g., 2025-26"
                      value={batchForm.name}
                      onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })}
                      className="input-custom w-full px-4 py-2.5 rounded-xl text-sm"
                    />
                  </Field>
                  <Field label="Set as Active">
                    <select
                      value={batchForm.isActive}
                      onChange={(e) => setBatchForm({ ...batchForm, isActive: e.target.value === 'true' })}
                      className="input-custom w-full px-4 py-2.5 rounded-xl text-sm"
                    >
                      <option value="false">No</option>
                      <option value="true">Yes</option>
                    </select>
                  </Field>
                  <div className="flex items-end">
                    <button
                      onClick={handleCreateBatch}
                      disabled={batchLoading}
                      className="btn-primary-custom w-full py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-60"
                    >
                      {batchLoading ? 'Creating...' : 'Create Academic Year'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Existing Batches List */}
              <div className="glass rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(236,72,153,0.1)', background: 'rgba(236,72,153,0.04)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    All Academic Years ({batches.length})
                  </p>
                </div>
                {batches.length === 0 ? (
                  <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>
                    <p className="text-4xl mb-3">📅</p>
                    <p>No academic years created yet. Create one above to get started.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(236,72,153,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                          <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            Academic Year
                          </th>
                          <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            Status
                          </th>
                          <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            Created
                          </th>
                          <th className="px-4 py-3 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {batches.map((batch, idx) => (
                          <tr key={batch._id} style={{ borderBottom: idx < batches.length - 1 ? '1px solid rgba(236,72,153,0.06)' : 'none' }}>
                            <td className="px-4 py-3 font-semibold" style={{ color: 'var(--text-primary)' }}>
                              {batch.name}
                            </td>
                            <td className="px-4 py-3">
                              {batch.isActive ? (
                                <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                                  ✅ Active
                                </span>
                              ) : (
                                <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(156,163,175,0.15)', color: '#9ca3af' }}>
                                  Inactive
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>
                              {new Date(batch.createdAt).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-2">
                                {!batch.isActive && (
                                  <button
                                    onClick={() => handleActivateBatch(batch._id)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                                    style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}
                                  >
                                    Set as Active
                                  </button>
                                )}
                                {!batch.isActive && (
                                  <button
                                    onClick={() => handleDeleteBatch(batch._id, batch.name)}
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── ALL PROJECTS TAB ── */}
          {tab === 'projects' && (
            <div className="space-y-3">
              {/* Refresh Button */}
              <div className="flex justify-end">
                <button
                  onClick={fetchProjects}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all hover:scale-105"
                  style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}
                >
                  🔄 Refresh
                </button>
              </div>

              {/* Hierarchical View: Batches > Projects > Files */}
              {batches.length === 0 ? (
                <div className="glass rounded-2xl p-8 text-center" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    No academic years found. Create one in the Academic Years tab.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* List all batches */}
                  {batches.map(batch => {
                    // Include projects matching this batch, plus archived projects with no batchId under the active batch
                    const batchProjects = projects.filter(p => {
                      if (p.batchId?.toString() === batch._id.toString()) return true;
                      // Show archived/completed projects with no batchId under the active batch
                      if (batch.isActive && !p.batchId && (p.isArchived || p.finalRemark)) return true;
                      return false;
                    });
                    const isExpanded = expandedBatches.has(batch._id);
                    
                    return (
                      <div key={batch._id} className="glass rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                        {/* Batch Header - Clickable */}
                        <button
                          onClick={() => toggleBatch(batch._id)}
                          className="w-full px-5 py-4 flex items-center justify-between hover:bg-opacity-50 transition-all"
                          style={{ background: isExpanded ? 'rgba(236,72,153,0.08)' : 'rgba(236,72,153,0.03)' }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{isExpanded ? '📂' : '📁'}</span>
                            <div className="text-left">
                              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                                {batch.name}
                                {batch.isActive && (
                                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>
                                    Active
                                  </span>
                                )}
                              </h3>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {batchProjects.length} project{batchProjects.length !== 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <span className="text-xl" style={{ color: 'var(--text-muted)' }}>
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </button>

                        {/* Projects List - Shows when batch is expanded */}
                        {isExpanded && (
                          <div className="px-3 pb-3">
                            {batchProjects.length === 0 ? (
                              <div className="p-6 text-center" style={{ color: 'var(--text-muted)' }}>
                                <p className="text-sm">No projects in this academic year yet.</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {batchProjects.map(project => {
                                  const isProjectExpanded = expandedProjects.has(project._id);
                                  
                                  return (
                                    <div key={project._id} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(236,72,153,0.08)' }}>
                                      {/* Project Header - Clickable */}
                                      <button
                                        onClick={() => toggleProject(project._id, project.mentee?.email, project)}
                                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-opacity-50 transition-all"
                                        style={{ background: isProjectExpanded ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)' }}
                                      >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                          <span className="text-base">{isProjectExpanded ? '📄' : '📋'}</span>
                                          <div className="text-left flex-1 min-w-0">
                                            <h4 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                              {project.projectName}
                                            </h4>
                                            <div className="flex items-center gap-3 mt-0.5">
                                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                👤 {project.mentee?.name || project.mentee?.email}
                                              </p>
                                              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                                🎓 {project.mentor?.name || project.mentor?.email}
                                              </p>
                                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8' }}>
                                                {project.duration === '1_year' ? '1 Year' : '6 Months'}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        <span className="text-lg ml-2" style={{ color: 'var(--text-muted)' }}>
                                          {isProjectExpanded ? '▼' : '▶'}
                                        </span>
                                      </button>

                                      {/* Project Files - Shows when project is expanded */}
                                      {isProjectExpanded && (
                                        <div className="px-2 pb-2" style={{ borderTop: '1px solid rgba(236,72,153,0.08)' }}>
                                          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                                            style={{ background: 'rgba(236,72,153,0.04)', color: 'var(--text-muted)' }}>
                                            File Submissions — {project.mentee?.email}
                                            <span className="ml-3 normal-case font-normal px-2 py-0.5 rounded-full"
                                              style={{ background: project.duration === '1_year' ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.12)', color: project.duration === '1_year' ? '#818cf8' : '#10b981', border: `1px solid ${project.duration === '1_year' ? 'rgba(99,102,241,0.25)' : 'rgba(16,185,129,0.25)'}` }}>
                                              🗓 {project.duration === '1_year' ? '1 Year' : '6 Months'}
                                            </span>
                                            {project.finalRemark && (
                                              <span className="ml-3 normal-case font-normal px-2 py-0.5 rounded-full"
                                                style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                                                ✅ {project.finalRemark}
                                                {project.finalRemarkedAt && <> · {new Date(project.finalRemarkedAt).toLocaleDateString()}</>}
                                              </span>
                                            )}
                                          </div>
                                          {filesLoading === project.mentee?.email ? (
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
                                                  {getAllowedPhases(project.duration).map(key => {
                                                    const cacheKey = `${project.mentee?.email}__${project.projectName}`;
                                                    const upload = (menteeFiles[cacheKey] || {})[key];
                                                    return (
                                                      <tr key={key} style={{ borderBottom: '1px solid rgba(236,72,153,0.06)', opacity: upload ? 1 : 0.4 }}>
                                                        <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>
                                                          {PHASE_CONFIG[key]?.label ?? key}
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
                                                              onClick={() => handleViewFile(upload.fileURL, project.mentee?.email)}
                                                              className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                                                              style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}
                                                            >
                                                              🔒 View
                                                            </button>
                                                          )}
                                                        </td>
                                                      </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Unassigned Projects Section */}
                  {(() => {
                    const unassignedProjects = projects.filter(p => !p.batchId);
                    if (unassignedProjects.length === 0) return null;
                    
                    const isExpanded = expandedBatches.has('unassigned');
                    
                    return (
                      <div className="glass rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(239,68,68,0.12)' }}>
                        <button
                          onClick={() => toggleBatch('unassigned')}
                          className="w-full px-5 py-4 flex items-center justify-between hover:bg-opacity-50 transition-all"
                          style={{ background: isExpanded ? 'rgba(239,68,68,0.08)' : 'rgba(239,68,68,0.03)' }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">⚠️</span>
                            <div className="text-left">
                              <h3 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                                Unassigned (No Academic Year)
                              </h3>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                {unassignedProjects.length} project{unassignedProjects.length !== 1 ? 's' : ''} - Created before batch system
                              </p>
                            </div>
                          </div>
                          <span className="text-xl" style={{ color: 'var(--text-muted)' }}>
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="px-3 pb-3">
                            <div className="space-y-2">
                              {unassignedProjects.map(project => {
                                const isProjectExpanded = expandedProjects.has(project._id);
                                
                                return (
                                  <div key={project._id} className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(236,72,153,0.08)' }}>
                                    <button
                                      onClick={() => toggleProject(project._id, project.mentee?.email, project)}
                                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-opacity-50 transition-all"
                                      style={{ background: isProjectExpanded ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.02)' }}
                                    >
                                      <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <span className="text-base">{isProjectExpanded ? '📄' : '📋'}</span>
                                        <div className="text-left flex-1 min-w-0">
                                          <h4 className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                                            {project.projectName}
                                          </h4>
                                          <div className="flex items-center gap-3 mt-0.5">
                                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                              👤 {project.mentee?.name || project.mentee?.email}
                                            </p>
                                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                              🎓 {project.mentor?.name || project.mentor?.email}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                      <span className="text-lg ml-2" style={{ color: 'var(--text-muted)' }}>
                                        {isProjectExpanded ? '▼' : '▶'}
                                      </span>
                                    </button>

                                    {isProjectExpanded && (
                                      <div className="px-2 pb-2" style={{ borderTop: '1px solid rgba(236,72,153,0.08)' }}>
                                        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                                          style={{ background: 'rgba(236,72,153,0.04)', color: 'var(--text-muted)' }}>
                                          File Submissions — {project.mentee?.email}
                                          {project.duration && (
                                            <span className="ml-3 normal-case font-normal px-2 py-0.5 rounded-full"
                                              style={{ background: project.duration === '1_year' ? 'rgba(99,102,241,0.12)' : 'rgba(16,185,129,0.12)', color: project.duration === '1_year' ? '#818cf8' : '#10b981', border: `1px solid ${project.duration === '1_year' ? 'rgba(99,102,241,0.25)' : 'rgba(16,185,129,0.25)'}` }}>
                                              🗓 {project.duration === '1_year' ? '1 Year' : '6 Months'}
                                            </span>
                                          )}
                                          {project.finalRemark && (
                                            <span className="ml-3 normal-case font-normal px-2 py-0.5 rounded-full"
                                              style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                                              ✅ {project.finalRemark}
                                              {project.finalRemarkedAt && <> · {new Date(project.finalRemarkedAt).toLocaleDateString()}</>}
                                            </span>
                                          )}
                                        </div>
                                        {filesLoading === project.mentee?.email ? (
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
                                                {getAllowedPhases(project.duration || '6_months').map(key => {
                                                  const cacheKey = `${project.mentee?.email}__${project.projectName}`;
                                                  const upload = (menteeFiles[cacheKey] || {})[key];
                                                  return (
                                                    <tr key={key} style={{ borderBottom: '1px solid rgba(236,72,153,0.06)', opacity: upload ? 1 : 0.4 }}>
                                                      <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-primary)' }}>
                                                        {PHASE_CONFIG[key]?.label ?? key}
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
                                                            onClick={() => handleViewFile(upload.fileURL, project.mentee?.email)}
                                                            className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                                                            style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}
                                                          >
                                                            🔒 View
                                                          </button>
                                                        )}
                                                      </td>
                                                    </tr>
                                                  );
                                                })}
                                              </tbody>
                                            </table>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

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
