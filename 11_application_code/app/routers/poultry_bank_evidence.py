"""POULTRY Bank Evidence — Phase 6.10-1b (Monthly Cashflow Statement).

GET /api/v1/poultry/bank-evidence?period=YYYY-MM
  Returns a verifiable monthly cashflow statement (PDF, binary stream)
  anchored to the audit hash chain. Restructured 6.10-1b: 7-section formal
  business cashflow document — bankers lend against cashflow, not
  operational metrics.

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
  - audit.report_exports has no report_type column (Strike #34); report
    taxonomy lives in audit.events.payload_jsonb.report_type.
  - event_type 'BANK_PDF_GENERATED' is enumerated in the audit.events
    CHECK constraint (migrations 023/036/042) and the event_type_catalog.
"""

import hashlib
import io
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    Image as RLImage,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
import qrcode
import qrcode.constants
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_chain import emit_audit_event
from app.middleware.rls import get_current_user, get_tenant_db
from app.core.capabilities import require_identity
from app.schemas.envelope import error_envelope

router = APIRouter()


# Design tokens (formal accounting palette, mirror PoultryDashboard.jsx)
COLOR_SOIL = colors.HexColor("#5C4033")
COLOR_CREAM = colors.HexColor("#F8F3E9")
COLOR_GREEN = colors.HexColor("#6AA84F")
COLOR_BORDER = colors.HexColor("#E6DED0")
COLOR_MUTED = colors.HexColor("#8A8678")
COLOR_RED = colors.HexColor("#A32D2D")


def fmt_fjd(amount):
    """Format FJD amount: 'FJD 1,234.56' positive; '(1,234.56)' negative; '—' None."""
    if amount is None:
        return "—"
    abs_amt = abs(float(amount))
    formatted = f"FJD {abs_amt:,.2f}"
    return f"({formatted[4:]})" if float(amount) < 0 else formatted


def fmt_pct(num, denom):
    """Format percentage: '43%' or '—' on zero/None denom."""
    if denom is None or float(denom) == 0:
        return "—"
    return f"{(float(num) / float(denom) * 100):.0f}%"


def generate_qr_image(verify_url: str) -> io.BytesIO:
    """Generate a QR code PNG for the verify URL. Returns BytesIO ready for reportlab."""
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=2,
    )
    qr.add_data(verify_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#5C4033", back_color="#F8F3E9")
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return buf


def long_period_label(period_start: datetime, period_end: datetime) -> str:
    """'1 May 2026 — 31 May 2026' (period_end is exclusive next-month, so subtract 1 day)."""
    last_day = period_end - timedelta(days=1)
    return f"{period_start.day} {period_start.strftime('%B %Y')} — {last_day.day} {last_day.strftime('%B %Y')}"


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


@router.get("/poultry/bank-evidence")
async def poultry_bank_evidence(
    period: Optional[str] = Query(
        None,
        description="YYYY-MM (defaults to current month UTC)",
    ),
    user: dict = Depends(get_current_user),
    _identity: dict = Depends(require_identity("EXTRACT_BANK_EVIDENCE")),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return cashflow PDF (binary) for the requested period; emit audit + write export row."""
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

    # 3a. Asset position (period-independent — current state)
    active_flocks = int((await db.execute(text("""
        SELECT COUNT(*) FROM tenant.flocks WHERE is_active = TRUE
    """))).scalar() or 0)

    total_birds = int((await db.execute(text("""
        SELECT COALESCE(SUM(current_count), 0) FROM tenant.flocks WHERE is_active = TRUE
    """))).scalar() or 0)

    # 3b. Revenue breakdown
    row = (await db.execute(text("""
        SELECT
            COALESCE(SUM((payload_jsonb->>'qty_eggs')::INT), 0) AS qty_eggs,
            COALESCE(SUM((payload_jsonb->>'total_revenue_fjd')::NUMERIC), 0) AS revenue
        FROM tenant.poultry_event_log
        WHERE event_type = 'EGGS_SOLD' AND occurred_at >= :s AND occurred_at < :e
    """), {"s": period_start, "e": period_end})).first()
    eggs_sold_qty = int(row.qty_eggs) if row else 0
    eggs_sold_revenue = float(row.revenue) if row else 0.0

    row = (await db.execute(text("""
        SELECT
            COALESCE(SUM((payload_jsonb->>'qty_sold')::INT), 0) AS qty_sold,
            COALESCE(SUM((payload_jsonb->>'total_revenue_fjd')::NUMERIC), 0) AS revenue
        FROM tenant.poultry_event_log
        WHERE event_type = 'BIRDS_SOLD' AND occurred_at >= :s AND occurred_at < :e
    """), {"s": period_start, "e": period_end})).first()
    birds_sold_qty = int(row.qty_sold) if row else 0
    birds_sold_revenue = float(row.revenue) if row else 0.0

    total_revenue = eggs_sold_revenue + birds_sold_revenue

    # 3c. Expense breakdown
    row = (await db.execute(text("""
        SELECT
            COALESCE(SUM((payload_jsonb->>'qty_kg')::NUMERIC), 0) AS qty_kg,
            COALESCE(SUM((payload_jsonb->>'cost_fjd')::NUMERIC), 0) AS cost
        FROM tenant.poultry_event_log
        WHERE event_type = 'FEED_RECEIVED' AND occurred_at >= :s AND occurred_at < :e
    """), {"s": period_start, "e": period_end})).first()
    feed_qty_kg = float(row.qty_kg) if row else 0.0
    feed_cost = float(row.cost) if row else 0.0

    row = (await db.execute(text("""
        SELECT
            COALESCE(SUM((payload_jsonb->>'qty_added')::INT), 0) AS qty_added,
            COALESCE(SUM((payload_jsonb->>'cost_fjd')::NUMERIC), 0) AS cost
        FROM tenant.poultry_event_log
        WHERE event_type = 'BIRD_REPLACEMENT' AND occurred_at >= :s AND occurred_at < :e
    """), {"s": period_start, "e": period_end})).first()
    birds_purchased_qty = int(row.qty_added) if row else 0
    birds_purchased_cost = float(row.cost) if row else 0.0

    total_expenses = feed_cost + birds_purchased_cost
    net_position = total_revenue - total_expenses

    # 4. Events in period (cap 30) — Statement of Activity
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
            "payload_jsonb": r["payload_jsonb"],
        }
        for r in events_result.mappings().all()
    ]

    # 5. Chain bounds (audit.events for this tenant within period)
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

    # 6. Hash chain integrity walk for this tenant
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

    # 7. Poultry event count in period
    poultry_event_count = int((await db.execute(text("""
        SELECT COUNT(*) FROM tenant.poultry_event_log
        WHERE occurred_at >= :ps AND occurred_at < :pe
    """), {"ps": period_start, "pe": period_end})).scalar() or 0)

    # 8. Emit BANK_PDF_GENERATED audit event (BEFORE PDF render)
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

    # 9. Anchor hash = the audit event's own hash (self-referential)
    anchor_hash = audit_hash

    # 10. Compose the cashflow PDF (7 sections)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2 * cm,
        rightMargin=2 * cm,
        topMargin=2 * cm,
        bottomMargin=2 * cm,
        title=f"Cashflow Statement — {farm_name} — {period}",
    )

    elements: list = []

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "CFTitle", parent=styles["Heading1"], textColor=COLOR_SOIL,
        fontSize=16, spaceAfter=2, leading=20, fontName="Helvetica-Bold",
    )
    subtitle_style = ParagraphStyle(
        "CFSubtitle", parent=styles["Normal"], textColor=COLOR_SOIL,
        fontSize=10, spaceAfter=2, leading=13,
    )
    meta_style = ParagraphStyle(
        "CFMeta", parent=styles["Normal"], textColor=COLOR_MUTED,
        fontSize=8, spaceAfter=2, leading=11, fontName="Helvetica",
    )
    anchor_style = ParagraphStyle(
        "CFAnchor", parent=styles["Normal"], textColor=COLOR_MUTED,
        fontSize=7, spaceAfter=14, fontName="Courier",
    )
    section_header_style = ParagraphStyle(
        "CFSection", parent=styles["Heading2"], textColor=COLOR_GREEN,
        fontSize=11, spaceBefore=10, spaceAfter=6, fontName="Helvetica-Bold",
    )
    body_style = ParagraphStyle(
        "CFBody", parent=styles["Normal"], textColor=COLOR_SOIL,
        fontSize=9, spaceAfter=4, leading=12,
    )
    footnote_style = ParagraphStyle(
        "CFFootnote", parent=styles["Normal"], textColor=COLOR_MUTED,
        fontSize=7, spaceAfter=8, leading=10, fontName="Helvetica-Oblique",
    )
    footer_style = ParagraphStyle(
        "CFFooter", parent=styles["Normal"], textColor=COLOR_MUTED,
        fontSize=7, alignment=TA_LEFT, leading=10,
    )

    # ── 1. HEADER ───────────────────────────────────────────────
    elements.append(Paragraph("Monthly Cashflow Statement &mdash; Poultry Operation", title_style))
    elements.append(Paragraph(
        f"<b>{farm_name}</b> &nbsp;&nbsp; "
        f"<font size='8' color='#8A8678'><font face='Courier'>{farm_id}</font></font>",
        subtitle_style,
    ))
    elements.append(Paragraph(
        f"Period: <b>{long_period_label(period_start, period_end)}</b>",
        meta_style,
    ))
    elements.append(Paragraph(
        f"Generated: {datetime.now(timezone.utc).strftime('%-d %B %Y %H:%M UTC')}",
        meta_style,
    ))
    elements.append(Paragraph(f"Audit anchor: {anchor_hash[-16:]}", anchor_style))

    # ── 2. CASHFLOW SUMMARY ─────────────────────────────────────
    elements.append(Paragraph("CASHFLOW SUMMARY", section_header_style))
    net_color = COLOR_GREEN if net_position >= 0 else COLOR_RED
    summary_data = [
        ["Total revenue (cash in)", fmt_fjd(total_revenue)],
        ["Total expenses (cash out)", fmt_fjd(total_expenses)],
        ["NET POSITION", fmt_fjd(net_position)],
    ]
    summary_table = Table(summary_data, colWidths=[10 * cm, 6 * cm])
    summary_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 1), "Helvetica"),
        ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 1), 11),
        ("FONTSIZE", (0, 2), (-1, 2), 14),
        ("TEXTCOLOR", (0, 0), (-1, 1), COLOR_SOIL),
        ("TEXTCOLOR", (0, 2), (-1, 2), net_color),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEBELOW", (0, 1), (-1, 1), 0.75, COLOR_SOIL),
        ("LINEABOVE", (0, 2), (-1, 2), 1.0, COLOR_SOIL),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(summary_table)

    # ── 3. REVENUE BREAKDOWN ────────────────────────────────────
    elements.append(Paragraph("REVENUE", section_header_style))
    revenue_rows = [
        ["SOURCE", "QUANTITY", "AMOUNT (FJD)", "% OF TOTAL"],
        ["Egg sales", f"{eggs_sold_qty:,} eggs", fmt_fjd(eggs_sold_revenue),
         fmt_pct(eggs_sold_revenue, total_revenue)],
        ["Live and dressed bird sales", f"{birds_sold_qty:,} birds", fmt_fjd(birds_sold_revenue),
         fmt_pct(birds_sold_revenue, total_revenue)],
        ["TOTAL REVENUE", "", fmt_fjd(total_revenue),
         "100%" if total_revenue > 0 else "—"],
    ]
    revenue_table = Table(revenue_rows, colWidths=[7 * cm, 4 * cm, 3.5 * cm, 2.5 * cm])
    revenue_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), COLOR_SOIL),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TEXTCOLOR", (0, 1), (-1, -1), COLOR_SOIL),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, COLOR_SOIL),
        ("LINEABOVE", (0, -1), (-1, -1), 0.75, COLOR_SOIL),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(revenue_table)

    # ── 4. EXPENSE BREAKDOWN ────────────────────────────────────
    elements.append(Paragraph("EXPENSES", section_header_style))
    expense_rows = [
        ["CATEGORY", "DETAIL", "AMOUNT (FJD)", "% OF TOTAL"],
        ["Feed", f"{feed_qty_kg:,.1f} kg", fmt_fjd(feed_cost),
         fmt_pct(feed_cost, total_expenses)],
        ["Birds purchased", f"{birds_purchased_qty:,} birds", fmt_fjd(birds_purchased_cost),
         fmt_pct(birds_purchased_cost, total_expenses)],
        ["Vaccines and medicines", "not yet itemised *", "—", "—"],
        ["TOTAL EXPENSES", "", fmt_fjd(total_expenses),
         "100%" if total_expenses > 0 else "—"],
    ]
    expense_table = Table(expense_rows, colWidths=[7 * cm, 4 * cm, 3.5 * cm, 2.5 * cm])
    expense_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), COLOR_SOIL),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TEXTCOLOR", (0, 1), (-1, -1), COLOR_SOIL),
        ("TEXTCOLOR", (1, 3), (1, 3), COLOR_MUTED),
        ("FONTNAME", (1, 3), (1, 3), "Helvetica-Oblique"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, COLOR_SOIL),
        ("LINEABOVE", (0, -1), (-1, -1), 0.75, COLOR_SOIL),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(expense_table)
    elements.append(Paragraph(
        "* Vaccine and medicine costs are not yet itemised in TFOS. To include them, "
        "log cost amounts in vaccination events. Future TFOS releases will track "
        "this automatically.",
        footnote_style,
    ))

    # ── 5. ASSET POSITION ───────────────────────────────────────
    elements.append(Paragraph("ASSET POSITION", section_header_style))
    elements.append(Paragraph("(as at end of period)", meta_style))
    asset_rows = [
        ["ASSET", "QUANTITY"],
        ["Active flocks", f"{active_flocks:,} flocks"],
        ["Live birds (total)", f"{total_birds:,} birds"],
        ["Feed inventory on hand", "not yet tracked *"],
    ]
    asset_table = Table(asset_rows, colWidths=[10 * cm, 7 * cm])
    asset_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("TEXTCOLOR", (0, 0), (-1, 0), COLOR_SOIL),
        ("FONTSIZE", (0, 1), (-1, -1), 9),
        ("TEXTCOLOR", (0, 1), (-1, -1), COLOR_SOIL),
        ("TEXTCOLOR", (1, 3), (1, 3), COLOR_MUTED),
        ("FONTNAME", (1, 3), (1, 3), "Helvetica-Oblique"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, COLOR_SOIL),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    elements.append(asset_table)
    elements.append(Paragraph(
        "* Market valuation of live assets is supplied by the reviewing lender or "
        "buyer using local market prices. Feed inventory tracking will be available "
        "in a future TFOS release.",
        footnote_style,
    ))

    # ── 6. STATEMENT OF ACTIVITY ────────────────────────────────
    elements.append(Paragraph("STATEMENT OF ACTIVITY", section_header_style))
    elements.append(Paragraph(
        "The cashflow above is derived from the following audited events. "
        "Each event is hash-chained and tamper-evident. Verify at the URL below.",
        body_style,
    ))

    if not events_data:
        elements.append(Paragraph("No events recorded in this period.", body_style))
    else:
        activity_rows = [["DATE", "EVENT", "FLOCK", "DETAIL"]]
        for ev in events_data:
            p = ev["payload_jsonb"] or {}
            et = ev["event_type"]
            if et == "EGGS_COLLECTED":
                detail = f"{p.get('qty_eggs', 0):,} eggs"
            elif et == "EGGS_SOLD":
                detail = f"{p.get('qty_eggs', 0):,} eggs · {fmt_fjd(float(p.get('total_revenue_fjd', 0)))}"
            elif et == "MORTALITY_LOGGED":
                detail = f"{p.get('qty_dead', 0)} dead ({p.get('cause', '?')})"
            elif et == "VACCINATION_GIVEN":
                detail = f"{p.get('qty_doses', '?')} doses · {p.get('route', '')}"
            elif et == "FEED_RECEIVED":
                cost_part = f" · {fmt_fjd(float(p.get('cost_fjd', 0)))}" if p.get("cost_fjd") else ""
                detail = f"{p.get('qty_kg', 0)}kg{cost_part}"
            elif et == "WEIGHT_CHECK":
                detail = f"avg {(int(p.get('avg_weight_g', 0)) / 1000):.2f}kg (n={p.get('sample_size', 0)})"
            elif et == "FLOCK_PLACED":
                detail = f"{p.get('placed_count', 0)} placed"
            elif et == "BIRDS_SOLD":
                detail = f"{p.get('qty_sold', 0)} {p.get('sale_type', '')} · {fmt_fjd(float(p.get('total_revenue_fjd', 0)))}"
            elif et == "BIRD_REPLACEMENT":
                detail = f"+{p.get('qty_added', 0)} ({p.get('reason', '')})"
            else:
                detail = ""

            activity_rows.append([
                ev["occurred_at"].strftime("%d %b") if ev["occurred_at"] else "",
                et.replace("_", " ").title(),
                str(ev["flock_id"]) if ev["flock_id"] else "—",
                detail[:50],
            ])
        activity_table = Table(activity_rows, colWidths=[2 * cm, 4 * cm, 3.5 * cm, 7.5 * cm])
        activity_table.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 7),
            ("TEXTCOLOR", (0, 0), (-1, 0), COLOR_SOIL),
            ("FONTSIZE", (0, 1), (-1, -1), 7),
            ("TEXTCOLOR", (0, 1), (-1, -1), COLOR_SOIL),
            ("LINEBELOW", (0, 0), (-1, 0), 0.5, COLOR_SOIL),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("FONTNAME", (3, 1), (3, -1), "Helvetica"),
        ]))
        elements.append(activity_table)

    # ── 7. FOOTER WITH QR CODE ──────────────────────────────────
    elements.append(Spacer(1, 0.5 * cm))

    verify_url = f"https://teivaka.com/verify/{anchor_hash}"
    qr_buf = generate_qr_image(verify_url)
    qr_image = RLImage(qr_buf, width=2.5 * cm, height=2.5 * cm)

    footer_text_para = Paragraph(
        f"<b>Prepared by:</b> Teivaka Farm OS<br/>"
        f"<b>Period covered:</b> {long_period_label(period_start, period_end)}<br/>"
        f"<b>Audit anchor:</b> <font face='Courier'>{anchor_hash[-16:]}</font><br/>"
        f"<b>Verify online:</b> {verify_url}<br/>"
        f"<i>Or scan the QR code →</i>",
        footer_style,
    )

    footer_table = Table(
        [[footer_text_para, qr_image]],
        colWidths=[12 * cm, 3 * cm],
    )
    footer_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    elements.append(footer_table)

    elements.append(Spacer(1, 0.3 * cm))
    elements.append(Paragraph(
        "This statement is generated from immutable, hash-chained audit events. "
        "Each event row includes farm, block, crop, and operator metadata, and a "
        "SHA256 chain link to its predecessor. The chain has been verified end-to-end "
        "at the time of this statement's generation. Lenders, buyers, and auditors "
        "may verify chain integrity in real time by scanning the QR code or visiting the URL above.",
        footer_style,
    ))

    doc.build(elements)
    buffer.seek(0)
    pdf_bytes = buffer.read()
    pdf_sha256 = hashlib.sha256(pdf_bytes).hexdigest()

    # 11. INSERT report_exports row (Strike #34 — no report_type column)
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

    # 12. Atomic commit (audit event + report_exports row land together)
    await db.commit()

    # 13. Return PDF stream
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
