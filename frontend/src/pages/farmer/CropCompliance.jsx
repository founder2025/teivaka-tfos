/**
 * CropCompliance.jsx — /farm/compliance — crop chemical-WHD compliance.
 *
 * Redesign (CO1–CO29): the enforcement GATE (harvest trigger, Inviolable #2) is real and
 * untouched — this is the read-only VIEW. Fixes the two worst sins: it no longer FAKES a clean
 * record on load failure (CO1–CO3 → ErrorCard/Retry, never green-on-error), and it no longer
 * HIDES mislogged/off-label applications (CO18/CO19 → surfaced as needs-attention). Adds a
 * one-answer verdict banner, real "Compliance standing" (not a fake score), api.js, Ask AI,
 * accessible tabs, shared Modal, dose/who/off-label in the register.
 *
 * Tabs: Status · Areas · Chemical register · Certifications · Overrides · Calendar · Analytics
 */
import { useState } from "react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useFormModal } from "../../context/FormModalContext";
import {
  Shield, Plus, Search, Clock, AlertTriangle, Check, HelpCircle, Lock, FlaskConical,
  List, Award, Activity, FileText, Sparkles, RefreshCw, Download, ShieldCheck, Layers,
} from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import Modal from "../../components/ui/Modal.jsx";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import FarmSelector from "../../components/farm/FarmSelector";
import { getJSON, apiFetch } from "../../utils/api";

function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }

// Authed file download (CSV export) — apiFetch attaches the token + refreshes on 401.
async function downloadFile(url, filename) {
  emitToast("Preparing download…");
  try {
    const r = await apiFetch(url);
    if (!r.ok) { emitToast("Download failed — please try again"); return; }
    const blob = await r.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = href; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
  } catch { emitToast("Download failed — check your connection"); }
}
const TABS = [
  ["status", "Status", "The gate"], ["areas", "Areas", "All standards"],
  ["register", "Chemical register", "Applications"], ["certs", "Certifications", "Certs"],
  ["overrides", "Overrides", "Ledger"], ["calendar", "Calendar", "Upcoming"],
  ["analytics", "Analytics", "Score"],
];

// Honest load-state gate — NEVER render a clean compliance state on error (CO1–CO3).
function QueryState({ q, children, label = "compliance" }) {
  if (q.isError && !q.data) {
    return (
      <div className="card" style={{ padding: 20, textAlign: "center", border: "1px solid #e7c9c9", background: "#fdf3f3" }}>
        <AlertTriangle size={20} style={{ color: "var(--red)" }} />
        <div style={{ fontSize: 13, color: "var(--soil)", margin: "6px 0 10px" }}>Couldn't load your {label}. This is a load error — not a clean record.</div>
        <button className="btn btn-secondary btn-sm" onClick={() => q.refetch()}><RefreshCw size={13} />Retry</button>
      </div>
    );
  }
  if (q.isLoading && !q.data) return <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>;
  return (
    <>
      {q.isError && q.data && <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#8a6d00", background: "#fff8e6", border: "1px solid #e8d27a", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}><AlertTriangle size={13} />Showing last loaded data — couldn't refresh. <button className="btn btn-secondary btn-sm" style={{ marginLeft: "auto" }} onClick={() => q.refetch()}>Retry</button></div>}
      {children}
    </>
  );
}

// Multi-farm rollup (CC7) — head-office view; only renders for >1 farm.
function RollupBanner({ rollupQ, currentFarmId, onPick }) {
  const data = rollupQ.data?.data;
  if (!data || (data.farms_total ?? 0) <= 1) return null;
  const flagged = data.farms.filter((f) => f.blocked > 0 || f.attention > 0);
  const anyIssue = flagged.length > 0;
  const clearN = data.farms_total - flagged.length;
  return (
    <div className="card" style={{ padding: "12px 14px", marginBottom: 12, borderLeft: `4px solid ${anyIssue ? "var(--amber)" : "var(--green-dk)"}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: "var(--soil)", fontSize: 13 }}><Layers size={14} style={{ color: "var(--green-dk)" }} />Across your {data.farms_total} farms</span>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{data.farms_with_holds} with holds · {data.farms_with_attention} need attention · {clearN} clear</span>
      </div>
      {anyIssue && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
          {flagged.slice(0, 12).map((f) => (
            <button key={f.farm_id} className="filter-pill" onClick={() => onPick(f.farm_id)} title={`Open ${f.farm_name}`}
              style={{ borderColor: f.blocked > 0 ? "var(--red)" : "var(--amber)", fontWeight: 600, ...(f.farm_id === currentFarmId ? { background: "var(--green-tint)" } : {}) }}>
              {f.farm_name} · {f.blocked > 0 ? `${f.blocked} blocked` : `${f.attention} attention`}
            </button>
          ))}
          {flagged.length > 12 && <span style={{ fontSize: 11.5, color: "var(--muted)" }}>+{flagged.length - 12} more farm{flagged.length - 12 === 1 ? "" : "s"} — use the farm switcher</span>}
        </div>
      )}
    </div>
  );
}

function DualLayer() {
  return (
    <div className="dual-layer-strip">
      <div className="dual-layer-main"><Shield size={16} />Dual-layer enforcement: ACTIVE</div>
      <div className="dual-layer-checks">
        <div className="dual-layer-check"><span className="dual-layer-dot" />Spray check</div>
        <div className="dual-layer-check"><span className="dual-layer-dot" />Permanent record check</div>
      </div>
    </div>
  );
}

// cls drives the prototype card border; amber states get their own accent so a
// warning never reads as a hard red block (CC8).
const STATE_META = {
  blocked: { color: "var(--red)", label: "Harvest blocked", Icon: AlertTriangle, cls: "blocked", accent: null },
  unknown: { color: "var(--amber)", label: "Needs attention", Icon: HelpCircle, cls: "clear", accent: "var(--amber)" },
  off_label: { color: "var(--amber)", label: "Off-label", Icon: AlertTriangle, cls: "clear", accent: "var(--amber)" },
  clear: { color: "var(--green-dk)", label: "Clear", Icon: Check, cls: "clear", accent: null },
};

// ── Status ───────────────────────────────────────────────────────────────────
function StatusView({ compQ, cycles, cyclesErr, overridesYtd, ovrErr, onOverride }) {
  const [filter, setFilter] = useState("all");
  const comp = compQ.data?.data || {};
  const blocks = comp.active_blocks ?? [];
  const checkedN = comp.checked_cycles ?? 0;
  const blockedSet = new Set(blocks.map((b) => b.cycle_id));
  const active = (cycles ?? []).filter((c) => ["PLANNED", "ACTIVE", "HARVESTING", "CLOSING"].includes(c.cycle_status || c.status));
  const clearCards = active.filter((c) => !blockedSet.has(c.cycle_id)).map((c) => ({
    cycle_id: c.cycle_id, state: "clear", block_name: c.farmer_label, crop: c.production_name || c.crop,
  }));
  const cards = [...blocks, ...clearCards];
  const blockedN = blocks.filter((b) => b.state === "blocked").length;
  const attentionN = blocks.length - blockedN;
  const clearN = clearCards.length;
  const empty = checkedN === 0;   // no active crops at all (CC1)
  const soonest = blocks.filter((b) => b.state === "blocked" && b.days_remaining != null).sort((a, b) => a.days_remaining - b.days_remaining)[0];

  const shown = filter === "all" ? cards
    : filter === "clear" ? cards.filter((x) => x.state === "clear")
    : filter === "blocked" ? cards.filter((x) => x.state === "blocked")
    : cards.filter((x) => x.state === "unknown" || x.state === "off_label");

  return (
    <QueryState q={compQ} label="compliance status">
      {/* Verdict — the one answer (cognitive load / decision) */}
      {empty ? (
        <div className="card" style={{ padding: "14px 16px", marginBottom: 12, borderLeft: "4px solid var(--line)", color: "var(--muted)" }}>
          <div style={{ fontWeight: 700, color: "var(--soil)", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}><FlaskConical size={16} />No active crops to check yet</div>
          <div style={{ fontSize: 12.5, marginTop: 3 }}>Plant a cycle and log any sprays — withholding holds and harvest-safe status appear here automatically.</div>
        </div>
      ) : blockedN > 0 ? (
        <div className="card" style={{ padding: "14px 16px", marginBottom: 12, borderLeft: "4px solid var(--red)", background: "#fdf3f3" }}>
          <div style={{ fontWeight: 800, color: "var(--red)", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}><AlertTriangle size={17} />{blockedN} block{blockedN === 1 ? "" : "s"} can't be sold yet</div>
          {soonest && <div style={{ fontSize: 12.5, color: "var(--soil)", marginTop: 3 }}>Next clears in {soonest.days_remaining} day{soonest.days_remaining === 1 ? "" : "s"} · {soonest.clear_date} ({soonest.block_name || "block"})</div>}
        </div>
      ) : attentionN > 0 ? (
        <div className="card" style={{ padding: "14px 16px", marginBottom: 12, borderLeft: "4px solid var(--amber)", background: "rgba(191,144,0,0.06)" }}>
          <div style={{ fontWeight: 800, color: "var(--amber)", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}><HelpCircle size={17} />{attentionN} block{attentionN === 1 ? "" : "s"} need attention</div>
          <div style={{ fontSize: 12.5, color: "var(--soil)", marginTop: 3 }}>A chemical wasn't fully identified or isn't registered for the crop — fix the log so its withholding period can protect your harvest.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: "14px 16px", marginBottom: 12, borderLeft: "4px solid var(--green-dk)", background: "rgba(45,106,79,0.05)" }}>
          <div style={{ fontWeight: 800, color: "var(--green-dk)", fontSize: 15, display: "flex", alignItems: "center", gap: 8 }}><Check size={17} />All active blocks are harvest-safe</div>
        </div>
      )}
      <DualLayer />
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", marginTop: 12 }}>
        <div className={`capital-tile ${blockedN > 0 ? "critical" : ""}`} style={{ cursor: "pointer" }} onClick={() => setFilter("blocked")}>
          <div className="capital-tile-label">Blocked now</div><div className="capital-tile-value" style={{ color: blockedN > 0 ? "var(--red)" : "var(--soil)" }}>{blockedN}</div><div className="capital-tile-sub">active WHD</div></div>
        <div className="capital-tile" style={{ cursor: "pointer" }} onClick={() => setFilter("attention")}>
          <div className="capital-tile-label">Needs attention</div><div className="capital-tile-value" style={{ color: attentionN > 0 ? "var(--amber)" : "var(--soil)" }}>{attentionN}</div><div className="capital-tile-sub">unidentified / off-label</div></div>
        <div className="capital-tile" style={{ cursor: "pointer" }} onClick={() => setFilter("clear")}>
          <div className="capital-tile-label">Harvest-safe</div><div className="capital-tile-value" style={{ color: "var(--green-dk)" }}>{cyclesErr ? "—" : clearN}</div><div className="capital-tile-sub">{cyclesErr ? "couldn't load" : "buyer-ready"}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Overrides (YTD)</div><div className="capital-tile-value" style={{ color: ovrErr ? "var(--muted)" : overridesYtd > 0 ? "var(--amber)" : "var(--soil)" }}>{ovrErr ? "—" : overridesYtd}</div><div className="capital-tile-sub">{ovrErr ? "couldn't load" : "each is a ding"}</div></div>
      </div>
      <div className="gallery-filter-row" style={{ margin: "12px 0" }}>
        {[["all", "All"], ["blocked", "Blocked"], ["attention", "Needs attention"], ["clear", "Clear"]].map(([k, l]) => (
          <button key={k} className={`filter-pill${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>
      {shown.length === 0 ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No cycles match this filter.</div> : (
        <div className="comp-block-grid">
          {shown.map((b) => {
            const m = STATE_META[b.state] || STATE_META.clear;
            return (
              <div key={b.cycle_id} className={`comp-block-card ${m.cls}`} style={m.accent ? { borderLeft: `4px solid ${m.accent}` } : undefined}>
                <div className="comp-block-head">
                  <div className={`comp-block-icon ${m.cls}`}><m.Icon size={18} /></div>
                  <div style={{ flex: 1 }}>
                    <div className="comp-block-name">{b.block_name || "Block"} · {b.crop || "Crop"}</div>
                    <div style={{ marginTop: 4 }}><span className={`comp-status-pill ${m.cls}`} style={{ color: m.color }}>{m.label}</span>{b.off_label && b.state !== "off_label" && <span className="comp-status-pill blocked" style={{ marginLeft: 6, color: "var(--amber)" }}>off-label</span>}</div>
                  </div>
                </div>
                {b.state === "blocked" && (
                  <>
                    <div className="comp-block-detail">{b.chemical} applied {b.applied_date} · WHD {b.whd_days ?? "?"} days · clears {b.clear_date}</div>
                    <div className={`whd-countdown${b.days_remaining <= 2 ? "" : " soon"}`}><Clock size={12} />Clears in {b.days_remaining} day{b.days_remaining === 1 ? "" : "s"} · {b.clear_date}</div>
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <button className="btn btn-secondary btn-sm" disabled style={{ opacity: 0.7 }}>Wait for clearance</button>
                      <button className="btn btn-sm" style={{ color: "var(--muted)", fontSize: 11 }} onClick={() => onOverride(b)}>Override…</button>
                    </div>
                  </>
                )}
                {b.state === "unknown" && (
                  <>
                    <div className="comp-block-detail">Chemical applied {b.applied_date} — <strong>not identified</strong>. Withholding period can't be computed, so this block is not confirmed safe.</div>
                    <div style={{ marginTop: 8 }}><button className="btn btn-primary btn-sm" onClick={() => onOverride({ ...b, fixLog: true })}>Fix the log</button></div>
                  </>
                )}
                {b.state === "off_label" && (
                  <>
                    <div className="comp-block-detail">{b.chemical} is <strong>not registered for {b.crop}</strong>. Off-label use is a regulatory + market risk — verify before selling.</div>
                  </>
                )}
                {b.state === "clear" && <div className="comp-buyer-ready"><Check size={11} />Buyer-ready</div>}
              </div>
            );
          })}
        </div>
      )}
    </QueryState>
  );
}

// ── Areas ────────────────────────────────────────────────────────────────────
function AreasView({ blocked, clear, setTab }) {
  const card = (Icon, title, statusLabel, color, desc, onClick) => (
    <div className="card" key={title} style={{ padding: "14px 16px", marginBottom: 12, cursor: onClick ? "pointer" : "default" }} onClick={onClick || undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{ display: "flex", gap: 9, alignItems: "center", fontWeight: 700, color: "var(--soil)" }}><span style={{ color: "var(--green)" }}><Icon size={17} /></span>{title}</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color }}>{statusLabel}</span>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{desc}</div>
    </div>
  );
  return (
    <>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12 }}>Every compliance area on your farm. Green areas are backed by your logged records; the rest build as you log — they are not yet tracked.</div>
      {card(FlaskConical, "Food safety", blocked ? `${blocked} on hold` : "Clear", blocked ? "var(--red)" : "var(--green-dk)", `Spray and withdrawal records keep unsafe produce off the market. ${clear} clear · ${blocked} on hold.`, () => setTab("status"))}
      {card(List, "Medicine & chemical usage", "Logged", "var(--green-dk)", "Every spray recorded with its withholding period — including any not yet identified.", () => setTab("register"))}
      {card(Award, "Export certificates", "Not tracked yet", "var(--muted)", "Organic, GAP and export certificate status. Being built — no placeholders shown.", () => setTab("certs"))}
      {card(Shield, "Audit trail", "Hash-linked", "var(--green-dk)", "Every chemical application hash-linked and tamper-proof.", () => setTab("register"))}
      {card(AlertTriangle, "Violations & holds", blocked ? `${blocked} active` : "None", blocked ? "var(--red)" : "var(--green-dk)", "Anything blocked from sale or harvest right now shows here.", () => setTab("status"))}
      {card(Activity, "Animal welfare & treatment", "Livestock page", "var(--muted)", "Poultry/livestock health, treatment withholding and welfare are tracked in livestock compliance.", null)}
      <div className="card" style={{ padding: "12px 16px", marginBottom: 12, fontSize: 12, color: "var(--muted)" }}>
        <strong style={{ color: "var(--soil)" }}>Not tracked yet:</strong> Biosecurity (visitor/quarantine logs), Environmental (waste, water, runoff), and Licenses &amp; permits (with expiry reminders). These build as the records behind them ship — shown here only when they hold real data, never as placeholders.
      </div>
    </>
  );
}

// ── Chemical register ────────────────────────────────────────────────────────
function RegisterView({ regQ, navigate, farmId }) {
  const [q, setQ] = useState("");
  const data = regQ.data?.data || {};
  const apps = data.applications ?? [];
  const activeWHD = apps.filter((a) => a.active).length;
  const flagged = apps.filter((a) => a.unspecified || a.off_label).length;
  const counts = {}; apps.forEach((a) => { counts[a.chemical] = (counts[a.chemical] || 0) + 1; });
  const most = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const filtered = q.trim() ? apps.filter((a) => `${a.chemical} ${a.block_name} ${a.crop} ${a.applied_by || ""}`.toLowerCase().includes(q.toLowerCase())) : apps;
  return (
    <QueryState q={regQ} label="chemical register">
      <div className="calendar-banner">Every chemical application is recorded against its block with the withholding period from the chemical library. Applications that aren't fully identified or are off-label are flagged, not hidden.</div>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))" }}>
        <div className="capital-tile"><div className="capital-tile-label">Applications</div><div className="capital-tile-value">{apps.length}</div><div className="capital-tile-sub">on record</div></div>
        <div className={`capital-tile ${activeWHD > 0 ? "low" : ""}`}><div className="capital-tile-label">Active WHDs</div><div className="capital-tile-value" style={{ color: activeWHD > 0 ? "var(--amber)" : "var(--soil)" }}>{activeWHD}</div></div>
        <div className={`capital-tile ${flagged > 0 ? "low" : ""}`}><div className="capital-tile-label">Flagged</div><div className="capital-tile-value" style={{ color: flagged > 0 ? "var(--amber)" : "var(--soil)" }}>{flagged}</div><div className="capital-tile-sub">unidentified/off-label</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Most used</div><div className="capital-tile-value" style={{ fontSize: 13 }}>{most ? most[0].split(" ")[0] : "—"}</div><div className="capital-tile-sub">{most ? `${most[1]} times` : ""}</div></div>
      </div>
      <div style={{ display: "flex", gap: 10, margin: "12px 0", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160, position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chemical, block, crop, who…" style={{ width: "100%", padding: "9px 12px 9px 36px", border: "1.5px solid var(--line)", borderRadius: 7, fontSize: 13, background: "var(--paper)" }} />
        </div>
        <button className="btn btn-secondary" disabled={apps.length === 0} title="Download the full register as CSV" onClick={() => downloadFile(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}/register.csv`, `chemical-register-${farmId}-${new Date().toLocaleDateString("en-CA", { timeZone: "Pacific/Fiji" })}.csv`)}><Download size={14} />CSV</button>
        <button className="btn btn-primary" onClick={() => navigate("/farm/field-events?type=CHEMICAL_APPLIED")}><Plus size={14} />Log chemical</button>
      </div>
      {filtered.length === 0 ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>No chemical applications recorded yet. Log one from the (+) Crops menu — every spray lands here with its withholding period.</div>
        : (
          <div style={{ overflowX: "auto", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 9 }}>
            <table className="comp-table">
              <thead><tr><th>Date</th><th>Chemical</th><th>Block</th><th>Crop</th><th>Dose</th><th>By</th><th>WHD</th><th>Clears</th><th>Verify</th></tr></thead>
              <tbody>
                {filtered.map((a) => (
                  <tr key={a.event_id}>
                    <td style={{ fontSize: 11 }}>{a.applied_date}</td>
                    <td>{a.chemical}{a.unspecified && <span title="Chemical not identified" style={{ color: "var(--amber)", fontWeight: 700 }}> ⚠</span>}{a.off_label && <span title="Off-label: not registered for this crop" style={{ color: "var(--amber)", fontWeight: 700 }}> ⚑</span>}{a.reg_unknown && <span title="Crop-registration data unavailable for this chemical" style={{ color: "var(--muted)", fontWeight: 700 }}> ·reg?</span>}</td>
                    <td style={{ fontSize: 11 }}>{a.block_name || "Block"}</td>
                    <td style={{ fontSize: 11.5 }}>{a.crop || "—"}</td>
                    <td style={{ fontSize: 11 }}>{a.dose != null ? `${a.dose}/L` : "—"}</td>
                    <td style={{ fontSize: 11 }}>{a.applied_by || "—"}</td>
                    <td style={{ fontFamily: "Menlo,monospace" }}>{a.whd_days != null ? `${a.whd_days}d` : "?"}</td>
                    <td style={{ fontSize: 11, ...(a.active ? { color: "var(--red)", fontWeight: 600 } : {}) }}>{a.clear_date || (a.unspecified ? "unknown" : "—")}{a.active ? " (active)" : ""}</td>
                    <td>{a.audit_hash ? <a href={`/verify/${encodeURIComponent(a.audit_hash)}`} target="_blank" rel="noreferrer" className="verification-badge" title="Open public verification" style={{ textDecoration: "none" }}><ShieldCheck size={11} />{a.hash}</a> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.capped && <div style={{ padding: "8px 12px", fontSize: 11, color: "var(--muted)" }}>Showing your latest 500 applications. Older records exist in your Bank Evidence pack.</div>}
          </div>
        )}
    </QueryState>
  );
}

// ── Certifications (honest — no certs backend yet) ────────────────────────────
function CertsView() {
  return (
    <div className="card" style={{ padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><Award size={16} style={{ color: "var(--green)" }} /><strong style={{ color: "var(--soil)" }}>Certifications</strong><span className="building-badge" style={{ marginLeft: "auto" }}>Not built yet</span></div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>Organic (POETCom), GAP and export certificates — with expiry tracking that auto-creates a renewal task — will register here. The certificate store isn't built yet; nothing is shown until it holds your real documents (no placeholders, no fake counts).</div>
    </div>
  );
}

// ── Overrides ────────────────────────────────────────────────────────────────
function OverridesView({ ovrQ }) {
  const data = ovrQ.data?.data || {};
  const list = data.overrides ?? [];
  return (
    <QueryState q={ovrQ} label="override ledger">
      <div className="page-header" style={{ paddingTop: 0 }}><div><h1 style={{ fontSize: 20 }}>Override history</h1><div className="subtitle">Every FOUNDER override · permanent record{data.farm_scoped === false ? " · across all your farms" : ""}</div></div></div>
      <div className="capital-strip" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))" }}>
        <div className="capital-tile"><div className="capital-tile-label">Total overrides</div><div className="capital-tile-value">{data.total ?? 0}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">This year</div><div className="capital-tile-value">{data.ytd ?? 0}</div></div>
        <div className="capital-tile"><div className="capital-tile-label">Blocks honored</div><div className="capital-tile-value" style={{ color: "var(--green-dk)" }}>{(data.total ?? 0) === 0 ? "100%" : "—"}</div></div>
      </div>
      <div className="override-warning" style={{ margin: "14px 0" }}><AlertTriangle size={13} /> FOUNDER overrides bypass the WHD gate. Each requires a reason, triggers a CRITICAL alert to the Operator, and is permanently recorded. Bankers and premium buyers see override frequency — fewer is better.</div>
      {list.length === 0
        ? <div className="card" style={{ padding: 20, color: "var(--green-dk)" }}><Check size={14} /> No overrides on record — every withholding hold has been honored. This is exactly what a banker wants to see.</div>
        : list.map((o) => (
          <div className="override-row" key={o.override_id}>
            <div className="override-row-head">
              <div><strong style={{ fontSize: 13, color: "var(--soil)" }}>Harvest override</strong> <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{o.approved ? "approved" : "denied"}</span></div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}><span className="permanent-lock"><Lock size={9} />permanent</span></div>
            </div>
            <div className="override-reason">"{o.reason}"</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)" }}>
              <span>{String(o.attempted_at || "").slice(0, 16).replace("T", " ")} · {o.authorized_by || "—"}</span>
            </div>
          </div>
        ))}
    </QueryState>
  );
}

// ── Calendar ─────────────────────────────────────────────────────────────────
function CalendarView({ compQ, navigate }) {
  const comp = compQ.data?.data || {};
  // All future WHD clearances, not just ≤14 days (CC6).
  const upcoming = (comp.active_blocks ?? []).filter((b) => b.state === "blocked" && b.clear_date);
  return (
    <QueryState q={compQ} label="compliance calendar">
      <div className="page-header" style={{ paddingTop: 0 }}><div><h1 style={{ fontSize: 20 }}>Upcoming compliance events</h1><div className="subtitle">WHD clear-dates</div></div></div>
      <div style={{ background: "rgba(191,144,0,0.06)", borderLeft: "3px solid var(--amber)", borderRadius: 7, padding: "12px 14px", margin: "14px 0", fontSize: 12, color: "var(--soil)" }}>
        <strong>Spray advisory:</strong> check the 48h rain forecast before applying — rain washes chemical off (wasted) and risks runoff. <a onClick={() => navigate("/farm/weather")} style={{ color: "var(--green-dk)", cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>View weather</a>
      </div>
      {upcoming.length === 0 ? <div className="card" style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No upcoming WHD clearances. Clear-dates appear here while a block is inside a withholding period.</div>
        : upcoming.map((e) => (
          <div className="comp-cal-row" key={e.cycle_id}>
            <div className="comp-cal-date">{e.clear_date}</div>
            <div className="comp-cal-icon"><Check size={14} /></div>
            <div style={{ flex: 1, fontSize: 12.5, color: "var(--soil)" }}>WHD clears · {e.block_name || "Block"} {e.crop} harvest-safe</div>
            <span className="comp-status-pill clear">harvest</span>
          </div>
        ))}
    </QueryState>
  );
}

// ── Analytics ────────────────────────────────────────────────────────────────
function AnalyticsView({ regQ, comp, overridesYtd, dataErr, navigate }) {
  const apps = regQ.data?.data?.applications ?? [];
  const chemName = (a) => (a.unspecified ? "Unidentified" : (a.chemical || "—").split(" ")[0]);
  const byChem = {}; apps.forEach((a) => { const k = chemName(a); byChem[k] = (byChem[k] || 0) + 1; });
  const maxC = Math.max(...Object.values(byChem), 1);
  const blocked = comp.blocked_count ?? 0;
  const attention = (comp.attention_count ?? 0) - blocked;
  // Honest "standing" — derived from real data, NOT an invented score (CO6/CO28).
  // If holds/overrides failed to load we CANNOT assert "Clean" (CC3).
  const dings = [];
  if (overridesYtd > 0) dings.push(`${overridesYtd} override${overridesYtd === 1 ? "" : "s"} this year`);
  if (blocked > 0) dings.push(`${blocked} block${blocked === 1 ? "" : "s"} under active WHD`);
  if (attention > 0) dings.push(`${attention} unidentified/off-label application${attention === 1 ? "" : "s"}`);
  const clean = !dataErr && dings.length === 0;
  const standColor = dataErr ? "var(--muted)" : clean ? "var(--green-dk)" : "var(--amber)";
  return (
    <QueryState q={regQ} label="compliance analytics">
      <div className="analytics-grid">
        <div className="analytics-card">
          <div className="analytics-card-title">Compliance standing</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0" }}>
            <span style={{ width: 44, height: 44, borderRadius: "50%", display: "grid", placeItems: "center", background: dataErr ? "rgba(0,0,0,0.05)" : clean ? "rgba(45,106,79,0.12)" : "rgba(191,144,0,0.12)", color: standColor }}>{dataErr ? <RefreshCw size={20} /> : clean ? <Check size={22} /> : <AlertTriangle size={22} />}</span>
            <div><div style={{ fontWeight: 800, fontSize: 16, color: standColor }}>{dataErr ? "Can't confirm" : clean ? "Clean" : "Needs attention"}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{dataErr ? "reload to confirm — holds/overrides didn't load" : clean ? "0 overrides · 0 holds · 0 flags" : "live, from your records"}</div></div>
          </div>
          {!clean && !dataErr && <ul style={{ margin: "4px 0 0 16px", fontSize: 12, color: "var(--soil)" }}>{dings.map((d) => <li key={d}>{d}</li>)}</ul>}
        </div>
        <div className="analytics-card">
          <div className="analytics-card-title">Chemical use by type</div>
          <div style={{ padding: "8px 0" }}>
            {Object.keys(byChem).length === 0 ? <div style={{ fontSize: 12, color: "var(--muted)" }}>No applications yet.</div>
              : Object.entries(byChem).sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                <div className="util-bar-row" key={t}><div className="util-bar-name">{t}</div><div className="util-bar-track"><div className="util-bar-fill med" style={{ width: `${n / maxC * 100}%` }} /></div><div className="util-bar-value">{n}</div></div>
              ))}
          </div>
        </div>
      </div>
      <div className="analytics-card" style={{ marginTop: 14 }}>
        <div className="analytics-card-title">Compliance certificate<span className="analytics-card-link">The export passport</span></div>
        <div style={{ fontSize: 12, color: "var(--soil)", margin: "8px 0" }}>A clean chemical-record certificate — proving WHDs honored and zero breaches — generates from your Bank Evidence pack.</div>
        <button className="btn btn-primary" onClick={() => navigate("/farm/reports")}><FileText size={14} />Open Bank Evidence</button>
      </div>
    </QueryState>
  );
}

// ── Override modal (shared a11y Modal; explains the real gate) ─────────────────
function OverrideModal({ blk, onClose, navigate }) {
  const { openFormModal } = useFormModal();
  const fixLog = blk.fixLog;
  return (
    <Modal isOpen onClose={onClose} size="sm" title={fixLog ? "Identify the chemical" : "FOUNDER override"}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>{fixLog ? "Cancel" : "Wait for clearance"}</button>
        <button className="btn btn-primary" onClick={() => { onClose(); if (fixLog) navigate("/farm/field-events?type=CHEMICAL_APPLIED"); else openFormModal("harvest_new", { cycle_id: blk.cycle_id }); }}>{fixLog ? "Fix the log →" : "Go to harvest →"}</button>
      </>}>
      {fixLog ? (
        <div style={{ fontSize: 12.5, color: "var(--soil)", lineHeight: 1.7 }}>This block has a chemical application that wasn't identified, so its withholding period can't protect the harvest. Re-log it with the chemical selected from the library — then the gate works automatically.</div>
      ) : (
        <>
          <div className="override-warning" style={{ marginBottom: 12 }}><AlertTriangle size={13} /> This block is inside its withholding period ({blk.chemical}, clears {blk.clear_date}). Selling now is a real food-safety breach.</div>
          <div style={{ fontSize: 12.5, color: "var(--soil)", lineHeight: 1.7 }}>An override can only be recorded <strong>at the moment you attempt the harvest</strong> — the system asks for a reason there, fires a CRITICAL alert to the Operator, and writes a permanent record that bankers and buyers can see. There is no silent override.</div>
        </>
      )}
    </Modal>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
function CropComplianceInner() {
  const navigate = useNavigate();
  const { farmId, setFarmId } = useCurrentFarm();
  const [tab, setTab] = useState("status");
  const [override, setOverride] = useState(null);

  const compQ = useQuery({ queryKey: ["comp", farmId], queryFn: () => getJSON(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}`), enabled: !!farmId });
  const rollupQ = useQuery({ queryKey: ["comp-rollup"], queryFn: () => getJSON("/api/v1/crops/compliance-summary"), staleTime: 60_000 });
  const cyclesQ = useQuery({ queryKey: ["comp-cycles", farmId], queryFn: () => getJSON(`/api/v1/cycles?farm_id=${encodeURIComponent(farmId)}&limit=200`), enabled: !!farmId });
  const ovrQ = useQuery({ queryKey: ["comp-ovr", farmId], queryFn: () => getJSON(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}/overrides`), enabled: !!farmId });
  // Register shared by Register + Analytics (CO26 — one query, react-query dedupes).
  const regQ = useQuery({ queryKey: ["comp-reg", farmId], queryFn: () => getJSON(`/api/v1/crops/compliance/${encodeURIComponent(farmId)}/register`), enabled: !!farmId && (tab === "register" || tab === "analytics") });

  const comp = compQ.data?.data || {};
  const cyclesRaw = cyclesQ.data?.data;
  const cycles = Array.isArray(cyclesRaw) ? cyclesRaw : cyclesRaw?.cycles ?? [];
  const overridesYtd = ovrQ.data?.data?.ytd ?? 0;
  const blocked = comp.blocked_count ?? 0;
  const checked = comp.checked_cycles ?? 0;

  const onTabKey = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = TABS.findIndex((t) => t[0] === tab);
    const ni = (i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length;
    setTab(TABS[ni][0]);
  };
  const askAI = () => {
    const map = { status: "Which of my blocks can I harvest and sell today, and which are still under a withholding period?", register: "Summarise my chemical use and flag any off-label or unidentified applications.", overrides: "What does my override history mean to a banker?" };
    navigate(`/tis?q=${encodeURIComponent(map[tab] || "Explain my farm's chemical compliance status")}`);
  };

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="comp-wx-link"><Shield size={13} /><span>Weather affects spray windows and harvest holds.</span> <a onClick={() => navigate("/farm/weather")} style={{ color: "var(--green-dk)", cursor: "pointer", textDecoration: "underline", fontWeight: 600 }}>Open weather</a></div>
          <div className="page-header">
            <div><h1>Compliance</h1><div className="subtitle">Spray safety and chemical records · {farmId || "your farm"}</div></div>
            <div className="page-actions">
              <FarmSelector />
              <button className="btn btn-secondary" onClick={askAI}><Sparkles size={14} />Ask AI</button>
              <button className="btn btn-primary" onClick={() => navigate("/farm/field-events?type=CHEMICAL_APPLIED")}><Plus size={14} />Log chemical</button>
            </div>
          </div>
          {farmId && <RollupBanner rollupQ={rollupQ} currentFarmId={farmId} onPick={(id) => { setFarmId(id); setTab("status"); }} />}
          <div className="cycle-view-tabs" role="tablist" aria-label="Compliance views">
            {TABS.map(([id, l, s]) => (
              <div key={id} role="tab" tabIndex={tab === id ? 0 : -1} aria-selected={tab === id} onKeyDown={onTabKey} className={`task-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{l}<span className="task-tab-count" style={{ fontSize: 10 }}>{s}</span></div>
            ))}
          </div>

          {!farmId ? <div className="card" style={{ padding: 20, color: "var(--muted)" }}>Select a farm to see its compliance.</div>
            : tab === "status" ? <StatusView compQ={compQ} cycles={cycles} cyclesErr={cyclesQ.isError} overridesYtd={overridesYtd} ovrErr={ovrQ.isError} onOverride={setOverride} />
            : tab === "areas" ? <QueryState q={compQ} label="compliance areas"><AreasView blocked={blocked} clear={Math.max(0, checked - (comp.attention_count ?? 0))} setTab={setTab} /></QueryState>
            : tab === "register" ? <RegisterView regQ={regQ} navigate={navigate} farmId={farmId} />
            : tab === "certs" ? <CertsView />
            : tab === "overrides" ? <OverridesView ovrQ={ovrQ} />
            : tab === "calendar" ? <CalendarView compQ={compQ} navigate={navigate} />
            : <AnalyticsView regQ={regQ} comp={comp} overridesYtd={overridesYtd} dataErr={compQ.isError || ovrQ.isError} navigate={navigate} />}

          <div style={{ marginTop: 14 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate("/farm/compliance/poultry")}>View livestock (poultry) compliance →</button>
          </div>
        </div>
        {override && <OverrideModal blk={override} onClose={() => setOverride(null)} navigate={navigate} />}
      </main>
    </TfpShell>
  );
}

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 60_000 } } });
export default function CropCompliance() {
  return (
    <QueryClientProvider client={queryClient}>
      <CurrentFarmProvider>
        <CropComplianceInner />
      </CurrentFarmProvider>
    </QueryClientProvider>
  );
}
