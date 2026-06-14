/**
 * CapacityCalc.jsx — area-based capacity estimate (math only, no agronomy).
 *
 * Given a block area, estimate plant count (from row x in-row spacing) or
 * livestock head (from area-per-animal). Pure arithmetic: area / spacing. The
 * farmer supplies the spacing — TFOS invents no agronomic figures (Inviolable
 * rule #1). Used both in the map editor and on the Locations page.
 */
import { useState } from "react";
import { Calculator, Sprout, Beef } from "lucide-react";

const C = { soil: "var(--soil)", cream: "var(--cream)", border: "#E6DED0", muted: "#8A7863", green: "var(--green)", greenDk: "var(--green-dk)", paper: "#FCFAF5" };
const HA_TO = { acres: 2.47105, ha: 1, m2: 10000 };
const PER_ANIMAL_TO_M2 = { acres: 4046.86, ha: 10000, m2: 1 };

function fmtArea(ha, unit) {
  if (ha == null) return "—";
  const v = ha * HA_TO[unit];
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit === "m2" ? "m²" : unit}`;
}
const num = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : 0; };

export default function CapacityCalc({ areaHa, unit = "acres", compact = false }) {
  const [mode, setMode] = useState("crop");           // crop | livestock
  const [row, setRow] = useState("");                 // cm
  const [inrow, setInrow] = useState("");             // cm
  const [usable, setUsable] = useState("90");         // % of block actually planted
  const [perAnimal, setPerAnimal] = useState("");     // area each
  const [perUnit, setPerUnit] = useState(unit === "m2" ? "ha" : unit);

  const m2 = areaHa != null ? areaHa * 10000 : 0;
  let count = null, detail = "";
  if (mode === "crop") {
    const a = (num(row) / 100) * (num(inrow) / 100);  // m² per plant
    if (a > 0 && m2 > 0) {
      count = Math.floor((m2 * (num(usable) / 100 || 1)) / a);
      detail = `${num(row)}cm × ${num(inrow)}cm spacing · ${num(usable) || 100}% planted`;
    }
  } else {
    const a = num(perAnimal) * PER_ANIMAL_TO_M2[perUnit];
    if (a > 0 && m2 > 0) {
      count = Math.floor(m2 / a);
      detail = `${num(perAnimal)} ${perUnit === "m2" ? "m²" : perUnit} per head`;
    }
  }

  const Field = ({ label, value, onChange, suffix, w = "w-full" }) => (
    <label className={`${w} block`}>
      <span className="text-[11px] block mb-0.5" style={{ color: C.muted }}>{label}</span>
      <div className="flex items-center rounded-lg overflow-hidden" style={{ border: `1.5px solid ${C.border}`, background: C.paper }}>
        <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full px-2.5 py-2 text-sm bg-transparent focus:outline-none" style={{ color: C.soil }} placeholder="0" />
        {suffix && <span className="text-[11px] px-2" style={{ color: C.muted }}>{suffix}</span>}
      </div>
    </label>
  );

  return (
    <div className="rounded-xl" style={compact ? {} : { background: "var(--paper)" }}>
      <div className="flex items-center gap-2 mb-2">
        <Calculator size={15} style={{ color: C.greenDk }} />
        <span className="text-sm font-bold" style={{ color: C.soil }}>Capacity estimate</span>
        <span className="text-[11px] ml-auto" style={{ color: C.muted }}>area {fmtArea(areaHa, unit)}</span>
      </div>

      <div className="flex gap-1.5 mb-3">
        {[["crop", "Plants", Sprout], ["livestock", "Livestock", Beef]].map(([m, lbl, Icon]) => (
          <button key={m} onClick={() => setMode(m)}
            className="flex-1 text-xs px-2 py-1.5 rounded-lg font-semibold flex items-center justify-center gap-1.5"
            style={mode === m ? { background: C.greenDk, color: "#fff" } : { color: C.soil, border: `1px solid ${C.border}` }}>
            <Icon size={13} />{lbl}
          </button>
        ))}
      </div>

      {mode === "crop" ? (
        <div className="grid grid-cols-3 gap-2">
          <Field label="Row spacing" value={row} onChange={setRow} suffix="cm" />
          <Field label="Plant spacing" value={inrow} onChange={setInrow} suffix="cm" />
          <Field label="Usable" value={usable} onChange={setUsable} suffix="%" />
        </div>
      ) : (
        <div className="flex gap-2 items-end">
          <Field label="Area per animal" value={perAnimal} onChange={setPerAnimal} />
          <label className="block">
            <span className="text-[11px] block mb-0.5" style={{ color: C.muted }}>Unit</span>
            <select value={perUnit} onChange={(e) => setPerUnit(e.target.value)} className="px-2 py-2 text-sm rounded-lg" style={{ border: `1.5px solid ${C.border}`, background: C.paper, color: C.soil }}>
              <option value="acres">acres</option>
              <option value="ha">ha</option>
              <option value="m2">m²</option>
            </select>
          </label>
        </div>
      )}

      <div className="mt-3 rounded-xl p-3 flex items-baseline gap-2" style={{ background: count != null ? "#E9F2DD" : C.paper }}>
        {count != null ? (
          <>
            <span className="text-2xl font-bold" style={{ color: C.greenDk }}>≈ {count.toLocaleString()}</span>
            <span className="text-sm font-semibold" style={{ color: C.soil }}>{mode === "crop" ? "plants" : "head"}</span>
          </>
        ) : (
          <span className="text-sm" style={{ color: C.muted }}>Enter spacing to estimate</span>
        )}
      </div>
      {detail && <p className="text-[11px] mt-1.5" style={{ color: C.muted }}>{detail} · estimate only — your spacing, our maths.</p>}
    </div>
  );
}
