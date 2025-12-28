#!/bin/bash
# Database Health Check Script
# Run this daily to check system health

DB_NAME="nabaticuan"
DB_USER="postgres"
REPORT_FILE="health_report_$(date +%Y%m%d_%H%M%S).txt"

echo "==================================" > $REPORT_FILE
echo "Database Health Check Report" >> $REPORT_FILE
echo "Date: $(date)" >> $REPORT_FILE
echo "==================================" >> $REPORT_FILE
echo "" >> $REPORT_FILE

# 1. Check expired promotions
echo "1. EXPIRED PROMOTIONS (should be inactive):" >> $REPORT_FILE
psql -U $DB_USER -d $DB_NAME -t -c "
SELECT code, name, valid_until, is_active 
FROM promotions 
WHERE is_active = true AND valid_until < CURRENT_DATE;
" >> $REPORT_FILE
echo "" >> $REPORT_FILE

# 2. Check products without prices
echo "2. PRODUCTS WITHOUT PRICES:" >> $REPORT_FILE
psql -U $DB_USER -d $DB_NAME -t -c "
SELECT p.code, p.name, COUNT(DISTINCT z.id) AS zones_with_price
FROM products p
CROSS JOIN zones z
LEFT JOIN prices pr ON pr.product_id = p.id AND pr.zone_id = z.id
WHERE p.is_active = true AND z.is_active = true
GROUP BY p.id, p.code, p.name
HAVING COUNT(DISTINCT z.id) < (SELECT COUNT(*) FROM zones WHERE is_active = true);
" >> $REPORT_FILE
echo "" >> $REPORT_FILE

# 3. Check orphaned coverage records
echo "3. ORPHANED COVERAGE RECORDS:" >> $REPORT_FILE
psql -U $DB_USER -d $DB_NAME -t -c "
SELECT ac.entity_type, ac.entity_id, 'orphaned' AS status
FROM area_coverage ac
WHERE ac.entity_type = 'product'
AND NOT EXISTS (SELECT 1 FROM products p WHERE p.code = ac.entity_id)
LIMIT 10;
" >> $REPORT_FILE
echo "" >> $REPORT_FILE

# 4. Database size
echo "4. DATABASE SIZE:" >> $REPORT_FILE
psql -U $DB_USER -d $DB_NAME -t -c "
SELECT pg_size_pretty(pg_database_size('$DB_NAME')) AS db_size;
" >> $REPORT_FILE
echo "" >> $REPORT_FILE

# 5. Table sizes
echo "5. TOP 10 LARGEST TABLES:" >> $REPORT_FILE
psql -U $DB_USER -d $DB_NAME -t -c "
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;
" >> $REPORT_FILE
echo "" >> $REPORT_FILE

# 6. Active promotions count
echo "6. ACTIVE PROMOTIONS BY TYPE:" >> $REPORT_FILE
psql -U $DB_USER -d $DB_NAME -t -c "
SELECT promo_type, COUNT(*) AS total
FROM promotions
WHERE is_active = true
AND CURRENT_DATE BETWEEN valid_from AND COALESCE(valid_until, '9999-12-31')
GROUP BY promo_type
ORDER BY promo_type;
" >> $REPORT_FILE
echo "" >> $REPORT_FILE

echo "==================================" >> $REPORT_FILE
echo "Health check completed!" >> $REPORT_FILE
echo "==================================" >> $REPORT_FILE

# Display report
cat $REPORT_FILE

# Ask if should fix expired promotions
echo ""
echo "Do you want to deactivate expired promotions? (y/n)"
read answer

if [ "$answer" == "y" ]; then
    psql -U $DB_USER -d $DB_NAME -c "
    UPDATE promotions 
    SET is_active = false, updated_at = NOW()
    WHERE is_active = true AND valid_until < CURRENT_DATE;
    "
    echo "Expired promotions deactivated!"
fi

# Refresh materialized views
echo ""
echo "Refreshing materialized views..."
psql -U $DB_USER -d $DB_NAME -c "
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_availability_by_depo;
"
echo "Materialized views refreshed!"

echo ""
echo "Health check report saved to: $REPORT_FILE"
