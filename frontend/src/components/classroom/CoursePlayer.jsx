/**
 * CoursePlayer.jsx — the prototype's two-pane learner course player (cp-modal),
 * wired to the real Classroom backend. Left rail: module tree with completion
 * checks + live progress. Right pane: video stage, lesson body, action step,
 * transcript, resources, module quizzes, and the verifiable certificate claim.
 */
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Check, Play, X, FileText, Link as LinkIcon, Award, QrCode, Download } from "lucide-react";
import { getJSON, send } from "../../utils/api";

const API = "/api/v1/classroom";
const toast = (message, type) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); } catch { /* noop */ } };

export function videoEmbed(url) {
  if (!url) return null;
  const yt = String(url).match(/(?:youtu\.be\/|v=|embed\/)([\w-]{6,})/);
  if (yt) return { kind: "youtube", src: `https://www.youtube.com/embed/${yt[1]}` };
  const vm = String(url).match(/vimeo\.com\/(\d+)/);
  if (vm) return { kind: "vimeo", src: `https://player.vimeo.com/video/${vm[1]}` };
  return null;
}

export function VideoStage({ kind, url }) {
  if (kind === "file" && url) {
    return <div className="cb-video"><video src={url} controls style={{ width: "100%", height: "100%" }} /></div>;
  }
  const em = videoEmbed(url);
  if (em) return <div className="cb-video"><iframe title="lesson video" src={em.src} frameBorder="0" allowFullScreen /></div>;
  return <div className="cb-video cb-video-empty"><Play size={30} /><div className="cb-video-msg">Video plays here</div></div>;
}

function Quiz({ module, onPassed }) {
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  useEffect(() => {
    getJSON(`${API}/modules/${module.module_id}/quiz`).then((r) => setQuiz(r.data)).catch(() => setQuiz({ questions: [] }));
  }, [module.module_id]);
  if (quiz == null) return <div style={{ color: "var(--muted)", padding: 14 }}>Loading quiz…</div>;
  if (!quiz.questions.length) return <div style={{ color: "var(--muted)", padding: 14 }}>This module has no quiz.</div>;
  const submit = async () => {
    const list = quiz.questions.map((q, i) => answers[i]);
    if (list.some((a) => a == null)) { toast("Answer every question first", "error"); return; }
    try {
      const r = await send("POST", `${API}/modules/${module.module_id}/quiz/attempt`, { answers: list });
      setResult(r.data);
      toast(r.data.passed ? `Passed — ${r.data.score_pct}% ✓` : `${r.data.score_pct}% — need ${r.data.pass_pct}%. Review and try again.`, r.data.passed ? "success" : "error");
      if (r.data.passed) onPassed();
    } catch (e) { toast(`Couldn't submit: ${e.userMessage || e.message}`, "error"); }
  };
  return (
    <div>
      <div className="cp-topic-head"><div className="cp-topic-h">{module.title} — Quiz</div>
        {module.quiz_passed && <span className="pill" style={{ background: "rgba(106,168,79,0.15)", color: "var(--green-dk)", fontWeight: 700 }}><Check size={12} /> Passed</span>}
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>
        {quiz.questions.length} question{quiz.questions.length === 1 ? "" : "s"} · pass mark {quiz.quiz_pass_pct || 70}%
        {quiz.best_score_pct != null && <> · your best {quiz.best_score_pct}%</>}
      </div>
      {quiz.questions.map((q, i) => (
        <div key={q.question_id} className="card" style={{ marginBottom: 10, padding: "12px 14px" }}>
          <div style={{ fontWeight: 600, color: "var(--soil)", fontSize: 14, marginBottom: 8 }}>{i + 1}. {q.question}</div>
          {(q.options || []).map((opt, oi) => (
            <label key={oi} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 4px", cursor: "pointer", fontSize: 13.5, color: "var(--soil)" }}>
              <input type="radio" name={`q${i}`} checked={answers[i] === oi} onChange={() => setAnswers((a) => ({ ...a, [i]: oi }))} />
              {opt}
            </label>
          ))}
        </div>
      ))}
      <button className="btn btn-primary" onClick={submit}>Submit answers</button>
      {result && (
        <div style={{ marginTop: 10, padding: "10px 14px", borderRadius: 10, fontSize: 13.5, fontWeight: 600, background: result.passed ? "rgba(106,168,79,0.12)" : "rgba(200,80,60,0.1)", color: result.passed ? "var(--green-dk)" : "#a33" }}>
          {result.correct} of {result.total} correct — {result.score_pct}%{result.passed ? " · Passed ✓" : ` · Pass mark is ${result.pass_pct}%`}
        </div>
      )}
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

export default function CoursePlayer({ courseId, onClose, onChanged }) {
  const [course, setCourse] = useState(null);
  const [sel, setSel] = useState(null);       // {kind:'lesson', id} | {kind:'quiz', moduleId}
  const [openMods, setOpenMods] = useState({ 0: true });

  const load = () =>
    getJSON(`${API}/courses/${courseId}`).then((r) => {
      setCourse(r.data);
      setSel((s) => {
        if (s) return s;
        const first = r.data.modules.flatMap((m) => m.lessons).find((l) => l.status === "PUBLISHED");
        return first ? { kind: "lesson", id: first.lesson_id } : null;
      });
    }).catch((e) => { toast(`Couldn't open the course: ${e.userMessage || e.message}`, "error"); onClose(); });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [courseId]);

  const published = useMemo(() => (course ? course.modules.flatMap((m) => m.lessons.filter((l) => l.status === "PUBLISHED")) : []), [course]);
  const doneN = published.filter((l) => l.done).length;

  const toggleDone = async (lesson, e) => {
    e?.stopPropagation();
    try {
      await send(lesson.done ? "DELETE" : "POST", `${API}/lessons/${lesson.lesson_id}/complete`);
      await load();
      onChanged?.();
      if (!lesson.done) toast("Lesson completed ✓", "success");
    } catch (err) { toast(`Couldn't update progress: ${err.userMessage || err.message}`, "error"); }
  };

  const claim = async () => {
    try {
      const r = await send("POST", `${API}/courses/${courseId}/certificate`);
      await load();
      onChanged?.();
      toast("Certificate issued — verifiable from its QR ✓", "success");
      if (r.data?.cert_id) downloadPdf(r.data.cert_id);
    } catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };

  if (!course) return null;
  const topic = sel?.kind === "lesson" ? published.concat(course.modules.flatMap((m) => m.lessons)).find((l) => l.lesson_id === sel.id) : null;
  const quizModule = sel?.kind === "quiz" ? course.modules.find((m) => m.module_id === sel.moduleId) : null;

  return (
    <div className="overlay-backdrop show" style={{ alignItems: "center", padding: 16 }} onClick={onClose}>
      <div className="overlay-modal cp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><span>Course</span><button className="overlay-close" onClick={onClose}><X size={18} /></button></div>
        <div className="cp-shell">
          <div className="cp-rail">
            <button className="cp-back" onClick={onClose}><ChevronDown size={14} /> All courses</button>
            <div className="cp-course-title">{course.title}</div>
            <div className="cp-progress"><div className="cp-progress-fill" style={{ width: `${course.progress_pct}%` }} /></div>
            <div className="cp-progress-meta">{course.progress_pct}% · {doneN} of {published.length} done</div>
            <div className="cp-tree">
              {course.modules.map((m, mi) => {
                const topics = m.lessons.filter((l) => l.status === "PUBLISHED");
                if (!topics.length && !m.has_quiz) return null;
                const open = openMods[mi] ?? mi === 0;
                return (
                  <div className="cp-mod" key={m.module_id}>
                    <button className="cp-mod-head" onClick={() => setOpenMods((o) => ({ ...o, [mi]: !open }))}>
                      <span className={`cp-chev ${open ? "open" : ""}`}><ChevronDown size={15} /></span>
                      <span className="cp-mod-title">{m.title}</span>
                    </button>
                    {open && (
                      <div className="cp-topics">
                        {topics.map((l) => (
                          <div key={l.lesson_id} className={`cp-topic ${sel?.kind === "lesson" && sel.id === l.lesson_id ? "sel" : ""}`} onClick={() => setSel({ kind: "lesson", id: l.lesson_id })}>
                            <button className={`cp-check ${l.done ? "on" : ""}`} onClick={(e) => toggleDone(l, e)} title="Mark done">{l.done ? <Check size={12} /> : null}</button>
                            <span className="cp-topic-name">{l.title}</span>
                            {(videoEmbed(l.video_url) || (l.video_kind === "file" && l.video_url)) && <span className="cp-topic-ic"><Play size={12} /></span>}
                          </div>
                        ))}
                        {m.has_quiz && (
                          <div className={`cp-topic ${sel?.kind === "quiz" && sel.moduleId === m.module_id ? "sel" : ""}`} onClick={() => setSel({ kind: "quiz", moduleId: m.module_id })}>
                            <button className={`cp-check ${m.quiz_passed ? "on" : ""}`} title="Quiz">{m.quiz_passed ? <Check size={12} /> : null}</button>
                            <span className="cp-topic-name" style={{ fontWeight: 600 }}>Module quiz</span>
                            <span className="cp-topic-ic"><Award size={12} /></span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {(course.certificate || course.certificate_eligible) && (
              <div style={{ marginTop: 12, padding: "10px 12px", border: "1px solid var(--green)", borderRadius: 10, background: "rgba(106,168,79,0.07)" }}>
                {course.certificate ? (
                  <>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--green-dk)", display: "flex", gap: 6, alignItems: "center" }}><Award size={14} /> Certificate earned</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => downloadPdf(course.certificate.cert_id)}><Download size={12} />PDF</button>
                      {course.certificate.audit_hash && (
                        <a className="btn btn-sm btn-secondary" href={`/verify/${course.certificate.audit_hash}`} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}><QrCode size={12} />Verify</a>
                      )}
                    </div>
                  </>
                ) : (
                  <button className="btn btn-sm btn-primary" style={{ width: "100%" }} onClick={claim}><Award size={13} /> Claim your certificate</button>
                )}
              </div>
            )}
          </div>
          <div className="cp-main">
            {quizModule ? (
              <Quiz module={quizModule} onPassed={() => { load(); onChanged?.(); }} />
            ) : !topic ? (
              <div className="cp-empty"><FileText size={30} /><div>No lessons in this course yet.</div></div>
            ) : (
              <>
                <div className="cp-topic-head">
                  <div className="cp-topic-h">{topic.title}</div>
                  <button className={`cp-done-btn ${topic.done ? "on" : ""}`} onClick={(e) => toggleDone(topic, e)}>
                    <Check size={14} />{topic.done ? "Completed" : "Mark complete"}
                  </button>
                </div>
                <VideoStage kind={topic.video_kind} url={topic.video_url} />
                {topic.body_html && <div className="cb-lesson-body" dangerouslySetInnerHTML={{ __html: topic.body_html }} />}
                {topic.action_step && (
                  <div style={{ margin: "12px 0", padding: "10px 14px", borderLeft: "3px solid var(--green)", background: "rgba(106,168,79,0.07)", borderRadius: "0 8px 8px 0", fontSize: 13.5, color: "var(--soil)" }}>
                    <strong>Action step:</strong> {topic.action_step}
                  </div>
                )}
                {topic.transcript && (
                  <details className="cb-transcript"><summary><FileText size={13} /> Read transcript</summary><div className="cb-transcript-body">{topic.transcript}</div></details>
                )}
                {Array.isArray(topic.resources) && topic.resources.length > 0 && (
                  <>
                    <div className="cb-res-head">Resources</div>
                    <div className="cb-res-list">
                      {topic.resources.map((r, i) => (
                        <div key={i} className="cb-res-row" style={r.url ? { cursor: "pointer" } : undefined} onClick={() => r.url && window.open(r.url, "_blank")}>
                          {r.kind === "file" ? <FileText size={13} /> : <LinkIcon size={13} />}<span>{r.label || r.url || "Resource"}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
