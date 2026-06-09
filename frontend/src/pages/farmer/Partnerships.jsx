/**
 * Partnerships.jsx — /farm/partnerships — replaces the ComingSoon stub.
 *
 * The prototype's core is "Land & profit-share" (landowner agreements) plus a
 * farm-network intro that links to Buyers + Bank Evidence. Profit-share data is
 * read from GET /api/v1/profit-share (real tenant.profit_share distributions:
 * landowner_name, share_rate_pct, landowner/operator_share_fjd). These rows only
 * exist when a real split was calculated, so the page never invents a rate —
 * honoring Inviolable #9 (a wrong contractual figure damages the relationship).
 * Honest-empty when no agreement is on record.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const C = {
  soil: "#5C4033", green: "#6AA84F", greenDk: "#3E7B1F", greenTint: "#E9F2DD",
  amber: "#BF9000", cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", panel: "#FFFFFF",
};
function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
function fjd(v) { const n = Number(v ?? 0); return `FJD ${Math.abs(n).toLocaleString("en-FJ", { maximumFractionDigits: 0 })}`; }
function fdate(iso) { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? String(iso) : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" }); }

export default function Partnerships() {
  const navigate = useNavigate();
  const farmId = (typeof localStorage !== "undefined" && localStorage.getItem("tfos_current_farm_id")) || "";
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = `/api/v1/profit-share${farmId ? `?farm_id=${encodeURIComponent(farmId)}` : ""}`;
        const r = await fetch(url, { headers: authHeaders() });
        const b = r.ok ? await r.json() : null;
        if (alive) setRows(Array.isArray(b?.data) ? b.data : []);
      } catch { if (alive) setRows([]); }
    })();
    return () => { alive = false; };
  }, [farmId]);

  return (
    <div style={{ background: C.cream, minHeight: "100%" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <h1 className="text-2xl font-bold" style={{ color: C.soil }}>Partnerships</h1>
        <div className="text-xs mt-0.5 mb-3" style={{ color: C.muted }}>The people and groups you work with — each one builds your record</div>

        {/* Network intro — real navigation, no fabricated data */}
        <div className="rounded-2xl border p-4 mb-3" style={{ borderColor: C.border, background: C.panel }}>
          <div className="text-sm" style={{ color: C.soil, lineHeight: 1.5 }}>
            Your farm network in one place. Buyers link to your Buyers page; banks and investors connect to your Bank Evidence.
          </div>
          <div className="flex gap-2 mt-3 flex-wrap">
            <button onClick={() => navigate("/farm/buyers")} className="text-sm font-semibold px-3 py-1.5 rounded-lg" style={{ border: `1px solid ${C.border}`, color: C.soil, background: "#fff" }}>Open Buyers →</button>
            <button onClick={() => navigate("/farm/reports")} className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: C.greenDk }}>Bank Evidence →</button>
          </div>
        </div>

        {/* Land & profit-share */}
        <div className="rounded-2xl border p-4" style={{ borderColor: C.border, background: C.panel }}>
          <div className="font-semibold" style={{ color: C.soil }}>Land &amp; profit-share</div>
          <div className="text-xs mb-3" style={{ color: C.muted }}>Your landowner agreements and how profit is shared</div>

          {rows == null ? (
            <div className="text-sm" style={{ color: C.muted }}>Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm" style={{ color: C.muted }}>
              No land agreement recorded yet. Add your landowner profit-share to bring it into your record.
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((p, i) => (
                <div key={p.profit_share_id || i} className="rounded-xl border p-3" style={{ borderColor: C.border, background: C.cream }}>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-semibold" style={{ color: C.soil }}>{p.landowner_name}</div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: C.greenTint, color: C.greenDk }}>{Number(p.share_rate_pct).toFixed(0)}% net profit</span>
                  </div>
                  <div className="text-xs mt-1" style={{ color: C.muted }}>
                    {p.production_name || p.cycle_name || p.cycle_id} · {fdate(p.created_at)}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                    <div><div className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Net profit</div><div className="text-sm font-bold" style={{ color: C.soil }}>{fjd(p.net_profit_fjd)}</div></div>
                    <div><div className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Landowner</div><div className="text-sm font-bold" style={{ color: C.greenDk }}>{fjd(p.landowner_share_fjd)}</div></div>
                    <div><div className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>You keep</div><div className="text-sm font-bold" style={{ color: C.soil }}>{fjd(p.operator_share_fjd)}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
