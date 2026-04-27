"""Phase CashUI-1a-pre — extend audit.events event_type allow-list with cash CRUD types

Revision ID: 032_audit_event_type_cash
Revises: 031_audit_report_exports
Create Date: 2026-04-27

Adds three event types to `audit_events_event_type_valid` so cash ledger
mutations (CashUI-1a) can land in the audit hash chain alongside tasks,
harvests, etc:

    CASH_LOGGED   — INSERT into tenant.cash_ledger
    CASH_UPDATED  — partial PATCH of an existing cash row
    CASH_DELETED  — hard delete of a cash row (no soft-delete columns
                    on cash_ledger today; the audit row is the only
                    record of the deletion)

Why now: the Bank Evidence PDF (PDFv1) chain-proves bank-relevant
events. Cash IS the line item the bank reads. If cash mutations are
not in the chain, the cryptographic-proof claim has a hole exactly
where it matters most. PAYMENT_RECEIVED / PAYMENT_SENT could piggyback
INSERT but UPDATE/DELETE have no clean analog — adding the three cash
types up front avoids dual representation and a future backfill.

Naming follows the existing entity-action convention
(HARVEST_LOGGED, LABOR_LOGGED, INVENTORY_ADJUSTED).

Pure CHECK-constraint swap. No data movement. Reversible. Migrations
run as the teivaka superuser via DATABASE_URL env override (per the
030 hotfix role split — teivaka_app lacks DDL privileges).
"""
from alembic import op


revision = '032_audit_event_type_cash'
down_revision = '031_audit_report_exports'
branch_labels = None
depends_on = None


def _exec_each(statements):
    for stmt in statements:
        op.execute(stmt)


def upgrade() -> None:
    _exec_each([
        "ALTER TABLE audit.events DROP CONSTRAINT audit_events_event_type_valid",
        """
        ALTER TABLE audit.events ADD CONSTRAINT audit_events_event_type_valid CHECK (
            event_type IN (
                -- existing 26 (verbatim from snapshot prior to 032)
                'TASK_COMPLETED', 'TASK_SKIPPED', 'TASK_CANCELLED', 'TASK_EXPIRED',
                'HARVEST_LOGGED', 'CHEMICAL_APPLIED',
                'CYCLE_CREATED', 'CYCLE_CLOSED', 'CYCLE_TRANSITION',
                'ROTATION_OVERRIDE', 'COMPLIANCE_OVERRIDE',
                'PAYMENT_RECEIVED', 'PAYMENT_SENT',
                'LABOR_LOGGED', 'INVENTORY_ADJUSTED', 'ALERT_RESOLVED',
                'USER_INVITED', 'FARM_CREATED', 'FARM_CLOSED', 'SUBSCRIPTION_CHANGED',
                'REFERRAL_ACTIVATED', 'BANK_PDF_GENERATED', 'CREDIT_SCORE_UPDATED',
                'ADVISORY_READ', 'ONBOARDING_STARTED', 'ONBOARDING_COMPLETED',
                -- new (3): cash CRUD chain coverage
                'CASH_LOGGED', 'CASH_UPDATED', 'CASH_DELETED'
            )
        )
        """,
    ])


def downgrade() -> None:
    # Restore the pre-032 26-value list. If any audit.events rows have
    # been written with the new cash event types they will violate the
    # restored CHECK and the constraint creation will fail. Resolve by
    # exporting / archiving those rows before downgrade — do NOT delete
    # them silently (audit log is append-only per migration 023).
    _exec_each([
        "ALTER TABLE audit.events DROP CONSTRAINT audit_events_event_type_valid",
        """
        ALTER TABLE audit.events ADD CONSTRAINT audit_events_event_type_valid CHECK (
            event_type IN (
                'TASK_COMPLETED', 'TASK_SKIPPED', 'TASK_CANCELLED', 'TASK_EXPIRED',
                'HARVEST_LOGGED', 'CHEMICAL_APPLIED',
                'CYCLE_CREATED', 'CYCLE_CLOSED', 'CYCLE_TRANSITION',
                'ROTATION_OVERRIDE', 'COMPLIANCE_OVERRIDE',
                'PAYMENT_RECEIVED', 'PAYMENT_SENT',
                'LABOR_LOGGED', 'INVENTORY_ADJUSTED', 'ALERT_RESOLVED',
                'USER_INVITED', 'FARM_CREATED', 'FARM_CLOSED', 'SUBSCRIPTION_CHANGED',
                'REFERRAL_ACTIVATED', 'BANK_PDF_GENERATED', 'CREDIT_SCORE_UPDATED',
                'ADVISORY_READ', 'ONBOARDING_STARTED', 'ONBOARDING_COMPLETED'
            )
        )
        """,
    ])
