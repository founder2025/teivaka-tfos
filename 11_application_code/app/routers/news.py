"""Agriculture news proxy — small headline card at the top of the community feed.

Server-side fetch of Google News RSS (agriculture + Pacific/Fiji query) — the
browser can't call it directly (CSP connect-src 'self'). Parsed with stdlib
ElementTree, cached in-process for 30 minutes. Honest empty list on any
failure — headlines are never fabricated (Inviolable #1 spirit).
"""
import logging
import time
import xml.etree.ElementTree as ET

import httpx
from fastapi import APIRouter, Depends

from app.middleware.rls import get_current_user

logger = logging.getLogger("teivaka.news")
router = APIRouter()

_cache: dict = {"at": 0.0, "items": []}
_TTL = 30 * 60
_FEED = ("https://news.google.com/rss/search?"
         "q=agriculture%20farming%20(Fiji%20OR%20Pacific%20OR%20crops)&hl=en&gl=FJ&ceid=FJ:en")


@router.get("/agri")
async def agri_news(user: dict = Depends(get_current_user)):
    if time.time() - _cache["at"] < _TTL and _cache["items"]:
        return {"data": _cache["items"]}
    items = []
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            r = await client.get(_FEED, headers={"User-Agent": "TFOS-Teivaka/1.0"})
            r.raise_for_status()
            root = ET.fromstring(r.text)
            for it in root.iter("item"):
                title = (it.findtext("title") or "").strip()
                link = (it.findtext("link") or "").strip()
                pub = (it.findtext("pubDate") or "").strip()
                src_el = it.find("source")
                source = (src_el.text or "").strip() if src_el is not None else ""
                if title and link:
                    items.append({"title": title, "link": link, "source": source, "published": pub})
                if len(items) >= 8:
                    break
    except Exception as e:  # noqa: BLE001 — news is decorative; degrade to empty
        logger.warning("agri news fetch failed: %s", e)
        return {"data": _cache["items"] or []}
    _cache["at"] = time.time()
    _cache["items"] = items
    return {"data": items}
