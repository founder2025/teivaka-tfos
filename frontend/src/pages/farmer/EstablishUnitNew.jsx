/**
 * EstablishUnitNew — /farm/unit/new?enterprise=AQUACULTURE — Slice E capstone.
 *
 * The universal "create a production unit" form: pick enterprise → pick unit
 * kind → name it → optional size → POST /production-units. Works for EVERY
 * vertical (pond/cage/tank, woodlot/stand, hive, paddock, bed, greenhouse).
 * The created unit flows through the Slice-A keystone into the unified view →
 * the portfolio (Slice D), and becomes something the farmer can log against.
 *
 * This is the unlock that lets a fish / forestry / livestock / bee farmer
 * actually start — not just declare (Slice B) and see honest empties (Slice C).
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { apiClient } from "../../utils/apiClient";

const C = { soil: "var(--soil)", cream: "var(--cream)", green: "var(--green)", amber: "var(--amber)", red: "var(--red)", border: "var(--line)", muted: "var(--muted)" };

const ENT_LABEL = {
  CROPS: "Crops", PERENNIALS: "Trees & vines", AQUACULTURE: "Fish & sea",
  FORESTRY: "Forestry", LIVESTOCK: "Livestock", APICULTURE: "Bees", SPECIALTY: "Specialty",
};
const UNIT_LABEL = {
  BED: "Bed", PLOT: "Plot", STAND: "Stand", POND: "Pond", TANK: "Tank", CAGE: "Cage",
  WOODLOT: "Woodlot", PADDOCK: "Paddock", HIVE_STAND: "Hive stand",
  GREENHOUSE: "Greenhouse", NURSERY_TRAY: "Nursery tray", FLOWER_BED: "Flower bed",
};
const AREA_LABEL = { LIVESTOCK: "Paddock size (m²)", FORESTRY: "Area (m²)", AQUACULTURE: "Surface area (m²)" };

function extractList(res, ...paths) {
  if (!res) return [];
  for (const p of paths) {
    const parts = p.split("."); let cur = res;
    for (const x of parts) { if (cur == null) break; cur = cur[x]; }
    if (Array.isArray(cur)) return cur;
  }
  return [];
}

export default function EstablishUnitNew({ enterprise: enterpriseProp } = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // When opened as a card (FormModalHost), the enterprise comes in as a prop; when
  // opened at /farm/unit/new it comes from the URL. Prop wins, URL is the fallback.
  const presetEnt = (enterpriseProp || searchParams.get("enterprise") || "").toUpperCase();

  const [farmId, setFarmId] = useState(null);
  const [kindsMap, setKindsMap] = useState({}); // enterprise → {unit_kinds, default_uom}
  const [activeEnts, setActiveEnts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [anchorError, setAnchorError] = useState(null);

  const [enterprise, setEnterprise] = useState(presetEnt || "");
  const [puType, setPuType] = useState("");
  const [name, setName] = useState("");
  const [area, setArea] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let c = false;
    (async () => {
      try {
        const [farmsRes, kindsRes] = await Promise.all([
          apiClient.get("/farms"),
          apiClient.get("/production-units/unit-kinds").catch(() => ({ data: {} })),
        ]);
        const fl = extractList(farmsRes, "data.items", "data", "farms");
        if (fl.length === 0) throw new Error("No farms found.");
        const fid = fl[0].farm_id;
        const km = kindsRes?.data?.data || kindsRes?.data || {};
        // Which enterprises the farm declared.
        let ents = [];
        try {
          const ag = await apiClient.get(`/farms/${encodeURIComponent(fid)}/active-groups`);
          const rows = ag?.data?.data?.groups || ag?.data?.data || ag?.data?.groups || [];
          ents = rows.filter((g) => g.is_active && km[g.catalog_group]).map((g) => g.catalog_group);
        } catch { ents = Object.keys(km); }
        if (c) return;
        setFarmId(fid); setKindsMap(km); setActiveEnts(ents.length ? ents : Object.keys(km));
        setLoading(false);
      } catch (e) { if (!c) { setAnchorError(e.message); setLoading(false); } }
    })();
    return () => { c = true; };
  }, []);

  // Reset unit kind when enterprise changes; auto-pick if only one.
  useEffect(() => {
    const kinds = kindsMap[enterprise]?.unit_kinds || [];
    setPuType(kinds.length === 1 ? kinds[0] : "");
  }, [enterprise, kindsMap]);

  const kinds = kindsMap[enterprise]?.unit_kinds || [];
  const ready = !!farmId && !!enterprise && !!puType && name.trim().length > 0;

  async function submit() {
    if (!ready) return;
    setBusy(true); setErr("");
    try {
      const r = await apiClient.post("/production-units", {
        farm_id: farmId, enterprise_type: enterprise, pu_type: puType,
        pu_name: name.trim(), area_sqm: area === "" ? null : parseFloat(area),
      });
      const ent = r?.data?.data?.enterprise_type || enterprise;
      window.dispatchEvent(new CustomEvent("tfos:toast", { detail: { message: `${UNIT_LABEL[puType] || "Unit"} created ✓` } }));
      // Land on the enterprise's surface so they see it.
      const route = { AQUACULTURE: "/farm/aquaculture", FORESTRY: "/farm/forestry", LIVESTOCK: "/farm/livestock", APICULTURE: "/farm/apiculture", PERENNIALS: "/farm/perennials", SPECIALTY: "/farm/specialty", CROPS: "/farm/enterprises" }[ent] || "/farm/enterprises";
      setTimeout(() => navigate(route), 600);
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.message || "Submit failed.";
      setErr(typeof msg === "string" ? msg : JSON.stringify(msg));
    } finally { setBusy(false); }
  }

  const areaLabel = AREA_LABEL[enterprise] || "Size / area (m²)";

  return (
    <div className="min-h-screen" style={{ background: C.cream, color: C.soil }}>
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between border-b" style={{ background: C.cream, borderColor: C.border }}>
        <button onClick={() => navigate(-1)} className="text-sm" style={{ color: C.muted }}>← Cancel</button>
        <h1 className="text-base font-semibold">Add a production unit</h1>
        <div className="w-12" />
      </div>
      <div className="px-4 py-4 max-w-md mx-auto space-y-5">
        <p className="text-sm" style={{ color: C.muted, lineHeight: 1.5 }}>
          A production unit is where your farming happens — a pond, a paddock, a woodlot, a hive, a garden bed.
          Create one and you can start logging against it.
        </p>
        <section className="space-y-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: C.muted }}>Enterprise *</label>
            <select value={enterprise} onChange={(e) => setEnterprise(e.target.value)} disabled={loading}
              className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: !enterprise ? C.amber : C.border }}>
              <option value="">Pick…</option>
              {activeEnts.map((k) => <option key={k} value={k}>{ENT_LABEL[k] || k}</option>)}
            </select>
          </div>
          {enterprise && (
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Kind of unit *</label>
              <div className="flex flex-wrap gap-2">
                {kinds.map((k) => (
                  <button key={k} type="button" onClick={() => setPuType(k)}
                    className="px-3 py-2 rounded-md border text-sm font-medium"
                    style={{ background: puType === k ? C.green : "var(--paper)", color: puType === k ? "var(--paper)" : C.soil, borderColor: puType === k ? C.green : C.border }}>
                    {UNIT_LABEL[k] || k}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ opacity: enterprise && puType ? 1 : 0.4, pointerEvents: enterprise && puType ? "auto" : "none" }} className="space-y-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>Name it *</label>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64}
                placeholder={puType ? `e.g. ${UNIT_LABEL[puType]} 1, near the river` : "Give it a name"}
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: C.border }} />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: C.muted }}>{areaLabel} (optional)</label>
              <input type="number" inputMode="decimal" min={0} step={0.01} value={area} onChange={(e) => setArea(e.target.value)}
                className="w-full px-3 py-3 rounded-md border text-base" style={{ background: "var(--paper)", borderColor: C.border }} />
            </div>
          </div>
        </section>
        {anchorError && <div className="text-sm px-3 py-2 rounded-md" style={{ background: "#FDECEA", color: C.red, border: `1px solid ${C.red}` }}>{anchorError}</div>}
        {err && <div className="text-sm px-3 py-2 rounded-md" style={{ background: "#FDECEA", color: C.red, border: `1px solid ${C.red}` }}>{err}</div>}
        <button onClick={submit} disabled={!ready || busy || loading}
          className="w-full px-4 py-3 rounded-md text-base font-medium"
          style={{ background: !ready || busy ? "#A8C997" : C.green, color: "#fff", opacity: !ready || busy ? 0.7 : 1 }}>
          {busy ? "Creating…" : "Create unit"}
        </button>
      </div>
    </div>
  );
}
