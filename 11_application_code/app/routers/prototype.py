"""prototype.py — founder/admin-only viewer for the canonical design prototype.

Serves the sacred prototype (TFOS_MyFarm_Prototype_v263_20260608.html, MBI
Part 36) bundled into the image at app/static/. This is a DESIGN REFERENCE with
MOCK data — never production data, never wired to tenant.*. It exists so the
Operator can walk the entire intended UX while the real surfaces are built.

Gated with require_admin() (ADMIN / ENTERPRISE_ADMIN / FOUNDER) so it can never
be reached by a regular user, lender, or partner — there is no public static
path; the React /prototype page fetches this with the bearer token.
"""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from app.middleware.rls import require_admin

router = APIRouter()

# app/routers/prototype.py -> app/static/prototype_v263.html
_PROTOTYPE = Path(__file__).resolve().parent.parent / "static" / "prototype_v263.html"


@router.get("/prototype", include_in_schema=False)
async def get_prototype(user: dict = Depends(require_admin())):
    """Return the bundled prototype HTML. Founder/admin only."""
    if not _PROTOTYPE.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prototype asset is not bundled in this build.",
        )
    return FileResponse(_PROTOTYPE, media_type="text/html")
