"""Classroom foundation schema (TIS-aware from row one)

Phase 7 Classroom build. Creates shared.classroom_tracks,
shared.classroom_modules, shared.classroom_lessons. Seeds 6
starter tracks matching prototype contract:
  TFOS_Platform_Interactive_Prototype.html renderClassroom()

TIS-aware per Agentic TIS Doctrine (commit 21de5a0) Section 7.4:
every lesson row carries tis_summary + tis_voice_audio_url
(nullable, populated in subsequent migrations) + tis_trigger_concepts
(text array, used by TIS to surface lesson when farmer asks
related questions).

Tables created in shared.* schema (read-mostly, content authored
by FOUNDER + ENTERPRISE_ADMIN only at build time, exposed to
all tenants at runtime).

Revision ID: 100_classroom_foundation
Revises: 066_b63_cluster_a
Create Date: 2026-05-05
"""
from alembic import op


revision = '100_classroom_foundation'
down_revision = '066_b63_cluster_a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ============================================================
    # TABLE 1: shared.classroom_tracks
    # ============================================================
    op.execute("""
        CREATE TABLE shared.classroom_tracks (
            track_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            track_code text NOT NULL UNIQUE,
            title text NOT NULL,
            tagline text,
            icon_name text NOT NULL DEFAULT 'leaf',
            module_count integer NOT NULL DEFAULT 0,
            estimated_minutes integer NOT NULL DEFAULT 0,
            is_compliance boolean NOT NULL DEFAULT false,
            is_fiji_specific boolean NOT NULL DEFAULT true,
            applies_to_groups text[] NOT NULL DEFAULT '{}',
            sort_order integer NOT NULL DEFAULT 100,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        );
    """)
    op.execute("""
        CREATE INDEX idx_classroom_tracks_active
        ON shared.classroom_tracks (sort_order)
        WHERE is_active = true;
    """)
    op.execute("""
        COMMENT ON TABLE shared.classroom_tracks IS
        'Top-level learning tracks. Read-mostly. Authored by FOUNDER + ENTERPRISE_ADMIN at build time. Per Agentic TIS Doctrine Section 7.4.';
    """)

    # ============================================================
    # TABLE 2: shared.classroom_modules
    # ============================================================
    op.execute("""
        CREATE TABLE shared.classroom_modules (
            module_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            track_id uuid NOT NULL REFERENCES shared.classroom_tracks(track_id) ON DELETE CASCADE,
            module_code text NOT NULL UNIQUE,
            title text NOT NULL,
            description text,
            estimated_minutes integer NOT NULL DEFAULT 0,
            sort_order integer NOT NULL DEFAULT 100,
            is_active boolean NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        );
    """)
    op.execute("""
        CREATE INDEX idx_classroom_modules_track
        ON shared.classroom_modules (track_id, sort_order)
        WHERE is_active = true;
    """)
    op.execute("""
        COMMENT ON TABLE shared.classroom_modules IS
        'Child modules under tracks. Each module groups 1+ lessons.';
    """)

    # ============================================================
    # TABLE 3: shared.classroom_lessons
    # ============================================================
    # TIS-aware columns: tis_summary, tis_voice_audio_url, tis_trigger_concepts
    # per Agentic TIS Doctrine Section 7.4
    op.execute("""
        CREATE TABLE shared.classroom_lessons (
            lesson_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            module_id uuid NOT NULL REFERENCES shared.classroom_modules(module_id) ON DELETE CASCADE,
            lesson_code text NOT NULL UNIQUE,
            title text NOT NULL,
            body_md text NOT NULL DEFAULT '',
            estimated_minutes integer NOT NULL DEFAULT 0,
            sort_order integer NOT NULL DEFAULT 100,
            is_active boolean NOT NULL DEFAULT true,
            tis_summary text,
            tis_voice_audio_url text,
            tis_trigger_concepts text[] NOT NULL DEFAULT '{}',
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        );
    """)
    op.execute("""
        CREATE INDEX idx_classroom_lessons_module
        ON shared.classroom_lessons (module_id, sort_order)
        WHERE is_active = true;
    """)
    op.execute("""
        CREATE INDEX idx_classroom_lessons_tis_concepts
        ON shared.classroom_lessons USING GIN (tis_trigger_concepts);
    """)
    op.execute("""
        COMMENT ON TABLE shared.classroom_lessons IS
        'Individual lessons. tis_summary (50-word agent-friendly), tis_voice_audio_url (cached TTS), tis_trigger_concepts (tags for TIS surfacing) per Agentic TIS Doctrine Section 7.4.';
    """)

    # ============================================================
    # SEED 6 STARTER TRACKS (prototype contract)
    # ============================================================
    # Matches TFOS_Platform_Interactive_Prototype.html renderClassroom() lines 1094-1101.
    # Universal names plain English, Year-6 reading level (CLAUDE.md non-negotiable #13).
    op.execute("""
        INSERT INTO shared.classroom_tracks (
            track_code, title, tagline, icon_name,
            module_count, estimated_minutes,
            is_compliance, is_fiji_specific, applies_to_groups,
            sort_order
        ) VALUES
        ('TRK-EGGPLANT-NAYANS-A', 'Eggplant for Nayans Grade A',
         'Grow Grade A eggplant for Nayans supermarket. Fiji conditions, Pacific Agri inputs, ferry-aware harvest timing.',
         'leaf', 6, 42, false, true, ARRAY['CROPS'], 10),
        ('TRK-CASSAVA-ROTATION', 'Cassava rotation and disease',
         'Plant cassava the right way. Rotation, soil, mosaic disease.',
         'leaf', 4, 28, false, true, ARRAY['CROPS'], 20),
        ('TRK-CHEMICAL-WHD', 'Chemical withholding periods',
         'Stay safe and stay legal. Withholding periods for every chemical you use.',
         'shield', 3, 18, true, true, ARRAY['CROPS','LIVESTOCK','POULTRY'], 30),
        ('TRK-KAVA-4YEAR', 'Kava cultivation 4-year cycle',
         'Plant, tend, harvest. Four-year kava cycle from start to sale.',
         'leaf', 8, 62, false, true, ARRAY['CROPS'], 40),
        ('TRK-BEEKEEPING-SUBSISTENCE', 'Beekeeping for subsistence',
         'Start a hive. Honey for the family, wax for sale.',
         'droplet', 5, 35, false, true, ARRAY['APICULTURE'], 50),
        ('TRK-GOAT-KADAVU', 'Goat husbandry (Kadavu conditions)',
         'Raise goats on Kadavu. Feed, shelter, breeding, market.',
         'leaf', 6, 48, false, true, ARRAY['LIVESTOCK'], 60);
    """)

    # ============================================================
    # SEED MODULE PLACEHOLDERS (1 per track for v1)
    # ============================================================
    # Real module + lesson population happens in subsequent migrations.
    # This first row per track lets the schema demonstrate the relationship
    # and gives the API endpoint something to query when wired up.
    op.execute("""
        INSERT INTO shared.classroom_modules (
            track_id, module_code, title, description,
            estimated_minutes, sort_order
        )
        SELECT
            t.track_id,
            t.track_code || '-MOD-1' AS module_code,
            'Getting started' AS title,
            'First module in this track. Full content lands in subsequent migrations.' AS description,
            10 AS estimated_minutes,
            10 AS sort_order
        FROM shared.classroom_tracks t
        WHERE t.is_active = true;
    """)


def downgrade() -> None:
    # Drop in reverse dependency order. CASCADE on FKs handles children.
    op.execute("DROP INDEX IF EXISTS shared.idx_classroom_lessons_tis_concepts;")
    op.execute("DROP INDEX IF EXISTS shared.idx_classroom_lessons_module;")
    op.execute("DROP TABLE IF EXISTS shared.classroom_lessons;")
    op.execute("DROP INDEX IF EXISTS shared.idx_classroom_modules_track;")
    op.execute("DROP TABLE IF EXISTS shared.classroom_modules;")
    op.execute("DROP INDEX IF EXISTS shared.idx_classroom_tracks_active;")
    op.execute("DROP TABLE IF EXISTS shared.classroom_tracks;")
