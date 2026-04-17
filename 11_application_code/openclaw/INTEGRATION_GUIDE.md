# OpenClaw → TFOS Integration Guide

## What This Does

Your existing OpenClaw instance (already running with Anthropic + OpenAI keys) is
pointed at the TFOS FastAPI backend instead of Google Sheets. Farm data is now read
from and written to PostgreSQL via the TFOS API — not Sheets.

**Your API keys do not change. Nothing about your existing OpenClaw setup changes
except the tool definitions and the data source.**

---

## Step 1 — Add 2 new env vars to your OpenClaw `.env`

```env
# TFOS FastAPI base URL
# Development: http://localhost:8000
# Production:  https://api.teivaka.com  (your Hetzner server)
TFOS_API_URL=http://localhost:8000

# Long-lived service token for OpenClaw → TFOS auth
# Generate this once: POST /api/v1/auth/service-token (FOUNDER role required)
# This is different from your ANTHROPIC_API_KEY — it's a TFOS JWT
TFOS_SERVICE_TOKEN=eyJ...
```

---

## Step 2 — Generate the TFOS Service Token

Once TFOS is running (`make dev`), call this endpoint once:

```bash
curl -X POST http://localhost:8000/api/v1/auth/service-token \
  -H "Authorization: Bearer <your-founder-JWT-from-supabase>" \
  -H "Content-Type: application/json" \
  -d '{"name": "openclaw-agent", "expires_days": 365}'
```

Copy the returned token → paste as `TFOS_SERVICE_TOKEN` in your OpenClaw `.env`.

---

## Step 3 — Copy config files into OpenClaw

Your OpenClaw workspace is at:
```
\\wsl$\Ubuntu\home\new_account\.openclaw\workspace\
```

Copy these files there alongside your existing `TIS-OPERATING-MANUAL.md`, `MEMORY.md`, `USER.md`, `SOUL.md`:

```
.openclaw/workspace/
├── TIS-OPERATING-MANUAL.md   ← existing — do not overwrite
├── MEMORY.md                 ← existing — do not overwrite
├── USER.md                   ← existing — do not overwrite
├── SOUL.md                   ← existing — do not overwrite
├── agent_config.yaml         ← copy from 11_application_code/openclaw/
├── tools.yaml                ← copy from 11_application_code/openclaw/
├── system_prompt.md          ← copy from 11_application_code/openclaw/ (TFOS farm mode only — does not replace TIS core identity)
└── memory/
    └── TFOS_context.md       ← copy MEMORY_template.md here, rename
```

The `system_prompt.md` in this pack is the **TFOS farm assistant mode** only.
TIS's full identity, authority model, and doctrine remain in `TIS-OPERATING-MANUAL.md`.

---

## Step 4 — WhatsApp webhook update

Your WhatsApp must now point at **TFOS** (which routes to OpenClaw), not directly at
OpenClaw. Update your Meta WhatsApp webhook URL to:

```
https://yourdomain.com/api/v1/webhooks/whatsapp
```

TFOS `webhooks.py` receives the message → calls `execute_tis_query()` in `tis_service.py`
→ Claude API → response back to farmer via Meta Cloud API.

**OR** — keep OpenClaw as the entry point and have OpenClaw call TFOS tools.
Both architectures work. The difference:

| | TFOS-first | OpenClaw-first |
|---|---|---|
| WhatsApp webhook | TFOS `/api/v1/webhooks/whatsapp` | OpenClaw |
| TIS logic | `tis_service.py` | OpenClaw agent |
| Farm data tools | Direct PostgreSQL | TFOS API calls |
| Recommended for | Production (full TFOS stack live) | Development (TFOS not yet deployed) |

---

## Step 5 — Morning briefing (6:10am Fiji)

The TFOS Celery beat schedule already runs the automation engine at 6am and decision
engine at 6:05am Fiji time. Add this to your OpenClaw cron (or use TFOS's Celery):

```yaml
# In your OpenClaw schedule config
morning_briefing:
  cron: "10 18 * * *"   # 18:10 UTC = 6:10am Fiji (UTC+12)
  action: send_morning_briefing
  farms: [F001, F002]
```

Or trigger via TFOS Celery — add to `celery_app.py` beat schedule:
```python
"morning-briefing": {
    "task": "app.workers.ai_worker.send_morning_briefing",
    "schedule": crontab(hour=18, minute=10),  # 6:10am Fiji
},
```

---

## Data Flow After Integration

```
Farmer: "harvested 80kg eggplant from PU002 this morning, grade A, Korovou Market"

OpenClaw agent_config.yaml
  → Claude (system_prompt.md + MEMORY_template.md context)
  → Tei: "I'll log: 80kg Grade A Eggplant, F001-PU002, Korovou Market, today. Correct?"

Farmer: "yes"

OpenClaw tools.yaml → log_harvest tool
  → POST https://api.teivaka.com/api/v1/harvests
  → harvest_service.py: chemical compliance check (Layer 1)
  → INSERT harvest_log (DB trigger: Layer 2 compliance check)
  → Returns: { harvest_id: "HRV-20260411-001", cycle_total_kg: 320 }

Tei: "✅ Harvest logged — HRV-20260411-001
      Korovou Market
      Cycle total: 320kg 📈"
  → Meta Cloud API → Farmer WhatsApp
```

---

## What OpenClaw does NOT do anymore

| Old (Sheets) | New (TFOS API) |
|---|---|
| `read_sheet("HarvestLog_Raw")` | `GET /api/v1/cycles/{id}` |
| `write_sheet("HarvestLog_Raw", row)` | `POST /api/v1/harvests` |
| `read_sheet("Automation_Alerts")` | `GET /api/v1/alerts` |
| `run_decision_engine()` via Apps Script | `GET /api/v1/decision-engine/current` (reads snapshot) |
| CallMeBot `send_whatsapp()` | Meta Cloud API (via TFOS `notification_service.py`) |

---

## Troubleshooting

**OpenClaw gets 401 from TFOS API**
→ Regenerate `TFOS_SERVICE_TOKEN` (step 2 above)

**MEMORY.md variables not populating**
→ Check `TFOS_API_URL` is reachable from OpenClaw host
→ Run: `curl $TFOS_API_URL/api/v1/health` — should return `{"status": "ok"}`

**TIS rate limit hit**
→ OpenClaw calls `POST /api/v1/tis/chat` which counts against daily TIS limit
→ PREMIUM tier = unlimited; BASIC = 20/day
→ Check current usage: `GET /api/v1/tis/rate-status`

**Morning briefing not sending**
→ Verify Celery beat is running: `make celery-beat` (in 11_application_code/)
→ Check Redis connection: `make health`
