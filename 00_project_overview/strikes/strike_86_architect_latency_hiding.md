# Strike #86 — Architect latency-hiding pattern

## Failure mode

The Six-Step Cadence has a hidden inefficiency in single-terminal execution:

1. Architect emits Phase N paste pack
2. Operator pastes to Claude Code
3. Claude Code executes (~15-20 min)
4. Architect waits idle for completion confirmation
5. Operator reports COMPLETE
6. Architect begins authoring Phase N+1 paste pack
7. Architect emits Phase N+1
8. Cycle repeats

Steps 3 and 4 happen concurrently in real time, but step 6 only begins AFTER step 5. The 15-20 minute Claude Code execution window is dead Architect output time — but only because Architect waits. The waiting is unnecessary.

## Why earlier strikes don't catch this

No earlier strike addresses Architect output cadence. Strike #71 (one phase at a time) and #79 (foundational completion before frontier) govern phase scope, not output timing. The cadence inefficiency was invisible until tonight's foundation marathon made the pattern obvious — 15-20 min waits between phases, when Architect could have been drafting next phase the moment Claude Code began executing current phase.

## Binding rule

Architect must author NEXT phase paste pack the moment CURRENT phase's execution begins on Claude Code, not after Claude Code reports COMPLETE.

Pattern:
1. Operator pastes Phase N to Claude Code → execution begins
2. Architect IMMEDIATELY drafts Phase N+1 paste pack as private staging in own response (not yet emitted)
3. On Phase N COMPLETE, Architect emits Phase N+1 instantly in same response that confirms Phase N

Effect: ~25-30% effective cadence improvement. No parallelism risk; pure latency hiding. Single terminal. Same git workflow.

## Caveats

- If Phase N fails or surfaces architectural decision mid-execution, Phase N+1 may need to be re-authored. Drafted-not-emitted state is cheap to discard.
- Operator can still pause: saying "hold on next phase, I want to think" works the same way.
- Architect must not pre-emit Phase N+1 before Phase N completes — that creates pressure for Operator to keep moving even when pause would be wise.

## Filed during

Sprint 7 foundation marathon (2026-05-04 evening Fiji time), discussion turn around pillar parallelism. Filed as the lower-cost alternative to Pattern B (multi-terminal pillar parallelism) — Pattern A (latency hiding) delivers most of the throughput gain with zero infrastructure setup and zero parallelism risk.
