import React, { useEffect, useState } from "react";
import axios from "../api/axiosInstance";
import { useTheme } from "../context/ThemeContext";
import ProjectsView from "./ProjectsView";
import { logout } from "../utils/auth";

const API = "http://localhost:5000/api";

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

  const hodEmail = localStorage.getItem('userEmail') || 'hod';

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
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg,#ec4899,#a855f7)",
              boxShadow: "0 0 16px rgba(236,72,153,0.5)",
            }}
          >
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
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
            <ProjectsView projects={projects} userEmail={hodEmail} userRole="hod" />
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
                      {["#", "Name", "Roll No", "Assigned Mentor", "Project", "Team Members"].map((h) => (
                        <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)", whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {mentees.map((m, i) => {
                      const assignment = projects.find((p) => p.mentee?.email === m.email);
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
                            {assignment?.projectName || <span style={{ color: "var(--text-muted)" }}>—</span>}
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

      {/* ── Secure file viewer modal is handled inside ProjectsView ── */}
    </div>
  );
}
