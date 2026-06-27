# Settings — Redesign Wireframe (audit-approved 2026-06-27)

Rebuild of `/farm/settings` (`FarmSettings.jsx`). The page was feature-rich + honest but predated
the api.js standard, trapped account settings behind a farm gate, defaulted location-sharing ON,
and let any user invite (privilege escalation). This pass fixes the security/privacy + SEV-1 items
and cuts the 9-card wall into two sections.

Frontend + one backend security gate (invite role check). The `share_location` default is a data-
layer decision (mig 164 = DEFAULT true) — surfaced loudly + filed, not silently backfilled.

```
┌──────────────────────────────────────────────┐
│ Settings                          [Farm ▾]     │
├──────────────────────────────────────────────┤
│ YOUR ACCOUNT  (no farm needed — SET2)          │
│  Preferences   units · language · 3 alerts     │ toggles DISABLED until prefs load (SET1)
│    + Show my farm on the network map [ON/OFF]  │ PRIVACY: prominent consent + easy off; ON is
│      "ON — verified members see your location" │ flagged amber; "only verified members; off anytime"
│  Team          members + pending (revoke)      │ invite gated to owner/manager (Manager=owner only)
│  Plan & connections  billing(+trial) · M-PAiSA │ "Reset password" = real email flow; PIN/devices
│    · WhatsApp · Weather · Reset password · PIN  │   honestly "coming soon"
│  Governance    last-6 records + chain integrity │
│  Data & verification   KYC · export JSON        │
├──────────────────────────────────────────────┤
│ THIS FARM   (needs a selected farm)            │
│  Farm setup · Land & structure · Crop run      │ each card: loading / error+retry / honest-empty
│  names · Marketplace                            │ Edit/owner actions hidden from WORKER/VIEWER
└──────────────────────────────────────────────┘

Modals (Edit farm · Invite · Plan · Rename · Relabel · List) → shared a11y Modal (role=dialog+Esc+focus).
```

## Decisions
1. **SET1 — api.js + real states, no false writes.** `getJSON`/`send` (token refresh + humanised errors). Every card shows loading / error+retry / honest-empty. **Preference toggles + pills are DISABLED until `prefs` loads** — the load-flash can no longer PATCH a wrong default.
2. **SET2 — account vs farm split.** Account cards (Preferences · Team · Plan · Governance · Data) render WITHOUT a farm; only farm cards (Farm setup · Land · Crops · Marketplace) need a selected farm. Sectioned "Your account" / "This farm" to cut the 9-card wall.
3. **Privacy — location consent.** The map-sharing row leads Preferences with a prominent state callout (ON shown amber, "verified members see your location + distance"; OFF = "private"), easy off, and a "only verified members · off any time" note. **Backend default-flip (false) + backfill of existing opted-in users is FILED as an Operator consent decision** — not silently shipped.
4. **SET3 — security.** **Backend: invites are role-gated** — only owner/manager can invite, and only an owner can mint a Manager (was open → privilege escalation). Frontend hides owner-only actions (Edit farm, Invite, Manage plan, revoke) from WORKER/VIEWER; a 403 still surfaces a humanised message. **Invite Manager option shown only to owners.**
5. **Real Security.** "Reset password" triggers the real `/auth/forgot-password` email; PIN + devices are honestly "coming soon" (no endpoint).
6. **Member ops.** Revoke a pending invite (real `…/cancel`); remove member / change role are FILED (no endpoint).
7. **Plan visibility.** Billing shows tier + status + trial-end (when present); plan rows show price + TIS/day + farm limits.
8. **a11y + money.** Shared Modal (role=dialog/Esc/focus) for all six modals; `formatMoney`.

## Deferred (named, backend/decision — NOT faked)
- **`share_location` default → false + backfill** (mig 164 is DEFAULT true; flipping existing opted-in users to off is an Operator consent call).
- **Member remove / role-change** (no endpoint); **PIN + device/session management** (no endpoint).
- **Honest i18n** — language pref is saved but the app isn't translated yet (B42); labelled "rolling out."
- Composite `/settings` read to collapse the ~13 queries; per-tab provider lift (B31); cycles/zones/blocks rename capped at 200.
```
