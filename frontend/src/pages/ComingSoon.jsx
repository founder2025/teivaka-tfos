import { useParams } from "react-router-dom";
import { Construction } from "lucide-react";

const C = {
  soil:  "#5C4033",
  green: "#6AA84F",
};

/**
 * ComingSoon — placeholder page used by:
 *   - Explicit Day-3a stub routes (pass `title` + `phase`)
 *   - Dynamic `/stub/phase-:phaseNum` catch-all (pass `dynamic`)
 */
export default function ComingSoon({ title, phase, dynamic }) {
  const params = useParams();
  const effectivePhase = dynamic ? params.phaseNum : phase;
  const effectiveTitle = dynamic ? "This feature" : title;

  return (
    <div className="flex flex-col items-center text-center gap-4 py-16 px-4">
      <Construction size={48} strokeWidth={1.5} style={{ color: C.soil, opacity: 0.5 }} />
      <h1 className="text-2xl font-semibold" style={{ color: C.soil }}>
        {effectiveTitle}
      </h1>
      <p className="text-sm" style={{ color: C.soil, opacity: 0.8 }}>
        Launching in Phase {effectivePhase}.
      </p>
      <p className="text-sm max-w-md" style={{ color: C.soil, opacity: 0.7 }}>
        TIS is ready for you. Tap the sparkles button anytime to ask what
        you should do right now.
      </p>
    </div>
  );
}
