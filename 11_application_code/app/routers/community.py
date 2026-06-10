from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_rls_db, get_db, get_db_ctx
from app.middleware.rls import get_current_user
from app.utils.community_guard import community_write
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional, List
from uuid import UUID
import uuid

router = APIRouter()


class PostListItem(BaseModel):
    post_id: UUID
    author_user_id: UUID
    author_name: Optional[str] = None
    post_type: str
    body: str
    crop_tag: Optional[str] = None
    location_region: Optional[str] = None
    like_count: int
    comment_count: int
    created_at: datetime

class ListingCreate(BaseModel):
    farm_id: str
    production_id: Optional[str] = None
    category: str = "PRODUCE"   # PRODUCE | INPUTS | TOOLS | LIVESTOCK | SERVICES | WANTED
    price_basis: str = "kg"     # kg | unit | hour | job | day | head | pack | item | budget
    details: Optional[dict] = None  # category-specific fields (grade, condition, brand, ...)
    link_audit_hash: Optional[str] = None
    listing_title: str
    listing_description: str
    quantity_available_kg: Optional[Decimal] = None
    price_per_kg_fjd: Optional[Decimal] = None
    negotiable: bool = True
    grade: str = "A"  # A, B, C, ORGANIC, MIXED
    island: str  # Viti Levu, Vanua Levu, Kadavu, Taveuni, Ovalau, etc.
    pickup_location: Optional[str] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    contact_whatsapp: Optional[str] = None
    photos: Optional[List[str]] = []  # URL strings
    notes: Optional[str] = None

class PostCreate(BaseModel):
    post_type: str  # KNOWLEDGE, QUESTION, WEATHER_REPORT, SUCCESS_STORY
    title: str
    body: str
    production_id: Optional[str] = None
    island: Optional[str] = None
    photos: Optional[List[str]] = []
    tags: Optional[List[str]] = []

@router.get("/listings")
async def list_community_listings(
    production_id: str = None,
    island: str = None,
    grade: str = None,
    category: str = None,
    search: str = None,
    mine: bool = False,
    saved: bool = False,
    seller: str = None,
    user: dict = Depends(get_current_user),
):
    """Marketplace listings for every profession. Migration-tolerant by design:
    every 098-dependent fragment (category/sold_at columns, listing_saves) is
    probed first and degraded gracefully if absent — schema lag can slim the
    page down but can NEVER 500 it."""
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        def _col(table, col, schema="community"):
            return f"SELECT 1 FROM information_schema.columns WHERE table_schema='{schema}' AND table_name='{table}' AND column_name='{col}'"
        def _tbl(name):
            # CASE guarantees has_table_privilege is never evaluated on a missing
            # relation (plain AND does not short-circuit reliably in SQL).
            return (f"SELECT CASE WHEN to_regclass('community.{name}') IS NULL THEN false "
                    f"ELSE has_table_privilege(current_user, 'community.{name}', 'SELECT') END")
        if not bool((await db.execute(text(_tbl("listings")))).scalar()):
            return {"data": [], "meta": {"degraded": "listings table missing — run scripts/deploy_community_fix.sh"}}
        has_kyc = bool((await db.execute(text(_col("users", "kyc_verified", "tenant")))).scalar())
        has_cat = bool((await db.execute(text(_col("listings", "category")))).scalar())
        has_sold = bool((await db.execute(text(_col("listings", "sold_at")))).scalar())
        has_saves = bool((await db.execute(text(_tbl("listing_saves")))).scalar())
        vexpr = "COALESCE(u.kyc_verified, FALSE)" if has_kyc else "FALSE"
        saved_expr = ("EXISTS (SELECT 1 FROM community.listing_saves ls WHERE ls.listing_id = cl.listing_id AND ls.user_id = cast(:uid AS uuid))"
                      if has_saves else "FALSE")
        params = {"uid": uid}
        if mine:
            where = "cl.created_by = cast(:uid AS uuid)"
        else:
            where = "cl.listing_status = 'ACTIVE' AND (cl.available_until IS NULL OR cl.available_until >= now())"
            if has_sold:
                where += " AND cl.sold_at IS NULL"
        q = f"""SELECT cl.*, p.production_name, p.production_category,
                       u.full_name AS seller_name, u.avatar_url AS seller_avatar,
                       {vexpr} AS seller_verified, u.created_at AS seller_since,
                       {saved_expr} AS is_saved,
                       (cl.created_by = cast(:uid AS uuid)) AS is_mine
                FROM community.listings cl
                LEFT JOIN shared.productions p ON p.production_id = cl.production_id
                LEFT JOIN tenant.users u ON u.user_id = cl.created_by
                WHERE {where}"""
        if saved and has_saves:
            q += " AND EXISTS (SELECT 1 FROM community.listing_saves ls2 WHERE ls2.listing_id = cl.listing_id AND ls2.user_id = cast(:uid AS uuid))"
        if seller:
            q += " AND cl.created_by = cast(:seller AS uuid)"; params["seller"] = seller
        if production_id:
            q += " AND cl.production_id = :production_id"; params["production_id"] = production_id
        if island:
            q += " AND cl.island = :island"; params["island"] = island
        if grade:
            q += " AND cl.grade = :grade"; params["grade"] = grade
        if category and category.upper() != "ALL" and has_cat:
            q += " AND cl.category = :category"; params["category"] = category.upper()
        if search:
            q += " AND (cl.listing_title ILIKE :srch OR cl.listing_description ILIKE :srch)"; params["srch"] = f"%{search}%"
        result = await db.execute(text(q + " ORDER BY cl.created_at DESC LIMIT 100"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.post("/listings")
async def create_listing(body: ListingCreate, user: dict = Depends(community_write("listing", 10))):
    """Create a marketplace listing — open to every profession (tier paywall
    dropped, Operator-approved 2026-06-11; verified email still required)."""
    cat = (body.category or "PRODUCE").upper()
    if cat not in ("PRODUCE", "INPUTS", "TOOLS", "LIVESTOCK", "SERVICES", "WANTED"):
        cat = "PRODUCE"
    basis = (body.price_basis or "kg").lower()
    if basis not in ("kg", "unit", "hour", "job", "day", "head", "pack", "item", "budget"):
        basis = "kg"

    listing_id = f"LST-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        # 099-tolerant: include price_basis/details only when the columns exist.
        has_099 = bool((await db.execute(text(
            "SELECT 1 FROM information_schema.columns WHERE table_schema='community' AND table_name='listings' AND column_name='price_basis'"))).scalar())
        extra_cols = ", price_basis, details" if has_099 else ""
        extra_vals = ", :price_basis, cast(:details AS jsonb)" if has_099 else ""
        await db.execute(text(f"""
            INSERT INTO community.listings
                (listing_id, tenant_id, farm_id, production_id, listing_title, listing_description,
                 quantity_available_kg, price_per_kg_fjd, negotiable, grade, island,
                 pickup_location, available_from, available_until, contact_whatsapp,
                 photos, notes, listing_status, created_by, category, link_audit_hash{extra_cols})
            VALUES
                (:listing_id, :tenant_id, :farm_id, :production_id, :listing_title, :listing_description,
                 :quantity_available_kg, :price_per_kg_fjd, :negotiable, :grade, :island,
                 :pickup_location, :available_from, :available_until, :contact_whatsapp,
                 :photos, :notes, 'ACTIVE', :created_by, :category, :link_audit_hash{extra_vals})
        """), {
            "listing_id": listing_id,
            "tenant_id": str(user["tenant_id"]),
            "farm_id": body.farm_id,
            "production_id": body.production_id,
            "listing_title": body.listing_title,
            "listing_description": body.listing_description,
            "quantity_available_kg": body.quantity_available_kg,
            "price_per_kg_fjd": body.price_per_kg_fjd,
            "negotiable": body.negotiable,
            "grade": body.grade,
            "island": body.island,
            "pickup_location": body.pickup_location,
            "available_from": body.available_from,
            "available_until": body.available_until,
            "contact_whatsapp": body.contact_whatsapp,
            "photos": body.photos,
            "notes": body.notes,
            "created_by": str(user["user_id"]),
            "category": cat,
            "link_audit_hash": (body.link_audit_hash or None),
            **({"price_basis": basis, "details": __import__("json").dumps(body.details or {})} if has_099 else {}),
        })
    return {"data": {"listing_id": listing_id, "listing_status": "ACTIVE"}}

@router.patch("/listings/{listing_id}/close")
async def close_listing(listing_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(
            text("UPDATE community.listings SET listing_status = 'CLOSED', updated_at = now() WHERE listing_id = :listing_id AND tenant_id = :tid"),
            {"listing_id": listing_id, "tid": str(user["tenant_id"])}
        )
    return {"data": {"listing_id": listing_id, "listing_status": "CLOSED"}}

@router.patch("/listings/{listing_id}/sold")
async def mark_listing_sold(listing_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(
            text("UPDATE community.listings SET sold_at = now(), updated_at = now() WHERE listing_id = :lid AND created_by = cast(:uid AS uuid)"),
            {"lid": listing_id, "uid": str(user["user_id"])})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Listing not found or not yours")
    return {"data": {"listing_id": listing_id, "sold": True}}


@router.patch("/listings/{listing_id}/relist")
async def relist_listing(listing_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        res = await db.execute(
            text("UPDATE community.listings SET sold_at = NULL, listing_status = 'ACTIVE', updated_at = now() WHERE listing_id = :lid AND created_by = cast(:uid AS uuid)"),
            {"lid": listing_id, "uid": str(user["user_id"])})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Listing not found or not yours")
    return {"data": {"listing_id": listing_id, "status": "ACTIVE"}}


@router.post("/listings/{listing_id}/save")
async def save_listing(listing_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("INSERT INTO community.listing_saves (user_id, listing_id) VALUES (cast(:uid AS uuid), :lid) ON CONFLICT DO NOTHING"),
                         {"uid": str(user["user_id"]), "lid": listing_id})
    return {"data": {"saved": True}}


@router.delete("/listings/{listing_id}/save")
async def unsave_listing(listing_id: str, user: dict = Depends(get_current_user)):
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("DELETE FROM community.listing_saves WHERE user_id = cast(:uid AS uuid) AND listing_id = :lid"),
                         {"uid": str(user["user_id"]), "lid": listing_id})
    return {"data": {"saved": False}}


@router.get(
    "/posts",
    response_model=List[PostListItem],
    summary="List community posts (paginated)",
)
async def list_community_posts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    crop_tag: Optional[str] = Query(None),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Paginated community feed. Joins community.posts → tenant.users for author
    display name. community.* has no RLS (per architecture doc); tenant.users
    has no RLS in this deployment so the join works without a tenant context.
    """
    params: dict = {"limit": limit, "offset": offset}
    crop_filter = ""
    if crop_tag is not None:
        crop_filter = " AND p.crop_tag = :crop_tag"
        params["crop_tag"] = crop_tag

    result = await db.execute(
        text(
            f"""
            SELECT
                p.post_id,
                p.author_user_id,
                u.full_name AS author_name,
                p.post_type,
                p.body,
                p.crop_tag,
                p.location_region,
                p.like_count,
                p.comment_count,
                p.created_at
            FROM community.posts p
            LEFT JOIN tenant.users u ON u.user_id = p.author_user_id
            WHERE p.deleted_at IS NULL{crop_filter}
            ORDER BY p.created_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        params,
    )
    return [dict(row) for row in result.mappings().all()]

@router.post("/posts")
async def create_post(body: PostCreate, user: dict = Depends(get_current_user)):
    """Create a community knowledge post. Requires BASIC+ subscription."""
    allowed_tiers = ("BASIC", "PROFESSIONAL", "ENTERPRISE")
    if user.get("subscription_tier") not in allowed_tiers:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community posts require BASIC subscription or above")

    post_id = f"PST-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.posts
                (post_id, tenant_id, post_type, title, body, production_id,
                 island, photos, tags, moderation_status, created_by)
            VALUES
                (:post_id, :tenant_id, :post_type, :title, :body, :production_id,
                 :island, :photos, :tags, 'PENDING_REVIEW', :created_by)
        """), {
            "post_id": post_id,
            "tenant_id": str(user["tenant_id"]),
            "post_type": body.post_type,
            "title": body.title,
            "body": body.body,
            "production_id": body.production_id,
            "island": body.island,
            "photos": body.photos,
            "tags": body.tags,
            "created_by": str(user["user_id"]),
        })
    return {"data": {"post_id": post_id, "moderation_status": "PENDING_REVIEW", "message": "Post submitted for moderation review."}}
