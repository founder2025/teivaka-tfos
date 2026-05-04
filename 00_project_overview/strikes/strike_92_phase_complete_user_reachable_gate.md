# Strike #92 — "PHASE COMPLETE" must verify user-reachability, not just smoke-test-passes

## Failure mode

The Six-Step Cadence's smoke pattern verifies these layers when shipping a new event/form:

1. Migration applied (catalog row exists, audit CHECK enum extended)
2. Pydantic payload schema authored
3. Backend handler block in events.py
4. Frontend form file (*New.jsx) on disk
5. App.jsx Route declaration
6. LogSheet.jsx EVENT_ROUTES entry
7. /api/v1/events accepts a submission and writes one audit.events row
8. Hash chain integrity preserved
9. Regression endpoints (/verify, /farm/compliance, /api/v1/poultry/dashboard) return 200

What it does NOT verify:

10. The new event_type appears in the response of the catalog API endpoint that drives the (+) button UI (`/api/v1/event-catalog?farm_id=<>`)

A form can pass every existing gate (file present, route wired, EVENT_ROUTES entry, migration applied, /api/v1/events accepts submission) and still be invisible to the operator's (+) catalog because of:

- a server-side filter dropping the catalog row (the Strike #92 root cause was `event_catalog.py:165` filter `c.livestock_only = false` gated by a misderived `has_livestock` flag)
- a catalog row with `is_user_facing=FALSE` or `is_active=FALSE`
- a catalog row never inserted at all (orphan)
- a catalog row in the wrong `catalog_group` (WEIGHT_CHECK landed in LIVESTOCK seed; everything else in code treated it as POULTRY)

## Discovery context

Sprint 7 foundation marathon (2026-05-04 Fiji time). Operator surfaced: "only 12 forms live in the poultry group, not 25." Architect had been claiming Form Coverage 25/35 (~71%) for 7 phase ships based on Claude Code's "PHASE COMPLETE" reports. None of the 13 forms shipped after Phase 6.3-10 had been visually verified by Operator. Diagnostic traced root cause through two layers:

Layer 1 (apparent): `event_catalog.py:165` had `sql_filters.append("c.livestock_only = false")` dropping all livestock-only events.

Layer 2 (real): the `if not has_livestock:` gate at line 164 was structurally broken. `has_livestock` derived from `SELECT EXISTS(SELECT 1 FROM audit.events WHERE event_type LIKE 'LIVESTOCK_%')` — but POULTRY events don't carry the LIVESTOCK_ prefix. Plus chicken-and-egg: a fresh tenant configured with POULTRY but no logged events → has_livestock=False → can't see catalog → can't log.

Net effect: 13 forms shipped over Phases 6.3-11 through 6.3-23 (LITTER_CHANGED, COOP_CLEANED, FEED_PURCHASED, WATER_CONSUMED, MORTALITY_INVESTIGATED, CULL_LOGGED, VISITOR_LOGGED, PEST_CONTROL_APPLIED, TEMPERATURE_RECORDED, FLOCK_MOVED, EQUIPMENT_MAINTAINED, INCIDENT_REPORTED, SUPPLIES_RECEIVED) were code-shipped but never user-reachable. WEIGHT_CHECK (a 14th form) was orphan-shipped — code complete but catalog row in LIVESTOCK group, not POULTRY.

## Why earlier strikes don't catch this

Strike #61 (Section 14 sync IN-COMMIT) governs doc updates, not user-reachability verification. Strike #79 (foundational completion first) governs phase ordering, not phase-completion definition. Strike #84/#85 govern doc-sync grep verification, not catalog-API verification. Strike #91 (paste pack injection sentinels) catches placeholder text but not absent verification gates.

The failure mode is a verification gap in the cadence template itself, not a process drift.

## Almost-broke-prod near-miss

The first paste pack to fix Strike #92 was a one-line sed to comment out `event_catalog.py:165`. That sed produced an orphaned `if not has_livestock:` body with no indented statements — Python IndentationError on import — would have crashed the api container on next startup. Claude Code parse-checked post-edit, refused to rebuild, restored from backup. Production stayed up. Architect output discipline now binding: every code-modifying paste pack must include AST parse-check immediately post-edit, with backup-restore on parse failure.

## Binding rule

Every form-shipping Phase commit must include an authenticated catalog-fetch smoke that:

(a) Queries `/api/v1/event-catalog?farm_id=<the-farm-this-form-is-for>` with the lowest-tier role/mode that should see this event
(b) Asserts the new event_type appears in `data.events[].event_type`
(c) Asserts `data.events[].catalog_group` matches the expected pillar
(d) NOT just "endpoint returns 200" or "code path exists" or "/api/v1/events accepts submission"

## Pattern for paste packs (template)

After standard smoke tests for /api/v1/events submission, add this catalog-fetch verification block:

    # Strike #92 binding: catalog-fetch smoke
    NEW_EVENT_TYPE="EXAMPLE_EVENT"
    EXPECTED_GROUP="POULTRY"
    CATALOG_RESP=$(curl -s -H "Authorization: Bearer $TOKEN" "https://teivaka.com/api/v1/event-catalog?farm_id=$FARM_ID")
    SURFACED=$(echo "$CATALOG_RESP" | python3 -c "
    import json, sys
    d = json.load(sys.stdin)
    events = d.get('data',{}).get('events', d.get('events', []))
    hit = next((e for e in events if e.get('event_type')==sys.argv[1]), None)
    if hit and hit.get('catalog_group')==sys.argv[2]:
        print('YES')
    else:
        print('NO')
    " "$NEW_EVENT_TYPE" "$EXPECTED_GROUP")
    if [ "$SURFACED" != "YES" ]; then
      echo "STOP — $NEW_EVENT_TYPE shipped but not user-reachable in $EXPECTED_GROUP catalog. Strike #92 binding."
      exit 1
    fi

Includes both the event_type membership check AND the catalog_group alignment check (the WEIGHT_CHECK miscategorization mode).

## Three honest framings of "Form Coverage" (post-Strike-#92)

| Definition | Pre-fix | Post-fix |
|---|---|---|
| Forms wired in code (file + Route + EVENT_ROUTES) | 25 | 25 |
| Forms reachable from (+) catalog UI (intersection of API + EVENT_ROUTES) | 12 | 25 (post Migration 065 WEIGHT_CHECK move) |
| Forms a real farmer can clickthrough end-to-end | 12 | 25 |

The honest Gate 3 metric for "Form Coverage" is the third row — what the farmer can do, not what the code-base contains. CLAUDE.md Section 14 Gate 3 reads 25/49 (~51%) reachable.

## Filed during

Sprint 7 foundation marathon (2026-05-04 Fiji time). Filed after Operator's third surfacing of "12 forms live, not what you're claiming" — first two were dismissed in Architect advisory mode. Strike #92 binding from this commit forward; #92's own paste pack template adds the catalog-fetch smoke as STEP 9b in every form-shipping cadence.

## Backlog opened by Strike #92

- B58: Revisit `livestock_only=TRUE` flag on 6 over-flagged catalog rows.
- B59: 24 padlocked catalog rows pending forms (next foundation marathon scope).
- B60: Naming consolidation review — FEED_GIVEN vs FEED_USED naming drift across catalog vs shipped forms.
- B63: catalog_group/code-alignment sweep — WEIGHT_CHECK landed in LIVESTOCK while every code-side artifact (form path, EVENT_ROUTES route, events.py validation) treated it as POULTRY. Sweep all 11 catalog groups for similar mismatches: any event_type whose catalog_group disagrees with the pillar inferred from form path / EVENT_ROUTES target / backend validation predicates. Migration template: UPDATE shared.event_type_catalog SET catalog_group=<inferred> WHERE event_type IN (<found>).

## Migration trail

- Migration 064 (`064_weight_check_poultry_orphan`): attempted INSERT-with-ON-CONFLICT-DO-NOTHING. No-op on this DB because WEIGHT_CHECK existed in LIVESTOCK group (PK collision). Left in alembic history as audit trail of the discovery.
- Migration 065 (`065_weight_check_to_poultry`): UPDATE statement that moves WEIGHT_CHECK from LIVESTOCK (sort_order=40) to POULTRY (sort_order=450). Successful; catalog now aligned with code.
