/**
 * CaptureEngine — the Universal Capture Engine.
 *
 * Reads a per-vertical config (Gate 1 schema) and renders the verb-first,
 * inference-driven, bounded capture flow ON TOP of POST /events. No per-vertical
 * UI lives here — adding verbs/verticals is a config edit. This version implements
 * the full Resolution model: `primary` (zero-extra-tap default) and `branch`
 * (one mutually-exclusive choice screen). Depth dial = Field.tier (quick shown /
 * detail behind "Add detail"), uniform for everyone (no farmer mode — purged).
 *
 * Bounded by construction: verb -> (branch pick, only if present) -> capture.
 * Max 2-3 screens; inference auto-attaches the active cycle.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Eye, Droplet, Scissors, ShieldCheck, Sprout, Warehouse, Coins,
  Leaf, CalendarPlus, CalendarCheck,
  Egg, Bird, Stethoscope, Scale, Home, AlertTriangle, PlusCircle, Wheat,
  Skull, HandCoins, Syringe, Milk, Repeat, Wallet, Banknote, UserCheck,
  Camera, MapPin, User, Mic, Square, Users, X,
  ChevronLeft, Check, Loader2, Plus,
} from "lucide-react";
import cropsConfig from "./config/crops";
import { useFarmName } from "../utils/farmName";

const ICONS = {
  Eye, Droplet, Scissors, ShieldCheck, Sprout, Warehouse, Coins, Leaf, CalendarPlus, CalendarCheck,
  Egg, Bird, Stethoscope, Scale, Home, AlertTriangle, PlusCircle, Wheat,
  Skull, HandCoins, Syringe, Milk, Repeat, Wallet, Banknote, UserCheck,
};

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) };
}
const ALLOWED_UNITS = ["ML_PER_L", "G_PER_L", "L_PER_HA", "KG_PER_HA"];
function whdClearDate(days) {
  if (days == null) return "?";
  const d = new Date();
  d.setDate(d.getDate() + Number(days));
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}
function nowDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function nowTimeStr() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function prettyDate(ymd) {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Context spec = the "what am I logging against" source. Crops log against an active
// production CYCLE; poultry log against a FLOCK. A config supplies its own context
// (see animal-poultry.js); CROPS uses this default so crops.js needs no changes.
const DEFAULT_CONTEXT = {
  loader: "/api/v1/cycles?cycle_status=ACTIVE",
  extract: (body) => { let l = body?.data ?? body; if (l && !Array.isArray(l)) l = l.cycles || l.items || []; return l || []; },
  idKey: "cycle_id",
  optionLabel: (c) => `${c.production_name || c.cycle_id}${c.pu_farmer_label ? ` · ${c.pu_farmer_label}` : ""}`,
  shortLabel: (c) => c.production_name || c.cycle_id,
  contextLabel: "Crop",
  loadingMsg: "Loading your crops…",
  emptyMsg: "No active crop cycle yet — start a crop first.",
  pickPrompt: "Select crop…",
  buildAnchors: (c) => ({ farm_id: c.farm_id, pu_id: c.pu_id, cycle_id: c.cycle_id }),
  injectPayload: (c) => (c.production_id ? { production_id: c.production_id } : {}),
};

export default function CaptureEngine({ config = cropsConfig, onDone, preselect }) {
  const navigate = useNavigate();
  const ctx = config.context || DEFAULT_CONTEXT;
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [verb, setVerb] = useState(null);
  const [spec, setSpec] = useState(null);          // chosen EventSpec (primary or a branch option)
  const [itemId, setItemId] = useState("");
  const [values, setValues] = useState({});
  const [showDetail, setShowDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  // 48h correction window — edit the just-logged record (note / photo) on the success screen.
  const [editOpen, setEditOpen] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editPhoto, setEditPhoto] = useState(null);
  const [editPhotoUploading, setEditPhotoUploading] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editSaved, setEditSaved] = useState(false);
  const [chemicals, setChemicals] = useState([]);
  const [loadingChems, setLoadingChems] = useState(false);
  const [chemQuery, setChemQuery] = useState("");
  // Generic farm_libraries picker (feed/vaccine/etc → a required UUID FK).
  const [libraries, setLibraries] = useState({});   // { library_type: items[] }
  const [loadingLibs, setLoadingLibs] = useState(false);
  const [libQuery, setLibQuery] = useState("");
  // Universal Event Form: when + who + evidence (the bankability layer).
  const [operator, setOperator] = useState("");
  const [occurredDate, setOccurredDate] = useState(nowDateStr());
  const [occurredTime, setOccurredTime] = useState(nowTimeStr());
  const [photoUrl, setPhotoUrl] = useState(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [gps, setGps] = useState(null);            // {lat,lng}
  const [gpsStatus, setGpsStatus] = useState("");  // locating|captured|denied|unavailable
  const [voiceUrl, setVoiceUrl] = useState(null);
  const [voiceUploading, setVoiceUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  const [showWitness, setShowWitness] = useState(false);
  const [witnessName, setWitnessName] = useState("");
  const [witnessContact, setWitnessContact] = useState("");
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const preAppliedRef = useRef(false);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const body = await (await fetch("/api/v1/auth/me", { headers: authHeaders() })).json().catch(() => null);
        const d = body?.data ?? body ?? {};
        const name = d.full_name || d.name || d.display_name || d.username || d.email || "";
        if (!off && name) setOperator(name);
      } catch { /* operator label is cosmetic; never block capture */ }
    })();
    return () => { off = true; };
  }, []);

  useEffect(() => {
    let off = false;
    setLoadingItems(true);
    (async () => {
      try {
        const res = await fetch(ctx.loader, { headers: authHeaders() });
        const body = await res.json().catch(() => null);
        const list = ctx.extract(body) || [];
        if (!off) {
          setItems(list);
          if (list.length === 1) setItemId(list[0][ctx.idKey]);
        }
      } finally { if (!off) setLoadingItems(false); }
    })();
    return () => { off = true; };
  }, [ctx.loader]);

  // Deep-link preselect (e.g. a dashboard quick-action opens the (+) already aimed
  // at a verb and/or a specific flock). Applied exactly once; no preselect => the
  // normal verb-grid flow is untouched. `route` verbs are skipped — a deep-link
  // should never auto-navigate the user away from the sheet.
  useEffect(() => {
    if (preAppliedRef.current || !preselect) return;
    preAppliedRef.current = true;
    if (preselect.itemId) setItemId(preselect.itemId);
    if (preselect.verbId) {
      const v = (config.verbs || []).find((x) => x.id === preselect.verbId);
      if (v && !v.route) {
        setVerb(v); clearEntry();
        setSpec(v.resolve.primary ? v.resolve.primary : null);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselect]);

  const selectedItem = useMemo(
    () => items.find((c) => c[ctx.idKey] === itemId) || null, [items, itemId, ctx.idKey],
  );
  // Show the farmer's chosen farm name in the anchors card — never the internal farm_id code.
  const anchorFarmName = useFarmName(selectedItem?.farm_id);

  // Chemical picker: load shared.chemical_library only when a spec needs it (Inviolable #2 —
  // chemical_id is the WHD trigger anchor; the farmer must pick a real catalog row, never free-text).
  const needsChem = useMemo(() => !!spec?.capture?.some((f) => f.input === "chemical"), [spec]);
  useEffect(() => {
    if (!needsChem || !selectedItem?.production_id) { setChemicals([]); return; }
    let off = false;
    (async () => {
      setLoadingChems(true);
      try {
        const pid = encodeURIComponent(selectedItem.production_id);
        let body = await (await fetch(`/api/v1/chemicals?registered_for=${pid}`, { headers: authHeaders() })).json().catch(() => null);
        let list = body?.data ?? [];
        if (!Array.isArray(list) || list.length === 0) {           // fallback: no crop-registered rows -> full catalog
          body = await (await fetch(`/api/v1/chemicals`, { headers: authHeaders() })).json().catch(() => null);
          list = body?.data ?? [];
        }
        if (!off) setChemicals(Array.isArray(list) ? list : []);
      } finally { if (!off) setLoadingChems(false); }
    })();
    return () => { off = true; };
  }, [needsChem, selectedItem?.production_id]);

  // Generic library picker: load each farm_libraries type a spec needs (feed/vaccine FKs).
  const libTypes = useMemo(() => {
    const s = new Set();
    (spec?.capture || []).forEach((f) => { if (f.input === "library" && f.libraryType) s.add(f.libraryType); });
    return [...s];
  }, [spec]);
  useEffect(() => {
    if (!libTypes.length) { setLibraries({}); return; }
    let off = false;
    (async () => {
      setLoadingLibs(true);
      try {
        const out = {};
        for (const lt of libTypes) {
          const body = await (await fetch(`/api/v1/farm-libraries?library_type=${encodeURIComponent(lt)}`, { headers: authHeaders() })).json().catch(() => null);
          let list = body?.data ?? body ?? [];
          if (list && !Array.isArray(list)) list = list.items || [];
          out[lt] = list || [];
        }
        if (!off) setLibraries(out);
      } finally { if (!off) setLoadingLibs(false); }
    })();
    return () => { off = true; };
  }, [libTypes.join(",")]);

  // Clear the per-entry fields (values, evidence, notes, when) — keeps cycle + operator.
  function clearEntry() {
    setValues({}); setShowDetail(false); setError("");
    setPhotoUrl(null); setPhotoUploading(false); setGps(null); setGpsStatus("");
    setVoiceUrl(null); setVoiceUploading(false); setShowWitness(false);
    setWitnessName(""); setWitnessContact("");
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRef.current && recording) { try { mediaRef.current.stop(); } catch { /* noop */ } }
    setRecording(false); setRecSecs(0);
    setOccurredDate(nowDateStr()); setOccurredTime(nowTimeStr()); setChemQuery(""); setLibQuery("");
    setEditOpen(false); setEditSaved(false); setEditPhoto(null);
  }
  function pickVerb(v) {
    // "link" verbs hand off to an existing rich page (cycle/nursery/harvest)
    // instead of capturing inline — reuses proven, audit-emitting backends.
    if (v.route) { if (onDone) onDone(); navigate(v.route); return; }
    setVerb(v); clearEntry();
    if (v.resolve.primary) setSpec(v.resolve.primary);   // straight to capture
    else setSpec(null);                                   // branch: show choices
  }
  function reset() {
    setVerb(null); setSpec(null); setResult(null); clearEntry();
  }

  async function uploadPhoto(file) {
    if (!file) return;
    setPhotoUploading(true); setError("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const tok = localStorage.getItem("tfos_access_token");
      const res = await fetch("/api/v1/community/uploads", {
        method: "POST", headers: tok ? { Authorization: `Bearer ${tok}` } : {}, body: fd,
      });
      const body = await res.json().catch(() => null);
      const url = body?.data?.url || body?.url;
      if (url) setPhotoUrl(url); else setError("Photo upload failed — record still saves without it.");
    } catch (e) { setError(`Photo upload error: ${e.message}`); }
    finally { setPhotoUploading(false); }
  }
  function captureGps() {
    if (!navigator.geolocation) { setGpsStatus("unavailable"); return; }
    setGpsStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsStatus("captured"); },
      () => setGpsStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  async function uploadVoice(blob, mime) {
    setVoiceUploading(true);
    try {
      const ext = mime && mime.includes("mp4") ? "mp4" : mime && mime.includes("ogg") ? "ogg" : "webm";
      const fd = new FormData(); fd.append("file", blob, `voice.${ext}`);
      const tok = localStorage.getItem("tfos_access_token");
      const res = await fetch("/api/v1/community/uploads", {
        method: "POST", headers: tok ? { Authorization: `Bearer ${tok}` } : {}, body: fd,
      });
      const body = await res.json().catch(() => null);
      const url = body?.data?.url || body?.url;
      if (url) setVoiceUrl(url); else setError("Voice upload failed — record still saves without it.");
    } catch (e) { setError(`Voice upload error: ${e.message}`); }
    finally { setVoiceUploading(false); }
  }
  async function startRec() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("Voice recording not supported on this device."); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = (e) => { if (e.data?.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        if (blob.size) await uploadVoice(blob, mr.mimeType);
      };
      mediaRef.current = mr; mr.start();
      setRecording(true); setRecSecs(0); setError("");
      timerRef.current = setInterval(() => setRecSecs((s) => s + 1), 1000);
    } catch { setError("Microphone permission denied or unavailable."); }
  }
  function stopRec() {
    if (mediaRef.current && recording) { try { mediaRef.current.stop(); } catch { /* noop */ } }
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }
  const mmss = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  async function submit() {
    if (!spec || !selectedItem) return;
    if (spec.validate) { const msg = spec.validate(values); if (msg) { setError(msg); return; } }
    setSubmitting(true); setError("");
    // Submit adapter: some configs post to a different audit-emitting endpoint with a
    // different body shape (e.g. Money -> /cash-ledger). Default path = /events envelope.
    if (config.submit) {
      try {
        const ev = {};
        if (photoUrl) ev.photo_url = photoUrl;
        if (gps) { ev.gps_lat = gps.lat; ev.gps_lng = gps.lng; }
        if (voiceUrl) ev.voice_url = voiceUrl;
        if (witnessName.trim()) ev.witness_name = witnessName.trim();
        if (witnessContact.trim()) ev.witness_contact = witnessContact.trim();
        const body = config.submit.buildBody({ values, spec, item: selectedItem, occurredDate, occurredTime, evidence: ev });
        const res = await fetch(config.submit.endpoint, { method: config.submit.method || "POST", headers: authHeaders(), body: JSON.stringify(body) });
        const parsed = await res.json().catch(() => null);
        if ((res.status === 201 || res.ok) && parsed?.status !== "error") {
          setResult(config.submit.extractResult ? config.submit.extractResult(parsed) : { event_id: "", audit_hash: "" });
        } else {
          setError(parsed?.detail?.message || (typeof parsed?.detail === "string" ? parsed.detail : parsed?.error?.message)
            || `${res.status} ${res.statusText}`);
        }
      } catch (e) { setError(`Network error: ${e.message}`); }
      finally { setSubmitting(false); }
      return;
    }
    const payload = {};
    for (const f of spec.capture) {
      if (f.name === "notes") continue;       // notes captured by the universal section below
      const v = values[f.name];
      if (v !== undefined && v !== "" && v !== null) payload[f.name] = v;
    }
    // Context inference: inject anchor-derived payload keys (e.g. crop production_id)
    // so the farmer never re-types them (safe: schemas require them or allow extras).
    Object.assign(payload, ctx.injectPayload ? ctx.injectPayload(selectedItem) : {});
    // Auto-fill required date fields from the chosen date (e.g. sale_date, given_date)
    // so the farmer enters the date once.
    if (spec.autofillDate) for (const k of spec.autofillDate) if (payload[k] === undefined) payload[k] = occurredDate;
    if (values.notes) payload.notes = values.notes;
    // Evidence is cross-cutting envelope metadata (NOT payload) — photo + voice are
    // SHA-256 hashed server-side, GPS + witness stored; each lifts verification level.
    const evidence = {};
    if (photoUrl) evidence.photo_url = photoUrl;
    if (gps) { evidence.gps_lat = gps.lat; evidence.gps_lng = gps.lng; }
    if (voiceUrl) evidence.voice_url = voiceUrl;
    if (witnessName.trim()) evidence.witness_name = witnessName.trim();
    if (witnessContact.trim()) evidence.witness_contact = witnessContact.trim();
    const envelope = {
      event_type: spec.event_type,
      occurred_at: `${occurredDate}T${occurredTime || "12:00"}:00+12:00`,
      anchors: ctx.buildAnchors(selectedItem),
      payload,
      ...(Object.keys(evidence).length ? { evidence } : {}),
    };
    try {
      const res = await fetch("/api/v1/events", { method: "POST", headers: authHeaders(), body: JSON.stringify(envelope) });
      const parsed = await res.json().catch(() => null);
      if (res.status === 201 && parsed?.status === "success") {
        setResult({ event_id: parsed.data?.event_id || "", audit_hash: parsed.data?.audit_hash || "" });
      } else {
        setError(parsed?.error?.message || parsed?.detail?.message ||
          (typeof parsed?.detail === "string" ? parsed.detail : `${res.status} ${res.statusText}`));
      }
    } catch (e) { setError(`Network error: ${e.message}`); }
    finally { setSubmitting(false); }
  }

  // --- in-window correction of the just-logged field_events record ---
  const canEditResult = !!result?.event_id && String(result.event_id).startsWith("FE-");
  function openEdit() {
    setEditNotes(values.notes || ""); setEditPhoto(photoUrl); setEditSaved(false); setEditOpen(true);
  }
  async function uploadEditPhoto(file) {
    if (!file) return;
    setEditPhotoUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const tok = localStorage.getItem("tfos_access_token");
      const body = await (await fetch("/api/v1/community/uploads", { method: "POST", headers: tok ? { Authorization: `Bearer ${tok}` } : {}, body: fd })).json().catch(() => null);
      const url = body?.data?.url || body?.url;
      if (url) setEditPhoto(url);
    } finally { setEditPhotoUploading(false); }
  }
  async function saveEdit() {
    setEditBusy(true); setError("");
    try {
      const res = await fetch(`/api/v1/field-events/${encodeURIComponent(result.event_id)}`, {
        method: "PATCH", headers: authHeaders(),
        body: JSON.stringify({ notes: editNotes, photo_url: editPhoto }),
      });
      const parsed = await res.json().catch(() => null);
      if (res.ok && parsed?.status === "success") { setEditSaved(true); setEditOpen(false); }
      else setError(parsed?.detail?.message || (typeof parsed?.detail === "string" ? parsed.detail : `${res.status} ${res.statusText}`));
    } catch (e) { setError(`Network error: ${e.message}`); }
    finally { setEditBusy(false); }
  }

  const wrap = { maxWidth: 460, margin: "0 auto", padding: 16 };
  const tile = { display: "flex", alignItems: "center", gap: 14, width: "100%", padding: 18,
    borderRadius: 16, border: "1px solid #e5e1d8", background: "#fff", cursor: "pointer", textAlign: "left", marginBottom: 12 };
  const iconBox = { width: 44, height: 44, borderRadius: 12, background: "#f1efe8", display: "grid", placeItems: "center", flexShrink: 0 };
  const backBtn = { display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "#6b6b6b", cursor: "pointer", marginBottom: 12 };
  const card = { border: "1px solid #e6ded0", borderRadius: 14, padding: 14, marginBottom: 16, background: "#faf8f3" };
  const cardHead = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "#9a917c", marginBottom: 10 };
  const fieldLabel = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#5a5a4a" };
  const inputBox = { width: "100%", padding: 11, borderRadius: 10, border: "1px solid #d8d4c8", fontSize: 14 };
  const evBtn = (active) => ({ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    padding: "12px 6px", borderRadius: 12, border: active ? "2px solid #2e7d32" : "1px dashed #cfc7b5",
    background: active ? "#eaf3ea" : "#fff", cursor: "pointer", fontSize: 12 });

  // --- success ---
  if (result) return (
    <div style={wrap}>
      <div style={{ textAlign: "center", padding: "24px 0 8px" }}>
        <Check size={56} style={{ color: "#2e7d32" }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>{editSaved ? "Correction saved" : "Saved"}</h2>
        <p style={{ color: "#6b6b6b", fontSize: 13, marginTop: 6 }}>
          Recorded {result.event_id}{result.audit_hash ? ` · ${result.audit_hash.slice(0, 12)}…` : ""}</p>
      </div>

      {canEditResult && !editOpen && (
        <div style={{ ...card, textAlign: "center" }}>
          <p style={{ fontSize: 12.5, color: "#7a7363", marginBottom: 10 }}>Made a mistake? You can fix this for 48 hours — every change is logged.</p>
          <button onClick={openEdit} style={{ background: "none", border: "1px solid #d8d4c8", borderRadius: 12, padding: "10px 16px", fontWeight: 600, cursor: "pointer", color: "#3c5a3c" }}>Edit note / photo</button>
        </div>
      )}

      {canEditResult && editOpen && (
        <div style={card}>
          <div style={cardHead}>Correct this record</div>
          <label style={fieldLabel}>Note</label>
          <textarea value={editNotes} maxLength={500} rows={3} onChange={(e) => setEditNotes(e.target.value)} style={{ ...inputBox, resize: "vertical", marginBottom: 12 }} />
          <label style={fieldLabel}>Photo</label>
          {editPhoto ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <img src={editPhoto} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8 }} />
              <button onClick={() => setEditPhoto(null)} style={{ background: "none", border: "none", color: "#9a3b3b", cursor: "pointer", fontSize: 13 }}>Remove photo</button>
            </div>
          ) : (
            <label style={{ display: "inline-block", border: "1px dashed #cfc7b5", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 13, marginBottom: 12 }}>
              {editPhotoUploading ? "Uploading…" : "Add / change photo"}
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => uploadEditPhoto(e.target.files?.[0])} />
            </label>
          )}
          {error && <p style={{ color: "#9a3b3b", fontSize: 13, marginBottom: 10 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setEditOpen(false)} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #d8d4c8", background: "#fff", cursor: "pointer" }}>Cancel</button>
            <button onClick={saveEdit} disabled={editBusy || editPhotoUploading} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "#2e7d32", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{editBusy ? "Saving…" : "Save changes"}</button>
          </div>
        </div>
      )}

      <button onClick={reset} style={{ ...tile, justifyContent: "center", marginTop: 12 }}><Plus size={18} /> Log something else</button>
      {onDone && (
        <button onClick={onDone} style={{ ...tile, justifyContent: "center", marginTop: 0, background: "#2e7d32", color: "#fff", border: "none" }}>
          <Check size={18} /> Done
        </button>
      )}
    </div>
  );

  // --- verb grid ---
  if (!verb) return (
    <div style={wrap}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>What did you do?</h1>
      <p style={{ color: "#6b6b6b", fontSize: 13, marginBottom: 18 }}>Tap one.</p>
      {config.verbs.map((v) => { const I = ICONS[v.icon] || Eye; return (
        <button key={v.id} style={tile} onClick={() => pickVerb(v)}>
          <span style={iconBox}><I size={22} style={{ color: "#3c5a3c" }} /></span>
          <span><span style={{ display: "block", fontWeight: 700, fontSize: 16 }}>{v.label}</span>
            <span style={{ display: "block", color: "#8a8a8a", fontSize: 12.5 }}>{v.descriptor}</span></span>
        </button>); })}
    </div>
  );

  // --- branch choice (verb has no primary) ---
  if (!spec) return (
    <div style={wrap}>
      <button onClick={reset} style={backBtn}><ChevronLeft size={18} /> Back</button>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 12 }}>{verb.resolve.branch?.prompt || verb.label}</h1>
      {(verb.resolve.branch?.options || []).map((o) => (
        <button key={o.event_type} style={tile} onClick={() => { clearEntry(); setSpec(o); }}>
          <span style={{ fontWeight: 700, fontSize: 16 }}>{o.choiceLabel}</span>
        </button>
      ))}
    </div>
  );

  // --- capture ---  (notes handled by the universal Notes section, not as a config field)
  const quick = spec.capture.filter((f) => f.tier === "quick" && f.name !== "notes");
  const detail = spec.capture.filter((f) => f.tier === "detail" && f.name !== "notes");
  function setVal(n, v) { setValues((s) => ({ ...s, [n]: v })); }
  function pickChemical(name, c) {
    setValues((s) => {
      const next = { ...s, [name]: c.chemical_id };
      // Auto-fill the rate unit from the catalog default, but only if it's a valid enum value.
      if (c.default_unit && ALLOWED_UNITS.includes(c.default_unit) && spec.capture.some((f) => f.name === "unit")) {
        next.unit = c.default_unit;
      }
      return next;
    });
  }

  function fieldInput(f) {
    const v = values[f.name] ?? "";
    if (f.input === "multichoice") {
      const arr = Array.isArray(values[f.name]) ? values[f.name] : [];
      const toggle = (val) => setVal(f.name, arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
      return (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {f.options.map((o) => (
            <button key={o.value} onClick={() => toggle(o.value)}
              style={{ padding: "10px 14px", borderRadius: 12, fontSize: 14, fontWeight: 600,
                border: arr.includes(o.value) ? "2px solid #2e7d32" : "1px solid #d8d4c8",
                background: arr.includes(o.value) ? "#eaf3ea" : "#fff", cursor: "pointer" }}>{o.label}</button>
          ))}
        </div>
      );
    }
    if (f.input === "library") {
      const list = libraries[f.libraryType] || [];
      const filtered = libQuery ? list.filter((x) => (x.name || "").toLowerCase().includes(libQuery.toLowerCase())) : list;
      return (
        <div>
          {loadingLibs ? <p style={{ color: "#6b6b6b", fontSize: 13 }}>Loading…</p>
            : list.length === 0 ? <p style={{ color: "#9a3b3b", fontSize: 13 }}>None in your library yet — add one in Library settings first.</p>
            : (<>
              {list.length > 6 && (
                <input placeholder="Search…" value={libQuery} onChange={(e) => setLibQuery(e.target.value)}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d8d4c8", fontSize: 14, marginBottom: 8 }} />
              )}
              <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {filtered.map((x) => (
                  <button key={x.library_id} onClick={() => setVal(f.name, x.library_id)}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10,
                      border: v === x.library_id ? "2px solid #2e7d32" : "1px solid #d8d4c8",
                      background: v === x.library_id ? "#eaf3ea" : "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
                    {x.name}{x.is_global ? <span style={{ fontSize: 11, color: "#8a8a8a", fontWeight: 400 }}> · standard</span> : null}
                  </button>
                ))}
              </div>
            </>)}
        </div>
      );
    }
    if (f.input === "chemical") {
      const selected = chemicals.find((c) => c.chemical_id === v) || null;
      const filtered = chemQuery
        ? chemicals.filter((c) => (c.chem_name || "").toLowerCase().includes(chemQuery.toLowerCase()))
        : chemicals;
      return (
        <div>
          {loadingChems ? <p style={{ color: "#6b6b6b", fontSize: 13 }}>Loading chemicals…</p>
            : chemicals.length === 0 ? <p style={{ color: "#9a3b3b", fontSize: 13 }}>No chemicals in the library yet.</p>
            : (<>
              <input placeholder="Search chemical…" value={chemQuery} onChange={(e) => setChemQuery(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d8d4c8", fontSize: 14, marginBottom: 8 }} />
              <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {filtered.map((c) => (
                  <button key={c.chemical_id} onClick={() => pickChemical(f.name, c)}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10,
                      border: v === c.chemical_id ? "2px solid #2e7d32" : "1px solid #d8d4c8",
                      background: v === c.chemical_id ? "#eaf3ea" : "#fff", cursor: "pointer" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, display: "block" }}>{c.chem_name}</span>
                    <span style={{ fontSize: 12, color: "#8a8a8a" }}>
                      {c.active_ingredient ? `${c.active_ingredient} · ` : ""}WHD {c.withholding_period_days ?? "?"}d</span>
                  </button>
                ))}
              </div>
            </>)}
          {selected && (
            <div style={{ marginTop: 10, padding: "10px 12px", borderRadius: 10, background: "#fff7e6", border: "1px solid #f0d9a0", fontSize: 13, color: "#7a5b14" }}>
              ⚠ Harvest blocked {selected.withholding_period_days ?? "?"} days — clears {whdClearDate(selected.withholding_period_days)}
            </div>
          )}
        </div>
      );
    }
    if (f.input === "choice") return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {f.options.map((o) => (
          <button key={o.value} onClick={() => setVal(f.name, o.value)}
            style={{ padding: "12px 18px", borderRadius: 12, fontSize: 15, fontWeight: 600,
              border: v === o.value ? "2px solid #2e7d32" : "1px solid #d8d4c8",
              background: v === o.value ? "#eaf3ea" : "#fff", cursor: "pointer" }}>{o.label}</button>
        ))}
      </div>
    );
    if (f.input === "number") { const n = Number(v) || 0; return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => setVal(f.name, Math.max(0, n - 1))} style={{ width: 48, height: 48, borderRadius: 12, border: "1px solid #d8d4c8", background: "#fff", fontSize: 22, cursor: "pointer" }}>−</button>
        <input type="number" value={v} onChange={(e) => setVal(f.name, e.target.value)} inputMode="numeric"
          style={{ width: 90, textAlign: "center", padding: 12, borderRadius: 12, border: "1px solid #d8d4c8", fontSize: 18, fontWeight: 700 }} />
        <button onClick={() => setVal(f.name, n + 1)} style={{ width: 48, height: 48, borderRadius: 12, border: "1px solid #d8d4c8", background: "#fff", fontSize: 22, cursor: "pointer" }}>+</button>
      </div>
    ); }
    return <input value={v} onChange={(e) => setVal(f.name, e.target.value)}
      style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid #d8d4c8", fontSize: 15 }} />;
  }

  return (
    <div style={wrap}>
      <button onClick={reset} style={backBtn}><ChevronLeft size={18} /> Back</button>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>{spec.choiceLabel || verb.label}</h1>
      {loadingItems ? <p style={{ color: "#6b6b6b" }}>{ctx.loadingMsg}</p>
        : items.length === 0 ? <p style={{ color: "#9a3b3b" }}>{ctx.emptyMsg}</p>
        : (<>
          {/* Anchors — Farm · <context> · Operator (the 4-anchor identity on every record) */}
          <div style={card}>
            <div style={cardHead}>Anchors · farm · {ctx.contextLabel.toLowerCase()} · operator</div>
            <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", rowGap: 10, alignItems: "center", fontSize: 14 }}>
              <span style={{ color: "#9a917c" }}>Farm</span>
              <span style={{ fontWeight: 600 }}>{anchorFarmName || selectedItem?.farm_id || "—"}</span>
              <span style={{ color: "#9a917c" }}>{ctx.contextLabel}</span>
              {items.length === 1
                ? <span style={{ fontWeight: 600 }}>{ctx.optionLabel(selectedItem)}</span>
                : <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={inputBox}>
                    <option value="">{ctx.pickPrompt}</option>
                    {items.map((c) => <option key={c[ctx.idKey]} value={c[ctx.idKey]}>{ctx.optionLabel(c)}</option>)}
                  </select>}
              <span style={{ color: "#9a917c" }}>Operator</span>
              <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><User size={14} />{operator || "You"}</span>
            </div>
          </div>

          {/* When */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
            <div style={{ flex: 1 }}>
              <label style={fieldLabel}>Date</label>
              <input type="date" value={occurredDate} max={nowDateStr()} onChange={(e) => setOccurredDate(e.target.value)} style={inputBox} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={fieldLabel}>Time</label>
              <input type="time" value={occurredTime} onChange={(e) => setOccurredTime(e.target.value)} style={inputBox} />
            </div>
          </div>

          {/* Evidence — the four layers that actually persist + lift verification.
              Hidden when the config's backing table can't store it (e.g. cash-ledger). */}
          {config.evidence !== false && (
          <div style={card}>
            <div style={cardHead}>Evidence · lifts verification</div>
            <div style={{ display: "flex", gap: 8 }}>
              <label style={evBtn(!!photoUrl)}>
                <Camera size={20} style={{ color: photoUrl ? "#2e7d32" : "#9a917c" }} />
                <span style={{ fontWeight: 600 }}>{photoUploading ? "…" : photoUrl ? "Photo ✓" : "Photo"}</span>
                <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => uploadPhoto(e.target.files?.[0])} />
              </label>
              <button type="button" onClick={captureGps} style={evBtn(!!gps)}>
                <MapPin size={20} style={{ color: gps ? "#2e7d32" : "#9a917c" }} />
                <span style={{ fontWeight: 600 }}>{gps ? "GPS ✓" : gpsStatus === "locating" ? "…" : "GPS"}</span>
              </button>
              <button type="button" onClick={recording ? stopRec : startRec} style={evBtn(!!voiceUrl || recording)}>
                {recording ? <Square size={20} style={{ color: "#9a3b3b" }} /> : <Mic size={20} style={{ color: voiceUrl ? "#2e7d32" : "#9a917c" }} />}
                <span style={{ fontWeight: 600 }}>{recording ? `Stop ${mmss(recSecs)}` : voiceUploading ? "…" : voiceUrl ? "Voice ✓" : "Voice"}</span>
              </button>
              <button type="button" onClick={() => setShowWitness((s) => !s)} style={evBtn(!!witnessName.trim())}>
                <Users size={20} style={{ color: witnessName.trim() ? "#2e7d32" : "#9a917c" }} />
                <span style={{ fontWeight: 600 }}>{witnessName.trim() ? "Witness ✓" : "Witness"}</span>
              </button>
            </div>
            {voiceUrl && !recording && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <audio src={voiceUrl} controls style={{ height: 32, flex: 1 }} />
                <button type="button" onClick={() => setVoiceUrl(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9a3b3b" }}><X size={16} /></button>
              </div>
            )}
            {showWitness && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                <input value={witnessName} maxLength={120} placeholder="Witness name" onChange={(e) => setWitnessName(e.target.value)} style={inputBox} />
                <input value={witnessContact} maxLength={120} placeholder="Witness phone / contact (optional)" onChange={(e) => setWitnessContact(e.target.value)} style={inputBox} />
              </div>
            )}
            {gpsStatus === "denied" && <p style={{ fontSize: 11.5, color: "#9a3b3b", marginTop: 8 }}>Location permission denied.</p>}
            {gpsStatus === "unavailable" && <p style={{ fontSize: 11.5, color: "#9a3b3b", marginTop: 8 }}>Location not available on this device.</p>}
            <p style={{ fontSize: 11, color: "#9a917c", marginTop: 8, fontStyle: "italic" }}>
              Photo &amp; voice are fingerprinted (SHA-256); GPS &amp; witness are stored — banks and insurers see this when they verify the record.</p>
          </div>
          )}

          {/* Event-specific fields */}
          {quick.map((f) => <div key={f.name} style={{ marginBottom: 18 }}>
            <label style={fieldLabel}>{f.ask}</label>{fieldInput(f)}</div>)}
          {detail.length > 0 && !showDetail && <button onClick={() => setShowDetail(true)} style={{ background: "none", border: "none", color: "#3c5a3c", fontWeight: 600, cursor: "pointer", marginBottom: 16 }}>+ Add detail</button>}
          {showDetail && detail.map((f) => <div key={f.name} style={{ marginBottom: 18 }}>
            <label style={fieldLabel}>{f.ask}</label>{fieldInput(f)}</div>)}

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>Notes (optional)</label>
            <textarea value={values.notes || ""} maxLength={500} rows={3} placeholder="Add any context…"
              onChange={(e) => setVal("notes", e.target.value)} style={{ ...inputBox, resize: "vertical" }} />
          </div>

          {/* About to record — the audit preview */}
          <div style={{ border: "1px solid #cfe0cf", background: "#f0f6f0", borderRadius: 12, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, color: "#3c5a3c" }}>
            <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={14} /> About to record</div>
            {spec.event_type} · {selectedItem ? ctx.shortLabel(selectedItem) : "—"} · {prettyDate(occurredDate)} {occurredTime} · {operator || "You"}
            {(() => { const e = [photoUrl && "photo", gps && "GPS", voiceUrl && "voice", witnessName.trim() && "witness"].filter(Boolean); return e.length ? ` · +${e.join(" +")}` : ""; })()}
          </div>

          {error && <p style={{ color: "#9a3b3b", fontSize: 13, marginBottom: 12 }}>{error}</p>}
          {(photoUploading || voiceUploading || recording) && (
            <p style={{ fontSize: 12, color: "#9a917c", marginBottom: 8, textAlign: "center" }}>
              {recording ? "Stop the recording to save." : "Finishing upload…"}</p>
          )}
          <button onClick={submit} disabled={submitting || !selectedItem || photoUploading || voiceUploading || recording}
            style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", fontSize: 16, fontWeight: 700, color: "#fff",
              background: (!selectedItem || photoUploading || voiceUploading || recording) ? "#b8b8b8" : "#2e7d32",
              cursor: submitting || !selectedItem ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {submitting ? <Loader2 size={18} /> : <Check size={18} />}{submitting ? "Saving…" : "Save"}</button>
        </>)}
    </div>
  );
}
