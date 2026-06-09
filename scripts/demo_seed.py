#!/usr/bin/env python3
"""
demo_seed.py — populate a demo farm with a realistic month of activity, logged
THROUGH THE REAL API so every record is genuine + hash-chained (never direct
table inserts, never fabricated rows). Lights up every Farm surface for the
2026-06-16 presentation.

What it creates (best-effort, fail-soft — a partial run still populates a lot):
  • Field events on existing active cycles: IRRIGATION ×4, FERTILIZER ×2,
    and CHEMICAL sprays — one OLD (cleared) + one RECENT (live WHD block → the
    Compliance "do not sell" demo moment).
  • Harvests on cleared cycles (graded, to a buyer/destination).
  • Cash ledger: sales IN + input/fuel expenses OUT.
  • Workers (2) + labour attendance over the past fortnight.
  • Weather observations (last 7 days).

Usage (run on the prod host or anywhere that can reach the API):
    EMAIL=you@demo.com PASSWORD='...' BASE_URL=https://teivaka.com \
        python3 scripts/demo_seed.py
Optional: FARM_ID=F001-XXXX (else the first farm on the account is used).

Re-running duplicates data — intended to run ONCE on a fresh/thin demo farm.
"""
import json
import os
import sys
import urllib.request
import urllib.error
import urllib.parse
from datetime import date, datetime, timedelta, timezone

BASE_URL = os.environ.get("BASE_URL", "https://teivaka.com").rstrip("/")
EMAIL    = os.environ.get("EMAIL")
PASSWORD = os.environ.get("PASSWORD")
FARM_ID  = os.environ.get("FARM_ID")  # optional

if not EMAIL or not PASSWORD:
    sys.exit("Set EMAIL and PASSWORD env vars (a real, verified demo account).")

TOKEN = None
_ok = _fail = 0


def _req(method, path, body=None, form=False, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Accept": "application/json"}
    data = None
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            data = json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:300]}
    except Exception as e:  # noqa: BLE001
        return 0, {"error": str(e)}


def step(label, method, path, body=None, form=False, ok_codes=(200, 201)):
    global _ok, _fail
    code, resp = _req(method, path, body, form, TOKEN)
    if code in ok_codes:
        _ok += 1
        print(f"  ✅ {label}  [{code}]")
    else:
        _fail += 1
        msg = resp.get("detail") or resp.get("error") or resp.get("raw") or resp
        print(f"  ⚠️  {label}  [{code}] {str(msg)[:160]}")
    return code, resp


def data_of(resp):
    return resp.get("data", resp) if isinstance(resp, dict) else resp


def iso(d):
    return d.isoformat()


def ts(days_ago, hour=8):
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).replace(
        hour=hour, minute=0, second=0, microsecond=0).isoformat()


# ── 1. login ────────────────────────────────────────────────────────────────
print(f"→ Login {EMAIL} @ {BASE_URL}")
code, resp = _req("POST", "/api/v1/auth/login",
                  {"username": EMAIL, "password": PASSWORD}, form=True)
TOKEN = (resp.get("access_token") or data_of(resp).get("access_token")
         if isinstance(resp, dict) else None)
if not TOKEN:
    sys.exit(f"  ✗ login failed [{code}]: {str(resp)[:200]}")
print("  ✅ logged in")

# ── 2. resolve farm + cycles + a chemical ────────────────────────────────────
_, farms = step("GET farms", "GET", "/api/v1/farms")
farms_list = data_of(farms)
if isinstance(farms_list, dict):
    farms_list = farms_list.get("farms", [])
farm_id = FARM_ID or (farms_list[0]["farm_id"] if farms_list else None)
if not farm_id:
    sys.exit("  ✗ no farm on this account — onboard a farm first.")
print(f"→ Demo farm: {farm_id}")

_, cyc = step("GET cycles", "GET", f"/api/v1/cycles?farm_id={urllib.parse.quote(farm_id)}")
cycles = data_of(cyc)
if isinstance(cycles, dict):
    cycles = cycles.get("cycles", [])
active = [c for c in cycles
          if str(c.get("cycle_status", "")).upper() in ("PLANNED", "ACTIVE", "HARVESTING")]
print(f"  active cycles found: {len(active)}")
if not active:
    sys.exit("  ✗ no active cycle to attach activity to — create a cycle first "
             "(Farm › Production › New cycle), then re-run.")

# pick a chemical with a real withholding period for the WHD-block demo
chem_id, chem_whd = None, 7
_, chems = step("GET chemicals", "GET", "/api/v1/chemicals", ok_codes=(200,))
clist = data_of(chems)
if isinstance(clist, dict):
    clist = clist.get("chemicals") or clist.get("items") or []
for c in (clist or []):
    whd = c.get("withholding_period_days")
    if whd and 3 <= int(whd) <= 21:
        chem_id, chem_whd = c.get("chemical_id"), int(whd); break
print(f"  spray chemical: {chem_id or '(none found — sprays skipped)'} (WHD {chem_whd}d)")


def evt(pu_id, cycle_id, prod_id, etype, payload, days_ago):
    payload = dict(payload); payload["production_id"] = prod_id
    step(f"{etype} d-{days_ago}", "POST", "/api/v1/events", {
        "event_type": etype, "occurred_at": ts(days_ago),
        "anchors": {"farm_id": farm_id, "pu_id": pu_id, "cycle_id": cycle_id},
        "payload": payload,
    })


# ── 3. field events across cycles (the activity feed + WHD story) ─────────────
print("→ Field events")
for i, c in enumerate(active):
    pu, cid, pid = c.get("pu_id"), c.get("cycle_id"), c.get("production_id")
    if not (pu and cid and pid):
        continue
    for d in (28, 21, 14, 7):
        evt(pu, cid, pid, "IRRIGATION",
            {"duration_minutes": 45, "method": "DRIP", "water_source": "Rain tank"}, d)
    for d in (24, 10):
        evt(pu, cid, pid, "FERTILIZER_APPLIED",
            {"product_name": "NPK 15:15:15", "rate_kg_per_ha": 120, "application_method": "BAND"}, d)
    if chem_id:
        # cycle 0 → recent spray (LIVE WHD block); others → old spray (cleared)
        days = 2 if i == 0 else 25
        evt(pu, cid, pid, "CHEMICAL_APPLIED",
            {"chemical_id": chem_id, "application_rate": 1.5, "unit": "ML_PER_L",
             "tank_volume_liters": 16, "target_pest_or_disease": "Whitefly"}, days)

# ── 4. harvests on cleared cycles (skip cycle 0 — it's blocked by recent spray)
print("→ Harvests")
for c in active[1:]:
    pu, cid, pid = c.get("pu_id"), c.get("cycle_id"), c.get("production_id")
    if not (pu and cid and pid):
        continue
    step("harvest", "POST", "/api/v1/harvests", {
        "cycle_id": cid, "pu_id": pu, "production_id": pid,
        "harvest_date": iso(date.today() - timedelta(days=5)),
        "qty_kg": 42, "grade": "A", "destination": "NAYANS",
        "idempotency_key": f"seed-harvest-{cid}",
    })

# ── 5. cash ledger (sales in + expenses out) ─────────────────────────────────
print("→ Cash")
cash_rows = [
    ("INCOME", "Crop sales", "Nayans eggplant delivery", 273, 5),
    ("INCOME", "Crop sales", "Suva market — cassava", 230, 12),
    ("EXPENSE", "Inputs", "NPK 15:15:15 (2 bags)", 164, 20),
    ("EXPENSE", "Fuel", "Diesel — pump + transport", 85, 9),
    ("EXPENSE", "Labour", "Casual wages week 23", 180, 3),
]
for ttype, cat, desc, amt, d in cash_rows:
    step(f"cash {ttype} {amt}", "POST", "/api/v1/cash-ledger", {
        "farm_id": farm_id, "transaction_date": iso(date.today() - timedelta(days=d)),
        "transaction_type": ttype, "category": cat, "description": desc,
        "amount_fjd": amt, "payment_method": "MPAISA",
    })

# ── 6. workers + labour ──────────────────────────────────────────────────────
print("→ Workers + labour")
worker_ids = []
for nm, rate, wtype in [("Laisenia Waqa", 85, "PERMANENT"), ("Sairusi Tora", 45, "CASUAL")]:
    code, resp = step(f"worker {nm}", "POST", "/api/v1/workers",
                      {"farm_id": farm_id, "full_name": nm, "daily_rate_fjd": rate, "worker_type": wtype})
    wid = data_of(resp).get("worker_id") if code in (200, 201) else None
    if wid:
        worker_ids.append((wid, rate))
for wid, rate in worker_ids:
    for d in (1, 2, 4, 7, 9):
        step("labour", "POST", "/api/v1/labor", {
            "worker_id": wid, "farm_id": farm_id,
            "work_date": iso(date.today() - timedelta(days=d)),
            "hours_worked": 8, "daily_rate_fjd": rate,
        })

# ── 7. weather observations ──────────────────────────────────────────────────
print("→ Weather")
for d in range(1, 8):
    step(f"weather d-{d}", "POST", "/api/v1/weather", {
        "farm_id": farm_id, "observation_date": iso(date.today() - timedelta(days=d)),
        "rainfall_mm": 6 + d, "temp_min_c": 23, "temp_max_c": 30, "humidity_pct": 78,
    })

print(f"\nDONE — {_ok} ok, {_fail} warnings. Re-check the census + open Farm › Overview.")
