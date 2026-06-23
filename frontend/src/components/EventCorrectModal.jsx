/**
 * EventCorrectModal — in-window (48h) correction of an animal event's captured values.
 *
 * Mirrors the field-events edit modal: renders the scalar values from payload_jsonb as
 * editable inputs and PATCHes /api/v1/events/{id} with { fields }, which merges them back
 * into payload_jsonb and emits a transparent EVENT_CORRECTED audit row.
 *
 * VACCINATION_GIVEN gets a dedicated WHD-aware form (vaccine picker + date) — its
 * withholding is recomputed live at sale, and the backend regenerates the reminder task.
 * Compliance-/count-driving events (health, mortality, bird in/out) stay locked out.
 */
import { useEffect, useState } from "react";
import { apiClient } from "../utils/apiClient";

// Mirror of backend _ANIMAL_EVENT_EDIT_PROTECTED + evidence keys: never offered for edit.
const PROTECTED = new Set([
  "flock_id", "animal_ref", "species", "farm_id", "pu_id", "cycle_id",
  "photo_url", "photo_sha256", "photo_byte_size",
  "voice_url", "voice_sha256", "voice_byte_size",
  "gps_lat", "gps_lng", "witness_name", "witness_role",
]);
// Mirror of backend _ANIMAL_EVENT_EDIT_BLOCKED.
const BLOCKED = new Set([
  "HEALTH_OBSERVATION", "MORTALITY_LOGGED", "BIRD_REPLACEMENT", "BIRDS_SOLD",
]);
// Vaccination WHD-critical values use dedicated controls, never the generic list.
const VAX_HANDLED = new Set(["vaccine_id", "occurred_at", "vaccination_date"]);
const label = (k) => k.replace(/_/g, " ").replace(/\b\w/, (c) => c.toUpperCase());
const addDays = (ymd, days) => {
  if (!ymd || days == null) return null;
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + Number(days));
  return d.toISOString().slice(0, 10);
};

export default function EventCorrectModal({ event, onClose, onSaved }) {
  const blocked = BLOCKED.has(event.event_type);
  const isVax = event.event_type === "VACCINATION_GIVEN";
  const [fields, setFields] = useState(() => {
    const p = event.payload || {};
    const o = {};
    Object.keys(p).forEach((k) => {
      if (PROTECTED.has(k)) return;
      if (isVax && VAX_HANDLED.has(k)) return;
      const v = p[k];
      if ((typeof v === "string" || typeof v === "number") && v !== "") o[k] = v;
    });
    return o;
  });
  // Vaccination-only state.
  const [vaccines, setVaccines] = useState([]);
  const [vaxId, setVaxId] = useState((event.payload || {}).vaccine_id || "");
  const [vaxDate, setVaxDate] = useState(String(event.occurred_at || "").slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const setField = (k, raw, isNum) =>
    setFields((f) => ({ ...f, [k]: isNum ? (raw === "" ? "" : Number(raw)) : raw }));

  useEffect(() => {
    if (!isVax) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiClient.get("/farm-libraries?library_type=POULTRY_VACCINE");
        if (!cancelled) setVaccines(r?.data?.items || []);
      } catch { /* picker just stays empty */ }
    })();
    return () => { cancelled = true; };
  }, [isVax]);

  const selectedVax = vaccines.find((x) => x.library_id === vaxId) || null;
  const vaxDays = selectedVax
    ? Math.max(
        Number(selectedVax.attributes?.withholding_eggs_days || 0),
        Number(selectedVax.attributes?.withholding_meat_days || 0),
      )
    : null;
  const newClear = addDays(vaxDate, vaxDays);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const body = { fields };
      if (isVax) {
        if (!vaxId) { setErr("Pick a vaccine from the list."); setBusy(false); return; }
        if (!vaxDate) { setErr("Set the vaccination date."); setBusy(false); return; }
        body.fields = { ...fields, vaccine_id: vaxId };
        body.occurred_at = vaxDate;
      }
      await apiClient.patch(`/events/${encodeURIComponent(event.event_id)}`, body);
      onSaved();
    } catch (e) {
      setErr(e.message || "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  const keys = Object.keys(fields);
  const canSave = !blocked && (isVax || keys.length > 0);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }} onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold" style={{ color: "var(--soil)" }}>Correct this entry</h2>
          <button onClick={onClose} style={{ color: "var(--muted)" }}>✕</button>
        </div>
        <div className="text-[11px] mb-3" style={{ color: "var(--muted)" }}>
          You can fix this for 48 hours of logging — every change is logged.
        </div>

        {blocked ? (
          <div className="text-xs mb-3 rounded-lg px-3 py-2" style={{ background: "#fff7e6", color: "#7a5b14", border: "1px solid #f0d9a0" }}>
            This record drives a compliance window or your live bird count, so its values can't
            be corrected here. Log a fresh event with the right figures.
          </div>
        ) : (
          <>
            {isVax && (
              <div className="mb-3">
                <div className="text-xs font-semibold mb-1" style={{ color: "var(--soil)" }}>Vaccine (re-runs the withholding window)</div>
                <div className="space-y-1 mb-2 max-h-40 overflow-y-auto">
                  {vaccines.length === 0 ? <div className="text-xs" style={{ color: "var(--muted)" }}>No vaccines in your library yet.</div>
                    : vaccines.map((x) => (
                      <button key={x.library_id} onClick={() => setVaxId(x.library_id)}
                        className="w-full text-left px-3 py-2 rounded-lg border text-sm"
                        style={{ borderColor: vaxId === x.library_id ? "var(--green)" : "#E6DED0", background: vaxId === x.library_id ? "#eaf3ea" : "#fff" }}>
                        <span className="font-semibold block">{x.name}</span>
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          WHD eggs {x.attributes?.withholding_eggs_days ?? 0}d · meat {x.attributes?.withholding_meat_days ?? 0}d
                        </span>
                      </button>
                    ))}
                </div>
                <label className="text-[11px]" style={{ color: "var(--muted)" }}>Vaccination date</label>
                <input type="date" value={vaxDate} onChange={(e) => setVaxDate(e.target.value)}
                  className="w-full mt-0.5 mb-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#E6DED0" }} />
                <div className="text-xs rounded-lg px-3 py-2" style={{ background: "#fff7e6", color: "#7a5b14", border: "1px solid #f0d9a0" }}>
                  {selectedVax
                    ? (vaxDays > 0
                        ? <>⚠ Sales held until <b>{newClear || "?"}</b> ({vaxDays}-day withholding from {vaxDate || "?"})</>
                        : <>No withholding on this vaccine.</>)
                    : <>Pick a vaccine to see the withholding window.</>}
                </div>
              </div>
            )}

            {keys.length > 0 ? (
              <>
                <div className="text-xs font-semibold mb-1" style={{ color: "var(--soil)" }}>What you logged</div>
                <div className="space-y-2 mb-3">
                  {keys.map((k) => {
                    const v = fields[k];
                    const isNum = typeof v === "number";
                    return (
                      <div key={k}>
                        <label className="text-[11px]" style={{ color: "var(--muted)" }}>{label(k)}</label>
                        <input value={v} type={isNum ? "number" : "text"} onChange={(e) => setField(k, e.target.value, isNum)}
                          className="w-full mt-0.5 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "#E6DED0" }} />
                      </div>
                    );
                  })}
                </div>
              </>
            ) : !isVax && (
              <div className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                Nothing here can be corrected. If it's wrong, log a fresh event with the right figures.
              </div>
            )}
          </>
        )}

        {err && <div className="text-xs mb-2" style={{ color: "#9a3b3b" }}>{err}</div>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border text-sm" style={{ borderColor: "#E6DED0" }}>
            {canSave ? "Cancel" : "Close"}
          </button>
          {canSave && (
            <button onClick={save} disabled={busy} className="flex-1 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: "var(--green)" }}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
