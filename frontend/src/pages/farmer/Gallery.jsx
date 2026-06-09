/**
 * Gallery.jsx — /farm/gallery — replaces the ComingSoon stub with a real page.
 *
 * Photos live as photo_url on field events (and harvests). This aggregates the
 * farm's event photos from GET /api/v1/field-events (SELECT * returns photo_url)
 * into a Photos grid + Timeline. Honest-empty when nothing's been photographed.
 * Video / AI analysis are flagged honest "building" — exactly as the prototype
 * marks them — never faked.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const C = {
  soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", amber: "#BF9000",
  cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", panel: "#FFFFFF",
};
function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(iso) { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? String(iso) : `${String(d.getUTCDate()).padStart(2,"0")} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`; }
function Empty({ text }) { return <div className="rounded-xl border p-10 text-center text-sm" style={{ borderColor: C.border, background: C.panel, color: C.muted }}>{text}</div>; }

export default function Gallery() {
  const navigate = useNavigate();
  const farmId = (typeof localStorage !== "undefined" && localStorage.getItem("tfos_current_farm_id")) || "";
  const [events, setEvents] = useState(null);
  const [view, setView] = useState("photos");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = `/api/v1/field-events?limit=200${farmId ? `&farm_id=${encodeURIComponent(farmId)}` : ""}`;
        const r = await fetch(url, { headers: authHeaders() });
        const b = r.ok ? await r.json() : null;
        const list = b?.data?.events || [];
        if (alive) setEvents(list);
      } catch { if (alive) setEvents([]); }
    })();
    return () => { alive = false; };
  }, [farmId]);

  const photos = useMemo(
    () => (events || []).filter((e) => e.photo_url).sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))),
    [events]
  );

  return (
    <div style={{ background: C.cream, minHeight: "100%" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Gallery</h1>
        <div className="text-xs mt-0.5 mb-3" style={{ color: C.muted }}>Every photo tied to the event that captured it</div>

        <div className="flex gap-2 mb-3">
          {[["photos", "Photos"], ["timeline", "Timeline"]].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} className="px-4 py-2 rounded-lg text-sm font-semibold border"
              style={{ borderColor: view === v ? C.green : C.border, background: view === v ? "#E9F2DD" : "#fff", color: C.soil }}>{label}</button>
          ))}
          <span className="ml-auto text-xs self-center" style={{ color: C.muted }}>{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
        </div>

        {events == null ? <Empty text="Loading…" />
          : photos.length === 0 ? (
            <Empty text="No photos yet — attach a photo when you log a field event or harvest and it appears here, tied to the record that captured it." />
          ) : view === "photos" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
              {photos.map((e) => (
                <button key={e.event_id} onClick={() => e.cycle_id && navigate(`/farm/cycles/${encodeURIComponent(e.cycle_id)}`)}
                  className="rounded-xl border overflow-hidden text-left" style={{ borderColor: C.border, background: C.panel }}>
                  <img src={e.photo_url} alt={e.event_type} loading="lazy" style={{ width: "100%", height: 120, objectFit: "cover", display: "block", background: C.cream }} />
                  <div className="p-2">
                    <div className="text-xs font-semibold truncate" style={{ color: C.soil }}>{String(e.event_type || "").replace(/_/g, " ")}</div>
                    <div className="text-[10px]" style={{ color: C.muted }}>{fmtDate(e.event_date)}{e.pu_id ? ` · ${e.pu_id}` : ""}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {photos.map((e) => (
                <div key={e.event_id} className="flex items-center gap-3 rounded-xl border p-2" style={{ borderColor: C.border, background: C.panel }}>
                  <img src={e.photo_url} alt={e.event_type} loading="lazy" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 8, background: C.cream, flexShrink: 0 }} />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold" style={{ color: C.soil }}>{String(e.event_type || "").replace(/_/g, " ")}</div>
                    <div className="text-xs" style={{ color: C.muted }}>{fmtDate(e.event_date)}{e.observation_text ? ` · ${e.observation_text}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

        <div className="rounded-xl border p-3 mt-4 text-xs" style={{ borderColor: C.border, background: C.panel, color: C.muted }}>
          <b style={{ color: C.soil }}>Video & AI analysis</b> — short clips and automatic photo analysis turn on once you log video from the field. Not shown until real.
        </div>
      </div>
    </div>
  );
}
