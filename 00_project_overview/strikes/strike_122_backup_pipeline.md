# Strike #122 — Production Backup Pipeline

**Filed:** 2026-05-08
**Severity:** Goal-restoration class (single-disk-failure data-loss risk)
**Closes:** B84 (on-host portion)
**Defers:** B92, B93, B94, B95
**Surfaced by:** Phase 6 audit, Section L.1
**Commit:** `093afda` (code) + this doc-sync commit (Section 14 + archive + backlog)
**Inviolable proposed:** "Verified-loud beats assumed-quiet — alert path is not shipped until it has demonstrably fired and been received."

---

## Summary

Production was running 4+ days uninterrupted on `postgres_data` as a single
point of failure. A single disk fault, accidental `docker volume rm`, or
PostgreSQL page corruption would erase the entire system: 46 tenant tables,
hash-chained audit chain (Bank Evidence trust anchor), agronomy KB, library
catalogs, all 76 migrations of state. No backup script, no destination, no
restore drill existed.

Strike #122 ships the on-host portion of the backup pipeline complete, with
the off-host upload stubbed via a stable function signature. Strike #122b
will swap only the function body — call site, retention, failure path,
logging, and systemd integration are stable architecture.

## Why on-host alone is not "shipped"

3-2-1 backup rule: 3 copies, 2 different media, 1 off-site. On-host backups
defend against accidental volume rm and page corruption only — same disk
failure that takes down `postgres_data` takes down `/opt/teivaka/backups/`
too. Strike #122b (B93) closes the off-host gap; Strike #122 closes the
"no backup at all" gap.

## What ships

### `scripts/teivaka_backup.sh` (296 lines)

- pg_dump teivaka_db via `docker exec` (custom format, --no-owner --no-acl)
- Pipeline: pg_dump | gzip -9 → atomic `.tmp` → `mv` rename
- 100 KiB sanity floor (production dump compresses to ~425 KiB; floor
  catches truly-broken dumps without false-failing on healthy small DBs)
- Hot copy: `/opt/teivaka/backups/daily/teivaka_db_<ISO8601-utc>.dump.gz`
- Hardlink rotation:
  - daily/ keeps last 7
  - weekly/ keeps last 4 (Sunday hardlinks)
  - monthly/ keeps last 6 (day-of-month=01 hardlinks)
- `upload_offhost(local_filepath, remote_filename)` stub (Strike #122b
  will populate body; signature stable)
- Logs: `/opt/teivaka/logs/backup.log` (`/var/log` not writable for tfos)

### `scripts/teivaka_backup_restore_drill.sh` (172 lines)

- Strike #92 verify gate: a backup that has never been restored from is
  not verified
- Pulls latest dump, spins fresh `teivaka_db_restore_test` container on
  `teivaka-network`
- **Critical gotcha hardened:** waits for the *post-timescaledb-tune*
  boot via marker count ≥ 2 on `"TimescaleDB background worker launcher
  connected to shared catalogs"`. Naive `pg_isready` matched the pre-tune
  boot and handed us a server seconds away from shutdown, causing
  pg_restore to lose its connection mid-restore.
- Calls `timescaledb_pre_restore()` before `pg_restore` and
  `timescaledb_post_restore()` after, per upstream docs
- Row count diff vs production:
  - audit.events (tolerance 0 — hash chain integrity)
  - shared.kb_articles (tolerance 0 — read-only at runtime)
  - tenant.farms, tenant.harvest_log, tenant.production_cycles,
    tenant.users, tenant.decision_signal_snapshots (tolerance ±5)
- Tears down test container regardless of pass/fail (`trap cleanup EXIT`)

### Failure alert via Resend HTTPS API

**Architectural pivot mid-strike.** Initial implementation used `curl
smtps://` to Resend SMTP gateway. Verify gate V7 surfaced that
DigitalOcean blocks **all** outbound SMTP ports (25/465/587/2525) by
policy. SMTP path was non-functional from this droplet.

`api.resend.com:443` reachable. Production `app/utils/email.py` already
uses Resend HTTPS API for auth + cash flows on the same key. Switched
backup alert to `POST https://api.resend.com/emails` with the same
`SMTP_PASSWORD` (= Resend `re_` API key) and same `SMTP_FROM`
(`noreply@teivaka.com` — domain-verified on Resend).

V7 PASS: HTTP 200 + delivery ID returned on forced-failure injection.

### `scripts/systemd/teivaka-backup.service` + `.timer`

- oneshot service, `User=tfos` (in docker group)
- daily 14:00 UTC (= 02:00 Fiji); avoids 18:00–18:10 UTC Decision Engine
  / automation window
- `Persistent=true` so missed runs (e.g. droplet down) catch up on boot
- `Nice=10`, `IOSchedulingClass=best-effort` (low-priority — won't
  contend with foreground load)
- `StandardOutput=append:/opt/teivaka/logs/backup.log`

### `scripts/install_systemd_units.sh`

`tfos` cannot write `/etc/systemd/system/`. Operator runs:

```
sudo /opt/teivaka/scripts/install_systemd_units.sh
```

Idempotent. Installs both unit files, daemon-reload, enable+start timer,
prints listing.

## Verify gates

| # | Gate | Result |
|---|---|---|
| V1 | bash syntax check on all 3 scripts | PASS |
| V2 | manual run of teivaka_backup.sh | PASS (425 KiB written) |
| V3 | hot copy lands at /opt/teivaka/backups/daily/ | PASS |
| V4 | "OFF-HOST DESTINATION NOT YET CONFIGURED" line is grep-able | PASS |
| V5 | `gunzip -t` integrity on backup file | PASS |
| V6 | restore drill runs end-to-end with row count diff | PASS — all 7 tables delta=0 |
| V7 | forced-fail injection → SMTP/Resend alert delivers | PASS via Resend HTTPS API (http=200, id=`6db938c1-09b8-4c00-96cd-8c34cddb87b1`); operator inbox confirmation pending |

## Bugs surfaced + fixed during build

1. **1 MiB sanity floor too aggressive.** Real dump is 425 KiB
   (custom-format already compressed, plus gzip -9). Lowered to 100 KiB.
2. **ERR trap doesn't fire on explicit `exit 1`.** Refactored to unified
   `fail()` helper called from both sanity-check failures and the ERR
   trap. Single failure path.
3. **`SET row_security = off; SELECT COUNT(*)` returns "SET\n299" which
   `tr -d '[:space:]'` collapses to literal `SET299`** — fails as
   integer in delta calculation. Dropped the SET; teivaka superuser
   bypasses RLS implicitly.
4. **`--tmpfs /var/lib/postgresql/data:rw,size=2g`** crashed PG under WAL
   pressure during restore. Dropped — uses default ephemeral docker
   volume (auto-cleaned on `docker rm -f`).
5. **TimescaleDB pre/post restore wrappers** required around `pg_restore`
   per upstream docs. Without them, hypertable trigger interactions
   crash the connection mid-restore.
6. **`timescaledb-tune` restart race.** The image's init runs
   `timescaledb-tune` which restarts PG. `pg_isready` matched the
   pre-tune boot. Anchored on marker line count ≥ 2.
7. **DO blocks outbound SMTP.** Pivoted alert path to Resend HTTPS API.

## What does NOT ship in this strike

- Off-host upload (B93, Strike #122b) — pending vendor credential decision
- Notification CLI extraction from app code (B92) — direct Resend API
  call from bash is sufficient for #122 alert scope
- env key rename `SMTP_*` → `RESEND_*` (B94) — cosmetic
- DO outbound SMTP unblock (B95) — vendor policy, not actionable;
  routed around via HTTPS API

## Operator hand-off

After this commit lands, Operator runs:

```
sudo /opt/teivaka/scripts/install_systemd_units.sh
```

Then verifies:

```
systemctl list-timers --all | grep teivaka-backup
systemctl status teivaka-backup.timer
```

First natural fire: 2026-05-09 14:00 UTC (= 2026-05-09 02:00 Fiji).

Operator confirms V7 inbox receipt by checking cody@teivaka.com inbox
for the test alert email sent at 2026-05-08 14:44:54 UTC (subject:
"TFOS BACKUP FAILED — ...", from `noreply@teivaka.com`, Resend ID
`6db938c1-09b8-4c00-96cd-8c34cddb87b1`).

## Process rules surfaced

- **PR.1**: Backups must restore-drill at minimum monthly. Backup script
  that has never been restored from is not verified. Drift here = data
  loss waiting to happen. *(Proposed for inviolable list — Operator
  approval pending.)*
- **PR.2**: Verified-loud beats assumed-quiet. An alert path is not
  shipped until it has demonstrably fired and been received. *(Proposed
  for inviolable list — Operator approval pending.)*
- **PR.3**: Vendor blocks discovered mid-strike are pivot opportunities,
  not deferral excuses. DO outbound SMTP block was the kind of
  end-of-strike surprise that would have been a Strike #122d follow-up
  on a less disciplined run; instead, Path A (Resend HTTPS API) closed
  the gap inside the same strike commit boundary because the same
  vendor + same key worked over a different transport.

## Cross-references

- B84 (CLOSED — on-host portion): Backup mechanism (filed Phase 6
  Section L.1 as `🔴 critical`)
- B92 (filed): notification CLI extraction
- B93 (filed): Strike #122b off-host upload bolt-on
- B94 (filed): env key rename SMTP_* → RESEND_*
- B95 (filed): DO outbound SMTP block (INFRASTRUCTURE_NOTE)
- Strike #69: container recreate on env rotation (relevant if .env keys
  change between strikes)
- Strike #88: SHA pointer never via amend (this strike's doc-sync is a
  separate commit)
- Strike #91: fail-loud at every paste-pack join (applied throughout
  this strike: V2 floor too high → halt + report; V6 connection lost →
  halt + diag; V7 SMTP blocked → halt + Operator decision)
- Strike #92: PHASE COMPLETE = scoped + verified (V6 row count delta=0
  is the verify gate)
- Strike #98: Vertical Completeness — N/A here (this is infrastructure,
  not a pillar)
- Phase 6 audit document: 00_project_overview/audits/2026-05-07_full_platform_audit/06_infrastructure_topology.md

---

## V7-REDUX — 2026-05-09 (Path C)

**Status:** code commit `7c7a0ea` shipped; Operator host-side .env update
pending; V7-redux test send pending Operator action.

### Why V7-original was a false pass

V7 (2026-05-08, original Strike #122) reported PASS on the basis of:
- Resend HTTP 200 response
- Returned delivery ID `6db938c1-09b8-4c00-96cd-8c34cddb87b1`
- Log line "Alert email sent via Resend API to cody@teivaka.com"

What was actually true:
- `cody@teivaka.com` mailbox **does not exist**
- `ALERT_RECIPIENT` was hardcoded at `scripts/teivaka_backup.sh:42`
- Resend's HTTP 200 is "API accepted the request" — NOT "email delivered
  to a real inbox"
- The misread was conflating *acceptance* with *receipt*

The doctrine PR.2 was already proposed during the original strike:
*"Verified-loud beats assumed-quiet — alert path is not shipped until it
has demonstrably fired and been received."* V7-redux is the real-time
validation of why PR.2 belongs in CLAUDE.md inviolables: even with PR.2
proposed but not yet ratified, the original V7 closure paragraph violated
its spirit.

### Path C refactor (commit `7c7a0ea`)

- `scripts/teivaka_backup.sh`:
  - Header comment line 14: rewrote to describe new architecture
  - CONFIG block line 42: removed hardcoded
    `ALERT_RECIPIENT="cody@teivaka.com"`; replaced with explanatory
    comment pointing to send_alert() resolution
  - `send_alert()` body: added `local recipient="${ALERT_RECIPIENT:-founder@teivaka.com}"`
    immediately after `source "$ENV_FILE"`. .env value wins; fallback
    fires only if .env lacks the key
  - All call-sites updated from `$ALERT_RECIPIENT` to `$recipient`
  - Zero `cody@teivaka.com` references remain
- `04_environment/.env.example`:
  - Added `ALERT_RECIPIENT=founder@teivaka.com` in Section 10
    (MONITORING & LOGGING) below `MONITORING_ALERT_EMAIL`
  - Force-added via `git add -f` per the documented override at
    `.gitignore:25` ("If you later want .env.example tracked as a
    template, use: git add -f 04_environment/.env.example")
  - First time `.env.example` is tracked in repo; future updates flow
    through normal `git add` (gitignore only blocks first-add of
    untracked files)

### Operator action pending

```
ssh root@teivaka.com
cd /opt/teivaka
echo "ALERT_RECIPIENT=founder@teivaka.com" >> 04_environment/.env
grep "^ALERT_RECIPIENT=" 04_environment/.env
```

### Doctrine implication

PR.2 (proposed, not yet ratified) — *"alert path is not shipped until
it has demonstrably fired and been received"* — validated in real time
by this exact recipient bug. Strengthens case for ratification at
Operator review.

### B96 filed

Phantom-recipient repo sweep filed as B96. Known instances at filing:
- ALERT_RECIPIENT (closed by this V7-redux)
- CADDY_EMAIL=cody@teivaka.com defaults in docker-compose.yml + 4×
  .bak-* snapshots + .env.example line 212 (Let's Encrypt ACME contact
  pointing at non-existent mailbox — separate severity if cert renewal
  ever needs ACME outreach)

See backlog.md B96 for full scope.

---

## V7-REDUX CLOSEOUT — 2026-05-09 03:52 Fiji

Operator confirmed receipt of V7-redux test alert in
founder@teivaka.com Gmail inbox at **2026-05-09 03:52 Fiji**
(2026-05-08 15:53 UTC, ~60 seconds after Resend dispatch).

- Sender: `noreply@teivaka.com`
- Recipient: `founder@teivaka.com`
- Subject: `TFOS V7-REDUX TEST — teivaka-prod-2025 2026-05-08T15:52:45Z`
- Resend delivery ID: `037e9bc8-7a95-4bd8-afe4-e1d6f9119d41`
- Routing: Gmail Inbox (no spam folder, no Promotions/Updates tab
  segregation, sub-minute end-to-end delivery)

### What this verifies

- Resend API key + sender domain DKIM/SPF: **valid**
- `teivaka.com` → Google Workspace MX routing: **working**
- `founder@teivaka.com` mailbox: **real, monitored**
- Gmail spam classifier on `noreply@teivaka.com`: **trusted**
- `.env`-sourced `ALERT_RECIPIENT` (Path C refactor): **working e2e**
- Strike #122 alert path: **receipt-verified**

### Doctrine implication

PR.2 *("Verified-loud beats assumed-quiet — alert path is not shipped
until it has demonstrably fired and been received")* is now
battle-tested. The original V7 false-pass + V7-redux receipt-verification
cycle is the canonical example for this inviolable when it lands in
CLAUDE.md.

### Side benefit

Bank Evidence PDF dispatcher (Phase 9) can route through the same
sender domain (`noreply@teivaka.com`) with confidence — Gmail trust +
DKIM/SPF + sub-minute delivery already proven on this exact path.

### Strike #122 status: **SEALED**

B84 fully closed (on-host portion verified end-to-end, including the
alert path that was the gap in the original V7).
