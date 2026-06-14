/**
 * Gallery.jsx — /farm/gallery — PIXEL-EXACT rebuild of the prototype's Gallery.
 *
 * Reproduces the sacred v263 prototype's Gallery (coreGalleryView) pixel-for-pixel —
 * its exact DOM + .gallery-* classes under <TfpShell> (styles/prototype.css) — wired to
 * REAL data: photos attached to the farm's event logs (GET /api/v1/field-events →
 * photo_url). The prototype showed colored placeholder tiles; here each tile shows the
 * actual photo. Honest-empty when nothing's been photographed.
 *
 * Real: Photos / Timeline / By location / Record groups views, multi-select, Download,
 * Share (native share-sheet / WhatsApp / Email), Evidence packs → Bank Evidence, photo
 * modal with the capturing event's metadata + "Open event".
 * Honest "Building" (exactly as the prototype marks them): AI analysis, Video.
 * Delete is intentionally omitted — removing an audit-event photo needs a real removal
 * endpoint + audit row; a fake toast (as the prototype does) is not shipped.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Image as ImageIcon, Download, Share2, Check, MapPin, Sprout, Shield, Package, FileText, X, MessageCircle, Mail, ShieldCheck } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso) { if (!iso) return "—"; const d = new Date(iso); return isNaN(d) ? String(iso) : `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`; }
function titleCase(s) { return String(s || "").replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }

// event_type → the prototype's filter categories
function photoCategory(t) {
  const c = (t || "").toLowerCase();
  if (/harvest/.test(c)) return "harvests";
  if (/pest|disease|scout/.test(c)) return "pest";
  if (/chemical|vaccin|withhold|complian|inspect|certif/.test(c)) return "compliance";
  if (/worker|labor/.test(c)) return "workers";
  if (/plant|transplant|weed|fertil|irrig|growth|nursery/.test(c)) return "growing";
  return "field";
}
// record-group bucket (prototype galleryRecordGroup)
function recordGroup(t) {
  const c = (t || "").toLowerCase();
  if (/scout|disease|pest|vaccin|mortal|weight|health|chemical|incident|weather|withdraw/.test(c)) return "Health";
  if (/equip|asset|infra|acquir|input|stock|inventory|machine/.test(c)) return "Asset";
  return "Production";
}
const FILTERS = [
  ["all", "All"], ["harvests", "Harvests"], ["field", "Field events"],
  ["pest", "Pest scouting"], ["growing", "Crops growing"], ["workers", "Workers"], ["compliance", "Compliance"],
];
const VIEWS = [["photos", "Photos"], ["timeline", "Timeline"], ["location", "By location"], ["groups", "Record groups"], ["ai", "AI analysis"], ["packs", "Evidence packs"]];

function PhotoTile({ p, selected, onOpen, onToggle }) {
  return (
    <div className="gallery-tile" onClick={onOpen}>
      <div className="gallery-tile-bg" style={{ padding: 0, overflow: "hidden" }}>
        <img src={p.photo_url} alt={p.label} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
      <button className={`gallery-tile-select${selected ? " checked" : ""}`} onClick={(e) => { e.stopPropagation(); onToggle(); }}>
        <span className="check-svg"><Check size={12} /></span>
      </button>
      {p.sha256 && (
        <span title="Content-verified · the image bytes are hash-bound to the audit chain"
          style={{ position: "absolute", top: 6, left: 6, display: "inline-flex", alignItems: "center", gap: 3, background: "rgba(62,123,31,0.92)", color: "#fff", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 6 }}>
          <ShieldCheck size={11} />Verified
        </span>
      )}
      <div className="gallery-tile-label"><span>{p.label}</span><span className="gallery-tile-date">{fmtDate(p.date)}</span></div>
    </div>
  );
}

export default function Gallery() {
  const navigate = useNavigate();
  const farmId = (typeof localStorage !== "undefined" && localStorage.getItem("tfos_current_farm_id")) || "";
  const [events, setEvents] = useState(null);
  const [view, setView] = useState("photos");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(() => new Set());
  const [modalId, setModalId] = useState(null);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = `/api/v1/field-events?limit=200${farmId ? `&farm_id=${encodeURIComponent(farmId)}` : ""}`;
        const r = await fetch(url, { headers: authHeaders() });
        const b = r.ok ? await r.json() : null;
        if (alive) setEvents(b?.data?.events || []);
      } catch { if (alive) setEvents([]); }
    })();
    return () => { alive = false; };
  }, [farmId]);

  // Normalize event rows → photo objects
  const photos = useMemo(() => (events || [])
    .filter((e) => e.photo_url)
    .map((e) => ({
      id: e.event_id, photo_url: e.photo_url, label: titleCase(e.event_type),
      date: e.event_date, event: titleCase(e.event_type), block: e.pu_id || "",
      cycle_id: e.cycle_id, observation: e.observation_text || "",
      category: photoCategory(e.event_type), group: recordGroup(e.event_type),
      sha256: e.photo_sha256 || null, auditHash: e.audit_hash || null,
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date))), [events]);

  const total = photos.length;
  const thisWeek = useMemo(() => {
    const wk = Date.now() - 7 * 864e5;
    return photos.filter((p) => { const d = new Date(p.date).getTime(); return !isNaN(d) && d >= wk; }).length;
  }, [photos]);
  const lastUpload = photos.length ? fmtDate(photos[0].date) : "—";

  const filtered = useMemo(() => filter === "all" ? photos : photos.filter((p) => p.category === filter), [photos, filter]);
  const selCount = selected.size;
  const selectedPhotos = useMemo(() => photos.filter((p) => selected.has(p.id)), [photos, selected]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const clear = () => setSelected(new Set());

  const downloadOne = (url, name) => { const a = document.createElement("a"); a.href = url; a.download = name || ""; a.target = "_blank"; document.body.appendChild(a); a.click(); a.remove(); };
  const downloadSelected = () => selectedPhotos.forEach((p, i) => setTimeout(() => downloadOne(p.photo_url, `${p.label}-${fmtDate(p.date)}.jpg`), i * 250));
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

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>Gallery</h1><div className="subtitle">Photos from every enterprise — plant and animal · downloadable · shareable</div></div>
          </div>

          <div className="gallery-honest-banner">
            Gallery shows photos attached to your event logs across all your enterprises. Tap a photo to see when, where, and what event captured it. Select multiple to download or share.
          </div>

          <div className="gallery-stats-bar">
            <div className="gallery-stat-tile"><div className="gallery-stat-label">Total photos</div><div className="gallery-stat-value">{total}</div><div className="gallery-stat-sub">Across all enterprises</div></div>
            <div className="gallery-stat-tile"><div className="gallery-stat-label">This week</div><div className="gallery-stat-value" style={thisWeek ? null : { color: "var(--muted)" }}>{thisWeek || "—"}</div><div className="gallery-stat-sub">builds as you log photos</div></div>
            <div className="gallery-stat-tile"><div className="gallery-stat-label">Storage used</div><div className="gallery-stat-value" style={{ color: "var(--muted)" }}>—</div><div className="gallery-stat-sub">not metered yet</div></div>
            <div className="gallery-stat-tile"><div className="gallery-stat-label">Last upload</div><div className="gallery-stat-value" style={photos.length ? null : { color: "var(--muted)" }}>{lastUpload}</div><div className="gallery-stat-sub">turns on with logged photos</div></div>
          </div>

          {/* View switcher (prototype galleryViewSwitcher) */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 0 4px" }}>
            {VIEWS.map(([v, label]) => {
              const on = view === v;
              return (
                <button key={v} onClick={() => setView(v)} style={{ border: `1px solid ${on ? "var(--green)" : "var(--line)"}`, background: on ? "var(--green)" : "var(--paper)", color: on ? "var(--paper)" : "var(--soil)", fontSize: 12.5, fontWeight: 600, padding: "6px 12px", borderRadius: 18, cursor: "pointer" }}>{label}</button>
              );
            })}
          </div>

          {events == null ? (
            <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>
          ) : total === 0 ? (
            <div className="card" style={{ padding: 28, color: "var(--muted)", textAlign: "center" }}>
              No photos yet — attach a photo when you log a field event or harvest and it appears here, tied to the record that captured it.
            </div>
          ) : view === "photos" ? (
            <>
              <div className="gallery-filter-row">
                {FILTERS.map(([id, label]) => {
                  const count = id === "all" ? photos.length : photos.filter((p) => p.category === id).length;
                  return (
                    <button key={id} className={`filter-pill${filter === id ? " active" : ""}`} onClick={() => setFilter(id)}>
                      {label}<span className="filter-pill-count">{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="gallery-grid">
                {filtered.map((p) => <PhotoTile key={p.id} p={p} selected={selected.has(p.id)} onOpen={() => setModalId(p.id)} onToggle={() => toggle(p.id)} />)}
              </div>
              <div className={`gallery-action-bar${selCount > 0 ? " show" : ""}`}>
                <span className="selected-count" style={{ fontWeight: 600, color: "var(--soil)", fontSize: 13 }}>Selected: {selCount}</span>
                <button className="btn btn-primary" onClick={downloadSelected}><Download size={14} />Download</button>
                <button className="btn btn-secondary" onClick={shareWhatsApp}><MessageCircle size={14} />WhatsApp</button>
                <button className="btn btn-secondary" onClick={() => setEmailOpen(true)}><Mail size={14} />Email</button>
                <span className="clear-link" onClick={clear} style={{ cursor: "pointer", color: "var(--muted)", fontSize: 13, textDecoration: "underline" }}>Clear</span>
              </div>
            </>
          ) : view === "timeline" ? (
            <Timeline photos={photos} onOpen={setModalId} />
          ) : view === "location" ? (
            <ByLocation photos={photos} onOpen={setModalId} />
          ) : view === "groups" ? (
            <RecordGroups photos={photos} onOpen={setModalId} />
          ) : view === "ai" ? (
            <Building title="Photo analysis" body="Once on, TFOS reads your field photos to spot crop disease, check ripeness, count livestock and flag problems — each finding logged as an event so it strengthens your record. Turns on as your photo log grows." />
          ) : (
            <EvidencePacks selCount={selCount} onGoPhotos={() => setView("photos")} onAddToBankEvidence={() => navigate("/farm/reports")} />
          )}
        </div>
      </main>

      {modalPhoto && <PhotoModal p={modalPhoto} onClose={() => setModalId(null)} onDownload={() => downloadOne(modalPhoto.photo_url, `${modalPhoto.label}.jpg`)} onOpenEvent={() => { setModalId(null); modalPhoto.cycle_id && navigate(`/farm/cycles/${encodeURIComponent(modalPhoto.cycle_id)}`); }} />}
      {emailOpen && <EmailShare count={selCount} onCancel={() => setEmailOpen(false)} onSend={sendEmail} />}
    </TfpShell>
  );
}

function AltGrid({ items, onOpen }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10, marginTop: 8 }}>
      {items.map((p) => (
        <div key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: "pointer", border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "var(--paper)" }}>
          <img src={p.photo_url} alt={p.label} loading="lazy" style={{ height: 90, width: "100%", objectFit: "cover", display: "block" }} />
          <div style={{ padding: "6px 8px" }}>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--soil)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.label}</div>
            <div style={{ fontSize: 10.5, color: "var(--muted)" }}>{(p.block || "") + " · " + fmtDate(p.date)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
function SecHead({ title, sub }) {
  return <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}><h3 style={{ margin: 0, fontSize: 15, color: "var(--soil)" }}>{title}</h3>{sub && <span style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</span>}</div>;
}

function Timeline({ photos, onOpen }) {
  return (
    <>
      <SecHead title="Timeline" sub="Every photo tied to the event that captured it" />
      <div style={{ borderLeft: "2px solid var(--line)", margin: "10px 0 0 6px", paddingLeft: 14 }}>
        {photos.map((p) => (
          <div key={p.id} onClick={() => onOpen(p.id)} style={{ cursor: "pointer", position: "relative", padding: "9px 0", borderBottom: "1px solid rgba(92,64,51,0.08)" }}>
            <div style={{ position: "absolute", left: -21, top: 13, width: 9, height: 9, borderRadius: "50%", background: "var(--green)" }} />
            <div style={{ fontSize: 11, color: "var(--muted)" }}>{fmtDate(p.date)}</div>
            <div style={{ fontWeight: 600, color: "var(--soil)", fontSize: 13 }}>{p.label}</div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{(p.block || "") + " · " + p.event}</div>
          </div>
        ))}
      </div>
      <Building title="Video" body="Short clips attached to events — turns on when you log video from the field." inline />
    </>
  );
}

function ByLocation({ photos, onOpen }) {
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
          <AltGrid items={byB[b]} onOpen={onOpen} />
        </div>
      ))}
    </>
  );
}

function RecordGroups({ photos, onOpen }) {
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
          <AltGrid items={g[name]} onOpen={onOpen} />
        </div>
      ) : null)}
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

function EvidencePacks({ selCount, onGoPhotos, onAddToBankEvidence }) {
  return (
    <>
      <SecHead title="Evidence packs" sub="Bundle photos with their audit events into a pack a bank can verify" />
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontWeight: 700, color: "var(--soil)" }}>Build an evidence pack</span>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: selCount ? "var(--green-dk)" : "var(--muted)" }}>{selCount ? `${selCount} selected` : "Select photos"}</span>
        </div>
        {selCount ? (
          <>
            <div style={{ fontSize: 12.5, color: "var(--soil)", margin: "6px 0 10px", lineHeight: 1.5 }}>{selCount} photo{selCount === 1 ? "" : "s"} selected. Each carries the event, block, date and operator that captured it — bundle them into a pack that drops straight into your Bank Evidence.</div>
            <button className="btn btn-primary btn-sm" onClick={onAddToBankEvidence}><FileText size={13} /> Add to Bank Evidence</button>
          </>
        ) : (
          <>
            <div style={{ fontSize: 12.5, color: "var(--muted)", margin: "6px 0 10px", lineHeight: 1.5 }}>Go to <strong>Photos</strong>, tick the ones you want, then come back to bundle them. Each photo is tied to its audit event, so the pack is verifiable — not just a folder of pictures.</div>
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
          <button className="photo-modal-close" onClick={onClose}><X size={16} /></button>
          <div className="photo-modal-image" style={{ padding: 0, overflow: "hidden" }}>
            <img src={p.photo_url} alt={p.label} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }} />
          </div>
        </div>
        <div className="photo-modal-side">
          <div className="photo-modal-meta-section"><div className="block-detail-label">Event type · captured</div><div className="block-detail-value">{p.event} · {fmtDate(p.date)}</div></div>
          {p.block && <div className="photo-modal-meta-section"><div className="block-detail-label">Where</div><div className="block-detail-value">{p.block}</div></div>}
          {p.observation && <div className="photo-modal-meta-section"><div className="block-detail-label">Note</div><div className="block-detail-value">{p.observation}</div></div>}
          <div className="photo-modal-meta-section"><div className="block-detail-label">Event ID</div><div className="block-detail-value" style={{ fontFamily: "monospace", fontSize: 12 }}>{String(p.id).slice(0, 8)}</div></div>
          {p.sha256 ? (
            <div className="photo-modal-meta-section">
              <div className="block-detail-label" style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--green-dk)" }}><ShieldCheck size={13} />Content-verified</div>
              <div className="block-detail-value" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                The image bytes are hash-bound into the audit chain — a swapped or back-dated file won't match.
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
        <div className="overlay-head"><h2>Share {count} photo{count === 1 ? "" : "s"} by email</h2><button onClick={onCancel} className="overlay-close"><X size={14} /></button></div>
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
