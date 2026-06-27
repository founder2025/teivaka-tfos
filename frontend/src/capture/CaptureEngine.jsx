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
import { isNative, nativeTakePhoto, nativeGetPosition } from "../native/bridge";
import { submitCapture, ensureCaptureSync } from "./submitCapture";
import { newIdem } from "./offlineQueue";
import { recordCapture, lastValues } from "./captureMemory";
import { cachedJSON } from "./referenceCache";

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
const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
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
  optionLabel: (c) => `${c.production_name || "Crop run"}${c.pu_farmer_label ? ` · ${c.pu_farmer_label}` : ""}`,
  shortLabel: (c) => c.production_name || "Crop run",
  contextLabel: "Crop",
  loadingMsg: "Loading your crops…",
  emptyMsg: "No active crop cycle yet — start a crop first.",
  pickPrompt: "Select crop…",
  buildAnchors: (c) => ({ farm_id: c.farm_id, pu_id: c.pu_id, cycle_id: c.cycle_id }),
  injectPayload: (c) => (c.production_id ? { production_id: c.production_id } : {}),
};

// Resolve the EventSpec for an event_type across a config's verbs (primary or a branch
// option) so a catalog card can jump straight to its form. Returns {verb, spec} or null.
function findSpecByEventType(config, et) {
  for (const v of config.verbs || []) {
    if (v.route) continue;
    const p = v.resolve?.primary;
    if (p && p.event_type === et) return { verb: v, spec: p };
    const opt = (v.resolve?.branch?.options || []).find((o) => o.event_type === et);
    if (opt) return { verb: v, spec: opt };
  }
  return null;
}

export default function CaptureEngine({ config = cropsConfig, onDone, onBack, preselect }) {
  const navigate = useNavigate();
  const ctx = config.context || DEFAULT_CONTEXT;
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [itemsError, setItemsError] = useState(false);   // FAB2: a failed load is NOT "no crops"
  const [reloadKey, setReloadKey] = useState(0);          // retry the loader
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
  const [photoFile, setPhotoFile] = useState(null);   // kept offline so the photo survives to flush
  const [photoUploading, setPhotoUploading] = useState(false);
  const [gps, setGps] = useState(null);            // {lat,lng}
  const [gpsStatus, setGpsStatus] = useState("");  // locating|captured|denied|unavailable
  const [voiceUrl, setVoiceUrl] = useState(null);
  const [voiceBlob, setVoiceBlob] = useState(null);   // kept offline so the voice note survives to flush
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
  const idemRef = useRef(null);   // idempotency key for the entry being captured (FAB12)
  const prefillRef = useRef(null);

  // Drain any captures queued offline in a previous session + wire the reconnect flush.
  useEffect(() => { ensureCaptureSync(); }, []);

  // Pre-fill routine scalar fields (e.g. last feed quantity) from on-device memory the moment a
  // spec is chosen — cuts typing for the daily repeats. Never overwrites what the farmer typed,
  // never touches FK pickers / notes. Runs once per spec selection.
  useEffect(() => {
    if (!spec || prefillRef.current === spec) return;
    prefillRef.current = spec;
    const lv = lastValues(spec.event_type);
    if (!lv || !Object.keys(lv).length) return;
    const allowed = new Set((spec.capture || [])
      .filter((f) => ["number", "text", "choice"].includes(f.input || "text"))
      .map((f) => f.name));
    const seed = {};
    for (const [k, v] of Object.entries(lv)) if (allowed.has(k)) seed[k] = v;
    if (Object.keys(seed).length) setValues((s) => ({ ...seed, ...s }));
  }, [spec]);

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
    setLoadingItems(true); setItemsError(false);
    (async () => {
      try {
        const body = await cachedJSON(`items:${ctx.loader}`, ctx.loader, authHeaders());  // offline → last cached anchors
        const list = ctx.extract(body) || [];
        if (!off) {
          setItems(list);
          if (list.length === 1) setItemId(list[0][ctx.idKey]);
        }
      } catch { if (!off) setItemsError(true); }   // FAB2: distinguish a load failure from genuinely-empty
      finally { if (!off) setLoadingItems(false); }
    })();
    return () => { off = true; };
  }, [ctx.loader, reloadKey]);

  // Deep-link preselect: the catalog (+) opens the engine already aimed at a specific
  // event_type (jump straight to its form, skipping verb + branch), and/or a specific
  // verb, and/or a pre-anchored item (flock). Applied exactly once; no preselect => the
  // normal verb-grid flow is untouched. `route` verbs are skipped — a deep-link should
  // never auto-navigate the user away from the sheet.
  useEffect(() => {
    if (preAppliedRef.current || !preselect) return;
    preAppliedRef.current = true;
    if (preselect.itemId) setItemId(preselect.itemId);
    if (preselect.eventType) {
      const hit = findSpecByEventType(config, preselect.eventType);
      if (hit) { setVerb(hit.verb); clearEntry(); setSpec(hit.spec); return; }
    }
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
        let body = await cachedJSON(`chem:${selectedItem.production_id}`, `/api/v1/chemicals?registered_for=${pid}`, authHeaders()).catch(() => null);
        let list = body?.data ?? [];
        if (!Array.isArray(list) || list.length === 0) {           // fallback: no crop-registered rows -> full catalog
          body = await cachedJSON("chem:all", `/api/v1/chemicals`, authHeaders()).catch(() => null);
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
          const body = await cachedJSON(`lib:${lt}`, `/api/v1/farm-libraries?library_type=${encodeURIComponent(lt)}`, authHeaders()).catch(() => null);
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
    setPhotoUrl(null); setPhotoFile(null); setPhotoUploading(false); setGps(null); setGpsStatus("");
    setVoiceUrl(null); setVoiceBlob(null); setVoiceUploading(false); setShowWitness(false);
    setWitnessName(""); setWitnessContact("");
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (mediaRef.current && recording) { try { mediaRef.current.stop(); } catch { /* noop */ } }
    setRecording(false); setRecSecs(0);
    setOccurredDate(nowDateStr()); setOccurredTime(nowTimeStr()); setChemQuery(""); setLibQuery("");
    setEditOpen(false); setEditSaved(false); setEditPhoto(null);
    idemRef.current = null;   // fresh idempotency key per entry
    prefillRef.current = null;
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
  // When the engine was opened from the catalog (onBack provided), "Back" and "Log
  // something else" return to the catalog rather than the in-engine verb grid.
  const goBack = onBack || reset;

  async function uploadPhoto(file) {
    if (!file) return;
    setPhotoFile(file);                 // keep it regardless — offline-durable; submit/flush uploads it
    if (isOffline()) return;            // no signal: hold the file, upload at flush (no error)
    setPhotoUploading(true); setError("");
    try {
      const fd = new FormData(); fd.append("file", file);
      const tok = localStorage.getItem("tfos_access_token");
      const res = await fetch("/api/v1/community/uploads", {
        method: "POST", headers: tok ? { Authorization: `Bearer ${tok}` } : {}, body: fd,
      });
      const body = await res.json().catch(() => null);
      const url = body?.data?.url || body?.url;
      if (url) setPhotoUrl(url);        // else: keep the file; submit will retry/queue it
    } catch { /* network: keep the file silently — it rides the queue */ }
    finally { setPhotoUploading(false); }
  }
  // Native shell: take the photo with the device camera plugin (better UX +
  // store-review compliance) then reuse the existing upload path. Web keeps the
  // <input type=file capture> path below.
  async function takePhotoNative() {
    const file = await nativeTakePhoto();
    if (file) uploadPhoto(file);
  }
  async function captureGps() {
    if (isNative()) {
      setGpsStatus("locating");
      const p = await nativeGetPosition();
      if (p) { setGps(p); setGpsStatus("captured"); }
      else setGpsStatus("denied");
      return;
    }
    if (!navigator.geolocation) { setGpsStatus("unavailable"); return; }
    setGpsStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => { setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setGpsStatus("captured"); },
      () => setGpsStatus("denied"),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }
  async function uploadVoice(blob, mime) {
    setVoiceBlob(blob);                 // keep it regardless — offline-durable
    if (isOffline()) return;
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
      if (url) setVoiceUrl(url);        // else: keep the blob; submit will retry/queue it
    } catch { /* network: keep the blob silently */ }
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
    if (!idemRef.current) idemRef.current = newIdem();   // stable across retries of THIS entry (FAB12)

    // Evidence is cross-cutting envelope metadata — photo + voice are SHA-256 hashed server-side,
    // GPS + witness stored; each lifts verification level.
    const ev = {};
    if (photoUrl) ev.photo_url = photoUrl;
    if (gps) { ev.gps_lat = gps.lat; ev.gps_lng = gps.lng; }
    if (voiceUrl) ev.voice_url = voiceUrl;
    if (witnessName.trim()) ev.witness_name = witnessName.trim();
    if (witnessContact.trim()) ev.witness_contact = witnessContact.trim();

    try {
      if (config.submit) {
        // Submit adapter: some configs post to a different audit-emitting endpoint with a
        // different body shape (e.g. Money -> /cash-ledger).
        const body = config.submit.buildBody({ values, spec, item: selectedItem, occurredDate, occurredTime, evidence: ev });
        const r = await submitCapture({ endpoint: config.submit.endpoint, method: config.submit.method || "POST", body, idem: idemRef.current });
        if (r.queued) setResult({ queued: true });
        else setResult(config.submit.extractResult ? config.submit.extractResult(r.data) : { event_id: "", audit_hash: "" });
      } else {
        const payload = {};
        for (const f of spec.capture) {
          if (f.name === "notes") continue;       // notes captured by the universal section below
          const v = values[f.name];
          if (v !== undefined && v !== "" && v !== null) payload[f.name] = v;
        }
        // Context inference: inject anchor-derived keys (e.g. crop production_id) so the farmer
        // never re-types them. Auto-fill required date fields from the chosen date.
        Object.assign(payload, ctx.injectPayload ? ctx.injectPayload(selectedItem) : {});
        if (spec.autofillDate) for (const k of spec.autofillDate) if (payload[k] === undefined) payload[k] = occurredDate;
        if (values.notes) payload.notes = values.notes;
        const envelope = {
          event_type: spec.event_type,
          occurred_at: `${occurredDate}T${occurredTime || "12:00"}:00+12:00`,
          anchors: ctx.buildAnchors(selectedItem),
          payload,
          ...(Object.keys(ev).length ? { evidence: ev } : {}),
        };
        // Pass any evidence not yet uploaded (offline / mid-upload) so it's stashed + sent on flush.
        const r = await submitCapture({
          endpoint: "/api/v1/events", body: envelope, idem: idemRef.current,
          evidenceFiles: { photo_url: photoUrl ? null : photoFile, voice_url: voiceUrl ? null : voiceBlob },
        });
        if (r.queued) setResult({ queued: true });
        else setResult({ event_id: r.data?.data?.event_id || "", audit_hash: r.data?.data?.audit_hash || "" });
      }
      // Learn this farmer's routine (frequency + last values) for Quick-log + pre-fill. On-device.
      recordCapture({ eventType: spec.event_type, values });
    } catch (e) {
      // submitCapture only throws on a genuine server/validation rejection (network errors queue).
      setError(e?.userMessage || e?.message || "Couldn't save — please try again.");
    } finally { setSubmitting(false); }
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
    borderRadius: 16, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer", textAlign: "left", marginBottom: 12 };
  const iconBox = { width: 44, height: 44, borderRadius: 12, background: "var(--cream-2)", display: "grid", placeItems: "center", flexShrink: 0 };
  const backBtn = { display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--muted)", cursor: "pointer", marginBottom: 12 };
  const card = { border: "1px solid var(--line)", borderRadius: 14, padding: 14, marginBottom: 16, background: "var(--cream-2)" };
  const cardHead = { fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--muted)", marginBottom: 10 };
  const fieldLabel = { display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "var(--soil)" };
  const inputBox = { width: "100%", padding: 11, borderRadius: 10, border: "1px solid var(--line)", fontSize: 14 };
  const evBtn = (active) => ({ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    padding: "12px 6px", borderRadius: 12, border: active ? "2px solid var(--green)" : "1px dashed var(--line)",
    background: active ? "#eaf3ea" : "#fff", cursor: "pointer", fontSize: 12 });

  // --- success ---
  if (result) return (
    <div style={wrap}>
      <div style={{ textAlign: "center", padding: "24px 0 8px" }}>
        <Check size={56} style={{ color: "var(--green)" }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>{editSaved ? "Correction saved" : "Saved"}</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 6 }}>
          {result.queued
            ? "Saved on your device — it will sync automatically when you're back online."
            : <>Recorded {result.event_id}{result.audit_hash ? ` · ${result.audit_hash.slice(0, 12)}…` : ""}</>}</p>
      </div>

      {canEditResult && !editOpen && (
        <div style={{ ...card, textAlign: "center" }}>
          <p style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 10 }}>Made a mistake? You can fix this for 48 hours — every change is logged.</p>
          <button onClick={openEdit} style={{ background: "none", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 16px", fontWeight: 600, cursor: "pointer", color: "var(--green-dk)" }}>Edit note / photo</button>
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
            <label style={{ display: "inline-block", border: "1px dashed var(--line)", borderRadius: 10, padding: "8px 12px", cursor: "pointer", fontSize: 13, marginBottom: 12 }}>
              {editPhotoUploading ? "Uploading…" : "Add / change photo"}
              <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => uploadEditPhoto(e.target.files?.[0])} />
            </label>
          )}
          {error && <p style={{ color: "#9a3b3b", fontSize: 13, marginBottom: 10 }}>{error}</p>}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setEditOpen(false)} style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid var(--line)", background: "var(--paper)", cursor: "pointer" }}>Cancel</button>
            <button onClick={saveEdit} disabled={editBusy || editPhotoUploading} style={{ flex: 1, padding: 12, borderRadius: 12, border: "none", background: "var(--green)", color: "#fff", fontWeight: 700, cursor: "pointer" }}>{editBusy ? "Saving…" : "Save changes"}</button>
          </div>
        </div>
      )}

      <button onClick={goBack} style={{ ...tile, justifyContent: "center", marginTop: 12 }}><Plus size={18} /> Log something else</button>
      {onDone && (
        <button onClick={onDone} style={{ ...tile, justifyContent: "center", marginTop: 0, background: "var(--green)", color: "#fff", border: "none" }}>
          <Check size={18} /> Done
        </button>
      )}
    </div>
  );

  // --- verb grid ---
  if (!verb) return (
    <div style={wrap}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>What did you do?</h1>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 18 }}>Tap one.</p>
      {config.verbs.map((v) => { const I = ICONS[v.icon] || Eye; return (
        <button key={v.id} style={tile} onClick={() => pickVerb(v)}>
          <span style={iconBox}><I size={22} style={{ color: "var(--green-dk)" }} /></span>
          <span><span style={{ display: "block", fontWeight: 700, fontSize: 16 }}>{v.label}</span>
            <span style={{ display: "block", color: "var(--muted)", fontSize: 12.5 }}>{v.descriptor}</span></span>
        </button>); })}
    </div>
  );

  // --- branch choice (verb has no primary) ---
  if (!spec) return (
    <div style={wrap}>
      <button onClick={goBack} style={backBtn}><ChevronLeft size={18} /> Back</button>
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
            <button key={o.value} onClick={() => toggle(o.value)} aria-pressed={arr.includes(o.value)}
              style={{ padding: "10px 14px", borderRadius: 12, fontSize: 14, fontWeight: 600,
                border: arr.includes(o.value) ? "2px solid var(--green)" : "1px solid var(--line)",
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
          {loadingLibs ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading…</p>
            : list.length === 0 ? <p style={{ color: "#9a3b3b", fontSize: 13 }}>None in your library yet — add one in Library settings first.</p>
            : (<>
              {list.length > 6 && (
                <input placeholder="Search…" value={libQuery} onChange={(e) => setLibQuery(e.target.value)}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, marginBottom: 8 }} />
              )}
              <div style={{ maxHeight: 220, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {filtered.map((x) => (
                  <button key={x.library_id} onClick={() => setVal(f.name, x.library_id)}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10,
                      border: v === x.library_id ? "2px solid var(--green)" : "1px solid var(--line)",
                      background: v === x.library_id ? "#eaf3ea" : "#fff", cursor: "pointer", fontWeight: 600, fontSize: 14 }}>
                    {x.name}{x.is_global ? <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 400 }}> · standard</span> : null}
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
          {loadingChems ? <p style={{ color: "var(--muted)", fontSize: 13 }}>Loading chemicals…</p>
            : chemicals.length === 0 ? <p style={{ color: "#9a3b3b", fontSize: 13 }}>No chemicals in the library yet.</p>
            : (<>
              <input placeholder="Search chemical…" value={chemQuery} onChange={(e) => setChemQuery(e.target.value)}
                style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid var(--line)", fontSize: 14, marginBottom: 8 }} />
              <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {filtered.map((c) => (
                  <button key={c.chemical_id} onClick={() => pickChemical(f.name, c)}
                    style={{ textAlign: "left", padding: "10px 12px", borderRadius: 10,
                      border: v === c.chemical_id ? "2px solid var(--green)" : "1px solid var(--line)",
                      background: v === c.chemical_id ? "#eaf3ea" : "#fff", cursor: "pointer" }}>
                    <span style={{ fontWeight: 600, fontSize: 14, display: "block" }}>{c.chem_name}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>
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
          <button key={o.value} onClick={() => setVal(f.name, o.value)} aria-pressed={v === o.value}
            style={{ padding: "12px 18px", borderRadius: 12, fontSize: 15, fontWeight: 600,
              border: v === o.value ? "2px solid var(--green)" : "1px solid var(--line)",
              background: v === o.value ? "#eaf3ea" : "#fff", cursor: "pointer" }}>{o.label}</button>
        ))}
      </div>
    );
    if (f.input === "number") { const n = Number(v) || 0; return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => setVal(f.name, Math.max(0, n - 1))} aria-label={`Decrease ${f.ask}`} style={{ width: 48, height: 48, borderRadius: 12, border: "1px solid var(--line)", background: "var(--paper)", fontSize: 22, cursor: "pointer" }}>−</button>
        <input type="number" value={v} onChange={(e) => setVal(f.name, e.target.value)} inputMode="numeric" aria-label={f.ask}
          style={{ width: 90, textAlign: "center", padding: 12, borderRadius: 12, border: "1px solid var(--line)", fontSize: 18, fontWeight: 700 }} />
        <button onClick={() => setVal(f.name, n + 1)} aria-label={`Increase ${f.ask}`} style={{ width: 48, height: 48, borderRadius: 12, border: "1px solid var(--line)", background: "var(--paper)", fontSize: 22, cursor: "pointer" }}>+</button>
      </div>
    ); }
    return <input value={v} onChange={(e) => setVal(f.name, e.target.value)}
      style={{ width: "100%", padding: 12, borderRadius: 12, border: "1px solid var(--line)", fontSize: 15 }} />;
  }

  return (
    <div style={wrap}>
      <button onClick={goBack} style={backBtn}><ChevronLeft size={18} /> Back</button>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 14 }}>{spec.choiceLabel || verb.label}</h1>
      {loadingItems ? <p style={{ color: "var(--muted)" }}>{ctx.loadingMsg}</p>
        : itemsError ? (
          <div style={card}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <AlertTriangle size={18} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontWeight: 700, color: "var(--soil)" }}>Couldn't load — this is a connection problem, not missing data.</div>
                <button onClick={() => setReloadKey((k) => k + 1)} style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 14px", fontWeight: 600, cursor: "pointer", color: "var(--green-dk)" }}>
                  <Loader2 size={14} /> Retry
                </button>
              </div>
            </div>
          </div>
        )
        : items.length === 0 ? <p style={{ color: "#9a3b3b" }}>{ctx.emptyMsg}</p>
        : (<>
          {/* Anchors — Farm · <context> · Operator (the 4-anchor identity on every record) */}
          <div style={card}>
            <div style={cardHead}>Anchors · farm · {ctx.contextLabel.toLowerCase()} · operator</div>
            <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", rowGap: 10, alignItems: "center", fontSize: 14 }}>
              <span style={{ color: "var(--muted)" }}>Farm</span>
              <span style={{ fontWeight: 600 }}>{anchorFarmName || selectedItem?.farm_id || "—"}</span>
              <span style={{ color: "var(--muted)" }}>{ctx.contextLabel}</span>
              {items.length === 1
                ? <span style={{ fontWeight: 600 }}>{ctx.optionLabel(selectedItem)}</span>
                : <select value={itemId} onChange={(e) => setItemId(e.target.value)} style={inputBox}>
                    <option value="">{ctx.pickPrompt}</option>
                    {items.map((c) => <option key={c[ctx.idKey]} value={c[ctx.idKey]}>{ctx.optionLabel(c)}</option>)}
                  </select>}
              <span style={{ color: "var(--muted)" }}>Operator</span>
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
              {isNative() ? (
                <button type="button" onClick={takePhotoNative} style={evBtn(!!(photoUrl || photoFile))}>
                  <Camera size={20} style={{ color: (photoUrl || photoFile) ? "var(--green)" : "var(--muted)" }} />
                  <span style={{ fontWeight: 600 }}>{photoUploading ? "…" : (photoUrl || photoFile) ? "Photo ✓" : "Photo"}</span>
                </button>
              ) : (
                <label style={evBtn(!!(photoUrl || photoFile))}>
                  <Camera size={20} style={{ color: (photoUrl || photoFile) ? "var(--green)" : "var(--muted)" }} />
                  <span style={{ fontWeight: 600 }}>{photoUploading ? "…" : (photoUrl || photoFile) ? "Photo ✓" : "Photo"}</span>
                  <input type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={(e) => uploadPhoto(e.target.files?.[0])} />
                </label>
              )}
              <button type="button" onClick={captureGps} style={evBtn(!!gps)}>
                <MapPin size={20} style={{ color: gps ? "var(--green)" : "var(--muted)" }} />
                <span style={{ fontWeight: 600 }}>{gps ? "GPS ✓" : gpsStatus === "locating" ? "…" : "GPS"}</span>
              </button>
              <button type="button" onClick={recording ? stopRec : startRec} style={evBtn(!!(voiceUrl || voiceBlob) || recording)}>
                {recording ? <Square size={20} style={{ color: "#9a3b3b" }} /> : <Mic size={20} style={{ color: (voiceUrl || voiceBlob) ? "var(--green)" : "var(--muted)" }} />}
                <span style={{ fontWeight: 600 }}>{recording ? `Stop ${mmss(recSecs)}` : voiceUploading ? "…" : (voiceUrl || voiceBlob) ? "Voice ✓" : "Voice"}</span>
              </button>
              <button type="button" onClick={() => setShowWitness((s) => !s)} style={evBtn(!!witnessName.trim())}>
                <Users size={20} style={{ color: witnessName.trim() ? "var(--green)" : "var(--muted)" }} />
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
            <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, fontStyle: "italic" }}>
              Photo &amp; voice are fingerprinted (SHA-256); GPS &amp; witness are stored — banks and insurers see this when they verify the record.</p>
          </div>
          )}

          {/* Event-specific fields */}
          {quick.map((f) => <div key={f.name} style={{ marginBottom: 18 }}>
            <label style={fieldLabel}>{f.ask}</label>{fieldInput(f)}</div>)}
          {detail.length > 0 && !showDetail && <button onClick={() => setShowDetail(true)} style={{ background: "none", border: "none", color: "var(--green-dk)", fontWeight: 600, cursor: "pointer", marginBottom: 16 }}>+ Add detail</button>}
          {showDetail && detail.map((f) => <div key={f.name} style={{ marginBottom: 18 }}>
            <label style={fieldLabel}>{f.ask}</label>{fieldInput(f)}</div>)}

          {/* Notes */}
          <div style={{ marginBottom: 16 }}>
            <label style={fieldLabel}>Notes (optional)</label>
            <textarea value={values.notes || ""} maxLength={500} rows={3} placeholder="Add any context…"
              onChange={(e) => setVal("notes", e.target.value)} style={{ ...inputBox, resize: "vertical" }} />
          </div>

          {/* About to record — the audit preview */}
          <div style={{ border: "1px solid #cfe0cf", background: "#f0f6f0", borderRadius: 12, padding: "10px 12px", marginBottom: 14, fontSize: 12.5, color: "var(--green-dk)" }}>
            <div style={{ fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}><ShieldCheck size={14} /> About to record</div>
            {spec.event_type} · {selectedItem ? ctx.shortLabel(selectedItem) : "—"} · {prettyDate(occurredDate)} {occurredTime} · {operator || "You"}
            {(() => { const e = [photoUrl && "photo", gps && "GPS", voiceUrl && "voice", witnessName.trim() && "witness"].filter(Boolean); return e.length ? ` · +${e.join(" +")}` : ""; })()}
          </div>

          {error && <p style={{ color: "#9a3b3b", fontSize: 13, marginBottom: 12 }}>{error}</p>}
          {recording && (
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, textAlign: "center" }}>Stop the recording to save.</p>
          )}
          {(photoUploading || voiceUploading) && !recording && (
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8, textAlign: "center" }}>Photo/voice still uploading — you can save now; it attaches automatically.</p>
          )}
          <button onClick={submit} disabled={submitting || !selectedItem || recording}
            style={{ width: "100%", padding: 16, borderRadius: 14, border: "none", fontSize: 16, fontWeight: 700, color: "#fff",
              background: (!selectedItem || recording) ? "#b8b8b8" : "var(--green)",
              cursor: submitting || !selectedItem || recording ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            {submitting ? <Loader2 size={18} /> : <Check size={18} />}{submitting ? "Saving…" : "Save"}</button>
        </>)}
    </div>
  );
}
