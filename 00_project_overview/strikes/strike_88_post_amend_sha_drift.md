# Strike #88 — Post-amend SHA pointer drift

## Failure mode

Section 14 doc-sync runs INSIDE the phase commit:

1. Phase commit prepared with CLAUDE.md content updates (Form Coverage, alembic head)
2. `git commit -m "..."` creates initial commit (SHA = X)
3. `THIS_SHA=$(git rev-parse HEAD)` captures X
4. `sed -i "s|<old>|$THIS_SHA|g" CLAUDE.md` updates Last commit pointer to X
5. Strike #84/#85 verifications pass — CLAUDE.md references X ✓
6. `git commit --amend --no-edit` REWRITES the commit, producing new SHA = Y
7. CLAUDE.md still references X, but the commit is now Y. **X no longer exists in git.**

## Why Strikes #84 and #85 don't catch this

Strike #84 verifies SHA presence. Strike #85 verifies SHA + description alignment.
**Both run BEFORE the amend.** The amend silently invalidates them post-fact.

## Binding rule

Section 14 SHA pointer update must happen in a SEPARATE follow-up commit AFTER 
the phase commit is final.

Pattern:
1. Commit phase work with CLAUDE.md content updates only (Form Coverage, alembic 
   head — no SHA pointer)
2. Capture `git rev-parse HEAD` of finalized phase commit
3. Author small operational-hygiene commit that ONLY updates CLAUDE.md SHA pointer
4. Push both commits together (single push)

Replace amend-dance pattern in all future Phase 6.3-x paste packs.

## Filed during

Sprint 7 foundation marathon (2026-05-04 evening Fiji time) when Phase 6.3-23/24 
state diagnostic surfaced CLAUDE.md SHA pointer 5d89fcd referencing pre-amend SHA 
that no longer exists in git (real HEAD: 7be5cea).
