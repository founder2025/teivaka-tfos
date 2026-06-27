# Agricultural Passport + TATI — Redesign (2026-06-27)

Redesign after the audit (P-1..P-17, PP-18..PP-29). Leads with **trust integrity** (the reason
TATI exists), then makes the engine as honest as it claims, then the UX. Security plumbing
(proof-only verify, hashed/expiring shares, gated vault, precomputed pure engine) is kept.

## Headline fixes
1. **Attestation becomes REAL verification (PP-18 / P-1 — critical).**
   - The **verifier** now enters **their own name + role** at confirm time (not farmer-typed).
   - **Self-confirm detection:** the request stores the creator's IP; if the confirmer's IP matches,
     the claim is recorded but flagged **`independent=false`** → the Trust engine does NOT grant it
     third-party weight. Rate-limited.
   - Trust copy is honest: a link-confirmed claim reads **"attested by {name}, {role}"**; only
     IP-distinct confirmations count as independent. (Officer accounts = Phase 5.)
2. **Trust as honest as it claims:**
   - **Expiry + recency decay (P-2):** `_claim_score` skips expired claims and decays old ones.
   - **Scale/magnitude (PP-19):** Production score factors in total kg (log-scaled), so a large
     operation outscores a tiny one — not just season counts.
   - **independent-gating (PP-18):** only `independent` third-party claims lift Identity/Farm/Verification.
3. **Loop + freshness:**
   - **Lazy compute (P-4):** first passport load with no snapshot computes synchronously; an "as of
     {time}" stamp + one-tap refresh otherwise.
   - **Attention strip (PP-21):** expiring documents surface on the passport (in-app, not silent);
     push/WhatsApp filed.
4. **AI summary safety (P-6):** the LLM output is validated — any number not present in the grounded
   facts → reject → deterministic fallback. Never ships an invented figure.
5. **UX (PP-24/PP-26/PP-29):** a single trust **hero** (band + score + "next milestone"), ONE
   prominent **Share** action up top, consolidated trust display, honest chip copy, vault relabelled
   "content-hashed (SHA-256)" (P-3 — not over-claiming chain-anchoring).

## Wireframe (Passport)
```
[photo] Uraia Koroi Kama · Farmer #F001-A0EE          [ Share my passport ▸ ]  (primary, top)
  ✓ Farm  ✓ Email  ✓ Phone  ◷ Identity (self-reported)
╔ Evidence & Reliability Confidence ═════════════════════╗
║   ◔  72 · Established        as of 2 Jul 14:08  ↻       ║   ← ONE hero (gauge + band + stamp)
║   Next: 1 verified season → Strong                     ║   ← milestone (PP-24)
╚════════════════════════════════════════════════════════╝
⚠ 1 document expires in 12 days · 1 link viewed today    ← attention strip (PP-21)
[ Overview | Reputation | Farm | Documents ]
OVERVIEW: executive summary (grounded) · headline records
REPUTATION: dimensions (why · how to improve) · [Get verified] [Share]
DOCUMENTS: upload · expiry badges · view (gated)
```

## Wireframe (verifier confirm — /a/{token})
```
A farmer asked you, as their EXTENSION OFFICER, to confirm: "owns/operates this farm".
Your name:  [__________]   Your role/title: [__________]   (required — recorded with your confirmation)
[ Yes, I confirm ]   [ I can't confirm ]
(If this is opened from the same device as the farmer, it's recorded as self-reported, not independent.)
```

## Shipped (this redesign)
- **Migration 193:** `attestation_requests.creator_ip`, `verifier_name`; `claim_verifications.independent`,
  `request_id` (lineage), `verified_at` decay use.
- `attestations.py`: verifier identity form + IP capture + self-confirm flag + rate-limit + lineage.
- `trust_engine.py`: independent-gating, expiry skip, recency decay, production magnitude.
- `trust_worker.py`: gather independent/verified_at/expires_at + total kg.
- `passport.py`: AI grounding validation; lazy compute on empty; "as of" stamp; honest scoping copy.
- `Passport.jsx`: trust hero + milestone + top Share + attention strip + honest chips + vault relabel.

## Filed (honest — bigger / partner-gated)
- **PP-27** officer/verifier ACCOUNTS + bulk verification (real KYC partner — Phase 5).
- **P-3 full** document chain-anchoring (extend audit event-catalog + emit DOCUMENT_ADDED).
- **P-5** true per-farmer/per-farm/cooperative scoping (subject model rework).
- **PP-20 full** device/velocity anti-fraud; **PP-21 full** push/WhatsApp notifications + auto-tasks.
- **PP-19** agronomic yield-vs-benchmark; **PP-22** config-driven formula + recompute-all on version bump;
  **PP-25** per-enterprise breakdown; **PP-28** DRY the photos/blocks query; observability metrics.
