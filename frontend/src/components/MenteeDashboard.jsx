import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axiosInstance';
import { useTheme } from '../context/ThemeContext';
import { logout } from '../utils/auth';
// ADDED: centralized phase config
import { PHASE_CONFIG, getAllowedPhases } from '../utils/phases';

import { API } from '../config';

// REMOVED: hardcoded `sections` object — now derived dynamically from project duration

const remarkColor = (r) => {
  if (!r || r === 'Pending Review') return { color: '#f59e0b' };
  if (r.toLowerCase().includes('approved')) return { color: '#10b981' };
  if (r.toLowerCase().includes('reject')) return { color: '#ef4444' };
  return { color: 'var(--text-secondary)' };
};

export default function MenteeDashboard() {
  const [uploads, setUploads] = useState({});
  const [assignment, setAssignment] = useState(null);
  const [menteeName, setMenteeName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectStatus, setProjectStatus] = useState('pending');
  const [editingProject, setEditingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [deadline, setDeadline] = useState(null);
  const [extendedDeadline, setExtendedDeadline] = useState(null);
  const [now, setNow] = useState(new Date());
  const [selectedSection, setSelectedSection] = useState(null);
  const [uploading, setUploading] = useState('');
  const [uploadProgress, setUploadProgress] = useState({});
  const [toast, setToast] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'submissions'
  const [dashData, setDashData] = useState(null);
  const [dashLoading, setDashLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  // Group members
  const [groupMembers, setGroupMembers] = useState([]);
  // Profile modal
  const [showProfile, setShowProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ name: '', rollNo: '', contactNo: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  // ADDED: project duration drives which phases are shown
  const [projectDuration, setProjectDuration] = useState('6_months');
  // ADDED: project creation states
  const [projectDescription, setProjectDescription] = useState('');
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [projectForm, setProjectForm] = useState({
    projectName: '',
    projectDuration: '6_months',
    description: '',
    groupMembers: [],
  });
  // ADDED: finalRemark locks uploads when set
  const [projectFinalRemark, setProjectFinalRemark] = useState(null);
  const [isProjectArchived, setIsProjectArchived] = useState(false); // true when assignment is archived/completed
  // ADDED: track if mentee can create new project
  const [canCreateNewProject, setCanCreateNewProject] = useState(true);
  const [projectLimitReason, setProjectLimitReason] = useState(null);
  const [completed6MonthCount, setCompleted6MonthCount] = useState(0);
  // ADDED: archived files from previous projects
  const [archivedFiles, setArchivedFiles] = useState([]);
  const [showArchivedFiles, setShowArchivedFiles] = useState(false);
  // ADDED: active academic year
  const [activeBatch, setActiveBatch] = useState(null);
  const navigate = useNavigate();
  const { dark, toggle } = useTheme();
  const menteeEmail = localStorage.getItem('userEmail') || '';
  const userRole = localStorage.getItem('userRole') || 'mentee';
  const storedName = localStorage.getItem('userName') || '';

  // ADDED: derive active section keys from duration — single source of truth
  const sectionKeys = getAllowedPhases(projectDuration);

  // Auto-expand archived files when project is completed/archived
  useEffect(() => {
    if (isProjectArchived && archivedFiles.length > 0) {
      setShowArchivedFiles(true);
    }
  }, [isProjectArchived, archivedFiles.length]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch latest file metadata + remarks from DB
  const fetchFiles = async (silent = false) => {
    if (!menteeEmail) return;
    if (!silent) setRefreshing(true);
    try {
      const r = await axios.get(`${API}/files/metadata/${menteeEmail}`);
      const map = {};
      (r.data.data || []).forEach(f => {
        map[f.section] = {
          fileURL:     f.file_url,
          filename:    f.file_name,
          fileType:    f.file_type,
          remark:      f.remark,
          timestamp:   f.updatedAt,
          submittedAt: f.submittedAt,
          isLate:      f.isLate,
        };
      });
      if (r.data.deadline) setDeadline(new Date(r.data.deadline));
      if (r.data.extendedDeadline) setExtendedDeadline(new Date(r.data.extendedDeadline));
      localStorage.setItem('uploads', JSON.stringify(map));
      setUploads(map);
      
      // Store archived files
      setArchivedFiles(r.data.archivedFiles || []);
    } catch {
      const stored = JSON.parse(localStorage.getItem('uploads')) || {};
      setUploads(stored);
    } finally {
      if (!silent) setRefreshing(false);
    }
  };

  // Tick every second for countdown — stop when project is finalised
  useEffect(() => {
    if (assignment?.finalRemark) return; // no need to tick
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [assignment?.finalRemark]);

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

  // Reusable: fetch mentee status and update all state
  const fetchStatus = useCallback(async (silent = true) => {
    try {
      const r = await axios.get(`${API}/mentee/status`);
      const d = r.data.data;
      setMenteeName(d.name || '');
      setProjectName(d.projectName || '');
      setProjectDuration(d.projectDuration || '6_months');
      setProjectDescription(d.projectDescription || '');
      setProjectStatus(d.projectStatus || 'pending');
      setAssignment(d.assignment);
      setNotifications(d.notifications || []);
      setGroupMembers(d.groupMembers || []);
      setProfileDraft({ name: d.name || '', rollNo: d.rollNo || '', contactNo: d.contactNo || '' });
      if (d.deadline) setDeadline(new Date(d.deadline));
      if (d.extendedDeadline) setExtendedDeadline(new Date(d.extendedDeadline));
      if (d.duration) setProjectDuration(d.duration);
      if (d.assignment?.finalRemark && !d.assignment?.isArchived) {
        setProjectFinalRemark(d.assignment.finalRemark);
        setIsProjectArchived(false);
      } else if (d.assignment?.isArchived) {
        setProjectFinalRemark(d.assignment?.finalRemark || null);
        setIsProjectArchived(true);
      } else {
        setProjectFinalRemark(null);
        setIsProjectArchived(false);
      }
      setCanCreateNewProject(d.canCreateNewProject !== false);
      setProjectLimitReason(d.projectLimitReason || null);
      setCompleted6MonthCount(d.completed6MonthCount || 0);
      return d;
    } catch {
      return null;
    }
  }, []); // eslint-disable-line

  // Initial load
  useEffect(() => {
    fetchFiles(true);
    fetchStatus(true).then(d => {
      if (d) fetchFiles(true);
      setInitialLoading(false);
    }).catch(() => {
      axios.get(`${API}/assignments/mentee/${menteeEmail}`)
        .then(r => setAssignment(r.data.data))
        .catch(() => setAssignment(null))
        .finally(() => setInitialLoading(false));
    });
  }, [menteeEmail, userRole]); // eslint-disable-line

  // Poll every 30s for updates (e.g. mentor gives final remark while mentee is on the page)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStatus(true);
      fetchFiles(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]); // eslint-disable-line

  const handleUpdateProjectName = async () => {
    if (!newProjectName.trim()) return;
    try {
      await axios.patch(`${API}/mentee/project-name`, { projectName: newProjectName.trim() });
      setProjectName(newProjectName.trim());
      setProjectStatus('pending');
      setEditingProject(false);
      setNewProjectName('');
      showToast('Project name updated.', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update project name.', 'error');
    }
  };

  const markNotificationsRead = async () => {
    if (notifications.length === 0) return;
    try {
      await axios.post(`${API}/notifications/read`, {});
      setNotifications([]);
    } catch {}
  };

  const handleSaveProfile = async () => {
    if (!profileDraft.name?.trim()) return showToast('Name is required.', 'error');
    setSavingProfile(true);
    try {
      await axios.patch(`${API}/mentee/profile`, profileDraft);
      setMenteeName(profileDraft.name.trim());
      localStorage.setItem('userName', profileDraft.name.trim());
      setShowProfile(false);
      showToast('Profile updated.', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update profile.', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateProject = async () => {
    console.log('Create project clicked');
    console.log('Project form:', projectForm);
    
    if (!projectForm.projectName?.trim()) {
      showToast('Project name is required.', 'error');
      return;
    }
    if (!projectForm.projectDuration) {
      showToast('Project duration is required.', 'error');
      return;
    }
    
    setCreatingProject(true);
    try {
      console.log('Sending request to create project...');
      const res = await axios.post(`${API}/mentee/create-project`, {
        projectName: projectForm.projectName.trim(),
        projectDuration: projectForm.projectDuration,
        description: projectForm.description?.trim() || '',
        groupMembers: projectForm.groupMembers,
      });
      
      console.log('Project created successfully:', res.data);
      
      showToast(res.data.message, 'success');
      
      // Clear form
      setProjectForm({
        projectName: '',
        projectDuration: '6_months',
        description: '',
        groupMembers: [],
      });
      setShowCreateProject(false);

      // Refresh state without page reload
      await fetchStatus(true);
      fetchFiles(true);
    } catch (err) {
      console.error('Create project error:', err);
      console.error('Error response:', err.response?.data);
      showToast(err.response?.data?.message || 'Failed to create project.', 'error');
    } finally {
      setCreatingProject(false);
    }
  };

  const addProjectMember = () => {
    if (projectForm.groupMembers.length >= 5) {
      showToast('Maximum 5 group members allowed.', 'error');
      return;
    }
    setProjectForm(prev => ({
      ...prev,
      groupMembers: [...prev.groupMembers, { name: '', email: '', rollNo: '', contactNo: '' }]
    }));
  };

  const removeProjectMember = (idx) => {
    setProjectForm(prev => ({
      ...prev,
      groupMembers: prev.groupMembers.filter((_, i) => i !== idx)
    }));
  };

  const updateProjectMember = (idx, field, val) => {
    setProjectForm(prev => ({
      ...prev,
      groupMembers: prev.groupMembers.map((m, i) => i === idx ? { ...m, [field]: val } : m)
    }));
  };

  const fetchDashboard = async () => {
    if (!menteeEmail) return;
    setDashLoading(true);
    try {
      const r = await axios.get(`${API}/dashboard/mentee/${menteeEmail}`);
      setDashData(r.data.data);
    } catch {}
    finally { setDashLoading(false); }
  };

  const handleTabSwitch = (tab) => {
    // Block submissions tab if no project and no archived files
    if (tab === 'submissions' && !projectName && archivedFiles.length === 0) {
      showToast('Please create a project first before accessing submissions.', 'error');
      return;
    }
    setActiveTab(tab);
    // Refresh dashboard stats when switching to dashboard tab (to show latest submissions)
    if (tab === 'dashboard' && projectName) {
      fetchDashboard();
    }
  };

  // Auto-fetch dashboard data when project exists and on dashboard tab
  useEffect(() => {
    if (projectName && activeTab === 'dashboard' && !dashData && !initialLoading) {
      fetchDashboard();
    }
  }, [projectName, activeTab, initialLoading]); // eslint-disable-line

  // Re-fetch silently whenever the tab becomes visible again
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchFiles(true);
        fetchStatus(true); // also re-fetch status to catch mentor remarks/final remark
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [menteeEmail, userRole]); // eslint-disable-line

  const isActive = (key) => {
    // Special handling for achievements: unlock after all previous phases are uploaded
    if (key === 'achievements') {
      // Get all phases except achievements
      const phasesBeforeAchievements = sectionKeys.filter(k => k !== 'achievements');
      // Check if all previous phases are uploaded
      return phasesBeforeAchievements.every(k => uploads[k]);
    }
    // For other phases, check if all required phases are uploaded
    // Use required_1year for finalDemo when project is 1 year
    const requiredList = (key === 'finalDemo' && projectDuration === '1_year' && PHASE_CONFIG[key].required_1year)
      ? PHASE_CONFIG[key].required_1year
      : PHASE_CONFIG[key].required;
    return requiredList.every(r => uploads[r]);
  };

  const handleUpload = async (e, key) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;

    // Block upload if no mentor assigned
    if (!assignment) {
      showToast('❌ Your project is not yet assigned to a mentor. Upload is disabled.', 'error');
      return;
    }

    // Block upload if project is finalised
    if (projectFinalRemark) {
      showToast('🔒 Your project has been finalised. Uploads are no longer accepted.', 'error');
      return;
    }

    const ext = file.name.split('.').pop().toLowerCase();

    // Client-side validation
    if (!PHASE_CONFIG[key].allowedTypes.includes(ext)) {
      showToast(`❌ .${ext} not allowed here. Accepted: ${PHASE_CONFIG[key].allowedTypes.join(', ')}`, 'error');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      showToast('❌ File too large. Max 100 MB.', 'error');
      return;
    }

    setUploading(key);
    setUploadProgress(p => ({ ...p, [key]: 0 }));

    try {
      // ── Step 1: get pre-signed PUT URL ──────────────────────────────
      const urlRes = await axios.post(`${API}/files/generate-upload-url`, {
        fileName:    file.name,
        fileType:    file.type || '',
        section:     key,
        menteeEmail,
      });

      if (!urlRes.data.success) {
        showToast(`❌ ${urlRes.data.message || 'Could not get upload URL.'}`, 'error');
        return;
      }

      const { uploadUrl, s3Key, objectUrl, contentType } = urlRes.data;

      // ── Step 2: PUT directly to S3 with XHR for progress tracking ───
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', contentType);

        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 100);
            setUploadProgress(p => ({ ...p, [key]: pct }));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`S3 PUT failed: ${xhr.status} ${xhr.statusText}`));
        };
        xhr.onerror = () => reject(new Error('Network error during S3 upload'));
        xhr.send(file);
      });

      // ── Step 3: save metadata to DB ─────────────────────────────────
      await axios.post(`${API}/files/save-metadata`, {
        fileName:    file.name,
        s3Key,
        fileType:    contentType,
        section:     key,
        menteeEmail,
      });

      // ── Step 4: update local state ───────────────────────────────────
      const submittedAt = new Date();
      const finalDeadline = extendedDeadline || deadline;
      const isLate = finalDeadline ? submittedAt > finalDeadline : false;
      const updated = {
        ...uploads,
        [key]: {
          fileURL:     s3Key,
          objectUrl,
          filename:    file.name,
          fileType:    contentType,
          timestamp:   submittedAt.toLocaleString(),
          submittedAt: submittedAt.toISOString(),
          isLate,
          remark:      uploads[key]?.remark || 'Pending Review',
        },
      };
      setUploads(updated);
      localStorage.setItem('uploads', JSON.stringify(updated));
      showToast(`${isLate ? '⚠️ Late Submission' : '✅'} ${PHASE_CONFIG[key].label} uploaded ${isLate ? '(after deadline)' : 'successfully'}!`, isLate ? 'error' : 'success');

    } catch (err) {
      console.error('Upload error:', err);
      console.error('Error details:', {
        status: err.response?.status,
        message: err.response?.data?.message,
        url: err.config?.url
      });
      showToast(`❌ ${err.response?.data?.message || err.message || 'Upload failed.'}`, 'error');
    } finally {
      setUploading('');
      setUploadProgress(p => { const n = { ...p }; delete n[key]; return n; });
    }
  };

  // Fetch a 5-min pre-signed GET URL then open in new tab
  const handleSecureView = async (e, key) => {
    e.stopPropagation();
    const upload = uploads[key];
    if (!upload?.fileURL) return;
    try {
      const res = await axios.post(`${API}/files/secure-url`, {
        s3Key:       upload.fileURL,
        menteeEmail,
      });
      if (res.data.success) window.open(res.data.url, '_blank');
      else showToast('❌ Could not generate secure link.', 'error');
    } catch { showToast('❌ Failed to get secure URL.', 'error'); }
  };

  const handleDelete = async (key) => {
    try {
      await axios.delete(`${API}/files/metadata`, {
        data: { menteeEmail, section: key },
      });
    } catch {
      // If DB delete fails, still clear locally so UI stays consistent
    }
    const u = { ...uploads };
    delete u[key];
    setUploads(u);
    localStorage.setItem('uploads', JSON.stringify(u));
    showToast(`🗑 ${PHASE_CONFIG[key].label} removed.`, 'success');
  };

  const completed = sectionKeys.filter(k => uploads[k]).length;
  const progress = Math.round((completed / sectionKeys.length) * 100);

  // Deadline helpers — finalDeadline = extendedDeadline ?? deadline
  const finalDeadline = extendedDeadline || deadline;
  const isPastDeadline = finalDeadline ? now > finalDeadline : false;
  const formatCountdown = () => {
    if (!finalDeadline) return null;
    if (assignment?.finalRemark) return null; // project finalised — stop the timer
    const diff = finalDeadline - now;
    if (diff <= 0) return { label: 'Deadline passed', color: '#ef4444', urgent: true };
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const urgent = diff < 86400000;
    const label = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
    return { label, color: urgent ? '#f59e0b' : '#10b981', urgent };
  };
  const countdown = formatCountdown();

  // Show loading screen while initial data is being fetched
  if (initialLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center transition-colors duration-300" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mb-4"
            style={{ borderColor: '#ec4899', borderTopColor: 'transparent' }}></div>
          <p className="text-lg font-medium" style={{ color: 'var(--text-primary)' }}>Loading Dashboard...</p>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>Please wait while we fetch your data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen transition-colors duration-300" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <aside className="w-64 shrink-0 flex flex-col p-5 gap-2"
        style={{ background: dark ? 'rgba(255,255,255,0.03)' : 'rgba(236,72,153,0.04)', borderRight: '1px solid rgba(236,72,153,0.12)' }}>
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => { setProfileDraft({ name: menteeName || storedName, rollNo: '', contactNo: '' }); setShowProfile(true); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:scale-105 transition-transform"
            style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7)', boxShadow: '0 0 16px rgba(236,72,153,0.5)' }}
            title="Edit Profile"
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </button>
          <div>
            <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Mentee</p>
            <p className="text-xs truncate max-w-[120px]" style={{ color: 'var(--text-muted)' }}>{menteeName || storedName || menteeEmail || 'Dashboard'}</p>
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

        {/* Assigned mentor + project status (merged) */}
        <div className="rounded-xl p-3 mb-2"
          style={{ background: assignment ? 'rgba(236,72,153,0.08)' : 'rgba(255,255,255,0.03)', border: '1px solid rgba(236,72,153,0.15)' }}>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold" style={{ color: '#f472b6' }}>Project</p>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: assignment?.finalRemark ? 'rgba(16,185,129,0.2)' : projectStatus === 'assigned' ? 'rgba(16,185,129,0.15)' : projectStatus === 'approved' ? 'rgba(99,102,241,0.15)' : projectStatus === 'rejected' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                color: assignment?.finalRemark ? '#10b981' : projectStatus === 'assigned' ? '#10b981' : projectStatus === 'approved' ? '#818cf8' : projectStatus === 'rejected' ? '#f87171' : '#f59e0b',
              }}>
              {assignment?.finalRemark ? '🏁 Finalised' : projectStatus === 'assigned' ? '✅ Assigned' : projectStatus === 'approved' ? '✔ Approved' : projectStatus === 'rejected' ? '✗ Rejected' : '⏳ Pending'}
            </span>
          </div>

          {/* Project name with edit */}
          {editingProject ? (
            <div className="flex flex-col gap-1 mb-2">
              <input
                type="text" value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                placeholder="New project name"
                className="input-custom px-2 py-1 rounded-lg text-xs w-full"
              />
              <div className="flex gap-1">
                <button onClick={handleUpdateProjectName}
                  className="flex-1 py-1 rounded-lg text-xs font-medium"
                  style={{ background: 'rgba(16,185,129,0.15)', color: '#10b981' }}>Save</button>
                <button onClick={() => { setEditingProject(false); setNewProjectName(''); }}
                  className="flex-1 py-1 rounded-lg text-xs font-medium"
                  style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)' }}>Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs truncate max-w-[120px]" style={{ color: 'var(--text-secondary)' }}>📁 {projectName || 'No project set'}</p>
              {!!projectName && projectStatus !== 'assigned' && !projectFinalRemark && !isProjectArchived && (
                <button onClick={() => { setEditingProject(true); setNewProjectName(projectName); }}
                  className="text-xs px-2 py-0.5 rounded-lg"
                  style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6' }}>Edit</button>
              )}
            </div>
          )}

          {/* Mentor info */}
          <div style={{ borderTop: '1px solid rgba(236,72,153,0.1)', paddingTop: '6px' }}>
            <p className="text-xs font-semibold mb-0.5" style={{ color: 'var(--text-muted)' }}>Mentor</p>
            {assignment
              ? <p className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{assignment.mentorEmail}</p>
              : <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Not yet assigned</p>
            }
          </div>

          {/* Deadline */}
          {(deadline || extendedDeadline) && (
            <div style={{ borderTop: '1px solid rgba(236,72,153,0.1)', paddingTop: '6px', marginTop: '6px' }}>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Deadline</p>
              {deadline && (
                <div className="flex items-center justify-between">
                  <p className="text-xs" style={{ color: extendedDeadline ? 'var(--text-muted)' : 'var(--text-secondary)', textDecoration: extendedDeadline ? 'line-through' : 'none' }}>
                    Original: {deadline.toLocaleDateString(undefined, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </p>
                </div>
              )}
              {extendedDeadline && (
                <div className="mt-1">
                  <p className="text-xs font-medium" style={{ color: '#10b981' }}>
                    Extended: {extendedDeadline.toLocaleDateString(undefined, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#10b981', opacity: 0.8 }}>
                    ✦ Deadline extended by your mentor
                  </p>
                </div>
              )}
              {countdown && (
                <p className="text-xs font-semibold mt-1" style={{ color: countdown.color }}>
                  {countdown.urgent && !isPastDeadline ? '⚠ ' : ''}{countdown.label}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Notifications */}
        {notifications.length > 0 && (
          <div className="rounded-xl p-3 mb-2" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold" style={{ color: '#f59e0b' }}>🔔 Notifications ({notifications.length})</p>
              <button onClick={markNotificationsRead} className="text-xs" style={{ color: 'var(--text-muted)' }}>Clear</button>
            </div>
            {notifications.map((n, i) => (
              <p key={i} className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{n.message}</p>
            ))}
          </div>
        )}

        {/* Progress bar */}
        <div className="rounded-xl p-3 mb-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(236,72,153,0.1)' }}>
          <div className="flex justify-between text-xs mb-1.5">
            <span style={{ color: 'var(--text-muted)' }}>Progress</span>
            <span style={{ color: '#f472b6' }}>{completed}/{sectionKeys.length}</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${progress}%`, background: 'linear-gradient(90deg,#ec4899,#a855f7)' }} />
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 mb-2 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(236,72,153,0.1)' }}>
          {[['dashboard','📊','Dashboard'],['submissions','📁','Submissions']].map(([id, icon, label]) => (
            <button key={id} onClick={() => handleTabSwitch(id)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: activeTab === id ? 'linear-gradient(135deg,#ec4899,#a855f7)' : 'transparent',
                color: activeTab === id ? '#fff' : 'var(--text-muted)',
                opacity: id === 'submissions' && !projectName && archivedFiles.length === 0 ? 0.5 : 1,
                cursor: id === 'submissions' && !projectName && archivedFiles.length === 0 ? 'not-allowed' : 'pointer',
              }}
              disabled={id === 'submissions' && !projectName && archivedFiles.length === 0}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Section nav — hidden when project is archived/completed */}
        <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
          {isProjectArchived ? (
            <div className="px-3 py-4 text-center">
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>✅ Project completed</p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>View archived files below</p>
            </div>
          ) : sectionKeys.map(key => {
            const active = isActive(key);
            const done = !!uploads[key];
            return (
              <button key={key} onClick={() => active && setSelectedSection(key)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-all"
                style={{
                  background: selectedSection === key ? 'rgba(236,72,153,0.12)' : 'transparent',
                  color: selectedSection === key ? '#f472b6' : active ? 'var(--text-secondary)' : 'var(--text-muted)',
                  opacity: active ? 1 : 0.5,
                  border: selectedSection === key ? '1px solid rgba(236,72,153,0.2)' : '1px solid transparent',
                }}>
                <span>{done ? '✅' : active ? '⬜' : '🔒'}</span>
                {PHASE_CONFIG[key].label}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col gap-2 mt-auto pt-3" style={{ borderTop: '1px solid rgba(236,72,153,0.1)' }}>
          <div className="flex items-center justify-between px-1">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Theme</span>
            <button onClick={toggle} className="text-lg hover:scale-110 transition-transform">{dark ? '☀️' : '🌙'}</button>
          </div>
          <button onClick={() => logout()}
            className="w-full py-2 rounded-xl text-sm font-medium"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-4xl mx-auto">

          {/* ── DASHBOARD TAB ── */}
          {activeTab === 'dashboard' && (
            <div>
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>My Dashboard</h1>
                  <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                    {projectName ? 'Overview of your project and submissions' : 'Create your project to get started'}
                  </p>
                </div>
                {projectName && (
                  <button
                    onClick={() => fetchDashboard()}
                    disabled={dashLoading}
                    className="px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-105"
                    style={{ 
                      background: dashLoading ? 'rgba(236,72,153,0.05)' : 'rgba(236,72,153,0.1)', 
                      color: '#f472b6',
                      border: '1px solid rgba(236,72,153,0.2)',
                      cursor: dashLoading ? 'not-allowed' : 'pointer',
                      opacity: dashLoading ? 0.6 : 1,
                    }}
                  >
                    {dashLoading ? '🔄 Refreshing...' : '🔄 Refresh Stats'}
                  </button>
                )}
              </div>

              {/* Toast notification for dashboard tab */}
              {toast && (
                <div
                  className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium"
                  style={{
                    background: toast.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                    border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                    color: toast.type === 'success' ? '#10b981' : '#f87171',
                  }}
                >
                  {toast.msg}
                </div>
              )}

              {/* Project Section */}
              <div className="mb-6">
                {(!projectName || (projectName && canCreateNewProject)) ? (
                  /* Create Project Form */
                  <div className="glass rounded-2xl p-6" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                    <div className="mb-4">
                      <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                        {projectName ? 'Create New Project' : 'Create Your Project'}
                      </h2>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                        {projectName ? 'Your previous project is completed. Start a new one!' : 'Set up your project details to start submissions'}
                      </p>
                    </div>
                    <div className="space-y-4">
                      {/* Project Name */}
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                          Project Name <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Smart Attendance System"
                          value={projectForm.projectName}
                          onChange={(e) => setProjectForm(prev => ({ ...prev, projectName: e.target.value }))}
                          className="input-custom w-full px-4 py-3 rounded-xl text-sm"
                        />
                      </div>

                      {/* Project Duration */}
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                          Project Duration <span className="text-red-400">*</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            { value: '6_months', label: '6 Months', desc: 'Standard timeline' },
                            { value: '1_year',   label: '1 Year',   desc: 'Extended timeline', disabled: completed6MonthCount >= 1 }
                          ].filter(opt => !opt.disabled || opt.value === '6_months').map(opt => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => !opt.disabled && setProjectForm(prev => ({ ...prev, projectDuration: opt.value }))}
                              className="p-3 rounded-xl text-left transition-all"
                              style={{
                                border: projectForm.projectDuration === opt.value ? '2px solid #ec4899' : '1px solid var(--input-border)',
                                background: opt.disabled ? 'rgba(255,255,255,0.02)' : projectForm.projectDuration === opt.value ? 'rgba(236,72,153,0.08)' : 'var(--input-bg)',
                                color: opt.disabled ? 'var(--text-muted)' : projectForm.projectDuration === opt.value ? 'var(--text-primary)' : 'var(--text-muted)',
                                opacity: opt.disabled ? 0.4 : 1,
                                cursor: opt.disabled ? 'not-allowed' : 'pointer',
                              }}
                            >
                              <div className="text-sm font-semibold">{opt.label}</div>
                              <div className="text-xs mt-0.5 opacity-70">{opt.disabled ? 'Not available for 2nd project' : opt.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                          Project Description
                        </label>
                        <textarea
                          placeholder="Brief description of your project..."
                          value={projectForm.description}
                          onChange={(e) => setProjectForm(prev => ({ ...prev, description: e.target.value }))}
                          rows={3}
                          className="input-custom w-full px-4 py-3 rounded-xl text-sm resize-none"
                        />
                      </div>

                      {/* Group Members */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                            Group Members (Optional)
                          </label>
                          <button
                            onClick={addProjectMember}
                            disabled={projectForm.groupMembers.length >= 5}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}
                          >
                            + Add Member
                          </button>
                        </div>

                        {projectForm.groupMembers.length === 0 ? (
                          <div className="text-center py-6 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(236,72,153,0.2)' }}>
                            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No group members added yet</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {projectForm.groupMembers.map((member, idx) => (
                              <div key={idx} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(236,72,153,0.1)' }}>
                                <div className="flex items-start justify-between mb-2">
                                  <span className="text-xs font-semibold" style={{ color: '#f472b6' }}>Member {idx + 1}</span>
                                  <button
                                    onClick={() => removeProjectMember(idx)}
                                    className="text-xs px-2 py-0.5 rounded-lg"
                                    style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    placeholder="Name *"
                                    value={member.name}
                                    onChange={(e) => updateProjectMember(idx, 'name', e.target.value)}
                                    className="input-custom px-3 py-2 rounded-lg text-sm"
                                  />
                                  <input
                                    type="email"
                                    placeholder="Email"
                                    value={member.email}
                                    onChange={(e) => updateProjectMember(idx, 'email', e.target.value)}
                                    className="input-custom px-3 py-2 rounded-lg text-sm"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Roll No"
                                    value={member.rollNo}
                                    onChange={(e) => updateProjectMember(idx, 'rollNo', e.target.value)}
                                    className="input-custom px-3 py-2 rounded-lg text-sm"
                                  />
                                  <input
                                    type="tel"
                                    placeholder="Contact No"
                                    value={member.contactNo}
                                    onChange={(e) => updateProjectMember(idx, 'contactNo', e.target.value)}
                                    className="input-custom px-3 py-2 rounded-lg text-sm"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Submit Button */}
                      {!canCreateNewProject && projectName && (
                        <div className="mb-4 p-4 rounded-xl" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                          <p className="text-sm font-medium" style={{ color: '#f59e0b' }}>
                            {projectLimitReason === '1_year_completed' ? (
                              '🚫 Project Limit Reached'
                            ) : projectLimitReason === 'max_6_month_reached' ? (
                              '🚫 Maximum Projects Reached'
                            ) : (
                              '⚠️ Complete your current project to create a new one'
                            )}
                          </p>
                          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                            {projectLimitReason === '1_year_completed' ? (
                              'You have completed a 1-year project this academic year. No additional projects allowed until next year.'
                            ) : projectLimitReason === 'max_6_month_reached' ? (
                              'You have already created 2 projects (6-months each) this academic year. Maximum 2 projects allowed per year.'
                            ) : (
                              'Your mentor must submit a final remark before you can start a new project.'
                            )}
                          </p>
                        </div>
                      )}
                      <button
                        onClick={handleCreateProject}
                        disabled={creatingProject || !projectForm.projectName?.trim() || !canCreateNewProject}
                        className="btn-primary-custom w-full py-3 rounded-xl text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {creatingProject ? (
                          <>
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Creating Project...
                          </>
                        ) : !canCreateNewProject ? (
                          projectLimitReason === '1_year_completed' ? '🚫 1-Year Project Completed' :
                          projectLimitReason === 'max_6_month_reached' ? '🚫 Maximum Projects Reached' :
                          '🔒 Complete Current Project First'
                        ) : (
                          'Create Project'
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View Project Details */
                  <div className="space-y-4">
                    {/* Project Info Card */}
                    <div className="glass rounded-2xl p-5" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Project Name</p>
                          <p className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{projectName}</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Duration</p>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                              {projectDuration === '6_months' ? '6 Months' : '1 Year'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Status</p>
                            <span className="text-xs px-2 py-1 rounded-full font-medium inline-block"
                              style={{
                                background: assignment?.finalRemark ? 'rgba(16,185,129,0.2)' : projectStatus === 'assigned' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                                color: assignment?.finalRemark ? '#10b981' : projectStatus === 'assigned' ? '#10b981' : '#f59e0b',
                              }}>
                              {assignment?.finalRemark ? '🏁 Finalised' : projectStatus === 'assigned' ? '✅ Assigned' : '⏳ Pending'}
                            </span>
                          </div>
                        </div>
                        {projectDescription && (
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>Description</p>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{projectDescription}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Group Members Card */}
                    {groupMembers.length > 0 && (
                      <div className="glass rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                        <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(236,72,153,0.1)', background: 'rgba(236,72,153,0.04)' }}>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Group Members</p>
                        </div>
                        <div className="p-5">
                          <div className="space-y-3">
                            {groupMembers.map((member, idx) => (
                              <div key={idx} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(236,72,153,0.08)' }}>
                                <div className="flex items-start justify-between mb-2">
                                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{member.name}</p>
                                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6' }}>
                                    Member {idx + 1}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  {member.email && (
                                    <div>
                                      <span style={{ color: 'var(--text-muted)' }}>Email: </span>
                                      <span style={{ color: 'var(--text-secondary)' }}>{member.email}</span>
                                    </div>
                                  )}
                                  {member.rollNo && (
                                    <div>
                                      <span style={{ color: 'var(--text-muted)' }}>Roll No: </span>
                                      <span style={{ color: 'var(--text-secondary)' }}>{member.rollNo}</span>
                                    </div>
                                  )}
                                  {member.contactNo && (
                                    <div className="col-span-2">
                                      <span style={{ color: 'var(--text-muted)' }}>Contact: </span>
                                      <span style={{ color: 'var(--text-secondary)' }}>{member.contactNo}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Stats and Progress - Only show if project exists */}
              {projectName && (
                <>
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
                          { label: 'Submitted', value: dashData.stats.submitted, color: '#10b981', bg: 'rgba(16,185,129,0.1)', icon: '📤' },
                          { label: 'Pending Review', value: dashData.stats.pendingReview, color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: '⏳' },
                          { label: 'Reviewed', value: dashData.stats.reviewed, color: '#818cf8', bg: 'rgba(99,102,241,0.1)', icon: '✅' },
                          { label: 'Late', value: dashData.stats.lateCount, color: '#f87171', bg: 'rgba(239,68,68,0.1)', icon: '🔴' },
                        ].map(s => (
                          <div key={s.label} className="glass rounded-2xl p-4 flex flex-col gap-1"
                        style={{ border: `1px solid ${s.bg.replace('0.1','0.25')}` }}>
                        <span className="text-lg">{s.icon}</span>
                        <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Progress bar */}
                  <div className="glass rounded-2xl p-4" style={{ border: '1px solid rgba(236,72,153,0.15)' }}>
                    <div className="flex justify-between text-xs mb-2">
                      <span style={{ color: 'var(--text-muted)' }}>Overall Progress</span>
                      <span style={{ color: '#f472b6' }}>{dashData.stats.submitted}/{dashData.stats.totalSections} stages</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.round((dashData.stats.submitted / dashData.stats.totalSections) * 100)}%`, background: 'linear-gradient(90deg,#ec4899,#a855f7)' }} />
                    </div>
                  </div>

                  {/* Submission status table */}
                  {dashData.sectionStatus.length > 0 && (
                    <div className="glass rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(236,72,153,0.1)', background: 'rgba(236,72,153,0.04)' }}>
                        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Submission Details</p>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(236,72,153,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                              {['Stage','Submitted At','Status','Remark'].map(h => (
                                <th key={h} className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {dashData.sectionStatus.map((s, i) => (
                              <tr key={s.section} style={{ borderBottom: i < dashData.sectionStatus.length - 1 ? '1px solid rgba(236,72,153,0.06)' : 'none' }}>
                                <td className="px-4 py-2.5 font-medium capitalize" style={{ color: 'var(--text-primary)' }}>{s.section.replace(/([A-Z])/g,' $1')}</td>
                                <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}</td>
                                <td className="px-4 py-2.5">
                                  <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                                    style={{
                                      background: s.isLate ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)',
                                      color: s.isLate ? '#f87171' : '#10b981',
                                    }}>
                                    {s.isLate ? '🔴 Late' : '🟢 On Time'}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5" style={{
                                  color: s.remark === 'Pending Review' ? '#f59e0b' : s.remark?.toLowerCase().includes('approved') ? '#10b981' : 'var(--text-secondary)',
                                }}>{s.remark || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Permanent notifications */}
                  {dashData.notifications.length > 0 && (
                    <div className="glass rounded-2xl p-5" style={{ border: '1px solid rgba(245,158,11,0.2)' }}>
                      <p className="text-sm font-semibold mb-3" style={{ color: '#f59e0b' }}>🔔 All Notifications</p>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {dashData.notifications.map((n, i) => (
                          <div key={i} className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
                            style={{ background: n.read ? 'rgba(255,255,255,0.02)' : 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.1)' }}>
                            <span className="text-xs mt-0.5">{n.read ? '📭' : '📬'}</span>
                            <div className="flex-1">
                              <p className="text-xs" style={{ color: n.read ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{n.message}</p>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{new Date(n.createdAt).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="glass rounded-2xl p-12 text-center" style={{ border: '1px solid rgba(236,72,153,0.1)' }}>
                  <p className="text-4xl mb-3">📊</p>
                  <p style={{ color: 'var(--text-muted)' }}>No data yet. Start submitting your project stages.</p>
                </div>
              )}
                </>
              )}
            </div>
          )}

          {/* ── SUBMISSIONS TAB ── */}
          {activeTab === 'submissions' && (
          <div>
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Project Submissions</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Each stage unlocks after the previous is completed.</p>
            </div>
            {/* Manual refresh — fetches latest remarks from DB */}
            <button
              onClick={() => fetchFiles(false)}
              disabled={refreshing}
              title="Refresh remarks"
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all disabled:opacity-60"
              style={{ background: 'rgba(236,72,153,0.08)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}>
              <svg className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {/* Upload blocked banner */}
          {!assignment && (
            <div className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium"
              style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
              🔒 Your project is not yet assigned to a mentor. File uploads are disabled until a mentor is assigned.
            </div>
          )}

          {/* Final acceptance banner */}
          {assignment?.finalRemark && (
            <div className="mb-6 flex items-start gap-4 px-5 py-4 rounded-2xl"
              style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', boxShadow: '0 0 24px rgba(16,185,129,0.1)' }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-xl"
                style={{ background: 'rgba(16,185,129,0.15)' }}>🎉</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold" style={{ color: '#10b981' }}>Project Accepted by Mentor</p>
                <p className="text-xs mt-0.5 break-words" style={{ color: 'var(--text-muted)', wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                  "{assignment.finalRemark}"
                  {assignment.finalRemarkedAt && (
                    <> · {new Date(assignment.finalRemarkedAt).toLocaleDateString()}</>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Toast notification */}
          {toast && (
            <div
              className="mb-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium"
              style={{
                background: toast.type === 'success' ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                border: `1px solid ${toast.type === 'success' ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                color: toast.type === 'success' ? '#10b981' : '#f87171',
              }}
            >
              {toast.msg}
            </div>
          )}

          <div className="glass rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
            {isProjectArchived ? (
              <div className="px-5 py-8 text-center">
                <p className="text-3xl mb-3">✅</p>
                <p className="text-sm font-semibold" style={{ color: '#10b981' }}>Project Completed</p>
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  All submitted files are available in the Archived Submissions section below.
                </p>
              </div>
            ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(236,72,153,0.1)', background: 'rgba(236,72,153,0.05)' }}>
                  {['Stage','Status','Upload','Submission','Mentor Remark','File'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sectionKeys.map((key, i) => {
                  const active = isActive(key);
                  const upload = uploads[key];
                  const isUp = uploading === key;
                  return (
                    <tr key={key}
                      style={{
                        borderBottom: i < sectionKeys.length - 1 ? '1px solid rgba(236,72,153,0.06)' : 'none',
                        opacity: active ? 1 : 0.45,
                        background: selectedSection === key ? 'rgba(236,72,153,0.04)' : 'transparent',
                      }}
                      onClick={() => active && setSelectedSection(key)}
                      className="cursor-pointer hover:bg-pink-500/5 transition-colors"
                    >
                      <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                        <div className="flex items-center gap-2">
                          <span>{upload ? '✅' : active ? '⬜' : '🔒'}</span>
                          {PHASE_CONFIG[key].label}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-1 rounded-lg"
                          style={{
                            background: upload ? 'rgba(16,185,129,0.1)' : active ? 'rgba(236,72,153,0.1)' : 'rgba(255,255,255,0.05)',
                            color: upload ? '#10b981' : active ? '#f472b6' : 'var(--text-muted)',
                          }}>
                          {upload ? 'Uploaded' : active ? 'Ready' : 'Locked'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {active && (
                          <label className={assignment && !projectFinalRemark ? "cursor-pointer" : "cursor-not-allowed opacity-50"} onClick={e => e.stopPropagation()}>
                            <input type="file"
                              accept={PHASE_CONFIG[key].allowedTypes.map(e => `.${e}`).join(',')}
                              onChange={e => handleUpload(e, key)}
                              disabled={isUp || !assignment || !!projectFinalRemark}
                              className="hidden"
                            />
                            <span className="inline-flex flex-col gap-1">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                                style={{ background: 'rgba(236,72,153,0.1)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}>
                                {isUp
                                  ? <><svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>{uploadProgress[key] != null ? `${uploadProgress[key]}%` : 'Uploading'}</>
                                  : '⬆ Upload'
                                }
                              </span>
                              {isUp && uploadProgress[key] != null && (
                                <span className="w-20 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                                  <span className="block h-full rounded-full transition-all"
                                    style={{ width: `${uploadProgress[key]}%`, background: 'linear-gradient(90deg,#ec4899,#a855f7)' }} />
                                </span>
                              )}
                            </span>
                          </label>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs" style={remarkColor(upload?.remark)}>
                        {upload?.remark || '—'}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {upload ? (
                          upload.isLate
                            ? <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}>⚠ Late Submission</span>
                            : <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981' }}>✓ Submitted</span>
                        ) : isPastDeadline ? (
                          <span style={{ color: '#ef4444', fontSize: '10px' }}>Deadline passed</span>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        {upload ? (
                          <div className="flex items-center gap-2">
                            <button onClick={(e) => handleSecureView(e, key)}
                              className="text-xs px-2 py-1 rounded-lg"
                              style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8' }}>View</button>
                            {!projectFinalRemark && (
                              <button onClick={() => handleDelete(key)}
                                className="text-xs px-2 py-1 rounded-lg"
                                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>Delete</button>
                            )}
                          </div>
                        ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>
          
          {/* ── ARCHIVED FILES SECTION ── */}
          {archivedFiles.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    📦 Previous Projects Archive
                  </h2>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    View-only access to files from completed projects
                  </p>
                </div>
                <button
                  onClick={() => setShowArchivedFiles(!showArchivedFiles)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
                  style={{ 
                    background: showArchivedFiles ? 'rgba(236,72,153,0.15)' : 'rgba(236,72,153,0.08)', 
                    color: '#f472b6',
                    border: '1px solid rgba(236,72,153,0.2)'
                  }}
                >
                  {showArchivedFiles ? '👁️ Hide Archive' : '👁️ View Archive'}
                </button>
              </div>
              
              {showArchivedFiles && (
                <div className="space-y-4">
                  {/* Group files by project name */}
                  {Array.from(new Set(archivedFiles.map(f => f.archivedProjectName))).map(projName => {
                    const projFiles = archivedFiles.filter(f => f.archivedProjectName === projName);
                    const batchName = projFiles[0]?.batchName;
                    return (
                      <div key={projName} className="glass rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(236,72,153,0.12)' }}>
                        {/* Academic year header */}
                        {batchName && (
                          <div className="px-5 py-2 flex items-center gap-2"
                            style={{ background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid rgba(99,102,241,0.12)' }}>
                            <span className="text-xs">📅</span>
                            <span className="text-xs font-semibold" style={{ color: '#818cf8' }}>Academic Year: {batchName}</span>
                          </div>
                        )}
                        {/* Project name header */}
                        <div className="px-5 py-3 flex items-center gap-2"
                          style={{ background: 'rgba(236,72,153,0.04)', borderBottom: '1px solid rgba(236,72,153,0.1)' }}>
                          <span className="text-sm">📁</span>
                          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {projName || 'Previous Project'}
                          </p>
                          <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{projFiles.length} files</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr style={{ borderBottom: '1px solid rgba(236,72,153,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                                {['Stage','File','Submitted','Remark','Action'].map(h => (
                                  <th key={h} className="px-4 py-2.5 text-left font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {projFiles.map((file, idx) => (
                                <tr key={idx} style={{ borderBottom: idx < projFiles.length - 1 ? '1px solid rgba(236,72,153,0.06)' : 'none' }}>
                                  <td className="px-4 py-2.5 capitalize" style={{ color: 'var(--text-primary)' }}>
                                    {PHASE_CONFIG[file.section]?.label || file.section?.replace(/([A-Z])/g, ' $1').trim()}
                                  </td>
                                  <td className="px-4 py-2.5" style={{ color: 'var(--text-secondary)' }}>{file.file_name}</td>
                                  <td className="px-4 py-2.5" style={{ color: 'var(--text-muted)' }}>
                                    {file.submittedAt ? new Date(file.submittedAt).toLocaleDateString() : '—'}
                                  </td>
                                  <td className="px-4 py-2.5" style={{
                                    color: file.remark === 'Pending Review' ? '#f59e0b' :
                                           file.remark?.toLowerCase().includes('approved') ? '#10b981' :
                                           file.remark?.toLowerCase().includes('reject') ? '#ef4444' :
                                           'var(--text-secondary)'
                                  }}>
                                    {file.remark || '—'}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <button
                                      onClick={async (e) => {
                                        e.stopPropagation();
                                        try {
                                          const res = await axios.post(`${API}/files/secure-url`, { s3Key: file.file_url, menteeEmail });
                                          if (res.data.success) window.open(res.data.url, '_blank');
                                          else showToast('❌ Could not generate secure link.', 'error');
                                        } catch { showToast('❌ Failed to get secure URL.', 'error'); }
                                      }}
                                      className="px-3 py-1 rounded-lg text-xs font-medium transition-all hover:scale-105"
                                      style={{ background: 'rgba(99,102,241,0.1)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.2)' }}
                                    >
                                      👁️ View
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
          )}

        </div>
      </main>

      {/* ── Profile Modal ── */}
      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => setShowProfile(false)}>
          <div className="w-full max-w-sm mx-4 rounded-2xl p-6 space-y-4"
            style={{ background: 'var(--bg-primary)', border: '1px solid rgba(236,72,153,0.2)', boxShadow: '0 0 40px rgba(236,72,153,0.15)' }}
            onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>Edit Profile</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{menteeEmail}</p>
              </div>
              <button onClick={() => setShowProfile(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>✕</button>
            </div>

            {/* Name */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Full Name *</label>
              <input
                type="text"
                value={profileDraft.name}
                onChange={e => setProfileDraft(p => ({ ...p, name: e.target.value }))}
                placeholder="Your full name"
                className="input-custom w-full px-3 py-2.5 rounded-xl text-sm"
              />
            </div>

            {/* Roll No */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Roll Number</label>
              <input
                type="text"
                value={profileDraft.rollNo}
                onChange={e => setProfileDraft(p => ({ ...p, rollNo: e.target.value }))}
                placeholder="e.g. 21CS001"
                className="input-custom w-full px-3 py-2.5 rounded-xl text-sm"
              />
            </div>

            {/* Contact */}
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Contact Number</label>
              <input
                type="tel"
                value={profileDraft.contactNo}
                onChange={e => setProfileDraft(p => ({ ...p, contactNo: e.target.value }))}
                placeholder="e.g. 9876543210"
                className="input-custom w-full px-3 py-2.5 rounded-xl text-sm"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setShowProfile(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
                Cancel
              </button>
              <button onClick={handleSaveProfile} disabled={savingProfile}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7)', color: '#fff' }}>
                {savingProfile ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
