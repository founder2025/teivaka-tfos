/**
 * ClassroomPillar.jsx — /classroom — PIXEL-EXACT rebuild of the prototype's CLASSROOM pillar.
 *
 * Reproduces the prototype's exact shell (topbar + left-rail classroom nav + main-inner)
 * and the 5 classroom views (Overview/Tracks/My progress/Certification/Bookmarks) using the
 * prototype's own DOM + classes (rendered under <TfpShell> → styles/prototype.css).
 *
 * Real-data wiring (honest where the prototype faked it):
 *   Overview/Tracks → GET /api/v1/kb  (published shared.kb_articles → course-card grid).
 *                     Clicking a card opens the article in the prototype's two-pane
 *                     course player (cp-modal), body from GET /api/v1/kb/{id}.
 *   My progress    → honest-empty (no lesson-completion tracking backend yet).
 *   Certification  → honest-empty (prototype hardcoded a fake cert — NOT replicated).
 *   Bookmarks      → honest-empty (matches the prototype's own copy).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Home, BookOpen, Tractor, Sparkles, Search, MessageSquare, Bell, ChevronDown,
  Layers, Activity, Award, Bookmark, X, FileText, QrCode,
} from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import PrototypeTopbar from "../../components/nav/PrototypeTopbar";

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
async function getJSON(u) { const r = await fetch(u, { headers: authHeaders() }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

const PILLARS = [
  { id: "home", label: "Home", Icon: Home, to: "/home" },
  { id: "classroom", label: "Classroom", Icon: BookOpen, to: "/classroom" },
  { id: "farm", label: "Farm", Icon: Tractor, to: "/farm" },
  { id: "tis", label: "TIS", Icon: Sparkles, to: "/tis" },
];
const CLASSROOM_NAV = [
  { id: "overview", label: "Overview", Icon: BookOpen },
  { id: "tracks", label: "Tracks", Icon: Layers },
  { id: "my_progress", label: "My progress", Icon: Activity },
  { id: "certification", label: "Certification", Icon: Award },
  { id: "bookmarks", label: "Bookmarks", Icon: Bookmark },
];

// Prototype's exact cover presets (courseCoverStyle) + a category fallback palette.
const COVER_PRESET = {
  "Watermelon Farming": "linear-gradient(135deg,var(--green),#3d6b2e)",
  "Eggplant Farming": "linear-gradient(135deg,#7b5ea7,#4a3168)",
  "Kava Farming": "linear-gradient(135deg,var(--amber),#7a5c00)",
};
function coverStyle(title) {
  return { background: COVER_PRESET[title] || "linear-gradient(135deg,var(--green),#4a7a33)" };
}

function PageHead({ title, sub, action }) {
  return (
    <div className="page-header">
      <div><h1>{title}</h1>{sub ? <div className="subtitle">{sub}</div> : null}</div>
      <div className="page-actions">{action}</div>
    </div>
  );
}

function GlobalNote() {
  return (
    <div className="cb-global-note">
      <BookOpen size={13} /> <strong>Open to everyone, everywhere.</strong> Every lesson is
      available to all farmers in any country — learning is never limited by region.
    </div>
  );
}

function CourseGrid({ courses, loading, onOpen }) {
  if (loading) return <div className="course-empty"><BookOpen size={34} /><div className="course-empty-h">Loading…</div></div>;
  if (!courses.length) {
    return (
      <div className="course-empty">
        <BookOpen size={34} />
        <div className="course-empty-h">No courses yet</div>
        <div className="course-empty-sub">Lessons will appear here when they are ready. Check back soon.</div>
      </div>
    );
  }
  return (
    <div className="course-grid">
      {courses.map((c) => (
        <div className="course-card" key={c.kb_entry_id} onClick={() => onOpen(c)}>
          <div className="course-cover" style={coverStyle(c.title)} />
          <div className="course-card-body">
            <div className="course-card-title">{c.title}</div>
            <div className="course-card-bar"><div className="course-card-fill" style={{ width: "0%" }} /></div>
            <div className="course-card-pct">{c.category || "Lesson"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Two-pane course player (cp-modal) — opens a single KB article as a lesson. */
function LessonPlayer({ course, onClose }) {
  const [body, setBody] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await getJSON(`/api/v1/kb/${course.kb_entry_id}`);
        if (alive) setBody(r?.data || {});
      } catch { if (alive) setBody({}); }
    })();
    return () => { alive = false; };
  }, [course.kb_entry_id]);
  const text = body == null ? "Loading…" : (body.content_md || body.content_summary || course.content_summary || "No content for this lesson yet.");
  return (
    <div className="overlay-backdrop" onClick={onClose}>
      <div className="overlay-modal cp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><span>Course</span><button className="overlay-close" onClick={onClose}><X size={18} /></button></div>
        <div className="cp-shell">
          <div className="cp-rail">
            <button className="cp-back" onClick={onClose}><ChevronDown size={14} /> All courses</button>
            <div className="cp-course-title">{course.title}</div>
            <div className="cp-progress"><div className="cp-progress-fill" style={{ width: "0%" }} /></div>
            <div className="cp-progress-meta">0% · 0 of 1 done</div>
            <div className="cp-tree">
              <div className="cp-mod">
                <div className="cp-topic sel">
                  <span className="cp-check" />
                  <span className="cp-topic-name">{course.title}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="cp-main">
            <div className="cp-topic-head">
              <div className="cp-topic-h">{course.title}</div>
            </div>
            <div className="cb-lesson-body" style={{ whiteSpace: "pre-wrap" }}>{text}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClassroomPillar() {
  const navigate = useNavigate();
  const [view, setView] = useState("overview");
  const [courses, setCourses] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await getJSON("/api/v1/kb");
        setCourses(r?.data || []);
      } catch { setCourses([]); }
    })();
  }, []);

  const head = useMemo(() => ({
    overview: ["Classroom", "Learn the TFOS way · Fiji-grounded"],
    tracks: ["Courses", "All learning courses"],
    my_progress: ["My progress", "Your learning activity"],
    certification: ["Certification", "TFOS-verified credentials"],
    bookmarks: ["Bookmarks", "Saved lessons"],
  }[view]), [view]);

  let body;
  if (view === "overview" || view === "tracks") {
    body = (
      <>
        {view === "overview" ? <GlobalNote /> : null}
        <CourseGrid courses={courses || []} loading={courses == null} onOpen={setOpen} />
      </>
    );
  } else if (view === "my_progress") {
    body = (
      <div className="card">
        <table className="data-table">
          <tbody>
            <tr><th>Course</th><th>Progress</th></tr>
            <tr><td colSpan={2} style={{ color: "var(--muted)" }}>Your learning activity will appear here as you complete lessons.</td></tr>
          </tbody>
        </table>
      </div>
    );
  } else if (view === "certification") {
    body = (
      <div className="card">
        <p style={{ color: "var(--muted)" }}>No certifications yet. Complete a course and your TFOS-verified credential appears here, scannable from a QR badge.</p>
      </div>
    );
  } else {
    body = (
      <div className="card">
        <p style={{ color: "var(--muted)" }}>Tap any lesson in a course to resume it.</p>
      </div>
    );
  }

  return (
    <TfpShell>
      <PrototypeTopbar />

      <div className="shell">
        <aside className="left-rail">
          <div className="rail-head">classroom</div>
          {CLASSROOM_NAV.map((it) => (
            <div key={it.id} className={`rail-item ${it.id === view ? "active" : ""}`} onClick={() => setView(it.id)}>
              <it.Icon size={16} /><span>{it.label}</span>
            </div>
          ))}
        </aside>
        <main className="main-content">
          <div className="main-inner">
            <PageHead title={head[0]} sub={head[1]} />
            {body}
          </div>
        </main>
      </div>

      {open ? <LessonPlayer course={open} onClose={() => setOpen(null)} /> : null}
    </TfpShell>
  );
}
