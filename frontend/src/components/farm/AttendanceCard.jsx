/**
 * AttendanceCard.jsx — Locations L3 geo-locked worker clock in/out.
 *
 * Worker taps Clock in / Clock out; the browser captures the GPS fix and the API
 * checks it against the farm's drawn boundary (point-in-polygon). Result shows
 * inside/outside + distance. Tenant-scoped — every account sees only its own.
 */
import { useEffect, useState } from "react";
import { LogIn, LogOut, MapPin, CheckCircle2, AlertTriangle, Loader2, Clock } from "lucide-react";

const C = { soil: "var(--soil)", cream: "var(--cream)", border: "#E6DED0", muted: "var(--muted)", green: "var(--green)", greenDk: "var(--green-dk)", amber: "var(--amber)", red: "var(--red)", paper: "#FCFAF5" };
const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--green)]";

function authHeaders() { const t = localStorage.getItem("tfos_access_token"); return t ? { Authorization: `Bearer ${t}` } : {}; }
const fmtTime = (iso) => { try { return new Date(iso).toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return iso; } };

export default function AttendanceCard({ farmId }) {
  const [list, setList] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [busy, setBusy] = useState(null);     // CLOCK_IN | CLOCK_OUT while sending
  const [result, setResult] = useState(null); // last clock result
  const [workerId, setWorkerId] = useState(""); // "" = myself

  async function loadList() {
    if (!farmId) return;
    try {
      const r = await fetch(`/api/v1/attendance?farm_id=${encodeURIComponent(farmId)}&limit=20`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setList(d.data || []); }
    } catch { /* non-fatal */ }
  }
  async function loadWorkers() {
    if (!farmId) return;
    try {
      const r = await fetch(`/api/v1/workers?farm_id=${encodeURIComponent(farmId)}`, { headers: authHeaders() });
      if (r.ok) { const d = await r.json(); setWorkers(d.data || []); }
    } catch { /* non-fatal */ }
  }
  useEffect(() => { loadList(); loadWorkers(); }, [farmId]);

  function clock(kind) {
    if (!navigator.geolocation) { setResult({ error: "This device has no GPS." }); return; }
    setBusy(kind); setResult(null);
    const picked = workers.find((w) => w.worker_id === workerId);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        try {
          const r = await fetch(`/api/v1/attendance/clock`, {
            method: "POST", headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ farm_id: farmId, kind, lat: latitude, lng: longitude, accuracy_m: accuracy, worker_id: picked?.worker_id || null, worker_name: picked?.full_name || null }),
          });
          if (!r.ok) throw new Error(String(r.status));
          setResult(await r.json());
          loadList();
        } catch {
          setResult({ error: "Couldn't save — is the attendance API live?" });
        } finally { setBusy(null); }
      },
      () => { setResult({ error: "Allow location access to clock in." }); setBusy(null); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  }

  const Btn = ({ kind, label, Icon, primary }) => (
    <button onClick={() => clock(kind)} disabled={busy || !farmId}
      className={`flex-1 text-sm px-3 py-3 rounded-xl flex items-center justify-center gap-2 font-bold hover:brightness-95 disabled:opacity-50 ${FOCUS}`}
      style={primary ? { background: C.greenDk, color: "#fff" } : { background: "var(--paper)", color: C.soil, border: `1.5px solid ${C.border}` }}>
      {busy === kind ? <Loader2 size={16} className="animate-spin" /> : <Icon size={16} />}{label}
    </button>
  );

  return (
    <div>
      <p className="text-xs mb-3" style={{ color: C.muted }}>
        Clock in or out from the field — we check your GPS against your farm boundary. Draw your <strong>Boundary</strong> on the map to switch on the geo-lock.
      </p>

      <select value={workerId} onChange={(e) => setWorkerId(e.target.value)}
        className={`w-full px-3 py-2 rounded-lg text-sm mb-2.5 ${FOCUS}`} style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }}>
        <option value="">Myself (this login)</option>
        {workers.map((w) => <option key={w.worker_id} value={w.worker_id}>{w.full_name}</option>)}
      </select>

      <div className="flex items-center gap-2">
        <Btn kind="CLOCK_IN" label="Clock in" Icon={LogIn} primary />
        <Btn kind="CLOCK_OUT" label="Clock out" Icon={LogOut} />
      </div>

      {result && (
        <div className="mt-3 rounded-xl p-3 text-sm flex items-start gap-2"
          style={{ background: result.error ? "#FBEAE7" : result.has_boundary === false ? C.cream : result.inside_boundary ? "#E9F2DD" : "#FBEAE7" }}>
          {result.error ? <AlertTriangle size={16} style={{ color: C.red, marginTop: 1 }} />
            : result.has_boundary === false ? <MapPin size={16} style={{ color: C.amber, marginTop: 1 }} />
            : result.inside_boundary ? <CheckCircle2 size={16} style={{ color: C.greenDk, marginTop: 1 }} />
            : <AlertTriangle size={16} style={{ color: C.red, marginTop: 1 }} />}
          <div style={{ color: C.soil }}>
            {result.error ? result.error
              : result.has_boundary === false ? <><strong>{result.kind === "CLOCK_IN" ? "Clocked in" : "Clocked out"}</strong> — recorded, but no farm boundary is drawn yet so location wasn't verified.</>
              : result.inside_boundary ? <><strong>{result.kind === "CLOCK_IN" ? "Clocked in" : "Clocked out"}</strong> — verified inside the farm boundary. ✓</>
              : <><strong>Outside the farm boundary</strong> — recorded ~{Math.round(result.distance_m)}m from the edge. Move onto the farm and try again.</>}
          </div>
        </div>
      )}

      {list.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: C.muted }}>Recent</div>
          <div className="space-y-1 max-h-56 overflow-y-auto">
            {list.map((a) => (
              <div key={a.attendance_id} className="flex items-center gap-2 py-1.5" style={{ borderBottom: `1px solid rgba(92,64,51,0.07)` }}>
                {a.kind === "CLOCK_IN" ? <LogIn size={13} style={{ color: C.greenDk }} /> : <LogOut size={13} style={{ color: C.soil }} />}
                <span className="text-xs font-semibold" style={{ color: C.soil }}>{a.worker_name || "You"}</span>
                <span className="text-[11px] flex items-center gap-1" style={{ color: C.muted }}><Clock size={11} />{fmtTime(a.occurred_at)}</span>
                <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full" style={{
                  color: a.inside_boundary == null ? C.muted : a.inside_boundary ? C.greenDk : C.red,
                  border: `1px solid ${C.border}`,
                }}>
                  {a.inside_boundary == null ? "no boundary" : a.inside_boundary ? "inside" : `~${Math.round(a.distance_m)}m out`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
