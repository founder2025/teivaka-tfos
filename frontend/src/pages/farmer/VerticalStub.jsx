/**
 * VerticalStub — Slice C. The doctrine "Stub Dashboard Contract" (CLAUDE.md
 * Section 17): a vertical not yet at 100% renders a real stub — vertical name,
 * one-sentence roadmap note, and a "Notify me when ready" CTA that emits a
 * real attribution_event (vertical_access_requested). NO fake data, no mock
 * charts, no dead links. The stub itself does real work — lead capture for
 * vertical expansion.
 *
 * One component drives every not-yet-deep vertical via the ?vertical route
 * mapping in App.jsx. An aqua / forestry / floriculture farmer's first visit
 * lands here — honest, branded, and actionable — never a blank crop screen.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Fish, Trees, TreeDeciduous, PawPrint, Hexagon, Sparkles, Bell, Check, ArrowLeft, Plus } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";
import { CurrentFarmProvider, useCurrentFarm } from "../../context/CurrentFarmContext";
import { useFormModal } from "../../context/FormModalContext";

const ICONS = { AQUACULTURE: Fish, FORESTRY: Trees, PERENNIALS: TreeDeciduous, LIVESTOCK: PawPrint, APICULTURE: Hexagon, SPECIALTY: Sparkles };

// addLabel: the unit a farmer can establish today (Slice E). null = no unit kind yet.
const COPY = {
  AQUACULTURE: { label: "Fish & sea", addLabel: "Add your first pond or cage", line: "Pond, tank, cage and seaweed management — stocking, water quality, feeding (FCR), and harvest — is being built. You can set up your ponds now and log money, feed and harvests against them today." },
  FORESTRY:    { label: "Forestry",   addLabel: "Add your first woodlot", line: "Timber and agroforestry management — planting, growth tracking (DBH/height), thinning and harvest volume — is being built. You can register your woodlots now." },
  PERENNIALS:  { label: "Trees & vines", addLabel: "Add your first orchard or stand", line: "Tree-crop and perennial management — orchards, fruit and vines across multi-year seasons — is being built." },
  LIVESTOCK:   { label: "Livestock",  addLabel: "Add your first paddock", line: "Cattle, goat and sheep management — herds, breeding, milk and weight — is being built. You can set up paddocks and already log animal events from the (+) menu." },
  APICULTURE:  { label: "Bees",       addLabel: "Add your first hive stand", line: "Apiary management — hives, inspections, honey harvest and swarm tracking — is being built." },
  SPECIALTY:   { label: "Specialty",  addLabel: "Add your first greenhouse or nursery", line: "Greenhouse, hydroponics, nursery and protected-agriculture management is being built." },
};

function authHeaders() {
  const t = localStorage.getItem("tfos_access_token");
  return t ? { "Content-Type": "application/json", Authorization: `Bearer ${t}` } : { "Content-Type": "application/json" };
}
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }

function StubInner({ vertical }) {
  const navigate = useNavigate();
  const { openFormModal } = useFormModal();
  const { farmId } = useCurrentFarm();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const c = COPY[vertical] || { label: vertical, line: "This vertical is on the build roadmap." };
  const Icon = ICONS[vertical] || Sparkles;

  async function notifyMe() {
    setBusy(true);
    try {
      // Real lead capture per the Stub Dashboard Contract — writes a
      // shared.attribution_events row with event_type='vertical_access_requested'.
      const r = await fetch("/api/v1/attribution/vertical-interest", {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ vertical, farm_id: farmId || null }),
      });
      if (!r.ok && r.status !== 204) throw new Error(`HTTP ${r.status}`);
      setSent(true);
      emitToast(`Noted — we'll tell you the moment ${c.label} is ready.`);
    } catch { emitToast("Couldn't register interest — try again in a moment."); }
    finally { setBusy(false); }
  }

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner">
          <div className="page-header">
            <div><h1>{c.label}</h1><div className="subtitle">On the build roadmap</div></div>
            <div className="page-actions">
              <button className="btn btn-secondary" onClick={() => navigate("/farm/enterprises")}><ArrowLeft size={14} />Enterprises</button>
            </div>
          </div>

          <div className="card" style={{ padding: 28, textAlign: "center", maxWidth: 520, margin: "8px auto" }}>
            <div style={{ display: "inline-flex", padding: 18, borderRadius: "50%", background: "var(--cream-2)", color: "var(--green)", marginBottom: 14 }}>
              <Icon size={40} strokeWidth={1.5} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--soil)", marginBottom: 8 }}>{c.label} is coming</div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, marginBottom: 20 }}>{c.line}</div>
            {c.addLabel && (
              <div style={{ marginBottom: 14 }}>
                <button className="btn btn-primary" onClick={() => openFormModal("unit_new", { enterprise: vertical })}>
                  <Plus size={15} />{c.addLabel}
                </button>
              </div>
            )}
            {sent ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13.5, color: "var(--green-dk)", fontWeight: 600 }}>
                <Check size={16} /> You're on the list — we'll be in touch.
              </div>
            ) : (
              <button className="btn btn-primary" disabled={busy} onClick={notifyMe}>
                <Bell size={15} />{busy ? "Registering…" : "Notify me when it's ready"}
              </button>
            )}
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 16 }}>
              In the meantime, your money, supplies, labour, buyers and records already work for every kind of farming — use the (+) button to log anything.
            </div>
          </div>
        </div>
      </main>
    </TfpShell>
  );
}

export default function VerticalStub({ vertical }) {
  return (
    <CurrentFarmProvider>
      <StubInner vertical={vertical} />
    </CurrentFarmProvider>
  );
}
