"""016b - Fix validate_rotation() alternatives subquery (rotation_top_choices drift)

Revision ID: 016b_fix_validate_rotation_alts
Revises: 016a_fix_cycle_status_drift
Create Date: 2026-04-15

The alternatives subquery in tenant.validate_rotation() referenced columns
that don't exist on shared.rotation_top_choices:

  Wrong reference          Real column
  ─────────────────────    ──────────────────────
  rtc.next_production_id   rtc.recommended_next_id
  rtc.next_production_name (no such — JOIN productions)
  rtc.rule_status          (lives on actionable_rules)
  rtc.min_rest_days        (lives on actionable_rules)
  rtc.current_production_id rtc.production_id

This migration replaces the entire function body with a corrected one
that uses real columns and JOINs actionable_rules + productions for
the rich payload.

Reversibility: best-effort no-op + WARNING (016a body was also broken).
"""
from alembic import op

revision = "016b_fix_validate_rotation_alts"
down_revision = "016a_fix_cycle_status_drift"
branch_labels = None
depends_on = None


NEW_FUNCTION_SQL = r"""
CREATE OR REPLACE FUNCTION tenant.validate_rotation(
    p_pu_id text, p_proposed_production_id text, p_proposed_planting_date date
)
RETURNS jsonb
LANGUAGE plpgsql
AS $func$
DECLARE
    v_last_production_id  TEXT;
    v_last_harvest_end    DATE;
    v_days_since          INT;
    v_rule                RECORD;
    v_rule_status         TEXT  := 'N/A';
    v_min_rest_days       INT   := 0;
    v_days_short          INT   := 0;
    v_allowed             BOOL  := true;
    v_enforcement         TEXT  := 'APPROVED';
    v_alternatives        JSONB := '[]'::JSONB;
BEGIN
    -- Find last completed cycle on this PU
    SELECT pc.production_id, pc.actual_harvest_end
    INTO   v_last_production_id, v_last_harvest_end
    FROM   tenant.production_cycles pc
    WHERE  pc.pu_id = p_pu_id
      AND  pc.cycle_status = 'CLOSED'
      AND  pc.actual_harvest_end IS NOT NULL
    ORDER BY pc.actual_harvest_end DESC
    LIMIT  1;

    IF v_last_production_id IS NULL THEN
        RETURN jsonb_build_object(
            'allowed',                    true,
            'enforcement_decision',       'APPROVED',
            'rule_status',                'N/A',
            'min_rest_days',              0,
            'days_short',                 0,
            'days_since_last_harvest',    NULL,
            'rotation_key',               NULL,
            'current_production_id',      NULL,
            'previous_production_id',     NULL,
            'alternatives',               '[]'::JSONB
        );
    END IF;

    v_days_since := (p_proposed_planting_date - v_last_harvest_end)::INT;

    -- Look up rotation rule
    SELECT ar.rule_status, ar.min_rest_days
    INTO   v_rule
    FROM   shared.actionable_rules ar
    WHERE  ar.current_production_id = v_last_production_id
      AND  ar.next_production_id    = p_proposed_production_id
    LIMIT  1;

    IF FOUND THEN
        v_rule_status   := v_rule.rule_status;
        v_min_rest_days := COALESCE(v_rule.min_rest_days, 0);
    ELSE
        v_rule_status   := 'OK';
        v_min_rest_days := 0;
    END IF;

    IF v_rule_status = 'BLOCK' AND v_days_since < v_min_rest_days THEN
        v_allowed     := false;
        v_enforcement := 'BLOCKED';
    ELSIF v_rule_status = 'AVOID' THEN
        v_allowed     := true;
        v_enforcement := 'OVERRIDE_REQUIRED';
    END IF;

    IF v_min_rest_days > v_days_since THEN
        v_days_short := v_min_rest_days - v_days_since;
    ELSE
        v_days_short := 0;
    END IF;

    -- Top 3 alternatives — JOIN rotation_top_choices + productions + actionable_rules.
    -- Real cols: rtc.production_id, rtc.choice_rank, rtc.recommended_next_id, rtc.reason
    SELECT COALESCE(jsonb_agg(alt_obj ORDER BY choice_rank), '[]'::JSONB)
    INTO   v_alternatives
    FROM (
        SELECT
            jsonb_build_object(
                'production_id',   rtc.recommended_next_id,
                'production_name', p.production_name,
                'reason',          rtc.reason,
                'rule_status',     COALESCE(ar.rule_status, 'OK'),
                'min_rest_days',   COALESCE(ar.min_rest_days, 0)
            ) AS alt_obj,
            rtc.choice_rank
        FROM shared.rotation_top_choices rtc
        JOIN shared.productions p ON p.production_id = rtc.recommended_next_id
        LEFT JOIN shared.actionable_rules ar
            ON ar.current_production_id = rtc.production_id
           AND ar.next_production_id    = rtc.recommended_next_id
        WHERE rtc.production_id        = v_last_production_id
          AND rtc.recommended_next_id <> p_proposed_production_id
        ORDER BY rtc.choice_rank
        LIMIT 3
    ) sub;

    RETURN jsonb_build_object(
        'allowed',                    v_allowed,
        'enforcement_decision',       v_enforcement,
        'rule_status',                v_rule_status,
        'min_rest_days',              v_min_rest_days,
        'days_short',                 v_days_short,
        'days_since_last_harvest',    v_days_since,
        'rotation_key',               v_last_production_id || '->' || p_proposed_production_id,
        'current_production_id',      p_proposed_production_id,
        'previous_production_id',     v_last_production_id,
        'alternatives',               v_alternatives
    );
END;
$func$;
"""


def upgrade():
    op.execute(NEW_FUNCTION_SQL)


def downgrade():
    op.execute(
        "DO $$ BEGIN RAISE WARNING "
        "'016b downgrade is no-op: pre-016b alternatives subquery referenced "
        "non-existent columns on shared.rotation_top_choices.'; END $$"
    )
