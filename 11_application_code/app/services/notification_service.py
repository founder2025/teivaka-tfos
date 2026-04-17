# FILE: app/services/notification_service.py
"""
WhatsApp notification service using Meta Cloud API directly.
No Twilio — messages sent via graph.facebook.com using your local Fiji number.

Setup:
  1. developers.facebook.com → create app → add WhatsApp product
  2. Add your Fiji number (Vodafone/Digicel) as the business number
  3. Copy Phone Number ID → META_PHONE_NUMBER_ID in .env
  4. Generate permanent access token → META_WHATSAPP_TOKEN in .env
  5. For dev/testing without Meta approval: set META_WHATSAPP_TOKEN="" and
     messages will be logged to console (mock mode).

Meta Cloud API docs:
  https://developers.facebook.com/docs/whatsapp/cloud-api/messages
"""
import logging
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

META_API_VERSION = "v20.0"
META_MESSAGES_URL = "https://graph.facebook.com/{version}/{phone_number_id}/messages"

SEVERITY_PREFIX = {
    "CRITICAL": "[CRITICAL] 🔴",
    "HIGH":     "[HIGH] 🟠",
    "MEDIUM":   "[MEDIUM] 🟡",
    "LOW":      "[LOW] 🟢",
    "INFO":     "[INFO] ℹ️",
}


class WhatsAppService:
    """
    Sends WhatsApp messages via Meta Cloud API.

    Falls back to mock (console log) when META_WHATSAPP_TOKEN or
    META_PHONE_NUMBER_ID are not configured — safe for local development.
    """

    def __init__(self):
        self.enabled = bool(
            settings.meta_whatsapp_token and settings.meta_phone_number_id
        )
        if not self.enabled:
            logger.warning(
                "Meta WhatsApp not configured — notifications will be logged only. "
                "Set META_WHATSAPP_TOKEN and META_PHONE_NUMBER_ID in .env to enable."
            )

    def _messages_url(self) -> str:
        return META_MESSAGES_URL.format(
            version=META_API_VERSION,
            phone_number_id=settings.meta_phone_number_id,
        )

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {settings.meta_whatsapp_token}",
            "Content-Type": "application/json",
        }

    async def send_alert(
        self,
        to_number: str,
        message: str,
        severity: str = "INFO",
    ) -> dict:
        """
        Sends a WhatsApp text message to a phone number.

        Args:
            to_number: E.164 format, e.g. "+6799000001"
            message:   Alert body text
            severity:  CRITICAL / HIGH / MEDIUM / LOW / INFO

        Returns:
            {"status": "sent", "message_id": "..."}  on success
            {"status": "mock_sent"}                   when not configured
            {"status": "failed", "error": "..."}      on API error
        """
        prefix = SEVERITY_PREFIX.get(severity, f"[{severity}]")
        full_message = f"{prefix} *Teivaka Agri-TOS*\n\n{message}"

        if not self.enabled:
            logger.info(
                f"[MOCK WhatsApp] To: {to_number} | {severity} | {message[:80]}"
            )
            return {"status": "mock_sent"}

        # Strip non-digits for validation, then restore E.164
        clean = to_number.replace("+", "").replace(" ", "").replace("-", "")
        recipient = f"+{clean}"

        payload = {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": recipient,
            "type": "text",
            "text": {
                "preview_url": False,
                "body": full_message,
            },
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    self._messages_url(),
                    headers=self._headers(),
                    json=payload,
                )
            data = response.json()

            if response.status_code == 200:
                message_id = data.get("messages", [{}])[0].get("id", "unknown")
                logger.info(f"WhatsApp sent to {recipient} | id={message_id}")
                return {"status": "sent", "message_id": message_id}
            else:
                error = data.get("error", {}).get("message", str(data))
                logger.error(f"Meta API error {response.status_code}: {error}")
                return {"status": "failed", "error": error}

        except httpx.TimeoutException:
            logger.error(f"Meta WhatsApp timeout sending to {recipient}")
            return {"status": "failed", "error": "timeout"}
        except Exception as e:
            logger.error(f"WhatsApp send error: {e}")
            return {"status": "failed", "error": str(e)}

    async def send_template(
        self,
        to_number: str,
        template_name: str,
        language_code: str = "en",
        components: list | None = None,
    ) -> dict:
        """
        Sends a pre-approved WhatsApp Business template message.
        Required for outbound messages outside the 24-hour session window.

        Args:
            template_name: Approved template name in Meta Business Manager
            components:    List of header/body/button component dicts
        """
        if not self.enabled:
            logger.info(f"[MOCK Template] To: {to_number} | template={template_name}")
            return {"status": "mock_sent"}

        clean = to_number.replace("+", "").replace(" ", "").replace("-", "")
        recipient = f"+{clean}"

        payload = {
            "messaging_product": "whatsapp",
            "to": recipient,
            "type": "template",
            "template": {
                "name": template_name,
                "language": {"code": language_code},
            },
        }
        if components:
            payload["template"]["components"] = components

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    self._messages_url(),
                    headers=self._headers(),
                    json=payload,
                )
            data = response.json()
            if response.status_code == 200:
                message_id = data.get("messages", [{}])[0].get("id", "unknown")
                return {"status": "sent", "message_id": message_id}
            else:
                error = data.get("error", {}).get("message", str(data))
                return {"status": "failed", "error": error}
        except Exception as e:
            return {"status": "failed", "error": str(e)}


# Singleton — imported by workers and routers
whatsapp_service = WhatsAppService()
