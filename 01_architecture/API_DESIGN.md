# FILE: 01_architecture/API_DESIGN.md

# Teivaka TFOS — REST API Design

**Platform:** Teivaka Agricultural TOS
**Company:** Teivaka PTE LTD, Fiji
**Last Updated:** 2026-04-07
**Version:** 1.0

---

## 1. REST API Design Principles

### Versioned

All API endpoints are namespaced under `/api/v1/`. Breaking changes will increment the version to `/api/v2/`. Clients should always pin to the version they were developed against. Version 1 is the current and only version.

Base URL: `https://app.teivaka.com/api/v1/`

### Resource-Based

URL paths represent resources (nouns), not actions (verbs). HTTP methods represent the action:
- `GET` — Read resource(s)
- `POST` — Create a resource or trigger an action
- `PUT` — Update a resource (full or partial)
- `DELETE` — Remove a resource (soft-delete preferred — sets status=archived)

### Standard Envelopes

All responses — success or error — use a consistent envelope structure. Clients can always check `response.success` to determine outcome.

**Success envelope (single resource):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-...",
    "field": "value"
  }
}
```

**Success envelope (list with pagination):**
```json
{
  "success": true,
  "data": [ {...}, {...} ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 147,
    "total_pages": 8
  }
}
```

**Error envelope:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description of the error",
    "details": {
      "field": "qty_kg",
      "issue": "Must be greater than 0"
    }
  }
}
```

Error codes are machine-readable uppercase strings. The `message` is human-readable for display. `details` is optional and provides field-level context when relevant.

### Standard Error Codes

| HTTP Status | Error Code | Meaning |
|-------------|------------|---------|
| 400 | `VALIDATION_ERROR` | Request body or query parameter failed validation |
| 401 | `MISSING_AUTH` | No Authorization header |
| 401 | `INVALID_TOKEN` | JWT is invalid, expired, or malformed |
| 401 | `TOKEN_REVOKED` | JWT has been revoked (logged out) |
| 403 | `INSUFFICIENT_ROLE` | User's role does not permit this action |
| 403 | `TIER_INSUFFICIENT` | Subscription tier too low for this feature |
| 403 | `FARM_ACCESS_DENIED` | User does not have access to this farm |
| 404 | `NOT_FOUND` | Resource does not exist (in this tenant) |
| 409 | `CONFLICT` | Duplicate record or business rule violation |
| 409 | `CHEMICAL_WITHHOLDING_VIOLATION` | Harvest blocked by chemical withholding period |
| 409 | `ROTATION_VIOLATION` | Cycle creation blocked by rotation rules |
| 422 | `UNPROCESSABLE` | Request is syntactically valid but semantically invalid |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unexpected server error |
| 503 | `SERVICE_UNAVAILABLE` | External service (Twilio, Claude, Whisper) unreachable |

---

## 2. Authentication Flow

### Login

```
POST /api/v1/auth/login
Content-Type: application/json
(No Authorization header required)

Request body:
{
  "email": "user@example.com",
  "password": "plaintext_password"
}

Response 200:
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 900,
    "user": {
      "id": "uuid-...",
      "full_name": "Uraia Kama",
      "email": "cody@teivaka.com",
      "role": "FOUNDER",
      "farm_ids": ["f001-uuid", "f002-uuid"]
    }
  }
}

Set-Cookie: refresh_token=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh; Max-Age=604800

Response 401 (wrong credentials):
{
  "success": false,
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Email or password is incorrect"
  }
}
```

**Access token:** 15-minute JWT. Stored in client memory (never localStorage). Sent as `Authorization: Bearer <token>` on every request.

**Refresh token:** 7-day opaque token. Stored as httpOnly Secure cookie. Used only to obtain new access tokens. Rotated on every use.

### Authenticated Request Pattern

```
GET /api/v1/farms
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

All protected endpoints require a valid Bearer JWT. The JWT contains `tenant_id` which activates RLS on the database connection for that request.

---

## 3. Pagination

All list endpoints support pagination via query parameters:

```
GET /api/v1/farms/{farm_id}/events?page=1&limit=20
GET /api/v1/farms/{farm_id}/events?page=2&limit=50
```

Default: `page=1`, `limit=20`. Maximum `limit`: 100.

Response includes `meta` object:
```json
"meta": {
  "page": 2,
  "limit": 20,
  "total": 147,
  "total_pages": 8
}
```

---

## 4. Rate Limiting

Rate limits are enforced per-tenant per endpoint group using Redis sliding window counters (1-minute window). Response headers indicate current limit status:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1744038060
```

| Endpoint Group | Limit | Window |
|---------------|-------|--------|
| Standard endpoints (all others) | 100 requests | 1 minute |
| AI endpoints (`/tis/*`) | 10 requests | 1 minute |
| Dashboard endpoint | 1000 requests | 1 minute |
| Auth endpoints | 20 requests | 1 minute |
| Webhooks | Exempt (Twilio signature verified instead) |

On rate limit exceeded:
```
HTTP 429 Too Many Requests
Retry-After: 47

{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please wait before trying again.",
    "details": { "retry_after_seconds": 47 }
  }
}
```

---

## 5. Common Query Parameters

| Parameter | Applies To | Description |
|-----------|-----------|-------------|
| `page` | All list endpoints | Page number (default: 1) |
| `limit` | All list endpoints | Records per page (default: 20, max: 100) |
| `sort` | Most list endpoints | Sort field (e.g., `sort=harvest_date`) |
| `order` | Most list endpoints | `asc` or `desc` (default: `desc`) |
| `from_date` | Time-series endpoints | Filter from date (ISO 8601) |
| `to_date` | Time-series endpoints | Filter to date (ISO 8601) |
| `status` | Most resource lists | Filter by status |
| `farm_id` | Cross-farm queries | Filter to specific farm (if user has multi-farm access) |

---

## 6. Complete Endpoint Reference

All endpoints require `Authorization: Bearer <JWT>` unless marked `(public)`. Subscription tier minimum is noted where applicable.

---

### /auth — Authentication

**No Authorization header required on login, refresh. All others require auth.**

---

#### `POST /auth/login`
- **Auth:** None (public)
- **Tier:** Any
- **Description:** Authenticate with email and password. Returns access token (15min JWT) and sets httpOnly refresh token cookie.
- **Request:** `{email, password}`
- **Response:** `{access_token, token_type, expires_in, user: {id, full_name, email, role, farm_ids}}`
- **Errors:** `401 INVALID_CREDENTIALS`

---

#### `POST /auth/logout`
- **Auth:** Bearer JWT
- **Tier:** Any
- **Description:** Invalidate the current access token and refresh token. Adds JWT's `jti` to Redis blacklist. Clears the refresh token cookie.
- **Request:** Empty body
- **Response:** `{success: true, data: {message: "Logged out successfully"}}`

---

#### `POST /auth/refresh`
- **Auth:** httpOnly refresh token cookie (no Bearer header)
- **Tier:** Any
- **Description:** Issue a new access token using the refresh token cookie. Rotates the refresh token (old token is invalidated, new token is set in cookie).
- **Request:** Empty body (refresh token read from cookie)
- **Response:** `{access_token, token_type, expires_in}`
- **Errors:** `401 INVALID_TOKEN` (expired or invalid refresh token)

---

#### `GET /auth/me`
- **Auth:** Bearer JWT
- **Tier:** Any
- **Description:** Returns the current authenticated user's profile, role, and tenant information.
- **Response:** `{id, full_name, email, phone, role, tenant_id, farm_ids, subscription_tier, created_at}`

---

#### `PUT /auth/change-password`
- **Auth:** Bearer JWT
- **Tier:** Any
- **Description:** Change the authenticated user's password. Requires current password for verification. Invalidates all existing sessions for the user.
- **Request:** `{current_password, new_password, confirm_new_password}`
- **Response:** `{success: true, data: {message: "Password changed successfully"}}`
- **Errors:** `400 VALIDATION_ERROR` (passwords don't match), `401 INVALID_CREDENTIALS` (current password wrong)

---

### /farms — Farm Management

**Auth required. WORKER role: read-only for assigned farms.**

---

#### `GET /farms`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all farms the authenticated user has access to (filtered by `farm_ids` in JWT). Returns summary card data for each farm.
- **Response:** Array of `{id, farm_code, name, location_description, total_area_acres, status, active_cycles_count, open_alerts_count}`

---

#### `POST /farms`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER
- **Tier:** Any (limited by subscription to max farm count)
- **Description:** Create a new farm for this tenant. The farm_id is returned and must be used in subsequent zone/PU creation.
- **Request:** `{farm_code, name, location_description, province, island, total_area_acres, gps_lat, gps_lng, owner_name, operator_name}`
- **Response:** Full farm object

---

#### `GET /farms/{farm_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Get full details for a specific farm. Includes farm metadata, total zones, total PUs, current active cycle count.
- **Errors:** `404 NOT_FOUND`, `403 FARM_ACCESS_DENIED`

---

#### `PUT /farms/{farm_id}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Update farm metadata. Does not allow changing `farm_code` (immutable identifier).
- **Request:** Any subset of farm fields (partial update supported)

---

#### `GET /farms/{farm_id}/stats`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** Aggregated farm statistics: total area under cultivation, current yield (kg), current season revenue (FJD), CoKG for current open cycles, active worker count, input stock health.
- **Response:** `{farm_id, total_area_cultivated_sqm, active_pus, active_cycles, total_open_harvest_kg, season_revenue_fjd, avg_cokg_fjd, active_workers, critical_alerts_count}`

---

#### `GET /farms/{farm_id}/expansion-readiness`
- **Auth:** Bearer JWT
- **Tier:** PREMIUM+
- **Description:** Multi-factor analysis of farm readiness to expand into new production units or increase cultivation area. Evaluates: financial reserves, labor capacity, input stock, equipment availability, historical CoKG trend, irrigation capacity.
- **Response:** `{overall_score, factors: [{name, score, status, recommendation}], expansion_recommendation}`

---

#### `GET /farms/{farm_id}/dashboard`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Single-call endpoint that returns ALL dashboard data needed to render the main farm dashboard screen. Cached in Redis for 60 seconds. This is the primary endpoint called on app load and on every dashboard refresh.
- **Response:** `{farm, active_cycles: [...], decision_signals: [...], open_alerts: [...], recent_events: [...], financial_summary: {...}, pending_tasks: [...], low_stock_inputs: [...], weather_current: {...}, upcoming_harvests: [...]}`

---

### /zones — Zone Management

**Auth required. WORKER: read-only.**

---

#### `GET /farms/{farm_id}/zones`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all zones within a farm. Each zone includes PU count, current area under cultivation.
- **Response:** Array of `{id, name, area_acres, soil_type, irrigation_type, pu_count, active_pu_count}`

---

#### `POST /farms/{farm_id}/zones`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Create a new zone within a farm.
- **Request:** `{name, area_acres, soil_type, irrigation_type, notes}`

---

#### `GET /zones/{zone_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Get full zone details including all production units within the zone and their current status.

---

#### `PUT /zones/{zone_id}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Update zone metadata (name, area, soil type, irrigation type, notes).

---

### /production-units — Production Unit Management

**Auth required. WORKER: read-only.**

---

#### `GET /farms/{farm_id}/production-units`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all production units (PUs) in a farm. Each PU includes current active cycle summary if one exists.
- **Query params:** `?zone_id=`, `?status=active|fallow|archived`
- **Response:** Array of PU objects with `{id, pu_code, name, area_sqm, zone_id, status, current_cycle: {crop_name, stage, days_remaining, health_score}}`

---

#### `POST /farms/{farm_id}/production-units`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Create a new production unit in a farm.
- **Request:** `{zone_id, pu_code, name, area_sqm, notes}`

---

#### `GET /production-units/{pu_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full PU detail: metadata, current cycle details, last 5 events, harvest history summary, open alerts for this PU.

---

#### `PUT /production-units/{pu_id}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Update PU metadata. Status transitions: `active → fallow`, `fallow → active`, `active|fallow → archived`.

---

#### `GET /production-units/{pu_id}/status`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Lightweight status endpoint. Returns: current status, active cycle name and stage, days since last event, last harvest date, any CRITICAL open alerts. Used by map/grid views.

---

#### `GET /production-units/{pu_id}/current-cycle`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Returns full details of the currently active production cycle for this PU, or `404 NOT_FOUND` with `code: NO_ACTIVE_CYCLE` if PU has no active cycle.

---

### /productions — Crop Catalog (Shared Schema)

**Auth required. Read-only. All tiers. Data from `shared.*` schema — same for all tenants.**

---

#### `GET /productions`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all 49 supported crop productions with basic metadata. Used to populate crop selection dropdowns in cycle creation.
- **Response:** Array of `{id, name, family, category, days_to_maturity_min, days_to_maturity_max, season}`

---

#### `GET /productions/{production_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full crop details: all stages, thresholds, general KB links, rotation family, recommended inputs.

---

#### `GET /productions/{production_id}/calendar`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** Returns a visual calendar representation of the crop's full growth cycle: stage timeline, key action dates, expected harvest window. Used by PWA calendar view.
- **Response:** `{production_id, stages: [{name, start_day, end_day, key_tasks: [...]}], total_days_min, total_days_max}`

---

#### `GET /productions/{production_id}/stages`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all growth stages for a crop with their protocols and threshold values.
- **Response:** Array of `{id, stage_order, name, days_from_start, days_from_end, protocols: [...], thresholds: [...]}`

---

### /cycles — Production Cycle Lifecycle

**Auth required. WORKER: read-only except cannot create/close/fail cycles.**

---

#### `GET /production-units/{pu_id}/cycles`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all production cycles for a PU, newest first. Includes status (active/closed/failed), crop name, planting date, close date (if closed), final yield (if closed).
- **Query params:** `?status=active|closed|failed`

---

#### `POST /production-units/{pu_id}/cycles`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Create a new production cycle on a PU. **Triggers rotation validation automatically before insert.** The system calls `validate_rotation(pu_id, production_id)` — if the proposed crop violates rotation rules for this PU's history, returns `409 ROTATION_VIOLATION` with the conflicting rule and wait period. A PU can only have one `active` cycle at a time.
- **Request:** `{production_id, planting_date, expected_harvest_date, expected_yield_kg, nursery_batch_id (optional), notes}`
- **Errors:** `409 ROTATION_VIOLATION` (rotation rules block this crop), `409 CONFLICT` (PU already has active cycle)
- **Business logic:** `validate_rotation()` checks `shared.rotation_rules` and `shared.family_policies` against the PU's last N cycles

---

#### `GET /cycles/{cycle_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full cycle details: crop, status, planting date, expected/actual harvest date, current stage (calculated from days since planting), stage protocols, yield summary, open alerts for this cycle.

---

#### `PUT /cycles/{cycle_id}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Update cycle fields: expected_harvest_date, expected_yield_kg, notes. Status transitions are handled by dedicated endpoints (close, fail).

---

#### `POST /cycles/{cycle_id}/close`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Close a production cycle as successfully completed. Sets status to `closed`, records `actual_close_date`. Triggers final CoKG calculation and stores in `cycle_financials`. Marks PU as `fallow`.
- **Request:** `{actual_close_date, closing_notes (optional)}`

---

#### `POST /cycles/{cycle_id}/fail`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Mark a cycle as failed (crop loss, disease wipeout, natural disaster, etc.). Sets status to `failed`, records failure reason. CoKG is calculated on costs incurred with zero yield. Marks PU as `fallow`.
- **Request:** `{fail_date, failure_reason, failure_category: DISEASE|PEST|WEATHER|MARKET|LABOUR|OTHER}`

---

#### `POST /cycles/validate-rotation`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Pre-check endpoint. Call before showing the cycle creation form to determine if a proposed crop is allowed on a PU. Returns validation result with details on any conflicts. Does NOT create any records.
- **Request:** `{pu_id, production_id}`
- **Response:** `{valid: true/false, rule_violated: null or {...}, suggested_alternatives: [...], wait_cycles_required: N}`

---

#### `POST /cycles/{cycle_id}/override-rotation`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER only
- **Tier:** PREMIUM+
- **Description:** Override a rotation violation and force-create a cycle despite rule conflict. Records the override in `rotation_override_log` with the FOUNDER's justification. This is an irreversible operational decision and is logged permanently for audit.
- **Request:** `{justification: "Reason for override (min 20 chars)"}`
- **Response:** `{success: true, data: {cycle_id, override_logged: true, override_id}}`

---

#### `GET /cycles/{cycle_id}/financials`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Full cycle financial breakdown. **CoKG is the top-level field.** Includes: total labor cost, total input cost, total other cost, total harvest quantity (kg), revenue (if any income linked), profit/loss, cost breakdown by category.
- **Response:** `{cokg_fjd_per_kg, total_cost_fjd, total_labor_cost_fjd, total_input_cost_fjd, total_other_cost_fjd, total_harvest_kg, total_revenue_fjd, profit_loss_fjd, cost_breakdown: [...]}`

---

#### `GET /cycles/{cycle_id}/protocol`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Returns the current stage protocol for this cycle — what tasks, inputs, and observations are recommended right now based on the current growth stage. Pulls from `shared.stage_protocols` and `shared.kb_stage_links`.
- **Response:** `{current_stage, days_in_stage, days_remaining_in_stage, protocol_tasks: [...], recommended_inputs: [...], kb_articles: [...]}`

---

### /events — Field Events

**Auth required. WORKER: can create events.**

---

#### `GET /production-units/{pu_id}/events`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all field events for a PU, most recent first.
- **Query params:** `?from_date=`, `?to_date=`, `?event_type=`, `?cycle_id=`
- **Response:** Array of `{id, event_type, logged_at, worker_name, description, chemical_applied, photo_url}`

---

#### `POST /production-units/{pu_id}/events`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER, WORKER
- **Tier:** FREE+
- **Description:** Log a field event on a PU. Event types include: OBSERVATION, PEST_SIGHTING, DISEASE_SIGHTING, SPRAY, FERTILIZE, IRRIGATE, WEED, TRANSPLANT, PRUNING, THINNING, SOIL_SAMPLE, PHOTO_LOG. For SPRAY events: `chemical_id` and `application_rate` are required; the chemical's withholding period starts from this date.
- **Request:** `{event_type, logged_at, cycle_id, description, chemical_id (if SPRAY), application_rate (if SPRAY), input_id (optional), photo (optional, multipart), notes}`
- **Business logic:** If event_type is SPRAY, records application in a way that blocks harvest within withholding period.

---

#### `POST /production-units/{pu_id}/events/voice`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER, WORKER
- **Tier:** BASIC+
- **Description:** Create a field event via voice command. Routes audio through the TIS voice pipeline (Whisper transcription → Command Executor). Returns the created event once processing is complete.
- **Request:** Multipart: `{audio: file, farm_id, pu_id}`
- **Response:** `202 Accepted` with `{voice_log_id, poll_url}` — poll for result

---

#### `GET /events/{event_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full event detail including photo URL if attached, chemical details if spray event, KB article links if relevant event type.

---

### /harvests — Harvest Logging

**Auth required. WORKER: can log harvests. Chemical compliance check always runs.**

---

#### `GET /production-units/{pu_id}/harvests`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all harvest records for a PU, most recent first.
- **Query params:** `?from_date=`, `?to_date=`, `?grade=`, `?cycle_id=`
- **Response:** Array of `{id, hrv_id, harvest_date, qty_kg, grade, unit_price_fjd, compliance_status}`

---

#### `POST /production-units/{pu_id}/harvests`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER, WORKER
- **Tier:** BASIC+
- **Description:** Log a harvest record. **Chemical compliance check runs automatically** — if any chemical applied to this PU is within its withholding period on the proposed harvest_date, the request is blocked with `409 CHEMICAL_WITHHOLDING_VIOLATION`. On success: `hrv_id` auto-generated in format `HRV-YYYYMMDD-###`. DB trigger fires as second enforcement layer.
- **Request:** `{harvest_date, qty_kg, grade: A|B|C|REJECT, unit_price_fjd (optional), notes, photo (optional, multipart)}`
- **Response:** `{harvest_id, hrv_id, qty_kg, grade, harvest_date, compliance_status: COMPLIANT}`
- **Errors:** `409 CHEMICAL_WITHHOLDING_VIOLATION` with `{chemical_name, applied_date, withholding_days, safe_harvest_date}`

---

#### `GET /harvests/{harvest_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full harvest record detail including compliance check log, grading details, and link to income records if sold.

---

#### `GET /cycles/{cycle_id}/harvest-summary`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** Aggregated harvest summary for an entire cycle: total kg by grade, total revenue estimate, harvest frequency, average grade distribution. Used in cycle report and financials.
- **Response:** `{cycle_id, total_harvest_kg, harvest_by_grade: {A: kg, B: kg, C: kg, REJECT: kg}, harvest_count, first_harvest_date, last_harvest_date, avg_interval_days}`

---

### /income — Income Records

**Auth required. WORKER: no access.**

---

#### `GET /farms/{farm_id}/income`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** List all income records for a farm, most recent first.
- **Query params:** `?from_date=`, `?to_date=`, `?customer_id=`, `?payment_status=pending|paid|overdue`

---

#### `POST /farms/{farm_id}/income`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Create an income record. Links to a customer and optionally to a specific harvest. Creates or updates accounts receivable if payment_status is `pending`.
- **Request:** `{customer_id, harvest_id (optional), amount_fjd, income_type: PRODUCE_SALE|CONTRACT|OTHER, transaction_date, invoice_number, payment_status: pending|paid, notes}`

---

#### `GET /income/{income_id}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Full income record detail.

---

#### `PUT /income/{income_id}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Update income record (e.g., mark as paid, update amount after dispute resolution).

---

#### `GET /customers/{customer_id}/income-history`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** All income records linked to a specific customer. Includes total revenue, outstanding balance, payment history.

---

### /labor — Labor Attendance

**Auth required. WORKER: can log own attendance only.**

---

#### `GET /farms/{farm_id}/labor`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** List labor attendance records for a farm.
- **Query params:** `?from_date=`, `?to_date=`, `?worker_id=`, `?pu_id=`

---

#### `POST /farms/{farm_id}/labor`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER, WORKER
- **Tier:** FREE+
- **Description:** Log a labor attendance record. WORKER role can only log their own `worker_id`. MANAGER and FOUNDER can log for any worker on the farm.
- **Request:** `{worker_id, work_date, hours_worked, task_type, pu_id (optional), daily_rate_fjd (optional — defaults to worker's standard rate), notes}`
- **Business logic:** Calculates `labor_cost_fjd = hours_worked / 8 * daily_rate_fjd`, updates `cycle_financials.total_labor_cost_fjd` for the linked cycle.

---

#### `GET /labor/{labor_id}`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** Single labor attendance record.

---

#### `GET /workers/{worker_id}/labor-history`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Full attendance history for a worker: all shifts, total hours, total pay, days worked by farm/PU.

---

#### `GET /farms/{farm_id}/labor/weekly-summary`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Week-by-week labor summary for the farm: total hours, total cost, worker count, busiest PUs. Default: last 8 weeks.
- **Query params:** `?weeks=8`

---

### /weather — Weather Observations

**Auth required. WORKER: can log weather observations.**

---

#### `GET /zones/{zone_id}/weather`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List weather observations for a zone, most recent first. TimescaleDB hypertable — efficient time-range queries.
- **Query params:** `?from_date=`, `?to_date=`, `?limit=`

---

#### `POST /zones/{zone_id}/weather`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER, WORKER
- **Tier:** FREE+
- **Description:** Log a weather observation for a zone.
- **Request:** `{recorded_at, temp_c, rainfall_mm, humidity_pct, wind_kph, notes}`

---

#### `GET /zones/{zone_id}/weather/current`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Returns the most recent weather observation for a zone. If no observation within last 24 hours, returns `{data: null, meta: {last_recorded: timestamp}}`.

---

### /delivery — Delivery Tracking

**Auth required. WORKER: read-only.**

---

#### `GET /farms/{farm_id}/deliveries`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** List all deliveries for a farm.
- **Query params:** `?from_date=`, `?to_date=`, `?customer_id=`, `?status=pending|confirmed|flagged`

---

#### `POST /farms/{farm_id}/deliveries`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Create a delivery record with line items.
- **Request:** `{customer_id, delivery_date, line_items: [{harvest_id, production_id, qty_kg, unit_price_fjd, grade}], notes}`

---

#### `GET /deliveries/{delivery_id}`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** Full delivery record with line items and customer details.

---

#### `POST /deliveries/{delivery_id}/confirm`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Confirm delivery was received. Updates status to `confirmed`, optionally creates income record.
- **Request:** `{confirmed_at, actual_qty_received_kg (optional), notes}`

---

#### `POST /deliveries/{delivery_id}/flag-shortage`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Flag a delivery as having a shortage (delivered less than ordered). Triggers alert creation and potentially adjusts income record.
- **Request:** `{shortage_qty_kg, shortage_reason, notes}`

---

### /nursery — Nursery Batch Management

**Auth required. WORKER: read-only.**

---

#### `GET /farms/{farm_id}/nursery`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all nursery batches for a farm.
- **Query params:** `?status=active|ready|transplanted|failed`

---

#### `POST /farms/{farm_id}/nursery`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Create a new nursery batch.
- **Request:** `{production_id, batch_code, start_date, expected_transplant_date, qty_started, notes}`

---

#### `GET /nursery/{batch_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full nursery batch detail with status history.

---

#### `PUT /nursery/{batch_id}/status`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Update nursery batch status and quantity.
- **Request:** `{status: ready|transplanted|failed, qty_transplanted (if transplanted), transplant_date (if transplanted), failure_reason (if failed)}`

---

### /cash — Cash Ledger

**Auth required. WORKER: can log cash transactions (petty cash).**

---

#### `GET /farms/{farm_id}/cash`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** List all cash ledger entries for a farm. TimescaleDB hypertable.
- **Query params:** `?from_date=`, `?to_date=`, `?direction=INFLOW|OUTFLOW`, `?category=`

---

#### `POST /farms/{farm_id}/cash`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER, WORKER
- **Tier:** FREE+
- **Description:** Log a cash transaction.
- **Request:** `{transaction_date, transaction_type, direction: INFLOW|OUTFLOW, amount_fjd, category, reference_id (optional), notes}`

---

#### `GET /farms/{farm_id}/cash/balance`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Current cash balance for a farm: total inflows minus total outflows since the last balance reset. Also returns balance trend over last 4 weeks.
- **Response:** `{current_balance_fjd, total_inflow_ytd_fjd, total_outflow_ytd_fjd, weekly_trend: [{week, balance}]}`

---

#### `GET /farms/{farm_id}/cash/forecast`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** PREMIUM+
- **Description:** 13-week rolling cash flow forecast. Combines known fixed costs (labor schedule, loan repayments) with projected harvest revenues (from active cycles × price master) and projected input purchases (from inventory levels and reorder schedule).
- **Response:** `{weeks: [{week_start, projected_inflow_fjd, projected_outflow_fjd, net_cashflow_fjd, cumulative_balance_fjd, is_negative: bool}], forecast_generated_at}`

---

### /inputs — Input Inventory

**Auth required. WORKER: read-only.**

---

#### `GET /farms/{farm_id}/inputs`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all inputs in a farm's inventory with current stock levels.
- **Query params:** `?category=FERTILIZER|PESTICIDE|SEED|TOOL|OTHER`, `?low_stock=true`

---

#### `POST /farms/{farm_id}/inputs`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Register a new input type in the farm's inventory. For chemical inputs, links to `shared.chemical_library` via `chemical_library_id` to inherit withholding period and safety data.
- **Request:** `{input_code, name, category, unit, current_stock, reorder_threshold, unit_cost_fjd, supplier_id, is_chemical, chemical_library_id (if is_chemical)}`

---

#### `GET /inputs/{input_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full input detail including stock history (last 20 transactions), chemical safety data (if applicable), reorder history.

---

#### `PUT /inputs/{input_id}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Update input details (reorder threshold, unit cost, supplier, etc.). Also used to record stock adjustments (audit log: stock_adjustment transaction type).
- **Request:** Any subset of input fields

---

#### `GET /inputs/{input_id}/stock-check`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Quick stock check: current level, reorder threshold, days of stock remaining (estimated from recent usage rate), last purchase date.

---

#### `GET /farms/{farm_id}/inputs/low-stock`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Returns all inputs where `current_stock <= reorder_threshold`. Used for the low-stock alert widget on the dashboard. For Farm F002 (Kadavu island): includes ferry buffer status from RULE-034 Automation Engine.

---

### /orders — Purchase Orders

**Auth required. WORKER: no access.**

---

#### `GET /farms/{farm_id}/orders`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** List all purchase orders for a farm.
- **Query params:** `?status=draft|pending_approval|approved|ordered|received|cancelled`

---

#### `POST /farms/{farm_id}/orders`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Create a purchase order with line items.
- **Request:** `{supplier_id, expected_delivery, line_items: [{input_id, qty, unit_price_fjd}], notes}`

---

#### `GET /orders/{order_id}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Full order detail with line items, supplier details, approval history.

---

#### `POST /orders/{order_id}/approve`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Approve a purchase order. Changes status from `draft` to `approved`. For F002 ferry orders: verifies ferry schedule alignment.
- **Request:** `{approved_by_note (optional)}`

---

#### `POST /orders/{order_id}/fulfill`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Mark a purchase order as received/fulfilled. Updates input stock levels for all line items. Creates input_transactions records for each line item (type: PURCHASE).
- **Request:** `{received_date, actual_quantities: [{input_id, qty_received}], notes}`

---

### /workers — Worker Management

**Auth required. WORKER: read-only (own record only).**

---

#### `GET /farms/{farm_id}/workers`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** List all workers for a farm.
- **Query params:** `?status=active|inactive`, `?employment_type=permanent|casual|contract`

---

#### `POST /farms/{farm_id}/workers`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Register a new worker. Optionally creates a user account (app login) linked to this worker profile.
- **Request:** `{worker_code, full_name, phone, role: WORKER|MANAGER, employment_type, daily_rate_fjd, joined_date, create_user_account: bool, user_email (if create_user_account)}`

---

#### `GET /workers/{worker_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full worker profile: personal details, employment info, recent attendance summary, assigned tasks.

---

#### `PUT /workers/{worker_id}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Update worker details (rate, contact, status, employment type).

---

#### `GET /workers/{worker_id}/performance`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Worker performance summary: total hours worked (30/60/90 days), task completion rate, farms and PUs worked on, peak productivity periods.

---

#### `GET /farms/{farm_id}/workers/booking-queue`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Shows upcoming labor requirements vs. confirmed worker bookings for the next 14 days. Highlights days where required labor exceeds confirmed bookings.
- **Response:** `{days: [{date, required_workers, confirmed_workers, deficit, pu_breakdown: [...]}]}`

---

### /equipment — Equipment Management

**Auth required. WORKER: read-only.**

---

#### `GET /farms/{farm_id}/equipment`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all equipment for a farm with current status and next service due date.

---

#### `POST /farms/{farm_id}/equipment`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Register new equipment.
- **Request:** `{equipment_code, name, type, purchase_date, service_interval_days, notes}`

---

#### `GET /equipment/{equipment_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full equipment detail with service history.

---

#### `PUT /equipment/{equipment_id}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Update equipment record. For service events: update `last_service_date` and `next_service_date` is auto-calculated from `service_interval_days`.

---

#### `GET /farms/{farm_id}/equipment/maintenance-due`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Returns equipment where `next_service_date <= today + 7 days`. Used by the Automation Engine EQUIPMENT_SERVICE_DUE rule.

---

### /suppliers — Supplier Directory (Shared)

**Auth required. Read-only for tenants. No tenant_id filtering — suppliers are global.**

---

#### `GET /suppliers`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all suppliers in the directory. Includes Sea Master Shipping (SUP-012, the Kadavu ferry supplier critical for F002 supply chain via RULE-034).
- **Query params:** `?category=CHEMICAL|SEED|FERTILIZER|EQUIPMENT|TRANSPORT|OTHER`

---

#### `GET /suppliers/{supplier_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full supplier detail: contact information, categories, notes, delivery lead times.

---

#### `GET /suppliers/category/{category}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List suppliers filtered by category.

---

### /customers — Customer Management

**Auth required. WORKER: no access.**

---

#### `GET /customers`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** List all customers for this tenant.
- **Query params:** `?payment_status=current|overdue`, `?customer_type=wholesale|retail|restaurant|other`

---

#### `POST /customers`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Create a new customer record.
- **Request:** `{customer_code, name, phone, email, address, customer_type, payment_terms_days}`

---

#### `GET /customers/{customer_id}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Full customer profile with outstanding balance, payment history summary, top purchased products.

---

#### `PUT /customers/{customer_id}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Update customer details.

---

#### `GET /customers/revenue-rank`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Customers ranked by total revenue (current year). Useful for identifying top buyers and prioritizing relationships.
- **Response:** Array of `{customer_id, name, total_revenue_fjd, order_count, last_order_date, rank}`

---

#### `GET /customers/overdue-payments`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Customers with outstanding invoices past their payment terms. Triggers the OVERDUE_PAYMENT automation rule.
- **Response:** Array of `{customer_id, name, outstanding_amount_fjd, days_overdue, invoice_count, last_contact_date}`

---

### /livestock — Livestock Tracking

**Auth required. WORKER: read-only.**

---

#### `GET /farms/{farm_id}/livestock`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** List all livestock for a farm.
- **Query params:** `?species=`, `?status=active|sold|deceased`

---

#### `POST /farms/{farm_id}/livestock`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Register a new animal.
- **Request:** `{animal_code, species, breed, sex, birth_date, notes}`

---

#### `GET /livestock/{animal_id}`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** Full animal record with event history.

---

#### `POST /livestock/{animal_id}/events`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER, WORKER
- **Tier:** BASIC+
- **Description:** Log a livestock event: VACCINATION, WEIGHING, TREATMENT, SALE, DEATH, BREEDING.
- **Request:** `{event_type, event_date, notes, cost_fjd (optional), weight_kg (if WEIGHING), selling_price_fjd (if SALE)}`

---

#### `GET /farms/{farm_id}/livestock/summary`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** Livestock herd summary: count by species and sex, total estimated value, upcoming vaccination schedule, recent mortality.

---

### /hives — Beehive Management

**Auth required. WORKER: read-only.**

---

#### `GET /farms/{farm_id}/hives`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** List all beehives for a farm with status and last inspection date.

---

#### `POST /farms/{farm_id}/hives`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Register a new beehive.
- **Request:** `{hive_code, location, queen_age_months, notes}`

---

#### `GET /hives/{hive_id}`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** Full hive detail with inspection history and honey harvest records.

---

#### `POST /hives/{hive_id}/inspection`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER, WORKER
- **Tier:** BASIC+
- **Description:** Log a hive inspection.
- **Request:** `{inspection_date, colony_strength: STRONG|MODERATE|WEAK, disease_signs: bool, queen_present: bool, notes}`

---

#### `POST /hives/{hive_id}/honey-harvest`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Log a honey harvest from a hive.
- **Request:** `{harvest_date, qty_kg, quality_grade: RAW|FILTERED|CREAMED, notes}`

---

### /financial — Financial Analysis

**Auth required. WORKER: no access. VIEWER: dashboard summary only.**

---

#### `GET /cycles/{cycle_id}/financials`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Full cycle financial breakdown. **CoKG is the first and primary field in the response.** Formula: `CoKG = (TotalLaborCost + TotalInputCost + TotalOtherCost) / TotalHarvestQty_kg`. Returns complete cost breakdown, revenue, and profit/loss.
- **Response:** `{cokg_fjd_per_kg, total_cost_fjd, total_labor_cost_fjd, total_input_cost_fjd, total_other_cost_fjd, total_harvest_kg, total_revenue_fjd, profit_loss_fjd, margin_pct, cost_breakdown_by_category: [...]}`

---

#### `GET /production-units/{pu_id}/financials`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Financial summary across all closed cycles for a PU: historical CoKG trend, average revenue per cycle, best/worst performing cycles.

---

#### `GET /farms/{farm_id}/pnl`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Farm Profit & Loss statement for a given period. Income minus all expenses (labor, inputs, overhead). Groupable by month or quarter.
- **Query params:** `?from_date=`, `?to_date=`, `?group_by=month|quarter`

---

#### `GET /farms/{farm_id}/budget-vs-actual`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** PREMIUM+
- **Description:** Budget vs. actual spend comparison for the current period. Requires active budget records in `tenant.budgets`.

---

#### `GET /farms/{farm_id}/profit-share`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER
- **Tier:** PREMIUM+
- **Description:** Profit share calculation breakdown. For farms with operator-owner split arrangements (e.g., Teivaka-operated farms: Teivaka as operator, Nayans as owner for F001). Returns net profit and split by configured percentage.

---

#### `GET /farms/{farm_id}/crop-ranking`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Crops ranked by profitability (revenue minus costs) and by CoKG (lower CoKG is better) across all closed cycles. Shows which crops are most profitable for this farm's conditions.
- **Response:** `{by_profit: [{production_name, avg_profit_per_cycle, avg_cokg, cycle_count}], by_cokg: [...]}`

---

#### `GET /farms/{farm_id}/cashflow-forecast`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** PREMIUM+
- **Description:** 13-week rolling cash flow forecast (identical to `/cash/{farm_id}/forecast` — provided here under /financial for the financial module grouping).

---

#### `GET /customers/{customer_id}/accounts-receivable`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Outstanding accounts receivable for a customer: all unpaid invoices, totals, aging analysis (current / 30 days / 60 days / 90+ days overdue).

---

### /tasks — Task Queue Management

**Auth required. WORKER: can view assigned tasks and mark complete.**

---

#### `GET /farms/{farm_id}/tasks`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List tasks for a farm.
- **Query params:** `?status=open|in_progress|completed`, `?assigned_to=worker_id`, `?due_before=date`

---

#### `POST /farms/{farm_id}/tasks`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Create a new manual task (as opposed to system-generated tasks from the Automation Engine).
- **Request:** `{task_type, description, assigned_to (worker_id), due_date, priority: LOW|MEDIUM|HIGH|CRITICAL, pu_id (optional)}`

---

#### `GET /tasks/{task_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full task detail including linked alert (if system-generated), assigned worker, and completion history.

---

#### `POST /tasks/{task_id}/complete`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER, WORKER
- **Tier:** FREE+
- **Description:** Mark a task as completed. WORKER can only complete tasks assigned to them.
- **Request:** `{completed_at, completion_notes (optional)}`

---

#### `POST /tasks/{task_id}/assign`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Assign or reassign a task to a worker.
- **Request:** `{worker_id, due_date (optional update)}`

---

#### `GET /farms/{farm_id}/tasks/overdue`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** All tasks past their due date and not yet completed. Used by Automation Engine and dashboard alert widget.

---

### /alerts — Alert Management

**Auth required. WORKER: read-only.**

---

#### `GET /farms/{farm_id}/alerts`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all alerts for a farm.
- **Query params:** `?status=open|in_progress|resolved|dismissed`, `?severity=CRITICAL|HIGH|MEDIUM|LOW`, `?from_date=`

---

#### `GET /alerts/{alert_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full alert detail: rule that triggered it, affected resource, current status, resolution history, linked task (if any).

---

#### `POST /alerts/{alert_id}/resolve`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Manually resolve an open alert. Records resolution timestamp and the user who resolved it. WhatsApp confirmation sent if alert was originally delivered via WhatsApp.
- **Request:** `{resolution_notes}`

---

#### `POST /alerts/{alert_id}/dismiss`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** FREE+
- **Description:** Dismiss an alert (mark as acknowledged but not acted on). Used when an alert is a false positive or has been handled out-of-system.
- **Request:** `{dismiss_reason}`

---

### /decision-engine — Decision Engine Signals

**Auth required. WORKER: no access. VIEWER: summary only.**

Decision engine runs at 6:05am Fiji time daily via Celery Beat. Results are **always** read from the snapshot — never computed on-demand.

---

#### `GET /farms/{farm_id}/decision-engine/current`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** PREMIUM+
- **Description:** Returns today's decision engine snapshot for the farm: all 10 signal scores, overall farm health score, top 3 recommended actions. Cached in Redis, TTL 300s.
- **Response:** `{snapshot_date, overall_score, signals: [{name, score, status: GREEN|YELLOW|RED, detail}], top_recommendations: [{action, priority, detail}]}`

---

#### `GET /farms/{farm_id}/decision-engine/history`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** PREMIUM+
- **Description:** Historical decision engine snapshots. Default: last 30 days. Used for trend analysis.
- **Query params:** `?days=30`

---

#### `GET /farms/{farm_id}/decision-engine/signals/{signal_name}`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** PREMIUM+
- **Description:** Detailed view of a single signal's history and current value. Signal names: `crop_health`, `labor_adequacy`, `financial_trajectory`, `input_availability`, `weather_risk`, `pest_disease_pressure`, `harvest_timing`, `market_price_alignment`, `rotation_compliance`, `cash_flow_health`.

---

### /automation — Automation Rule Management

**Auth required. FOUNDER and MANAGER only.**

---

#### `GET /automation/rules`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** List all automation rules for this tenant (seeded from `shared.actionable_rules`). Shows which are enabled/disabled, last triggered date, trigger count.
- **Response:** Array of `{id, rule_code, name, description, status, severity, last_triggered_at, trigger_count_30d}`

---

#### `POST /automation/rules/{rule_id}/trigger-manual`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER
- **Tier:** PREMIUM+
- **Description:** Manually trigger a specific automation rule evaluation outside the normal 6am cycle. Useful for testing rules or responding to urgent situations. Creates alerts if conditions are met.
- **Request:** Empty body or `{farm_id (optional — to scope to one farm)}`

---

#### `PUT /automation/rules/{rule_id}/toggle`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Enable or disable an automation rule. Disabled rules are skipped by the Automation Engine.
- **Request:** `{status: "Active" | "Inactive"}`

---

### /rotation — Rotation Engine

**Auth required.**

---

#### `POST /rotation/validate`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Validate whether a crop can be planted on a PU. Checks crop family rotation rules (`shared.rotation_rules`) and hard family policies (`shared.family_policies`). Used before cycle creation. Does not create any records.
- **Request:** `{pu_id, production_id}`
- **Response:** `{valid: bool, violated_rule: null or {rule_code, family_from, family_to, wait_cycles_required, notes}, cycle_history_summary: [{production_name, family, cycles_ago}], suggested_alternatives: [{production_id, production_name, rotation_score}]}`

---

#### `GET /productions/{production_id}/rotation/top-choices`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Given a crop, returns the best rotation follow-on crops (crops that can follow this crop in the next cycle, ranked by rotation benefit score).
- **Response:** Array of `{production_id, name, rotation_score, family, wait_cycles, benefit_notes}`

---

#### `GET /rotation/family-policies`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Returns all crop family rotation hard policies from `shared.family_policies`. Useful for farm planning tools.

---

#### `GET /farms/{farm_id}/rotation/override-log`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER
- **Tier:** PREMIUM+
- **Description:** Audit log of all rotation overrides performed by FOUNDER for this farm. Each override shows: cycle created, rule violated, justification provided, date.

---

### /knowledge — Knowledge Base (Shared Schema)

**Auth required. All tiers. Read-only. Data from `shared.*` — same for all tenants. Cached aggressively (TTL 86400s).**

---

#### `GET /knowledge/crops`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all 49 crop productions from `shared.productions`.

---

#### `GET /knowledge/crops/{production_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full crop knowledge card: description, stages, protocols, thresholds, common pests/diseases, KB article links.

---

#### `GET /knowledge/pests`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all pests from `shared.pest_library`.

---

#### `GET /knowledge/pests/{pest_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full pest record: identification guide, lifecycle, damage description, management protocols, recommended chemicals.

---

#### `GET /knowledge/diseases`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all diseases from `shared.disease_library`.

---

#### `GET /knowledge/diseases/{disease_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full disease record: symptoms, causes, conditions that favor spread, management protocols.

---

#### `GET /knowledge/weeds`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all weeds from `shared.weed_library`.

---

#### `GET /knowledge/weeds/{weed_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full weed record: identification, habitat preference, control methods.

---

#### `GET /knowledge/chemicals`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all chemicals from `shared.chemical_library` with withholding period and safety summary. Critical for compliance.

---

#### `GET /knowledge/chemicals/{chemical_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full chemical record: active ingredient, class, withholding period (days), pre-harvest interval, restricted entry interval (REI hours), application rate range, target pests/diseases, safety data sheet reference.

---

#### `GET /knowledge/articles`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List KB articles. Supports filtering by crop, category.
- **Query params:** `?production_id=`, `?category=agronomy|pest_management|soil|irrigation|finance|other`

---

#### `GET /knowledge/articles/{article_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full KB article content. This is what the TIS Knowledge Broker RAG pipeline retrieves and passes to Claude API.

---

#### `GET /knowledge/search?q={query}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Full-text search across all KB content: articles, pests, diseases, chemicals, crops. Returns ranked results by relevance. The TIS Knowledge Broker uses semantic (vector) search directly against embeddings — this endpoint provides the text-based search for the Browse Knowledge UI.
- **Query params:** `?q=powdery+mildew+eggplant`, `?limit=10`

---

#### `GET /knowledge/stage-links/{stage_id}`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Returns all KB articles linked to a specific crop growth stage, ranked by relevance. Used by the cycle protocol view.

---

### /tis — Teivaka Intelligence System

**Auth required. Rate limit: 10 requests/minute per user. BASIC+ tier for all TIS endpoints.**

---

#### `POST /tis/chat`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** Send a text message to TIS. The message is classified and routed to one of three modules: Knowledge Broker (agronomic questions), Operational Interpreter (explain my farm data), or Command Executor (do something on the farm). Response may be synchronous (text/operational questions) or asynchronous (command execution returns 202).
- **Request:** `{message: "...", conversation_id (optional — null creates new conversation), farm_id}`
- **Response (sync):** `{success: true, data: {conversation_id, message_id, module_used, response_text, sources (if KB), command_result (if command)}}`
- **Response (async command):** `202 Accepted` with `{conversation_id, command_log_id, poll_url}`

---

#### `POST /tis/command`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** Submit a voice audio clip for TIS voice command processing. Audio → Whisper transcription → TIS Command Executor. Returns 202 immediately; process completes asynchronously. Target total latency: under 5 seconds.
- **Request:** Multipart: `{audio: file (WebM/Opus, max 60s), farm_id}`
- **Response:** `202 Accepted` with `{voice_log_id, poll_url: '/api/v1/tis/voice-logs/{voice_log_id}'}`

---

#### `GET /tis/conversations/{conversation_id}`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** Retrieve a full conversation thread: all messages in sequence, each with role (user/assistant), module used, and timestamp.

---

#### `GET /tis/conversations`
- **Auth:** Bearer JWT
- **Tier:** BASIC+
- **Description:** List recent conversations for the authenticated user. Useful for displaying conversation history in the PWA chat UI.
- **Query params:** `?limit=20`
- **Response:** Array of `{conversation_id, last_message_at, message_count, last_message_preview}`

---

#### `GET /tis/insights`
- **Auth:** Bearer JWT
- **Tier:** PREMIUM+
- **Description:** Farm-specific AI-generated insights stored by the Decision Engine. These are pre-generated interpretations of the decision signals, not on-demand queries. Returns insights valid for the current week.
- **Response:** Array of `{insight_type, title, body, signal_basis, valid_until, created_at}`

---

### /dashboard — Farm Dashboard

**Auth required. Heavily cached (Redis TTL 60s). All tiers.**

---

#### `GET /farms/{farm_id}/dashboard`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Single-call endpoint returning all data required to render the main farm dashboard. This is the most-called endpoint in the system — heavily cached (Redis TTL 60 seconds per farm). Returns: farm summary, all active cycles with current stage, latest decision signals (from snapshot), open alerts (CRITICAL and HIGH), recent field events (last 5), financial summary (CoKG this season, revenue, costs), pending tasks (next 7 days), low stock inputs, current weather, upcoming expected harvests (next 14 days).
- **Rate limit:** 1000 requests/minute (exempt from standard 100/min limit)
- **Response:**
```json
{
  "success": true,
  "data": {
    "farm": { "id", "name", "farm_code" },
    "active_cycles": [{ "cycle_id", "pu_code", "crop_name", "stage", "days_to_harvest", "health_score" }],
    "decision_signals": { "overall_score", "top_signals": [...] },
    "open_alerts": [{ "alert_id", "severity", "title", "created_at" }],
    "recent_events": [{ "event_id", "event_type", "pu_code", "logged_at", "description" }],
    "financial_summary": { "avg_cokg_this_season", "total_revenue_mtd", "total_costs_mtd" },
    "pending_tasks": [{ "task_id", "description", "due_date", "priority" }],
    "low_stock_inputs": [{ "input_id", "name", "current_stock", "unit", "reorder_threshold" }],
    "weather_current": { "zone_id", "temp_c", "rainfall_mm", "recorded_at" },
    "upcoming_harvests": [{ "pu_code", "crop_name", "expected_date", "expected_qty_kg" }]
  },
  "meta": { "cached_at": "ISO8601", "cache_ttl_seconds": 60 }
}
```

---

### /reports — Reporting

**Auth required. FOUNDER and MANAGER only. PREMIUM+ for detailed reports.**

---

#### `GET /farms/{farm_id}/reports/weekly-kpi`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Weekly KPI summary: harvests (kg and revenue), labor hours and cost, input spend, new alerts, cycle progress. Generated Monday 6:10am by Celery Beat.
- **Query params:** `?week_start=YYYY-MM-DD` (defaults to most recent Monday)

---

#### `GET /farms/{farm_id}/reports/monthly-pnl`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** PREMIUM+
- **Description:** Monthly P&L report: income by category, expenses by category, net profit, CoKG for completed cycles in the month.
- **Query params:** `?month=YYYY-MM` (defaults to current month)

---

#### `GET /cycles/{cycle_id}/reports/cycle-report`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Complete cycle report for a closed cycle: timeline, stage-by-stage event summary, harvest records, total costs, total revenue, final CoKG, comparison to farm average CoKG, lessons learned (from notes).

---

#### `GET /farms/{farm_id}/reports/harvest-report`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Description:** Harvest volume and quality report for a farm over a time range. Breakdown by crop, by PU, by grade. Includes harvest frequency and efficiency metrics.
- **Query params:** `?from_date=`, `?to_date=`

---

### /community — Community Platform

**Auth required. Phase 1: view-only (POST endpoints return 403 with `PHASE_1_READONLY`). Full features in Phase 2.**

---

#### `GET /community/listings`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** List all active marketplace listings across all tenants (cross-tenant visibility via the marketplace_listings permissive SELECT policy). Shows produce for sale, inputs for sale/swap, services offered.
- **Query params:** `?type=SELL|BUY|SWAP`, `?production_id=`, `?location=`

---

#### `POST /community/listings`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Phase:** Phase 2 only (returns `403 PHASE_1_READONLY` in Phase 1)
- **Description:** Create a new marketplace listing for produce or inputs.
- **Request:** `{listing_type: SELL|BUY|SWAP, title, description, production_id, qty_available, unit, price_per_unit_fjd, expires_at}`

---

#### `GET /community/price-index`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Current commodity price index for key Fijian agricultural products. Aggregated from marketplace listings and manually curated Teivaka price data. Used as reference for setting farm gate prices.
- **Response:** Array of `{production_id, production_name, avg_price_per_kg_fjd, min_price, max_price, data_points, last_updated}`

---

#### `GET /community/suppliers`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Community-verified supplier directory. Combines Teivaka's supplier master with community ratings and reviews.

---

#### `GET /community/buyers`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Registered buyers looking for produce. Helps small farms connect with wholesale and retail buyers.

---

#### `GET /community/posts`
- **Auth:** Bearer JWT
- **Tier:** FREE+
- **Description:** Community forum posts feed.
- **Query params:** `?category=`, `?page=`, `?limit=`

---

#### `POST /community/posts`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER, MANAGER
- **Tier:** BASIC+
- **Phase:** Phase 2 only (returns `403 PHASE_1_READONLY` in Phase 1)
- **Description:** Create a community forum post.
- **Request:** `{title, body, category, photo (optional)}`

---

### /subscriptions — Subscription Management

**Auth required. FOUNDER only for upgrade. All roles can view current.**

---

#### `GET /subscriptions/current`
- **Auth:** Bearer JWT
- **Tier:** Any
- **Description:** Returns the current subscription tier, billing period, features included, and features available in the next tier up.
- **Response:** `{tier, status, current_period_start, current_period_end, cancel_at_period_end, features: {...}, next_tier: {...}}`

---

#### `POST /subscriptions/upgrade`
- **Auth:** Bearer JWT
- **Roles:** FOUNDER
- **Tier:** Any
- **Description:** Initiate a subscription tier upgrade. Redirects to Stripe Checkout for payment processing. Returns a Stripe checkout URL — the client navigates to this URL to complete payment. On payment success, Stripe webhook updates the subscription tier automatically.
- **Request:** `{target_tier: BASIC|PREMIUM|CUSTOM}`
- **Response:** `{checkout_url: "https://checkout.stripe.com/..."}`

---

#### `GET /subscriptions/usage-metrics`
- **Auth:** Bearer JWT
- **Tier:** Any
- **Description:** Current usage vs. tier limits: farm count, PU count, TIS query count this month, storage used. Helps users understand if they are approaching tier limits.

---

### /admin — Admin Operations

**Auth required. Admin role (internal Teivaka staff) only. Not accessible to tenant users.**

---

#### `GET /admin/tenants`
- **Auth:** Bearer JWT (admin user)
- **Roles:** ADMIN (Teivaka internal)
- **Description:** List all tenants in the system with subscription tier, status, farm count, and last activity.

---

#### `GET /admin/system-health`
- **Auth:** Bearer JWT (admin user)
- **Roles:** ADMIN
- **Description:** System health dashboard: Celery queue depths, Redis memory usage, PostgreSQL connection pool status, last automation engine run time and result, Whisper/Claude/Twilio API status.

---

#### `GET /admin/migration-status`
- **Auth:** Bearer JWT (admin user)
- **Roles:** ADMIN
- **Description:** Alembic migration status: current DB revision, pending migrations, last migration applied at.

---

### /webhooks — Inbound Webhooks

**No Bearer JWT. Verified by service-specific signature mechanism.**

---

#### `POST /webhooks/whatsapp`
- **Auth:** Twilio webhook signature verification (X-Twilio-Signature header)
- **Description:** Receives incoming WhatsApp messages from Twilio Business API. This is the entry point for WhatsApp-based TIS interactions. Processing:
  1. Validate Twilio signature using `TWILIO_AUTH_TOKEN` and request URL (reject with 403 if invalid)
  2. Extract `From` (phone number), `Body` (message text), `MediaUrl` (if photo attached)
  3. Look up user by phone number in `tenant.workers`
  4. Route message to TIS chat handler (same as `POST /tis/chat`)
  5. Send response back via Twilio API
  6. Return `200 OK` with empty body (Twilio requires 200 response to stop retry)
- **Webhook security:** HMAC-SHA1 signature computed from `TWILIO_AUTH_TOKEN` + full request URL + sorted POST params. Must match `X-Twilio-Signature` header. Reject with `403 FORBIDDEN` if mismatch.

---

#### `POST /webhooks/stripe`
- **Auth:** Stripe webhook signature verification (Stripe-Signature header)
- **Description:** Receives subscription lifecycle events from Stripe: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`.
  Processing:
  1. Validate Stripe webhook signature using `STRIPE_WEBHOOK_SECRET`
  2. Handle event type:
     - `invoice.payment_succeeded` → update `tenant_subscriptions.tier` and `status = 'active'`, invalidate Redis cache
     - `invoice.payment_failed` → set `tenant_subscriptions.status = 'past_due'`, queue alert WhatsApp to FOUNDER
     - `customer.subscription.deleted` → downgrade to FREE, set status = 'cancelled'
  3. Return `200 OK`

---

## 7. Business Logic Summary by Endpoint Group

| Endpoint Group | Key Business Logic Applied |
|---------------|---------------------------|
| `/auth` | bcrypt password verification, JWT signing, refresh token rotation, blacklist on logout |
| `/farms` | RLS tenant isolation, farm_ids JWT validation |
| `/cycles` | Rotation validation (`validate_rotation()`) on POST, rotation override logged permanently |
| `/harvests` | Chemical compliance check (2-layer: API + DB trigger), `hrv_id` auto-generation |
| `/events` | SPRAY events start chemical withholding clock |
| `/financial` | CoKG = (Labor + Input + Other) / HarvestKG — always the primary metric |
| `/cash/forecast` | 13-week projection combining known costs + projected harvest revenues |
| `/decision-engine` | Always read from snapshot (never on-demand) — runs at 6:05am Fiji |
| `/automation` | 43 rules evaluated at 6:00am Fiji, deduplication by alert_key |
| `/tis` | Rate limit 10/min, Knowledge Broker constrained to KB only (no hallucination) |
| `/knowledge` | Reads from `shared.*` schema — same data for all tenants, cached 86400s |
| `/rotation` | Checks `shared.rotation_rules` + `shared.family_policies`, override FOUNDER only |
| `/community` | marketplace_listings have cross-tenant SELECT policy; Phase 1 write endpoints return 403 |
| `/webhooks/whatsapp` | Twilio HMAC-SHA1 signature verification mandatory, rejects invalid signatures |
| `/dashboard` | Redis cached 60s, rate limit 1000/min |

---

*End of API_DESIGN.md*
