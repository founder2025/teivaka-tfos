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
import { Fragment, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BookOpen, Plus, Award, QrCode, Download, Edit3, Lock, GraduationCap, X, Play, Bookmark, Flame, ChevronRight, Calendar, Users, Layers } from "lucide-react";
import { getJSON, send } from "../../utils/api";
import { useChat } from "../../context/ChatContext";
import { useFlags, DisabledNotice } from "../../utils/useFlags.jsx";
import CoursePlayer, { Stars } from "../../components/classroom/CoursePlayer";
import CourseBuilder from "../../components/classroom/CourseBuilder";
import { useCapabilities } from "../../utils/capabilities";
import { useIsNarrow } from "../../hooks/useIsNarrow";
// ROOT-CAUSE FIX: prototype.css was only imported by TfpShell — without this
// import the whole pillar rendered UNSTYLED (no cards, no modals, no grid).
import "../../styles/prototype.css";
import "../../styles/classroom-fixes.css";

const API = "/api/v1/classroom";
const toast = (message, type) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); } catch { /* noop */ } };

// Deterministic farm-toned cover per course title — every card looks designed
// even before an author uploads a cover image.
const COVER_PALETTE = [
  "linear-gradient(135deg,var(--green),#3d6b2e)",   // field green
  "linear-gradient(135deg,var(--amber),#7a5c00)",   // harvest amber
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

const LEVELS = [["", "All levels"], ["BEGINNER", "Beginner"], ["INTERMEDIATE", "Intermediate"], ["ADVANCED", "Advanced"]];
const PRICINGS = [["", "Free & paid"], ["FREE", "Free only"], ["PAID", "Masterclasses"]];
const SORTS = [["featured", "Featured"], ["newest", "Newest"], ["rated", "Top rated"], ["popular", "Most learners"]];

function GridControls({ q, setQ, level, setLevel, price, setPrice, sort, setSort }) {
  const sel = { border: "1px solid var(--line)", borderRadius: 999, padding: "7px 12px", fontSize: 12.5, background: "var(--paper)", color: "var(--soil)", cursor: "pointer" };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 200, border: "1px solid var(--line)", borderRadius: 999, padding: "7px 14px", background: "var(--paper)" }}>
        <BookOpen size={14} style={{ color: "var(--muted)" }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search courses…"
          style={{ border: "none", outline: "none", flex: 1, fontSize: 13.5, background: "transparent", color: "var(--soil)" }} />
      </div>
      <select style={sel} value={level} onChange={(e) => setLevel(e.target.value)}>{LEVELS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select style={sel} value={price} onChange={(e) => setPrice(e.target.value)}>{PRICINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select style={sel} value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}</select>
    </div>
  );
}

function filterCourses(courses, { q, level, price, sort }) {
  let out = courses.filter((c) => {
    if (q.trim() && !`${c.title} ${c.description || ""} ${c.author_name || ""}`.toLowerCase().includes(q.trim().toLowerCase())) return false;
    if (level && (c.level || "BEGINNER") !== level) return false;
    if (price === "FREE" && (c.pricing || "FREE") !== "FREE") return false;
    if (price === "PAID" && (c.pricing || "FREE") === "FREE") return false;
    return true;
  });
  if (sort === "newest") out.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  else if (sort === "rated") out.sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0));
  else if (sort === "popular") out.sort((a, b) => (b.learners_count || 0) - (a.learners_count || 0));
  else out.sort((a, b) => (b.featured === true) - (a.featured === true) || new Date(b.created_at) - new Date(a.created_at));
  return out;
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
              {c.featured && <span className="cls-cover-lock" style={{ left: 10, right: "auto", top: 10, background: "rgba(62,123,31,0.75)", color: "#fff" }}>★ FEATURED</span>}
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
function TeachCard({ canAuthor, applicationsOpen, onChanged, institution = false }) {
  const [mine, setMine] = useState(null);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ expertise: "", credentials: "", topics: "" });
  useEffect(() => { getJSON(`${API}/author-request/me`).then((r) => setMine(r.data)).catch(() => {}); }, []);
  if (canAuthor) return null;
  // Institutions (banks/donors/exporters/regulators) get the contribute path even
  // when general teaching applications are closed; everyone else only when open.
  if (!institution && !applicationsOpen) return null;
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
          <div style={{ fontWeight: 700, color: "var(--soil)", fontSize: 13.5 }}>{institution ? "Contribute your institution's modules" : "Know something other farmers need?"}</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {mine?.status === "PENDING" ? "Your application is under review — we'll notify you."
              : mine?.status === "REJECTED" ? `Previous application wasn't approved${mine.reason ? ` — ${mine.reason}` : ""}. You can apply again.`
              : institution ? "Banks, donors, exporters and regulators can publish finance, market and compliance modules. Apply to contribute — requires the green tick."
              : "Verified, experienced members can apply to teach. Requires the green tick."}
          </div>
        </div>
        {mine?.status !== "PENDING" && (
          <button className="btn btn-sm btn-primary" onClick={() => setOpen(true)}>{institution ? "Apply to contribute" : "Apply to teach"}</button>
        )}
      </div>
      {open && (
        <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={() => setOpen(false)}>
          <div className="overlay-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="overlay-head"><span>{institution ? "Contribute a module" : "Teach on Teivaka"}</span><button className="overlay-close" onClick={() => setOpen(false)}><X size={18} /></button></div>
            <div style={{ padding: 18 }}>
              <div className="cb-field-lbl">Your area of expertise *</div>
              <input style={inp} value={f.expertise} placeholder={institution ? "e.g. Rural development finance, export compliance, biosecurity" : "e.g. 20 years growing watermelon on Viti Levu"} onChange={(e) => setF({ ...f, expertise: e.target.value })} />
              <div className="cb-field-lbl">Credentials &amp; experience</div>
              <textarea style={{ ...inp, minHeight: 70 }} value={f.credentials} placeholder="Training, certifications, yields, references — anything that proves you know your craft" onChange={(e) => setF({ ...f, credentials: e.target.value })} />
              <div className="cb-field-lbl">What would you teach?</div>
              <input style={inp} value={f.topics} placeholder={institution ? "e.g. Accessing farm credit, meeting export standards" : "e.g. Dry-season melons, drip irrigation on a budget"} onChange={(e) => setF({ ...f, topics: e.target.value })} />
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
function GuideForm({ onClose, onDone }) {
  const [f, setF] = useState({ title: "", category: "CROPS", summary: "", content_md: "" });
  const inp = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", fontSize: 13.5, marginBottom: 10 };
  const submit = async () => {
    try {
      await send("POST", `${API}/library/submissions`, f);
      toast("Guide submitted — a human reviews every guide before it goes live ✓", "success");
      onDone();
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={onClose}>
      <div className="overlay-modal" style={{ maxWidth: 560, maxHeight: "90vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><span>Submit a field guide</span><button className="overlay-close" onClick={onClose}><X size={18} /></button></div>
        <div style={{ padding: 18, overflowY: "auto" }}>
          <div className="cb-field-lbl">Title *</div>
          <input style={inp} value={f.title} placeholder="e.g. Dry-season watering for watermelon" onChange={(e) => setF({ ...f, title: e.target.value })} />
          <div className="cb-field-lbl">Category</div>
          <select style={inp} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {["CROPS", "LIVESTOCK", "PESTS", "CHEMICALS", "SOIL", "WEATHER", "MARKET", "GENERAL"].map((c) => <option key={c}>{c}</option>)}
          </select>
          <div className="cb-field-lbl">One-line summary</div>
          <input style={inp} value={f.summary} placeholder="What question does this answer?" onChange={(e) => setF({ ...f, summary: e.target.value })} />
          <div className="cb-field-lbl">The guide itself *</div>
          <textarea style={{ ...inp, minHeight: 180 }} value={f.content_md} placeholder="Write it the way you'd tell a neighbour — plain steps, real numbers, what to watch for." onChange={(e) => setF({ ...f, content_md: e.target.value })} />
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>Every guide is reviewed by a human before it appears. Cite your sources where you can.</div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-sm btn-primary" onClick={submit}>Submit for review</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LibraryView({ canAuthor }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [body, setBody] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mine, setMine] = useState([]);
  const load = (search) => {
    const p = new URLSearchParams();
    if (search?.trim()) p.set("search", search.trim());
    getJSON(`${API}/library?${p.toString()}`).then((r) => setItems(r.data || []))
      .catch((e) => { setItems([]); toast(`Couldn't load the library: ${e.userMessage || e.message}`, "error"); });
  };
  useEffect(() => { load(""); if (canAuthor) getJSON(`${API}/library/submissions/mine`).then((r) => setMine(r.data || [])).catch(() => {}); }, [canAuthor]);
  useEffect(() => { const id = setTimeout(() => load(q), 300); return () => clearTimeout(id); /* eslint-disable-next-line */ }, [q]);
  useEffect(() => {
    if (!open) { setBody(null); return; }
    getJSON(`${API}/library/${open.id}`).then((r) => setBody(r.data || {})).catch(() => setBody({}));
  }, [open]);
  const pendingMine = mine.filter((s) => s.status === "PENDING").length;
  return (
    <>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 220, border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px", background: "var(--paper)" }}>
          <BookOpen size={15} style={{ color: "var(--muted)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the field guides — crops, pests, chemicals, practices…"
            style={{ border: "none", outline: "none", flex: 1, fontSize: 14, background: "transparent", color: "var(--soil)" }} />
        </div>
        {canAuthor && (
          <button className="btn btn-sm btn-primary" onClick={() => setSubmitting(true)}>
            <Plus size={13} />Submit a guide{pendingMine > 0 ? ` (${pendingMine} in review)` : ""}
          </button>
        )}
      </div>
      {items == null ? <div className="card" style={{ color: "var(--muted)" }}>Loading…</div>
        : items.length === 0 ? (
          <div className="card" style={{ color: "var(--muted)" }}>
            {q ? `Nothing found for “${q}”.` : "Field guides are added by the Teivaka team and partners as they are verified — nothing here is machine-generated."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map((a) => (
              <div key={a.id} className="card" style={{ cursor: "pointer", padding: "12px 16px" }} onClick={() => setOpen(a)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: "var(--soil)", fontSize: 14 }}>{a.title}</span>
                  {a.category && <span className="pill grey" style={{ fontSize: 10.5 }}>{a.category}</span>}
                  {a.source === "PARTNER"
                    ? <span className="pill" style={{ fontSize: 10, background: "rgba(191,144,0,0.12)", color: "#8a6a00", fontWeight: 700 }}>PARTNER GUIDE{a.author_name ? ` · ${a.author_name}` : ""}</span>
                    : <span className="pill" style={{ fontSize: 10, background: "rgba(106,168,79,0.12)", color: "var(--green-dk)", fontWeight: 700 }}>TFOS VERIFIED</span>}
                </div>
                {a.summary && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>{a.summary}</div>}
              </div>
            ))}
          </div>
        )}
      {open && (
        <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={() => setOpen(null)}>
          <div className="overlay-modal" style={{ maxWidth: 640, maxHeight: "88vh", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
            <div className="overlay-head"><span>{open.title}</span><button className="overlay-close" onClick={() => setOpen(null)}><X size={18} /></button></div>
            <div style={{ padding: 18, overflowY: "auto", whiteSpace: "pre-wrap", fontSize: 14, color: "var(--soil)", lineHeight: 1.65 }}>
              {body == null ? "Loading…" : (
                <>
                  {body.author_name && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Partner guide by {body.author_name} · reviewed before publishing</div>}
                  {body.content_md || "No content available."}
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {submitting && <GuideForm onClose={() => setSubmitting(false)} onDone={() => { setSubmitting(false); getJSON(`${API}/library/submissions/mine`).then((r) => setMine(r.data || [])).catch(() => {}); }} />}
    </>
  );
}

/** Instructors — the verified people behind the knowledge. */
function InstructorsView({ onOpenCourse, teachCta }) {
  const navigate = useNavigate();
  const chat = useChat();
  const [rows, setRows] = useState(null);
  useEffect(() => {
    getJSON(`${API}/instructors`).then((r) => setRows(r.data || []))
      .catch((e) => { setRows([]); toast(`Couldn't load instructors: ${e.userMessage || e.message}`, "error"); });
  }, []);
  const toggleFollow = async (a) => {
    const next = !a.is_following;
    setRows((list) => list.map((x) => (x.user_id === a.user_id ? { ...x, is_following: next } : x)));
    try {
      await send(next ? "POST" : "DELETE", `/api/v1/community/follow/${a.user_id}`);
      toast(next ? `Following ${a.full_name} ✓` : `Unfollowed ${a.full_name}`, "success");
    } catch (e) {
      setRows((list) => list.map((x) => (x.user_id === a.user_id ? { ...x, is_following: a.is_following } : x)));
      toast(`Couldn't ${next ? "follow" : "unfollow"}: ${e.userMessage || e.message}`, "error");
    }
  };
  return (
    <>
      {rows == null ? <div className="card" style={{ color: "var(--muted)" }}>Loading…</div>
        : rows.length === 0 ? (
          <div className="card" style={{ color: "var(--muted)" }}>No instructors with published courses yet — be the first.</div>
        ) : rows.map((a) => (
          <div key={a.user_id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
              <button onClick={() => navigate(`/u/${a.user_id}`)} style={{ width: 52, height: 52, borderRadius: "50%", border: "none", cursor: "pointer", background: coverFor(a.full_name), display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 800, fontSize: 20, flexShrink: 0, backgroundSize: "cover", backgroundPosition: "center", backgroundImage: a.avatar_url ? `url(${a.avatar_url})` : undefined, padding: 0 }}>
                {!a.avatar_url && (a.full_name || "?").slice(0, 1).toUpperCase()}
              </button>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 800, color: "var(--soil)", fontSize: 15, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <button onClick={() => navigate(`/u/${a.user_id}`)} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "inherit" }}>{a.full_name}</button>
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
              {!a.is_me && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                  <button className={`btn btn-sm ${a.is_following ? "btn-secondary" : "btn-primary"}`} onClick={() => toggleFollow(a)}>
                    {a.is_following ? "Following ✓" : "Follow"}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => chat?.openWith?.({ user_id: a.user_id, full_name: a.full_name, profession: a.profession })}>Message</button>
                </div>
              )}
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

function CourseReviews({ courseId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { getJSON(`${API}/courses/${courseId}/ratings`).then((r) => setRows(r.data || [])).catch(() => setRows([])); }, [courseId]);
  if (rows == null) return <div style={{ color: "var(--muted)", fontSize: 12.5, padding: "8px 0" }}>Loading reviews…</div>;
  if (!rows.length) return <div style={{ color: "var(--muted)", fontSize: 12.5, padding: "8px 0" }}>No reviews yet — they unlock for learners past 50% completion.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 0" }}>
      {rows.map((r, i) => (
        <div key={i} style={{ fontSize: 12.5, color: "var(--soil)", borderLeft: "2px solid var(--line)", paddingLeft: 10 }}>
          <Stars value={r.stars} size={11} /> <strong>{r.reviewer}</strong>
          <span style={{ color: "var(--muted)" }}> · {new Date(r.created_at).toLocaleDateString()}</span>
          {r.review && <div style={{ marginTop: 2 }}>{r.review}</div>}
        </div>
      ))}
    </div>
  );
}

/** My teaching — the author's reach dashboard (authors/admins only). */
function TeachingView({ onEdit, onNew }) {
  const [rows, setRows] = useState(null);
  const [denied, setDenied] = useState(false);
  const [openReviews, setOpenReviews] = useState(null);
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
                <Fragment key={c.course_id}>
                  <tr>
                    <td style={{ fontWeight: 600, color: "var(--soil)" }}>{c.title}</td>
                    <td>{c.status === "PUBLISHED" ? <span className="cb-badge pub">Live</span> : <span className="cb-badge draft">Draft</span>}</td>
                    <td>{c.published_lessons}/{c.total_lessons}</td>
                    <td>{c.learners}</td>
                    <td>{c.completed}</td>
                    <td>
                      {c.avg_rating != null ? (
                        <button style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, font: "inherit", color: "var(--soil)" }}
                          onClick={() => setOpenReviews(openReviews === c.course_id ? null : c.course_id)}>
                          <Stars value={c.avg_rating} size={11} /> {c.avg_rating} ({c.rating_count}) {openReviews === c.course_id ? "▴" : "▾"}
                        </button>
                      ) : "—"}
                    </td>
                    <td><button className="cb-cover-btn" onClick={() => onEdit(c.course_id)}><Edit3 size={11} />Edit</button></td>
                  </tr>
                  {openReviews === c.course_id && (
                    <tr><td colSpan={7}><CourseReviews courseId={c.course_id} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Overview landing blocks (screenshot layout) ───────────────────────────────
function railCard(title, viewAll, navigate, children) {
  return (
    <div className="card" style={{ padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <strong style={{ fontSize: 13.5, color: "var(--soil)" }}>{title}</strong>
        {viewAll && <button onClick={viewAll} style={{ background: "none", border: "none", color: "var(--green-dk)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>View all</button>}
      </div>
      {children}
    </div>
  );
}

// Honest: courses carry no category yet (no backend field) — no faked counts.
function BrowseByCategory() {
  const cats = ["Crop Production", "Livestock", "Farm Management", "Business & Finance", "Climate & Environment"];
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <strong style={{ fontSize: 15, color: "var(--soil)" }}>Browse by Category</strong>
      </div>
      <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
        {cats.map((c) => (
          <div key={c} className="card" style={{ padding: "12px 14px", minWidth: 150, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Layers size={16} style={{ color: "var(--green-dk)" }} />
            <div><div style={{ fontSize: 13, fontWeight: 600, color: "var(--soil)" }}>{c}</div><div style={{ fontSize: 11, color: "var(--muted)" }}>Coming soon</div></div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6, fontStyle: "italic" }}>Categories activate once courses are organised into them.</div>
    </div>
  );
}

function LatestLessons({ onOpen }) {
  const [items, setItems] = useState(null);
  useEffect(() => { getJSON(`${API}/lessons/latest`).then((r) => setItems(r.data || [])).catch(() => setItems([])); }, []);
  if (items == null) return null;
  return (
    <div style={{ marginTop: 18 }}>
      <strong style={{ fontSize: 15, color: "var(--soil)" }}>Latest Lessons</strong>
      <div className="card" style={{ padding: 6, marginTop: 10 }}>
        {items.length === 0 ? (
          <div style={{ padding: 14, color: "var(--muted)", fontSize: 13 }}>No lessons published yet.</div>
        ) : items.map((l) => (
          <div key={l.lesson_id} onClick={() => onOpen({ courseId: l.course_id, lessonId: l.lesson_id })}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 10px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}>
            <span style={{ width: 30, height: 30, borderRadius: 8, background: "rgba(106,168,79,0.12)", color: "var(--green-dk)", display: "grid", placeItems: "center", flexShrink: 0 }}><Play size={14} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--soil)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.title}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{l.author_name || "Instructor"}{l.level ? ` · ${l.level}` : ""}</div>
            </div>
            <Bookmark size={15} style={{ color: "var(--muted)", flexShrink: 0 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RailContinue({ navigate, onResume }) {
  const [items, setItems] = useState(null);
  useEffect(() => { getJSON(`${API}/me/progress`).then((r) => setItems((r.data || []).filter((p) => p.progress_pct > 0 && p.progress_pct < 100))).catch(() => setItems([])); }, []);
  return railCard("Continue Learning", () => navigate("/classroom/learning"), navigate, (
    (!items || items.length === 0)
      ? <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No courses in progress yet — start one to see it here.</div>
      : <>
          {items.slice(0, 3).map((p) => (
            <div key={p.course_id} onClick={() => onResume(p.course_id)} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, cursor: "pointer" }}>
              <span style={{ width: 40, height: 40, borderRadius: 8, background: coverFor(p.title), flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--soil)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                <div className="course-card-bar" style={{ marginTop: 4 }}><div className="course-card-fill" style={{ width: `${p.progress_pct}%` }} /></div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{p.progress_pct}% complete</div>
              </div>
            </div>
          ))}
          <button className="btn btn-sm btn-secondary" style={{ width: "100%", marginTop: 4 }} onClick={() => navigate("/classroom/learning")}>Go to My Courses</button>
        </>
  ));
}

function RailCertificates({ navigate }) {
  const [items, setItems] = useState(null);
  useEffect(() => { getJSON(`${API}/me/certificates`).then((r) => setItems(r.data || [])).catch(() => setItems([])); }, []);
  return railCard("My Certificates", () => navigate("/classroom/certificates"), navigate, (
    (!items || items.length === 0)
      ? <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Complete a course to earn your first certificate.</div>
      : <>
          {items.slice(0, 3).map((c) => (
            <div key={c.cert_id} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
              <span style={{ width: 34, height: 34, borderRadius: 8, background: "rgba(106,168,79,0.12)", color: "var(--green-dk)", display: "grid", placeItems: "center", flexShrink: 0 }}><Award size={16} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--soil)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.course_title}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>Issued {c.issued_at ? new Date(c.issued_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""}</div>
              </div>
            </div>
          ))}
          <button className="btn btn-sm btn-secondary" style={{ width: "100%", marginTop: 4 }} onClick={() => navigate("/classroom/certificates")}>View all certificates</button>
        </>
  ));
}

function RailStreak() {
  const [d, setD] = useState(null);
  useEffect(() => { getJSON(`${API}/me/streak`).then((r) => setD(r.data || null)).catch(() => setD(null)); }, []);
  const DOW = ["M", "T", "W", "T", "F", "S", "S"];
  return (
    <div className="card" style={{ padding: 14, marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <Flame size={16} style={{ color: "#E0792B" }} /><strong style={{ fontSize: 13.5, color: "var(--soil)" }}>Learning Streak</strong>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "var(--soil)" }}>{d ? d.streak_days : 0} day{(d?.streak_days || 0) === 1 ? "" : "s"}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>{(d?.streak_days || 0) > 0 ? "Keep it up! 🌟" : "Complete a lesson to start your streak."}</div>
      <div style={{ display: "flex", gap: 6 }}>
        {(d?.week || DOW.map(() => ({ active: false }))).map((w, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center" }}>
            <div style={{ width: 24, height: 24, margin: "0 auto", borderRadius: "50%", display: "grid", placeItems: "center",
              background: w.active ? "var(--green)" : "var(--cream)", color: w.active ? "#fff" : "var(--muted)", fontSize: 11, fontWeight: 700, border: w.active ? "none" : "1px solid var(--line)" }}>
              {w.active ? "✓" : ""}
            </div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{DOW[i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RailInstructors({ navigate, onOpen }) {
  const [items, setItems] = useState(null);
  useEffect(() => { getJSON(`${API}/instructors`).then((r) => setItems(r.data || [])).catch(() => setItems([])); }, []);
  return railCard("Top Instructors", () => navigate("/classroom/instructors"), navigate, (
    (!items || items.length === 0)
      ? <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Instructors appear here as courses are published.</div>
      : items.slice(0, 3).map((t) => (
          <div key={t.user_id} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            {t.avatar_url
              ? <img src={t.avatar_url} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              : <span style={{ width: 34, height: 34, borderRadius: "50%", background: coverFor(t.full_name), color: "#fff", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{(t.full_name || "?")[0]}</span>}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--soil)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.full_name}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "capitalize" }}>{t.profession || "Instructor"}</div>
            </div>
            {t.avg_rating != null && <span style={{ fontSize: 12, fontWeight: 700, color: "var(--soil)", flexShrink: 0 }}>★ {t.avg_rating}</span>}
          </div>
        ))
  ));
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
  const [gq, setGq] = useState("");
  const [gLevel, setGLevel] = useState("");
  const [gPrice, setGPrice] = useState("");
  const [gSort, setGSort] = useState("featured");
  const { can } = useCapabilities();
  const institution = can("CLASSROOM_UPLOAD_MODULE");  // banks/donors/exporters/regulators
  const wide = !useIsNarrow(1100);  // room for the right rail on the overview landing

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
  if (view === "overview") {
    const featured = filterCourses(courses || [], { sort: "featured" }).slice(0, 4);
    const center = (
      <>
        <Hero courses={courses} />
        <GlobalNote />
        <BrowseByCategory />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "4px 0 10px" }}>
          <strong style={{ fontSize: 15, color: "var(--soil)" }}>Featured Courses</strong>
          <button onClick={() => navigate("/classroom/courses")} style={{ background: "none", border: "none", color: "var(--green-dk)", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>View all</button>
        </div>
        <CourseGrid courses={featured} loading={courses == null} canAuthor={false}
          onOpen={(c) => setPlaying(c.course_id)} onEdit={(c) => setBuilding(c.course_id)} onNew={() => setCreating(true)} />
        <LatestLessons onOpen={setPlaying} />
        <TeachCard canAuthor={canAuthor} applicationsOpen={appsOpen} onChanged={load} institution={institution} />
      </>
    );
    body = wide ? (
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>{center}</div>
        <aside style={{ width: 320, flexShrink: 0 }}>
          <RailContinue navigate={navigate} onResume={setPlaying} />
          <RailCertificates navigate={navigate} />
          <RailStreak />
          <RailInstructors navigate={navigate} onOpen={setPlaying} />
        </aside>
      </div>
    ) : (
      <>
        {center}
        <RailContinue navigate={navigate} onResume={setPlaying} />
        <RailCertificates navigate={navigate} />
        <RailStreak />
        <RailInstructors navigate={navigate} onOpen={setPlaying} />
      </>
    );
  } else if (view === "courses") {
    body = (
      <>
        {canAuthor && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button className="btn btn-sm btn-secondary" onClick={() => navigate("/classroom/teaching")}><GraduationCap size={13} />My teaching</button>
          </div>
        )}
        {(courses || []).length > 0 && (
          <GridControls q={gq} setQ={setGq} level={gLevel} setLevel={setGLevel} price={gPrice} setPrice={setGPrice} sort={gSort} setSort={setGSort} />
        )}
        <CourseGrid courses={filterCourses(courses || [], { q: gq, level: gLevel, price: gPrice, sort: gSort })} loading={courses == null} canAuthor={canAuthor}
          onOpen={(c) => setPlaying(c.course_id)} onEdit={(c) => setBuilding(c.course_id)} onNew={() => setCreating(true)} />
        <TeachCard canAuthor={canAuthor} applicationsOpen={appsOpen} onChanged={load} institution={institution} />
      </>
    );
  } else if (view === "library") {
    body = <LibraryView canAuthor={canAuthor} />;
  } else if (view === "instructors") {
    body = <InstructorsView onOpenCourse={setPlaying} teachCta={<TeachCard canAuthor={canAuthor} applicationsOpen={appsOpen} onChanged={load} institution={institution} />} />;
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-secondary" onClick={() => downloadPdf(c.cert_id)}><Download size={14} />PDF</button>
                {c.audit_hash && (
                  <a className="btn btn-secondary" href={`/verify/${c.audit_hash}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><QrCode size={14} />Verify</a>
                )}
                <button className="btn btn-secondary" onClick={async () => {
                  try {
                    await send("POST", "/api/v1/community/feed", {
                      body: `I completed “${c.course_title}” in the Teivaka Classroom and earned a verified certificate 🎓 — scan it, it's real: https://teivaka.com/verify/${c.audit_hash || ""}`,
                      reach: "GLOBAL",
                    });
                    toast("Shared to the Feed ✓", "success");
                  } catch (e) { toast(`Couldn't share: ${e.userMessage || e.message}`, "error"); }
                }}>Share</button>
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

  const flagOn = useFlags();
  if (!flagOn("classroom")) {
    return (
      <div className="tfp"><main className="main-content"><div className="main-inner">
        <DisabledNotice what="The Classroom" />
      </div></main></div>
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
