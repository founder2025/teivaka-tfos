# FILE: 03_backend/ENDPOINTS.md
# Teivaka TFOS API — Complete Endpoint Specification

**Platform:** Teivaka Agricultural TOS (Agri-TOS), Fiji
**Company:** Teivaka PTE LTD (Company No. 2025RC001894)
**Founder:** Uraia Koroi Kama (Cody)
**Currency:** FJD | **Timezone:** Pacific/Fiji (UTC+12)
**Base URL:** `https://api.teivaka.com/api/v1`
**Auth:** Bearer JWT (15-min access token) + httpOnly refresh cookie (7 days)
**Primary Financial Metric:** CoKG = (LaborCost + InputCost + OtherCost) / TotalHarvestQty_kg

---

## Global Conventions

| Convention | Detail |
|---|---|
| All responses | `{"success": true/false, "data": {...}}` or `{"success": false, "error": {"code": "...", "message": "..."}}` |
| Pagination | `?page=1&page_size=20` → response includes `meta: {total, page, page_size, total_pages}` |
| Timestamps | ISO 8601 with UTC+12 offset: `2026-04-07T08:30:00+12:00` |
| Monetary values | FJD, 2 decimal places, field suffix `_fjd` |
| IDs | Farm: `F001`, PU: `F001-PU002`, Cycle: `CY-F001-26-002`, Harvest: `HRV-YYYYMMDD-###`, Labor: `LAB-YYYYMMDD-###` |
| Multi-tenancy | All operational endpoints enforce `tenant_id` via PostgreSQL RLS |
| Rate Limiting | FREE=5 TIS/day, BASIC=20/day, PREMIUM/CUSTOM=unlimited (Redis counter) |

---

## Subscription Tier Definitions

| Tier | TIS Calls/Day | Dashboard | Decision Engine | Expansion Readiness |
|---|---|---|---|---|
| FREE | 5 | Simplified | Not available | Not available |
| BASIC | 20 | Full | Read-only | Not available |
| PREMIUM | Unlimited | Full | Full | Full |
| CUSTOM | Unlimited | Full | Full | Full |

---

## AUTH GROUP

---

### POST /api/v1/auth/login

**Summary:** Authenticate user with username and password. Returns JWT tokens.

**Auth Required:** None (public endpoint)
**Subscription Tier Minimum:** N/A

**Request Body:**
```json
{
  "username": "string (email or phone number)",
  "password": "string (min 8 chars)"
}
```

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "expires_in": 900,
    "refresh_token": "eyJhbGciOiJIUzI1NiIs...",
    "user_info": {
      "user_id": "USR-001",
      "full_name": "Uraia Koroi Kama",
      "email": "cody@teivaka.com",
      "role": "FOUNDER",
      "tenant_id": "TNT-001",
      "subscription_tier": "PREMIUM",
      "farms": ["F001", "F002"],
      "last_login": "2026-04-06T19:30:00+12:00"
    }
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Username or password incorrect |
| `ACCOUNT_DISABLED` | 403 | Account suspended or deactivated |
| `ACCOUNT_NOT_FOUND` | 404 | No account with this username |
| `RATE_LIMIT_LOGIN` | 429 | Too many login attempts (5 failed in 15 min → 15 min lockout) |
| `VALIDATION_ERROR` | 422 | Missing or malformed fields |

**Business Logic Applied:**
1. Lookup user by email or phone in `public.users` table
2. Verify bcrypt password hash
3. On success: generate 15-min access JWT (`sub=user_id, tenant_id, role, tier`) + 7-day refresh JWT
4. Store refresh token hash in `public.refresh_tokens` (hashed, not plaintext)
5. Set httpOnly cookie `refresh_token` (SameSite=Strict, Secure)
6. Log login event to `public.audit_log`
7. Update `users.last_login_at` timestamp
8. On failure: increment `login_attempts` counter in Redis (`login:fails:{username}`) — block at 5

**DB Tables Touched:**
- READ: `public.users`, `public.tenant_subscriptions`
- WRITE: `public.refresh_tokens`, `public.audit_log`, `public.users` (last_login_at)

---

### POST /api/v1/auth/logout

**Summary:** Invalidate current refresh token (server-side revocation).

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** N/A

**Request Body:**
```json
{
  "refresh_token": "string (optional — if not provided, uses cookie)"
}
```

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Logged out successfully."
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `TOKEN_NOT_FOUND` | 404 | Refresh token not found in DB (already revoked or expired) |
| `UNAUTHORIZED` | 401 | No valid JWT in Authorization header |

**Business Logic Applied:**
1. Extract refresh token from request body or httpOnly cookie
2. Hash it and DELETE matching record from `public.refresh_tokens`
3. Clear httpOnly `refresh_token` cookie (Set-Cookie: refresh_token=; Max-Age=0)
4. Log logout event to `public.audit_log`

**DB Tables Touched:**
- WRITE: `public.refresh_tokens` (delete), `public.audit_log`

---

### POST /api/v1/auth/refresh

**Summary:** Exchange valid refresh token for new access token.

**Auth Required:** None (uses refresh token, not Bearer JWT)
**Subscription Tier Minimum:** N/A

**Request Body:**
```json
{
  "refresh_token": "string (optional — reads from cookie if not provided)"
}
```

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "bearer",
    "expires_in": 900
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `REFRESH_TOKEN_INVALID` | 401 | Token not in DB or hash mismatch |
| `REFRESH_TOKEN_EXPIRED` | 401 | Token older than 7 days |
| `REFRESH_TOKEN_REVOKED` | 401 | Token manually revoked (logout or password change) |

**Business Logic Applied:**
1. Hash incoming refresh token; lookup in `public.refresh_tokens`
2. Verify not expired (`expires_at > NOW()`)
3. Verify not revoked (`revoked_at IS NULL`)
4. Issue new 15-min access JWT with fresh `iat/exp` claims
5. Rotate refresh token: revoke old record, insert new record (refresh token rotation)
6. Update `refresh_tokens.last_used_at`

**DB Tables Touched:**
- READ: `public.refresh_tokens`, `public.users`
- WRITE: `public.refresh_tokens` (revoke old, insert new)

---

### GET /api/v1/auth/me

**Summary:** Returns profile of currently authenticated user.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** N/A

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "user_id": "USR-001",
    "full_name": "Uraia Koroi Kama",
    "email": "cody@teivaka.com",
    "phone": "+6799XXXXXXX",
    "role": "FOUNDER",
    "tenant_id": "TNT-001",
    "subscription_tier": "PREMIUM",
    "subscription_expires_at": "2027-01-01T00:00:00+12:00",
    "farms": [
      {"farm_id": "F001", "farm_name": "Save-A-Lot", "location": "Korovou"},
      {"farm_id": "F002", "farm_name": "Viyasiyasi", "location": "Kadavu Island"}
    ],
    "preferences": {
      "timezone": "Pacific/Fiji",
      "currency": "FJD",
      "language": "en",
      "whatsapp_notifications": true
    },
    "tis_usage_today": {
      "calls_used": 7,
      "calls_limit": null,
      "tier": "PREMIUM"
    },
    "created_at": "2025-06-01T09:00:00+12:00"
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or expired JWT |

**Business Logic Applied:**
1. Decode JWT; extract `user_id`
2. Join `public.users`, `public.tenant_subscriptions`, `public.farm_access`
3. Read Redis counter `tis:calls:{user_id}:{today}` for usage data

**DB Tables Touched:**
- READ: `public.users`, `public.tenant_subscriptions`, `public.farm_access`

---

### PUT /api/v1/auth/change-password

**Summary:** Change authenticated user's password.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** N/A

**Request Body:**
```json
{
  "current_password": "string",
  "new_password": "string (min 8 chars, requires 1 uppercase, 1 number)"
}
```

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "message": "Password changed successfully. All other sessions have been logged out."
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `WRONG_CURRENT_PASSWORD` | 400 | Current password verification failed |
| `PASSWORD_TOO_WEAK` | 422 | New password does not meet complexity requirements |
| `SAME_PASSWORD` | 422 | New password identical to current password |
| `UNAUTHORIZED` | 401 | Missing or expired JWT |

**Business Logic Applied:**
1. Verify `current_password` against `users.password_hash`
2. Validate new password complexity
3. Reject if new password == current password
4. Hash new password with bcrypt (cost=12)
5. Update `users.password_hash`
6. Revoke ALL existing refresh tokens for this user (`UPDATE refresh_tokens SET revoked_at = NOW()`)
7. Log password change to `public.audit_log`

**DB Tables Touched:**
- READ: `public.users`
- WRITE: `public.users` (password_hash), `public.refresh_tokens` (revoke all), `public.audit_log`

---

## FARMS GROUP

---

### GET /api/v1/farms

**Summary:** List all farms accessible to the authenticated user.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `page` | int | Page number (default: 1) |
| `page_size` | int | Results per page (default: 20, max: 100) |

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "farm_id": "F001",
      "farm_name": "Save-A-Lot",
      "location": "Korovou",
      "province": "Rewa",
      "total_area_acres": 12.5,
      "active_pu_count": 7,
      "active_cycle_count": 2,
      "subscription_tier": "BASIC",
      "overall_rag": "AMBER",
      "created_at": "2025-06-01T09:00:00+12:00"
    },
    {
      "farm_id": "F002",
      "farm_name": "Viyasiyasi",
      "location": "Kadavu Island",
      "province": "Kadavu",
      "total_area_acres": 8.0,
      "active_pu_count": 4,
      "active_cycle_count": 1,
      "subscription_tier": "BASIC",
      "overall_rag": "GREEN",
      "created_at": "2025-07-15T09:00:00+12:00"
    }
  ],
  "meta": {
    "total": 2,
    "page": 1,
    "page_size": 20,
    "total_pages": 1
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or expired JWT |

**Business Logic Applied:**
1. Filter farms by `tenant_id` (enforced by RLS policy `rls_farm_tenant_isolation`)
2. Join latest `decision_signals` snapshot for `overall_rag` field
3. Count active PUs and cycles from `production_units` and `production_cycles`

**DB Tables Touched:**
- READ: `public.farms`, `public.production_units`, `public.production_cycles`, `public.decision_signals`

---

### POST /api/v1/farms

**Summary:** Create a new farm. FOUNDER role only.

**Auth Required:** Bearer JWT, role=FOUNDER
**Subscription Tier Minimum:** FREE

**Request Body:**
```json
{
  "farm_name": "string (required, max 100 chars)",
  "location": "string (required, max 200 chars)",
  "province": "string (required)",
  "total_area_acres": "number (required, > 0)",
  "gps_lat": "number (optional)",
  "gps_lng": "number (optional)",
  "notes": "string (optional)"
}
```

**Response Body (201 Created):**
```json
{
  "success": true,
  "data": {
    "farm_id": "F003",
    "farm_name": "New Farm Name",
    "location": "Location",
    "province": "Ba",
    "total_area_acres": 5.0,
    "tenant_id": "TNT-001",
    "created_at": "2026-04-07T09:00:00+12:00"
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `FORBIDDEN` | 403 | Role is not FOUNDER |
| `FARM_LIMIT_REACHED` | 422 | Tenant has reached maximum farms for subscription tier |
| `DUPLICATE_FARM_NAME` | 422 | Farm name already exists for this tenant |
| `VALIDATION_ERROR` | 422 | Missing required fields |

**Business Logic Applied:**
1. Verify `role == FOUNDER`
2. Check farm count limit per subscription tier (FREE: 1, BASIC: 3, PREMIUM: unlimited)
3. Check uniqueness of `farm_name` within tenant
4. Generate sequential `farm_id` (F001, F002, F003...)
5. Insert `public.farms` record with `tenant_id` from JWT
6. Log to `public.audit_log`

**DB Tables Touched:**
- READ: `public.farms` (uniqueness check, count)
- WRITE: `public.farms`, `public.audit_log`

---

### GET /api/v1/farms/{farm_id}

**Summary:** Get full detail for a specific farm.

**Auth Required:** Bearer JWT (any role with farm access)
**Subscription Tier Minimum:** FREE

**Path Parameters:**
| Param | Type | Description |
|---|---|---|
| `farm_id` | string | Farm ID (e.g., `F001`) |

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "farm_id": "F001",
    "farm_name": "Save-A-Lot",
    "location": "Korovou",
    "province": "Rewa",
    "total_area_acres": 12.5,
    "gps_lat": -17.9876,
    "gps_lng": 178.2345,
    "subscription_tier": "BASIC",
    "production_units": [
      {"pu_id": "F001-PU001", "pu_name": "Block A", "area_acres": 1.5, "production_type": "CRP-CAS", "current_stage": "Establishment"},
      {"pu_id": "F001-PU002", "pu_name": "Block B", "area_acres": 1.2, "production_type": "CRP-EGG", "current_stage": "Fruiting"},
      {"pu_id": "F001-PU003", "pu_name": "Block C", "area_acres": 1.2, "production_type": "CRP-EGG", "current_stage": "Vegetative"},
      {"pu_id": "F001-PU011", "pu_name": "Apiary", "area_acres": 0.5, "production_type": "LIV-API", "current_stage": "Active"}
    ],
    "workers": [
      {"worker_id": "W-001", "name": "Laisenia Waqa", "role": "Field Worker"},
      {"worker_id": "W-002", "name": "Maika Ratubaba", "role": "Field Worker"}
    ],
    "open_alerts_count": 1,
    "active_cycle_count": 2,
    "overall_rag": "AMBER",
    "created_at": "2025-06-01T09:00:00+12:00",
    "notes": null
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `FARM_NOT_FOUND` | 404 | `farm_id` does not exist or user has no access |
| `UNAUTHORIZED` | 401 | Missing or expired JWT |

**Business Logic Applied:**
1. RLS policy ensures user can only access farms in their `tenant_id`
2. Joins `production_units`, `workers`, aggregates alert/cycle counts

**DB Tables Touched:**
- READ: `public.farms`, `public.production_units`, `public.workers`, `public.alerts`, `public.production_cycles`, `public.decision_signals`

---

### PUT /api/v1/farms/{farm_id}

**Summary:** Update farm details. FOUNDER role only.

**Auth Required:** Bearer JWT, role=FOUNDER
**Subscription Tier Minimum:** FREE

**Request Body (all fields optional):**
```json
{
  "farm_name": "string",
  "location": "string",
  "province": "string",
  "total_area_acres": "number",
  "gps_lat": "number",
  "gps_lng": "number",
  "notes": "string"
}
```

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "farm_id": "F001",
    "farm_name": "Save-A-Lot (Updated)",
    "updated_at": "2026-04-07T10:00:00+12:00"
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `FORBIDDEN` | 403 | Role is not FOUNDER |
| `FARM_NOT_FOUND` | 404 | Farm does not exist |
| `DUPLICATE_FARM_NAME` | 422 | New name already in use by another farm |

**Business Logic Applied:**
1. Verify `role == FOUNDER`
2. Validate `farm_id` belongs to user's `tenant_id`
3. If `farm_name` changed, check uniqueness within tenant
4. PATCH update (only supplied fields)
5. Log to `public.audit_log`

**DB Tables Touched:**
- READ: `public.farms`
- WRITE: `public.farms` (partial update), `public.audit_log`

---

### GET /api/v1/farms/{farm_id}/dashboard

**Summary:** Single aggregated dashboard call — all decision signals, alerts, cycles, and financial summary.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** BASIC (FREE gets simplified version with only open_alerts + active_cycles, no decision signals)

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `simplified` | bool | If `true`, returns FREE-tier simplified response |

**Response Body (200 OK — BASIC+ full response):**
```json
{
  "success": true,
  "data": {
    "farm_id": "F001",
    "farm_name": "Save-A-Lot",
    "subscription_tier": "BASIC",
    "decision_signals": {
      "signal_1_gross_margin": {"rag": "AMBER", "value": 34.2, "score": 6, "label": "Gross Margin %"},
      "signal_2_cogk_vs_market": {"rag": "GREEN", "value": 1.86, "score": 8, "label": "CoKG vs Market Price"},
      "signal_3_harvest_gap": {"rag": "GREEN", "value": 2, "score": 9, "label": "Days Since Last Harvest"},
      "signal_4_task_completion": {"rag": "AMBER", "value": 72.5, "score": 5, "label": "Task Completion Rate %"},
      "signal_5_chemical_compliance": {"rag": "RED", "value": 1, "score": 0, "label": "Chemical Compliance Blocks"},
      "signal_6_input_cost_ratio": {"rag": "GREEN", "value": 13.2, "score": 8, "label": "Input Cost % of Revenue"},
      "signal_7_labor_cost_ratio": {"rag": "AMBER", "value": 57.1, "score": 5, "label": "Labor Cost % of Revenue"},
      "signal_8_rotation_health": {"rag": "GREEN", "value": 1.0, "score": 10, "label": "Rotation Health Score"},
      "signal_9_harvest_weight_trend": {"rag": "AMBER", "value": -5.2, "score": 4, "label": "Harvest Weight Trend %"},
      "signal_10_cycle_age_health": {"rag": "GREEN", "value": 45, "score": 7, "label": "Active Cycle Age (days)"}
    },
    "open_alerts": [
      {
        "alert_id": "ALT-20260403-001",
        "severity": "Critical",
        "rule_id": "RULE-038",
        "title": "Chemical Compliance Block",
        "pu_id": "F001-PU002",
        "created_at": "2026-04-03T08:00:00+12:00"
      }
    ],
    "active_cycles": [
      {
        "cycle_id": "CY-F001-26-002",
        "pu_id": "F001-PU002",
        "production_name": "Eggplant",
        "stage": "Fruiting",
        "cogk_fjd": 1.86,
        "gross_margin_pct": 34.2,
        "days_active": 45,
        "last_harvest_date": "2026-04-05"
      },
      {
        "cycle_id": "CY-F001-26-001",
        "pu_id": "F001-PU001",
        "production_name": "Cassava",
        "stage": "Establishment",
        "cogk_fjd": null,
        "gross_margin_pct": null,
        "days_active": 12,
        "last_harvest_date": null
      }
    ],
    "financial_summary_30d": {
      "total_revenue_fjd": 840.00,
      "total_cost_fjd": 553.00,
      "net_profit_fjd": 287.00,
      "avg_cogk_fjd": 1.86
    },
    "open_tasks": {
      "overdue_count": 2,
      "due_today_count": 1,
      "upcoming_count": 4
    },
    "inventory_alerts": [
      {
        "input_name": "Dimethoate 40% EC",
        "current_stock_units": 2,
        "unit": "L",
        "reorder_point": 5,
        "days_remaining": 14
      }
    ],
    "last_updated": "2026-04-07T06:05:00+12:00"
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `FARM_NOT_FOUND` | 404 | Farm does not exist or no access |
| `UNAUTHORIZED` | 401 | Missing or expired JWT |

**Business Logic Applied:**
1. Check subscription tier — if FREE, return simplified version
2. Call `get_farm_dashboard(farm_id)` PostgreSQL function
3. Check Redis cache key `dashboard:{farm_id}` (TTL: 60 seconds)
4. If cache miss: run PostgreSQL function, store result in Redis
5. Return cached or freshly computed result

**DB Tables Touched:**
- READ: `public.farms`, `public.decision_signals`, `public.alerts`, `public.production_cycles`, `public.harvest_log`, `public.labor_attendance`, `public.field_inputs`, `public.task_queue`, `public.inventory`

**Materialized Views Refreshed:** None (Redis cached, not MV)

---

### GET /api/v1/farms/{farm_id}/stats

**Summary:** Farm statistics summary (aggregated totals, not dashboard signals).

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "farm_id": "F001",
    "total_harvests_kg_ytd": 1240.0,
    "total_revenue_fjd_ytd": 3472.00,
    "total_labor_cost_fjd_ytd": 1920.00,
    "total_input_cost_fjd_ytd": 292.00,
    "avg_cogk_fjd_ytd": 1.78,
    "completed_cycles_ytd": 3,
    "active_cycles": 2,
    "total_workers": 2,
    "total_pus": 7,
    "tis_calls_ytd": 142,
    "period": "2026-01-01 to 2026-04-07"
  }
}
```

**DB Tables Touched:**
- READ: `public.harvest_log`, `public.labor_attendance`, `public.field_inputs`, `public.production_cycles`, `public.workers`, `public.production_units`, `public.tis_conversations`

---

### GET /api/v1/farms/{farm_id}/expansion-readiness

**Summary:** 7-condition expansion readiness score. PREMIUM+ only.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** PREMIUM

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "farm_id": "F001",
    "overall_ready": false,
    "readiness_score": 5,
    "max_score": 7,
    "assessment_date": "2026-04-07",
    "conditions": [
      {"condition": "CoKG below market price on all active cycles", "met": true, "detail": "CoKG FJD 1.86/kg < market FJD 2.80/kg"},
      {"condition": "No open Critical alerts", "met": false, "detail": "1 Critical alert (RULE-038 Chemical Compliance)"},
      {"condition": "Gross margin > 30% on at least 1 cycle", "met": true, "detail": "CY-F001-26-002 at 34.2%"},
      {"condition": "Task completion rate > 80%", "met": false, "detail": "Current rate: 72.5%"},
      {"condition": "No rotation blocks on any PU", "met": true, "detail": "All PUs rotation-clear"},
      {"condition": "Harvest in last 14 days", "met": true, "detail": "Last harvest: 2026-04-05 (2 days ago)"},
      {"condition": "3 complete production cycles on record", "met": true, "detail": "3 completed cycles in system"}
    ],
    "recommendation": "Resolve the Chemical Compliance alert and improve task completion rate to reach expansion readiness."
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `TIER_REQUIRED` | 403 | Subscription tier below PREMIUM |
| `FARM_NOT_FOUND` | 404 | Farm does not exist |

**Business Logic Applied:**
1. Verify subscription tier is PREMIUM or CUSTOM
2. Evaluate all 7 conditions against live TFOS data
3. Compute readiness score (0–7)
4. Return condition-by-condition results with `met` flag and `detail` explanation

**DB Tables Touched:**
- READ: `public.production_cycles`, `public.alerts`, `public.decision_signals`, `public.harvest_log`, `public.task_queue`, `public.rotation_validation_log`

---

## PRODUCTION UNITS GROUP

---

### GET /api/v1/farms/{farm_id}/production-units

**Summary:** List all production units for a farm.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "pu_id": "F001-PU001",
      "pu_name": "Block A — Cassava",
      "area_acres": 1.5,
      "production_type_code": "CRP",
      "current_production_id": "CRP-CAS",
      "current_cycle_id": "CY-F001-26-001",
      "current_stage": "Establishment",
      "last_harvest_date": null,
      "open_alerts_count": 0
    },
    {
      "pu_id": "F001-PU002",
      "pu_name": "Block B — Eggplant",
      "area_acres": 1.2,
      "production_type_code": "CRP",
      "current_production_id": "CRP-EGG",
      "current_cycle_id": "CY-F001-26-002",
      "current_stage": "Fruiting",
      "last_harvest_date": "2026-04-05",
      "open_alerts_count": 1
    }
  ]
}
```

**DB Tables Touched:**
- READ: `public.production_units`, `public.production_cycles`, `public.alerts`

---

### POST /api/v1/farms/{farm_id}/production-units

**Summary:** Create a new production unit on a farm.

**Auth Required:** Bearer JWT, role=FOUNDER or MANAGER
**Subscription Tier Minimum:** FREE

**Request Body:**
```json
{
  "pu_name": "string (required)",
  "area_acres": "number (required, > 0)",
  "production_type_code": "string (required: CRP/LIV/FRT/AQU/PIG)",
  "gps_polygon": "GeoJSON (optional)",
  "notes": "string (optional)"
}
```

**Response Body (201 Created):**
```json
{
  "success": true,
  "data": {
    "pu_id": "F001-PU012",
    "pu_name": "Block D — New PU",
    "area_acres": 1.0,
    "farm_id": "F001",
    "created_at": "2026-04-07T09:00:00+12:00"
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `FORBIDDEN` | 403 | Role not FOUNDER or MANAGER |
| `PU_LIMIT_REACHED` | 422 | Tenant reached maximum PUs for tier |
| `DUPLICATE_PU_NAME` | 422 | PU name already exists on this farm |

**DB Tables Touched:**
- READ: `public.production_units` (uniqueness, count)
- WRITE: `public.production_units`, `public.audit_log`

---

## CYCLES GROUP

---

### POST /api/v1/production-units/{pu_id}/cycles

**Summary:** Create a new production cycle on a Production Unit.

**Auth Required:** Bearer JWT, role=FOUNDER or MANAGER
**Subscription Tier Minimum:** FREE

**Path Parameters:**
| Param | Type | Description |
|---|---|---|
| `pu_id` | string | Production unit ID (e.g., `F001-PU002`) |

**Request Body:**
```json
{
  "production_id": "string (required, e.g. 'CRP-EGG')",
  "planting_date": "date (required, ISO 8601 format: YYYY-MM-DD)",
  "area_acres": "number (optional, defaults to PU area)",
  "notes": "string (optional)"
}
```

**Response Body (201 Created — APPROVED):**
```json
{
  "success": true,
  "data": {
    "cycle_id": "CY-F001-26-003",
    "pu_id": "F001-PU002",
    "production_id": "CRP-LBN",
    "production_name": "Long Bean (Yardlong Bean)",
    "planting_date": "2026-04-08",
    "stage": "Establishment",
    "validation_result": {
      "allowed": true,
      "enforcement_decision": "APPROVED",
      "rule_status": "PREF"
    },
    "first_task": {
      "task_id": "TSK-20260408-001",
      "title": "Establishment check — CRP-LBN on F001-PU002",
      "due_date": "2026-04-15"
    },
    "stage_protocols": [
      {"stage": "Establishment", "duration_days": 14, "key_actions": ["Weekly watering", "Basal fertiliser application"]},
      {"stage": "Vegetative", "duration_days": 21, "key_actions": ["NPK application every 14 days", "Pest scouting"]},
      {"stage": "Fruiting", "duration_days": 30, "key_actions": ["Potassium top-up", "Harvest monitoring"]}
    ]
  }
}
```

**Error 409 (Rotation Blocked):**
```json
{
  "success": false,
  "error": {
    "code": "ROTATION_BLOCKED",
    "message": "Cannot plant CRP-EGG on F001-PU002. Same-family rotation block: 60 days required, only 20 days have passed.",
    "details": {
      "rotation_blocked": true,
      "rotation_validation": {
        "allowed": false,
        "enforcement_decision": "BLOCKED",
        "rule_status": "BLOCK",
        "min_rest_days": 60,
        "days_since_last_harvest": 20,
        "days_short": 40,
        "rotation_key": "CRP-EGG:CRP-EGG",
        "proposed_planting_date": "2026-04-08"
      },
      "alternatives": [
        {"production_id": "CRP-FRB", "production_name": "French Beans", "rule_status": "PREF", "min_rest_days": 0},
        {"production_id": "CRP-LBN", "production_name": "Long Bean (Yardlong Bean)", "rule_status": "PREF", "min_rest_days": 0},
        {"production_id": "CRP-SCN", "production_name": "Sweet Corn", "rule_status": "OK", "min_rest_days": 30}
      ]
    }
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `ROTATION_BLOCKED` | 409 | Rotation validation returned BLOCKED |
| `PU_NOT_FOUND` | 404 | `pu_id` does not exist |
| `PRODUCTION_NOT_FOUND` | 404 | `production_id` not in shared.productions |
| `ACTIVE_CYCLE_EXISTS` | 422 | PU already has an active cycle (must close it first) |
| `FORBIDDEN` | 403 | Role not FOUNDER or MANAGER |
| `VALIDATION_ERROR` | 422 | Missing or invalid fields |

**Business Logic Applied:**
1. Verify `pu_id` exists and belongs to user's tenant
2. Check no active cycle exists on this PU (`production_units.current_cycle_id IS NULL`)
3. Call `validate_rotation(pu_id, production_id, planting_date)` — FIRST CHECK
4. If `enforcement_decision == 'BLOCKED'`: return 409 with rotation details + alternatives
5. If `enforcement_decision == 'OVERRIDE_REQUIRED'` and role != FOUNDER: return 409 (soft block)
6. If `enforcement_decision == 'APPROVED'` or (FOUNDER overriding OVERRIDE_REQUIRED):
   - INSERT `production_cycles` record with sequential `cycle_id` (CY-{farm}-{YY}-{###})
   - UPDATE `production_units.current_cycle_id` = new cycle_id
   - Fetch stage protocols from `shared.stage_protocols` for this `production_id`
   - Create first scheduled task (establishment check) via task automation system
   - Log rotation decision to `public.rotation_validation_log`
7. Return created cycle with validation result, first task, and stage protocol overview

**DB Tables Touched:**
- READ: `public.production_units`, `shared.productions`, `shared.crop_rotation_rules`, `shared.stage_protocols`, `public.production_cycles`
- WRITE: `public.production_cycles`, `public.production_units` (current_cycle_id), `public.task_queue`, `public.rotation_validation_log`, `public.audit_log`

**Celery Tasks Queued:**
- `create_initial_cycle_tasks` — generates all scheduled tasks for the new cycle based on stage protocols

---

### GET /api/v1/production-units/{pu_id}/cycles

**Summary:** List all cycles (historical + active) for a production unit.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "cycle_id": "CY-F001-26-002",
      "production_id": "CRP-EGG",
      "production_name": "Eggplant",
      "planting_date": "2026-02-21",
      "status": "active",
      "current_stage": "Fruiting",
      "cogk_fjd": 1.86,
      "gross_margin_pct": 34.2,
      "total_harvest_qty_kg": 294.0,
      "days_active": 45
    },
    {
      "cycle_id": "CY-F001-25-002",
      "production_id": "CRP-EGG",
      "production_name": "Eggplant",
      "planting_date": "2025-08-01",
      "end_date": "2025-11-30",
      "status": "completed",
      "current_stage": null,
      "cogk_fjd": 2.14,
      "gross_margin_pct": 23.6,
      "total_harvest_qty_kg": 512.0,
      "days_active": 121
    }
  ]
}
```

**DB Tables Touched:**
- READ: `public.production_cycles`, `shared.productions`, `public.cycle_financials`

---

### GET /api/v1/cycles/{cycle_id}

**Summary:** Get full detail for a single production cycle.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "cycle_id": "CY-F001-26-002",
    "pu_id": "F001-PU002",
    "farm_id": "F001",
    "production_id": "CRP-EGG",
    "production_name": "Eggplant",
    "planting_date": "2026-02-21",
    "status": "active",
    "current_stage": "Fruiting",
    "area_acres": 1.2,
    "days_active": 45,
    "harvest_count": 3,
    "last_harvest_date": "2026-04-05",
    "open_tasks_count": 3,
    "open_alerts_count": 1,
    "cogk_fjd": 1.86,
    "notes": null,
    "created_at": "2026-02-21T08:00:00+12:00"
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `CYCLE_NOT_FOUND` | 404 | Cycle ID does not exist or no tenant access |

**DB Tables Touched:**
- READ: `public.production_cycles`, `shared.productions`, `public.harvest_log`, `public.task_queue`, `public.alerts`, `public.cycle_financials`

---

### GET /api/v1/cycles/{cycle_id}/financials

**Summary:** Cycle P&L with CoKG as the primary (first) field. CoKG = (LaborCost + InputCost + OtherCost) / TotalHarvestQty_kg.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "cogk_fjd": 1.86,
    "gross_margin_pct": 34.2,
    "total_revenue_fjd": 840.00,
    "total_cost_fjd": 553.00,
    "net_profit_fjd": 287.00,
    "total_harvest_qty_kg": 294.0,
    "total_labor_cost_fjd": 480.00,
    "total_input_cost_fjd": 73.00,
    "total_other_cost_fjd": 0.00,
    "cycle_id": "CY-F001-26-002",
    "pu_id": "F001-PU002",
    "production_id": "CRP-EGG",
    "production_name": "Eggplant",
    "period_start": "2026-02-21",
    "period_end": null,
    "harvest_breakdown": [
      {"harvest_date": "2026-03-15", "qty_kg": 82.0, "grade": "A", "unit_price_fjd": 2.80, "revenue_fjd": 229.60},
      {"harvest_date": "2026-03-29", "qty_kg": 110.0, "grade": "A", "unit_price_fjd": 2.80, "revenue_fjd": 308.00},
      {"harvest_date": "2026-04-05", "qty_kg": 102.0, "grade": "A", "unit_price_fjd": 2.96, "revenue_fjd": 302.40}
    ],
    "cogk_formula": "FJD 553.00 / 294.0 kg = FJD 1.86/kg",
    "market_price_fjd": 2.80,
    "margin_per_kg_fjd": 0.94,
    "computed_at": "2026-04-07T06:05:00+12:00"
  }
}
```

> **Note:** `cogk_fjd` MUST be the first field in the response object. This is a system requirement — CoKG is the primary financial metric for Teivaka TFOS.

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `CYCLE_NOT_FOUND` | 404 | Cycle does not exist |
| `NO_HARVEST_DATA` | 200 | Returns zeros (no harvests yet — CoKG = null) |

**Business Logic Applied:**
1. Aggregate all `harvest_log` records for this cycle
2. Aggregate all `labor_attendance` costs linked to cycle's `pu_id` during cycle period
3. Aggregate all `field_inputs` costs for this cycle
4. CoKG = (labor + inputs + other) / total_harvest_qty_kg
5. If `total_harvest_qty_kg == 0`: CoKG = null (not yet calculable)
6. `gross_margin_pct = (revenue - cost) / revenue × 100`

**DB Tables Touched:**
- READ: `public.production_cycles`, `public.harvest_log`, `public.labor_attendance`, `public.field_inputs`, `shared.market_prices`

---

### PUT /api/v1/cycles/{cycle_id}/close

**Summary:** Close an active production cycle.

**Auth Required:** Bearer JWT, role=FOUNDER or MANAGER
**Subscription Tier Minimum:** FREE

**Request Body:**
```json
{
  "end_date": "date (required)",
  "closure_reason": "string (optional: 'completed', 'failed', 'abandoned')",
  "final_notes": "string (optional)"
}
```

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "cycle_id": "CY-F001-26-002",
    "status": "completed",
    "end_date": "2026-05-15",
    "final_cogk_fjd": 1.86,
    "final_gross_margin_pct": 34.2
  }
}
```

**Business Logic Applied:**
1. UPDATE `production_cycles.status = 'completed'`, set `end_date`
2. SET `production_units.current_cycle_id = NULL`
3. Trigger final `cycle_financials` computation
4. Log to `public.audit_log`

**DB Tables Touched:**
- WRITE: `public.production_cycles`, `public.production_units`, `public.cycle_financials`, `public.audit_log`

---

### POST /api/v1/rotation/validate

**Summary:** Pre-validate crop rotation before cycle creation.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Request Body:**
```json
{
  "pu_id": "F001-PU002",
  "proposed_production_id": "CRP-EGG",
  "proposed_planting_date": "2026-04-08"
}
```

**Response Body (200 OK — BLOCKED example):**
```json
{
  "success": true,
  "data": {
    "allowed": false,
    "enforcement_decision": "BLOCKED",
    "rule_status": "BLOCK",
    "rotation_key": "CRP-EGG:CRP-EGG",
    "min_rest_days": 60,
    "days_since_last_harvest": 20,
    "days_short": 40,
    "last_production_id": "CRP-EGG",
    "last_cycle_end_date": "2026-03-18",
    "proposed_planting_date": "2026-04-08",
    "earliest_allowed_date": "2026-05-17",
    "alternatives": [
      {"production_id": "CRP-FRB", "production_name": "French Beans", "rule_status": "PREF", "min_rest_days": 0, "ready_now": true},
      {"production_id": "CRP-LBN", "production_name": "Long Bean (Yardlong Bean)", "rule_status": "PREF", "min_rest_days": 0, "ready_now": true},
      {"production_id": "CRP-SCN", "production_name": "Sweet Corn", "rule_status": "OK", "min_rest_days": 30, "ready_now": false, "ready_date": "2026-04-17"},
      {"production_id": "CRP-TOM", "production_name": "Tomato", "rule_status": "OK", "min_rest_days": 30, "ready_now": false, "ready_date": "2026-04-17"}
    ],
    "founder_can_override": true
  }
}
```

**Response Body (200 OK — APPROVED example):**
```json
{
  "success": true,
  "data": {
    "allowed": true,
    "enforcement_decision": "APPROVED",
    "rule_status": "PREF",
    "rotation_key": "CRP-EGG:CRP-LBN",
    "min_rest_days": 0,
    "days_since_last_harvest": 20,
    "alternatives": []
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `PU_NOT_FOUND` | 404 | `pu_id` does not exist |
| `PRODUCTION_NOT_FOUND` | 404 | `proposed_production_id` not found in shared.productions |
| `VALIDATION_ERROR` | 422 | Missing required fields |

**Business Logic Applied:**
1. Lookup last cycle on this PU (most recent `end_date` in `production_cycles`)
2. If no previous cycle: return `APPROVED` immediately
3. Lookup rotation rule from `shared.crop_rotation_rules` (key: `{last_production_id}:{proposed_production_id}`)
4. If rule not found: default to `OK`, 30 days rest
5. Calculate `days_since_last_harvest` from last cycle `end_date`
6. Evaluate: if `rule_status == 'BLOCK'` and `days_since_last_harvest < min_rest_days`: `BLOCKED`
7. If `rule_status == 'AVOID'` and insufficient rest: `OVERRIDE_REQUIRED`
8. If rest days met or `rule_status == 'OK'/'PREF'`: `APPROVED`
9. Fetch alternatives: all productions with `PREF`/`OK` rules that are currently allowed

**DB Tables Touched:**
- READ: `public.production_cycles`, `shared.crop_rotation_rules`, `shared.productions`

---

## HARVESTS GROUP

---

### POST /api/v1/production-units/{pu_id}/harvests

**Summary:** Log a harvest record with automatic chemical compliance check.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Request Body:**
```json
{
  "harvest_date": "2026-04-07",
  "qty_kg": 42.0,
  "grade": "A",
  "unit_price_fjd": 2.80,
  "customer_id": "CUS-001",
  "photo_url": "string (optional, Supabase Storage URL)",
  "notes": "string (optional)"
}
```

**Response Body (201 Created — COMPLIANT):**
```json
{
  "success": true,
  "data": {
    "harvest_id": "HRV-20260407-001",
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "pu_id": "F001-PU002",
    "cycle_id": "CY-F001-26-002",
    "qty_kg": 42.0,
    "grade": "A",
    "unit_price_fjd": 2.80,
    "total_value_fjd": 117.60,
    "harvest_date": "2026-04-07",
    "compliance_status": "COMPLIANT",
    "cogk_updated": true,
    "new_cogk_fjd": 1.82,
    "customer_id": "CUS-001"
  }
}
```

**Error 409 (Compliance Blocked):**
```json
{
  "success": false,
  "error": {
    "code": "COMPLIANCE_VIOLATION",
    "message": "Harvest blocked: Dimethoate 40% EC was applied 4 days ago. Withholding period: 7 days. Safe to harvest after 2026-04-10.",
    "details": {
      "compliance_blocked": true,
      "blocking_chemicals": [
        {
          "chemical_id": "CHEM-001",
          "chemical_name": "Dimethoate 40% EC",
          "application_date": "2026-04-03",
          "withholding_period_days": 7,
          "days_since_application": 4,
          "harvest_allowed_after": "2026-04-10"
        }
      ],
      "earliest_safe_harvest_date": "2026-04-10"
    }
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `COMPLIANCE_VIOLATION` | 409 | Chemical withholding period not met |
| `NO_ACTIVE_CYCLE` | 422 | PU has no active cycle to associate harvest with |
| `FUTURE_HARVEST_DATE` | 422 | `harvest_date` is in the future |
| `INVALID_GRADE` | 422 | Grade must be A, B, or C |
| `PU_NOT_FOUND` | 404 | PU does not exist |
| `VALIDATION_ERROR` | 422 | Missing required fields |

**Business Logic Applied:**
1. Verify `pu_id` exists; get active cycle (`current_cycle_id`)
2. Validate `harvest_date` is not in the future
3. Validate `grade` ∈ ['A', 'B', 'C'] (default: 'A' if not supplied)
4. Call `check_chemical_compliance(pu_id, harvest_date)`:
   - Query `public.chemical_applications` for this PU where `application_date + withholding_period_days > harvest_date`
   - If any records found: return BLOCKED (HTTP 409) with blocking chemicals + safe date
5. If compliant:
   - Generate `harvest_id`: `HRV-{YYYYMMDD}-{sequential_###}` (scoped to farm per day)
   - INSERT `public.harvest_log` record
   - UPDATE `public.cycle_financials`: recalculate CoKG
   - Check if RULE-017 (Harvest Gap Alert) can be auto-resolved → UPDATE `alerts` if so
   - Queue RULE-036 (Yield Loss Gap check) Celery task
6. Return created harvest with `new_cogk_fjd`

**DB Tables Touched:**
- READ: `public.production_units`, `public.production_cycles`, `public.chemical_applications`, `shared.chemicals`
- WRITE: `public.harvest_log`, `public.cycle_financials`, `public.alerts` (auto-resolve RULE-017)

**Celery Tasks Queued:**
- `check_yield_loss_gap` — evaluates RULE-036 (significant drop in harvest weight vs previous)

---

### GET /api/v1/production-units/{pu_id}/harvests

**Summary:** List harvest records for a production unit.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `cycle_id` | string | Filter by cycle (optional) |
| `from_date` | date | Start of date range (optional) |
| `to_date` | date | End of date range (optional) |
| `page` | int | Page number |
| `page_size` | int | Results per page |

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "harvest_id": "HRV-20260405-001",
      "qty_kg": 102.0,
      "grade": "A",
      "unit_price_fjd": 2.96,
      "total_value_fjd": 301.92,
      "harvest_date": "2026-04-05",
      "compliance_status": "COMPLIANT",
      "customer_id": "CUS-001"
    }
  ],
  "meta": {"total": 3, "page": 1, "page_size": 20, "total_pages": 1}
}
```

**DB Tables Touched:**
- READ: `public.harvest_log`

---

## LABOR GROUP

---

### POST /api/v1/production-units/{pu_id}/labor

**Summary:** Log labor attendance for a production unit.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Request Body:**
```json
{
  "worker_id": "W-001",
  "work_date": "2026-04-07",
  "hours_worked": 8,
  "task_description": "string (optional, e.g. 'weeding', 'spraying', 'harvesting')",
  "notes": "string (optional)"
}
```

**Response Body (201 Created):**
```json
{
  "success": true,
  "data": {
    "labor_id": "LAB-20260407-001",
    "id": "uuid",
    "worker_id": "W-001",
    "worker_name": "Laisenia Waqa",
    "pu_id": "F001-PU002",
    "cycle_id": "CY-F001-26-002",
    "work_date": "2026-04-07",
    "hours_worked": 8,
    "hourly_rate_fjd": 6.00,
    "total_cost_fjd": 48.00,
    "task_description": "weeding"
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `WORKER_NOT_FOUND` | 404 | `worker_id` does not exist for this farm |
| `DUPLICATE_LABOR_RECORD` | 422 | Labor record already exists for this worker + PU + date |
| `HOURS_OUT_OF_RANGE` | 422 | `hours_worked` must be 0.5–12 |

**Business Logic Applied:**
1. Verify `worker_id` is registered to this farm
2. Default `hours_worked = 8` if not provided
3. Fetch worker's `daily_rate_fjd`; compute `hourly_rate = daily_rate / 8`
4. `total_cost_fjd = hourly_rate × hours_worked`
5. Generate `labor_id`: `LAB-{YYYYMMDD}-{sequential_###}`
6. INSERT `public.labor_attendance`
7. Trigger `cycle_financials` recalculation (CoKG update)

**DB Tables Touched:**
- READ: `public.workers`, `public.production_units`, `public.production_cycles`
- WRITE: `public.labor_attendance`, `public.cycle_financials`

---

### GET /api/v1/farms/{farm_id}/labor

**Summary:** List labor records for a farm with optional filters.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Query Parameters:** `worker_id`, `pu_id`, `from_date`, `to_date`, `page`, `page_size`

**DB Tables Touched:**
- READ: `public.labor_attendance`, `public.workers`

---

## INPUTS / CHEMICALS GROUP

---

### POST /api/v1/production-units/{pu_id}/inputs

**Summary:** Log a field input application (fertiliser, chemical, seed).

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Request Body:**
```json
{
  "input_date": "2026-04-03",
  "input_type": "CHEMICAL",
  "chemical_id": "CHEM-001",
  "quantity_applied": 1.5,
  "unit": "L",
  "cost_fjd": 45.00,
  "application_method": "string (optional: 'foliar', 'soil', 'drench')",
  "notes": "string (optional)"
}
```

**Response Body (201 Created):**
```json
{
  "success": true,
  "data": {
    "input_id": "INP-20260403-001",
    "id": "uuid",
    "pu_id": "F001-PU002",
    "input_type": "CHEMICAL",
    "chemical_id": "CHEM-001",
    "chemical_name": "Dimethoate 40% EC",
    "quantity_applied": 1.5,
    "unit": "L",
    "cost_fjd": 45.00,
    "input_date": "2026-04-03",
    "withholding_period_days": 7,
    "safe_harvest_date": "2026-04-10",
    "compliance_alert_created": true,
    "alert_id": "ALT-20260403-001"
  }
}
```

**Business Logic Applied:**
1. If `input_type == 'CHEMICAL'`: lookup `chemical_id` in `shared.chemicals`
2. INSERT `public.field_inputs`
3. If chemical has `withholding_period_days > 0`:
   - INSERT `public.chemical_applications` record
   - CREATE Alert RULE-038 (Chemical Compliance Block) for this PU with safe harvest date
   - Alert severity = Critical
4. Decrement `public.inventory` stock for this chemical/input
5. If stock below `reorder_point`: queue `check_inventory_reorder` Celery task
6. UPDATE `cycle_financials` (input cost added, CoKG recalculated)

**DB Tables Touched:**
- READ: `shared.chemicals`, `public.production_units`, `public.production_cycles`
- WRITE: `public.field_inputs`, `public.chemical_applications`, `public.alerts`, `public.inventory`, `public.cycle_financials`

**Celery Tasks Queued:**
- `check_inventory_reorder` — if stock drops below reorder point

---

### GET /api/v1/farms/{farm_id}/inventory

**Summary:** Current input inventory for a farm.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "inventory_id": "uuid",
      "input_name": "Dimethoate 40% EC",
      "chemical_id": "CHEM-001",
      "current_stock": 2.5,
      "unit": "L",
      "reorder_point": 5.0,
      "below_reorder": true,
      "estimated_days_remaining": 14,
      "last_used_date": "2026-04-03",
      "cost_per_unit_fjd": 30.00
    },
    {
      "inventory_id": "uuid",
      "input_name": "Mancozeb 80% WP",
      "chemical_id": "CHEM-002",
      "current_stock": 8.0,
      "unit": "kg",
      "reorder_point": 3.0,
      "below_reorder": false,
      "estimated_days_remaining": 56
    }
  ]
}
```

**DB Tables Touched:**
- READ: `public.inventory`, `shared.chemicals`

---

## ALERTS GROUP

---

### GET /api/v1/farms/{farm_id}/alerts

**Summary:** List all open alerts for a farm.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `severity` | string | Filter: `Critical`, `High`, `Medium`, `Low` |
| `status` | string | Filter: `open`, `acknowledged`, `resolved` (default: `open`) |
| `pu_id` | string | Filter by production unit |
| `page` | int | Page number |

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "alert_id": "ALT-20260403-001",
      "rule_id": "RULE-038",
      "title": "Chemical Compliance Block",
      "description": "Dimethoate (CHEM-001) applied 4 days ago. Safe to harvest after 2026-04-10.",
      "severity": "Critical",
      "rag_color": "RED",
      "status": "open",
      "pu_id": "F001-PU002",
      "cycle_id": "CY-F001-26-002",
      "created_at": "2026-04-03T08:00:00+12:00",
      "acknowledged_at": null,
      "resolved_at": null
    }
  ],
  "meta": {"total": 1, "page": 1, "page_size": 20, "total_pages": 1}
}
```

**DB Tables Touched:**
- READ: `public.alerts`, `public.automation_rules`

---

### PUT /api/v1/alerts/{alert_id}/acknowledge

**Summary:** Acknowledge an open alert.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "alert_id": "ALT-20260403-001",
    "status": "acknowledged",
    "acknowledged_at": "2026-04-07T09:30:00+12:00",
    "acknowledged_by": "USR-001"
  }
}
```

**DB Tables Touched:**
- WRITE: `public.alerts` (status, acknowledged_at, acknowledged_by)

---

### PUT /api/v1/alerts/{alert_id}/resolve

**Summary:** Manually resolve an alert.

**Auth Required:** Bearer JWT, role=FOUNDER or MANAGER
**Subscription Tier Minimum:** FREE

**Request Body:**
```json
{
  "resolution_notes": "string (optional)"
}
```

**DB Tables Touched:**
- WRITE: `public.alerts` (status, resolved_at, resolved_by, resolution_notes)

---

## TASKS GROUP

---

### GET /api/v1/farms/{farm_id}/tasks

**Summary:** List all tasks for a farm.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `status` | string | `open`, `completed`, `overdue` (default: `open`) |
| `pu_id` | string | Filter by PU |
| `priority` | string | `HIGH`, `MEDIUM`, `LOW` |
| `from_date` | date | Due date range start |
| `to_date` | date | Due date range end |

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "task_id": "TSK-20260331-001",
      "title": "Apply NPK fertiliser — F001-PU002 (Fruiting stage)",
      "description": "Apply NPK (12-12-17) at 150 kg/ha. Eggplant Fruiting stage protocol.",
      "due_date": "2026-03-31",
      "status": "open",
      "is_overdue": true,
      "days_overdue": 7,
      "priority": "HIGH",
      "pu_id": "F001-PU002",
      "cycle_id": "CY-F001-26-002",
      "rule_id": "RULE-005",
      "assigned_to": "W-001",
      "created_at": "2026-03-24T06:05:00+12:00"
    }
  ],
  "meta": {"total": 5, "open": 5, "overdue": 2, "due_today": 1}
}
```

**DB Tables Touched:**
- READ: `public.task_queue`

---

### PUT /api/v1/tasks/{task_id}/complete

**Summary:** Mark a task as completed.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Request Body:**
```json
{
  "completion_notes": "string (optional)",
  "completed_date": "date (optional, defaults to today)"
}
```

**DB Tables Touched:**
- WRITE: `public.task_queue` (status, completed_at, completed_by, completion_notes)

---

## WORKERS GROUP

---

### GET /api/v1/farms/{farm_id}/workers

**Summary:** List workers for a farm.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "worker_id": "W-001",
      "name": "Laisenia Waqa",
      "role": "Field Worker",
      "daily_rate_fjd": 48.00,
      "phone": "+6799XXXXXXX",
      "status": "active",
      "total_days_ytd": 85,
      "total_cost_fjd_ytd": 4080.00
    },
    {
      "worker_id": "W-002",
      "name": "Maika Ratubaba",
      "role": "Field Worker",
      "daily_rate_fjd": 48.00,
      "phone": "+6799XXXXXXX",
      "status": "active",
      "total_days_ytd": 72,
      "total_cost_fjd_ytd": 3456.00
    }
  ]
}
```

**DB Tables Touched:**
- READ: `public.workers`, `public.labor_attendance`

---

### POST /api/v1/farms/{farm_id}/workers

**Summary:** Add a worker to a farm.

**Auth Required:** Bearer JWT, role=FOUNDER or MANAGER
**Subscription Tier Minimum:** FREE

**Request Body:**
```json
{
  "name": "string (required)",
  "role": "string (default: 'Field Worker')",
  "daily_rate_fjd": "number (default: 48.00)",
  "phone": "string (optional)",
  "start_date": "date (optional, defaults to today)"
}
```

**DB Tables Touched:**
- WRITE: `public.workers`, `public.audit_log`

---

## TIS GROUP (Teivaka Intelligence System)

---

### POST /api/v1/tis/chat

**Summary:** Send text message to TIS. Routes to Knowledge Broker, Operational Interpreter, or Command Executor.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:**
- FREE: 5 calls/day
- BASIC: 20 calls/day
- PREMIUM / CUSTOM: unlimited

**Request Body:**
```json
{
  "message": "string (required, max 1000 chars)",
  "farm_id": "string (required)",
  "pu_id": "string (optional — adds PU context to routing)",
  "conversation_id": "UUID (optional — continues existing conversation)"
}
```

**Examples:**
```json
// Knowledge Broker query
{"message": "When should I fertilize my eggplant in the vegetative stage?", "farm_id": "F001"}

// Operational Interpreter query
{"message": "Explain why my CoKG is so high on PU002", "farm_id": "F001", "pu_id": "F001-PU002"}

// Command Executor command
{"message": "Log harvest of 42kg eggplant Grade A on PU002 today", "farm_id": "F001"}
```

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "response_text": "During the Vegetative Growth stage of Eggplant (CRP-EGG), apply NPK (12-12-17) at 150 kg/ha every 14 days. [Source: Teivaka KB — Eggplant Vegetative Stage Protocol]",
    "tis_module": "knowledge_broker",
    "kb_articles_cited": ["KB-001 — Eggplant Vegetative Stage Protocol"],
    "command_result": null,
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
    "daily_calls_remaining": 19,
    "processing_time_ms": 1240
  }
}
```

**Command Executor Response Example:**
```json
{
  "success": true,
  "data": {
    "response_text": "Harvest logged: 42kg Eggplant Grade A on F001-PU002. ID: HRV-20260407-001. CoKG updated to FJD 1.82/kg.",
    "tis_module": "command_executor",
    "kb_articles_cited": [],
    "command_result": {
      "command_type": "LOG_HARVEST",
      "harvest_id": "HRV-20260407-001",
      "qty_kg": 42.0,
      "grade": "A",
      "new_cogk_fjd": 1.82,
      "compliance_status": "COMPLIANT"
    },
    "conversation_id": "550e8400-e29b-41d4-a716-446655440000",
    "daily_calls_remaining": 18
  }
}
```

**Error 429 (Rate Limit):**
```json
{
  "success": false,
  "error": {
    "code": "TIS_RATE_LIMIT",
    "message": "Daily TIS limit reached (5/5). Upgrade to BASIC for 20 queries/day.",
    "details": {
      "calls_used": 5,
      "calls_limit": 5,
      "tier": "FREE",
      "resets_at": "2026-04-08T00:00:00+12:00"
    }
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `TIS_RATE_LIMIT` | 429 | Daily TIS call limit reached for tier |
| `FARM_NOT_FOUND` | 404 | `farm_id` not found or no access |
| `MESSAGE_TOO_LONG` | 422 | `message` exceeds 1000 characters |
| `KNOWLEDGE_NOT_FOUND` | 200 | KB below threshold — returns standard not-found message |
| `COMMAND_FAILED` | 200 | Command executed but encountered business rule block |

**Business Logic Applied:**
1. Check Redis rate limit: `tis:calls:{user_id}:{YYYY-MM-DD}` vs tier limit
2. If limit reached: return 429
3. Route message to TIS module:
   - **Command Executor**: message contains command verb (harvest, log, check tasks, check alerts, check financials, create cycle)
   - **Operational Interpreter**: message asks about farm data (why, explain, what is my, how is my)
   - **Knowledge Broker**: general agronomy questions (when, how do I, what should I do)
4. Increment Redis counter; set TTL=86400 if new key
5. If Command Executor: parse intent + entities, execute TFOS API action
6. If Operational Interpreter: build `farm_context_snapshot` from TFOS data, call Claude API with context
7. If Knowledge Broker: embed query, vector search `shared.kb_articles`, if similarity < 0.65 → return not-found, else call Claude with top 3 articles
8. Save conversation to `public.tis_conversations`
9. Return response with `daily_calls_remaining`

**DB Tables Touched:**
- READ: `public.farm_access`, `shared.kb_articles` (vector search), `public.production_cycles`, `public.alerts`, `public.harvest_log` (for context)
- WRITE: `public.tis_conversations`, `public.tis_usage_log` + various tables depending on command executed

**Celery Tasks Queued:** None (synchronous pipeline)

---

### POST /api/v1/tis/command (Voice)

**Summary:** Submit audio voice command to TIS. Returns immediately; use polling endpoint for result.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE (counts toward daily TIS limit)

**Request Body (multipart/form-data):**
```
audio: <binary file> (required, webm or mp4, max 10MB)
farm_id: string (required)
pu_id: string (optional)
```

**Response Body (202 Accepted):**
```json
{
  "success": true,
  "data": {
    "voice_log_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "processing",
    "check_status_url": "/api/v1/tis/voice-status/550e8400-e29b-41d4-a716-446655440000",
    "estimated_seconds": 5
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `FILE_TOO_LARGE` | 422 | Audio file exceeds 10MB limit |
| `UNSUPPORTED_FORMAT` | 422 | Audio file format not supported |
| `TIS_RATE_LIMIT` | 429 | Daily TIS limit reached |

**Business Logic Applied:**
1. Validate audio file format and size
2. Check Redis rate limit (same pool as `/tis/chat`)
3. Upload audio to Supabase Storage: `voice/{farm_id}/{YYYYMMDD}/{uuid}.webm`
4. INSERT `public.tis_voice_logs` record (`status='processing'`, `audio_url` populated)
5. Queue `process_voice_command` Celery task with `voice_log_id`
6. Return `voice_log_id` for polling

**DB Tables Touched:**
- WRITE: `public.tis_voice_logs`

**Celery Tasks Queued:**
- `process_voice_command(voice_log_id)`:
  1. Download audio from Supabase
  2. Call Whisper API (`model='whisper-1'`, `language='en'`, ag-vocab prompt)
  3. Store transcript in `tis_voice_logs.whisper_transcript`
  4. Route transcript through TIS chat pipeline (same as `/tis/chat`)
  5. UPDATE `tis_voice_logs` with `status='completed'`, `response_text`, `command_type`
  6. Send WhatsApp response if request came from WhatsApp webhook

---

### GET /api/v1/tis/voice-status/{voice_log_id}

**Summary:** Poll for voice command processing result.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Response Body (200 OK — processing):**
```json
{
  "success": true,
  "data": {
    "voice_log_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "processing",
    "whisper_transcript": null,
    "response_text": null,
    "command_type": null,
    "error": null
  }
}
```

**Response Body (200 OK — completed):**
```json
{
  "success": true,
  "data": {
    "voice_log_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "whisper_transcript": "Harvested 42 kilograms eggplant Grade A on PU002",
    "response_text": "Harvest logged: 42kg Eggplant Grade A on F001-PU002. ID: HRV-20260407-001. CoKG: FJD 1.82/kg.",
    "command_type": "LOG_HARVEST",
    "tis_module": "command_executor",
    "error": null,
    "processing_time_ms": 3240
  }
}
```

**Response Body (200 OK — failed):**
```json
{
  "success": true,
  "data": {
    "voice_log_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "failed",
    "whisper_transcript": "",
    "response_text": "Could not understand audio. Please try again or type your message.",
    "command_type": null,
    "error": "EMPTY_TRANSCRIPT"
  }
}
```

**DB Tables Touched:**
- READ: `public.tis_voice_logs`

---

### GET /api/v1/tis/conversations

**Summary:** List TIS conversation history for authenticated user.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Query Parameters:** `farm_id`, `from_date`, `to_date`, `tis_module`, `page`, `page_size`

**DB Tables Touched:**
- READ: `public.tis_conversations`

---

## DECISION ENGINE GROUP

---

### GET /api/v1/farms/{farm_id}/decision-engine/current

**Summary:** Returns most recent Decision Engine snapshot (10 signals, GREEN/AMBER/RED).

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** BASIC

> **Important:** Signals are computed daily at 06:05 Fiji time by Celery beat task `compute_decision_signals`. They are NEVER computed on-demand. Always returned from stored snapshot.

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "farm_id": "F001",
    "snapshot_date": "2026-04-07",
    "overall_rag": "AMBER",
    "overall_score": 62,
    "signals": [
      {"signal_id": 1, "signal_name": "GrossMarginPct", "label": "Gross Margin %", "rag_status": "AMBER", "score_0_10": 6, "value": 34.2, "threshold_green": 40.0, "threshold_amber": 25.0, "action_at_red": "Review input costs and pricing strategy"},
      {"signal_id": 2, "signal_name": "CoKGVsMarket", "label": "CoKG vs Market Price", "rag_status": "GREEN", "score_0_10": 8, "value": 1.86, "market_price": 2.80, "action_at_red": "Reduce labor or input costs immediately"},
      {"signal_id": 3, "signal_name": "DaysSinceLastHarvest", "label": "Days Since Last Harvest", "rag_status": "GREEN", "score_0_10": 9, "value": 2, "threshold_amber": 14, "threshold_red": 21},
      {"signal_id": 4, "signal_name": "TaskCompletionRate", "label": "Task Completion Rate %", "rag_status": "AMBER", "score_0_10": 5, "value": 72.5, "threshold_green": 85.0, "threshold_amber": 70.0},
      {"signal_id": 5, "signal_name": "ChemicalComplianceBlocks", "label": "Chemical Compliance Blocks", "rag_status": "RED", "score_0_10": 0, "value": 1, "action_at_red": "Resolve all compliance blocks before harvesting"},
      {"signal_id": 6, "signal_name": "InputCostRatio", "label": "Input Cost % of Revenue", "rag_status": "GREEN", "score_0_10": 8, "value": 13.2, "threshold_amber": 20.0, "threshold_red": 30.0},
      {"signal_id": 7, "signal_name": "LaborCostRatio", "label": "Labor Cost % of Revenue", "rag_status": "AMBER", "score_0_10": 5, "value": 57.1, "threshold_green": 45.0, "threshold_amber": 60.0},
      {"signal_id": 8, "signal_name": "RotationHealth", "label": "Crop Rotation Health", "rag_status": "GREEN", "score_0_10": 10, "value": 1.0, "action_at_red": "Diversify crop rotation on affected PUs"},
      {"signal_id": 9, "signal_name": "HarvestWeightTrend", "label": "Harvest Weight Trend %", "rag_status": "AMBER", "score_0_10": 4, "value": -5.2, "action_at_red": "Investigate yield decline — check soil, pests, inputs"},
      {"signal_id": 10, "signal_name": "CycleAgeHealth", "label": "Active Cycle Age (days)", "rag_status": "GREEN", "score_0_10": 7, "value": 45}
    ],
    "computed_at": "2026-04-07T06:05:00+12:00",
    "next_computation": "2026-04-08T06:05:00+12:00"
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `TIER_REQUIRED` | 403 | Subscription tier below BASIC |
| `NO_SNAPSHOT_AVAILABLE` | 404 | No snapshot computed yet (new farm) |

**DB Tables Touched:**
- READ: `public.decision_signals`

---

## AUTOMATION GROUP

---

### GET /api/v1/automation/rules

**Summary:** List all 43 automation rules.

**Auth Required:** Bearer JWT, role=FOUNDER or MANAGER
**Subscription Tier Minimum:** FREE

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "rule_id": "RULE-001",
      "name": "Planting Task Scheduler",
      "description": "Creates first-week establishment tasks upon cycle creation",
      "trigger_category": "CYCLE_EVENT",
      "is_active": true,
      "severity": "Medium",
      "task_type": "ESTABLISHMENT_CHECK",
      "frequency_days": null,
      "applies_to": ["CRP", "FRT"]
    },
    {
      "rule_id": "RULE-038",
      "name": "Chemical Compliance Block Alert",
      "description": "Creates Critical alert when chemical is within withholding period",
      "trigger_category": "INPUT_EVENT",
      "is_active": true,
      "severity": "Critical",
      "task_type": null,
      "frequency_days": null,
      "applies_to": ["CRP", "LIV", "FRT"]
    },
    {
      "rule_id": "RULE-024",
      "name": "Pond Water Quality Check",
      "description": "Aquaculture pond DO and pH check (INACTIVE — pending aquaculture rollout)",
      "trigger_category": "SCHEDULED",
      "is_active": false,
      "severity": "High",
      "task_type": "WATER_QUALITY_CHECK",
      "frequency_days": 3,
      "applies_to": ["AQU"]
    }
  ],
  "meta": {"total": 43, "active": 38, "inactive": 5}
}
```

**DB Tables Touched:**
- READ: `public.automation_rules`

---

### POST /api/v1/automation/rules/{rule_id}/trigger-manual

**Summary:** Manually trigger a specific automation rule for a farm. For testing and override.

**Auth Required:** Bearer JWT, role=FOUNDER or MANAGER
**Subscription Tier Minimum:** PREMIUM

**Request Body:**
```json
{
  "farm_id": "F001",
  "pu_id": "F001-PU002",
  "reason": "string (required — why manual trigger was needed)"
}
```

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "rule_id": "RULE-038",
    "triggered_at": "2026-04-07T10:00:00+12:00",
    "tasks_created": 0,
    "alerts_created": 1,
    "alert_ids": ["ALT-20260407-002"]
  }
}
```

**Error Codes:**
| Code | HTTP | Description |
|---|---|---|
| `RULE_NOT_FOUND` | 404 | Rule ID does not exist |
| `TIER_REQUIRED` | 403 | Subscription below PREMIUM |
| `RULE_INACTIVE` | 422 | Rule is currently inactive (cannot manually trigger) |

**Business Logic Applied:**
1. Verify rule exists and is active
2. Queue `run_rule_for_farm` Celery task with `rule_id`, `farm_id`, `pu_id`
3. Return task/alert count created

**DB Tables Touched:**
- READ: `public.automation_rules`
- WRITE: `public.task_queue` (if tasks created), `public.alerts` (if alerts created), `public.audit_log`

**Celery Tasks Queued:**
- `run_rule_for_farm(rule_id, farm_id, pu_id, triggered_by_user=True)`

---

### PUT /api/v1/automation/rules/{rule_id}/toggle

**Summary:** Toggle rule `is_active` state. FOUNDER only.

**Auth Required:** Bearer JWT, role=FOUNDER
**Subscription Tier Minimum:** FREE

**Request Body:**
```json
{
  "is_active": true,
  "reason": "string (optional)"
}
```

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": {
    "rule_id": "RULE-024",
    "is_active": true,
    "updated_at": "2026-04-07T10:00:00+12:00",
    "note": "RULE-024 (Aquaculture) activated. Ensure aquaculture PUs are configured."
  }
}
```

**Business Logic Applied:**
1. Verify role == FOUNDER
2. UPDATE `public.automation_rules.is_active`
3. If activating RULE-024 to RULE-028 (aquaculture/pig series): return advisory note
4. Log to `public.audit_log`

**DB Tables Touched:**
- WRITE: `public.automation_rules`, `public.audit_log`

---

## WEBHOOKS GROUP

---

### POST /api/v1/webhooks/whatsapp

**Summary:** Twilio WhatsApp inbound message webhook. Receives farmer messages, routes through TIS, sends reply.

**Auth Required:** None (public endpoint, secured by Twilio signature verification)
**Subscription Tier Minimum:** N/A

**Headers Required:**
```
X-Twilio-Signature: <HMAC-SHA1 signature from Twilio>
Content-Type: application/x-www-form-urlencoded
```

**Request Body (form-encoded, from Twilio):**
```
From=whatsapp:+6799XXXXXXX
To=whatsapp:+18055551234
Body=Harvested 42 kilograms eggplant Grade A on PU002
MessageSid=SMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NumMedia=0
```

**Response Body (200 OK — empty TwiML or TIS response sent via Twilio API):**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>
```

> TIS response is sent back to the farmer via `twilio.messages.create()` API call (not in HTTP response body).

**Error Handling:**
- Invalid Twilio signature: return 403 (do not process)
- User not found by phone number: send WhatsApp reply "Unauthorized. Please contact your Teivaka administrator."
- TIS rate limit reached: send WhatsApp reply "Daily TIS limit reached. Upgrade your plan at teivaka.com."

**Business Logic Applied:**
1. Validate `X-Twilio-Signature` against `TWILIO_AUTH_TOKEN` using Twilio SDK `validate_signature()`
2. Extract `From` (farmer's WhatsApp number) and `Body` (message text)
3. Normalize phone: strip `whatsapp:` prefix, normalize E.164 format
4. Lookup user in `public.workers` and `public.users` by phone number
5. If not found: send "Unauthorized" via Twilio API, return 200
6. If found: identify associated `farm_id` and `user_id`
7. Route `Body` text through TIS `/chat` pipeline (same logic as POST /tis/chat)
8. Send TIS response text back via `twilio.messages.create(to=From, from_=TWILIO_NUMBER, body=response_text)`
9. Log interaction to `public.tis_conversations` with `channel='whatsapp'`
10. Rate limit: 80 inbound messages/minute per Twilio account limit

**Rate Limit:** 80 messages/minute (Twilio platform limit, not application-enforced)

**DB Tables Touched:**
- READ: `public.workers`, `public.users`, `public.farm_access`
- WRITE: `public.tis_conversations`, `public.tis_usage_log` + all tables touched by TIS command executed

**Celery Tasks Queued:** None (synchronous for <5s voice pipeline requirement)

---

## KNOWLEDGE BASE GROUP

---

### GET /api/v1/kb/articles

**Summary:** List published KB articles.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Query Parameters:** `production_id`, `stage`, `search`, `page`, `page_size`

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "article_id": "KB-001",
      "title": "Eggplant Vegetative Stage Protocol",
      "production_id": "CRP-EGG",
      "stage": "Vegetative",
      "summary": "NPK application schedule and pest management for eggplant vegetative stage.",
      "published": true,
      "created_at": "2026-01-15T09:00:00+12:00"
    }
  ]
}
```

**DB Tables Touched:**
- READ: `shared.kb_articles`

---

### POST /api/v1/kb/articles

**Summary:** Create and publish a new KB article. FOUNDER or AGRONOMIST role only.

**Auth Required:** Bearer JWT, role=FOUNDER or AGRONOMIST
**Subscription Tier Minimum:** PREMIUM

**Request Body:**
```json
{
  "title": "string (required)",
  "content": "string (required, full protocol text)",
  "production_id": "string (required, e.g. 'CRP-EGG')",
  "stage": "string (optional)",
  "publish": true
}
```

**Business Logic Applied:**
1. INSERT `shared.kb_articles` with `published=false`
2. If `publish=true`: call OpenAI embeddings API to generate `embedding_vector` (1536-dim)
3. UPDATE `published=true`, store `embedding_vector`
4. Log to `public.audit_log`

**DB Tables Touched:**
- WRITE: `shared.kb_articles`, `public.audit_log`

---

## SHARED REFERENCE DATA

---

### GET /api/v1/shared/productions

**Summary:** List all production types (crops, livestock, etc.) from shared reference data.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": [
    {"production_id": "CRP-EGG", "production_name": "Eggplant", "type": "CRP", "avg_cycle_days": 120, "typical_stages": ["Establishment", "Vegetative", "Fruiting"]},
    {"production_id": "CRP-CAS", "production_name": "Cassava", "type": "CRP", "avg_cycle_days": 300, "typical_stages": ["Establishment", "Vegetative", "Tuber Bulking", "Maturation"]},
    {"production_id": "CRP-KAV", "production_name": "Kava", "type": "CRP", "avg_cycle_days": 1095, "typical_stages": ["Establishment", "Juvenile", "Mature"]},
    {"production_id": "CRP-TOM", "production_name": "Tomato", "type": "CRP", "avg_cycle_days": 90},
    {"production_id": "FRT-PIN", "production_name": "Pineapple", "type": "FRT", "avg_cycle_days": 540},
    {"production_id": "LIV-API", "production_name": "Apiculture (Honey Bee)", "type": "LIV", "avg_cycle_days": null}
  ]
}
```

**DB Tables Touched:**
- READ: `shared.productions`

---

### GET /api/v1/shared/chemicals

**Summary:** List all registered chemicals with withholding periods.

**Auth Required:** Bearer JWT (any role)
**Subscription Tier Minimum:** FREE

**Response Body (200 OK):**
```json
{
  "success": true,
  "data": [
    {"chemical_id": "CHEM-001", "chemical_name": "Dimethoate 40% EC", "active_ingredient": "Dimethoate", "withholding_period_days": 7, "type": "Insecticide", "registered_fiji": true},
    {"chemical_id": "CHEM-002", "chemical_name": "Mancozeb 80% WP", "active_ingredient": "Mancozeb", "withholding_period_days": 7, "type": "Fungicide", "registered_fiji": true}
  ]
}
```

**DB Tables Touched:**
- READ: `shared.chemicals`

---

*End of Teivaka TFOS API Endpoint Specification*
*Version: 1.0.0 | Last Updated: 2026-04-07 | Platform: Teivaka PTE LTD, Fiji*
