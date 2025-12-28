#!/bin/bash
# Import All CSV Data
# Imports all sample data in correct order

DB_NAME="nabaticuan"
DB_USER="postgres"
SAMPLE_DATA_DIR="../sample-data-v2"

echo "=================================="
echo "CSV Data Import Script"
echo "=================================="
echo ""

# Function to import CSV
import_csv() {
    local table=$1
    local file=$2
    
    echo "Importing $file into $table..."
    
    # Convert codes to UUIDs if needed (simplified - actual implementation may vary)
    psql -U $DB_USER -d $DB_NAME -c "\copy $table FROM '$SAMPLE_DATA_DIR/$file' CSV HEADER" 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully imported $file"
        # Count records
        COUNT=$(psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM $table;")
        echo "   Total records in $table: $COUNT"
    else
        echo "❌ Failed to import $file"
        exit 1
    fi
    echo ""
}

echo "Starting import process..."
echo ""

# 1. Geographic data
echo "1. GEOGRAPHIC DATA"
echo "=================================="
import_csv "zones" "zones.csv"
import_csv "regions" "regions.csv"
import_csv "depo" "depo.csv"

# 2. Product master data
echo "2. PRODUCT MASTER DATA"
echo "=================================="
import_csv "principals" "principals.csv"
import_csv "products" "products.csv"
import_csv "units" "units.csv"
import_csv "product_unit_conversions" "product_unit_conversions.csv"
import_csv "product_groups" "product_groups.csv"
import_csv "product_group_members" "product_group_members.csv"

# 3. Coverage and pricing
echo "3. COVERAGE & PRICING"
echo "=================================="
import_csv "area_coverage" "area_coverage.csv"
import_csv "prices" "prices.csv"

# 4. Promotions
echo "4. PROMOTIONS"
echo "=================================="
import_csv "promotions" "promotions.csv"
import_csv "principal_discounts" "principal_discounts.csv"
import_csv "group_promos" "group_promos.csv"
import_csv "promo_tiers" "promo_tiers.csv"
import_csv "bundle_promos" "bundle_promos.csv"
import_csv "bundle_promo_items" "bundle_promo_items.csv"
import_csv "invoice_discounts" "invoice_discounts.csv"
import_csv "free_product_promos" "free_product_promos.csv"

# 5. Users and stores
echo "5. USERS & STORES"
echo "=================================="
import_csv "user_profiles" "user_profiles.csv"
import_csv "store_loyalty_classes" "store_loyalty_classes.csv"
import_csv "stores" "stores.csv"

# 6. Refresh materialized views
echo "6. REFRESHING VIEWS"
echo "=================================="
echo "Refreshing materialized views..."
psql -U $DB_USER -d $DB_NAME -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_product_availability_by_depo;"
echo "✅ Materialized views refreshed"
echo ""

echo "=================================="
echo "✅ IMPORT COMPLETED SUCCESSFULLY!"
echo "=================================="
echo ""
echo "Summary:"
psql -U $DB_USER -d $DB_NAME -c "
SELECT 
    'zones' AS table_name, COUNT(*) AS records FROM zones
UNION ALL SELECT 'regions', COUNT(*) FROM regions
UNION ALL SELECT 'depo', COUNT(*) FROM depo
UNION ALL SELECT 'principals', COUNT(*) FROM principals
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'product_groups', COUNT(*) FROM product_groups
UNION ALL SELECT 'promotions', COUNT(*) FROM promotions
UNION ALL SELECT 'area_coverage', COUNT(*) FROM area_coverage
UNION ALL SELECT 'prices', COUNT(*) FROM prices
ORDER BY table_name;
"
