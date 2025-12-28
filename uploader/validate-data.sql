-- Quick Validation Queries
-- Run these after importing data

\echo '========================================='
\echo 'DATA VALIDATION QUERIES'
\echo '========================================='
\echo ''

-- 1. Record counts
\echo '1. RECORD COUNTS BY TABLE'
\echo '-----------------------------------------'
SELECT 'zones' AS table_name, COUNT(*) AS records FROM zones
UNION ALL SELECT 'regions', COUNT(*) FROM regions
UNION ALL SELECT 'depo', COUNT(*) FROM depo
UNION ALL SELECT 'principals', COUNT(*) FROM principals
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'units', COUNT(*) FROM units
UNION ALL SELECT 'product_groups', COUNT(*) FROM product_groups
UNION ALL SELECT 'promotions', COUNT(*) FROM promotions
UNION ALL SELECT 'area_coverage', COUNT(*) FROM area_coverage
UNION ALL SELECT 'prices', COUNT(*) FROM prices
ORDER BY table_name;

\echo ''
\echo '2. PRODUCTS WITHOUT PRICES'
\echo '-----------------------------------------'
SELECT p.code, p.name, p.principal_id
FROM products p
WHERE NOT EXISTS (
    SELECT 1 FROM prices pr WHERE pr.product_id = p.id
)
AND p.is_active = true;

\echo ''
\echo '3. COVERAGE RULES SUMMARY'
\echo '-----------------------------------------'
SELECT 
    entity_type,
    rule_type,
    level,
    COUNT(*) AS total_rules
FROM area_coverage
GROUP BY entity_type, rule_type, level
ORDER BY entity_type, rule_type, level;

\echo ''
\echo '4. ACTIVE PROMOTIONS BY TYPE'
\echo '-----------------------------------------'
SELECT 
    promo_type,
    store_type,
    COUNT(*) AS total,
    MIN(valid_from) AS earliest_start,
    MAX(valid_until) AS latest_end
FROM promotions
WHERE is_active = true
GROUP BY promo_type, store_type
ORDER BY promo_type, store_type;

\echo ''
\echo '5. PRODUCT AVAILABILITY SUMMARY (from MV)'
\echo '-----------------------------------------'
SELECT 
    d.code AS depo_code,
    COUNT(DISTINCT mv.product_id) AS available_products,
    COUNT(DISTINCT CASE WHEN mv.is_available = true THEN mv.product_id END) AS actually_available
FROM depo d
LEFT JOIN mv_product_availability_by_depo mv ON mv.depo_id = d.id
WHERE d.is_active = true
GROUP BY d.code
ORDER BY d.code;

\echo ''
\echo '6. ORPHANED FOREIGN KEYS CHECK'
\echo '-----------------------------------------'
-- Products without valid principal
SELECT 'products->principals' AS relation, COUNT(*) AS orphaned
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM principals pr WHERE pr.id = p.principal_id);

-- Prices without valid product or zone
SELECT 'prices->products' AS relation, COUNT(*) AS orphaned
FROM prices pr
WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.id = pr.product_id)
UNION ALL
SELECT 'prices->zones', COUNT(*)
FROM prices pr
WHERE NOT EXISTS (SELECT 1 FROM zones z WHERE z.id = pr.zone_id);

\echo ''
\echo '7. PROMO TIERS VALIDATION'
\echo '-----------------------------------------'
-- Check for tier gaps or overlaps
SELECT 
    p.code AS promo_code,
    COUNT(*) AS tier_count,
    MIN(pt.min_qty) AS min_threshold,
    MAX(COALESCE(pt.max_qty, 999999)) AS max_threshold
FROM promotions p
JOIN promo_tiers pt ON pt.promotion_id = p.id
WHERE p.promo_type = 'group_promo'
GROUP BY p.code
ORDER BY p.code;

\echo ''
\echo '========================================='
\echo 'VALIDATION COMPLETE'
\echo '========================================='
