/**
 * Gallery.jsx — /farm/gallery — photos from the farm's event logs, redesigned (audit-approved 2026-06-27).
 *
 * Prototype's gallery (coreGalleryView) under <TfpShell>, wired to REAL data: photos attached to
 * field-event logs (GET /api/v1/field-events → photo_url), now PAGED (no 200 cap). Fixes from the audit:
 *  - honest copy: "field & event logs" (NOT "every enterprise" — harvest/animal photo sources are a
 *    named backend follow-up; the harvests list GET doesn't return photo_url yet, poultry has none);
 *  - unified tile (tamper-evident badge + geotag chip + select + keyboard) across ALL views; action
 *    bar works in any view; "Verified only" filter + precise "Tamper-evident" wording (byte-integrity
 *    since logging, not capture authenticity); 401 ≠ empty; Fiji dates; captured-by + GPS + map link
 *    in the modal; <img> error fallback; real downloadable evidence pack (photos + verify manifest).
 * Honest "Building" (as the prototype marks): AI analysis, Video. Delete omitted (needs a real endpoint).
 */
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Image as ImageIcon, Download, Share2, Check, MapPin, Sprout, Shield, Package, FileText, X, MessageCircle, Mail, ShieldCheck, Search, AlertTriangle, RefreshCw } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";

const FJ = "Pacific/Fiji";
const PAGE = 100;
function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
function fmtDate(iso) { if (!iso) return "—"; const d = new Date(iso); return isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("en-GB", { timeZone: FJ, day: "2-digit", month: "short", year: "2-digit" }); }
function titleCase(s) { return String(s || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
function cleanWho(...cands) { for (const c of cands) { if (c && !UUID_RE.test(String(c))) return String(c); } return "you"; }

function photoCategory(t) {
  const c = (t || "").toLowerCase();
  if (/harvest/.test(c)) return "harvests";
  if (/pest|disease|scout/.test(c)) return "pest";
  if (/chemical|spray|vaccin|withhold|complian|inspect|certif/.test(c)) return "compliance";
  if (/worker|labor/.test(c)) return "workers";
  if (/plant|transplant|weed|fertil|irrig|growth|nursery/.test(c)) return "growing";
  return "field";
}
function recordGroup(t) {
  const c = (t || "").toLowerCase();
  if (/scout|disease|pest|vaccin|mortal|weight|health|chemical|spray|incident|weather|withdraw/.test(c)) return "Health";
  if (/equip|asset|infra|acquir|input|stock|inventory|machine/.test(c)) return "Asset";
  return "Production";
}
const FILTERS = [
  ["all", "All"], ["harvests", "Harvests"], ["field", "Field events"],
  ["pest", "Pest scouting"], ["growing", "Crops growing"], ["workers", "Workers"], ["compliance", "Compliance"],
];
const VIEWS = [["photos", "Photos"], ["timeline", "Timeline"], ["location", "By location"], ["groups", "Record groups"], ["ai", "AI analysis"], ["packs", "Evidence packs"]];

// ── one tile, used in every grid view (badge + geotag + select + keyboard) ──
function PhotoTile({ p, selected, onOpen, onToggle }) {
  return (
    <div className="gallery-tile" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="gallery-tile-bg" style={{ padding: 0, overflow: "hidden" }}>
        <img src={p.photo_url} alt={p.label} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.display = "none"; }} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <button className={`gallery-tile-select${selected ? " checked" : ""}`} aria-label={selected ? "Deselect photo" : "Select photo"} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
        <span className="check-svg"><Check size={12} /></span>
      </button>
      <div style={{ position: "absolute", top: 6, left: 6, display: "flex", gap: 4 }}>
        {p.sha256 && (
          <span title="Tamper-evident — the image bytes are hash-bound to the audit chain since it was logged (not a guarantee of when/where it was taken)."
            style={{ display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(31,77,57,0.92)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6 }}><ShieldCheck size={11} />Verified</span>
        )}
        {p.gps && <span title={`Geotagged · ${p.gps.lat}, ${p.gps.lng}`} style={{ display: "inline-flex", alignItems: "center", background: "rgba(0,0,0,0.55)", color: "#fff", padding: "2px 5px", borderRadius: 6 }}><MapPin size={10} /></span>}
      </div>
      <div className="gallery-tile-label"><span>{p.label}</span><span className="gallery-tile-date">{fmtDate(p.date)}</span></div>
    </div>
  );
}
function Grid({ items, selected, onOpen, onToggle }) {
  return <div className="gallery-grid">{items.map((p) => <PhotoTile key={p.id} p={p} selected={selected.has(p.id)} onOpen={() => onOpen(p.id)} onToggle={() => onToggle(p.id)} />)}</div>;
}

export default function Gallery() {
  const navigate = useNavigate();
  const farmId = (typeof localStorage !== "undefined" && localStorage.getItem("tfos_current_farm_id")) || "";
  const [events, setEvents] = useState(null);
  const [loadErr, setLoadErr] = useState(false);     // distinct from empty (fixes 401 → "no photos")
  const [nextOffset, setNextOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [view, setView] = useState("photos");
  const [filter, setFilter] = useState("all");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [modalId, setModalId] = useState(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [render, setRender] = useState(60);   // client render cap (speed) — show in batches
  const [capped, setCapped] = useState(false);
  const [moreErr, setMoreErr] = useState(false);
  const autoLoads = useRef(0);

  const fetchPage = useCallback(async (offset) => {
    const url = `/api/v1/field-events?limit=${PAGE}&offset=${offset}${farmId ? `&farm_id=${encodeURIComponent(farmId)}` : ""}`;
    const r = await fetch(url, { headers: authHeaders() });
    if (!r.ok) throw new Error(String(r.status));
    const b = await r.json();
    return { rows: b?.data?.events || [], next: b?.meta?.next_offset ?? null };
  }, [farmId]);

  useEffect(() => {
    let alive = true;
    setEvents(null); setLoadErr(false); setNextOffset(0);
    (async () => {
      try { const { rows, next } = await fetchPage(0); if (alive) { setEvents(rows); setNextOffset(next); } }
      catch { if (alive) { setEvents([]); setLoadErr(true); } }
    })();
    return () => { alive = false; };
  }, [fetchPage]);

  const loadMore = async () => {
    if (nextOffset == null) return;
    setLoadingMore(true); setMoreErr(false);
    try { const { rows, next } = await fetchPage(nextOffset); setEvents((e) => [...(e || []), ...rows]); setNextOffset(next); }
    catch { setMoreErr(true); } finally { setLoadingMore(false); }
  };

  const photos = useMemo(() => (events || [])
    .filter((e) => e.photo_url)
    .map((e) => ({
      id: e.event_id, photo_url: e.photo_url, label: titleCase(e.event_type),
      date: e.event_date, event: titleCase(e.event_type), block: e.pu_id || "",
      cycle_id: e.cycle_id, observation: e.observation_text || "",
      category: photoCategory(e.event_type), group: recordGroup(e.event_type),
      sha256: e.photo_sha256 || null, auditHash: e.audit_hash || null,
      capturedBy: cleanWho(e.performed_by_worker_id, e.created_by),
      gps: (e.gps_lat != null && e.gps_lng != null) ? { lat: e.gps_lat, lng: e.gps_lng } : null,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date))), [events]);

  const total = photos.length;
  const verifiedCount = useMemo(() => photos.filter((p) => p.sha256).length, [photos]);
  const thisWeek = useMemo(() => { const wk = Date.now() - 7 * 864e5; return photos.filter((p) => { const d = new Date(p.date).getTime(); return !isNaN(d) && d >= wk; }).length; }, [photos]);
  const lastUpload = photos.length ? fmtDate(photos[0].date) : "—";

  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => photos.filter((p) =>
    (filter === "all" || p.category === filter) &&
    (!verifiedOnly || !!p.sha256) &&
    (!q || `${p.label} ${p.event} ${p.block} ${p.observation}`.toLowerCase().includes(q))
  ), [photos, filter, verifiedOnly, q]);

  // Trust-critical controls (Verified-only + text search) auto-exhaust paging so they cover
  // history, not just loaded pages — bounded + honest cap. Category pills stay loaded + manual.
  const exhausting = verifiedOnly || !!q;
  useEffect(() => { autoLoads.current = 0; setCapped(false); }, [q, verifiedOnly]);
  useEffect(() => {
    if (!exhausting || nextOffset == null || loadingMore) return;
    if (autoLoads.current < 15) { autoLoads.current += 1; loadMore(); }
    else setCapped(true);
  }, [exhausting, nextOffset, loadingMore, events]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setRender(60); }, [filter, verifiedOnly, q, view]);
  const shown = useMemo(() => filtered.slice(0, render), [filtered, render]);

  const selCount = selected.size;
  const selectedPhotos = useMemo(() => photos.filter((p) => selected.has(p.id)), [photos, selected]);
  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clear = () => setSelected(new Set());

  const downloadOne = (url, name) => { const a = document.createElement("a"); a.href = url; a.download = name || ""; a.target = "_blank"; document.body.appendChild(a); a.click(); a.remove(); };
  const downloadSelected = () => selectedPhotos.forEach((p, i) => setTimeout(() => downloadOne(p.photo_url, `${p.label}-${fmtDate(p.date)}.jpg`), i * 250));
  const downloadPack = () => {
    // real, verifiable manifest of the selection (photos download too)
    const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const head = ["Label", "Date", "Block", "Event ID", "SHA-256", "Verify URL"];
    const body = selectedPhotos.map((p) => [p.label, fmtDate(p.date), p.block, String(p.id).slice(0, 8), p.sha256 || "", p.auditHash ? `https://teivaka.com/verify/${p.auditHash}` : ""].map(esc).join(","));
    const url = URL.createObjectURL(new Blob([[head.map(esc).join(","), ...body].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `evidence-pack-manifest.csv`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    downloadSelected();
  };
  const shareWhatsApp = async () => {
    const urls = selectedPhotos.map((p) => new URL(p.photo_url, window.location.origin).href);
    const text = `${selCount} farm photo${selCount === 1 ? "" : "s"} from my TFOS record:\n${urls.join("\n")}`;
    if (navigator.share) { try { await navigator.share({ title: "Farm photos", text }); return; } catch { /* fall through */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };
  const sendEmail = (to, subject, note) => {
    const urls = selectedPhotos.map((p) => new URL(p.photo_url, window.location.origin).href).join("\n");
    const body = `${note ? note + "\n\n" : ""}${selCount} farm photo${selCount === 1 ? "" : "s"}:\n${urls}`;
    window.location.href = `mailto:${encodeURIComponent(to || "")}?subject=${encodeURIComponent(subject || "Farm photos")}&body=${encodeURIComponent(body)}`;
    setEmailOpen(false);
  };

  const modalPhoto = modalId ? photos.find((p) => p.id === modalId) : null;
  const tail = (
    <div style={{ textAlign: "center", margin: "14px 0", fontSize: 12, color: "var(--muted)" }} aria-live="polite">
      {render < filtered.length ? (
        <button className="btn btn-secondary" onClick={() => setRender((r) => r + 60)}>Show more ({filtered.length - render})</button>
      ) : exhausting && nextOffset != null && !capped ? (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><RefreshCw size={13} className="animate-spin" />Searching all your photos…</span>
      ) : capped ? (
        <span>Searched the most recent records — narrow the view (date/category) to go deeper.</span>
      ) : nextOffset != null ? (
        <button className="btn btn-secondary" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <><RefreshCw size={14} className="animate-spin" />Loading…</> : "Load more records"}</button>
      ) : null}
      {moreErr && <div style={{ color: "var(--red)", marginTop: 6, cursor: "pointer" }} onClick={loadMore}>Couldn't load more — tap to retry.</div>}
    </div>
  );

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>Gallery</h1><div className="subtitle">Photos from your field &amp; event logs · downloadable · shareable</div></div>
          </div>

          <div className="gallery-honest-banner">
            Gallery shows photos attached to your event logs. Tap a photo to see when, where, who captured it and which event. Select multiple to download or build an evidence pack. <em>Harvest and animal-enterprise photo sources join here as those flows gain photo capture.</em>
          </div>

          <div className="gallery-stats-bar">
            <div className="gallery-stat-tile"><div className="gallery-stat-label">Total photos</div><div className="gallery-stat-value">{total}</div><div className="gallery-stat-sub">{nextOffset != null ? "loaded so far" : "from your event logs"}</div></div>
            <div className="gallery-stat-tile"><div className="gallery-stat-label">This week</div><div className="gallery-stat-value" style={thisWeek ? null : { color: "var(--muted)" }}>{thisWeek || "—"}</div><div className="gallery-stat-sub">builds as you log photos</div></div>
            <div className="gallery-stat-tile"><div className="gallery-stat-label">Tamper-evident</div><div className="gallery-stat-value" style={verifiedCount ? { color: "var(--green-dk)" } : { color: "var(--muted)" }}>{verifiedCount || "—"}</div><div className="gallery-stat-sub">hash-bound to the chain</div></div>
            <div className="gallery-stat-tile"><div className="gallery-stat-label">Last upload</div><div className="gallery-stat-value" style={photos.length ? null : { color: "var(--muted)" }}>{lastUpload}</div><div className="gallery-stat-sub">turns on with logged photos</div></div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 4px" }}>
            {VIEWS.map(([v, label]) => {
              const on = view === v;
              return <button key={v} onClick={() => setView(v)} style={{ border: `1px solid ${on ? "var(--green)" : "var(--line)"}`, background: on ? "var(--green)" : "var(--paper)", color: on ? "var(--paper)" : "var(--soil)", fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 18, cursor: "pointer" }}>{label}</button>;
            })}
          </div>

          {events == null ? (
            <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
          ) : loadErr && total === 0 ? (
            <div className="card" style={{ padding: 24 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <AlertTriangle size={18} style={{ color: "var(--amber)", flexShrink: 0, marginTop: 2 }} />
                <div>
                  <div style={{ fontWeight: 700, color: "var(--soil)" }}>Couldn't load your photos</div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>This is a loading problem, not an empty gallery — your photos are safe. Try again.</div>
                  <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => window.location.reload()}><RefreshCw size={13} />Retry</button>
                </div>
              </div>
            </div>
          ) : total === 0 ? (
            <div className="card" style={{ padding: 28, color: "var(--muted)", textAlign: "center" }}>
              No photos yet — attach a photo when you log a field event or harvest and it appears here, tied to the record that captured it.
            </div>
          ) : view === "photos" ? (
            <>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0 4px" }}>
                <div style={{ position: "relative", flex: 1, minWidth: 160 }}>
                  <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search photos" placeholder="Search event, block, note…" style={{ width: "100%", padding: "8px 10px 8px 30px", border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} />
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--soil)", whiteSpace: "nowrap" }}>
                  <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />Verified only
                </label>
              </div>
              <div className="gallery-filter-row">
                {FILTERS.map(([id, label]) => {
                  const count = id === "all" ? photos.length : photos.filter((p) => p.category === id).length;
                  return <button key={id} className={`filter-pill${filter === id ? " active" : ""}`} onClick={() => setFilter(id)}>{label}<span className="filter-pill-count">{count}</span></button>;
                })}
              </div>
              <Grid items={shown} selected={selected} onOpen={setModalId} onToggle={toggle} />
              {tail}
            </>
          ) : view === "timeline" ? (
            <Timeline photos={shown} selected={selected} onOpen={setModalId} onToggle={toggle} more={tail} />
          ) : view === "location" ? (
            <ByLocation photos={shown} selected={selected} onOpen={setModalId} onToggle={toggle} more={tail} />
          ) : view === "groups" ? (
            <RecordGroups photos={shown} selected={selected} onOpen={setModalId} onToggle={toggle} more={tail} />
          ) : view === "ai" ? (
            <Building title="Photo analysis" body="Once on, TFOS reads your field photos to spot crop disease, check ripeness, count livestock and flag problems — each finding logged as an event so it strengthens your record. Turns on as your photo log grows." />
          ) : (
            <EvidencePacks selCount={selCount} onGoPhotos={() => setView("photos")} onDownloadPack={downloadPack} />
          )}

          {/* action bar — works in ANY view */}
          {selCount > 0 && (
            <div className="gallery-action-bar show">
              <span className="selected-count" style={{ fontWeight: 600, color: "var(--soil)", fontSize: 13 }}>Selected: {selCount}</span>
              <button className="btn btn-primary" onClick={downloadSelected}><Download size={14} />Download</button>
              <button className="btn btn-secondary" onClick={() => setView("packs")}><FileText size={14} />Evidence pack</button>
              <button className="btn btn-secondary" onClick={shareWhatsApp}><MessageCircle size={14} />WhatsApp</button>
              <button className="btn btn-secondary" onClick={() => setEmailOpen(true)}><Mail size={14} />Email</button>
              <span className="clear-link" onClick={clear} style={{ cursor: "pointer", color: "var(--muted)", fontSize: 13, textDecoration: "underline" }}>Clear</span>
            </div>
          )}
        </div>
      </main>

      {modalPhoto && <PhotoModal p={modalPhoto} onClose={() => setModalId(null)} onDownload={() => downloadOne(modalPhoto.photo_url, `${modalPhoto.label}.jpg`)} onOpenEvent={() => { setModalId(null); modalPhoto.cycle_id && navigate(`/farm/cycles/${encodeURIComponent(modalPhoto.cycle_id)}`); }} />}
      {emailOpen && <EmailShare count={selCount} onCancel={() => setEmailOpen(false)} onSend={sendEmail} />}
    </TfpShell>
  );
}

function AltGrid({ items, selected, onOpen, onToggle }) {
  return <div className="gallery-grid">{items.map((p) => <PhotoTile key={p.id} p={p} selected={selected.has(p.id)} onOpen={() => onOpen(p.id)} onToggle={() => onToggle(p.id)} />)}</div>;
}
function SecHead({ title, sub }) {
  return <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}><h3 style={{ margin: 0, fontSize: 15, color: "var(--soil)" }}>{title}</h3>{sub && <span style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</span>}</div>;
}
function Timeline({ photos, selected, onOpen, onToggle, more }) {
  const byDay = {};
  photos.forEach((p) => { (byDay[fmtDate(p.date)] = byDay[fmtDate(p.date)] || []).push(p); });
  return (
    <>
      <SecHead title="Timeline" sub="Every photo tied to the event that captured it" />
      {Object.keys(byDay).map((d) => (
        <div key={d} style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, color: "var(--soil)", fontSize: 13 }}>{d}</div>
          <AltGrid items={byDay[d]} selected={selected} onOpen={onOpen} onToggle={onToggle} />
        </div>
      ))}
      {more}
    </>
  );
}
function ByLocation({ photos, selected, onOpen, onToggle, more }) {
  const byB = {};
  photos.forEach((p) => { const b = p.block || "Whole farm"; (byB[b] = byB[b] || []).push(p); });
  return (
    <>
      <SecHead title="By location" sub="Photos grouped by the block they were taken on" />
      {Object.keys(byB).map((b) => (
        <div key={b} style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, color: "var(--soil)", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: "var(--green)" }}><MapPin size={14} /></span>{b} <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 500 }}>{byB[b].length} photo{byB[b].length === 1 ? "" : "s"}</span>
          </div>
          <AltGrid items={byB[b]} selected={selected} onOpen={onOpen} onToggle={onToggle} />
        </div>
      ))}
      {more}
    </>
  );
}
function RecordGroups({ photos, selected, onOpen, onToggle, more }) {
  const g = { Production: [], Health: [], Asset: [] };
  photos.forEach((p) => g[p.group].push(p));
  const rows = [["Production", Sprout], ["Health", Shield], ["Asset", Package]];
  return (
    <>
      <SecHead title="Record groups" sub="Grouped by what the photo documents" />
      {rows.map(([name, Icon]) => g[name].length ? (
        <div key={name} style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700, color: "var(--soil)", fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ color: "var(--green)" }}><Icon size={14} /></span>{name} <span style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 500 }}>{g[name].length}</span>
          </div>
          <AltGrid items={g[name]} selected={selected} onOpen={onOpen} onToggle={onToggle} />
        </div>
      ) : null)}
      {more}
    </>
  );
}
function Building({ title, body, inline }) {
  return (
    <div className="card" style={{ padding: "14px 16px", marginTop: inline ? 12 : 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontWeight: 700, color: "var(--soil)" }}>{title}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>Building</span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "6px 0 0", lineHeight: 1.5 }}>{body}</div>
    </div>
  );
}
function EvidencePacks({ selCount, onGoPhotos, onDownloadPack }) {
  return (
    <>
      <SecHead title="Evidence packs" sub="Bundle photos with their audit events into a pack a bank can verify" />
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, color: "var(--soil)" }}>Build an evidence pack</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: selCount ? "var(--green-dk)" : "var(--muted)" }}>{selCount ? `${selCount} selected` : "Select photos first"}</span>
        </div>
        {selCount ? (
          <>
            <div style={{ fontSize: 12.5, color: "var(--soil)", margin: "6px 0 10px", lineHeight: 1.5 }}>{selCount} photo{selCount === 1 ? "" : "s"} selected. Download the photos plus a manifest listing each one's event, block, date and verify link — a pack a bank can independently check.</div>
            <button className="btn btn-primary btn-sm" onClick={onDownloadPack}><Download size={13} /> Download evidence pack</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "6px 0 10px", lineHeight: 1.5 }}>Go to <strong>Photos</strong>, tick the ones you want, then come back. Each photo is tied to its audit event, so the pack is verifiable — not just a folder of pictures.</div>
            <button className="btn btn-secondary btn-sm" onClick={onGoPhotos}><ImageIcon size={13} /> Go to photos</button>
          </>
        )}
      </div>
    </>
  );
}
function PhotoModal({ p, onClose, onDownload, onOpenEvent }) {
  return (
    <div className="photo-modal-overlay open" onClick={onClose}>
      <div className="photo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="photo-modal-main">
          <button className="photo-modal-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
          <div className="photo-modal-image" style={{ padding: 0, overflow: "hidden" }}>
            <img src={p.photo_url} alt={p.label} onError={(e) => { e.currentTarget.style.opacity = 0.3; }} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
          </div>
        </div>
        <div className="photo-modal-side">
          <div className="photo-modal-meta-section"><div className="block-detail-label">Event type · captured</div><div className="block-detail-value">{p.event} · {fmtDate(p.date)}</div></div>
          {p.block && <div className="photo-modal-meta-section"><div className="block-detail-label">Where</div><div className="block-detail-value">{p.block}{p.gps && <> · <a href={`https://www.openstreetmap.org/?mlat=${p.gps.lat}&mlon=${p.gps.lng}#map=16/${p.gps.lat}/${p.gps.lng}`} target="_blank" rel="noreferrer" style={{ color: "var(--green-dk)" }}>📍 map</a></>}</div></div>}
          <div className="photo-modal-meta-section"><div className="block-detail-label">Captured by</div><div className="block-detail-value">{p.capturedBy}</div></div>
          {p.observation && <div className="photo-modal-meta-section"><div className="block-detail-label">Note</div><div className="block-detail-value">{p.observation}</div></div>}
          <div className="photo-modal-meta-section"><div className="block-detail-label">Event ID</div><div className="block-detail-value" style={{ fontFamily: "monospace", fontSize: 12 }}>{String(p.id).slice(0, 8)}</div></div>
          {p.sha256 ? (
            <div className="photo-modal-meta-section">
              <div className="block-detail-label" style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--green-dk)" }}><ShieldCheck size={13} />Tamper-evident</div>
              <div className="block-detail-value" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                The image bytes are hash-bound into the audit chain since logging — a swapped or altered file won't match. (This proves the file is unchanged, not when or where it was taken.)
                <div style={{ fontFamily: "monospace", fontSize: 10.5, color: "var(--muted)", wordBreak: "break-all", marginTop: 4 }}>SHA-256: {p.sha256}</div>
              </div>
            </div>
          ) : (
            <div className="photo-modal-meta-section"><div className="block-detail-label">Provenance</div><div className="block-detail-value" style={{ fontSize: 11.5, color: "var(--muted)" }}>Logged with its event. Content-hash binding applies to photos logged after this feature shipped.</div></div>
          )}
          <div className="photo-modal-actions">
            <button className="btn btn-primary" onClick={onDownload}><Download size={14} />Download</button>
            {p.auditHash && <a className="btn btn-secondary" href={`/verify/${encodeURIComponent(p.auditHash)}`} target="_blank" rel="noopener noreferrer"><ShieldCheck size={14} />Verify</a>}
            {p.cycle_id && <button className="btn btn-secondary" onClick={onOpenEvent}><Share2 size={14} />Open event</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
function EmailShare({ count, onCancel, onSend }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Farm photos");
  const [note, setNote] = useState("");
  return (
    <div className="overlay-backdrop show" onClick={onCancel}>
      <div className="overlay-modal" onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Share {count} photo{count === 1 ? "" : "s"} by email</h2><button onClick={onCancel} className="overlay-close" aria-label="Close"><X size={14} /></button></div>
        <div className="overlay-body">
          <div className="form-row"><label>Recipient email</label><input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="banker@bsp.com.fj" /></div>
          <div className="form-row"><label>Subject</label><input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="form-row"><label>Note (optional)</label><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional message" /></div>
        </div>
        <div className="overlay-foot"><button className="btn btn-secondary" onClick={onCancel}>Cancel</button><button className="btn btn-primary" onClick={() => onSend(to, subject, note)}><Mail size={14} />Send</button></div>
      </div>
    </div>
  );
}
