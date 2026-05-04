# Strike #87 — Pillar parallelism conditional approval

## Failure mode

Operator asked: "Can two Claude Code terminals execute different parts of the build in parallel?"

Naive interpretations are catastrophically unsafe:

- Two terminals, same branch, same files: file-level race conditions. Last write wins. Both terminals editing events.py / events_registry.py / App.jsx / LogSheet.jsx / CLAUDE.md will collide. Migration sequence number races. Container rebuild races. Git push races.
- Two terminals, same branch, "different events": still same files (events.py, events_registry.py, App.jsx). 80% catastrophic failure within 30 minutes.

The right architectural primitive for safe parallelism is pillar separation: Farm pillar files vs Classroom pillar files vs Bees pillar files have ~80% disjoint file domains. Pillar-as-isolation-boundary is the architectural primitive that makes parallelism legitimate.

## Why earlier strikes don't catch this

Strike #71 (one phase at a time) implies single-threaded execution but doesn't define what "phase" means in a multi-pillar context. Strike #79 (foundational completion first) sequences phases but doesn't address concurrency. No earlier strike addresses multi-terminal coordination, branch isolation, or migration sequence reservation across parallel work streams.

## Binding rule

Multi-terminal parallel execution is allowed IF AND ONLY IF all six conditions are met:

(a) Different feature branches per terminal
(b) Different pillar file domains, verified non-overlapping at PRE-CHECK
(c) Migration sequence numbers pre-reserved per branch (Farm 062-070, Classroom 071-080, Bees 081-090, etc. — no shared sequence pool)
(d) One branch owns Section 14 / CLAUDE.md updates during the parallel session; other branches defer CLAUDE.md sync to merge-end
(e) Container rebuild coordination protocol explicit: only one `docker compose up -d --build api` active at a time; second terminal waits via sleep+recheck loop (max 3 retries before flagging coordination conflict)
(f) All Strikes 1-86 apply to BOTH branches independently; doubling the verification surface

## Banned patterns

- Naive parallel execution (same branch, same files, "different events"): 80% catastrophic failure rate
- Skipping any of conditions (a) through (f): degrades to naive parallel
- Long-duration parallelism with attention-degraded Operator: realistic execution window is first 2-3 hours of session; quality drops after

## Probabilistic assessment (filed for context)

- Successful Pattern B execution for 2 hours: 70%
- Successful Pattern B execution for 3 hours: 50%
- Successful Pattern B execution all 4 hours: 35%
- Catastrophic failure within first 30 min if conditions skipped: 80%

Throughput gain: 1.6-2.0x single-terminal cadence net of coordination overhead. Break-even: approximately 4 ships into parallel cadence (~30-45 min setup cost).

## Filed during

Sprint 7 foundation marathon (2026-05-04 evening Fiji time). Operator asked about parallelism while running Phase 6.3-21/22. Recommendation: Pattern A (Strike #86 latency hiding) for first 30 min as zero-risk trial; Pattern B (this strike's conditional approval) only if attention holds and runway exceeds 3 hours.
