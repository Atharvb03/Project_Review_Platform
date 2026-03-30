import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { useTheme } from '../context/ThemeContext';
import { logout } from '../utils/auth';
import { PHASE_CONFIG, getAllowedPhases } from '../utils/phases';

const API = 'http://localhost:5000/api';

export default function MentorDashboard() {
  const [assignments, setAssignments]       = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [uploads, setUploads]               = useState({});
  const [remarks, setRemarks]               = useState({});
  const [viewFile, setViewFile]             = useState(null);
  const [submitting, setSubmitting]         = useState('');
  const [loadingAction, setLoadingAction]   = useState('');
  const [toast, setToast]                   = useState(null);
  const [finalRemark, setFinalRemark]       = useState('');
  const [submittingFinal, setSubmittingFinal] = useState(false);
  const [notifications, setNotifications]   = useState([]);
  // Deadline management
  const [deadlineInput, setDeadlineInput]   = useState('');
  const [extendInput, setExtendInput]       = useState('');
  const [deadlineLoading, setDeadlineLoading] = useState(false);
  // Dashboard
  const [activeTab, setActiveTab]           = useState('submissions');
  const [dashData, setDashData]             = useState(null);
  const [dashLoading, setDashLoading]       = useState(false);
  // Active academic year
  const [activeBatch, setActiveBatch]       = useState(null);
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();

  const mentorEmail = localStorage.getItem('userEmail') || '';

  const showToast = (msg, type = 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Fetch active academic year
  useEffect(() => {
    axios.get(`${API}/batches/active`)
      .then(r => {
        if (r.data.success && r.data.data) {
          setActiveBatch(r.data.data.name);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!mentorEmail) return;
    axios.get(`${API}/assignments/mentor/${mentorEmail}`)
      .then(r => {
        const data = r.data.data || [];
        setAssignments(data);
        if (data.length > 0) setSelectedAssignment(data[0]);
      })
      .catch(() => {});
    // Fetch notifications
    axios.get(`${API}/mentor/notifications`)
      .then(r => setNotifications(r.data.data || [])).catch(() => {});
  }, [mentorEmail]);

  const markNotificationsRead = async () => {
    try {
      await axios.post(`${API}/notifications/read`, {});
      setNotifications([]);
    } catch {}
  };

  const fetchDashboard = async () => {
    if (!mentorEmail) return;
    setDashLoading(true);
    try {
      const r = await axios.get(`${API}/dashboard/mentor/${mentorEmail}`);
      setDashData(r.data.data);
    } catch {}
    finally { setDashLoading(false); }
  };

  const handleTabSwitch = (tab) => {
    setActiveTab(tab);
    if (tab === 'dashboard') fetchDashboard();
  };

  // Pre-fill deadline inputs when selected assignment changes
  useEffect(() => {
    if (!selectedAssignment) return;
    setDeadlineInput(
      selectedAssignment.deadline
        ? new Date(selectedAssignment.deadline).toISOString().slice(0, 16)
        : ''
    );
    setExtendInput(
      selectedAssignment.extendedDeadline
        ? new Date(selectedAssignment.extendedDeadline).toISOString().slice(0, 16)
        : ''
    );
  }, [selectedAssignment?._id]); // eslint-disable-line

  const handleSetDeadline = async () => {
    if (!deadlineInput || !selectedAssignment?._id) return;
    setDeadlineLoading(true);
    try {
      await axios.put(`${API}/assignments/${selectedAssignment._id}/set-deadline`,
        { deadline: new Date(deadlineInput).toISOString() }
      );
      const updated = { ...selectedAssignment, deadline: new Date(deadlineInput) };
      setSelectedAssignment(updated);
      setAssignments(prev => prev.map(a => a._id === updated._id ? updated : a));
      showToast('Deadline set successfully.', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to set deadline.');
    } finally {
      setDeadlineLoading(false);
    }
  };

  const handleExtendDeadline = async () => {
    if (!extendInput || !selectedAssignment?._id) return;
    setDeadlineLoading(true);
    try {
      await axios.put(`${API}/assignments/${selectedAssignment._id}/extend-deadline`,
        { extendedDeadline: new Date(extendInput).toISOString() }
      );
      const updated = { ...selectedAssignment, extendedDeadline: new Date(extendInput) };
      setSelectedAssignment(updated);
      setAssignments(prev => prev.map(a => a._id === updated._id ? updated : a));
      showToast('Deadline extended. Mentee has been notified.', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to extend deadline.');
    } finally {
      setDeadlineLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedAssignment?.menteeEmail) return;
    setUploads({}); // clear previous mentee's files immediately
    setRemarks({}); // clear previous mentee's remarks
    setFinalRemark(''); // clear final remark input
    axios.get(`${API}/files/metadata/${selectedAssignment.menteeEmail}`)
      .then(r => {
        const map = {};
        (r.data.data || []).forEach(f => {
          map[f.section] = {
            fileURL:   f.file_url,
            filename:  f.file_name,
            remark:    f.remark,
            timestamp: f.updatedAt,
          };
        });
        setUploads(map);
      })
      .catch(() => setUploads({}));
  }, [selectedAssignment?.menteeEmail, mentorEmail]); // key on menteeEmail string, not object ref

  const handleRemarkChange = (section, val) =>
    setRemarks(prev => ({ ...prev, [section]: val }));

  const submitRemark = async (section) => {
    if (!remarks[section]?.trim()) return;
    setSubmitting(section);
    try {
      await axios.patch(`${API}/files/remark`, {
        menteeEmail: selectedAssignment.menteeEmail,
        section,
        remark: remarks[section],
      });
      setUploads(prev => ({
        ...prev,
        [section]: { ...prev[section], remark: remarks[section] },
      }));
      setRemarks(prev => ({ ...prev, [section]: '' }));
      showToast('Remark submitted.', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit remark.');
    } finally {
      setTimeout(() => setSubmitting(''), 600);
    }
  };

  const getSignedUrl = async (upload) => {
    const res = await axios.post(`${API}/files/secure-url`, {
      s3Key:       upload.fileURL,
      menteeEmail: selectedAssignment.menteeEmail,
    });
    if (!res.data.success) throw new Error('Could not generate secure link.');
    return res.data.url;
  };

  const handleView = async (section, upload) => {
    if (!upload?.fileURL) return;
    setLoadingAction(`${section}-view`);
    try {
      const url = await getSignedUrl(upload);
      setViewFile(url);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to get secure URL.');
    } finally {
      setLoadingAction('');
    }
  };

  const handleDownload = async (section, upload) => {
    if (!upload?.fileURL) return;
    setLoadingAction(`${section}-download`);
    try {
      const res = await axios.post(`${API}/files/secure-url`, {
        s3Key:       upload.fileURL,
        menteeEmail: selectedAssignment.menteeEmail,
        download:    true,
        fileName:    upload.filename,
      });
      if (!res.data.success) throw new Error('Could not generate download link.');
      const a = document.createElement('a');
      a.href = res.data.url;
      a.download = upload.filename || 'download';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to get download URL.');
    } finally {
      setLoadingAction('');
    }
  };

  // Derive section keys from the selected assignment's duration — updates reactively
  const sectionKeys = getAllowedPhases(selectedAssignment?.duration || '6_months');

  // All uploaded files must have a non-pending remark before final submission
  const uploadedKeys = sectionKeys.filter(k => uploads[k]);
  const allRemarked = uploadedKeys.length > 0 &&
    uploadedKeys.every(k => uploads[k]?.remark && uploads[k].remark !== 'Pending Review');

  const submitFinalRemark = async () => {
    if (!finalRemark.trim() || !selectedAssignment?._id) return;
    setSubmittingFinal(true);
    try {
      await axios.patch(`${API}/assignments/${selectedAssignment._id}/final-remark`,
        { finalRemark }
      );
      // Update local assignment state so the badge shows immediately
      setAssignments(prev => prev.map(a =>
        a._id === selectedAssignment._id ? { ...a, finalRemark, finalRemarkedAt: new Date() } : a
      ));
      setSelectedAssignment(prev => ({ ...prev, finalRemark, finalRemarkedAt: new Date() }));
      setFinalRemark('');
      showToast('Project marked as Done / Accepted.', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to submit final remark.');
    } finally {
      setSubmittingFinal(false);
    }
  };

  return (
    /* Full-height flex container — sidebar fixed height, main scrolls independently */
    <div className="flex h-screen overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: 'var(--bg-primary)' }}>

      {/* ── Sidebar ── */}
      <aside className="w-60 shrink-0 flex flex-col h-full overflow-y-auto p-4 gap-2"
        style={{
          background:   dark ? 'rgba(255,255,255,0.03)' : 'rgba(236,72,153,0.04)',
          borderRight:  '1px solid rgba(236,72,153,0.12)',
        }}>

        {/* Avatar + email */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7)', boxShadow: '0 0 16px rgba(236,72,153,0.5)' }}>
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Mentor</p>
            <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{mentorEmail || 'Dashboard'}</p>
          </div>
        </div>

        {/* Active Academic Year */}
        {activeBatch && (
          <div className="rounded-xl p-3 mb-2"
            style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.15)' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: '#818cf8' }}>📅 Academic Year</p>
            <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{activeBatch}</p>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-1 mb-2 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(236,72,153,0.1)' }}>
          {[['dashboard','📊','Dashboard'],['submissions','📋','Reviews']].map(([id, icon, label]) => (
            <button key={id} onClick={() => handleTabSwitch(id)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: activeTab === id ? 'linear-gradient(135deg,#ec4899,#a855f7)' : 'transparent',
                color: activeTab === id ? '#fff' : 'var(--text-muted)',
              }}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Mentee list */}
        <p className="text-xs font-semibold px-1 mb-1" style={{ color: '#f472b6' }}>Assigned Mentees</p>
        {assignments.length === 0
          ? <p className="text-xs px-1" style={{ color: 'var(--text-muted)' }}>No assignments yet</p>
          : assignments.map(a => (
            <button key={a._id.toString()} onClick={() => setSelectedAssignment(a)}
              className="w-full text-left px-3 py-2.5 rounded-xl mb-1 transition-all"
              style={{
                background: selectedAssignment?.menteeEmail === a.menteeEmail
                  ? 'rgba(236,72,153,0.12)' : 'rgba(255,255,255,0.03)',
                border: selectedAssignment?.menteeEmail === a.menteeEmail
                  ? '1px solid rgba(236,72,153,0.25)' : '1px solid rgba(255,255,255,0.05)',
              }}>
              <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{a.menteeName || a.menteeEmail}</p>
              <p className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>📁 {a.projectName}</p>
              {a.finalRemark && <p className="text-xs mt-0.5" style={{ color: '#10b981' }}>✅ Accepted</p>}
            </button>
          ))
        }

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="rounded-xl p-3 mb-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold" style={{ color: '#f59e0b' }}>🔔 ({notifications.length})</p>
              <button onClick={markNotificationsRead} className="text-xs" style={{ color: 'var(--text-muted)' }}>Clear</button>
            </div>
            {notifications.map((n, i) => (
              <p key={i} className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
            ))}
          </div>
        )}

        {/* Theme + logout pinned to bottom */}
        <div className="flex flex-col gap-2 mt-auto pt-3"
          style={{ borderTop: '1px solid rgba(236,72,153,0.1)' }}>
          <div className="flex items-center justify-between px-1">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Theme</span>
            <button onClick={toggle} className="text-lg hover:scale-110 transition-transform">
              {dark ? '☀️' : '🌙'}
            </button>
          </div>
          <button onClick={() => logout()}
            className="w-full py-2 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 overflow-y-auto p-6">

        {/* Toast */}
        {toast && (
          <div className="fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
            style={{
              background:     toast.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
              border:         `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
              color:          toast.type === 'success' ? '#10b981' : '#f87171',
              backdropFilter: 'blur(8px)',
            }}>
            {toast.type === 'success' ? '✅' : '❌'} {toast.msg}
          </div>
        )}

        {/* Header */}
        {activeTab === 'submissions' && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Review Submissions
          </h1>
          {selectedAssignment && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Reviewing:</span>
              <span className="text-xs px-3 py-1 rounded-full"
                style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}>
                📚 {selectedAssignment.menteeName || selectedAssignment.menteeEmail}
              </span>
              <span className="text-xs px-3 py-1 rounded-full"
                style={{ background: 'rgba(168,85,247,0.1)', color: '#c084fc', border: '1px solid rgba(168,85,247,0.2)' }}>
                📁 {selectedAssignment.projectName}
              </span>
            </div>
          )}
          {/* Group Members (read-only) */}
          {selectedAssignment?.groupMembers?.length > 0 && (
            <div className="mt-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)', display: 'inline-block' }}>
              <p className="text-xs font-semibold mb-1.5" style={{ color: '#818cf8' }}>👥 Group Members</p>
              <div className="flex flex-wrap gap-2">
                {selectedAssignment.groupMembers.map((m, i) => (
                  <span key={i} className="text-xs px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--text-secondary)', border: '1px solid rgba(99,102,241,0.12)' }}>
                    {i + 1}. {m.name}{m.rollNo ? ` (${m.rollNo})` : ''}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* ── DASHBOARD TAB ── */}
        {activeTab === 'dashboard' && (
          <div>
            <div className="mb-6">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Mentor Dashboard</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Overview of your assigned mentees and their progress.</p>
            </div>
            {dashLoading ? (
              <div className="flex items-center justify-center py-20">
                <svg className="animate-spin w-8 h-8" style={{ color: '#ec4899' }} fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>
              </div>
            ) : dashData ? (
              <div className="space-y-5">
                {/* Stat cards */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: 'Assigned', value: dashData.stats.totalAssigned, color: '#f472b6', bg: 'rgba(236,72,153,0.1)', icon: '👥' },
                    { label: 'Pending Review', value: dashData.stats.totalPendingReview, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: '⏳' },
                    { label: 'Late Submissions', value: dashData.stats.totalLate, color: '#f87171', bg: 'rgba(239,68,68,0.1)', icon: '🔴' },
                    { label: 'Accepted', value: dashData.stats.totalAccepted, color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: '✅' },
                  ].map(s => (
                    <div key={s.label} className="glass rounded-2xl p-4 flex flex-col gap-1"
                      style={{ border: `1px solid ${s.bg.replace('0.1','0.25')}` }}>
                      <span className="text-lg">{s.icon}</span>
                      <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                    </div>
                  ))}
                </div>

                {/* Mentee table */}
                {dashData.mentees.length > 0 && (
                  <div className="glass rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                    <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(236,72,153,0.1)', background: 'rgba(236,72,153,0.04)' }}>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Mentee Overview</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(236,72,153,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                            {[
                              { label: 'Mentee',        align: 'left'   },
                              { label: 'Project',       align: 'left'   },
                              { label: 'Submitted',     align: 'center' },
                              { label: 'Pending Review',align: 'center' },
                              { label: 'Late',          align: 'center' },
                              { label: 'Deadline',      align: 'center' },
                              { label: 'Status',        align: 'left'   },
                            ].map(h => (
                              <th key={h.label}
                                className="px-4 py-2.5 font-semibold uppercase tracking-wider text-xs"
                                style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: h.align }}>
                                {h.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dashData.mentees.map((m, i) => {
                            const finalDl = m.extendedDeadline || m.deadline;
                            return (
                              <tr key={m.menteeEmail} style={{ borderBottom: i < dashData.mentees.length - 1 ? '1px solid rgba(236,72,153,0.06)' : 'none' }}>
                                <td className="px-4 py-3 font-medium text-left" style={{ color: 'var(--text-primary)' }}>{m.menteeName || m.menteeEmail}</td>
                                <td className="px-4 py-3 text-left" style={{ color: 'var(--text-muted)' }}>{m.projectName}</td>
                                <td className="px-4 py-3 text-center" style={{ color: '#10b981' }}>{m.stats.submitted}</td>
                                <td className="px-4 py-3 text-center">
                                  <span style={{ color: m.stats.pendingReview > 0 ? '#f59e0b' : 'var(--text-muted)' }}>{m.stats.pendingReview}</span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span style={{ color: m.stats.lateCount > 0 ? '#f87171' : 'var(--text-muted)' }}>{m.stats.lateCount}</span>
                                </td>
                                <td className="px-4 py-3 text-center" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {finalDl ? new Date(finalDl).toLocaleDateString() : '—'}
                                  {m.extendedDeadline && <span style={{ color: '#10b981' }}> ✦</span>}
                                </td>
                                <td className="px-4 py-3 text-left">
                                  {m.finalRemark
                                    ? <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>✅ Accepted</span>
                                    : m.stats.pendingReview > 0
                                      ? <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>⏳ Pending</span>
                                      : <span className="px-2 py-0.5 rounded-full" style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8' }}>🔵 In Progress</span>
                                  }
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="glass rounded-2xl p-12 text-center" style={{ border: '1px solid rgba(236,72,153,0.1)' }}>
                <p className="text-4xl mb-3">📊</p>
                <p style={{ color: 'var(--text-muted)' }}>No mentees assigned yet.</p>
              </div>
            )}
          </div>
        )}

        {/* ── SUBMISSIONS TAB ── */}
        {activeTab === 'submissions' && assignments.length === 0 ? (
          <div className="glass rounded-2xl p-16 text-center"
            style={{ border: '1px solid rgba(236,72,153,0.1)' }}>
            <p className="text-4xl mb-3">📭</p>
            <p style={{ color: 'var(--text-muted)' }}>No mentees assigned to you yet.</p>
          </div>
        ) : activeTab === 'submissions' && (
          <>
          <div className="glass rounded-2xl overflow-hidden"
            style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: '700px' }}>
                <thead>
                  <tr style={{
                    borderBottom: '1px solid rgba(236,72,153,0.1)',
                    background:   'rgba(236,72,153,0.05)',
                  }}>
                    {['Stage', 'File', 'Remark', 'Add Remark', 'Actions'].map(h => (
                      <th key={h}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                        style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sectionKeys.map((key, i) => {
                    const upload       = uploads[key];
                    const isSubmitting = submitting === key;
                    const isViewing    = loadingAction === `${key}-view`;
                    const isDownloading = loadingAction === `${key}-download`;

                    return (
                      <tr key={key} style={{
                        borderBottom: i < sectionKeys.length - 1
                          ? '1px solid rgba(236,72,153,0.06)' : 'none',
                        opacity: upload ? 1 : 0.4,
                      }}>

                        {/* Stage */}
                        <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          <div className="flex items-center gap-2">
                            <span>{upload ? '📄' : '—'}</span>
                            {PHASE_CONFIG[key]?.label ?? key}
                          </div>
                        </td>

                        {/* Filename */}
                        <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)', maxWidth: '140px' }}>
                          <span className="block truncate" title={upload?.filename}>
                            {upload?.filename || '—'}
                          </span>
                        </td>

                        {/* Current remark */}
                        <td className="px-4 py-3 text-xs" style={{ maxWidth: '130px' }}>
                          <span className="block truncate" title={upload?.remark} style={{
                            color: upload?.remark === 'Pending Review' ? '#f59e0b'
                              : upload?.remark?.toLowerCase().includes('approved') ? '#10b981'
                              : upload?.remark ? 'var(--text-secondary)' : 'var(--text-muted)',
                          }}>
                            {upload?.remark || '—'}
                          </span>
                        </td>

                        {/* Remark input */}
                        <td className="px-4 py-3">
                          {upload && !selectedAssignment?.finalRemark && (
                            <input
                              type="text"
                              placeholder="Add remark..."
                              value={remarks[key] || ''}
                              onChange={e => handleRemarkChange(key, e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && submitRemark(key)}
                              className="input-custom px-3 py-1.5 rounded-lg text-xs"
                              style={{ width: '150px' }}
                            />
                          )}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          {upload && (
                            <div className="flex items-center gap-1.5" style={{ whiteSpace: 'nowrap' }}>
                              <button
                                onClick={() => handleView(key, upload)}
                                disabled={!!loadingAction}
                                className="text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-60 transition-opacity"
                                style={{ background: 'rgba(99,102,241,0.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
                                {isViewing ? '⏳' : 'View'}
                              </button>
                              <button
                                onClick={() => handleDownload(key, upload)}
                                disabled={!!loadingAction}
                                className="text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-60 transition-opacity"
                                style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                                {isDownloading ? '⏳' : '↓'}
                              </button>
                              {!selectedAssignment?.finalRemark && (
                                <button
                                  onClick={() => submitRemark(key)}
                                  disabled={isSubmitting || !remarks[key]?.trim()}
                                  className="text-xs px-2.5 py-1.5 rounded-lg disabled:opacity-50 transition-opacity"
                                  style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}>
                                  {isSubmitting ? '✓' : 'Submit'}
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Deadline Management ── */}
          {selectedAssignment && !selectedAssignment.finalRemark && (
            <div className="mt-4 glass rounded-2xl p-5 space-y-4"
              style={{ border: '1px solid rgba(99,102,241,0.2)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>📅 Deadline Management</p>

              {/* Both set — fully locked */}
              {selectedAssignment.deadline && selectedAssignment.extendedDeadline ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-3 text-xs">
                    <span className="px-3 py-1.5 rounded-lg" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
                      📅 Original: {new Date(selectedAssignment.deadline).toLocaleString()}
                    </span>
                    <span className="px-3 py-1.5 rounded-lg" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                      ✦ Extended: {new Date(selectedAssignment.extendedDeadline).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs px-3 py-2 rounded-lg" style={{ background: 'rgba(239,68,68,0.07)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
                    🔒 Deadline has been set and extended. No further changes allowed.
                  </p>
                </div>

              /* Deadline set, not yet extended — show extend only */
              ) : selectedAssignment.deadline ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-3 text-xs mb-1">
                    <span className="px-3 py-1.5 rounded-lg" style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}>
                      📅 Original: {new Date(selectedAssignment.deadline).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Extend Deadline <span className="opacity-60">(one-time only)</span></p>
                  <div className="flex gap-2">
                    <input
                      type="datetime-local"
                      value={extendInput}
                      onChange={e => setExtendInput(e.target.value)}
                      className="input-custom flex-1 px-2 py-1.5 rounded-lg text-xs"
                    />
                    <button
                      onClick={handleExtendDeadline}
                      disabled={deadlineLoading || !extendInput}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 shrink-0"
                      style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                      {deadlineLoading ? '⏳' : 'Extend'}
                    </button>
                  </div>
                </div>

              /* No deadline yet — show set only */
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Set Deadline <span className="opacity-60">(one-time only)</span></p>
                  <div className="flex gap-2">
                    <input
                      type="datetime-local"
                      value={deadlineInput}
                      onChange={e => setDeadlineInput(e.target.value)}
                      className="input-custom flex-1 px-2 py-1.5 rounded-lg text-xs"
                    />
                    <button
                      onClick={handleSetDeadline}
                      disabled={deadlineLoading || !deadlineInput}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 shrink-0"
                      style={{ background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.25)' }}>
                      {deadlineLoading ? '⏳' : 'Set'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Final Remark / Mark as Done ── */}
          {selectedAssignment && (
            <div className="mt-4 glass rounded-2xl p-5"
              style={{ border: selectedAssignment.finalRemark ? '1px solid rgba(16,185,129,0.3)' : allRemarked ? '1px solid rgba(236,72,153,0.25)' : '1px solid rgba(236,72,153,0.1)' }}>
              {selectedAssignment.finalRemark ? (
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(16,185,129,0.15)', boxShadow: '0 0 12px rgba(16,185,129,0.2)' }}>
                    ✅
                  </div>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: '#10b981' }}>Project Accepted</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      "{selectedAssignment.finalRemark}"
                      {selectedAssignment.finalRemarkedAt && (
                        <> · {new Date(selectedAssignment.finalRemarkedAt).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sm font-semibold" style={{ color: allRemarked ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                      🏁 Final Acceptance Remark
                    </span>
                    {!allRemarked && (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
                        Review all files first
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder={allRemarked ? 'e.g. Project Accepted — well done!' : 'Available after all files are reviewed…'}
                      value={finalRemark}
                      onChange={e => setFinalRemark(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && allRemarked && submitFinalRemark()}
                      disabled={!allRemarked}
                      className="input-custom flex-1 px-3 py-2 rounded-xl text-sm disabled:opacity-40"
                    />
                    <button
                      onClick={submitFinalRemark}
                      disabled={!allRemarked || !finalRemark.trim() || submittingFinal}
                      className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 transition-all"
                      style={{ background: 'linear-gradient(135deg,#10b981,#059669)', color: '#fff', boxShadow: allRemarked && finalRemark.trim() ? '0 0 16px rgba(16,185,129,0.35)' : 'none' }}>
                      {submittingFinal ? '⏳' : '✅ Mark Done'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          </>
        )}
      </main>

      {/* ── File viewer modal ── */}
      {viewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
          onClick={() => setViewFile(null)}>
          <div className="w-full max-w-4xl rounded-2xl overflow-hidden flex flex-col"
            style={{ height: '82vh', border: '1px solid rgba(236,72,153,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 shrink-0"
              style={{ background: 'rgba(236,72,153,0.08)', borderBottom: '1px solid rgba(236,72,153,0.15)' }}>
              <span className="text-xs" style={{ color: '#f472b6' }}>🔒 Secure · expires in 5 min</span>
              <button onClick={() => setViewFile(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                style={{ background: 'rgba(239,68,68,0.8)', color: '#fff' }}>✕</button>
            </div>
            <iframe src={viewFile} className="w-full flex-1 border-0" title="File Viewer" />
          </div>
        </div>
      )}
    </div>
  );
}
