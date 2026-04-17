# FILE: 05_data_migration/migration_scripts/extract_shared_data.py
# Teivaka Farm OS (TFOS) — Shared Reference Data Extractor
#
# Reads the TFOS v7.0 xlsx export (Google Sheets, 103 sheets) and extracts
# all shared reference data into individual JSON files for PostgreSQL loading.
#
# Usage:
#   python extract_shared_data.py
#   python extract_shared_data.py --input /path/to/TFOS_v7.0.xlsx --output /path/to/output/
#
# Exit codes:
#   0 — all validations passed
#   1 — one or more validations failed (see validation_report.json)
#
# Author: Teivaka dev team
# Target: Python 3.12

import sys
import json
import logging
import argparse
import re
from pathlib import Path
from dataclasses import dataclass, field, asdict
from typing import Any

import pandas as pd

# =============================================================================
# Configuration
# =============================================================================

# Defaults — override via CLI arguments
DEFAULT_INPUT_FILE = Path(__file__).parent.parent / "source_data" / "TFOS_v7.0.xlsx"
DEFAULT_OUTPUT_DIR = Path(__file__).parent.parent / "extracted_json" / "shared"

# =============================================================================
# Logging
# =============================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("extract_shared")

# =============================================================================
# Data classes
# =============================================================================

@dataclass
class ValidationIssue:
    sheet: str
    severity: str          # "ERROR" | "WARNING" | "INFO"
    message: str
    detail: str = ""


@dataclass
class ExtractionResult:
    sheet_name: str
    output_file: str
    rows_exported: int
    passed: bool
    issues: list[ValidationIssue] = field(default_factory=list)


# =============================================================================
# Utility helpers
# =============================================================================

def to_snake_case(name: str) -> str:
    """Convert column name to snake_case.

    Examples:
        ProductionID     → production_id
        InactivityAlert_days → inactivity_alert_days
        TriggerCategory  → trigger_category
    """
    # Insert underscore before sequences of uppercase letters followed by lowercase
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", str(name))
    s = re.sub(r"([a-z\d])([A-Z])", r"\1_\2", s)
    # Replace spaces, hyphens with underscores
    s = s.replace(" ", "_").replace("-", "_")
    # Collapse multiple underscores
    s = re.sub(r"_+", "_", s)
    return s.lower().strip("_")


def normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Rename all DataFrame columns to snake_case."""
    df.columns = [to_snake_case(c) for c in df.columns]
    return df


def strip_strings(df: pd.DataFrame) -> pd.DataFrame:
    """Strip leading/trailing whitespace from all string/object columns."""
    for col in df.select_dtypes(include=["object"]).columns:
        df[col] = df[col].str.strip() if hasattr(df[col], "str") else df[col]
    return df


def df_to_records(df: pd.DataFrame) -> list[dict]:
    """Convert DataFrame to list of JSON-serialisable dicts.

    - NaN → None
    - pandas Timestamp → ISO-8601 string
    - numpy int/float → Python int/float
    """
    records = []
    for _, row in df.iterrows():
        record: dict[str, Any] = {}
        for k, v in row.items():
            if pd.isna(v) if not isinstance(v, (list, dict)) else False:
                record[k] = None
            elif hasattr(v, "isoformat"):
                record[k] = v.isoformat()
            elif hasattr(v, "item"):           # numpy scalar
                record[k] = v.item()
            else:
                record[k] = v
        records.append(record)
    return records


def read_sheet(xlsx_path: Path, sheet_name: str) -> pd.DataFrame | None:
    """Read a single sheet from the xlsx workbook. Returns None if sheet missing."""
    try:
        df = pd.read_excel(xlsx_path, sheet_name=sheet_name, dtype=str, engine="openpyxl")
        # Drop fully-empty rows
        df = df.dropna(how="all")
        return df
    except Exception as exc:
        log.error("Failed to read sheet '%s': %s", sheet_name, exc)
        return None


def write_json(output_dir: Path, filename: str, data: list[dict]) -> Path:
    """Write a list of dicts to a JSON file, pretty-printed."""
    out_path = output_dir / filename
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False, default=str)
    return out_path


def check_required_columns(df: pd.DataFrame, required: list[str], sheet: str,
                             issues: list[ValidationIssue]) -> bool:
    """Verify that all required (snake_case) columns exist in the DataFrame."""
    missing = [c for c in required if c not in df.columns]
    if missing:
        issues.append(ValidationIssue(
            sheet=sheet,
            severity="ERROR",
            message="Missing required columns",
            detail=f"Expected columns not found: {missing}. Available: {list(df.columns)}",
        ))
        return False
    return True


# =============================================================================
# Sheet-specific extractors
# =============================================================================

def extract_production_master(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Production_Master — 49 rows expected."""
    SHEET = "Production_Master"
    OUTPUT = "shared_productions.json"
    EXPECTED_ROWS = 49

    # Known production IDs (49 total)
    EXPECTED_IDS = {
        "CRP-EGP", "CRP-EGW", "CRP-CMC", "CRP-CMW", "CRP-CAB", "CRP-CAW",
        "CRP-BEA", "CRP-BEW", "CRP-OCR", "CRP-LEM", "CRP-ONI", "CRP-GAR",
        "CRP-TOM", "CRP-PUM", "CRP-WAT", "CRP-CUC", "CRP-CHI", "CRP-PAP",
        "CRP-PIN", "CRP-BAN", "CRP-GIN", "CRP-TUR", "CRP-KAV", "CRP-DAL",
        "CRP-SWT", "CRP-YAM", "CRP-TAR", "CRP-COC", "CRP-CAS",
        "LVS-CHK", "LVS-DUK", "LVS-PIG", "LVS-COW", "LVS-GOA",
        "AQU-TIL", "AQU-PRA", "AQU-CAT", "AQU-MUL",
        "HRB-TUL", "HRB-NIM", "HRB-ALV", "HRB-MOR",
        "FLR-MRG", "FLR-SUN", "FLR-HIB",
        "FRS-STR", "FRS-PAP", "FRS-LIM", "FRS-AVO",
    }

    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found in workbook"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    required = ["production_id", "production_name", "category"]
    if not check_required_columns(df, required, SHEET, issues):
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    # Row count validation
    row_count = len(df)
    if row_count != EXPECTED_ROWS:
        issues.append(ValidationIssue(
            SHEET, "ERROR",
            f"Row count mismatch: expected {EXPECTED_ROWS}, found {row_count}",
            detail=f"Difference of {abs(row_count - EXPECTED_ROWS)} rows",
        ))

    # ProductionID completeness check
    found_ids = set(df["production_id"].dropna().str.strip().tolist())
    missing_ids = EXPECTED_IDS - found_ids
    extra_ids = found_ids - EXPECTED_IDS
    if missing_ids:
        issues.append(ValidationIssue(
            SHEET, "ERROR",
            "Missing expected ProductionIDs",
            detail=f"Missing: {sorted(missing_ids)}",
        ))
    if extra_ids:
        issues.append(ValidationIssue(
            SHEET, "WARNING",
            "Unexpected ProductionIDs found",
            detail=f"Extra: {sorted(extra_ids)}",
        ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity == "ERROR" for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


def extract_production_stages(xlsx: Path, output_dir: Path) -> ExtractionResult:
    SHEET = "Production_Stages"
    OUTPUT = "shared_production_stages.json"
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    required = ["production_id", "stage_id", "stage_name", "stage_order"]
    if not check_required_columns(df, required, SHEET, issues):
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity == "ERROR" for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), len(records), passed, issues)


def extract_stage_protocols(xlsx: Path, output_dir: Path) -> ExtractionResult:
    SHEET = "Stage_Protocols"
    OUTPUT = "shared_stage_protocols.json"
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)
    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    return ExtractionResult(SHEET, str(out_path.name), len(records), True, issues)


def extract_production_thresholds(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Production_Thresholds — validate CRP-KAV InactivityAlert_days = 180."""
    SHEET = "Production_Thresholds"
    OUTPUT = "shared_production_thresholds.json"
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    # Validate CRP-KAV InactivityAlert_days
    if "production_id" in df.columns and "inactivity_alert_days" in df.columns:
        kav_rows = df[df["production_id"] == "CRP-KAV"]
        if kav_rows.empty:
            issues.append(ValidationIssue(
                SHEET, "WARNING",
                "CRP-KAV not found in Production_Thresholds",
                detail="Cannot validate InactivityAlert_days = 180",
            ))
        else:
            for _, row in kav_rows.iterrows():
                try:
                    val = int(float(str(row["inactivity_alert_days"])))
                    if val != 180:
                        issues.append(ValidationIssue(
                            SHEET, "ERROR",
                            "CRP-KAV InactivityAlert_days is not 180",
                            detail=f"Found: {val} (expected: 180)",
                        ))
                    else:
                        log.info("  [OK] CRP-KAV InactivityAlert_days = 180 ✓")
                except (ValueError, TypeError) as e:
                    issues.append(ValidationIssue(
                        SHEET, "ERROR",
                        "CRP-KAV InactivityAlert_days is not numeric",
                        detail=str(e),
                    ))
    else:
        issues.append(ValidationIssue(
            SHEET, "WARNING",
            "Columns production_id or inactivity_alert_days not found — skipping CRP-KAV check",
        ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity == "ERROR" for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), len(records), passed, issues)


def extract_pest_library(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Pest_Library — 43 pests expected."""
    SHEET = "Pest_Library"
    OUTPUT = "shared_pest_library.json"
    EXPECTED_ROWS = 43
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if row_count != EXPECTED_ROWS:
        issues.append(ValidationIssue(
            SHEET, "ERROR",
            f"Row count mismatch: expected {EXPECTED_ROWS}, found {row_count}",
        ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity == "ERROR" for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


def extract_disease_library(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Disease_Library — 30 diseases expected."""
    SHEET = "Disease_Library"
    OUTPUT = "shared_disease_library.json"
    EXPECTED_ROWS = 30
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if row_count != EXPECTED_ROWS:
        issues.append(ValidationIssue(
            SHEET, "ERROR",
            f"Row count mismatch: expected {EXPECTED_ROWS}, found {row_count}",
        ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity == "ERROR" for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


def extract_weed_library(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Weed_Library — 27 weeds expected."""
    SHEET = "Weed_Library"
    OUTPUT = "shared_weed_library.json"
    EXPECTED_ROWS = 27
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if row_count != EXPECTED_ROWS:
        issues.append(ValidationIssue(
            SHEET, "ERROR",
            f"Row count mismatch: expected {EXPECTED_ROWS}, found {row_count}",
        ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity == "ERROR" for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


def extract_chemical_library(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Chemicals_Library — 45 chemicals, validate WithholdingPeriod_days is numeric."""
    SHEET = "Chemicals_Library"
    OUTPUT = "shared_chemical_library.json"
    EXPECTED_ROWS = 45
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if row_count != EXPECTED_ROWS:
        issues.append(ValidationIssue(
            SHEET, "ERROR",
            f"Row count mismatch: expected {EXPECTED_ROWS}, found {row_count}",
        ))

    # Validate WithholdingPeriod_days is numeric (not boolean or free text)
    whp_col = "withholding_period_days"
    if whp_col in df.columns:
        bad_rows: list[tuple[int, Any]] = []
        for idx, raw in enumerate(df[whp_col]):
            if raw is None or (isinstance(raw, float) and pd.isna(raw)):
                continue  # None/NaN is acceptable (not all chemicals have a WHP)
            # Check for boolean strings
            if isinstance(raw, str) and raw.lower() in ("true", "false"):
                bad_rows.append((idx + 2, raw))  # +2 for 1-based + header row
                continue
            try:
                float(str(raw))
            except ValueError:
                bad_rows.append((idx + 2, raw))

        if bad_rows:
            issues.append(ValidationIssue(
                SHEET, "ERROR",
                "WithholdingPeriod_days contains non-numeric values",
                detail=f"Row(s) with bad values (xlsx row number, value): {bad_rows}",
            ))
            # Attempt to coerce: set non-numeric to None
            def _safe_numeric(v):
                if v is None:
                    return None
                if isinstance(v, str) and v.lower() in ("true", "false"):
                    log.warning("  [FIX] Chemical row: WithholdingPeriod_days='%s' → None", v)
                    return None
                try:
                    return int(float(v))
                except (ValueError, TypeError):
                    return None
            df[whp_col] = df[whp_col].apply(_safe_numeric)
            issues.append(ValidationIssue(
                SHEET, "INFO",
                "Applied auto-fix: non-numeric WithholdingPeriod_days → None",
                detail=f"Affected rows: {[r[0] for r in bad_rows]}",
            ))
    else:
        issues.append(ValidationIssue(
            SHEET, "WARNING",
            f"Column '{whp_col}' not found — skipping numeric validation",
        ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity == "ERROR" for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


def extract_family_policies(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Family_Policies — 14 policies expected."""
    SHEET = "Family_Policies"
    OUTPUT = "shared_family_policies.json"
    EXPECTED_ROWS = 14
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if row_count != EXPECTED_ROWS:
        issues.append(ValidationIssue(
            SHEET, "ERROR",
            f"Row count mismatch: expected {EXPECTED_ROWS}, found {row_count}",
        ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity == "ERROR" for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


def extract_rotation_registry(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Rotation_Registry — 49 rows expected (mirrors Production_Master)."""
    SHEET = "Rotation_Registry"
    OUTPUT = "shared_rotation_registry.json"
    EXPECTED_ROWS = 49
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if row_count != EXPECTED_ROWS:
        issues.append(ValidationIssue(
            SHEET, "ERROR",
            f"Row count mismatch: expected {EXPECTED_ROWS}, found {row_count}",
        ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity == "ERROR" for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


def extract_actionable_rules(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Actionable_Rules — 1444 rows expected (±10 tolerance)."""
    SHEET = "Actionable_Rules"
    OUTPUT = "shared_actionable_rules.json"
    EXPECTED_ROWS = 1444
    TOLERANCE = 10
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if abs(row_count - EXPECTED_ROWS) > TOLERANCE:
        issues.append(ValidationIssue(
            SHEET, "ERROR",
            f"Row count outside tolerance: expected {EXPECTED_ROWS} ±{TOLERANCE}, found {row_count}",
            detail=f"Difference: {row_count - EXPECTED_ROWS} rows",
        ))
    elif row_count != EXPECTED_ROWS:
        issues.append(ValidationIssue(
            SHEET, "WARNING",
            f"Row count minor discrepancy: expected {EXPECTED_ROWS}, found {row_count} (within ±{TOLERANCE} tolerance)",
            detail=f"Difference: {row_count - EXPECTED_ROWS} rows",
        ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity == "ERROR" for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


def extract_status_matrix(xlsx: Path, output_dir: Path) -> ExtractionResult:
    SHEET = "Status_Matrix"
    OUTPUT = "shared_status_matrix.json"
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)
    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    return ExtractionResult(SHEET, str(out_path.name), len(records), True, issues)


def extract_min_rest_matrix(xlsx: Path, output_dir: Path) -> ExtractionResult:
    SHEET = "MinRest_Matrix"
    OUTPUT = "shared_min_rest_matrix.json"
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)
    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    return ExtractionResult(SHEET, str(out_path.name), len(records), True, issues)


def extract_rotation_top_choices(xlsx: Path, output_dir: Path) -> ExtractionResult:
    SHEET = "RotationTopChoices"
    OUTPUT = "shared_rotation_top_choices.json"
    issues: list[ValidationIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(ValidationIssue(SHEET, "ERROR", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)
    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    return ExtractionResult(SHEET, str(out_path.name), len(records), True, issues)


# =============================================================================
# Orchestrator
# =============================================================================

EXTRACTORS = [
    extract_production_master,
    extract_production_stages,
    extract_stage_protocols,
    extract_production_thresholds,
    extract_pest_library,
    extract_disease_library,
    extract_weed_library,
    extract_chemical_library,
    extract_family_policies,
    extract_rotation_registry,
    extract_actionable_rules,
    extract_status_matrix,
    extract_min_rest_matrix,
    extract_rotation_top_choices,
]


def run_extraction(input_file: Path, output_dir: Path) -> int:
    """Run all extractors and write validation_report.json.

    Returns 0 if all validations pass, 1 if any errors found.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    log.info("=" * 60)
    log.info("TFOS v7.0 Shared Data Extraction")
    log.info("Input : %s", input_file)
    log.info("Output: %s", output_dir)
    log.info("=" * 60)

    if not input_file.exists():
        log.error("Input file not found: %s", input_file)
        return 1

    results: list[ExtractionResult] = []
    all_passed = True

    for extractor in EXTRACTORS:
        sheet_name = extractor.__doc__.split("—")[0].strip() if extractor.__doc__ else extractor.__name__
        log.info("Processing: %s", sheet_name)
        result = extractor(input_file, output_dir)
        results.append(result)

        if result.passed:
            print(f"  ✓ {result.sheet_name}: {result.rows_exported} rows exported → {result.output_file}")
        else:
            all_passed = False
            error_msgs = [i.message for i in result.issues if i.severity == "ERROR"]
            print(f"  ✗ {result.sheet_name}: VALIDATION FAILED — {'; '.join(error_msgs)}")

        for issue in result.issues:
            if issue.severity == "WARNING":
                log.warning("  [%s] %s: %s %s",
                            issue.severity, issue.sheet, issue.message, issue.detail)
            elif issue.severity == "INFO":
                log.info("  [%s] %s: %s %s",
                         issue.severity, issue.sheet, issue.message, issue.detail)

    # Write validation report
    report = {
        "extraction_summary": {
            "total_sheets": len(results),
            "passed": sum(1 for r in results if r.passed),
            "failed": sum(1 for r in results if not r.passed),
            "all_passed": all_passed,
        },
        "results": [
            {
                "sheet": r.sheet_name,
                "output_file": r.output_file,
                "rows_exported": r.rows_exported,
                "passed": r.passed,
                "issues": [asdict(i) for i in r.issues],
            }
            for r in results
        ],
    }

    report_path = output_dir / "validation_report.json"
    with open(report_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)

    log.info("=" * 60)
    if all_passed:
        log.info("RESULT: ALL VALIDATIONS PASSED ✓")
        log.info("Validation report: %s", report_path)
    else:
        failed = [r.sheet_name for r in results if not r.passed]
        log.error("RESULT: VALIDATION FAILURES in: %s", failed)
        log.error("See validation report: %s", report_path)
    log.info("=" * 60)

    return 0 if all_passed else 1


# =============================================================================
# CLI entry point
# =============================================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract TFOS v7.0 shared reference data from xlsx to JSON",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python extract_shared_data.py
  python extract_shared_data.py --input ../source_data/TFOS_v7.0.xlsx
  python extract_shared_data.py --input TFOS_v7.0.xlsx --output /tmp/extracted/shared
        """,
    )
    parser.add_argument(
        "--input", "-i",
        type=Path,
        default=DEFAULT_INPUT_FILE,
        help=f"Path to TFOS v7.0 xlsx file (default: {DEFAULT_INPUT_FILE})",
    )
    parser.add_argument(
        "--output", "-o",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Output directory for JSON files (default: {DEFAULT_OUTPUT_DIR})",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    exit_code = run_extraction(args.input, args.output)
    sys.exit(exit_code)
