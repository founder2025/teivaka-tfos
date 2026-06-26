/**
 * FieldEventNew.jsx — /farm/field-events
 *
 * The field-activity LOG + the 48h correction modal. Logging itself is the (+)
 * Capture Engine (Evidence v2: photo/GPS/voice) — this page no longer carries its
 * own form. Bare route → the log; any ?type/?new deep link opens the Capture Engine
 * (verb preselected) and lands back on the log.
 *
 * (2026-06-26 consolidation: the three legacy in-page forms were retired and their
 * ~700 lines removed — they captured no evidence and duplicated the Capture Engine.)
 *
 * Real data: GET /field-events (list, via utils/api), PATCH /field-events/{id}
 * (48h correction, mirrors edit_window.py — created_at), GET /chemicals (WHD).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Plus, ListChecks, Lock, Sparkles, AlertTriangle, X } from "lucide-react";
import { useFormModal } from "../../context/FormModalContext";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import { getJSON } from "../../utils/api";
import { getCurrentUser } from "../../utils/auth";

const C = {
  soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", red: "var(--red)",
  cream: "var(--cream)", border: "var(--line)", muted: "var(--muted)",
};
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, refetchOnReconnect: true, staleTime: 60_000 } },
});

// ── helpers ───────────────────────────────────────────────────────────
function feAuthHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const FE_HUMAN = {
  PLANTING: "Planting", TRANSPLANT: "Transplant", TRANSPLANT_LOGGED: "Transplant",
  FERTILIZE: "Fertilize", FERTILIZER_APPLIED: "Fertilize", IRRIGATE: "Irrigate",
  IRRIGATION: "Irrigate", SPRAY: "Spray", CHEMICAL_APPLIED: "Spray", PRUNE: "Prune",
  PRUNING_TRAINING: "Prune/train", PEST_OBSERVE: "Pest sighting", DISEASE_OBSERVE: "Disease sighting",
  HARVEST_PARTIAL: "Partial harvest", HARVEST_FINAL: "Final harvest", INSPECTION: "Inspection",
  SOIL_TEST: "Soil test", PHOTO: "Photo", OTHER: "Other", WEED_MANAGEMENT: "Weed mgmt", LAND_PREP: "Land prep",
};
function feShort(s) { return s ? String(s).split("-").slice(-1)[0].slice(0, 6) : "—"; }
function feDate(s) { if (!s) return "—"; try { return new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }); } catch { return s; } }
function feDetail(e) {
  if (e.chemical_application) return `${e.chemical_application}${e.quantity != null ? ` · ${e.quantity}${e.quantity_unit || ""}` : ""}`;
  if (e.notes) return e.notes;
  const p = e.payload_jsonb;
  if (p && typeof p === "object") {
    const ks = Object.keys(p).filter((k) => p[k] != null && p[k] !== "" && !["production_id", "cycle_id", "variety_id"].includes(k));
    if (ks.length) return ks.slice(0, 2).map((k) => `${k.replace(/_/g, " ")}: ${p[k]}`).join(" · ");
  }
  return "—";
}
// 48h correction window (mirrors backend app/core/edit_window.py — created_at).
function feWithin48h(createdAt) {
  if (!createdAt) return false;
  const t = Date.parse(createdAt);
  return !isNaN(t) && (Date.now() - t) <= 48 * 3600 * 1000;
}
const FE_EDIT_PROTECTED = new Set(["production_id", "cycle_id", "variety_id", "notes",
  "photo_url", "photo_sha256", "photo_byte_size", "gps_lat", "gps_lng", "_recorded_at"]);
// Chemical WHD-critical values are edited via dedicated controls, never the generic list.
const FE_CHEM_HANDLED = new Set(["chemical_id", "application_rate", "tank_volume_liters", "event_date", "occurred_at"]);
const feLabel = (k) => k.replace(/_/g, " ").replace(/\b\w/, (c) => c.toUpperCase());
const feAddDays = (ymd, days) => {
  if (!ymd || days == null) return null;
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
};

// ── 48h correction modal (WHD-critical chemical re-selection) ──────────
function FieldEventEditModal({ evt, onClose, onSaved }) {
  const isChemical = !!evt.chemical_application;
  const [note, setNote] = useState(evt.observation_text || "");
  const [photo, setPhoto] = useState(evt.photo_url || null);
  const [fields, setFields] = useState(() => {
    const p = evt.payload_jsonb || {}; const o = {};
    Object.keys(p).forEach((k) => {
      if (FE_EDIT_PROTECTED.has(k)) return;
      if (isChemical && FE_CHEM_HANDLED.has(k)) return;
      if (p[k] != null && p[k] !== "") o[k] = p[k];
    });
    return o;
  });
  const [chems, setChems] = useState([]);
  const [chemQuery, setChemQuery] = useState("");
  const [chemId, setChemId] = useState(evt.chemical_id || evt.payload_jsonb?.chemical_id || "");
  const [appDate, setAppDate] = useState(String(evt.event_date || "").slice(0, 10));
  const [rate, setRate] = useState(evt.chemical_dose_per_liter ?? evt.payload_jsonb?.application_rate ?? "");
  const [tank, setTank] = useState(evt.tank_volume_liters ?? evt.payload_jsonb?.tank_volume_liters ?? "");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const setField = (k, raw, isNum) => setFields((f) => ({ ...f, [k]: isNum ? (raw === "" ? "" : Number(raw)) : raw }));

  useEffect(() => {
    if (!isChemical) return;
    let cancelled = false;
    (async () => {
      const b = await (await fetch("/api/v1/chemicals", { headers: feAuthHeaders() })).json().catch(() => null);
      if (!cancelled) setChems(b?.data || []);
    })();
    return () => { cancelled = true; };
  }, [isChemical]);

  const selectedChem = chems.find((c) => c.chemical_id === chemId) || null;
  const whdDays = selectedChem?.withholding_period_days;
  const newClear = feAddDays(appDate, whdDays);
  const chemFiltered = chemQuery
    ? chems.filter((c) => (c.chem_name || "").toLowerCase().includes(chemQuery.toLowerCase()))
    : chems;

  async function upload(file) {
    if (!file) return; setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const t = localStorage.getItem("tfos_access_token");
      const b = await (await fetch("/api/v1/community/uploads", { method: "POST", headers: t ? { Authorization: `Bearer ${t}` } : {}, body: fd })).json().catch(() => null);
      const url = b?.data?.url || b?.url; if (url) setPhoto(url); else setErr("Photo upload failed");
    } finally { setUploading(false); }
  }
  async function save() {
    setBusy(true); setErr("");
    try {
      const payload = { notes: note, photo_url: photo, fields };
      if (isChemical) {
        if (!chemId) { setErr("Pick a chemical from the list."); setBusy(false); return; }
        if (!appDate) { setErr("Set the application date."); setBusy(false); return; }
        payload.chemical_id = chemId;
        payload.event_date = appDate;
        payload.application_rate = rate === "" ? null : Number(rate);
        payload.tank_volume_liters = tank === "" ? null : Number(tank);
      }
      const r = await fetch(`/api/v1/field-events/${encodeURIComponent(evt.event_id)}`, {
        method: "PATCH", headers: { ...feAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const b = await r.json().catch(() => null);
      if (r.ok && b?.status === "success") onSaved();
      else setErr(b?.detail?.message || (typeof b?.detail === "string" ? b.detail : `Couldn't save (${r.status})`));
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const fieldKeys = Object.keys(fields);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold" style={{ color: C.soil }}>Correct this entry</h2>
          <button onClick={onClose} aria-label="Close" style={{ color: C.muted, display: "inline-flex" }}><X size={16} /></button>
        </div>
        <div className="text-[11px] mb-3" style={{ color: C.muted }}>You can fix this for 48 hours of logging — every change is logged.</div>

        {isChemical && (
          <div className="mb-3">
            <div className="text-xs font-semibold mb-1" style={{ color: C.soil }}>Chemical (re-runs the withholding window)</div>
            <input placeholder="Search chemical…" value={chemQuery} onChange={(e) => setChemQuery(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm mb-2" style={{ borderColor: C.border }} />
            <div className="space-y-1 mb-2 max-h-44 overflow-y-auto">
              {chems.length === 0 ? <div className="text-xs" style={{ color: C.muted }}>Loading chemicals…</div>
                : chemFiltered.map((c) => (
                  <button key={c.chemical_id} onClick={() => setChemId(c.chemical_id)}
                    className="w-full text-left px-3 py-2 rounded-lg border text-sm"
                    style={{ borderColor: chemId === c.chemical_id ? C.greenDk : C.border, background: chemId === c.chemical_id ? "#eaf3ea" : "#fff" }}>
                    <span className="font-semibold block">{c.chem_name}</span>
                    <span className="text-xs" style={{ color: C.muted }}>{c.active_ingredient ? `${c.active_ingredient} · ` : ""}WHD {c.withholding_period_days ?? "?"}d</span>
                  </button>
                ))}
            </div>
            <label className="text-[11px]" style={{ color: C.muted }}>Application date</label>
            <input type="date" value={appDate} onChange={(e) => setAppDate(e.target.value)}
              className="w-full mt-0.5 mb-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.border }} />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="text-[11px]" style={{ color: C.muted }}>Rate</label>
                <input type="number" value={rate} onChange={(e) => setRate(e.target.value)}
                  className="w-full mt-0.5 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.border }} />
              </div>
              <div>
                <label className="text-[11px]" style={{ color: C.muted }}>Tank (L)</label>
                <input type="number" value={tank} onChange={(e) => setTank(e.target.value)}
                  className="w-full mt-0.5 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.border }} />
              </div>
            </div>
            <div className="text-xs rounded-lg px-3 py-2 flex items-start gap-1.5" style={{ background: "#fff7e6", color: "#7a5b14", border: "1px solid #f0d9a0" }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              {selectedChem
                ? <span>New harvest-clear date: <b>{newClear || "?"}</b> ({whdDays ?? "?"}-day withholding from {appDate || "?"})</span>
                : <span>Pick a chemical to see the new harvest-clear date.</span>}
            </div>
          </div>
        )}

        {fieldKeys.length > 0 && (
          <>
            <div className="text-xs font-semibold mb-1" style={{ color: C.soil }}>What you logged</div>
            <div className="space-y-2 mb-3">
              {fieldKeys.map((k) => {
                const v = fields[k]; const isNum = typeof v === "number";
                return (
                  <div key={k}>
                    <label className="text-[11px]" style={{ color: C.muted }}>{feLabel(k)}</label>
                    <input value={v} type={isNum ? "number" : "text"} onChange={(e) => setField(k, e.target.value, isNum)}
                      className="w-full mt-0.5 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.border }} />
                  </div>
                );
              })}
            </div>
          </>
        )}

        <label className="text-xs font-semibold" style={{ color: C.soil }}>Note</label>
        <textarea value={note} maxLength={500} rows={2} onChange={(e) => setNote(e.target.value)}
          className="w-full mt-1 mb-3 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: C.border }} />
        <label className="text-xs font-semibold" style={{ color: C.soil }}>Photo</label>
        <div className="mt-1 mb-3">
          {photo ? (
            <div className="flex items-center gap-3">
              <img src={photo} alt="" className="w-14 h-14 rounded object-cover" />
              <button onClick={() => setPhoto(null)} className="text-xs" style={{ color: "#9a3b3b" }}>Remove photo</button>
            </div>
          ) : (
            <label className="inline-block text-xs px-3 py-2 rounded-lg border cursor-pointer" style={{ borderColor: C.border, color: C.greenDk }}>
              {uploading ? "Uploading…" : "Add / change photo"}
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
          )}
        </div>
        {err && <div className="text-xs mb-2" style={{ color: "#9a3b3b" }}>{err}</div>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border text-sm" style={{ borderColor: C.border }}>Cancel</button>
          <button onClick={save} disabled={busy || uploading} className="flex-1 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: C.greenDk }}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      </div>
    </div>
  );
}

// ── the log ────────────────────────────────────────────────────────────
function FieldEventsLog() {
  const navigate = useNavigate();
  const { openFormModal } = useFormModal();
  const { farmId } = useCurrentFarm();
  const me = getCurrentUser()?.sub || getCurrentUser()?.user_id || null;
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState("all");
  const [editEvt, setEditEvt] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["field-events", farmId],
    queryFn: () => getJSON(`/api/v1/field-events?farm_id=${encodeURIComponent(farmId)}&limit=100`),
    enabled: !!farmId,
  });
  const allEvents = data?.data?.events ?? [];
  const hasData = allEvents.length > 0; // keep cached events visible on a refetch error
  const types = useMemo(() => [...new Set(allEvents.map((e) => e.event_type))], [allEvents]);
  const events = useMemo(() => {
    let r = allEvents;
    if (typeF !== "all") r = r.filter((e) => e.event_type === typeF);
    const s = q.trim().toLowerCase();
    if (s) r = r.filter((e) => (FE_HUMAN[e.event_type] || e.event_type || "").toLowerCase().includes(s) || feDetail(e).toLowerCase().includes(s));
    return r;
  }, [allEvents, typeF, q]);
  // human-readable: "you" for self; friendly labels when present (raw-id join filed backend).
  const who = (e) => (e.created_by && me && String(e.created_by) === String(me)) ? "you" : (e.created_by_name || feShort(e.created_by));
  const block = (e) => e.pu_farmer_label || e.pu_name || feShort(e.pu_id);

  return (
    <div className="tfp max-w-5xl mx-auto p-4 space-y-4">
      <div className="page-header">
        <div><h1>Field events</h1><div className="subtitle">Spray, irrigation, fertilizer, scouting and more — logged against your blocks</div></div>
        <div className="page-actions">
          <FarmSelector />
          <button className="btn" onClick={() => navigate(`/tis?q=${encodeURIComponent("Summarise my recent field activity and what I should watch for.")}`)}><Sparkles size={14} />Ask AI</button>
          <button className="btn btn-primary" onClick={() => openFormModal("crops")}><Plus size={14} />Log event</button>
        </div>
      </div>

      {hasData && (
        <div className="flex items-center gap-2 flex-wrap">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity…" className="rounded-lg border px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)]" style={{ borderColor: C.border, minWidth: 180 }} />
          <div className="flex gap-1.5 overflow-x-auto">
            {["all", ...types].map((t) => (
              <button key={t} onClick={() => setTypeF(t)} className="text-xs px-2.5 py-1 rounded-full shrink-0" style={{ border: `1px solid ${typeF === t ? C.greenDk : C.border}`, background: typeF === t ? C.green : "var(--paper)", color: typeF === t ? "#fff" : C.muted }}>{t === "all" ? "All" : (FE_HUMAN[t] || t)}</button>
            ))}
          </div>
        </div>
      )}

      {isError && hasData && (
        <div className="rounded-xl border p-2.5 flex items-center justify-between gap-2 flex-wrap" style={{ background: "#FEF6E6", borderColor: C.border }}>
          <span className="text-[12px] flex items-center gap-1.5" style={{ color: "var(--amber)" }}><AlertTriangle size={13} />Couldn't refresh — showing your last saved events.</span>
          <button onClick={() => refetch()} className="text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ color: C.greenDk, border: `1px solid ${C.border}`, background: "white" }}>Retry</button>
        </div>
      )}

      <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: C.border }}>
        <div className="hidden md:grid items-center px-4 py-2 text-[10px] font-bold uppercase"
          style={{ color: C.muted, gridTemplateColumns: "96px 120px 1fr 110px 70px 56px", borderBottom: `1px solid ${C.border}` }}>
          <span>Date</span><span>Type</span><span>Detail</span><span>Block</span><span>By</span><span></span>
        </div>
        {isLoading && !hasData ? (
          <div className="px-4 py-10 text-center text-sm" style={{ color: C.muted }}>Loading…</div>
        ) : isError && !hasData ? (
          <div className="px-4 py-10 text-center">
            <div className="text-sm font-semibold" style={{ color: C.soil }}>Couldn't load field events</div>
            <button onClick={() => refetch()} className="mt-2 text-xs px-3 py-1.5 rounded-lg text-white" style={{ background: C.greenDk }}>Retry</button>
          </div>
        ) : !farmId ? (
          <div className="px-4 py-12 text-center">
            <ListChecks size={26} style={{ color: C.green, margin: "0 auto" }} />
            <div className="text-sm font-semibold mt-2" style={{ color: C.soil }}>Select a farm</div>
            <div className="text-xs mt-1" style={{ color: C.muted }}>Choose or create a farm to log and see its field activity.</div>
          </div>
        ) : allEvents.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <ListChecks size={26} style={{ color: C.green, margin: "0 auto" }} />
            <div className="text-sm font-semibold mt-2" style={{ color: C.soil }}>No field events yet</div>
            <div className="text-xs mt-1" style={{ color: C.muted }}>Tap "Log event" to record a spray, irrigation, fertilizer or scouting activity — with photo, GPS and voice.</div>
          </div>
        ) : events.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm" style={{ color: C.muted }}>No events match this filter.</div>
        ) : events.map((e) => {
          const editable = feWithin48h(e.created_at);
          const editCell = editable
            ? <button onClick={() => setEditEvt(e)} className="text-[11px] font-semibold text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)]" style={{ color: C.greenDk }}>Edit</button>
            : <span title="Locked after 48 hours" aria-label="Locked" style={{ color: C.muted, display: "inline-flex" }}><Lock size={13} /></span>;
          return (
            <div key={e.event_id} style={{ borderTop: `1px solid rgba(92,64,51,0.06)` }}>
              {/* desktop: aligned grid */}
              <div className="hidden md:grid md:items-center gap-3 px-4 py-3" style={{ gridTemplateColumns: "96px 120px 1fr 110px 70px 56px" }}>
                <span className="text-[11px]" style={{ color: C.muted }}>{feDate(e.event_date)}</span>
                <span className="text-sm" style={{ color: C.soil }}>{FE_HUMAN[e.event_type] || e.event_type}</span>
                <span className="min-w-0 text-[13px] truncate" style={{ color: C.soil }}>{feDetail(e)}</span>
                <span className="text-[11px]" style={{ color: C.muted }} title={`Block ${block(e)}`}>{block(e)}</span>
                <span className="text-[11px]" style={{ color: C.muted }}>{who(e)}</span>
                {editCell}
              </div>
              {/* mobile: labelled stack */}
              <div className="md:hidden px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: C.soil }}>{FE_HUMAN[e.event_type] || e.event_type}</span>
                  <span className="text-[11px] shrink-0" style={{ color: C.muted }}>{feDate(e.event_date)}</span>
                </div>
                <div className="text-[13px] mt-0.5" style={{ color: C.soil }}>{feDetail(e)}</div>
                <div className="flex items-center justify-between gap-2 mt-1">
                  <span className="text-[11px]" style={{ color: C.muted }}>Block {block(e)} · by {who(e)}</span>
                  {editCell}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px]" style={{ color: C.muted }}>Showing the most recent {allEvents.length} event{allEvents.length === 1 ? "" : "s"}{allEvents.length >= 100 ? " — search & filters cover these 100 only" : ""}. Entries can be corrected for 48 hours, then lock.</p>
      {editEvt && <FieldEventEditModal evt={editEvt} onClose={() => setEditEvt(null)} onSaved={() => { refetch(); setEditEvt(null); }} />}
    </div>
  );
}

// Deep links (?type / ?new) open the (+) Capture Engine — the single rich, evidence-
// capturing write path — and land the farmer back on the log.
const LEGACY_TO_CATALOG = { SPRAY: "CHEMICAL_APPLIED", FERTILIZE: "FERTILIZER_APPLIED", IRRIGATE: "IRRIGATION", PRUNE: "PRUNING_TRAINING", TRANSPLANT: "TRANSPLANT_LOGGED" };
function FieldEventDispatcher() {
  const [sp, setSp] = useSearchParams();
  const { openFormModal } = useFormModal();
  useEffect(() => {
    const type = sp.get("type");
    const isNew = sp.get("new");
    if (type || isNew) {
      const t = type ? (LEGACY_TO_CATALOG[type] || type) : null;
      openFormModal("crops", t ? { eventType: t } : {});
      const n = new URLSearchParams(sp); n.delete("type"); n.delete("new"); setSp(n, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <FieldEventsLog />;
}

export default function FieldEventNew() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <FieldEventDispatcher />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}
