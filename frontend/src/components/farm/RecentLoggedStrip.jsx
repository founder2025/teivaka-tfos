/**
 * RecentLoggedStrip.jsx — "Just logged" reassurance row on the Farm Overview.
 *
 * Mirrors the prototype's recentLoggedStrip(): last 5 field events for the
 * current farm, each showing what was done, where, by whom, when. Tapping a
 * row with a cycle jumps to that cycle.
 *
 * Honesty note: the prototype shows an audit-hash badge on every row. In
 * production only SPRAY->CHEMICAL_APPLIED currently emits to audit.events
 * (field_events router, Phase 4.x.5 follow-up). So we show the event id as a
 * reference chip, and reserve the amber hash badge for when the backend emits
 * a verifiable hash per event. No fabricated hashes.
 *
 * Reads GET /api/v1/field-events?farm_id=&limit=5 (success_envelope:
 * { data: { events, total } }). Renders nothing when there are no events.
 */
import { useQuery } from "@tanstack/react-query";
import { Check, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const C = {
  soil:   "#5C4033",
  green:  "#6AA84F",
  greenDk:"#4F8138",
  amber:  "#BF9000",
  cream:  "#F8F3E9",
  muted:  "#8A7863",
};

const EVENT_LABEL = {
  PLANTING: "Planting", TRANSPLANT: "Transplant", FERTILIZE: "Fertilizer",
  IRRIGATE: "Irrigation", SPRAY: "Spray", PRUNE: "Pruning",
  PEST_OBSERVE: "Pest check", DISEASE_OBSERVE: "Disease check",
  HARVEST_PARTIAL: "Harvest", HARVEST_FINAL: "Final harvest",
  INSPECTION: "Inspection", SOIL_TEST: "Soil test", PHOTO: "Photo", OTHER: "Activity",
};

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

function whenLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

async function fetchRecent(farmId) {
  if (!farmId) return [];
  const res = await fetch(
    `/api/v1/field-events?farm_id=${encodeURIComponent(farmId)}&limit=5`,
    { headers: authHeaders() }
  );
  if (!res.ok) return [];
  const body = await res.json();
  return body?.data?.events ?? body?.events ?? [];
}

export default function RecentLoggedStrip({ farmId }) {
  const navigate = useNavigate();
  const { data: events = [] } = useQuery({
    queryKey: ["recent-events", farmId],
    queryFn: () => fetchRecent(farmId),
    enabled: !!farmId,
  });

  if (!events.length) return null;

  return (
    <div
      style={{
        background: "rgba(106,168,79,0.06)",
        border: `1px solid ${C.green}`,
        borderRadius: 11,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 12, fontWeight: 700, color: C.greenDk,
          display: "flex", alignItems: "center", gap: 6, marginBottom: 8,
        }}
      >
        <Check size={13} />
        Just logged
        <span
          style={{
            background: C.green, color: "#fff", borderRadius: 9,
            fontSize: 10, padding: "1px 7px", marginLeft: "auto",
          }}
        >
          {events.length}
        </span>
      </div>

      {events.map((e, i) => {
        const label = EVENT_LABEL[e.event_type] || e.event_type || "Activity";
        const where = e.pu_id || "whole-farm";
        const meta = [where, e.created_by, whenLabel(e.event_date)]
          .filter(Boolean).join(" · ");
        return (
          <div
            key={e.event_id || i}
            style={{
              display: "flex", alignItems: "center", gap: 10, padding: "7px 0",
              borderTop: i === 0 ? "none" : "1px solid rgba(106,168,79,0.18)",
            }}
          >
            <span style={{ color: C.greenDk, display: "flex" }}><Check size={13} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.soil }}>{label}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{meta}</div>
            </div>
            {e.event_id && (
              <span
                title="Event reference"
                style={{
                  fontFamily: "monospace", fontSize: 10.5, color: C.amber,
                  background: C.cream, padding: "2px 6px", borderRadius: 6,
                  whiteSpace: "nowrap",
                }}
              >
                {e.event_id}
              </span>
            )}
            {e.cycle_id && (
              <button
                onClick={() => navigate(`/farm/cycles?cycle=${encodeURIComponent(e.cycle_id)}`)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 3,
                  fontSize: 11, color: C.greenDk, background: "#fff",
                  border: `1px solid ${C.green}`, borderRadius: 7,
                  padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                <ArrowRight size={11} /> View cycle
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
