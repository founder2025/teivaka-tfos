-- FILE: 02_database/schema/05_functions.sql
-- Teivaka Farm OS — PostgreSQL Functions, Triggers & Business Logic
-- All functions written in PL/pgSQL. Safe to re-run (CREATE OR REPLACE).
-- Requires schema files 01, 02, 03, 04 to have been applied first.

-- =============================================================================
-- 1. generate_farm_id()
--    Returns the next sequential farm ID: F001, F002, F003, ...
-- =============================================================================
CREATE OR REPLACE FUNCTION generate_farm_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_num  INT;
    v_next_id  TEXT;
BEGIN
    SELECT COALESCE(
        MAX(CAST(SUBSTRING(farm_id FROM 2) AS INT)),
        0
    )
    INTO v_max_num
    FROM farms
    WHERE farm_id ~ '^F[0-9]+$';

    v_next_id := 'F' || LPAD((v_max_num + 1)::TEXT, 3, '0');
    RETURN v_next_id;
END;
$$;

-- =============================================================================
-- 2. generate_zone_id(p_farm_id TEXT)
--    Returns the next zone ID for a given farm: FARM-Z01, FARM-Z02, ...
-- =============================================================================
CREATE OR REPLACE FUNCTION generate_zone_id(p_farm_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_num  INT;
    v_next_id  TEXT;
    v_pattern  TEXT;
BEGIN
    v_pattern := '^' || p_farm_id || '-Z[0-9]+$';

    SELECT COALESCE(
        MAX(CAST(SUBSTRING(zone_id FROM LENGTH(p_farm_id) + 3) AS INT)),
        0
    )
    INTO v_max_num
    FROM zones
    WHERE zone_id ~ v_pattern;

    v_next_id := p_farm_id || '-Z' || LPAD((v_max_num + 1)::TEXT, 2, '0');
    RETURN v_next_id;
END;
$$;

-- =============================================================================
-- 3. generate_pu_id(p_farm_id TEXT)
--    Returns the next production unit ID for a given farm: FARM-PU001, ...
-- =============================================================================
CREATE OR REPLACE FUNCTION generate_pu_id(p_farm_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_max_num  INT;
    v_next_id  TEXT;
    v_pattern  TEXT;
BEGIN
    v_pattern := '^' || p_farm_id || '-PU[0-9]+$';

    SELECT COALESCE(
        MAX(CAST(SUBSTRING(pu_id FROM LENGTH(p_farm_id) + 4) AS INT)),
        0
    )
    INTO v_max_num
    FROM production_units
    WHERE pu_id ~ v_pattern;

    v_next_id := p_farm_id || '-PU' || LPAD((v_max_num + 1)::TEXT, 3, '0');
    RETURN v_next_id;
END;
$$;

-- =============================================================================
-- 4. generate_cycle_id(p_farm_id TEXT, p_year INT)
--    Returns the next cycle ID: CY-FARM-YY-### (e.g. CY-F001-26-004)
-- =============================================================================
CREATE OR REPLACE FUNCTION generate_cycle_id(p_farm_id TEXT, p_year INT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_yy       TEXT;
    v_max_num  INT;
    v_prefix   TEXT;
    v_pattern  TEXT;
    v_next_id  TEXT;
BEGIN
    v_yy      := LPAD((p_year % 100)::TEXT, 2, '0');
    v_prefix  := 'CY-' || p_farm_id || '-' || v_yy || '-';
    v_pattern := '^CY-' || p_farm_id || '-' || v_yy || '-[0-9]+$';

    SELECT COALESCE(
        MAX(CAST(SUBSTRING(cycle_id FROM LENGTH(v_prefix) + 1) AS INT)),
        0
    )
    INTO v_max_num
    FROM production_cycles
    WHERE cycle_id ~ v_pattern;

    v_next_id := v_prefix || LPAD((v_max_num + 1)::TEXT, 3, '0');
    RETURN v_next_id;
END;
$$;

-- =============================================================================
-- 5. generate_event_id(p_prefix TEXT)
--    Returns a date-scoped sequential ID: PREFIX-YYYYMMDD-###
--    Works for EVT, HRV, INC, LAB, CSH, DLV, NRS, etc.
--    The sequence resets per day per prefix.
-- =============================================================================
CREATE OR REPLACE FUNCTION generate_event_id(p_prefix TEXT)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_date_str  TEXT;
    v_base      TEXT;
    v_pattern   TEXT;
    v_max_num   INT;
    v_next_id   TEXT;
    v_table_map RECORD;
    v_count     INT := 0;
BEGIN
    v_date_str := TO_CHAR(CURRENT_DATE, 'YYYYMMDD');
    v_base     := p_prefix || '-' || v_date_str || '-';
    v_pattern  := '^' || p_prefix || '-' || v_date_str || '-[0-9]+$';

    -- Search across all event-bearing tables for the given prefix
    -- We use field_events as the primary source; extend for other event tables.
    SELECT COALESCE(MAX(seq_num), 0)
    INTO v_max_num
    FROM (
        SELECT CAST(SUBSTRING(event_id FROM LENGTH(v_base) + 1) AS INT) AS seq_num
        FROM field_events
        WHERE event_id ~ v_pattern
        UNION ALL
        SELECT CAST(SUBSTRING(harvest_id FROM LENGTH(v_base) + 1) AS INT)
        FROM harvest_log
        WHERE harvest_id ~ v_pattern
        UNION ALL
        SELECT CAST(SUBSTRING(delivery_id FROM LENGTH(v_base) + 1) AS INT)
        FROM delivery_log
        WHERE delivery_id ~ v_pattern
        UNION ALL
        SELECT CAST(SUBSTRING(cash_txn_id FROM LENGTH(v_base) + 1) AS INT)
        FROM cash_ledger
        WHERE cash_txn_id ~ v_pattern
    ) sub;

    v_next_id := v_base || LPAD((v_max_num + 1)::TEXT, 3, '0');
    RETURN v_next_id;
END;
$$;

-- =============================================================================
-- 6. validate_rotation(p_pu_id, p_proposed_production_id, p_proposed_planting_date)
--    Full crop rotation validation with alternatives list.
-- =============================================================================
CREATE OR REPLACE FUNCTION validate_rotation(
    p_pu_id                  TEXT,
    p_proposed_production_id TEXT,
    p_proposed_planting_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_last_production_id     TEXT;
    v_last_harvest_end       DATE;
    v_days_since             INT;
    v_rule                   RECORD;
    v_rule_status            TEXT  := 'N/A';
    v_min_rest_days          INT   := 0;
    v_days_short             INT   := 0;
    v_allowed                BOOL  := true;
    v_enforcement            TEXT  := 'APPROVED';
    v_alternatives           JSONB := '[]'::JSONB;
    v_alt_rec                RECORD;
    v_result                 JSONB;
BEGIN
    -- Step a: Find the last completed cycle for this PU
    SELECT
        pc.production_id,
        pc.actual_harvest_end
    INTO
        v_last_production_id,
        v_last_harvest_end
    FROM production_cycles pc
    WHERE pc.pu_id  = p_pu_id
      AND pc.status = 'completed'
      AND pc.actual_harvest_end IS NOT NULL
    ORDER BY pc.actual_harvest_end DESC
    LIMIT 1;

    -- If no previous crop, immediately approve
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

    -- Step b: Calculate days since last harvest
    v_days_since := (p_proposed_planting_date - v_last_harvest_end)::INT;

    -- Step c: Look up rotation rule
    SELECT
        ar.rule_status,
        ar.min_rest_days
    INTO v_rule
    FROM shared.actionable_rules ar
    WHERE ar.current_production_id = v_last_production_id
      AND ar.next_production_id    = p_proposed_production_id
    LIMIT 1;

    IF FOUND THEN
        v_rule_status   := v_rule.rule_status;
        v_min_rest_days := COALESCE(v_rule.min_rest_days, 0);
    ELSE
        -- No specific rule found — default to OK
        v_rule_status   := 'OK';
        v_min_rest_days := 0;
    END IF;

    -- Step d: BLOCK if rule_status = BLOCK and insufficient rest days
    IF v_rule_status = 'BLOCK' AND v_days_since < v_min_rest_days THEN
        v_allowed     := false;
        v_enforcement := 'BLOCKED';
    -- Step e: AVOID → override required but not hard blocked
    ELSIF v_rule_status = 'AVOID' THEN
        v_allowed     := true;
        v_enforcement := 'OVERRIDE_REQUIRED';
    END IF;

    -- Step f: Calculate days short
    IF v_min_rest_days > v_days_since THEN
        v_days_short := v_min_rest_days - v_days_since;
    ELSE
        v_days_short := 0;
    END IF;

    -- Step g: Get top 3 alternatives from rotation table
    SELECT jsonb_agg(alt_obj ORDER BY alt_order)
    INTO v_alternatives
    FROM (
        SELECT
            jsonb_build_object(
                'production_id',   rtc.next_production_id,
                'production_name', rtc.next_production_name,
                'rule_status',     rtc.rule_status,
                'min_rest_days',   rtc.min_rest_days
            ) AS alt_obj,
            ROW_NUMBER() OVER (ORDER BY rtc.rule_status ASC, rtc.min_rest_days ASC) AS alt_order
        FROM shared.rotation_top_choices rtc
        WHERE rtc.current_production_id = v_last_production_id
          AND rtc.next_production_id   <> p_proposed_production_id
        LIMIT 3
    ) sub;

    IF v_alternatives IS NULL THEN
        v_alternatives := '[]'::JSONB;
    END IF;

    -- Step h: Build and return result
    v_result := jsonb_build_object(
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

    RETURN v_result;
END;
$$;

-- =============================================================================
-- 7. compute_decision_signal(p_signal_name TEXT, p_farm_id TEXT)
--    Returns signal_value, rag_status, and score_0_10 for one named signal.
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_decision_signal(
    p_signal_name TEXT,
    p_farm_id     TEXT
)
RETURNS TABLE(
    signal_value NUMERIC,
    rag_status   TEXT,
    score_0_10   NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_val   NUMERIC;
    v_rag   TEXT;
    v_score NUMERIC;
BEGIN
    CASE p_signal_name

        -- Signal 1: GrossMarginPct — revenue minus costs / revenue * 100
        WHEN 'GrossMarginPct' THEN
            SELECT
                CASE
                    WHEN COALESCE(SUM(CASE WHEN txn_type = 'income' THEN amount ELSE 0 END), 0) = 0
                    THEN 0
                    ELSE ROUND(
                        (
                          SUM(CASE WHEN txn_type = 'income' THEN amount ELSE 0 END) -
                          SUM(CASE WHEN txn_type IN ('expense','cost') THEN amount ELSE 0 END)
                        )
                        /
                        NULLIF(SUM(CASE WHEN txn_type = 'income' THEN amount ELSE 0 END), 0) * 100,
                        2
                    )
                END
            INTO v_val
            FROM cash_ledger
            WHERE farm_id = p_farm_id
              AND txn_date >= CURRENT_DATE - INTERVAL '30 days';

            v_val := COALESCE(v_val, 0);
            IF    v_val > 40  THEN v_rag := 'GREEN'; v_score := LEAST(10, ROUND(v_val / 10, 1));
            ELSIF v_val > 20  THEN v_rag := 'AMBER'; v_score := ROUND(v_val / 20 * 5, 1);
            ELSE                   v_rag := 'RED';   v_score := GREATEST(0, ROUND(v_val / 20 * 3, 1));
            END IF;

        -- Signal 2: DaysSinceLastHarvest
        WHEN 'DaysSinceLastHarvest' THEN
            SELECT COALESCE(
                (CURRENT_DATE - MAX(harvest_date))::INT,
                999
            )
            INTO v_val
            FROM harvest_log
            WHERE farm_id = p_farm_id;

            IF    v_val < 7  THEN v_rag := 'GREEN'; v_score := 10;
            ELSIF v_val < 14 THEN v_rag := 'AMBER'; v_score := 6;
            ELSIF v_val < 21 THEN v_rag := 'AMBER'; v_score := 4;
            ELSE                   v_rag := 'RED';   v_score := 1;
            END IF;

        -- Signal 3: OpenAlertsCount
        WHEN 'OpenAlertsCount' THEN
            SELECT COUNT(*)::NUMERIC
            INTO v_val
            FROM alerts
            WHERE farm_id = p_farm_id
              AND status = 'open';

            IF    v_val <= 3 THEN v_rag := 'GREEN'; v_score := 10;
            ELSIF v_val <= 7 THEN v_rag := 'AMBER'; v_score := 5;
            ELSE                   v_rag := 'RED';   v_score := 1;
            END IF;

        -- Signal 4: WeeklyLogActivity — field events logged in last 7 days
        WHEN 'WeeklyLogActivity' THEN
            SELECT COUNT(*)::NUMERIC
            INTO v_val
            FROM field_events
            WHERE farm_id  = p_farm_id
              AND event_date >= CURRENT_DATE - INTERVAL '7 days';

            IF    v_val >= 5 THEN v_rag := 'GREEN'; v_score := 10;
            ELSIF v_val >= 2 THEN v_rag := 'AMBER'; v_score := 5;
            ELSE                   v_rag := 'RED';   v_score := 1;
            END IF;

        -- Signal 5: LaborCostRatio — labor cost as % of total income (last 30 days)
        WHEN 'LaborCostRatio' THEN
            WITH income_30d AS (
                SELECT COALESCE(SUM(amount), 0) AS total_income
                FROM cash_ledger
                WHERE farm_id  = p_farm_id
                  AND txn_type = 'income'
                  AND txn_date >= CURRENT_DATE - INTERVAL '30 days'
            ),
            labor_30d AS (
                SELECT COALESCE(SUM(total_pay), 0) AS total_labor
                FROM labor_log
                WHERE farm_id   = p_farm_id
                  AND work_date >= CURRENT_DATE - INTERVAL '30 days'
            )
            SELECT
                CASE
                    WHEN i.total_income = 0 THEN 0
                    ELSE ROUND(l.total_labor / i.total_income * 100, 2)
                END
            INTO v_val
            FROM income_30d i, labor_30d l;

            v_val := COALESCE(v_val, 0);
            IF    v_val < 30 THEN v_rag := 'GREEN'; v_score := 10;
            ELSIF v_val < 50 THEN v_rag := 'AMBER'; v_score := 5;
            ELSE                   v_rag := 'RED';   v_score := 1;
            END IF;

        -- Signal 6: ActiveCyclesCount
        WHEN 'ActiveCyclesCount' THEN
            SELECT COUNT(*)::NUMERIC
            INTO v_val
            FROM production_cycles
            WHERE farm_id = p_farm_id
              AND status  = 'active';

            IF    v_val >= 5 THEN v_rag := 'GREEN'; v_score := 10;
            ELSIF v_val >= 2 THEN v_rag := 'AMBER'; v_score := 5;
            ELSE                   v_rag := 'RED';   v_score := 1;
            END IF;

        -- Signal 7: NurseryStatus — active nursery batches
        WHEN 'NurseryStatus' THEN
            SELECT COUNT(*)::NUMERIC
            INTO v_val
            FROM production_units pu
            JOIN production_cycles pc ON pc.pu_id = pu.pu_id AND pc.status = 'active'
            WHERE pu.farm_id    = p_farm_id
              AND pu.is_nursery = true;

            IF    v_val >= 3 THEN v_rag := 'GREEN'; v_score := 10;
            ELSIF v_val >= 1 THEN v_rag := 'AMBER'; v_score := 5;
            ELSE                   v_rag := 'RED';   v_score := 0;
            END IF;

        -- Signal 8: WeatherStress — most recent weather log entry
        WHEN 'WeatherStress' THEN
            -- Returns 0=LOW, 1=MEDIUM, 2=HIGH as numeric for scoring
            DECLARE
                v_stress_level TEXT;
            BEGIN
                SELECT stress_level
                INTO v_stress_level
                FROM weather_log
                WHERE farm_id = p_farm_id
                ORDER BY log_date DESC
                LIMIT 1;

                v_stress_level := COALESCE(UPPER(v_stress_level), 'LOW');

                IF    v_stress_level = 'LOW'    THEN v_val := 0; v_rag := 'GREEN'; v_score := 10;
                ELSIF v_stress_level = 'MEDIUM' THEN v_val := 1; v_rag := 'AMBER'; v_score := 5;
                ELSE                                  v_val := 2; v_rag := 'RED';   v_score := 1;
                END IF;
            END;

        -- Signal 9: CashPosition — net balance in cash_ledger
        WHEN 'CashPosition' THEN
            SELECT COALESCE(
                SUM(CASE WHEN txn_type = 'income'              THEN  amount
                         WHEN txn_type IN ('expense','cost')   THEN -amount
                         ELSE 0
                    END),
                0
            )
            INTO v_val
            FROM cash_ledger
            WHERE farm_id = p_farm_id;

            IF    v_val > 500 THEN v_rag := 'GREEN'; v_score := LEAST(10, ROUND(v_val / 500, 1));
            ELSIF v_val > 0   THEN v_rag := 'AMBER'; v_score := ROUND(v_val / 500 * 5, 1);
            ELSE                    v_rag := 'RED';   v_score := 0;
            END IF;

        -- Signal 10: InputStockLevel — count of inputs below reorder threshold
        WHEN 'InputStockLevel' THEN
            SELECT COUNT(*)::NUMERIC
            INTO v_val
            FROM inputs i
            WHERE i.farm_id = p_farm_id
              AND (
                (i.reorder_operator = 'lte' AND i.current_stock <= i.reorder_threshold)
                OR
                (i.reorder_operator = 'lt'  AND i.current_stock <  i.reorder_threshold)
                OR
                (i.reorder_operator IN ('gte','gt') AND i.current_stock < i.reorder_threshold)
              );

            IF    v_val = 0 THEN v_rag := 'GREEN'; v_score := 10;
            ELSIF v_val <= 2 THEN v_rag := 'AMBER'; v_score := 5;
            ELSE                   v_rag := 'RED';   v_score := 1;
            END IF;

        ELSE
            -- Unknown signal name
            v_val  := NULL;
            v_rag  := 'UNKNOWN';
            v_score := NULL;
    END CASE;

    signal_value := v_val;
    rag_status   := v_rag;
    score_0_10   := v_score;
    RETURN NEXT;
END;
$$;

-- =============================================================================
-- 8. compute_all_decision_signals(p_farm_id TEXT)
--    Calls compute_decision_signal for all 10 signals, inserts into
--    decision_signals snapshot table. Returns count of rows inserted.
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_all_decision_signals(p_farm_id TEXT)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    v_signal_names TEXT[] := ARRAY[
        'GrossMarginPct',
        'DaysSinceLastHarvest',
        'OpenAlertsCount',
        'WeeklyLogActivity',
        'LaborCostRatio',
        'ActiveCyclesCount',
        'NurseryStatus',
        'WeatherStress',
        'CashPosition',
        'InputStockLevel'
    ];
    v_name         TEXT;
    v_sig          RECORD;
    v_inserted     INT := 0;
BEGIN
    FOREACH v_name IN ARRAY v_signal_names LOOP
        SELECT * INTO v_sig
        FROM compute_decision_signal(v_name, p_farm_id);

        INSERT INTO decision_signals (
            farm_id, signal_name, signal_value,
            rag_status, score_0_10, computed_at
        ) VALUES (
            p_farm_id, v_name, v_sig.signal_value,
            v_sig.rag_status, v_sig.score_0_10, NOW()
        );

        v_inserted := v_inserted + 1;
    END LOOP;

    RETURN v_inserted;
END;
$$;

-- =============================================================================
-- 9. compute_expansion_readiness(p_farm_id TEXT)
--    Seven-condition assessment of farm expansion readiness.
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_expansion_readiness(p_farm_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_cash_surplus          BOOL;
    v_revenue_positive      BOOL;
    v_labor_capacity        BOOL;
    v_capacity_util         BOOL;
    v_idle_acres            NUMERIC;
    v_no_critical_alerts    BOOL;
    v_score                 INT := 0;
    v_readiness_level       TEXT;

    v_cash_net              NUMERIC;
    v_positive_weeks        INT;
    v_active_workers        INT;
    v_max_workers           INT := 15;  -- configurable ceiling
    v_active_pu_area        NUMERIC;
    v_total_area            NUMERIC;
    v_util_pct              NUMERIC;
    v_critical_open         INT;
BEGIN
    -- Condition 1: Cash net > 500
    SELECT COALESCE(
        SUM(CASE WHEN txn_type = 'income'            THEN  amount
                 WHEN txn_type IN ('expense','cost') THEN -amount
                 ELSE 0
            END),
        0
    )
    INTO v_cash_net
    FROM cash_ledger
    WHERE farm_id = p_farm_id;

    v_cash_surplus := (v_cash_net > 500);

    -- Condition 2: 4+ weeks of positive net revenue
    SELECT COUNT(*)
    INTO v_positive_weeks
    FROM (
        SELECT
            DATE_TRUNC('week', txn_date) AS wk,
            SUM(CASE WHEN txn_type = 'income'            THEN  amount
                     WHEN txn_type IN ('expense','cost') THEN -amount
                     ELSE 0
                END) AS net_wk
        FROM cash_ledger
        WHERE farm_id = p_farm_id
          AND txn_date >= CURRENT_DATE - INTERVAL '8 weeks'
        GROUP BY wk
        HAVING SUM(CASE WHEN txn_type = 'income'            THEN  amount
                        WHEN txn_type IN ('expense','cost') THEN -amount
                        ELSE 0
                   END) > 0
    ) pos_weeks;

    v_revenue_positive := (v_positive_weeks >= 4);

    -- Condition 3: Active workers < max capacity
    SELECT COUNT(*)
    INTO v_active_workers
    FROM workers
    WHERE farm_id  = p_farm_id
      AND is_active = true
      AND employment_type <> 'contract';

    v_labor_capacity := (v_active_workers < v_max_workers);

    -- Condition 4: Active PU area / total farm area < 80%
    SELECT
        COALESCE(SUM(CASE WHEN status = 'active' THEN area_acres ELSE 0 END), 0),
        COALESCE(SUM(area_acres), 0)
    INTO v_active_pu_area, v_total_area
    FROM production_units
    WHERE farm_id = p_farm_id;

    IF v_total_area > 0 THEN
        v_util_pct := (v_active_pu_area / v_total_area) * 100;
    ELSE
        v_util_pct := 0;
    END IF;

    v_capacity_util := (v_util_pct < 80);

    -- Condition 5: Idle acres available
    SELECT COALESCE(idle_area_acres, 0)
    INTO v_idle_acres
    FROM farms
    WHERE farm_id = p_farm_id;

    -- Condition 6: No critical open alerts
    SELECT COUNT(*)
    INTO v_critical_open
    FROM alerts
    WHERE farm_id  = p_farm_id
      AND severity = 'Critical'
      AND status   = 'open';

    v_no_critical_alerts := (v_critical_open = 0);

    -- Score: count conditions met
    IF v_cash_surplus        THEN v_score := v_score + 1; END IF;
    IF v_revenue_positive    THEN v_score := v_score + 1; END IF;
    IF v_labor_capacity      THEN v_score := v_score + 1; END IF;
    IF v_capacity_util       THEN v_score := v_score + 1; END IF;
    IF v_idle_acres > 0      THEN v_score := v_score + 1; END IF;
    IF v_no_critical_alerts  THEN v_score := v_score + 1; END IF;
    -- 7th condition: active cycles >= 3 (productive momentum)
    DECLARE
        v_active_cycles INT;
    BEGIN
        SELECT COUNT(*) INTO v_active_cycles
        FROM production_cycles
        WHERE farm_id = p_farm_id AND status = 'active';

        IF v_active_cycles >= 3 THEN v_score := v_score + 1; END IF;
    END;

    -- Readiness level
    IF    v_score >= 6 THEN v_readiness_level := 'READY';
    ELSIF v_score >= 3 THEN v_readiness_level := 'CONDITIONAL';
    ELSE                    v_readiness_level := 'NOT_READY';
    END IF;

    RETURN jsonb_build_object(
        'cash_surplus_check',         v_cash_surplus,
        'revenue_positive_check',     v_revenue_positive,
        'labor_capacity_check',       v_labor_capacity,
        'capacity_utilization_check', v_capacity_util,
        'idle_acres_available',       v_idle_acres,
        'no_critical_alerts_check',   v_no_critical_alerts,
        'overall_readiness_score',    v_score,
        'readiness_level',            v_readiness_level
    );
END;
$$;

-- =============================================================================
-- 10. compute_cashflow_forecast(p_farm_id TEXT, p_weeks INT DEFAULT 13)
--     13-week rolling cash flow forecast.
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_cashflow_forecast(
    p_farm_id TEXT,
    p_weeks   INT DEFAULT 13
)
RETURNS TABLE(
    week_number        INT,
    week_start         DATE,
    expected_inflows   NUMERIC,
    expected_outflows  NUMERIC,
    net_cashflow       NUMERIC,
    cumulative_balance NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_starting_balance NUMERIC;
    v_week_start       DATE;
    v_week_end         DATE;
    v_inflows          NUMERIC;
    v_outflows         NUMERIC;
    v_cumulative       NUMERIC;
    v_w                INT;
    v_labor_weekly     NUMERIC;
    v_reorder_weekly   NUMERIC;
BEGIN
    -- Starting balance: current net cash position
    SELECT COALESCE(
        SUM(CASE WHEN txn_type = 'income'            THEN  amount
                 WHEN txn_type IN ('expense','cost') THEN -amount
                 ELSE 0
            END),
        0
    )
    INTO v_starting_balance
    FROM cash_ledger
    WHERE farm_id = p_farm_id;

    -- Base weekly labor outflow: active workers × 6 days × daily rate
    SELECT COALESCE(SUM(daily_rate_fjd * 6), 0)
    INTO v_labor_weekly
    FROM workers
    WHERE farm_id  = p_farm_id
      AND is_active = true
      AND employment_type <> 'contract';

    -- Base weekly input reorder spend estimate (inputs below threshold × unit cost × reorder qty est)
    SELECT COALESCE(
        SUM(unit_cost_fjd * GREATEST(reorder_threshold - current_stock, 0) / GREATEST(lead_time_days / 7.0, 1)),
        0
    )
    INTO v_reorder_weekly
    FROM inputs
    WHERE farm_id = p_farm_id
      AND current_stock <= reorder_threshold;

    v_cumulative := v_starting_balance;

    FOR v_w IN 1..p_weeks LOOP
        v_week_start := CURRENT_DATE + ((v_w - 1) * 7);
        v_week_end   := v_week_start + 6;

        -- Expected inflows: sum of expected harvest value for cycles harvesting this week
        SELECT COALESCE(
            SUM(
                COALESCE(pc.expected_yield_kg, 0) *
                COALESCE((
                    SELECT pm.price_per_kg_fjd
                    FROM price_master pm
                    WHERE pm.production_id = pc.production_id
                      AND pm.grade IN ('Grade A','Grade A (dried)','Honey')
                      AND pm.is_current = true
                    ORDER BY pm.price_per_kg_fjd DESC
                    LIMIT 1
                ), 0) / NULLIF(
                    GREATEST(
                        (pc.expected_harvest_end::DATE - pc.expected_harvest_start::DATE),
                        7
                    ) / 7.0,
                    0
                )
            ),
            0
        )
        INTO v_inflows
        FROM production_cycles pc
        WHERE pc.farm_id = p_farm_id
          AND pc.status  = 'active'
          AND pc.expected_harvest_start IS NOT NULL
          AND pc.expected_harvest_start <= v_week_end
          AND pc.expected_harvest_end   >= v_week_start;

        -- Expected outflows: labor + prorated input reorder costs
        v_outflows := v_labor_weekly + v_reorder_weekly;

        v_cumulative := v_cumulative + v_inflows - v_outflows;

        week_number        := v_w;
        week_start         := v_week_start;
        expected_inflows   := ROUND(v_inflows,  2);
        expected_outflows  := ROUND(v_outflows, 2);
        net_cashflow       := ROUND(v_inflows - v_outflows, 2);
        cumulative_balance := ROUND(v_cumulative, 2);
        RETURN NEXT;
    END LOOP;
END;
$$;

-- =============================================================================
-- 11. check_chemical_compliance(p_pu_id TEXT, p_harvest_date DATE)
--     Checks witholding periods for all chemical applications in last 60 days.
-- =============================================================================
CREATE OR REPLACE FUNCTION check_chemical_compliance(
    p_pu_id        TEXT,
    p_harvest_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_compliant             BOOL := true;
    v_blocking              JSONB := '[]'::JSONB;
    v_earliest_safe         DATE := p_harvest_date;
    v_rec                   RECORD;
    v_harvest_allowed_after DATE;
BEGIN
    FOR v_rec IN
        SELECT
            fe.event_id,
            fe.event_date,
            fe.chemical_id,
            cl.chemical_name,
            cl.withholding_period_days
        FROM field_events fe
        JOIN shared.chemical_library cl ON cl.chemical_id = fe.chemical_id
        WHERE fe.pu_id      = p_pu_id
          AND fe.event_type = 'chemical_application'
          AND fe.event_date >= (p_harvest_date - INTERVAL '60 days')
          AND cl.withholding_period_days IS NOT NULL
        ORDER BY fe.event_date DESC
    LOOP
        v_harvest_allowed_after := v_rec.event_date + v_rec.withholding_period_days;

        IF v_harvest_allowed_after > p_harvest_date THEN
            v_compliant := false;
            v_blocking  := v_blocking || jsonb_build_object(
                'chemical_id',             v_rec.chemical_id,
                'chemical_name',           v_rec.chemical_name,
                'application_date',        v_rec.event_date,
                'withholding_period_days', v_rec.withholding_period_days,
                'harvest_allowed_after',   v_harvest_allowed_after
            );

            IF v_harvest_allowed_after > v_earliest_safe THEN
                v_earliest_safe := v_harvest_allowed_after;
            END IF;
        END IF;
    END LOOP;

    IF v_compliant THEN
        v_earliest_safe := p_harvest_date;
    END IF;

    RETURN jsonb_build_object(
        'compliant',                  v_compliant,
        'blocking_chemicals',         v_blocking,
        'earliest_safe_harvest_date', v_earliest_safe,
        'compliance_checked_at',      NOW()
    );
END;
$$;

-- =============================================================================
-- 12. compute_harvest_reconciliation(p_cycle_id TEXT)
--     Reconciles harvested vs delivered vs sold vs lost quantities.
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_harvest_reconciliation(p_cycle_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_harvested_kg  NUMERIC;
    v_delivered_kg  NUMERIC;
    v_sold_kg       NUMERIC;
    v_loss_kg       NUMERIC;
    v_loss_pct      NUMERIC;
    v_loss_alert    BOOL;
BEGIN
    -- Total harvested
    SELECT COALESCE(SUM(quantity_kg), 0)
    INTO v_harvested_kg
    FROM harvest_log
    WHERE cycle_id = p_cycle_id;

    -- Total delivered (dispatched to customers)
    SELECT COALESCE(SUM(delivered_qty_kg), 0)
    INTO v_delivered_kg
    FROM delivery_log
    WHERE cycle_id = p_cycle_id;

    -- Total sold (invoiced / confirmed)
    SELECT COALESCE(SUM(sold_qty_kg), 0)
    INTO v_sold_kg
    FROM sales_log
    WHERE cycle_id = p_cycle_id;

    -- Loss = harvested - delivered (unaccounted gap)
    v_loss_kg := v_harvested_kg - v_delivered_kg;
    IF v_loss_kg < 0 THEN v_loss_kg := 0; END IF;

    -- Loss gap %
    IF v_harvested_kg > 0 THEN
        v_loss_pct := ROUND((v_loss_kg / v_harvested_kg) * 100, 2);
    ELSE
        v_loss_pct := 0;
    END IF;

    -- Alert if > 10%
    v_loss_alert := (v_loss_pct > 10);

    RETURN jsonb_build_object(
        'total_harvested_kg',  v_harvested_kg,
        'total_delivered_kg',  v_delivered_kg,
        'total_sold_kg',       v_sold_kg,
        'total_loss_kg',       v_loss_kg,
        'loss_gap_pct',        v_loss_pct,
        'loss_alert_triggered', v_loss_alert
    );
END;
$$;

-- =============================================================================
-- 13. compute_labor_cost_ratio(p_farm_id TEXT, p_days INT DEFAULT 30)
--     Labor cost as a percentage of total income over the period.
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_labor_cost_ratio(
    p_farm_id TEXT,
    p_days    INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_labor_cost  NUMERIC;
    v_income      NUMERIC;
    v_ratio_pct   NUMERIC;
    v_rag         TEXT;
BEGIN
    -- Total labor cost for period
    SELECT COALESCE(SUM(total_pay), 0)
    INTO v_labor_cost
    FROM labor_log
    WHERE farm_id   = p_farm_id
      AND work_date >= CURRENT_DATE - (p_days || ' days')::INTERVAL;

    -- Total income for period
    SELECT COALESCE(SUM(amount), 0)
    INTO v_income
    FROM cash_ledger
    WHERE farm_id  = p_farm_id
      AND txn_type = 'income'
      AND txn_date >= CURRENT_DATE - (p_days || ' days')::INTERVAL;

    -- Ratio
    IF v_income > 0 THEN
        v_ratio_pct := ROUND((v_labor_cost / v_income) * 100, 2);
    ELSE
        v_ratio_pct := 0;
    END IF;

    -- RAG
    IF    v_ratio_pct < 30 THEN v_rag := 'GREEN';
    ELSIF v_ratio_pct < 50 THEN v_rag := 'AMBER';
    ELSE                        v_rag := 'RED';
    END IF;

    RETURN jsonb_build_object(
        'total_labor_cost',       v_labor_cost,
        'total_income',           v_income,
        'labor_cost_ratio_pct',   v_ratio_pct,
        'rag_status',             v_rag,
        'period_days',            p_days
    );
END;
$$;

-- =============================================================================
-- 14. compute_cogk(p_cycle_id TEXT)
--     Cost of Goods per Kilogram for a production cycle.
--     Returns NULL if no harvest recorded yet.
-- =============================================================================
CREATE OR REPLACE FUNCTION compute_cogk(p_cycle_id TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
    v_labor_cost    NUMERIC := 0;
    v_input_cost    NUMERIC := 0;
    v_other_cost    NUMERIC := 0;
    v_harvest_qty   NUMERIC := 0;
    v_cogk          NUMERIC;
BEGIN
    -- Total labor cost allocated to this cycle
    SELECT COALESCE(SUM(total_pay), 0)
    INTO v_labor_cost
    FROM labor_log
    WHERE cycle_id = p_cycle_id;

    -- Total input cost allocated to this cycle
    SELECT COALESCE(SUM(txn_value), 0)
    INTO v_input_cost
    FROM input_transactions
    WHERE cycle_id  = p_cycle_id
      AND txn_type  = 'usage';

    -- Other direct costs from cash ledger tagged to this cycle
    SELECT COALESCE(SUM(amount), 0)
    INTO v_other_cost
    FROM cash_ledger
    WHERE cycle_id  = p_cycle_id
      AND txn_type IN ('expense','cost')
      AND cost_category NOT IN ('labor','input');

    -- Total harvest in kg
    SELECT COALESCE(SUM(quantity_kg), 0)
    INTO v_harvest_qty
    FROM harvest_log
    WHERE cycle_id = p_cycle_id;

    IF v_harvest_qty = 0 THEN
        RETURN NULL;
    END IF;

    v_cogk := ROUND((v_labor_cost + v_input_cost + v_other_cost) / v_harvest_qty, 4);
    RETURN v_cogk;
END;
$$;

-- =============================================================================
-- 15. get_farm_dashboard(p_farm_id TEXT)
--     Single-call full dashboard aggregation for the farm.
-- =============================================================================
CREATE OR REPLACE FUNCTION get_farm_dashboard(p_farm_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_farm_name         TEXT;
    v_signals           JSONB;
    v_open_alerts       JSONB;
    v_active_cycles     JSONB;
    v_recent_events     JSONB;
    v_financial_summary JSONB;
    v_open_tasks        JSONB;
    v_inventory_status  JSONB;
    v_result            JSONB;
BEGIN
    -- Farm name
    SELECT farm_name INTO v_farm_name FROM farms WHERE farm_id = p_farm_id;

    -- Decision signals (latest snapshot)
    SELECT jsonb_agg(
        jsonb_build_object(
            'signal_name',  ds.signal_name,
            'signal_value', ds.signal_value,
            'rag_status',   ds.rag_status,
            'score_0_10',   ds.score_0_10,
            'computed_at',  ds.computed_at
        ) ORDER BY ds.signal_name
    )
    INTO v_signals
    FROM (
        SELECT DISTINCT ON (signal_name)
            signal_name, signal_value, rag_status, score_0_10, computed_at
        FROM decision_signals
        WHERE farm_id = p_farm_id
        ORDER BY signal_name, computed_at DESC
    ) ds;

    -- Open alerts (most recent 5)
    SELECT jsonb_agg(
        jsonb_build_object(
            'alert_id',    alert_id,
            'category',    category,
            'message',     message,
            'severity',    severity,
            'created_at',  created_at
        ) ORDER BY created_at DESC
    )
    INTO v_open_alerts
    FROM (
        SELECT alert_id, category, message, severity, created_at
        FROM alerts
        WHERE farm_id = p_farm_id
          AND status  = 'open'
        ORDER BY created_at DESC
        LIMIT 5
    ) a;

    -- Active cycles with cogk, stage, days active
    SELECT jsonb_agg(
        jsonb_build_object(
            'cycle_id',        pc.cycle_id,
            'pu_id',           pc.pu_id,
            'production_id',   pc.production_id,
            'planting_date',   pc.planting_date,
            'days_active',     (CURRENT_DATE - pc.planting_date::DATE),
            'current_stage',   pc.current_stage,
            'cogk',            compute_cogk(pc.cycle_id),
            'exp_harvest_start', pc.expected_harvest_start
        )
    )
    INTO v_active_cycles
    FROM production_cycles pc
    WHERE pc.farm_id = p_farm_id
      AND pc.status  = 'active';

    -- Recent field events: last 7 days count by event type
    SELECT jsonb_object_agg(event_type, event_count)
    INTO v_recent_events
    FROM (
        SELECT event_type, COUNT(*) AS event_count
        FROM field_events
        WHERE farm_id   = p_farm_id
          AND event_date >= CURRENT_DATE - INTERVAL '7 days'
        GROUP BY event_type
    ) ev;

    -- Financial summary last 30 days
    SELECT jsonb_build_object(
        'total_revenue_30d', COALESCE(SUM(CASE WHEN txn_type = 'income'            THEN amount ELSE 0 END), 0),
        'total_cost_30d',    COALESCE(SUM(CASE WHEN txn_type IN ('expense','cost') THEN amount ELSE 0 END), 0),
        'net_30d',           COALESCE(SUM(CASE WHEN txn_type = 'income'            THEN  amount
                                               WHEN txn_type IN ('expense','cost') THEN -amount
                                               ELSE 0 END), 0)
    )
    INTO v_financial_summary
    FROM cash_ledger
    WHERE farm_id  = p_farm_id
      AND txn_date >= CURRENT_DATE - INTERVAL '30 days';

    -- Open tasks: overdue and due today
    SELECT jsonb_build_object(
        'overdue_count',   COUNT(CASE WHEN due_date < CURRENT_DATE  AND status = 'open' THEN 1 END),
        'due_today_count', COUNT(CASE WHEN due_date = CURRENT_DATE  AND status = 'open' THEN 1 END)
    )
    INTO v_open_tasks
    FROM tasks
    WHERE farm_id = p_farm_id;

    -- Low stock inputs
    SELECT jsonb_agg(
        jsonb_build_object(
            'input_id',       input_id,
            'input_name',     input_name,
            'current_stock',  current_stock,
            'reorder_threshold', reorder_threshold,
            'unit',           unit
        ) ORDER BY input_name
    )
    INTO v_inventory_status
    FROM inputs
    WHERE farm_id = p_farm_id
      AND (
            (reorder_operator = 'lte' AND current_stock <= reorder_threshold)
         OR (reorder_operator = 'lt'  AND current_stock <  reorder_threshold)
         OR (reorder_operator IN ('gte','gt') AND current_stock < reorder_threshold)
      );

    v_result := jsonb_build_object(
        'farm_id',           p_farm_id,
        'farm_name',         COALESCE(v_farm_name, 'Unknown Farm'),
        'decision_signals',  COALESCE(v_signals,        '[]'::JSONB),
        'open_alerts',       COALESCE(v_open_alerts,    '[]'::JSONB),
        'active_cycles',     COALESCE(v_active_cycles,  '[]'::JSONB),
        'recent_events',     COALESCE(v_recent_events,  '{}'::JSONB),
        'financial_summary', COALESCE(v_financial_summary, '{}'::JSONB),
        'open_tasks',        COALESCE(v_open_tasks,     '{}'::JSONB),
        'inventory_status',  COALESCE(v_inventory_status, '[]'::JSONB),
        'last_updated',      NOW()
    );

    RETURN v_result;
END;
$$;

-- =============================================================================
-- 16. trigger_chemical_compliance_check()
--     BEFORE INSERT trigger on harvest_log — flags compliance issues.
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_chemical_compliance_check()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_compliance JSONB;
    v_blocking   JSONB;
    v_chem_ids   TEXT[];
    v_item       JSONB;
    v_idx        INT;
BEGIN
    -- Run compliance check
    v_compliance := check_chemical_compliance(NEW.pu_id, NEW.harvest_date);

    IF (v_compliance->>'compliant')::BOOL = false THEN
        -- Set blocked flag
        NEW.compliance_blocked     := true;
        NEW.chemical_compliance_checked := true;

        -- Extract blocking chemical IDs into an array
        v_blocking := v_compliance->'blocking_chemicals';
        IF jsonb_array_length(v_blocking) > 0 THEN
            v_chem_ids := ARRAY[]::TEXT[];
            FOR v_idx IN 0..jsonb_array_length(v_blocking) - 1 LOOP
                v_item     := v_blocking->v_idx;
                v_chem_ids := v_chem_ids || ARRAY[(v_item->>'chemical_id')::TEXT];
            END LOOP;
            NEW.blocking_chemicals := v_chem_ids;
        END IF;
    ELSE
        NEW.compliance_blocked          := false;
        NEW.chemical_compliance_checked := true;
        NEW.blocking_chemicals          := ARRAY[]::TEXT[];
    END IF;

    -- NOTE: We do NOT raise an exception here — the API layer enforces
    -- hard block when compliance_blocked = true.
    RETURN NEW;
END;
$$;

-- =============================================================================
-- 17. trigger_update_cycle_financials()
--     AFTER INSERT on harvest_log — recalculates cycle financial totals.
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_update_cycle_financials()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_harvest NUMERIC;
BEGIN
    -- Recalculate total harvest quantity for the cycle
    SELECT COALESCE(SUM(quantity_kg), 0)
    INTO v_total_harvest
    FROM harvest_log
    WHERE cycle_id = NEW.cycle_id;

    -- Upsert into cycle_financials
    INSERT INTO cycle_financials (
        cycle_id,
        total_harvest_qty_kg,
        financials_updated_at,
        needs_refresh
    )
    VALUES (
        NEW.cycle_id,
        v_total_harvest,
        NOW(),
        true
    )
    ON CONFLICT (cycle_id) DO UPDATE SET
        total_harvest_qty_kg  = EXCLUDED.total_harvest_qty_kg,
        financials_updated_at = EXCLUDED.financials_updated_at,
        needs_refresh         = true;

    RETURN NEW;
END;
$$;

-- =============================================================================
-- 18. trigger_update_inventory()
--     AFTER INSERT on input_transactions — updates inputs.current_stock.
-- =============================================================================
CREATE OR REPLACE FUNCTION trigger_update_inventory()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.txn_type = 'purchase' THEN
        -- Stock increases on purchase
        UPDATE inputs
        SET current_stock = current_stock + NEW.quantity,
            updated_at    = NOW()
        WHERE input_id = NEW.input_id;

    ELSIF NEW.txn_type = 'usage' THEN
        -- Stock decreases on usage
        UPDATE inputs
        SET current_stock = GREATEST(current_stock - NEW.quantity, 0),
            updated_at    = NOW()
        WHERE input_id = NEW.input_id;

    ELSIF NEW.txn_type = 'adjustment' THEN
        -- Direct stock adjustment (positive or negative)
        UPDATE inputs
        SET current_stock = GREATEST(current_stock + NEW.quantity, 0),
            updated_at    = NOW()
        WHERE input_id = NEW.input_id;

    ELSIF NEW.txn_type = 'write_off' THEN
        -- Write-off reduces stock
        UPDATE inputs
        SET current_stock = GREATEST(current_stock - NEW.quantity, 0),
            updated_at    = NOW()
        WHERE input_id = NEW.input_id;
    END IF;

    RETURN NEW;
END;
$$;

-- =============================================================================
-- TRIGGER ATTACHMENTS
-- Drop existing triggers first to allow safe re-runs.
-- =============================================================================

-- Trigger 1: Chemical compliance check BEFORE harvest insert
DROP TRIGGER IF EXISTS before_harvest_compliance ON harvest_log;
CREATE TRIGGER before_harvest_compliance
    BEFORE INSERT ON harvest_log
    FOR EACH ROW
    EXECUTE FUNCTION trigger_chemical_compliance_check();

-- Trigger 2: Cycle financials update AFTER harvest insert
DROP TRIGGER IF EXISTS after_harvest_financials ON harvest_log;
CREATE TRIGGER after_harvest_financials
    AFTER INSERT ON harvest_log
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_cycle_financials();

-- Trigger 3: Inventory stock update AFTER input transaction insert
DROP TRIGGER IF EXISTS after_input_txn_inventory ON input_transactions;
CREATE TRIGGER after_input_txn_inventory
    AFTER INSERT ON input_transactions
    FOR EACH ROW
    EXECUTE FUNCTION trigger_update_inventory();

-- =============================================================================
-- END OF FILE: 05_functions.sql
-- =============================================================================
