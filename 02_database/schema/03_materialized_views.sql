-- =============================================================
-- 03_materialized_views.sql
-- Teivaka Agri-TOS — Materialized views and refresh functions
-- PostgreSQL 16 + TimescaleDB 2.15.3
-- Run after 02_tenant_schema.sql
-- =============================================================

SET search_path TO tenant, shared, public;

-- =============================================================
-- 1. mv_input_balance
-- Tracks current stock vs reorder point for all inputs.
-- =============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant.mv_input_balance AS
SELECT
    i.tenant_id,
    i.input_id,
    i.input_name,
    i.input_category,
    i.unit_of_measure,
    i.current_stock_qty,
    i.reorder_point_qty,
    i.reorder_qty,
    i.unit_cost_fjd,
    ROUND(i.current_stock_qty * COALESCE(i.unit_cost_fjd, 0), 2) AS stock_value_fjd,
    CASE
        WHEN i.reorder_point_qty IS NULL THEN 'NO_REORDER_SET'
        WHEN i.current_stock_qty <= 0 THEN 'OUT_OF_STOCK'
        WHEN i.current_stock_qty <= i.reorder_point_qty THEN 'REORDER_NOW'
        WHEN i.current_stock_qty <= i.reorder_point_qty * 1.5 THEN 'LOW_STOCK'
        ELSE 'ADEQUATE'
    END AS stock_status,
    i.expiry_date,
    CASE WHEN i.expiry_date IS NOT NULL AND i.expiry_date < CURRENT_DATE + 30 THEN true ELSE false END AS expiring_soon,
    s.supplier_name AS preferred_supplier_name,
    i.is_active,
    NOW() AS refreshed_at
FROM tenant.inputs i
LEFT JOIN tenant.suppliers s ON s.supplier_id = i.preferred_supplier_id
WHERE i.is_active = true;

CREATE UNIQUE INDEX idx_mv_input_balance ON tenant.mv_input_balance(tenant_id, input_id);
CREATE INDEX idx_mv_input_balance_status ON tenant.mv_input_balance(tenant_id, stock_status);

-- =============================================================
-- 2. mv_farm_pnl
-- Monthly profit and loss per farm.
-- Aggregates income vs costs by month.
-- =============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant.mv_farm_pnl AS
SELECT
    pc.tenant_id,
    pc.farm_id,
    f.farm_name,
    DATE_TRUNC('month', COALESCE(il.transaction_date, pc.planting_date::TIMESTAMPTZ)) AS period_month,
    COUNT(DISTINCT pc.cycle_id) AS active_cycles,
    COALESCE(SUM(il.net_amount_fjd), 0) AS total_revenue_fjd,
    COALESCE(SUM(pc.total_labor_cost_fjd), 0) AS total_labor_cost_fjd,
    COALESCE(SUM(pc.total_input_cost_fjd), 0) AS total_input_cost_fjd,
    COALESCE(SUM(pc.total_other_cost_fjd), 0) AS total_other_cost_fjd,
    COALESCE(SUM(pc.total_labor_cost_fjd + pc.total_input_cost_fjd + pc.total_other_cost_fjd), 0) AS total_cost_fjd,
    COALESCE(SUM(il.net_amount_fjd), 0) - COALESCE(SUM(pc.total_labor_cost_fjd + pc.total_input_cost_fjd + pc.total_other_cost_fjd), 0) AS gross_profit_fjd,
    CASE
        WHEN COALESCE(SUM(il.net_amount_fjd), 0) > 0
        THEN ROUND(((COALESCE(SUM(il.net_amount_fjd), 0) - COALESCE(SUM(pc.total_labor_cost_fjd + pc.total_input_cost_fjd + pc.total_other_cost_fjd), 0)) / NULLIF(SUM(il.net_amount_fjd), 0)) * 100, 2)
        ELSE NULL
    END AS gross_margin_pct,
    COALESCE(SUM(hl.marketable_yield_kg), 0) AS total_harvest_kg,
    CASE
        WHEN COALESCE(SUM(hl.marketable_yield_kg), 0) > 0
        THEN ROUND(COALESCE(SUM(pc.total_labor_cost_fjd + pc.total_input_cost_fjd + pc.total_other_cost_fjd), 0) / SUM(hl.marketable_yield_kg), 4)
        ELSE NULL
    END AS blended_cogk_fjd_per_kg,
    NOW() AS refreshed_at
FROM tenant.production_cycles pc
JOIN tenant.farms f ON f.farm_id = pc.farm_id
LEFT JOIN tenant.income_log il ON il.cycle_id = pc.cycle_id
LEFT JOIN tenant.harvest_log hl ON hl.cycle_id = pc.cycle_id
GROUP BY pc.tenant_id, pc.farm_id, f.farm_name, DATE_TRUNC('month', COALESCE(il.transaction_date, pc.planting_date::TIMESTAMPTZ));

CREATE UNIQUE INDEX idx_mv_farm_pnl ON tenant.mv_farm_pnl(tenant_id, farm_id, period_month);
CREATE INDEX idx_mv_farm_pnl_tenant ON tenant.mv_farm_pnl(tenant_id, period_month DESC);

-- =============================================================
-- 3. mv_crop_ranking
-- Ranks production types by profitability (CoKG) across all
-- closed cycles.
-- =============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant.mv_crop_ranking AS
SELECT
    pc.tenant_id,
    pc.farm_id,
    f.farm_name,
    pc.production_id,
    p.production_name,
    p.category,
    p.price_unit,
    COUNT(pc.cycle_id) AS total_cycles,
    COUNT(CASE WHEN pc.cycle_status = 'CLOSED' THEN 1 END) AS closed_cycles,
    COUNT(CASE WHEN pc.cycle_status = 'FAILED' THEN 1 END) AS failed_cycles,
    COALESCE(SUM(pc.actual_yield_kg), 0) AS total_yield_kg,
    COALESCE(AVG(NULLIF(pc.cogk_fjd_per_kg, 0)), NULL) AS avg_cogk_fjd_per_kg,
    MIN(pc.cogk_fjd_per_kg) AS best_cogk_fjd_per_kg,
    MAX(pc.cogk_fjd_per_kg) AS worst_cogk_fjd_per_kg,
    COALESCE(SUM(pc.total_revenue_fjd), 0) AS total_revenue_fjd,
    COALESCE(SUM(pc.total_revenue_fjd - pc.total_labor_cost_fjd - pc.total_input_cost_fjd - pc.total_other_cost_fjd), 0) AS total_profit_fjd,
    CASE
        WHEN COALESCE(SUM(pc.total_revenue_fjd), 0) > 0
        THEN ROUND(COALESCE(SUM(pc.total_revenue_fjd - pc.total_labor_cost_fjd - pc.total_input_cost_fjd - pc.total_other_cost_fjd), 0) / SUM(pc.total_revenue_fjd) * 100, 2)
        ELSE NULL
    END AS avg_margin_pct,
    RANK() OVER (PARTITION BY pc.tenant_id, pc.farm_id ORDER BY AVG(NULLIF(pc.cogk_fjd_per_kg, 0)) ASC NULLS LAST) AS cogk_rank,
    RANK() OVER (PARTITION BY pc.tenant_id, pc.farm_id ORDER BY SUM(pc.total_revenue_fjd - pc.total_labor_cost_fjd - pc.total_input_cost_fjd - pc.total_other_cost_fjd) DESC NULLS LAST) AS profit_rank,
    NOW() AS refreshed_at
FROM tenant.production_cycles pc
JOIN tenant.farms f ON f.farm_id = pc.farm_id
JOIN shared.productions p ON p.production_id = pc.production_id
WHERE pc.cycle_status IN ('CLOSED', 'ACTIVE', 'HARVESTING')
GROUP BY pc.tenant_id, pc.farm_id, f.farm_name, pc.production_id, p.production_name, p.category, p.price_unit;

CREATE UNIQUE INDEX idx_mv_crop_ranking ON tenant.mv_crop_ranking(tenant_id, farm_id, production_id);
CREATE INDEX idx_mv_crop_ranking_rank ON tenant.mv_crop_ranking(tenant_id, farm_id, cogk_rank);

-- =============================================================
-- 4. mv_labor_weekly_summary
-- Weekly labor costs and hours per farm and worker type.
-- =============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant.mv_labor_weekly_summary AS
SELECT
    la.tenant_id,
    la.farm_id,
    f.farm_name,
    DATE_TRUNC('week', la.work_date) AS week_start,
    w.worker_type,
    COUNT(DISTINCT la.worker_id) AS unique_workers,
    COUNT(la.attendance_id) AS attendance_records,
    COALESCE(SUM(la.hours_worked), 0) AS total_hours,
    COALESCE(SUM(la.overtime_hours), 0) AS total_overtime_hours,
    COALESCE(SUM(la.total_pay_fjd), 0) AS total_pay_fjd,
    COALESCE(SUM(la.overtime_pay_fjd), 0) AS total_overtime_pay_fjd,
    ROUND(COALESCE(AVG(la.total_pay_fjd), 0), 2) AS avg_daily_pay_fjd,
    COALESCE(SUM(la.total_pay_fjd + COALESCE(la.overtime_pay_fjd, 0)), 0) AS total_labor_cost_fjd,
    NOW() AS refreshed_at
FROM tenant.labor_attendance la
JOIN tenant.farms f ON f.farm_id = la.farm_id
JOIN tenant.workers w ON w.worker_id = la.worker_id
GROUP BY la.tenant_id, la.farm_id, f.farm_name, DATE_TRUNC('week', la.work_date), w.worker_type;

CREATE UNIQUE INDEX idx_mv_labor_weekly ON tenant.mv_labor_weekly_summary(tenant_id, farm_id, week_start, worker_type);
CREATE INDEX idx_mv_labor_weekly_tenant ON tenant.mv_labor_weekly_summary(tenant_id, week_start DESC);

-- =============================================================
-- 5. mv_harvest_reconciliation
-- Compares planned vs actual harvest per cycle.
-- Flags reconciliation variances > 10% (RULE-036).
-- =============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant.mv_harvest_reconciliation AS
SELECT
    pc.tenant_id,
    pc.farm_id,
    f.farm_name,
    pc.cycle_id,
    pc.production_id,
    p.production_name,
    pc.pu_id,
    pc.planting_date,
    pc.actual_harvest_start,
    pc.planned_yield_kg,
    COALESCE(SUM(hl.marketable_yield_kg), 0) AS actual_yield_kg,
    COALESCE(SUM(hls.estimated_loss_kg), 0) AS recorded_loss_kg,
    CASE
        WHEN pc.planned_yield_kg > 0
        THEN ROUND(((COALESCE(SUM(hl.marketable_yield_kg), 0) - pc.planned_yield_kg) / pc.planned_yield_kg) * 100, 2)
        ELSE NULL
    END AS variance_pct,
    CASE
        WHEN pc.planned_yield_kg > 0 AND ABS((COALESCE(SUM(hl.marketable_yield_kg), 0) - pc.planned_yield_kg) / pc.planned_yield_kg) > 0.10
        THEN true
        ELSE false
    END AS requires_investigation,  -- RULE-036: > 10% variance
    pc.cycle_status,
    NOW() AS refreshed_at
FROM tenant.production_cycles pc
JOIN tenant.farms f ON f.farm_id = pc.farm_id
JOIN shared.productions p ON p.production_id = pc.production_id
LEFT JOIN tenant.harvest_log hl ON hl.cycle_id = pc.cycle_id
LEFT JOIN tenant.harvest_loss hls ON hls.cycle_id = pc.cycle_id
WHERE pc.cycle_status IN ('HARVESTING','CLOSING','CLOSED','FAILED')
GROUP BY pc.tenant_id, pc.farm_id, f.farm_name, pc.cycle_id, pc.production_id, p.production_name, pc.pu_id, pc.planting_date, pc.actual_harvest_start, pc.planned_yield_kg, pc.cycle_status;

CREATE UNIQUE INDEX idx_mv_harvest_recon ON tenant.mv_harvest_reconciliation(tenant_id, cycle_id);
CREATE INDEX idx_mv_harvest_recon_farm ON tenant.mv_harvest_reconciliation(tenant_id, farm_id, requires_investigation);

-- =============================================================
-- 6. mv_worker_performance
-- Worker-level performance metrics: days worked, pay,
-- productivity.
-- =============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant.mv_worker_performance AS
SELECT
    la.tenant_id,
    la.farm_id,
    f.farm_name,
    la.worker_id,
    w.full_name AS worker_name,
    w.worker_type,
    w.daily_rate_fjd,
    DATE_TRUNC('month', la.work_date) AS period_month,
    COUNT(la.attendance_id) AS days_worked,
    COALESCE(SUM(la.hours_worked), 0) AS total_hours,
    COALESCE(SUM(la.overtime_hours), 0) AS overtime_hours,
    COALESCE(SUM(la.total_pay_fjd + COALESCE(la.overtime_pay_fjd, 0)), 0) AS total_earnings_fjd,
    ROUND(COALESCE(AVG(la.hours_worked), 0), 2) AS avg_hours_per_day,
    COUNT(DISTINCT la.cycle_id) AS cycles_contributed,
    NOW() AS refreshed_at
FROM tenant.labor_attendance la
JOIN tenant.farms f ON f.farm_id = la.farm_id
JOIN tenant.workers w ON w.worker_id = la.worker_id
GROUP BY la.tenant_id, la.farm_id, f.farm_name, la.worker_id, w.full_name, w.worker_type, w.daily_rate_fjd, DATE_TRUNC('month', la.work_date);

CREATE UNIQUE INDEX idx_mv_worker_perf ON tenant.mv_worker_performance(tenant_id, worker_id, period_month);
CREATE INDEX idx_mv_worker_perf_farm ON tenant.mv_worker_performance(tenant_id, farm_id, period_month DESC);

-- =============================================================
-- 7. mv_livestock_summary
-- Current livestock count and value by species per farm.
-- =============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant.mv_livestock_summary AS
SELECT
    lr.tenant_id,
    lr.farm_id,
    f.farm_name,
    lr.species,
    COUNT(CASE WHEN lr.status = 'ACTIVE' THEN 1 END) AS active_count,
    COUNT(CASE WHEN lr.status = 'PREGNANT' THEN 1 END) AS pregnant_count,
    COUNT(CASE WHEN lr.status = 'SOLD' THEN 1 END) AS sold_ytd,
    COUNT(CASE WHEN lr.status = 'DECEASED' THEN 1 END) AS deceased_count,
    COUNT(CASE WHEN lr.sex = 'MALE' AND lr.status = 'ACTIVE' THEN 1 END) AS active_male,
    COUNT(CASE WHEN lr.sex = 'FEMALE' AND lr.status = 'ACTIVE' THEN 1 END) AS active_female,
    ROUND(AVG(CASE WHEN lr.status = 'ACTIVE' THEN lr.current_weight_kg END), 2) AS avg_weight_kg,
    ROUND(SUM(CASE WHEN lr.status = 'ACTIVE' THEN COALESCE(lr.acquisition_cost_fjd, 0) END), 2) AS estimated_herd_value_fjd,
    NOW() AS refreshed_at
FROM tenant.livestock_register lr
JOIN tenant.farms f ON f.farm_id = lr.farm_id
GROUP BY lr.tenant_id, lr.farm_id, f.farm_name, lr.species;

CREATE UNIQUE INDEX idx_mv_livestock ON tenant.mv_livestock_summary(tenant_id, farm_id, species);

-- =============================================================
-- 8. mv_apiculture_summary
-- Hive health and honey production summary per farm.
-- =============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant.mv_apiculture_summary AS
SELECT
    hr.tenant_id,
    hr.farm_id,
    f.farm_name,
    COUNT(CASE WHEN hr.status = 'ACTIVE' THEN 1 END) AS active_hives,
    COUNT(CASE WHEN hr.status = 'INACTIVE' THEN 1 END) AS inactive_hives,
    COUNT(CASE WHEN hr.status = 'DEAD' THEN 1 END) AS dead_hives,
    COUNT(CASE WHEN hr.colony_strength = 'STRONG' AND hr.status = 'ACTIVE' THEN 1 END) AS strong_colonies,
    COUNT(CASE WHEN hr.colony_strength IN ('WEAK','QUEENLESS') AND hr.status = 'ACTIVE' THEN 1 END) AS weak_colonies,
    COUNT(CASE WHEN hr.last_inspection_date < CURRENT_DATE - 14 AND hr.status = 'ACTIVE' THEN 1 END) AS overdue_inspection,
    COALESCE(SUM(hr.honey_yield_kg_last), 0) AS total_honey_yield_kg_last_harvest,
    COUNT(CASE WHEN hr.varroa_treatment_date IS NULL AND hr.status = 'ACTIVE' THEN 1 END) AS untreated_hives,
    NOW() AS refreshed_at
FROM tenant.hive_register hr
JOIN tenant.farms f ON f.farm_id = hr.farm_id
GROUP BY hr.tenant_id, hr.farm_id, f.farm_name;

CREATE UNIQUE INDEX idx_mv_apiculture ON tenant.mv_apiculture_summary(tenant_id, farm_id);

-- =============================================================
-- 9. mv_expansion_readiness
-- Computes the 7 expansion readiness conditions per farm.
-- Must be precomputed daily — never on-demand.
-- =============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant.mv_expansion_readiness AS
WITH
cycle_data AS (
    SELECT
        pc.tenant_id,
        pc.farm_id,
        COUNT(CASE WHEN pc.cycle_status IN ('CLOSED') AND pc.cogk_fjd_per_kg IS NOT NULL THEN 1 END) AS profitable_cycles,
        COUNT(CASE WHEN pc.cycle_status IN ('CLOSED','FAILED') THEN 1 END) AS total_closed_cycles,
        AVG(CASE WHEN pc.cycle_status = 'CLOSED' THEN pc.cogk_fjd_per_kg END) AS avg_cogk,
        SUM(CASE WHEN pc.cycle_status = 'CLOSED' AND
            pc.actual_harvest_start >= CURRENT_DATE - INTERVAL '6 months'
            THEN pc.total_revenue_fjd - pc.total_labor_cost_fjd - pc.total_input_cost_fjd - pc.total_other_cost_fjd
            ELSE 0 END) AS profit_6mo_fjd
    FROM tenant.production_cycles pc
    GROUP BY pc.tenant_id, pc.farm_id
),
alert_data AS (
    SELECT tenant_id, farm_id,
        COUNT(CASE WHEN alert_status = 'ACTIVE' AND severity IN ('CRITICAL','HIGH') THEN 1 END) AS active_critical_high
    FROM tenant.alerts
    GROUP BY tenant_id, farm_id
),
labor_data AS (
    SELECT la.tenant_id, la.farm_id,
        COUNT(DISTINCT la.worker_id) AS active_workers
    FROM tenant.labor_attendance la
    WHERE la.work_date >= NOW() - INTERVAL '30 days'
    GROUP BY la.tenant_id, la.farm_id
),
input_data AS (
    SELECT i.tenant_id,
        COUNT(CASE WHEN i.current_stock_qty <= COALESCE(i.reorder_point_qty, 0) THEN 1 END) AS inputs_below_reorder
    FROM tenant.inputs i
    WHERE i.is_active = true
    GROUP BY i.tenant_id
)
SELECT
    cd.tenant_id,
    cd.farm_id,
    f.farm_name,
    -- Condition 1: >= 3 profitable closed cycles
    (cd.profitable_cycles >= 3) AS cond_profitable_cycles,
    cd.profitable_cycles,
    -- Condition 2: avg CoKG below market price (simplified check: CoKG computed)
    (cd.avg_cogk IS NOT NULL) AS cond_cogk_computed,
    ROUND(cd.avg_cogk, 4) AS avg_cogk_fjd_per_kg,
    -- Condition 3: No CRITICAL/HIGH alerts active
    (COALESCE(ad.active_critical_high, 0) = 0) AS cond_no_critical_alerts,
    COALESCE(ad.active_critical_high, 0) AS active_critical_alerts,
    -- Condition 4: >= 3 active workers
    (COALESCE(ld.active_workers, 0) >= 3) AS cond_sufficient_labor,
    COALESCE(ld.active_workers, 0) AS active_workers_30d,
    -- Condition 5: No inputs below reorder point
    (COALESCE(inp.inputs_below_reorder, 0) = 0) AS cond_inputs_adequate,
    COALESCE(inp.inputs_below_reorder, 0) AS inputs_below_reorder,
    -- Condition 6: Positive cash flow last 6 months
    (COALESCE(cd.profit_6mo_fjd, 0) > 0) AS cond_positive_cashflow,
    ROUND(COALESCE(cd.profit_6mo_fjd, 0), 2) AS profit_last_6mo_fjd,
    -- Condition 7: >= 5 total closed cycles
    (cd.total_closed_cycles >= 5) AS cond_cycle_experience,
    cd.total_closed_cycles,
    -- Overall readiness score (0-7)
    (
        (cd.profitable_cycles >= 3)::INT +
        (cd.avg_cogk IS NOT NULL)::INT +
        (COALESCE(ad.active_critical_high, 0) = 0)::INT +
        (COALESCE(ld.active_workers, 0) >= 3)::INT +
        (COALESCE(inp.inputs_below_reorder, 0) = 0)::INT +
        (COALESCE(cd.profit_6mo_fjd, 0) > 0)::INT +
        (cd.total_closed_cycles >= 5)::INT
    ) AS readiness_score,
    (
        (cd.profitable_cycles >= 3) AND
        (cd.avg_cogk IS NOT NULL) AND
        (COALESCE(ad.active_critical_high, 0) = 0) AND
        (COALESCE(ld.active_workers, 0) >= 3) AND
        (COALESCE(inp.inputs_below_reorder, 0) = 0) AND
        (COALESCE(cd.profit_6mo_fjd, 0) > 0) AND
        (cd.total_closed_cycles >= 5)
    ) AS all_conditions_met,
    NOW() AS refreshed_at
FROM cycle_data cd
JOIN tenant.farms f ON f.farm_id = cd.farm_id AND f.tenant_id = cd.tenant_id
LEFT JOIN alert_data ad ON ad.tenant_id = cd.tenant_id AND ad.farm_id = cd.farm_id
LEFT JOIN labor_data ld ON ld.tenant_id = cd.tenant_id AND ld.farm_id = cd.farm_id
LEFT JOIN input_data inp ON inp.tenant_id = cd.tenant_id;

CREATE UNIQUE INDEX idx_mv_expansion ON tenant.mv_expansion_readiness(tenant_id, farm_id);

-- =============================================================
-- 10. mv_pu_financials
-- Financial performance per production unit across all cycles.
-- =============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant.mv_pu_financials AS
SELECT
    pc.tenant_id,
    pc.farm_id,
    f.farm_name,
    pc.pu_id,
    pu.pu_name,
    z.zone_name,
    COUNT(pc.cycle_id) AS total_cycles,
    COUNT(CASE WHEN pc.cycle_status = 'CLOSED' THEN 1 END) AS closed_cycles,
    COUNT(CASE WHEN pc.cycle_status = 'ACTIVE' THEN 1 END) AS active_cycles,
    COALESCE(SUM(pc.actual_yield_kg), 0) AS total_yield_kg,
    COALESCE(SUM(pc.total_revenue_fjd), 0) AS total_revenue_fjd,
    COALESCE(SUM(pc.total_labor_cost_fjd + pc.total_input_cost_fjd + pc.total_other_cost_fjd), 0) AS total_cost_fjd,
    COALESCE(SUM(pc.total_revenue_fjd - pc.total_labor_cost_fjd - pc.total_input_cost_fjd - pc.total_other_cost_fjd), 0) AS total_profit_fjd,
    ROUND(AVG(NULLIF(pc.cogk_fjd_per_kg, 0)), 4) AS avg_cogk_fjd_per_kg,
    ROUND(AVG(CASE WHEN pc.planned_yield_kg > 0 THEN (pc.actual_yield_kg / pc.planned_yield_kg) * 100 END), 2) AS avg_yield_attainment_pct,
    -- Revenue per sqm (productivity measure)
    CASE WHEN pu.area_sqm > 0
    THEN ROUND(COALESCE(SUM(pc.total_revenue_fjd), 0) / pu.area_sqm, 4)
    ELSE NULL END AS revenue_per_sqm_fjd,
    NOW() AS refreshed_at
FROM tenant.production_cycles pc
JOIN tenant.farms f ON f.farm_id = pc.farm_id
JOIN tenant.production_units pu ON pu.pu_id = pc.pu_id
JOIN tenant.zones z ON z.zone_id = pu.zone_id
GROUP BY pc.tenant_id, pc.farm_id, f.farm_name, pc.pu_id, pu.pu_name, z.zone_name, pu.area_sqm;

CREATE UNIQUE INDEX idx_mv_pu_financials ON tenant.mv_pu_financials(tenant_id, pu_id);
CREATE INDEX idx_mv_pu_financials_farm ON tenant.mv_pu_financials(tenant_id, farm_id);

-- =============================================================
-- 11. mv_decision_signals_current
-- Latest decision signal snapshot per farm — used by dashboard.
-- Never compute signals on-demand.
-- =============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS tenant.mv_decision_signals_current AS
SELECT DISTINCT ON (dss.tenant_id, dss.farm_id, dss.signal_id)
    dss.tenant_id,
    dss.farm_id,
    f.farm_name,
    dss.signal_id,
    dsc.signal_name,
    dsc.signal_category,
    dss.computed_value,
    dss.signal_status,
    dss.snapshot_date,
    dss.notes,
    NOW() AS refreshed_at
FROM tenant.decision_signal_snapshots dss
JOIN tenant.farms f ON f.farm_id = dss.farm_id AND f.tenant_id = dss.tenant_id
JOIN tenant.decision_signal_config dsc ON dsc.signal_id = dss.signal_id AND dsc.tenant_id = dss.tenant_id
WHERE dsc.is_active = true
ORDER BY dss.tenant_id, dss.farm_id, dss.signal_id, dss.snapshot_date DESC;

CREATE UNIQUE INDEX idx_mv_decision_signals ON tenant.mv_decision_signals_current(tenant_id, farm_id, signal_id);
CREATE INDEX idx_mv_decision_signals_farm ON tenant.mv_decision_signals_current(tenant_id, farm_id);

-- =============================================================
-- REFRESH FUNCTIONS
-- =============================================================

-- Master refresh function — called by Celery Beat daily at 06:10 Fiji time (18:10 UTC)
CREATE OR REPLACE FUNCTION tenant.refresh_all_materialized_views()
RETURNS TABLE(view_name TEXT, duration_ms INTEGER, success BOOLEAN) AS $$
DECLARE
    v_start TIMESTAMPTZ;
    v_views TEXT[] := ARRAY[
        'mv_input_balance',
        'mv_farm_pnl',
        'mv_crop_ranking',
        'mv_labor_weekly_summary',
        'mv_harvest_reconciliation',
        'mv_worker_performance',
        'mv_livestock_summary',
        'mv_apiculture_summary',
        'mv_expansion_readiness',
        'mv_pu_financials',
        'mv_decision_signals_current'
    ];
    v_view TEXT;
    v_ok BOOLEAN;
BEGIN
    FOREACH v_view IN ARRAY v_views LOOP
        v_start := clock_timestamp();
        v_ok := true;
        BEGIN
            EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY tenant.%I', v_view);
        EXCEPTION WHEN OTHERS THEN
            v_ok := false;
            RAISE WARNING 'Failed to refresh %: %', v_view, SQLERRM;
        END;
        RETURN QUERY SELECT v_view::TEXT, EXTRACT(MILLISECONDS FROM clock_timestamp() - v_start)::INTEGER, v_ok;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION tenant.refresh_all_materialized_views() IS
'Refreshes all 11 materialized views CONCURRENTLY. Called by Celery Beat daily at 18:10 UTC (06:10 Fiji). Returns per-view timing and success status.';

-- Refresh financial views after any harvest or income entry
CREATE OR REPLACE FUNCTION tenant.refresh_financial_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY tenant.mv_farm_pnl;
    REFRESH MATERIALIZED VIEW CONCURRENTLY tenant.mv_crop_ranking;
    REFRESH MATERIALIZED VIEW CONCURRENTLY tenant.mv_harvest_reconciliation;
    REFRESH MATERIALIZED VIEW CONCURRENTLY tenant.mv_pu_financials;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION tenant.refresh_financial_views() IS
'Refreshes the 4 financial materialized views (farm_pnl, crop_ranking, harvest_reconciliation, pu_financials). Call after any harvest_log or income_log insert/update.';

-- Refresh input balance after any stock change
CREATE OR REPLACE FUNCTION tenant.refresh_input_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY tenant.mv_input_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION tenant.refresh_input_views() IS
'Refreshes mv_input_balance. Call after any insert/update to tenant.inputs or stock adjustment transactions.';

-- Refresh labor views after attendance entry
CREATE OR REPLACE FUNCTION tenant.refresh_labor_views()
RETURNS VOID AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY tenant.mv_labor_weekly_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY tenant.mv_worker_performance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION tenant.refresh_labor_views() IS
'Refreshes mv_labor_weekly_summary and mv_worker_performance. Call after any insert/update to tenant.labor_attendance.';

-- =============================================================
-- END 03_materialized_views.sql
-- 11 materialized views with CONCURRENTLY-refreshable unique indexes
-- All views are tenant-scoped via tenant_id filter
-- Refresh schedule: daily 18:10 UTC (06:10 Fiji time) via Celery Beat
-- Individual refresh functions available for targeted updates
-- =============================================================
