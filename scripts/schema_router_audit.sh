#!/usr/bin/env bash
# schema_router_audit.sh — flag schema-qualified objects the routers reference
# that DO NOT exist in the live database. Catches the recurring class of bug
# where a router queries tenant.X / shared.X / audit.X that was never created
# (wrong name, or feature table never migrated). Run on the prod host.
#
#   bash scripts/schema_router_audit.sh
#   bash scripts/schema_router_audit.sh <routers_dir> <db_container> <db_user> <db_name>
#
# Exit 0 always; prints suspects. Functions, views, matviews and enum types are
# treated as "exists" so they are not false-flagged.
set -euo pipefail

ROUTERS="${1:-11_application_code/app/routers}"
SERVICES="11_application_code/app/services"
DB_CONTAINER="${2:-teivaka_db}"
DB_USER="${3:-teivaka}"
DB_NAME="${4:-teivaka_db}"

# 1. Schema-qualified objects referenced by router + service code.
grep -rhoiE "(tenant|shared|audit)\.[a-z_]+" "$ROUTERS"/*.py "$SERVICES"/*.py 2>/dev/null \
  | tr 'A-Z' 'a-z' | sort -u > /tmp/ar_refs.txt

# 2. Objects that actually exist in the live DB: tables + views + matviews +
#    functions + types (enums). -F. → "schema.name" lines.
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -F. -c "
  SELECT schemaname, tablename   FROM pg_tables    WHERE schemaname IN ('tenant','shared','audit')
  UNION SELECT schemaname, viewname    FROM pg_views    WHERE schemaname IN ('tenant','shared','audit')
  UNION SELECT schemaname, matviewname FROM pg_matviews WHERE schemaname IN ('tenant','shared','audit')
  UNION SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('tenant','shared','audit')
  UNION SELECT n.nspname, t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('tenant','shared','audit')
" 2>/dev/null | tr 'A-Z' 'a-z' | sort -u > /tmp/ar_exist.txt

echo "=== Router/service references NOT present in the live DB ==="
echo "(tables / views / matviews / functions / enum types all counted as present)"
echo
comm -23 /tmp/ar_refs.txt /tmp/ar_exist.txt | sed 's/^/  MISSING  /'
echo
echo "Refs scanned: $(wc -l < /tmp/ar_refs.txt) · DB objects: $(wc -l < /tmp/ar_exist.txt)"

# 3. Optional column-level spot check for high-traffic tables. Add table:col,col
#    pairs here as needed; prints any column a router needs that the table lacks.
echo
echo "=== Column spot-check (high-traffic tables) ==="
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -c "
  WITH need(tbl, col) AS (VALUES
    ('tenant.harvest_log','gross_yield_kg'),
    ('tenant.harvest_log','marketable_yield_kg'),
    ('tenant.workers','phone'),
    ('tenant.cash_ledger','transaction_type'),
    ('tenant.nursery_batches','batch_status')
  )
  SELECT n.tbl||'.'||n.col AS missing_column
  FROM need n
  LEFT JOIN information_schema.columns c
    ON c.table_schema = split_part(n.tbl,'.',1)
   AND c.table_name   = split_part(n.tbl,'.',2)
   AND c.column_name  = n.col
  WHERE c.column_name IS NULL
" 2>/dev/null | sed 's/^/  MISSING COLUMN  /' || true
echo "(none above = all spot-checked columns present)"
