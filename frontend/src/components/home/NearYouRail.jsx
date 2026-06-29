/**
 * NearYouRail — the "Near You" surface (audit Slice 2).
 *
 * Renders GET /api/v1/near-you (read-only aggregation: jobs · services · WANTED demand
 * · sponsors, urgency+proximity ranked). Mounted in the Home pillar rail like
 * SponsorCorner (community = the right home for a cross-tenant board). Fetch on mount +
 * on tab-focus (no fixed poll — connection-friendly for metered rural data). Honest
 * empty/offline/no-GPS states. Cards deep-link to the owning surface (per-item detail
 * pages don't exist yet → list view, per the design's fallback). compact=true → narrow.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MapPin, RefreshCw, Radar, ChevronRight } from "lucide-react";
import { getJSON } from "../../utils/api";

// Per-item detail routes don't exist; resolve to the owning LIST surface by type.
const ROUTE_FOR = { JOB: "/home/work", SERVICE: "/home/work", SPONSOR: "/home/work", BUYER_DEMAND: "/home/marketplace" };

function tierOf(score) {
  if (score >= 90) return { label: "Urgent", color: "#9a3b3b", bg: "#fbedea" };
  if (score >= 70) return { label: "Soon", color: "#7a5b14", bg: "#f7eccf" };
  return { label: "Open", color: "var(--green-dk)", bg: "var(--green-tint)" };
}
function whenLabel(iso) {
  if (!iso) return null;
  const days = Math.ceil((new Date(iso) - new Date()) / 86400000);
  if (days < 0) return null;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 30) return `in ${days} d`;
  return null;
}
function agoLabel(ts) {
  if (!ts) return "";
  const m = Math.floor((Date.now() - ts) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
}

export default function NearYouRail({ compact = false }) {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);   // null = first load
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState(false);
  const [ts, setTs] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const r = await getJSON("/api/v1/near-you?limit=6");
      setItems(r?.data?.items || []); setMeta(r?.meta || {}); setErr(false); setTs(Date.now());
    } catch { setErr(true); }   // keep last-good items if we had them
    finally { setBusy(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  // First load still in flight → don't flash an empty box.
  if (items == null && !err) return null;

  const radius = meta?.radius_km ?? 50;
  const Header = (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
      <Radar size={15} style={{ color: "var(--green-dk)" }} />
      <span style={{ fontWeight: 800, fontSize: 13, color: "var(--soil)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Near you</span>
      <button onClick={load} aria-label="Refresh needs near you" title={ts ? `Updated ${agoLabel(ts)}` : "Refresh"}
        style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11 }}>
        <RefreshCw size={12} style={{ animation: busy ? "spin 0.8s linear infinite" : "none" }} />{ts ? agoLabel(ts) : ""}
      </button>
    </div>
  );

  let inner;
  if (items == null) {
    inner = (
      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
        Couldn&apos;t load needs near you.
        <button onClick={load} className="btn btn-secondary btn-sm" style={{ marginTop: 8, width: "100%" }}>Try again</button>
      </div>
    );
  } else if (items.length === 0) {
    inner = (
      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.55 }}>
        No open needs within {radius} km right now.
        {meta?.has_origin === false && <div style={{ marginTop: 6 }}>Set your farm location to sort needs by distance.</div>}
        {err && <div style={{ marginTop: 6, color: "var(--amber)" }}>Showing last loaded — couldn&apos;t refresh.</div>}
      </div>
    );
  } else {
    inner = (
      <div style={{ display: "flex", flexDirection: compact ? "row" : "column", gap: 8, overflowX: compact ? "auto" : "visible", WebkitOverflowScrolling: "touch" }}>
        {items.map((it) => {
          const t = tierOf(it.urgency?.score || 0);
          const dist = it.geo?.distance_km != null ? `${it.geo.distance_km} km`
            : (it.geo?.distance_basis === "ISLAND_APPROX" && it.geo?.island) ? `~${it.geo.island}`
            : it.geo?.island || null;
          const when = whenLabel(it.needed_by);
          return (
            <button key={it.item_id} onClick={() => navigate(ROUTE_FOR[it.type] || "/home/work")}
              style={{ textAlign: "left", border: "1px solid var(--line)", borderRadius: 10, padding: "10px 11px", background: "var(--paper)", cursor: "pointer", minWidth: compact ? 230 : "auto", flexShrink: 0, display: "block" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 9.5, fontWeight: 800, color: t.color, background: t.bg, borderRadius: 4, padding: "1px 6px", letterSpacing: "0.03em" }}>{t.label}</span>
                {it.sponsored && <span style={{ fontSize: 8.5, fontWeight: 800, color: "var(--muted)", border: "1px solid var(--line)", borderRadius: 4, padding: "1px 5px" }}>SPONSORED</span>}
                <ChevronRight size={13} style={{ marginLeft: "auto", color: "var(--muted)" }} />
              </div>
              <div style={{ fontWeight: 700, fontSize: 13, color: "var(--soil)", lineHeight: 1.3 }}>{it.title}</div>
              {it.subtitle && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.subtitle}</div>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, fontSize: 11, color: "var(--muted)" }}>
                {dist && <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}><MapPin size={11} />{dist}</span>}
                {when && <span>· {when}</span>}
                {it.amount != null && <span>· {it.currency || "FJD"} {it.amount}</span>}
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: compact ? 14 : 14 }}>
      {Header}
      {inner}
    </div>
  );
}
