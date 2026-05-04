# Strike #94 — Droplet 2GB → 4GB resize

**Filed:** 2026-05-04
**Class:** infrastructure capacity
**Trigger:** B63 recon revealed swap 100% used, 95 MiB free RAM on 2GB droplet. Memory pressure was the actual production risk, not the cosmetic "Celery unhealthy" flag we'd been carrying in the handover for 8 days.

## Pre-resize baseline
- HEAD: 1872043 (Strike #93)
- Alembic: 066_b63_cluster_a
- Audit events: 289 (latest 2026-05-04 16:44:54)
- RAM: 1.9 GiB / 95 MiB free / swap 100%
- Disk: 24G/48G (50%)
- Containers: 8

## Sequence executed
1. Pre-flight baseline capture
2. docker compose down (dependency-correct order)
3. sudo poweroff from droplet (clean systemd shutdown)
4. DigitalOcean Resize: Basic / Regular SSD / 2 vCPU / 4 GB / 80 GB
5. Power on via DO console
6. Hardware verify: 3.8 GB RAM, 2 CPU, 77 GB disk, Docker active
7. docker compose up -d — 8 containers up
8. Full parity verification: git/alembic/audit/catalog/HTTPS all match baseline
9. Operator browser confirmation: teivaka.com 200, login OK, (+) Poultry tile count preserved, (+) Money shows WORKER_PAID, test event with audit hash badge

## Post-resize state
- HEAD: 1872043 (unchanged — pure infra)
- Alembic: 066_b63_cluster_a (unchanged)
- Audit events: 289 (unchanged event-for-event)
- RAM: 3.8 GiB / 863 MiB free / swap 0%
- Disk: 24G/77G (31%)
- Containers: 8 running, 6 healthy + 2 unhealthy (B68 + Strike #95)

## Bonus findings (resize resolved without separate strike)
- teivaka_beat: was unhealthy >8 days (mtime freeze) → healthy. Recreated container with fresh state.
- teivaka_worker_ai: was unhealthy >4 days → healthy.

## Backlog opened
- B67: tfos SSH user has no public key. Lock root SSH, configure tfos with key, switch to sudo workflow.
- B68: handover/CLAUDE.md says 6 containers; reality is 8. worker_automation + worker_notifications undocumented. Reconcile.
- B69: chain_origins=70 in audit.events (not 1). Confirm per-tenant vs global hash chain model and update verification doctrine.

## Next strike
- #95: worker_notifications + worker_automation unhealthy diagnosis. Pre-existing condition (predates resize). May be misconfigured healthcheck (beat-mtime pattern) or genuine functional failure.

## Process rule born from this strike
Healthcheck "unhealthy" status alone is NOT evidence of functional outage. Before assigning urgency to an unhealthy container, verify with logs + functional probes (queue depth, task firing, response codes). The 8-day "Celery outage" carried in the handover was beat firing tasks correctly the entire time with stale mtime tripping the 1800s healthcheck.
