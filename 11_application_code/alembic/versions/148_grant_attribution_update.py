"""148 - Grant runtime role UPDATE on shared.attribution_events

Revision ID: 148_grant_attribution_update
Revises: 147_grant_registration_tables
Create Date: 2026-06-14

Root-cause fix (companion to 147): shared.attribution_events granted teivaka_app
only INSERT + SELECT, NOT UPDATE. register() backfills prior LANDING_VIEW rows
via `UPDATE shared.attribution_events SET user_id = ... WHERE anonymous_id = ...`
(auth.py), which runs whenever a signup carries an anonymous_id -- i.e. every
tracked funnel / NetworkSignup conversion. The missing UPDATE raised asyncpg
InsufficientPrivilege; in async Postgres a failed statement aborts the WHOLE
transaction, so the "best-effort, ignored" try/except swallowed the Python error
but db.commit() then persisted NOTHING for the user. Registration returned 201
and sent the verification email while silently discarding the account -- and
verify-email later found no token/uid and returned "expired or already used".

attribution_events is one of the two shared.* tables explicitly designated
write-at-runtime by Inviolable #7 -- the UPDATE grant is doctrinally correct and
was simply never applied. UPDATE only: register() never DELETEs this table
(grep-confirmed). Idempotent re-assert is harmless (B73 GRANT-audit discipline).

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
        "GRANT UPDATE ON shared.attribution_events TO teivaka_app",
    ])


def downgrade():
    _exec_each([
        "REVOKE UPDATE ON shared.attribution_events FROM teivaka_app",
    ])
