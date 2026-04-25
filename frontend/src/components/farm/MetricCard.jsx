/**
 * MetricCard — single metric tile for the Farm Overview grid.
 *
 * Live cards: full opacity, optional trend chip.
 * Phase-stub cards: pass `phase` ("Phase 5" / "Phase 6") — renders dimmed with
 * a small badge in the corner so farmers see what's coming.
 */
const C = {
  soil:    "#5C4033",
  green:   "#6AA84F",
  greenDk: "#3E7B1F",
  amber:   "#BF9000",
  red:     "#D4442E",
  cream:   "#F8F3E9",
  border:  "#E6DED0",
  muted:   "#8A7863",
};

const TREND_COLOR = {
  up:   C.greenDk,
  down: C.red,
  warn: C.amber,
};

export default function MetricCard({
  label,
  value,
  sub,
  trend,
  trendLabel,
  phase,
  loading,
}) {
  const dimmed = !!phase;
  return (
    <div
      className="bg-white rounded-xl px-3 py-3 relative transition-transform"
      style={{
        border: `1px solid ${C.border}`,
        opacity: dimmed ? 0.55 : 1,
      }}
    >
      {phase && (
        <span
          className="absolute text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded"
          style={{
            top: 6,
            right: 6,
            background: C.cream,
            color: C.muted,
            border: `1px solid ${C.border}`,
          }}
        >
          {phase}
        </span>
      )}
      <div
        className="text-[10px] uppercase tracking-wider font-medium mb-1"
        style={{ color: C.muted, paddingRight: phase ? 56 : 0 }}
      >
        {label}
      </div>
      {loading ? (
        <div
          className="rounded animate-pulse"
          style={{ background: "#EFE7D6", height: 22, width: "60%" }}
        />
      ) : (
        <div
          className="text-lg font-bold leading-tight"
          style={{ color: C.soil }}
        >
          {value}
          {trend && trendLabel && (
            <span
              className="text-[11px] font-semibold ml-1.5"
              style={{ color: TREND_COLOR[trend] || C.muted }}
            >
              {trendLabel}
            </span>
          )}
        </div>
      )}
      {sub && (
        <div className="text-[11px] mt-1" style={{ color: C.muted }}>
          {sub}
        </div>
      )}
    </div>
  );
}
