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
from app.middleware.rls import get_current_user

router = APIRouter()

_ADMIN_ROLES = {"ADMIN", "FOUNDER"}
VERIFY_BASE = "https://teivaka.com/verify"


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
        rows = (await db.execute(text(f"""
            SELECT c.*, u.full_name AS author_name,
                   (SELECT count(*) FROM community.course_lessons l
                     WHERE l.course_id = c.course_id AND l.status = 'PUBLISHED') AS lesson_count,
                   (SELECT count(*) FROM community.lesson_progress lp
                     JOIN community.course_lessons pl ON pl.lesson_id = lp.lesson_id AND pl.status = 'PUBLISHED'
                    WHERE lp.course_id = c.course_id AND lp.user_id = cast(:uid AS uuid)) AS done_count,
                   (c.author_user_id = cast(:uid AS uuid)) AS is_mine
            FROM community.courses c
            LEFT JOIN tenant.users u ON u.user_id = c.author_user_id
            WHERE {vis}
            ORDER BY c.created_at DESC
        """), {"uid": uid})).mappings().all()
        data = []
        for r in rows:
            d = dict(r)
            n, dn = int(d.pop("lesson_count") or 0), int(d.pop("done_count") or 0)
            d["lesson_count"] = n
            d["progress_pct"] = round(dn / n * 100) if n else 0
            data.append(d)
        return {"data": data, "meta": {"can_author": author}}


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
                ls.append(d)
                if l["status"] == "PUBLISHED":
                    total += 1
                    dn += 1 if l["lesson_id"] in done else 0
            out_mods.append({**dict(m), "lessons": ls,
                             "has_quiz": int(nq.get(m["module_id"], 0)) > 0,
                             "question_count": int(nq.get(m["module_id"], 0)),
                             "quiz_passed": m["module_id"] in passed})
        c["modules"] = out_mods
        c["progress_pct"] = round(dn / total * 100) if total else 0
        c["can_manage"] = manage
        c["certificate"] = dict(cert) if cert else None
        quizzed = [m for m in out_mods if m["has_quiz"] and m["quiz_pass_pct"]]
        c["certificate_eligible"] = bool(total) and dn == total and all(m["quiz_passed"] for m in quizzed)
        return {"data": c}


@router.post("/lessons/{lesson_id}/complete")
async def complete_lesson(lesson_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        row = (await db.execute(text(
            "SELECT course_id FROM community.course_lessons WHERE lesson_id = :lid AND status = 'PUBLISHED'"),
            {"lid": lesson_id})).first()
        if not row:
            raise HTTPException(status_code=404, detail="Lesson not found")
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
