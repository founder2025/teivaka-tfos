# Strike #91 — Paste pack injection points must use fail-loud sentinels, not plain placeholders

## Failure mode

Architect authored a corrected paste pack to backfill Strikes #86-#90 to canonical archive. Steps 3-6 of the paste pack contained heredoc blocks like:

```bash
cat > /opt/teivaka/00_project_overview/strikes/strike_86_architect_latency_hiding.md << 'EOF'
[PASTE FULL #86 ARCHIVE BODY FROM ARCHITECT MESSAGE — entire markdown block above]
EOF
```

The bracketed text was intended as a placeholder for Operator to manually splice in archive body content from elsewhere in Architect's message. But:

- The placeholder `[PASTE FULL #86 ARCHIVE BODY FROM ARCHITECT MESSAGE — entire markdown block above]` is valid bash heredoc content. It will be written to the file literally.
- Bash will not error on a heredoc whose content happens to be a placeholder string.
- If Claude Code executed without spotting the placeholder, four canonical strike files would have been committed containing only the literal string `[PASTE FULL #N ARCHIVE BODY...]` as their entire body.
- This is worse than not landing them at all — the archive would be polluted with placeholder strings masquerading as forensic institutional knowledge.

Claude Code spotted the placeholder in PRE-CHECK and halted (correct behavior, manual catch). Strike #91 is filed to make this an automated catch.

## Why earlier strikes don't catch this

Strike #73 (no fabrication from training-set patterns) governs Architect's invention of content but not Operator's failure to inject content. Strike #84/#85 govern post-edit verification of file content but only after the file is committed; placeholder content would pass post-edit grep checks (the placeholder string is present, it just happens to be the only thing present). Strike #90 governs file-existence verification but doesn't address content-quality verification of newly-written files.

## Binding rule

Every Architect paste pack that requires Operator content injection (heredoc bodies, configuration values, secrets, etc.) MUST:

(a) Use bash-fail-loud sentinels for injection points, not plain bracketed text. Examples:
   - `INJECT_86="${INJECT_86:?ERROR — Strike #91: must export INJECT_86 with #86 archive body}"`
   - PRE-CHECK STEP 0 verifies all required `INJECT_*` variables are non-empty before any mutation
   - OR inline content directly with no injection points (preferred when content fits in the paste pack itself)

(b) Default authoring style: inline all content directly. External injection is the exception, requires explicit Strike #91 sentinel pattern.

(c) Banned patterns inside heredocs:
   - `[PASTE ... HERE]`
   - `[INSERT ... HERE]`
   - `[FILL IN ...]`
   - `<INJECT ...>`
   - Any plain bracketed marker that bash will accept as valid content

(d) Discovery rule: Claude Code PRE-CHECK STEP 0 grep for placeholder patterns in heredoc bodies of the paste pack. Halt if found.

## Why direct inlining is preferred over injection sentinels

Single-message paste packs are atomic — Operator copies once, pastes once, executes once. Injection patterns require Operator to assemble two pieces (the paste pack + the injected content), creating a state where assembly errors silently produce wrong output.

When archive content is small enough to inline (typical strike file = 30-100 lines), inline it. When content is so large it overflows context windows, the paste pack should fetch from a known URL or git path, NOT use injection sentinels.

Strike #91 deprecates injection sentinels for archive-content paste packs in TFOS. Direct inlining is the binding default.

## Filed during

Sprint 7 foundation marathon (2026-05-04 evening Fiji time). Claude Code PRE-CHECK on Strike #88 hotfix Path 2 corrected paste pack (the one filing #86-#90) spotted four `[PASTE FULL #N ARCHIVE BODY...]` placeholders inside heredocs and halted. Architect re-authored the paste pack with all five archive bodies (including this one) inlined directly — closes Strike #91's own filing in the same commit that establishes the rule.
