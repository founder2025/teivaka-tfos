"""105_fix_feed_audience_check — align feed_posts audience CHECK with code _AUDIENCES.

Root cause of the Home post 500: app/routers/feed.py _AUDIENCES was updated to the
persona-group taxonomy (PRODUCER/TRADE/CAPITAL/GOVERNANCE/SERVICE) but the DB CHECK
constraint feed_posts_audience_check (migration 091) was never widened to match — so a
post with audience='TRADE' (etc.) passed the app check and then violated the DB
constraint → 500. This widens the constraint to exactly match _AUDIENCES (new
persona-group values + legacy 8-profession values + everyone/followers).

NOTE: applied directly as owner on prod during a live incident (Alembic chain mid-repair);
this file records the change for reproducibility. Idempotent.
"""
from alembic import op

revision = "105_fix_feed_audience_check"
down_revision = "104_groups"
branch_labels = None
depends_on = None

_AUDIENCES = ("'everyone','followers',"
              "'PRODUCER','TRADE','CAPITAL','GOVERNANCE','SERVICE',"
              "'farmer','buyer','supplier','service_provider','banker','business','exporter','importer'")


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        "ALTER TABLE community.feed_posts DROP CONSTRAINT IF EXISTS feed_posts_audience_check",
        f"ALTER TABLE community.feed_posts ADD CONSTRAINT feed_posts_audience_check CHECK (audience IN ({_AUDIENCES}))",
    ])


def downgrade():
    _exec_each([
        "ALTER TABLE community.feed_posts DROP CONSTRAINT IF EXISTS feed_posts_audience_check",
        "ALTER TABLE community.feed_posts ADD CONSTRAINT feed_posts_audience_check "
        "CHECK (audience IN ('everyone','followers','farmer','buyer','supplier','service_provider','banker','business','exporter','importer'))",
    ])
