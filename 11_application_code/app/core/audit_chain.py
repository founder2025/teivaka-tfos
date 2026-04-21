"""Audit chain helper — Python side of the v4.1 Bank Evidence spine.

Provides:
- compute_hash()       : deterministic sha256 chain hash, must match SQL impl
- canonical_json()     : stable JSON serialization for payload hashing
- emit_audit_event()   : INSERT into audit.events with correct previous_hash

Usage:
    from app.core.audit_chain import emit_audit_event

    event_id, this_hash = await emit_audit_event(
        db=db,
        tenant_id=tenant_id,
        actor_user_id=user_id,
        event_type="TASK_COMPLETED",
        entity_type="task",
        entity_id=str(task_id),
        payload={"task_id": str(task_id), "qty_kg": 18.5, "grade": "A"},
        client_offline_id=offline_id,
    )

CRITICAL:
- The DB function audit.compute_hash() in migration 023 MUST produce the
  same output as compute_hash() in this module. If you change one, change
  both, and bump a new migration that updates the DB function.
- The tenant context (app.current_tenant_id) MUST be set on the session
  before calling emit_audit_event — it relies on the standard tenant
  isolation pattern.

Deployment target: /opt/teivaka/11_application_code/app/core/audit_chain.py
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


# -- 1. Canonical JSON ------------------------------------------------------
# Stable, whitespace-free, keys sorted. Unicode preserved. Datetime as
# ISO-8601 Z. UUID as str. Decimals as str. No floats with trailing zeros.

def _default(o: Any) -> Any:
    if isinstance(o, datetime):
        return o.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    if isinstance(o, UUID):
        return str(o)
    if hasattr(o, "__str__"):
        return str(o)
    raise TypeError(f"cannot serialize {type(o).__name__}")


def canonical_json(payload: dict) -> str:
    """Deterministic JSON serialization. Keys sorted. Compact. No NaN."""
    return json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
        default=_default,
        ensure_ascii=False,
        allow_nan=False,
    )


def payload_sha256(payload: dict) -> str:
    """Hex sha256 of canonical JSON."""
    return hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()


# -- 2. Chain hash computation ---------------------------------------------
# Must match audit.compute_hash() in the DB (migration 023).
# Format: "{tenant_id}|{previous_hash or 'GENESIS'}|{payload_sha256}|{iso_ts}"

def _iso_utc_microseconds(ts: datetime) -> str:
    """ISO-8601 UTC with microseconds and +00:00 offset. Matches Postgres format."""
    return ts.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f+00:00")


def compute_hash(
    tenant_id: UUID,
    previous_hash: str | None,
    payload_sha: str,
    occurred_at: datetime,
) -> str:
    preimage = (
        f"{tenant_id}|"
        f"{previous_hash or 'GENESIS'}|"
        f"{payload_sha}|"
        f"{_iso_utc_microseconds(occurred_at)}"
    )
    return hashlib.sha256(preimage.encode("utf-8")).hexdigest()


# -- 3. Emit one audit event -----------------------------------------------

async def emit_audit_event(
    db: AsyncSession,
    tenant_id: UUID,
    event_type: str,
    payload: dict,
    actor_user_id: UUID | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    occurred_at: datetime | None = None,
    client_offline_id: str | None = None,
) -> tuple[UUID, str]:
    """Insert one audit.events row with correct hash-chain linkage.

    Returns: (event_id, this_hash)

    Callers often need this_hash immediately for response envelopes or
    observability (e.g. the Task API returns audit_this_hash on COMPLETE
    and SKIP). Returning it here avoids a follow-up SELECT and guarantees
    the caller gets the exact hash that was just written, not a stale
    lookup racing a concurrent insert.

    This function:
      1. Resolves previous_hash by looking up the most-recent audit row
         for this tenant (ordered by occurred_at DESC, event_id DESC).
      2. Computes payload_sha256 from canonical_json(payload).
      3. Computes this_hash via compute_hash().
      4. INSERTs the row.
      5. Returns the new event_id.

    The SELECT + INSERT must happen inside a transaction with isolation
    level REPEATABLE READ or higher to prevent two concurrent inserts
    from forking the chain. If your SQLAlchemy session uses the default
    READ COMMITTED, wrap calls in a SERIALIZABLE block:

        async with db.begin():
            await db.execute(text("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE"))
            event_id = await emit_audit_event(...)

    For single-node Phase 4.2 throughput, READ COMMITTED + the UNIQUE
    (tenant_id, this_hash) index is sufficient — a conflicting insert
    will raise IntegrityError and the caller should retry.
    """
    # NOTE: previous usage example in the module docstring (top of file)
    # shows `event_id = await emit_audit_event(...)` — that reflects the
    # pre-tuple return. Any call site that unpacks only a single value will
    # now see a TypeError. Current callers (routers/tasks.py:complete + skip)
    # already expect the tuple. No other callers exist.
    if occurred_at is None:
        occurred_at = datetime.now(timezone.utc)

    # 1. Resolve previous_hash for this tenant.
    #    RLS ensures we only see our tenant's rows even if the query omits
    #    the filter. Keeping the explicit filter for defence-in-depth.
    row = (
        await db.execute(
            text(
                """
                SELECT this_hash
                FROM audit.events
                WHERE tenant_id = :tid
                ORDER BY occurred_at DESC, event_id DESC
                LIMIT 1
                """
            ),
            {"tid": str(tenant_id)},
        )
    ).first()
    previous_hash = row[0] if row else None

    # 2. Payload hash.
    payload_sha = payload_sha256(payload)

    # 3. Chain hash.
    this_hash = compute_hash(tenant_id, previous_hash, payload_sha, occurred_at)

    # 4. Insert.
    event_id = uuid4()
    await db.execute(
        text(
            """
            INSERT INTO audit.events (
                event_id, tenant_id, actor_user_id, event_type,
                entity_type, entity_id, occurred_at,
                payload_jsonb, payload_sha256,
                previous_hash, this_hash,
                client_offline_id
            ) VALUES (
                :event_id, :tenant_id, :actor_user_id, :event_type,
                :entity_type, :entity_id, :occurred_at,
                CAST(:payload_jsonb AS jsonb), :payload_sha256,
                :previous_hash, :this_hash,
                :client_offline_id
            )
            """
        ),
        {
            "event_id": str(event_id),
            "tenant_id": str(tenant_id),
            "actor_user_id": str(actor_user_id) if actor_user_id else None,
            "event_type": event_type,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "occurred_at": occurred_at,
            "payload_jsonb": canonical_json(payload),
            "payload_sha256": payload_sha,
            "previous_hash": previous_hash,
            "this_hash": this_hash,
            "client_offline_id": client_offline_id,
        },
    )

    return event_id, this_hash


# -- 4. Chain verification -------------------------------------------------

async def verify_chain(db: AsyncSession, tenant_id: UUID) -> tuple[bool, int, str | None]:
    """Walk the chain for a tenant and verify every link.

    Returns: (is_valid, events_checked, first_broken_event_id_or_None)

    Use for:
      - Monthly Bank PDF generation (must verify chain intact before signing)
      - Ad-hoc integrity audits
      - Pre-lender export
    """
    rows = (
        await db.execute(
            text(
                """
                SELECT event_id, occurred_at, payload_sha256, previous_hash, this_hash
                FROM audit.events
                WHERE tenant_id = :tid
                ORDER BY occurred_at ASC, event_id ASC
                """
            ),
            {"tid": str(tenant_id)},
        )
    ).fetchall()

    expected_previous: str | None = None
    for i, (event_id, occurred_at, payload_sha, previous_hash, this_hash) in enumerate(rows):
        if previous_hash != expected_previous:
            return (False, i, str(event_id))
        recomputed = compute_hash(tenant_id, previous_hash, payload_sha, occurred_at)
        if recomputed != this_hash:
            return (False, i, str(event_id))
        expected_previous = this_hash

    return (True, len(rows), None)
