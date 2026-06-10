"""KYC verification — the Teivaka green tick (government ID + selfie, admin-reviewed).

Operator-approved design (2026-06-11):
- ID/selfie files are stored in a PRIVATE directory (MEDIA_DIR/kyc) that the
  public uploads route cannot serve (it strips path components), and are read
  ONLY through the admin-gated file endpoint below.
- Requests live in community.verification_requests (cross-tenant review queue);
  every endpoint is own-request or admin-gated.
- Approval sets tenant.users.kyc_verified — the platform-wide green tick, a
  stronger and separate claim from email_verified (which keeps gating posting).
"""
import os
import pathlib
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.rls import get_current_user

router = APIRouter()

KYC_DIR = pathlib.Path(os.environ.get("TFOS_MEDIA_DIR", "/app/uploads")) / "kyc"
try:
    KYC_DIR.mkdir(parents=True, exist_ok=True)
except Exception:  # noqa: BLE001 — never block API boot on storage setup
    pass

_ALLOWED_EXT = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
_MAX_BYTES = 15 * 1024 * 1024
_ADMIN_ROLES = {"ADMIN", "FOUNDER"}


def _require_admin(user: dict):
    if user.get("role") not in _ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins only")


# ----------------------------------------------------------------------------- user side
@router.post("/me/verification/upload")
async def kyc_upload(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    """Store an ID or selfie in the PRIVATE kyc dir. Returns a file token (not a URL)."""
    ext = pathlib.Path(file.filename or "").suffix.lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=415, detail=f"Unsupported file type {ext or '?'}")
    name = f"{uuid.uuid4().hex}{ext}"
    dest = KYC_DIR / name
    size = 0
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > _MAX_BYTES:
                    out.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="File too large (max 15 MB)")
                out.write(chunk)
    finally:
        await file.close()
    return {"data": {"path": name, "bytes": size}}


class VerificationCreate(BaseModel):
    id_doc_path: str
    selfie_path: str


@router.post("/me/verification")
async def request_verification(
    body: VerificationCreate,
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    uid = str(user["user_id"])
    cur = (await db.execute(text("""
        SELECT status FROM community.verification_requests
        WHERE user_id = cast(:uid AS uuid) ORDER BY created_at DESC LIMIT 1
    """), {"uid": uid})).first()
    if cur and cur[0] == "PENDING":
        raise HTTPException(status_code=409, detail="You already have a verification request under review.")
    if cur and cur[0] == "APPROVED":
        raise HTTPException(status_code=409, detail="You're already verified.")
    for p in (body.id_doc_path, body.selfie_path):
        safe = pathlib.Path(p or "").name
        if not safe or not (KYC_DIR / safe).exists():
            raise HTTPException(status_code=422, detail="Upload both documents first.")
    rid = "KYC-" + uuid.uuid4().hex[:8].upper()
    await db.execute(text("""
        INSERT INTO community.verification_requests (request_id, tenant_id, user_id, id_doc_path, selfie_path)
        VALUES (:rid, cast(:tid AS uuid), cast(:uid AS uuid), :idp, :sfp)
    """), {"rid": rid, "tid": str(user["tenant_id"]), "uid": uid,
           "idp": pathlib.Path(body.id_doc_path).name, "sfp": pathlib.Path(body.selfie_path).name})
    await db.commit()
    return {"data": {"request_id": rid, "status": "PENDING"}}


@router.get("/me/verification")
async def my_verification(user: dict = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(text("""
        SELECT request_id, status, note, created_at, reviewed_at
        FROM community.verification_requests
        WHERE user_id = cast(:uid AS uuid) ORDER BY created_at DESC LIMIT 1
    """), {"uid": str(user["user_id"])})).mappings().first()
    kyc = (await db.execute(text("SELECT COALESCE(kyc_verified, FALSE) FROM tenant.users WHERE user_id = cast(:uid AS uuid)"),
                            {"uid": str(user["user_id"])})).scalar()
    return {"data": {
        "kyc_verified": bool(kyc),
        "request": ({**dict(row),
                     "created_at": row["created_at"].isoformat() if row["created_at"] else None,
                     "reviewed_at": row["reviewed_at"].isoformat() if row["reviewed_at"] else None}
                    if row else None),
    }}


# ----------------------------------------------------------------------------- admin side
@router.get("/admin/verifications")
async def list_verifications(status_filter: str = Query("PENDING"),
                             user: dict = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)):
    _require_admin(user)
    params = {}
    clause = ""
    if status_filter and status_filter.upper() != "ALL":
        clause = "WHERE vr.status = :st"
        params["st"] = status_filter.upper()
    rows = (await db.execute(text(f"""
        SELECT vr.request_id, vr.status, vr.note, vr.created_at, vr.reviewed_at,
               vr.user_id, u.full_name, u.email, u.country, u.account_type, u.avatar_url
        FROM community.verification_requests vr
        JOIN tenant.users u ON u.user_id = vr.user_id
        {clause}
        ORDER BY vr.created_at ASC
        LIMIT 100
    """), params)).mappings().all()
    return {"data": [{**dict(r), "user_id": str(r["user_id"]),
                      "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                      "reviewed_at": r["reviewed_at"].isoformat() if r["reviewed_at"] else None} for r in rows]}


@router.get("/admin/verifications/{request_id}/file/{kind}")
async def verification_file(request_id: str, kind: str,
                            user: dict = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)):
    """Admin-only read of the PRIVATE ID/selfie file. Never publicly served."""
    _require_admin(user)
    if kind not in ("id", "selfie"):
        raise HTTPException(status_code=404, detail="Not found")
    row = (await db.execute(text("SELECT id_doc_path, selfie_path FROM community.verification_requests WHERE request_id = :rid"),
                            {"rid": request_id})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    name = pathlib.Path(row[0] if kind == "id" else row[1]).name
    path = KYC_DIR / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing")
    return FileResponse(path, headers={"Cache-Control": "private, no-store"})


class ReviewBody(BaseModel):
    note: str | None = None


@router.post("/admin/verifications/{request_id}/approve")
async def approve_verification(request_id: str, body: ReviewBody = None,
                               user: dict = Depends(get_current_user),
                               db: AsyncSession = Depends(get_db)):
    _require_admin(user)
    row = (await db.execute(text("""
        UPDATE community.verification_requests
        SET status='APPROVED', note=:note, reviewed_at=now(), reviewed_by=cast(:rb AS uuid)
        WHERE request_id=:rid AND status='PENDING'
        RETURNING user_id
    """), {"rid": request_id, "note": (body.note if body else None), "rb": str(user["user_id"])})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Request not found or already reviewed")
    await db.execute(text("UPDATE tenant.users SET kyc_verified = TRUE WHERE user_id = :uid"), {"uid": str(row[0])})
    # best-effort notification to the farmer
    try:
        await db.execute(text("""
            INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body)
            VALUES (:uid, cast(:actor AS uuid), 'VERIFIED', 'Your identity is verified — you now have the Teivaka green tick.')
        """), {"uid": str(row[0]), "actor": str(user["user_id"])})
    except Exception:  # noqa: BLE001
        pass
    await db.commit()
    return {"data": {"request_id": request_id, "status": "APPROVED"}}


@router.post("/admin/verifications/{request_id}/reject")
async def reject_verification(request_id: str, body: ReviewBody,
                              user: dict = Depends(get_current_user),
                              db: AsyncSession = Depends(get_db)):
    _require_admin(user)
    row = (await db.execute(text("""
        UPDATE community.verification_requests
        SET status='REJECTED', note=:note, reviewed_at=now(), reviewed_by=cast(:rb AS uuid)
        WHERE request_id=:rid AND status='PENDING'
        RETURNING user_id
    """), {"rid": request_id, "note": (body.note or "Not approved"), "rb": str(user["user_id"])})).first()
    if not row:
        raise HTTPException(status_code=404, detail="Request not found or already reviewed")
    await db.commit()
    return {"data": {"request_id": request_id, "status": "REJECTED"}}
