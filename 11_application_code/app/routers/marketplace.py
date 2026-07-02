from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from app.db.session import get_rls_db, get_db, get_db_ctx
from app.middleware.rls import get_current_user
from app.utils.schema_probe import productions_category
from pydantic import BaseModel
from decimal import Decimal
from datetime import datetime
from typing import Optional
import uuid
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

class MarketPriceCreate(BaseModel):
    production_id: str
    market_name: str  # e.g. "Suva Municipal Market", "Nausori Market", "Lautoka Market"
    island: str
    grade: str = "A"
    price_per_kg_fjd: Decimal
    quantity_seen_kg: Optional[Decimal] = None
    observation_date: datetime
    source: str = "FARMER_REPORT"  # FARMER_REPORT, BUYER_REPORT, MINISTRY_DATA
    notes: Optional[str] = None

@router.get("/market-prices/{production_id}")
async def get_market_prices(
    production_id: str,
    island: str = None,
    market_name: str = None,
    days: int = 30,
    user: dict = Depends(get_current_user),
):
    """
    Returns crowdsourced market price observations for a production type.
    Useful for farmers to benchmark their selling price against current market rates.
    """
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"production_id": production_id, "days": days}
        pcat_sel, _ = await productions_category(db)
        q = f"""SELECT mp.*, p.production_name, {pcat_sel}
               FROM community.market_price_reports mp
               JOIN shared.productions p ON p.production_id = mp.production_id
               WHERE mp.production_id = :production_id
               AND mp.observation_date >= now() - interval '1 day' * :days
               AND mp.is_validated = true"""
        if island:
            q += " AND mp.island = :island"
            params["island"] = island
        if market_name:
            q += " AND mp.market_name ILIKE :market_name"
            params["market_name"] = f"%{market_name}%"
        result = await db.execute(text(q + " ORDER BY mp.observation_date DESC LIMIT 50"), params)
        rows = [dict(r) for r in result.mappings().all()]

        # Calculate price statistics
        if rows:
            prices = [float(r["price_per_kg_fjd"]) for r in rows]
            stats = {
                "min_price_fjd": round(min(prices), 2),
                "max_price_fjd": round(max(prices), 2),
                "avg_price_fjd": round(sum(prices) / len(prices), 2),
                "observation_count": len(rows),
            }
        else:
            stats = {"min_price_fjd": None, "max_price_fjd": None, "avg_price_fjd": None, "observation_count": 0}

        return {"data": rows, "stats": stats}

@router.post("/market-prices")
async def report_market_price(body: MarketPriceCreate, user: dict = Depends(get_current_user)):
    """
    Submit a market price observation. Crowdsourced data from farmers and buyers.
    Reports are validated by FOUNDER before becoming visible in the aggregate.
    """
    report_id = f"MPR-{uuid.uuid4().hex[:6].upper()}"
    async with get_rls_db(str(user["tenant_id"])) as db:
        await db.execute(text("""
            INSERT INTO community.market_price_reports
                (report_id, tenant_id, reporter_user_id, production_id, market_name, island,
                 grade, price_per_kg_fjd, quantity_seen_kg, observation_date, source,
                 notes, is_validated)
            VALUES
                (:report_id, :tenant_id, :reporter_user_id, :production_id, :market_name, :island,
                 :grade, :price_per_kg_fjd, :quantity_seen_kg, :observation_date, :source,
                 :notes, false)
        """), {
            "report_id": report_id,
            "tenant_id": str(user["tenant_id"]),
            "reporter_user_id": str(user["user_id"]),
            "production_id": body.production_id,
            "market_name": body.market_name,
            "island": body.island,
            "grade": body.grade,
            "price_per_kg_fjd": body.price_per_kg_fjd,
            "quantity_seen_kg": body.quantity_seen_kg,
            "observation_date": body.observation_date,
            "source": body.source,
            "notes": body.notes,
        })
    return {"data": {"report_id": report_id, "is_validated": False, "message": "Price report submitted. Will appear in aggregates after validation."}}

@router.get("/market-prices/{production_id}/trend")
async def get_price_trend(production_id: str, island: str = None, days: int = 90, user: dict = Depends(get_current_user)):
    """Weekly average price trend for a production over the last N days."""
    async with get_rls_db(str(user["tenant_id"])) as db:
        params = {"production_id": production_id, "days": days}
        q = """
            SELECT date_trunc('week', observation_date) AS week_start,
                   ROUND(AVG(price_per_kg_fjd)::numeric, 2) AS avg_price_fjd,
                   MIN(price_per_kg_fjd) AS min_price_fjd,
                   MAX(price_per_kg_fjd) AS max_price_fjd,
                   COUNT(*) AS reports
            FROM community.market_price_reports
            WHERE production_id = :production_id
              AND observation_date >= now() - interval '1 day' * :days
              AND is_validated = true
        """
        if island:
            q += " AND island = :island"
            params["island"] = island
        q += " GROUP BY week_start ORDER BY week_start DESC"
        result = await db.execute(text(q), params)
        return {"data": [dict(r) for r in result.mappings().all()]}


# ════════════════════════════════════════════════════════════════════════════
# Two-sided match → order: a buyer accepts a PRODUCE listing and an order is
# created in the SELLER's book, flagged is_marketplace_sale=true so the 2% fee
# accrues automatically when the seller logs payment (migration 177). Cross-
# tenant by design; tenant.users/tenants are permissive-RLS (migs 154/166) so the
# buyer-name read works without the seller's context.
# ════════════════════════════════════════════════════════════════════════════
class ListingOrder(BaseModel):
    quantity_kg: Optional[Decimal] = None


@router.post("/listings/{listing_id}/order")
async def order_from_listing(listing_id: str, body: ListingOrder, user: dict = Depends(get_current_user)):
    buyer_tid = str(user["tenant_id"])
    buyer_uid = str(user["user_id"])

    # 1) Resolve the listing + buyer identity (community + permissive reads).
    async with get_db_ctx() as db:
        L = (await db.execute(text("""
            SELECT listing_id, tenant_id, farm_id, production_id, listing_title,
                   quantity_available_kg, price_per_kg_fjd, grade, listing_status,
                   created_by, contact_whatsapp, island, COALESCE(category,'PRODUCE') AS category,
                   COALESCE(price_basis,'kg') AS price_basis
            FROM community.listings WHERE listing_id = :lid
        """), {"lid": listing_id})).mappings().first()
        if not L:
            raise HTTPException(status_code=404, detail="Listing not found")
        if L["category"] == "SERVICES":
            raise HTTPException(status_code=400, detail="Use Request service for service listings")
        if L["category"] not in ("PRODUCE", "INPUTS"):
            raise HTTPException(status_code=400, detail="This listing type can't be ordered here yet")
        if L["listing_status"] != "ACTIVE":
            raise HTTPException(status_code=409, detail="This listing is no longer available")
        if str(L["tenant_id"]) == buyer_tid:
            raise HTTPException(status_code=400, detail="That's your own listing")
        if L["price_per_kg_fjd"] is None:
            raise HTTPException(status_code=400, detail="This listing has no set price — contact the seller")
        price = Decimal(str(L["price_per_kg_fjd"]))
        basis = L["price_basis"] or "kg"
        avail = L["quantity_available_kg"]
        qty = Decimal(str(body.quantity_kg)) if body.quantity_kg is not None else (Decimal(str(avail)) if avail is not None else None)
        if qty is None or qty <= 0:
            raise HTTPException(status_code=400, detail="Enter a quantity to order")
        if avail is not None and qty > Decimal(str(avail)):
            raise HTTPException(status_code=400, detail=f"Only {avail} {basis} available on this listing")
        b = (await db.execute(text("""
            SELECT u.full_name, u.whatsapp_number, t.company_name
            FROM tenant.users u JOIN tenant.tenants t ON t.tenant_id = u.tenant_id
            WHERE u.user_id = cast(:bid AS uuid)
        """), {"bid": buyer_uid})).mappings().first()
        buyer_name = ((b and (b["company_name"] or b["full_name"])) or "Teivaka marketplace buyer")
        buyer_wa = b["whatsapp_number"] if b else None

    seller_tid = str(L["tenant_id"])
    total = (qty * price).quantize(Decimal("0.01"))
    order_id = f"ORD-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"

    # 2) Create customer (if needed) + order + line item in the SELLER's tenant.
    async with get_rls_db(seller_tid) as db:
        # Prefer the stable buyer_user_id link (migration 179); fall back to name
        # match if the column isn't present yet (migration-tolerant).
        has_buyer_col = bool((await db.execute(text(
            "SELECT 1 FROM information_schema.columns WHERE table_schema='tenant' "
            "AND table_name='customers' AND column_name='buyer_user_id'"))).scalar())
        if has_buyer_col:
            cust = (await db.execute(text(
                "SELECT customer_id FROM tenant.customers WHERE tenant_id = cast(:t AS uuid) "
                "AND buyer_user_id = cast(:bid AS uuid) LIMIT 1"),
                {"t": seller_tid, "bid": buyer_uid})).scalar()
        else:
            cust = (await db.execute(text(
                "SELECT customer_id FROM tenant.customers WHERE tenant_id = cast(:t AS uuid) "
                "AND customer_name = :n AND customer_type = 'DIRECT' LIMIT 1"),
                {"t": seller_tid, "n": buyer_name})).scalar()
        if not cust:
            cust = f"CST-{uuid.uuid4().hex[:6].upper()}"
            if has_buyer_col:
                await db.execute(text("""
                    INSERT INTO tenant.customers
                        (customer_id, tenant_id, customer_name, customer_type, whatsapp_number, buyer_user_id, notes)
                    VALUES (:c, cast(:t AS uuid), :n, 'DIRECT', :wa, cast(:bid AS uuid), :notes)
                """), {"c": cust, "t": seller_tid, "n": buyer_name, "wa": buyer_wa,
                       "bid": buyer_uid, "notes": "Teivaka marketplace buyer"})
            else:
                await db.execute(text("""
                    INSERT INTO tenant.customers
                        (customer_id, tenant_id, customer_name, customer_type, whatsapp_number, notes)
                    VALUES (:c, cast(:t AS uuid), :n, 'DIRECT', :wa, :notes)
                """), {"c": cust, "t": seller_tid, "n": buyer_name, "wa": buyer_wa,
                       "notes": f"Teivaka marketplace buyer (user {buyer_uid})"})
        # Carry the listing's category onto the order so the PAID path accrues the
        # right fee rate (PRODUCE 2% vs INPUTS 3%). Column-guarded for migration 180.
        fee_cat = L["category"] if L["category"] in ("PRODUCE", "INPUTS") else "PRODUCE"
        has_mc = bool((await db.execute(text(
            "SELECT 1 FROM information_schema.columns WHERE table_schema='tenant' "
            "AND table_name='orders' AND column_name='marketplace_category'"))).scalar())
        mc_col = ", marketplace_category" if has_mc else ""
        mc_val = ", :mcat" if has_mc else ""
        oparams = {"oid": order_id, "t": seller_tid, "farm": L["farm_id"], "cust": cust,
                   "total": total, "notes": f"Marketplace order from listing {listing_id}", "bid": buyer_uid}
        if has_mc:
            oparams["mcat"] = fee_cat
        await db.execute(text(f"""
            INSERT INTO tenant.orders
                (order_id, tenant_id, farm_id, customer_id, order_type, order_date,
                 total_amount_fjd, net_amount_fjd, order_status, is_marketplace_sale, notes, created_by{mc_col})
            VALUES
                (:oid, cast(:t AS uuid), :farm, :cust, 'SALES', CURRENT_DATE,
                 :total, :total, 'CONFIRMED', true, :notes, cast(:bid AS uuid){mc_val})
        """), oparams)
        line_id = f"OLI-{uuid.uuid4().hex[:6].upper()}"
        await db.execute(text("""
            INSERT INTO tenant.order_line_items
                (line_id, order_id, tenant_id, production_id, quantity_kg, unit_price_fjd, line_total_fjd, grade)
            VALUES (:l, :o, cast(:t AS uuid), :pid, :q, :p, :lt, :g)
        """), {"l": line_id, "o": order_id, "t": seller_tid, "pid": L["production_id"],
               "q": qty, "p": price, "lt": total, "g": L["grade"] or "A"})
        try:
            await db.execute(text(
                "INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body) "
                "VALUES (cast(:u AS uuid), cast(:a AS uuid), 'MARKETPLACE_ORDER', :b)"),
                {"u": str(L["created_by"]), "a": buyer_uid,
                 "b": f"New marketplace order: {buyer_name} ordered {qty} {basis} of {L['listing_title']} (FJD {total})."})
        except Exception as e:  # noqa: BLE001
            logger.warning("marketplace order notify failed: %s", e)

    # 3) Decrement listing quantity / mark SOLD (community).
    async with get_db_ctx() as db:
        if avail is not None:
            remaining = Decimal(str(avail)) - qty
            if remaining <= 0:
                await db.execute(text(
                    "UPDATE community.listings SET quantity_available_kg=0, listing_status='SOLD', "
                    "sold_at=now(), updated_at=now() WHERE listing_id=:l"), {"l": listing_id})
            else:
                await db.execute(text(
                    "UPDATE community.listings SET quantity_available_kg=:q, updated_at=now() "
                    "WHERE listing_id=:l"), {"q": remaining, "l": listing_id})
        else:
            await db.execute(text(
                "UPDATE community.listings SET listing_status='SOLD', sold_at=now(), updated_at=now() "
                "WHERE listing_id=:l"), {"l": listing_id})
        # Cross-tenant order ledger (M2) so the BUYER can see + track this order.
        # Produce/Inputs auto-confirm today → ledger status ACCEPTED. Best-effort.
        try:
            await db.execute(text("""
                INSERT INTO community.marketplace_orders
                    (order_id, listing_id, buyer_user_id, seller_user_id, buyer_name,
                     listing_title, category, quantity, unit, total_fjd, status)
                VALUES (:oid, :lid, cast(:bid AS uuid), cast(:sid AS uuid), :bn,
                        :title, :cat, :q, :u, :tot, 'ACCEPTED')
                ON CONFLICT (order_id) DO NOTHING
            """), {"oid": order_id, "lid": listing_id, "bid": buyer_uid, "sid": str(L["created_by"]),
                   "bn": buyer_name, "title": L["listing_title"], "cat": L["category"],
                   "q": qty, "u": basis, "tot": total})
        except Exception as e:  # noqa: BLE001 — ledger is additive; never break the order
            logger.warning("marketplace ledger write failed: %s", e)
        # MP1 — auto-ingest this real produce sale into the Market Prices board as a
        # TRANSACTION observation (is_actual_sale=TRUE → weights the market price).
        # PRODUCE + per-kg + a real crop only; best-effort so it never breaks the sale.
        if L["category"] == "PRODUCE" and basis == "kg" and L["production_id"]:
            try:
                await db.execute(text("""
                    INSERT INTO community.price_records
                        (tenant_id, farm_id, created_by, production_id, grade, island,
                         quantity_kg, price_per_kg_fjd, buyer_type, source, is_actual_sale,
                         observed_at, country, notes)
                    VALUES
                        (cast(:t AS uuid), :farm, cast(:cb AS uuid), :pid, :grade, :island,
                         :qty, :price, 'MARKETPLACE', 'TRANSACTION', TRUE,
                         now(), (SELECT country FROM tenant.tenants WHERE tenant_id = cast(:t AS uuid)),
                         :notes)
                """), {"t": seller_tid, "farm": L["farm_id"], "cb": str(L["created_by"]),
                       "pid": L["production_id"], "grade": L["grade"] or "A", "island": L["island"],
                       "qty": qty, "price": price,
                       "notes": f"Auto from marketplace order {order_id}"})
            except Exception as e:  # noqa: BLE001 — price ingest is additive; never break the sale
                logger.warning("market price ingest failed for %s: %s", order_id, e)
        await db.commit()

    # 4) WhatsApp the seller (best-effort; mock-logs without creds).
    if L["contact_whatsapp"]:
        try:
            from app.services.notification_service import whatsapp_service
            await whatsapp_service.send_alert(
                L["contact_whatsapp"],
                f"New Teivaka marketplace order: {qty} {basis} {L['listing_title']} (FJD {total}) from {buyer_name}. Open the app to confirm.",
                severity="INFO")
        except Exception as e:  # noqa: BLE001
            logger.warning("marketplace order whatsapp failed: %s", e)

    return {"data": {"order_id": order_id, "total_fjd": str(total), "quantity": str(qty),
                     "price_basis": basis, "status": "CONFIRMED", "is_marketplace_sale": True}}


# ════════════════════════════════════════════════════════════════════════════
# SERVICES listing → request: bridges a marketplace SERVICES listing into the
# service-jobs flow as a job pre-CLAIMED by the lister (the provider). The buyer
# is the requester; when they later confirm completion + price, the existing
# service-jobs path accrues the 5% SERVICES fee against the provider. Keeps
# services on their dedicated mechanism instead of the crop/kg-shaped orders.
# ════════════════════════════════════════════════════════════════════════════
class ServiceRequest(BaseModel):
    notes: Optional[str] = None


@router.post("/listings/{listing_id}/request-service")
async def request_service_from_listing(listing_id: str, body: ServiceRequest, user: dict = Depends(get_current_user)):
    buyer_tid = str(user["tenant_id"])
    buyer_uid = str(user["user_id"])
    async with get_db_ctx() as db:
        L = (await db.execute(text("""
            SELECT listing_id, tenant_id, created_by, listing_title, listing_status,
                   contact_whatsapp, COALESCE(category,'PRODUCE') AS category
            FROM community.listings WHERE listing_id = :lid
        """), {"lid": listing_id})).mappings().first()
        if not L:
            raise HTTPException(status_code=404, detail="Listing not found")
        if L["category"] != "SERVICES":
            raise HTTPException(status_code=400, detail="Only service listings can be requested here")
        if L["listing_status"] != "ACTIVE":
            raise HTTPException(status_code=409, detail="This listing is no longer available")
        if str(L["tenant_id"]) == buyer_tid:
            raise HTTPException(status_code=400, detail="That's your own listing")
        job_id = f"JOB-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:5].upper()}"
        await db.execute(text("""
            INSERT INTO community.service_jobs
                (job_id, service_type, status, requester_tenant_id, requester_user_id,
                 title, notes, claimed_by_user_id, claimed_by_tenant_id, claimed_at)
            VALUES
                (:j, 'OTHER', 'CLAIMED', cast(:rt AS uuid), cast(:ru AS uuid),
                 :title, :notes, cast(:pu AS uuid), cast(:pt AS uuid), now())
        """), {"j": job_id, "rt": buyer_tid, "ru": buyer_uid,
               "title": L["listing_title"], "notes": body.notes,
               "pu": str(L["created_by"]), "pt": str(L["tenant_id"])})
        try:
            await db.execute(text(
                "INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body) "
                "VALUES (cast(:u AS uuid), cast(:a AS uuid), 'SERVICE_REQUESTED', :b)"),
                {"u": str(L["created_by"]), "a": buyer_uid,
                 "b": f"New service request for: {L['listing_title']}. Open the Service hub to coordinate."})
        except Exception as e:  # noqa: BLE001
            logger.warning("service request notify failed: %s", e)
        await db.commit()

    if L["contact_whatsapp"]:
        try:
            from app.services.notification_service import whatsapp_service
            await whatsapp_service.send_alert(
                L["contact_whatsapp"],
                f"New Teivaka service request for: {L['listing_title']}. Open the app → Service hub to coordinate.",
                severity="INFO")
        except Exception as e:  # noqa: BLE001
            logger.warning("service request whatsapp failed: %s", e)

    return {"data": {"job_id": job_id, "status": "CLAIMED"}}


# ════════════════════════════════════════════════════════════════════════════
# M2 — order/enquiry loop: cross-tenant ledger so the BUYER can see + track, and
# every category has a real on-platform action + a shared status.
# ════════════════════════════════════════════════════════════════════════════
class EnquireBody(BaseModel):
    note: Optional[str] = None
    quantity: Optional[Decimal] = None


@router.post("/listings/{listing_id}/enquire")
async def enquire_listing(listing_id: str, body: EnquireBody, user: dict = Depends(get_current_user)):
    """Universal intent for the categories without a transact path (Livestock /
    Tools / Wanted) — records a REQUESTED order in the ledger + notifies the seller.
    No stock hold. Produce/Inputs use /order; Services use /request-service."""
    buyer_uid = str(user["user_id"]); buyer_tid = str(user["tenant_id"])
    async with get_db_ctx() as db:
        L = (await db.execute(text("""
            SELECT listing_id, tenant_id, listing_title, created_by, listing_status,
                   COALESCE(category,'PRODUCE') AS category, price_basis
            FROM community.listings WHERE listing_id = :lid
        """), {"lid": listing_id})).mappings().first()
        if not L:
            raise HTTPException(status_code=404, detail="Listing not found")
        if L["category"] not in ("LIVESTOCK", "TOOLS", "WANTED"):
            raise HTTPException(status_code=400, detail="This listing type isn't enquired here")
        if L["listing_status"] != "ACTIVE":
            raise HTTPException(status_code=409, detail="This listing is no longer available")
        if str(L["tenant_id"]) == buyer_tid:
            raise HTTPException(status_code=400, detail="That's your own listing")
        bn = (await db.execute(text(
            "SELECT COALESCE(t.company_name, u.full_name) FROM tenant.users u "
            "JOIN tenant.tenants t ON t.tenant_id = u.tenant_id WHERE u.user_id = cast(:b AS uuid)"),
            {"b": buyer_uid})).scalar() or "Teivaka buyer"
        oid = f"ENQ-{datetime.now().strftime('%Y%m%d')}-{uuid.uuid4().hex[:4].upper()}"
        await db.execute(text("""
            INSERT INTO community.marketplace_orders
                (order_id, listing_id, buyer_user_id, seller_user_id, buyer_name,
                 listing_title, category, quantity, unit, status)
            VALUES (:oid, :lid, cast(:b AS uuid), cast(:s AS uuid), :bn,
                    :title, :cat, :q, :u, 'REQUESTED')
        """), {"oid": oid, "lid": listing_id, "b": buyer_uid, "s": str(L["created_by"]), "bn": bn,
               "title": L["listing_title"], "cat": L["category"], "q": body.quantity, "u": L["price_basis"]})
        try:
            await db.execute(text(
                "INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body) "
                "VALUES (cast(:u AS uuid), cast(:a AS uuid), 'MARKETPLACE_ORDER', :b)"),
                {"u": str(L["created_by"]), "a": buyer_uid,
                 "b": f"{bn} enquired about {L['listing_title']}. Open Marketplace → My orders to respond."})
        except Exception as e:  # noqa: BLE001
            logger.warning("enquire notify failed: %s", e)
        await db.commit()
    return {"data": {"order_id": oid, "status": "REQUESTED"}}


class OrderStatus(BaseModel):
    action: str  # ACCEPT | DONE | CANCEL


@router.post("/orders/{order_id}/status")
async def set_order_status(order_id: str, body: OrderStatus, user: dict = Depends(get_current_user)):
    """Move an order through the loop. Seller: ACCEPT / DONE; buyer: DONE (received)
    / CANCEL. Notifies the counterparty."""
    uid = str(user["user_id"]); act = (body.action or "").upper()
    async with get_db_ctx() as db:
        o = (await db.execute(text(
            "SELECT buyer_user_id, seller_user_id, status, listing_title FROM community.marketplace_orders WHERE order_id = :o"),
            {"o": order_id})).mappings().first()
        if not o:
            raise HTTPException(status_code=404, detail="Order not found")
        is_seller = str(o["seller_user_id"]) == uid
        is_buyer = str(o["buyer_user_id"]) == uid
        if not (is_seller or is_buyer):
            raise HTTPException(status_code=403, detail="Not your order")
        if act == "ACCEPT" and is_seller:
            new = "ACCEPTED"
        elif act == "DONE":
            new = "DONE"
        elif act == "CANCEL":
            new = "CANCELLED"
        else:
            raise HTTPException(status_code=422, detail="Invalid action")
        await db.execute(text("UPDATE community.marketplace_orders SET status=:s, updated_at=now() WHERE order_id=:o"),
                         {"s": new, "o": order_id})
        other = str(o["buyer_user_id"]) if is_seller else str(o["seller_user_id"])
        try:
            await db.execute(text(
                "INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body) "
                "VALUES (cast(:u AS uuid), cast(:a AS uuid), 'MARKETPLACE_ORDER', :b)"),
                {"u": other, "a": uid, "b": f"Order for {o['listing_title']} is now {new.lower()}."})
        except Exception as e:  # noqa: BLE001
            logger.warning("order status notify failed: %s", e)
        await db.commit()
    return {"data": {"order_id": order_id, "status": new}}


@router.get("/my-orders")
async def my_orders(user: dict = Depends(get_current_user)):
    """The caller's marketplace orders as buyer (buying) and seller (selling)."""
    uid = str(user["user_id"])
    async with get_db_ctx() as db:
        rows = (await db.execute(text("""
            SELECT o.order_id, o.listing_id, o.buyer_user_id, o.seller_user_id, o.buyer_name,
                   o.listing_title, o.category, o.quantity, o.unit, o.total_fjd, o.status, o.created_at,
                   s.full_name AS seller_name,
                   EXISTS (SELECT 1 FROM community.marketplace_reviews r WHERE r.order_id = o.order_id) AS reviewed
            FROM community.marketplace_orders o
            LEFT JOIN tenant.users s ON s.user_id = o.seller_user_id
            WHERE o.buyer_user_id = cast(:u AS uuid) OR o.seller_user_id = cast(:u AS uuid)
            ORDER BY o.created_at DESC LIMIT 100
        """), {"u": uid})).mappings().all()
    buying, selling = [], []
    for r in rows:
        mine_as_buyer = str(r["buyer_user_id"]) == uid
        item = {
            "order_id": r["order_id"], "listing_id": r["listing_id"], "listing_title": r["listing_title"],
            "category": r["category"], "quantity": (str(r["quantity"]) if r["quantity"] is not None else None),
            "unit": r["unit"], "total_fjd": (str(r["total_fjd"]) if r["total_fjd"] is not None else None),
            "status": r["status"], "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "buyer_name": r["buyer_name"], "seller_name": r["seller_name"],
            "counterparty_user_id": str(r["seller_user_id"]) if mine_as_buyer else str(r["buyer_user_id"]),
            "reviewed": bool(r["reviewed"]),
        }
        (buying if mine_as_buyer else selling).append(item)
    return {"data": {"buying": buying, "selling": selling}}


# ════════════════════════════════════════════════════════════════════════════
# M3 — reviews & reputation: buyer-of-a-DONE-order only, one per order (unbuyable,
# non-anonymous). Aggregates ride the community.user_trust cache so ★ shows on
# listings/directory/profile via the join already wired.
# ════════════════════════════════════════════════════════════════════════════
class ReviewBody(BaseModel):
    rating: int
    comment: Optional[str] = None


@router.post("/orders/{order_id}/review")
async def review_order(order_id: str, body: ReviewBody, user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    if not (1 <= int(body.rating) <= 5):
        raise HTTPException(status_code=422, detail="Rating must be 1–5")
    async with get_db_ctx() as db:
        o = (await db.execute(text(
            "SELECT buyer_user_id, seller_user_id, status, listing_id FROM community.marketplace_orders WHERE order_id = :o"),
            {"o": order_id})).mappings().first()
        if not o:
            raise HTTPException(status_code=404, detail="Order not found")
        if str(o["buyer_user_id"]) != uid:
            raise HTTPException(status_code=403, detail="Only the buyer can review this order")
        if o["status"] != "DONE":
            raise HTTPException(status_code=400, detail="You can review once the order is done")
        if (await db.execute(text("SELECT 1 FROM community.marketplace_reviews WHERE order_id = :o"), {"o": order_id})).first():
            raise HTTPException(status_code=409, detail="You've already reviewed this order")
        await db.execute(text("""
            INSERT INTO community.marketplace_reviews (order_id, listing_id, seller_user_id, reviewer_user_id, rating, comment)
            VALUES (:o, :lid, cast(:s AS uuid), cast(:r AS uuid), :rat, :c)
        """), {"o": order_id, "lid": o["listing_id"], "s": str(o["seller_user_id"]), "r": uid,
               "rat": int(body.rating), "c": (body.comment or None)})
        # recount-on-write into the trust cache (drift-proof; beat also maintains it)
        agg = (await db.execute(text(
            "SELECT count(*) AS n, avg(rating) AS a FROM community.marketplace_reviews WHERE seller_user_id = cast(:s AS uuid)"),
            {"s": str(o["seller_user_id"])})).mappings().first()
        await db.execute(text("""
            INSERT INTO community.user_trust (user_id, review_count, avg_rating)
            VALUES (cast(:s AS uuid), :n, :a)
            ON CONFLICT (user_id) DO UPDATE SET review_count = EXCLUDED.review_count, avg_rating = EXCLUDED.avg_rating
        """), {"s": str(o["seller_user_id"]), "n": int(agg["n"]), "a": agg["a"]})
        try:
            await db.execute(text(
                "INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body) "
                "VALUES (cast(:u AS uuid), cast(:a AS uuid), 'MARKETPLACE_ORDER', :b)"),
                {"u": str(o["seller_user_id"]), "a": uid, "b": f"You received a {int(body.rating)}★ review on a sale."})
        except Exception as e:  # noqa: BLE001
            logger.warning("review notify failed: %s", e)
        await db.commit()
    return {"data": {"order_id": order_id, "rating": int(body.rating)}}


@router.get("/sellers/{seller_id}/reviews")
async def seller_reviews(seller_id: str, user: dict = Depends(get_current_user)):
    async with get_db_ctx() as db:
        rows = (await db.execute(text("""
            SELECT r.rating, r.comment, r.created_at, u.full_name AS reviewer_name
            FROM community.marketplace_reviews r
            LEFT JOIN tenant.users u ON u.user_id = r.reviewer_user_id
            WHERE r.seller_user_id = cast(:s AS uuid)
            ORDER BY r.created_at DESC LIMIT 20
        """), {"s": seller_id})).mappings().all()
    return {"data": [{"rating": r["rating"], "comment": r["comment"], "reviewer_name": r["reviewer_name"],
                      "created_at": r["created_at"].isoformat() if r["created_at"] else None} for r in rows]}


# ════════════════════════════════════════════════════════════════════════════
# M4 — dispute from an order: either party flags a problem → order goes DISPUTED
# and it lands in the unified moderation queue (feed_flags) so a moderator can act
# (incl. suspend, T&S S3). One "Report a problem" button; no separate dispute UI.
# ════════════════════════════════════════════════════════════════════════════
class DisputeBody(BaseModel):
    reason: str


@router.post("/orders/{order_id}/dispute")
async def dispute_order(order_id: str, body: DisputeBody, user: dict = Depends(get_current_user)):
    uid = str(user["user_id"])
    if not (body.reason and body.reason.strip()):
        raise HTTPException(status_code=422, detail="A reason is required")
    async with get_db_ctx() as db:
        o = (await db.execute(text(
            "SELECT buyer_user_id, seller_user_id, status, listing_title FROM community.marketplace_orders WHERE order_id = :o"),
            {"o": order_id})).mappings().first()
        if not o:
            raise HTTPException(status_code=404, detail="Order not found")
        is_seller = str(o["seller_user_id"]) == uid
        is_buyer = str(o["buyer_user_id"]) == uid
        if not (is_seller or is_buyer):
            raise HTTPException(status_code=403, detail="Not your order")
        if o["status"] == "CANCELLED":
            raise HTTPException(status_code=400, detail="This order is cancelled")
        counterparty = str(o["seller_user_id"]) if is_buyer else str(o["buyer_user_id"])
        await db.execute(text("UPDATE community.marketplace_orders SET status='DISPUTED', updated_at=now() WHERE order_id=:o"),
                         {"o": order_id})
        # file into the unified moderation queue (reuses target_type/target_id — M4)
        await db.execute(text("""
            INSERT INTO community.feed_flags
                (reporter_user_id, reason, target_type, target_id, reported_user_id, category)
            VALUES (cast(:r AS uuid), :reason, 'ORDER', :oid, cast(:cp AS uuid), 'DISPUTE')
        """), {"r": uid, "reason": f"Order dispute: {body.reason.strip()}", "oid": order_id, "cp": counterparty})
        try:
            await db.execute(text(
                "INSERT INTO community.feed_notifications (user_id, actor_user_id, type, body) "
                "VALUES (cast(:u AS uuid), cast(:a AS uuid), 'MARKETPLACE_ORDER', :b)"),
                {"u": counterparty, "a": uid, "b": f"A problem was reported on the order for {o['listing_title']}. A moderator will review it."})
        except Exception as e:  # noqa: BLE001
            logger.warning("dispute notify failed: %s", e)
        await db.commit()
    return {"data": {"order_id": order_id, "status": "DISPUTED"}}
