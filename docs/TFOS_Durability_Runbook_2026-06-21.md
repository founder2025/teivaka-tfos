# TFOS Data Durability Runbook — "safe from any scenario"

**Goal:** a trust layer for agriculture. A record or photo created today must still
resolve years from now, surviving server loss, region loss, vendor loss, and
malicious deletion. This runbook is the operator checklist to get there, phased.

The guiding standard is the **3-2-1 rule**: **3** copies, on **2** kinds of
storage, **1** off-site. Everything below is in service of that.

---

## Status snapshot (2026-06-21)

| Layer | What | State |
|---|---|---|
| DB disaster recovery | Nightly pg_dump → DO Spaces (off-host) + monthly restore drill | ✅ LIVE |
| **Media durability** | **Farmer photos/videos replicated off-host** | ✅ **shipped in `teivaka_backup.sh` (this change) — needs one verified run** |
| Long-term immutability | Bucket versioning + object-lock (WORM) | ⬜ TODO (Tier 1, below) |
| Backup encryption | Client-side gpg before upload | ⬜ TODO (Tier 1) |
| Second off-site copy | A 2nd provider → true 3-2-1 | ⬜ TODO (Tier 2) |
| Restore drill covers media | Drill verifies a sample photo restores | ⬜ TODO (Tier 2) |
| Farmer self-custody | "Download my data" export | ⬜ TODO (Tier 2) |
| Point-in-time recovery | WAL archiving → seconds of loss, not 24h | ⬜ Deferred (launch-grade) |

Worst-case data loss today: **~24h** (nightly cadence). Acceptable for alpha.

---

## Tier 1 — do now (cheap, closes real holes)

### 1a. Verify media replication (the gap that was open)

Photos are written to the droplet disk (`/opt/teivaka/uploads`, bind-mounted to
the api container at `/app/uploads`). They are **not** in the pg_dump. The backup
script now syncs them off-host under a `media/` prefix. Prove it:

```bash
cd /opt/teivaka
git pull
bash scripts/teivaka_backup.sh            # watch for "Media replication OK"
# confirm objects landed off-host:
set -a; source 04_environment/.env; set +a
aws s3 ls --endpoint-url "$BACKUP_S3_ENDPOINT" "${BACKUP_S3_BUCKET%/}/media/" --recursive | tail
```

Expected: the object count under `media/` matches `find /opt/teivaka/uploads -type f | wc -l`.

### 1b. Turn on bucket versioning + object-lock  ← the "20 years" switch

This is the single most important durability control. With **versioning**, an
overwrite or delete keeps the old version. With **object-lock (WORM)**, even a
hacker holding the Spaces key **cannot delete or alter** existing backups for the
retention window. Without this, one stolen key can erase your whole history.

```bash
set -a; source /opt/teivaka/04_environment/.env; set +a
EP="$BACKUP_S3_ENDPOINT"; B="$(basename "$BACKUP_S3_BUCKET")"

# Enable versioning
aws s3api put-bucket-versioning --endpoint-url "$EP" --bucket "$B" \
  --versioning-configuration Status=Enabled

# Verify
aws s3api get-bucket-versioning --endpoint-url "$EP" --bucket "$B"
```

> **Object-lock note:** S3 object-lock must be enabled at bucket *creation* on
> most providers (including AWS). DO Spaces support for object-lock varies — if
> `put-object-lock-configuration` is unavailable, the practical equivalent on DO
> is: (a) versioning ON (above), plus (b) a **separate, write-only IAM key** for
> the backup uploader that has `PutObject` but **not** `DeleteObject`/
> `DeleteObjectVersion`. That way the server can write backups but can never
> delete them — a compromised server key can't wipe history. Create that
> restricted key in the DO console and use it for `AWS_ACCESS_KEY_ID` in `.env`.

### 1c. Encrypt dumps before upload (PII protection)

Backups contain every farmer's PII + Bank Evidence. DO encrypts at rest
server-side, but client-side encryption means the file is unreadable to anyone
who obtains it (including the storage vendor). Generate a key, store the
passphrase **outside** the server (password manager), and gpg-encrypt before
upload. *(Implementation: pipe the dump through `gpg --symmetric --cipher-algo
AES256` before `aws s3 cp`; add to `teivaka_backup.sh` as a follow-up — keep the
passphrase in `.env` as `BACKUP_GPG_PASSPHRASE`, never in git.)*

---

## Tier 2 — before public launch

- **2a. Second off-site provider** → true 3-2-1. Backblaze B2 is S3-compatible and
  cheap; a weekly `aws s3 sync` to a second bucket on a different vendor survives
  losing DO entirely. One vendor = one failure from total loss.
- **2b. Extend the restore drill to media** — after restoring the DB, also fetch a
  sample object from `media/` and assert it downloads + is non-empty. A photo
  backup you've never restored is the same hopeful file PR.1 warns about.
- **2c. "Download my data" (farmer self-custody)** — a button that produces a ZIP
  of a farmer's records (CSV + Bank Evidence PDFs) + their photos. This is data
  portability (trust + GDPR-style), and every farmer who downloads becomes another
  independent backup of their own data. Do NOT build per-user buckets — one bucket
  partitioned by tenant/user prefix + this export achieves the same goal with none
  of the operational overhead.

---

## Tier 3 — scale (deferred, launch-grade — not alpha)

- **Point-in-time recovery (WAL archiving / managed Postgres)** — cuts worst-case
  loss from ~24h to seconds. This is the real "never lose a single record"
  guarantee; warranted once real money flows, not before.
- **Optional "nuclear option":** a monthly encrypted dump pulled to a physical
  drive the operator holds. Survives the loss of every cloud simultaneously; fully
  operator-controlled. Nice-to-have insurance, not a blocker.

---

## Design decisions (so future sessions don't re-litigate)

- **No per-user storage buckets.** One bucket, tenant/user-prefixed, + the export
  feature. Per-user infra is overhead with no durability benefit.
- **Media sync does NOT use `--delete`.** A file removed on the droplet is retained
  off-host. For a trust layer, durability beats mirror-fidelity; pruning history is
  a deliberate, separate, audited action — never a side effect of a sync.
- **Fail-soft, fail-loud.** Off-host steps never abort the run (the on-host backup
  already succeeded) but log loudly (PR.1). A silent backup failure is worse than
  none — it manufactures false confidence.
