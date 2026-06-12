"""capabilities.py — TFOS capability / entitlement layer (single source of truth).

THE ONE PLACE GATING IS CONFIGURED.

Today the platform is open: every member capability below is gated OPEN, which
means "allowed for any authenticated user". Later, turning on a paywall or a
verification requirement for a feature is a ONE-LINE change here — flip a
capability's `gate` to SUBSCRIPTION or VERIFICATION (and set `min_tier`) and
ship the matching upsell/verify UI. No endpoint or component refactor.

How it is wired:
  - Backend: member-action endpoints add `Depends(require("CREATE_POST"))` etc.
    Today every such guard passes. That is the enforcement seam — flipping a
    gate here begins returning 403 {code: CAPABILITY_LOCKED} with no other change.
  - Frontend: GET /api/v1/auth/me returns `capabilities` (this map computed for
    the current user). The `useCan()` hook reads it to show/enable UI. Today
    every capability is true, so nothing is hidden.

ADMIN IS NOT A CAPABILITY. It is never OPEN and never flows through this layer.
Admin surfaces keep their own server-side role guard (roles.has_role(.,"ADMIN")).
Opening member capabilities must never widen admin access.

TODO(gating): when enabling a gate, (1) flip the cap's `gate`/`min_tier` below,
(2) ensure the endpoint has `Depends(require(<cap>))`, (3) add the frontend
upsell/verify prompt keyed on the same capability. Nothing else changes.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from fastapi import Depends, HTTPException, status

from app.middleware.rls import get_current_user


class Gate(str, Enum):
    """Kinds of gate a capability can require. Today only OPEN is in use."""
    OPEN = "OPEN"                  # any authenticated user
    SUBSCRIPTION = "SUBSCRIPTION"  # requires tier >= min_tier
    VERIFICATION = "VERIFICATION"  # requires email_verified (later: KYC)
    HIGH_TRUST = "HIGH_TRUST"      # account_type KYC (banker/exporter/…)
    PERSONA = "PERSONA"            # allowed only for certain persona groups


@dataclass(frozen=True)
class CapSpec:
    gate: Gate = Gate.OPEN
    min_tier: str | None = None
    groups: tuple = ()            # persona groups allowed when gate == PERSONA


# Subscription ordering (low → high). Used only when a SUBSCRIPTION gate is on.
TIER_ORDER = ["FREE", "BASIC", "PREMIUM", "PROFESSIONAL", "CUSTOM"]


def tier_at_least(user_tier: str | None, min_tier: str | None) -> bool:
    if not min_tier:
        return True
    try:
        return TIER_ORDER.index((user_tier or "").upper()) >= TIER_ORDER.index(min_tier.upper())
    except ValueError:
        return False


# ---------------------------------------------------------------------------
# THE REGISTRY — every member capability, all OPEN for now.
# ---------------------------------------------------------------------------
CAPABILITIES: dict[str, CapSpec] = {
    # Content
    "CREATE_POST":   CapSpec(gate=Gate.OPEN),
    "EDIT_POST":     CapSpec(gate=Gate.OPEN),
    "DELETE_POST":   CapSpec(gate=Gate.OPEN),
    "POST_STORY":    CapSpec(gate=Gate.OPEN),
    "UPDATE_STATUS": CapSpec(gate=Gate.OPEN),
    # Profile
    "SET_AVATAR":    CapSpec(gate=Gate.OPEN),
    "SET_COVER":     CapSpec(gate=Gate.OPEN),
    "EDIT_PROFILE":  CapSpec(gate=Gate.OPEN),
    # Social graph
    "FOLLOW":        CapSpec(gate=Gate.OPEN),
    "REACT":         CapSpec(gate=Gate.OPEN),
    "COMMENT":       CapSpec(gate=Gate.OPEN),
    "SHARE":         CapSpec(gate=Gate.OPEN),
    "SEND_MESSAGE":  CapSpec(gate=Gate.OPEN),
    # Groups
    "JOIN_GROUP":    CapSpec(gate=Gate.OPEN),
    "CREATE_GROUP":  CapSpec(gate=Gate.OPEN),
    # High-value actions — the progressive-verification watcher (Section 4).
    # OPEN today: every account provisions into an active, UNVERIFIED workspace and
    # can use the platform freely. Flip any of these to Gate.HIGH_TRUST to require
    # identity (kyc_verified): the endpoint then returns 403 IDENTITY_VERIFICATION_
    # REQUIRED and the UI shows the identity-capture screen. No endpoint/component
    # change needed to enable — just this one line.
    "EXTRACT_BANK_EVIDENCE": CapSpec(gate=Gate.OPEN),
    "EXECUTE_SETTLEMENT":    CapSpec(gate=Gate.OPEN),
    "FINANCIAL_MATCHING":    CapSpec(gate=Gate.OPEN),
    # Persona abilities (Slice 4). Gate.PERSONA → allowed only for the listed persona
    # groups (PRODUCER/TRADE/SERVICE/CAPITAL/GOVERNANCE). The /auth/me capabilities map
    # carries these so the UI can show/hide persona-specific CTAs. ACCESS_FARM /
    # TIS_QUERY / MARKET_LIST stay OPEN today (no regression to working cross-persona
    # features) — flip to PERSONA (with the groups shown) to hard-enforce server-side.
    "ACCESS_FARM":             CapSpec(gate=Gate.OPEN),   # flip → PERSONA groups=("PRODUCER","GOVERNANCE")
    "TIS_QUERY":               CapSpec(gate=Gate.OPEN),   # flip → PERSONA groups=("PRODUCER",)
    "MARKET_LIST":             CapSpec(gate=Gate.OPEN),   # flip → PERSONA groups=("TRADE","SERVICE","PRODUCER")
    # New contribute ability — institutions only. Not wired to an endpoint yet, so
    # gating it now regresses nothing; the UI reads it to show an "upload module" CTA.
    "CLASSROOM_UPLOAD_MODULE": CapSpec(gate=Gate.PERSONA, groups=("TRADE", "CAPITAL", "GOVERNANCE")),
}


def can(user: dict | None, capability: str) -> bool:
    """Single decision point. Unknown capability → False (fail closed)."""
    if user is None:
        return False
    spec = CAPABILITIES.get(capability)
    if spec is None:
        return False
    if spec.gate == Gate.OPEN:
        return True
    # TODO(gating): the branches below activate when a gate is flipped on.
    if spec.gate == Gate.VERIFICATION:
        return bool(user.get("email_verified"))
    if spec.gate == Gate.SUBSCRIPTION:
        return tier_at_least(user.get("tier") or user.get("subscription_tier"), spec.min_tier)
    if spec.gate == Gate.HIGH_TRUST:
        return bool(user.get("kyc_verified"))
    if spec.gate == Gate.PERSONA:
        from app.core.account_types import persona_group
        return persona_group(user.get("account_type")) in spec.groups
    return False


def compute_capabilities(user: dict | None) -> dict[str, bool]:
    """The full allow/deny map for a user — returned by /auth/me for the UI."""
    return {name: can(user, name) for name in CAPABILITIES}


def require(capability: str):
    """FastAPI dependency factory. 403 {code: CAPABILITY_LOCKED} when denied.

    Usage on a member endpoint:
        @router.post("/posts")
        async def create_post(..., _=Depends(require("CREATE_POST"))):
    Today every OPEN capability passes for any authenticated user.
    """
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if not can(user, capability):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "CAPABILITY_LOCKED",
                    "capability": capability,
                    "message": "This feature isn't available on your account yet.",
                },
            )
        return user
    return _dep


def require_identity(capability: str):
    """Progressive-verification watcher dependency.

    Like require(), but on denial emits IDENTITY_VERIFICATION_REQUIRED (vs
    CAPABILITY_LOCKED) so the frontend shows the identity-capture screen rather than
    a subscription upsell. Wire onto high-value endpoints (Bank-Evidence extraction,
    settlement execution, financial matching). Passes while the capability is OPEN;
    enforces the instant it's flipped to Gate.HIGH_TRUST (requires kyc_verified).
    """
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        if not can(user, capability):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "IDENTITY_VERIFICATION_REQUIRED",
                    "capability": capability,
                    "message": "Identity verification is required for this action.",
                },
            )
        return user
    return _dep
