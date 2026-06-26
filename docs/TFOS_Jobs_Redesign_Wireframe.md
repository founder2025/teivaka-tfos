# TFOS Jobs Page — Redesign Wireframe & Spec (2026-06-26)

Redesign of the Jobs marketplace (`Jobs.jsx` + `jobs_board.py`) after the audit (JA1–JA30).
Phase-1 page already meets platform standards; this pass fixes the **bug + workflow + CRUD +
abuse** gaps. The Community re-home + unified Post launcher (JA1) is the SEPARATE next step.

## Headline decisions
1. **Fix the real bug first (JA17):** hire is non-idempotent → re-hiring an already-ACCEPTED
   applicant creates a DUPLICATE worker. Guard server-side (409 on already-hired).
2. **Edit a listing (JA8):** new `PATCH /job-listings/{id}` + an Edit action — fix a pay typo
   without close+repost (which lost applicants).
3. **Stop over-exposing data (JA10):** `available` returns explicit safe columns (drop
   poster_tenant_id + raw coords), not `SELECT *`.
4. **Provenance (JA25):** a hire tags the created Labour worker "Hired via Jobs · <listing>".
5. **Decision-support / workflow:** bulk-shortlist all applicants (JA19 partial — crew hiring);
   profile-completeness nudge so seekers don't apply blind (JA23); "Use my GPS" on the work
   profile (JA15); honest "Hired — confirm with employer" wording (JA18, until the two-sided
   handshake ships); fix the hasProfile flash (JA13).

## Visual wireframe (unchanged shell — Find work / Hire)
```
FIND WORK
 ⟦ if no work profile: amber "Add your skills so employers can find you → Complete profile" (JA23) ⟧
 [All|Casual|Permanent|Contract|Seasonal|Apprentice]              [Region/town…]
 ListingCard …  [Apply]  (Apply disabled→nudge if profile empty)
 My applications: … status pill · ACCEPTED → "Hired — confirm start with the employer" (JA18 honest)
 Work profile (collapsible): name/location/skills/desired/phone/avail + [Use my GPS] (JA15)

HIRE
 [＋ Post a job]
 My listings · ListingCard + [Applicants (n)] [Edit] [Close/Reopen]      ← Edit = PATCH (JA8)
 Applicants drawer: [Shortlist all applied] (JA19) · per-applicant Shortlist/Decline/Hire
   Hire → modal (add-to-Labour: farm + rate + type; hidden if no farm). Re-hire blocked (JA17).
```

## Fixes shipped (this pass)
**Backend (`jobs_board.py`)**
- **JA17** `hire`: 409 if the application is already ACCEPTED (no duplicate worker).
- **JA8** `PATCH /job-listings/{id}` (poster-gated, enum-validated, full editable-field update).
- **JA10** `available` selects explicit columns; drops `poster_tenant_id` + raw `base_lat/lng`
  from the payload (distance still computed server-side).
- **JA25** hire passes `notes="Hired via Jobs · <listing_id>"` into `create_worker`.

**Frontend (`Jobs.jsx`)**
- **JA8** Edit action on my listings → PostListing modal in edit mode → PATCH.
- **JA19** "Shortlist all applied" in the applicants drawer (crew triage).
- **JA23** profile-completeness banner + apply nudge (don't apply with an empty profile).
- **JA15** "Use my GPS" on the work profile. **JA13** hasProfile no longer flashes.
- **JA18** honest "Hired — confirm start with the employer" on accepted applications.

## Filed (backend / product — honest, NOT faked)
- **JA1** re-home to Community pillar + unified "Post to the network" launcher + thin Farm
  shortcut (the approved next step — cross-pillar nav, done as its own pass).
- **JA2** notifications (post→seekers, apply→poster, hire/decline→applicant; reuse WhatsApp blast).
- **JA18 (full)** two-sided offer→accept handshake (worker confirms before joining Labour).
- **JA16** employer verification + accept/contact rate-limit (anti contact-harvest).
- **JA6/JA30** server-side min-wage enforcement + age/FNPF + simple contract (the compliance/
  formalization rail). **JA22** reliability/ratings. **JA21** competency/certification (spray licence).
- **JA12** server-side region/distance filter + pagination. **JA26** ghosting SLA/auto-expire.
- **JA27** cold-start seeding. **JA4** atomic hire (single txn). Map view.
```
