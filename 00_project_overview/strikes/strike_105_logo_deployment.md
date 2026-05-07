# Strike #105 — Logo Deployment + Brand Consistency Sweep

**Date:** 2026-05-06
**Branch:** feature/option-3-plus-nav-v2-1
**Commit:** 6f1bf05
**Cadence:** Six-Step (Recon → Build (PARTS 8A–8E) → Verify → Commit+Push → Platform Check → Next Phase Decision)
**Scope:** Frontend brand surfaces + PWA asset baseline. No schema changes, no audit.events emissions, no API changes.

---

## Outcome

Replaced the fern-leaf 🌿 placeholder with the actual Teivaka logo across every brand-bearing surface in the platform, and unified all auth + admin + farmer shells onto the canonical CLAUDE.md cream/soil palette (`#F8F3E9` / `#5C4033`). Established a complete PWA asset baseline (manifest, multi-size favicon set, apple-touch-icon, maskable icon, OpenGraph card).

---

## Files modified (14 source) + new (10 brand assets) + 1 .gitignore patch

**Source edits:**
- `frontend/index.html` — favicon block expansion (PNG-first order + cache-bust ?v=2 + manifest + theme-color cleanup)
- `frontend/src/App.jsx` — PageLoader 🌿 → 72px logo + Loading… recolored to canonical #6AA84F
- `frontend/src/components/admin/AdminLayout.jsx` — full cream sweep (bg-gray-950/-800 → cream, text-gray-300/200/100 → soil, duplicate border cleanup) + 52px logo
- `frontend/src/components/farmer/FarmerLayout.jsx` — header recolored from C.soil dark-brown to cream + soil text + 48px logo + search field bg recalibrated
- `frontend/src/components/nav/TopAppBar.jsx` — 48px logo only (lowercase `teivaka` wordmark text removed)
- `frontend/src/pages/Landing.jsx` — nav 48px + hero 140px + footer 40px (all logo-only)
- `frontend/src/pages/Login.jsx` — 88px logo (Pattern A swap)
- `frontend/src/pages/Register.jsx` — 88px logo on both policy gate + form header; PALETTE UNIFICATION emerald-600 → cream + text-white → soil + text-emerald-100 subtitles → soil/70%
- `frontend/src/pages/VerifyEmail.jsx` — 88px logo
- `frontend/src/pages/ForgotPassword.jsx` — 88px logo
- `frontend/src/pages/ResetPassword.jsx` — 88px logo on both invalid-token + form states
- `frontend/src/pages/farmer/Onboarding.jsx` — 88px logo (Pattern A look-alike)
- `frontend/src/pages/onboarding/FarmBasics.jsx` — 104px splash logo

**New brand assets (`frontend/public/`):**
- `teivaka_logo.png` (master 2000×2000 transparent)
- `favicon.svg` (regenerated, embeds logo PNG, 32K vs prior 275-byte fern)
- `favicon-16.png`, `favicon-32.png`, `favicon-48.png`, `favicon.ico` (multi-size)
- `apple-touch-icon.png` (180×180)
- `android-chrome-192.png`, `android-chrome-512.png`, `maskable-512.png`
- `og-image.png` (regenerated 1200×630, cream bg, centered logo)
- `manifest.webmanifest` (NEW — closes PWA install gap, theme #6AA84F)

**Repository hygiene:**
- `.gitignore` patched with `*.bak-pre-*` + `*.old-*` guard (operator-pattern backup files from paste-pack workflow)

---

## Decisions locked

| ID | Decision | Outcome |
|---|---|---|
| D1 | Add logo to Landing hero | Yes |
| D2 | Bank Evidence PDF letterhead | Defer to Phase 6+ |
| D3 | Replace favicon.svg or keep both | Keep both (SVG + PNG fallback set) |
| D4 | Ship missing PWA manifest now | Yes |
| D5 | Replace inline TeivakaLogo() with `<img>` | Yes |
| F1 | Drop wordmark text platform-wide, logo-only | Yes |
| F2 | Industry-standard sizes | Recalibrated: 48 navbar / 88 content / 140 hero |
| F3 | Authorize 5 Sacred auth-page edits | Yes |
| G1 | Drop #3E7B1F + #3D8C40, keep --green #6AA84F canonical | Yes (Strike #109 deferred for Landing-internal palette refactor) |
| G2 | Topbar logo-only (mobile) + logo+wordmark (desktop) | Superseded by F1 (logo-only everywhere) |
| G3 | Delete duplicate theme-color L6 #3D8C40 | Yes |

Visual sizing zones (operator-locked):

| Zone | Size range | Surfaces |
|---|---|---|
| Navbar | 40–52px | Landing footer (40), TopAppBar/Landing nav/FarmerLayout (48), AdminLayout (52) |
| Loading | 72px | App.jsx PageLoader |
| Content centerpiece | 88px | All 5 auth pages + Onboarding |
| Splash | 104px | FarmBasics |
| Marketing hero | 140px | Landing hero |

---

## Scope intentionally not touched

- `pages/farmer/Community.jsx` L319 TIS card 🌿 — content-semantic decoration, not brand
- `pages/farmer/Community.jsx` L27 + `CommunityMap.jsx` L38 RANK dict 🌿 — gameification icon, not brand
- `pages/Register.jsx` success card 🎉 — celebration glyph, not brand mark
- Bank Evidence PDF letterhead — deferred to Phase 6+ per D2

---

## Known follow-ups logged

**[B-row] Strike #109: Landing palette refactor.** `Landing.jsx` still defines local `C.green = #3D8C40` + `C.greenDeep = #2E6B30` referenced ~12 times across CSS-in-JS template (tv-dot, tv-h1 em, tv-btn-primary, tv-eyebrow, hero SVG gradient). Out of scope for logo deployment; requires palette swap + visual re-test of every CTA / eyebrow / h1-em / hero-SVG.

**[Cosmetic]** `Landing.tv-footer-wordmark` CSS rule (color span + font-size 22px) now orphaned because content is `<img>`. Harmless dead rule. Cleanup when Strike #109 lands.

---

## CLAUDE.md doctrine compliance

- **Part 5 + Part 26:** All 5 Sacred auth pages (Login/Register/VerifyEmail/ForgotPassword/ResetPassword) edited under explicit operator F3 authorization
- **Part 8a Convergence Mandate:** This strike brings production closer to the prototype contract while preserving everything verified live
- **Part 36 Documentation Discipline:** No `_v2`/`_v3`/`_addendum` files created; this strike archive is the canonical record
- **Part 37 Six-Step Cadence:** All six steps honored (Recon → Build (5 sub-parts) → Verify → Commit+Push → Platform Check → Next Phase Decision)
- **No schema changes:** zero migrations, zero `audit.events` emissions, zero API contract changes
- **Branch discipline:** committed to `feature/option-3-plus-nav-v2-1`, never main
- **App.jsx routing:** additive only, no route removals/reshapes

---

## Verify gates passed

- 8 incremental builds, all clean exit (final: `index-BV3aCNsj.js`)
- Live bundle hash matches `dist/`
- `/api/v1/health` → 200 throughout
- All 11 brand asset URLs return 200 with expected sizes
- `favicon.svg` now embeds logo (32K vs prior 275-byte fern)
- Visual platform check: 9 surfaces verified by operator (Landing nav/hero/footer, /login, /register, /forgot-password, /reset-password, /admin, /community, /farm PageLoader, browser tab thumbnail post-cache-clear)
