-- 108 growth metrics — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/108_growth_metrics.py STATEMENTS — keep in sync.

CREATE TABLE IF NOT EXISTS community.activity_days (
        user_id UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
        day     DATE NOT NULL DEFAULT CURRENT_DATE,
        PRIMARY KEY (user_id, day)
    );
CREATE INDEX IF NOT EXISTS idx_activity_days_day ON community.activity_days(day);
CREATE TABLE IF NOT EXISTS community.metric_events (
        kind  TEXT NOT NULL,
        day   DATE NOT NULL DEFAULT CURRENT_DATE,
        count INT NOT NULL DEFAULT 0,
        PRIMARY KEY (kind, day)
    );
GRANT SELECT, INSERT, UPDATE, DELETE ON community.activity_days, community.metric_events TO teivaka_app;

-- verify
SELECT (to_regclass('community.activity_days') IS NOT NULL)::int + (to_regclass('community.metric_events') IS NOT NULL)::int AS objects_2;
