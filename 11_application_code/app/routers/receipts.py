"""AI receipt / invoice analysis — Phase 1 (vision DRAFT only, human-in-the-loop).

Reads a photo of a farm receipt/invoice with a vision model (OpenAI, Option A) and returns
a structured DRAFT — vendor, date, total, direction (purchase=EXPENSE / sale=INCOME),
suggested category, line items, and a confidence. It NEVER commits anything: the farmer
reviews/edits/approves the draft, and the actual record is written through the existing
/cash-ledger create (which hashes the receipt photo into the CASH_LOGGED audit row).

Safety (money + Inviolables): extract ONLY what's visibly printed — never invent a number;
low confidence → the UI falls back to a pre-filled manual form. No stack traces leak (#6).
Reuses the same OpenAI key as Whisper; doctrine forbids ANTHROPIC credits, not OpenAI.
"""
import base64
import json
import os
from pathlib import Path

import openai
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.config import settings
from app.middleware.rls import get_current_user
from app.schemas.envelope import success_envelope

router = APIRouter()

_MEDIA_DIR = Path(os.environ.get("TFOS_MEDIA_DIR", "/app/uploads"))
_MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif"}

_SYSTEM = (
    "You read a photo of a farm receipt or invoice and return STRICT JSON. Extract ONLY what is "
    "visibly printed. Never invent, guess or compute a value that isn't shown — if a field is not "
    "clearly legible, set it to null and lower the confidence. Treat all money as Fiji Dollars (FJD)."
)
_INSTRUCTION = (
    "Return a JSON object with EXACTLY these keys:\n"
    "direction: 'EXPENSE' if the farmer is buying, 'INCOME' if it's a sale/money received, else null\n"
    "vendor: shop/supplier or buyer name (string|null)\n"
    "date: printed date as YYYY-MM-DD (string|null)\n"
    "total_fjd: grand total as a plain number (number|null)\n"
    "currency: printed currency code if any (string|null)\n"
    "category: best single value from [Seed, Fertilizer, Chemicals, Feed, Tools, Equipment, Fuel, "
    "Repairs, Freight, Labour, Sale, Other] (string)\n"
    "description: one short line — vendor + what was bought/sold (string)\n"
    "line_items: array of {name, qty, unit_price_fjd, amount_fjd} for each legible line (array, may be empty)\n"
    "confidence: 0..1, your confidence that total_fjd AND direction are correct (number)\n"
    "Output ONLY the JSON object, nothing else."
)


class AnalyzeReq(BaseModel):
    photo_url: str = Field(..., max_length=512)


def _resolve(photo_url: str) -> Path:
    """photo_url (/api/v1/community/uploads/<name>) → the on-disk file, path-traversal-safe."""
    name = photo_url.split("?", 1)[0].rstrip("/").rsplit("/", 1)[-1]
    ext = ("." + name.rsplit(".", 1)[-1].lower()) if "." in name else ""
    if ext not in _MIME:
        raise HTTPException(400, detail="Receipt must be an image (jpg, png or webp).")
    path = (_MEDIA_DIR / name).resolve()
    if _MEDIA_DIR.resolve() not in path.parents or not path.is_file():
        raise HTTPException(404, detail="Receipt image not found — upload it first.")
    if path.stat().st_size > 12 * 1024 * 1024:
        raise HTTPException(400, detail="That image is too large (max 12 MB).")
    return path


@router.post("/receipts/analyze", summary="AI-read a receipt/invoice → editable draft (no commit)")
async def analyze_receipt(body: AnalyzeReq, user: dict = Depends(get_current_user)):
    if not settings.openai_api_key:
        raise HTTPException(503, detail="Receipt reading isn't switched on yet — enter the details manually.")
    path = _resolve(body.photo_url)
    ext = "." + path.name.rsplit(".", 1)[-1].lower()
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)
    try:
        resp = await client.chat.completions.create(
            model=settings.receipt_vision_model,
            temperature=0,
            max_tokens=900,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": _SYSTEM},
                {"role": "user", "content": [
                    {"type": "text", "text": _INSTRUCTION},
                    {"type": "image_url", "image_url": {"url": f"data:{_MIME[ext]};base64,{b64}"}},
                ]},
            ],
        )
        data = json.loads(resp.choices[0].message.content or "{}")
    except Exception:  # noqa: BLE001 — honest failure → manual entry; never leak internals (#6)
        raise HTTPException(502, detail="Couldn't read that receipt — please enter the details manually.")

    # Return a DRAFT only. The UI requires the farmer to confirm before it hits the books.
    def _num(v):
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    draft = {
        "direction": data.get("direction") if data.get("direction") in ("EXPENSE", "INCOME") else None,
        "vendor": data.get("vendor"),
        "date": data.get("date"),
        "total_fjd": _num(data.get("total_fjd")),
        "currency": data.get("currency"),
        "category": (data.get("category") or "Other")[:64],
        "description": (data.get("description") or data.get("vendor") or "Receipt")[:500],
        "line_items": data.get("line_items") if isinstance(data.get("line_items"), list) else [],
        "confidence": _num(data.get("confidence")),
        "photo_url": body.photo_url,
    }
    return success_envelope(draft)
