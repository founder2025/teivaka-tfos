-- FILE: 02_database/schema/04_seed_data.sql
-- Teivaka Farm OS — Seed Data (schema-aligned v2, April 2026)
-- Column names match 02_tenant_schema.sql exactly.
-- Safe to re-run: ON CONFLICT DO NOTHING throughout.
-- Run after: 01_shared_schema.sql, 02_tenant_schema.sql, 03_materialized_views.sql, 05_functions.sql
--
-- FOUNDER LOGIN (Cody):
--   email:    cody@teivaka.com
--   password: Teivaka2025!   ← CHANGE IMMEDIATELY AFTER FIRST LOGIN

SET search_path TO tenant, shared, public;
SET session_replication_role = 'replica';

BEGIN;

-- =============================================================================
-- 1. TENANT  (Teivaka PTE LTD)
-- =============================================================================
INSERT INTO tenant.tenants (
    tenant_id, company_name, subscription_tier, subscription_status,
    tis_daily_limit, primary_contact_name, primary_contact_email,
    primary_contact_phone, country, timezone, is_active, created_at, updated_at
) VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Teivaka PTE LTD',
    'PROFESSIONAL',
    'ACTIVE',
    100,
    'Uraia Koroi Kama',
    'cody@teivaka.com',
    '+6798730866',
    'FJ',
    'Pacific/Fiji',
    true,
    NOW(), NOW()
) ON CONFLICT (tenant_id) DO NOTHING;

-- =============================================================================
-- 2. FOUNDER USER (Cody)
-- password: Teivaka2025!  (bcrypt $2b$12$, change on first login)
-- =============================================================================
INSERT INTO tenant.users (
    user_id, tenant_id, email, password_hash, full_name, role,
    phone_number, whatsapp_number, preferred_language, is_active, created_at, updated_at
) VALUES (
    'b1ffcd00-1a2b-4fc9-cc7e-7cc0ce491b22',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'cody@teivaka.com',
    '$2b$12$WAFRVez2fiasKzOnEbhxQe728.0SuPTGfakVIOGlHTVkSqTl8FUkK',
    'Uraia Koroi Kama',
    'FOUNDER',
    '+6798730866',
    '+6798730866',
    'en',
    true,
    NOW(), NOW()
) ON CONFLICT (user_id) DO NOTHING;

-- =============================================================================
-- 3. FARMS
-- land_area_ha = acres × 0.404686
-- =============================================================================
INSERT INTO tenant.farms (
    farm_id, tenant_id, farm_name,
    location_name, location_province, location_island,
    land_area_ha, farm_type,
    profit_share_enabled, profit_share_rate_pct, profit_share_party,
    island_logistics, ferry_supplier_id, ferry_frequency_days, ferry_buffer_days,
    timezone, is_active, notes, created_at, updated_at
) VALUES
(
    'F001',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Save-A-Lot Farm',
    'Korovou', 'Serua Province', 'Viti Levu',
    33.59,
    'LEASED',
    true, 50.00, 'Nayans Group',
    false, NULL, NULL, NULL,
    'Pacific/Fiji', true,
    'iTaukei NLTB lease. Clay Loam/Red Loamy Sandy soil. Rain+Tank+River. 83 acres total, ~4.15 active.',
    NOW(), NOW()
),
(
    'F002',
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'Viyasiyasi Farm',
    'Viyasiyasi Village, Solodamu', 'Kadavu Province', 'Kadavu',
    13.76,
    'OWNED',
    false, NULL, NULL,
    true, 'SUP-012', 7, 3,
    'Pacific/Fiji', true,
    'Kadavu island farm. River pump (Z02) + rainfed. Ferry-dependent logistics via Sea Master. 34 acres total, ~29 active.',
    NOW(), NOW()
) ON CONFLICT (farm_id) DO NOTHING;

-- =============================================================================
-- 4. ZONES (14 total)
-- area_ha = acres × 0.404686
-- zone_type: CROP, LIVESTOCK, APICULTURE, NURSERY, STORAGE, MIXED
-- irrigation_type: DRIP, SPRINKLER, FLOOD, RAIN_FED, MANUAL
-- =============================================================================
INSERT INTO tenant.zones (
    zone_id, tenant_id, farm_id, zone_name, zone_type,
    area_ha, soil_type, irrigation_type,
    is_active, notes, created_at, updated_at
) VALUES
-- F001 zones
('F001-Z01','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Zone 1 - Korovou Main Field','CROP',      0.485,'Clay Loam',  'DRIP',    true,'Drip irrigation kit installed',   NOW(),NOW()),
('F001-Z02','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Zone 2 - Lower Field',       'CROP',      0.324,'Sandy Loam', 'RAIN_FED',true,NULL,                               NOW(),NOW()),
('F001-Z03','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Zone 3 - Nursery Area',      'NURSERY',   0.121,'Sandy',      'MANUAL',  true,'Shade nursery',                   NOW(),NOW()),
('F001-Z04','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Zone 4 - Sweet Potato Block','CROP',      0.202,'Clay Loam',  'RAIN_FED',true,NULL,                               NOW(),NOW()),
('F001-Z05','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Zone 5 - Cassava Block',     'CROP',      0.304,'Red Loamy',  'RAIN_FED',true,NULL,                               NOW(),NOW()),
('F001-Z06','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Zone 6 - Apiary Area',       'APICULTURE',0.040,'Mixed',      'RAIN_FED',true,'4 Langstroth hives',              NOW(),NOW()),
('F001-Z07','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Zone 7 - Expansion Zone',    'CROP',      0.485,'Clay Loam',  'MANUAL',  true,'Tank-fed expansion',              NOW(),NOW()),
-- F002 zones
('F002-Z01','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Zone 1 - Kava Block North',  'CROP',      2.428,'Loam',       'RAIN_FED',true,'Active kava 4-yr cycle',          NOW(),NOW()),
('F002-Z02','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Zone 2 - Kava Block South',  'CROP',      3.237,'Loam',       'SPRINKLER',true,'River pump fed',                 NOW(),NOW()),
('F002-Z03','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Zone 3 - Pineapple Block',   'CROP',      1.619,'Sandy Loam', 'RAIN_FED',true,NULL,                               NOW(),NOW()),
('F002-Z04','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Zone 4 - Goat Paddock',      'LIVESTOCK', 1.214,'Mixed',      'RAIN_FED',true,'Fenced paddock',                  NOW(),NOW()),
('F002-Z05','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Zone 5 - Community Garden',  'MIXED',     0.809,'Clay',       'RAIN_FED',true,'Community use area',              NOW(),NOW()),
('F002-Z06','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Zone 6 - Expansion North',   'CROP',      2.023,'Clay slopes','RAIN_FED',true,'Future planting area',            NOW(),NOW()),
('F002-Z07','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Zone 7 - Forest Reserve',    'MIXED',     2.428,'Mixed',      'RAIN_FED',true,'Buffer/reserve zone',             NOW(),NOW())
ON CONFLICT (zone_id) DO NOTHING;

-- =============================================================================
-- 5. PRODUCTION UNITS (22 total)
-- area_sqm = acres × 4046.86
-- pu_type: BED, PLOT, GREENHOUSE, POND, PADDOCK, HIVE_STAND
-- =============================================================================
INSERT INTO tenant.production_units (
    pu_id, tenant_id, zone_id, farm_id, pu_name, pu_type,
    area_sqm, current_production_id,
    is_active, notes, created_at, updated_at
) VALUES
('F001-PU001','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z05','F001','Cassava Plot Z05',       'PLOT',      3035.0,'CRP-CAS',true,'Active cassava',            NOW(),NOW()),
('F001-PU002','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z01','F001','Eggplant Bed Z01-A',     'BED',       1619.0,'CRP-EGG',true,'Main eggplant field',       NOW(),NOW()),
('F001-PU003','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z07','F001','Eggplant Bed Z07-A',     'BED',       2023.0,'CRP-EGG',true,'Eggplant expansion',        NOW(),NOW()),
('F001-PU004','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z01','F001','Idle Plot Z01-B',        'PLOT',      1214.0,NULL,     true,'Resting',                   NOW(),NOW()),
('F001-PU005','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z02','F001','Idle Plot Z02-A',        'PLOT',      1619.0,NULL,     true,'Resting',                   NOW(),NOW()),
('F001-PU006','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z02','F001','Idle Plot Z02-B',        'PLOT',      1619.0,NULL,     true,'Resting',                   NOW(),NOW()),
('F001-PU007','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z07','F001','Idle Plot Z07-B',        'PLOT',      1214.0,NULL,     true,'Resting',                   NOW(),NOW()),
('F001-PU008','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z07','F001','Idle Plot Z07-C',        'PLOT',       405.0,NULL,     true,'Resting',                   NOW(),NOW()),
('F001-PU009','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z01','F001','Idle Plot Z01-C',        'PLOT',       809.0,NULL,     true,'Resting',                   NOW(),NOW()),
('F001-PU010','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z03','F001','Nursery Z03',            'GREENHOUSE',1214.0,NULL,     true,'Seedling nursery',          NOW(),NOW()),
('F001-PU011','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z06','F001','Apiary Hive Stand Z06', 'HIVE_STAND', 405.0,'LIV-API',true,'4 Langstroth hives',        NOW(),NOW()),
('F001-PU012','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z04','F001','Sweet Potato Block Z04','PLOT',       2023.0,NULL,     true,'Completed cycle, resting',  NOW(),NOW()),
('F001-PU013','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z01','F001','Idle Plot Z01-D',        'PLOT',       809.0,NULL,     true,'Resting',                   NOW(),NOW()),
('F001-PU014','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z02','F001','Idle Plot Z02-C',        'PLOT',       809.0,NULL,     true,'Resting',                   NOW(),NOW()),
('F001-PU015','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001-Z07','F001','Idle Plot Z07-D',        'PLOT',       405.0,NULL,     true,'Resting',                   NOW(),NOW()),
('F002-PU001','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002-Z01','F002','Legacy Slot Z01',        'PLOT',        NULL,NULL,    false,'Legacy ID placeholder',     NOW(),NOW()),
('F002-PU002','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002-Z02','F002','Legacy Slot Z02',        'PLOT',        NULL,NULL,    false,'Legacy ID placeholder',     NOW(),NOW()),
('F002-PU003','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002-Z04','F002','Goat Paddock Z04',      'PADDOCK',   12141.0,'LIV-GOA',true,'Active goat herd',          NOW(),NOW()),
('F002-PU004','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002-Z03','F002','Pineapple Block Z03',   'PLOT',      16187.0,'FRT-PIN',true,'Active pineapple block',    NOW(),NOW()),
('F002-PU005','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002-Z05','F002','Community Garden Z05',  'PLOT',       8094.0,NULL,     true,'Community use, idle',       NOW(),NOW()),
('F002-PU006','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002-Z01','F002','Kava Block North Z01',  'PLOT',      24281.0,'CRP-KAV',true,'Active kava 4-yr cycle',    NOW(),NOW()),
('F002-PU007','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002-Z02','F002','Kava Block South Z02',  'PLOT',      32375.0,'CRP-KAV',true,'Active kava 4-yr cycle',    NOW(),NOW())
ON CONFLICT (pu_id) DO NOTHING;

-- =============================================================================
-- 6. WORKERS (11)
-- worker_type: PERMANENT, CASUAL, CONTRACT, FAMILY
-- =============================================================================
INSERT INTO tenant.workers (
    worker_id, tenant_id, farm_id, full_name, worker_type,
    daily_rate_fjd, phone, whatsapp_number,
    is_active, created_at, updated_at
) VALUES
('W-001','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Laisenia Waqa',       'PERMANENT',6.00,'+6797336211','+6797336211',true, NOW(),NOW()),
('W-002','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Maika Ratubaba',      'CASUAL',   6.00,'+6798399088','+6798399088',true, NOW(),NOW()),
('W-003','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Maciu Tuilau',        'CASUAL',   6.00,'+6799328045','+6799328045',true, NOW(),NOW()),
('W-004','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Rusiate Wadali',      'CASUAL',   6.00,NULL,          NULL,         true, NOW(),NOW()),
('W-005','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Vairusi Tokoni',      'CASUAL',   6.00,NULL,          NULL,         true, NOW(),NOW()),
('W-006','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Naita Mosese',        'CASUAL',   6.00,NULL,          NULL,         true, NOW(),NOW()),
('W-007','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Marika',              'CASUAL',   6.00,NULL,          NULL,         true, NOW(),NOW()),
('W-008','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Crew-Nayan Group',    'CONTRACT', 0.00,NULL,          NULL,         true, NOW(),NOW()),
('W-009','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Apisai',              'CASUAL',   6.00,NULL,          NULL,         true, NOW(),NOW()),
('W-010','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','TBD Kadavu Worker 1', 'CASUAL',   6.00,NULL,          NULL,         false,NOW(),NOW()),
('W-011','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','TBD Kadavu Worker 2', 'CASUAL',   6.00,NULL,          NULL,         false,NOW(),NOW())
ON CONFLICT (worker_id) DO NOTHING;

-- =============================================================================
-- 7. SUPPLIERS (13)
-- supplier_type: INPUT, EQUIPMENT, SHIPPING, SERVICE, MIXED
-- =============================================================================
INSERT INTO tenant.suppliers (
    supplier_id, tenant_id, supplier_name, supplier_type,
    island, is_preferred, is_active, notes, created_at, updated_at
) VALUES
('SUP-001','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Hop Tiy & Co PTE Ltd',                    'INPUT',   'Viti Levu',true, true,'Seeds/Chemicals/Tools',           NOW(),NOW()),
('SUP-002','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Agchem Limited',                           'INPUT',   'Viti Levu',true, true,'Chemicals specialist',            NOW(),NOW()),
('SUP-003','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Goodman Fielder',                          'INPUT',   'Viti Levu',false,true,'Organic inputs',                  NOW(),NOW()),
('SUP-004','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Vinod Patel & Co PTE Ltd',                'EQUIPMENT','Viti Levu',true, true,'Hardware/Infrastructure',         NOW(),NOW()),
('SUP-005','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Top Multi Supplies & Accessories PTE Ltd','EQUIPMENT','Viti Levu',false,true,'Machinery/Equipment',             NOW(),NOW()),
('SUP-006','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Delta Supercheap Motor Spares Ltd',       'SERVICE', 'Viti Levu',false,true,'Spare parts/maintenance',         NOW(),NOW()),
('SUP-007','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','FMF Foods Limited & Group',               'MIXED',   'Viti Levu',false,true,'Suva-based general',              NOW(),NOW()),
('SUP-008','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Sanjay Carrier Service & Earthworks',     'SERVICE', 'Viti Levu',false,true,'Earthworks/transport contractor', NOW(),NOW()),
('SUP-009','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Mamas',                                   'SERVICE', 'Viti Levu',false,true,'General contractor',              NOW(),NOW()),
('SUP-010','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Agro Seeds',                              'INPUT',   'Viti Levu',true, true,'Seeds - Suva',                    NOW(),NOW()),
('SUP-011','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Farming Implements',                      'INPUT',   'Viti Levu',false,true,'Tools - Suva',                    NOW(),NOW()),
('SUP-012','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Sea Master Shipping',                     'SHIPPING','Kadavu',   true, true,'Kadavu ferry - F002 supply route',NOW(),NOW()),
('SUP-013','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Pacific Energy',                          'SERVICE', NULL,       false,true,'Nationwide fuel',                 NOW(),NOW())
ON CONFLICT (supplier_id) DO NOTHING;

-- =============================================================================
-- 8. CUSTOMERS (16)
-- customer_type: DIRECT, WHOLESALE, RESTAURANT, SUPERMARKET, EXPORT, RELATED_PARTY
-- =============================================================================
INSERT INTO tenant.customers (
    customer_id, tenant_id, customer_name, customer_type,
    address, island, payment_terms_days,
    is_related_party, is_active, notes, created_at, updated_at
) VALUES
('CUS-001','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','New World Supermarket',        'SUPERMARKET',  'Vatuwaqa',  'Viti Levu',7, false,true,NULL,                     NOW(),NOW()),
('CUS-002','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Extra Supermarket',            'SUPERMARKET',  'Laucala',   'Viti Levu',7, false,true,NULL,                     NOW(),NOW()),
('CUS-003','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Nayans-Kalsa Supermarket',     'RELATED_PARTY','Kalsa',     'Viti Levu',0, true, true,'Related party - Nayans', NOW(),NOW()),
('CUS-004','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Nayans-Korovou Supermarket',   'RELATED_PARTY','Korovou',   'Viti Levu',0, true, true,'Related party - Nayans', NOW(),NOW()),
('CUS-005','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Nayans-Pilling Supermarket',   'RELATED_PARTY','Pilling',   'Viti Levu',0, true, true,'Related party - Nayans', NOW(),NOW()),
('CUS-006','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Nayans-Nadera Supermarket',    'RELATED_PARTY','Nadera',    'Viti Levu',0, true, true,'Related party - Nayans', NOW(),NOW()),
('CUS-007','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Nayans-Sport City Supermarket','RELATED_PARTY','Sport City','Viti Levu',0, true, true,'Related party - Nayans', NOW(),NOW()),
('CUS-008','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Flagstaff Market',             'WHOLESALE',    'Flagstaff', 'Viti Levu',0, false,true,NULL,                     NOW(),NOW()),
('CUS-009','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Raiwaqa Market',               'WHOLESALE',    'Raiwaqa',   'Viti Levu',0, false,true,NULL,                     NOW(),NOW()),
('CUS-010','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Laqere Market',                'WHOLESALE',    'Laqere',    'Viti Levu',0, false,true,NULL,                     NOW(),NOW()),
('CUS-011','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Farm Gate - Korovou',          'DIRECT',       'Korovou',   'Viti Levu',0, false,true,NULL,                     NOW(),NOW()),
('CUS-012','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Paradiso Restaurant',          'RESTAURANT',   'Suva',      'Viti Levu',7, false,true,NULL,                     NOW(),NOW()),
('CUS-013','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Hotel Pipeline',               'WHOLESALE',    'TBD',       NULL,       14,false,true,'Pipeline customer',      NOW(),NOW()),
('CUS-014','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Supermarket Pipeline',         'SUPERMARKET',  'TBD',       NULL,       7, false,true,'Pipeline customer',      NOW(),NOW()),
('CUS-015','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Vunisea Market',               'WHOLESALE',    'Vunisea',   'Kadavu',   0, false,true,'F002 primary market',    NOW(),NOW()),
('CUS-016','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Kadavu Direct Channel',        'DIRECT',       'Kadavu',    'Kadavu',   0, false,false,'Future channel',         NOW(),NOW())
ON CONFLICT (customer_id) DO NOTHING;

-- =============================================================================
-- 9. EQUIPMENT (23 items)
-- equipment_type: TRACTOR, IRRIGATION, TOOL, VEHICLE, PROCESSING, STORAGE, OTHER
-- condition: EXCELLENT, GOOD, FAIR, POOR, DECOMMISSIONED
-- =============================================================================
INSERT INTO tenant.equipment (
    equipment_id, tenant_id, farm_id, equipment_name, equipment_type,
    purchase_date, purchase_cost_fjd, condition,
    is_active, notes, created_at, updated_at
) VALUES
('EQP-F001-001','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Water Pump (2HP)',            'IRRIGATION','2024-01-15',850.00,  'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F001-002','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Garden Tiller (Petrol)',      'OTHER',     '2023-06-01',1200.00, 'FAIR',true,NULL,                     NOW(),NOW()),
('EQP-F001-003','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Knapsack Sprayer 16L - A',    'OTHER',     '2024-03-01',95.00,   'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F001-004','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Knapsack Sprayer 16L - B',    'OTHER',     '2024-03-01',95.00,   'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F001-005','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Wheelbarrow A',               'TOOL',      '2024-01-15',85.00,   'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F001-006','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Wheelbarrow B',               'TOOL',      '2024-01-15',85.00,   'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F001-007','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Irrigation Drip Kit Zone 1',  'IRRIGATION','2024-06-01',2200.00, 'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F001-008','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Water Tank 5000L',            'STORAGE',   '2023-12-01',1800.00, 'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F001-009','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Machete x5',                  'TOOL',      '2024-01-01',12.00,   'FAIR',true,NULL,                     NOW(),NOW()),
('EQP-F001-010','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Hoe x10',                     'TOOL',      '2024-01-01',8.50,    'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F001-011','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Rake x5',                     'TOOL',      '2024-01-01',9.00,    'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F001-012','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Generator 3.5kW',             'OTHER',     '2023-11-01',1500.00, 'FAIR',true,NULL,                     NOW(),NOW()),
('EQP-F001-013','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Beehive Langstroth x4',       'OTHER',     '2024-01-01',320.00,  'GOOD',true,'Apiculture equipment', NOW(),NOW()),
('EQP-F001-014','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Bee Smoker',                  'OTHER',     '2024-01-01',45.00,   'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F001-015','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F001','Harvest Crates x20',          'TOOL',      '2024-01-01',15.00,   'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F002-001','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Water Pump (3HP River)',       'IRRIGATION','2024-02-01',1100.00, 'GOOD',true,'Zone 2 river feed',    NOW(),NOW()),
('EQP-F002-002','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Knapsack Sprayer 16L',        'OTHER',     '2024-02-01',95.00,   'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F002-003','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Machete x8',                  'TOOL',      '2024-02-01',12.00,   'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F002-004','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Hoe x12',                     'TOOL',      '2024-02-01',8.50,    'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F002-005','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Tarpaulin x5',                'TOOL',      '2024-02-01',45.00,   'GOOD',true,NULL,                     NOW(),NOW()),
('EQP-F002-006','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Storage Shed (Kava Drying)',  'STORAGE',   '2024-03-01',8500.00, 'GOOD',true,'Kava drying facility', NOW(),NOW()),
('EQP-F002-007','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Goat Fencing (3 acres)',      'OTHER',     '2024-02-01',3200.00, 'GOOD',true,'Z04 paddock fencing',  NOW(),NOW()),
('EQP-F002-008','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','F002','Ferry Storage Boxes x10',     'TOOL',      '2024-03-01',35.00,   'GOOD',true,'Kadavu logistics',     NOW(),NOW())
ON CONFLICT (equipment_id) DO NOTHING;

-- =============================================================================
-- 10. INPUTS (26 items)
-- input_category: FERTILIZER, PESTICIDE, HERBICIDE, FUNGICIDE, SEED, SEEDLING, TOOL, PACKAGING, FUEL, OTHER
-- =============================================================================
INSERT INTO tenant.inputs (
    input_id, tenant_id, input_name, input_category, unit_of_measure,
    current_stock_qty, reorder_point_qty, reorder_qty,
    unit_cost_fjd, preferred_supplier_id,
    is_chemical, chemical_id,
    is_active, created_at, updated_at
) VALUES
('INP-SEED-EGG', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Eggplant Seed (Long Purple)',  'SEED',      'kg',    0.5, 0.2, 0.5, 350.00,'SUP-001',false,NULL,      true,NOW(),NOW()),
('INP-SEED-TOM', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Tomato Seed (Mongal F1)',       'SEED',      'kg',    0.3, 0.1, 0.3, 420.00,'SUP-001',false,NULL,      true,NOW(),NOW()),
('INP-SEED-CAS', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Cassava Cuttings',              'SEED',      'bundle',50,  20,  30,  2.50,  'SUP-001',false,NULL,      true,NOW(),NOW()),
('INP-SEED-SPT', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Sweet Potato Vine Cuttings',    'SEED',      'bundle',30,  15,  20,  1.80,  'SUP-001',false,NULL,      true,NOW(),NOW()),
('INP-SEED-KAV', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Kava Planting Material (Waka)', 'SEED',      'kg',    5,   2,   5,   45.00, 'SUP-010',false,NULL,      true,NOW(),NOW()),
('INP-FERT-NPK', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','NPK Fertilizer 12-12-17',       'FERTILIZER','kg',    80,  30,  50,  3.20,  'SUP-001',false,NULL,      true,NOW(),NOW()),
('INP-FERT-URE', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Urea 46%',                      'FERTILIZER','kg',    60,  25,  50,  2.80,  'SUP-001',false,NULL,      true,NOW(),NOW()),
('INP-FERT-DAP', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','DAP 18-46-0',                   'FERTILIZER','kg',    40,  20,  30,  4.50,  'SUP-001',false,NULL,      true,NOW(),NOW()),
('INP-FERT-ORG', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Organic Compost',               'FERTILIZER','kg',    200, 50,  100, 0.80,  'SUP-003',false,NULL,      true,NOW(),NOW()),
('INP-FERT-ORG2','a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Organic Compost (Kava)',        'FERTILIZER','kg',    150, 50,  100, 0.80,  'SUP-003',false,NULL,      true,NOW(),NOW()),
('INP-CHEM-DIM', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Dimethoate 40% EC',             'PESTICIDE', 'L',     2,   0.5, 2,   85.00, 'SUP-002',true, 'CHEM-001',true,NOW(),NOW()),
('INP-CHEM-MAN', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Mancozeb 80% WP',               'FUNGICIDE', 'kg',    3,   1,   3,   42.00, 'SUP-002',true, 'CHEM-002',true,NOW(),NOW()),
('INP-CHEM-CYP', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Cypermethrin 10% EC',           'PESTICIDE', 'L',     2,   0.5, 2,   65.00, 'SUP-002',true, 'CHEM-003',true,NOW(),NOW()),
('INP-CHEM-COP', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Copper Oxychloride 85% WP',     'FUNGICIDE', 'kg',    2,   0.5, 2,   38.00, 'SUP-002',true, 'CHEM-004',true,NOW(),NOW()),
('INP-CHEM-GLY', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Glyphosate 480 SL',             'HERBICIDE', 'L',     5,   1,   5,   22.00, 'SUP-002',true, 'CHEM-005',true,NOW(),NOW()),
('INP-CHEM-IMI', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Imidacloprid 70% WG',           'PESTICIDE', 'kg',    0.5, 0.1, 0.5, 180.00,'SUP-002',true, 'CHEM-006',true,NOW(),NOW()),
('INP-TOOL-GLV', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Garden Gloves (pairs)',          'TOOL',      'pairs', 20,  5,   10,  8.50,  'SUP-011',false,NULL,      true,NOW(),NOW()),
('INP-TOOL-TWN', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Tomato Twine (rolls)',           'TOOL',      'rolls', 10,  2,   5,   12.00, 'SUP-011',false,NULL,      true,NOW(),NOW()),
('INP-PACK-BAG', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Harvest Bags 25kg (bales)',      'PACKAGING', 'bale',  5,   2,   5,   45.00, 'SUP-001',false,NULL,      true,NOW(),NOW()),
('INP-PACK-BOX', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Cardboard Boxes (bales)',        'PACKAGING', 'bale',  8,   3,   5,   38.00, 'SUP-001',false,NULL,      true,NOW(),NOW()),
('INP-FUEL-DSL', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Diesel Fuel',                   'FUEL',      'L',     80,  20,  60,  2.95,  'SUP-013',false,NULL,      true,NOW(),NOW()),
('INP-F2-FERT',  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','NPK Fertilizer F002',           'FERTILIZER','kg',    40,  20,  50,  3.20,  'SUP-001',false,NULL,      true,NOW(),NOW()),
('INP-F2-GLYPH', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Glyphosate F002',               'HERBICIDE', 'L',     3,   1,   5,   22.00, 'SUP-002',true, 'CHEM-005',true,NOW(),NOW()),
('INP-F2-KBAG',  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Kava Export Bags',              'PACKAGING', 'bale',  10,  3,   10,  55.00, 'SUP-011',false,NULL,      true,NOW(),NOW()),
('INP-F2-ROPE',  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Rope/Ties (rolls)',             'TOOL',      'rolls', 8,   2,   5,   6.50,  'SUP-011',false,NULL,      true,NOW(),NOW()),
('INP-F2-GFEED', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11','Goat Feed Mix',                 'OTHER',     'kg',    50,  15,  50,  1.80,  'SUP-001',false,NULL,      true,NOW(),NOW())
ON CONFLICT (input_id) DO NOTHING;

COMMIT;

SET session_replication_role = 'origin';
