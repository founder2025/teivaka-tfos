-- Seed platform reference prices into community.price_records (Market Intelligence).
-- These are ADMIN_REFERENCE rows (is_actual_sale = FALSE) using the Operator's own
-- illustrative Fiji price points from the sacred prototype's "Today's prices" table.
-- They inform the board + Home snapshot but NEVER count toward the weighted-sales
-- price. tenant_id/created_by are NULL (platform reference, not tenant-owned).
--
-- Honest by design: only reference PRICES are seeded. Buyer demand + supply forecasts
-- are real user actions — add them live via the UI (+ Post demand / + Post harvest),
-- not seeded, so the boards never show fabricated activity.
--
-- Idempotent: clears prior ADMIN_REFERENCE rows, then re-inserts. Run as owner:
--   docker exec -i teivaka_db psql -U teivaka -d teivaka_db < docs/runbooks/seed_market_reference_prices.sql

DELETE FROM community.price_records WHERE source = 'ADMIN_REFERENCE';

INSERT INTO community.price_records
    (production_id, grade, island, location_region, price_per_kg_fjd, buyer_type,
     source, is_actual_sale, observed_at, notes)
SELECT s.pid, v.grade, 'Viti Levu', v.loc, v.price, v.buyer,
       'ADMIN_REFERENCE', FALSE,
       now() - (random() * interval '20 days'),
       'Operator reference price (prototype baseline)'
FROM (VALUES
    -- crop pattern,        grade, location,        buyer,          price
    ('%eggplant%',          'A',  'Nayans',         'Supermarket',  6.50),
    ('%eggplant%',          'A',  'Sigatoka mkt',   'Market',       5.20),
    ('%eggplant%',          'A',  'Suva mkt',       'Market',       5.80),
    ('%eggplant%',          'B',  'Local',          'Local',        3.00),
    ('%tomato%',            'A',  'Nayans',         'Supermarket',  7.00),
    ('%tomato%',            'A',  'Sigatoka mkt',   'Market',       6.00),
    ('%tomato%',            'A',  'Suva mkt',       'Market',       6.50),
    ('%tomato%',            'B',  'Local',          'Local',        3.50),
    ('%cassava%',           'A',  'Nayans',         'Supermarket',  3.50),
    ('%cassava%',           'A',  'Sigatoka mkt',   'Market',       2.80),
    ('%cassava%',           'A',  'Suva mkt',       'Market',       3.00),
    ('%cassava%',           'B',  'Local',          'Local',        2.20),
    ('%bok%choy%',          'A',  'Nayans',         'Supermarket',  8.00),
    ('%bok%choy%',          'A',  'Sigatoka mkt',   'Market',       7.00),
    ('%bok%choy%',          'A',  'Suva mkt',       'Market',       7.50),
    ('%bok%choy%',          'B',  'Local',          'Local',        5.00),
    ('%pineapple%',         'A',  'Nayans',         'Supermarket',  6.50),
    ('%pineapple%',         'A',  'Sigatoka mkt',   'Market',       5.50),
    ('%pineapple%',         'A',  'Resort',         'Hotel',        6.50),
    ('%pineapple%',         'B',  'Local',          'Local',        4.00),
    ('%kava%',              'A',  'Exporter',       'Exporter',     48.00),
    ('%kava%',              'A',  'Local mkt',      'Market',       42.00),
    ('%kava%',              'A',  'Suva mkt',       'Market',       45.00),
    ('%kava%',              'B',  'Village',        'Local',        35.00)
) AS v(crop, grade, loc, buyer, price)
CROSS JOIN LATERAL (
    SELECT production_id AS pid
    FROM shared.productions
    WHERE production_name ILIKE v.crop
    ORDER BY length(production_name)
    LIMIT 1
) s;

-- Report what landed (and which crops had no shared.productions match).
SELECT pr.production_id, p.production_name, count(*) AS rows,
       min(pr.price_per_kg_fjd) AS low, max(pr.price_per_kg_fjd) AS high
FROM community.price_records pr
LEFT JOIN shared.productions p ON p.production_id = pr.production_id
WHERE pr.source = 'ADMIN_REFERENCE'
GROUP BY pr.production_id, p.production_name
ORDER BY p.production_name;
