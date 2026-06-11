-- 109 platform settings — apply-as-owner (Strike #123). Idempotent.

CREATE TABLE IF NOT EXISTS community.platform_settings (
        id             INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        banner_enabled BOOLEAN NOT NULL DEFAULT false,
        banner_text    TEXT NOT NULL DEFAULT '',
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_by     UUID
    );
INSERT INTO community.platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
GRANT SELECT, INSERT, UPDATE, DELETE ON community.platform_settings TO teivaka_app;

-- verify
SELECT (to_regclass('community.platform_settings') IS NOT NULL)::int AS objects_1;
