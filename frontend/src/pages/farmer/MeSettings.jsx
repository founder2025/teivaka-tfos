/**
 * MeSettings.jsx — /me/settings — farmer-facing settings page.
 *
 * Replaces the ComingSoon stub. First section is GroupCatalogSection
 * (per-farm catalog group toggles per Catalog Redesign Doctrine Amendment
 * v2, commit 272f513). Future phases add: account, notifications, billing.
 *
 * Single-farm assumption tonight: uses user's first farm. Multi-farm
 * operators get a farm picker in a later phase (filed: Sprint 6+).
 */
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Shield, BadgeCheck, FileText, Download, Coins, Home, Users, Settings as Cog, Link as LinkIcon, Plus, Check, Moon } from "lucide-react";
import GroupCatalogSection from "../../components/settings/GroupCatalogSection";
import ThemeToggle from "../../components/ThemeToggle";
import { getJSON, send } from "../../utils/api";

const toast = (message, type) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message, type } })); } catch { /* noop */ } };

// Prototype "Settings" section links + Money & units (3-mode + per-field selects),
// persisted to tenant.users via PATCH /me (unit_mode, pref_*).
function SettingsSections() {
  const G = { soil: "var(--soil)", muted: "var(--muted)", line: "var(--line)", green: "var(--green-dk)" };
  const rows = [
    { to: "/me", Icon: Pencil, label: "Edit profile basics" },
    { to: "/me", Icon: Shield, label: "Privacy & visibility" },
    { to: "/me/verification", Icon: BadgeCheck, label: "Verification" },
    { to: "/covenant", Icon: FileText, label: "View the Data Covenant" },
    { to: "/me/data", Icon: Download, label: "Export my data" },
  ];
  return (
    <section style={{ margin: "12px 20px", background: "var(--paper)", border: `1px solid ${G.line}`, borderRadius: 12, overflow: "hidden" }}>
      {rows.map((r, i) => (
        <Link key={r.label} to={r.to} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 14px", color: G.soil, textDecoration: "none", borderTop: i ? `1px solid ${G.line}` : "none", fontSize: 14, minHeight: 44 }}>
          <r.Icon size={16} style={{ color: G.muted }} /> {r.label}
        </Link>
      ))}
    </section>
  );
}

const G = { soil: "var(--soil)", muted: "var(--muted)", line: "var(--line)", green: "var(--green)", greenDk: "var(--green-dk)" };

function SettingsCard({ Icon, title, desc, children }) {
  return (
    <section style={{ margin: "12px 20px", background: "var(--paper)", border: `1px solid ${G.line}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon size={16} style={{ color: G.muted }} />
        <strong style={{ color: G.soil, fontSize: 15 }}>{title}</strong>
      </div>
      <div style={{ fontSize: 12, color: G.muted, margin: "2px 0 10px" }}>{desc}</div>
      {children}
    </section>
  );
}

function Row({ label, note, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "11px 2px", borderBottom: `1px solid ${G.line}` }}>
      <div>
        <div style={{ fontSize: 13.5, color: G.soil, fontWeight: 600 }}>{label}</div>
        {note && <div style={{ fontSize: 11.5, color: G.muted }}>{note}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} aria-pressed={on}
      style={{ width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", position: "relative", background: on ? G.green : G.line, transition: "background .15s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 18, height: 18, borderRadius: "50%", background: "var(--paper)", transition: "left .15s" }} />
    </button>
  );
}

const sBtn = { border: `1px solid ${G.line}`, background: "var(--paper)", color: G.soil, borderRadius: 8, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 };

/* Card 1 — Farm setup (prototype: farm profile + enterprises + what you run) */
function FarmSetupCard({ farm, loading, children }) {
  return (
    <SettingsCard Icon={Home} title="Farm setup" desc="Your farm details and what you run">
      <Row label="Farm profile" note={loading ? "Loading…" : farm ? `${farm.farm_name}${farm.location_island ? ` · ${farm.location_island}` : ""}` : "No farm yet"}>
        <Link to="/farm" style={sBtn}>Open</Link>
      </Row>
      <Row label="Enterprises" note="What this farm runs">
        <Link to="/farm/enterprises" style={sBtn}>Manage</Link>
      </Row>
      {children}
    </SettingsCard>
  );
}

/* Card 2 — Team */
function TeamCard() {
  const [team, setTeam] = useState(null);
  useEffect(() => { getJSON("/api/v1/me/team").then((r) => setTeam(r?.data ?? r ?? [])).catch(() => setTeam([])); }, []);
  return (
    <SettingsCard Icon={Users} title="Team" desc="Who can use this account and what they can do">
      <Row label="Members" note={team == null ? "Loading…" : `${team.length} on this account`}>
        <Link to="/me/team" style={sBtn}>Manage</Link>
      </Row>
      <Row label="Permissions" note="Owner: full access · Worker: log events and view tasks">
        <span style={{ fontSize: 11.5, color: G.muted }}>By role</span>
      </Row>
    </SettingsCard>
  );
}

/* Preferences extras — language pills + notification toggles (real PATCH /me) */
const LANGS = [["en", "English"], ["itaukei", "iTaukei"], ["hindi", "Hindi"]];

function LanguageAndAlerts() {
  const [prefs, setPrefs] = useState(null);
  useEffect(() => { getJSON("/api/v1/me/prefs").then((r) => setPrefs(r?.data ?? {})).catch(() => setPrefs({})); }, []);
  const save = async (patch) => {
    setPrefs((p) => ({ ...p, ...patch }));
    try { await send("PATCH", "/api/v1/me", patch); toast("Saved ✓", "success"); }
    catch (e) { toast(`Couldn't save: ${e.userMessage || e.message}`, "error"); }
  };
  if (prefs == null) return <div style={{ color: G.muted, fontSize: 13, padding: "8px 0" }}>Loading…</div>;
  const lang = prefs.preferred_language || "en";
  return (
    <>
      <Row label="Language" note="TIS replies and app copy follow your choice">
        <div style={{ display: "flex", gap: 6 }}>
          {LANGS.map(([v, l]) => (
            <button key={v} onClick={() => save({ preferred_language: v })}
              style={{ border: `1px solid ${lang === v ? G.greenDk : G.line}`, background: lang === v ? G.green : "var(--paper)", color: lang === v ? "var(--paper)" : G.soil, borderRadius: 999, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{l}</button>
          ))}
        </div>
      </Row>
      <Row label="WhatsApp alerts" note="Get alerts on WhatsApp">
        <Toggle on={Boolean(prefs.notify_whatsapp)} onChange={(v) => save({ notify_whatsapp: v })} />
      </Row>
      <Row label="Task reminders" note="Reminders for due farm tasks">
        <Toggle on={Boolean(prefs.notify_tasks)} onChange={(v) => save({ notify_tasks: v })} />
      </Row>
      <Row label="Weather alerts" note="Heavy rain and heat warnings">
        <Toggle on={Boolean(prefs.notify_weather)} onChange={(v) => save({ notify_weather: v })} />
      </Row>
    </>
  );
}

/* Card 4 — System (honest connection states; no fake integrations) */
function SystemCard() {
  const [tier, setTier] = useState(null);
  useEffect(() => { getJSON("/api/v1/auth/me").then((r) => setTier(((r?.data ?? r)?.tier || "").toUpperCase() || null)).catch(() => {}); }, []);
  return (
    <SettingsCard Icon={LinkIcon} title="System" desc="Connections, billing, and security">
      <Row label="M-PAiSA" note="Mobile money payments">
        <span style={{ fontSize: 11.5, color: G.muted }}>Coming with payments</span>
      </Row>
      <Row label="WhatsApp" note="TIS advisor on WhatsApp">
        <span style={{ fontSize: 11.5, color: G.greenDk, fontWeight: 700 }}><Check size={12} style={{ verticalAlign: "-2px" }} /> Available · +679 733 6211</span>
      </Row>
      <Row label="Weather service" note="Live forecasts on your Feed">
        <span style={{ fontSize: 11.5, color: G.greenDk, fontWeight: 700 }}><Check size={12} style={{ verticalAlign: "-2px" }} /> Connected</span>
      </Row>
      <Row label="Billing" note={tier ? `Current plan: ${tier}` : "Current plan"}>
        <Link to="/me/subscription" style={sBtn}>Manage plan</Link>
      </Row>
      <Row label="Security" note="PIN and signed-in devices">
        <button style={sBtn} onClick={() => toast("PIN setup — coming soon", "info")}>Set up</button>
      </Row>
    </SettingsCard>
  );
}

/* Card 5 — Governance (real audit tail from /me/records) */
function GovernanceCard() {
  const [rows, setRows] = useState(null);
  useEffect(() => { getJSON("/api/v1/me/records").then((r) => setRows(r?.data ?? [])).catch(() => setRows([])); }, []);
  return (
    <SettingsCard Icon={Shield} title="Governance" desc="Your tamper-proof record of everything logged">
      {rows == null ? <div style={{ color: G.muted, fontSize: 13, padding: "8px 0" }}>Loading…</div>
        : rows.length === 0 ? (
          <div style={{ color: G.muted, fontSize: 13, padding: "8px 0" }}>Your audit log builds as you log events. Every action gets a tamper-proof record here.</div>
        ) : (
          <>
            {rows.slice(0, 6).map((r, i) => (
              <Row key={i} label={(r.event_type || "").replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                note={r.occurred_at ? new Date(r.occurred_at).toLocaleString() : ""}>
                <code style={{ fontSize: 11, color: G.greenDk, fontFamily: "ui-monospace, Menlo, monospace" }}>{(r.audit_hash || "").slice(0, 10) || "—"}</code>
              </Row>
            ))}
            <div style={{ fontSize: 12, color: G.muted, marginTop: 10 }}>
              {rows.length >= 60 ? "60+" : rows.length} recent events in your chain · each one hash-linked and tamper-proof · <Link to="/farm/history" style={{ color: G.greenDk }}>full ledger</Link>
            </div>
          </>
        )}
    </SettingsCard>
  );
}

const UNIT_OPTS = {
  pref_currency: [["FJD", "FJD"], ["USD", "USD"], ["AUD", "AUD"], ["NZD", "NZD"], ["PGK", "PGK"], ["WST", "WST"], ["TOP", "TOP"], ["SBD", "SBD"], ["VUV", "VUV"]],
  pref_weight: [["kg", "Kilograms (kg)"], ["lb", "Pounds (lb)"], ["t", "Tonnes (t)"]],
  pref_area: [["ha", "Hectares (ha)"], ["ac", "Acres (ac)"], ["m2", "Square metres (m²)"]],
  pref_temp: [["C", "Celsius (°C)"], ["F", "Fahrenheit (°F)"]],
};

function MoneyUnits() {
  const G = { soil: "var(--soil)", muted: "var(--muted)", line: "var(--line)", green: "var(--green)", greenDk: "var(--green-dk)" };
  const [mode, setMode] = useState("country");
  const [vals, setVals] = useState({ pref_currency: "FJD", pref_weight: "kg", pref_area: "ha", pref_temp: "C" });
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    getJSON("/api/v1/auth/me").then((r) => {
      const d = r?.data ?? r;
      setMode(d.unit_mode || "country");
      setVals({ pref_currency: d.pref_currency || "FJD", pref_weight: d.pref_weight || "kg", pref_area: d.pref_area || "ha", pref_temp: d.pref_temp || "C" });
    }).catch(() => {}).finally(() => setLoaded(true));
  }, []);
  const saveMode = async (m) => {
    setMode(m);
    try { await send("PATCH", "/api/v1/me", { unit_mode: m }); toast("Saved ✓", "success"); }
    catch (e) { toast(`Couldn't save: ${e.userMessage || e.message}`, "error"); }
  };
  const saveField = async (k, v) => {
    setVals((s) => ({ ...s, [k]: v }));
    try { await send("PATCH", "/api/v1/me", { [k]: v }); toast("Saved ✓", "success"); }
    catch (e) { toast(`Couldn't save: ${e.userMessage || e.message}`, "error"); }
  };
  const pill = (m, label) => (
    <button onClick={() => saveMode(m)} style={{ border: `1px solid ${mode === m ? G.greenDk : G.line}`, background: mode === m ? G.green : "var(--paper)", color: mode === m ? "var(--paper)" : G.soil, borderRadius: 999, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", minHeight: 40 }}>{label}</button>
  );
  const sel = { padding: "7px 9px", border: `1px solid ${G.line}`, borderRadius: 8, fontSize: 13.5, minWidth: 150 };
  return (
    <section style={{ margin: "12px 20px", background: "var(--paper)", border: `1px solid ${G.line}`, borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><Coins size={16} style={{ color: G.muted }} /><strong style={{ color: G.soil }}>Money & units</strong></div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        {pill("country", "My country")}{pill("choice", "My choice")}{pill("universal", "Universal")}
      </div>
      {mode === "choice" && loaded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[["pref_currency", "Money"], ["pref_weight", "Weight"], ["pref_area", "Area"], ["pref_temp", "Temperature"]].map(([k, label]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontSize: 13.5, color: G.soil }}>{label}</span>
              <select value={vals[k]} onChange={(e) => saveField(k, e.target.value)} style={sel}>
                {UNIT_OPTS[k].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: G.muted, marginTop: 12 }}>
        {mode === "country" ? "Showing your country's defaults." : mode === "universal" ? "Showing universal units (kg · ha · °C)." : "Your chosen units."} Converted money is indicative, not a live exchange rate.
      </div>
    </section>
  );
}

const C = {
  cream:   "var(--cream)",
  soil:    "var(--soil)",
  muted:   "var(--muted)",
  border:  "var(--line)",
  red:     "var(--red)",
  redBg:   "#FDECEA",
};

// Covenant / app-store right-to-delete. Re-auth with password, confirm, then
// DELETE /api/v1/me anonymises the account and disables login. On success we
// clear tokens and bounce to the public landing.
function DangerZone() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const del = async () => {
    setErr(""); setBusy(true);
    try {
      const token = localStorage.getItem("tfos_access_token");
      const res = await fetch("/api/v1/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ password, confirm: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || `Couldn't delete account (${res.status})`);
      }
      try { localStorage.removeItem("tfos_access_token"); localStorage.removeItem("tfos_refresh_token"); localStorage.removeItem("tfos_mode"); } catch { /* noop */ }
      window.location.replace("/?deleted=1");
    } catch (e) { setErr(String(e.message || e)); setBusy(false); }
  };

  return (
    <section style={{ margin: "20px", padding: 16, background: "var(--paper)", border: `1px solid ${C.red}`, borderRadius: 12 }}>
      <h2 style={{ margin: "0 0 4px", color: C.red, fontSize: 16 }}>Danger zone</h2>
      <p style={{ margin: "0 0 12px", color: C.muted, fontSize: 13.5 }}>
        Delete your account. This anonymises your personal information, removes your community posts, and disables sign-in. Your farm's hash-chained audit records are kept (de-identified) so existing Bank Evidence stays verifiable. This cannot be undone.
      </p>
      {!open ? (
        <button onClick={() => setOpen(true)} style={{ background: "var(--paper)", color: C.red, border: `1px solid ${C.red}`, borderRadius: 8, padding: "9px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          Delete my account
        </button>
      ) : (
        <div style={{ background: C.redBg, border: `1px solid ${C.red}`, borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 13.5, color: C.soil, marginBottom: 10, fontWeight: 600 }}>Confirm your password to permanently delete your account.</div>
          {err && <div style={{ color: C.red, fontSize: 13, marginBottom: 8 }}>{err}</div>}
          <input
            type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password" autoComplete="current-password"
            style={{ width: "100%", maxWidth: 320, padding: "9px 11px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 14, boxSizing: "border-box", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={del} disabled={busy || !password} style={{ background: C.red, color: "#fff", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: busy || !password ? 0.5 : 1 }}>
              {busy ? "Deleting…" : "Permanently delete"}
            </button>
            <button onClick={() => { setOpen(false); setPassword(""); setErr(""); }} disabled={busy} style={{ background: "var(--paper)", color: C.soil, border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", fontSize: 14, cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default function MeSettings() {
  const [farmId, setFarmId] = useState(null);
  const [farm, setFarm] = useState(null);
  const [loadingFarms, setLoadingFarms] = useState(true);
  const [farmsError, setFarmsError] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingFarms(true);
      setFarmsError(null);
      try {
        const token = localStorage.getItem("tfos_access_token");
        const res = await fetch("/api/v1/farms", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        // Try multiple shapes (some endpoints return { data: { farms: [] } },
        // some { data: [] }, some flat { farms: [] }).
        const farms = j?.data?.farms || j?.data || j?.farms || [];
        if (alive) {
          if (Array.isArray(farms) && farms.length > 0) {
            setFarmId(farms[0].farm_id);
            setFarm(farms[0]);
          } else {
            setFarmId(null);
          }
        }
      } catch (e) {
        if (alive) setFarmsError(e.message || "Failed to load farms");
      } finally {
        if (alive) setLoadingFarms(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: C.cream }}>
      <header style={{
        padding: "24px 20px 12px",
        borderBottom: `1px solid ${C.border}`,
        background: "var(--paper)",
      }}>
        <h1 style={{ margin: 0, color: C.soil, fontSize: 24 }}>Settings</h1>
        <p style={{ margin: "4px 0 0", color: C.muted, fontSize: 14 }}>
          Your farm, your team, and how TFOS works for you.
        </p>
      </header>

      <main style={{ padding: "12px 0 80px" }}>
        {/* Card 1 — Farm setup (incl. what-you-run catalog toggles) */}
        <FarmSetupCard farm={farm} loading={loadingFarms}>
          {farmsError && (
            <div style={{ margin: "10px 0 0", padding: 10, background: "#FDECEA", color: "var(--red)", borderRadius: 8, fontSize: 13 }}>
              Couldn't load your farms: {farmsError}
            </div>
          )}
        </FarmSetupCard>
        {!loadingFarms && <GroupCatalogSection farmId={farmId} />}

        {/* Card 2 — Team */}
        <TeamCard />

        {/* Card 3 — Preferences: account links + language + alerts + units */}
        <SettingsCard Icon={Cog} title="Preferences" desc="Account, language, alerts and units">
          <LanguageAndAlerts />
        </SettingsCard>
        <SettingsSections />
        <MoneyUnits />

        {/* Appearance — Light / Dark / System */}
        <section style={{ margin: "12px 20px", background: "var(--paper)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}><Moon size={16} style={{ color: "var(--muted)" }} /><strong style={{ color: "var(--soil)" }}>Appearance</strong></div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>Choose how Teivaka looks. "System" follows your device's day/night setting.</div>
          <ThemeToggle />
        </section>

        {/* Card 4 — System */}
        <SystemCard />

        {/* Card 5 — Governance */}
        <GovernanceCard />

        <DangerZone />
      </main>
    </div>
  );
}
