-- 094 RECONCILE — fix pre-existing community tables whose columns don't match
-- migration 094 (forensic finding: tables existed before 094, so its CREATE
-- TABLE IF NOT EXISTS silently no-op'd, leaving wrong columns that made the
-- feed's subqueries resolve "user_id" to the outer query -> AmbiguousColumn).
--
-- Safe: each block only drops+recreates a table if it has the WRONG shape AND
-- is EMPTY. A wrong-shaped table with rows is left alone with a NOTICE so you
-- can inspect it (none of these features have shipped UI writes under the old
-- shape, so they should all be empty).
--
-- Run:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/094_reconcile_stray_tables.sql

\echo '--- current shapes ---'
SELECT table_name, string_agg(column_name, ', ' ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_schema = 'community' AND table_name IN ('feed_hidden','user_mutes','user_blocks')
GROUP BY table_name ORDER BY table_name;

DO $$
DECLARE n BIGINT;
BEGIN
  -- feed_hidden
  IF to_regclass('community.feed_hidden') IS NOT NULL AND (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='community' AND table_name='feed_hidden' AND column_name IN ('user_id','post_id')) < 2
  THEN
    EXECUTE 'SELECT count(*) FROM community.feed_hidden' INTO n;
    IF n = 0 THEN
      DROP TABLE community.feed_hidden;
      RAISE NOTICE 'feed_hidden: wrong shape, empty -> recreated';
    ELSE
      RAISE NOTICE 'feed_hidden: wrong shape but has % rows — inspect manually', n;
    END IF;
  END IF;
  -- user_mutes
  IF to_regclass('community.user_mutes') IS NOT NULL AND (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='community' AND table_name='user_mutes' AND column_name IN ('user_id','muted_user_id')) < 2
  THEN
    EXECUTE 'SELECT count(*) FROM community.user_mutes' INTO n;
    IF n = 0 THEN
      DROP TABLE community.user_mutes;
      RAISE NOTICE 'user_mutes: wrong shape, empty -> recreated';
    ELSE
      RAISE NOTICE 'user_mutes: wrong shape but has % rows — inspect manually', n;
    END IF;
  END IF;
  -- user_blocks
  IF to_regclass('community.user_blocks') IS NOT NULL AND (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='community' AND table_name='user_blocks' AND column_name IN ('user_id','blocked_user_id')) < 2
  THEN
    EXECUTE 'SELECT count(*) FROM community.user_blocks' INTO n;
    IF n = 0 THEN
      DROP TABLE community.user_blocks;
      RAISE NOTICE 'user_blocks: wrong shape, empty -> recreated';
    ELSE
      RAISE NOTICE 'user_blocks: wrong shape but has % rows — inspect manually', n;
    END IF;
  END IF;
END $$;

-- Recreate any that were dropped (no-ops where the correct table survives)
CREATE TABLE IF NOT EXISTS community.feed_hidden (
    user_id    UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    post_id    TEXT NOT NULL REFERENCES community.feed_posts(post_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, post_id)
);
CREATE TABLE IF NOT EXISTS community.user_mutes (
    user_id       UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    muted_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, muted_user_id)
);
CREATE TABLE IF NOT EXISTS community.user_blocks (
    user_id         UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    blocked_user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, blocked_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON community.feed_hidden, community.user_mutes, community.user_blocks TO teivaka_app;

\echo '--- verified shapes (must show user_id/muted_user_id/blocked_user_id) ---'
SELECT table_name, string_agg(column_name, ', ' ORDER BY ordinal_position) AS columns
FROM information_schema.columns
WHERE table_schema = 'community' AND table_name IN ('feed_hidden','user_mutes','user_blocks')
GROUP BY table_name ORDER BY table_name;
