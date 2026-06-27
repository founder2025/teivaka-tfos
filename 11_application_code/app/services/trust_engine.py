"""Trust Engine v1 — PURE, explainable scoring (TATI Phase 2).

Evidence & Reliability Confidence — NOT a creditworthiness score (D1). Teivaka explains
*why* the data is trustworthy; institutions decide lending.

Design rules:
  - PURE: every function takes an evidence dict and returns a result dict — no I/O, no DB.
    The worker gathers evidence (SQL); this module only does the math. → unit-testable.
  - EXPLAINABLE: each dimension returns {key,label,score,band,why,evidence[],how_to_improve}.
  - TUNABLE + VERSIONED: weights are constants; FORMULA_VERSION is stamped into snapshots so
    a score is always reproducible/auditable.
  - HONEST cold-start: no evidence → score 0, band "Building", with the exact path to grow it.
  - ANTI-GAMING: buyer-confirmed ≫ self-reported; consistency rewarded; identity never
    "verified" on SELF alone; verifications time-decay.

Bands (per dimension AND overall): Building <25 · Developing <50 · Established <75 · Strong ≥75.
"""
from __future__ import annotations

import math
from datetime import date, datetime

FORMULA_VERSION = "v3"  # v3: link-attestation channel-discount (no IP punishment) + decay + magnitude

# Link-based attestations (officer/coop/landowner/buyer confirmed via a link) are real but
# NOT identity-proofed — anyone with the link could click (PR-1). So they earn PARTIAL credit:
# enough to clearly beat self-only, capped below a future account-verified (KYC) source.
# When verifier ACCOUNTS ship (PP-27), account-channel confirmations get full weight.
LINK_DISCOUNT = 0.7
_SELF_SOURCES = ("SELF", "EMAIL", "PHONE")

# Per-source confidence weights for claim_verifications (D4). SELF lowest; third parties highest.
SOURCE_WEIGHTS = {
    "SELF": 5, "PHONE": 10, "EMAIL": 10, "BUYER": 15, "COOPERATIVE": 20,
    "LANDOWNER": 25, "EXTENSION_OFFICER": 25, "GOV_PROGRAMME": 25,
    "GOV_ID": 30, "FINANCIAL_INSTITUTION": 30,
}

DIMENSIONS = [
    "production", "operations", "market", "compliance", "financial",
    "evidence_completeness", "record_consistency", "identity", "farm", "verification_history",
]
_LABELS = {
    "production": "Production", "operations": "Operations", "market": "Market",
    "compliance": "Compliance", "financial": "Financial record", "evidence_completeness": "Evidence completeness",
    "record_consistency": "Record consistency", "identity": "Identity", "farm": "Farm",
    "verification_history": "Independent verification",
}


def band(score: int) -> str:
    if score >= 75:
        return "Strong"
    if score >= 50:
        return "Established"
    if score >= 25:
        return "Developing"
    return "Building"


def _clamp(v) -> int:
    return max(0, min(100, int(round(v))))


def _r(key, score, why, evidence, how):
    return {"key": key, "label": _LABELS[key], "score": _clamp(score), "band": band(_clamp(score)),
            "why": why, "evidence": evidence, "how_to_improve": how}


# ── dimensions (each: evidence dict → result) ────────────────────────────────
def production(ev: dict) -> dict:
    seasons = ev.get("closed_seasons", 0)
    harvests = ev.get("harvest_records", 0)
    total_kg = ev.get("total_kg", 0) or 0
    cv = ev.get("yield_cv")  # coefficient of variation of harvest weights; None if <2 harvests
    # Scale matters (PP-19): a larger operation outscores a tiny one. Log-scaled so it rewards
    # magnitude without runaway (≈100kg→+12, 1t→+18, 10t→+24 capped at 25).
    magnitude = _clamp(min(25, math.log10(total_kg + 1) * 6)) if total_kg > 0 else 0
    base = min(70, seasons * 14 + harvests * 3 + magnitude)
    consistency = 0 if cv is None else _clamp(30 * (1 - min(cv, 1.0)))  # steadier yields → up to +30
    score = base + (consistency if harvests >= 2 else 0)
    mag_word = "" if total_kg <= 0 else f"; {round(total_kg):,} kg logged"
    why = (f"{seasons} completed season(s), {harvests} harvest record(s){mag_word}"
           + ("" if cv is None else f"; yield consistency {'high' if cv < 0.3 else 'moderate' if cv < 0.6 else 'variable'}"))
    how = "Complete more seasons, log every harvest with weights, and grow volume — scale and steadiness both raise this."
    return _r("production", score, why, [f"{seasons} closed seasons", f"{harvests} harvests", f"{round(total_kg)} kg"], how)


def operations(ev: dict) -> dict:
    events = ev.get("field_events", 0)
    media = ev.get("events_with_media", 0)
    active_months = ev.get("active_months", 0)
    cadence = min(60, active_months * 8)                      # sustained activity across months
    coverage = 0 if events == 0 else _clamp(40 * media / events)  # photo/GPS-backed share
    score = cadence + coverage
    why = f"Logged activity across {active_months} month(s); {media} of {events} events carry a photo or GPS."
    how = "Log field activity regularly and attach a photo or GPS to each — both lift this score."
    return _r("operations", score, why, [f"{events} field events", f"{media} with media", f"{active_months} active months"], how)


def market(ev: dict) -> dict:
    sales = ev.get("sales_count", 0)
    buyers = ev.get("distinct_buyers", 0)
    repeat = ev.get("repeat_buyers", 0)
    base = min(60, sales * 6)
    relationships = min(40, buyers * 8 + repeat * 8)         # repeat buyers weighted
    score = base + relationships
    why = f"{sales} recorded sale(s) across {buyers} buyer(s), {repeat} of them repeat."
    how = "Record every sale and your buyers — repeat buyers strengthen your market reputation most."
    return _r("market", score, why, [f"{sales} sales", f"{buyers} buyers", f"{repeat} repeat"], how)


def compliance(ev: dict) -> dict:
    overrides = ev.get("overrides", 0)
    holds = ev.get("active_holds", 0)
    flagged = ev.get("flagged", 0)                            # off-label / unidentified chemicals
    has_activity = ev.get("chemical_records", 0) > 0 or ev.get("harvest_records", 0) > 0
    if not has_activity:
        return _r("compliance", 0, "No spray or harvest activity recorded yet — nothing to assess.",
                  [], "This builds once you log sprays and harvests under withholding-period control.")
    score = 100 - overrides * 25 - holds * 10 - flagged * 8
    why = (f"{overrides} override(s), {holds} active withholding hold(s), {flagged} off-label/"
           f"unidentified application(s)." if (overrides or holds or flagged) else
           "Clean — withholding periods honoured, no overrides, no off-label use.")
    how = "Wait out withholding periods (avoid overrides) and always identify the chemical you apply."
    return _r("compliance", score, why, [f"{overrides} overrides", f"{holds} holds", f"{flagged} flagged"], how)


def financial(ev: dict) -> dict:
    # Record DISCIPLINE — length + completeness of the cash record, NOT profitability (D1).
    months = ev.get("cash_months", 0)
    records = ev.get("cash_records", 0)
    score = min(100, months * 10 + records * 2)
    why = f"Cash records kept across {months} month(s) ({records} entries) — a continuous, datable money trail."
    how = "Keep logging money in and out every month — an unbroken record is what a lender reads, not the profit."
    return _r("financial", score, why, [f"{months} months", f"{records} entries"], how)


def evidence_completeness(ev: dict) -> dict:
    total = ev.get("evidenceable_events", 0)
    backed = ev.get("events_with_media", 0)
    score = 0 if total == 0 else _clamp(100 * backed / total)
    why = ("No events yet to back with evidence." if total == 0 else
           f"{backed} of {total} loggable events carry a photo, GPS or witness.")
    how = "Attach a photo, GPS or witness when you log — evidence-backed records are the strongest."
    return _r("evidence_completeness", score, why, [f"{backed}/{total} backed"], how)


def record_consistency(ev: dict) -> dict:
    breaks = ev.get("chain_breaks", 0)
    total = ev.get("chain_events", 0)
    if total == 0:
        return _r("record_consistency", 0, "No records in the audit chain yet.", [],
                  "This builds automatically — every action you log is hash-stamped in sequence.")
    score = 100 if breaks == 0 else _clamp(100 - breaks * 20)
    why = ("Audit chain intact — nothing altered or backdated." if breaks == 0 else
           f"{breaks} chain inconsistency(ies) detected.")
    how = "Keep logging in real time. The chain is tamper-evident — it stays strong on its own."
    return _r("record_consistency", score, why, [f"{total} events", f"{breaks} breaks"], how)


def _as_date(v):
    if v is None:
        return None
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).date()
    except Exception:  # noqa: BLE001
        return None


def _recency_factor(verified_at, as_of: date) -> float:
    d = _as_date(verified_at)
    if not d:
        return 1.0
    age = (as_of - d).days
    if age <= 365:
        return 1.0
    if age <= 730:
        return 0.6
    return 0.3


def _claim_score(claims: list, claim_types: set, as_of: date) -> tuple:
    """Weighted, self-capped score. Honours expiry + recency decay (P-2). A link-attested
    third-party source earns PARTIAL (discounted) credit — real but not KYC-grade (PR-1):
    we do NOT punish it by IP (false-positives in shared-NAT Fiji); we right-size its weight
    and label it 'community-attested'. The IP-match `independent` flag is kept for transparency,
    not used to deny credit. Full weight arrives with verifier ACCOUNTS (PP-27)."""
    rel = [c for c in claims if c.get("claim_type") in claim_types and c.get("status") == "VERIFIED"
           and not (_as_date(c.get("expires_at")) and _as_date(c.get("expires_at")) < as_of)]
    weight = 0.0
    third_party = False
    for c in rel:
        w = SOURCE_WEIGHTS.get(c.get("source"), 0) * _recency_factor(c.get("verified_at"), as_of)
        if c.get("source") not in _SELF_SOURCES:
            w *= LINK_DISCOUNT          # community-attested (link) — partial credit
            third_party = True
        weight += w
    score = min(100, weight)
    if not third_party:
        score = min(score, 20)          # self/contact alone never beyond low-Developing
    sources = sorted({c.get("source") for c in rel})
    return int(round(score)), sources, third_party


def identity(ev: dict) -> dict:
    as_of = ev.get("as_of") or date.today()
    score, sources, third = _claim_score(ev.get("claims", []), {"IDENTITY"}, as_of)
    if third:
        why = f"Community-attested by: {', '.join(s.replace('_', ' ').title() for s in sources if s not in _SELF_SOURCES)}."
    elif sources:
        why = "Self/contact only — a confirmation from an officer, coop or buyer lifts this."
    else:
        why = "Not yet confirmed."
    how = "Get verified by an extension officer, cooperative, government programme, or with a government ID."
    return _r("identity", score, why, sources, how)


def farm(ev: dict) -> dict:
    as_of = ev.get("as_of") or date.today()
    score, sources, third = _claim_score(ev.get("claims", []), {"FARM_OWNERSHIP", "LAND_BOUNDARY"}, as_of)
    mapped = ev.get("gps_mapped", False)
    if mapped:
        score = min(100, score + 15)
    why = (("Farm boundary mapped. " if mapped else "Boundary not yet mapped. ")
           + (f"Ownership confirmed by: {', '.join(s.replace('_', ' ').title() for s in sources)}." if sources else "Ownership self-asserted."))
    how = "Map your farm boundary in Locations and get ownership confirmed by the landowner or an extension officer."
    return _r("farm", score, why, (["GPS mapped"] if mapped else []) + sources, how)


def verification_history(ev: dict) -> dict:
    as_of = ev.get("as_of") or date.today()
    claims = [c for c in ev.get("claims", []) if c.get("status") == "VERIFIED"
              and not (_as_date(c.get("expires_at")) and _as_date(c.get("expires_at")) < as_of)]
    distinct = sorted({c.get("source") for c in claims})
    community = sorted({c.get("source") for c in claims if c.get("source") not in _SELF_SOURCES})
    score = min(100, len(distinct) * 10 + len(community) * 14)  # community-attested (link) discounted
    why = (f"{len(distinct)} verification source(s)" + (f", {len(community)} community-attested." if community else ", all self/contact.")
           if distinct else "No verifications yet.")
    how = "Each confirmation (officer, coop, buyer, bank) broadens your trust; verified accounts will count for more."
    return _r("verification_history", score, why, distinct, how)


_FUNCS = {
    "production": production, "operations": operations, "market": market, "compliance": compliance,
    "financial": financial, "evidence_completeness": evidence_completeness,
    "record_consistency": record_consistency, "identity": identity, "farm": farm,
    "verification_history": verification_history,
}


def compute_all(evidence: dict) -> dict:
    """Return {dimensions:[...], overall:{score,band,label}}. `evidence` carries all inputs."""
    evidence.setdefault("as_of", date.today())
    dims = [_FUNCS[k](evidence) for k in DIMENSIONS]
    scored = [d["score"] for d in dims]
    overall_score = _clamp(sum(scored) / len(scored)) if scored else 0
    return {
        "dimensions": dims,
        "overall": {"score": overall_score, "band": band(overall_score),
                    "label": "Evidence & Reliability Confidence",
                    "disclaimer": "Reflects the completeness and consistency of verified records — "
                                  "not a credit decision. Lending decisions rest with the institution."},
        "formula_version": FORMULA_VERSION,
    }
