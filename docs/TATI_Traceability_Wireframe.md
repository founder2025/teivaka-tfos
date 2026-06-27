# TATI Traceability + Passport — Complete Visual Wireframe

**Status:** Redesign (audit-approved 2026-06-27). Mobile-first (360px). Boxes = the real
DOM the code renders; ★ = built; ◇ = designed-not-built (next slice).

Design language: cream `#FBF7EF` canvas, soil ink, green-deep `#1F4D39` brand, rounded
14px cards, one confident signal per screen, progressive disclosure. The farmer logs once;
every public surface is a projection + the hash-chain proof.

The system is two audiences through two doors:

```
                         ┌─────────────────────────────┐
        FARMER (authed)  │  PUBLIC (no login, by token) │
        ───────────────  │  ──────────────────────────  │
   /me/passport ★        │   /s/{token}      share portal (loan/buyer)   ★
   /me/consignments ★    │   /verify/lot/{token}   consignment trace     ★
        │ mint           │   /verify/{hash}        report proof+evidence  ★
        ▼                │   /verify/photo/{sha}   single-photo proof     ★
   QR / link  ───────────▶   /a/{token}            community attestation  ★
```

---

## 1 ★ Agricultural Passport — `/me/passport` (FARMER)

```
┌──────────────────────────────────────┐
│ ▢ TEIVAKA            Agricultural Pass │  logo (46px) + label
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ (photo)  Uraia Koroi Kama   [Share]│ │  identity hero
│ │   76px   #F001-A0EE         [edit] │ │
│ │          📍 Kadavu · since 2026-04 │ │
│ │ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │ │
│ │   ◜  44 ◝   EVIDENCE & RELIABILITY │ │  trust seal (ring gauge)
│ │   ◟ /100 ◞  Developing             │ │  band-coloured arc
│ │            grows with every record │ │
│ └──────────────────────────────────┘ │
│ [Overview][Farm][Reputation][Docs]    │  tabs
├──────────────────────────────────────┤
│ OVERVIEW                              │
│ ┌────────┬────────┬────────┬────────┐ │
│ │   0    │ 109 kg │   5    │FJD 1393│ │  verified-record tiles
│ │seasons │ prod.  │ sales  │revenue │ │
│ └────────┴────────┴────────┴────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ ✦ Your story (AI, grounded)       │ │  summary card
│ │  "Uraia farms 4 blocks on Kadavu…"│ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**FARM tab** (owner sees exactly what lenders see + edits tenure/GPS):
```
┌──────────────────────────────────────┐
│ 🌱 Save-A-lot Farm                    │
│    Kadavu · 1.25 ha · 4 blocks        │
│    Land tenure ▼ [iTaukei lease    ]  │  ★ editable, shown to lenders
│    ◇ Block GPS:  [ Set pins on map ]  │  ◇ next slice
├──────────────────────────────────────┤
│ FARM PROFILE · what lenders see       │
│ What you grow:  (Cassava ×2)(Eggplant)│  ★ crop chips
│ Types of farming: (Crops)(Poultry)    │  ★ vertical chips
│ Production focus:  Cash Flow      3    │  ★ 3-layer mix
│                    Food Security  1    │
│ ─────────────────────────────────────│
│ [View farm map & blocks] [Consignments│  ★ → /me/consignments
│                           & export ▸] │
└──────────────────────────────────────┘
```

---

## 2 ★ Consignments — `/me/consignments` (FARMER)

```
┌──────────────────────────────────────┐
│ ‹ Passport            [+ New consign.]│
│ 📦 Consignments                       │
│    Bundle harvests → traceable lot,   │
│    proof on a QR                      │
├──────────────────────────────────────┤
│ ┌──────────────────────────────────┐ │
│ │ Ginger      LOT-AB12CD34  ✓Deliv. │ │
│ │ 480 kg · Pacific Exporters · 6-27 │ │
│ │ [QR Trace page][QR docket]         │ │  ★ reprintable
│ └──────────────────────────────────┘ │
│ ┌──────────────────────────────────┐ │
│ │ Dalo       LOT-77AA01EE   Draft   │ │
│ │ 220 kg                            │ │
│ │ [Trace][QR docket][🚚 Mark deliv.]│ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

**New-consignment builder (modal):**
```
┌── New consignment ───────────────────┐
│ Buyer/exporter  [Pacific Exporters  ] │
│ Crop label      [auto from harvests ] │
│ AVAILABLE HARVESTS                    │
│ ☑ Ginger · Block A                    │
│    18 Jun · 300 kg avail · ✓cleared   │
│    kg in this lot [300   ]            │  allocation accounting
│ ☑ Ginger · Block B                    │
│    19 Jun · 180 kg avail · ✓cleared   │
│    kg in this lot [180   ]            │
│ ☐ Dalo · Block C  (⚠ not cleared)     │  honest flag
│             [Cancel] [Create (480 kg)]│
└──────────────────────────────────────┘
        │ over-allocation is rejected server-side
        ▼
┌── Consignment ready ─────────────────┐
│   LOT-AB12CD34 · 480 kg               │
│        ┌───────────┐                  │
│        │  ▓▓ QR ▓▓  │  ← /verify/lot/… │  printable docket QR
│        └───────────┘                  │
│   teivaka.com/verify/lot/xY3…  [Copy] │
│   Print on the docket/carton. Buyer   │
│   scans to trace back to your records.│
└──────────────────────────────────────┘
```

---

## 3 ★ Consignment Trace — `/verify/lot/{token}` (EXPORTER, public)

**The answer to "what went in, where, how grown, traced and proven."**
```
┌──────────────────────────────────────┐
│ ▢ TEIVAKA          Consignment Trace  │
│                       Farm to buyer   │
│ ┌──────────────────────────────────┐ │
│ │ LOT-AB12CD34                      │ │  hero
│ │ Ginger                            │ │
│ │ 480 kg · for Pacific Exporters ·  │ │
│ │ Delivered 2026-06-27              │ │
│ │ ✓ Withholding period observed on  │ │  ← PROVEN seal (not "MRL")
│ │   every source harvest            │ │
│ └──────────────────────────────────┘ │
│ QUANTITY RECONCILIATION               │  ← anti-fraud (banker)
│ ┌──────────────┬──────────────┐       │
│ │  520         │  480         │       │
│ │ harvested    │ in this lot  │       │
│ └──────────────┴──────────────┘       │
│ Balance ✓ Consistent — not exceeded   │
├──────────────────────────────────────┤
│ WHERE IT WAS GROWN                    │  ← "where"
│ Block A   0.5 ha · 📍 map             │
│ Block B   0.3 ha · 📍 map             │
├──────────────────────────────────────┤
│ SOURCE HARVESTS         (timeline)    │  ← "traced"
│ ● 300 kg · Block A                    │
│   Harvested 18 Jun · ✓ cleared        │
│ ● 180 kg · Block B                    │
│   Harvested 19 Jun · ✓ cleared        │
├──────────────────────────────────────┤
│ WHAT WENT IN (chemical use record)    │  ← "what went in"
│ Mancozeb · 1 May    2.5 · WHD 14d     │
├──────────────────────────────────────┤
│ HOW IT WAS GROWN (photo evidence)     │  ← "how grown"
│ [img][img][img][img]  tap → zoom      │
│        └ full-screen → "Verify        │
│          independently →" /verify/photo│
├──────────────────────────────────────┤
│ 🛡 Every figure traces to hash-chained│
│    records. Money/notes never shown.  │
└──────────────────────────────────────┘
```

---

## 4 ★ Share Portal — `/s/{token}` (BANK / BUYER, public)

```
┌──────────────────────────────────────┐
│ ▢ TEIVAKA   Agricultural Passport     │
│             Verified Credential       │
│ ● Shared securely by the farmer · LOAN │
│ ┌──────────────────────────────────┐ │
│ │ (photo) Uraia Koroi Kama          │ │  identity hero +
│ │  ID F001-A0EE · 📍Kadavu          │ │  trust seal (ring)
│ │  ◜44◝ Developing  Evidence & Rel. │ │
│ └──────────────────────────────────┘ │
│ VERIFIED RECORDS                      │
│ [0 seasons][109kg][5 sales][FJD 1393] │
│ CONFIDENCE BREAKDOWN  (2-col bars)    │
│ Production 50 ▓▓▓░  Market 30 ▓▓░     │
│ …                    not a credit dec.│
│ FARM PROFILE  crops·types·3-layer·land│
│ FARM  Save-A-lot · Kadavu · iTaukei   │
│ EVIDENCE (default ON for loan)        │
│  blocks + [img][img][img] tap→zoom    │
│ ▓▓ QR ▓▓  scan to open on another dev.│
└──────────────────────────────────────┘
```

---

## 5 ★ Report Proof + Evidence — `/verify/{hash}` (public QR on Bank PDF)

```
┌──────────────────────────────────────┐
│ TEIVAKA · AUDIT VERIFICATION          │
│ ✓ Verified · Hash exists in chain     │
│ REPORT  BANK_PDF_GENERATED · 27 Jun   │
│ CHAIN   ✓ Tamper-free · 277 events ·0 │
│ ── only for BANK_PDF hashes: ──────── │
│ EVIDENCE BEHIND THIS REPORT  ◀ D2-soft│
│  blocks + [img][img] tap→zoom→/verify │
│ WHAT THIS CONFIRMS  genuine + evidence│
│ VERIFIED HASH  d2076e51…              │
└──────────────────────────────────────┘
```

## 6 ★ Photo proof `/verify/photo/{sha}` · 7 ★ Attestation `/a/{token}`
```
┌─ verify photo ─────────┐  ┌─ attestation ─────────┐
│ ▢ TEIVAKA              │  │ TEIVAKA               │
│ ✓ Genuine — anchored   │  │ Confirm a farmer's    │
│ Logged as  Field Obs.  │  │ record. You as their  │
│ When  1 Jun 2026       │  │ <officer>:            │
│ Chain  Intact · 277    │  │ "This farmer …"       │
│ SHA-256 b46f…          │  │ Your name [______]    │
│ no farm/financial data │  │ Role     [______]     │
└────────────────────────┘  │ [Yes,confirm][Can't]  │
                            └───────────────────────┘
```

---

## 8 ◇ Block GPS capture (next slice — Farm tab)
```
┌── Set block location ────────────────┐
│  ┌────────────────────────────────┐  │
│  │   (static map / use my GPS)     │  │  no external map lib (CSP) →
│  │        ⊕ drop pin               │  │  "use my location" (navigator)
│  └────────────────────────────────┘  │  or manual lat/long entry
│  Block A   lat -19.05  lon 178.20     │
│                       [Save location] │
└──────────────────────────────────────┘
```

## Redesign decisions locked
1. One confident signal per screen (ring seal / withholding seal / balance check) before detail.
2. Proof is layered: report → evidence → single-photo, each independently verifiable.
3. Honesty in the UI: "withholding observed" (provable) not "MRL-safe" (no data); "⚠ not cleared" surfaced, never hidden.
4. Farmer logs once; every public surface is projection + chain proof.
5. Capability model: share token (revocable, expiring) for the passport; trace token (reprintable) for the consignment docket; report hash for the bank PDF.

## Open (designed, not built)
- ◇ Block GPS capture UI · ◇ Buyer confirmation (exporter attests kg received) ·
  ◇ LOT_DELIVERED hash-chaining · ◇ MRL-by-destination data · ◇ printable share-QR on Bank PDF.
```
