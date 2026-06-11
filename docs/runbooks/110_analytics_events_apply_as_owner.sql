-- 110 analytics event spine — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/110_analytics_events.py STATEMENTS — keep in sync.

CREATE SCHEMA IF NOT EXISTS analytics;
GRANT USAGE ON SCHEMA analytics TO teivaka_app;
CREATE TABLE IF NOT EXISTS analytics.events (
        event_id      BIGSERIAL PRIMARY KEY,
        ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
        actor_user_id UUID,
        tenant_id     UUID,
        region        TEXT,                 -- free-text island today; geo_regions FK in I4
        pillar        TEXT NOT NULL,        -- home|classroom|tis|farm|market|admin|auth
        event_type    TEXT NOT NULL,        -- 'post_created','tis_query',...
        entity_type   TEXT,
        entity_id     TEXT,
        props         JSONB NOT NULL DEFAULT '{}'::jsonb,
        session_id    TEXT
    );
CREATE INDEX IF NOT EXISTS idx_analytics_events_ts ON analytics.events(ts DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON analytics.events(pillar, event_type, ts DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_actor ON analytics.events(actor_user_id, ts DESC);
GRANT SELECT, INSERT ON analytics.events TO teivaka_app;
GRANT USAGE, SELECT ON SEQUENCE analytics.events_event_id_seq TO teivaka_app;

-- verify
SELECT (to_regclass('analytics.events') IS NOT NULL)::int AS analytics_events_1;
