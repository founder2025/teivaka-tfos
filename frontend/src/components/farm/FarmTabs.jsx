/**
 * FarmTabs — merges related farm pages into one destination with sub-tabs.
 * Each tab lazy-loads an existing page component (no rewrite, no lost function);
 * the active tab syncs to ?tab= so redirects from old routes land on the right one.
 * Page-merge foundation for the consolidated farm nav (22 → ~12 destinations).
 */
import { Suspense, useState } from "react";
import { useSearchParams } from "react-router-dom";

const C = { soil: "var(--soil)", greenDk: "var(--green-dk)", green: "var(--green)", border: "var(--line)", muted: "var(--muted)", paper: "var(--paper)" };

export default function FarmTabs({ tabs }) {
  const [sp, setSp] = useSearchParams();
  const valid = tabs.map((t) => t.key);
  const initial = valid.includes(sp.get("tab")) ? sp.get("tab") : tabs[0].key;
  const [tab, setTab] = useState(initial);
  const Active = (tabs.find((t) => t.key === tab) || tabs[0]).Comp;
  const pick = (k) => { setTab(k); const n = new URLSearchParams(sp); n.set("tab", k); setSp(n, { replace: true }); };
  return (
    <div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "0 4px 12px" }}>
        {tabs.map((t) => {
          const a = t.key === tab;
          return (
            <button key={t.key} onClick={() => pick(t.key)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 15px", borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                border: a ? `1px solid ${C.greenDk}` : `1px solid ${C.border}`, background: a ? C.green : C.paper, color: a ? "#fff" : C.soil }}>
              {t.Icon && <t.Icon size={14} />}{t.label}
            </button>
          );
        })}
      </div>
      <Suspense fallback={<div style={{ padding: 24, color: C.muted, fontSize: 13 }}>Loading…</div>}>
        <Active />
      </Suspense>
    </div>
  );
}
