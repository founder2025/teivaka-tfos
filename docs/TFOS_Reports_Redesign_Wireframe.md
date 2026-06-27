# TFOS Reports Page — Redesign Wireframe & Spec (2026-06-27)

Redesign of Records › **Reports** (`Reports.jsx` + `crop_bank_evidence.py`) after audit RC1–RC25.
Core new ask: **a QR that opens all the evidence behind the report — the gallery photos and the
location blocks that produced the numbers — displayed browse-friendly.** Plus embed the **Teivaka
logo** in every report artifact.

## Headline decisions
1. **Evidence is now first-class (the new ask).** A report carries its **provenance**: the
   **location blocks** that produced the numbers (area, cycles, crops) and the **photo evidence**
   (gallery photos, SHA-256-bound), each individually verifiable. Shown on-screen in a
   **browse-friendly Evidence panel** (photos grouped by block + a blocks table), embedded as an
   **Evidence appendix in the PDF** (blocks + photo hashes), and reachable by **QR** → the chain
   verify. One backend source (`/crops/bank-evidence/sources`) feeds the on-screen card, the
   evidence panel, and matches the PDF — so **preview == PDF** (fixes RC18).
2. **Kill the fabrications (RC17, critical).** The compliance-log report no longer hardcodes
   "No active holds" — it reads the **real** `/crops/compliance/{farm}` (the locked Compliance
   data). The audit-report no longer hardcodes "unbroken / 0 tamper" — it states the chain is
   verified **in the signed PDF** (which runs the real `verify_chain_for_tenant`) and links to it,
   rather than asserting an unchecked result.
3. **Brand every artifact (RC4 / your ask).** Teivaka logo embedded in the **PDF header**
   (reportlab `RLImage`, graceful fallback to the wordmark) and the **HTML letterheads + history
   book** (`<img>` with onError fallback). Logo file drops at `app/static/teivaka-logo.png`
   (backend) + `frontend/public/teivaka-logo.png` (web) — wired now, non-breaking if absent.
4. **Make the buttons real (RC1/RC9).** Download = the signed PDF (works). **Send** = share the
   verify URL + PDF via native share / WhatsApp / email (real, not a toast). **Verify** = open
   `/verify/{anchor}`. No dead document buttons.
5. **Reduce cognitive load (RC3/RC24).** Library reorganised: **hero Bank Evidence** → **Ready now**
   (reports with real data) → an honest, collapsed **"Building"** group for the rest — not 19 equal
   tiles. **Period selector** (month/quarter/FY/custom) drives the data + PDF (RC20).
6. **Platform (RC5/RC7/RC8):** api.js (token refresh + honest errors), `formatMoney` (one currency,
   no more FJ$/FJD drift), drop the dead `ModeDropdown`.

## Visual wireframe (Reports → Bank Evidence + Evidence)
```
[TEIVAKA logo] Reports — documents a bank or buyer can read        [Farm ▾]  [✨ Ask AI]
Period: [ Month ▾ | Quarter | Financial year | Custom ]  → drives every report + the PDF
[ Library | Bank Evidence | Evidence | Net worth | Dispatch | Schedule ]

── BANK EVIDENCE ─────────────────────────────────────────────────────────────
[logo]  Save-A-Lot Farm — Farm Evidence            ✓ Verifiable   ┌─────────┐
        Period: Jun 2026 · built from logged records              │  ▓▓ QR ▓ │ scan to
 Earned  FJD …   Spent  FJD …   Net  FJD …   (period-scoped = PDF)│  ▓▓▓▓▓▓ │ verify +
 Blocks 4 · Photos 12 · Harvest 320 kg                            └─────────┘ evidence
 [ Download signed PDF ]  [ Send ▾ (WhatsApp · Email · copy link) ]  [ Verify ]
 ⟦ load error → ErrorCard·Retry (never fake numbers) ⟧

── EVIDENCE (browse-friendly — the new ask) ──────────────────────────────────
 Blocks behind these numbers
 ┌ Block A · Cassava · 0.40 ha · 2 cycles ┐ ┌ Block B · Tomato · 0.25 ha · 1 ┐ …
 Photos (12) — grouped by block, each hash-verified
 [▣ thumb ✓]  [▣ thumb ✓]  [▣ thumb ✓] …   tap → photo + SHA-256 + [Verify]
   • each photo links /verify/{audit_hash} (real, per-photo proof)
 "Every figure traces to these blocks and photos. The QR + appendix in the PDF carry this index."

── LIBRARY (reorganised) ─────────────────────────────────────────────────────
 ★ Bank Evidence (hero)
 Ready now:  Cash report · Profit & loss · Production report
 Building (tap to expand):  Balance sheet · Net worth · Valuation · Labour · Buyer · Audit ·
                            Compliance(now real) · Gov · Investor · NGO · Budget · Cert · Inventory
```

## Fixes shipped — frontend (`Reports.jsx`)
- **Evidence panel** (blocks + photos grouped by block + per-photo `/verify/{hash}`) consuming
  `/sources`. **On-screen QR** (`/qr.png`) → scan to verify + evidence.
- **RC18** Bank Evidence card reads `/sources` (period-scoped) → matches the PDF; honest
  Earned/Spent/Net from one source. **RC17** compliance-log reads real compliance; audit-report honest.
- **RC1/RC9** real Download (PDF) + Send (share verify+PDF) + Verify (open /verify).
- **RC3/RC24** hero + Ready-now + collapsed Building. **RC20** period selector.
- **RC5** api.js · **RC8** formatMoney · **RC7** no ModeDropdown · **RC4** logo letterheads.

## Fixes shipped — backend (`crop_bank_evidence.py`, NO migration) → STAGE
- **Logo** in the PDF header (graceful). **Evidence appendix**: blocks (area/cycles) + photo list
  with SHA-256 + the chain anchor — the report now *contains* its evidence index, and the QR verifies
  the chain it belongs to.
- **NEW `GET /crops/bank-evidence/sources`** — blocks + photos + period totals (one source of truth
  for preview == PDF). **NEW `GET /crops/bank-evidence/qr.png`** — QR PNG for the report's verify URL
  (no frontend QR lib needed).

## Filed (honest — bigger / needs more)
- **RC22** issued-document snapshot/immutability (PDF anchors a hash; on-screen is live).
- Public `/verify/{hash}` page to render the photo+block evidence inline (Phase-9 extension) so a
  scanning banker sees the gallery, not just the chain status.
- **RC9-full** server-side dispatch log + scheduled monthly send. **RC21** name-resolve actors.
- **RC23** agronomic report (yield/ha). **RC25** multi-farm portfolio report. Placeholder reports
  (balance-sheet/valuation/networth/labour/buyer/gov/investor/ngo/budget/cert/inventory) built or
  honestly de-scoped over time.
```
