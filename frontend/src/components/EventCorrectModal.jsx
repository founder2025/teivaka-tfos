/**
 * EventCorrectModal — in-window (48h) correction of an animal event's captured values.
 *
 * Mirrors the field-events edit modal: renders the scalar values from payload_jsonb as
 * editable inputs and PATCHes /api/v1/events/{id} with { fields }, which merges them back
 * into payload_jsonb and emits a transparent EVENT_CORRECTED audit row. Compliance- and
 * count-driving events (vaccination, health, mortality, bird in/out) are locked out here
 * to match the backend guard — they show an amber note instead of editable fields.
 */
import { useState } from "react";
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
  "VACCINATION_GIVEN", "HEALTH_OBSERVATION",
  "MORTALITY_LOGGED", "BIRD_REPLACEMENT", "BIRDS_SOLD",
]);
const label = (k) => k.replace(/_/g, " ").replace(/\b\w/, (c) => c.toUpperCase());

export default function EventCorrectModal({ event, onClose, onSaved }) {
  const blocked = BLOCKED.has(event.event_type);
  const [fields, setFields] = useState(() => {
    const p = event.payload || {};
    const o = {};
    Object.keys(p).forEach((k) => {
      const v = p[k];
      if (!PROTECTED.has(k) && (typeof v === "string" || typeof v === "number") && v !== "") o[k] = v;
    });
    return o;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const setField = (k, raw, isNum) =>
    setFields((f) => ({ ...f, [k]: isNum ? (raw === "" ? "" : Number(raw)) : raw }));

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await apiClient.patch(`/events/${encodeURIComponent(event.event_id)}`, { fields });
      onSaved();
    } catch (e) {
      setErr(e.message || "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  const keys = Object.keys(fields);
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
        ) : keys.length === 0 ? (
          <div className="text-xs mb-3" style={{ color: "var(--muted)" }}>
            Nothing here can be corrected. If it's wrong, log a fresh event with the right figures.
          </div>
        ) : (
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
        )}

        {err && <div className="text-xs mb-2" style={{ color: "#9a3b3b" }}>{err}</div>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border text-sm" style={{ borderColor: "#E6DED0" }}>
            {blocked || keys.length === 0 ? "Close" : "Cancel"}
          </button>
          {!blocked && keys.length > 0 && (
            <button onClick={save} disabled={busy} className="flex-1 py-2 rounded-lg text-white text-sm font-semibold" style={{ background: "var(--green)" }}>
              {busy ? "Saving…" : "Save changes"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
