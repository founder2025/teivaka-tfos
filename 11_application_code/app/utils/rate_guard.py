"""rate_guard — tiny in-memory per-IP rate limiter for public endpoints.

Process-local (each worker counts separately) — coarse but real protection
for low-stakes public endpoints (counters, invite previews). High-stakes
paths (verify) already use the Redis limiter in verify.py.
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits: dict[str, deque] = defaultdict(deque)


def rate_guard(request: Request, key: str, limit: int = 30, window_s: int = 60):
    ip = (request.headers.get("x-forwarded-for") or (request.client.host if request.client else "?")).split(",")[0].strip()
    bucket = _hits[f"{key}:{ip}"]
    now = time.monotonic()
    while bucket and now - bucket[0] > window_s:
        bucket.popleft()
    if len(bucket) >= limit:
        raise HTTPException(status_code=429, detail="Too many requests — slow down")
    bucket.append(now)
