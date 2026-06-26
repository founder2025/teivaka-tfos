/**
 * WorkHub.jsx — Community › "Work & hire" (/home/work) — the re-homed marketplaces (JA1).
 *
 * Jobs (employment) + Services (on-demand tasks) now live in the Community pillar, where the
 * cross-tenant community.* data belongs. One "Post to the network" launcher branches to the
 * right place; the two marketplaces render embedded (no second shell). Farm keeps only the
 * tenant-scoped Buyers & sales, with a thin shortcut card that deep-links here.
 */
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Briefcase, Truck, Plus, X, Sparkles } from "lucide-react";
import TfpShell from "../../components/farm/TfpShell";

const Jobs = lazy(() => import("../farmer/Jobs"));
const ServiceHub = lazy(() => import("../farmer/ServiceHub"));

function ChooserModal({ onClose, go }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); const k = (e) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onClose]);
  const Opt = ({ title, sub, onClick }) => (
    <button onClick={onClick} className="card" style={{ width: "100%", textAlign: "left", padding: "12px 14px", marginBottom: 8, cursor: "pointer", background: "var(--paper)", border: "1px solid var(--line)" }}>
      <div style={{ fontWeight: 700, color: "var(--soil)" }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
    </button>
  );
  return (
    <div className="overlay-backdrop show" onClick={onClose}>
      <div className="overlay-modal" role="dialog" aria-modal="true" aria-label="Post to the network" tabIndex={-1} ref={ref} style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="overlay-head"><h2>Post to the network</h2><button onClick={onClose} className="overlay-close" aria-label="Close"><X size={14} /></button></div>
        <div className="overlay-body">
          <Opt title="Hire someone — post a role" sub="Casual, permanent, contract, seasonal or apprentice" onClick={() => go("hire")} />
          <Opt title="Get something done — post a task" sub="Transport, cold storage, machinery, input delivery" onClick={() => go("task")} />
          <div style={{ height: 6 }} />
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", color: "var(--muted)", margin: "4px 0 6px" }}>Looking instead?</div>
          <Opt title="Find work" sub="Browse jobs near you and apply" onClick={() => go("find")} />
          <Opt title="Offer a service" sub="Set your provider profile and claim nearby jobs" onClick={() => go("offer")} />
        </div>
      </div>
    </div>
  );
}

export default function WorkHub() {
  const navigate = useNavigate();
  const [sub, setSub] = useState("jobs");          // jobs | services
  const [jobsTab, setJobsTab] = useState(undefined);
  const [svcTab, setSvcTab] = useState(undefined);
  const [chooser, setChooser] = useState(false);
  const [k, setK] = useState(0);                   // remount key so a launcher choice lands on the right inner tab

  function go(target) {
    if (target === "find") { setSub("jobs"); setJobsTab("find"); }
    else if (target === "hire") { setSub("jobs"); setJobsTab("hire"); }
    else if (target === "task") { setSub("services"); setSvcTab("requests"); }
    else if (target === "offer") { setSub("services"); setSvcTab("work"); }
    setK((x) => x + 1); setChooser(false);
  }
  const TabBtn = ({ id, Icon, label }) => (
    <button role="tab" aria-selected={sub === id} tabIndex={sub === id ? 0 : -1}
      className={`task-tab ${sub === id ? "active" : ""}`} style={{ background: "none", border: "none", font: "inherit", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
      onClick={() => setSub(id)}><Icon size={14} />{label}</button>
  );

  return (
    <TfpShell>
      <main className="main-content">
        <div className="main-inner" style={{ maxWidth: 880 }}>
          <div className="page-header">
            <div className="subtitle">Work & hire across the Teivaka network — jobs and on-demand services.</div>
            <div className="page-actions" style={{ flexWrap: "wrap", gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => navigate("/tis?q=" + encodeURIComponent("How do I use the Teivaka network to hire workers or find farm work?"))}><Sparkles size={14} />Ask AI</button>
              <button className="btn btn-primary" onClick={() => setChooser(true)}><Plus size={14} />Post to the network</button>
            </div>
          </div>

          <div className="cycle-view-tabs" role="tablist" aria-label="Work & hire">
            <TabBtn id="jobs" Icon={Briefcase} label="Jobs" />
            <TabBtn id="services" Icon={Truck} label="Services" />
          </div>

          <Suspense fallback={<div className="card" style={{ padding: 20, color: "var(--muted)" }}>Loading…</div>}>
            {sub === "jobs"
              ? <Jobs key={`j${k}`} embedded initialTab={jobsTab} />
              : <ServiceHub key={`s${k}`} embedded initialTab={svcTab} />}
          </Suspense>
        </div>
      </main>
      {chooser && <ChooserModal onClose={() => setChooser(false)} go={go} />}
    </TfpShell>
  );
}
