"""Groups — the Home pillar's connection engine (Operator-ratified 2026-06-11).

Public-read, join-to-post interest groups (kava growers, poultry keepers,
women in agriculture, ...). Group posts live in community.feed_posts with a
group_id, so they get the entire feed infrastructure — reactions, replies,
photos, mentions — for free. Verified-email members create groups; the
creator is OWNER; admin can feature or close any group.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from typing import Optional

from app.db.session import get_db_ctx
from app.middleware.rls import get_current_user
from app.utils.community_guard import community_write

router = APIRouter()

_ADMIN_ROLES = {"ADMIN", "FOUNDER"}
CATEGORIES = ("CROPS", "LIVESTOCK", "FISHING", "EXPORT", "WOMEN_IN_AG", "YOUTH",
              "EQUIPMENT", "REGION", "GENERAL")


def _is_admin(user: dict) -> bool:
    return user.get("role") in _ADMIN_ROLES


def _gid() -> str:
    return f"GRP-{uuid.uuid4().hex[:8].upper()}"


async def _has_groups(db) -> bool:
    return bool((await db.execute(text(
        "SELECT CASE WHEN to_regclass('community.groups') IS NULL THEN false "
        "ELSE has_table_privilege(current_user, 'community.groups', 'SELECT') END"))).scalar())


async def _group(db, group_id: str) -> dict:
    row = (await db.execute(text(
        "SELECT * FROM community.groups WHERE group_id = :gid"), {"gid": group_id})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Group not found")
    return dict(row)


async def is_group_member(db, group_id: str, user_id: str) -> bool:
    """Shared with feed.py — group posts require membership."""
    return bool((await db.execute(text(
        "SELECT 1 FROM community.group_members WHERE group_id = :gid AND user_id = cast(:uid AS uuid)"),
        {"gid": group_id, "uid": str(user_id)})).scalar())


class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    category: Optional[str] = "GENERAL"
    cover_url: Optional[str] = None


class GroupPatch(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    cover_url: Optional[str] = None
    status: Optional[str] = None    # admin or owner: ACTIVE | CLOSED
    featured: Optional[bool] = None  # admin only


@router.get("/groups")
async def list_groups(search: str = None, mine: bool = False, user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        if not await _has_groups(db):
            return {"data": [], "meta": {"degraded": "groups tables missing — run the deploy script"}}
        where, params = ["g.status = 'ACTIVE'"], {"uid": uid}
        if search and search.strip():
            where.append("(g.name ILIKE :srch OR g.description ILIKE :srch)")
            params["srch"] = f"%{search.strip()}%"
        if mine:
            where.append("EXISTS (SELECT 1 FROM community.group_members gm2 WHERE gm2.group_id = g.group_id AND gm2.user_id = cast(:uid AS uuid))")
        rows = (await db.execute(text(f"""
            SELECT g.*, u.full_name AS owner_name,
                   (SELECT count(*) FROM community.group_members gm WHERE gm.group_id = g.group_id) AS member_count,
                   (SELECT count(*) FROM community.feed_posts fp WHERE fp.group_id = g.group_id AND fp.deleted_at IS NULL) AS post_count,
                   EXISTS (SELECT 1 FROM community.group_members gm WHERE gm.group_id = g.group_id AND gm.user_id = cast(:uid AS uuid)) AS is_member,
                   (g.created_by = cast(:uid AS uuid)) AS is_owner
            FROM community.groups g
            LEFT JOIN tenant.users u ON u.user_id = g.created_by
            WHERE {' AND '.join(where)}
            ORDER BY g.featured DESC, member_count DESC, g.created_at DESC
            LIMIT 100"""), params)).mappings().all()
        return {"data": [dict(r) for r in rows]}


@router.post("/groups")
async def create_group(body: GroupCreate, user: dict = Depends(community_write("group", 5))):
    name = (body.name or "").strip()
    if len(name) < 3:
        raise HTTPException(status_code=422, detail="Give the group a real name (3+ characters)")
    cat = (body.category or "GENERAL").upper()
    if cat not in CATEGORIES:
        cat = "GENERAL"
    gid = _gid()
    async with get_db_ctx() as db:
        if not await _has_groups(db):
            raise HTTPException(status_code=503, detail="Groups not available yet — run the deploy script")
        dup = (await db.execute(text(
            "SELECT 1 FROM community.groups WHERE lower(name) = lower(:n) AND status = 'ACTIVE'"),
            {"n": name})).scalar()
        if dup:
            raise HTTPException(status_code=409, detail="A group with that name already exists — join it instead")
        await db.execute(text(
            "INSERT INTO community.groups (group_id, name, description, category, cover_url, created_by) "
            "VALUES (:gid, :n, :d, :cat, :cov, cast(:uid AS uuid))"),
            {"gid": gid, "n": name, "d": (body.description or "").strip()[:1000],
             "cat": cat, "cov": body.cover_url, "uid": str(user["user_id"])})
        await db.execute(text(
            "INSERT INTO community.group_members (group_id, user_id, role) VALUES (:gid, cast(:uid AS uuid), 'OWNER')"),
            {"gid": gid, "uid": str(user["user_id"])})
        await db.commit()
    return {"data": {"group_id": gid}}


@router.get("/groups/{group_id}")
async def get_group(group_id: str, user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        g = await _group(db, group_id)
        g["member_count"] = (await db.execute(text(
            "SELECT count(*) FROM community.group_members WHERE group_id = :gid"), {"gid": group_id})).scalar() or 0
        g["is_member"] = await is_group_member(db, group_id, uid)
        g["is_owner"] = str(g["created_by"]) == uid
        g["can_manage"] = g["is_owner"] or _is_admin(user)
        owner = (await db.execute(text(
            "SELECT full_name FROM tenant.users WHERE user_id = :uid"), {"uid": str(g["created_by"])})).scalar()
        g["owner_name"] = owner
        return {"data": g}


@router.patch("/groups/{group_id}")
async def patch_group(group_id: str, body: GroupPatch, user: dict = Depends(get_current_user)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if "featured" in fields and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only admins can feature a group")
    if "status" in fields and fields["status"] not in ("ACTIVE", "CLOSED"):
        raise HTTPException(status_code=422, detail="status must be ACTIVE or CLOSED")
    if "category" in fields and fields["category"].upper() not in CATEGORIES:
        raise HTTPException(status_code=422, detail="Unknown category")
    async with get_db_ctx() as db:
        g = await _group(db, group_id)
        if not (_is_admin(user) or str(g["created_by"]) == str(user["user_id"])):
            raise HTTPException(status_code=403, detail="Only the group owner or an admin can edit this group")
        if fields:
            if "category" in fields:
                fields["category"] = fields["category"].upper()
            sets = ", ".join(f"{k} = :{k}" for k in fields)
            await db.execute(text(f"UPDATE community.groups SET {sets} WHERE group_id = :gid"),
                             {**fields, "gid": group_id})
            await db.commit()
    return {"data": {"group_id": group_id, **fields}}


@router.post("/groups/{group_id}/join")
async def join_group(group_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        g = await _group(db, group_id)
        if g["status"] != "ACTIVE":
            raise HTTPException(status_code=409, detail="This group is closed")
        await db.execute(text(
            "INSERT INTO community.group_members (group_id, user_id) VALUES (:gid, cast(:uid AS uuid)) ON CONFLICT DO NOTHING"),
            {"gid": group_id, "uid": str(user["user_id"])})
        await db.commit()
    return {"data": {"joined": True}}


@router.delete("/groups/{group_id}/join")
async def leave_group(group_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        g = await _group(db, group_id)
        if str(g["created_by"]) == str(user["user_id"]):
            raise HTTPException(status_code=409, detail="The owner can't leave — close the group instead, or ask an admin to transfer it")
        await db.execute(text(
            "DELETE FROM community.group_members WHERE group_id = :gid AND user_id = cast(:uid AS uuid)"),
            {"gid": group_id, "uid": str(user["user_id"])})
        await db.commit()
    return {"data": {"joined": False}}


@router.get("/groups/{group_id}/members")
async def group_members(group_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        await _group(db, group_id)
        rows = (await db.execute(text("""
            SELECT gm.user_id, gm.role, gm.joined_at, u.full_name, u.avatar_url,
                   lower(COALESCE(u.account_type, 'FARMER')) AS profession,
                   COALESCE(u.kyc_verified, FALSE) AS verified
            FROM community.group_members gm
            JOIN tenant.users u ON u.user_id = gm.user_id
            WHERE gm.group_id = :gid
            ORDER BY (gm.role = 'OWNER') DESC, gm.joined_at
            LIMIT 200"""), {"gid": group_id})).mappings().all()
        return {"data": [dict(r) for r in rows]}
