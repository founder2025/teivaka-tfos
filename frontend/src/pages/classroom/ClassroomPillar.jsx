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
import { useLocation } from "react-router-dom";
import { BookOpen, Plus, Award, QrCode, Download, Edit3, Lock, GraduationCap, X } from "lucide-react";
import { getJSON, send } from "../../utils/api";
import CoursePlayer, { Stars } from "../../components/classroom/CoursePlayer";
import CourseBuilder from "../../components/classroom/CourseBuilder";
import "../../styles/classroom-fixes.css";

const API = "/api/v1/classroom";
const toast = (message, type) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); } catch { /* noop */ } };

const COVER_FALLBACK = "linear-gradient(135deg,var(--green),#4a7a33)";

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
            <div className="course-cover" style={c.cover_url ? { backgroundImage: `url(${c.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: COVER_FALLBACK }} />
            <div className="course-card-body">
              <div className="course-card-title">
                {c.title}
                {c.status === "DRAFT" && <span className="cb-badge draft" style={{ marginLeft: 6 }}>Draft</span>}
                {(c.pricing || "FREE") !== "FREE" && (
                  <span className="cls-price-chip" style={{ marginLeft: 6 }}>
                    {!c.entitled && <Lock size={9} />}
                    {c.pricing === "ONE_TIME" ? (c.price_fjd ? `FJD ${Number(c.price_fjd).toFixed(0)}` : "Paid") : (c.required_tier || "BASIC")}
                  </span>
                )}
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

export default function ClassroomPillar() {
  const { pathname } = useLocation();
  const view = ({ overview: "overview", tracks: "tracks", progress: "my_progress",
    certifications: "certification", bookmarks: "bookmarks" }[pathname.split("/")[2]]) || "overview";
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
    if (view === "my_progress") getJSON(`${API}/me/progress`).then((r) => setProgress(r.data || [])).catch(() => setProgress([]));
    if (view === "certification") getJSON(`${API}/me/certificates`).then((r) => setCerts(r.data || [])).catch(() => setCerts([]));
  }, [view]);

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
        {view === "overview" ? <ContinueStrip onResume={setPlaying} /> : null}
        <CourseGrid courses={courses || []} loading={courses == null} canAuthor={canAuthor}
          onOpen={(c) => setPlaying(c.course_id)} onEdit={(c) => setBuilding(c.course_id)} onNew={() => setCreating(true)} />
        <TeachCard canAuthor={canAuthor} applicationsOpen={appsOpen} onChanged={load} />
      </>
    );
  } else if (view === "my_progress") {
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
  } else if (view === "certification") {
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
          <PageHead title={head[0]} sub={head[1]} />
          {body}
        </div>
      </main>
      {playing && <CoursePlayer courseId={playing} onClose={() => setPlaying(null)} onChanged={load} />}
      {building && <CourseBuilder courseId={building} onClose={() => { setBuilding(null); load(); }} onChanged={load} />}
      {creating && <NewCoursePrompt onClose={() => setCreating(false)} onCreated={(cid) => { setCreating(false); setBuilding(cid); load(); }} />}
    </div>
  );
}
