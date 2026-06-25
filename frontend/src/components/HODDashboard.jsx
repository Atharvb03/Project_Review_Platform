import React, { useEffect, useState } from "react";
import axios from "../api/axiosInstance";
import { useTheme } from "../context/ThemeContext";
import { logout } from "../utils/auth";
import { getAllowedPhases, PHASE_CONFIG } from '../utils/phases';

import { API } from '../config';

// ── Stat card ──────────────────────────────────────────────
function StatCard({ icon, label, value, color }) {
  return (
    <div
      className="glass rounded-2xl p-5 flex items-center gap-4"
      style={{ border: `1px solid ${color}25` }}
    >
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
        style={{ background: `${color}15`, boxShadow: `0 0 16px ${color}25` }}
      >
        {icon}
      </div>
      <div>
        <p className="text-2xl font-extrabold" style={{ color }}>
          {value}
        </p>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          {label}
        </p>
      </div>
    </div>
  );
}

// ── Main HOD Dashboard ─────────────────────────────────────
export default function HODDashboard() {
  const { dark, toggle } = useTheme();
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState({ mentors: 0, mentees: 0, assignments: 0 });
  const [projects, setProjects] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [mentees, setMentees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeBatch, setActiveBatch] = useState(null);
  const [batches, setBatches] = useState([]);

  // Hierarchical view state
  const [expandedBatches, setExpandedBatches] = useState(new Set());
  const [expandedProjects, setExpandedProjects] = useState(new Set());
  const [menteeFiles, setMenteeFiles] = useState({});
  const [filesLoading, setFilesLoading] = useState(null);
  const [viewFile, setViewFile] = useState(null);

  const hodEmail = localStorage.getItem('userEmail') || 'hod';

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
      // Build URL with projectName filter for archived projects
      let url = `${API}/files/metadata/${menteeEmail}`;
      if (project?.isArchived) {
        // For archived projects, filter by specific project name
        url += `?projectName=${encodeURIComponent(project.projectName)}`;
      }
      
      const res = await axios.get(url);
      const map = {};
      // If project is archived, use archived files; otherwise use active files
      // Note: finalRemark alone doesn't mean files are archived - they're only archived when mentee creates new project
      const filesToDisplay = project?.isArchived
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
      console.error('Failed to load file');
    }
  };

  const remarkColor = (r) => {
    if (!r || r === 'Pending Review') return '#f59e0b';
    if (r.toLowerCase().includes('approved')) return '#10b981';
    if (r.toLowerCase().includes('reject')) return '#ef4444';
    return 'var(--text-secondary)';
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
    
    // Fetch all batches for hierarchical view
    axios.get(`${API}/batches`)
      .then(r => {
        setBatches(r.data.data || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, projectsRes, mentorsRes, menteesRes] = await Promise.all([
          axios.get(`${API}/hod/stats`),
          axios.get(`${API}/hod/project-details`),
          axios.get(`${API}/mentors`),
          axios.get(`${API}/mentees`),
        ]);
        setStats(statsRes.data.data || {});
        setProjects(projectsRes.data.data || []);
        setMentors(mentorsRes.data.data || []);
        setMentees(menteesRes.data.data || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const tabBtn = (id, label, icon) => (
    <button
      onClick={() => setTab(id)}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all w-full"
      style={{
        background: tab === id ? "linear-gradient(135deg,#ec4899,#a855f7)" : "transparent",
        color: tab === id ? "#fff" : "var(--text-muted)",
        boxShadow: tab === id ? "0 0 16px rgba(236,72,153,0.35)" : "none",
      }}
    >
      <span>{icon}</span>
      {label}
    </button>
  );

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div className="text-center">
          <svg className="animate-spin w-10 h-10 mx-auto mb-4" style={{ color: "#ec4899" }} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p style={{ color: "var(--text-muted)" }}>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen transition-colors duration-300"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      {/* ── Sidebar ── */}
      <aside
        className="w-64 shrink-0 flex flex-col p-5 gap-2"
        style={{
          background: dark ? "rgba(255,255,255,0.03)" : "rgba(236,72,153,0.04)",
          borderRight: "1px solid rgba(236,72,153,0.12)",
        }}
      >
        {/* Brand */}
        <div className="flex items-center gap-3 mb-6">
          {/* HOD icon — institution / academic building */}
          <div
            className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#ec4899,#a855f7)', boxShadow: '0 0 16px rgba(236,72,153,0.5)' }}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 3L2 9h3v11h5v-6h4v6h5V9h3L12 3z" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>HOD</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Head of Department</p>
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

        <nav className="flex flex-col gap-1 flex-1">
          {tabBtn("overview", "Overview", "📊")}
          {tabBtn("projects", "All Projects", "📁")}
          {tabBtn("mentors", "Mentors", "🎓")}
          {tabBtn("mentees", "Mentees", "📚")}
        </nav>

        <div
          className="flex flex-col gap-2 mt-auto pt-4"
          style={{ borderTop: "1px solid rgba(236,72,153,0.1)" }}
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Theme</span>
            <button onClick={toggle} className="text-lg hover:scale-110 transition-transform">
              {dark ? "☀️" : "🌙"}
            </button>
          </div>
          <button
            onClick={() => logout()}
            className="w-full py-2 rounded-xl text-sm font-medium"
            style={{
              background: "rgba(239,68,68,0.1)",
              color: "#f87171",
              border: "1px solid rgba(239,68,68,0.2)",
            }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 p-8 overflow-auto">
        <div className="max-w-6xl mx-auto">

          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
              {tab === "overview" && "Dashboard Overview"}
              {tab === "projects" && "All Projects"}
              {tab === "mentors" && "Mentors"}
              {tab === "mentees" && "Mentees"}
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              {tab === "overview" && "Platform-wide summary and statistics"}
              {tab === "projects" && "All assigned projects with mentor–mentee mappings and file access"}
              {tab === "mentors" && "All registered mentors on the platform"}
              {tab === "mentees" && "All registered mentees and their assignments"}
            </p>
          </div>

          {/* ── OVERVIEW TAB ── */}
          {tab === "overview" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard icon="🎓" label="Total Mentors" value={stats.mentors} color="#f472b6" />
                <StatCard icon="📚" label="Total Mentees" value={stats.mentees} color="#c084fc" />
                <StatCard icon="📁" label="Assignments" value={stats.assignments} color="#818cf8" />
              </div>

              {/* Recent assignments */}
              <div
                className="glass rounded-2xl overflow-hidden"
                style={{ border: "1px solid rgba(236,72,153,0.12)" }}
              >
                <div
                  className="px-6 py-4 flex items-center justify-between"
                  style={{ borderBottom: "1px solid rgba(236,72,153,0.08)" }}
                >
                  <h2 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                    Recent Assignments
                  </h2>
                  <button
                    onClick={() => setTab("projects")}
                    className="text-xs"
                    style={{ color: "#f472b6" }}
                  >
                    View all →
                  </button>
                </div>
                {projects.length === 0 ? (
                  <div className="p-10 text-center">
                    <p className="text-3xl mb-2">📭</p>
                    <p style={{ color: "var(--text-muted)" }}>No assignments yet.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "rgba(236,72,153,0.05)" }}>
                        {["Project", "Mentor", "Mentee", "Assigned On"].map((h) => (
                          <th
                            key={h}
                            className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projects.slice(0, 5).map((p, i) => (
                        <tr
                          key={i}
                          style={{ borderTop: "1px solid rgba(236,72,153,0.06)" }}
                        >
                          <td className="px-5 py-3 font-medium" style={{ color: "var(--text-primary)" }}>
                            {p.projectName}
                          </td>
                          <td className="px-5 py-3 text-xs" style={{ color: "#f472b6" }}>
                            {p.mentor?.name || p.mentor?.email || "—"}
                          </td>
                          <td className="px-5 py-3 text-xs" style={{ color: "#c084fc" }}>
                            {p.mentee?.name || p.mentee?.email || "—"}
                          </td>
                          <td className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                            {p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* ── PROJECTS TAB ── */}
          {tab === "projects" && (
            <div className="space-y-3">
              {/* Hierarchical View: Batches > Projects > Files */}
              {batches.length === 0 ? (
                <div className="glass rounded-2xl p-8 text-center" style={{ border: "1px solid rgba(236,72,153,0.12)" }}>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    No academic years found.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* List all batches */}
                  {batches.map(batch => {
                    const batchProjects = projects.filter(p => p.batchId?.toString() === batch._id.toString());
                    const isExpanded = expandedBatches.has(batch._id);
                    
                    return (
                      <div key={batch._id} className="glass rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(236,72,153,0.12)" }}>
                        {/* Batch Header - Clickable */}
                        <button
                          onClick={() => toggleBatch(batch._id)}
                          className="w-full px-5 py-4 flex items-center justify-between hover:bg-opacity-50 transition-all"
                          style={{ background: isExpanded ? "rgba(236,72,153,0.08)" : "rgba(236,72,153,0.03)" }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">{isExpanded ? "📂" : "📁"}</span>
                            <div className="text-left">
                              <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                                {batch.name}
                                {batch.isActive && (
                                  <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981" }}>
                                    Active
                                  </span>
                                )}
                              </h3>
                              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                                {batchProjects.length} project{batchProjects.length !== 1 ? "s" : ""}
                              </p>
                            </div>
                          </div>
                          <span className="text-xl" style={{ color: "var(--text-muted)" }}>
                            {isExpanded ? "▼" : "▶"}
                          </span>
                        </button>

                        {/* Projects List - Shows when batch is expanded */}
                        {isExpanded && (
                          <div className="px-3 pb-3">
                            {batchProjects.length === 0 ? (
                              <div className="p-6 text-center" style={{ color: "var(--text-muted)" }}>
                                <p className="text-sm">No projects in this academic year yet.</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {batchProjects.map(project => {
                                  const isProjectExpanded = expandedProjects.has(project._id);
                                  
                                  return (
                                    <div key={project._id} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(236,72,153,0.08)" }}>
                                      {/* Project Header - Clickable */}
                                      <button
                                        onClick={() => toggleProject(project._id, project.mentee?.email, project)}
                                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-opacity-50 transition-all"
                                        style={{ background: isProjectExpanded ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.02)" }}
                                      >
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                          <span className="text-base">{isProjectExpanded ? "📄" : "📋"}</span>
                                          <div className="text-left flex-1 min-w-0">
                                            <h4 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                                              {project.projectName}
                                            </h4>
                                            <div className="flex items-center gap-3 mt-0.5">
                                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                                👤 {project.mentee?.name || project.mentee?.email}
                                              </p>
                                              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                                🎓 {project.mentor?.name || project.mentor?.email}
                                              </p>
                                              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>
                                                {project.duration === "1_year" ? "1 Year" : "6 Months"}
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                        <span className="text-lg ml-2" style={{ color: "var(--text-muted)" }}>
                                          {isProjectExpanded ? "▼" : "▶"}
                                        </span>
                                      </button>

                                      {/* Project Files - Shows when project is expanded */}
                                      {isProjectExpanded && (
                                        <div className="px-2 pb-2" style={{ borderTop: "1px solid rgba(236,72,153,0.08)" }}>
                                          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                                            style={{ background: "rgba(236,72,153,0.04)", color: "var(--text-muted)" }}>
                                            File Submissions — {project.mentee?.email}
                                            <span className="ml-3 normal-case font-normal px-2 py-0.5 rounded-full"
                                              style={{ background: project.duration === "1_year" ? "rgba(99,102,241,0.12)" : "rgba(16,185,129,0.12)", color: project.duration === "1_year" ? "#818cf8" : "#10b981", border: `1px solid ${project.duration === "1_year" ? "rgba(99,102,241,0.25)" : "rgba(16,185,129,0.25)"}` }}>
                                              🗓 {project.duration === "1_year" ? "1 Year" : "6 Months"}
                                            </span>
                                            {project.finalRemark && (
                                              <span className="ml-3 normal-case font-normal px-2 py-0.5 rounded-full"
                                                style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}>
                                                ✅ {project.finalRemark}
                                                {project.finalRemarkedAt && <> · {new Date(project.finalRemarkedAt).toLocaleDateString()}</>}
                                              </span>
                                            )}
                                          </div>
                                          {filesLoading === project.mentee?.email ? (
                                            <div className="px-6 py-6 flex items-center gap-3" style={{ color: "var(--text-muted)" }}>
                                              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                              </svg>
                                              <span className="text-xs">Loading submissions...</span>
                                            </div>
                                          ) : (
                                            <div className="overflow-x-auto">
                                              <table className="w-full text-sm" style={{ minWidth: "600px" }}>
                                                <thead>
                                                  <tr style={{ background: "rgba(0,0,0,0.1)" }}>
                                                    {["Stage", "Status", "Mentor Remark", "Uploaded On", "Action"].map(h => (
                                                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                                                        style={{ color: "var(--text-muted)" }}>{h}</th>
                                                    ))}
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {getAllowedPhases(project.duration).map(key => {
                                                    const cacheKey = `${project.mentee?.email}__${project.projectName}`;
                                                    const upload = (menteeFiles[cacheKey] || {})[key];
                                                    return (
                                                      <tr key={key} style={{ borderBottom: "1px solid rgba(236,72,153,0.06)", opacity: upload ? 1 : 0.4 }}>
                                                        <td className="px-4 py-2.5 text-sm" style={{ color: "var(--text-primary)" }}>
                                                          {PHASE_CONFIG[key]?.label ?? key}
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                          {upload
                                                            ? <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Uploaded</span>
                                                            : <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>Pending</span>
                                                          }
                                                        </td>
                                                        <td className="px-4 py-2.5 text-xs" style={{ color: remarkColor(upload?.remark) }}>
                                                          {upload?.remark || "—"}
                                                        </td>
                                                        <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>
                                                          {upload?.timestamp ? new Date(upload.timestamp).toLocaleDateString() : "—"}
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                          {upload && (
                                                            <button
                                                              onClick={() => handleViewFile(upload.fileURL, project.mentee?.email)}
                                                              className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                                                              style={{ background: "rgba(236,72,153,0.1)", color: "#f472b6", border: "1px solid rgba(236,72,153,0.2)" }}
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
                    
                    const isExpanded = expandedBatches.has("unassigned");
                    
                    return (
                      <div className="glass rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(239,68,68,0.12)" }}>
                        <button
                          onClick={() => toggleBatch("unassigned")}
                          className="w-full px-5 py-4 flex items-center justify-between hover:bg-opacity-50 transition-all"
                          style={{ background: isExpanded ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.03)" }}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-lg">⚠️</span>
                            <div className="text-left">
                              <h3 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
                                Unassigned (No Academic Year)
                              </h3>
                              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                                {unassignedProjects.length} project{unassignedProjects.length !== 1 ? "s" : ""} - Created before batch system
                              </p>
                            </div>
                          </div>
                          <span className="text-xl" style={{ color: "var(--text-muted)" }}>
                            {isExpanded ? "▼" : "▶"}
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="px-3 pb-3">
                            <div className="space-y-2">
                              {unassignedProjects.map(project => {
                                const isProjectExpanded = expandedProjects.has(project._id);
                                
                                return (
                                  <div key={project._id} className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(236,72,153,0.08)" }}>
                                    <button
                                      onClick={() => toggleProject(project._id, project.mentee?.email, project)}
                                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-opacity-50 transition-all"
                                      style={{ background: isProjectExpanded ? "rgba(99,102,241,0.08)" : "rgba(255,255,255,0.02)" }}
                                    >
                                      <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <span className="text-base">{isProjectExpanded ? "📄" : "📋"}</span>
                                        <div className="text-left flex-1 min-w-0">
                                          <h4 className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                                            {project.projectName}
                                          </h4>
                                          <div className="flex items-center gap-3 mt-0.5">
                                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                              👤 {project.mentee?.name || project.mentee?.email}
                                            </p>
                                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                                              🎓 {project.mentor?.name || project.mentor?.email}
                                            </p>
                                          </div>
                                        </div>
                                      </div>
                                      <span className="text-lg ml-2" style={{ color: "var(--text-muted)" }}>
                                        {isProjectExpanded ? "▼" : "▶"}
                                      </span>
                                    </button>

                                    {isProjectExpanded && (
                                      <div className="px-2 pb-2" style={{ borderTop: "1px solid rgba(236,72,153,0.08)" }}>
                                        <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider"
                                          style={{ background: "rgba(236,72,153,0.04)", color: "var(--text-muted)" }}>
                                          File Submissions — {project.mentee?.email}
                                          {project.duration && (
                                            <span className="ml-3 normal-case font-normal px-2 py-0.5 rounded-full"
                                              style={{ background: project.duration === "1_year" ? "rgba(99,102,241,0.12)" : "rgba(16,185,129,0.12)", color: project.duration === "1_year" ? "#818cf8" : "#10b981", border: `1px solid ${project.duration === "1_year" ? "rgba(99,102,241,0.25)" : "rgba(16,185,129,0.25)"}` }}>
                                              🗓 {project.duration === "1_year" ? "1 Year" : "6 Months"}
                                            </span>
                                          )}
                                          {project.finalRemark && (
                                            <span className="ml-3 normal-case font-normal px-2 py-0.5 rounded-full"
                                              style={{ background: "rgba(16,185,129,0.1)", color: "#10b981", border: "1px solid rgba(16,185,129,0.2)" }}>
                                              ✅ {project.finalRemark}
                                              {project.finalRemarkedAt && <> · {new Date(project.finalRemarkedAt).toLocaleDateString()}</>}
                                            </span>
                                          )}
                                        </div>
                                        {filesLoading === project.mentee?.email ? (
                                          <div className="px-6 py-6 flex items-center gap-3" style={{ color: "var(--text-muted)" }}>
                                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                                            </svg>
                                            <span className="text-xs">Loading submissions...</span>
                                          </div>
                                        ) : (
                                          <div className="overflow-x-auto">
                                            <table className="w-full text-sm" style={{ minWidth: "600px" }}>
                                              <thead>
                                                <tr style={{ background: "rgba(0,0,0,0.1)" }}>
                                                  {["Stage", "Status", "Mentor Remark", "Uploaded On", "Action"].map(h => (
                                                    <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                                                      style={{ color: "var(--text-muted)" }}>{h}</th>
                                                  ))}
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {getAllowedPhases(project.duration || "6_months").map(key => {
                                                  const cacheKey = `${project.mentee?.email}__${project.projectName}`;
                                                  const upload = (menteeFiles[cacheKey] || {})[key];
                                                  return (
                                                    <tr key={key} style={{ borderBottom: "1px solid rgba(236,72,153,0.06)", opacity: upload ? 1 : 0.4 }}>
                                                      <td className="px-4 py-2.5 text-sm" style={{ color: "var(--text-primary)" }}>
                                                        {PHASE_CONFIG[key]?.label ?? key}
                                                      </td>
                                                      <td className="px-4 py-2.5">
                                                        {upload
                                                          ? <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>Uploaded</span>
                                                          : <span className="text-xs px-2 py-1 rounded-lg" style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-muted)" }}>Pending</span>
                                                        }
                                                      </td>
                                                      <td className="px-4 py-2.5 text-xs" style={{ color: remarkColor(upload?.remark) }}>
                                                        {upload?.remark || "—"}
                                                      </td>
                                                      <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>
                                                        {upload?.timestamp ? new Date(upload.timestamp).toLocaleDateString() : "—"}
                                                      </td>
                                                      <td className="px-4 py-2.5">
                                                        {upload && (
                                                          <button
                                                            onClick={() => handleViewFile(upload.fileURL, project.mentee?.email)}
                                                            className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
                                                            style={{ background: "rgba(236,72,153,0.1)", color: "#f472b6", border: "1px solid rgba(236,72,153,0.2)" }}
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

          {/* ── MENTORS TAB ── */}
          {tab === "mentors" && (
            <div className="glass rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(236,72,153,0.12)" }}>
              {mentors.length === 0 ? (
                <div className="p-16 text-center">
                  <p className="text-4xl mb-3">📭</p>
                  <p style={{ color: "var(--text-muted)" }}>No mentors registered yet.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "rgba(236,72,153,0.05)", borderBottom: "1px solid rgba(236,72,153,0.1)" }}>
                      {["#", "Name", "Assigned Mentees"].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mentors.map((m, i) => {
                      const assigned = projects.filter((p) => p.mentor?.email === m.email);
                      return (
                        <tr key={m._id} style={{ borderTop: "1px solid rgba(236,72,153,0.06)" }}>
                          <td className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                          <td className="px-5 py-3" style={{ color: "#f472b6" }}>
                            <p className="font-medium text-xs">{m.name || m.email}</p>
                            {m.name && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{m.email}</p>}
                          </td>
                          <td className="px-5 py-3">
                            {assigned.length === 0 ? (
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>None</span>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {assigned.map((a, j) => (
                                  <span key={j} className="text-xs px-2 py-0.5 rounded-full"
                                    style={{ background: "rgba(192,132,252,0.1)", color: "#c084fc" }}>
                                    {a.mentee?.name || a.mentee?.email}
                                  </span>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── MENTEES TAB ── */}
          {tab === "mentees" && (
            <div className="glass rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(236,72,153,0.12)" }}>
              {mentees.length === 0 ? (
                <div className="p-16 text-center">
                  <p className="text-4xl mb-3">📭</p>
                  <p style={{ color: "var(--text-muted)" }}>No mentees registered yet.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "rgba(236,72,153,0.05)", borderBottom: "1px solid rgba(236,72,153,0.1)" }}>
                      {["#", "Name", "Roll No", "Assigned Mentor", "Projects", "Team Members"].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)", whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mentees.map((m, i) => {
                      // Find ALL projects for this mentee (both active and archived)
                      const menteeProjects = projects.filter((p) => p.mentee?.email === m.email);
                      const currentProject = menteeProjects.find(p => !p.isArchived && !p.finalRemark);
                      const completedProjects = menteeProjects.filter(p => p.isArchived || p.finalRemark);
                      
                      // Get current assignment info
                      const assignment = currentProject || menteeProjects[0];
                      const groupMembers = assignment?.groupMembers || m.groupMembers || [];
                      
                      // Prefer data from assignment (hod/project-details) which does a fresh DB lookup
                      const displayName = m.name || assignment?.mentee?.name || m.email;
                      const displayRollNo = m.rollNo || assignment?.mentee?.rollNo || '';
                      
                      return (
                        <tr key={m._id} style={{ borderTop: "1px solid rgba(236,72,153,0.06)" }}>
                          <td className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>{i + 1}</td>
                          <td className="px-5 py-3" style={{ color: "#c084fc" }}>
                            <p className="font-medium text-xs">{displayName}</p>
                            {(m.name || assignment?.mentee?.name) && <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{m.email}</p>}
                          </td>
                          <td className="px-5 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                            {displayRollNo || <span style={{ color: "var(--text-muted)", opacity: 0.5 }}>—</span>}
                          </td>
                          <td className="px-5 py-3 text-xs" style={{ color: "#f472b6" }}>
                            {assignment?.mentor?.name || assignment?.mentor?.email || <span style={{ color: "var(--text-muted)" }}>Not assigned</span>}
                          </td>
                          <td className="px-5 py-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                            {menteeProjects.length === 0 ? (
                              <span style={{ color: "var(--text-muted)" }}>—</span>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                {/* Current/Active Project */}
                                {currentProject && (
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" 
                                      style={{ background: 'rgba(236,72,153,0.12)', color: '#f472b6', border: '1px solid rgba(236,72,153,0.2)' }}>
                                      Active
                                    </span>
                                    <span className="text-xs font-medium">{currentProject.projectName}</span>
                                  </div>
                                )}
                                {/* Completed Projects */}
                                {completedProjects.map((proj, idx) => (
                                  <div key={idx} className="flex items-center gap-1.5">
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" 
                                      style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.2)' }}>
                                      ✓
                                    </span>
                                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{proj.projectName}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            {groupMembers.length === 0 ? (
                              <span className="text-xs" style={{ color: "var(--text-muted)" }}>—</span>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {groupMembers.map((gm, gi) => (
                                  <div key={gi} className="flex items-center gap-1.5">
                                    <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>{gi + 1}.</span>
                                    <div>
                                      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{gm.name}</span>
                                      {gm.rollNo && <span className="text-xs ml-1.5" style={{ color: "var(--text-muted)" }}>({gm.rollNo})</span>}
                                      {gm.contactNo && <span className="text-xs ml-1.5" style={{ color: "var(--text-muted)" }}>· {gm.contactNo}</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Secure file viewer modal */}
      {viewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)" }}
          onClick={() => setViewFile(null)}>
          <div className="w-full max-w-5xl rounded-2xl overflow-hidden flex flex-col"
            style={{ height: "85vh", border: "1px solid rgba(236,72,153,0.25)" }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 shrink-0"
              style={{ background: "linear-gradient(135deg,rgba(236,72,153,0.15),rgba(168,85,247,0.15))", borderBottom: "1px solid rgba(236,72,153,0.2)" }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: "#ec4899", boxShadow: "0 0 6px #ec4899" }} />
                <span className="text-xs font-medium" style={{ color: "#f472b6" }}>🔒 Secure File Viewer — expires in 5 min</span>
              </div>
              <button onClick={() => setViewFile(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: "rgba(239,68,68,0.8)", color: "#fff" }}>✕</button>
            </div>
            <iframe src={viewFile} className="w-full flex-1 border-0" title="Secure File Viewer" />
          </div>
        </div>
      )}
    </div>
  );
}
