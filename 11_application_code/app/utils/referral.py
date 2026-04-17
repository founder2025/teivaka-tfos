"""Referral code generation.

8-char Crockford base32 (uppercase, excludes I L O U) with collision check
against tenant.users.referral_code. Retries up to 5 times before raising.
"""
import secrets

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Crockford base32 alphabet: 0-9 A-Z minus I, L, O, U  → 32 symbols
_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_CODE_LEN = 8
_MAX_ATTEMPTS = 5


def _encode() -> str:
    # 8 chars × 5 bits = 40 bits of entropy → 5 random bytes
    raw = secrets.token_bytes(5)
    n = int.from_bytes(raw, "big")
    out = []
    for _ in range(_CODE_LEN):
        out.append(_ALPHABET[n & 0x1F])
        n >>= 5
    return "".join(reversed(out))


async def generate_referral_code(session: AsyncSession) -> str:
    for _ in range(_MAX_ATTEMPTS):
        candidate = _encode()
        result = await session.execute(
            text(
                "SELECT COUNT(*) FROM tenant.users "
                "WHERE referral_code = :code"
            ),
            {"code": candidate},
        )
        if result.scalar() == 0:
            return candidate
    raise ValueError(
        f"Could not generate unique referral code after {_MAX_ATTEMPTS} attempts"
    )
