# Strike #90 — Architect must verify file-system assumptions before authoring transformation paste packs

## Failure mode

Architect authored a paste pack claiming to operate on existing files: "move strike files from /opt/teivaka/.claude/feedback/ to /opt/teivaka/00_project_overview/strikes/". The paste pack assumed strike_86_*, strike_87_*, strike_88_*, strike_89_* all existed in .claude/feedback/.

Reality on disk: only strike_88_post_amend_sha_drift.md existed. The others lived only in conversation memory + commit-message body text.

If Claude Code had executed the paste pack as-given:
- Step 2 for-loop would have moved one file (strike_88_*) instead of four
- CLAUDE.md strike list would have remained #88-only (paste pack didn't actually add #86/#87/#89 entries; it asserted they were "backfilled")
- Commit message would have claimed "Strikes #86, #87, #88, #89 backfilled with full forensic detail" — three of those four would have been a lie
- Net result: a single-strike-archive commit with a four-strike commit message

This is Strike #89 (advisory-mode strikes miss CLAUDE.md) reasserting itself in a new surface — strikes-as-files drift instead of strikes-as-text drift, but same root cause (memory layers diverging).

## Why earlier strikes don't catch this

Strike #73 (no fabrication from training-set patterns) governs invention of content but not assumption of state. Strike #84/#85 govern post-edit verification of CLAUDE.md content but not pre-edit verification of file existence. Strike #89 governs strikes-as-text but not strikes-as-files. The file-existence assumption was a new failure mode.

## Binding rule

Every Architect paste pack that moves, copies, transforms, or otherwise operates on existing files must:

(a) Include a PRE-CHECK step that explicitly verifies file presence (e.g., `ls -la <path>`, `test -f <path>`)
(b) Specify behavior when files are absent: skip / fabricate / halt-and-report
(c) Adjust commit message to actual scope after PRE-CHECK confirms reality
(d) Default behavior on absence: HALT-AND-REPORT (Operator decides path)

Discovery rule: any session that spots a file-existence assumption in a paste pack surfaces immediately and offers paths (provide source / authorize fabrication / partial scope).

## Why "fabricate" is rarely the right default

Fabricating institutional knowledge from one-line summaries violates Strike #73. Even when Architect "remembers" the full reasoning from conversation, writing it to disk as if it were authoritative file content risks compounding the failure mode — future sessions reading the archive can't distinguish between "filed during real production failure with full reasoning preserved" and "reconstructed from a one-liner because Architect forgot to write the file at the time."

Operator-supplied source text is always preferable. Operator-authorized fabrication is a documented compromise with explicit "reconstructed on YYYY-MM-DD from one-line summary" provenance in the file body.

## Filed during

Sprint 7 foundation marathon (2026-05-04 evening Fiji time). Triggered by Claude Code's PRE-CHECK on Strike #88 hotfix Path 2 (move-to-tracked-path) discovering that only #88 existed on disk among the four claimed strike files. Operator chose Path 1 (Architect supplies full archive bodies); Strike #90 filed to prevent recurrence.
