"""Documentation marker — manual hotfix applied 2026-04-26

Revision ID: 030_force_tenant_rls
Revises: 029_tis_advisories
Create Date: 2026-04-26

HOTFIX (out-of-band): teivaka role bypass+superuser caused multi-tenancy
data leak. Postgres bootstrap-user constraint prevents demoting teivaka
via SQL — both self-demotion and demotion-by-peer-superuser fail with
"The bootstrap user must have the SUPERUSER attribute". Applied via
manual DDL instead of alembic upgrade:

  1. CREATE ROLE teivaka_app WITH NOSUPERUSER NOBYPASSRLS LOGIN
  2. GRANT SELECT/INSERT/UPDATE/DELETE on tenant/community/learning/
     audit/ops schemas to teivaka_app
  3. GRANT SELECT on shared schema (read-only seed catalog)
  4. GRANT INSERT on shared.kb_article_candidates and
     shared.attribution_events (the two runtime-writable shared tables
     per CLAUDE.md inviolable rule 7)
  5. ALTER TABLE tenant.* FORCE ROW LEVEL SECURITY (12 tables)
  6. .env DATABASE_URL switched from teivaka to teivaka_app
  7. API container restarted

teivaka stays as the bootstrap superuser (cannot be demoted, structural
Postgres rule). Only used for migrations + admin out-of-band SQL.
teivaka_app is the runtime API role; RLS policies now actually evaluate
against its connections because it has neither SUPERUSER nor BYPASSRLS.

This migration file is intentionally a no-op. It exists to mark the
chain as advanced past 029_tis_advisories so future migrations build on
top. Do NOT re-apply — manual DDL is already in production.

Phase 4.3a should formalize:
  - separate teivaka_admin (migrations only) from teivaka_app (runtime)
  - document credential storage path (currently password lives only in
    .env; admin password stored in operator memory)
  - audit endpoint tenant filters as defense-in-depth alongside RLS
  - extend FORCE RLS to the remaining ~30 policy-protected tables
    (recon found 41 total; 12 covered today, 29 covered transitively
    by the role split since teivaka_app simply doesn't bypass)
"""
from alembic import op  # noqa: F401 — kept for symmetry with other migrations


revision = "030_force_tenant_rls"
down_revision = "029_tis_advisories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """No-op. Manual DDL applied 2026-04-26 — see docstring."""
    pass


def downgrade() -> None:
    """No-op. Rollback would require:
      1. Edit .env DATABASE_URL back to teivaka
      2. Restart api
      3. ALTER TABLE tenant.* NO FORCE ROW LEVEL SECURITY (12 tables)
      4. DROP ROLE teivaka_app
    Run as superuser (teivaka). The role demotion of teivaka was never
    applied (bootstrap-user constraint blocked it), so no role rollback
    is needed.
    """
    pass
