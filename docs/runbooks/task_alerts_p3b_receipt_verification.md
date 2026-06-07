# Runbook — Tasks P3b: external alerts + PR.2 receipt verification

Two parts:
1. **Apply migration 086** (`tenant.task_notifications`) as the `teivaka` owner
   then `alembic stamp` (Strike #123 — alembic auths as `teivaka_app`, no CREATE
   on schema `tenant`).
2. **Receipt-verify the alert channel (Inviolable PR.2)** before enabling the
   scheduled sweep. The path ships **disabled** (`task_alerts_enabled=False`);
   sender-side success is never treated as delivery. Flip the flag ONLY after a
   test message is confirmed received in the real inbox/WhatsApp, with the
   receipt recorded in the strike archive.

---

## Part 1 — Apply migration 086 (run from /opt/teivaka)

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db <<'SQL'
CREATE TABLE IF NOT EXISTS tenant.task_notifications (
    notification_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id            UUID NOT NULL,
    farm_id              TEXT NOT NULL,
    task_id              TEXT,
    channel              TEXT NOT NULL CHECK (channel IN ('whatsapp','email')),
    recipient            TEXT NOT NULL,
    status               TEXT NOT NULL CHECK (status IN ('SENT','MOCK','FAILED')),
    provider_message_id  TEXT,
    error                TEXT,
    is_test              BOOLEAN NOT NULL DEFAULT false,
    sent_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    receipt_confirmed_at TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_task_notifications_dedupe ON tenant.task_notifications (tenant_id, task_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS ix_task_notifications_farm   ON tenant.task_notifications (tenant_id, farm_id, sent_at DESC);

ALTER TABLE tenant.task_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant.task_notifications FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS task_notifications_tenant_isolation ON tenant.task_notifications;
CREATE POLICY task_notifications_tenant_isolation
    ON tenant.task_notifications
    USING (tenant_id = (current_setting('app.tenant_id'::text))::uuid)
    WITH CHECK (tenant_id = (current_setting('app.tenant_id'::text))::uuid);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='teivaka_app') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON tenant.task_notifications TO teivaka_app;
    END IF;
END $$;
SQL

docker exec teivaka_api alembic stamp 086_task_notifications
docker exec teivaka_api alembic current        # -> 086_task_notifications (head)
```

Verify RLS:

```bash
docker exec -i teivaka_db psql -U teivaka -d teivaka_db -c \
"SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname='task_notifications';"  # t | t
```

Then rebuild API + workers so the new code is live:

```bash
docker compose -f 04_environment/docker-compose.yml up -d --build api worker_notifications worker_ai beat
```

(The admin Task Engine page now shows an "External alert delivery" card — it
reads the disabled/empty state until a test fires.)

---

## Part 2 — PR.2 receipt verification (before enabling the sweep)

**Prerequisite:** the channel must be configured in `.env`:
- WhatsApp: `META_WHATSAPP_TOKEN` + `META_PHONE_NUMBER_ID`. Without these,
  `send_task_alert_test` logs `MOCK` — that is NOT a receipt; configure first.
- Email: `SMTP_PASSWORD` = Resend API key (`re_…`), `SMTP_HOST=smtp.resend.com`,
  `SMTP_FROM` on a verified domain.

> Reminder (Strike #69): credential changes need a container **recreate**, not a
> restart — `up -d --force-recreate worker_notifications`.

### Fire the test

WhatsApp (replace with the founder's real WhatsApp number, E.164):

```bash
docker exec teivaka_worker_notifications python -c \
"from app.workers.notification_worker import send_task_alert_test as t; \
import json; print(json.dumps(t.run(channel='whatsapp', recipient='+679XXXXXXX')))"
```

Email (founder@teivaka.com):

```bash
docker exec teivaka_worker_notifications python -c \
"from app.workers.notification_worker import send_task_alert_test as t; \
import json; print(json.dumps(t.run(channel='email', recipient='founder@teivaka.com')))"
```

The return prints `status`, `provider_message_id`, and `sent_at`. Record these.

### Confirm + record (the actual PR.2 step)

1. Open the destination inbox/WhatsApp and confirm the test message **arrived**.
2. Set `receipt_confirmed_at` on the test row (RLS-scoped — set tenant first):
   ```sql
   SET app.tenant_id = '<tenant-uuid>';
   UPDATE tenant.task_notifications
      SET receipt_confirmed_at = now()
    WHERE is_test = true AND provider_message_id = '<id from the return>';
   ```
   (To log + confirm in one go, pass `tenant_id=` and `farm_id=` to
   `send_task_alert_test` so the test send is recorded as a row first.)
3. Add a test-receipt entry to the strike archive with: channel, recipient,
   `provider_message_id`, `sent_at`, and the Operator receipt-confirmation
   timestamp (mirrors the Strike #122 V7-redux receipt entry).

### Enable the scheduled sweep

Only after a confirmed receipt:

```bash
# .env
TASK_ALERTS_ENABLED=true

docker compose -f 04_environment/docker-compose.yml up -d --force-recreate worker_notifications beat
```

`notify-due-tasks` runs daily at 19:30 UTC (07:30 Fiji). It alerts FOUNDER/MANAGER
about OPEN tasks that are due-today/overdue with `task_rank <= 299`
(HIGH/CRITICAL), WhatsApp first then email fallback, deduped against
`tenant.task_notifications` over `TASK_ALERT_LOOKBACK_DAYS` (default 3).

### Verify the sweep (dry inspection)

```bash
docker exec teivaka_worker_notifications python -c \
"from app.workers.notification_worker import notify_due_tasks as t; \
import json; print(json.dumps(t.run()))"
# disabled -> {"skipped":"disabled", ...}; enabled -> {"farms_alerted":N, ...}
```

Admin → **Task Engine** → "External alert delivery" card shows per-channel
sent/mock/failed/receipt counts and turns green once a receipt is confirmed.
