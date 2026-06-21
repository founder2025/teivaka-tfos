"""152 - merge the orphaned feed_audience branch back into the mainline.

Revision ID: 152_merge_feed_audience
Revises: 105_fix_feed_audience_check, 151_user_sessions_valid_after
Create Date: 2026-06-21

Cluster 2 (debt sweep) — migration-chain integrity.

The chain forked at 104_groups: BOTH 105_fix_feed_audience_check and
105_tier_requests_prefs declared down_revision = "104_groups". The mainline went
104 -> 105_tier_requests_prefs -> 106 -> ... -> 151, leaving
105_fix_feed_audience_check as a dead orphan head that nothing descends from.
Live prod confirmed TWO heads (`alembic heads` returned both), so the next
`alembic upgrade head` would error "multiple head revisions are present".

This is an Alembic MERGE revision: it unifies the two heads so there is exactly
one head again. It carries no DDL of its own. Applying it makes Alembic apply the
unapplied orphan (105_fix_feed_audience_check) first — whose upgrade() is
IDEMPOTENT (DROP CONSTRAINT IF EXISTS + ADD) and whose constraint is ALREADY live
on prod (it was applied by hand during the Home-post 500 incident, chain
mid-repair, never stamped). So on prod the orphan re-asserts an existing
constraint (a no-op in effect); on a greenfield deploy it applies once cleanly.

Revision id is 23 chars (<= 32 for the tenant.alembic_version varchar(32) ceiling,
B41). Apply as the `teivaka` owner (Strike #123).

ROLLBACK WARNING: do NOT `alembic downgrade` below this revision to undo the
merge. That would run 105_fix_feed_audience_check.downgrade(), which RE-NARROWS
the community.feed_posts audience CHECK to the legacy set and re-triggers the
Home-post 500 incident. To revert ONLY the merge bookkeeping, use:
    alembic stamp 151_user_sessions_valid_after
(pointer-only; runs no DDL; returns to the prior two-head state with the live
constraint intact).
"""
from alembic import op  # noqa: F401  (kept for parity / future use)

revision = "152_merge_feed_audience"
down_revision = ("105_fix_feed_audience_check", "151_user_sessions_valid_after")
branch_labels = None
depends_on = None


def upgrade():
    # Merge revision: no DDL. The branch's real (idempotent) DDL lives in
    # 105_fix_feed_audience_check.upgrade(), which Alembic applies as part of
    # reaching this head.
    pass


def downgrade():
    # Bookkeeping-only; nothing to reverse here. See ROLLBACK WARNING in the
    # module docstring — never `alembic downgrade` past this revision (it would
    # re-narrow the feed_posts audience CHECK). Use `alembic stamp` instead.
    pass
