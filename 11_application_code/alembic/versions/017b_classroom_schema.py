"""017b - Classroom + learning schema: tracks, modules, lessons, crop_guide_pages, progress, bookmarks

Revision ID: 017b_classroom_schema
Revises: 017_community_schema
Create Date: 2026-04-18

Per TFOS Platform Architecture v1.0 Section 8.3 + 8.4.

Adds:
- shared.classroom_tracks, shared.classroom_modules, shared.classroom_lessons
- shared.crop_guide_pages (rehome of v3 Foundation Crop_Field_Guide pages)
- learning.progress, learning.bookmarks (new schema, user-scoped NOT tenant-scoped)

SCHEMA DRIFT NOTE: FK targets are tenant.users (not auth.users) because this
deployment has no auth schema. Learning data follows the person across farm
changes — per Section 8.1 rationale.

RLS: shared.* = public read, admin write (no RLS). learning.* = user-scoped in
API queries via WHERE user_id = session user — no RLS per Section 8.6.

CONTENT LOADING: This migration creates empty tables. Content seeding (actual
classroom markdown lessons + crop_guide_pages rows from v3 Foundation
Crop_Field_Guide) is a separate data-load operation, not a schema migration.
"""
from alembic import op

revision = "017b_classroom_schema"
down_revision = "017_community_schema"
branch_labels = None
depends_on = None


def _exec_each(statements):
    for s in statements:
        s = s.strip()
        if s:
            op.execute(s)


def upgrade():
    _exec_each([
        # --------------------------------------------------------------
        # Schema
        # --------------------------------------------------------------
        "CREATE SCHEMA IF NOT EXISTS learning",

        # --------------------------------------------------------------
        # shared.classroom_tracks
        # --------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS shared.classroom_tracks (
            track_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            track_code    TEXT UNIQUE NOT NULL,
            title         TEXT NOT NULL,
            description   TEXT,
            level         TEXT NOT NULL CHECK (level IN ('BEGINNER','INTERMEDIATE','COMMERCIAL')),
            cover_image   TEXT,
            lesson_count  INTEGER NOT NULL DEFAULT 0,
            is_published  BOOLEAN NOT NULL DEFAULT FALSE,
            sort_order    INTEGER NOT NULL DEFAULT 100,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_tracks_published_order ON shared.classroom_tracks(is_published, sort_order) WHERE is_published = TRUE",

        # --------------------------------------------------------------
        # shared.classroom_modules
        # --------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS shared.classroom_modules (
            module_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            track_id    UUID NOT NULL REFERENCES shared.classroom_tracks(track_id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            sort_order  INTEGER NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_modules_track ON shared.classroom_modules(track_id, sort_order)",

        # --------------------------------------------------------------
        # shared.classroom_lessons
        # --------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS shared.classroom_lessons (
            lesson_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            module_id      UUID NOT NULL REFERENCES shared.classroom_modules(module_id) ON DELETE CASCADE,
            title          TEXT NOT NULL,
            body_markdown  TEXT NOT NULL,
            estimated_min  INTEGER,
            related_crop   TEXT,
            sort_order     INTEGER NOT NULL,
            is_published   BOOLEAN NOT NULL DEFAULT TRUE,
            published_at   TIMESTAMPTZ,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_lessons_module ON shared.classroom_lessons(module_id, sort_order)",
        "CREATE INDEX IF NOT EXISTS idx_lessons_crop ON shared.classroom_lessons(related_crop) WHERE related_crop IS NOT NULL",

        # --------------------------------------------------------------
        # shared.crop_guide_pages
        # --------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS shared.crop_guide_pages (
            page_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            crop_id        TEXT NOT NULL,
            section        TEXT NOT NULL,
            title          TEXT NOT NULL,
            body_markdown  TEXT NOT NULL,
            sort_order     INTEGER NOT NULL,
            is_published   BOOLEAN NOT NULL DEFAULT TRUE,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_guide_crop ON shared.crop_guide_pages(crop_id, sort_order)",
        "CREATE INDEX IF NOT EXISTS idx_guide_published ON shared.crop_guide_pages(is_published) WHERE is_published = TRUE",

        # --------------------------------------------------------------
        # learning.progress
        # --------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS learning.progress (
            user_id        UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            lesson_id      UUID NOT NULL REFERENCES shared.classroom_lessons(lesson_id) ON DELETE CASCADE,
            status         TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','IN_PROGRESS','COMPLETED')),
            progress_pct   INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
            last_position  INTEGER DEFAULT 0,
            completed_at   TIMESTAMPTZ,
            started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, lesson_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_progress_user_status ON learning.progress(user_id, status)",
        "CREATE INDEX IF NOT EXISTS idx_progress_completed ON learning.progress(user_id, completed_at DESC) WHERE status = 'COMPLETED'",

        # --------------------------------------------------------------
        # learning.bookmarks
        # --------------------------------------------------------------
        """
        CREATE TABLE IF NOT EXISTS learning.bookmarks (
            user_id       UUID NOT NULL REFERENCES tenant.users(user_id) ON DELETE CASCADE,
            resource_type TEXT NOT NULL CHECK (resource_type IN ('LESSON','CROP_GUIDE','POST')),
            resource_id   UUID NOT NULL,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (user_id, resource_type, resource_id)
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_bookmarks_user_created ON learning.bookmarks(user_id, created_at DESC)",

        # --------------------------------------------------------------
        # Trigger: shared.classroom_tracks.lesson_count denorm
        # --------------------------------------------------------------
        """
        CREATE OR REPLACE FUNCTION shared._fn_track_lesson_count() RETURNS TRIGGER AS $$
        DECLARE
            v_track_id UUID;
        BEGIN
            IF TG_OP = 'INSERT' THEN
                SELECT track_id INTO v_track_id FROM shared.classroom_modules WHERE module_id = NEW.module_id;
                UPDATE shared.classroom_tracks SET lesson_count = lesson_count + 1 WHERE track_id = v_track_id;
                RETURN NEW;
            ELSIF TG_OP = 'DELETE' THEN
                SELECT track_id INTO v_track_id FROM shared.classroom_modules WHERE module_id = OLD.module_id;
                UPDATE shared.classroom_tracks SET lesson_count = GREATEST(lesson_count - 1, 0) WHERE track_id = v_track_id;
                RETURN OLD;
            END IF;
            RETURN NULL;
        END;
        $$ LANGUAGE plpgsql
        """,
        "DROP TRIGGER IF EXISTS trg_track_lesson_count ON shared.classroom_lessons",
        """
        CREATE TRIGGER trg_track_lesson_count
        AFTER INSERT OR DELETE ON shared.classroom_lessons
        FOR EACH ROW EXECUTE FUNCTION shared._fn_track_lesson_count()
        """,
    ])


def downgrade():
    _exec_each([
        "DROP TRIGGER IF EXISTS trg_track_lesson_count ON shared.classroom_lessons",
        "DROP FUNCTION IF EXISTS shared._fn_track_lesson_count()",
        "DROP TABLE IF EXISTS learning.bookmarks",
        "DROP TABLE IF EXISTS learning.progress",
        "DROP TABLE IF EXISTS shared.crop_guide_pages",
        "DROP TABLE IF EXISTS shared.classroom_lessons",
        "DROP TABLE IF EXISTS shared.classroom_modules",
        "DROP TABLE IF EXISTS shared.classroom_tracks",
        "DROP SCHEMA IF EXISTS learning",
    ])
