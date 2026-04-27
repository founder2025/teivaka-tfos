/**
 * InputsSandbox — visual harness for ThemedCombobox + ThemedSelect.
 *
 * Throwaway page. Mounted at /admin/dev/inputs-sandbox during the
 * Phase 4.x.UX-1a rollout window so the two themed input atoms can be
 * eyeballed in both palettes side-by-side before retrofits start touching
 * real forms. Removed in UX-1c janitorial.
 */

import { useState } from "react";

import ThemedCombobox from "../../components/inputs/ThemedCombobox";
import ThemedSelect   from "../../components/inputs/ThemedSelect";
import { PALETTE_FARM, PALETTE_DARK } from "../../styles/palette";

const FRUITS = [
  { value: "apple",       label: "Apple",        sublabel: "Pome · temperate" },
  { value: "banana",      label: "Banana",       sublabel: "Tropical · year-round" },
  { value: "breadfruit",  label: "Breadfruit",   sublabel: "Pacific staple" },
  { value: "cassava",     label: "Cassava",      sublabel: "Root · 9–12 mo cycle" },
  { value: "coconut",     label: "Coconut",      sublabel: "Tree · Fiji-wide" },
  { value: "dalo",        label: "Dalo (taro)",  sublabel: "Wetland · 9 mo" },
  { value: "guava",       label: "Guava",        sublabel: "Tropical fruit" },
  { value: "kava",        label: "Kava",         sublabel: "4–5 yr crop · CRP-KAV" },
  { value: "mango",       label: "Mango",        sublabel: "Seasonal · Oct–Jan" },
  { value: "papaya",      label: "Papaya",       sublabel: "Tropical · short cycle" },
  { value: "pineapple",   label: "Pineapple",    sublabel: "Bromeliad · 18 mo" },
  { value: "yam",         label: "Yam",          sublabel: "Root · 8–10 mo" },
];

const GRADES = [
  { value: "A", label: "Grade A", sublabel: "Premium" },
  { value: "B", label: "Grade B", sublabel: "Standard" },
  { value: "C", label: "Grade C", sublabel: "Local market" },
  { value: "D", label: "Grade D", sublabel: "Processing only" },
  { value: "X", label: "Reject",  sublabel: "Off-grade / waste" },
];

function Section({ palette, title }) {
  const [comboValue,    setComboValue]    = useState("");
  const [comboLoaded,   setComboLoaded]   = useState("");
  const [selectValue,   setSelectValue]   = useState("");
  const [requiredCombo, setRequiredCombo] = useState("");
  const [requiredSelect,setRequiredSelect]= useState("");

  return (
    <div
      className="rounded-2xl p-6 space-y-6"
      style={{ background: palette.bg, border: `1px solid ${palette.border}` }}
    >
      <div>
        <h2 className="text-lg font-bold" style={{ color: palette.text }}>{title}</h2>
        <p className="text-xs" style={{ color: palette.textMuted }}>
          bg {palette.bg} · text {palette.text} · accent {palette.accent} · tint {palette.accentTint}
        </p>
      </div>

      <Block label="ThemedCombobox · default" palette={palette}>
        <ThemedCombobox
          value={comboValue}
          onChange={setComboValue}
          options={FRUITS}
          placeholder="Type a crop…"
          palette={palette}
        />
        <Tip palette={palette}>value: <code>{comboValue || "—"}</code></Tip>
      </Block>

      <Block label="ThemedCombobox · loading" palette={palette}>
        <ThemedCombobox
          value={comboLoaded}
          onChange={setComboLoaded}
          options={[]}
          placeholder="Loading catalog…"
          palette={palette}
          loading
        />
      </Block>

      <Block label="ThemedCombobox · empty list (with hint)" palette={palette}>
        <ThemedCombobox
          value=""
          onChange={() => {}}
          options={[]}
          placeholder="Type to filter (no options available)…"
          palette={palette}
          emptyMessage="No matches"
          noResultsHint="for this crop"
        />
      </Block>

      <Block label="ThemedCombobox · disabled" palette={palette}>
        <ThemedCombobox
          value="kava"
          onChange={() => {}}
          options={FRUITS}
          palette={palette}
          disabled
        />
      </Block>

      <Block label="ThemedCombobox · required" palette={palette}>
        <ThemedCombobox
          value={requiredCombo}
          onChange={setRequiredCombo}
          options={FRUITS}
          placeholder="Required crop…"
          palette={palette}
          required
        />
      </Block>

      <Block label="ThemedSelect · default" palette={palette}>
        <ThemedSelect
          value={selectValue}
          onChange={setSelectValue}
          options={GRADES}
          placeholder="Pick a grade…"
          palette={palette}
        />
        <Tip palette={palette}>value: <code>{selectValue || "—"}</code></Tip>
      </Block>

      <Block label="ThemedSelect · disabled" palette={palette}>
        <ThemedSelect
          value="A"
          onChange={() => {}}
          options={GRADES}
          palette={palette}
          disabled
        />
      </Block>

      <Block label="ThemedSelect · required" palette={palette}>
        <ThemedSelect
          value={requiredSelect}
          onChange={setRequiredSelect}
          options={GRADES}
          placeholder="Required grade…"
          palette={palette}
          required
        />
      </Block>
    </div>
  );
}

function Block({ label, children, palette }) {
  return (
    <div>
      <div
        className="text-[11px] uppercase tracking-wider font-medium mb-1.5"
        style={{ color: palette.textMuted }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function Tip({ palette, children }) {
  return (
    <div className="text-xs mt-1" style={{ color: palette.textMuted }}>
      {children}
    </div>
  );
}

export default function InputsSandbox() {
  return (
    <div
      className="min-h-screen p-6"
      style={{ background: "#1A1410", fontFamily: "'Lora', Georgia, serif" }}
    >
      <header className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "#F5EFE0" }}>
          Inputs Sandbox
        </h1>
        <p className="text-sm" style={{ color: "#A89880" }}>
          Phase 4.x.UX-1a · ThemedCombobox + ThemedSelect visual sign-off.
          Removed in UX-1c janitorial.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Section palette={PALETTE_FARM} title="PALETTE_FARM (warm)" />
        <Section palette={PALETTE_DARK} title="PALETTE_DARK (brand)" />
      </div>
    </div>
  );
}
