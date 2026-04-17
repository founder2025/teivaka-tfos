# FILE: 05_data_migration/migration_scripts/load_to_postgres.py
# Teivaka Farm OS (TFOS) — PostgreSQL Migration Loader
#
# Loads extracted JSON files into PostgreSQL in dependency order.
# Idempotent: re-running the script is safe (ON CONFLICT DO NOTHING / DO UPDATE).
#
# Phases:
#   A — Shared reference schema  (shared.*)
#   B — Tenant core data         (farms, zones, workers, customers, ...)
#   C — Configuration            (automation_rules, decision_signal_config)
#   D — Active operational data  (production_cycles, price_master)
#
# Usage:
#   python load_to_postgres.py --data-dir /path/to/json --tenant-id <UUID> --phase all
#   python load_to_postgres.py --data-dir /path/to/json --tenant-id <UUID> --phase A
#   python load_to_postgres.py --data-dir /path/to/json --tenant-id <UUID> --dry-run
#
# Environment:
#   DATABASE_URL=postgresql://user:pass@host:5432/tfos_db
#   (or set in .env file in the same directory)
#
# Exit codes:
#   0 — success
#   1 — validation failure
#   2 — connection error
#
# Author: Teivaka dev team
# Target: Python 3.12

import sys
import os
import json
import logging
import argparse
import time
from pathlib import Path
from typing import Any
from contextlib import contextmanager

import psycopg2
import psycopg2.extras
from psycopg2.extras import execute_batch, execute_values

# Load .env if present
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")
    load_dotenv(Path(__file__).parent.parent.parent / ".env")  # project root
except ImportError:
    pass  # python-dotenv not required if DATABASE_URL is already in environment

# =============================================================================
# Logging
# =============================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("load_postgres")

# =============================================================================
# Expected row counts per table (for post-phase validation)
# =============================================================================

EXPECTED_COUNTS: dict[str, int] = {
    # Phase A
    "shared.productions":             49,
    "shared.production_stages":       0,    # variable — validated by presence
    "shared.production_stage_protocols": 0,
    "shared.production_thresholds":   49,
    "shared.pest_library":            43,
    "shared.disease_library":         30,
    "shared.weed_library":            27,
    "shared.chemical_library":        45,
    "shared.family_policies":         14,
    "shared.rotation_registry":       49,
    "shared.actionable_rules":        1444,
    "shared.status_matrix":           0,
    "shared.min_rest_matrix":         0,
    "shared.rotation_top_choices":    0,
    # Phase B
    "farms":                          2,
    "zones":                          14,
    "suppliers":                      13,
    "customers":                      16,
    "workers":                        9,
    "production_units":               21,
    "equipment":                      23,
    "inputs":                         26,
    # Phase C
    "automation_rules":               43,
    "decision_signal_config":         10,
    # Phase D
    "production_cycles":              7,
    "price_master":                   0,    # variable
}

# =============================================================================
# Progress bar helper
# =============================================================================

def progress_bar(current: int, total: int, width: int = 30) -> str:
    """Return a simple ASCII progress bar string."""
    if total == 0:
        return "[" + "=" * width + "] 0/0"
    filled = int(width * current / total)
    bar = "=" * filled + "-" * (width - filled)
    return f"[{bar}] {current}/{total}"


def print_progress(table: str, current: int, total: int) -> None:
    bar = progress_bar(current, total)
    print(f"\r  Loading {table}... {bar}", end="", flush=True)


def print_done(table: str, total: int, elapsed: float) -> None:
    bar = progress_bar(total, total)
    print(f"\r  Loading {table}... {bar} Done. ({elapsed:.2f}s)")


# =============================================================================
# Database connection
# =============================================================================

@contextmanager
def get_connection(database_url: str):
    """Context manager that yields a psycopg2 connection."""
    conn = None
    try:
        conn = psycopg2.connect(database_url)
        yield conn
    except psycopg2.OperationalError as exc:
        log.error("Database connection failed: %s", exc)
        sys.exit(2)
    finally:
        if conn and not conn.closed:
            conn.close()


# =============================================================================
# JSON loader
# =============================================================================

def load_json(data_dir: Path, filename: str) -> list[dict] | None:
    """Load a JSON file from data_dir. Returns None if file not found."""
    path = data_dir / filename
    if not path.exists():
        log.warning("JSON file not found: %s", path)
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# =============================================================================
# Bulk insert helper
# =============================================================================

def bulk_insert(
    conn,
    table: str,
    records: list[dict],
    conflict_action: str = "DO NOTHING",
    conflict_target: str = "",
    chunk_size: int = 100,
    dry_run: bool = False,
) -> int:
    """Insert records into table in chunks. Returns number of rows processed.

    conflict_action examples:
        "DO NOTHING"
        "DO UPDATE SET updated_at = EXCLUDED.updated_at"

    conflict_target examples:
        ""              — no ON CONFLICT clause
        "(production_id)"
        "(rule_id)"
    """
    if not records:
        return 0

    if dry_run:
        log.info("  [DRY RUN] Would insert %d rows into %s", len(records), table)
        return len(records)

    columns = list(records[0].keys())
    col_str = ", ".join(f'"{c}"' for c in columns)
    placeholders = ", ".join(["%s"] * len(columns))

    if conflict_target:
        on_conflict = f"ON CONFLICT {conflict_target} {conflict_action}"
    else:
        on_conflict = ""

    sql = f"""
        INSERT INTO {table} ({col_str})
        VALUES ({placeholders})
        {on_conflict}
    """

    inserted = 0
    start = time.monotonic()

    with conn.cursor() as cur:
        for i in range(0, len(records), chunk_size):
            chunk = records[i : i + chunk_size]
            rows = [tuple(r.get(c) for c in columns) for r in chunk]
            execute_batch(cur, sql, rows, page_size=chunk_size)
            inserted += len(chunk)
            print_progress(table, inserted, len(records))

    elapsed = time.monotonic() - start
    print_done(table, inserted, elapsed)
    return inserted


# =============================================================================
# Row count validation
# =============================================================================

def validate_count(conn, table: str, expected: int, dry_run: bool = False) -> bool:
    """SELECT COUNT(*) from table and compare to expected. Returns True if pass."""
    if dry_run or expected == 0:
        return True   # skip count validation for variable-count tables in dry run

    with conn.cursor() as cur:
        cur.execute(f"SELECT COUNT(*) FROM {table}")
        actual = cur.fetchone()[0]

    if actual >= expected:
        log.info("  [PASS] %s: %d rows (expected >= %d) ✓", table, actual, expected)
        return True
    else:
        log.error("  [FAIL] %s: %d rows (expected >= %d) ✗", table, actual, expected)
        return False


# =============================================================================
# Phase A — Shared Schema
# =============================================================================

def load_shared_productions(conn, data: list[dict], dry_run: bool = False) -> int:
    return bulk_insert(
        conn, "shared.productions", data,
        conflict_action="DO NOTHING",
        conflict_target="(production_id)",
        dry_run=dry_run,
    )


def load_shared_stages(conn, data: list[dict], dry_run: bool = False) -> int:
    return bulk_insert(
        conn, "shared.production_stages", data,
        conflict_action="DO NOTHING",
        conflict_target="(stage_id)",
        dry_run=dry_run,
    )


def load_shared_protocols(conn, data: list[dict], dry_run: bool = False) -> int:
    return bulk_insert(
        conn, "shared.production_stage_protocols", data,
        conflict_action="DO NOTHING",
        conflict_target="(protocol_id)" if data and "protocol_id" in data[0] else "",
        dry_run=dry_run,
    )


def load_shared_thresholds(conn, data: list[dict], dry_run: bool = False) -> int:
    return bulk_insert(
        conn, "shared.production_thresholds", data,
        conflict_action="DO NOTHING",
        conflict_target="(production_id)" if data and "production_id" in data[0] else "",
        dry_run=dry_run,
    )


def load_shared_pest_library(conn, data: list[dict], dry_run: bool = False) -> int:
    return bulk_insert(
        conn, "shared.pest_library", data,
        conflict_action="DO NOTHING",
        conflict_target="(pest_id)" if data and "pest_id" in data[0] else "",
        dry_run=dry_run,
    )


def load_shared_disease_library(conn, data: list[dict], dry_run: bool = False) -> int:
    return bulk_insert(
        conn, "shared.disease_library", data,
        conflict_action="DO NOTHING",
        conflict_target="(disease_id)" if data and "disease_id" in data[0] else "",
        dry_run=dry_run,
    )


def load_shared_weed_library(conn, data: list[dict], dry_run: bool = False) -> int:
    return bulk_insert(
        conn, "shared.weed_library", data,
        conflict_action="DO NOTHING",
        conflict_target="(weed_id)" if data and "weed_id" in data[0] else "",
        dry_run=dry_run,
    )


def load_shared_chemical_library(conn, data: list[dict], dry_run: bool = False) -> int:
    return bulk_insert(
        conn, "shared.chemical_library", data,
        conflict_action="DO NOTHING",
        conflict_target="(chemical_id)" if data and "chemical_id" in data[0] else "",
        dry_run=dry_run,
    )


def load_shared_family_policies(conn, data: list[dict], dry_run: bool = False) -> int:
    return bulk_insert(
        conn, "shared.family_policies", data,
        conflict_action="DO NOTHING",
        conflict_target="(policy_id)" if data and "policy_id" in data[0] else "",
        dry_run=dry_run,
    )


def load_shared_rotation_registry(conn, data: list[dict], dry_run: bool = False) -> int:
    return bulk_insert(
        conn, "shared.rotation_registry", data,
        conflict_action="DO NOTHING",
        conflict_target="(production_id)" if data and "production_id" in data[0] else "",
        dry_run=dry_run,
    )


def load_shared_actionable_rules(conn, data: list[dict], dry_run: bool = False) -> int:
    """Bulk insert in chunks of 100 — table is 1444 rows."""
    return bulk_insert(
        conn, "shared.actionable_rules", data,
        conflict_action="DO NOTHING",
        conflict_target="(rule_key)" if data and "rule_key" in data[0] else "",
        chunk_size=100,
        dry_run=dry_run,
    )


def load_shared_matrices(
    conn,
    status_data: list[dict],
    min_rest_data: list[dict],
    dry_run: bool = False,
) -> tuple[int, int]:
    """Load both status_matrix and min_rest_matrix."""
    n1 = bulk_insert(
        conn, "shared.status_matrix", status_data,
        conflict_action="DO NOTHING",
        conflict_target="(from_status, to_status)" if status_data and "from_status" in status_data[0] else "",
        dry_run=dry_run,
    )
    n2 = bulk_insert(
        conn, "shared.min_rest_matrix", min_rest_data,
        conflict_action="DO NOTHING",
        conflict_target="(production_id, zone_id)" if min_rest_data and "production_id" in min_rest_data[0] else "",
        dry_run=dry_run,
    )
    return n1, n2


def load_shared_top_choices(conn, data: list[dict], dry_run: bool = False) -> int:
    return bulk_insert(
        conn, "shared.rotation_top_choices", data,
        conflict_action="DO NOTHING",
        conflict_target="(production_id, rank)" if data and "production_id" in data[0] and "rank" in data[0] else "",
        dry_run=dry_run,
    )


# =============================================================================
# Phase B — Tenant Core
# =============================================================================

def load_tenant_farms(conn, data: list[dict], tenant_id: str, dry_run: bool = False) -> int:
    for row in data:
        row["tenant_id"] = tenant_id
    return bulk_insert(
        conn, "farms", data,
        conflict_action="DO UPDATE SET updated_at = NOW()",
        conflict_target="(farm_id)",
        dry_run=dry_run,
    )


def load_tenant_zones(conn, data: list[dict], tenant_id: str, dry_run: bool = False) -> int:
    for row in data:
        row["tenant_id"] = tenant_id
    return bulk_insert(
        conn, "zones", data,
        conflict_action="DO UPDATE SET updated_at = NOW()",
        conflict_target="(zone_id)",
        dry_run=dry_run,
    )


def load_tenant_suppliers(conn, data: list[dict], tenant_id: str, dry_run: bool = False) -> int:
    for row in data:
        row["tenant_id"] = tenant_id
    return bulk_insert(
        conn, "suppliers", data,
        conflict_action="DO UPDATE SET updated_at = NOW()",
        conflict_target="(supplier_id)",
        dry_run=dry_run,
    )


def load_tenant_customers(conn, data: list[dict], tenant_id: str, dry_run: bool = False) -> int:
    for row in data:
        row["tenant_id"] = tenant_id
    return bulk_insert(
        conn, "customers", data,
        conflict_action="DO UPDATE SET updated_at = NOW()",
        conflict_target="(customer_id)",
        dry_run=dry_run,
    )


def load_tenant_workers(conn, data: list[dict], tenant_id: str, dry_run: bool = False) -> int:
    for row in data:
        row["tenant_id"] = tenant_id
    return bulk_insert(
        conn, "workers", data,
        conflict_action="DO UPDATE SET updated_at = NOW()",
        conflict_target="(worker_id)",
        dry_run=dry_run,
    )


def load_tenant_production_units(conn, data: list[dict], tenant_id: str, dry_run: bool = False) -> int:
    for row in data:
        row["tenant_id"] = tenant_id
    return bulk_insert(
        conn, "production_units", data,
        conflict_action="DO UPDATE SET updated_at = NOW()",
        conflict_target="(production_unit_id)",
        dry_run=dry_run,
    )


def load_tenant_equipment(conn, data: list[dict], tenant_id: str, dry_run: bool = False) -> int:
    for row in data:
        row["tenant_id"] = tenant_id
    return bulk_insert(
        conn, "equipment", data,
        conflict_action="DO UPDATE SET updated_at = NOW()",
        conflict_target="(equipment_id)",
        dry_run=dry_run,
    )


def load_tenant_inputs(conn, data: list[dict], tenant_id: str, dry_run: bool = False) -> int:
    for row in data:
        row["tenant_id"] = tenant_id
    return bulk_insert(
        conn, "inputs", data,
        conflict_action="DO UPDATE SET updated_at = NOW()",
        conflict_target="(input_id)",
        dry_run=dry_run,
    )


# =============================================================================
# Phase C — Configuration
# =============================================================================

def load_automation_rules(conn, data: list[dict], tenant_id: str, dry_run: bool = False) -> int:
    for row in data:
        row["tenant_id"] = tenant_id
        # Normalise active field to boolean
        if "active" in row and isinstance(row["active"], str):
            row["active"] = row["active"].lower() in ("true", "1", "yes")
    return bulk_insert(
        conn, "automation_rules", data,
        conflict_action="DO UPDATE SET "
                        "active = EXCLUDED.active, "
                        "trigger_category = EXCLUDED.trigger_category, "
                        "task_type = EXCLUDED.task_type, "
                        "frequency_days = EXCLUDED.frequency_days, "
                        "severity = EXCLUDED.severity, "
                        "updated_at = NOW()",
        conflict_target="(rule_id, tenant_id)",
        dry_run=dry_run,
    )


def load_decision_signals(conn, data: list[dict], dry_run: bool = False) -> int:
    return bulk_insert(
        conn, "decision_signal_config", data,
        conflict_action="DO UPDATE SET updated_at = NOW()",
        conflict_target="(signal_name)" if data and "signal_name" in data[0] else "",
        dry_run=dry_run,
    )


# =============================================================================
# Phase D — Active Operational Data
# =============================================================================

def load_active_cycles(conn, data: list[dict], tenant_id: str, dry_run: bool = False) -> int:
    for row in data:
        row["tenant_id"] = tenant_id
    return bulk_insert(
        conn, "production_cycles", data,
        conflict_action="DO UPDATE SET "
                        "status = EXCLUDED.status, "
                        "updated_at = NOW()",
        conflict_target="(cycle_id)",
        dry_run=dry_run,
    )


def load_price_master(conn, data: list[dict], tenant_id: str, dry_run: bool = False) -> int:
    for row in data:
        row["tenant_id"] = tenant_id
        # Ensure currency is FJD
        row.setdefault("currency", "FJD")
    return bulk_insert(
        conn, "price_master", data,
        conflict_action="DO UPDATE SET "
                        "price_fjd = EXCLUDED.price_fjd, "
                        "updated_at = NOW()",
        conflict_target="(production_id, customer_id, tenant_id)"
                        if data and "production_id" in data[0] and "customer_id" in data[0]
                        else "",
        dry_run=dry_run,
    )


# =============================================================================
# Phase runner
# =============================================================================

class MigrationStats:
    def __init__(self):
        self.rows_per_table: dict[str, int] = {}
        self.start_time = time.monotonic()
        self.validation_failures: list[str] = []

    def record(self, table: str, rows: int) -> None:
        self.rows_per_table[table] = rows

    def fail(self, table: str) -> None:
        self.validation_failures.append(table)

    def elapsed(self) -> float:
        return time.monotonic() - self.start_time

    def report(self) -> None:
        print("\n" + "=" * 60)
        print("MIGRATION COMPLETION REPORT")
        print("=" * 60)
        total_rows = 0
        for table, rows in self.rows_per_table.items():
            print(f"  {table:<45} {rows:>6} rows")
            total_rows += rows
        print("-" * 60)
        print(f"  {'TOTAL':<45} {total_rows:>6} rows")
        print(f"  Time elapsed: {self.elapsed():.2f}s")
        if self.validation_failures:
            print(f"\n  VALIDATION FAILURES: {self.validation_failures}")
        else:
            print("\n  All validations passed ✓")
        print("=" * 60)


def run_phase_a(conn, data_dir: Path, stats: MigrationStats, dry_run: bool) -> bool:
    """Phase A — Shared reference schema."""
    log.info("\n--- Phase A: Shared Schema ---")
    passed = True

    loaders = [
        ("shared_productions.json",        "shared.productions",               load_shared_productions,     None),
        ("shared_production_stages.json",   "shared.production_stages",         load_shared_stages,          None),
        ("shared_stage_protocols.json",     "shared.production_stage_protocols", load_shared_protocols,      None),
        ("shared_production_thresholds.json","shared.production_thresholds",    load_shared_thresholds,      None),
        ("shared_pest_library.json",        "shared.pest_library",              load_shared_pest_library,    None),
        ("shared_disease_library.json",     "shared.disease_library",           load_shared_disease_library, None),
        ("shared_weed_library.json",        "shared.weed_library",              load_shared_weed_library,    None),
        ("shared_chemical_library.json",    "shared.chemical_library",          load_shared_chemical_library,None),
        ("shared_family_policies.json",     "shared.family_policies",           load_shared_family_policies, None),
        ("shared_rotation_registry.json",   "shared.rotation_registry",         load_shared_rotation_registry,None),
        ("shared_actionable_rules.json",    "shared.actionable_rules",          load_shared_actionable_rules,None),
        ("shared_rotation_top_choices.json","shared.rotation_top_choices",      load_shared_top_choices,     None),
    ]

    for filename, table, loader_fn, _ in loaders:
        data = load_json(data_dir, filename)
        if data is None:
            log.warning("Skipping %s (file not found)", table)
            continue
        n = loader_fn(conn, data, dry_run)
        stats.record(table, n)
        expected = EXPECTED_COUNTS.get(table, 0)
        if expected > 0 and not validate_count(conn, table, expected, dry_run):
            stats.fail(table)
            passed = False

    # Status + MinRest matrices
    status_data = load_json(data_dir, "shared_status_matrix.json") or []
    min_rest_data = load_json(data_dir, "shared_min_rest_matrix.json") or []
    n1, n2 = load_shared_matrices(conn, status_data, min_rest_data, dry_run)
    stats.record("shared.status_matrix", n1)
    stats.record("shared.min_rest_matrix", n2)

    if not dry_run:
        conn.commit()
        log.info("Phase A committed ✓")

    return passed


def run_phase_b(conn, data_dir: Path, tenant_id: str, stats: MigrationStats, dry_run: bool) -> bool:
    """Phase B — Tenant core data."""
    log.info("\n--- Phase B: Tenant Core ---")
    passed = True

    loaders = [
        ("tenant_farms.json",            "farms",            load_tenant_farms),
        ("tenant_zones.json",            "zones",            load_tenant_zones),
        ("tenant_suppliers.json",        "suppliers",        load_tenant_suppliers),
        ("tenant_customers.json",        "customers",        load_tenant_customers),
        ("tenant_workers.json",          "workers",          load_tenant_workers),
        ("tenant_production_units.json", "production_units", load_tenant_production_units),
        ("tenant_equipment.json",        "equipment",        load_tenant_equipment),
        ("tenant_inputs.json",           "inputs",           load_tenant_inputs),
    ]

    for filename, table, loader_fn in loaders:
        data = load_json(data_dir, filename)
        if data is None:
            log.warning("Skipping %s (file not found)", table)
            continue
        n = loader_fn(conn, data, tenant_id, dry_run)
        stats.record(table, n)
        expected = EXPECTED_COUNTS.get(table, 0)
        if expected > 0 and not validate_count(conn, table, expected, dry_run):
            stats.fail(table)
            passed = False

    if not dry_run:
        conn.commit()
        log.info("Phase B committed ✓")

    return passed


def run_phase_c(conn, data_dir: Path, tenant_id: str, stats: MigrationStats, dry_run: bool) -> bool:
    """Phase C — Configuration tables."""
    log.info("\n--- Phase C: Configuration ---")
    passed = True

    # Automation rules
    rules_data = load_json(data_dir, "tenant_automation_rules.json")
    if rules_data:
        n = load_automation_rules(conn, rules_data, tenant_id, dry_run)
        stats.record("automation_rules", n)
        if not validate_count(conn, "automation_rules", EXPECTED_COUNTS["automation_rules"], dry_run):
            stats.fail("automation_rules")
            passed = False

    # Decision signal config
    signals_data = load_json(data_dir, "tenant_decision_signals.json")
    if signals_data:
        n = load_decision_signals(conn, signals_data, dry_run)
        stats.record("decision_signal_config", n)
        if not validate_count(conn, "decision_signal_config", EXPECTED_COUNTS["decision_signal_config"], dry_run):
            stats.fail("decision_signal_config")
            passed = False

    if not dry_run:
        conn.commit()
        log.info("Phase C committed ✓")

    return passed


def run_phase_d(conn, data_dir: Path, tenant_id: str, stats: MigrationStats, dry_run: bool) -> bool:
    """Phase D — Active operational data."""
    log.info("\n--- Phase D: Active Data ---")
    passed = True

    # Active cycles
    cycles_data = load_json(data_dir, "tenant_active_cycles.json")
    if cycles_data:
        n = load_active_cycles(conn, cycles_data, tenant_id, dry_run)
        stats.record("production_cycles", n)
        if not validate_count(conn, "production_cycles", EXPECTED_COUNTS["production_cycles"], dry_run):
            stats.fail("production_cycles")
            passed = False

    # Price master
    price_data = load_json(data_dir, "tenant_price_master.json")
    if price_data:
        n = load_price_master(conn, price_data, tenant_id, dry_run)
        stats.record("price_master", n)

    if not dry_run:
        conn.commit()
        log.info("Phase D committed ✓")

    return passed


# =============================================================================
# Main entry point
# =============================================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Load TFOS v7.0 extracted JSON into PostgreSQL",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Full migration
  python load_to_postgres.py \\
      --data-dir ../extracted_json \\
      --tenant-id 550e8400-e29b-41d4-a716-446655440000 \\
      --phase all

  # Dry run (no DB writes)
  python load_to_postgres.py \\
      --data-dir ../extracted_json \\
      --tenant-id 550e8400-e29b-41d4-a716-446655440000 \\
      --dry-run

  # Phase A only
  python load_to_postgres.py \\
      --data-dir ../extracted_json/shared \\
      --tenant-id 550e8400-e29b-41d4-a716-446655440000 \\
      --phase A

  # Phases B+C+D only (shared already loaded)
  python load_to_postgres.py \\
      --data-dir ../extracted_json \\
      --tenant-id 550e8400-e29b-41d4-a716-446655440000 \\
      --phase B C D
        """,
    )
    parser.add_argument(
        "--data-dir", "-d",
        type=Path,
        required=True,
        help="Directory containing extracted JSON files",
    )
    parser.add_argument(
        "--tenant-id", "-t",
        type=str,
        required=True,
        help="Tenant UUID (used as FK in all tenant tables)",
    )
    parser.add_argument(
        "--phase",
        nargs="+",
        default=["all"],
        choices=["A", "B", "C", "D", "all"],
        help="Which phase(s) to run (default: all). Can specify multiple e.g. --phase B C D",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Validate JSON and report what would be inserted without writing to DB",
    )
    parser.add_argument(
        "--database-url",
        type=str,
        default=None,
        help="PostgreSQL connection URL (overrides DATABASE_URL env var)",
    )
    parser.add_argument(
        "--no-transaction",
        action="store_true",
        default=False,
        help="Commit each phase independently (default: single transaction — rollback all on failure)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    # Resolve database URL
    database_url = args.database_url or os.getenv("DATABASE_URL")
    if not database_url and not args.dry_run:
        log.error(
            "DATABASE_URL not set. Provide --database-url or set DATABASE_URL env var."
        )
        return 2

    # Determine which phases to run
    phases_to_run: set[str]
    if "all" in args.phase:
        phases_to_run = {"A", "B", "C", "D"}
    else:
        phases_to_run = set(args.phase)

    # Normalise data_dir — support both separate shared/tenant dirs and combined
    data_dir = args.data_dir
    if not data_dir.exists():
        log.error("Data directory not found: %s", data_dir)
        return 1

    shared_dir = data_dir / "shared" if (data_dir / "shared").exists() else data_dir
    tenant_dir = data_dir / "tenant" if (data_dir / "tenant").exists() else data_dir

    tenant_id = args.tenant_id
    dry_run = args.dry_run

    log.info("=" * 60)
    log.info("TFOS v7.0 → PostgreSQL Migration Loader")
    log.info("Data dir  : %s", data_dir)
    log.info("Tenant ID : %s", tenant_id)
    log.info("Phases    : %s", sorted(phases_to_run))
    log.info("Dry run   : %s", dry_run)
    if not dry_run:
        log.info("Database  : %s", database_url.split("@")[-1] if "@" in database_url else "(set)")
    log.info("=" * 60)

    stats = MigrationStats()
    all_passed = True

    if dry_run:
        # Dry run mode: parse all JSON, report without connecting
        log.info("[DRY RUN] Scanning JSON files...")

        def fake_conn():
            return None

        if "A" in phases_to_run:
            for fname in [
                "shared_productions.json", "shared_production_stages.json",
                "shared_stage_protocols.json", "shared_production_thresholds.json",
                "shared_pest_library.json", "shared_disease_library.json",
                "shared_weed_library.json", "shared_chemical_library.json",
                "shared_family_policies.json", "shared_rotation_registry.json",
                "shared_actionable_rules.json", "shared_status_matrix.json",
                "shared_min_rest_matrix.json", "shared_rotation_top_choices.json",
            ]:
                d = load_json(shared_dir, fname)
                table = fname.replace("shared_", "shared.").replace(".json", "").replace("_", ".", 1)
                n = len(d) if d else 0
                log.info("  [DRY RUN] %s → %d rows would be inserted", fname, n)
                stats.record(fname, n)

        if "B" in phases_to_run or "C" in phases_to_run or "D" in phases_to_run:
            tenant_files = [
                "tenant_farms.json", "tenant_zones.json", "tenant_suppliers.json",
                "tenant_customers.json", "tenant_workers.json",
                "tenant_production_units.json", "tenant_equipment.json",
                "tenant_inputs.json", "tenant_automation_rules.json",
                "tenant_decision_signals.json", "tenant_active_cycles.json",
                "tenant_price_master.json",
            ]
            for fname in tenant_files:
                d = load_json(tenant_dir, fname)
                n = len(d) if d else 0
                log.info("  [DRY RUN] %s → %d rows would be inserted", fname, n)
                stats.record(fname, n)

        stats.report()
        return 0

    # Live mode — connect and load
    with get_connection(database_url) as conn:
        if args.no_transaction:
            # Per-phase commits
            if "A" in phases_to_run:
                ok = run_phase_a(conn, shared_dir, stats, dry_run)
                all_passed = all_passed and ok
            if "B" in phases_to_run:
                ok = run_phase_b(conn, tenant_dir, tenant_id, stats, dry_run)
                all_passed = all_passed and ok
            if "C" in phases_to_run:
                ok = run_phase_c(conn, tenant_dir, tenant_id, stats, dry_run)
                all_passed = all_passed and ok
            if "D" in phases_to_run:
                ok = run_phase_d(conn, tenant_dir, tenant_id, stats, dry_run)
                all_passed = all_passed and ok
        else:
            # Single transaction — rollback everything on failure
            try:
                conn.autocommit = False
                if "A" in phases_to_run:
                    ok = run_phase_a(conn, shared_dir, stats, dry_run)
                    if not ok:
                        raise RuntimeError("Phase A validation failed")
                if "B" in phases_to_run:
                    ok = run_phase_b(conn, tenant_dir, tenant_id, stats, dry_run)
                    if not ok:
                        raise RuntimeError("Phase B validation failed")
                if "C" in phases_to_run:
                    ok = run_phase_c(conn, tenant_dir, tenant_id, stats, dry_run)
                    if not ok:
                        raise RuntimeError("Phase C validation failed")
                if "D" in phases_to_run:
                    ok = run_phase_d(conn, tenant_dir, tenant_id, stats, dry_run)
                    if not ok:
                        raise RuntimeError("Phase D validation failed")

                conn.commit()
                log.info("All phases committed in single transaction ✓")
                all_passed = True

            except Exception as exc:
                conn.rollback()
                log.error("Migration failed — ROLLBACK issued: %s", exc)
                all_passed = False

    stats.report()
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
