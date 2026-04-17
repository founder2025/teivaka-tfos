# FILE: 09_knowledge_base/ROTATION_RULES_REFERENCE.md

# Teivaka TFOS — Crop Rotation Rules Reference
**Function:** validate_rotation() | Table: shared.actionable_rules (~1,444 rows)
**Last Updated:** 2026-04-07

---

## Overview

The rotation engine enforces evidence-based crop rotation using a pre-computed lookup table of 1,444 rules. When a farmer proposes a new cycle on a Production Unit (PU), the system calls `validate_rotation(pu_id, proposed_production_id)`, which looks up the combination of [last_production_id → proposed_production_id] in `shared.actionable_rules` and returns one of 7 statuses.

The rules are organized into 14 botanical family policies. Each policy defines the minimum rest period after harvesting any crop in that family before replanting the same family. Cross-family rules may be OK or PREF.

**Critical implementation note:** The 1,444 actionable rules are a pre-computed matrix, not a formula computed at runtime. This is intentional. The lookup is O(1). Never replace the lookup table with runtime logic for the rotation gate — performance and correctness are both dependent on the pre-computed approach.

---

## The 7 Rotation Status Types

### 1. PREF (Preferred)
The proposed crop is an agronomically ideal follow-up to the previous crop. Actively recommended by TIS when suggesting next cycle.

**Example:** Long Bean (CRP-LBN) after Cabbage (CRP-CAB).
- Cabbage is a heavy nitrogen feeder (Brassicaceae). It depletes soil nitrogen significantly.
- Long Bean is a legume (Fabaceae). Its roots host nitrogen-fixing Rhizobium bacteria that restore N to 50–120 kg N/ha.
- The TIS RotationAdvisor module will actively suggest this pairing.

### 2. OK
The proposed crop is acceptable. Different plant families, no significant disease overlap, acceptable agronomic fit.

**Example:** Cassava (CRP-CAS) after Sweet Potato (CRP-SPT).
- Sweet Potato is Convolvulaceae. Cassava is Euphorbiaceae. Completely different families.
- No shared pathogens. Cassava's coarse root structure can follow sweet potato's fibrous system without conflict.
- Not the most beneficial pairing, but no risk. Allowed without comment.

### 3. AVOID
The proposed crop has moderate disease or pest overlap with the previous crop. Recommended against but not blocked. Farm operator can proceed — system will warn and log the decision. No FOUNDER override required for AVOID (it is a recommendation, not a hard stop).

**Example:** Eggplant (CRP-EGG) after Tomato (CRP-TOM).
- Both are Solanaceae. Fusarium wilt, bacterial wilt, and root-knot nematodes survive in soil between crops.
- Risk is elevated but not certain — outcome depends on field history, soil health, and weather.
- System creates an AVOID warning but allows the planting. Farmer is advised to monitor closely.
- If this field has had 3+ consecutive Solanaceae cycles: upgrade to BLOCK in the rule matrix.

### 4. BLOCK
Hard enforcement. The proposed planting is prohibited until the minimum rest period has elapsed. Cannot be dismissed by regular users. Only a FOUNDER-level override can bypass a BLOCK status — and the override is logged permanently with reason required.

**Example:** Tomato (CRP-TOM) after Eggplant (CRP-EGG) without 60-day rest (Solanaceae family, 60-day minimum).

API response when BLOCK status:
```json
{
  "allowed": false,
  "enforcement_decision": "BLOCKED",
  "rule_status": "BLOCK",
  "days_since_harvest": 22,
  "min_rest_days": 60,
  "days_short": 38,
  "blocking_rule": "SOLANACEAE_REST_60",
  "alternatives": [
    { "production_id": "CRP-LBN", "rule_status": "PREF", "reason": "Nitrogen fixer after Solanaceae" },
    { "production_id": "CRP-CAB", "rule_status": "OK", "reason": "Different family, acceptable" },
    { "production_id": "CRP-CAS", "rule_status": "OK", "reason": "Root crop, different family" }
  ],
  "override_available": true,
  "override_role_required": "FOUNDER"
}
```

### 5. COND (Conditional)
The pairing is allowed only under specific environmental or agronomic conditions. The system prompts the operator to confirm conditions before allowing the cycle to start.

**Example:** Kava (CRP-KAV) after Dalo/Taro (CRP-DAL or CRP-DTN).
- Kava (Piperaceae) and Taro (Araceae) do not share primary pathogens.
- However, Dalo requires standing water or very moist soil conditions, while Kava is highly susceptible to Phytophthora root rot in waterlogged soil.
- COND rule fires: "Confirm soil drainage adequate before planting Kava after Dalo. If plot has standing water or heavy clay: BLOCKED. If well-drained slopes: OK to proceed."
- Operator must tap "Confirm conditions met" with a text reason before cycle is created.

### 6. OVERLAY
The production overlays crop rotation logic entirely. Applies to perennial livestock operations and perennial tree crops. These productions co-exist with any crop rotation cycle on adjacent or overlapping PUs — they do not displace crop rotation.

**Example:** Apiculture (LIV-API) — always active, overlays any crop rotation.
- LIV-API runs continuously across all seasons.
- Hives are placed on F001-PU011, which does not rotate. Bees forage across the entire farm.
- Any new crop cycle on any F001 PU is not blocked by LIV-API. They coexist.
- System places LIV-API in the decision engine's ActiveCyclesCount but excludes it from rotation gate evaluation.

**Example:** Banana (FRT-BAN) — perennial ratoon, different rotation logic.
- Once a banana mat is established, it occupies the land for 5–10+ years.
- Rotation logic applies to the decision to establish or remove banana, not to seasonal replanting.

### 7. N/A
Rotation concept does not apply. Used for forestry (15–50 year cycles) and for support crops that are incorporated into soil (cover crops, green manure). These entries exist in the production table but are excluded from the rotation engine entirely.

**Example:** Teak (FOR-TEK).
- A teak plantation is planted once and harvested after 20–30 years.
- There is no seasonal rotation decision. The land is committed for a generation.
- validate_rotation() returns N/A for any forestry production_id.

---

## The 14 Family Rotation Policies

### Family 1: Solanaceae (Nightshade Family)

**Member Crops:**
| Production ID | Common Name | Local Name |
|--------------|-------------|------------|
| CRP-TOM | Tomato | Tamata |
| CRP-EGG | Eggplant | Baigan |
| CRP-CAP | Capsicum / Bell Pepper | Capsicum |
| CRP-CHI | Chilli | Masala / Chilli |

**Minimum Rest Days:** 60 days after last harvest of any Solanaceae crop before planting another Solanaceae crop on the same PU.

**Enforce Level:** BLOCK

**Disease Risk — What Builds Up in Soil:**
- **Fusarium oxysporum f.sp. lycopersici / melongenae (Fusarium wilt):** A soil fungus that persists in soil for 5–10 years as chlamydospores. Once Fusarium wilt establishes in a field, it cannot be eliminated without fumigation. Continuous Solanaceae planting rapidly increases the pathogen load.
- **Ralstonia solanacearum (Bacterial Wilt):** A soil bacterium that can persist for years in moist Fiji soils. Spreads via contaminated soil, water, and tools. Causes sudden wilt and plant death with no effective cure.
- **Meloidogyne spp. (Root-knot Nematodes):** Microscopic roundworms that complete their lifecycle in Solanaceae roots. Population doubles every 30–45 days in warm soil. After 2–3 consecutive Solanaceae cycles without rest, nematode pressure can reduce yields by 30–70%.
- **Phytophthora infestans (Late Blight):** Favored by Fiji's wet season humidity. Survives in infected plant debris between crops.

**Science Behind the 60-Day Rule:**
The 60-day rest period allows time for:
1. Infected crop residue to decompose (removes inoculum source)
2. Soil microbiome to shift — beneficial bacteria and fungi increase in absence of host crop
3. Nematode egg masses to desiccate or hatch without a host
4. A following non-host crop (e.g., legume) to be planted and incorporated before the next Solanaceae cycle

Research from Pacific Community (SPC) agricultural trials in Vanuatu and Fiji shows that a single 60-day rest with an intervening legume cover crop (Mucuna pruriens) reduces nematode population by 60–80%.

**Exceptions:**
- If grafting onto resistant rootstock: rest can be reduced to 45 days (COND status, not BLOCK) — requires confirmation in system that grafted seedlings are being used
- If full soil fumigation with metam sodium has been performed: rest waived (rare, expensive, environmentally sensitive — requires FOUNDER sign-off)

---

### Family 2: Cucurbitaceae (Gourd Family)

**Member Crops:**
| Production ID | Common Name |
|--------------|-------------|
| CRP-WAT | Watermelon |
| CRP-CUC | Cucumber |
| CRP-SQU | Squash / Pumpkin |

**Minimum Rest Days:** 45 days

**Enforce Level:** BLOCK

**Disease Risk:**
- **Pythium aphanidermatum (Damping Off / Root Rot):** Most aggressive in warm, wet Fiji conditions. Pythium forms persistent oospores in soil that survive 3–5 years. After consecutive Cucurbit crops, soil Pythium levels reach plant-killing thresholds.
- **Phytophthora capsici:** Causes crown rot and fruit rot. Spreads rapidly in heavy Fiji rains. Persistent in soil through oospores.
- **Cucumber Mosaic Virus (CMV):** Aphid-transmitted virus. Not soil-persistent, but infected debris from previous crop hosts aphid populations that inoculate next crop.
- **Powdery Mildew (Podosphaera xanthii):** Conidial spores survive on crop debris between seasons.

**Science Behind the 45-Day Rule:**
Shorter than Solanaceae rule because Cucurbitaceae pathogens have slightly shorter soil persistence (Pythium oospores: 2–3 years vs Fusarium chlamydospores: 5–10 years). The 45-day gap, combined with soil incorporation of crop debris and a following non-cucurbit crop, provides adequate biological reset.

**Exceptions:** None at Phase 1. If field has no history of Pythium (new land or long fallow), AVOID status may be applied instead of BLOCK — agronomist assessment required.

---

### Family 3: Fabaceae / Leguminosae (Legume Family)

**Member Crops:**
| Production ID | Common Name |
|--------------|-------------|
| CRP-FRB | French Bean / Snap Bean |
| CRP-LBN | Long Bean / Yardlong Bean |
| SUP-LEG | Legume Cover (green manure) |

**Minimum Rest Days:** 30 days (same-family rest)

**Enforce Level:** OK (beneficial — this is a positive pairing rule)

**Disease Risk (minimal):**
- **Rhizoctonia solani:** Minor soil pathogen. 30-day rest sufficient.
- Bean rust (Uromyces appendiculatus): Spore-transmitted, not persistent in soil. Minimal concern.

**Science — Why Legumes Are the Preferred Rotation Partner:**
Fabaceae roots form symbiotic associations with Rhizobium and Bradyrhizobium nitrogen-fixing bacteria. These bacteria convert atmospheric N₂ to plant-available ammonium (NH₄⁺) in root nodules — a process called biological nitrogen fixation (BNF).

Nitrogen fixed per season:
- French Bean: 50–80 kg N/ha/season
- Long Bean: 80–120 kg N/ha/season
- Mucuna (green manure): 150–250 kg N/ha/season

This nitrogen becomes available to the following crop when legume roots decompose. A Long Bean cycle before a heavy-feeding crop (Solanaceae, Cucurbitaceae, Brassicaceae) can reduce synthetic NPK fertilizer requirement by 30–50%, directly reducing CoKG.

**Rotation Status for Legumes as Following Crop:**
- After Solanaceae: PREF (most beneficial follow-up for N-depleted soil)
- After Brassicaceae: PREF
- After Cucurbitaceae: OK
- After Araceae: OK
- After Euphorbiaceae (Cassava): OK

---

### Family 4: Araceae (Arum / Taro Family)

**Member Crops:**
| Production ID | Common Name | Fijian Name |
|--------------|-------------|-------------|
| CRP-DAL | Swamp Taro | Dalo ni tana |
| CRP-DTN | Dasheen / Giant Taro | Dalo ni vanua |

**Minimum Rest Days:** 90 days

**Enforce Level:** BLOCK

**Disease Risk:**
- **Dasheen Mosaic Virus (DsMV):** Aphid-transmitted. Infects all Araceae. Builds up in successive plantings as virus inoculum in soil and plant debris increases. Once established, DsMV persists in volunteer taro shoots.
- **Phytophthora colocasiae (Taro Leaf Blight / TLB):** The most economically destructive taro disease in the Pacific. Caused the Pacific taro blight pandemic of the 1990s. Survives as oospores in soil and infected corms. Cannot be grown through a Phytophthora-infested plot without prior rest and resistant varieties.
- **Pythium spp.:** Causes corm rot, especially in waterlogged conditions. Persistent in wet anaerobic soils.

**Science Behind the 90-Day Rule:**
Taro leaf blight (P. colocasiae) oospores survive 6–12 months in soil. The 90-day rest eliminates the immediate high-inoculum surface layer when combined with deep ploughing (30cm) and soil drying. For plots with known TLB history: extend to 120-day rest minimum (COND override required to plant before 120 days).

**Exceptions:** Resistant TLB varieties (e.g., Samoa 2, Niue 1) may be planted after 60-day rest. System prompts: "Confirm TLB-resistant variety selected before reducing rest period."

---

### Family 5: Brassicaceae (Cabbage Family)

**Member Crops:**
| Production ID | Common Name |
|--------------|-------------|
| CRP-CAB | Cabbage |

**Minimum Rest Days:** 60 days

**Enforce Level:** BLOCK

**Disease Risk:**
- **Plasmodiophora brassicae (Club Root):** A soil-borne obligate parasite that forms resting spores persisting in soil for 15–20 years. Once club root establishes, the only management is lime application + long rotation. Highly destructive in Fiji's acidic soils.
- **Myzus persicae (Green Peach Aphid):** Populations build on Brassica crops and carry over to next cycle. High aphid pressure transmits multiple viruses.
- **Alternaria brassicae (Black Spot):** Survives in crop debris. 60-day rest with debris incorporation significantly reduces spore load.

**Science:**
Club root resting spores are essentially indestructible in soil (viable for 15–20 years even without a host). The 60-day rest does NOT eliminate club root — it is about reducing the overall inoculum load and giving the soil biological balance time to recover. Lime application to pH 7.2+ before planting is the primary club root management tool, not rotation alone.

**Exceptions:** If soil has been limed to pH 7.0+ and pH-tested (lab results required): rest can be reduced to 45 days (COND status).

---

### Family 6: Poaceae (Grass Family)

**Member Crops:**
| Production ID | Common Name |
|--------------|-------------|
| CRP-SCN | Spring Onion (Alliaceae, but shares Poaceae rotation logic for practical purposes) |
| CRP-DUR | Duruka (Sugarcane Shoot) |
| CRP-SUG | Sugarcane |
| SUP-NAP | Napier Grass |

**Note:** Botanically, Spring Onion is Alliaceae, not Poaceae. However, in Teivaka's rotation system, CRP-SCN is grouped with Poaceae for practical rotation planning because spring onion's soil profile and drainage requirements align with grass family crops.

**Minimum Rest Days:** 30 days

**Enforce Level:** AVOID (recommendation, not hard block)

**Disease Risk:**
- **Root Diseases (Fusarium root rot, Pythium root rot):** Grass family crops share certain Fusarium and Pythium pathogens. 30-day rest reduces inoculum.
- **Grassy Stunt Virus:** Transmitted by brown planthopper. Survives in grass species between crops.

**Exceptions:** Duruka and Sugarcane are perennial ratoon crops — they produce from the same stool for multiple years. Once established, they are OVERLAY status (not subject to annual rotation). The AVOID rule only applies when establishing a new planting after removing a previous grass-family crop.

---

### Family 7: Euphorbiaceae (Spurge Family)

**Member Crops:**
| Production ID | Common Name |
|--------------|-------------|
| CRP-CAS | Cassava (Tavioka) |

**Minimum Rest Days:** 180 days

**Enforce Level:** BLOCK

**Disease Risk:**
- **Cassava Mosaic Virus (CMV):** A devastating virus transmitted by whitefly (Bemisia tabaci). Once a field has CMV infection, volunteer shoots from remaining cassava root pieces can harbor virus for 6+ months after harvest.
- **Cassava Mealybug (Phenacoccus manihoti):** Waxy-coated scale insect that infests cassava stems and leaf undersides. After harvest, mealybug egg masses remain on root debris for months. A second cassava planting immediately re-infests.
- **Cassava Bacterial Blight (Xanthomonas axonopodis pv. manihotis):** Survives in infected plant debris and soil for 3–6 months.

**Science Behind the 180-Day Rule:**
This is the longest same-family rest period in the Teivaka system, for two reasons:
1. Cassava is a long-season crop (180–270 days). Its soil footprint — root decomposition, pathogen persistence — is proportionally longer.
2. Cassava mealybug egg masses remain viable for 90–120 days in soil debris. The 180-day gap guarantees all egg masses have hatched and died before a new planting.

**Critical note:** The 180-day rest also makes Cassava compatible with the CRP-KAV (Kava) 4-year cycle when Cassava is used as a nurse crop in early years of a kava plot — the two are harvested and rested at intervals that do not conflict.

**Exceptions:** None. 180 days is a hard minimum. FOUNDER override can bypass but should only be used with confirmed disease-free planting material and bioassay soil testing.

---

### Family 8: Convolvulaceae (Morning Glory Family)

**Member Crops:**
| Production ID | Common Name |
|--------------|-------------|
| CRP-SPT | Sweet Potato (Kumala) |

**Minimum Rest Days:** 60 days

**Enforce Level:** AVOID

**Disease Risk:**
- **Meloidogyne spp. (Root-knot Nematodes):** Sweet potato is an excellent nematode host. Populations build significantly after a sweet potato cycle.
- **Sclerotium rolfsii (Southern Blight):** Soil fungus affecting many crops. Sweet potato cycles increase S. rolfsii inoculum.
- **Sweet Potato Virus Disease (SPVD):** Complex of Sweet Potato Feathery Mottle Virus + Sweet Potato Chlorotic Stunt Virus. Transmitted by whitefly. Volunteer vines from previous crop can harbor virus.

**AVOID vs BLOCK Reasoning:**
Sweet potato's disease profile, while significant, is less acute than Solanaceae or Araceae. The pathogen persistence is shorter (nematodes rebound more slowly in Fiji's dry season). AVOID is appropriate — the system warns but does not block, allowing farmers to make risk-adjusted decisions.

---

### Family 9: Zingiberaceae (Ginger Family)

**Member Crops:**
| Production ID | Common Name |
|--------------|-------------|
| CRP-GIN | Ginger (Cago) |
| CRP-TUR | Turmeric (Rerega) |

**Minimum Rest Days:** 90 days

**Enforce Level:** AVOID

**Disease Risk:**
- **Pythium myriotylum (Rhizome Rot):** The most economically destructive ginger disease in the Pacific. Causes sudden collapse of ginger plants in wet conditions. Pythium oospores persist in soil for 2–3 years.
- **Fusarium oxysporum f.sp. zingiberi:** Causes yellowing and wilting. Soil-persistent.
- **Ralstonia solanacearum Race 4:** This bacterial wilt affects ginger (and is different from the tomato-specific race). Can persist in soil.

**90-Day AVOID Reasoning:**
Both Ginger and Turmeric share the Zingiberaceae soil pathogen profile. AVOID rather than BLOCK is used because:
1. The Zingiberaceae family has only 2 members in Teivaka's portfolio (small family footprint)
2. Both crops have relatively long seasons (180–270 days), meaning the practical rotation window is naturally longer even without the rule
3. Ginger farmers in Fiji traditionally recognize soil-borne disease risk and rarely replant immediately

**Note:** If a field has visible rhizome rot history (black, water-soaked corms at harvest), upgrade to BLOCK (180 days) via COND status.

---

### Family 10: Musaceae (Banana Family)

**Member Crops:**
| Production ID | Common Name |
|--------------|-------------|
| FRT-BAN | Banana (Vudi) |

**Rotation Status:** OVERLAY

**Logic:** Banana is a perennial crop that occupies land for 5–15+ years via ratooning (the mother plant produces suckers after harvest, and each sucker becomes the next productive plant). Annual crop rotation logic does not apply. Once a banana mat is established:
- It is classified as OVERLAY on that PU
- Adjacent PUs may rotate normally without restriction
- Removal of the banana block is a strategic farm decision, not a rotation decision
- RULE-017 harvest gap alert is modified for FRT-BAN (perennial fruiting: alert only if no harvest in 90 days, not 7)

---

### Family 11: Arecaceae (Palm Family)

**Member Crops:**
| Production ID | Common Name |
|--------------|-------------|
| FRT-COC | Coconut (Niu) |

**Rotation Status:** OVERLAY

**Logic:** Same as Musaceae. Coconut palms are 60–80 year trees. Once planted, they are permanent features of the farm landscape. All crop rotation decisions operate around coconut palms, not the other way around.

---

### Family 12: Piperaceae (Pepper Family) — SPECIAL CASE

**Member Crops:**
| Production ID | Common Name |
|--------------|-------------|
| CRP-KAV | Kava (Yaqona) |

**Rotation Status:** SPECIAL — unique long-cycle logic

**Why Kava is a Special Case:**
Kava is not subject to the standard family-based rotation policy because:
1. Its cycle is 4 years (1,460 days) — longer than any standard rotation rest period
2. The land is committed for 4 years; annual rotation decisions do not apply mid-cycle
3. After kava harvest, the field has been deeply rooted for 4 years — a different soil reset process is needed

**CRP-KAV Rotation Rules:**
- Before planting: `validate_rotation()` checks for minimum 12-month fallow after any previous crop (not just Piperaceae)
- During 4-year cycle: no rotation validation for that PU (cycle status = 'active', field locked)
- After harvest: minimum 24-month rest before replanting Kava on same PU (BLOCK enforcement)
- After harvest: other non-Piperaceae crops can be planted after 6-month rest (OK status)

**Inactivity Alert Override:**
CRP-KAV has `inactivity_alert_days = 180` in `shared.production_thresholds`. This means RULE-017 (harvest gap alert) only fires if no activity is logged in 180 days, NOT the default 7 days. This is a database-level configuration that must be verified after migration:
```sql
SELECT inactivity_alert_days FROM shared.production_thresholds
WHERE production_id = 'CRP-KAV';
-- MUST return: 180
```

---

### Family 13: Livestock (All LIV-* Productions)

**Member Productions:**
LIV-GOA, LIV-CAT, LIV-DIR, LIV-PIG, LIV-PBR, LIV-PLY, LIV-DCK, LIV-API

**Rotation Status:** OVERLAY

**Logic:** Livestock and apiculture operate on biological cycles (animal growth, laying seasons, breeding cycles) that are separate from crop rotation. They co-exist with crop production, often on dedicated paddocks or PUs that are not subject to crop rotation. The rotation gate is not evaluated for any LIV-* production.

**Exception — Rotational Grazing (future feature):**
If livestock (especially goats or cattle) are used for rotational grazing across multiple PUs as a soil fertility management tool, the interaction of grazing pressure with crop readiness will need to be modeled. This is a Phase 3 feature — not in MVP.

---

### Family 14: Forestry (All FOR-* Productions)

**Member Productions:**
FOR-AGA, FOR-SAN, FOR-PIN, FOR-MAH, FOR-TEK

**Rotation Status:** N/A

**Logic:** Forestry crops have 15–50 year cycles. The concept of annual or seasonal rotation does not apply. validate_rotation() returns N/A for any FOR-* production. The system does not block or recommend rotations involving forestry — instead, forestry planting decisions are governed by long-term land-use planning tools (Phase 3+ feature).

---

## Enforcement Logic: How min_rest_days is Computed

### The Core Formula
```python
days_since_last_harvest = proposed_planting_date - actual_harvest_end_date

if days_since_last_harvest < min_rest_days:
    if enforcement_level == 'BLOCK':
        return {
            "allowed": False,
            "enforcement_decision": "BLOCKED",
            "days_short": min_rest_days - days_since_last_harvest,
            "earliest_allowed_date": actual_harvest_end_date + timedelta(days=min_rest_days)
        }
    elif enforcement_level == 'AVOID':
        return {
            "allowed": True,
            "enforcement_decision": "OVERRIDE_REQUIRED",
            "days_short": min_rest_days - days_since_last_harvest,
            "warning": "Rest period not met — planting not recommended"
        }
else:
    # Proceed to rule_status lookup
    rule = lookup_actionable_rule(last_production_id, proposed_production_id)
    return rule.status  # PREF, OK, AVOID, BLOCK, COND, OVERLAY, N/A
```

### The Lookup Table: shared.actionable_rules
```sql
-- Structure
CREATE TABLE shared.actionable_rules (
    rule_id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    from_production_id  VARCHAR(10) REFERENCES shared.productions(production_id),
    to_production_id    VARCHAR(10) REFERENCES shared.productions(production_id),
    rule_status         VARCHAR(10) CHECK (rule_status IN ('PREF','OK','AVOID','BLOCK','COND','OVERLAY','N/A')),
    min_rest_days       INTEGER NOT NULL DEFAULT 0,
    enforcement_level   VARCHAR(10) CHECK (enforcement_level IN ('BLOCK','AVOID','OK')),
    disease_risk_note   TEXT,
    science_note        TEXT,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Primary lookup index (must be O(1))
CREATE UNIQUE INDEX actionable_rules_lookup_idx
ON shared.actionable_rules (from_production_id, to_production_id);
```

### Override Flow (FOUNDER-Only)
When a BLOCK is encountered but the farm operator has an urgent business reason to proceed:

1. User taps "Request Override" in UI
2. System checks user role: only FOUNDER or ADMIN role can submit override
3. FOUNDER enters reason (required, minimum 20 characters)
4. Override request logged to `override_log` table:
   ```sql
   INSERT INTO override_log (
     override_id, pu_id, from_production_id, to_production_id,
     override_reason, requested_by, approved_by, override_date,
     days_short, min_rest_days
   ) VALUES (...);
   ```
5. System creates cycle with `override_applied = true` flag
6. Automation engine monitors this cycle extra closely (weekly check, not monthly)

**Override is not a dismissal.** The cycle is created with risk flagged. If disease pressure develops, the system correlates back to the override decision.

---

## Disease Buildup Science: Why Rotation Works

### Nematode Population Dynamics in Fiji Soil

Root-knot nematodes (Meloidogyne spp.) are the most widespread soil pest in Fiji's agricultural soils. Under continuous Solanaceae cultivation:

| Cycle Number | Nematode Eggs/200g Soil | Estimated Yield Loss |
|-------------|------------------------|---------------------|
| First planting (new land) | <50 | 0–5% |
| Second consecutive Solanaceae | 200–500 | 10–20% |
| Third consecutive Solanaceae | 1,000–3,000 | 30–50% |
| Fourth consecutive (unrotated) | 5,000–15,000 | 50–80% |

A single season of legume cover crop (Mucuna pruriens) as a non-host:
- Reduces egg population by 60–80%
- Cost of legume seed and incorporation: ~FJD 80–120/acre
- Cost of nematicide treatment (fumigation): ~FJD 400–800/acre
- CoKG impact: rotation prevents the nematicide cost entirely

**Rotation is the cheapest input there is.**

### Fusarium Wilt Persistence in Soil

Fusarium oxysporum survives in soil as chlamydospores — thick-walled, desiccation-resistant structures that remain viable for up to 10 years even in the absence of a host plant. Key facts:

- Spores concentrate around infected root debris and do not migrate far horizontally
- Once soil temperature exceeds 30°C (common in Fiji's lowlands Apr–Nov), Fusarium activity accelerates dramatically
- Breaking the cycle by removing the host for 60–90 days does not kill spores — it starves them by denying root exudates that trigger germination
- Antagonistic microorganisms (Trichoderma spp., Pseudomonas fluorescens) increase in the absence of the host crop, creating biological suppression

### The Cascade Effect of Monoculture Failure

In the context of Teivaka's farms:
- F001-PU002 grows CRP-EGG (active cycle). If the same PU replants eggplant immediately after harvest without the 60-day Solanaceae rest, the first indicator is reduced germination (nematodes attack seedling roots). Yield loss reaches 40% by the second consecutive eggplant cycle.
- At F001's scale (~4 active acres), a 40% yield loss on CRP-EGG directly impacts CoKG: if CRP-EGG CoKG was FJD 1.80/kg at normal yield, it climbs to FJD 3.00/kg at 40% yield loss — the crop becomes unprofitable.
- The rotation engine exists to prevent this scenario automatically.

---

## Quick Reference — Rotation Matrix (Key Pairings)

| Previous Crop → | CRP-TOM | CRP-EGG | CRP-CAB | CRP-CAS | CRP-LBN | CRP-FRB | CRP-KAV | LIV-API |
|----------------|---------|---------|---------|---------|---------|---------|---------|---------|
| **CRP-TOM** | BLOCK (60d) | BLOCK (60d) | OK | OK | PREF | PREF | COND | OVERLAY |
| **CRP-EGG** | BLOCK (60d) | BLOCK (60d) | OK | OK | PREF | PREF | COND | OVERLAY |
| **CRP-CAB** | OK | OK | BLOCK (60d) | OK | PREF | PREF | OK | OVERLAY |
| **CRP-CAS** | OK | OK | OK | BLOCK (180d) | OK | OK | COND | OVERLAY |
| **CRP-LBN** | OK | OK | OK | OK | OK (30d) | OK (30d) | OK | OVERLAY |
| **CRP-DAL** | OK | OK | OK | OK | OK | OK | COND | OVERLAY |
| **CRP-SPT** | OK | OK | OK | OK | PREF | PREF | OK | OVERLAY |
| **CRP-GIN** | OK | OK | OK | OK | PREF | PREF | OK | OVERLAY |

*This table is illustrative — the full 1,444-rule matrix in shared.actionable_rules covers all 49×49 production combinations.*

---

## validate_rotation() Function Signature

```python
async def validate_rotation(
    pu_id: str,
    proposed_production_id: str,
    proposed_planting_date: date,
    db: AsyncSession
) -> RotationValidationResult:
    """
    Validates whether a new production cycle can be started on a given PU.

    Args:
        pu_id: Production Unit ID (e.g., "F001-PU001")
        proposed_production_id: What crop is proposed (e.g., "CRP-EGG")
        proposed_planting_date: When the farmer wants to plant
        db: Async database session with tenant_id set in context

    Returns:
        RotationValidationResult containing:
          - allowed: bool
          - enforcement_decision: ALLOWED | WARNED | BLOCKED
          - rule_status: PREF | OK | AVOID | BLOCK | COND | OVERLAY | N/A
          - days_short: int (0 if allowed)
          - earliest_allowed_date: date | None
          - alternatives: List[AlternativeProduction]
          - override_available: bool
          - override_role_required: str | None

    Raises:
        RotationDataMissingError: if no prior cycle found for PU (new land — OK to proceed)
        RotationBLOCKError: not raised — BLOCK is returned as allowed=False, not exception
    """
```
