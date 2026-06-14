"""account_types.py — the 12-tier ecosystem profile taxonomy (single source of truth).

`account_type` is the PROFESSION / ecosystem-profile identity a user selects on the
9-card registration grid. Two of the nine cards fan out into a Stage-2 dropdown,
yielding 12 granular leaf values in total:

    9 cards → 7 direct + (card 5 → 2) + (card 9 → 3) = 12 leaves.

IMPORTANT: this is NOT the RBAC `role`. `role` is constrained by migration 010 to
{FOUNDER, MANAGER, WORKER, VIEWER, FARMER, ADMIN}; putting a profession string into
`role` would violate that CHECK. Use `derive_role()` to map a profession to a valid,
non-admin role. Admin is never assigned at registration.
"""
from __future__ import annotations

from enum import Enum


class AccountType(str, Enum):
    # Card 1-4, 6-8 (direct)
    PRIMARY_PRODUCER = "PRIMARY_PRODUCER"
    COMMERCIAL_BUYER = "COMMERCIAL_BUYER"
    AGRI_INPUT_SUPPLIER = "AGRI_INPUT_SUPPLIER"
    LOGISTICS_OPERATOR = "LOGISTICS_OPERATOR"
    AGRIBUSINESS_ENTERPRISE = "AGRIBUSINESS_ENTERPRISE"
    COMMODITY_EXPORTER = "COMMODITY_EXPORTER"
    TRADE_IMPORTER = "TRADE_IMPORTER"
    # Card 5 → Dropdown A (Institutional Lender / Funder)
    BANKER_COMMERCIAL = "BANKER_COMMERCIAL"
    DONOR_DEVELOPMENT = "DONOR_DEVELOPMENT"
    # Card 9 → Dropdown B (Institutional Partner / Other)
    MATAQALI_TRUSTEE = "MATAQALI_TRUSTEE"
    GOVERNMENT_REGULATOR = "GOVERNMENT_REGULATOR"
    QUALITY_AUDITOR = "QUALITY_AUDITOR"


ACCOUNT_TYPES: list[str] = [e.value for e in AccountType]
_VALID: set[str] = {e.value for e in AccountType}

# Legacy 8-value taxonomy → new 12-tier. Keeps any cached old frontend bundle and
# in-flight clients working through the transition (mirrors migration 115's backfill).
LEGACY_ACCOUNT_TYPE_MAP: dict[str, str] = {
    "FARMER": "PRIMARY_PRODUCER",
    "BUYER": "COMMERCIAL_BUYER",
    "SUPPLIER": "AGRI_INPUT_SUPPLIER",
    "SERVICE_PROVIDER": "LOGISTICS_OPERATOR",
    "BANKER": "BANKER_COMMERCIAL",
    "BUSINESS": "AGRIBUSINESS_ENTERPRISE",
    "EXPORTER": "COMMODITY_EXPORTER",
    "IMPORTER": "TRADE_IMPORTER",
    "OTHER": "AGRIBUSINESS_ENTERPRISE",  # legacy OTHER folded to enterprise (mirrors migration 091)
}

# Institutional / high-trust profiles whose privileged capabilities should later
# require KYC/verification. Today purely informational (the success screen shows a
# "features unlock after verification" note); no capability is actually gated yet.
HIGH_TRUST_ACCOUNT_TYPES: set[str] = {
    "BANKER_COMMERCIAL", "DONOR_DEVELOPMENT", "COMMODITY_EXPORTER",
    "TRADE_IMPORTER", "AGRIBUSINESS_ENTERPRISE", "GOVERNMENT_REGULATOR",
    "QUALITY_AUDITOR", "MATAQALI_TRUSTEE",
}


def normalize_account_type(v: str) -> str:
    """Accept the 12 canonical values; up-convert the 8 legacy values. Raise on anything else."""
    v = (v or "").upper().strip()
    v = LEGACY_ACCOUNT_TYPE_MAP.get(v, v)
    if v not in _VALID:
        raise ValueError("account_type must be one of: " + ", ".join(sorted(_VALID)))
    return v


def derive_role(account_type: str) -> str:
    """Map a profession to a valid, non-admin RBAC role (migration 010 CHECK set).

    Producers and commercial buyers get the FARMER surface (as the legacy taxonomy
    did for FARMER/BUYER); every other institutional profile gets VIEWER. Never ADMIN.
    """
    return "FARMER" if account_type in ("PRIMARY_PRODUCER", "COMMERCIAL_BUYER") else "VIEWER"


# Persona groups — coarse buckets for persona-aware capabilities + nav.
# Mirrors the frontend utils/personas.js group assignment.
PERSONA_GROUPS: dict[str, str] = {
    "PRIMARY_PRODUCER": "PRODUCER",
    "COMMERCIAL_BUYER": "TRADE",
    "AGRI_INPUT_SUPPLIER": "TRADE",
    "AGRIBUSINESS_ENTERPRISE": "TRADE",
    "COMMODITY_EXPORTER": "TRADE",
    "TRADE_IMPORTER": "TRADE",
    "LOGISTICS_OPERATOR": "SERVICE",
    "BANKER_COMMERCIAL": "CAPITAL",
    "DONOR_DEVELOPMENT": "CAPITAL",
    "MATAQALI_TRUSTEE": "GOVERNANCE",
    "GOVERNMENT_REGULATOR": "GOVERNANCE",
    "QUALITY_AUDITOR": "GOVERNANCE",
}


def persona_group(account_type: str | None) -> str | None:
    """Coarse persona group for an account_type (or None if unknown)."""
    return PERSONA_GROUPS.get((account_type or "").upper().strip())


# Generalized registration categories (7) — the plain-language buckets everyone
# self-identifies into. Each is represented by one canonical account_type key;
# the finer 12 values roll up to these for display + targeting (CATEGORY_OF).
# Used by the simplified registration grid and the "I also do…" secondary tags.
GENERAL_CATEGORIES = [
    {"key": "PRIMARY_PRODUCER",        "label": "Farmer / Producer"},
    {"key": "COMMERCIAL_BUYER",        "label": "Buyer / Trader"},
    {"key": "AGRI_INPUT_SUPPLIER",     "label": "Supplier"},
    {"key": "LOGISTICS_OPERATOR",      "label": "Service Provider"},
    {"key": "AGRIBUSINESS_ENTERPRISE", "label": "Agribusiness / Company"},
    {"key": "BANKER_COMMERCIAL",       "label": "Finance / Funder"},
    {"key": "GOVERNMENT_REGULATOR",    "label": "Institution / Government"},
]
CATEGORY_KEYS: set[str] = {c["key"] for c in GENERAL_CATEGORIES}

# Every account_type (incl. the finer legacy/12 values) rolls up to one of the 7.
CATEGORY_OF: dict[str, str] = {
    "PRIMARY_PRODUCER": "PRIMARY_PRODUCER",
    "COMMERCIAL_BUYER": "COMMERCIAL_BUYER",
    "COMMODITY_EXPORTER": "COMMERCIAL_BUYER",
    "TRADE_IMPORTER": "COMMERCIAL_BUYER",
    "AGRI_INPUT_SUPPLIER": "AGRI_INPUT_SUPPLIER",
    "LOGISTICS_OPERATOR": "LOGISTICS_OPERATOR",
    "AGRIBUSINESS_ENTERPRISE": "AGRIBUSINESS_ENTERPRISE",
    "BANKER_COMMERCIAL": "BANKER_COMMERCIAL",
    "DONOR_DEVELOPMENT": "BANKER_COMMERCIAL",
    "MATAQALI_TRUSTEE": "GOVERNMENT_REGULATOR",
    "GOVERNMENT_REGULATOR": "GOVERNMENT_REGULATOR",
    "QUALITY_AUDITOR": "GOVERNMENT_REGULATOR",
}


def category_of(account_type: str | None) -> str | None:
    """Roll any account_type up to its general category key."""
    return CATEGORY_OF.get((account_type or "").upper().strip())


def clean_also_categories(values) -> list[str]:
    """Validate + dedupe a list of secondary 'I also do' category keys."""
    if not isinstance(values, list):
        return []
    out = []
    for v in values:
        k = (v or "").upper().strip()
        if k in CATEGORY_KEYS and k not in out:
            out.append(k)
    return out
