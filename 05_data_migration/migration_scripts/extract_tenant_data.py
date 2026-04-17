# FILE: 05_data_migration/migration_scripts/extract_tenant_data.py
# Teivaka Farm OS (TFOS) — Tenant-Specific Operational Data Extractor
#
# Reads the TFOS v7.0 xlsx export and extracts all Teivaka-specific data
# into individual JSON files, applying documented data quality fixes.
#
# CRITICAL FIXES APPLIED:
#   RULE-042 / RULE-043  : column shift correction
#   RULE-031 / RULE-032  : severity boolean True → 'High'
#   Decision_Engine row 11: NULL SignalName → delete row
#   CUS-016 Vunisea Market: rename to CUS-015 (duplicate fix)
#
# Usage:
#   python extract_tenant_data.py
#   python extract_tenant_data.py --input /path/to/TFOS_v7.0.xlsx --output /path/to/output/
#
# Exit codes:
#   0 — all critical fixes applied, all validations passed
#   1 — unfixable errors found (check data_quality_report.json)
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

DEFAULT_INPUT_FILE = Path(__file__).parent.parent / "source_data" / "TFOS_v7.0.xlsx"
DEFAULT_OUTPUT_DIR = Path(__file__).parent.parent / "extracted_json" / "tenant"

# Phone number normalisation: Fiji numbers are 7 digits, prefix +679
FJ_PHONE_RE = re.compile(r"^(\+679|679|0)?(\d{7})$")

# =============================================================================
# Logging
# =============================================================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("extract_tenant")

# =============================================================================
# Data classes
# =============================================================================

@dataclass
class QualityIssue:
    sheet: str
    severity: str          # "CRITICAL" | "ERROR" | "WARNING" | "FIX_APPLIED" | "INFO"
    message: str
    detail: str = ""
    row_reference: str = ""  # e.g. "xlsx row 12" or "RULE-042"


@dataclass
class ExtractionResult:
    sheet_name: str
    output_file: str
    rows_exported: int
    passed: bool
    issues: list[QualityIssue] = field(default_factory=list)


# =============================================================================
# Utility helpers (same pattern as extract_shared_data.py)
# =============================================================================

def to_snake_case(name: str) -> str:
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1_\2", str(name))
    s = re.sub(r"([a-z\d])([A-Z])", r"\1_\2", s)
    s = s.replace(" ", "_").replace("-", "_")
    s = re.sub(r"_+", "_", s)
    return s.lower().strip("_")


def normalise_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = [to_snake_case(c) for c in df.columns]
    return df


def strip_strings(df: pd.DataFrame) -> pd.DataFrame:
    for col in df.select_dtypes(include=["object"]).columns:
        df[col] = df[col].str.strip() if hasattr(df[col], "str") else df[col]
    return df


def df_to_records(df: pd.DataFrame) -> list[dict]:
    records = []
    for _, row in df.iterrows():
        record: dict[str, Any] = {}
        for k, v in row.items():
            if pd.isna(v) if not isinstance(v, (list, dict)) else False:
                record[k] = None
            elif hasattr(v, "isoformat"):
                record[k] = v.isoformat()
            elif hasattr(v, "item"):
                record[k] = v.item()
            else:
                record[k] = v
        records.append(record)
    return records


def read_sheet(xlsx_path: Path, sheet_name: str) -> pd.DataFrame | None:
    try:
        df = pd.read_excel(xlsx_path, sheet_name=sheet_name, dtype=str, engine="openpyxl")
        df = df.dropna(how="all")
        return df
    except Exception as exc:
        log.error("Failed to read sheet '%s': %s", sheet_name, exc)
        return None


def write_json(output_dir: Path, filename: str, data: list[dict]) -> Path:
    out_path = output_dir / filename
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False, default=str)
    return out_path


def check_required_columns(df: pd.DataFrame, required: list[str], sheet: str,
                             issues: list[QualityIssue]) -> bool:
    missing = [c for c in required if c not in df.columns]
    if missing:
        issues.append(QualityIssue(
            sheet=sheet,
            severity="ERROR",
            message="Missing required columns",
            detail=f"Expected: {missing}. Available: {list(df.columns)}",
        ))
        return False
    return True


def normalise_phone(raw: str | None) -> str | None:
    """Normalise Fiji phone number to +679XXXXXXX (7-digit local number)."""
    if raw is None:
        return None
    cleaned = re.sub(r"[\s\-\(\)]", "", str(raw))
    m = FJ_PHONE_RE.match(cleaned)
    if m:
        return f"+679{m.group(2)}"
    # Return original if it doesn't match known Fiji format
    return raw


# =============================================================================
# Extractors
# =============================================================================

# ---------------------------------------------------------------------------
# 1. Farm_Setup
# ---------------------------------------------------------------------------

def extract_farms(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Farm_Setup — F001 Save-A-Lot (Korovou Serua) + F002 Viyasiyasi (Kadavu)."""
    SHEET = "Farm_Setup"
    OUTPUT = "tenant_farms.json"
    issues: list[QualityIssue] = []

    EXPECTED_FARMS = {
        "F001": {
            "farm_name": "Save-A-Lot Farm",
            "location": "Korovou, Serua",
            "total_area_acres": 83,
            "active_area_acres": 4.15,
            "owner": "Nayans",
            "operator": "Teivaka PTE Limited",
        },
        "F002": {
            "farm_name": "Viyasiyasi Farm",
            "location": "Kadavu Island",
            "total_area_acres": 34,
            "owner": "Teivaka PTE Limited",
            "operator": "Teivaka PTE Limited",
        },
    }

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(QualityIssue(SHEET, "CRITICAL", "Sheet not found in workbook"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    # Validate expected farms are present
    if "farm_id" in df.columns:
        found_ids = set(df["farm_id"].dropna().tolist())
        for fid in EXPECTED_FARMS:
            if fid not in found_ids:
                issues.append(QualityIssue(
                    SHEET, "ERROR",
                    f"Expected farm {fid} not found",
                    detail=f"Found farm IDs: {sorted(found_ids)}",
                ))
    else:
        issues.append(QualityIssue(SHEET, "WARNING", "Column 'farm_id' not found"))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity in ("CRITICAL", "ERROR") for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), len(records), passed, issues)


# ---------------------------------------------------------------------------
# 2. Zone_Register
# ---------------------------------------------------------------------------

def extract_zones(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Zone_Register — 14 zones: F001-Z01..Z07 + F002-Z01..Z07."""
    SHEET = "Zone_Register"
    OUTPUT = "tenant_zones.json"
    EXPECTED_ZONES = 14
    ZONE_PATTERN = re.compile(r"^F\d{3}-Z\d{2}$")
    issues: list[QualityIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(QualityIssue(SHEET, "CRITICAL", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if row_count != EXPECTED_ZONES:
        issues.append(QualityIssue(
            SHEET, "ERROR",
            f"Zone count mismatch: expected {EXPECTED_ZONES}, found {row_count}",
        ))

    # Validate ZoneID format
    zone_id_col = "zone_id"
    if zone_id_col in df.columns:
        bad_ids = [v for v in df[zone_id_col].dropna() if not ZONE_PATTERN.match(str(v))]
        if bad_ids:
            issues.append(QualityIssue(
                SHEET, "ERROR",
                "ZoneIDs with invalid format (expected FARM-Z## e.g. F001-Z01)",
                detail=f"Bad IDs: {bad_ids}",
            ))
        else:
            log.info("  [OK] All ZoneIDs match FARM-Z## pattern ✓")
    else:
        issues.append(QualityIssue(SHEET, "WARNING", "Column 'zone_id' not found"))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity in ("CRITICAL", "ERROR") for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


# ---------------------------------------------------------------------------
# 3. ProductionUnit_Register
# ---------------------------------------------------------------------------

def extract_production_units(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """ProductionUnit_Register — 21 PUs, IDs: FARM-PU### pattern."""
    SHEET = "ProductionUnit_Register"
    OUTPUT = "tenant_production_units.json"
    EXPECTED_PUS = 21
    PU_PATTERN = re.compile(r"^F\d{3}-PU\d{3}$")
    issues: list[QualityIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(QualityIssue(SHEET, "CRITICAL", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if row_count != EXPECTED_PUS:
        issues.append(QualityIssue(
            SHEET, "ERROR",
            f"Production unit count mismatch: expected {EXPECTED_PUS}, found {row_count}",
        ))

    pu_col = "production_unit_id"
    if pu_col in df.columns:
        bad_ids = [v for v in df[pu_col].dropna() if not PU_PATTERN.match(str(v))]
        if bad_ids:
            issues.append(QualityIssue(
                SHEET, "ERROR",
                "ProductionUnitIDs with invalid format (expected FARM-PU### e.g. F001-PU001)",
                detail=f"Bad IDs: {bad_ids}",
            ))
        else:
            log.info("  [OK] All ProductionUnitIDs match FARM-PU### pattern ✓")
    else:
        issues.append(QualityIssue(SHEET, "WARNING", "Column 'production_unit_id' not found"))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity in ("CRITICAL", "ERROR") for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


# ---------------------------------------------------------------------------
# 4. Workers
# ---------------------------------------------------------------------------

def extract_workers(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Workers — W-001..W-009, normalise phone numbers to +679XXXXXXX."""
    SHEET = "Workers"
    OUTPUT = "tenant_workers.json"
    EXPECTED_WORKERS = 9
    WORKER_PATTERN = re.compile(r"^W-\d{3}$")

    KNOWN_WORKERS = {
        "W-001": "Laisenia Waqa",
        "W-002": "Maika Ratubaba",
        "W-003": "Maciu Tuilau",
    }

    issues: list[QualityIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(QualityIssue(SHEET, "CRITICAL", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if row_count != EXPECTED_WORKERS:
        issues.append(QualityIssue(
            SHEET, "WARNING",
            f"Worker count: expected {EXPECTED_WORKERS}, found {row_count}",
        ))

    # Validate WorkerID format
    wid_col = "worker_id"
    if wid_col in df.columns:
        bad_ids = [v for v in df[wid_col].dropna() if not WORKER_PATTERN.match(str(v))]
        if bad_ids:
            issues.append(QualityIssue(
                SHEET, "ERROR",
                "WorkerIDs with invalid format (expected W-### e.g. W-001)",
                detail=f"Bad IDs: {bad_ids}",
            ))

    # Validate known workers are present
    if wid_col in df.columns and "full_name" in df.columns:
        for wid, expected_name in KNOWN_WORKERS.items():
            rows = df[df[wid_col] == wid]
            if rows.empty:
                issues.append(QualityIssue(
                    SHEET, "WARNING",
                    f"{wid} not found in Workers sheet",
                    detail=f"Expected worker: {expected_name}",
                ))
            else:
                found_name = str(rows.iloc[0]["full_name"]).strip()
                if found_name != expected_name:
                    issues.append(QualityIssue(
                        SHEET, "WARNING",
                        f"{wid} name mismatch",
                        detail=f"Expected '{expected_name}', found '{found_name}'",
                        row_reference=wid,
                    ))

    # Normalise phone numbers
    phone_col = "phone"
    if phone_col in df.columns:
        normalised_count = 0
        for idx in df.index:
            raw = df.at[idx, phone_col]
            if raw and str(raw).strip():
                normalised = normalise_phone(str(raw).strip())
                if normalised != raw:
                    log.info("  [FIX] Worker phone normalised: '%s' → '%s'", raw, normalised)
                    df.at[idx, phone_col] = normalised
                    normalised_count += 1
        if normalised_count > 0:
            issues.append(QualityIssue(
                SHEET, "FIX_APPLIED",
                f"Normalised {normalised_count} phone number(s) to +679XXXXXXX format",
            ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity in ("CRITICAL", "ERROR") for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


# ---------------------------------------------------------------------------
# 5. Customers
# ---------------------------------------------------------------------------

def extract_customers(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Customers — 16 customers after CUS-016→CUS-015 duplicate fix."""
    SHEET = "Customers"
    OUTPUT = "tenant_customers.json"
    EXPECTED_CUSTOMERS = 16
    issues: list[QualityIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(QualityIssue(SHEET, "CRITICAL", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    cid_col = "customer_id"
    cname_col = "customer_name" if "customer_name" in df.columns else None

    if cid_col in df.columns:
        # Check for CUS-015 / CUS-016 duplication issue
        has_015 = (df[cid_col] == "CUS-015").any()
        has_016 = (df[cid_col] == "CUS-016").any()

        if has_015 and has_016:
            # Both exist — check if CUS-016 is Vunisea Market
            cus016_rows = df[df[cid_col] == "CUS-016"]
            cus016_name = (
                str(cus016_rows.iloc[0][cname_col]).strip()
                if cname_col and not cus016_rows.empty
                else "unknown"
            )
            log.info(
                "  [ISSUE] Both CUS-015 and CUS-016 found. CUS-016 = '%s'",
                cus016_name,
            )
            issues.append(QualityIssue(
                SHEET, "ERROR",
                "Both CUS-015 and CUS-016 exist — duplication error requires manual review",
                detail=(
                    f"CUS-016 is '{cus016_name}'. "
                    "If CUS-016 is Vunisea Market and CUS-015 is a different customer, "
                    "do NOT auto-rename. Manual review required."
                ),
                row_reference="CUS-016",
            ))

        elif has_016 and not has_015:
            # Only CUS-016 exists — check if it is Vunisea Market
            cus016_rows = df[df[cid_col] == "CUS-016"]
            cus016_name = (
                str(cus016_rows.iloc[0][cname_col]).strip()
                if cname_col and not cus016_rows.empty
                else ""
            )
            if "vunisea" in cus016_name.lower():
                # Safe to rename
                df.loc[df[cid_col] == "CUS-016", cid_col] = "CUS-015"
                log.info(
                    "  [FIX] CUS-016 Vunisea Market renamed to CUS-015 ✓"
                )
                issues.append(QualityIssue(
                    SHEET, "FIX_APPLIED",
                    "CUS-016 Vunisea Market renamed to CUS-015",
                    detail=f"Original customer_name: '{cus016_name}'",
                    row_reference="CUS-016 → CUS-015",
                ))
            else:
                issues.append(QualityIssue(
                    SHEET, "WARNING",
                    "CUS-016 found but customer_name does not match 'Vunisea Market'",
                    detail=(
                        f"Found: '{cus016_name}'. "
                        "Rename not applied — verify manually."
                    ),
                    row_reference="CUS-016",
                ))

    row_count = len(df)
    if row_count != EXPECTED_CUSTOMERS:
        issues.append(QualityIssue(
            SHEET, "ERROR" if abs(row_count - EXPECTED_CUSTOMERS) > 2 else "WARNING",
            f"Customer count: expected {EXPECTED_CUSTOMERS}, found {row_count}",
        ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity in ("CRITICAL", "ERROR") for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


# ---------------------------------------------------------------------------
# 6. Suppliers
# ---------------------------------------------------------------------------

def extract_suppliers(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Suppliers — 13 suppliers, SUP-012 Sea Master Shipping has is_island_ferry=True."""
    SHEET = "Suppliers"
    OUTPUT = "tenant_suppliers.json"
    EXPECTED_SUPPLIERS = 13
    issues: list[QualityIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(QualityIssue(SHEET, "CRITICAL", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if row_count != EXPECTED_SUPPLIERS:
        issues.append(QualityIssue(
            SHEET, "ERROR",
            f"Supplier count: expected {EXPECTED_SUPPLIERS}, found {row_count}",
        ))

    # Validate SUP-012 Sea Master Shipping has is_island_ferry flag
    sid_col = "supplier_id"
    ferry_col = "is_island_ferry"
    if sid_col in df.columns:
        sup012 = df[df[sid_col] == "SUP-012"]
        if sup012.empty:
            issues.append(QualityIssue(
                SHEET, "WARNING",
                "SUP-012 not found — cannot validate Sea Master Shipping ferry flag",
            ))
        else:
            if ferry_col in df.columns:
                ferry_val = str(sup012.iloc[0][ferry_col]).strip().lower()
                if ferry_val not in ("true", "1", "yes"):
                    issues.append(QualityIssue(
                        SHEET, "WARNING",
                        f"SUP-012 is_island_ferry expected=True, found='{ferry_val}'",
                        row_reference="SUP-012",
                    ))
                else:
                    log.info("  [OK] SUP-012 Sea Master Shipping is_island_ferry=True ✓")
            else:
                issues.append(QualityIssue(
                    SHEET, "WARNING",
                    f"Column '{ferry_col}' not found — cannot validate SUP-012 ferry flag",
                ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity in ("CRITICAL", "ERROR") for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


# ---------------------------------------------------------------------------
# 7. Equipment_Register
# ---------------------------------------------------------------------------

def extract_equipment(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Equipment_Register — 23 items, IDs: EQP-F001-001 pattern."""
    SHEET = "Equipment_Register"
    OUTPUT = "tenant_equipment.json"
    EXPECTED_ITEMS = 23
    EQP_PATTERN = re.compile(r"^EQP-F\d{3}-\d{3}$")
    issues: list[QualityIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(QualityIssue(SHEET, "CRITICAL", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if row_count != EXPECTED_ITEMS:
        issues.append(QualityIssue(
            SHEET, "WARNING",
            f"Equipment count: expected {EXPECTED_ITEMS}, found {row_count}",
        ))

    eqp_col = "equipment_id"
    if eqp_col in df.columns:
        bad_ids = [v for v in df[eqp_col].dropna() if not EQP_PATTERN.match(str(v))]
        if bad_ids:
            issues.append(QualityIssue(
                SHEET, "WARNING",
                "EquipmentIDs with unexpected format (expected EQP-F###-### e.g. EQP-F001-001)",
                detail=f"Non-matching IDs: {bad_ids}",
            ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity in ("CRITICAL", "ERROR") for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


# ---------------------------------------------------------------------------
# 8. Inputs_Master
# ---------------------------------------------------------------------------

def extract_inputs(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Inputs_Master — 26 items, IDs: INP-SEED-EGG pattern."""
    SHEET = "Inputs_Master"
    OUTPUT = "tenant_inputs.json"
    EXPECTED_ITEMS = 26
    INP_PATTERN = re.compile(r"^INP-[A-Z]+-[A-Z0-9]+$")
    issues: list[QualityIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(QualityIssue(SHEET, "CRITICAL", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    row_count = len(df)
    if row_count != EXPECTED_ITEMS:
        issues.append(QualityIssue(
            SHEET, "WARNING",
            f"Input items count: expected {EXPECTED_ITEMS}, found {row_count}",
        ))

    inp_col = "input_id"
    if inp_col in df.columns:
        bad_ids = [v for v in df[inp_col].dropna() if not INP_PATTERN.match(str(v))]
        if bad_ids:
            issues.append(QualityIssue(
                SHEET, "WARNING",
                "InputIDs with unexpected format",
                detail=f"Non-matching IDs: {bad_ids}",
            ))

    # Flag chemical inputs for FK validation note
    type_col = "input_type"
    chem_col = "chemical_id"
    if type_col in df.columns and chem_col in df.columns:
        chem_rows = df[df[type_col].str.lower().str.contains("chemical|pesticide|herbicide|fungicide",
                                                               na=False)]
        missing_fk = chem_rows[chem_rows[chem_col].isna() | (chem_rows[chem_col] == "")]
        if not missing_fk.empty:
            issues.append(QualityIssue(
                SHEET, "WARNING",
                "Chemical inputs missing chemical_id FK",
                detail=f"Rows: {missing_fk[inp_col].tolist() if inp_col in missing_fk.columns else 'unknown'}",
            ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity in ("CRITICAL", "ERROR") for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


# ---------------------------------------------------------------------------
# 9. Automation_Rules — CRITICAL FIXES
# ---------------------------------------------------------------------------

def extract_automation_rules(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Automation_Rules — 43 total (38 active, 5 inactive). Fixes RULE-042/043 shift + RULE-031/032 severity."""
    SHEET = "Automation_Rules"
    OUTPUT = "tenant_automation_rules.json"
    EXPECTED_TOTAL = 43
    EXPECTED_ACTIVE = 38
    EXPECTED_INACTIVE = 5
    INACTIVE_RULES = {"RULE-024", "RULE-025", "RULE-026", "RULE-027", "RULE-028"}
    issues: list[QualityIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(QualityIssue(SHEET, "CRITICAL", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    # Keep original columns for fix detection; normalise after fixes
    original_columns = list(df.columns)

    # --- FIX: RULE-031 and RULE-032 severity boolean True → 'High' ---
    # Do this BEFORE column normalisation so we can reference original names
    severity_col_orig = None
    rule_id_col_orig = None
    for c in original_columns:
        if c.lower() in ("rule_id", "ruleid", "rule id"):
            rule_id_col_orig = c
        if c.lower() in ("severity",):
            severity_col_orig = c

    if rule_id_col_orig and severity_col_orig:
        for target_rule in ("RULE-031", "RULE-032"):
            mask = df[rule_id_col_orig] == target_rule
            if mask.any():
                raw_sev = df.loc[mask, severity_col_orig].iloc[0]
                if str(raw_sev).strip().lower() in ("true", "1"):
                    df.loc[mask, severity_col_orig] = "High"
                    log.info(
                        "  [FIX] %s severity: boolean '%s' → 'High' ✓",
                        target_rule, raw_sev,
                    )
                    issues.append(QualityIssue(
                        SHEET, "FIX_APPLIED",
                        f"{target_rule} severity boolean True corrected to 'High'",
                        detail=f"Original value: '{raw_sev}'",
                        row_reference=target_rule,
                    ))

    df = normalise_columns(df)

    # Identify column names after normalisation
    rule_col = "rule_id"
    active_col = "active"
    trig_col = "trigger_category"
    task_col = "task_type"
    freq_col = "frequency_days"
    sev_col = "severity"

    # --- FIX: RULE-042 and RULE-043 column shift ---
    # The column shift means that in the xlsx, these two rows have their data
    # shifted one column to the right, causing Active to be read as TriggerCategory,
    # TriggerCategory as TaskType, etc.
    #
    # Expected corrected values:
    # RULE-042: active=True, trigger_category='OrderStatus', task_type='OrderOverdue',
    #           frequency_days=1, severity='High'
    # RULE-043: active=True, trigger_category='WorkerPerformance', task_type='WorkerInactive',
    #           frequency_days=14, severity='Medium'

    RULE_CORRECTIONS = {
        "RULE-042": {
            "active": "True",
            "trigger_category": "OrderStatus",
            "task_type": "OrderOverdue",
            "frequency_days": "1",
            "severity": "High",
        },
        "RULE-043": {
            "active": "True",
            "trigger_category": "WorkerPerformance",
            "task_type": "WorkerInactive",
            "frequency_days": "14",
            "severity": "Medium",
        },
    }

    if rule_col in df.columns:
        for rule_id, corrections in RULE_CORRECTIONS.items():
            mask = df[rule_col] == rule_id
            if mask.any():
                # Log the raw (shifted) values first
                raw_vals = {}
                for col in [active_col, trig_col, task_col, freq_col, sev_col]:
                    if col in df.columns:
                        raw_vals[col] = df.loc[mask, col].iloc[0]

                log.info(
                    "  [FIX] %s — raw (shifted) values detected: %s",
                    rule_id, raw_vals,
                )
                issues.append(QualityIssue(
                    SHEET, "FIX_APPLIED",
                    f"{rule_id} column shift detected — raw values logged",
                    detail=f"Raw values before fix: {raw_vals}",
                    row_reference=rule_id,
                ))

                # Apply corrections
                for col, corrected_val in corrections.items():
                    if col in df.columns:
                        df.loc[mask, col] = corrected_val

                log.info(
                    "  [FIX] %s — applied corrections: %s ✓", rule_id, corrections
                )
                issues.append(QualityIssue(
                    SHEET, "FIX_APPLIED",
                    f"{rule_id} column shift corrected",
                    detail=f"Corrected values: {corrections}",
                    row_reference=rule_id,
                ))
            else:
                issues.append(QualityIssue(
                    SHEET, "WARNING",
                    f"{rule_id} not found — column shift fix not applied",
                    row_reference=rule_id,
                ))
    else:
        issues.append(QualityIssue(
            SHEET, "ERROR",
            f"Column '{rule_col}' not found — cannot apply RULE-042/043 fixes",
        ))

    # --- Validate totals ---
    row_count = len(df)
    if row_count != EXPECTED_TOTAL:
        issues.append(QualityIssue(
            SHEET, "ERROR",
            f"Rule count: expected {EXPECTED_TOTAL}, found {row_count}",
        ))

    if active_col in df.columns and rule_col in df.columns:
        active_count = df[active_col].str.lower().isin(["true", "1", "yes"]).sum()
        inactive_count = row_count - active_count

        if active_count != EXPECTED_ACTIVE:
            issues.append(QualityIssue(
                SHEET, "WARNING",
                f"Active rule count: expected {EXPECTED_ACTIVE}, found {active_count}",
            ))
        if inactive_count != EXPECTED_INACTIVE:
            issues.append(QualityIssue(
                SHEET, "WARNING",
                f"Inactive rule count: expected {EXPECTED_INACTIVE}, found {inactive_count}",
            ))

        # Validate specific inactive rules
        actual_inactive = set(df.loc[
            ~df[active_col].str.lower().isin(["true", "1", "yes"]), rule_col
        ].tolist())
        unexpected_inactive = actual_inactive - INACTIVE_RULES
        missing_inactive = INACTIVE_RULES - actual_inactive
        if unexpected_inactive:
            issues.append(QualityIssue(
                SHEET, "WARNING",
                "Unexpected inactive rules",
                detail=f"Rules that are inactive but should not be: {sorted(unexpected_inactive)}",
            ))
        if missing_inactive:
            issues.append(QualityIssue(
                SHEET, "WARNING",
                "Expected inactive rules not found as inactive",
                detail=f"Should be inactive: {sorted(missing_inactive)}",
            ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity in ("CRITICAL", "ERROR") for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


# ---------------------------------------------------------------------------
# 10. Decision_Engine_Signals
# ---------------------------------------------------------------------------

def extract_decision_signals(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Decision_Engine_Signals — delete row 11 if NULL SignalName, expect 10 rows."""
    SHEET = "Decision_Engine_Signals"
    OUTPUT = "tenant_decision_signals.json"
    EXPECTED_ROWS = 10
    issues: list[QualityIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(QualityIssue(SHEET, "CRITICAL", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)
    df = df.reset_index(drop=True)  # ensure 0-based indexing

    signal_col = "signal_name"

    # Row 11 in xlsx = row index 10 (0-based) after dropping header
    # but read_sheet uses pandas which makes row 0 = first data row
    ROW_11_IDX = 10  # 0-based index of xlsx row 11 data

    if signal_col in df.columns:
        # Check if row index 10 exists and has a null/empty SignalName
        if len(df) > ROW_11_IDX:
            raw_val = df.at[ROW_11_IDX, signal_col]
            is_null = (
                raw_val is None
                or (isinstance(raw_val, float) and pd.isna(raw_val))
                or str(raw_val).strip() == ""
                or str(raw_val).lower() in ("nan", "none", "null")
            )
            if is_null:
                log.info(
                    "  [FIX] Row 11 (index %d) has NULL SignalName — deleting row ✓",
                    ROW_11_IDX,
                )
                df = df.drop(index=ROW_11_IDX).reset_index(drop=True)
                issues.append(QualityIssue(
                    SHEET, "FIX_APPLIED",
                    "Row 11 with NULL SignalName deleted",
                    detail=f"Original row data: {df_to_records(pd.DataFrame([df.iloc[ROW_11_IDX - 1] if ROW_11_IDX > 0 else df.iloc[0]]))}",
                    row_reference="row 11 (xlsx)",
                ))
            else:
                log.info(
                    "  [INFO] Row 11 (index %d) SignalName = '%s' — not null, no deletion",
                    ROW_11_IDX, raw_val,
                )
        else:
            issues.append(QualityIssue(
                SHEET, "INFO",
                f"Sheet has only {len(df)} rows — row 11 index does not exist",
            ))

        # Validate remaining null signal names across all rows
        null_signals = df[
            df[signal_col].isna() | (df[signal_col].str.strip() == "")
        ]
        if not null_signals.empty:
            issues.append(QualityIssue(
                SHEET, "ERROR",
                f"Additional rows with NULL SignalName found after fix: {len(null_signals)} row(s)",
                detail=f"Row indices: {null_signals.index.tolist()}",
            ))
    else:
        issues.append(QualityIssue(
            SHEET, "ERROR",
            f"Column '{signal_col}' not found — cannot validate or fix NULL SignalName",
        ))

    row_count = len(df)
    if row_count != EXPECTED_ROWS:
        issues.append(QualityIssue(
            SHEET, "ERROR",
            f"Signal row count: expected {EXPECTED_ROWS} (after deletion), found {row_count}",
        ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity in ("CRITICAL", "ERROR") for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


# ---------------------------------------------------------------------------
# 11. Active_Cycles
# ---------------------------------------------------------------------------

def extract_active_cycles(xlsx: Path, output_dir: Path) -> ExtractionResult:
    """Active_Cycles — 7 active cycles, CycleID format CY-FARM-YY-###."""
    SHEET = "Active_Cycles"
    OUTPUT = "tenant_active_cycles.json"
    EXPECTED_CYCLES = 7
    CYCLE_PATTERN = re.compile(r"^CY-F\d{3}-\d{2}-\d{3}$")
    issues: list[QualityIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(QualityIssue(SHEET, "CRITICAL", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    cycle_col = "cycle_id"
    status_col = "status"
    prod_col = "production_id"

    # Validate CycleID format
    if cycle_col in df.columns:
        bad_ids = [v for v in df[cycle_col].dropna() if not CYCLE_PATTERN.match(str(v))]
        if bad_ids:
            issues.append(QualityIssue(
                SHEET, "ERROR",
                "CycleIDs with invalid format (expected CY-FARM-YY-### e.g. CY-F001-25-001)",
                detail=f"Bad IDs: {bad_ids}",
            ))
        else:
            log.info("  [OK] All CycleIDs match CY-FARM-YY-### pattern ✓")

    row_count = len(df)
    if row_count != EXPECTED_CYCLES:
        issues.append(QualityIssue(
            SHEET, "ERROR",
            f"Active cycle count: expected {EXPECTED_CYCLES}, found {row_count}",
        ))

    # Validate CRP-KAV cycles have status='active' (must NOT be flagged as inactive)
    if prod_col in df.columns and status_col in df.columns:
        kav_cycles = df[df[prod_col] == "CRP-KAV"]
        if not kav_cycles.empty:
            inactive_kav = kav_cycles[
                kav_cycles[status_col].str.lower() != "active"
            ]
            if not inactive_kav.empty:
                issues.append(QualityIssue(
                    SHEET, "ERROR",
                    "CRP-KAV cycles incorrectly marked as inactive",
                    detail=(
                        f"Cycle IDs with wrong status: "
                        f"{inactive_kav[cycle_col].tolist() if cycle_col in inactive_kav.columns else 'unknown'}. "
                        "CRP-KAV InactivityAlert_days=180 means alert threshold, NOT cycle status."
                    ),
                ))
            else:
                log.info("  [OK] All CRP-KAV cycles have status='active' ✓")
        else:
            issues.append(QualityIssue(
                SHEET, "INFO",
                "No CRP-KAV cycles found in Active_Cycles — nothing to validate",
            ))
    else:
        issues.append(QualityIssue(
            SHEET, "WARNING",
            "Columns 'production_id' or 'status' not found — skipping CRP-KAV status check",
        ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    passed = not any(i.severity in ("CRITICAL", "ERROR") for i in issues)
    return ExtractionResult(SHEET, str(out_path.name), row_count, passed, issues)


# ---------------------------------------------------------------------------
# 12. Price_Master
# ---------------------------------------------------------------------------

def extract_price_master(xlsx: Path, output_dir: Path) -> ExtractionResult:
    SHEET = "Price_Master"
    OUTPUT = "tenant_price_master.json"
    issues: list[QualityIssue] = []

    df = read_sheet(xlsx, SHEET)
    if df is None:
        issues.append(QualityIssue(SHEET, "CRITICAL", "Sheet not found"))
        return ExtractionResult(SHEET, OUTPUT, 0, False, issues)

    df = strip_strings(df)
    df = normalise_columns(df)

    # All prices should be in FJD — flag if currency column exists with non-FJD values
    currency_col = "currency"
    if currency_col in df.columns:
        non_fjd = df[~df[currency_col].str.upper().isin(["FJD", "NAN", ""])]["currency"].dropna()
        if not non_fjd.empty:
            issues.append(QualityIssue(
                SHEET, "WARNING",
                "Non-FJD currency values found in Price_Master",
                detail=f"Values: {non_fjd.unique().tolist()}",
            ))

    records = df_to_records(df)
    out_path = write_json(output_dir, OUTPUT, records)

    return ExtractionResult(SHEET, str(out_path.name), len(records), True, issues)


# =============================================================================
# Orchestrator
# =============================================================================

EXTRACTORS = [
    extract_farms,
    extract_zones,
    extract_production_units,
    extract_workers,
    extract_customers,
    extract_suppliers,
    extract_equipment,
    extract_inputs,
    extract_automation_rules,
    extract_decision_signals,
    extract_active_cycles,
    extract_price_master,
]


def run_extraction(input_file: Path, output_dir: Path) -> int:
    """Run all tenant extractors and write data_quality_report.json.

    Returns 0 if all critical fixes applied and validations pass, 1 otherwise.
    """
    output_dir.mkdir(parents=True, exist_ok=True)

    log.info("=" * 60)
    log.info("TFOS v7.0 Tenant Data Extraction")
    log.info("Input : %s", input_file)
    log.info("Output: %s", output_dir)
    log.info("=" * 60)

    if not input_file.exists():
        log.error("Input file not found: %s", input_file)
        return 1

    results: list[ExtractionResult] = []
    all_passed = True

    for extractor in EXTRACTORS:
        log.info("Processing: %s", extractor.__doc__.split("—")[0].strip()
                 if extractor.__doc__ else extractor.__name__)
        result = extractor(input_file, output_dir)
        results.append(result)

        fixes = [i for i in result.issues if i.severity == "FIX_APPLIED"]
        errors = [i for i in result.issues if i.severity in ("CRITICAL", "ERROR")]
        warnings = [i for i in result.issues if i.severity == "WARNING"]

        status = "✓" if result.passed else "✗"
        fix_note = f" [{len(fixes)} fix(es) applied]" if fixes else ""
        warn_note = f" [{len(warnings)} warning(s)]" if warnings else ""

        if result.passed:
            print(f"  {status} {result.sheet_name}: {result.rows_exported} rows exported"
                  f" → {result.output_file}{fix_note}{warn_note}")
        else:
            all_passed = False
            err_msgs = [i.message for i in errors]
            print(f"  {status} {result.sheet_name}: FAILED — {'; '.join(err_msgs)}{fix_note}")

        # Print all issues with detail
        for issue in result.issues:
            ref = f" ({issue.row_reference})" if issue.row_reference else ""
            if issue.severity == "FIX_APPLIED":
                log.info("  [FIX] %s%s: %s | %s", issue.sheet, ref, issue.message, issue.detail)
            elif issue.severity in ("CRITICAL", "ERROR"):
                log.error("  [%s] %s%s: %s | %s",
                          issue.severity, issue.sheet, ref, issue.message, issue.detail)
            elif issue.severity == "WARNING":
                log.warning("  [WARN] %s%s: %s | %s",
                            issue.sheet, ref, issue.message, issue.detail)

    # Write data quality report
    report = {
        "extraction_summary": {
            "total_sheets": len(results),
            "passed": sum(1 for r in results if r.passed),
            "failed": sum(1 for r in results if not r.passed),
            "all_passed": all_passed,
            "total_fixes_applied": sum(
                1 for r in results
                for i in r.issues if i.severity == "FIX_APPLIED"
            ),
        },
        "critical_fixes": {
            "RULE_042_043_column_shift": "Applied if rows found",
            "RULE_031_032_severity_boolean": "Applied if severity=True found",
            "Decision_Engine_row_11_null": "Applied if row 11 has NULL SignalName",
            "CUS_016_vunisea_rename": "Applied if CUS-016 Vunisea Market found without CUS-015",
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

    report_path = output_dir / "data_quality_report.json"
    with open(report_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)

    log.info("=" * 60)
    if all_passed:
        log.info("RESULT: ALL VALIDATIONS PASSED ✓")
    else:
        failed = [r.sheet_name for r in results if not r.passed]
        log.error("RESULT: VALIDATION FAILURES in: %s", failed)
        log.error("Unfixable errors require manual correction before loading.")
    log.info("Data quality report: %s", report_path)
    log.info("=" * 60)

    return 0 if all_passed else 1


# =============================================================================
# CLI entry point
# =============================================================================

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract TFOS v7.0 tenant operational data from xlsx to JSON",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python extract_tenant_data.py
  python extract_tenant_data.py --input ../source_data/TFOS_v7.0.xlsx
  python extract_tenant_data.py --input TFOS_v7.0.xlsx --output /tmp/extracted/tenant
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
