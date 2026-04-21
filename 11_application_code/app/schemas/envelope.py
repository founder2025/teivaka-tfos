"""Part 13 response envelope — shared helper for new routers.

Success:  {"status": "success", "data": <any>, "meta": {...}}
Error:    {"status": "error",   "error": {"code": "...", "message": "..."}}

Existing routers (pre-4.2) emit bare dicts; retrofitting them is tracked
separately. New code should call these helpers so the envelope shape is
uniform at the boundary.
"""
from typing import Any, Optional


def success_envelope(data: Any, meta: Optional[dict] = None) -> dict:
    return {"status": "success", "data": data, "meta": meta or {}}


def error_envelope(code: str, message: str, data: Any = None) -> dict:
    err: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        err["data"] = data
    return {"status": "error", "error": err}
