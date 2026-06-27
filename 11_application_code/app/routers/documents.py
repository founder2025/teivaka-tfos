"""Document Vault — leases, certificates, IDs, contracts (TATI Phase 4).

Files live on the existing media disk (TFOS_MEDIA_DIR) under a non-guessable name; the DB row
is the access-control point. Retrieval is GATED (owner JWT) via /documents/{id}/file — never the
public uploads path. Each file is SHA-256-hashed on upload; expiry feeds the compliance loop.

Routes (mounted at /api/v1):
  POST /documents (multipart)  GET /documents  GET /documents/expiring
  GET /documents/{id}/file     PATCH /documents/{id}   DELETE /documents/{id}
"""
import hashlib
import os
import uuid
from datetime import date
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import success_envelope

router = APIRouter()

MEDIA_DIR = Path(os.environ.get("TFOS_MEDIA_DIR", "/app/uploads")) / "vault"
_TYPES = {"LEASE", "CERTIFICATE", "ID", "CONTRACT", "INSURANCE", "PERMIT", "OTHER"}
_MAX_BYTES = 25 * 1024 * 1024  # 25 MB
_ALLOWED_MIME = {"application/pdf", "image/png", "image/jpeg", "image/jpg", "image/webp"}


def _row(r: dict) -> dict:
    today = date.today()
    d = dict(r)
    d["document_id"] = str(d["document_id"])
    for k in ("issued_date", "expiry_date"):
        d[k] = d[k].isoformat() if d.get(k) else None
    d["uploaded_at"] = d["uploaded_at"].isoformat() if d.get("uploaded_at") else None
    exp = r.get("expiry_date")
    d["expired"] = bool(exp and exp < today)
    d["expiring_soon"] = bool(exp and not d["expired"] and (exp - today).days <= 30)
    d.pop("storage_name", None)  # never expose the disk name
    return d


@router.post("/documents")
async def upload_document(
    file: UploadFile = File(...),
    doc_type: str = Form("OTHER"),
    title: Optional[str] = Form(None),
    issued_date: Optional[str] = Form(None),
    expiry_date: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_tenant_db),
    user: dict = Depends(get_current_user),
):
    doc_type = (doc_type or "OTHER").upper()
    if doc_type not in _TYPES:
        doc_type = "OTHER"
    mime = (file.content_type or "").lower()
    if mime not in _ALLOWED_MIME:
        raise HTTPException(400, detail="Only PDF or image files are accepted")
    MEDIA_DIR.mkdir(parents=True, exist_ok=True)
    ext = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg",
           "image/jpg": "jpg", "image/webp": "webp"}.get(mime, "bin")
    storage_name = f"doc_{uuid.uuid4().hex}.{ext}"
    path = MEDIA_DIR / storage_name
    h = hashlib.sha256()
    size = 0
    try:
        with open(path, "wb") as out:
            while True:
                chunk = await file.read(1 << 20)
                if not chunk:
                    break
                size += len(chunk)
                if size > _MAX_BYTES:
                    out.close(); path.unlink(missing_ok=True)
                    raise HTTPException(413, detail="File too large (max 25 MB)")
                h.update(chunk); out.write(chunk)
    except HTTPException:
        raise
    except Exception:
        path.unlink(missing_ok=True)
        raise HTTPException(500, detail="Could not store the document")
    did = (await db.execute(text("""
        INSERT INTO tenant.documents
            (tenant_id, owner_user_id, doc_type, title, storage_name, sha256, byte_size, mime, issued_date, expiry_date)
        VALUES (cast(:t AS uuid), cast(:u AS uuid), :dt, :ti, :sn, :sha, :sz, :mi, :idate, :edate)
        RETURNING document_id
    """), {"t": str(user["tenant_id"]), "u": str(user["user_id"]), "dt": doc_type,
           "ti": title or file.filename, "sn": storage_name, "sha": h.hexdigest(), "sz": size,
           "mi": mime, "idate": issued_date or None, "edate": expiry_date or None})).scalar()
    return success_envelope({"document_id": str(did), "sha256": h.hexdigest(), "byte_size": size})


@router.get("/documents")
async def list_documents(db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    rows = (await db.execute(text("""
        SELECT document_id, doc_type, title, sha256, byte_size, mime, issued_date, expiry_date,
               verification_status, storage_name, uploaded_at
        FROM tenant.documents WHERE deleted_at IS NULL ORDER BY uploaded_at DESC LIMIT 200
    """))).mappings().all()
    return success_envelope({"documents": [_row(r) for r in rows]})


@router.get("/documents/expiring")
async def expiring_documents(db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    """Documents expiring within 30 days (or already expired) — for the compliance loop."""
    rows = (await db.execute(text("""
        SELECT document_id, doc_type, title, issued_date, expiry_date, verification_status, storage_name, uploaded_at, sha256, byte_size, mime
        FROM tenant.documents
        WHERE deleted_at IS NULL AND expiry_date IS NOT NULL AND expiry_date <= CURRENT_DATE + 30
        ORDER BY expiry_date
    """))).mappings().all()
    return success_envelope({"documents": [_row(r) for r in rows]})


@router.get("/documents/{document_id}/file")
async def get_document_file(document_id: str, db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    """Gated stream — owner only (RLS scopes the tenant). Logs the access."""
    r = (await db.execute(text(
        "SELECT storage_name, mime, title FROM tenant.documents WHERE document_id=cast(:d AS uuid) AND deleted_at IS NULL"),
        {"d": document_id})).mappings().first()
    if not r:
        raise HTTPException(404, detail="Document not found")
    path = MEDIA_DIR / r["storage_name"]
    if not path.exists():
        raise HTTPException(404, detail="File missing")
    await db.execute(text(
        "INSERT INTO tenant.document_access (document_id, tenant_id, accessor, action) "
        "VALUES (cast(:d AS uuid), cast(:t AS uuid), :a, 'VIEW')"),
        {"d": document_id, "t": str(user["tenant_id"]), "a": str(user["user_id"])})
    return FileResponse(str(path), media_type=r["mime"] or "application/octet-stream",
                        filename=(r["title"] or "document"))


class DocPatch(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    doc_type: Optional[str] = None
    issued_date: Optional[str] = None
    expiry_date: Optional[str] = None


@router.patch("/documents/{document_id}")
async def patch_document(document_id: str, body: DocPatch, db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    dt = body.doc_type.upper() if body.doc_type else None
    if dt and dt not in _TYPES:
        dt = None
    res = await db.execute(text("""
        UPDATE tenant.documents SET
            title = COALESCE(:ti, title),
            doc_type = COALESCE(:dt, doc_type),
            issued_date = COALESCE(:idate, issued_date),
            expiry_date = COALESCE(:edate, expiry_date)
        WHERE document_id = cast(:d AS uuid) AND deleted_at IS NULL
    """), {"ti": body.title, "dt": dt, "idate": body.issued_date or None,
           "edate": body.expiry_date or None, "d": document_id})
    if res.rowcount == 0:
        raise HTTPException(404, detail="Document not found")
    return success_envelope({"document_id": document_id, "updated": True})


@router.delete("/documents/{document_id}")
async def delete_document(document_id: str, db: AsyncSession = Depends(get_tenant_db), user: dict = Depends(get_current_user)):
    res = await db.execute(text(
        "UPDATE tenant.documents SET deleted_at=now() WHERE document_id=cast(:d AS uuid) AND deleted_at IS NULL"),
        {"d": document_id})
    if res.rowcount == 0:
        raise HTTPException(404, detail="Document not found")
    return success_envelope({"document_id": document_id, "deleted": True})
