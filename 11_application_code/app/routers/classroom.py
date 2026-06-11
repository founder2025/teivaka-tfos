"""Classroom — Skool-model courses (Operator-ratified 2026-06-11).

Learner side: published-course grid with real progress, two-pane course
player (modules → lessons), mark-complete, module quizzes, verifiable
certificates (hash-chained into audit.events, scannable via /verify).

Builder side: Admin + partner authors (tenant.users.course_author) create
courses/modules/lessons. NO preloaded content — everything here is uploaded
by a named human (Inviolable #1: the platform never invents agronomy).

community.* is cross-tenant by design (no RLS) — access enforced here:
learners see PUBLISHED only; authors manage their own courses; admins all.
"""
import io
import uuid
from typing import List, Optional

import qrcode
import qrcode.constants
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.units import cm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas as pdf_canvas
from sqlalchemy import text

from app.core.audit_chain import emit_audit_event
from app.db.session import get_db_ctx, get_rls_db
from app.middleware.rls import get_current_user, TIER_ORDER

router = APIRouter()

_ADMIN_ROLES = {"ADMIN", "FOUNDER"}
VERIFY_BASE = "https://teivaka.com/verify"

_DEFAULT_SETTINGS = {
    "applications_open": True,
    "monetization_enabled": True,
    "payment_instructions": ("To unlock this masterclass, pay via M-PAiSA to Teivaka PTE LTD "
                             "and message us your receipt — access is granted within 24 hours."),
}


async def _has_table(db, name: str) -> bool:
    return bool((await db.execute(text(
        f"SELECT to_regclass('community.{name}') IS NOT NULL"))).scalar())


async def _settings(db) -> dict:
    """Classroom settings row, defaults if migration 101 hasn't landed."""
    if not await _has_table(db, "classroom_settings"):
        return dict(_DEFAULT_SETTINGS)
    row = (await db.execute(text(
        "SELECT applications_open, monetization_enabled, payment_instructions "
        "FROM community.classroom_settings WHERE id = 1"))).mappings().first()
    return dict(row) if row else dict(_DEFAULT_SETTINGS)


async def _entitled(db, user: dict, course: dict, settings: dict | None = None) -> bool:
    """May this user open the full course? FREE always; paid needs tier or an
    entitlement row. Authors/admins always. Payment-rail-agnostic: any future
    Stripe/M-PAiSA hook just inserts into course_entitlements."""
    pricing = (course.get("pricing") or "FREE").upper()
    if pricing == "FREE":
        return True
    if _is_admin(user) or str(course["author_user_id"]) == str(user["user_id"]):
        return True
    s = settings or await _settings(db)
    if not s["monetization_enabled"]:
        return True
    if pricing == "SUBSCRIPTION":
        mine = TIER_ORDER.get((user.get("subscription_tier") or "FREE").upper(), 0)
        need = TIER_ORDER.get((course.get("required_tier") or "BASIC").upper(), 1)
        if mine >= need:
            return True
    if not await _has_table(db, "course_entitlements"):
        return False
    return bool((await db.execute(text(
        "SELECT 1 FROM community.course_entitlements WHERE user_id = cast(:uid AS uuid) AND course_id = :cid"),
        {"uid": str(user["user_id"]), "cid": course["course_id"]})).scalar())


def _lock_lesson(lesson: dict) -> dict:
    """Strip paid content from a locked lesson — title stays as the teaser."""
    return {**lesson, "video_url": None, "video_kind": None, "body_html": "",
            "transcript": "", "resources": [], "action_step": "", "locked": True}


def _is_admin(user: dict) -> bool:
    return user.get("role") in _ADMIN_ROLES


def _id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8].upper()}"


async def _is_author(db, user: dict) -> bool:
    """Admin, or tenant.users.course_author=true (migration-tolerant)."""
    if _is_admin(user):
        return True
    has = (await db.execute(text(
        "SELECT 1 FROM information_schema.columns WHERE table_schema='tenant' "
        "AND table_name='users' AND column_name='course_author'"))).scalar()
    if not has:
        return False
    return bool((await db.execute(
        text("SELECT course_author FROM tenant.users WHERE user_id = cast(:uid AS uuid)"),
        {"uid": str(user["user_id"])})).scalar())


async def _own_course(db, course_id: str, user: dict) -> dict:
    """Course row if user may MANAGE it (author of it, or admin). 404/403 otherwise."""
    row = (await db.execute(
        text("SELECT * FROM community.courses WHERE course_id = :cid"),
        {"cid": course_id})).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Course not found")
    if not _is_admin(user) and str(row["author_user_id"]) != str(user["user_id"]):
        raise HTTPException(status_code=403, detail="Not your course")
    return dict(row)


# ---------------------------------------------------------------- learner --

@router.get("/courses")
async def list_courses(user: dict = Depends(get_current_user)):
    """Published courses for everyone + the caller's own drafts if author
    (admins see all). Real per-course progress %."""
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        author = await _is_author(db, user)
        if _is_admin(user):
            vis = "TRUE"
        elif author:
            vis = "(c.status = 'PUBLISHED' OR c.author_user_id = cast(:uid AS uuid))"
        else:
            vis = "c.status = 'PUBLISHED'"
        has_ratings = await _has_table(db, "course_ratings")
        rating_sel = (", (SELECT round(avg(stars)::numeric, 1) FROM community.course_ratings r WHERE r.course_id = c.course_id) AS avg_rating"
                      ", (SELECT count(*) FROM community.course_ratings r WHERE r.course_id = c.course_id) AS rating_count"
                      if has_ratings else ", NULL AS avg_rating, 0 AS rating_count")
        has_feat = bool((await db.execute(text(
            "SELECT 1 FROM information_schema.columns WHERE table_schema='community' AND table_name='courses' AND column_name='featured'"))).scalar())
        order = "ORDER BY c.featured DESC, c.created_at DESC" if has_feat else "ORDER BY c.created_at DESC"
        rows = (await db.execute(text(f"""
            SELECT c.*, u.full_name AS author_name,
                   (SELECT count(*) FROM community.course_lessons l
                     WHERE l.course_id = c.course_id AND l.status = 'PUBLISHED') AS lesson_count,
                   (SELECT count(*) FROM community.lesson_progress lp
                     JOIN community.course_lessons pl ON pl.lesson_id = lp.lesson_id AND pl.status = 'PUBLISHED'
                    WHERE lp.course_id = c.course_id AND lp.user_id = cast(:uid AS uuid)) AS done_count,
                   (SELECT count(DISTINCT lp2.user_id) FROM community.lesson_progress lp2
                     WHERE lp2.course_id = c.course_id) AS learners_count,
                   (SELECT count(*) FROM community.course_certificates cc
                     WHERE cc.course_id = c.course_id) AS completed_count,
                   (c.author_user_id = cast(:uid AS uuid)) AS is_mine
                   {rating_sel}
            FROM community.courses c
            LEFT JOIN tenant.users u ON u.user_id = c.author_user_id
            WHERE {vis}
            {order}
        """), {"uid": uid})).mappings().all()
        settings = await _settings(db)
        mine_ents = set()
        if await _has_table(db, "course_entitlements"):
            mine_ents = {r[0] for r in (await db.execute(text(
                "SELECT course_id FROM community.course_entitlements WHERE user_id = cast(:uid AS uuid)"),
                {"uid": uid})).all()}
        data = []
        for r in rows:
            d = dict(r)
            n, dn = int(d.pop("lesson_count") or 0), int(d.pop("done_count") or 0)
            d["lesson_count"] = n
            d["progress_pct"] = round(dn / n * 100) if n else 0
            d["can_edit"] = _is_admin(user) or d["is_mine"]
            pricing = (d.get("pricing") or "FREE").upper()
            d["entitled"] = (pricing == "FREE" or d["can_edit"] or not settings["monetization_enabled"]
                             or d["course_id"] in mine_ents
                             or (pricing == "SUBSCRIPTION"
                                 and TIER_ORDER.get((user.get("subscription_tier") or "FREE").upper(), 0)
                                 >= TIER_ORDER.get((d.get("required_tier") or "BASIC").upper(), 1)))
            data.append(d)
        return {"data": data, "meta": {"can_author": author,
                                       "applications_open": settings["applications_open"],
                                       "monetization_enabled": settings["monetization_enabled"]}}


@router.get("/courses/{course_id}")
async def get_course(course_id: str, user: dict = Depends(get_current_user)):
    """Full course tree. Learners get PUBLISHED lessons only; the course's
    author (and admins) also get drafts, flagged by status."""
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        c = (await db.execute(
            text("SELECT c.*, u.full_name AS author_name FROM community.courses c "
                 "LEFT JOIN tenant.users u ON u.user_id = c.author_user_id WHERE c.course_id = :cid"),
            {"cid": course_id})).mappings().first()
        if not c:
            raise HTTPException(status_code=404, detail="Course not found")
        c = dict(c)
        manage = _is_admin(user) or str(c["author_user_id"]) == str(uid)
        if c["status"] != "PUBLISHED" and not manage:
            raise HTTPException(status_code=404, detail="Course not found")

        mods = (await db.execute(text(
            "SELECT * FROM community.course_modules WHERE course_id = :cid ORDER BY position, module_id"),
            {"cid": course_id})).mappings().all()
        lessons = (await db.execute(text(
            "SELECT * FROM community.course_lessons WHERE course_id = :cid ORDER BY position, lesson_id"),
            {"cid": course_id})).mappings().all()
        done = {r[0] for r in (await db.execute(text(
            "SELECT lesson_id FROM community.lesson_progress WHERE user_id = cast(:uid AS uuid) AND course_id = :cid"),
            {"uid": uid, "cid": course_id})).all()}
        nq = {r[0]: r[1] for r in (await db.execute(text(
            "SELECT module_id, count(*) FROM community.quiz_questions WHERE course_id = :cid GROUP BY module_id"),
            {"cid": course_id})).all()}
        passed = {r[0] for r in (await db.execute(text(
            "SELECT DISTINCT module_id FROM community.quiz_attempts "
            "WHERE user_id = cast(:uid AS uuid) AND course_id = :cid AND passed"),
            {"uid": uid, "cid": course_id})).all()}
        cert = (await db.execute(text(
            "SELECT cert_id, audit_hash, issued_at FROM community.course_certificates "
            "WHERE user_id = cast(:uid AS uuid) AND course_id = :cid"),
            {"uid": uid, "cid": course_id})).mappings().first()

        settings = await _settings(db)
        entitled = manage or await _entitled(db, user, c, settings)
        preview_id = None
        if not entitled:
            for m in mods:
                for l in lessons:
                    if l["module_id"] == m["module_id"] and l["status"] == "PUBLISHED":
                        preview_id = l["lesson_id"]
                        break
                if preview_id:
                    break

        out_mods, total, dn = [], 0, 0
        for m in mods:
            ls = []
            for l in lessons:
                if l["module_id"] != m["module_id"]:
                    continue
                if l["status"] != "PUBLISHED" and not manage:
                    continue
                d = dict(l)
                d["done"] = l["lesson_id"] in done
                d["locked"] = False
                if not entitled and l["lesson_id"] != preview_id:
                    d = _lock_lesson(d)
                ls.append(d)
                if l["status"] == "PUBLISHED":
                    total += 1
                    dn += 1 if l["lesson_id"] in done else 0
            out_mods.append({**dict(m), "lessons": ls,
                             "has_quiz": int(nq.get(m["module_id"], 0)) > 0,
                             "question_count": int(nq.get(m["module_id"], 0)),
                             "quiz_passed": m["module_id"] in passed,
                             "locked": not entitled})
        c["modules"] = out_mods
        c["progress_pct"] = round(dn / total * 100) if total else 0
        c["can_manage"] = manage
        c["entitled"] = entitled
        if not entitled:
            c["payment_instructions"] = settings["payment_instructions"]
        c["certificate"] = dict(cert) if cert else None
        quizzed = [m for m in out_mods if m["has_quiz"] and m["quiz_pass_pct"]]
        c["certificate_eligible"] = entitled and bool(total) and dn == total and all(m["quiz_passed"] for m in quizzed)
        # ratings context (migration-tolerant)
        c["avg_rating"], c["rating_count"], c["my_rating"] = None, 0, None
        if await _has_table(db, "course_ratings"):
            agg = (await db.execute(text(
                "SELECT round(avg(stars)::numeric, 1), count(*) FROM community.course_ratings WHERE course_id = :cid"),
                {"cid": course_id})).first()
            c["avg_rating"] = float(agg[0]) if agg and agg[0] is not None else None
            c["rating_count"] = int(agg[1]) if agg else 0
            mine = (await db.execute(text(
                "SELECT stars, review FROM community.course_ratings WHERE course_id = :cid AND user_id = cast(:uid AS uuid)"),
                {"cid": course_id, "uid": uid})).first()
            c["my_rating"] = {"stars": mine[0], "review": mine[1]} if mine else None
        c["rating_allowed"] = entitled and total > 0 and (dn / total) >= 0.5
        return {"data": c}


async def _require_unlocked(db, user: dict, course_id: str, lesson_id: str | None = None):
    """403 unless the user may open this course's paid content (the free
    preview lesson — first published — is exempt when lesson_id given)."""
    course = (await db.execute(text(
        "SELECT * FROM community.courses WHERE course_id = :cid"), {"cid": course_id})).mappings().first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if await _entitled(db, user, dict(course)):
        return
    if lesson_id:
        first = (await db.execute(text("""
            SELECT l.lesson_id FROM community.course_lessons l
            JOIN community.course_modules m ON m.module_id = l.module_id
            WHERE l.course_id = :cid AND l.status = 'PUBLISHED'
            ORDER BY m.position, m.module_id, l.position, l.lesson_id LIMIT 1"""),
            {"cid": course_id})).scalar()
        if lesson_id == first:
            return
    raise HTTPException(status_code=403, detail="This is a paid masterclass — unlock it to continue")


@router.post("/lessons/{lesson_id}/complete")
async def complete_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        row = (await db.execute(text(
            "SELECT course_id FROM community.course_lessons WHERE lesson_id = :lid AND status = 'PUBLISHED'"),
            {"lid": lesson_id})).first()
        if not row:
            raise HTTPException(status_code=404, detail="Lesson not found")
        await _require_unlocked(db, user, row[0], lesson_id)
        await db.execute(text(
            "INSERT INTO community.lesson_progress (user_id, lesson_id, course_id) "
            "VALUES (cast(:uid AS uuid), :lid, :cid) ON CONFLICT DO NOTHING"),
            {"uid": str(user["user_id"]), "lid": lesson_id, "cid": row[0]})
        await db.commit()
    return {"data": {"done": True}}


@router.delete("/lessons/{lesson_id}/complete")
async def uncomplete_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        await db.execute(text(
            "DELETE FROM community.lesson_progress WHERE user_id = cast(:uid AS uuid) AND lesson_id = :lid"),
            {"uid": str(user["user_id"]), "lid": lesson_id})
        await db.commit()
    return {"data": {"done": False}}


@router.get("/me/progress")
async def my_progress(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        rows = (await db.execute(text("""
            SELECT c.course_id, c.title,
                   (SELECT count(*) FROM community.course_lessons l
                     WHERE l.course_id = c.course_id AND l.status = 'PUBLISHED') AS n,
                   count(lp.lesson_id) AS dn, max(lp.completed_at) AS last_activity
            FROM community.lesson_progress lp
            JOIN community.courses c ON c.course_id = lp.course_id
            WHERE lp.user_id = cast(:uid AS uuid)
            GROUP BY c.course_id, c.title ORDER BY last_activity DESC
        """), {"uid": str(user["user_id"])})).mappings().all()
        return {"data": [{
            "course_id": r["course_id"], "title": r["title"],
            "progress_pct": round(int(r["dn"]) / int(r["n"]) * 100) if int(r["n"]) else 0,
            "last_activity": r["last_activity"],
        } for r in rows]}


# ------------------------------------------------------------------ quiz --

class QuizAttempt(BaseModel):
    answers: List[int]


@router.get("/modules/{module_id}/quiz")
async def get_quiz(module_id: str, user: dict = Depends(get_current_user)):
    """Learner-safe quiz: questions + options, never correct_index."""
    async with get_db_ctx() as db:
        m = (await db.execute(text(
            "SELECT module_id, course_id, title, quiz_pass_pct FROM community.course_modules WHERE module_id = :mid"),
            {"mid": module_id})).mappings().first()
        if not m:
            raise HTTPException(status_code=404, detail="Module not found")
        await _require_unlocked(db, user, m["course_id"])
        qs = (await db.execute(text(
            "SELECT question_id, question, options FROM community.quiz_questions "
            "WHERE module_id = :mid ORDER BY position, question_id"),
            {"mid": module_id})).mappings().all()
        best = (await db.execute(text(
            "SELECT max(score_pct) FROM community.quiz_attempts WHERE user_id = cast(:uid AS uuid) AND module_id = :mid"),
            {"uid": str(user["user_id"]), "mid": module_id})).scalar()
        return {"data": {**dict(m), "questions": [dict(q) for q in qs], "best_score_pct": best}}


@router.post("/modules/{module_id}/quiz/attempt")
async def attempt_quiz(module_id: str, body: QuizAttempt, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        m = (await db.execute(text(
            "SELECT course_id, quiz_pass_pct FROM community.course_modules WHERE module_id = :mid"),
            {"mid": module_id})).mappings().first()
        if not m:
            raise HTTPException(status_code=404, detail="Module not found")
        await _require_unlocked(db, user, m["course_id"])
        qs = (await db.execute(text(
            "SELECT correct_index FROM community.quiz_questions WHERE module_id = :mid ORDER BY position, question_id"),
            {"mid": module_id})).all()
        if not qs:
            raise HTTPException(status_code=400, detail="This module has no quiz")
        if len(body.answers) != len(qs):
            raise HTTPException(status_code=422, detail=f"Expected {len(qs)} answers")
        correct = sum(1 for given, (want,) in zip(body.answers, qs) if given == want)
        score = round(correct / len(qs) * 100)
        passed = score >= int(m["quiz_pass_pct"] or 70)
        await db.execute(text(
            "INSERT INTO community.quiz_attempts (attempt_id, user_id, module_id, course_id, score_pct, passed, answers) "
            "VALUES (:aid, cast(:uid AS uuid), :mid, :cid, :score, :passed, cast(:ans AS jsonb))"),
            {"aid": _id("QZA"), "uid": str(user["user_id"]), "mid": module_id, "cid": m["course_id"],
             "score": score, "passed": passed, "ans": __import__("json").dumps(body.answers)})
        await db.commit()
        return {"data": {"score_pct": score, "passed": passed,
                         "correct": correct, "total": len(qs),
                         "pass_pct": int(m["quiz_pass_pct"] or 70)}}


# ---------------------------------------------------------- certificates --

@router.post("/courses/{course_id}/certificate")
async def issue_certificate(course_id: str, user: dict = Depends(get_current_user)):
    """Issue the completion certificate when eligible: 100% of published
    lessons done + every quiz-bearing module passed. Hash-chained into
    audit.events — the QR on the PDF resolves at /verify/{audit_hash}."""
    detail = (await get_course(course_id, user))["data"]
    if detail.get("certificate"):
        return {"data": detail["certificate"]}
    if not detail.get("certificate_eligible"):
        raise HTTPException(status_code=409, detail="Course not complete yet — finish every lesson and pass the quizzes first")
    uid, tid = str(user["user_id"]), str(user["tenant_id"])
    cert_id = _id("CERT")
    async with get_db_ctx() as db:
        learner = (await db.execute(
            text("SELECT full_name FROM tenant.users WHERE user_id = cast(:uid AS uuid)"),
            {"uid": uid})).scalar() or "TFOS Learner"
    audit_hash = None
    async with get_rls_db(tid) as adb:
        _, audit_hash = await emit_audit_event(
            db=adb, tenant_id=user["tenant_id"], actor_user_id=user["user_id"],
            event_type="COURSE_CERTIFICATE_ISSUED", entity_type="course_certificate",
            entity_id=cert_id,
            payload={"cert_id": cert_id, "course_id": course_id, "course_title": detail["title"],
                     "learner_name": learner, "author": detail.get("author_name") or detail.get("attribution") or "",
                     "progress_pct": 100},
        )
    async with get_db_ctx() as db:
        await db.execute(text(
            "INSERT INTO community.course_certificates (cert_id, user_id, course_id, course_title, learner_name, audit_hash) "
            "VALUES (:cid, cast(:uid AS uuid), :crs, :title, :name, :hash) ON CONFLICT (user_id, course_id) DO NOTHING"),
            {"cid": cert_id, "uid": uid, "crs": course_id, "title": detail["title"],
             "name": learner, "hash": audit_hash})
        await db.commit()
    return {"data": {"cert_id": cert_id, "audit_hash": audit_hash}}


@router.get("/me/certificates")
async def my_certificates(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        rows = (await db.execute(text(
            "SELECT * FROM community.course_certificates WHERE user_id = cast(:uid AS uuid) ORDER BY issued_at DESC"),
            {"uid": str(user["user_id"])})).mappings().all()
        return {"data": [dict(r) for r in rows]}


@router.get("/certificates/{cert_id}/pdf")
async def certificate_pdf(cert_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        cert = (await db.execute(text(
            "SELECT cc.*, c.attribution, u.full_name AS author_name "
            "FROM community.course_certificates cc "
            "JOIN community.courses c ON c.course_id = cc.course_id "
            "LEFT JOIN tenant.users u ON u.user_id = c.author_user_id "
            "WHERE cc.cert_id = :cid AND cc.user_id = cast(:uid AS uuid)"),
            {"cid": cert_id, "uid": str(user["user_id"])})).mappings().first()
    if not cert:
        raise HTTPException(status_code=404, detail="Certificate not found")

    buf = io.BytesIO()
    W, H = landscape(A4)
    c = pdf_canvas.Canvas(buf, pagesize=landscape(A4))
    c.setFillColorRGB(0.98, 0.96, 0.91)                     # cream
    c.rect(0, 0, W, H, fill=1, stroke=0)
    c.setStrokeColorRGB(0.42, 0.66, 0.31)                   # green
    c.setLineWidth(3)
    c.rect(1 * cm, 1 * cm, W - 2 * cm, H - 2 * cm, fill=0, stroke=1)
    c.setFillColorRGB(0.24, 0.18, 0.12)                     # soil
    c.setFont("Helvetica-Bold", 26)
    c.drawCentredString(W / 2, H - 3.2 * cm, "Certificate of Completion")
    c.setFont("Helvetica", 13)
    c.drawCentredString(W / 2, H - 4.3 * cm, "Teivaka Farm Operating System · Classroom")
    c.setFont("Helvetica-Bold", 22)
    c.drawCentredString(W / 2, H - 6.6 * cm, cert["learner_name"])
    c.setFont("Helvetica", 13)
    c.drawCentredString(W / 2, H - 7.7 * cm, "has completed the course")
    c.setFont("Helvetica-Bold", 17)
    c.drawCentredString(W / 2, H - 9.0 * cm, cert["course_title"])
    author = cert["author_name"] or cert["attribution"] or "TFOS Partner"
    c.setFont("Helvetica", 11)
    c.drawCentredString(W / 2, H - 10.2 * cm, f"Course author: {author}")
    c.drawCentredString(W / 2, H - 11.0 * cm, f"Issued {cert['issued_at'].strftime('%d %B %Y')} · Certificate {cert['cert_id']}")
    if cert["audit_hash"]:
        verify_url = f"{VERIFY_BASE}/{cert['audit_hash']}"
        qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=4, border=1)
        qr.add_data(verify_url)
        qr.make(fit=True)
        img_buf = io.BytesIO()
        qr.make_image(fill_color="black", back_color="white").save(img_buf, format="PNG")
        img_buf.seek(0)
        c.drawImage(ImageReader(img_buf), W - 5.2 * cm, 1.6 * cm, 3.2 * cm, 3.2 * cm)
        c.setFont("Helvetica", 8)
        c.drawString(1.8 * cm, 2.2 * cm, "Scan to verify — this certificate is hash-chained")
        c.drawString(1.8 * cm, 1.8 * cm, f"in the TFOS audit ledger: {verify_url}")
    c.showPage()
    c.save()
    buf.seek(0)
    return Response(content=buf.read(), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{cert_id}.pdf"'})


# --------------------------------------------------------------- builder --

class CourseCreate(BaseModel):
    title: str


class CoursePatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    cover_url: Optional[str] = None
    level: Optional[str] = None
    language: Optional[str] = None
    status: Optional[str] = None
    attribution: Optional[str] = None
    verification_status: Optional[str] = None
    pricing: Optional[str] = None        # FREE | SUBSCRIPTION | ONE_TIME
    price_fjd: Optional[float] = None
    required_tier: Optional[str] = None  # BASIC | PROFESSIONAL | ENTERPRISE
    featured: Optional[bool] = None      # admin-only — pins the course first


class ModuleCreate(BaseModel):
    title: str


class ModulePatch(BaseModel):
    title: Optional[str] = None
    position: Optional[int] = None
    quiz_pass_pct: Optional[int] = None


class LessonPatch(BaseModel):
    title: Optional[str] = None
    video_kind: Optional[str] = None
    video_url: Optional[str] = None
    body_html: Optional[str] = None
    transcript: Optional[str] = None
    resources: Optional[list] = None
    action_step: Optional[str] = None
    status: Optional[str] = None
    drip: Optional[bool] = None
    position: Optional[int] = None
    module_id: Optional[str] = None


class QuizPut(BaseModel):
    pass_pct: int = 70
    questions: list  # [{question, options: [..], correct_index}]


async def _require_author(db, user):
    if not await _is_author(db, user):
        raise HTTPException(status_code=403, detail="Course authoring requires admin or partner-author access")


@router.post("/courses")
async def create_course(body: CourseCreate, user: dict = Depends(get_current_user)):
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="Title required")
    cid = _id("CRS")
    async with get_db_ctx() as db:
        await _require_author(db, user)
        await db.execute(text(
            "INSERT INTO community.courses (course_id, title, author_user_id) VALUES (:cid, :t, cast(:uid AS uuid))"),
            {"cid": cid, "t": title, "uid": str(user["user_id"])})
        await db.execute(text(
            "INSERT INTO community.course_modules (module_id, course_id, title, position) VALUES (:mid, :cid, 'Module 1', 0)"),
            {"mid": _id("MOD"), "cid": cid})
        await db.commit()
    return {"data": {"course_id": cid}}


@router.patch("/courses/{course_id}")
async def patch_course(course_id: str, body: CoursePatch, user: dict = Depends(get_current_user)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if "status" in fields and fields["status"] not in ("DRAFT", "PUBLISHED"):
        raise HTTPException(status_code=422, detail="status must be DRAFT or PUBLISHED")
    if "pricing" in fields:
        fields["pricing"] = fields["pricing"].upper()
        if fields["pricing"] not in ("FREE", "SUBSCRIPTION", "ONE_TIME"):
            raise HTTPException(status_code=422, detail="pricing must be FREE, SUBSCRIPTION or ONE_TIME")
    if "required_tier" in fields and fields["required_tier"].upper() not in TIER_ORDER:
        raise HTTPException(status_code=422, detail="Unknown subscription tier")
    if fields.get("price_fjd") is not None and fields["price_fjd"] < 0:
        raise HTTPException(status_code=422, detail="Price cannot be negative")
    if "featured" in fields and not _is_admin(user):
        raise HTTPException(status_code=403, detail="Only admins can feature a course")
    if not fields:
        return {"data": {"course_id": course_id}}
    async with get_db_ctx() as db:
        await _own_course(db, course_id, user)
        sets = ", ".join(f"{k} = :{k}" for k in fields)
        await db.execute(text(
            f"UPDATE community.courses SET {sets}, updated_at = now() WHERE course_id = :cid"),
            {**fields, "cid": course_id})
        await db.commit()
    return {"data": {"course_id": course_id, **fields}}


@router.delete("/courses/{course_id}")
async def delete_course(course_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        await _own_course(db, course_id, user)
        await db.execute(text("DELETE FROM community.courses WHERE course_id = :cid"), {"cid": course_id})
        await db.commit()
    return {"data": {"deleted": True}}


@router.post("/courses/{course_id}/modules")
async def create_module(course_id: str, body: ModuleCreate, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        await _own_course(db, course_id, user)
        mid = _id("MOD")
        await db.execute(text(
            "INSERT INTO community.course_modules (module_id, course_id, title, position) "
            "VALUES (:mid, :cid, :t, COALESCE((SELECT max(position)+1 FROM community.course_modules WHERE course_id = :cid), 0))"),
            {"mid": mid, "cid": course_id, "t": (body.title or "New module").strip() or "New module"})
        await db.commit()
    return {"data": {"module_id": mid}}


async def _module_course(db, module_id: str) -> str:
    cid = (await db.execute(text(
        "SELECT course_id FROM community.course_modules WHERE module_id = :mid"), {"mid": module_id})).scalar()
    if not cid:
        raise HTTPException(status_code=404, detail="Module not found")
    return cid


@router.patch("/modules/{module_id}")
async def patch_module(module_id: str, body: ModulePatch, user: dict = Depends(get_current_user)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    async with get_db_ctx() as db:
        await _own_course(db, await _module_course(db, module_id), user)
        if fields:
            sets = ", ".join(f"{k} = :{k}" for k in fields)
            await db.execute(text(f"UPDATE community.course_modules SET {sets} WHERE module_id = :mid"),
                             {**fields, "mid": module_id})
            await db.commit()
    return {"data": {"module_id": module_id, **fields}}


@router.delete("/modules/{module_id}")
async def delete_module(module_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        await _own_course(db, await _module_course(db, module_id), user)
        await db.execute(text("DELETE FROM community.course_modules WHERE module_id = :mid"), {"mid": module_id})
        await db.commit()
    return {"data": {"deleted": True}}


@router.put("/modules/{module_id}/quiz")
async def put_quiz(module_id: str, body: QuizPut, user: dict = Depends(get_current_user)):
    """Replace the module's quiz wholesale — simplest flawless authoring flow."""
    async with get_db_ctx() as db:
        cid = await _module_course(db, module_id)
        await _own_course(db, cid, user)
        for i, q in enumerate(body.questions):
            if not (q.get("question") and isinstance(q.get("options"), list) and len(q["options"]) >= 2
                    and isinstance(q.get("correct_index"), int) and 0 <= q["correct_index"] < len(q["options"])):
                raise HTTPException(status_code=422, detail=f"Question {i + 1} needs text, 2+ options, and a valid correct answer")
        await db.execute(text("DELETE FROM community.quiz_questions WHERE module_id = :mid"), {"mid": module_id})
        for i, q in enumerate(body.questions):
            await db.execute(text(
                "INSERT INTO community.quiz_questions (question_id, module_id, course_id, question, options, correct_index, position) "
                "VALUES (:qid, :mid, :cid, :q, cast(:opts AS jsonb), :ci, :pos)"),
                {"qid": _id("QZQ"), "mid": module_id, "cid": cid, "q": q["question"],
                 "opts": __import__("json").dumps(q["options"]), "ci": q["correct_index"], "pos": i})
        await db.execute(text("UPDATE community.course_modules SET quiz_pass_pct = :p WHERE module_id = :mid"),
                         {"p": (body.pass_pct if body.questions else None), "mid": module_id})
        await db.commit()
    return {"data": {"module_id": module_id, "question_count": len(body.questions), "pass_pct": body.pass_pct}}


@router.get("/modules/{module_id}/quiz/full")
async def get_quiz_full(module_id: str, user: dict = Depends(get_current_user)):
    """Author view — includes correct_index."""
    async with get_db_ctx() as db:
        await _own_course(db, await _module_course(db, module_id), user)
        qs = (await db.execute(text(
            "SELECT question_id, question, options, correct_index FROM community.quiz_questions "
            "WHERE module_id = :mid ORDER BY position, question_id"), {"mid": module_id})).mappings().all()
        pp = (await db.execute(text(
            "SELECT quiz_pass_pct FROM community.course_modules WHERE module_id = :mid"), {"mid": module_id})).scalar()
        return {"data": {"pass_pct": pp or 70, "questions": [dict(q) for q in qs]}}


@router.post("/modules/{module_id}/lessons")
async def create_lesson(module_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        cid = await _module_course(db, module_id)
        await _own_course(db, cid, user)
        lid = _id("LSN")
        await db.execute(text(
            "INSERT INTO community.course_lessons (lesson_id, module_id, course_id, position) "
            "VALUES (:lid, :mid, :cid, COALESCE((SELECT max(position)+1 FROM community.course_lessons WHERE module_id = :mid), 0))"),
            {"lid": lid, "mid": module_id, "cid": cid})
        await db.commit()
    return {"data": {"lesson_id": lid}}


async def _lesson_course(db, lesson_id: str) -> str:
    cid = (await db.execute(text(
        "SELECT course_id FROM community.course_lessons WHERE lesson_id = :lid"), {"lid": lesson_id})).scalar()
    if not cid:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return cid


@router.patch("/lessons/{lesson_id}")
async def patch_lesson(lesson_id: str, body: LessonPatch, user: dict = Depends(get_current_user)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if "status" in fields and fields["status"] not in ("DRAFT", "PUBLISHED"):
        raise HTTPException(status_code=422, detail="status must be DRAFT or PUBLISHED")
    async with get_db_ctx() as db:
        await _own_course(db, await _lesson_course(db, lesson_id), user)
        if "module_id" in fields:
            # moving folders must stay inside the same course
            target = (await db.execute(text(
                "SELECT course_id FROM community.course_modules WHERE module_id = :mid"),
                {"mid": fields["module_id"]})).scalar()
            if target != await _lesson_course(db, lesson_id):
                raise HTTPException(status_code=422, detail="Target folder is in a different course")
        if fields:
            assigns = []
            params = {"lid": lesson_id}
            for k, v in fields.items():
                if k == "resources":
                    assigns.append("resources = cast(:resources AS jsonb)")
                    params["resources"] = __import__("json").dumps(v)
                else:
                    assigns.append(f"{k} = :{k}")
                    params[k] = v
            await db.execute(text(
                f"UPDATE community.course_lessons SET {', '.join(assigns)}, updated_at = now() WHERE lesson_id = :lid"),
                params)
            await db.commit()
    return {"data": {"lesson_id": lesson_id}}


@router.post("/lessons/{lesson_id}/duplicate")
async def duplicate_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        await _own_course(db, await _lesson_course(db, lesson_id), user)
        nid = _id("LSN")
        await db.execute(text("""
            INSERT INTO community.course_lessons
                (lesson_id, module_id, course_id, title, video_kind, video_url, body_html,
                 transcript, resources, action_step, status, drip, position)
            SELECT :nid, module_id, course_id, title || ' (copy)', video_kind, video_url, body_html,
                   transcript, resources, action_step, 'DRAFT', drip, position + 1
            FROM community.course_lessons WHERE lesson_id = :lid"""),
            {"nid": nid, "lid": lesson_id})
        await db.commit()
    return {"data": {"lesson_id": nid}}


@router.delete("/lessons/{lesson_id}")
async def delete_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        await _own_course(db, await _lesson_course(db, lesson_id), user)
        await db.execute(text("DELETE FROM community.course_lessons WHERE lesson_id = :lid"), {"lid": lesson_id})
        await db.commit()
    return {"data": {"deleted": True}}


# ---------------------------------------------------------------- ratings --

class RatingBody(BaseModel):
    stars: int
    review: Optional[str] = ""


@router.post("/courses/{course_id}/rating")
async def rate_course(course_id: str, body: RatingBody, user: dict = Depends(get_current_user)):
    """Rate a course — gated behind 50% real completion so reviews can't be
    gamed by people who never took the course."""
    if not 1 <= body.stars <= 5:
        raise HTTPException(status_code=422, detail="Stars must be 1-5")
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        if not await _has_table(db, "course_ratings"):
            raise HTTPException(status_code=503, detail="Ratings not available yet — run the deploy script")
        await _require_unlocked(db, user, course_id)
        n = (await db.execute(text(
            "SELECT count(*) FROM community.course_lessons WHERE course_id = :cid AND status = 'PUBLISHED'"),
            {"cid": course_id})).scalar() or 0
        dn = (await db.execute(text(
            "SELECT count(*) FROM community.lesson_progress lp JOIN community.course_lessons l "
            "ON l.lesson_id = lp.lesson_id AND l.status = 'PUBLISHED' "
            "WHERE lp.course_id = :cid AND lp.user_id = cast(:uid AS uuid)"),
            {"cid": course_id, "uid": uid})).scalar() or 0
        if not n or dn / n < 0.5:
            raise HTTPException(status_code=409, detail="Complete at least half the course before rating it")
        await db.execute(text(
            "INSERT INTO community.course_ratings (user_id, course_id, stars, review) "
            "VALUES (cast(:uid AS uuid), :cid, :stars, :review) "
            "ON CONFLICT (user_id, course_id) DO UPDATE SET stars = :stars, review = :review, created_at = now()"),
            {"uid": uid, "cid": course_id, "stars": body.stars, "review": (body.review or "").strip()[:500]})
        await db.commit()
    return {"data": {"stars": body.stars}}


# --------------------------------------------- "Teach on Teivaka" requests --

class AuthorRequestBody(BaseModel):
    expertise: str
    credentials: Optional[str] = ""
    topics: Optional[str] = ""
    evidence: Optional[list] = []


@router.post("/author-request")
async def submit_author_request(body: AuthorRequestBody, user: dict = Depends(get_current_user)):
    """Apply to teach. Requirements: verified email + KYC green tick — the
    'certified, experienced' bar is checkable, not vibes."""
    if not (body.expertise or "").strip():
        raise HTTPException(status_code=422, detail="Tell us your area of expertise")
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        if not await _has_table(db, "author_requests"):
            raise HTTPException(status_code=503, detail="Applications not available yet — run the deploy script")
        s = await _settings(db)
        if not s["applications_open"]:
            raise HTTPException(status_code=409, detail="Author applications are closed right now")
        row = (await db.execute(text(
            "SELECT email_verified, COALESCE(kyc_verified, FALSE) FROM tenant.users WHERE user_id = cast(:uid AS uuid)"),
            {"uid": uid})).first()
        if not row or not row[0]:
            raise HTTPException(status_code=403, detail="Verify your email first")
        if not row[1]:
            raise HTTPException(status_code=403, detail="Get your identity verified (green tick) first — Profile → Verification")
        pending = (await db.execute(text(
            "SELECT 1 FROM community.author_requests WHERE user_id = cast(:uid AS uuid) AND status = 'PENDING'"),
            {"uid": uid})).scalar()
        if pending:
            raise HTTPException(status_code=409, detail="Your application is already under review")
        rid = _id("AUTH")
        await db.execute(text(
            "INSERT INTO community.author_requests (request_id, user_id, expertise, credentials, topics, evidence) "
            "VALUES (:rid, cast(:uid AS uuid), :exp, :cred, :topics, cast(:ev AS jsonb))"),
            {"rid": rid, "uid": uid, "exp": body.expertise.strip()[:1000],
             "cred": (body.credentials or "").strip()[:2000], "topics": (body.topics or "").strip()[:1000],
             "ev": __import__("json").dumps(body.evidence or [])})
        await db.commit()
    return {"data": {"request_id": rid, "status": "PENDING"}}


@router.get("/author-request/me")
async def my_author_request(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        if not await _has_table(db, "author_requests"):
            return {"data": None}
        row = (await db.execute(text(
            "SELECT request_id, status, reason, created_at, decided_at FROM community.author_requests "
            "WHERE user_id = cast(:uid AS uuid) ORDER BY created_at DESC LIMIT 1"),
            {"uid": str(user["user_id"])})).mappings().first()
        return {"data": dict(row) if row else None}


@router.get("/admin/author-requests")
async def admin_author_requests(status: str = "PENDING", user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        rows = (await db.execute(text(
            "SELECT ar.*, u.full_name, u.email, u.profession, u.avatar_url, COALESCE(u.kyc_verified, FALSE) AS kyc_verified "
            "FROM community.author_requests ar JOIN tenant.users u ON u.user_id = ar.user_id "
            "WHERE ar.status = :st ORDER BY ar.created_at"),
            {"st": status.upper()})).mappings().all()
        return {"data": [dict(r) for r in rows]}


class DecisionBody(BaseModel):
    reason: Optional[str] = ""


@router.post("/admin/author-requests/{request_id}/approve")
async def approve_author_request(request_id: str, user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        row = (await db.execute(text(
            "UPDATE community.author_requests SET status = 'APPROVED', decided_at = now(), decided_by = cast(:by AS uuid) "
            "WHERE request_id = :rid AND status = 'PENDING' RETURNING user_id"),
            {"rid": request_id, "by": str(user["user_id"])})).first()
        if not row:
            raise HTTPException(status_code=404, detail="Request not found or already decided")
        await db.execute(text("UPDATE tenant.users SET course_author = TRUE WHERE user_id = :uid"), {"uid": str(row[0])})
        try:
            await db.execute(text(
                "INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body) "
                "VALUES (:uid, cast(:actor AS uuid), 'AUTHOR_APPROVED', "
                "'You are approved to teach on Teivaka — open the Classroom and build your first course.')"),
                {"uid": str(row[0]), "actor": str(user["user_id"])})
        except Exception:  # noqa: BLE001 — best-effort notification
            pass
        await db.commit()
    return {"data": {"request_id": request_id, "status": "APPROVED"}}


@router.post("/admin/author-requests/{request_id}/reject")
async def reject_author_request(request_id: str, body: DecisionBody = None, user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        row = (await db.execute(text(
            "UPDATE community.author_requests SET status = 'REJECTED', reason = :why, decided_at = now(), decided_by = cast(:by AS uuid) "
            "WHERE request_id = :rid AND status = 'PENDING' RETURNING user_id"),
            {"rid": request_id, "why": (body.reason if body else "") or "", "by": str(user["user_id"])})).first()
        if not row:
            raise HTTPException(status_code=404, detail="Request not found or already decided")
        await db.commit()
    return {"data": {"request_id": request_id, "status": "REJECTED"}}


@router.get("/admin/authors")
async def admin_authors(user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        rows = (await db.execute(text(
            "SELECT u.user_id, u.full_name, u.email, u.profession, "
            "(SELECT count(*) FROM community.courses c WHERE c.author_user_id = u.user_id) AS course_count "
            "FROM tenant.users u WHERE u.course_author = TRUE ORDER BY u.full_name"))).mappings().all()
        return {"data": [dict(r) for r in rows]}


# ----------------------------------------------------- settings + grants --

@router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    """Learner-facing settings: can I apply to teach, is monetization on,
    and how do I pay (shown on locked masterclasses)."""
    async with get_db_ctx() as db:
        return {"data": await _settings(db)}


class SettingsPatch(BaseModel):
    applications_open: Optional[bool] = None
    monetization_enabled: Optional[bool] = None
    payment_instructions: Optional[str] = None


@router.patch("/admin/settings")
async def patch_settings(body: SettingsPatch, user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    async with get_db_ctx() as db:
        if not await _has_table(db, "classroom_settings"):
            raise HTTPException(status_code=503, detail="Settings table missing — run the deploy script")
        if fields:
            sets = ", ".join(f"{k} = :{k}" for k in fields)
            await db.execute(text(f"UPDATE community.classroom_settings SET {sets} WHERE id = 1"), fields)
            await db.commit()
        return {"data": await _settings(db)}


class GrantBody(BaseModel):
    course_id: str
    user_email: Optional[str] = None
    user_id: Optional[str] = None


@router.post("/admin/entitlements")
async def grant_entitlement(body: GrantBody, user: dict = Depends(get_current_user)):
    """Admin manually unlocks a paid course for a user (the working payment
    path until Stripe/M-PAiSA lands — same table any PSP webhook will use)."""
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        uid = body.user_id
        if not uid and body.user_email:
            uid = (await db.execute(text(
                "SELECT user_id FROM tenant.users WHERE lower(email) = lower(:em)"),
                {"em": body.user_email.strip()})).scalar()
        if not uid:
            raise HTTPException(status_code=404, detail="User not found — check the email")
        course = (await db.execute(text(
            "SELECT title FROM community.courses WHERE course_id = :cid"), {"cid": body.course_id})).scalar()
        if not course:
            raise HTTPException(status_code=404, detail="Course not found")
        await db.execute(text(
            "INSERT INTO community.course_entitlements (user_id, course_id, source, granted_by) "
            "VALUES (cast(:uid AS uuid), :cid, 'ADMIN_GRANT', cast(:by AS uuid)) ON CONFLICT DO NOTHING"),
            {"uid": str(uid), "cid": body.course_id, "by": str(user["user_id"])})
        try:
            await db.execute(text(
                "INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body) "
                "VALUES (cast(:uid AS uuid), cast(:actor AS uuid), 'COURSE_UNLOCKED', :msg)"),
                {"uid": str(uid), "actor": str(user["user_id"]),
                 "msg": f"'{course}' is unlocked for you — open the Classroom to start."})
        except Exception:  # noqa: BLE001 — best-effort notification
            pass
        await db.commit()
    return {"data": {"user_id": str(uid), "course_id": body.course_id, "granted": True}}


# ------------------------------------------------------- partner authors --

@router.patch("/admin/users/{user_id}/course-author")
async def set_course_author(user_id: str, enabled: bool, user: dict = Depends(get_current_user)):
    """Admin grants/revokes partner authoring capability."""
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        res = await db.execute(text(
            "UPDATE tenant.users SET course_author = :on WHERE user_id = cast(:uid AS uuid)"),
            {"on": enabled, "uid": user_id})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        await db.commit()
    return {"data": {"user_id": user_id, "course_author": enabled}}


# ------------------------------------------------------------ instructors --

@router.get("/instructors")
async def list_instructors(user: dict = Depends(get_current_user)):
    """Public directory of verified instructors — every author with at least
    one PUBLISHED course, with their trust signals and course list."""
    async with get_db_ctx() as db:
        rows = (await db.execute(text("""
            SELECT u.user_id, u.full_name, u.avatar_url, u.profession,
                   COALESCE(u.kyc_verified, FALSE) AS verified,
                   c.course_id, c.title, c.level, c.pricing, c.price_fjd, c.required_tier, c.attribution,
                   (SELECT count(DISTINCT lp.user_id) FROM community.lesson_progress lp WHERE lp.course_id = c.course_id) AS learners,
                   (SELECT count(*) FROM community.course_certificates cc WHERE cc.course_id = c.course_id) AS completed,
                   (SELECT round(avg(stars)::numeric, 1) FROM community.course_ratings r WHERE r.course_id = c.course_id) AS avg_rating,
                   (SELECT count(*) FROM community.course_ratings r WHERE r.course_id = c.course_id) AS rating_count
            FROM community.courses c
            JOIN tenant.users u ON u.user_id = c.author_user_id
            WHERE c.status = 'PUBLISHED'
            ORDER BY u.full_name, c.created_at DESC"""))).mappings().all()
        following = {r[0] for r in (await db.execute(text(
            "SELECT followed_user_id::text FROM community.follows WHERE follower_user_id = cast(:uid AS uuid)"),
            {"uid": str(user["user_id"])})).all()}
        by_author = {}
        for r in rows:
            a = by_author.setdefault(str(r["user_id"]), {
                "user_id": str(r["user_id"]), "full_name": r["full_name"], "avatar_url": r["avatar_url"],
                "profession": r["profession"], "verified": bool(r["verified"]),
                "learners": 0, "certificates": 0, "courses": [],
                "_stars": 0.0, "_rated": 0,
            })
            a["learners"] += int(r["learners"] or 0)
            a["certificates"] += int(r["completed"] or 0)
            if r["avg_rating"] is not None:
                a["_stars"] += float(r["avg_rating"]) * int(r["rating_count"])
                a["_rated"] += int(r["rating_count"])
            a["courses"].append({"course_id": r["course_id"], "title": r["title"], "level": r["level"],
                                 "pricing": r["pricing"], "price_fjd": r["price_fjd"],
                                 "required_tier": r["required_tier"], "attribution": r["attribution"],
                                 "avg_rating": float(r["avg_rating"]) if r["avg_rating"] is not None else None})
        out = []
        for a in by_author.values():
            a["avg_rating"] = round(a.pop("_stars") / a["_rated"], 1) if a["_rated"] else None
            a.pop("_rated", None)
            a["course_count"] = len(a["courses"])
            a["is_following"] = a["user_id"] in following
            a["is_me"] = a["user_id"] == str(user["user_id"])
            out.append(a)
        out.sort(key=lambda x: (-x["learners"], x["full_name"]))
        return {"data": out}


@router.get("/me/teaching")
async def my_teaching(user: dict = Depends(get_current_user)):
    """Author dashboard — my courses (drafts included) with real reach stats."""
    async with get_db_ctx() as db:
        if not await _is_author(db, user):
            raise HTTPException(status_code=403, detail="Authoring access required")
        rows = (await db.execute(text("""
            SELECT c.course_id, c.title, c.status, c.pricing, c.price_fjd, c.required_tier, c.created_at,
                   (SELECT count(*) FROM community.course_lessons l WHERE l.course_id = c.course_id AND l.status = 'PUBLISHED') AS published_lessons,
                   (SELECT count(*) FROM community.course_lessons l WHERE l.course_id = c.course_id) AS total_lessons,
                   (SELECT count(DISTINCT lp.user_id) FROM community.lesson_progress lp WHERE lp.course_id = c.course_id) AS learners,
                   (SELECT count(*) FROM community.course_certificates cc WHERE cc.course_id = c.course_id) AS completed,
                   (SELECT round(avg(stars)::numeric, 1) FROM community.course_ratings r WHERE r.course_id = c.course_id) AS avg_rating,
                   (SELECT count(*) FROM community.course_ratings r WHERE r.course_id = c.course_id) AS rating_count
            FROM community.courses c
            WHERE c.author_user_id = cast(:uid AS uuid)
            ORDER BY c.created_at DESC"""), {"uid": str(user["user_id"])})).mappings().all()
        return {"data": [dict(r) for r in rows]}


# ------------------------------------------------------------ saved lessons --

@router.post("/lessons/{lesson_id}/save")
async def save_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        if not await _has_table(db, "lesson_saves"):
            raise HTTPException(status_code=503, detail="Saved lessons not available yet — run the deploy script")
        row = (await db.execute(text(
            "SELECT course_id FROM community.course_lessons WHERE lesson_id = :lid"), {"lid": lesson_id})).first()
        if not row:
            raise HTTPException(status_code=404, detail="Lesson not found")
        await db.execute(text(
            "INSERT INTO community.lesson_saves (user_id, lesson_id, course_id) "
            "VALUES (cast(:uid AS uuid), :lid, :cid) ON CONFLICT DO NOTHING"),
            {"uid": str(user["user_id"]), "lid": lesson_id, "cid": row[0]})
        await db.commit()
    return {"data": {"saved": True}}


@router.delete("/lessons/{lesson_id}/save")
async def unsave_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        if await _has_table(db, "lesson_saves"):
            await db.execute(text(
                "DELETE FROM community.lesson_saves WHERE user_id = cast(:uid AS uuid) AND lesson_id = :lid"),
                {"uid": str(user["user_id"]), "lid": lesson_id})
            await db.commit()
    return {"data": {"saved": False}}


@router.get("/me/saved-lessons")
async def my_saved_lessons(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        if not await _has_table(db, "lesson_saves"):
            return {"data": []}
        rows = (await db.execute(text("""
            SELECT ls.lesson_id, ls.course_id, ls.created_at AS saved_at,
                   l.title AS lesson_title, l.video_url, l.video_kind,
                   c.title AS course_title, c.status AS course_status,
                   m.title AS module_title
            FROM community.lesson_saves ls
            JOIN community.course_lessons l ON l.lesson_id = ls.lesson_id
            JOIN community.course_modules m ON m.module_id = l.module_id
            JOIN community.courses c ON c.course_id = ls.course_id
            WHERE ls.user_id = cast(:uid AS uuid) AND l.status = 'PUBLISHED' AND c.status = 'PUBLISHED'
            ORDER BY ls.created_at DESC"""), {"uid": str(user["user_id"])})).mappings().all()
        return {"data": [dict(r) for r in rows]}


# -------------------------------------------------- public trust surfaces --

@router.get("/users/{user_id}/certificates")
async def user_certificates(user_id: str, user: dict = Depends(get_current_user)):
    """Public-safe certificate list for a profile — the trust display a buyer
    or lender checks. Only verifiable fields, nothing private."""
    async with get_db_ctx() as db:
        rows = (await db.execute(text(
            "SELECT cert_id, course_title, issued_at, audit_hash FROM community.course_certificates "
            "WHERE user_id = cast(:uid AS uuid) ORDER BY issued_at DESC"),
            {"uid": user_id})).mappings().all()
        return {"data": [dict(r) for r in rows]}


@router.get("/courses/{course_id}/ratings")
async def course_ratings(course_id: str, user: dict = Depends(get_current_user)):
    """Reviews for a published course (or any course you manage). Reviewer
    shown by first name only — honest social proof without exposure."""
    async with get_db_ctx() as db:
        c = (await db.execute(text(
            "SELECT status, author_user_id FROM community.courses WHERE course_id = :cid"),
            {"cid": course_id})).mappings().first()
        if not c:
            raise HTTPException(status_code=404, detail="Course not found")
        manage = _is_admin(user) or str(c["author_user_id"]) == str(user["user_id"])
        if c["status"] != "PUBLISHED" and not manage:
            raise HTTPException(status_code=404, detail="Course not found")
        if not await _has_table(db, "course_ratings"):
            return {"data": []}
        rows = (await db.execute(text(
            "SELECT r.stars, r.review, r.created_at, split_part(u.full_name, ' ', 1) AS reviewer "
            "FROM community.course_ratings r JOIN tenant.users u ON u.user_id = r.user_id "
            "WHERE r.course_id = :cid ORDER BY r.created_at DESC LIMIT 100"),
            {"cid": course_id})).mappings().all()
        return {"data": [dict(r) for r in rows]}


# ------------------------------------------------ library: merged + drafts --

@router.get("/library")
async def library(search: str = None, user: dict = Depends(get_current_user)):
    """The Library, merged: curated shared.kb_articles (read-only core,
    Inviolable #7 intact) + APPROVED partner guides from
    community.library_submissions, labeled by source."""
    out = []
    async with get_db_ctx() as db:
        params = {}
        kq = """SELECT article_id::text AS id, title, article_type AS category,
                       content_summary AS summary, created_at, 'TFOS' AS source, NULL AS author_name
                FROM shared.kb_articles WHERE published = true"""
        if search and search.strip():
            kq += " AND (title ILIKE :srch OR content_md ILIKE :srch)"
            params["srch"] = f"%{search.strip()}%"
        out += [dict(r) for r in (await db.execute(text(kq + " ORDER BY created_at DESC LIMIT 50"), params)).mappings().all()]
        if await _has_table(db, "library_submissions"):
            pq = """SELECT s.submission_id AS id, s.title, s.category,
                           s.summary, s.created_at, 'PARTNER' AS source, u.full_name AS author_name
                    FROM community.library_submissions s
                    LEFT JOIN tenant.users u ON u.user_id = s.author_user_id
                    WHERE s.status = 'APPROVED'"""
            if search and search.strip():
                pq += " AND (s.title ILIKE :srch OR s.content_md ILIKE :srch)"
            out += [dict(r) for r in (await db.execute(text(pq + " ORDER BY s.created_at DESC LIMIT 50"), params)).mappings().all()]
    out.sort(key=lambda a: str(a["created_at"]), reverse=True)
    return {"data": out}


@router.get("/library/{item_id}")
async def library_item(item_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        if item_id.startswith("LIB-") and await _has_table(db, "library_submissions"):
            row = (await db.execute(text(
                "SELECT s.title, s.category, s.content_md, s.created_at, u.full_name AS author_name, 'PARTNER' AS source "
                "FROM community.library_submissions s LEFT JOIN tenant.users u ON u.user_id = s.author_user_id "
                "WHERE s.submission_id = :id AND s.status = 'APPROVED'"), {"id": item_id})).mappings().first()
        else:
            row = (await db.execute(text(
                "SELECT title, article_type AS category, content_md, created_at, NULL AS author_name, 'TFOS' AS source "
                "FROM shared.kb_articles WHERE article_id::text = :id AND published = true"), {"id": item_id})).mappings().first()
        if not row:
            raise HTTPException(status_code=404, detail="Guide not found")
        return {"data": dict(row)}


class LibrarySubmission(BaseModel):
    title: str
    category: Optional[str] = "GENERAL"
    summary: Optional[str] = ""
    content_md: str


@router.post("/library/submissions")
async def submit_library_guide(body: LibrarySubmission, user: dict = Depends(get_current_user)):
    """Authors propose a field guide. It only appears in the Library after a
    human admin approves it — knowledge stays reviewed, never auto-published."""
    if not (body.title or "").strip() or not (body.content_md or "").strip():
        raise HTTPException(status_code=422, detail="Title and content are both required")
    async with get_db_ctx() as db:
        if not await _is_author(db, user):
            raise HTTPException(status_code=403, detail="Field-guide submissions are for approved authors")
        if not await _has_table(db, "library_submissions"):
            raise HTTPException(status_code=503, detail="Submissions not available yet — run the deploy script")
        sid = _id("LIB")
        await db.execute(text(
            "INSERT INTO community.library_submissions (submission_id, author_user_id, title, category, summary, content_md) "
            "VALUES (:sid, cast(:uid AS uuid), :t, :cat, :sum, :md)"),
            {"sid": sid, "uid": str(user["user_id"]), "t": body.title.strip()[:200],
             "cat": (body.category or "GENERAL").strip()[:50].upper(), "sum": (body.summary or "").strip()[:500],
             "md": body.content_md.strip()})
        await db.commit()
    return {"data": {"submission_id": sid, "status": "PENDING"}}


@router.get("/library/submissions/mine")
async def my_library_submissions(user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        if not await _has_table(db, "library_submissions"):
            return {"data": []}
        rows = (await db.execute(text(
            "SELECT submission_id, title, category, status, reason, created_at FROM community.library_submissions "
            "WHERE author_user_id = cast(:uid AS uuid) ORDER BY created_at DESC"),
            {"uid": str(user["user_id"])})).mappings().all()
        return {"data": [dict(r) for r in rows]}


@router.get("/admin/library-submissions")
async def admin_library_submissions(status: str = "PENDING", user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        rows = (await db.execute(text(
            "SELECT s.*, u.full_name, u.email FROM community.library_submissions s "
            "JOIN tenant.users u ON u.user_id = s.author_user_id "
            "WHERE s.status = :st ORDER BY s.created_at"), {"st": status.upper()})).mappings().all()
        return {"data": [dict(r) for r in rows]}


@router.post("/admin/library-submissions/{submission_id}/approve")
async def approve_library_submission(submission_id: str, user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        row = (await db.execute(text(
            "UPDATE community.library_submissions SET status = 'APPROVED', decided_at = now(), decided_by = cast(:by AS uuid) "
            "WHERE submission_id = :sid AND status = 'PENDING' RETURNING author_user_id, title"),
            {"sid": submission_id, "by": str(user["user_id"])})).first()
        if not row:
            raise HTTPException(status_code=404, detail="Submission not found or already decided")
        try:
            await db.execute(text(
                "INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body) "
                "VALUES (:uid, cast(:actor AS uuid), 'GUIDE_APPROVED', :msg)"),
                {"uid": str(row[0]), "actor": str(user["user_id"]),
                 "msg": f"Your field guide '{row[1]}' is live in the Classroom Library."})
        except Exception:  # noqa: BLE001 — best-effort notification
            pass
        await db.commit()
    return {"data": {"submission_id": submission_id, "status": "APPROVED"}}


@router.post("/admin/library-submissions/{submission_id}/reject")
async def reject_library_submission(submission_id: str, body: DecisionBody = None, user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        row = (await db.execute(text(
            "UPDATE community.library_submissions SET status = 'REJECTED', reason = :why, decided_at = now(), decided_by = cast(:by AS uuid) "
            "WHERE submission_id = :sid AND status = 'PENDING' RETURNING author_user_id"),
            {"sid": submission_id, "why": (body.reason if body else "") or "", "by": str(user["user_id"])})).first()
        if not row:
            raise HTTPException(status_code=404, detail="Submission not found or already decided")
        await db.commit()
    return {"data": {"submission_id": submission_id, "status": "REJECTED"}}


# ------------------------------------------------- admin: entitlements/reviews --

@router.get("/admin/entitlements")
async def admin_entitlements(user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        if not await _has_table(db, "course_entitlements"):
            return {"data": []}
        rows = (await db.execute(text(
            "SELECT e.user_id, e.course_id, e.source, e.created_at, u.full_name, u.email, c.title AS course_title "
            "FROM community.course_entitlements e "
            "JOIN tenant.users u ON u.user_id = e.user_id "
            "JOIN community.courses c ON c.course_id = e.course_id "
            "ORDER BY e.created_at DESC LIMIT 200"))).mappings().all()
        return {"data": [dict(r) for r in rows]}


@router.delete("/admin/entitlements/{course_id}/{user_id}")
async def revoke_entitlement(course_id: str, user_id: str, user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        res = await db.execute(text(
            "DELETE FROM community.course_entitlements WHERE course_id = :cid AND user_id = cast(:uid AS uuid)"),
            {"cid": course_id, "uid": user_id})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Entitlement not found")
        await db.commit()
    return {"data": {"revoked": True}}


@router.get("/admin/ratings")
async def admin_ratings(user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        if not await _has_table(db, "course_ratings"):
            return {"data": []}
        rows = (await db.execute(text(
            "SELECT r.user_id, r.course_id, r.stars, r.review, r.created_at, u.full_name, c.title AS course_title "
            "FROM community.course_ratings r "
            "JOIN tenant.users u ON u.user_id = r.user_id "
            "JOIN community.courses c ON c.course_id = r.course_id "
            "ORDER BY r.created_at DESC LIMIT 200"))).mappings().all()
        return {"data": [dict(r) for r in rows]}


@router.delete("/admin/ratings/{course_id}/{user_id}")
async def delete_rating(course_id: str, user_id: str, user: dict = Depends(get_current_user)):
    if not _is_admin(user):
        raise HTTPException(status_code=403, detail="Admin only")
    async with get_db_ctx() as db:
        res = await db.execute(text(
            "DELETE FROM community.course_ratings WHERE course_id = :cid AND user_id = cast(:uid AS uuid)"),
            {"cid": course_id, "uid": user_id})
        if res.rowcount == 0:
            raise HTTPException(status_code=404, detail="Rating not found")
        await db.commit()
    return {"data": {"deleted": True}}
