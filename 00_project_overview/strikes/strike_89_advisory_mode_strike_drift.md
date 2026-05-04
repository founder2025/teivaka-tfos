# Strike #89 — Advisory-mode strikes silently miss CLAUDE.md

## Failure mode

Strikes filed in Architect advisory mode (not as part of a paste pack with explicit Section 14 sync) silently fail to land in /opt/teivaka/CLAUDE.md. Result: Strike registry diverges across three layers:

- Architect conversation memory (Cowork chat session transcripts)
- Handover MD files (Project Knowledge uploads)
- Canonical CLAUDE.md on disk (the binding contract)

Symptom: a future session loads CLAUDE.md, sees strikes 1-N, and Architect references strikes N+1 / N+2 / N+3 from conversation memory that don't exist on disk. Future Claude Code paste pack fails when sed substitutions target non-existent strike anchors.

## Why earlier strikes don't catch this

Strike #61 (every Phase commit updates Section 14 IN-COMMIT) governs phase commits, not advisory turns. Strike #84/#85 govern doc-sync verification but only run when a doc-sync is attempted. Advisory-mode strikes don't trigger any commit at all — they live entirely in conversation. The strike register diverges silently, surfaced only when next session attempts to manipulate it.

## Discovery context

Sprint 7 foundation marathon, 2026-05-04. Strikes #86, #87, #88 were "filed" in Architect advisory mode across multiple turns:
- #86 filed during pillar-parallelism discussion
- #87 filed during conditional-approval-of-parallelism discussion
- #88 filed during Phase 6.3-23/24 SHA-pointer-drift diagnosis

None of these triggered a CLAUDE.md commit when filed. Three strikes accumulated in conversation memory only. Strike #89 itself was filed when Claude Code's PRE-CHECK on the Strike #88 hotfix discovered the registry divergence (CLAUDE.md said "Strikes filed: 1-85" while Architect was referencing #86, #87, #88 as binding).

## Binding rule

Every strike Architect files MUST be accompanied by either:

- (a) An immediate doc-sync paste pack to land it in CLAUDE.md on its own commit, OR
- (b) An explicit deferral notation: "DEFERRED — will land in Phase X paste pack" with the deferral commitment honored within 24 hours

Discovery rule: any session that spots strike-registry divergence between conversation and CLAUDE.md surfaces it immediately and surfaces backfill options. Operator chooses backfill path; Architect executes via paste pack.

## Why both options are needed

Option (a) is the disciplined default — every strike lands on disk immediately.

Option (b) accommodates rapid-fire strike filing during marathon sessions (e.g., 4 strikes filed in 90 minutes during foundation cadence). Issuing 4 separate doc-sync paste packs would interrupt cadence; deferral with explicit commitment is acceptable IF the next phase paste pack actually lands them. Without (b), foundation marathons would force-stop every time a strike surfaces.

## Filed during

Sprint 7 foundation marathon (2026-05-04 evening Fiji time). Triggered by Claude Code PRE-CHECK refusing to silent-no-op on Strike #88 hotfix paste pack because anchor Strike #87 didn't exist in CLAUDE.md (it lived only in conversation memory). Strike #89 + corrected hotfix backfill three strikes in one commit, establishes deferral notation for future foundation marathons.
