# FIJI FARM INTELLIGENCE — TIS Knowledge Layer
**Document Type:** TIS Grounded Intelligence Context  
**Purpose:** Injected into every TIS Knowledge Broker call as the base agricultural intelligence layer. Ensures TIS answers are grounded in real Fiji farming conditions — not generic international advice.  
**Standard:** Every answer generated from this document must pass the "experienced Fiji farmer test" — a farmer with 20+ years in Serua Province or Kadavu Island should recognize the advice as correct for their conditions.  
**Last Updated:** April 2026  
**Maintained by:** Teivaka Development Team  

---

## SECTION 1 — OPERATING ENVIRONMENT

### 1.1 Fiji Climate and Seasons

Fiji sits between 15°S–22°S. Two distinct seasons govern all farm decisions:

**Wet Season (November–April)**
- Rainfall: 1,800–3,500mm depending on location and island
- Temperature: 27–34°C day, 22–26°C night
- Humidity: 80–90%
- Cyclone window: December–April (Category 1–5 cyclones possible)
- Disease pressure: HIGH (fungal diseases, bacterial wilts, downy mildew)
- Pest pressure: MEDIUM-HIGH (fruit borer, armyworm, aphid)
- Best for: Root crops (cassava, dalo, kumala), kava establishment, cover crop incorporation, nursery work
- Avoid: Chemical spraying during heavy rain (wash-off), harvest during cyclone watches

**Dry Season (May–October)**
- Rainfall: 400–900mm; F002 (Kadavu) receives more than F001 (Serua) due to island orographic effect
- Temperature: 22–28°C day, 16–20°C night
- Humidity: 60–75%
- Disease pressure: LOWER (but spider mite and powdery mildew increase in dry)
- Pest pressure: HIGH for spider mite, thrips
- Best for: All annual vegetables (eggplant, tomato, capsicum, cabbage, beans), honey harvest, pest control applications
- Optimal spray window: 6am–9am before wind picks up; avoid midday heat

**Transitional Periods (April–May and October–November)**
- High variability; unseasonal rain disrupts spray programs
- Watch bacterial wilt pressure as humidity stays high
- Best for nursery preparation for dry season crops

---

### 1.2 F001 — Save-A-Lot Farm, Korovou, Serua Province, Viti Levu

**Farm Facts:**
- Size: 83 acres total; approximately 10–15 acres under active cultivation, 70+ acres idle
- Elevation: Low-lying alluvial flats, 10–40m ASL
- Soil type: Serua alluvial clay-loam — dark, high organic matter, excellent fertility but prone to waterlogging in low zones during wet season
- pH: 5.8–6.5 typical; test annually; lime to 6.2 for brassicas
- Water: Near Serua River system; irrigation possible via pump; flood risk in lowest plots during Category 2+ cyclone rainfall
- Connectivity: Moderate 3G/4G via Vodafone Fiji; workers can submit logs during the day
- Distance to Suva: Approximately 35km via Queens Road; 45-minute drive
- Land tenure: iTaukei lease (NLTB/ILTB), operated by Teivaka, land owned by Nayans family
- Key nearby markets: Nayans Supermarket chain (direct buyer), Suva Municipal Market (30 min), Sigatoka Farmers Market (60 min), Pacific Harbour hotels (20 min)
- Key input supplier: Pacific Agri Suva, Indofiji Ltd, RB Patel Group

**F001 Soil Notes for TIS:**
- High phosphorus retention in clay fraction — use DAP (18-46-0) at establishment, not urea alone
- Organic matter is naturally high; prioritize potassium for fruit-bearing crops (eggplant, tomato)
- Avoid planting Solanaceae family in same block two consecutive cycles — bacterial wilt builds rapidly in warm clay soils
- Low-lying zones (nearest the river) suit cassava, dalo, and swamp taro; higher zones better for eggplant and dryland crops

**F001 Current Active Crops:**
- Eggplant on PU002 and PU003 (primary revenue crop)
- Cassava on PU001 (PU001 = lower alluvial zone)
- Apiculture on PU011 (4 hives: HIV-F001-001 through HIV-F001-004)

---

### 1.3 F002 — Viyasiyasi Farm, Kadavu Island

**Farm Facts:**
- Island: Kadavu Island, approximately 100km south of Suva; Fiji's 4th largest island
- Elevation: Mixed — coastal flats and volcanic slopes; kava grown on well-drained slopes
- Soil type: Volcanic loam — excellent drainage, good structure, lower clay content than F001
- pH: 5.5–6.2 typical; slightly acidic; good for kava and pineapple
- Water: Good natural rainfall (3,000mm+ per year at Kadavu); limited irrigation infrastructure; mostly rainfed
- Connectivity: LIMITED — patchy 3G, many field areas have no data; workers must operate offline and sync at village or jetty
- Access: Boat or light aircraft only; primary supply route via Sea Master Shipping from Suva (2–5 days lead time depending on weather and ferry schedule)
- Labor: No permanent workers; casual workers booked from mainland via WorkerBookingQueue; all worker transport requires ferry coordination
- Key operational risk: Supply stock depletion — if any input runs below (lead_time_days + 7), immediate ferry booking required
- Land tenure: Customary land; operating under community arrangement with Viyasiyasi village

**F002 Current Active Crops:**
- Kava on PU006 and PU007 (4-year cycle; Kadavu kava commands premium export price)
- Pineapple on PU004 (F002-PU004; Kadavu volcanic soil ideal for pineapple)
- Goats on PU003 (8 goats: LIV-F002-001 through LIV-F002-008)

**F002 Advice Rule for TIS:**
When advising on F002 operations, always factor in:
1. Input availability (is there enough stock on island? when is next ferry?)
2. No permanent worker (any task requiring skilled labor needs advance booking)
3. Offline-first reality (workers may not receive alerts immediately)
4. Kadavu's reliable year-round rainfall (less irrigation concern than F001, higher fungal pressure year-round)

---

## SECTION 2 — ACTIVE CROP PROTOCOLS (MVP CROPS)

### 2.1 Eggplant / Baigan (CRP-EGG) — F001-PU002 and F001-PU003

**Fiji Common Names:** Eggplant, Baigan (Fiji Hindi communities), Brinjal  
**Active on:** F001 (Save-A-Lot Farm, Serua Province)  
**Primary Revenue Crop for F001**

#### Variety Selection for Fiji
- **Long Purple / Black Beauty** — most commonly grown in Serua Province; good performance in Fiji's warm wet season
- **Hybrid F1 varieties** (from Pacific Agri or through Philippines import): higher yield potential, better heat tolerance, preferred for Grade A commercial production
- Avoid watery/disease-susceptible varieties; Serua's humidity demands disease-resistant genetics

#### Planting and Establishment
- **Best planting season for Serua:** April–July (dry season start); avoids peak wet season bacterial wilt pressure
- Nursery: Sow seed in seedling trays; germinate 7–10 days; transplant at 4-leaf stage (21–28 days)
- **Spacing:** 75cm x 60cm in rows (approximately 3,600 plants/acre) for Serua alluvial clay soil; wider spacing (90cm x 60cm) in heavier soils to improve airflow and reduce disease
- Plant on raised beds or mounds in F001's lower alluvial zones — standing water kills eggplant within 48 hours
- Apply basal fertilizer at transplanting: 100kg/acre DAP (18-46-0) in planting hole

#### Nutrition (F001 Conditions)
- **Week 1–3:** Establishment fertilizer: urea (46-0-0) side-dress at 30kg/acre
- **Week 4–6 (vegetative growth):** Compound NPK 15-15-15 at 80kg/acre; Serua soil responds well to balanced NPK at this stage
- **Week 7 onwards (flowering/fruiting):** Switch to high-K fertilizer — CAN (26-0-0) + Muriate of Potash (0-0-60) at 40:20kg/acre; potassium is critical for fruit set and Grade A skin quality
- **Foliar feeding:** Solubor (boron) at 1g/L every 21 days during fruiting; boron deficiency causes poor fruit set on Serua clay soils

#### Irrigation
- Drip or furrow; never overhead irrigation (overhead water on leaves promotes bacterial wilt and leaf diseases)
- F001: Pump from Serua River system; irrigate every 3–4 days in dry season; reduce to weekly during wet season
- Critical: Do not allow water stress during flowering (causes flower drop)

#### Pest Management — Fiji Conditions

**Fruit Borer (Leucinodes orbonalis) — PRIMARY THREAT in Fiji**
- The single most damaging pest of eggplant in Fiji; worse in wet season and in humid lowlands like Serua
- Larvae bore into young shoots and fruits; entry hole sealed with frass (brown residue)
- Signs: drooping shoot tips, bore holes on fruit surface, premature fruit drop
- **Management:**
  - Remove and destroy all bored fruits immediately — do not leave on ground (pupates in soil)
  - Chemical control: **Karate Zeon (Lambda-cyhalothrin 50g/L)** at 20mL per 15L water; spray every 7 days from first flowering; concentrate spray on shoot tips and young fruit
  - Alternative: **Dimethoate 400EC** at 25mL per 15L water; systemic action, effective on borers inside young shoots; **WHD = 7 days — do NOT harvest within 7 days of application**
  - Pheromone traps for monitoring (available from Pacific Agri): set 2 traps per acre; spray when catch exceeds 5 moths per trap per week
- In severe infestations (wet season), spray twice per week

**Bacterial Wilt (Ralstonia solanacearum) — DEVASTATING, NO CURE**
- Most destructive disease of eggplant in Fiji's tropical conditions; Serua Province's warm, moist alluvial soil creates ideal conditions
- Signs: sudden wilting of entire plant (not gradual); cut stem near base — white bacterial ooze visible; plant dies within 3–7 days
- **No chemical cure once infected** — affected plants must be uprooted and removed from field immediately; do not compost
- Prevention only:
  - Strict crop rotation — minimum 60-day rest for all Solanaceae family (eggplant, tomato, capsicum, chilli) on the same plot
  - Use drip irrigation only — never overhead (splashing spreads bacteria)
  - Avoid waterlogging — improve drainage on low-lying F001 plots with raised beds
  - Soil solarization (black plastic mulch during bare fallow between cycles) reduces bacterial load
  - If bacterial wilt appears: immediately notify farm manager; decommission that PU from Solanaceae for minimum 180 days

**Spider Mite (Tetranychus urticae) — Dry Season Threat**
- Appears when humidity drops and temperature rises; F001's dry season (May–September) is high-risk period
- Signs: Fine webbing on undersides of leaves; leaves turn bronze/silver and drop; plant looks dusty
- **Vertimec (Abamectin 18g/L)** at 10mL per 15L water; apply to undersides of leaves; rotate with other miticides to prevent resistance
- WHD for Vertimec on vegetables: 3 days

**Aphids and Whitefly**
- Vectors of mosaic viruses; monitor with yellow sticky traps
- **Confidor (Imidacloprid 200SL)** at 10mL per 15L water; soil drench at transplanting for systemic protection; do not spray during flowering (harms pollinators including F001's beehives)
- WHD: 7 days

#### Harvest Protocols
- First harvest: 65–85 days after transplanting depending on variety and conditions
- **Grade A specification (for Nayans supermarket and hotel buyers):** 250–400g fruit, uniform deep purple/black skin, no blemishes, no bore holes, smooth skin, calyx intact
- **Grade B (Suva Municipal Market):** 150–250g or fruit with minor blemishes; still sellable but lower FJD/kg
- Harvest every 3 days at peak production — do not allow fruit to overripen (seeds mature, skin dulls, market value drops significantly)
- Handle fruit carefully; bruising causes rapid skin discoloration (Grade A → Grade B within hours in Fiji's heat)
- Pack in ventilated crates; transport to Nayans by 6am for freshness

#### Expected Performance at F001
- Days to first harvest: 70–80 days (Fiji conditions; slightly longer than textbook due to wet season humidity effects on fruit set)
- Yield (good dry season cycle): 4,000–7,000 kg/acre
- FJD Price (dry season peak, Grade A, direct to Nayans): FJD 1.80–2.50/kg
- FJD Price (wet season, Grade B, Suva Market): FJD 1.20–1.50/kg
- Best cycle timing: Plant April; harvest July–September (peak dry season; best price, lowest disease pressure)

---

### 2.2 Cassava / Tavioka (CRP-CAS) — F001-PU001

**Fiji Common Names:** Tavioka, Cassava  
**Active on:** F001-PU001 (lower alluvial zone at Save-A-Lot Farm)  

#### Varieties for Fiji
- **Senikau** — the most widely grown variety in Fiji; 8–9 month maturity; high starch content; suits lowland alluvial soils like PU001
- **Leka** — shorter cycle (6–7 months); lower yield but faster cash recovery; suited to drier conditions
- **Hybrid/improved varieties** from SPC Pacific Community: available through Fiji Ministry of Agriculture extension officers; higher yield potential (18,000+ kg/acre possible)
- For F001 PU001 conditions: Senikau or similar tall vigorous variety suited to alluvial clay soil

#### Planting
- Use hardwood stem cuttings, 25–30cm long, 3–4 nodes; use mature stems from middle portion of plant (not tip, not base)
- Plant at 45° angle, 2–3 nodes below soil surface; horizontal planting increases shoot production but reduces root formation
- **Spacing:** 1.0m x 1.0m (approximately 4,000 plants/acre) for F001 conditions; wider spacing (1.2m x 1.0m) in waterlogged-prone zones
- **Best planting time for F001:** November–December (start of wet season for establishment) or May–June (early dry season with supplemental irrigation for first 30 days)
- Apply Muriate of Potash (0-0-60) at 40kg/acre at planting — cassava is highly potassium-responsive; F001's alluvial soil benefits significantly

#### Nutrition
- Cassava is a "mining crop" — it extracts large amounts of potassium and some nitrogen from soil
- **Week 4–6:** Urea (46-0-0) at 40kg/acre side-dress for vegetative establishment
- **Month 3:** NPK 15-15-15 at 60kg/acre
- **Month 5–6:** Second application Muriate of Potash (0-0-60) at 30kg/acre to support root development
- Do NOT over-fertilize with nitrogen (causes excessive top growth at expense of root development)

#### Disease Management — Fiji
**Cassava Mosaic Disease (CMD) — Fiji's Primary Cassava Disease**
- Virus spread by whiteflies; recognized by mosaic pattern of yellow-green mottling on leaves; stunted growth; reduced yield
- **Prevention:** Use clean, virus-free planting material only; if buying stems, visually inspect for mosaic symptoms; reject any mottled stems
- **Management:** Remove and destroy infected plants immediately; control whitefly population with Confidor (Imidacloprid) at 10mL/15L water on young plants only

**Root Rot (Phytophthora)**
- In waterlogged conditions; F001's lower alluvial zones are at risk in peak wet season
- Plant on raised rows in flood-prone zones; improve drainage

#### Harvest
- **180–270 days** (Senikau variety: 8–9 months for F001 conditions)
- Signs of maturity: lower leaves yellow and drop naturally; dig test sample — roots should be firm, white, minimal discoloration
- Harvest before 10 months to avoid woody root development (reduces starch and eating quality)
- **FJD Market Price:** FJD 0.40–0.90/kg (stable commodity; F001 supplies Nayans and Suva Municipal Market)
- **Value-add opportunity:** Cassava flour processing adds FJD 2.50–4.50/kg equivalent; potential investment for Phase 2
- Post-harvest rotation rule: **180-day rest** after cassava before cassava again on same PU (Euphorbiaceae family rule)

---

### 2.3 Kava / Yaqona (CRP-KAV) — F002-PU006 and F002-PU007

**Fiji Common Names:** Yaqona (ceremonial), Kava (commercial)  
**Active on:** F002-PU006 and F002-PU007 (Viyasiyasi Farm, Kadavu Island)  
**Cultural Status:** CRITICAL — Kava is central to iTaukei cultural life. It is not merely a commodity. Handle protocols, advice, and field operations with respect for its cultural significance.

#### Why Kadavu Kava Commands Premium Prices
Kadavu Island kava is widely regarded in Fiji and internationally as premium-grade yaqona. The volcanic soil, high rainfall, and growing conditions on Kadavu produce high-kavalactone content root material. Kadavu kava fetches FJD 35–60/kg dry root in export markets (compared to FJD 15–25 for standard Fiji kava). This premium must be preserved — harvest timing, processing, and market relationships are critical to maintaining this reputation.

#### Variety
- **Vanuatu noble varieties** (Boroguru, Palarasul): widely used in commercial Fiji kava production; Kadavu farmers traditionally grow local varieties adapted to island conditions
- For F002: use locally-adapted Kadavu varieties where available; do NOT substitute with waka (lateral root) varieties from other regions, as this affects both quality and market premium

#### Establishment (Year 1)
- Plant slips or stem cuttings at start of wet season (October–January)
- **Spacing:** 2m x 2m minimum on slopes; 2.5m x 2m on steeper Kadavu hillsides
- Kava requires well-drained soil — plant on slopes at Viyasiyasi, not in valley floors (root rot kills plants in first year if drainage is poor)
- Provide light shade for first 6 months (can intercrop with banana or taro as shade cover; remove shade when kava establishes)
- Mulch heavily around base — Kadavu's rainfall washes soil nutrients; mulch conserves moisture and reduces erosion

#### Growth Management (Year 1–4)
- **Minimal chemical inputs required** — kava is naturally robust on volcanic Kadavu soil
- Weed management: clear competing vegetation for first 18 months; after kava canopy closes, weeding frequency reduces
- Fertilizer: Light application of NPK 10-10-10 at 30kg/acre at Year 1 establishment and again at Year 2 (October); do NOT over-fertilize — excess nitrogen produces leafy growth at expense of root kavalactone content
- Monitor for kava dieback (Phytophthora cinnamomi) — signs are yellowing and wilting despite adequate soil moisture; improve drainage if detected; no effective chemical cure
- Year 2–3 maintenance: remove dead stems, maintain mulch, control vines and climbing weeds

#### Harvest (Year 4 Minimum)
- **Minimum 4 years** from planting for commercial quality; premium Kadavu kava for export commands highest price at 5–6 years
- Signs of harvest readiness: stems have ring formation, root mass is substantial when test-dig is done
- **Harvest method:** Uproot entire plant. Separate lateral roots (waka — highest kavalactone, highest price) from stem base (lewena — lower kavalactone, lower price). Process separately if possible for premium pricing.
- **Drying:** Immediate drying after harvest is critical. Wash roots, split large roots for faster drying. Sun-dry 7–14 days. Final moisture content should be 10–12% (roots snap cleanly). Do NOT allow wet kava to sit unprocessed — mold destroys value.
- **Packaging for ferry transport (F002):** Double-bag in burlap/woven bags; label with farm ID and harvest date; transport in covered area of ferry to prevent moisture re-absorption
- **Market price (Kadavu premium dry root, 2026):** FJD 35–60/kg; export grade through kava dealers at Suva Municipal Market or direct to exporters

#### Inactivity Alert Threshold for F002 Kava
- Standard TFOS alert for "no activity on PU" fires at 7 days
- Kava overrides this: **inactivity threshold = 180 days** (kava requires virtually no daily intervention in years 2–4)
- Only fire alert if: no inspection logged in 180 days, OR anomalous activity detected (signs of disease, cyclone damage, theft)

---

### 2.4 Pineapple / Painapolo (FRT-PIN) — F002-PU004

**Fiji Common Names:** Painapolo, Pineapple  
**Active on:** F002-PU004 (Viyasiyasi Farm, Kadavu Island)

#### Why F002 is Ideal for Pineapple
Kadavu Island's well-drained volcanic soils, reliable rainfall, and tropical temperatures create near-perfect pineapple growing conditions. F002 pineapples have the potential for export quality designation. The challenge is logistics: transporting mature pineapple from Kadavu to Suva markets requires careful ferry timing to avoid bruising.

#### Establishment
- **Planting material:** Slips (from base of fruit) preferred for uniformity; crowns (from top of fruit) also work but take longer
- Plant October–January (wet season establishment)
- **Spacing:** 30cm x 30cm in double rows, 1m between row-pairs (approximately 15,000 plants/acre); intensive planting for Kadavu's well-structured volcanic soil
- Plant with base buried 10cm; firm soil around base
- Mulch with sugarcane trash or dry grass to suppress weeds and retain moisture (reduced irrigation need at F002)

#### Nutrition
- Pineapple is bromeliad — unusual nutritional requirements
- **Month 1–3:** Light urea foliar spray (2% solution) monthly; apply to base of plant and soil
- **Month 4–8:** NPK 15-15-15 granular at 40kg/acre; broadcast and water in
- **Month 9–12:** Increase potassium — CAN + Muriate of Potash (0-0-60) at 20:20kg/acre
- **Flower induction (if needed):** Ethephon (Ethrel) 480 SL at 1mL/L water; pour 50mL into crown of each plant at 12–14 months to synchronize flowering. This is standard commercial practice in Fiji pineapple production. After ethephon application, harvest is 5–6 months later.

#### Disease Management
**Heart Rot (Phytophthora heart rot)**
- Most serious pineapple disease; causes collapse of central growing point
- Signs: Water-soaked brown rot in crown; collapse of young leaves at center
- Prevention: Good drainage (Kadavu volcanic soil helps); do not overwater
- Drench: **Ridomil (Metalaxyl 25%WP)** at 25g per 15L water; apply to crown and soil around base; use preventively in first 3 months of wet season

**Mealybug Wilt** 
- Mealybugs transmit pineapple mealybug wilt-associated virus; widespread in Fiji
- Signs: Pinkish-red leaf color, inward curling of leaf margins, stunting
- Prevention: Inspect planting material before planting; dip slips in insecticide solution before planting
- **Dimethoate 400EC** at 25mL/15L; spray at soil level around plant base; WHD: 7 days (note: pineapple harvest is months after application so WHD is rarely a concern)

#### Harvest
- **First harvest: 18–20 months** from planting (540–600 days); F002 conditions typically on the faster end (18 months) due to consistent warm temperatures and rainfall
- Signs of maturity: skin color change from green to yellow-orange starting from base; fruit should give slightly when pressed; sweet smell develops
- **For ferry transport (F002 to Suva):** Harvest at 25–30% color change (slightly early); pineapple will ripen fully en route; prevents bruising damage
- **Ratoon management:** After first harvest, maintain 1–2 best ratoon shoots per plant; remove excess. Second crop (ratoon crop) harvests 12–15 months later; third ratoon possible but yield declines.
- **FJD Price:** FJD 0.60–1.20/kg; Kadavu pineapple can command premium at Suva Municipal Market (FJD 1.00–1.50/kg direct sale if marketed as "Kadavu Painapolo")

---

### 2.5 Apiculture / Honeybee (LIV-API) — F001-PU011

**Fiji Common Names:** Ni (Honeybee), Honey  
**Active on:** F001-PU011 (4 active hives: HIV-F001-001 through HIV-F001-004)  
**Secondary benefit:** Pollination service for F001 vegetable crops (eggplant, etc.)

#### Hive Setup at F001
- 4 hives positioned near eggplant plots for maximum pollination benefit
- Hives must be minimum 50m from any recently sprayed field — check chemical application records before any inspection (CRITICAL: Dimethoate and Karate Zeon are highly toxic to bees)
- Hive direction: face east or north-east; morning sun stimulates early foraging
- Provide water source within 100m of hives — bees need water for hive cooling; they will forage water sources regardless, provide clean water to prevent drowning in other sources

#### Inspection Protocol (Every 14 Days — RULE-022)
Every 14-day inspection must check and log:
1. **Brood health:** Healthy brood = capped in regular pattern, pearly white larvae. Unhealthy: sunken/punctured caps (European foulbrood), dark/musty larvae (American foulbrood — rare in Fiji but report immediately)
2. **Queen presence:** Look for eggs (small white grain in bottom of cell) — confirms queen laying within 3 days. If no eggs for 2 inspections in a row, queen may be lost; hive will die without intervention.
3. **Varroa mite check:** Place sticky board under hive for 24 hours; count fallen mites. >5 mites/day = treatment required. **This is the primary hive health threat in Fiji.**
4. **Honey stores:** Ensure at least 2 frames of capped honey in brood box as reserve; don't over-harvest and leave hive underfed
5. **Space availability:** If brood box is 80% full, add super (honey box) to prevent swarming
6. **Wax moth signs:** Webbing, silk tubes in frames, larvae = clean hive immediately

#### Varroa Mite Management (PRIMARY THREAT)
Varroa destructor is present in Fiji and is the single greatest threat to hive viability. F001's 4 hives need active Varroa management.
- **Treatment threshold:** >5 mites per day on sticky board
- **Organic treatment (no honey contamination):** Oxalic acid vaporization (requires oxalic acid + vaporizer; available from beekeeping suppliers in Suva) OR oxalic acid drizzle method; apply when brood is minimal (November–December transition)
- **Apivar strips (Amitraz):** Chemical treatment; insert strips between brood frames for 6–8 weeks; remove before honey harvest; effective but cannot use during honey flow season
- Prevention: Ensure queens are young (replace queen every 2–3 years); young queens are genetically more resistant and maintain hygienic behavior

#### Honey Harvest (Every 30 Days — RULE-023)
- Harvest when honey frames are >80% capped (capped honey = correct moisture content; uncapped = too wet, will ferment)
- Morning harvest: bees are calmer; smoke hive entrance and under lid before opening
- F001 honey is "wildflower/vegetable forage" honey — mild flavor, light color; premium local raw honey market in Fiji
- **Expected yield per hive:** 10–20kg per harvest (Fiji conditions); F001's diverse crop base (eggplant, cassava flowering, surrounding vegetation) supports strong honey production
- **FJD Price:** FJD 18–40/kg raw honey; direct sale at farm gate or to Suva health food market commands premium; wholesale to hotels at FJD 18–22/kg
- Store honey in sealed glass jars away from sunlight; shelf life 2 years properly sealed

#### Weather Alert for Beehives
- **Cyclone warning:** Move hives to shelter (shed or strong structure) if Category 2+ warning issued; or lay hives on their backs with entrance covered (reduces wind resistance); secure straps around hive bodies

---

### 2.6 Goats / Meme (LIV-GOA) — F002-PU003

**Fiji Common Names:** Meme (goat)  
**Active on:** F002-PU003 (Viyasiyasi Farm, Kadavu Island)  
**Current herd:** 8 goats (LIV-F002-001 through LIV-F002-008)

#### Breed Context for Fiji
- Most Fiji goats are Fiji local breed crosses, often with some Boer genetics introduced
- Boer x Fiji local crosses are well-adapted to Fiji's tropical conditions; good meat yield, heat tolerance
- For F002 Kadavu: island conditions (salt air, volcanic terrain, tropical vegetation) suit hardy local-type goats better than purebred imports

#### Feeding at F002
- **Primary feed:** Browse on island vegetation; Kadavu's tropical vegetation provides good year-round grazing
- **Supplement with:** Napier grass (SUP-NAP) if established on F002; cassava leaves (high protein); sweet potato vines; banana leaves
- **Mineral lick:** Provide loose mineral salt block at all times; island soil can be iodine-deficient; mineral supplementation prevents deficiencies
- **Do not allow goats to graze on:** Cassava leaves in large quantities (cyanogenic glycosides — toxic in excess); certain ferns; avoid overgrazing which causes soil erosion on Kadavu's sloped terrain

#### Health Management

**Internal Parasites (PRIMARY HEALTH THREAT in Fiji)**
Barber pole worm (Haemonchus contortus) is the most dangerous internal parasite of goats in Fiji's warm tropical conditions. Heavy infections cause anemia and death, particularly in young animals. Fiji's humidity creates ideal conditions for larval survival on pasture.

- **FAMACHA scoring** at every 30-day weigh-in: Pull down lower eyelid — color chart 1 (red, healthy) to 5 (white, severe anemia). Score 4–5 requires immediate treatment.
- **Drench with:** Ivermectin (available from Pacific Agri, Suva) at 0.2mg/kg live weight; or Albendazole at 5mg/kg live weight
- Rotate drench products to prevent resistance — use Ivermectin for one treatment, Albendazole for the next
- Strategic drenching: after heavy wet season rains (larvae surge); and 4 weeks after kidding (high-stress period for does)
- **Do NOT drench based on calendar alone** — use FAMACHA; over-drenching creates resistance; under-drenching kills animals

**Contagious Ecthyma (Orf)**
- Common in Fiji goat herds; viral; causes crusty lesions on lips, gums, and teats; painful but usually self-limiting (3–4 weeks)
- Highly contagious between goats and can infect humans (wear gloves when handling infected animals)
- No effective treatment; supportive care; isolate affected animals to prevent spread
- **Notify farm manager immediately if any animal shows lip lesions**

**Foot Rot**
- Common in wet season and on wet ground (F002's year-round rainfall creates risk)
- Signs: Severe lameness, foul smell from hooves, separation of hoof wall from tissue
- Treatment: Hoof trimming, footbath in copper sulphate solution (5% copper sulphate in water), Oxytetracycline injection for severe cases
- Prevention: Rotate grazing areas; avoid extended periods on wet/muddy ground

#### 30-Day Weight Check Protocol (RULE-019)
- Weigh all 8 goats every 30 days
- Record individual weights for each animal (LIV-F002-001 through LIV-F002-008)
- Target weight gain: 50–80g/day for growing animals (kids); adult animals maintain weight ± 5%
- Weight loss >10% in any animal = health flag; investigate for worms, disease, or underfeeding
- Note: Since F002 has no permanent workers, weight checks must be coordinated with scheduled worker visits — plan worker ferry bookings to align with 30-day inspection dates

#### Vaccination Schedule (RULE-020)
- **Clostridial diseases (Enterotoxaemia / Pulpy kidney):** Vaccination every 6 months; Covexin 8 or similar multivalent clostridial vaccine from Pacific Agri Suva; carry on ferry with cold chain maintained
- **Foot and Mouth Disease:** Fiji is FMD-free zone; report any suspicious oral/foot lesions to Fiji Agriculture immediately
- **Newcastle Disease (for any poultry added later):** Not applicable to goats

#### Market Notes
- Fiji goat demand: HIGH at cultural events (iTaukei feasts, Diwali, Eid); Kadavu cultural events drive local demand
- Live weight price: FJD 10–18/kg liveweight; direct-to-buyer price at cultural events commands FJD 14–18/kg
- F002 advantage: Local Kadavu community demand means goats can sometimes be sold without ferry transport

---

## SECTION 3 — PEST, DISEASE, AND CHEMICAL REFERENCE

### 3.1 Chemicals Available in Fiji (TIS Must Only Recommend These)

The following chemicals are available through Pacific Agri (Suva), Indofiji Ltd, and major agri-retailers in Fiji. TIS must ONLY recommend chemicals from this list — not chemicals from Australian, NZ, or international pest management guides that may not be registered or available in Fiji.

#### Insecticides
| Product Name | Active Ingredient | Key Use in Fiji | WHD (Vegetables) |
|---|---|---|---|
| Karate Zeon | Lambda-cyhalothrin 50g/L | Fruit borer, caterpillar, aphid | 7 days |
| Dimethoate 400EC | Dimethoate 400g/L | Fruit borer, aphid, mites | 7 days |
| Confidor 200SL | Imidacloprid 200g/L | Whitefly, aphid, mealybug | 7 days |
| Vertimec 18EC | Abamectin 18g/L | Spider mite, leaf miner | 3 days |
| Malathion 50EC | Malathion 500g/L | General insect, aphid | 7 days |
| Lannate (Methomyl) | Methomyl 90% | Caterpillar, armyworm | 1 day |

#### Fungicides
| Product Name | Active Ingredient | Key Use in Fiji | WHD (Vegetables) |
|---|---|---|---|
| Mancozeb 80WP | Mancozeb 800g/kg | Early/late blight, downy mildew | 7 days |
| Kocide / Copper oxychloride | Copper compounds | Bacterial diseases, downy mildew | 7 days |
| Ridomil Gold | Metalaxyl-M 40g/kg + Mancozeb | Phytophthora, downy mildew | 7 days |
| Topsin M | Thiophanate-methyl 700g/kg | Powdery mildew, grey mold | 7 days |
| Dithane M-45 | Mancozeb 80% | Alternaria, blight | 7 days |

#### Herbicides
| Product Name | Active Ingredient | Key Use in Fiji |
|---|---|---|
| Roundup / Glyphosate | Glyphosate 360g/L | Non-selective knockdown (inter-row only, not on crop) |
| 2,4-D Amine | 2,4-D dimethylamine | Broadleaf weed control in grasses/cassava |
| Gramoxone (Paraquat) | Paraquat 200g/L | Non-selective knockdown; restricted use — wear full PPE |

#### Fertilizers Available in Fiji
| Product | Analysis | Key Use |
|---|---|---|
| Urea | 46-0-0 | Nitrogen top-dressing all crops |
| DAP | 18-46-0 | Phosphorus at planting |
| Muriate of Potash (MOP) | 0-0-60 | Potassium for fruit crops, cassava |
| NPK 15-15-15 | 15-15-15 | Balanced growth fertilizer |
| NPK 10-10-10 | 10-10-10 | Lighter balanced fertilizer (kava, perennials) |
| CAN | 26-0-0 | Calcium ammonium nitrate; safer on soils than urea |
| Sulphate of Ammonia | 21-0-0 | Acidifying nitrogen; good for kava on Kadavu |
| Borax | Boron 11% | Micronutrient for fruit set (eggplant, capsicum) |
| Dolomite | Ca+Mg | Lime for soil pH correction |

### 3.2 Chemical Application Safety Rules for TIS

TIS must apply these rules in all chemical advice:
1. **WHD (Withholding Period) is absolute** — never recommend harvesting within the WHD of any applied chemical
2. **Bee safety at F001:** Never recommend Dimethoate, Karate Zeon, or Confidor within 48 hours of beehive inspection or during peak flower-visit periods (6am–11am). If bees are actively foraging near spray area, delay spray until evening.
3. **PPE always:** Recommend long sleeves, gloves, eye protection, and face mask for any pesticide application; in Fiji's heat, this is often skipped — TIS must always remind
4. **No mixing without checking compatibility:** Mancozeb + Copper products can cause phytotoxicity; do not recommend tank mixes unless known-safe combination
5. **Spray timing:** Recommend 6am–9am spray window (cool, low wind, dew helps coverage) or after 4pm; avoid 10am–3pm (heat causes evaporation and phytotoxicity)

---

## SECTION 4 — FIJI MARKET INTELLIGENCE

### 4.1 Key Buyers for Teivaka Farms

| Buyer | Code | Type | Crops Purchased | Notes |
|---|---|---|---|---|
| Nayans Supermarket chain | CUS-003 to CUS-007 | Related-party buyer | Eggplant, cassava, honey, kava | Primary buyer for F001; related-party (land owner); flag all transactions |
| Suva Municipal Market | CUS-001 | Wholesale/retail market | All vegetables, cassava, dalo, honey | Daily market; Grade B acceptable |
| Sigatoka Farmers Market | CUS-002 | Wholesale/retail market | Vegetables, root crops | Saturday market; volume buyer |
| Pacific Harbour Hotels | — | Premium buyer | Grade A vegetables, honey, specialty crops | Premium price; strict quality requirements |
| Kava exporters (Suva) | — | Export market | Kava (dry root) | Kadavu kava fetches premium; export license required |

### 4.2 Grade Standards — Eggplant (for TIS Harvest Advice)
- **Grade A:** 250–400g, uniform deep purple/black skin, no blemishes, no bore holes, stem/calyx intact → Nayans and hotel buyers → FJD 1.80–2.50/kg
- **Grade B:** 150–250g or minor surface blemishes → Suva Municipal Market → FJD 1.20–1.50/kg  
- **Grade C / Reject:** Bored fruit, overripe (seedy, skin dulling), undersize (<150g) → Animal feed or discard → No FJD value

### 4.3 Seasonal Price Patterns (FJD, 2026 Reference)

| Crop | Low Season Price | Peak Season Price | Peak Timing | TIS Planting Advice |
|---|---|---|---|---|
| Eggplant | FJD 1.20/kg | FJD 2.50/kg | Jul–Sep (dry) | Plant April for July peak |
| Cassava | FJD 0.40/kg | FJD 0.90/kg | Year-round stable | No significant seasonality |
| Kava (dry root) | FJD 15/kg | FJD 60/kg | Year-round; quality-driven | Kadavu premium year-round |
| Pineapple | FJD 0.60/kg | FJD 1.50/kg | Nov–Jan | Ferry timing to Suva matters |
| Honey (raw) | FJD 18/kg | FJD 40/kg | Jun–Sep | Dry season = higher honey flow |
| Goat (live) | FJD 10/kg | FJD 18/kg | Cultural event season | Book sales to iTaukei events |
| Tomato | FJD 1.50/kg | FJD 3.50/kg | Jun–Aug (dry) | High risk crop; high reward |
| Dalo (Dasheen) | FJD 0.80/kg | FJD 2.00/kg | Year-round; festival peaks | Strong NZ/AUS export diaspora market |

---

## SECTION 5 — EXTENDED CROP INTELLIGENCE (PHASE 2 READY)

The following crops are not currently active at F001 or F002 but are documented in the system and will be activated in Phase 2. TIS should be able to answer questions about these from this context, even before formal KB articles are validated.

### 5.1 Tomato (CRP-TOM) — Highest Risk / Highest Reward Vegetable in Fiji
- **Fiji's most price-volatile vegetable** — FJD 1.50 in glut; FJD 3.50 in scarcity
- Primary risk: Bacterial wilt (Ralstonia solanacearum) — even faster and more devastating than on eggplant; Fiji's soils in humid lowlands have high bacterial wilt pressure; one infected plant can contaminate a plot for years
- Rule: Tomato must NEVER follow tomato, eggplant, capsicum, or chilli on same plot within 60 days (Solanaceae family)
- Staking required: All varieties must be staked with bamboo stakes at 1.2m intervals; Fiji's wind + heavy fruit load drops unstaked plants
- Best cycle: Plant April–May for July–August harvest (peak dry season price)
- F001 potential: High — Serua Province's proximity to Suva hotels creates premium Grade A market; however do not plant on a plot that has had bacterial wilt history

### 5.2 Dalo / Taro (CRP-DAL and CRP-DTN) — Cultural Staple
- Dalo (dasheen/Colocasia esculenta) is culturally essential in Fiji — required at all iTaukei feasts and funerals
- Fiji exports significant quantities to NZ, Australia, and the USA for the Pacific diaspora market; export-grade dalo can fetch FJD 1.80–2.50/kg compared to FJD 0.80–1.40 local
- Primary disease risk: **Taro leaf blight (Phytophthora colocasiae)** — spreads rapidly in wet conditions and during cyclone events; entire fields can be wiped out within 2 weeks of infection
- No chemical cure once established; resistant varieties (Niue, Samoa varieties) are under development through SPC Pacific Community
- F001 potential: Low-lying alluvial zones near Serua River are good for dalo; plant November–January in wet season
- F002 (Kadavu) potential: Excellent — Kadavu's year-round rainfall and volcanic soil well-suited; Kadavu village communities already grow dalo for subsistence; commercial scale possible

### 5.3 Capsicum / Bell Pepper (CRP-CAP) — Premium Market Crop
- FJD 2.00–4.50/kg; among the highest-value annual vegetables in Fiji
- Significant demand from Pacific Harbour hotels and Suva restaurant trade
- Demanding crop: requires drip irrigation, staking, consistent nutrition, and low disease pressure
- Best grown under basic shelter/net structure to reduce disease and insect pressure; open-field capsicum in Fiji's wet season rarely achieves Grade A
- F001 potential: High-value trial crop; invest in 0.5 acre net house before scaling

### 5.4 Long Bean (CRP-LBN) — Preferred Rotation Partner
- One of the best rotation crops to follow Solanaceae family at F001
- Nitrogen-fixing roots restore soil fertility; reduces NPK fertilizer cost for following crop
- Very steady FJD 1.00–2.50/kg demand at Suva Market; fast cash crop (60–75 days)
- Low labor, low disease pressure, low investment — ideal filler crop between main cycles

### 5.5 Kumala / Sweet Potato (CRP-SPT) — Food Security and Market Crop
- Excellent drought tolerance; suited to F001's dry season without irrigation
- FJD 0.80–1.80/kg; steady market demand especially for orange-flesh varieties
- Edible leaves (rourou-style) provide additional market opportunity or farm food for workers
- Short cycle (90–120 days) — good quick-cash option between longer cycles

### 5.6 Ginger / Cago (CRP-GIN) — Export Opportunity
- Fiji ginger is export quality; organic certification possible
- FJD 2.50–5.00/kg; export market premium for certified organic Pacific ginger
- Primary risk: Pythium rhizome rot in waterlogged soil; NEVER plant in low-lying, poorly drained areas
- F001: Plant on raised beds only; F002: Kadavu volcanic soil with good drainage is ideal
- 8-month crop; requires 2-month post-harvest rest before ginger again on same plot

### 5.7 Turmeric / Rerega (CRP-TUR) — High Export Demand
- Internationally one of the highest-demand spices; Pacific organic turmeric commands premium
- FJD 3.00–7.00/kg; export price significantly higher for certified organic
- Very easy to grow; minimal pest pressure; requires well-drained soil
- Value-add: drying and grinding to powder adds FJD 10–25/kg equivalent value
- F002 (Kadavu) potential: Excellent; island isolation reduces chemical contamination for organic certification pathway

---

## SECTION 6 — SOIL AND NUTRITION MANAGEMENT

### 6.1 F001 Soil (Serua Province Alluvial)
- **Texture:** Clay-loam to clay; high water retention; some zones waterlog in heavy rain
- **pH range:** 5.8–6.5 (test annually; lime with Dolomite if below 5.8)
- **Organic matter:** Naturally high due to alluvial deposition; maintain with crop residue incorporation
- **Phosphorus:** High P-fixation capacity in clay fraction; use DAP at planting for fast P availability
- **Potassium:** Moderate; supplement for fruit-bearing crops (eggplant, tomato, pineapple)
- **Micronutrients:** Boron deficiency common for fruiting crops; apply Borax at FJD 3–5/L solution
- **Key issue:** Bacterial wilt accumulates in this warm, moist clay soil over time; strict rotation is soil health management, not just agronomic preference

### 6.2 F002 Soil (Kadavu Volcanic)
- **Texture:** Volcanic loam; excellent drainage and aeration; almost no waterlogging risk on slopes
- **pH range:** 5.5–6.2 (slightly more acidic; well-suited to kava and pineapple)
- **Organic matter:** High on forested slopes; lower in cleared cultivation areas; protect with mulch
- **Nutrients:** Good natural fertility on undisturbed volcanic soil; cultivation areas need annual NPK maintenance
- **Key advantage:** Superior drainage eliminates most root rot risks that affect F001; kava and pineapple perform significantly better here than on F001's clay

---

## SECTION 7 — CROP ROTATION INTELLIGENCE (TIS ADVISORY RULES)

### 7.1 Rotation Rules Summary (For TIS Advice)

When any farmer asks about what to plant next, TIS applies these rules:

**Solanaceae Family (Eggplant, Tomato, Capsicum, Chilli):**
- 60-day minimum rest before another Solanaceae on same plot
- Preferred follow-on crops: Long Bean (nitrogen-fixing), Cabbage (Brassicaceae), Cassava
- Never follow with another Solanaceae — bacterial wilt risk compounding

**Cucurbitaceae Family (Cucumber, Watermelon, Squash):**
- 45-day rest after Cucurbitaceae
- Follow with root crops or legumes

**Cassava (Euphorbiaceae):**
- 180-day rest after cassava before cassava again on same plot
- Exhausts potassium significantly; replenish with Muriate of Potash (MOP) before following crop

**Legumes (Long Bean, French Bean):**
- No rest required; these IMPROVE soil nitrogen for the following crop
- Always recommended as a bridge crop between heavy-feeding cycles

**Kava (Piperaceae):**
- Special long-cycle logic; rotation gate does not apply in the standard way
- Kava occupies a plot for 4+ years; rotation is managed by plot assignment, not cycle rotation

### 7.2 Quick Rotation Guide for TIS

| Previous Crop | Minimum Rest | Best Follow-On Crop | Why |
|---|---|---|---|
| Eggplant | 60 days | Long Bean | Nitrogen restoration after heavy feeder |
| Tomato | 60 days | Cassava or Cabbage | Breaks Solanaceae disease cycle |
| Cassava | 180 days | Eggplant or Tomato | Potassium replenished; Solanaceae does well |
| Capsicum | 60 days | Long Bean or Cucumber | Breaks Solanaceae cycle |
| Long Bean | 0 days | Any heavy feeder | Legume improves soil; no rest needed |
| Cabbage | 30 days | Eggplant or Tomato | Brassicaceae rest; Solanaceae thrives after |
| Cucumber | 45 days | Root crops or Legumes | Cucurbit disease break |

---

## SECTION 8 — CULTURAL AND OPERATIONAL CONTEXT

### 8.1 Kava (Yaqona) Cultural Protocols

TIS must be aware that kava (yaqona) is not merely an agricultural commodity in Fiji. It carries deep cultural, ceremonial, and social significance for iTaukei Fijians. When advising on kava:
- Never trivialize the harvest or suggest shortcuts that compromise quality — Kadavu premium kava's reputation is partly built on careful, traditional harvest practices
- Acknowledge cultural timing: kava harvest is often coordinated with community ceremonies
- Kava revenue from F002 PU006 and PU007 is the farm's most valuable long-term asset; protect quality above volume

### 8.2 F002 Ferry Logistics — TIS Must Always Factor This In

When advising on F002 operations, TIS must proactively consider:
- **Lead time for ANY input:** A recommendation to "spray Karate Zeon" is useless if the chemical is not on Kadavu; TIS should check stock levels (via farm context) before making spray recommendations for F002
- **Worker tasks:** Any task requiring skilled labor at F002 requires advance worker booking via ferry; TIS should note "ensure workers are booked for this task" when recommending labor-intensive activities
- **Ferry frequency:** Sea Master Shipping runs Suva–Kadavu; schedule varies; plan supply orders at least 14 days ahead
- **Proactive stock management:** If advising on an upcoming spray program or vaccination, TIS should recommend checking stock levels and ordering if below 21 days of supply

### 8.3 Relationships That Matter

| Party | Relationship | TIS Advisory Implication |
|---|---|---|
| Nayans Family | Land owner of F001 (iTaukei lease); related-party buyer | Profit share calculation affects F001 financial reporting; all Nayans sales are related-party transactions |
| Laisenia Waqa (W-001) | Permanent worker at F001 | Primary field data entry person; voice commands from W-001 are authoritative for F001 daily operations |
| Sea Master Shipping (SUP-012) | Ferry supplier for F002 | Any F002 input alert should reference Sea Master as the supplier to contact |
| Pacific Agri Suva | Primary chemical and input supplier | When recommending chemicals or fertilizers, note "available from Pacific Agri, Suva" |

---

## SECTION 9 — TIS ANSWER QUALITY STANDARD

Every answer TIS generates must meet this standard before delivery:

**The Experienced Fiji Farmer Test:**
If a Fijian farmer who has grown eggplant in Serua for 20 years, or harvested kava on Kadavu for 15 years, reads TIS's answer — they must nod, not frown.

**Specific Quality Checks:**
1. ✅ Uses local Fijian crop names (baigan, tavioka, yaqona, painapolo — not just English names)
2. ✅ References specific Fiji conditions (wet season/dry season timing, local soil types)
3. ✅ Recommends only chemicals available in Fiji by their local trade names
4. ✅ Uses FJD for all prices — never USD
5. ✅ Accounts for F002 ferry logistics when advising on Kadavu operations
6. ✅ Respects kava's cultural significance when advising on yaqona
7. ✅ References Fiji-specific pests (fruit borer, bacterial wilt, Varroa mite, barber pole worm)
8. ✅ Aligns timing advice with Fiji's wet/dry season calendar
9. ✅ Cites locally realistic yield and price ranges — not international benchmarks
10. ✅ Is actionable in under 200 words for a farmer standing in a field on their phone

**Source Labeling:**
- When drawing from this document: *"Based on Fiji agricultural practice..."*
- When drawing from a validated KB article: *"According to our [article title] protocol..."*
- When uncertain: *"Standard practice in Fiji is... but check with your local extension officer for your specific conditions."*

---

*This document is the TIS Grounded Intelligence Layer. It is injected into every Knowledge Broker system prompt. It represents the accumulated agricultural intelligence required to make TIS genuinely useful to Fiji farmers from Day 1, before formal KB article validation is complete.*

*Update this document as new market prices are confirmed, new pest threats emerge, new chemicals become available in Fiji, or farm-specific learnings accumulate from real operations at F001 and F002.*
