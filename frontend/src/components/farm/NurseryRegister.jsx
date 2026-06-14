/**
 * NurseryRegister.jsx — nursery batch register for the Production surface.
 *
 * Mirrors the prototype's nurserySection(): propagation batches before they
 * become field cycles. Reads GET /api/v1/nursery?farm_id= ({ data: [batches] }),
 * each row joined to shared.productions (production_name). Renders nothing when
 * the farm has no batches (honest empty — no fabricated rows).
 *
 * Read-only register. Logging a new batch happens through the (+) flow, not here.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sprout, MapPin, ChevronDown, Check, AlertTriangle } from "lucide-react";

const C = {
  soil: "var(--soil)", green: "var(--green)", greenDk: "#4F8138", amber: "var(--amber)",
  cream: "var(--cream)", border: "#E6DED0", muted: "#8A7863", panel: "var(--paper)", red: "var(--red)",
};

const BATCH_STATUS = {
  SOWN: { label: "Sown", bg: C.cream, fg: C.soil },
  GERMINATING: { label: "Germinating", bg: "#E9F2DD", fg: C.greenDk },
  READY: { label: "Ready", bg: C.green, fg: "var(--paper)" },
  TRANSPLANTED: { label: "Transplanted", bg: C.soil, fg: "var(--paper)" },
};

function authHeaders() {
  const tok = localStorage.getItem("tfos_access_token");
  return tok
    ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
    : { "Content-Type": "application/json" };
}

function fdate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

async function fetchBatches(farmId) {
  if (!farmId) return [];
  const res = await fetch(`/api/v1/nursery?farm_id=${encodeURIComponent(farmId)}`, { headers: authHeaders() });
  if (!res.ok) return [];
  const body = await res.json();
  return body?.data ?? [];
}
async function fetchCandidates(batchId) {
  const res = await fetch(`/api/v1/nursery/${encodeURIComponent(batchId)}/transplant-blocks`, { headers: authHeaders() });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}
function emitToast(m) { window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: m } })); }
const fmtHa = (sqm) => (sqm == null ? "—" : `${(sqm / 10000).toFixed(2)} ha`);

// One nursery batch row + a "find a block to transplant into" expander (Phase 4).
function BatchRow({ b }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["transplant", b.batch_id], queryFn: () => fetchCandidates(b.batch_id), enabled: open, retry: 0 });
  const st = BATCH_STATUS[b.batch_status] || { label: b.batch_status || "—", bg: C.cream, fg: C.soil };

  async function prepare(puId) {
    try {
      const r = await fetch(`/api/v1/nursery/${encodeURIComponent(b.batch_id)}/transplant-task`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify({ pu_id: puId }),
      });
      if (r.ok) { const d = await r.json(); emitToast(d.existing ? "Already on your task list" : "Block prep task added"); }
    } catch { emitToast("Couldn't add task"); }
  }

  return (
    <div style={{ borderTop: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-3 py-2">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="text-sm font-semibold" style={{ color: C.soil }}>
            {b.production_name || b.production_id}
            {b.variety ? <span style={{ color: C.muted, fontWeight: 400 }}> · {b.variety}</span> : null}
          </div>
          <div className="text-xs" style={{ color: C.muted }}>
            {b.batch_code} · sown {fdate(b.sowing_date)}{b.total_seeds_sown ? ` · ${b.total_seeds_sown} seeds` : ""}
          </div>
        </div>
        <span style={{ background: st.bg, color: st.fg, borderRadius: 7, fontSize: 11, fontWeight: 600, padding: "3px 9px", whiteSpace: "nowrap" }}>{st.label}</span>
        <button onClick={() => setOpen((v) => !v)} className="text-[11px] px-2 py-1 rounded-lg flex items-center gap-1 font-semibold" style={{ color: C.greenDk, border: `1px solid ${C.border}` }}>
          <MapPin size={12} />Find block<ChevronDown size={12} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
        </button>
      </div>

      {open && (
        <div className="pb-3 pl-1">
          {isLoading ? <div className="text-xs" style={{ color: C.muted }}>Finding suitable blocks…</div>
            : !data?.candidates?.length ? <div className="text-xs" style={{ color: C.muted }}>No free blocks yet. Draw/walk a block in Locations, or close a cycle to free one up.</div>
            : (
              <div className="space-y-1.5">
                <div className="text-[11px]" style={{ color: C.muted }}>Best blocks to transplant <strong>{data.crop}</strong> into — rotation-safe first:</div>
                {data.candidates.slice(0, 5).map((c) => (
                  <div key={c.pu_id} className="flex items-center gap-2 rounded-lg p-2" style={{ background: C.cream }}>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: C.soil }}>{c.pu_name}</div>
                      <div className="text-[11px]" style={{ color: C.muted }}>{c.state.toLowerCase()} · {fmtHa(c.area_sqm)}{c.last_crop ? ` · was ${c.last_crop}` : ""}</div>
                    </div>
                    {c.rotation_ok
                      ? <span className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1" style={{ background: "#E9F2DD", color: C.greenDk }}><Check size={10} />rotation OK</span>
                      : <span className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1" style={{ background: "#FBEAE7", color: C.red }}><AlertTriangle size={10} />rest {c.rest_remaining_days}d</span>}
                    <button onClick={() => prepare(c.pu_id)} className="text-[11px] px-2.5 py-1 rounded-lg text-white font-semibold" style={{ background: C.greenDk }}>Prepare</button>
                  </div>
                ))}
                <div className="text-[10px]" style={{ color: C.muted }}>Rotation safety from the crop-family policies; size from your mapped blocks.</div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

export default function NurseryRegister({ farmId }) {
  const { data: batches = [], isLoading } = useQuery({
    queryKey: ["nursery", farmId],
    queryFn: () => fetchBatches(farmId),
    enabled: !!farmId,
  });

  return (
    <section className="rounded-2xl px-4 py-4 mb-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="flex items-center gap-2 mb-3">
        <Sprout size={16} style={{ color: C.greenDk }} />
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: C.soil }}>
          Nursery
        </h2>
        {batches.length > 0 && (
          <span style={{ background: C.green, color: "#fff", borderRadius: 9, fontSize: 10, padding: "1px 8px", marginLeft: "auto" }}>
            {batches.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-sm" style={{ color: C.muted }}>Loading nursery…</div>
      ) : batches.length === 0 ? (
        <div className="text-center py-6 text-sm" style={{ color: C.muted }}>
          No nursery batches yet. Seedling batches you sow will appear here.
        </div>
      ) : (
        <div className="space-y-1">
          {batches.map((b) => <BatchRow key={b.batch_id} b={b} />)}
        </div>
      )}
    </section>
  );
}
