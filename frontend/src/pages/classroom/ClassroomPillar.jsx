/**
 * ClassroomPillar.jsx — /classroom — PIXEL-EXACT prototype Classroom, wired to
 * the real course backend (Skool model — Operator-ratified 2026-06-11).
 *
 *   Overview/Tracks → GET /api/v1/classroom/courses — real course cards with
 *                     covers + live progress. Authors/admins get the "New
 *                     course" add-card and an Edit pill per own course.
 *   My progress     → GET /api/v1/classroom/me/progress — real table.
 *   Certification   → GET /api/v1/classroom/me/certificates — earned,
 *                     hash-chained credentials: PDF download + /verify QR link.
 *   Bookmarks       → prototype copy (resume guidance), unchanged.
 *
 * NO preloaded content: courses exist only when an admin/partner uploads them.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Plus, Award, QrCode, Download, Edit3, Lock, GraduationCap, X } from "lucide-react";
import { getJSON, send } from "../../utils/api";
import CoursePlayer, { Stars } from "../../components/classroom/CoursePlayer";
import CourseBuilder from "../../components/classroom/CourseBuilder";
// ROOT-CAUSE FIX: prototype.css was only imported by TfpShell — without this
// import the whole pillar rendered UNSTYLED (no cards, no modals, no grid).
import "../../styles/prototype.css";
import "../../styles/classroom-fixes.css";

const API = "/api/v1/classroom";
const toast = (message, type) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); } catch { /* noop */ } };

// Deterministic farm-toned cover per course title — every card looks designed
// even before an author uploads a cover image.
const COVER_PALETTE = [
  "linear-gradient(135deg,#6aa84f,#3d6b2e)",   // field green
  "linear-gradient(135deg,#bf9000,#7a5c00)",   // harvest amber
  "linear-gradient(135deg,#2e7d6b,#174f42)",   // taro leaf teal
  "linear-gradient(135deg,#7b5ea7,#4a3168)",   // eggplant violet
  "linear-gradient(135deg,#c0603a,#83402a)",   // terracotta soil
  "linear-gradient(135deg,#3a7ca5,#235a7c)",   // lagoon blue
  "linear-gradient(135deg,#8a8d3a,#5d6023)",   // dry-season olive
  "linear-gradient(135deg,#a8455f,#702c3e)",   // dragonfruit
];
function coverFor(title) {
  let h = 0;
  for (const ch of String(title || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return COVER_PALETTE[h % COVER_PALETTE.length];
}

function PageHead({ title, sub }) {
  return (
    <div className="page-header">
      <div><h1>{title}</h1>{sub ? <div className="subtitle">{sub}</div> : null}</div>
      <div className="page-actions" />
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

function Hero({ courses }) {
  const pub = (courses || []).filter((c) => c.status === "PUBLISHED");
  const learners = pub.reduce((n, c) => n + (c.learners_count || 0), 0);
  const certs = pub.reduce((n, c) => n + (c.completed_count || 0), 0);
  return (
    <div className="cls-hero">
      <h1>Classroom</h1>
      <div className="cls-hero-sub">
        Practical farming knowledge from verified instructors — short video lessons,
        real action steps, and certificates a bank can scan and trust.
      </div>
      {(pub.length > 0 || learners > 0) && (
        <div className="cls-hero-stats">
          <div className="cls-hero-stat"><div className="n">{pub.length}</div><div className="l">course{pub.length === 1 ? "" : "s"}</div></div>
          {learners > 0 && <div className="cls-hero-stat"><div className="n">{learners}</div><div className="l">farmers learning</div></div>}
          {certs > 0 && <div className="cls-hero-stat"><div className="n">{certs}</div><div className="l">certificates earned</div></div>}
        </div>
      )}
    </div>
  );
}

function CourseGrid({ courses, loading, canAuthor, onOpen, onEdit, onNew }) {
  if (loading) return <div className="course-empty"><BookOpen size={34} /><div className="course-empty-h">Loading…</div></div>;
  if (!courses.length && !canAuthor) {
    return (
      <div className="course-empty">
        <BookOpen size={34} />
        <div className="course-empty-h">No courses yet</div>
        <div className="course-empty-sub">Courses are being prepared by our partners. Check back soon.</div>
      </div>
    );
  }
  return (
    <>
      {!courses.length && canAuthor && (
        <div className="course-empty-admin">No published courses yet. Build the first one below.</div>
      )}
      <div className="course-grid">
        {courses.map((c) => (
          <div className="course-card" key={c.course_id} onClick={() => onOpen(c)}>
            <div className="course-cover" style={c.cover_url ? { backgroundImage: `url(${c.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: coverFor(c.title) }}>
              {!c.cover_url && <span className="cls-cover-initial">{(c.title || "?").slice(0, 1).toUpperCase()}</span>}
              {c.level && <span className="cls-cover-level">{c.level}</span>}
              {(c.pricing || "FREE") !== "FREE" && !c.entitled && <span className="cls-cover-lock"><Lock size={10} /> {c.pricing === "ONE_TIME" ? `FJD ${Number(c.price_fjd || 0).toFixed(0)}` : c.required_tier}</span>}
            </div>
            <div className="course-card-body">
              <div className="course-card-title">
                {c.title}
                {c.status === "DRAFT" && <span className="cb-badge draft" style={{ marginLeft: 6 }}>Draft</span>}
                {(c.pricing || "FREE") !== "FREE" && c.entitled && <span className="cls-price-chip" style={{ marginLeft: 6 }}>Unlocked ✓</span>}
              </div>
              <div className="course-card-bar"><div className="course-card-fill" style={{ width: `${c.progress_pct}%` }} /></div>
              <div className="course-card-pct" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>{c.progress_pct}%</span>
                <span style={{ color: "var(--muted)", fontSize: 11 }}>{c.lesson_count} lesson{c.lesson_count === 1 ? "" : "s"}{c.author_name ? ` · ${c.author_name}` : ""}</span>
                {(c.is_mine || c.can_edit) && (
                  <button className="cb-cover-btn" style={{ marginLeft: "auto" }} onClick={(e) => { e.stopPropagation(); onEdit(c); }}><Edit3 size={11} />Edit</button>
                )}
              </div>
              {(c.avg_rating != null || c.learners_count > 0) && (
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {c.avg_rating != null && <span><Stars value={c.avg_rating} size={11} /> {c.avg_rating}</span>}
                  {c.learners_count > 0 && <span>{c.learners_count} learning{c.completed_count > 0 ? ` · ${c.completed_count} completed` : ""}</span>}
                </div>
              )}
            </div>
          </div>
        ))}
        {canAuthor && (
          <div className="course-card course-card-add" onClick={onNew}>
            <Plus size={26} /><div>New course</div>
          </div>
        )}
      </div>
    </>
  );
}

/** "Teach on Teivaka" — author application for verified, experienced members. */
function TeachCard({ canAuthor, applicationsOpen, onChanged }) {
  const [mine, setMine] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ expertise: "", credentials: "", topics: "" });
  useEffect(() => { getJSON(`${API}/author-request/me`).then((r) => setMine(r.data)).catch(() => {}); }, []);
  if (canAuthor || !applicationsOpen) return null;
  const submit = async () => {
    try {
      await send("POST", `${API}/author-request`, f);
      toast("Application submitted — we review every applicant personally ✓", "success");
      setOpen(false);
      setMine({ status: "PENDING" });
      onChanged?.();
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  const inp = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", fontSize: 13.5, marginBottom: 10 };
  return (
    <>
      <div style={{ marginTop: 14, padding: "14px 16px", border: "1px dashed var(--green)", borderRadius: 12, background: "rgba(106,168,79,0.05)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <GraduationCap size={22} style={{ color: "var(--green-dk)" }} />
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700, color: "var(--soil)", fontSize: 13.5 }}>Know something other farmers need?</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {mine?.status === "PENDING" ? "Your application to teach is under review — we'll notify you."
              : mine?.status === "REJECTED" ? `Previous application wasn't approved${mine.reason ? ` — ${mine.reason}` : ""}. You can apply again.`
              : "Verified, experienced members can apply to teach. Requires the green tick."}
          </div>
        </div>
        {mine?.status !== "PENDING" && (
          <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>Apply to teach</button>
        )}
      </div>
      {open && (
        <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={() => setOpen(false)}>
          <div className="overlay-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="overlay-head"><span>Teach on Teivaka</span><button className="overlay-close" onClick={() => setOpen(false)}><X size={18} /></button></div>
            <div style={{ padding: 18 }}>
              <div className="cb-field-lbl">Your area of expertise *</div>
              <input style={inp} value={f.expertise} placeholder="e.g. 20 years growing watermelon on Viti Levu" onChange={(e) => setF({ ...f, expertise: e.target.value })} />
              <div className="cb-field-lbl">Credentials &amp; experience</div>
              <textarea style={{ ...inp, minHeight: 70 }} value={f.credentials} placeholder="Training, certifications, yields, references — anything that proves you know your craft" onChange={(e) => setF({ ...f, credentials: e.target.value })} />
              <div className="cb-field-lbl">What would you teach?</div>
              <input style={inp} value={f.topics} placeholder="e.g. Dry-season melons, drip irrigation on a budget" onChange={(e) => setF({ ...f, topics: e.target.value })} />
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Requires a verified email and the identity green tick. Every application is reviewed by a human.</div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button className="btn btn-sm btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
                <button className="btn btn-sm btn-primary" onClick={submit}>Submit application</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ContinueStrip({ onResume }) {
  const [items, setItems] = useState(null);
  useEffect(() => { getJSON(`${API}/me/progress`).then((r) => setItems((r.data || []).filter((p) => p.progress_pct > 0 && p.progress_pct < 100))).catch(() => setItems([])); }, []);
  if (!items || !items.length) return null;
  return (
    <>
      <div style={{ fontWeight: 700, fontSize: 13, color: "var(--soil)", margin: "2px 0 8px" }}>Continue learning</div>
      <div className="cls-continue-row">
        {items.map((p) => (
          <div className="cls-continue-card" key={p.course_id} onClick={() => onResume(p.course_id)}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--soil)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
            <div className="course-card-bar" style={{ margin: "8px 0 4px" }}><div className="course-card-fill" style={{ width: `${p.progress_pct}%` }} /></div>
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{p.progress_pct}% — pick up where you left off</div>
          </div>
        ))}
      </div>
    </>
  );
}

function NewCoursePrompt({ onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const create = async () => {
    if (!title.trim()) return;
    try {
      const r = await send("POST", `${API}/courses`, { title: title.trim() });
      toast("Course created — opening the builder ✓", "success");
      onCreated(r.data.course_id);
    } catch (e) { toast(`Couldn't create the course: ${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><span>New course</span></div>
        <div style={{ padding: 18 }}>
          <input autoFocus value={title} placeholder="Course title — e.g. Taro Farming Fundamentals" onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "10px 12px", fontSize: 14, marginBottom: 14 }} />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={create}>Create &amp; build</button>
          </div>
        </div>
      </div>
    </div>
  );
}

async function downloadPdf(certId) {
  try {
    const t = localStorage.getItem("tfos_access_token");
    const r = await fetch(`${API}/certificates/${certId}/pdf`, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) throw new Error(String(r.status));
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${certId}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) { toast(`Couldn't download the certificate: ${e.message}`, "error"); }
}

/** Library — quick-reference field guides from the verified knowledge base
 * (the same cited shared.kb_articles that ground TIS — no LLM inventions). */
function LibraryView() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [body, setBody] = useState(null);
  const load = (search) => {
    const p = new URLSearchParams();
    if (search?.trim()) p.set("search", search.trim());
    getJSON(`/api/v1/kb?${p.toString()}`).then((r) => setItems(r.data || []))
      .catch((e) => { setItems([]); toast(`Couldn't load the library: ${e.userMessage || e.message}`, "error"); });
  };
  useEffect(() => { load(""); }, []);
  useEffect(() => { const id = setTimeout(() => load(q), 300); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [q]);
  useEffect(() => {
    if (!open) { setBody(null); return; }
    getJSON(`/api/v1/kb/${open.kb_entry_id}`).then((r) => setBody(r.data || {})).catch(() => setBody({}));
  }, [open]);
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px", background: "#fff" }}>
        <BookOpen size={15} style={{ color: "var(--muted)" }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the field guides — crops, pests, chemicals, practices…"
          style={{ border: "none", outline: "none", flex: 1, fontSize: 14, background: "transparent", color: "var(--soil)" }} />
      </div>
      {items == null ? <div className="card" style={{ color: "var(--muted)" }}>Loading…</div>
        : items.length === 0 ? (
          <div className="card" style={{ color: "var(--muted)" }}>
            {q ? `Nothing found for “${q}”.` : "Field guides are added by the Teivaka team and partners as they are verified — nothing here is machine-generated."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((a) => (
              <div key={a.kb_entry_id} className="card" style={{ cursor: "pointer", padding: "12px 16px" }} onClick={() => setOpen(a)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: "var(--soil)", fontSize: 14 }}>{a.title}</span>
                  {a.category && <span className="pill grey" style={{ fontSize: 10.5 }}>{a.category}</span>}
                </div>
                {a.content_summary && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>{a.content_summary}</div>}
              </div>
            ))}
          </div>
        )}
      {open && (
        <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={() => setOpen(null)}>
          <div className="overlay-modal" style={{ maxWidth: 640, maxHeight: "88vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div className="overlay-head"><span>{open.title}</span><button className="overlay-close" onClick={() => setOpen(null)}><X size={18} /></button></div>
            <div style={{ padding: 18, overflowY: "auto", whiteSpace: "pre-wrap", fontSize: 14, color: "var(--soil)", lineHeight: 1.65 }}>
              {body == null ? "Loading…" : (body.content_md || body.content_summary || "No content available.")}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Instructors — the verified people behind the knowledge. */
function InstructorsView({ onOpenCourse, teachCta }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    getJSON(`${API}/instructors`).then((r) => setRows(r.data || []))
      .catch((e) => { setRows([]); toast(`Couldn't load instructors: ${e.userMessage || e.message}`, "error"); });
  }, []);
  return (
    <>
      {rows == null ? <div className="card" style={{ color: "var(--muted)" }}>Loading…</div>
        : rows.length === 0 ? (
          <div className="card" style={{ color: "var(--muted)" }}>No instructors with published courses yet — be the first.</div>
        ) : rows.map((a) => (
          <div key={a.user_id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ width: 52, height: 52, borderRadius: "50%", background: coverFor(a.full_name), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20, flexShrink: 0, backgroundSize: "cover", backgroundPosition: "center", backgroundImage: a.avatar_url ? `url(${a.avatar_url})` : undefined }}>
                {!a.avatar_url && (a.full_name || "?").slice(0, 1).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 800, color: "var(--soil)", fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
                  {a.full_name}
                  {a.verified && <span className="pill" style={{ fontSize: 10, background: "rgba(106,168,79,0.15)", color: "var(--green-dk)", fontWeight: 800 }}>VERIFIED INSTRUCTOR</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                  {a.profession || "member"} · {a.course_count} course{a.course_count === 1 ? "" : "s"}
                  {a.learners > 0 && <> · {a.learners} learner{a.learners === 1 ? "" : "s"}</>}
                  {a.certificates > 0 && <> · {a.certificates} certified</>}
                  {a.avg_rating != null && <> · <Stars value={a.avg_rating} size={11} /> {a.avg_rating}</>}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {a.courses.map((c) => (
                    <button key={c.course_id} className="cb-cover-btn" style={{ fontSize: 12 }} onClick={() => onOpenCourse(c.course_id)}>
                      {c.title}{(c.pricing || "FREE") !== "FREE" ? " 🔒" : ""}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      {teachCta}
    </>
  );
}

/** Saved — real bookmarked lessons, resume exactly where you saved. */
function SavedView({ onOpen }) {
  const [rows, setRows] = useState(null);
  const load = () => getJSON(`${API}/me/saved-lessons`).then((r) => setRows(r.data || []))
    .catch((e) => { setRows([]); toast(`Couldn't load saved lessons: ${e.userMessage || e.message}`, "error"); });
  useEffect(() => { load(); }, []);
  const unsave = async (l, e) => {
    e.stopPropagation();
    try { await send("DELETE", `${API}/lessons/${l.lesson_id}/save`); load(); }
    catch (err) { toast(`${err.userMessage || err.message}`, "error"); }
  };
  return rows == null ? <div className="card" style={{ color: "var(--muted)" }}>Loading…</div>
    : rows.length === 0 ? (
      <div className="card" style={{ color: "var(--muted)" }}>
        Nothing saved yet. Tap the bookmark on any lesson and it'll wait for you here.
      </div>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((l) => (
          <div key={l.lesson_id} className="card" style={{ cursor: "pointer", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}
            onClick={() => onOpen(l.course_id, l.lesson_id)}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: "var(--soil)", fontSize: 14 }}>{l.lesson_title}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{l.course_title} · {l.module_title} · saved {new Date(l.saved_at).toLocaleDateString()}</div>
            </div>
            <button className="cb-cover-btn" onClick={(e) => unsave(l, e)}><X size={12} />Remove</button>
          </div>
        ))}
      </div>
    );
}

/** My teaching — the author's reach dashboard (authors/admins only). */
function TeachingView({ onEdit, onNew }) {
  const [rows, setRows] = useState(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    getJSON(`${API}/me/teaching`).then((r) => setRows(r.data || []))
      .catch((e) => { if (e.status === 403) setDenied(true); setRows([]); });
  }, []);
  if (denied) return <div className="card" style={{ color: "var(--muted)" }}>This page is for course authors. Apply to teach from the Classroom overview.</div>;
  return rows == null ? <div className="card" style={{ color: "var(--muted)" }}>Loading…</div> : (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
        <button className="btn btn-sm btn-primary" onClick={onNew}><Plus size={13} />New course</button>
      </div>
      {rows.length === 0 ? (
        <div className="card" style={{ color: "var(--muted)" }}>You haven't built a course yet — your first one is one click away.</div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="data-table" style={{ width: "100%" }}>
            <tbody>
              <tr><th>Course</th><th>Status</th><th>Lessons</th><th>Learners</th><th>Certified</th><th>Rating</th><th /></tr>
              {rows.map((c) => (
                <tr key={c.course_id}>
                  <td style={{ fontWeight: 600, color: "var(--soil)" }}>{c.title}</td>
                  <td>{c.status === "PUBLISHED" ? <span className="cb-badge pub">Live</span> : <span className="cb-badge draft">Draft</span>}</td>
                  <td>{c.published_lessons}/{c.total_lessons}</td>
                  <td>{c.learners}</td>
                  <td>{c.completed}</td>
                  <td>{c.avg_rating != null ? <><Stars value={c.avg_rating} size={11} /> {c.avg_rating} ({c.rating_count})</> : "—"}</td>
                  <td><button className="cb-cover-btn" onClick={() => onEdit(c.course_id)}><Edit3 size={11} />Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function ClassroomPillar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const view = ({
    overview: "overview",
    courses: "courses", tracks: "courses",                      // tracks = legacy alias
    library: "library",
    instructors: "instructors",
    learning: "my_learning", progress: "my_learning",           // progress = legacy alias
    certificates: "certificates", certifications: "certificates",
    saved: "saved", bookmarks: "saved",                         // bookmarks = legacy alias
    teaching: "teaching",
  }[pathname.split("/")[2]]) || "overview";
  const [courses, setCourses] = useState(null);
  const [canAuthor, setCanAuthor] = useState(false);
  const [appsOpen, setAppsOpen] = useState(false);
  const [playing, setPlaying] = useState(null);
  const [building, setBuilding] = useState(null);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState(null);
  const [certs, setCerts] = useState(null);

  const load = () =>
    getJSON(`${API}/courses`)
      .then((r) => { setCourses(r.data || []); setCanAuthor(Boolean(r.meta?.can_author)); setAppsOpen(Boolean(r.meta?.applications_open)); })
      .catch((e) => { setCourses([]); toast(`Couldn't load the Classroom: ${e.userMessage || e.message}`, "error"); });
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (view === "my_learning") getJSON(`${API}/me/progress`).then((r) => setProgress(r.data || [])).catch(() => setProgress([]));
    if (view === "certificates") getJSON(`${API}/me/certificates`).then((r) => setCerts(r.data || [])).catch(() => setCerts([]));
  }, [view]);

  const head = useMemo(() => ({
    overview: ["Classroom", "Learn the TFOS way · Fiji-grounded"],
    courses: ["Courses", "All learning courses"],
    library: ["Library", "Quick-reference field guides — cited, verified knowledge"],
    instructors: ["Instructors", "The verified people behind every course"],
    my_learning: ["My learning", "Your courses, progress and resume points"],
    certificates: ["Certificates", "TFOS-verified credentials — scannable, bankable"],
    saved: ["Saved", "Lessons you bookmarked to come back to"],
    teaching: ["My teaching", "Your courses and their real reach"],
  }[view]), [view]);

  let body;
  if (view === "overview" || view === "courses") {
    body = (
      <>
        {view === "overview" ? <Hero courses={courses} /> : null}
        {view === "overview" ? <GlobalNote /> : null}
        {view === "overview" ? <ContinueStrip onResume={setPlaying} /> : null}
        {canAuthor && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate("/classroom/teaching")}><GraduationCap size={13} />My teaching</button>
          </div>
        )}
        <CourseGrid courses={courses || []} loading={courses == null} canAuthor={canAuthor}
          onOpen={(c) => setPlaying(c.course_id)} onEdit={(c) => setBuilding(c.course_id)} onNew={() => setCreating(true)} />
        <TeachCard canAuthor={canAuthor} applicationsOpen={appsOpen} onChanged={load} />
      </>
    );
  } else if (view === "library") {
    body = <LibraryView />;
  } else if (view === "instructors") {
    body = <InstructorsView onOpenCourse={setPlaying} teachCta={<TeachCard canAuthor={canAuthor} applicationsOpen={appsOpen} onChanged={load} />} />;
  } else if (view === "saved") {
    body = <SavedView onOpen={(courseId, lessonId) => setPlaying({ courseId, lessonId })} />;
  } else if (view === "teaching") {
    body = <TeachingView onEdit={setBuilding} onNew={() => setCreating(true)} />;
  } else if (view === "my_learning") {
    body = (
      <div className="card">
        <table className="data-table">
          <tbody>
            <tr><th>Course</th><th>Progress</th><th>Last activity</th></tr>
            {progress == null ? (
              <tr><td colSpan={3} style={{ color: "var(--muted)" }}>Loading…</td></tr>
            ) : progress.length === 0 ? (
              <tr><td colSpan={3} style={{ color: "var(--muted)" }}>Your learning activity will appear here as you complete lessons.</td></tr>
            ) : progress.map((p) => (
              <tr key={p.course_id} style={{ cursor: "pointer" }} onClick={() => setPlaying(p.course_id)}>
                <td>{p.title}</td>
                <td>{p.progress_pct}%</td>
                <td style={{ color: "var(--muted)" }}>{p.last_activity ? new Date(p.last_activity).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  } else if (view === "certificates") {
    body = certs == null ? (
      <div className="card"><p style={{ color: "var(--muted)" }}>Loading…</p></div>
    ) : certs.length === 0 ? (
      <div className="card">
        <p style={{ color: "var(--muted)" }}>No certifications yet. Complete a course — every lesson done and every quiz passed — and your TFOS-verified credential appears here, scannable from its QR badge.</p>
      </div>
    ) : (
      <>
        {certs.map((c) => (
          <div className="card" key={c.cert_id} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <div className="track-icon" style={{ background: "rgba(191,144,0,0.15)", color: "var(--amber)" }}><Award size={24} /></div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 600, color: "var(--soil)" }}>{c.course_title}</div>
                <div style={{ color: "var(--muted)", fontSize: 12 }}>Earned {new Date(c.issued_at).toLocaleDateString()} · {c.cert_id}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => downloadPdf(c.cert_id)}><Download size={14} />PDF</button>
                {c.audit_hash && (
                  <a className="btn btn-secondary" href={`/verify/${c.audit_hash}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><QrCode size={14} />Verify</a>
                )}
              </div>
            </div>
          </div>
        ))}
      </>
    );
  } else {
    body = (
      <div className="card">
        <p style={{ color: "var(--muted)" }}>Tap any lesson in a course to resume it.</p>
      </div>
    );
  }

  return (
    <div className="tfp">
      <main className="main-content">
        <div className="main-inner">
          {view !== "overview" && <PageHead title={head[0]} sub={head[1]} />}
          {body}
        </div>
      </main>
      {playing && <CoursePlayer
        courseId={typeof playing === "string" ? playing : playing.courseId}
        initialLessonId={typeof playing === "string" ? undefined : playing.lessonId}
        onClose={() => setPlaying(null)} onChanged={load} />}
      {building && <CourseBuilder courseId={building} onClose={() => { setBuilding(null); load(); }} onChanged={load} />}
      {creating && <NewCoursePrompt onClose={() => setCreating(false)} onCreated={(cid) => { setCreating(false); setBuilding(cid); load(); }} />}
    </div>
  );
}
