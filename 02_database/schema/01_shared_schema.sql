-- FILE: 02_database/schema/01_shared_schema.sql
-- Teivaka TFOS Shared Schema
-- All tables in this schema are read-only reference data shared across all tenants.
-- No tenant_id columns. Multi-tenancy is enforced in the tenant schema.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS shared;

-- =============================================================================
-- TABLE 1: shared.productions
-- Master list of all production types (crops, livestock, forestry, aquaculture)
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.productions (
    production_id           TEXT PRIMARY KEY,
    production_name         TEXT,
    local_name              TEXT,
    category                TEXT,
    plant_family            TEXT,
    lifecycle               TEXT,
    is_perennial            BOOLEAN,
    is_livestock            BOOLEAN,
    is_forestry             BOOLEAN,
    is_aquaculture          BOOLEAN,
    is_active_in_system     BOOLEAN DEFAULT true,
    notes                   TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO shared.productions
    (production_id, production_name, local_name, category, plant_family, lifecycle, is_perennial, is_livestock, is_forestry, is_aquaculture, is_active_in_system, notes)
VALUES
('CRP-WAT','WATERMELON','Tarawa','Annual Vegetable','Cucurbitaceae','Annual',false,false,false,false,true,'High-cash seasonal crop'),
('CRP-TOM','TOMATO','Tamato','Annual Vegetable','Solanaceae','Annual',false,false,false,false,true,'Core market crop, high demand'),
('CRP-EGG','EGGPLANT','Baigani','Annual Vegetable','Solanaceae','Annual',false,false,false,false,true,'Primary active crop F001'),
('CRP-CAP','CAPSICUM','Capsicum','Annual Vegetable','Solanaceae','Annual',false,false,false,false,true,NULL),
('CRP-CHI','CHILLIES','Rokete','Annual Vegetable','Solanaceae','Annual',false,false,false,false,true,NULL),
('CRP-CUC','CUCUMBER','Cucumber','Annual Vegetable','Cucurbitaceae','Annual',false,false,false,false,true,NULL),
('CRP-SCN','SWEET CORN','Boro dina','Annual Vegetable','Poaceae','Annual',false,false,false,false,true,NULL),
('CRP-FRB','FRENCH BEANS','French Beans','Annual Vegetable','Fabaceae','Annual',false,false,false,false,true,'Nitrogen fixer, good rotation crop'),
('CRP-LBN','LONG BEAN (YARDLONG BEAN)','Toa','Annual Vegetable','Leguminosae','Annual',false,false,false,false,true,'Nitrogen fixer'),
('CRP-CAB','CABBAGE','Kabici','Annual Vegetable','Brassicaceae','Annual',false,false,false,false,true,NULL),
('CRP-SQU','SQUASH / PUMPKIN','Pam','Annual Vegetable','Cucurbitaceae','Annual',false,false,false,false,true,NULL),
('CRP-SPT','SWEET POTATO','Kumala','Root Crop','Convolvulaceae','Annual',false,false,false,false,true,'Active F001-PU012'),
('CRP-CAS','CASSAVA','Tavioka','Root Crop','Euphorbiaceae','Annual',false,false,false,false,true,'Active F001-PU001'),
('CRP-DAL','DALO (TARO)','Dalo','Root Crop','Araceae','Annual',false,false,false,false,true,'Fiji staple crop'),
('CRP-DTN','DALO NI TANA','Dalo ni Tana','Root Crop','Araceae','Annual',false,false,false,false,true,'Upland taro variety'),
('CRP-YAM','YAM','Uvi','Root Crop','Dioscoreaceae','Annual',false,false,false,false,true,NULL),
('CRP-ROU','ROUROU / BELE','Rourou','Indigenous/Specialty','Amaranthaceae','Perennial',true,false,false,false,true,'Fijian leafy green, high local demand'),
('CRP-OTA','OTA (FERN)','Ota','Indigenous/Specialty','Pteridophyte','Perennial',true,false,false,false,true,'Wild fern shoots, cultural significance'),
('CRP-DUR','DURUKA','Duruka','Indigenous/Specialty','Poaceae','Perennial',true,false,false,false,true,'Fijian sugarcane shoot delicacy'),
('CRP-GIN','GINGER','Cago','Indigenous/Specialty','Zingiberaceae','Annual',false,false,false,false,true,NULL),
('CRP-TUR','TURMERIC','Ota dina','Indigenous/Specialty','Zingiberaceae','Annual',false,false,false,false,true,NULL),
('CRP-KAV','KAVA','Yaqona','Indigenous/Specialty','Piperaceae','4yr-cycle',false,false,false,false,true,'4-year cycle. F002 primary crop. Premium export value. InactivityAlert=180days.'),
('CRP-SUG','SUGARCANE','Dovu','Indigenous/Specialty','Poaceae','Perennial',true,false,false,false,true,NULL),
('FRT-BAN','BANANA','Jaina','Fruit/Perennial','Musaceae','Perennial',true,false,false,false,true,NULL),
('FRT-PIN','PINEAPPLE','Painapolo','Fruit/Perennial','Bromeliaceae','Perennial',true,false,false,false,true,'Active F002-PU004'),
('FRT-PAP','PAPAYA','Weleti','Fruit/Perennial','Caricaceae','Perennial',true,false,false,false,true,NULL),
('FRT-DRG','DRAGON FRUIT','Dragon Fruit','Fruit/Perennial','Cactaceae','Perennial',true,false,false,false,true,NULL),
('FRT-GUA','GUAVA','Kuava','Fruit/Perennial','Myrtaceae','Perennial',true,false,false,false,true,NULL),
('FRT-BRF','BREADFRUIT','Uto','Fruit/Perennial','Moraceae','Perennial',true,false,false,false,true,'Traditional Fiji fruit'),
('FRT-AVO','AVOCADO','Avokado','Fruit/Perennial','Lauraceae','Perennial',true,false,false,false,true,NULL),
('FRT-CMQ','CUMQUAT','Cumquat','Fruit/Perennial','Rutaceae','Perennial',true,false,false,false,true,NULL),
('FRT-COC','COCONUT','Niu','Fruit/Perennial','Arecaceae','Perennial',true,false,false,false,true,NULL),
('LIV-GOA','GOAT','Me','Livestock','Bovidae','Continuous',false,true,false,false,true,'Active F002, 8 animals'),
('LIV-CAT','BEEF CATTLE','Bulumakau','Livestock','Bovidae','Continuous',false,true,false,false,true,NULL),
('LIV-DIR','DAIRY CATTLE','Bulumakau sucu','Livestock','Bovidae','Continuous',false,true,false,false,true,NULL),
('LIV-PIG','PIG','Vuaka','Livestock','Suidae','Continuous',false,true,false,false,false,'INACTIVE. Rules RULE-027 and RULE-028 inactive.'),
('LIV-PBR','BROILER CHICKEN','Toa','Livestock','Poultry','Continuous',false,true,false,false,true,NULL),
('LIV-PLY','LAYER CHICKEN','Toa siga','Livestock','Poultry','Continuous',false,true,false,false,true,NULL),
('LIV-DCK','DUCK','Ga','Livestock','Anatidae','Continuous',false,true,false,false,true,NULL),
('LIV-API','APICULTURE (HONEY + POLLINATION)','Bisu ni wani','Apiculture','Apidae','Continuous',false,false,false,false,true,'Active F001, 4 hives'),
('AQU-TIL','TILAPIA FARM','Tilapia','Aquaculture','Cichlidae','Continuous',false,false,false,true,false,'INACTIVE. Rules RULE-024 to RULE-026 inactive.'),
('AQU-PRW','PRAWN FARM','Ura','Aquaculture','Crustacean','Continuous',false,false,false,true,false,'INACTIVE'),
('SUP-NAP','NAPIER GRASS','Napier','Support/Cover','Poaceae','Perennial',true,false,false,false,true,'Livestock fodder, erosion control'),
('SUP-LEG','LEGUME COVER CROP','Cover Crop','Support/Cover','Fabaceae','Annual',false,false,false,false,true,'Nitrogen fixation cover crop'),
('FOR-AGA','AGARWOOD','Agarwood','Forestry','Thymelaeaceae','15-20yr',false,false,true,false,true,'Ultra long-cycle premium timber'),
('FOR-SAN','SANDALWOOD','Sandalwood','Forestry','Santalaceae','15-20yr',false,false,true,false,true,NULL),
('FOR-PIN','PINE','Pine','Forestry','Pinaceae','20-30yr',false,false,true,false,true,NULL),
('FOR-MAH','MAHOGANY','Mahogany','Forestry','Meliaceae','25-40yr',false,false,true,false,true,NULL),
('FOR-TEK','TEAK','Teak','Forestry','Lamiaceae','25-50yr',false,false,true,false,true,NULL);


-- =============================================================================
-- TABLE 2: shared.production_thresholds
-- Yield, pricing, and alert thresholds per production type
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.production_thresholds (
    production_id               TEXT PRIMARY KEY REFERENCES shared.productions(production_id),
    min_cycle_days              INT,
    max_cycle_days              INT,
    expected_yield_low_kg_acre  NUMERIC,
    expected_yield_avg_kg_acre  NUMERIC,
    expected_yield_high_kg_acre NUMERIC,
    inactivity_alert_days       INT DEFAULT 7,
    harvest_gap_days            INT DEFAULT 7,
    price_min_fjd_kg            NUMERIC,
    price_max_fjd_kg            NUMERIC,
    notes                       TEXT
);

INSERT INTO shared.production_thresholds VALUES
('CRP-WAT',75,100,3500,5000,7000,7,3,0.80,1.50,'Seasonal, time-sensitive harvest'),
('CRP-TOM',65,90,2000,3500,5000,7,3,2.00,4.00,'Core market crop'),
('CRP-EGG',75,120,2500,4000,6000,7,3,1.50,3.50,'Primary F001 crop, frequent harvest'),
('CRP-CAP',80,110,1500,2500,4000,7,3,2.50,5.00,NULL),
('CRP-CHI',70,100,800,1500,2500,7,3,3.00,8.00,NULL),
('CRP-CUC',50,75,2000,3500,5000,7,2,1.00,2.50,NULL),
('CRP-SCN',70,90,1500,2500,4000,7,5,0.80,1.80,NULL),
('CRP-FRB',55,75,600,1000,1500,7,3,2.00,4.50,NULL),
('CRP-LBN',60,90,800,1500,2500,7,3,1.50,3.50,NULL),
('CRP-CAB',75,100,2000,3500,5000,7,7,0.60,1.50,NULL),
('CRP-SQU',80,110,2000,4000,6000,7,5,0.80,2.00,NULL),
('CRP-SPT',90,120,3000,5000,8000,7,0,0.50,1.20,'Harvest all at once'),
('CRP-CAS',270,365,5000,8000,12000,14,0,0.60,1.20,'Long cycle, batch harvest'),
('CRP-DAL',180,270,3000,5000,8000,14,0,0.80,2.00,NULL),
('CRP-DTN',180,270,2500,4000,6000,14,0,1.00,2.50,NULL),
('CRP-YAM',180,270,3000,5000,8000,14,0,0.80,2.00,NULL),
('CRP-ROU',30,365,500,1500,3000,14,7,1.00,3.00,'Perennial, continuous harvest'),
('CRP-OTA',30,365,200,500,1000,30,14,2.00,5.00,'Seasonal availability'),
('CRP-DUR',365,730,500,1000,2000,30,14,3.00,8.00,'Traditional delicacy, seasonal'),
('CRP-GIN',270,300,1000,2000,3500,14,0,3.00,6.00,NULL),
('CRP-TUR',270,300,1000,2000,3000,14,0,3.00,7.00,NULL),
('CRP-KAV',1095,1460,500,1000,2000,180,0,20.00,60.00,'4-YEAR CYCLE. InactivityAlert=180 days. Harvest target Jan 2029.'),
('CRP-SUG',365,730,10000,15000,20000,30,0,0.10,0.25,NULL),
('FRT-BAN',270,365,5000,8000,12000,30,7,0.50,1.50,NULL),
('FRT-PIN',540,730,3000,5000,8000,30,5,0.80,2.00,'Active F002-PU004'),
('FRT-PAP',180,365,5000,10000,15000,14,7,0.80,2.50,NULL),
('FRT-DRG',365,730,1000,3000,5000,30,7,3.00,8.00,NULL),
('FRT-GUA',365,730,2000,4000,7000,30,7,0.50,1.50,NULL),
('FRT-BRF',1095,1460,2000,4000,8000,60,14,1.00,3.00,'Traditional, cultural value'),
('FRT-AVO',1460,1825,1000,3000,6000,60,7,2.00,6.00,NULL),
('FRT-CMQ',365,730,500,1500,3000,30,7,2.00,5.00,NULL),
('FRT-COC',1460,1825,2000,5000,10000,60,14,0.80,2.50,NULL),
('LIV-GOA',365,730,NULL,NULL,NULL,30,NULL,8.00,15.00,'8 active goats F002'),
('LIV-CAT',730,1095,NULL,NULL,NULL,30,NULL,5.00,10.00,NULL),
('LIV-DIR',365,730,NULL,NULL,NULL,30,NULL,NULL,NULL,'Dairy production'),
('LIV-PIG',120,180,NULL,NULL,NULL,14,NULL,3.00,6.00,'INACTIVE'),
('LIV-PBR',42,56,NULL,NULL,NULL,14,NULL,6.00,10.00,NULL),
('LIV-PLY',140,365,NULL,NULL,NULL,14,NULL,NULL,NULL,'Laying cycle'),
('LIV-DCK',42,56,NULL,NULL,NULL,14,NULL,5.00,9.00,NULL),
('LIV-API',365,365,NULL,NULL,NULL,14,NULL,15.00,25.00,'Honey per harvest, not kg yield'),
('AQU-TIL',180,270,NULL,NULL,NULL,7,NULL,5.00,10.00,'INACTIVE'),
('AQU-PRW',120,180,NULL,NULL,NULL,7,NULL,8.00,15.00,'INACTIVE'),
('SUP-NAP',60,365,NULL,NULL,NULL,30,NULL,NULL,NULL,'Fodder, no market price'),
('SUP-LEG',60,90,NULL,NULL,NULL,30,NULL,NULL,NULL,'Cover crop only'),
('FOR-AGA',5475,7300,NULL,NULL,NULL,180,NULL,500.00,2000.00,'Heartwood only, ultra-premium'),
('FOR-SAN',5475,7300,NULL,NULL,NULL,180,NULL,100.00,500.00,NULL),
('FOR-PIN',7300,10950,NULL,NULL,NULL,365,NULL,20.00,60.00,NULL),
('FOR-MAH',9125,14600,NULL,NULL,NULL,365,NULL,50.00,200.00,NULL),
('FOR-TEK',9125,18250,NULL,NULL,NULL,365,NULL,80.00,350.00,NULL);


-- =============================================================================
-- TABLE 3: shared.production_stages
-- Crop growth stages with durations and critical actions
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.production_stages (
    stage_id            TEXT PRIMARY KEY,
    production_id       TEXT REFERENCES shared.productions(production_id),
    stage_name          TEXT,
    stage_order         INT,
    duration_days_min   INT,
    duration_days_max   INT,
    description         TEXT,
    critical_actions    TEXT
);

-- CRP-EGG (Eggplant) stages
INSERT INTO shared.production_stages VALUES
('STG-EGG-01','CRP-EGG','Land Preparation',1,7,14,'Clear, till and prepare beds. Apply base fertilizer.','Deep plough, add compost, form raised beds 1m wide'),
('STG-EGG-02','CRP-EGG','Nursery / Seed Germination',2,14,21,'Seed germination in nursery trays.','Use nursery mix, keep moist, 25-30°C, protect from direct sun'),
('STG-EGG-03','CRP-EGG','Transplanting',3,1,3,'Transplant seedlings 25-30cm tall to field.','Transplant at 18:00 or cloudy day, 60cm x 45cm spacing, water immediately'),
('STG-EGG-04','CRP-EGG','Vegetative Growth',4,21,28,'Active leaf and stem growth.','Weekly pest scouting, apply NPK every 14d, first weeding at day 7'),
('STG-EGG-05','CRP-EGG','Flowering',5,14,21,'Flower bud formation and anthesis.','Monitor for thrips (flower damage), apply preventive spray, stake plants'),
('STG-EGG-06','CRP-EGG','Fruiting / Harvest',6,45,75,'Continuous harvest of fruits.','Harvest every 3 days, do not over-ripen, Grade A = firm purple, Grade B = slight blemish'),
('STG-EGG-07','CRP-EGG','Cycle Closure',7,7,14,'Remove crop residue and close cycle.','Pull plants, compost residue, rest soil minimum 60 days before Solanaceae');

-- CRP-TOM (Tomato) stages
INSERT INTO shared.production_stages VALUES
('STG-TOM-01','CRP-TOM','Land Preparation',1,7,14,'Clear, till, add compost and base fertilizer.','Deep plough, lime if pH < 6.0, raised beds'),
('STG-TOM-02','CRP-TOM','Nursery',2,14,21,'Seed germination in protected nursery.','25-30°C, protect from rain splash'),
('STG-TOM-03','CRP-TOM','Transplanting',3,1,3,'Transplant 20-25cm seedlings.','45cm x 60cm spacing, install stakes at transplant time'),
('STG-TOM-04','CRP-TOM','Vegetative Growth',4,21,28,'Rapid leaf and stem growth.','Apply NPK every 14d, weekly pest scouting, train to stake'),
('STG-TOM-05','CRP-TOM','Flowering',5,14,21,'Flower formation and fruit set.','Monitor for fruit borer, remove suckers, apply potassium fertilizer'),
('STG-TOM-06','CRP-TOM','Fruiting / Harvest',6,30,45,'Progressive harvest of mature fruits.','Harvest every 3 days, harvest at 75-80% red colour for market'),
('STG-TOM-07','CRP-TOM','Cycle Closure',7,7,14,'Remove crop residue.','Rest 60 days before Solanaceae');

-- CRP-CAS (Cassava) stages
INSERT INTO shared.production_stages VALUES
('STG-CAS-01','CRP-CAS','Land Preparation',1,7,14,'Clear vegetation, deep plough, mound formation.','Mounds 30cm high, 1m spacing, add compost'),
('STG-CAS-02','CRP-CAS','Planting',2,1,3,'Plant stem cuttings 20-25cm long.','Plant horizontally or at 45° angle, 3-4 nodes per cutting'),
('STG-CAS-03','CRP-CAS','Early Growth (0-3 months)',3,60,90,'Shoot establishment and canopy formation.','Weed at 3 weeks and 6 weeks, fertilize at 6 weeks'),
('STG-CAS-04','CRP-CAS','Tuber Bulking (3-8 months)',4,120,150,'Active tuber formation and starch accumulation.','Monitor for cassava mealybug, minimal input needed'),
('STG-CAS-05','CRP-CAS','Maturation (8-12 months)',5,90,120,'Tubers reach full size and starch content.','Leaves may yellow naturally as tubers mature'),
('STG-CAS-06','CRP-CAS','Harvest',6,1,14,'Batch harvest of all tubers.','Harvest at 9-12 months for best starch content, use fork not spade');

-- CRP-KAV (Kava) stages
INSERT INTO shared.production_stages VALUES
('STG-KAV-01','CRP-KAV','Land Preparation',1,14,21,'Clear, deep plough, add organic matter. Kava prefers well-drained loam.','pH 5.5-6.5, avoid waterlogged areas, shade preparation'),
('STG-KAV-02','CRP-KAV','Planting (Waka suckers)',2,1,7,'Plant lateral stem cuttings (waka) with 2-3 nodes.','Plant under 50% shade, 1m x 1m spacing, water at planting only'),
('STG-KAV-03','CRP-KAV','Establishment Year 1',3,270,365,'Root development and initial growth. Minimal visible above-ground growth.','Monthly weeding, NO chemical fertilizer Year 1, organic mulch only'),
('STG-KAV-04','CRP-KAV','Growth Year 2',4,365,365,'Canopy expansion and lateral root development.','Apply organic compost twice/year, pest scouting every 30d'),
('STG-KAV-05','CRP-KAV','Maturation Year 3',5,365,365,'Root mass accumulation. Kavalactone concentration increases.','Do not harvest early - quality degrades significantly before 3.5 years'),
('STG-KAV-06','CRP-KAV','Harvest Ready Year 4',6,180,365,'Roots reach full maturity and kavalactone peak.','Harvest at 4 years minimum. Higher kavalactone = higher premium price. Target: Jan 2029 for cycles planted Jan 2025');

-- CRP-SPT (Sweet Potato) stages
INSERT INTO shared.production_stages VALUES
('STG-SPT-01','CRP-SPT','Land Preparation',1,5,10,'Mound formation, add compost.','Mounds 25-30cm high, well-drained'),
('STG-SPT-02','CRP-SPT','Vine Planting',2,1,2,'Plant vine cuttings 30cm long.','Plant tip-down, 2 nodes minimum in soil'),
('STG-SPT-03','CRP-SPT','Running Stage',3,21,35,'Vines spread and cover mounds.','Minimal intervention, occasional weeding only'),
('STG-SPT-04','CRP-SPT','Tuber Initiation',4,30,45,'Underground tuber formation begins.','Do not disturb roots, no deep cultivation'),
('STG-SPT-05','CRP-SPT','Harvest',5,1,7,'Batch dig all tubers.','Test dig first, harvest when tubers 150-300g, use fork');

-- FRT-PIN (Pineapple) stages
INSERT INTO shared.production_stages VALUES
('STG-PIN-01','FRT-PIN','Land Preparation',1,14,21,'Clear, prepare raised beds, mulch.','Good drainage critical, pH 4.5-6.0'),
('STG-PIN-02','FRT-PIN','Planting (Suckers/Slips)',2,1,7,'Plant crown, slips or suckers.','30cm x 60cm spacing, plant 5cm deep'),
('STG-PIN-03','FRT-PIN','Vegetative Year 1',3,180,270,'Leaf rosette development.','Monthly fertilizer application, weed control critical'),
('STG-PIN-04','FRT-PIN','Flower Induction',4,30,60,'Natural or induced flowering.','Apply ethephon if forcing early harvest needed'),
('STG-PIN-05','FRT-PIN','Fruit Development',5,150,180,'Fruit growth and sugar accumulation.','Increase potassium fertilizer, pest scouting for mealybug wilt'),
('STG-PIN-06','FRT-PIN','Harvest',6,7,21,'Harvest mature fruits.','Harvest when golden-yellow shoulder, 30-35% shell colour change');


-- =============================================================================
-- TABLE 4: shared.family_policies
-- Crop family rotation policies and disease risk profiles
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.family_policies (
    policy_id           SERIAL PRIMARY KEY,
    family_name         TEXT UNIQUE,
    member_production_ids TEXT[],
    min_rest_days       INT,
    enforce_level       TEXT CHECK(enforce_level IN ('BLOCK','AVOID','OK','OVERLAY','NA')),
    disease_risk        TEXT,
    rotation_benefit    TEXT,
    notes               TEXT
);

INSERT INTO shared.family_policies (family_name, member_production_ids, min_rest_days, enforce_level, disease_risk, rotation_benefit, notes) VALUES
('Solanaceae', ARRAY['CRP-TOM','CRP-EGG','CRP-CAP','CRP-CHI'], 60, 'BLOCK', 'Fusarium wilt, bacterial wilt, nematodes, Phytophthora blight', 'Break wilt cycle with non-solanaceous crop', 'Hard block for back-to-back planting. Minimum 60 days rest after any Solanaceae.'),
('Cucurbitaceae', ARRAY['CRP-WAT','CRP-CUC','CRP-SQU'], 45, 'BLOCK', 'Pythium, Phytophthora, Downy mildew, Anthracnose', 'Break cucumber mosaic cycle', 'Same family rotation blocked. 45 days rest required.'),
('Fabaceae', ARRAY['CRP-FRB','CRP-LBN','SUP-LEG'], 30, 'OK', 'Minimal - legumes suppress nematodes', 'Nitrogen fixation up to 50kg N/ha — beneficial after heavy feeders', 'Legumes PREFERRED after Solanaceae, Cucurbitaceae, Brassicaceae. 30 day minimum rest within family.'),
('Araceae', ARRAY['CRP-DAL','CRP-DTN'], 90, 'BLOCK', 'Dasheen mosaic virus, Pythium root rot, Phytophthora leaf blight', 'High disease buildup risk', '90 days mandatory rest between Araceae plantings. Virus persists in soil.'),
('Brassicaceae', ARRAY['CRP-CAB'], 60, 'BLOCK', 'Club root (Plasmodiophora brassicae), Aphid pressure, Black rot', 'Break aphid lifecycle', '60 days rest. Club root spores persist 20+ years in acid soil — critical to rotate.'),
('Poaceae', ARRAY['CRP-SCN','CRP-DUR','CRP-SUG','SUP-NAP'], 30, 'AVOID', 'Root diseases, Smut, nematode carryover', 'Minimal rotation benefit within family', 'Soft block. 30 days rest recommended but not hard-enforced.'),
('Euphorbiaceae', ARRAY['CRP-CAS'], 180, 'BLOCK', 'Cassava mosaic disease, cassava mealybug carryover, nematodes', 'Extended break reduces virus reservoir', '180-day mandatory rest. Cassava mosaic is whitefly-transmitted, builds in consecutive cassava plantings.'),
('Convolvulaceae', ARRAY['CRP-SPT'], 60, 'AVOID', 'Sweet potato virus disease, weevil carryover', 'Moderate rotation benefit', '60 days recommended. Sweet potato weevil persists in soil debris.'),
('Zingiberaceae', ARRAY['CRP-GIN','CRP-TUR'], 90, 'AVOID', 'Pythium rhizome rot, bacterial wilt in ginger', 'Break rhizome disease cycle', '90 days recommended between Zingiberaceae. Pythium buildup serious in wet conditions.'),
('Musaceae', ARRAY['FRT-BAN'], 0, 'OVERLAY', 'Panama disease (Fusarium wilt) - managed at plantation level', 'Perennial system', 'Perennial - OVERLAY logic. Not subject to annual crop rotation rules. Manage Panama disease via resistant varieties.'),
('Arecaceae', ARRAY['FRT-COC'], 0, 'OVERLAY', 'Minimal annual crop disease interaction', 'Long-term perennial', 'Perennial coconut - OVERLAY logic. Crop rotation concept not applicable.'),
('Piperaceae', ARRAY['CRP-KAV'], 0, 'NA', 'Specific kava root rot (Phytophthora cinnamomi) in waterlogged conditions', '4-year cycle, no standard rotation', '4-year cycle. Never replant kava in same area within 5 years of harvest. Special long-cycle logic.'),
('Livestock', ARRAY['LIV-GOA','LIV-CAT','LIV-DIR','LIV-PIG','LIV-PBR','LIV-PLY','LIV-DCK'], 0, 'OVERLAY', 'N/A - different production system', 'Manure adds organic matter', 'OVERLAY logic - livestock co-exists with crop rotation. No crop rotation rules apply.'),
('Forestry', ARRAY['FOR-AGA','FOR-SAN','FOR-PIN','FOR-MAH','FOR-TEK'], 0, 'NA', 'Minimal annual crop interaction', 'Long-term land use commitment', 'N/A - 15-50 year cycles. Crop rotation concept does not apply to forestry.');


-- =============================================================================
-- TABLE 5: shared.rotation_registry
-- Rotation metadata for all 49 productions
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.rotation_registry (
    production_id       TEXT PRIMARY KEY REFERENCES shared.productions(production_id),
    family              TEXT,
    is_perennial        BOOLEAN,
    is_livestock        BOOLEAN,
    is_forestry         BOOLEAN,
    is_aquaculture      BOOLEAN,
    is_support_crop     BOOLEAN,
    min_cycle_days      INT,
    max_cycle_days      INT,
    rotation_group      TEXT
);

INSERT INTO shared.rotation_registry (production_id, family, is_perennial, is_livestock, is_forestry, is_aquaculture, is_support_crop, min_cycle_days, max_cycle_days, rotation_group) VALUES
('CRP-WAT','Cucurbitaceae',false,false,false,false,false,75,100,'Annual'),
('CRP-TOM','Solanaceae',false,false,false,false,false,65,90,'Annual'),
('CRP-EGG','Solanaceae',false,false,false,false,false,75,120,'Annual'),
('CRP-CAP','Solanaceae',false,false,false,false,false,80,110,'Annual'),
('CRP-CHI','Solanaceae',false,false,false,false,false,70,100,'Annual'),
('CRP-CUC','Cucurbitaceae',false,false,false,false,false,50,75,'Annual'),
('CRP-SCN','Poaceae',false,false,false,false,false,70,90,'Annual'),
('CRP-FRB','Fabaceae',false,false,false,false,false,55,75,'Annual'),
('CRP-LBN','Fabaceae',false,false,false,false,false,60,90,'Annual'),
('CRP-CAB','Brassicaceae',false,false,false,false,false,75,100,'Annual'),
('CRP-SQU','Cucurbitaceae',false,false,false,false,false,80,110,'Annual'),
('CRP-SPT','Convolvulaceae',false,false,false,false,false,90,120,'Annual'),
('CRP-CAS','Euphorbiaceae',false,false,false,false,false,270,365,'Annual'),
('CRP-DAL','Araceae',false,false,false,false,false,180,270,'Annual'),
('CRP-DTN','Araceae',false,false,false,false,false,180,270,'Annual'),
('CRP-YAM','Dioscoreaceae',false,false,false,false,false,180,270,'Annual'),
('CRP-ROU','Amaranthaceae',true,false,false,false,false,30,365,'Perennial'),
('CRP-OTA','Pteridophyte',true,false,false,false,false,30,365,'Perennial'),
('CRP-DUR','Poaceae',true,false,false,false,false,365,730,'Perennial'),
('CRP-GIN','Zingiberaceae',false,false,false,false,false,270,300,'Annual'),
('CRP-TUR','Zingiberaceae',false,false,false,false,false,270,300,'Annual'),
('CRP-KAV','Piperaceae',false,false,false,false,false,1095,1460,'LongCycle'),
('CRP-SUG','Poaceae',true,false,false,false,false,365,730,'Perennial'),
('FRT-BAN','Musaceae',true,false,false,false,false,270,365,'Perennial'),
('FRT-PIN','Bromeliaceae',true,false,false,false,false,540,730,'Perennial'),
('FRT-PAP','Caricaceae',true,false,false,false,false,180,365,'Perennial'),
('FRT-DRG','Cactaceae',true,false,false,false,false,365,730,'Perennial'),
('FRT-GUA','Myrtaceae',true,false,false,false,false,365,730,'Perennial'),
('FRT-BRF','Moraceae',true,false,false,false,false,1095,1460,'Perennial'),
('FRT-AVO','Lauraceae',true,false,false,false,false,1460,1825,'Perennial'),
('FRT-CMQ','Rutaceae',true,false,false,false,false,365,730,'Perennial'),
('FRT-COC','Arecaceae',true,false,false,false,false,1460,1825,'Perennial'),
('LIV-GOA','Livestock',false,true,false,false,false,365,730,'Livestock'),
('LIV-CAT','Livestock',false,true,false,false,false,730,1095,'Livestock'),
('LIV-DIR','Livestock',false,true,false,false,false,365,730,'Livestock'),
('LIV-PIG','Livestock',false,true,false,false,false,120,180,'Livestock'),
('LIV-PBR','Livestock',false,true,false,false,false,42,56,'Livestock'),
('LIV-PLY','Livestock',false,true,false,false,false,140,365,'Livestock'),
('LIV-DCK','Livestock',false,true,false,false,false,42,56,'Livestock'),
('LIV-API','Apiculture',false,false,false,false,false,365,365,'Livestock'),
('AQU-TIL','Aquaculture',false,false,false,true,false,180,270,'Aquaculture'),
('AQU-PRW','Aquaculture',false,false,false,true,false,120,180,'Aquaculture'),
('SUP-NAP','Poaceae',true,false,false,false,true,60,365,'Support'),
('SUP-LEG','Fabaceae',false,false,false,false,true,60,90,'Support'),
('FOR-AGA','Forestry',false,false,true,false,false,5475,7300,'Forestry'),
('FOR-SAN','Forestry',false,false,true,false,false,5475,7300,'Forestry'),
('FOR-PIN','Forestry',false,false,true,false,false,7300,10950,'Forestry'),
('FOR-MAH','Forestry',false,false,true,false,false,9125,14600,'Forestry'),
('FOR-TEK','Forestry',false,false,true,false,false,9125,18250,'Forestry');


-- =============================================================================
-- TABLE 6: shared.chemical_library
-- Registered chemicals with withholding periods and safety data
-- CRITICAL: withholding_period_days is NOT NULL
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.chemical_library (
    chemical_id                 TEXT PRIMARY KEY,
    chem_name                   TEXT,
    active_ingredient           TEXT,
    chemical_class              TEXT,
    registered_crops            TEXT[],
    application_rate            TEXT,
    unit                        TEXT,
    withholding_period_days     INT NOT NULL,
    re_entry_interval_hours     INT,
    mrl_ppm                     NUMERIC,
    approved_for_fiji           BOOLEAN DEFAULT true,
    hazard_class                TEXT,
    notes                       TEXT
);

INSERT INTO shared.chemical_library VALUES
('CHEM-001','Dimethoate 40% EC','Dimethoate','Organophosphate',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB'],'1-2','L/ha',7,48,0.02,true,'II','Contact and systemic insecticide. Thrips, aphids, mites.'),
('CHEM-002','Mancozeb 80% WP','Mancozeb','Dithiocarbamate',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB','CRP-CUC','CRP-WAT'],'1.5-2.5','kg/ha',7,4,0.5,true,'III','Protective fungicide. Early blight, late blight, anthracnose.'),
('CHEM-003','Cypermethrin 10% EC','Cypermethrin','Pyrethroid',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB','CRP-CUC'],'0.5-1','L/ha',7,24,0.05,true,'II','Broad spectrum insecticide. Fruit borer, pod borer, caterpillars.'),
('CHEM-004','Copper Oxychloride 85% WP','Copper Oxychloride','Inorganic copper',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-DAL','CRP-KAV','FRT-BAN'],'2-3','kg/ha',0,4,NULL,true,'III','Protective fungicide. Downy mildew, bacterial diseases. 0-day WHD.'),
('CHEM-005','Glyphosate 480 SL','Glyphosate','Organophosphate herbicide',ARRAY['CRP-EGG','CRP-TOM','CRP-CAS','CRP-KAV'],'2-4','L/ha',3,4,NULL,true,'III','Non-selective herbicide. Pre-plant weed control only. Do not contact crop.'),
('CHEM-006','Imidacloprid 70% WG','Imidacloprid','Neonicotinoid',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB'],'0.1-0.2','kg/ha',7,12,0.5,true,'II','Systemic insecticide. Whitefly, aphids, thrips. Avoid use near LIV-API hives.'),
('CHEM-007','Lambda-cyhalothrin 5% EC','Lambda-cyhalothrin','Pyrethroid',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB','CRP-CUC'],'0.5-1','L/ha',7,24,0.02,true,'II','Broad spectrum insecticide. Caterpillars, aphids, beetles.'),
('CHEM-008','Abamectin 1.8% EC','Abamectin','Avermectin',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP'],'0.5-1','L/ha',7,12,0.01,true,'II','Selective miticide/insecticide. Spider mites, leafminers.'),
('CHEM-009','Thiamethoxam 25% WG','Thiamethoxam','Neonicotinoid',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB'],'0.2-0.4','kg/ha',7,12,0.5,true,'II','Systemic insecticide. Whitefly, aphids. Caution near pollinators.'),
('CHEM-010','Emamectin Benzoate 5% WG','Emamectin Benzoate','Avermectin',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB','CRP-CUC'],'0.2-0.4','kg/ha',3,12,0.02,true,'II','Selective insecticide. Fruit borer, armyworm, caterpillars.'),
('CHEM-011','Spinosad 12% SC','Spinosad','Spinosyn',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB'],'0.3-0.5','L/ha',1,4,1.0,true,'IV','Biological insecticide. Thrips, caterpillars. Low mammalian toxicity. OMRI listed.'),
('CHEM-012','Bacillus thuringiensis WP','Bacillus thuringiensis','Biological',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB','CRP-CUC'],'1-2','kg/ha',0,0,NULL,true,'IV','Biological insecticide. Caterpillars only. 0-day WHD. Safe near LIV-API.'),
('CHEM-013','Azoxystrobin 25% SC','Azoxystrobin','Strobilurin',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CUC','CRP-WAT'],'0.8-1.2','L/ha',7,4,0.3,true,'IV','Systemic fungicide. Powdery mildew, early blight, Phytophthora.'),
('CHEM-014','Tebuconazole 25% EC','Tebuconazole','Triazole',ARRAY['CRP-TOM','CRP-EGG','CRP-CAB','CRP-CUC'],'0.5-1','L/ha',14,24,0.5,true,'III','Systemic fungicide. Late blight, fusarium. 14-day WHD.'),
('CHEM-015','Propiconazole 25% EC','Propiconazole','Triazole',ARRAY['CRP-TOM','CRP-EGG','CRP-CAB'],'0.5-1','L/ha',7,24,0.1,true,'II','Systemic fungicide. Leaf spots, rust.'),
('CHEM-016','Difenoconazole 25% EC','Difenoconazole','Triazole',ARRAY['CRP-TOM','CRP-EGG','CRP-CAP','CRP-CAB'],'0.3-0.5','L/ha',7,24,0.05,true,'III','Broad spectrum fungicide. Early and late blight.'),
('CHEM-017','Metalaxyl 35% WS','Metalaxyl','Phenylamide',ARRAY['CRP-TOM','CRP-EGG','CRP-CAP','CRP-DAL'],'2-3','g/kg seed',14,24,0.05,true,'III','Systemic fungicide. Pythium, Phytophthora, downy mildew.'),
('CHEM-018','Carbendazim 50% WP','Carbendazim','Benzimidazole',ARRAY['CRP-TOM','CRP-EGG','CRP-CUC','CRP-WAT'],'1-1.5','kg/ha',14,24,0.5,true,'III','Systemic fungicide. Stem rot, wilt diseases. 14-day WHD.'),
('CHEM-019','Chlorpyrifos 48% EC','Chlorpyrifos','Organophosphate',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB','CRP-CAS'],'1.5-2','L/ha',14,24,0.1,true,'II','Broad spectrum insecticide. Soil pests, cutworms. 14-day WHD.'),
('CHEM-020','Pendimethalin 33% EC','Pendimethalin','Dinitroaniline herbicide',ARRAY['CRP-TOM','CRP-EGG','CRP-CAB'],'2-3','L/ha',45,24,NULL,true,'III','Pre-emergent herbicide. Annual grasses and broadleaf weeds.'),
('CHEM-021','Metolachlor 720 EC','Metolachlor','Chloroacetamide herbicide',ARRAY['CRP-SCN','CRP-EGG'],'1.5-2.5','L/ha',45,24,NULL,true,'III','Pre-emergent herbicide for corn. Annual grasses.'),
('CHEM-022','Oxyfluorfen 24% EC','Oxyfluorfen','Diphenyl ether herbicide',ARRAY['CRP-CAB','CRP-CAP'],'0.5-1','L/ha',60,24,NULL,true,'III','Pre-emergent herbicide. Broadleaf weeds. 60-day WHD.'),
('CHEM-023','Paraquat 20% SL','Paraquat','Bipyridylium herbicide',ARRAY['CRP-CAS','CRP-KAV'],'2-3','L/ha',3,24,NULL,true,'II','Non-selective contact herbicide. Pre-plant use only. Restricted use.'),
('CHEM-024','Tricyclazole 75% WP','Tricyclazole','Triazole',ARRAY['CRP-DAL','CRP-DTN'],'0.6','kg/ha',21,24,0.1,true,'III','Fungicide for rice/taro blast.'),
('CHEM-025','Propamocarb 72.2% SL','Propamocarb','Carbamate',ARRAY['CRP-TOM','CRP-EGG','CRP-CAP','CRP-CUC'],'3-4','L/ha',7,4,0.1,true,'IV','Systemic fungicide. Damping-off, Pythium root rot.'),
('CHEM-026','Fluazifop-p-butyl 12.5% EC','Fluazifop-p-butyl','Aryloxyphenoxypropionate herbicide',ARRAY['CRP-TOM','CRP-EGG','CRP-CAP','CRP-CAB'],'1-2','L/ha',21,24,NULL,true,'III','Post-emergent grass herbicide. Kills annual and perennial grasses.'),
('CHEM-027','2,4-D Amine 720','2,4-D','Phenoxy herbicide',ARRAY['CRP-CAS','CRP-SUG'],'1.5-2','L/ha',14,24,NULL,true,'II','Selective broadleaf herbicide. Keep away from vegetable crops.'),
('CHEM-028','Acephate 75% SP','Acephate','Organophosphate',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP'],'1-2','kg/ha',7,48,1.0,true,'III','Systemic insecticide. Aphids, thrips, whitefly.'),
('CHEM-029','Acetamiprid 20% SP','Acetamiprid','Neonicotinoid',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB'],'0.3-0.5','kg/ha',7,12,0.5,true,'III','Systemic insecticide. Whitefly, aphids, leafhoppers.'),
('CHEM-030','Chlorothalonil 75% WP','Chlorothalonil','Organochlorine',ARRAY['CRP-TOM','CRP-EGG','CRP-CAP','CRP-CUC','CRP-WAT'],'2-2.5','kg/ha',7,24,0.5,true,'III','Protective fungicide. Leaf blight, gray mold.'),
('CHEM-031','Deltamethrin 2.5% EC','Deltamethrin','Pyrethroid',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB'],'0.5-1','L/ha',7,12,0.05,true,'II','Broad spectrum insecticide. Quick knockdown.'),
('CHEM-032','Indoxacarb 15% SC','Indoxacarb','Oxadiazine',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB'],'0.4-0.6','L/ha',3,12,0.2,true,'III','Selective insecticide. Caterpillars, fruit borer.'),
('CHEM-033','Fipronil 5% SC','Fipronil','Phenylpyrazole',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP'],'1-1.5','L/ha',14,24,0.005,true,'II','Broad spectrum insecticide. Ants, beetles, caterpillars. 14-day WHD.'),
('CHEM-034','Hexaconazole 5% EC','Hexaconazole','Triazole',ARRAY['CRP-EGG','CRP-TOM','CRP-CAB','FRT-BAN'],'0.8-1','L/ha',14,24,0.05,true,'III','Systemic fungicide. Sigatoka in banana, leaf diseases in vegetables.'),
('CHEM-035','Fluopyram 40% SC','Fluopyram','SDHI',ARRAY['CRP-TOM','CRP-EGG','CRP-CAP','CRP-CUC'],'0.5-0.75','L/ha',7,4,0.3,true,'III','Systemic fungicide + nematicide. Botrytis, Sclerotinia.'),
('CHEM-036','Oxamyl 10% G','Oxamyl','Carbamate nematicide',ARRAY['CRP-TOM','CRP-EGG','CRP-CAP'],'20','kg/ha',21,48,0.02,true,'I','Nematicide. Apply at planting only. 21-day WHD. Restricted.'),
('CHEM-037','Fosethyl-Al 80% WG','Fosethyl-Aluminium','Phosphonate',ARRAY['CRP-DAL','CRP-TOM','CRP-EGG'],'2-3','kg/ha',7,4,NULL,true,'IV','Systemic fungicide. Phytophthora in taro and vegetables.'),
('CHEM-038','Thiophanate-methyl 70% WP','Thiophanate-methyl','Benzimidazole',ARRAY['CRP-TOM','CRP-EGG','CRP-CUC','CRP-WAT'],'1-1.5','kg/ha',14,24,0.2,true,'III','Systemic fungicide. Botrytis, Alternaria. 14-day WHD.'),
('CHEM-039','Insecticidal Soap 1% SL','Potassium fatty acids','Biological',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB','CRP-CUC'],'5-10','L/ha',0,1,NULL,true,'IV','Contact insecticide. Soft-bodied insects. 0-day WHD. Organic.'),
('CHEM-040','Neem Oil 0.3% EC','Azadirachtin','Botanical',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-CAB','CRP-CUC'],'3-5','L/ha',0,4,NULL,true,'IV','Botanical insecticide/fungicide. 0-day WHD. Organic approved.'),
('CHEM-041','Sulfur 80% WG','Sulfur','Inorganic fungicide',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','FRT-DRG'],'2-3','kg/ha',0,24,NULL,true,'IV','Protective fungicide/acaricide. Powdery mildew, mites. 0-day WHD.'),
('CHEM-042','Potassium Permanganate','Potassium permanganate','Inorganic',ARRAY['CRP-DAL','CRP-GIN','CRP-TUR'],'0.1','kg/10L water',0,1,NULL,true,'III','Postharvest disinfectant for root/rhizome washing.'),
('CHEM-043','Chlorine (NaOCl 12.5%)','Sodium hypochlorite','Inorganic sanitiser',ARRAY['CRP-EGG','CRP-TOM','CRP-CAP','CRP-DAL'],'0.01-0.02','L/10L water',0,0,NULL,true,'IV','Postharvest wash/sanitising solution. 0-day WHD.'),
('CHEM-044','Lime Sulfur 27% SL','Calcium polysulfide','Inorganic',ARRAY['FRT-BAN','FRT-PIN','CRP-KAV'],'2-5','L/100L water',7,24,NULL,true,'III','Dormant spray fungicide/miticide. Scale insects.'),
('CHEM-045','Trichoderma viride','Trichoderma viride','Biological fungicide',ARRAY['CRP-TOM','CRP-EGG','CRP-DAL','CRP-GIN'],'5','kg/ha',0,0,NULL,true,'IV','Biological soil fungicide. Pythium, Fusarium biocontrol. 0-day WHD. Organic.');


-- =============================================================================
-- TABLE 7: shared.rotation_top_choices
-- Top 3 recommended next crops per production type
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.rotation_top_choices (
    production_id       TEXT REFERENCES shared.productions(production_id),
    choice_rank         INT,
    recommended_next_id TEXT REFERENCES shared.productions(production_id),
    reason              TEXT,
    PRIMARY KEY (production_id, choice_rank)
);

INSERT INTO shared.rotation_top_choices VALUES
-- After Eggplant (CRP-EGG) - Solanaceae - recommend legumes and non-family
('CRP-EGG',1,'CRP-FRB','French Beans (nitrogen fixer, breaks Solanaceae disease cycle, PREF)'),
('CRP-EGG',2,'CRP-LBN','Long Bean (nitrogen fixer, PREF)'),
('CRP-EGG',3,'CRP-SCN','Sweet Corn (Poaceae, different family, breaks disease cycle, OK)'),
-- After Tomato (CRP-TOM)
('CRP-TOM',1,'CRP-FRB','French Beans (nitrogen fixer after heavy feeder Solanaceae, PREF)'),
('CRP-TOM',2,'CRP-LBN','Long Bean (PREF - nitrogen fixer)'),
('CRP-TOM',3,'CRP-DAL','Dalo/Taro (Araceae, no family overlap, OK)'),
-- After Cassava (CRP-CAS) - long rest 180 days needed
('CRP-CAS',1,'CRP-LBN','Long Bean (nitrogen fixer, can plant after 180-day rest, PREF)'),
('CRP-CAS',2,'CRP-FRB','French Beans (PREF)'),
('CRP-CAS',3,'CRP-EGG','Eggplant (OK after full 180-day cassava rest)'),
-- After Sweet Potato (CRP-SPT)
('CRP-SPT',1,'CRP-FRB','French Beans (nitrogen fixer, PREF)'),
('CRP-SPT',2,'CRP-EGG','Eggplant (different family, OK after 60 days)'),
('CRP-SPT',3,'CRP-CAS','Cassava (different family, OK)'),
-- After Kava (CRP-KAV)
('CRP-KAV',1,'SUP-LEG','Legume Cover Crop (soil restoration after 4yr kava, PREF)'),
('CRP-KAV',2,'CRP-FRB','French Beans (nitrogen fixer, PREF)'),
('CRP-KAV',3,'CRP-DAL','Dalo/Taro (different system, OK)'),
-- After Cabbage (CRP-CAB)
('CRP-CAB',1,'CRP-FRB','French Beans (nitrogen fixer after Brassicaceae, PREF)'),
('CRP-CAB',2,'CRP-LBN','Long Bean (PREF)'),
('CRP-CAB',3,'CRP-TOM','Tomato (OK after 60-day Brassicaceae rest)'),
-- After French Beans (CRP-FRB)
('CRP-FRB',1,'CRP-EGG','Eggplant (benefits from residual nitrogen, PREF)'),
('CRP-FRB',2,'CRP-TOM','Tomato (benefits from nitrogen, PREF)'),
('CRP-FRB',3,'CRP-CAB','Cabbage (benefits from nitrogen, PREF)'),
-- After Long Bean (CRP-LBN)
('CRP-LBN',1,'CRP-EGG','Eggplant (benefits from nitrogen fixation, PREF)'),
('CRP-LBN',2,'CRP-TOM','Tomato (PREF)'),
('CRP-LBN',3,'CRP-CAB','Cabbage (PREF)'),
-- After Watermelon (CRP-WAT)
('CRP-WAT',1,'CRP-FRB','French Beans (nitrogen fixer after Cucurbitaceae, PREF)'),
('CRP-WAT',2,'CRP-EGG','Eggplant (different family after 45-day rest, OK)'),
('CRP-WAT',3,'CRP-CAS','Cassava (different family, OK)'),
-- After Cucumber (CRP-CUC)
('CRP-CUC',1,'CRP-LBN','Long Bean (nitrogen fixer, PREF)'),
('CRP-CUC',2,'CRP-EGG','Eggplant (OK after Cucurbitaceae)'),
('CRP-CUC',3,'CRP-DAL','Dalo (different family, OK)'),
-- After Sweet Corn (CRP-SCN)
('CRP-SCN',1,'CRP-FRB','French Beans (nitrogen fixer after cereal, PREF)'),
('CRP-SCN',2,'CRP-EGG','Eggplant (PREF)'),
('CRP-SCN',3,'CRP-TOM','Tomato (OK)'),
-- Dalo
('CRP-DAL',1,'CRP-FRB','French Beans (nitrogen fixer, PREF)'),
('CRP-DAL',2,'CRP-EGG','Eggplant (OK after 90-day Araceae rest)'),
('CRP-DAL',3,'CRP-SPT','Sweet Potato (different family, OK)'),
-- Ginger
('CRP-GIN',1,'CRP-FRB','French Beans (nitrogen fixer, PREF)'),
('CRP-GIN',2,'CRP-EGG','Eggplant (OK after 90-day rest)'),
('CRP-GIN',3,'CRP-CAB','Cabbage (OK)'),
-- Turmeric
('CRP-TUR',1,'CRP-FRB','French Beans (PREF)'),
('CRP-TUR',2,'CRP-EGG','Eggplant (OK after 90 days)'),
('CRP-TUR',3,'CRP-LBN','Long Bean (PREF)'),
-- Pineapple
('FRT-PIN',1,'CRP-LBN','Long Bean (soil restoration, PREF)'),
('FRT-PIN',2,'CRP-FRB','French Beans (PREF)'),
('FRT-PIN',3,'CRP-EGG','Eggplant (OK)'),
-- Dalo ni Tana
('CRP-DTN',1,'CRP-FRB','French Beans (PREF after Araceae)'),
('CRP-DTN',2,'CRP-LBN','Long Bean (PREF)'),
('CRP-DTN',3,'CRP-EGG','Eggplant (OK)'),
-- Yam
('CRP-YAM',1,'CRP-FRB','French Beans (PREF)'),
('CRP-YAM',2,'CRP-LBN','Long Bean (PREF)'),
('CRP-YAM',3,'CRP-EGG','Eggplant (OK)'),
-- Rourou
('CRP-ROU',1,'CRP-FRB','French Beans (PREF)'),
('CRP-ROU',2,'CRP-EGG','Eggplant (PREF)'),
('CRP-ROU',3,'CRP-TOM','Tomato (OK)'),
-- Ota Fern
('CRP-OTA',1,'CRP-FRB','French Beans (PREF)'),
('CRP-OTA',2,'CRP-EGG','Eggplant (PREF)'),
('CRP-OTA',3,'CRP-LBN','Long Bean (PREF)'),
-- Duruka
('CRP-DUR',1,'CRP-FRB','French Beans (PREF after Poaceae)'),
('CRP-DUR',2,'CRP-LBN','Long Bean (PREF)'),
('CRP-DUR',3,'CRP-EGG','Eggplant (OK)'),
-- Sugarcane
('CRP-SUG',1,'CRP-FRB','French Beans (PREF after Poaceae)'),
('CRP-SUG',2,'CRP-LBN','Long Bean (PREF)'),
('CRP-SUG',3,'CRP-EGG','Eggplant (OK)'),
-- Capsicum
('CRP-CAP',1,'CRP-FRB','French Beans (PREF after Solanaceae)'),
('CRP-CAP',2,'CRP-LBN','Long Bean (PREF)'),
('CRP-CAP',3,'CRP-CAS','Cassava (OK)'),
-- Chillies
('CRP-CHI',1,'CRP-FRB','French Beans (PREF after Solanaceae)'),
('CRP-CHI',2,'CRP-LBN','Long Bean (PREF)'),
('CRP-CHI',3,'CRP-SCN','Sweet Corn (OK)'),
-- Squash / Pumpkin
('CRP-SQU',1,'CRP-FRB','French Beans (PREF after Cucurbitaceae)'),
('CRP-SQU',2,'CRP-LBN','Long Bean (PREF)'),
('CRP-SQU',3,'CRP-EGG','Eggplant (OK)'),
-- Banana
('FRT-BAN',1,'CRP-FRB','French Beans (soil restoration)'),
('FRT-BAN',2,'CRP-LBN','Long Bean (N-fixer)'),
('FRT-BAN',3,'CRP-EGG','Eggplant (OK)'),
-- Papaya
('FRT-PAP',1,'CRP-FRB','French Beans (PREF)'),
('FRT-PAP',2,'CRP-EGG','Eggplant (OK)'),
('FRT-PAP',3,'CRP-LBN','Long Bean (PREF)'),
-- Dragon Fruit
('FRT-DRG',1,'CRP-FRB','French Beans (PREF)'),
('FRT-DRG',2,'CRP-LBN','Long Bean (PREF)'),
('FRT-DRG',3,'CRP-EGG','Eggplant (OK)'),
-- Guava
('FRT-GUA',1,'CRP-FRB','French Beans (PREF)'),
('FRT-GUA',2,'CRP-LBN','Long Bean (PREF)'),
('FRT-GUA',3,'CRP-EGG','Eggplant (OK)'),
-- Breadfruit
('FRT-BRF',1,'CRP-FRB','French Beans (PREF)'),
('FRT-BRF',2,'CRP-LBN','Long Bean (PREF)'),
('FRT-BRF',3,'CRP-EGG','Eggplant (OK)'),
-- Avocado
('FRT-AVO',1,'CRP-FRB','French Beans (PREF)'),
('FRT-AVO',2,'CRP-LBN','Long Bean (PREF)'),
('FRT-AVO',3,'CRP-EGG','Eggplant (OK)'),
-- Cumquat
('FRT-CMQ',1,'CRP-FRB','French Beans (PREF)'),
('FRT-CMQ',2,'CRP-LBN','Long Bean (PREF)'),
('FRT-CMQ',3,'CRP-EGG','Eggplant (OK)'),
-- Coconut
('FRT-COC',1,'CRP-FRB','French Beans (PREF)'),
('FRT-COC',2,'CRP-LBN','Long Bean (PREF)'),
('FRT-COC',3,'CRP-EGG','Eggplant (OK)'),
-- Goat
('LIV-GOA',1,'CRP-FRB','French Beans (N-fixer after grazing)'),
('LIV-GOA',2,'CRP-LBN','Long Bean (PREF)'),
('LIV-GOA',3,'CRP-EGG','Eggplant (OK)'),
-- Beef Cattle
('LIV-CAT',1,'CRP-FRB','French Beans (PREF)'),
('LIV-CAT',2,'CRP-LBN','Long Bean (PREF)'),
('LIV-CAT',3,'CRP-EGG','Eggplant (OK)'),
-- Dairy Cattle
('LIV-DIR',1,'CRP-FRB','French Beans (PREF)'),
('LIV-DIR',2,'CRP-LBN','Long Bean (PREF)'),
('LIV-DIR',3,'CRP-EGG','Eggplant (OK)'),
-- Pig (inactive)
('LIV-PIG',1,'CRP-FRB','French Beans (PREF)'),
('LIV-PIG',2,'CRP-LBN','Long Bean (PREF)'),
('LIV-PIG',3,'CRP-EGG','Eggplant (OK)'),
-- Broiler Chicken
('LIV-PBR',1,'CRP-FRB','French Beans (PREF)'),
('LIV-PBR',2,'CRP-LBN','Long Bean (PREF)'),
('LIV-PBR',3,'CRP-EGG','Eggplant (OK)'),
-- Layer Chicken
('LIV-PLY',1,'CRP-FRB','French Beans (PREF)'),
('LIV-PLY',2,'CRP-LBN','Long Bean (PREF)'),
('LIV-PLY',3,'CRP-EGG','Eggplant (OK)'),
-- Duck
('LIV-DCK',1,'CRP-FRB','French Beans (PREF)'),
('LIV-DCK',2,'CRP-LBN','Long Bean (PREF)'),
('LIV-DCK',3,'CRP-EGG','Eggplant (OK)'),
-- Apiculture
('LIV-API',1,'CRP-FRB','French Beans (PREF - pollinator support)'),
('LIV-API',2,'CRP-LBN','Long Bean (PREF)'),
('LIV-API',3,'CRP-EGG','Eggplant (OK)'),
-- Tilapia (inactive)
('AQU-TIL',1,'CRP-FRB','French Beans (PREF)'),
('AQU-TIL',2,'CRP-LBN','Long Bean (PREF)'),
('AQU-TIL',3,'CRP-EGG','Eggplant (OK)'),
-- Prawn (inactive)
('AQU-PRW',1,'CRP-FRB','French Beans (PREF)'),
('AQU-PRW',2,'CRP-LBN','Long Bean (PREF)'),
('AQU-PRW',3,'CRP-EGG','Eggplant (OK)'),
-- Napier Grass
('SUP-NAP',1,'CRP-FRB','French Beans (PREF after Poaceae)'),
('SUP-NAP',2,'CRP-LBN','Long Bean (PREF)'),
('SUP-NAP',3,'CRP-EGG','Eggplant (OK)'),
-- Legume Cover Crop
('SUP-LEG',1,'CRP-EGG','Eggplant (PREF - benefits from nitrogen)'),
('SUP-LEG',2,'CRP-TOM','Tomato (PREF)'),
('SUP-LEG',3,'CRP-CAB','Cabbage (PREF)'),
-- Agarwood
('FOR-AGA',1,'CRP-FRB','French Beans (after forestry harvest - soil restoration)'),
('FOR-AGA',2,'CRP-LBN','Long Bean (PREF)'),
('FOR-AGA',3,'CRP-EGG','Eggplant (OK)'),
-- Sandalwood
('FOR-SAN',1,'CRP-FRB','French Beans (PREF)'),
('FOR-SAN',2,'CRP-LBN','Long Bean (PREF)'),
('FOR-SAN',3,'CRP-EGG','Eggplant (OK)'),
-- Pine
('FOR-PIN',1,'CRP-FRB','French Beans (PREF)'),
('FOR-PIN',2,'CRP-LBN','Long Bean (PREF)'),
('FOR-PIN',3,'CRP-EGG','Eggplant (OK)'),
-- Mahogany
('FOR-MAH',1,'CRP-FRB','French Beans (PREF)'),
('FOR-MAH',2,'CRP-LBN','Long Bean (PREF)'),
('FOR-MAH',3,'CRP-EGG','Eggplant (OK)'),
-- Teak
('FOR-TEK',1,'CRP-FRB','French Beans (PREF)'),
('FOR-TEK',2,'CRP-LBN','Long Bean (PREF)'),
('FOR-TEK',3,'CRP-EGG','Eggplant (OK)');


-- =============================================================================
-- TABLE 8: shared.actionable_rules
-- Rotation enforcement rules derived from family policies
-- Full 1,444 rule matrix is imported by migration script from TFOS v7.0 xlsx
-- This seed contains critical same-family BLOCK rules and key PREF/OK rules
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.actionable_rules (
    rule_id                 TEXT PRIMARY KEY,
    current_production_id   TEXT REFERENCES shared.productions(production_id),
    next_production_id      TEXT REFERENCES shared.productions(production_id),
    rule_status             TEXT CHECK(rule_status IN ('PREF','OK','AVOID','BLOCK','COND','OVERLAY','N/A')),
    min_rest_days           INT DEFAULT 0,
    enforcement_decision    TEXT CHECK(enforcement_decision IN ('APPROVED','BLOCKED','OVERRIDE_REQUIRED')),
    disease_risk            TEXT,
    notes                   TEXT
);

-- Solanaceae back-to-back = BLOCK (60 days)
INSERT INTO shared.actionable_rules VALUES
('AR-EGG-EGG','CRP-EGG','CRP-EGG','BLOCK',60,'BLOCKED','High Fusarium wilt, nematode accumulation','Same species. Hard block.'),
('AR-EGG-TOM','CRP-EGG','CRP-TOM','BLOCK',60,'BLOCKED','High Fusarium/bacterial wilt risk','Solanaceae family. 60-day rest required.'),
('AR-EGG-CAP','CRP-EGG','CRP-CAP','BLOCK',60,'BLOCKED','Solanaceae disease buildup','60-day rest required'),
('AR-EGG-CHI','CRP-EGG','CRP-CHI','BLOCK',60,'BLOCKED','Solanaceae disease buildup','60-day rest required'),
('AR-TOM-EGG','CRP-TOM','CRP-EGG','BLOCK',60,'BLOCKED','Fusarium wilt, bacterial wilt','Solanaceae to Solanaceae. 60 days.'),
('AR-TOM-TOM','CRP-TOM','CRP-TOM','BLOCK',60,'BLOCKED','Late blight, Fusarium persistence','Same species. Hard block.'),
('AR-TOM-CAP','CRP-TOM','CRP-CAP','BLOCK',60,'BLOCKED','Solanaceae disease','60 days required'),
('AR-TOM-CHI','CRP-TOM','CRP-CHI','BLOCK',60,'BLOCKED','Solanaceae disease','60 days required'),
('AR-CAP-EGG','CRP-CAP','CRP-EGG','BLOCK',60,'BLOCKED','Solanaceae disease','60 days'),
('AR-CAP-TOM','CRP-CAP','CRP-TOM','BLOCK',60,'BLOCKED','Solanaceae disease','60 days'),
('AR-CAP-CAP','CRP-CAP','CRP-CAP','BLOCK',60,'BLOCKED','Solanaceae disease','Same species'),
('AR-CAP-CHI','CRP-CAP','CRP-CHI','BLOCK',60,'BLOCKED','Solanaceae disease','60 days'),
('AR-CHI-EGG','CRP-CHI','CRP-EGG','BLOCK',60,'BLOCKED','Solanaceae disease','60 days'),
('AR-CHI-TOM','CRP-CHI','CRP-TOM','BLOCK',60,'BLOCKED','Solanaceae disease','60 days'),
('AR-CHI-CAP','CRP-CHI','CRP-CAP','BLOCK',60,'BLOCKED','Solanaceae disease','60 days'),
('AR-CHI-CHI','CRP-CHI','CRP-CHI','BLOCK',60,'BLOCKED','Solanaceae disease','Same species'),
-- Cucurbitaceae family blocks
('AR-WAT-WAT','CRP-WAT','CRP-WAT','BLOCK',45,'BLOCKED','Cucumber mosaic, Phytophthora','Same species'),
('AR-WAT-CUC','CRP-WAT','CRP-CUC','BLOCK',45,'BLOCKED','Cucurbitaceae disease buildup','45 days'),
('AR-WAT-SQU','CRP-WAT','CRP-SQU','BLOCK',45,'BLOCKED','Cucurbitaceae disease','45 days'),
('AR-CUC-WAT','CRP-CUC','CRP-WAT','BLOCK',45,'BLOCKED','Cucurbitaceae disease','45 days'),
('AR-CUC-CUC','CRP-CUC','CRP-CUC','BLOCK',45,'BLOCKED','Cucurbitaceae disease','Same species'),
('AR-CUC-SQU','CRP-CUC','CRP-SQU','BLOCK',45,'BLOCKED','Cucurbitaceae disease','45 days'),
('AR-SQU-WAT','CRP-SQU','CRP-WAT','BLOCK',45,'BLOCKED','Cucurbitaceae disease','45 days'),
('AR-SQU-CUC','CRP-SQU','CRP-CUC','BLOCK',45,'BLOCKED','Cucurbitaceae disease','45 days'),
('AR-SQU-SQU','CRP-SQU','CRP-SQU','BLOCK',45,'BLOCKED','Cucurbitaceae disease','Same species'),
-- Araceae family blocks
('AR-DAL-DAL','CRP-DAL','CRP-DAL','BLOCK',90,'BLOCKED','Dasheen mosaic virus, Pythium','Same species, virus persists'),
('AR-DAL-DTN','CRP-DAL','CRP-DTN','BLOCK',90,'BLOCKED','Araceae shared pathogens','90 days'),
('AR-DTN-DAL','CRP-DTN','CRP-DAL','BLOCK',90,'BLOCKED','Araceae shared pathogens','90 days'),
('AR-DTN-DTN','CRP-DTN','CRP-DTN','BLOCK',90,'BLOCKED','Dasheen mosaic virus','Same species'),
-- Euphorbiaceae (Cassava) - 180 day hard block
('AR-CAS-CAS','CRP-CAS','CRP-CAS','BLOCK',180,'BLOCKED','Cassava mosaic disease, mealybug carryover','180-day mandatory rest'),
-- Zingiberaceae - AVOID (soft block)
('AR-GIN-GIN','CRP-GIN','CRP-GIN','AVOID',90,'OVERRIDE_REQUIRED','Pythium rhizome rot, bacterial wilt','90-day rest recommended'),
('AR-GIN-TUR','CRP-GIN','CRP-TUR','AVOID',90,'OVERRIDE_REQUIRED','Shared Zingiberaceae pathogens','90 days recommended'),
('AR-TUR-GIN','CRP-TUR','CRP-GIN','AVOID',90,'OVERRIDE_REQUIRED','Shared Zingiberaceae pathogens','90 days recommended'),
('AR-TUR-TUR','CRP-TUR','CRP-TUR','AVOID',90,'OVERRIDE_REQUIRED','Pythium rhizome rot','90 days recommended'),
-- Brassicaceae
('AR-CAB-CAB','CRP-CAB','CRP-CAB','BLOCK',60,'BLOCKED','Club root, black rot','Same species. 60 days.'),
-- Convolvulaceae
('AR-SPT-SPT','CRP-SPT','CRP-SPT','AVOID',60,'OVERRIDE_REQUIRED','Sweet potato weevil carryover, virus','60-day rest recommended'),
-- PREF rotations - Legumes after heavy feeders = PREF
('AR-EGG-FRB','CRP-EGG','CRP-FRB','PREF',0,'APPROVED','None - beneficial','Legume after Solanaceae - nitrogen fixation benefit'),
('AR-EGG-LBN','CRP-EGG','CRP-LBN','PREF',0,'APPROVED','None - beneficial','Legume nitrogen fixer'),
('AR-TOM-FRB','CRP-TOM','CRP-FRB','PREF',0,'APPROVED','None','Legume after Solanaceae'),
('AR-TOM-LBN','CRP-TOM','CRP-LBN','PREF',0,'APPROVED','None','Legume nitrogen fixer'),
('AR-CAB-FRB','CRP-CAB','CRP-FRB','PREF',0,'APPROVED','None','Legume after Brassicaceae'),
('AR-CAB-LBN','CRP-CAB','CRP-LBN','PREF',0,'APPROVED','None','Legume after Brassicaceae'),
('AR-SCN-FRB','CRP-SCN','CRP-FRB','PREF',0,'APPROVED','None','Legume after cereal - nitrogen fix'),
('AR-SCN-LBN','CRP-SCN','CRP-LBN','PREF',0,'APPROVED','None','Legume after cereal'),
-- OK rotations - different families, acceptable
('AR-EGG-CAS','CRP-EGG','CRP-CAS','OK',30,'APPROVED','Low','Different families, acceptable after 30 days'),
('AR-EGG-DAL','CRP-EGG','CRP-DAL','OK',30,'APPROVED','Low','Different families'),
('AR-EGG-SCN','CRP-EGG','CRP-SCN','OK',30,'APPROVED','Low','Different families'),
('AR-TOM-CAS','CRP-TOM','CRP-CAS','OK',30,'APPROVED','Low','Different families'),
('AR-TOM-DAL','CRP-TOM','CRP-DAL','OK',30,'APPROVED','Low','Different families'),
('AR-CAS-EGG','CRP-CAS','CRP-EGG','OK',30,'APPROVED','Low','After 180-day cassava rest, Solanaceae is OK'),
('AR-CAS-TOM','CRP-CAS','CRP-TOM','OK',30,'APPROVED','Low','After cassava rest, tomato OK'),
('AR-CAS-FRB','CRP-CAS','CRP-FRB','PREF',0,'APPROVED','None','Legume after cassava - nitrogen restoration'),
('AR-CAS-LBN','CRP-CAS','CRP-LBN','PREF',0,'APPROVED','None','Legume nitrogen fixer'),
-- Kava special rules
('AR-KAV-SUP','CRP-KAV','SUP-LEG','PREF',0,'APPROVED','None','Legume cover after kava for soil restoration'),
('AR-KAV-FRB','CRP-KAV','CRP-FRB','PREF',0,'APPROVED','None','Legume nitrogen fixer after kava'),
('AR-KAV-KAV','CRP-KAV','CRP-KAV','BLOCK',1825,'BLOCKED','Kava root rot, nematodes','Never replant kava in same area within 5 years'),
-- OVERLAY rules for livestock/perennials
('AR-API-EGG','LIV-API','CRP-EGG','OVERLAY',0,'APPROVED','N/A','Apiculture overlays crop rotation'),
('AR-API-TOM','LIV-API','CRP-TOM','OVERLAY',0,'APPROVED','N/A','Apiculture overlays crop rotation'),
('AR-GOA-EGG','LIV-GOA','CRP-EGG','OVERLAY',0,'APPROVED','N/A','Livestock overlays crop rotation'),
-- Forestry N/A rules
('AR-TEK-EGG','FOR-TEK','CRP-EGG','N/A',0,'APPROVED','N/A','Forestry - rotation concept not applicable'),
('AR-SAN-EGG','FOR-SAN','CRP-EGG','N/A',0,'APPROVED','N/A','Forestry N/A'),
-- Legume after any crop = PREF (representative seeded rows)
('AR-FRB-EGG','CRP-FRB','CRP-EGG','PREF',0,'APPROVED','None','Plant benefits from legume nitrogen'),
('AR-FRB-TOM','CRP-FRB','CRP-TOM','PREF',0,'APPROVED','None','Tomato benefits from legume nitrogen'),
('AR-FRB-CAB','CRP-FRB','CRP-CAB','PREF',0,'APPROVED','None','Cabbage benefits from nitrogen'),
('AR-LBN-EGG','CRP-LBN','CRP-EGG','PREF',0,'APPROVED','None','Benefits from nitrogen'),
('AR-LBN-TOM','CRP-LBN','CRP-TOM','PREF',0,'APPROVED','None','Benefits from nitrogen'),
-- COND example
('AR-KAV-DAL','CRP-KAV','CRP-DAL','COND',0,'APPROVED','Conditional','Check soil moisture and slope. Dalo needs flat, well-irrigated land. OK on flat zones only.');

-- NOTE: The complete 1,444 rules are built from the 49x49 matrix following family policy enforcement.
-- Rules not explicitly seeded above follow these defaults by rotation_group:
--   Annual vs Annual (different family): OK, 0-30 days
--   Perennial: OVERLAY, 0 days
--   Forestry: N/A, 0 days
--   Livestock: OVERLAY, 0 days
-- The migration script (extract_shared_data.py) imports the complete 1,444 rules from TFOS v7.0 xlsx


-- =============================================================================
-- TABLE 9: shared.kb_articles
-- Knowledge base articles for crop guides, protocols, pest/disease management
-- embedding_vector supports RAG (Retrieval Augmented Generation)
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.kb_articles (
    article_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    production_id       TEXT REFERENCES shared.productions(production_id),
    stage_id            TEXT,
    article_type        TEXT DEFAULT 'crop_guide' CHECK(article_type IN (
                            'crop_guide','stage_protocol','pest_guide','disease_guide',
                            'fertilization_guide','harvest_guide','post_harvest','general'
                        )),
    title               TEXT NOT NULL,
    content_md          TEXT,
    content_summary     TEXT,
    embedding_vector    vector(1536),
    validated_by        TEXT,
    validated_date      DATE,
    published           BOOLEAN DEFAULT false,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- TABLE 10: shared.kb_stage_links
-- Links knowledge base articles to specific production stages
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.kb_stage_links (
    link_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_id    TEXT NOT NULL,
    article_id  UUID REFERENCES shared.kb_articles(article_id),
    link_type   TEXT DEFAULT 'primary' CHECK(link_type IN ('primary','supplementary','reference')),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- TABLE 11: shared.kb_article_candidates
-- Self-populating pipeline for KB article creation.
-- Every time TIS answers from Fiji Intelligence (Layer 2 — no published KB article),
-- the query is logged here. Sorted by query_count DESC, this table tells you exactly
-- which KB articles to write next — driven by real farmer questions, not guesswork.
-- Review via GET /api/v1/knowledge/candidates (FOUNDER/ADMIN access only).
-- =============================================================================

CREATE TABLE IF NOT EXISTS shared.kb_article_candidates (
    id                  SERIAL PRIMARY KEY,
    query_text          TEXT NOT NULL,
    query_text_hash     TEXT GENERATED ALWAYS AS (md5(lower(trim(query_text)))) STORED,
    farm_id             VARCHAR(10),
    nearest_article_id  UUID REFERENCES shared.kb_articles(article_id),
    nearest_similarity  FLOAT,
    query_count         INTEGER DEFAULT 1,
    first_asked         TIMESTAMPTZ DEFAULT NOW(),
    last_asked          TIMESTAMPTZ DEFAULT NOW(),
    status              VARCHAR(20) DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'ARTICLE_CREATED', 'DISMISSED')),
    -- PENDING       = not yet reviewed by agronomist
    -- ARTICLE_CREATED = KB article drafted and published from this candidate
    -- DISMISSED     = not worth creating a standalone article for
    notes               TEXT,
    UNIQUE (query_text_hash)
);

COMMENT ON TABLE shared.kb_article_candidates IS
    'KB self-population pipeline. TIS logs every Layer-2 (Fiji Intelligence) answer here. '
    'Sort by query_count DESC to prioritize article creation. '
    'When an article is validated and published, update status to ARTICLE_CREATED.';

CREATE INDEX IF NOT EXISTS idx_kb_candidates_status
    ON shared.kb_article_candidates(status);

CREATE INDEX IF NOT EXISTS idx_kb_candidates_count
    ON shared.kb_article_candidates(query_count DESC);

CREATE INDEX IF NOT EXISTS idx_kb_candidates_last_asked
    ON shared.kb_article_candidates(last_asked DESC);


-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_productions_category
    ON shared.productions(category);

CREATE INDEX IF NOT EXISTS idx_productions_family
    ON shared.productions(plant_family);

CREATE INDEX IF NOT EXISTS idx_stages_production
    ON shared.production_stages(production_id);

CREATE INDEX IF NOT EXISTS idx_rotation_lookup
    ON shared.actionable_rules(current_production_id, next_production_id);

CREATE INDEX IF NOT EXISTS idx_rotation_status
    ON shared.actionable_rules(rule_status);

CREATE INDEX IF NOT EXISTS idx_chemical_whd
    ON shared.chemical_library(withholding_period_days);

-- Vector index for KB RAG (create AFTER embeddings are populated, not at schema init)
-- CREATE INDEX ON shared.kb_articles USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100);
-- Run this command after populating kb_articles with embeddings.


-- =============================================================================
-- GRANTS
-- Read-only access to all tenants via PUBLIC role
-- Write access is restricted to the application service role
-- =============================================================================

GRANT USAGE ON SCHEMA shared TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA shared TO PUBLIC;

-- kb_article_candidates requires INSERT/UPDATE from the application service role
-- (TIS logs every Layer-2 answer; query_count increments on repeat queries)
GRANT INSERT, UPDATE ON shared.kb_article_candidates TO teivaka;
GRANT USAGE, SELECT ON SEQUENCE shared.kb_article_candidates_id_seq TO teivaka;
