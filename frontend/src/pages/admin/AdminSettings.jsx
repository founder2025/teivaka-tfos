/** AdminSettings — /admin/settings. Rebuilt light-theme, real controls only:
 *  the site-wide Announcement banner (live), a READ-ONLY tier matrix from the
 *  real TIER_DEFINITIONS (an editable grid that doesn't change enforcement
 *  would be a lie), and links to the consolidated control surfaces. The
 *  legacy Community-Identity editor is removed — the brand is the brand. */
import { useEffect, useState } from "react";
import AdminLayout from "../../components/admin/AdminLayout";
import { Link } from "react-router-dom";
import { Megaphone, Check, X as XIcon } from "lucide-react";
import { getJSON, send } from "../../utils/api";
import MonetizationPanel from "../../components/admin/MonetizationPanel";
import SponsoredSeatsPanel from "../../components/admin/SponsoredSeatsPanel";
import MarketplaceFeesPanel from "../../components/admin/MarketplaceFeesPanel";

const C = { soil: "var(--soil)", green: "var(--green)", greenDk: "var(--green-dk)", line: "var(--line)", muted: "var(--muted)", cream: "var(--cream)" };
const card = { background: "var(--paper)", border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 16 };
const toast = (m, t) => { try { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m, type: t } })); } catch { /* noop */ } };

export default function AdminSettings() {
  const [banner, setBanner] = useState(null);
  const [text, setText] = useState("");
  const [tiers, setTiers] = useState(null);

  useEffect(() => {
    send("PATCH", "/api/v1/admin/platform/banner", {}).then((r) => { setBanner(r.data); setText(r.data?.banner_text || ""); }).catch(() => setBanner({}));
    getJSON("/api/v1/subscriptions/tiers").then((r) => setTiers(r?.data ?? {})).catch(() => setTiers({}));
  }, []);

  const save = async (patch) => {
    try { const r = await send("PATCH", "/api/v1/admin/platform/banner", patch); setBanner(r.data); toast("Saved ✓", "success"); }
    catch (e) { toast(`${e.userMessage || e.message}`, "error"); }
  };

  const tierCodes = tiers ? Object.keys(tiers) : [];
  // feature presence derived from the REAL tier definitions
  const allFeatures = tiers ? [...new Set(tierCodes.flatMap((t) => tiers[t].features || []))] : [];

  return (
    <AdminLayout>
      <h1 style={{ margin: "0 0 14px", fontSize: 22, color: C.soil }}>Platform Settings</h1>

      <div style={card}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <Megaphone size={16} style={{ color: C.greenDk }} />
          <strong style={{ color: C.soil, fontSize: 15 }}>Announcement banner</strong>
        </div>
        <p style={{ fontSize: 12.5, color: C.muted, margin: "0 0 10px" }}>Shows at the top of every page for every signed-in user — maintenance windows, launches, market days.</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Scheduled maintenance Saturday 8–9pm — the platform may be briefly unavailable."
          style={{ width: "100%", minHeight: 60, border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", fontSize: 13.5, boxSizing: "border-box", marginBottom: 10 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => save({ banner_text: text, banner_enabled: true })}
            style={{ background: C.green, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Save & show banner
          </button>
          {banner?.banner_enabled && (
            <button onClick={() => save({ banner_enabled: false })}
              style={{ background: "var(--paper)", color: "var(--red)", border: `1px solid ${C.line}`, borderRadius: 8, padding: "9px 16px", fontSize: 13, cursor: "pointer" }}>
              Hide banner
            </button>
          )}
        </div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
          Status: <strong style={{ color: banner?.banner_enabled ? C.greenDk : C.muted }}>{banner == null ? "…" : banner.banner_enabled ? "VISIBLE to all users" : "Hidden"}</strong>
        </div>
      </div>

      {/* Admin-editable pricing, discounts, referral programme (live source of truth). */}
      <MonetizationPanel />

      {/* Sponsored Farmer Seats — orgs sponsor farmers; codes redeem to funded plans. */}
      <SponsoredSeatsPanel />

      {/* Marketplace transaction fees — rates + accrued platform revenue. */}
      <MarketplaceFeesPanel />

      <div style={card}>
        <strong style={{ color: C.soil, fontSize: 15 }}>Feature access by tier — reference</strong>
        <p style={{ fontSize: 12, color: C.muted, margin: "4px 0 10px" }}>
          Which features each tier includes (edit prices &amp; limits above). Feature entitlements are managed in the plan’s feature list.
        </p>
        {tiers == null ? <div style={{ color: C.muted }}>Loading…</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", fontSize: 12.5, borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", color: C.muted, fontSize: 10, textTransform: "uppercase", padding: "6px 8px", borderBottom: `1px solid ${C.line}` }}>Feature</th>
                  {tierCodes.map((t) => <th key={t} style={{ color: C.muted, fontSize: 10, padding: "6px 8px", borderBottom: `1px solid ${C.line}` }}>{t}</th>)}
                </tr>
              </thead>
              <tbody>
                {allFeatures.map((f) => (
                  <tr key={f}>
                    <td style={{ padding: "6px 8px", borderBottom: `1px solid ${C.line}`, color: C.soil }}>{f.replace(/_/g, " ")}</td>
                    {tierCodes.map((t) => (
                      <td key={t} style={{ textAlign: "center", padding: "6px 8px", borderBottom: `1px solid ${C.line}` }}>
                        {(tiers[t].features || []).includes(f)
                          ? <Check size={14} style={{ color: C.greenDk }} />
                          : <XIcon size={13} style={{ color: C.line }} />}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: "6px 8px", color: C.soil, fontWeight: 700 }}>Price (FJD/mo)</td>
                  {tierCodes.map((t) => <td key={t} style={{ textAlign: "center", padding: "6px 8px", fontWeight: 700, color: C.greenDk }}>{tiers[t].price_fjd_monthly ?? "—"}</td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <strong style={{ color: C.soil, fontSize: 15 }}>Control surfaces</strong>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {[["/admin/platform", "Feature flags & admin access"], ["/admin/classroom", "Classroom"], ["/admin/requests", "Tier requests"], ["/me/affiliate/console", "Affiliate program"], ["/admin/intelligence", "Intelligence"]].map(([to, label]) => (
            <Link key={to} to={to} style={{ border: `1px solid ${C.line}`, background: "var(--paper)", color: C.soil, borderRadius: 8, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, textDecoration: "none" }}>{label}</Link>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
}
