"""roles.py — TFOS role hierarchy helper (backend mirror).

Per MBI Part 14, roles form an inclusive ladder. A user at level N has all
the permissions of roles at level < N. Guards use has_role() instead of
strict equality so FOUNDER inherits ADMIN access (and ENTERPRISE_ADMIN
does too, etc.).

Frontend mirror: /opt/teivaka/frontend/src/utils/roles.js. Both files MUST
stay in sync — drift causes inconsistent 403 behavior between client-side
guards and server-side enforcement.

Order is intentional: lowest privilege at index 0, highest at -1. Adding
a new tier inserts at the correct index; never reorder existing entries.
"""

ROLE_HIERARCHY: list[str] = [
    "COMMUNITY",
    "BANK_VIEWER",
    "WORKER",
    "MANAGER",
    "PARTNER",
    "ADMIN",
    "ENTERPRISE_ADMIN",
    "FOUNDER",
]


def role_level(role: str | None) -> int:
    """Return the index of `role` in ROLE_HIERARCHY, or -1 if unknown."""
    if not role:
        return -1
    try:
        return ROLE_HIERARCHY.index(role)
    except ValueError:
        return -1


def has_role(user_role: str | None, required_role: str) -> bool:
    """True iff user_role's privilege level >= required_role's level.

    Unknown roles (or None) always evaluate to False — fail closed.
    """
    user_lvl = role_level(user_role)
    req_lvl = role_level(required_role)
    if user_lvl == -1 or req_lvl == -1:
        return False
    return user_lvl >= req_lvl
