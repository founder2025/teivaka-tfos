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
import { useQuery } from "@tanstack/react-query";
import { Sprout } from "lucide-react";

const C = {
  soil: "#5C4033", green: "#6AA84F", greenDk: "#4F8138", amber: "#BF9000",
  cream: "#F8F3E9", border: "#E6DED0", muted: "#8A7863", panel: "#FFFFFF",
};

const BATCH_STATUS = {
  SOWN: { label: "Sown", bg: C.cream, fg: C.soil },
  GERMINATING: { label: "Germinating", bg: "#E9F2DD", fg: C.greenDk },
  READY: { label: "Ready", bg: C.green, fg: "#fff" },
  TRANSPLANTED: { label: "Transplanted", bg: C.soil, fg: "#fff" },
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
        <div className="space-y-2">
          {batches.map((b) => {
            const st = BATCH_STATUS[b.batch_status] || { label: b.batch_status || "—", bg: C.cream, fg: C.soil };
            return (
              <div key={b.batch_id} className="flex items-center gap-3 py-2" style={{ borderTop: `1px solid ${C.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="text-sm font-semibold" style={{ color: C.soil }}>
                    {b.production_name || b.production_id}
                    {b.variety ? <span style={{ color: C.muted, fontWeight: 400 }}> · {b.variety}</span> : null}
                  </div>
                  <div className="text-xs" style={{ color: C.muted }}>
                    {b.batch_code} · sown {fdate(b.sowing_date)}
                    {b.total_seeds_sown ? ` · ${b.total_seeds_sown} seeds` : ""}
                  </div>
                </div>
                <span style={{ background: st.bg, color: st.fg, borderRadius: 7, fontSize: 11, fontWeight: 600, padding: "3px 9px", whiteSpace: "nowrap" }}>
                  {st.label}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
