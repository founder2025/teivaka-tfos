"""156 - production_cycles.layer NOT NULL (3-Layer doctrine enforcement).

Revision ID: 156_cycle_layer_not_null
Revises: 155_poultry_created_by_fk
Create Date: 2026-06-21

Cluster 4.2 (data-quality anchors). Strike #101/#103 mandate that every production
cycle carries a 3-Layer classification, but `tenant.production_cycles.layer` shipped
NULLable (migration 072) pending backfill + creation-path enforcement.

Prerequisite (shipped first): both creation paths now resolve layer via
cycle_service.resolve_layer() — caller value, else shared.productions.suggested_layer,
else reject (borderline). So no NEW cycle can be created with a NULL layer.

This migration closes the loop:
  1. backfill existing NULLs from the production's seeded suggested_layer (operator-
     reviewed per Strike #103). As of 2026-06-21 the only NULL is the F001 CASSAVA
     cycle → FOOD_SECURITY (suggested + doctrine-explicit "Pacific staple").
  2. ALTER COLUMN layer SET NOT NULL.

If any NULL remains after step 1 (a borderline crop with no suggestion), step 2 fails
atomically — nothing changes — and the borderline cycle must be classified first via
the Strike #104a backfill banner / PATCH /cycles/{id}/classify-layer.

asyncpg: one statement per op.execute (Strike #72). Apply as owner (Strike #123) — the
backfill must see all tenants' NULL rows (BYPASSRLS). rev id 24 chars (<= 32, B41).
"""
from alembic import op

revision = "156_cycle_layer_not_null"
down_revision = "155_poultry_created_by_fk"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        """
        UPDATE tenant.production_cycles pc
        SET layer = p.suggested_layer
        FROM shared.productions p
        WHERE pc.production_id = p.production_id
          AND pc.layer IS NULL
          AND p.suggested_layer IS NOT NULL
        """
    )
    op.execute(
        "ALTER TABLE tenant.production_cycles ALTER COLUMN layer SET NOT NULL"
    )


def downgrade():
    op.execute(
        "ALTER TABLE tenant.production_cycles ALTER COLUMN layer DROP NOT NULL"
    )
