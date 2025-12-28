#!/bin/bash
# CSV Data Validator
# Validates CSV files before import

SAMPLE_DATA_DIR="../sample-data-v2"
ERRORS=0

echo "=================================="
echo "CSV Data Validation"
echo "=================================="
echo ""

# Function to check file exists
check_file() {
    if [ ! -f "$SAMPLE_DATA_DIR/$1" ]; then
        echo "❌ ERROR: File not found: $1"
        ((ERRORS++))
        return 1
    fi
    echo "✅ File exists: $1"
    return 0
}

# Function to check CSV header
check_header() {
    local file=$1
    local expected_header=$2
    local actual_header=$(head -1 "$SAMPLE_DATA_DIR/$file")
    
    if [ "$actual_header" != "$expected_header" ]; then
        echo "❌ ERROR: Invalid header in $file"
        echo "   Expected: $expected_header"
        echo "   Got:      $actual_header"
        ((ERRORS++))
        return 1
    fi
    echo "✅ Header valid: $file"
    return 0
}

# Function to count records
count_records() {
    local file=$1
    local count=$(tail -n +2 "$SAMPLE_DATA_DIR/$file" | wc -l)
    echo "   Records: $count"
}

echo "1. Checking file existence..."
echo "=================================="
check_file "zones.csv"
check_file "regions.csv"
check_file "depo.csv"
check_file "principals.csv"
check_file "products.csv"
check_file "units.csv"
check_file "product_unit_conversions.csv"
check_file "product_groups.csv"
check_file "product_group_members.csv"
check_file "area_coverage.csv"
check_file "prices.csv"
check_file "promotions.csv"
check_file "principal_discounts.csv"
check_file "group_promos.csv"
check_file "promo_tiers.csv"
check_file "bundle_promos.csv"
check_file "bundle_promo_items.csv"
check_file "invoice_discounts.csv"
check_file "free_product_promos.csv"
check_file "user_profiles.csv"
check_file "store_loyalty_classes.csv"
check_file "stores.csv"
echo ""

echo "2. Checking CSV headers..."
echo "=================================="
check_header "zones.csv" "code,name,description,is_active"
check_header "regions.csv" "code,name,description,is_active"
check_header "depo.csv" "code,name,zone_code,region_code,address,is_active"
check_header "principals.csv" "code,name,description,is_active"
check_header "products.csv" "code,name,principal_code,category,brand,is_active"
check_header "units.csv" "code,name,description"
check_header "product_unit_conversions.csv" "product_code,from_unit_code,to_unit_code,conversion_factor,level"
check_header "product_groups.csv" "code,name,description,priority,is_active"
check_header "product_group_members.csv" "product_group_code,product_code,priority"
check_header "area_coverage.csv" "entity_type,entity_code,rule_type,level,zone_code,region_code,depo_code"
check_header "prices.csv" "product_code,zone_code,base_price,effective_from,effective_until"
check_header "promotions.csv" "code,name,promo_type,store_type,priority,stackable,is_active,valid_from,valid_until,max_discount_amount,description"
echo ""

echo "3. Record counts..."
echo "=================================="
count_records "zones.csv"
count_records "regions.csv"
count_records "depo.csv"
count_records "principals.csv"
count_records "products.csv"
count_records "promotions.csv"
echo ""

echo "4. Checking for duplicate codes..."
echo "=================================="

# Check duplicate product codes
DUPS=$(tail -n +2 "$SAMPLE_DATA_DIR/products.csv" | cut -d',' -f1 | sort | uniq -d)
if [ -n "$DUPS" ]; then
    echo "❌ ERROR: Duplicate product codes found:"
    echo "$DUPS"
    ((ERRORS++))
else
    echo "✅ No duplicate product codes"
fi

# Check duplicate promo codes
DUPS=$(tail -n +2 "$SAMPLE_DATA_DIR/promotions.csv" | cut -d',' -f1 | sort | uniq -d)
if [ -n "$DUPS" ]; then
    echo "❌ ERROR: Duplicate promotion codes found:"
    echo "$DUPS"
    ((ERRORS++))
else
    echo "✅ No duplicate promotion codes"
fi

echo ""
echo "=================================="
if [ $ERRORS -eq 0 ]; then
    echo "✅ VALIDATION PASSED!"
    echo "All checks completed successfully."
    exit 0
else
    echo "❌ VALIDATION FAILED!"
    echo "Found $ERRORS error(s). Please fix before importing."
    exit 1
fi
