"""148 - Grant runtime role UPDATE on shared.attribution_events

Revision ID: 148_grant_attribution_update
Revises: 147_grant_registration_tables
Create Date: 2026-06-14

CHAIN REPAIR (Foundation Audit, 2026-06-20). This migration was authored and
applied to production manually as the `teivaka` owner (Strike #123), but the
file was never committed to git — leaving 149 with a `down_revision` pointing at
a phantom 148. A clean `alembic upgrade head` (disaster recovery / new region)
could not walk the chain. This file restores it, reconstructed faithfully from
the live grant state on prod:

    teivaka_app has INSERT, SELECT, UPDATE on shared.attribution_events.

shared.attribution_events is one of the two explicit runtime-writable shared.*
tables (Inviolable #7) — TIS attribution is written at runtime. SELECT/INSERT
were granted earlier; 148 added UPDATE (per its name). All three are re-asserted
here idempotently so a fresh DB ends in the same state regardless of history
(B73 GRANT-audit discipline). Idempotent: GRANT is a safe no-op re-assert.

asyncpg: one statement per op.execute (Strike #72).
"""
from alembic import op

revision = "148_grant_attribution_update"
down_revision = "147_grant_registration_tables"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "GRANT SELECT, INSERT, UPDATE ON shared.attribution_events TO teivaka_app",
        # Sequence access for the bigserial PK (nextval) on INSERT — idempotent.
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA shared TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "REVOKE UPDATE ON shared.attribution_events FROM teivaka_app",
    ])
