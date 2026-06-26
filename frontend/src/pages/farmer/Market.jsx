import { lazy } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, Handshake, Briefcase, ArrowRight } from "lucide-react";
import FarmTabs from "../../components/farm/FarmTabs";
import TfpShell from "../../components/farm/TfpShell";
const Buyers = lazy(() => import("./Buyers"));

// Jobs + Services moved to the Community pillar (cross-tenant marketplaces). Farm keeps the
// tenant-scoped Buyers & sales; this thin card deep-links to the re-homed marketplaces (JA1).
function HiringLogistics() {
  const navigate = useNavigate();
  const Card = ({ Icon, title, body }) => (
    <div className="card" style={{ padding: 16, display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
      <span style={{ width: 36, height: 36, borderRadius: 10, background: "var(--green-tint)", color: "var(--green-dk)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon size={18} /></span>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, color: "var(--soil)" }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.5 }}>{body}</div>
      </div>
      <button className="btn btn-secondary btn-sm" onClick={() => navigate("/home/work")} style={{ whiteSpace: "nowrap" }}>Open <ArrowRight size={12} /></button>
    </div>
  );
  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner" style={{ maxWidth: 720 }}>
          <div className="page-header"><div className="subtitle">Hire workers and arrange transport across the Teivaka network — now in the Community pillar.</div></div>
          <Card Icon={Briefcase} title="Jobs — hire or find work" body="Post roles (casual, permanent, contract, seasonal), review applicants, and hire — hires can drop straight into your Labour page." />
          <Card Icon={Truck} title="Services — transport & cold storage" body="Post a delivery or cold-storage job so nearby providers can claim it, or earn by filling jobs near you." />
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>These are network-wide marketplaces, so they live in Community. Your buyers, orders and receivables stay here in Farm.</div>
        </div>
      </main>
    </TfpShell>
  );
}

export default function Market() {
  return <FarmTabs tabs={[
    { key: "buyers", label: "Buyers & sales", Icon: Truck, Comp: Buyers },
    { key: "hiring", label: "Hiring & logistics", Icon: Handshake, Comp: HiringLogistics },
  ]} />;
}
