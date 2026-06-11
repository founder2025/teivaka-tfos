/**
 * CourseBuilder.jsx — the prototype's admin/partner Course Builder (cb-modal),
 * wired end-to-end: course settings + cover, folders (modules), pages
 * (lessons) with rich-text body, video (link or upload), transcript,
 * resources, action step, drip, draft/publish, duplicate/move/delete,
 * and the module quiz editor. Every action persists immediately via the
 * Classroom API — pixel-true to the prototype's builder flow.
 */
import { useEffect, useRef, useState } from "react";
import {
  MoreHorizontal, ChevronDown, ChevronUp, Plus, Folder, Edit3, Eye, Check, Copy,
  Clock, Trash2, X, Play, Link as LinkIcon, FileText, Image as ImageIcon, Upload,
  Bold, Italic, Strikethrough, Code, List, ListOrdered, Quote, Minus, Award, Settings,
} from "lucide-react";
import { getJSON, send } from "../../utils/api";
import { uploadMedia } from "../../utils/imageCompress";
import { VideoStage, videoEmbed } from "./CoursePlayer";
import "../../styles/classroom-fixes.css";

const API = "/api/v1/classroom";
const toast = (message, type) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); } catch { /* noop */ } };

/** In-theme prompt (the prototype's themePrompt, tp-* classes). */
function Prompt({ title, message, value, placeholder, okLabel, destructive, confirm, onOk, onClose }) {
  const [v, setV] = useState(value || "");
  return (
    <div className="tp-root" style={{ position: "fixed", inset: 0, zIndex: 1200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div className="tp-scrim" style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={onClose} />
      <div className="tp-card" style={{ position: "relative", background: "#fff", borderRadius: 12, padding: 18, width: 340, maxWidth: "92vw" }}>
        <div className="tp-title" style={{ fontWeight: 700, color: "var(--soil)", marginBottom: 10 }}>{title}</div>
        {confirm ? <div className="tp-msg" style={{ fontSize: 13.5, color: "var(--muted)", marginBottom: 12 }}>{message}</div> : (
          <input className="tp-input" autoFocus value={v} placeholder={placeholder || ""} onChange={(e) => setV(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { onOk(v); onClose(); } }}
            style={{ width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", fontSize: 14, marginBottom: 12 }} />
        )}
        <div className="tp-foot" style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn btn-sm btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-sm btn-primary" style={destructive ? { background: "#b3402e", borderColor: "#b3402e" } : undefined}
            onClick={() => { onOk(confirm ? true : v); onClose(); }}>{okLabel || "OK"}</button>
        </div>
      </div>
    </div>
  );
}

function QuizEditor({ module, onClose, onSaved }) {
  const [passPct, setPassPct] = useState(70);
  const [qs, setQs] = useState(null);
  useEffect(() => {
    getJSON(`${API}/modules/${module.module_id}/quiz/full`)
      .then((r) => { setPassPct(r.data.pass_pct || 70); setQs((r.data.questions || []).map((q) => ({ question: q.question, options: q.options, correct_index: q.correct_index }))); })
      .catch(() => setQs([]));
  }, [module.module_id]);
  if (qs == null) return <div style={{ color: "var(--muted)", padding: 14 }}>Loading…</div>;
  const setQ = (i, patch) => setQs((a) => a.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  const save = async () => {
    try {
      await send("PUT", `${API}/modules/${module.module_id}/quiz`, { pass_pct: passPct, questions: qs });
      toast(qs.length ? `Quiz saved — ${qs.length} question${qs.length === 1 ? "" : "s"} ✓` : "Quiz removed", "success");
      onSaved();
    } catch (e) { toast(`Couldn't save the quiz: ${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div>
      <div className="cp-topic-head"><div className="cp-topic-h"><Award size={16} style={{ verticalAlign: "-3px" }} /> Quiz — {module.title}</div>
        <button className="btn btn-sm btn-secondary" onClick={onClose}><X size={13} />Back to lessons</button></div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, fontSize: 13.5, color: "var(--soil)" }}>
        Pass mark <input type="number" min={1} max={100} value={passPct} onChange={(e) => setPassPct(Number(e.target.value))}
          style={{ width: 64, border: "1px solid var(--line)", borderRadius: 8, padding: "5px 8px" }} /> %
      </div>
      {qs.map((q, i) => (
        <div key={i} className="card" style={{ marginBottom: 10, padding: "12px 14px" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <input value={q.question} placeholder={`Question ${i + 1}`} onChange={(e) => setQ(i, { question: e.target.value })}
              style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13.5, fontWeight: 600 }} />
            <button className="btn btn-sm btn-secondary" onClick={() => setQs((a) => a.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
          </div>
          {q.options.map((opt, oi) => (
            <div key={oi} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <input type="radio" title="Correct answer" checked={q.correct_index === oi} onChange={() => setQ(i, { correct_index: oi })} />
              <input value={opt} placeholder={`Option ${oi + 1}`} onChange={(e) => setQ(i, { options: q.options.map((o, j) => (j === oi ? e.target.value : o)) })}
                style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px", fontSize: 13 }} />
              {q.options.length > 2 && <button className="btn btn-sm btn-secondary" onClick={() => setQ(i, { options: q.options.filter((_, j) => j !== oi), correct_index: Math.min(q.correct_index, q.options.length - 2) })}><X size={12} /></button>}
            </div>
          ))}
          <button className="btn btn-sm btn-secondary" style={{ marginTop: 8 }} onClick={() => setQ(i, { options: [...q.options, ""] })}><Plus size={12} />Option</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-sm btn-secondary" onClick={() => setQs((a) => [...a, { question: "", options: ["", ""], correct_index: 0 }])}><Plus size={13} />Add question</button>
        <button className="btn btn-sm btn-primary" onClick={save}><Check size={13} />Save quiz</button>
      </div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Pick the radio next to the correct answer. Saving with no questions removes the quiz.</div>
    </div>
  );
}

function CourseSettings({ course, onClose, onSaved }) {
  const [f, setF] = useState({
    title: course.title, description: course.description || "", level: course.level || "BEGINNER",
    attribution: course.attribution || "", language: course.language || "en",
    pricing: (course.pricing || "FREE").toUpperCase(), price_fjd: course.price_fjd || "",
    required_tier: course.required_tier || "BASIC",
  });
  const [monetize, setMonetize] = useState(true);
  useEffect(() => { getJSON(`${API}/settings`).then((r) => setMonetize(Boolean(r.data?.monetization_enabled))).catch(() => {}); }, []);
  const save = async () => {
    try {
      const payload = { ...f, price_fjd: f.pricing === "ONE_TIME" && f.price_fjd !== "" ? Number(f.price_fjd) : undefined };
      if (payload.price_fjd === undefined) delete payload.price_fjd;
      await send("PATCH", `${API}/courses/${course.course_id}`, payload);
      toast("Course settings saved ✓", "success");
      onSaved();
    } catch (e) { toast(`Couldn't save: ${e.userMessage || e.message}`, "error"); }
  };
  const inp = { width: "100%", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", fontSize: 13.5, marginBottom: 10 };
  return (
    <div>
      <div className="cp-topic-head"><div className="cp-topic-h"><Settings size={16} style={{ verticalAlign: "-3px" }} /> Course settings</div>
        <button className="btn btn-sm btn-secondary" onClick={onClose}><X size={13} />Back</button></div>
      <div className="cb-field-lbl">Title</div>
      <input style={inp} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
      <div className="cb-field-lbl">Description</div>
      <textarea style={{ ...inp, minHeight: 70 }} value={f.description} placeholder="What will the learner be able to DO after this course?" onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div className="cb-field-lbl">Level</div>
      <select style={inp} value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })}>
        <option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option>
      </select>
      <div className="cb-field-lbl">Source attribution (who verified this knowledge)</div>
      <input style={inp} value={f.attribution} placeholder="e.g. Fiji Ministry of Agriculture · Extension Services" onChange={(e) => setF({ ...f, attribution: e.target.value })} />
      {monetize && (
        <>
          <div className="cb-field-lbl">Access &amp; pricing</div>
          <select style={inp} value={f.pricing} onChange={(e) => setF({ ...f, pricing: e.target.value })}>
            <option value="FREE">Free — open to every user</option>
            <option value="SUBSCRIPTION">Masterclass — included with a subscription tier</option>
            <option value="ONE_TIME">Masterclass — one-time payment (FJD)</option>
          </select>
          {f.pricing === "ONE_TIME" && (
            <input type="number" min="0" step="1" style={inp} value={f.price_fjd} placeholder="Price in FJD, e.g. 49"
              onChange={(e) => setF({ ...f, price_fjd: e.target.value })} />
          )}
          {f.pricing === "SUBSCRIPTION" && (
            <select style={inp} value={f.required_tier} onChange={(e) => setF({ ...f, required_tier: e.target.value })}>
              <option value="BASIC">BASIC and above</option>
              <option value="PROFESSIONAL">PROFESSIONAL and above</option>
              <option value="ENTERPRISE">ENTERPRISE only</option>
            </select>
          )}
          {f.pricing !== "FREE" && (
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
              Lesson 1 stays free as a preview. Learners unlock the rest via their plan or an access grant — no fake checkout, ever.
            </div>
          )}
        </>
      )}
      <button className="btn btn-primary" onClick={save}><Check size={14} />Save settings</button>
    </div>
  );
}

export default function CourseBuilder({ courseId, onClose, onChanged }) {
  const [course, setCourse] = useState(null);
  const [lid, setLid] = useState(null);
  const [pane, setPane] = useState("lesson"); // lesson | quiz:<module_id> | settings
  const [courseMenu, setCourseMenu] = useState(false);
  const [menuLid, setMenuLid] = useState(null);
  const [changeLid, setChangeLid] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [videoModal, setVideoModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);
  const [draft, setDraft] = useState(null);    // editable copy of selected lesson
  const [prompt, setPrompt] = useState(null);
  const [mpane, setMpane] = useState("tree"); // mobile single-pane: tree | main
  const bodyRef = useRef(null);
  const fileRef = useRef(null);
  const filePick = useRef(null);               // {accept, cb}

  const load = async (keepSel = true) => {
    const r = await getJSON(`${API}/courses/${courseId}`);
    setCourse(r.data);
    const all = r.data.modules.flatMap((m) => m.lessons);
    setLid((cur) => {
      const next = keepSel && cur && all.some((l) => l.lesson_id === cur) ? cur : (all[0]?.lesson_id || null);
      const sel = all.find((l) => l.lesson_id === next);
      setDraft(sel ? { ...sel } : null);
      setShowTranscript(Boolean(sel?.transcript));
      return next;
    });
    return r.data;
  };
  useEffect(() => { load().catch((e) => { toast(`Couldn't open the builder: ${e.userMessage || e.message}`, "error"); onClose(); }); /* eslint-disable-next-line */ }, [courseId]);

  const act = async (fn, okMsg) => {
    try { await fn(); await load(); onChanged?.(); if (okMsg) toast(okMsg, "success"); }
    catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };

  const select = (l) => { setLid(l.lesson_id); setDraft({ ...l }); setShowTranscript(Boolean(l.transcript)); setPane("lesson"); setMenuLid(null); setChangeLid(null); setAddOpen(false); setMpane("main"); };
  const saveLesson = async (extra = {}) => {
    if (!draft) return;
    const body_html = bodyRef.current ? bodyRef.current.innerHTML : draft.body_html;
    await act(() => send("PATCH", `${API}/lessons/${draft.lesson_id}`, {
      title: draft.title, video_kind: draft.video_kind, video_url: draft.video_url,
      body_html, transcript: draft.transcript, resources: draft.resources,
      action_step: draft.action_step, ...extra,
    }), "Saved ✓");
  };
  const moveLesson = async (l, dir) => {
    const m = course.modules.find((mm) => mm.lessons.some((x) => x.lesson_id === l.lesson_id));
    const idx = m.lessons.findIndex((x) => x.lesson_id === l.lesson_id);
    const other = m.lessons[idx + dir];
    if (!other) return;
    await act(async () => {
      await send("PATCH", `${API}/lessons/${l.lesson_id}`, { position: other.position });
      await send("PATCH", `${API}/lessons/${other.lesson_id}`, { position: l.position });
    });
  };
  const pickFile = (accept, cb) => { filePick.current = { accept, cb }; if (fileRef.current) { fileRef.current.accept = accept; fileRef.current.value = ""; fileRef.current.click(); } };
  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f || !filePick.current) return;
    try {
      toast("Uploading…", "info");
      const url = await uploadMedia(f);
      filePick.current.cb(url, f.name);
    } catch (err) { toast(`Upload failed: ${err.userMessage || err.message}`, "error"); }
  };
  const exec = (cmd, arg = null) => { try { document.execCommand(cmd, false, arg); } catch { /* noop */ } bodyRef.current?.focus(); };

  if (!course) return null;
  const sel = draft;
  const pub = course.modules.flatMap((m) => m.lessons).filter((l) => l.status === "PUBLISHED").length;
  const total = course.modules.flatMap((m) => m.lessons).length;
  const TB = ({ Icon, cmd, arg, title }) => (
    <button className="cb-tb-btn" title={title} onMouseDown={(e) => e.preventDefault()} onClick={() => exec(cmd, arg)}><Icon size={14} /></button>
  );

  return (
    <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={onClose}>
      <input ref={fileRef} type="file" style={{ display: "none" }} onChange={onFile} />
      <div className="overlay-modal cb-modal" onClick={(e) => { e.stopPropagation(); }}>
        <div className="overlay-head"><span>Course builder</span><button className="overlay-close" onClick={onClose}><X size={18} /></button></div>
        <div className={`cb-shell pane-${mpane}`}>
          {/* ---------------- LEFT: tree ---------------- */}
          <div className="cb-left">
            <div className="cb-course-head">
              <div className="cb-course-title">{course.title}</div>
              <button className="cb-dots" onClick={() => { setCourseMenu(!courseMenu); setMenuLid(null); }}><MoreHorizontal size={16} /></button>
            </div>
            <div className="cb-progress"><div className="cb-progress-fill" style={{ width: `${total ? Math.round((pub / total) * 100) : 0}%` }} /></div>
            <div className="cb-progress-meta">{pub} of {total} published · course {course.status === "PUBLISHED" ? "LIVE" : "DRAFT"}</div>
            <div className="cb-cover-row">
              <div className="cb-cover-thumb" style={course.cover_url ? { backgroundImage: `url(${course.cover_url})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "var(--cream-2)" }}>
                {!course.cover_url && <ImageIcon size={18} />}
              </div>
              <div className="cb-cover-acts">
                <div className="cb-cover-lbl">Cover image</div>
                <button className="cb-cover-btn" onClick={() => setPrompt({ title: "Cover image link", value: course.cover_url || "https://", okLabel: "Set", onOk: (u) => act(() => send("PATCH", `${API}/courses/${courseId}`, { cover_url: (u || "").trim() }), "Cover updated ✓") })}><LinkIcon size={12} />Link</button>
                <button className="cb-cover-btn" onClick={() => pickFile("image/*", (url) => act(() => send("PATCH", `${API}/courses/${courseId}`, { cover_url: url }), "Cover uploaded ✓"))}><Upload size={12} />Upload</button>
                {course.cover_url && <button className="cb-cover-btn" onClick={() => act(() => send("PATCH", `${API}/courses/${courseId}`, { cover_url: "" }))}><X size={12} /></button>}
              </div>
            </div>
            {courseMenu && (
              <div className="cb-menu cb-menu-course">
                <button onClick={() => { setCourseMenu(false); const m = course.modules.find((mm) => mm.lessons.some((x) => x.lesson_id === lid)) || course.modules[0]; act(() => send("POST", `${API}/modules/${m.module_id}/lessons`).then((r) => setLid(r.data.lesson_id))); }}><Plus size={13} />Add page</button>
                <button onClick={() => { setCourseMenu(false); setPrompt({ title: "Add a module", value: `Module ${course.modules.length + 1}`, okLabel: "Add", onOk: (name) => name.trim() && act(() => send("POST", `${API}/courses/${courseId}/modules`, { title: name.trim() }), "Module added ✓") }); }}><Folder size={13} />Add folder</button>
                <button onClick={() => { setCourseMenu(false); setPane("settings"); setMpane("main"); }}><Settings size={13} />Course settings</button>
                <button onClick={() => { setCourseMenu(false); act(() => send("PATCH", `${API}/courses/${courseId}`, { status: course.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" }), course.status === "PUBLISHED" ? "Course reverted to draft" : "Course is LIVE ✓"); }}><Eye size={13} />{course.status === "PUBLISHED" ? "Unpublish course" : "Publish course"}</button>
                <button className="cb-del" onClick={() => { setCourseMenu(false); setPrompt({ title: "Delete course", confirm: true, message: `Delete “${course.title}” and everything in it? This cannot be undone.`, okLabel: "Delete", destructive: true, onOk: () => act(() => send("DELETE", `${API}/courses/${courseId}`).then(onClose), "Course deleted") }); }}><Trash2 size={13} />Delete course</button>
              </div>
            )}
            <div className="cb-tree">
              {course.modules.map((m, mi) => (
                <div className="cb-mod" key={m.module_id}>
                  <button className="cb-mod-head" onClick={() => setPrompt({ title: "Rename module", value: m.title, okLabel: "Rename", onOk: (t) => t.trim() && act(() => send("PATCH", `${API}/modules/${m.module_id}`, { title: t.trim() })) })}>
                    <span className="cb-chev open"><ChevronDown size={15} /></span>
                    <span className="cb-mod-title">{m.title}</span>
                    <span className="cb-mod-count">{m.lessons.length}</span>
                  </button>
                  <div className="cb-lessons">
                    {m.lessons.map((l) => (
                      <div key={l.lesson_id} className={`cb-lesson-row cb-edit ${l.lesson_id === lid && pane === "lesson" ? "sel" : ""}`} onClick={() => select(l)}>
                        <span className="cb-lesson-name">{l.lesson_id === lid && draft ? draft.title : l.title}</span>
                        {l.status === "DRAFT" ? <span className="cb-badge draft">Draft</span> : <span className="cb-badge pub">Live</span>}
                        <button className="cb-dots sm" onClick={(e) => { e.stopPropagation(); setMenuLid(menuLid === l.lesson_id ? null : l.lesson_id); setCourseMenu(false); setChangeLid(null); }}><MoreHorizontal size={14} /></button>
                        {menuLid === l.lesson_id && (
                          <div className="cb-menu cb-menu-lesson" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => select(l)}><Edit3 size={13} />Edit page</button>
                            <button onClick={() => { setMenuLid(null); act(() => send("PATCH", `${API}/lessons/${l.lesson_id}`, { status: l.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" }), l.status === "PUBLISHED" ? "Reverted to draft" : "Published ✓"); }}>{l.status === "PUBLISHED" ? <Eye size={13} /> : <Check size={13} />}{l.status === "PUBLISHED" ? "Revert to draft" : "Publish"}</button>
                            <button onClick={() => { setChangeLid(changeLid === l.lesson_id ? null : l.lesson_id); setMenuLid(null); }}><Folder size={13} />Change folder</button>
                            <button onClick={() => { setMenuLid(null); act(() => send("POST", `${API}/lessons/${l.lesson_id}/duplicate`), "Duplicated as draft ✓"); }}><Copy size={13} />Duplicate</button>
                            <button onClick={() => { setMenuLid(null); moveLesson(l, -1); }}><ChevronUp size={13} />Move up</button>
                            <button onClick={() => { setMenuLid(null); moveLesson(l, 1); }}><ChevronDown size={13} />Move down</button>
                            <button onClick={() => { setMenuLid(null); act(() => send("PATCH", `${API}/lessons/${l.lesson_id}`, { drip: !l.drip }), `Drip ${l.drip ? "off" : "on"}`); }}><Clock size={13} />Drip status: {l.drip ? "On" : "Off"}</button>
                            <button className="cb-del" onClick={() => { setMenuLid(null); setPrompt({ title: "Delete page", confirm: true, message: `Delete “${l.title}”? This cannot be undone.`, okLabel: "Delete", destructive: true, onOk: () => act(() => send("DELETE", `${API}/lessons/${l.lesson_id}`), "Deleted") }); }}><Trash2 size={13} />Delete</button>
                          </div>
                        )}
                        {changeLid === l.lesson_id && (
                          <div className="cb-menu cb-menu-folder" onClick={(e) => e.stopPropagation()}>
                            {course.modules.map((mm) => (
                              <button key={mm.module_id} onClick={() => { setChangeLid(null); act(() => send("PATCH", `${API}/lessons/${l.lesson_id}`, { module_id: mm.module_id })); }}>{mm.title}{mm.module_id === m.module_id ? " ✓" : ""}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 6, padding: "4px 8px" }}>
                      <button className="cb-cover-btn" onClick={() => act(() => send("POST", `${API}/modules/${m.module_id}/lessons`).then((r) => setLid(r.data.lesson_id)))}><Plus size={11} />Page</button>
                      <button className="cb-cover-btn" onClick={() => { setPane(`quiz:${m.module_id}`); setMpane("main"); }}><Award size={11} />Quiz{m.has_quiz ? ` (${m.question_count})` : ""}</button>
                      {course.modules.length > 1 && m.lessons.length === 0 && (
                        <button className="cb-cover-btn" onClick={() => act(() => send("DELETE", `${API}/modules/${m.module_id}`), "Module removed")}><Trash2 size={11} /></button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* ---------------- RIGHT: editor ---------------- */}
          <div className="cb-right">
            <button className="cls-mobile-back" onClick={() => setMpane("tree")}><Folder size={14} /> Course outline</button>
            {pane === "settings" ? (
              <CourseSettings course={course} onClose={() => setPane("lesson")} onSaved={() => { setPane("lesson"); load(); onChanged?.(); }} />
            ) : pane.startsWith("quiz:") ? (
              <QuizEditor module={course.modules.find((m) => m.module_id === pane.slice(5))} onClose={() => setPane("lesson")} onSaved={() => { setPane("lesson"); load(); onChanged?.(); }} />
            ) : !sel ? (
              <div className="cb-empty">Select a page on the left, or add one.</div>
            ) : (
              <>
                <div className="cb-toolbar">
                  <div className="cb-tb-grp">
                    {["H1", "H2", "H3", "H4"].map((h) => (
                      <button key={h} className="cb-tb-btn cb-h" onMouseDown={(e) => e.preventDefault()} onClick={() => exec("formatBlock", h)}>{h}</button>
                    ))}
                  </div>
                  <div className="cb-tb-sep" />
                  <div className="cb-tb-grp">
                    <TB Icon={Bold} cmd="bold" title="Bold" /><TB Icon={Italic} cmd="italic" title="Italic" />
                    <TB Icon={Strikethrough} cmd="strikeThrough" title="Strikethrough" /><TB Icon={Code} cmd="formatBlock" arg="PRE" title="Code" />
                  </div>
                  <div className="cb-tb-sep" />
                  <div className="cb-tb-grp">
                    <TB Icon={List} cmd="insertUnorderedList" title="Bullets" /><TB Icon={ListOrdered} cmd="insertOrderedList" title="Numbered" />
                    <TB Icon={Quote} cmd="formatBlock" arg="BLOCKQUOTE" title="Quote" />
                  </div>
                  <div className="cb-tb-sep" />
                  <div className="cb-tb-grp">
                    <button className="cb-tb-btn" title="Image" onMouseDown={(e) => e.preventDefault()} onClick={() => setPrompt({ title: "Image URL", value: "", placeholder: "https://...", okLabel: "Insert", onOk: (u) => u.trim() && exec("insertHTML", `<img src="${u.trim()}" style="max-width:100%"/>`) })}><ImageIcon size={14} /></button>
                    <button className="cb-tb-btn" title="Link" onMouseDown={(e) => e.preventDefault()} onClick={() => setPrompt({ title: "Link URL", value: "https://", okLabel: "Insert", onOk: (u) => u.trim() && exec("createLink", u.trim()) })}><LinkIcon size={14} /></button>
                    <TB Icon={Minus} cmd="insertHTML" arg="<hr/>" title="Divider" />
                    <button className="cb-tb-btn" title="Video" onMouseDown={(e) => e.preventDefault()} onClick={() => { setVideoUrl(sel.video_url || ""); setVideoModal(true); }}><Play size={14} /></button>
                  </div>
                </div>
                <input className="cb-title-input" value={sel.title} placeholder="Lesson title"
                  onChange={(e) => setDraft({ ...sel, title: e.target.value })} />
                <div className="cb-video-edit">
                  <VideoStage kind={sel.video_kind} url={sel.video_url} />
                  <button className="btn btn-sm btn-secondary cb-video-btn" onClick={() => { setVideoUrl(sel.video_url || ""); setVideoModal(true); }}>
                    <Play size={12} />{videoEmbed(sel.video_url) || (sel.video_kind === "file" && sel.video_url) ? "Change video" : "Add a video"}
                  </button>
                </div>
                <div ref={bodyRef} className="cb-body-edit" contentEditable suppressContentEditableWarning
                  dangerouslySetInnerHTML={{ __html: sel.body_html || "" }} />
                <div className="cb-field-lbl">Action step — one thing the learner goes and DOES</div>
                <input className="cb-title-input" style={{ fontSize: 13.5 }} value={sel.action_step || ""} placeholder="e.g. Walk your plot and pick the wettest corner for taro."
                  onChange={(e) => setDraft({ ...sel, action_step: e.target.value })} />
                {(showTranscript || sel.transcript) && (
                  <>
                    <div className="cb-field-lbl"><FileText size={12} /> Transcript</div>
                    <textarea className="cb-transcript-edit" value={sel.transcript || ""} placeholder="Paste the spoken words here — reads out loud, works offline, searchable by TIS."
                      onChange={(e) => setDraft({ ...sel, transcript: e.target.value })} />
                  </>
                )}
                {Array.isArray(sel.resources) && sel.resources.length > 0 && (
                  <>
                    <div className="cb-field-lbl">Resources</div>
                    <div className="cb-res-list">
                      {sel.resources.map((r, i) => (
                        <div key={i} className="cb-res-row">
                          {r.kind === "file" ? <FileText size={13} /> : <LinkIcon size={13} />}<span>{r.label || r.url}</span>
                          <button className="cb-res-x" onClick={() => setDraft({ ...sel, resources: sel.resources.filter((_, j) => j !== i) })}><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="cb-foot">
                  <div className="cb-add-wrap">
                    <button className="cb-add-btn" onClick={() => setAddOpen(!addOpen)}>ADD {addOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>
                    {addOpen && (
                      <div className="cb-menu cb-menu-add">
                        <button onClick={() => { setAddOpen(false); setPrompt({ title: "Resource link", value: "https://", okLabel: "Next", onOk: (url) => url.trim() && setPrompt({ title: "Label for this link", value: url.trim(), okLabel: "Add", onOk: (label) => setDraft((d) => ({ ...d, resources: [...(d.resources || []), { kind: "link", label: label || url.trim(), url: url.trim() }] })) }) }); }}><LinkIcon size={13} />Add resource link</button>
                        <button onClick={() => { setAddOpen(false); pickFile("", (url, name) => setDraft((d) => ({ ...d, resources: [...(d.resources || []), { kind: "file", label: name, url }] }))); }}><FileText size={13} />Add resource file</button>
                        <button onClick={() => { setAddOpen(false); setShowTranscript(true); }}><FileText size={13} />Add transcript</button>
                      </div>
                    )}
                  </div>
                  <div className="cb-foot-r">
                    <span className={`cb-pubstate ${sel.status === "PUBLISHED" ? "on" : ""}`}>{sel.status === "PUBLISHED" ? "Published" : "Draft"}</span>
                    <button className={`cb-toggle ${sel.status === "PUBLISHED" ? "on" : ""}`} onClick={() => saveLesson({ status: sel.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" })}><span className="cb-knob" /></button>
                    <button className="cb-cancel" onClick={onClose}>CANCEL</button>
                    <button className={`cb-save ${sel.status === "PUBLISHED" ? "" : "draft"}`} onClick={() => saveLesson()}>SAVE</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        {/* ---------------- video modal ---------------- */}
        {videoModal && sel && (
          <>
            <div className="cb-vmodal-scrim" onClick={() => setVideoModal(false)} />
            <div className="cb-vmodal">
              <div className="cb-vmodal-h">Add a video</div>
              <div className="cb-vmodal-link"><LinkIcon size={14} /><input value={videoUrl} placeholder="YouTube or Vimeo link" onChange={(e) => setVideoUrl(e.target.value)} /></div>
              <div className="cb-vmodal-drop" style={{ cursor: "pointer" }} onClick={() => pickFile("video/*", (url, name) => { setVideoModal(false); setDraft((d) => ({ ...d, video_kind: "file", video_url: url })); toast(`Video uploaded — ${name} ✓`, "success"); })}>
                <Upload size={20} /><div>Tap to upload a video file</div>
                <div className="cb-vmodal-note">A link is best on slow connections. Uploads are stored on the farm media pipeline.</div>
              </div>
              <div className="cb-vmodal-foot">
                <button className="cb-cancel" onClick={() => setVideoModal(false)}>CANCEL</button>
                <button className="cb-save" onClick={() => { setDraft((d) => ({ ...d, video_kind: "link", video_url: videoUrl.trim() })); setVideoModal(false); }}>ADD</button>
              </div>
            </div>
          </>
        )}
        {prompt && <Prompt {...prompt} onClose={() => setPrompt(null)} />}
      </div>
    </div>
  );
}
