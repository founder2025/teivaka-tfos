# FILE: app/routers/webhooks.py
"""
Webhook endpoints for Meta WhatsApp Cloud API and Stripe.

WhatsApp webhook:
  GET  /webhooks/whatsapp  — Meta verification challenge (one-time setup)
  POST /webhooks/whatsapp  — Incoming messages from farmers → routed to TIS

Stripe webhook:
  POST /webhooks/stripe    — Subscription lifecycle events

Meta webhook verification docs:
  https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/getting-started
"""
import hashlib
import hmac
import logging

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy import text

from app.config import settings
from app.db.session import get_db

router = APIRouter()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# WhatsApp — Meta Cloud API webhook
# ---------------------------------------------------------------------------

@router.get("/whatsapp")
async def whatsapp_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
):
    """
    Meta webhook verification challenge.
    Called once when you register the webhook URL in Meta Business Manager.

    Set META_WHATSAPP_VERIFY_TOKEN in .env to match what you enter in Meta dashboard.
    """
    if hub_mode == "subscribe" and hub_verify_token == settings.meta_whatsapp_verify_token:
        logger.info("Meta WhatsApp webhook verified successfully")
        return int(hub_challenge)
    raise HTTPException(status_code=403, detail="Webhook verification failed")


@router.post("/whatsapp")
async def whatsapp_webhook(request: Request):
    """
    Receives incoming WhatsApp messages from Meta Cloud API.

    Verifies X-Hub-Signature-256 header using META_WHATSAPP_TOKEN.
    Routes message body to TIS → sends AI response back to farmer.
    """
    body = await request.body()

    # Verify Meta signature (X-Hub-Signature-256: sha256=<hash>)
    if settings.meta_whatsapp_token:
        signature_header = request.headers.get("X-Hub-Signature-256", "")
        expected_sig = "sha256=" + hmac.new(
            settings.meta_whatsapp_token.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(signature_header, expected_sig):
            raise HTTPException(status_code=403, detail="Invalid Meta webhook signature")

    try:
        payload = await request.json()
    except Exception:
        return {"status": "ignored"}

    # Meta sends a nested structure: entry[].changes[].value.messages[]
    entry = payload.get("entry", [])
    if not entry:
        return {"status": "no_entry"}

    changes = entry[0].get("changes", [])
    if not changes:
        return {"status": "no_changes"}

    value = changes[0].get("value", {})
    messages = value.get("messages", [])
    if not messages:
        # Could be a status update (delivered/read) — ignore
        return {"status": "no_messages"}

    msg = messages[0]
    if msg.get("type") != "text":
        # Voice messages handled separately via /api/v1/voice
        logger.info(f"Non-text WhatsApp message type ignored: {msg.get('type')}")
        return {"status": "ignored_non_text"}

    from_number = msg.get("from", "")          # E.164 without +, e.g. "6799000001"
    message_body = msg.get("text", {}).get("body", "").strip()

    if not message_body:
        return {"status": "empty_message"}

    # Normalize to E.164 with +
    if not from_number.startswith("+"):
        from_number = f"+{from_number}"

    # Look up farmer by WhatsApp number
    async with get_db() as db:
        result = await db.execute(
            text("""
                SELECT u.user_id, u.tenant_id, u.full_name, u.role,
                       t.subscription_tier
                FROM tenant.users u
                JOIN tenant.tenants t ON t.tenant_id = u.tenant_id
                WHERE u.phone_whatsapp = :number AND u.is_active = true
                LIMIT 1
            """),
            {"number": from_number}
        )
        user_row = result.mappings().first()

    if not user_row:
        logger.warning(f"Unknown WhatsApp sender: {from_number}")
        # Do not reply to unknown numbers — prevents WhatsApp spam flags
        return {"status": "unknown_sender"}

    import redis.asyncio as aioredis
    from app.db.session import get_rls_db
    from app.services.notification_service import whatsapp_service
    from app.services.tis_service import execute_tis_query

    r = aioredis.from_url(settings.redis_url)
    user = dict(user_row)
    try:
        async with get_rls_db(str(user["tenant_id"])) as db:
            tis_result = await execute_tis_query(
                session=db,
                redis_client=r,
                user_message=message_body,
                farm_id=None,
                conversation_history=[],
                user=user,
                tenant_id=str(user["tenant_id"]),
            )
        response_text = tis_result.get("response", "Sorry, I could not process that.")
        await whatsapp_service.send_alert(from_number, response_text, "INFO")
        return {"status": "replied"}
    except Exception as e:
        logger.error(f"WhatsApp TIS routing error: {e}")
        return {"status": "error"}
    finally:
        await r.aclose()


# ---------------------------------------------------------------------------
# Stripe webhook
# ---------------------------------------------------------------------------

@router.post("/stripe")
async def stripe_webhook(request: Request):
    """Stripe webhook for subscription lifecycle events."""
    body = await request.body()
    sig_header = request.headers.get("stripe-signature")

    if settings.stripe_webhook_secret and sig_header:
        import stripe
        stripe.api_key = settings.stripe_secret_key
        try:
            event = stripe.Webhook.construct_event(
                body, sig_header, settings.stripe_webhook_secret
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

        event_type = event["type"]
        logger.info(f"Stripe event: {event_type}")

        if event_type == "customer.subscription.updated":
            subscription = event["data"]["object"]
            tenant_id = subscription.get("metadata", {}).get("tenant_id")
            if tenant_id:
                price_id = (
                    subscription["items"]["data"][0]["price"]["id"]
                    if subscription.get("items")
                    else None
                )
                tier_map = {
                    settings.stripe_price_id_basic:   "BASIC",
                    settings.stripe_price_id_premium: "PREMIUM",
                    settings.stripe_price_id_custom:  "CUSTOM",
                }
                new_tier = tier_map.get(price_id)
                if new_tier:
                    async with get_db() as db:
                        await db.execute(
                            text("""
                                UPDATE tenant.tenants
                                SET subscription_tier = :tier,
                                    subscription_status = 'ACTIVE',
                                    updated_at = now()
                                WHERE tenant_id = :tenant_id
                            """),
                            {"tier": new_tier, "tenant_id": tenant_id},
                        )
                        await db.commit()
                    logger.info(f"Tenant {tenant_id} → {new_tier}")

        elif event_type == "customer.subscription.deleted":
            subscription = event["data"]["object"]
            tenant_id = subscription.get("metadata", {}).get("tenant_id")
            if tenant_id:
                async with get_db() as db:
                    await db.execute(
                        text("""
                            UPDATE tenant.tenants
                            SET subscription_tier = 'FREE',
                                subscription_status = 'CANCELLED',
                                updated_at = now()
                            WHERE tenant_id = :tenant_id
                        """),
                        {"tenant_id": tenant_id},
                    )
                    await db.commit()
                logger.info(f"Tenant {tenant_id} → FREE (cancelled)")

        elif event_type == "invoice.payment_failed":
            invoice = event["data"]["object"]
            tenant_id = (
                invoice.get("subscription_details", {})
                .get("metadata", {})
                .get("tenant_id")
            )
            if tenant_id:
                logger.warning(f"Payment failed for tenant {tenant_id}")

        elif event_type == "invoice.payment_succeeded":
            logger.info(f"Payment succeeded: {event['data']['object'].get('id')}")

    return {"status": "received"}
