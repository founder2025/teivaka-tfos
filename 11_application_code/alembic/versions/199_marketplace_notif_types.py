"""199 - allow marketplace notification types on community.feed_notifications

Root cause of "no notification pops up": community.feed_notifications.type has a
CHECK that only permits the 7 social types (migration 090) — so every marketplace
notification (service_jobs already calls _notify with SERVICE_JOB_* ) violates the
CHECK and is SILENTLY swallowed by _notify's best-effort exception guard. This
widens the CHECK to the marketplace match/notify vocabulary so those rows persist.

Drop + re-add the auto-named column CHECK (feed_notifications_type_check). Existing
rows only hold the original 7 types, so the wider CHECK can't reject anything.
Apply as owner (Strike #123); one statement per op.execute (Strike #72); reversible.
"""
from alembic import op

revision = "199_marketplace_notif_types"
down_revision = "198_near_you_country_and_indexes"
branch_labels = None
depends_on = None

_SOCIAL = ["LIKE", "REACT", "REPLY", "REPOST", "SHARE", "FOLLOW", "MENTION"]
_MARKET = [
    "SERVICE_JOB_POSTED", "SERVICE_JOB_CLAIMED", "SERVICE_JOB_COMPLETED",
    "JOB_APPLIED", "JOB_SHORTLISTED", "JOB_DECLINED", "JOB_HIRED",
    "ORDER_PLACED", "ORDER_CONFIRMED", "DEMAND_OFFER", "MATCH_CONNECTED",
]


def _in_list(values):
    return ", ".join(f"'{v}'" for v in values)


def upgrade():
    op.execute("ALTER TABLE community.feed_notifications DROP CONSTRAINT IF EXISTS feed_notifications_type_check")
    op.execute(
        "ALTER TABLE community.feed_notifications ADD CONSTRAINT feed_notifications_type_check "
        f"CHECK (type IN ({_in_list(_SOCIAL + _MARKET)}))"
    )


def downgrade():
    op.execute("ALTER TABLE community.feed_notifications DROP CONSTRAINT IF EXISTS feed_notifications_type_check")
    op.execute(
        "ALTER TABLE community.feed_notifications ADD CONSTRAINT feed_notifications_type_check "
        f"CHECK (type IN ({_in_list(_SOCIAL)}))"
    )
