"""AI Executive Summary — grounded, never hallucinated (TATI Phase 3, Pillar C).

Two paths, both grounded in the real passport read-model (Inviolable #1):
  - deterministic_summary(): instant, zero-LLM, zero-invention — composes the actual numbers
    + trust into institutional prose. The safe default + the fallback.
  - build_prompt(): a STRICT prompt for the OpenClaw bridge (LLM phrasing polish) that forbids
    inventing any figure not provided. Used by the "refresh with AI" path.

Either way it carries the standing caveat (D1): tamper-evident, farmer-reported, not externally
audited; not a lending decision.
"""
from __future__ import annotations

_CAVEAT = ("All figures are farmer-reported and tamper-evident (hash-chained), not independently "
           "audited. This is a reliability summary, not a lending decision — that rests with the "
           "reviewing institution.")

_DIM_LABEL = {
    "production": "production", "operations": "field operations", "market": "market activity",
    "compliance": "compliance", "financial": "financial record-keeping",
    "evidence_completeness": "evidence completeness", "record_consistency": "record consistency",
    "identity": "identity verification", "farm": "farm verification",
    "verification_history": "independent verification",
}


def _facts(passport: dict) -> list[str]:
    idn = passport.get("identity", {}) or {}
    rep = passport.get("reputation", {}) or {}
    tr = passport.get("trust", {}) or {}
    farms = passport.get("farms", []) or []
    name = idn.get("preferred_name") or idn.get("legal_name") or "The farmer"
    loc = farms[0].get("location") if farms else None
    f = []
    f.append(f"Name: {name}" + (f"; location: {loc}" if loc else ""))
    if idn.get("member_since"):
        f.append(f"On Teivaka since: {idn['member_since']}")
    if farms:
        f.append(f"Farms: {len(farms)} (" + ", ".join(x.get('farm_name') or x.get('name') or 'farm' for x in farms[:3]) + ")")
    f.append(f"Completed seasons: {rep.get('seasons_completed', 0)}; harvest records: {rep.get('harvest_records', 0)}; "
             f"logged production: {round(rep.get('verified_production_kg', 0))} kg")
    f.append(f"Recorded sales: {rep.get('sales_records', 0)} (FJD {round(rep.get('total_sales_fjd', 0))}); "
             f"photo-backed records: {rep.get('photo_evidence', 0)}")
    if tr.get("status") == "scored":
        f.append(f"Evidence & Reliability Confidence: {tr.get('overall_band')} ({tr.get('overall_score')}/100)")
        dims = tr.get("dimensions", []) or []
        strong = [_DIM_LABel(d) for d in dims if (d.get("score") or 0) >= 75]
        weak = [_DIM_LABel(d) for d in dims if (d.get("score") or 0) < 40]
        if strong:
            f.append("Strengths: " + ", ".join(strong))
        if weak:
            f.append("Still building: " + ", ".join(weak))
    else:
        f.append("Trust status: building (records still accumulating)")
    return f


def _DIM_LABel(d) -> str:
    return _DIM_LABEL.get(d.get("key"), d.get("key", "").replace("_", " "))


def deterministic_summary(passport: dict) -> str:
    idn = passport.get("identity", {}) or {}
    rep = passport.get("reputation", {}) or {}
    tr = passport.get("trust", {}) or {}
    farms = passport.get("farms", []) or []
    name = idn.get("preferred_name") or idn.get("legal_name") or "This farmer"
    loc = farms[0].get("location") if farms else None
    s = []
    s.append(f"{name} is a Teivaka-registered farmer"
             + (f" in {loc}" if loc else "")
             + (f", with records kept on the platform since {idn['member_since']}" if idn.get("member_since") else "") + ".")
    if rep.get("seasons_completed") or rep.get("harvest_records"):
        s.append(f"They have completed {rep.get('seasons_completed', 0)} growing season(s) with "
                 f"{rep.get('harvest_records', 0)} harvest record(s) totalling about "
                 f"{round(rep.get('verified_production_kg', 0))} kg of logged production.")
    if rep.get("sales_records"):
        s.append(f"{rep['sales_records']} sale(s) are on record (about FJD {round(rep.get('total_sales_fjd', 0)):,}).")
    if tr.get("status") == "scored":
        dims = tr.get("dimensions", []) or []
        strong = [_DIM_LABel(d) for d in dims if (d.get("score") or 0) >= 75]
        weak = [_DIM_LABel(d) for d in dims if (d.get("score") or 0) < 40]
        s.append(f"Their Evidence & Reliability Confidence is {tr.get('overall_band')} "
                 f"({tr.get('overall_score')}/100), built from {rep.get('photo_evidence', 0)} "
                 f"photo-backed record(s) on a tamper-evident audit chain"
                 + (f"; strongest in {', '.join(strong)}" if strong else "")
                 + (f", with {', '.join(weak)} still building" if weak else "") + ".")
    else:
        s.append("Their verified reputation is still building as farming records accumulate.")
    s.append(_CAVEAT)
    return " ".join(s)


def build_prompt(passport: dict) -> str:
    facts = "\n".join(f"- {x}" for x in _facts(passport))
    return (
        "You are writing a concise institutional summary of a farmer for a bank/lender or buyer.\n"
        "Use ONLY the facts below. Do NOT invent or estimate any number, date, crop, or claim that "
        "is not listed. 4–6 sentences, plain professional English, readable in under two minutes. "
        "Describe who they are, what they produce, how long they've operated, the quality/consistency "
        "of their evidence, strengths and what is still building. Do NOT make a lending recommendation.\n"
        f"End with exactly this sentence: \"{_CAVEAT}\"\n\nFACTS:\n{facts}"
    )
