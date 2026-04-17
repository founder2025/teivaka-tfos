from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from app.db.session import get_rls_db, get_db
from app.middleware.rls import get_current_user
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional, List
import uuid

router = APIRouter()

class ListingCreate(BaseModel):
    farm_id: str
    production_id: Optional[str] = None
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
    user=None,
):
    """
    Public endpoint — no authentication required.
    Lists active produce availability listings from farmers across Fiji.
    """
    async with get_db() as db:
        params = {}
        q = """SELECT cl.*, p.production_name, p.production_category
               FROM community.listings cl
               LEFT JOIN shared.productions p ON p.production_id = cl.production_id
               WHERE cl.listing_status = 'ACTIVE'
               AND (cl.available_until IS NULL OR cl.available_until >= now())"""
        if production_id:
            q += " AND cl.production_id = :production_id"
            params["production_id"] = production_id
        if island:
            q += " AND cl.island = :island"
            params["island"] = island
        if grade:
            q += " AND cl.grade = :grade"
            params["grade"] = grade
        result = await db.execute(text(q + " ORDER BY cl.created_at DESC LIMIT 50"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

@router.post("/listings")
async def create_listing(body: ListingCreate, user: dict = Depends(get_current_user)):
    """Create a produce listing. Requires BASIC subscription or above."""
    allowed_tiers = ("BASIC", "PROFESSIONAL", "ENTERPRISE")
    if user.get("subscription_tier") not in allowed_tiers:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Community listings require BASIC subscription or above")

    listing_id = f"LST-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.listings
                (listing_id, tenant_id, farm_id, production_id, listing_title, listing_description,
                 quantity_available_kg, price_per_kg_fjd, negotiable, grade, island,
                 pickup_location, available_from, available_until, contact_whatsapp,
                 photos, notes, listing_status, created_by)
            VALUES
                (:listing_id, :tenant_id, :farm_id, :production_id, :listing_title, :listing_description,
                 :quantity_available_kg, :price_per_kg_fjd, :negotiable, :grade, :island,
                 :pickup_location, :available_from, :available_until, :contact_whatsapp,
                 :photos, :notes, 'ACTIVE', :created_by)
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

@router.get("/posts")
async def list_community_posts(
    post_type: str = None,
    production_id: str = None,
    island: str = None,
):
    """Public knowledge feed — farmers sharing insights, questions, weather reports."""
    async with get_db() as db:
        params = {}
        q = """SELECT cp.post_id, cp.post_type, cp.title, cp.body, cp.production_id,
                      cp.island, cp.tags, cp.photos, cp.upvotes, cp.created_at,
                      p.production_name
               FROM community.posts cp
               LEFT JOIN shared.productions p ON p.production_id = cp.production_id
               WHERE cp.moderation_status = 'APPROVED'"""
        if post_type:
            q += " AND cp.post_type = :post_type"
            params["post_type"] = post_type
        if production_id:
            q += " AND cp.production_id = :production_id"
            params["production_id"] = production_id
        if island:
            q += " AND cp.island = :island"
            params["island"] = island
        result = await db.execute(text(q + " ORDER BY cp.created_at DESC LIMIT 30"), params)
        return {"data": [dict(r) for r in result.mappings().all()]}

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
