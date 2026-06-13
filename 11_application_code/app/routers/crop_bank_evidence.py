"""CROP / Whole-Farm Bank Evidence — crop counterpart of poultry_bank_evidence.

GET /api/v1/crops/bank-evidence?period=YYYY-MM[&farm_id=F001-XXXX]
  Returns a verifiable monthly cashflow + production statement (PDF, binary)
  anchored to the audit hash chain — the crop/whole-farm flagship for a banker.

Identical audit discipline to the poultry statement (reuses its helpers):
audit-first emission (BANK_PDF_GENERATED committed before render), the PDF
embeds its own audit event's this_hash as the self-referential anchor, and the
audit event + report_exports row commit in one transaction.

Sources (all real, tenant + farm scoped):
  - Cash in/out  : tenant.cash_ledger (the cashflow spine)
  - Production   : tenant.harvest_log (gross/marketable kg)
  - Assets       : tenant.production_cycles (active) + tenant.production_units (area)
  - Activity     : cash_ledger + harvest_log + field_events merged
"""
import hashlib
import io
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
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
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit_chain import emit_audit_event
from app.middleware.rls import get_current_user, get_tenant_db
from app.core.capabilities import require_identity
from app.schemas.envelope import error_envelope
from app.routers.poultry_bank_evidence import (
    COLOR_SOIL, COLOR_GREEN, COLOR_MUTED, COLOR_RED,
    fmt_fjd, fmt_pct, generate_qr_image, long_period_label,
    _parse_period, _resolve_actor_uuid, _resolve_tenant_uuid,
)

router = APIRouter()


@router.get("/crops/bank-evidence")
async def crop_bank_evidence(
    period: Optional[str] = Query(None, description="YYYY-MM (defaults to current month UTC)"),
    farm_id: Optional[str] = Query(None, description="Farm id (defaults to first active farm)"),
    user: dict = Depends(get_current_user),
    _identity: dict = Depends(require_identity("EXTRACT_BANK_EVIDENCE")),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Return crop/whole-farm cashflow + production PDF; emit audit + write export row."""
    actor_uuid = _resolve_actor_uuid(user)
    tenant_uuid = _resolve_tenant_uuid(user)
    tid = str(tenant_uuid)

    # 1. Period
    if not period:
        now_utc = datetime.now(timezone.utc)
        period = f"{now_utc.year:04d}-{now_utc.month:02d}"
    period_start, period_end = _parse_period(period)
    ps_date, pe_date = period_start.date(), period_end.date()

    # 2. Farm (explicit, else first active for tenant)
    if farm_id:
        farm_row = (await db.execute(text("""
            SELECT farm_id, farm_name FROM tenant.farms
            WHERE farm_id = :fid AND tenant_id = :tid
        """), {"fid": farm_id, "tid": tid})).first()
    else:
        farm_row = (await db.execute(text("""
            SELECT farm_id, farm_name FROM tenant.farms
            WHERE is_active = TRUE AND tenant_id = :tid
            ORDER BY created_at, farm_id LIMIT 1
        """), {"tid": tid})).first()
    if not farm_row:
        raise HTTPException(404, error_envelope("no_farm", "No matching farm for this tenant."))
    farm_id = farm_row.farm_id
    farm_name = farm_row.farm_name

    # 3. Cash in / out by category (cash_ledger = cashflow spine)
    cash_in = [(r.category or "Other", float(r.amt)) for r in (await db.execute(text("""
        SELECT category, COALESCE(SUM(amount_fjd), 0) AS amt
        FROM tenant.cash_ledger
        WHERE tenant_id = :tid AND farm_id = :fid AND transaction_type = 'INCOME'
          AND transaction_date >= :ps AND transaction_date < :pe
        GROUP BY category ORDER BY amt DESC
    """), {"tid": tid, "fid": farm_id, "ps": ps_date, "pe": pe_date})).all()]
    cash_out = [(r.category or "Other", float(r.amt)) for r in (await db.execute(text("""
        SELECT category, COALESCE(SUM(amount_fjd), 0) AS amt
        FROM tenant.cash_ledger
        WHERE tenant_id = :tid AND farm_id = :fid AND transaction_type = 'EXPENSE'
          AND transaction_date >= :ps AND transaction_date < :pe
        GROUP BY category ORDER BY amt DESC
    """), {"tid": tid, "fid": farm_id, "ps": ps_date, "pe": pe_date})).all()]
    total_in = sum(a for _, a in cash_in)
    total_out = sum(a for _, a in cash_out)
    net_position = total_in - total_out

    # 4. Production evidence (harvest_log)
    h = (await db.execute(text("""
        SELECT COALESCE(SUM(gross_yield_kg), 0) AS gross,
               COALESCE(SUM(marketable_yield_kg), 0) AS mkt,
               COUNT(*) AS n
        FROM tenant.harvest_log
        WHERE tenant_id = :tid AND farm_id = :fid
          AND harvest_date >= :ps AND harvest_date < :pe
    """), {"tid": tid, "fid": farm_id, "ps": ps_date, "pe": pe_date})).first()
    gross_kg = float(h.gross) if h else 0.0
    mkt_kg = float(h.mkt) if h else 0.0
    harvest_n = int(h.n) if h else 0

    # 5. Asset position (end of period — current state)
    assets = (await db.execute(text("""
        SELECT
          (SELECT COUNT(*) FROM tenant.production_cycles
             WHERE tenant_id = :tid AND farm_id = :fid
               AND cycle_status IN ('ACTIVE','HARVESTING','CLOSING')) AS active_cycles,
          (SELECT COUNT(DISTINCT production_id) FROM tenant.production_cycles
             WHERE tenant_id = :tid AND farm_id = :fid
               AND cycle_status IN ('ACTIVE','HARVESTING','CLOSING')) AS crops_tracked,
          (SELECT COALESCE(SUM(area_sqm), 0) FROM tenant.production_units
             WHERE tenant_id = :tid AND farm_id = :fid AND is_active = TRUE) AS area_sqm
    """), {"tid": tid, "fid": farm_id})).first()
    active_cycles = int(assets.active_cycles or 0)
    crops_tracked = int(assets.crops_tracked or 0)
    area_ha = float(assets.area_sqm or 0) / 10000.0

    # 6. Statement of activity — merge cash + harvests + field events (cap 30)
    activity: list[tuple] = []
    for r in (await db.execute(text("""
        SELECT transaction_date AS d, transaction_type AS t, category, description, amount_fjd
        FROM tenant.cash_ledger
        WHERE tenant_id = :tid AND farm_id = :fid
          AND transaction_date >= :ps AND transaction_date < :pe
        ORDER BY transaction_date DESC LIMIT 30
    """), {"tid": tid, "fid": farm_id, "ps": ps_date, "pe": pe_date})).mappings().all():
        sign = "+" if r["t"] in ("INCOME", "LOAN", "GRANT") else "−"
        activity.append((r["d"], "Cash " + str(r["t"]).title(), f"{r['category'] or ''}: {sign}{fmt_fjd(float(r['amount_fjd']))[4:]}"[:50]))
    for r in (await db.execute(text("""
        SELECT harvest_date AS d, production_id, gross_yield_kg
        FROM tenant.harvest_log
        WHERE tenant_id = :tid AND farm_id = :fid
          AND harvest_date >= :ps AND harvest_date < :pe
        ORDER BY harvest_date DESC LIMIT 30
    """), {"tid": tid, "fid": farm_id, "ps": ps_date, "pe": pe_date})).mappings().all():
        activity.append((r["d"], "Harvest", f"{r['production_id']} · {float(r['gross_yield_kg']):,.0f} kg"[:50]))
    for r in (await db.execute(text("""
        SELECT event_date::date AS d, event_type, observation_text
        FROM tenant.field_events
        WHERE tenant_id = :tid AND farm_id = :fid
          AND event_date >= :ps AND event_date < :pe
        ORDER BY event_date DESC LIMIT 30
    """), {"tid": tid, "fid": farm_id, "ps": period_start, "pe": period_end})).mappings().all():
        activity.append((r["d"], str(r["event_type"]).replace("_", " ").title(), (r["observation_text"] or "")[:50]))
    # cash_ledger.transaction_date is timestamptz (datetime) while harvest_date /
    # event_date::date are date — normalise the sort key so mixed types don't
    # raise "can't compare datetime to date".
    def _as_date(x):
        if x is None:
            return datetime.min.date()
        return x.date() if isinstance(x, datetime) else x
    activity.sort(key=lambda x: _as_date(x[0]), reverse=True)
    activity = activity[:30]

    # 7. Chain bounds + integrity walk (tenant-wide, same as poultry)
    first_row = (await db.execute(text("""
        SELECT event_id FROM audit.events WHERE tenant_id = :tid
          AND occurred_at >= :ps AND occurred_at < :pe
        ORDER BY occurred_at ASC, event_id ASC LIMIT 1
    """), {"tid": tid, "ps": period_start, "pe": period_end})).first()
    last_row = (await db.execute(text("""
        SELECT event_id FROM audit.events WHERE tenant_id = :tid
          AND occurred_at >= :ps AND occurred_at < :pe
        ORDER BY occurred_at DESC, event_id DESC LIMIT 1
    """), {"tid": tid, "ps": period_start, "pe": period_end})).first()
    chain_first_event = first_row[0] if first_row else None
    chain_last_event = last_row[0] if last_row else None
    # Migration 132: single source of truth — the corrected, seal-aware verifier
    # (chain_seq order, post-seal window). Replaces the inline occurred_at walk
    # that reported false breaks on backdated events.
    breaks = (await db.execute(text(
        "SELECT break_count FROM audit.verify_chain_for_tenant(cast(:tid AS uuid))"
    ), {"tid": tid})).scalar() or 0
    chain_verified_ok = (int(breaks) == 0)
    chain_verified_at = datetime.now(timezone.utc)

    event_count = len(activity)

    # 8. Emit BANK_PDF_GENERATED audit event (BEFORE PDF render)
    audit_event_id, audit_hash = await emit_audit_event(
        db=db, tenant_id=tenant_uuid, actor_user_id=actor_uuid,
        event_type="BANK_PDF_GENERATED", entity_type="REPORT_EXPORT", entity_id=None,
        payload={
            "report_type": "CROP_BANK_EVIDENCE", "period": period, "farm_id": farm_id,
            "chain_first_event": str(chain_first_event) if chain_first_event else None,
            "chain_last_event": str(chain_last_event) if chain_last_event else None,
            "chain_verified_ok": chain_verified_ok,
            "total_in_fjd": round(total_in, 2), "total_out_fjd": round(total_out, 2),
            "harvest_kg": round(gross_kg, 2),
        },
    )
    if audit_event_id is None:
        raise HTTPException(500, error_envelope("audit_emission_failed", "Could not record audit event."))
    anchor_hash = audit_hash

    # 9. Compose PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
                            topMargin=2 * cm, bottomMargin=2 * cm,
                            title=f"Crop Cashflow — {farm_name} — {period}")
    elements: list = []
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("T", parent=styles["Heading1"], textColor=COLOR_SOIL, fontSize=16, spaceAfter=2, leading=20, fontName="Helvetica-Bold")
    subtitle_style = ParagraphStyle("S", parent=styles["Normal"], textColor=COLOR_SOIL, fontSize=10, spaceAfter=2, leading=13)
    meta_style = ParagraphStyle("M", parent=styles["Normal"], textColor=COLOR_MUTED, fontSize=8, spaceAfter=2, leading=11)
    anchor_style = ParagraphStyle("A", parent=styles["Normal"], textColor=COLOR_MUTED, fontSize=7, spaceAfter=14, fontName="Courier")
    section_style = ParagraphStyle("Sec", parent=styles["Heading2"], textColor=COLOR_GREEN, fontSize=11, spaceBefore=10, spaceAfter=6, fontName="Helvetica-Bold")
    body_style = ParagraphStyle("B", parent=styles["Normal"], textColor=COLOR_SOIL, fontSize=9, spaceAfter=4, leading=12)
    footer_style = ParagraphStyle("F", parent=styles["Normal"], textColor=COLOR_MUTED, fontSize=7, alignment=TA_LEFT, leading=10)

    def kv_table(rows, total_label, total_val, money=True):
        data = [["", ""]] if False else []
        for label, val in rows:
            data.append([label, fmt_fjd(val) if money else val])
        data.append([total_label, fmt_fjd(total_val) if money else total_val])
        t = Table(data, colWidths=[10 * cm, 6 * cm])
        t.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, -2), "Helvetica"),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 10),
            ("TEXTCOLOR", (0, 0), (-1, -1), COLOR_SOIL),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("LINEABOVE", (0, -1), (-1, -1), 0.75, COLOR_SOIL),
            ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        return t

    # Header
    elements.append(Paragraph("Monthly Cashflow &amp; Production Statement &mdash; Crop / Whole-Farm", title_style))
    elements.append(Paragraph(f"<b>{farm_name}</b> &nbsp;&nbsp; <font size='8' color='#8A8678'><font face='Courier'>{farm_id}</font></font>", subtitle_style))
    elements.append(Paragraph(f"Period: <b>{long_period_label(period_start, period_end)}</b>", meta_style))
    elements.append(Paragraph(f"Generated: {datetime.now(timezone.utc).strftime('%d %B %Y %H:%M UTC')}", meta_style))
    elements.append(Paragraph(f"Audit anchor: {anchor_hash[-16:]}", anchor_style))

    # Cashflow summary
    elements.append(Paragraph("CASHFLOW SUMMARY", section_style))
    net_color = COLOR_GREEN if net_position >= 0 else COLOR_RED
    st = Table([["Total cash in", fmt_fjd(total_in)], ["Total cash out", fmt_fjd(total_out)], ["NET POSITION", fmt_fjd(net_position)]], colWidths=[10 * cm, 6 * cm])
    st.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 1), "Helvetica"), ("FONTNAME", (0, 2), (-1, 2), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 1), 11), ("FONTSIZE", (0, 2), (-1, 2), 14),
        ("TEXTCOLOR", (0, 0), (-1, 1), COLOR_SOIL), ("TEXTCOLOR", (0, 2), (-1, 2), net_color),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"), ("LINEBELOW", (0, 1), (-1, 1), 0.75, COLOR_SOIL),
        ("LINEABOVE", (0, 2), (-1, 2), 1.0, COLOR_SOIL),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    elements.append(st)

    # Revenue
    elements.append(Paragraph("CASH IN (by category)", section_style))
    if cash_in:
        elements.append(kv_table(cash_in, "TOTAL CASH IN", total_in))
    else:
        elements.append(Paragraph("No cash inflows recorded in this period.", body_style))

    # Expenses
    elements.append(Paragraph("CASH OUT (by category)", section_style))
    if cash_out:
        elements.append(kv_table(cash_out, "TOTAL CASH OUT", total_out))
    else:
        elements.append(Paragraph("No cash outflows recorded in this period.", body_style))

    # Production evidence
    elements.append(Paragraph("PRODUCTION &amp; ASSET POSITION", section_style))
    prod_rows = [
        ["Harvested (gross)", f"{gross_kg:,.0f} kg"],
        ["Marketable", f"{mkt_kg:,.0f} kg"],
        ["Harvest events", f"{harvest_n:,}"],
        ["Active cycles (end of period)", f"{active_cycles:,}"],
        ["Crops tracked", f"{crops_tracked:,}"],
        ["Mapped area", f"{area_ha:,.2f} ha"],
    ]
    pt = Table(prod_rows, colWidths=[10 * cm, 6 * cm])
    pt.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 0), (-1, -1), COLOR_SOIL),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    elements.append(pt)

    # Statement of activity
    elements.append(Paragraph("STATEMENT OF ACTIVITY", section_style))
    elements.append(Paragraph("Derived from hash-chained, tamper-evident audit events. Verify at the URL below.", body_style))
    if not activity:
        elements.append(Paragraph("No activity recorded in this period.", body_style))
    else:
        rows = [["DATE", "ACTIVITY", "DETAIL"]]
        for d, label, detail in activity:
            rows.append([d.strftime("%d %b") if d else "", label, detail])
        at = Table(rows, colWidths=[2.2 * cm, 5.3 * cm, 9.5 * cm])
        at.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("TEXTCOLOR", (0, 0), (-1, -1), COLOR_SOIL), ("LINEBELOW", (0, 0), (-1, 0), 0.5, COLOR_SOIL),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        elements.append(at)

    # Footer + QR
    elements.append(Spacer(1, 0.5 * cm))
    verify_url = f"https://teivaka.com/verify/{anchor_hash}"
    qr_image = RLImage(generate_qr_image(verify_url), width=2.5 * cm, height=2.5 * cm)
    footer_para = Paragraph(
        f"<b>Prepared by:</b> Teivaka Farm OS<br/>"
        f"<b>Period covered:</b> {long_period_label(period_start, period_end)}<br/>"
        f"<b>Audit anchor:</b> <font face='Courier'>{anchor_hash[-16:]}</font><br/>"
        f"<b>Chain verified:</b> {'YES' if chain_verified_ok else 'NO'} at generation<br/>"
        f"<b>Verify online:</b> {verify_url}<br/><i>Or scan the QR code →</i>",
        footer_style,
    )
    ft = Table([[footer_para, qr_image]], colWidths=[12 * cm, 3 * cm])
    ft.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 0)]))
    elements.append(ft)
    elements.append(Spacer(1, 0.3 * cm))
    elements.append(Paragraph(
        "This statement is generated from immutable, hash-chained audit events. The chain "
        "has been verified end-to-end at the time of generation. Lenders and auditors may "
        "verify integrity in real time by scanning the QR code or visiting the URL above.",
        footer_style,
    ))

    doc.build(elements)
    buffer.seek(0)
    pdf_bytes = buffer.read()
    pdf_sha256 = hashlib.sha256(pdf_bytes).hexdigest()

    # 10. report_exports row (Strike #34 — no report_type column)
    export_row = (await db.execute(text("""
        INSERT INTO audit.report_exports (
            tenant_id, farm_id, period_start, period_end, event_count,
            chain_first_event, chain_last_event, chain_verified_at, chain_verified_ok,
            pdf_sha256, pdf_storage_url
        ) VALUES (
            :tenant_id, :farm_id, :period_start, :period_end, :event_count,
            :chain_first_event, :chain_last_event, :chain_verified_at, :chain_verified_ok,
            :pdf_sha256, NULL
        ) RETURNING export_id
    """), {
        "tenant_id": tid, "farm_id": farm_id,
        "period_start": ps_date, "period_end": pe_date, "event_count": event_count,
        "chain_first_event": str(chain_first_event) if chain_first_event else None,
        "chain_last_event": str(chain_last_event) if chain_last_event else None,
        "chain_verified_at": chain_verified_at, "chain_verified_ok": chain_verified_ok,
        "pdf_sha256": pdf_sha256,
    })).first()
    export_id: UUID = export_row[0]

    # 11. Atomic commit
    await db.commit()

    # 12. Return PDF
    filename = f"crop-bank-evidence-{farm_id}-{period}.pdf"
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Audit-Hash": audit_hash[-8:],
            "X-Audit-Event-Id": str(audit_event_id),
            "X-Anchor-Hash": anchor_hash,
            "X-Export-Id": str(export_id),
        },
    )
