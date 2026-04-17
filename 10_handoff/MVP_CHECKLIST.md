# FILE: 10_handoff/MVP_CHECKLIST.md

# Teivaka TFOS — MVP Acceptance Checklist
**MVP Definition:** Phase 1 MVP is complete when Cody (Uraia Koroi Kama) can use the system for F001 and F002 daily farm operations from a mobile browser, with voice commands working for key logging tasks.
**Test environment:** Production server (teivaka-prod-01, Hetzner CAX21)
**Test device:** Cody's phone (mobile browser, real WhatsApp number)
**Last Updated:** 2026-04-07

---

## How to Use This Checklist

Each MVP feature has:
- **User Story:** The real-world scenario being tested (written as the actual user, not an abstract persona)
- **Acceptance Criteria:** Specific, testable conditions that must be TRUE for the feature to pass
- **Endpoints Required:** The API endpoints this feature exercises
- **Tables Touched:** Which database tables are read or written
- **Complexity:** S (Small: < 1 day), M (Medium: 1–3 days), L (Large: 3–5 days), XL (Extra Large: 5–10 days)
- **Phase:** P1 = must be in MVP, P2/P3 = post-MVP

Mark each acceptance criterion as PASS or FAIL after testing. MVP is only complete when all criteria across all 10 features show PASS.

---

## MVP Feature 1: Login from Mobile Browser in the Field

**User Story:**
As Cody (Uraia Koroi Kama), I can open a browser on my phone while standing in a cassava plot at Save-A-Lot Farm and log in to the Teivaka dashboard with my email and password.

**Acceptance Criteria:**

| # | Criterion | Expected Result | Status |
|---|-----------|----------------|--------|
| 1.1 | POST /api/v1/auth/login with valid credentials returns HTTP 200 | Response body contains `access_token`, `token_type: "bearer"`, and `user` object | PASS/FAIL |
| 1.2 | JWT contains correct user_id, tenant_id, and role fields | Decode JWT — payload shows `role: "FOUNDER"` for Cody | PASS/FAIL |
| 1.3 | Invalid credentials return HTTP 401 | Body: `{"detail": "Incorrect email or password"}` — no stack trace exposed | PASS/FAIL |
| 1.4 | GET /api/v1/auth/me with valid JWT returns user profile | Returns `{user_id, email, full_name, role: "FOUNDER", tenant_id}` | PASS/FAIL |
| 1.5 | Login page loads on mobile browser (375px viewport) in under 4 seconds | Chrome DevTools Network tab: DOMContentLoaded < 4s on simulated 3G | PASS/FAIL |
| 1.6 | Login form is usable on mobile without horizontal scrolling | Form fields, button, and labels all visible without zooming or scrolling | PASS/FAIL |
| 1.7 | JWT token expires after 24 hours (1440 minutes) | Check `exp` field in JWT payload against `iat` — difference should be 86400 seconds | PASS/FAIL |

**Endpoints Required:**
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`

**Tables Touched:**
- `users` (read)
- `tenants` (read)

**Complexity:** S
**Phase:** P1

**Notes for Developer:**
- Use bcrypt for password hashing (do not use plain MD5 or SHA1)
- Store refresh token in HttpOnly cookie, access token in localStorage (or both in cookies — confirm with Cody's security preference)
- The login endpoint must not expose whether an email exists in the system if password is wrong (prevents user enumeration attacks)

---

## MVP Feature 2: Farm Dashboard with 10 Signals, Alerts, and Active Cycles

**User Story:**
As Cody, when I open the Teivaka app each morning at 6am, I immediately see all 10 Decision Engine signals (RED/AMBER/GREEN), my open alerts sorted by severity, and all 7 active cycles with their CoKG values — without clicking into any sub-menu.

**Acceptance Criteria:**

| # | Criterion | Expected Result | Status |
|---|-----------|----------------|--------|
| 2.1 | GET /api/v1/farms/F001/dashboard returns HTTP 200 | Response body contains `signals` (10 entries), `alerts` (sorted by severity), `active_cycles` | PASS/FAIL |
| 2.2 | Dashboard API response time is under 2 seconds on production server | curl timing: `time curl https://api.teivaka.com/api/v1/farms/F001/dashboard` — total < 2s | PASS/FAIL |
| 2.3 | All 10 Decision Engine signals present with status field | Each signal has: `value`, `status` (GREEN/AMBER/RED), `score` (0-10), `trend` (IMPROVING/STABLE/DECLINING) | PASS/FAIL |
| 2.4 | Alerts are sorted: CRITICAL first, then HIGH, MEDIUM, LOW | First alert in list has highest severity — verify with a known open CRITICAL alert | PASS/FAIL |
| 2.5 | 7 active cycles are shown on dashboard (F001 and F002 combined for founder view) | Cycle list shows: CRP-CAS/PU001, CRP-EGG/PU002, CRP-EGG/PU003, FRT-PIN/PU004, LIV-API/PU011, CRP-KAV/PU006, CRP-KAV/PU007 | PASS/FAIL |
| 2.6 | CoKG is displayed for each cycle that has harvest data | CoKG format: `FJD X.XX/kg` — shown prominently (larger font than other metrics in UI) | PASS/FAIL |
| 2.7 | Dashboard data reads from snapshot table, not live computation | Check query plan: dashboard endpoint should query `decision_signal_snapshots` not `harvest_log` directly | PASS/FAIL |
| 2.8 | F001 dashboard shows only F001 data; F002 dashboard shows only F002 data | GET /farms/F002/dashboard — active_cycles should show only F002 cycles | PASS/FAIL |
| 2.9 | FREE tier user sees simplified view (not full 10 signals) | Create a FREE tier test user — GET /farms/F001/dashboard returns limited signal set | PASS/FAIL |
| 2.10 | Dashboard refreshes signal data after Decision Engine runs manually | Run celery task manually → GET dashboard → snapshot_date = today | PASS/FAIL |

**Endpoints Required:**
- `GET /api/v1/farms/{farm_id}/dashboard`

**Tables Touched:**
- `decision_signal_snapshots` (read — TimescaleDB hypertable)
- `alerts` (read)
- `production_cycles` (read)
- `cycle_financials` (read — materialized view)

**Complexity:** M
**Phase:** P1

**Feature Gating:**
- FREE tier: simplified dashboard (3–4 signals, no trend arrows, no CoKG)
- BASIC tier: full 10 signals, alerts, active cycles, CoKG
- PREMIUM tier: full dashboard + historical trend charts (Phase 2)

---

## MVP Feature 3: Log Field Event by Voice Command

**User Story:**
As Laisenia Waqa (W-001), the permanent farm worker at Save-A-Lot Farm, I tap the microphone button in the Teivaka app, say "Log weeding on PU002, 3 hours, Laisenia Waqa," and within 5 seconds I see a confirmation that a field event and labor record have been created — without typing anything.

**Acceptance Criteria:**

| # | Criterion | Expected Result | Status |
|---|-----------|----------------|--------|
| 3.1 | Voice recording capture: mic button records audio for up to 60 seconds | Audio file captured in browser, encoded as WAV or MP3, ready for upload | PASS/FAIL |
| 3.2 | POST /api/v1/tis/command (audio) reaches Whisper API | tis_voice_logs table shows a new record with `transcript_text` populated within 3 seconds of voice upload | PASS/FAIL |
| 3.3 | Whisper transcription is accurate for "Log weeding on PU002, 3 hours, Laisenia Waqa" | transcript_text = "log weeding on PU002 3 hours Laisenia Waqa" (case insensitive, minor variations OK) | PASS/FAIL |
| 3.4 | TIS parses intent as LOG_LABOR | ai_commands table shows `command_type = 'LOG_LABOR'` for this voice log | PASS/FAIL |
| 3.5 | labor_attendance record is created with correct values | labor_attendance: worker_id='W-001', pu_id='F001-PU002', hours=3.0, work_date=today, activity_type='weeding' | PASS/FAIL |
| 3.6 | field_events record is created | field_events: pu_id='F001-PU002', event_type='weeding', event_date=today | PASS/FAIL |
| 3.7 | Total pipeline time < 5 seconds | tis_voice_logs.latency_ms < 5000 for this command | PASS/FAIL |
| 3.8 | Confirmation message shown in app UI | "Vinaka, Laisenia! Weeding logged on PU002 — 3 hours recorded." | PASS/FAIL |
| 3.9 | Voice log stored for audit | tis_voice_logs: audio_url (Supabase Storage), transcript_text, parsed_command, execution_status='success' | PASS/FAIL |
| 3.10 | Ambiguous voice input prompts clarification (does not silently fail) | Say: "Log something on PU002" → response: "I didn't catch the activity type. What were you doing? (e.g., weeding, fertilizing, spraying)" | PASS/FAIL |

**Endpoints Required:**
- `POST /api/v1/tis/command` (multipart/form-data with audio file)
- `POST /api/v1/labor` (called internally by Command Executor)
- `POST /api/v1/events` (called internally by Command Executor)

**Tables Touched:**
- `tis_voice_logs` (write)
- `ai_commands` (write)
- `labor_attendance` (write)
- `field_events` (write)

**Complexity:** XL — This is the most technically complex MVP feature.
**Phase:** P1

**Critical Note:**
This is the highest-priority MVP feature because it directly replaces manual notebook logging. If a field worker cannot log data by voice, they will not log data at all — and then the entire system has no data to work with. Every other feature depends on data quality, which depends on this feature.

---

## MVP Feature 4: Log Harvest with Automatic Chemical Compliance Check

**User Story:**
As Cody, when I try to log a harvest for a plot that had Dimethoate applied 4 days ago (which has a 7-day withholding period), the system automatically blocks the harvest log and tells me when it will be safe to harvest — without me having to check the compliance calendar manually.

**Acceptance Criteria:**

| # | Criterion | Expected Result | Status |
|---|-----------|----------------|--------|
| 4.1 | POST /api/v1/harvests with compliant crop (no WHD issue) returns HTTP 201 | Harvest record created, cycle_financials materialized view refreshed, CoKG updated | PASS/FAIL |
| 4.2 | POST /api/v1/harvests for PU with Dimethoate applied 4 days ago returns HTTP 409 | Body: `{"error": "CHEMICAL_COMPLIANCE_VIOLATION", "chemical": "Dimethoate 400EC", "safe_harvest_date": "YYYY-MM-DD", "days_remaining": 3}` | PASS/FAIL |
| 4.3 | DB-level trigger also blocks the insert (not just API layer) | Connect to DB directly via psql, attempt INSERT into harvest_log without going through API — trigger fires and raises exception | PASS/FAIL |
| 4.4 | FOUNDER override creates override_log record | POST /harvests with override=true and reason="emergency sale, buyer cannot wait" — override_log entry created, cycle proceeds with override_applied=true flag | PASS/FAIL |
| 4.5 | harvest_log record has correct ID format | harvest_id = 'HRV-YYYYMMDD-001' (date + sequential number for that day) | PASS/FAIL |
| 4.6 | CoKG updates after harvest log | Wait 30 seconds → GET /cycles/{cycle_id}/financials → cokg_fjd_per_kg has changed to reflect new harvest quantity | PASS/FAIL |
| 4.7 | WhatsApp message sent when harvest is blocked | Check Twilio logs: message with "🚫 HARVEST BLOCKED" sent to Cody's number | PASS/FAIL |
| 4.8 | Chemical compliance check works with the real chemical_library | Run test with actual chemicals from shared.chemical_library (verify Dimethoate has whd_days=7) | PASS/FAIL |

**Endpoints Required:**
- `POST /api/v1/harvests`
- `GET /api/v1/cycles/{cycle_id}/financials`

**Tables Touched:**
- `harvest_log` (write — with trigger)
- `field_events` (read — for chemical application history)
- `shared.chemical_library` (read — for WHD values)
- `cycle_financials` (materialized view refresh)
- `override_log` (write — if override used)
- `alerts` (write — if blocked)

**Complexity:** M
**Phase:** P1

**Test Setup Required:**
1. Create a field_event with event_type='chemical_application', chemical_id=(Dimethoate ID), application_date=(today - 4 days) for F001-PU002
2. Attempt POST /harvests for F001-PU002 with harvest_date=today
3. Expected: 409 BLOCKED response

---

## MVP Feature 5: View P&L and CoKG for Any Active Cycle

**User Story:**
As Cody, I open the cycle detail screen for CRP-EGG on PU002 and immediately see my Cost per Kilogram (CoKG), gross margin percentage, total revenue, total cost, and total harvest quantity for this cycle — so I know instantly whether this crop is making or losing money.

**Acceptance Criteria:**

| # | Criterion | Expected Result | Status |
|---|-----------|----------------|--------|
| 5.1 | GET /api/v1/cycles/{cycle_id}/financials returns HTTP 200 | Response body contains: cokg_fjd_per_kg (first field), gross_margin_pct, total_revenue_fjd, total_cost_fjd, total_harvest_qty_kg, cost_breakdown | PASS/FAIL |
| 5.2 | CoKG formula is correct | cokg = (total_labor_cost + total_input_cost + total_other_cost) / total_harvest_qty_kg. Verify by hand with known test data | PASS/FAIL |
| 5.3 | CoKG is the most prominent number in the UI | In the cycle detail screen, CoKG font size is larger than gross_margin_pct, revenue, and cost — confirmed visually | PASS/FAIL |
| 5.4 | CoKG updates within 30 seconds of a new harvest being logged | Log a harvest → wait 30 seconds → GET /cycles/{cycle_id}/financials → cokg has changed | PASS/FAIL |
| 5.5 | Zero harvest quantity returns "INSUFFICIENT DATA" not division-by-zero error | GET financials for a new cycle with no harvests — response: `{"cokg_fjd_per_kg": null, "message": "No harvest data yet"}` | PASS/FAIL |
| 5.6 | cost_breakdown shows labor, inputs, and other categories | cost_breakdown: `{"labor_fjd": X, "inputs_fjd": Y, "other_fjd": Z}` — sum = total_cost_fjd | PASS/FAIL |
| 5.7 | F001 profit share info displayed (when ProfitShareRate_% is configured) | If ProfitShareRate set: show `{"nayans_share_fjd": X, "teivaka_cut_fjd": Y}` below gross margin | PASS/FAIL |

**Endpoints Required:**
- `GET /api/v1/cycles/{cycle_id}/financials`

**Tables Touched:**
- `cycle_financials` (read — materialized view)
- `labor_attendance` (underlying data for materialized view)
- `harvest_log` (underlying data)
- `income_log` (underlying data)

**Complexity:** S
**Phase:** P1

**Notes for Developer:**
- cycle_financials is a PostgreSQL MATERIALIZED VIEW, refreshed by a Celery beat task every 30 minutes
- For real-time CoKG after harvest: trigger a manual refresh of cycle_financials for the specific cycle_id within the POST /harvests handler (not a full materialized view refresh — just for this cycle)
- CoKG of FJD 0.00 is a bug, not a valid result — add a validation check

---

## MVP Feature 6: Receive WhatsApp Alert for Overdue Task

**User Story:**
As Cody, when a task in the system is overdue — specifically when Laisenia Waqa's scheduled weeding on PU001 passes its due date without being marked complete — I receive a WhatsApp message on my phone telling me the task is overdue and who it's assigned to, within 5 minutes of the due date passing.

**Acceptance Criteria:**

| # | Criterion | Expected Result | Status |
|---|-----------|----------------|--------|
| 6.1 | Create a test task with due_date = yesterday and status='open' in task_queue | Task created successfully in DB: task_id, due_date = yesterday, task_status='open' | PASS/FAIL |
| 6.2 | Automation engine scans and detects the overdue task (RULE-013) | After next scan cycle (max 15 min): alerts table has a new record with rule_id='RULE-013' and entity_id=task_id | PASS/FAIL |
| 6.3 | Alert is not duplicated on second scan if already open | Run second scan cycle — still only 1 open alert for this task_id | PASS/FAIL |
| 6.4 | Celery notification task is queued for WhatsApp delivery | Check Redis: `redis-cli llen celery` increases after alert creation, OR check Celery worker logs | PASS/FAIL |
| 6.5 | WhatsApp message received on Cody's phone within 5 minutes | Physical check: Cody's WhatsApp receives the message. Message contains task_title, due_date, days_overdue, assignee_name | PASS/FAIL |
| 6.6 | WhatsApp message format matches template | Message contains "[TFOS]" prefix, task title, due date, "OVERDUE TASK" text, and Vinaka sign-off | PASS/FAIL |
| 6.7 | Alert auto-resolves when task is marked complete | PATCH /tasks/{task_id} → {status: "completed"} → automation scan runs → alert status changes to 'resolved' | PASS/FAIL |
| 6.8 | MEDIUM alert escalates to HIGH after 3 days | Create task 3 days overdue → automation engine escalation scan → alert severity changes from MEDIUM to HIGH | PASS/FAIL |

**Endpoints Required:**
- (Internal: Celery task queue, Twilio API)
- `POST /api/v1/tasks` (to create test task)
- `PATCH /api/v1/tasks/{task_id}` (to resolve)

**Tables Touched:**
- `task_queue` (read)
- `alerts` (write)

**Complexity:** M
**Phase:** P1

**WhatsApp Test Setup:**
- Twilio sandbox must be configured (or production number if available)
- Cody's WhatsApp number must be stored in `users.whatsapp_number` for FOUNDER role
- Test Twilio credentials in .env (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)

---

## MVP Feature 7: Create New Cycle with Rotation Validation

**User Story:**
As Cody, when I try to plant Eggplant on PU002 immediately after the previous Eggplant cycle closes (without the 60-day Solanaceae rest period), the system blocks the new cycle, shows me why it's blocked, and suggests 3 alternative crops I could plant instead. If I have an emergency business reason, I can request a FOUNDER override.

**Acceptance Criteria:**

| # | Criterion | Expected Result | Status |
|---|-----------|----------------|--------|
| 7.1 | POST /api/v1/rotation/validate for Eggplant→Eggplant with 22-day gap returns BLOCKED | Response: `{allowed: false, enforcement_decision: "BLOCKED", rule_status: "BLOCK", days_short: 38, min_rest_days: 60, earliest_allowed_date: "YYYY-MM-DD"}` | PASS/FAIL |
| 7.2 | Response includes at least 3 alternative crops | `alternatives`: array of at least 3 items, each with `production_id`, `rule_status`, `common_name`, and `reason` | PASS/FAIL |
| 7.3 | First alternative is a PREF status crop | alternatives[0].rule_status = "PREF" (e.g., CRP-LBN — Long Bean after Solanaceae) | PASS/FAIL |
| 7.4 | POST /api/v1/cycles (create new cycle) fails if rotation validation is BLOCKED | HTTP 409: `{"error": "ROTATION_BLOCKED", "message": "60-day Solanaceae rest required. 38 days remaining."}` | PASS/FAIL |
| 7.5 | FOUNDER can request override with reason | POST /api/v1/cycles/override-rotation with `{reason: "Buyer committed for F001-PU002 eggplant, cannot switch crop"}` → override_log created, cycle created with override_applied=true | PASS/FAIL |
| 7.6 | Override requires FOUNDER or ADMIN role | POST /cycles/override-rotation with a WORKER-role JWT → HTTP 403: "Insufficient permissions for rotation override" | PASS/FAIL |
| 7.7 | AVOID status allows cycle creation with warning (no hard block) | Eggplant after Tomato (same family, AVOID) → HTTP 201 cycle created but response includes `{warning: "Solanaceae rotation rest recommended — proceeding at risk"}` | PASS/FAIL |
| 7.8 | PREF status shows positive recommendation | Long Bean after Cabbage → POST /rotation/validate → `{allowed: true, rule_status: "PREF", recommendation: "Excellent — legume after Brassicaceae restores nitrogen"}` | PASS/FAIL |

**Endpoints Required:**
- `POST /api/v1/rotation/validate`
- `POST /api/v1/farms/{farm_id}/production-units/{pu_id}/cycles`
- `POST /api/v1/cycles/override-rotation`

**Tables Touched:**
- `shared.actionable_rules` (read — O(1) lookup)
- `production_cycles` (read for last crop, write for new cycle)
- `override_log` (write — if override used)

**Complexity:** L
**Phase:** P1

**Performance Requirement:**
POST /rotation/validate must respond in under 200ms. This is guaranteed by the UNIQUE index on (from_production_id, to_production_id) in shared.actionable_rules — it is O(1) lookup. If it's slower than 200ms, the index is missing.

---

## MVP Feature 8: TIS Answers Crop Management Question (Grounded Intelligence)

**User Story:**
As Cody, I type into the TIS chat box: "When should I apply fertilizer to eggplant?" and within 3 seconds I receive a specific, actionable answer grounded in Fiji farming conditions — with the correct fertilizer products available in Suva, the right timing for Serua Province's dry season, and the FJD cost — not generic international advice.

**Architecture:** TIS uses the Grounded Intelligence model (see `03_backend/TIS_GROUNDED_INTELLIGENCE.md`). Answers come from either Layer 1 (validated KB article, if published) or Layer 2 (Fiji Agricultural Intelligence — `09_knowledge_base/FIJI_FARM_INTELLIGENCE.md`). Both layers produce a real, usable answer. No NOT_FOUND responses.

**Acceptance Criteria:**

| # | Criterion | Expected Result | Status |
|---|-----------|----------------|--------|
| 8.1 | POST /api/v1/tis/chat with eggplant fertilizer question returns HTTP 200 | Response contains `answer`, `knowledge_layer` ("VALIDATED_KB" or "FIJI_INTELLIGENCE"), `articles_cited`, `confidence` | PASS/FAIL |
| 8.2 | Answer is Fiji-grounded — mentions local conditions or local products | Response references dry season timing, Serua Province conditions, or Fiji-available fertilizer names (e.g., "NPK 15-15-15 from Pacific Agri") | PASS/FAIL |
| 8.3 | Answer uses FJD and local context | Response contains no USD prices; references Fiji seasonal calendar (wet/dry season) | PASS/FAIL |
| 8.4 | Layer routing works correctly — validated KB article (if exists) takes priority | If a published eggplant article exists: `knowledge_layer = "VALIDATED_KB"`. If not: `knowledge_layer = "FIJI_INTELLIGENCE"` | PASS/FAIL |
| 8.5 | Layer 2 answer is logged in kb_article_candidates | After a FIJI_INTELLIGENCE answer: SELECT * FROM shared.kb_article_candidates WHERE query_text ILIKE '%fertilizer%eggplant%' → row exists with query_count >= 1 | PASS/FAIL |
| 8.6 | Off-topic question returns honest out-of-scope response | Ask "What is the capital of France?" → TIS responds that this is outside its farming knowledge scope; does NOT hallucinate a farming answer | PASS/FAIL |
| 8.7 | API response time < 3 seconds | Time the POST /tis/chat request end-to-end (embedding generation + vector search + Claude API call with Fiji Intelligence context) | PASS/FAIL |
| 8.8 | Rate limiting enforced per subscription tier | FREE tier: after 5 questions in a day → HTTP 429: "Daily TIS query limit reached for FREE tier. Upgrade to BASIC for 20/day." | PASS/FAIL |
| 8.9 | ai_commands record created for each query | SELECT * FROM ai_commands ORDER BY created_at DESC LIMIT 1 → record with command_type='KB_QUERY' and knowledge_layer field populated | PASS/FAIL |
| 8.10 | Fiji Intelligence context is loaded at startup (not per-request) | Check startup logs: "Fiji Agricultural Intelligence loaded: FIJI_FARM_INTELLIGENCE.md" — confirms file cached in memory | PASS/FAIL |

**Endpoints Required:**
- `POST /api/v1/tis/chat`
- `GET /api/v1/knowledge/candidates` (FOUNDER/ADMIN only — for KB pipeline monitoring)

**Tables Touched:**
- `ai_commands` (write — audit log with knowledge_layer field)
- `tis_conversations` (write — conversation history)
- `shared.kb_articles` (read — vector search, Layer 1)
- `shared.kb_article_candidates` (write — Layer 2 logging)

**Complexity:** L
**Phase:** P1

**Pre-Requisite for Testing:**
~~At least 1 published KB article must exist~~ — **no longer required**. The Fiji Agricultural Intelligence layer provides a full answer even with zero published articles. Test Feature 8 from Day 1 of development.

To also test Layer 1 behavior: publish one eggplant article via `POST /knowledge/articles/{id}/publish`, then repeat the fertilizer question. Response should shift from `knowledge_layer: "FIJI_INTELLIGENCE"` to `knowledge_layer: "VALIDATED_KB"`.

**Feature Gating:**
- FREE: 5 TIS chat queries/day
- BASIC: 20 TIS chat queries/day
- PREMIUM: unlimited TIS chat queries

---

## MVP Feature 9: Voice Command Executes TIS LOG_HARVEST

**User Story:**
As Laisenia Waqa (W-001), I hold up my phone and say: "Harvested 42 kilograms of eggplant Grade A on PU002 today." The system automatically creates a harvest record, checks chemical compliance, updates CoKG, and says back to me: "Harvest logged: 42kg Eggplant Grade A, F001-PU002. CoKG updated to FJD 1.82/kg."

**Acceptance Criteria:**

| # | Criterion | Expected Result | Status |
|---|-----------|----------------|--------|
| 9.1 | Voice is transcribed correctly by Whisper | transcript_text contains "42", "eggplant", "Grade A", "PU002" (or close variants) | PASS/FAIL |
| 9.2 | TIS parses intent as LOG_HARVEST | ai_commands.command_type = 'LOG_HARVEST' | PASS/FAIL |
| 9.3 | LOG_HARVEST extracts: quantity=42, unit='kg', grade='A', pu_id='F001-PU002', harvest_date=today | Parsed parameters stored in ai_commands.parsed_params JSON | PASS/FAIL |
| 9.4 | Chemical compliance check runs before DB insert | If WHD not met: voice response = "Harvest blocked — [chemical] applied [N] days ago. Safe after [date]." AND no harvest_log record created | PASS/FAIL |
| 9.5 | If compliant: harvest_log record created | harvest_log: pu_id='F001-PU002', quantity_kg=42.0, grade='A', harvest_date=today, logged_by='W-001' | PASS/FAIL |
| 9.6 | harvest_id follows correct format | harvest_id = 'HRV-YYYYMMDD-NNN' (date + 3-digit sequential) | PASS/FAIL |
| 9.7 | CoKG updates within 30 seconds | GET /cycles/{cycle_id}/financials → cokg_fjd_per_kg reflects the new 42kg | PASS/FAIL |
| 9.8 | Confirmation message returned in voice pipeline response | response.message = "Harvest logged: 42kg Eggplant Grade A, F001-PU002. CoKG updated to FJD X.XX/kg." | PASS/FAIL |
| 9.9 | Total pipeline time < 5 seconds | tis_voice_logs.latency_ms < 5000 | PASS/FAIL |
| 9.10 | tis_voice_logs record created with all fields | audio_url (Supabase Storage), transcript_text, parsed_command, execution_status='success', latency_ms | PASS/FAIL |

**Endpoints Required:**
- `POST /api/v1/tis/command` (voice input)
- (Internal: POST /harvests called by Command Executor)

**Tables Touched:**
- `tis_voice_logs` (write)
- `ai_commands` (write)
- `harvest_log` (write)
- `cycle_financials` (materialized view refresh)
- `shared.chemical_library` (read — compliance check)

**Complexity:** XL — Builds on and depends on MVP Feature 3 (voice pipeline)
**Phase:** P1

**Note:** MVP Feature 9 is the most critical voice command. If LOG_HARVEST works reliably by voice, the fundamental farm data loop (plant → grow → harvest → log → CoKG) is complete. All other voice commands (LOG_LABOR, LOG_PEST, etc.) follow the same pattern and can be built incrementally.

---

## MVP Feature 10: Offline Logging + Sync When Reconnected

**User Story:**
As Laisenia Waqa, working in the field at Viyasiyasi Farm on Kadavu Island with no mobile signal, I log a harvest on my phone. The app shows me "Offline — will sync when connected." When I walk back to the village and get Wi-Fi, the log automatically syncs to the server without me doing anything — and the harvest appears in Cody's dashboard.

**Acceptance Criteria:**

| # | Criterion | Expected Result | Status |
|---|-----------|----------------|--------|
| 10.1 | App functions offline: harvest log is written to IndexedDB | With device in airplane mode: tap LOG_HARVEST → data stored in IndexedDB with `sync_status='pending'` | PASS/FAIL |
| 10.2 | Offline indicator shown in UI | Status bar or banner: "Offline — changes will sync automatically" | PASS/FAIL |
| 10.3 | Multiple offline logs can be queued | Create 3 offline harvest logs → IndexedDB shows 3 records with sync_status='pending' | PASS/FAIL |
| 10.4 | On connectivity restore, sync fires automatically | Turn off airplane mode → within 30 seconds: Service Worker detects network → sync queue processes → POST /api/v1/sync/batch | PASS/FAIL |
| 10.5 | POST /sync/batch returns 200 for all valid records | Response: `{synced: 3, failed: 0}` | PASS/FAIL |
| 10.6 | DB records created correctly after sync | harvest_log in PostgreSQL shows the 3 records with correct timestamps and data | PASS/FAIL |
| 10.7 | IndexedDB entries updated to 'synced' after successful sync | IndexedDB records: sync_status='synced' after /sync/batch completes | PASS/FAIL |
| 10.8 | Duplicate protection: same offline record cannot sync twice | If sync fails mid-way and retries: second sync attempt skips already-synced records (check sync_id deduplication) | PASS/FAIL |
| 10.9 | 30-second gap test: log offline, wait 30 seconds, reconnect, sync | This is the canonical F002 Kadavu test — simulates brief connectivity drop during field work | PASS/FAIL |
| 10.10 | Chemical compliance still enforced during sync | If offline log contains a harvest that violates WHD at time of sync: POST /sync/batch returns 409 for that record, other records still sync | PASS/FAIL |

**Endpoints Required:**
- `POST /api/v1/sync/batch`

**Tables Touched:**
- `harvest_log` (write — after sync)
- `field_events` (write — after sync, for other event types)
- `labor_attendance` (write — after sync, for labor logs)

**Complexity:** XL — Service Worker + IndexedDB + sync queue implementation is the most complex frontend feature in MVP
**Phase:** P1

**Technical Implementation Notes:**
- Service Worker intercepts POST requests to TFOS API endpoints when offline and writes to IndexedDB
- IndexedDB schema must mirror server-side tables for the 5 critical log tables (harvest_log, field_events, labor_attendance, cash_ledger, nursery_log)
- Sync queue processes records in FIFO order — first logged, first synced
- Conflict resolution: if server-side record already exists with same logical key (same PU, same harvest_date, same quantity), flag for manual review — do NOT silently overwrite
- This feature MUST work on F002 Kadavu where connectivity drops are a regular part of farm operations

---

## Post-MVP: Phase 2 and Phase 3 Features

The following features are intentionally excluded from Phase 1 MVP. They are designed and documented so Phase 2 development can begin immediately after MVP, but they are NOT required for MVP sign-off.

| Feature | Phase | Reason for Deferral |
|---------|-------|---------------------|
| Community marketplace (buyer directory, forum, price index) | P2 | Requires separate database module + community user accounts |
| Stripe subscription billing (BASIC/PREMIUM tier payment processing) | P2 | MVP can use manual invoicing with Cody for Phase 1 farms |
| GIS/map visualization (zones, PU map, farm boundaries) | P2 | High complexity, low MVP priority — dashboard list view is sufficient |
| PDF export (P&L reports, harvest summaries, compliance records) | P2 | Nice-to-have, manual Excel export acceptable for MVP |
| Multi-language localization (Fijian iTaukei UI) | P2 | UI in English for Phase 1; TIS responses use mixed Fijian-English from day 1 |
| Aquaculture modules (AQU-TIL, AQU-PRW) | P2 | RULE-024 to RULE-028 are seeded inactive; activate with AQU infrastructure |
| Pig module (LIV-PIG) | P2 | INACTIVE — biosecurity requirements not yet met |
| Automated market price feeds (from Community to price_master) | P2 | Phase 2 Community platform provides the data source |
| Historical trend charts on dashboard | P2 | Snapshot data accumulates over 30 days; charts meaningful after 30+ snapshots |
| Multi-tenant self-service onboarding (new farm signup flow) | P2 | Phase 1: Cody manually provisions new farms |
| Advanced Celery monitoring (Flower dashboard) | P2 | Docker stats + Sentry sufficient for Phase 1 scale |

---

## MVP Sign-Off Criteria

MVP is declared complete and ready for production use when:

1. All 10 MVP features have ALL acceptance criteria marked PASS (no FAILs remaining)
2. Cody (Uraia Koroi Kama) has personally tested the app on his own phone in the field — not just on a development machine
3. Laisenia Waqa (W-001) has successfully logged at least 3 events by voice command without any developer assistance
4. At least 7 days of real farm data have been logged (to validate the Decision Engine snapshot accumulates correctly)
5. No CRITICAL or HIGH severity bugs are open in the bug tracker
6. Deployment guide (08_deployment/DEPLOYMENT_GUIDE.md) has been executed on the production server and all validation queries in Step 8 pass
7. Backup procedure is running (cron job verified, test backup restored successfully)
8. Cody confirms: "I can run my farms from this app. Let's go."

---

*When MVP is complete: update this document header with MVP completion date and Cody's sign-off.*
