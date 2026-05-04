# TFOS Strike Archive

Canonical archive of every Strike filed against TFOS process. Each strike is a 
codified institutional rule born from a real production or process failure.

## Convention

- One file per strike: `strike_NN_<slug>.md`
- File describes: failure mode, why earlier strikes don't catch it, binding rule, 
  filed-during context
- Strikes also summarized in `/opt/teivaka/CLAUDE.md` Strikes section

## Two-channel resilience

- **CLAUDE.md** = doctrinal summary (1-2 sentences per strike)
- **This directory** = forensic archive (full failure-mode reasoning, binding rules, examples)

Both are version-controlled. Both survive droplet rebuilds. Both load in any future 
session via `git clone`.

## Memory persistence layers

In addition to this archive, critical strikes also persist to:
- `~/.claude/projects/-opt-teivaka/memory/MEMORY.md` (Claude Code auto-memory, 
  droplet-local, auto-loaded across Claude Code sessions)

## Strike index

See `/opt/teivaka/CLAUDE.md` Strikes section for the canonical 1-N strike list.
