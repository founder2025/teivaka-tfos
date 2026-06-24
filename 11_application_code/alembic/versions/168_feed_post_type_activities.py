"""168 - widen community.feed_posts.post_type for activity-based composer

The community composer now leads with activity chips (Farm Update · Question ·
Knowledge · Opportunity · Looking for help · Achievement) so Teivaka reads as an
Agricultural OS, not a social clone. feed_posts.post_type was previously limited to
the server-derived set (UPDATE / QUESTION / PHOTO); this widens the CHECK to accept
the new first-class activity types so the chip choice persists and is filterable.

Additive + reversible. The drop step is name-agnostic (CHECK name differs across
environments) — it removes any CHECK on feed_posts that references post_type, then
adds the canonical one. Apply as owner (Strike #123).

ORDERING: apply this migration BEFORE deploying the frontend that sends the new
post_type values — otherwise an INSERT with KNOWLEDGE/OPPORTUNITY/HELP/ACHIEVEMENT
would violate the old CHECK. (The backend also falls back to a safe derived value
when post_type is unknown, so an un-migrated DB still posts — just without the new
types.)
"""
from alembic import op

revision = "168_feed_post_type_activities"
down_revision = "167_geo_indexes"
branch_labels = None
depends_on = None

_ALLOWED = "('UPDATE','QUESTION','PHOTO','KNOWLEDGE','OPPORTUNITY','HELP','ACHIEVEMENT')"


def upgrade():
    # 1) Drop any existing CHECK on community.feed_posts that constrains post_type
    #    (constraint name varies by environment). One statement (DO block) per
    #    op.execute — asyncpg rejects multi-statement strings (Strike #72).
    op.execute("""
    DO $$
    DECLARE r record;
    BEGIN
      FOR r IN
        SELECT con.conname
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'community' AND c.relname = 'feed_posts'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%post_type%'
      LOOP
        EXECUTE format('ALTER TABLE community.feed_posts DROP CONSTRAINT %I', r.conname);
      END LOOP;
    END $$;
    """)
    # 2) Add the canonical widened CHECK (NULL passes, as before).
    op.execute(
        "ALTER TABLE community.feed_posts "
        "ADD CONSTRAINT feed_posts_post_type_check "
        f"CHECK (post_type IN {_ALLOWED})"
    )


def downgrade():
    op.execute("ALTER TABLE community.feed_posts DROP CONSTRAINT IF EXISTS feed_posts_post_type_check")
    # Restore the narrower historical set.
    op.execute(
        "ALTER TABLE community.feed_posts "
        "ADD CONSTRAINT feed_posts_post_type_check "
        "CHECK (post_type IN ('UPDATE','QUESTION','PHOTO'))"
    )
