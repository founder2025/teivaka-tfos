-- 107 admin command center — apply-as-owner (Strike #123). Idempotent.
-- GENERATED from alembic/versions/107_admin_command.py STATEMENTS — keep in sync.

CREATE TABLE IF NOT EXISTS community.intel_snapshots (
        kind        TEXT PRIMARY KEY,
        payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
        computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
CREATE TABLE IF NOT EXISTS community.feature_flags (
        flag       TEXT PRIMARY KEY,
        enabled    BOOLEAN NOT NULL DEFAULT true,
        note       TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by UUID
    );
INSERT INTO community.feature_flags (flag, note) VALUES
        ('home_feed',   'Home pillar: Feed, Stories, Following'),
        ('marketplace', 'Home pillar: Marketplace + Market prices'),
        ('groups',      'Home pillar: Groups'),
        ('classroom',   'Classroom pillar (learner + builder)'),
        ('tis',         'TIS chat (in-app)')
    ON CONFLICT (flag) DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.intel_snapshots, community.feature_flags TO teivaka_app;

-- verify
SELECT (to_regclass('community.intel_snapshots') IS NOT NULL)::int + (to_regclass('community.feature_flags') IS NOT NULL)::int AS objects_2;
