"""POULTRY Bank Evidence PDF — Phase 6.10-1.

GET /api/v1/poultry/bank-evidence?period=YYYY-MM
  Returns a verifiable monthly PDF (binary stream) anchored to the audit
  hash chain. First moat artifact under Phase 9 (audit-grade exports).

Locked emission ordering (audit-first, PDF-anchor): the BANK_PDF_GENERATED
audit event is committed BEFORE the PDF is rendered. The PDF embeds its
own audit event's this_hash as the anchor_hash, making the verify URL
self-referential.

Single transaction: audit event + report_exports row + PDF generation
all commit together. If the report_exports INSERT fails, the audit event
also rolls back — no orphan audit rows.

Schema notes:
  - audit.report_exports.period_start / period_end are `date` columns; we
    pass datetime.date() on insert.
  - event_type 'BANK_PDF_GENERATED' is enumerated in the audit.events
    CHECK constraint (migrations 023/036/042) and the event_type_catalog.
"""

import hashlib
import io
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_chain import emit_audit_event
from app.middleware.rls import get_current_user, get_tenant_db
from app.schemas.envelope import error_envelope

router = APIRouter()


# Design tokens (mirror PoultryDashboard.jsx)
C_SOIL = colors.HexColor("#5C4033")
C_CREAM = colors.HexColor("#F8F3E9")
C_GREEN = colors.HexColor("#6AA84F")
C_BORDER = colors.HexColor("#E6DED0")
C_MUTED = colors.HexColor("#8A8678")
C_RED = colors.HexColor("#A32D2D")


EVENT_LABELS = {
    "EGGS_COLLECTED": "Eggs collected",
    "EGGS_SOLD": "Eggs sold",
    "FLOCK_PLACED": "Flock placed",
    "MORTALITY_LOGGED": "Mortality",
    "VACCINATION_GIVEN": "Vaccination",
    "FEED_RECEIVED": "Feed delivery",
    "WEIGHT_CHECK": "Weight check",
    "BIRD_REPLACEMENT": "Birds added",
    "BIRDS_SOLD": "Birds sold",
}


def _resolve_actor_uuid(user: dict) -> UUID:
    raw = user.get("user_id") or user.get("sub")
    if not raw:
        raise HTTPException(401, error_envelope("missing_user_id", "Session missing user_id."))
    try:
        return UUID(str(raw))
    except (ValueError, TypeError):
        raise HTTPException(401, error_envelope("invalid_user_id", "Session user_id not a valid UUID."))


def _resolve_tenant_uuid(user: dict) -> UUID:
    raw = user.get("tenant_id")
    if not raw:
        raise HTTPException(401, error_envelope("missing_tenant_id", "Session missing tenant_id."))
    try:
        return UUID(str(raw))
    except (ValueError, TypeError):
        raise HTTPException(401, error_envelope("invalid_tenant_id", "Session tenant_id not a valid UUID."))


def _parse_period(period: str) -> tuple[datetime, datetime]:
    """'YYYY-MM' → (period_start, period_end_exclusive) as UTC datetimes."""
    try:
        year_str, month_str = period.split("-")
        year = int(year_str)
        month = int(month_str)
        if not (1 <= month <= 12):
            raise ValueError("month out of range")
        if not (1900 <= year <= 9999):
            raise ValueError("year out of range")
    except (ValueError, AttributeError):
        raise HTTPException(
            400,
            error_envelope("invalid_period", "Period must be YYYY-MM (e.g. 2026-05)."),
        )
    period_start = datetime(year, month, 1, 0, 0, 0, tzinfo=timezone.utc)
    if month == 12:
        period_end = datetime(year + 1, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    else:
        period_end = datetime(year, month + 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    return period_start, period_end


def _event_detail(event_type: str, payload: dict) -> str:
    p = payload or {}
    if event_type == "EGGS_COLLECTED":
        return f"{p.get('qty_eggs', 0)} eggs"
    if event_type == "EGGS_SOLD":
        return f"{p.get('qty_eggs', 0)} eggs · FJD {p.get('total_revenue_fjd', 0)}"
    if event_type == "MORTALITY_LOGGED":
        return f"{p.get('qty_dead', 0)} dead ({p.get('cause', 'unknown')})"
    if event_type == "VACCINATION_GIVEN":
        return f"{p.get('qty_doses', '')} doses · {p.get('route', '')}"
    if event_type == "FEED_RECEIVED":
        cost = p.get("cost_fjd")
        base = f"{p.get('qty_kg', 0)}kg"
        return f"{base} · FJD {cost}" if cost else base
    if event_type == "WEIGHT_CHECK":
        avg_g = p.get("avg_weight_g") or 0
        return f"avg {avg_g/1000:.2f}kg (n={p.get('sample_size', 0)})"
    if event_type == "BIRD_REPLACEMENT":
        return f"+{p.get('qty_added', 0)} birds ({p.get('reason', '')})"
    if event_type == "BIRDS_SOLD":
        return f"{p.get('qty_sold', 0)} {p.get('sale_type', '')} · FJD {p.get('total_revenue_fjd', 0)}"
    if event_type == "FLOCK_PLACED":
        return f"{p.get('placed_count', 0)} {p.get('flock_type', '')}"
    return ""


def _build_pdf(
    farm_name: str,
    farm_id: str,
    period_label: str,
    generated_at: datetime,
    kpis: dict,
    flocks: list[dict],
    events: list[dict],
    anchor_hash: str,
) -> bytes:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.6 * cm,
        rightMargin=1.6 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title=f"Bank Evidence — {farm_name} — {period_label}",
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "title", parent=styles["Heading1"], textColor=C_SOIL, fontSize=18, leading=22, spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "subtitle", parent=styles["Normal"], textColor=C_MUTED, fontSize=10, leading=13, spaceAfter=2,
    )
    section_style = ParagraphStyle(
        "section", parent=styles["Heading2"], textColor=C_SOIL, fontSize=12, leading=15,
        spaceBefore=12, spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "body", parent=styles["Normal"], textColor=C_SOIL, fontSize=9, leading=12, alignment=TA_LEFT,
    )
    footer_label_style = ParagraphStyle(
        "footer_label", parent=styles["Normal"], textColor=C_SOIL, fontSize=9, leading=12,
        spaceBefore=14,
    )
    footer_body_style = ParagraphStyle(
        "footer_body", parent=styles["Normal"], textColor=C_MUTED, fontSize=8, leading=11,
    )

    story: list = []

    # Header
    story.append(Paragraph("Bank Evidence — Poultry", title_style))
    story.append(Paragraph(f"{farm_name} ({farm_id})", subtitle_style))
    story.append(Paragraph(f"Period: {period_label}", subtitle_style))
    story.append(Paragraph(
        f"Generated: {generated_at.strftime('%Y-%m-%d %H:%M UTC')}",
        subtitle_style,
    ))

    # Period summary
    story.append(Paragraph("Period summary", section_style))
    summary_rows = [
        ["Metric", "Value"],
        ["Active flocks", str(kpis.get("active_flocks", 0))],
        ["Total birds", str(kpis.get("total_birds", 0))],
        ["Eggs collected", str(kpis.get("eggs_collected", 0))],
        ["Eggs sold", str(kpis.get("eggs_sold", 0))],
        ["Birds sold", str(kpis.get("birds_sold", 0))],
        ["Mortality (birds)", str(kpis.get("mortality", 0))],
        ["Revenue (FJD)", f"{kpis.get('revenue_fjd', 0):.2f}"],
        ["Feed cost (FJD)", f"{kpis.get('feed_cost_fjd', 0):.2f}"],
    ]
    summary_tbl = Table(summary_rows, colWidths=[7 * cm, 5 * cm])
    summary_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), C_CREAM),
        ("TEXTCOLOR", (0, 0), (-1, 0), C_SOIL),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, C_BORDER),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, C_BORDER),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(summary_tbl)

    # Active flocks
    story.append(Paragraph("Active flocks", section_style))
    if flocks:
        flock_rows = [["Flock", "Label", "Type", "Status", "Placed", "Current/Placed"]]
        for f in flocks:
            placed_str = f["placed_date"].isoformat() if f.get("placed_date") else "—"
            flock_rows.append([
                f.get("flock_id") or "",
                f.get("flock_label") or "",
                f.get("flock_type") or "",
                f.get("lifecycle_status") or "",
                placed_str,
                f"{f.get('current_count', 0)} / {f.get('placed_count', 0)}",
            ])
        flock_tbl = Table(flock_rows, colWidths=[3 * cm, 4 * cm, 2.4 * cm, 2.2 * cm, 2.4 * cm, 3 * cm])
        flock_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), C_CREAM),
            ("TEXTCOLOR", (0, 0), (-1, 0), C_SOIL),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, C_BORDER),
            ("LINEBELOW", (0, 1), (-1, -1), 0.25, C_BORDER),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(flock_tbl)
    else:
        story.append(Paragraph("No active flocks during this period.", body_style))

    # Activity
    story.append(Paragraph(f"Activity in {period_label}", section_style))
    if events:
        event_rows = [["Date", "Event", "Flock", "Detail"]]
        for ev in events:
            occurred = ev.get("occurred_at")
            date_str = occurred.strftime("%Y-%m-%d") if occurred else "—"
            label = EVENT_LABELS.get(ev.get("event_type", ""), ev.get("event_type", ""))
            flock = ev.get("flock_id") or "—"
            detail = _event_detail(ev.get("event_type", ""), ev.get("payload") or {})
            event_rows.append([date_str, label, flock, detail])
        event_tbl = Table(event_rows, colWidths=[2.4 * cm, 3.6 * cm, 3 * cm, 8 * cm])
        event_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), C_CREAM),
            ("TEXTCOLOR", (0, 0), (-1, 0), C_SOIL),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, C_BORDER),
            ("LINEBELOW", (0, 1), (-1, -1), 0.25, C_BORDER),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(event_tbl)
    else:
        story.append(Paragraph("No events logged in this period.", body_style))

    # Audit anchor footer
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        f"Audit chain anchor: {anchor_hash[-16:]} · "
        f"Verify at: https://teivaka.com/verify/{anchor_hash}",
        footer_label_style,
    ))
    story.append(Paragraph(
        "This document is anchored to the Teivaka tenant audit chain. The hash above "
        "uniquely identifies the audit event recorded when this PDF was generated. "
        "Tampering with the document or any underlying event will invalidate the chain "
        "and be detectable by re-running verification at the URL above.",
        footer_body_style,
    ))

    doc.build(story)
    return buf.getvalue()


@router.get("/poultry/bank-evidence")
async def poultry_bank_evidence(
    period: Optional[str] = Query(
        None,
        description="YYYY-MM (defaults to current month UTC)",
    ),
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return PDF (binary) for the requested period; emit audit + write export row."""
    actor_uuid = _resolve_actor_uuid(user)
    tenant_uuid = _resolve_tenant_uuid(user)

    # 1. Parse period
    if not period:
        now_utc = datetime.now(timezone.utc)
        period = f"{now_utc.year:04d}-{now_utc.month:02d}"
    period_start, period_end = _parse_period(period)

    # 2. Resolve farm (first farm of tenant)
    farm_row = (
        await db.execute(
            text("""
                SELECT farm_id, farm_name
                FROM tenant.farms
                WHERE is_active = TRUE
                ORDER BY created_at, farm_id
                LIMIT 1
            """)
        )
    ).first()
    if not farm_row:
        raise HTTPException(
            404,
            error_envelope("no_farm", "No active farm found for this tenant."),
        )
    farm_id = farm_row.farm_id
    farm_name = farm_row.farm_name

    # 3. Compute period KPIs
    eggs_collected = (await db.execute(text("""
        SELECT COALESCE(SUM((payload_jsonb->>'qty_eggs')::INT), 0)
        FROM tenant.poultry_event_log
        WHERE event_type = 'EGGS_COLLECTED'
          AND occurred_at >= :ps AND occurred_at < :pe
    """), {"ps": period_start, "pe": period_end})).scalar() or 0

    eggs_sold = (await db.execute(text("""
        SELECT COALESCE(SUM((payload_jsonb->>'qty_eggs')::INT), 0)
        FROM tenant.poultry_event_log
        WHERE event_type = 'EGGS_SOLD'
          AND occurred_at >= :ps AND occurred_at < :pe
    """), {"ps": period_start, "pe": period_end})).scalar() or 0

    birds_sold = (await db.execute(text("""
        SELECT COALESCE(SUM((payload_jsonb->>'qty_sold')::INT), 0)
        FROM tenant.poultry_event_log
        WHERE event_type = 'BIRDS_SOLD'
          AND occurred_at >= :ps AND occurred_at < :pe
    """), {"ps": period_start, "pe": period_end})).scalar() or 0

    mortality = (await db.execute(text("""
        SELECT COALESCE(SUM((payload_jsonb->>'qty_dead')::INT), 0)
        FROM tenant.poultry_event_log
        WHERE event_type = 'MORTALITY_LOGGED'
          AND occurred_at >= :ps AND occurred_at < :pe
    """), {"ps": period_start, "pe": period_end})).scalar() or 0

    revenue_fjd = float((await db.execute(text("""
        SELECT COALESCE(SUM((payload_jsonb->>'total_revenue_fjd')::NUMERIC), 0)
        FROM tenant.poultry_event_log
        WHERE event_type IN ('EGGS_SOLD', 'BIRDS_SOLD')
          AND occurred_at >= :ps AND occurred_at < :pe
    """), {"ps": period_start, "pe": period_end})).scalar() or 0)

    feed_cost_fjd = float((await db.execute(text("""
        SELECT COALESCE(SUM((payload_jsonb->>'cost_fjd')::NUMERIC), 0)
        FROM tenant.poultry_event_log
        WHERE event_type = 'FEED_RECEIVED'
          AND occurred_at >= :ps AND occurred_at < :pe
    """), {"ps": period_start, "pe": period_end})).scalar() or 0)

    active_flocks_count = (await db.execute(text("""
        SELECT COUNT(*) FROM tenant.flocks WHERE is_active = TRUE
    """))).scalar() or 0

    total_birds = (await db.execute(text("""
        SELECT COALESCE(SUM(current_count), 0) FROM tenant.flocks WHERE is_active = TRUE
    """))).scalar() or 0

    kpis = {
        "active_flocks": int(active_flocks_count),
        "total_birds": int(total_birds),
        "eggs_collected": int(eggs_collected),
        "eggs_sold": int(eggs_sold),
        "birds_sold": int(birds_sold),
        "mortality": int(mortality),
        "revenue_fjd": revenue_fjd,
        "feed_cost_fjd": feed_cost_fjd,
    }

    # 4. Active flocks
    flocks_result = await db.execute(text("""
        SELECT flock_id, flock_label, flock_type, lifecycle_status,
               placed_date, placed_count, current_count
        FROM tenant.flocks
        WHERE is_active = TRUE
        ORDER BY placed_date DESC, flock_id
    """))
    flocks_data = [dict(r) for r in flocks_result.mappings().all()]

    # 5. Events in period (cap 30)
    events_result = await db.execute(text("""
        SELECT event_id, event_type, flock_id, occurred_at, payload_jsonb
        FROM tenant.poultry_event_log
        WHERE occurred_at >= :ps AND occurred_at < :pe
        ORDER BY occurred_at DESC
        LIMIT 30
    """), {"ps": period_start, "pe": period_end})
    events_data = [
        {
            "event_id": str(r["event_id"]),
            "event_type": r["event_type"],
            "flock_id": r["flock_id"],
            "occurred_at": r["occurred_at"],
            "payload": r["payload_jsonb"],
        }
        for r in events_result.mappings().all()
    ]

    # 6. Chain bounds (audit.events for this tenant within period)
    first_row = (await db.execute(text("""
        SELECT event_id FROM audit.events
        WHERE tenant_id = :tid
          AND occurred_at >= :ps AND occurred_at < :pe
        ORDER BY occurred_at ASC, event_id ASC
        LIMIT 1
    """), {"tid": str(tenant_uuid), "ps": period_start, "pe": period_end})).first()
    chain_first_event: Optional[UUID] = first_row[0] if first_row else None

    last_row = (await db.execute(text("""
        SELECT event_id FROM audit.events
        WHERE tenant_id = :tid
          AND occurred_at >= :ps AND occurred_at < :pe
        ORDER BY occurred_at DESC, event_id DESC
        LIMIT 1
    """), {"tid": str(tenant_uuid), "ps": period_start, "pe": period_end})).first()
    chain_last_event: Optional[UUID] = last_row[0] if last_row else None

    # 7. Hash chain integrity walk for this tenant
    breaks = (await db.execute(text("""
        WITH chain AS (
          SELECT event_id, previous_hash, this_hash,
                 LAG(this_hash) OVER (ORDER BY occurred_at, event_id) AS expected_prev
          FROM audit.events
          WHERE tenant_id = :tid
        )
        SELECT COUNT(*) FROM chain
        WHERE previous_hash IS DISTINCT FROM expected_prev
          AND expected_prev IS NOT NULL
    """), {"tid": str(tenant_uuid)})).scalar() or 0
    chain_verified_ok = (int(breaks) == 0)
    chain_verified_at = datetime.now(timezone.utc)

    # 8. Poultry event count in period
    poultry_event_count = (await db.execute(text("""
        SELECT COUNT(*) FROM tenant.poultry_event_log
        WHERE occurred_at >= :ps AND occurred_at < :pe
    """), {"ps": period_start, "pe": period_end})).scalar() or 0
    poultry_event_count = int(poultry_event_count)

    # 9. Emit BANK_PDF_GENERATED audit event (BEFORE PDF render)
    audit_payload = {
        "report_type": "POULTRY_BANK_EVIDENCE",
        "period": period,
        "farm_id": farm_id,
        "chain_first_event": str(chain_first_event) if chain_first_event else None,
        "chain_last_event": str(chain_last_event) if chain_last_event else None,
        "chain_verified_ok": chain_verified_ok,
        "poultry_event_count": poultry_event_count,
    }
    audit_event_id, audit_hash = await emit_audit_event(
        db=db,
        tenant_id=tenant_uuid,
        actor_user_id=actor_uuid,
        event_type="BANK_PDF_GENERATED",
        entity_type="REPORT_EXPORT",
        entity_id=None,
        payload=audit_payload,
    )
    if audit_event_id is None:
        raise HTTPException(
            500,
            error_envelope("audit_emission_failed", "Could not record audit event."),
        )

    # 10. Anchor hash = the audit event's own hash (self-referential)
    anchor_hash = audit_hash

    # 11. Generate PDF with anchor_hash in footer
    generated_at = datetime.now(timezone.utc)
    pdf_bytes = _build_pdf(
        farm_name=farm_name,
        farm_id=farm_id,
        period_label=period,
        generated_at=generated_at,
        kpis=kpis,
        flocks=flocks_data,
        events=events_data,
        anchor_hash=anchor_hash,
    )

    # 12. PDF SHA-256
    pdf_sha256 = hashlib.sha256(pdf_bytes).hexdigest()

    # 13. INSERT report_exports row
    # NOTE: report_type column does not exist on audit.report_exports (deployed
    # schema has 18 columns, report_type not among them). Report taxonomy lives
    # in audit.events.payload_jsonb.report_type instead. Strike #34.
    insert_row = (await db.execute(text("""
        INSERT INTO audit.report_exports (
            tenant_id, farm_id,
            period_start, period_end, event_count,
            chain_first_event, chain_last_event,
            chain_verified_at, chain_verified_ok,
            pdf_sha256, pdf_storage_url
        ) VALUES (
            :tenant_id, :farm_id,
            :period_start, :period_end, :event_count,
            :chain_first_event, :chain_last_event,
            :chain_verified_at, :chain_verified_ok,
            :pdf_sha256, NULL
        ) RETURNING export_id
    """), {
        "tenant_id": str(tenant_uuid),
        "farm_id": farm_id,
        "period_start": period_start.date(),
        "period_end": period_end.date(),
        "event_count": poultry_event_count,
        "chain_first_event": str(chain_first_event) if chain_first_event else None,
        "chain_last_event": str(chain_last_event) if chain_last_event else None,
        "chain_verified_at": chain_verified_at,
        "chain_verified_ok": chain_verified_ok,
        "pdf_sha256": pdf_sha256,
    })).first()
    export_id: UUID = insert_row[0]

    # 14. Atomic commit (audit event + report_exports row land together)
    await db.commit()

    # 15. Return PDF stream
    filename = f"bank-evidence-{farm_id}-{period}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Audit-Hash": audit_hash[-8:],
            "X-Audit-Event-Id": str(audit_event_id),
            "X-Anchor-Hash": anchor_hash,
            "X-Export-Id": str(export_id),
        },
    )
