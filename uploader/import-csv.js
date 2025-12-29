/**
 * Import CSV Data to Supabase
 * 
 * Usage:
 *   1. Install dependencies: npm install @supabase/supabase-js csv-parse
 *   2. Set environment variables or update SUPABASE_URL and SUPABASE_ANON_KEY below
 *   3. Run: node scripts/import-csv.js
 */

import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================
// CONFIGURATION
// ============================================

// Load from env.js or set directly
// For Node.js, you can use dotenv package or set directly here
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://dthgezcoklarfwbzkqym.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR0aGdlemNva2xhcmZ3YnprcXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MDg0OTAsImV4cCI6MjA3ODk4NDQ5MH0.cyPwOIFsbfKc0akAhAcVVkhAIdAi_Iyt4DU2B-eVpwk';

const CSV_DIR = join(__dirname, '..', 'tabel usulan');

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Read and parse CSV file
 */
function readCSV(filename) {
    const filepath = join(CSV_DIR, filename);
    const content = readFileSync(filepath, 'utf-8');
    return parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        cast: false
    });
}

/**
 * Parse array string from CSV (format: "{value1,value2}" or "value1,value2" or """value1,value2""")
 * Handles: "NULL", "null", "all", empty strings, and comma-separated values (including quoted strings)
 * Also handles triple quotes format: """1000559,1000690,1000929"""
 */
function parseArray(csvValue) {
    if (!csvValue || csvValue.trim() === '' || csvValue.trim().toUpperCase() === 'NULL') return [];
    
    // Handle "all" as empty array (means all values allowed, stored as empty array in DB)
    if (csvValue.trim().toLowerCase() === 'all') return [];
    
    // Remove curly braces if present
    let cleaned = csvValue.trim().replace(/^\{|\}$/g, '');
    
    // Handle triple quotes format: """1000559,1000690,1000929"""
    // Remove triple quotes if present
    cleaned = cleaned.replace(/^"""|"""$/g, '');
    
    // Remove single/double quotes if present (CSV may have quoted strings like "R05, R07, R09")
    cleaned = cleaned.replace(/^"+|"+$/g, '');
    
    // Split by comma and trim each value
    return cleaned.split(',').map(v => v.trim()).filter(v => v !== '' && v.toUpperCase() !== 'NULL');
}

/**
 * Parse JSON string from CSV
 */
function parseJSON(csvValue) {
    if (!csvValue || csvValue.trim() === '') return null;
    try {
        // Remove extra quotes if present
        let cleaned = csvValue.trim().replace(/^"+|"+$/g, '');
        return JSON.parse(cleaned);
    } catch (e) {
        console.warn(`Failed to parse JSON: ${csvValue}`, e);
        return null;
    }
}

/**
 * Convert string to number (nullable)
 */
function toNumber(value, nullable = true) {
    if (!value || value.trim() === '') return nullable ? null : 0;
    const num = parseFloat(value);
    return isNaN(num) ? (nullable ? null : 0) : num;
}

/**
 * Convert string to integer (nullable)
 */
function toInt(value, nullable = true) {
    if (!value || value.trim() === '') return nullable ? null : 0;
    const num = parseInt(value);
    return isNaN(num) ? (nullable ? null : 0) : num;
}

/**
 * Lookup ID by code
 */
async function lookupId(table, codeField, codeValue) {
    const { data, error } = await supabase
        .from(table)
        .select('id')
        .eq(codeField, codeValue)
        .single();
    
    if (error || !data) {
        throw new Error(`Failed to lookup ${table}.${codeField} = ${codeValue}: ${error?.message}`);
    }
    return data.id;
}

/**
 * Batch lookup IDs by codes (for tables with id column)
 */
async function batchLookupIds(table, codeField, codeValues) {
    const { data, error } = await supabase
        .from(table)
        .select(`id, ${codeField}`)
        .in(codeField, codeValues);
    
    if (error) {
        throw new Error(`Failed to batch lookup ${table}: ${error.message}`);
    }
    
    const map = new Map();
    data.forEach(row => map.set(row[codeField], row.id));
    return map;
}

/**
 * Batch lookup codes (for tables without id column, returns Set of valid codes)
 * 
 * Using Set instead of Array for better performance:
 * - Set.has() is O(1) - constant time lookup
 * - Array.includes() is O(n) - linear time lookup
 * - More efficient for existence checks
 */
async function batchLookupCodes(table, codeField, codeValues) {
    const { data, error } = await supabase
        .from(table)
        .select(codeField)
        .in(codeField, codeValues);
    
    if (error) {
        throw new Error(`Failed to batch lookup ${table}: ${error.message}`);
    }
    
    // Return Set of valid codes (more efficient for .has() checks)
    return new Set(data.map(row => row[codeField]));
}

// ============================================
// IMPORT FUNCTIONS
// ============================================

/**
 * 1. Import zones
 * 
 * CSV Source: tabel usulan/master_zona.csv
 * Target Table: zones
 * 
 * Mapping:
 *   CSV Column    →  DB Column    →  Type
 *   ──────────────────────────────────────
 *   zona_id       →  code         →  TEXT
 *   zona_name     →  name         →  TEXT
 */
async function importZones() {
    console.log('📦 Importing zones...');
    const rows = readCSV('master_zona.csv');
    
    const data = rows.map(row => ({
        code: row.code,      // CSV: zona_id → DB: code
        name: row.name     // CSV: zona_name → DB: name
    }));
    
    const { error } = await supabase.from('zones').upsert(data, { onConflict: 'code' });
    if (error) throw error;
    console.log(`✅ Imported ${data.length} zones`);
}

/**
 * 2. Import principals
 * 
 * CSV Source: tabel usulan/master_pincipal.csv
 * Target Table: principals
 * 
 * Mapping:
 *   CSV Column      →  DB Column    →  Type
 *   ────────────────────────────────────────
 *   id_principal    →  code         →  TEXT
 *   nama_principal  →  name         →  TEXT
 */
async function importPrincipals() {
    console.log('📦 Importing principals...');
    const rows = readCSV('master_pincipal.csv');
    
    const data = rows.map(row => ({
        code: row.id_principal,      // CSV: id_principal → DB: code
        name: row.nama_principal     // CSV: nama_principal → DB: name
    }));
    
    const { error } = await supabase.from('principals').upsert(data, { onConflict: 'code' });
    if (error) throw error;
    console.log(`✅ Imported ${data.length} principals`);
}

/**
 * 3. Import products
 * 
 * CSV Source: tabel usulan/master_product.csv
 * Target Table: master_products
 * Dependencies: principals (lookup principal_id)
 * 
 * Mapping:
 *   CSV Column              →  DB Column                  →  Type      →  Transform
 *   ────────────────────────────────────────────────────────────────────────────
 *   kode_model              →  code                       →  TEXT
 *   nama_produk             →  name                       →  TEXT
 *   id_principal            →  principal_id               →  UUID      →  LOOKUP principals.code
 *   id_kategori             →  category                   →  TEXT      →  nullable
 *   uom_kecil               →  unit_1                     →  TEXT      →  nullable
 *   uom_sedang              →  unit_2                     →  TEXT      →  nullable
 *   uom_besar               →  unit_3                     →  TEXT      →  nullable
 *   rasio_sedang            →  ratio_unit_2_per_unit_1    →  DECIMAL   →  toNumber()
 *   rasio_besar             →  ratio_unit_3_per_unit_2    →  DECIMAL   →  toNumber()
 *   ketersediaan_default    →  availability_default       →  TEXT      →  nullable
 *   spek_teknis             →  spec_technical             →  JSONB     →  parseJSON()
 */
async function importProducts() {
    console.log('📦 Importing products...');
    const rows = readCSV('master_product.csv');
    
    // Get all principal codes and lookup IDs
    const principalCodes = [...new Set(rows.map(r => r.id_principal))];
    const principalMap = await batchLookupIds('principals', 'code', principalCodes);
    
    const data = rows.map(row => ({
        code: row.kode_model,                                    // CSV: kode_model → DB: code
        name: row.nama_produk,                                   // CSV: nama_produk → DB: name
        principal_id: principalMap.get(row.id_principal),        // CSV: id_principal → DB: principal_id (LOOKUP)
        category: row.id_kategori || null,                       // CSV: id_kategori → DB: category (nullable)
        unit_1: row.uom_kecil || null,                           // CSV: uom_kecil → DB: unit_1 (nullable)
        unit_2: row.uom_sedang || null,                          // CSV: uom_sedang → DB: unit_2 (nullable)
        unit_3: row.uom_besar || null,                           // CSV: uom_besar → DB: unit_3 (nullable)
        ratio_unit_2_per_unit_1: toNumber(row.rasio_sedang),     // CSV: rasio_sedang → DB: ratio_unit_2_per_unit_1
        ratio_unit_3_per_unit_2: toNumber(row.rasio_besar),      // CSV: rasio_besar → DB: ratio_unit_3_per_unit_2
        availability_default: row.ketersediaan_default || null,   // CSV: ketersediaan_default → DB: availability_default (nullable)
        spec_technical: parseJSON(row.spek_teknis)               // CSV: spek_teknis → DB: spec_technical (JSONB)
    }));
    
    const { error } = await supabase.from('master_products').upsert(data, { onConflict: 'code' });
    if (error) throw error;
    console.log(`✅ Imported ${data.length} products`);
}

/**
 * 4. Import prices
 * 
 * CSV Source: tabel usulan/master_harga.csv
 * Target Table: prices
 * Dependencies: master_products (lookup product_id), zones (lookup zone_id)
 * 
 * Mapping:
 *   CSV Column      →  DB Column    →  Type      →  Transform
 *   ───────────────────────────────────────────────────────────
 *   product_id      →  product_id   →  UUID      →  LOOKUP master_products.code ⚠️ (CSV product_id = product code)
 *   zone_id         →  zone_id      →  UUID      →  LOOKUP zones.code
 *   base_price      →  base_price   →  DECIMAL   →  toNumber()
 * 
 * ⚠️ Note: CSV column "product_id" sebenarnya adalah product CODE (kode_model), bukan UUID!
 */
async function importPrices() {
    console.log('📦 Importing prices...');
    const rows = readCSV('master_harga.csv');
    
    // Get all codes and lookup IDs
    // Note: master_harga.csv uses product_id column which is actually product code (kode_model)
    // Note: master_products doesn't have id column, use code directly
    const productCodes = [...new Set(rows.map(r => r.product_id))];
    const zoneCodes = [...new Set(rows.map(r => r.zone_id))];
    
    const productMap = await batchLookupCodes('master_products', 'code', productCodes);
    const zoneMap = await batchLookupIds('zones', 'code', zoneCodes);
    
    const data = rows.map(row => ({
        product_id: productMap.has(row.product_id) ? row.product_id : null,  // CSV: product_id (code) → DB: product_id (code, no id column)
        zone_id: zoneMap.get(row.zone_id),           // CSV: zone_id (code) → DB: zone_id (UUID, LOOKUP)
        base_price: toNumber(row.base_price, false)  // CSV: base_price → DB: base_price
    })).filter(row => row.product_id && row.zone_id); // Filter out invalid references
    
    // Use upsert with conflict resolution on (product_id, zone_id)
    for (const price of data) {
        const { error } = await supabase
            .from('prices')
            .upsert(price, { onConflict: 'product_id,zone_id' });
        if (error) throw error;
    }
    
    console.log(`✅ Imported ${data.length} prices`);
}

/**
 * 5. Import product_groups
 * 
 * CSV Source: tabel usulan/master_group.csv
 * Target Table: product_groups
 * 
 * Mapping:
 *   CSV Column    →  DB Column    →  Type      →  Transform
 *   ────────────────────────────────────────────────────────
 *   code          →  code         →  TEXT
 *   name          →  name         →  TEXT
 *   priority      →  priority     →  INTEGER   →  toInt() (default: 0)
 */
async function importProductGroups() {
    console.log('📦 Importing product groups...');
    const rows = readCSV('master_group.csv');
    
    const data = rows.map(row => ({
        code: row.code,                              // CSV: code → DB: code
        name: row.name,                              // CSV: name → DB: name
        priority: toInt(row.priority, false) || 0    // CSV: priority → DB: priority (default: 0)
    }));
    
    const { error } = await supabase.from('product_groups').upsert(data, { onConflict: 'code' });
    if (error) throw error;
    console.log(`✅ Imported ${data.length} product groups`);
}

/**
 * 6. Import product_group_members
 * 
 * CSV Source: tabel usulan/master_group_member.csv
 * Target Table: product_group_members
 * Dependencies: master_products (validate product_id exists), product_groups (validate product_group_id exists)
 * 
 * Mapping:
 *   CSV Column          →  DB Column          →  Type      →  Transform
 *   ───────────────────────────────────────────────────────────────────
 *   product_id          →  product_id         →  TEXT      →  (code dari master_products, validate exists)
 *   product_group_id    →  product_group_id   →  TEXT      →  (code dari product_groups, validate exists)
 *   priority            →  priority           →  INTEGER   →  toInt() (default: 0)
 * 
 * Note: 
 * - CSV column names adalah product_id dan product_group_id (bukan product_code dan group_code)
 * - product_group_id sekarang TEXT (code), bukan UUID
 * - Hanya validasi bahwa product_id dan product_group_id ada di tabel referensi
 */
async function importProductGroupMembers() {
    console.log('📦 Importing product group members...');
    const rows = readCSV('master_group_member.csv');
    
    if (rows.length === 0) {
        console.log('⚠️  No rows to import');
        return;
    }
    
    console.log(`📋 Found ${rows.length} rows in CSV`);
    
    // Get all codes for validation
    // Note: CSV uses product_id (which is actually product code) and product_group_id (which is actually group code)
    // Note: Both are now TEXT (code), not UUID, so we just validate they exist
    const productCodes = [...new Set(rows.map(r => r.product_id).filter(c => c))];
    const groupCodes = [...new Set(rows.map(r => r.product_group_id).filter(c => c))];
    
    console.log(`🔍 Validating ${productCodes.length} unique product codes and ${groupCodes.length} unique group codes`);
    
    // Validate products exist (use batchLookupCodes which returns Set of valid codes)
    const productMap = await batchLookupCodes('master_products', 'code', productCodes);
    console.log(`✅ Found ${productMap.size} valid products`);
    
    // Validate product groups exist (use batchLookupCodes which returns Set of valid codes)
    const groupMap = await batchLookupCodes('product_groups', 'code', groupCodes);
    console.log(`✅ Found ${groupMap.size} valid product groups`);
    
    const data = rows
        .map(row => {
            const productId = row.product_id && productMap.has(row.product_id) ? row.product_id : null;
            const groupId = row.product_group_id && groupMap.has(row.product_group_id) ? row.product_group_id : null;
            
            // Skip if either validation failed
            if (!productId || !groupId) {
                return null;
            }
            
            return {
                product_id: productId,              // CSV: product_id (code) → DB: product_id (TEXT, code)
                product_group_id: groupId,          // CSV: product_group_id (code) → DB: product_group_id (TEXT, code)
                priority: toInt(row.priority, false) || 0            // CSV: priority → DB: priority (default: 0)
            };
        })
        .filter(row => row !== null);
    
    console.log(`📊 Mapped ${data.length} valid rows (filtered ${rows.length - data.length} invalid rows)`);
    
    if (data.length === 0) {
        console.warn('⚠️  No valid data to import after filtering');
        return;
    }
    
    // Upsert with conflict on (product_id, product_group_id)
    for (const member of data) {
        const { error } = await supabase
            .from('product_group_members')
            .upsert(member, { onConflict: 'product_id,product_group_id' });
        if (error) throw error;
    }
    
    console.log(`✅ Imported ${data.length} product group members`);
}

/**
 * 7. Import bucket_members
 * 
 * CSV Source: tabel usulan/master_bucket_member.csv
 * Target Table: bucket_members
 * Dependencies: master_products (lookup product_id)
 * 
 * Mapping:
 *   CSV Column      →  DB Column    →  Type      →  Transform
 *   ───────────────────────────────────────────────────────────
 *   product_code    →  product_id   →  UUID      →  LOOKUP master_products.code
 *   bucket_id       →  bucket_id    →  TEXT
 */
async function importBucketMembers() {
    console.log('📦 Importing bucket members...');
    const rows = readCSV('master_bucket_member.csv');
    
    // Note: master_products doesn't have id column, use code directly
    const productCodes = [...new Set(rows.map(r => r.product_code))];
    const productMap = await batchLookupCodes('master_products', 'code', productCodes);
    
    const data = rows.map(row => ({
        product_id: productMap.has(row.product_code) ? row.product_code : null,    // CSV: product_code → DB: product_id (code, no id column)
        bucket_id: row.bucket_id                         // CSV: bucket_id → DB: bucket_id
    })).filter(row => row.product_id);
    
    // Upsert with conflict on (product_id, bucket_id)
    for (const member of data) {
        const { error } = await supabase
            .from('bucket_members')
            .upsert(member, { onConflict: 'product_id,bucket_id' });
        if (error) throw error;
    }
    
    console.log(`✅ Imported ${data.length} bucket members`);
}

/**
 * 8. Import product_group_availability
 * 
 * CSV Source: tabel usulan/master_group_availability.csv
 * Target Table: product_group_availability
 * 
 * Mapping:
 *   CSV Column          →  DB Column          →  Type      →  Transform
 *   ──────────────────────────────────────────────────────────────────────
 *   product_group_code  →  product_group_code →  TEXT
 *   rule_type           →  rule_type          →  TEXT      →  (allow/deny)
 *   level               →  level              →  TEXT      →  (zona/region/depo)
 *   zone_code           →  zone_codes         →  TEXT[]    →  parseArray() (note: CSV uses singular)
 *   region_code         →  region_codes       →  TEXT[]    →  parseArray() (note: CSV uses singular)
 *   depo_code           →  depo_codes         →  TEXT[]    →  parseArray() (note: CSV uses singular)
 */
async function importProductGroupAvailability() {
    console.log('📦 Importing product group availability...');
    const rows = readCSV('master_group_availability.csv');
    
    const data = rows.map(row => ({
        product_group_code: row.product_group_code,      // CSV: product_group_code → DB: product_group_code
        rule_type: row.rule_type,                        // CSV: rule_type → DB: rule_type
        level: row.level,                                // CSV: level → DB: level
        zone_codes: parseArray(row.zone_code || ''),     // CSV: zone_code → DB: zone_codes (TEXT[]) - note: CSV uses singular
        region_codes: parseArray(row.region_code || ''), // CSV: region_code → DB: region_codes (TEXT[]) - note: CSV uses singular
        depo_codes: parseArray(row.depo_code || '')      // CSV: depo_code → DB: depo_codes (TEXT[]) - note: CSV uses singular
    }));
    
    const { error } = await supabase.from('product_group_availability').insert(data);
    if (error) throw error;
    console.log(`✅ Imported ${data.length} product group availability rules`);
}

/**
 * 9. Import store_loyalty_classes
 * 
 * CSV Source: tabel usulan/master_loyalty_class.csv
 * Target Table: store_loyalty_classes
 * 
 * Mapping:
 *   CSV Column          →  DB Column            →  Type      →  Transform
 *   ──────────────────────────────────────────────────────────────────────
 *   class_code          →  code                 →  TEXT
 *   class_name          →  name                 →  TEXT
 *   store_type          →  store_type          →  TEXT      →  normalize to lowercase ('grosir', 'retail', 'all')
 *   target_monthly      →  target_monthly       →  DECIMAL   →  toNumber()
 *   cashback_percentage →  cashback_percentage  →  DECIMAL   →  toNumber()
 */
async function importStoreLoyaltyClasses() {
    console.log('📦 Importing store loyalty classes...');
    const rows = readCSV('master_loyalty_class.csv');
    
    // Normalize store_type: Grosir -> grosir, Retail -> retail, All -> all
    function normalizeStoreType(value) {
        if (!value || value.trim() === '') return 'all';
        const normalized = value.trim().toLowerCase();
        if (normalized === 'grosir' || normalized === 'retail' || normalized === 'all') {
            return normalized;
        }
        // Handle case variations
        if (normalized.includes('grosir')) return 'grosir';
        if (normalized.includes('retail')) return 'retail';
        return 'all';
    }
    
    const data = rows.map(row => {
        // Use class_code as-is (e.g., "S - 4.500%") - don't extract, keep full string for uniqueness
        const finalCode = row.class_code ? row.class_code.trim() : (row.class_name || '');
        const finalName = row.class_name || row.class_code || finalCode;
        
        return {
            code: finalCode,                                    // CSV: class_code → DB: code (use full string, e.g., "S - 4.500%")
            name: finalName,                                    // CSV: class_name → DB: name
            store_type: normalizeStoreType(row.store_type),    // CSV: store_type → DB: store_type (normalize to lowercase)
            target_monthly: toNumber(row.target_monthly, false),           // CSV: target_monthly → DB: target_monthly
            cashback_percentage: toNumber(row.cashback_percentage, false)  // CSV: cashback_percentage → DB: cashback_percentage
        };
    });
    
    // Check for duplicates: throw error if duplicate (code, store_type) found
    const seenKeys = new Map(); // key -> row index
    const duplicates = [];
    
    data.forEach((item, index) => {
        const key = `${item.code}|${item.store_type}`;
        
        if (seenKeys.has(key)) {
            // Duplicate found - collect for error message
            const firstIndex = seenKeys.get(key);
            duplicates.push({
                key: key,
                code: item.code,
                store_type: item.store_type,
                firstRow: firstIndex + 2, // +2 because CSV has header and 0-indexed
                duplicateRow: index + 2
            });
        } else {
            seenKeys.set(key, index);
        }
    });
    
    // Throw error if duplicates found
    if (duplicates.length > 0) {
        const errorMsg = `❌ Duplicate entries found in CSV. Each (code, store_type) combination must be unique:\n` +
            duplicates.map(dup => 
                `   - Row ${dup.duplicateRow}: ${dup.code} (${dup.store_type}) duplicates Row ${dup.firstRow}`
            ).join('\n') +
            `\n\nPlease fix the CSV file to remove duplicates.`;
        throw new Error(errorMsg);
    }
    
    const uniqueData = data;
    
    // Use upsert with conflict on (code, store_type) since we have UNIQUE(code, store_type)
    // Insert one by one to avoid "cannot affect row a second time" error
    let successCount = 0;
    for (const item of uniqueData) {
        const { error } = await supabase
            .from('store_loyalty_classes')
            .upsert(item, { onConflict: 'code,store_type' });
        if (error) {
            console.error(`❌ Error upserting ${item.code} (${item.store_type}):`, error);
            throw error;
        }
        successCount++;
    }
    
    console.log(`✅ Imported ${successCount} store loyalty classes`);
}

/**
 * 9b. Import store_loyalty_availability
 * 
 * CSV Source: tabel usulan/master_loyalty_availability.csv
 * Target Table: store_loyalty_availability
 * 
 * Mapping:
 *   CSV Column          →  DB Column          →  Type      →  Transform
 *   ──────────────────────────────────────────────────────────────────────
 *   loyalty_class_code  →  loyalty_class_code →  TEXT
 *   rule_type           →  rule_type          →  TEXT      →  (allow/deny)
 *   level               →  level              →  TEXT      →  (zona/region/depo/all)
 *   zone_code           →  zone_codes         →  TEXT[]    →  parseArray() (note: CSV uses singular)
 *   region_code         →  region_codes       →  TEXT[]    →  parseArray() (note: CSV uses singular)
 *   depo_code           →  depo_codes         →  TEXT[]    →  parseArray() (note: CSV uses singular)
 */
async function importStoreLoyaltyAvailability() {
    console.log('📦 Importing store loyalty availability...');
    const rows = readCSV('master_loyalty_availability.csv');
    console.log(`📋 Found ${rows.length} rows in CSV`);
    
    const data = rows
        .map((row, index) => {
            // Use loyalty_class_code as-is (e.g., "C - 3.000%") - don't extract, keep full string
            // This must match the code format used in store_loyalty_classes
            const loyaltyClassCode = row.loyalty_class_code ? row.loyalty_class_code.trim() : '';
            
            // Skip if loyalty_class_code is empty
            if (!loyaltyClassCode || loyaltyClassCode.trim() === '') {
                console.warn(`⚠️  Skipping row ${index + 2}: empty loyalty_class_code`);
                return null;
            }
            
            return {
                loyalty_class_code: loyaltyClassCode,        // CSV: loyalty_class_code → DB: loyalty_class_code (use full string, e.g., "C - 3.000%")
                rule_type: row.rule_type,                        // CSV: rule_type → DB: rule_type
                level: row.level,                                // CSV: level → DB: level
                zone_codes: parseArray(row.zone_codes || row.zone_code || ''),     // CSV: zone_codes/zone_code → DB: zone_codes (TEXT[])
                region_codes: parseArray(row.region_codes || row.region_code || ''), // CSV: region_codes/region_code → DB: region_codes (TEXT[])
                depo_codes: parseArray(row.depo_codes || row.depo_code || '')      // CSV: depo_codes/depo_code → DB: depo_codes (TEXT[])
            };
        })
        .filter(item => item !== null); // Remove null entries
    
    if (data.length < rows.length) {
        console.log(`⚠️  Filtered ${rows.length - data.length} invalid row(s)`);
    }
    
    const { error } = await supabase.from('store_loyalty_availability').insert(data);
    if (error) throw error;
    console.log(`✅ Imported ${data.length} store loyalty availability rules`);
}

/**
 * 10b. Import store_loyalty_area_rules
 * 
 * CSV Source: tabel usulan/master_loyalty_area_rules.csv
 * Target Table: store_loyalty_area_rules
 * Dependencies: store_loyalty_classes (validate loyalty_class_code exists)
 * 
 * Mapping:
 *   CSV Column        →  DB Column              →  Type      →  Transform
 *   ──────────────────────────────────────────────────────────────────────
 *   loyalty_class_code →  loyalty_class_code    →  TEXT      →  (reference ke store_loyalty_classes.code)
 *   zone_codes         →  zone_codes           →  TEXT[]    →  parseArray()
 *   region_codes       →  region_codes         →  TEXT[]    →  parseArray()
 *   depo_codes         →  depo_codes           →  TEXT[]    →  parseArray()
 *   target_monthly     →  target_monthly      →  DECIMAL   →  toNumber()
 *   cashback_percentage →  cashback_percentage →  DECIMAL   →  toNumber()
 *   priority           →  priority             →  INTEGER   →  toInt()
 */
async function importStoreLoyaltyAreaRules() {
    console.log('📦 Importing store loyalty area rules...');
    const rows = readCSV('master_loyalty_area_rules.csv');
    
    // Validate loyalty_class_code exists
    const loyaltyClassCodes = [...new Set(rows.map(row => row.loyalty_class_code))];
    await batchLookupCodes('store_loyalty_classes', 'code', loyaltyClassCodes);
    
    const data = rows.map(row => ({
        loyalty_class_code: row.loyalty_class_code,      // CSV: loyalty_class_code → DB: loyalty_class_code
        zone_codes: parseArray(row.zone_codes || ''),    // CSV: zone_codes → DB: zone_codes (TEXT[])
        region_codes: parseArray(row.region_codes || ''), // CSV: region_codes → DB: region_codes (TEXT[])
        depo_codes: parseArray(row.depo_codes || ''),    // CSV: depo_codes → DB: depo_codes (TEXT[])
        target_monthly: toNumber(row.target_monthly, false),           // CSV: target_monthly → DB: target_monthly
        cashback_percentage: toNumber(row.cashback_percentage, false), // CSV: cashback_percentage → DB: cashback_percentage
        priority: toInt(row.priority, false) || 0        // CSV: priority → DB: priority (default 0)
    }));
    
    // Clear existing data before insert (upsert not suitable due to composite key logic)
    const { error: deleteError } = await supabase.from('store_loyalty_area_rules').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (deleteError) throw deleteError;
    
    const { error } = await supabase.from('store_loyalty_area_rules').insert(data);
    if (error) throw error;
    console.log(`✅ Imported ${data.length} store loyalty area rules`);
}

/**
 * 11. Import principal_discount_tiers
 * 
 * CSV Source: tabel usulan/discon_principal_rule.csv
 * Target Table: principal_discount_tiers
 * Dependencies: promo_availability (validate promo_id exists)
 * 
 * Mapping:
 *   CSV Column        →  DB Column              →  Type      →  Transform
 *   ──────────────────────────────────────────────────────────────────────
 *   promo_id          →  promo_id               →  TEXT      →  (reference ke promo_availability)
 *   description       →  description            →  TEXT      →  (nullable, duplikat dengan promo_availability)
 *   principal         →  principal_codes        →  TEXT[]    →  parseArray() (ambil dari setiap row tier)
 *   trigger           →  min_purchase_amount    →  DECIMAL   →  toNumber()
 *   disc              →  discount_percentage    →  DECIMAL   →  toNumber()
 *   priority          →  priority               →  INTEGER   →  toInt() (default: 0)
 * 
 * Note: principal_codes akan duplikat di setiap row tier untuk promo_id yang sama,
 *       tapi ini OK karena konsisten dan memudahkan query tanpa join ke header
 */
async function importPrincipalDiscountTiers() {
    console.log('📦 Importing principal discount tiers...');
    const rows = readCSV('discon_principal_rule.csv');
    
    const data = rows.map(row => ({
        promo_id: row.promo_id,                          // CSV: promo_id → DB: promo_id (reference ke promo_availability)
        description: row.description || null,             // CSV: description → DB: description (nullable, duplikat dengan promo_availability)
        principal_codes: parseArray(row.principal),       // CSV: principal → DB: principal_codes (TEXT[]) - ambil dari setiap row tier
        min_purchase_amount: toNumber(row.trigger, false),    // CSV: trigger → DB: min_purchase_amount
        discount_percentage: toNumber(row.disc, false),       // CSV: disc → DB: discount_percentage
        priority: toInt(row.priority, false) || 0         // CSV: priority → DB: priority (default: 0)
    }));
    
    const { error } = await supabase.from('principal_discount_tiers').insert(data);
    if (error) throw error;
    console.log(`✅ Imported ${data.length} principal discount tiers`);
}

/**
 * 12. Import group_promo and group_promo_tiers
 * 
 * CSV Source: tabel usulan/discon_strata_rule.csv
 * Target Tables: group_promo (header), group_promo_tiers (tiers)
 * 
 * Mapping - Table: group_promo (unique by promo_id):
 *   CSV Column    →  DB Column              →  Type      →  Transform
 *   ──────────────────────────────────────────────────────────────────────
 *   promo_id      →  promo_id               →  TEXT
 *   description   →  description            →  TEXT      →  (default: '')
 *   group         →  product_group_code     →  TEXT
 *   mix_non_mix   →  tier_mode              →  TEXT      →  "mix" atau "non mix" (default: 'mix')
 *   satuan        →  tier_unit              →  TEXT      →  "unit_1/2/3" (default: 'unit_1')
 *   varian        →  consider_variant       →  BOOLEAN   →  (ada nilai → true)
 * 
 * Mapping - Table: group_promo_tiers (multiple rows per promo_id):
 *   CSV Column    →  DB Column              →  Type      →  Transform
 *   ──────────────────────────────────────────────────────────────────────
 *   promo_id      →  promo_id               →  TEXT
 *   description   →  description            →  TEXT      →  (nullable)
 *   qty_min       →  min_qty                →  DECIMAL   →  toNumber()
 *   potongan      →  discount_per_unit      →  DECIMAL   →  toNumber()
 *   varian        →  variant_count          →  INTEGER   →  toInt() (nullable)
 *   priority      →  priority               →  INTEGER   →  toInt() (default: 0)
 */
async function importGroupPromo() {
    console.log('📦 Importing group promo...');
    const rows = readCSV('discon_strata_rule.csv');
    
    // First, create unique group_promo entries
    const uniquePromos = new Map();
    rows.forEach(row => {
        if (!row.promo_id || !row.promo_id.trim()) return; // Skip empty rows
        if (!uniquePromos.has(row.promo_id)) {
            uniquePromos.set(row.promo_id, {
                promo_id: row.promo_id.trim(),
                description: (row.description || '').trim(),
                product_group_code: (row.group || '').trim(),
                tier_mode: (row.mix_non_mix || 'mix').trim(), // CSV: mix_non_mix → DB: tier_mode
                tier_unit: (row.satuan || 'unit_1').trim(),   // CSV: satuan → DB: tier_unit
                consider_variant: row.varian && row.varian.trim() !== '' ? true : false // CSV: varian → DB: consider_variant
            });
        }
    });
    
    // Insert group_promo
    const promoData = Array.from(uniquePromos.values());
    const { error: promoError } = await supabase.from('group_promo').upsert(promoData, { onConflict: 'promo_id' });
    if (promoError) throw promoError;
    console.log(`✅ Imported ${promoData.length} group promo headers`);
    
    // Insert group_promo_tiers
    const tierData = rows
        .filter(row => row.promo_id && row.promo_id.trim()) // Skip empty rows
        .map(row => ({
            promo_id: row.promo_id.trim(),
            description: row.description ? row.description.trim() : null,
            min_qty: toNumber(row.qty_min, false),
            discount_per_unit: toNumber(row.potongan, false),
            variant_count: row.varian && row.varian.trim() !== '' ? toInt(row.varian) : null, // CSV: varian → DB: variant_count
            priority: 0 // Default priority (tidak ada di CSV, default 0)
        }));
    
    const { error: tierError } = await supabase.from('group_promo_tiers').insert(tierData);
    if (tierError) throw tierError;
    console.log(`✅ Imported ${tierData.length} group promo tiers`);
}

/**
 * 13. Import bundle_promo, bundle_promo_groups
 * 
 * CSV Source: tabel usulan/discon_paket_rule.csv
 * Target Tables: bundle_promo (header), bundle_promo_groups (groups dengan bucket_id)
 * Dependencies: bucket_members (untuk lookup product_ids berdasarkan bucket_id saat query)
 * 
 * CSV Format Support:
 *   - Format LAMA: buket_1, buket_2, buket_3 (terbatas 3 buckets) - BACKWARD COMPATIBLE
 *   - Format BARU: bucket_id (multiple rows per promo_id, unlimited buckets) - PREFERRED
 * 
 * Auto-detect format: Jika ada kolom 'bucket_id', gunakan format baru. Jika tidak, gunakan format lama.
 * 
 * Mapping - Table: bundle_promo (unique by promo_id):
 *   CSV Column    →  DB Column              →  Type      →  Transform
 *   ──────────────────────────────────────────────────────────────────────
 *   promo_id      →  promo_id               →  TEXT
 *   description   →  description            →  TEXT      →  (default: '')
 *   potongan      →  discount_per_package   →  DECIMAL   →  toNumber()
 *   kelipatan     →  max_packages           →  INTEGER   →  toInt() (nullable)
 * 
 * Mapping - Table: bundle_promo_groups (N rows per promo_id, group_number auto-increment):
 *   CSV Column        →  DB Column          →  Type      →  Transform
 *   ──────────────────────────────────────────────────────────────────────
 *   promo_id          →  promo_id           →  TEXT
 *   bucket_id / buket_1/2/3 → bucket_id    →  TEXT      →  Simpan bucket_id, lookup product_ids dari bucket_members saat query
 *   qty_bucket / qty_buket_1/2/3 → total_quantity → INTEGER → toInt()
 *   unit_bucket / sat_buket_1/2/3 → unit   →  TEXT      →  (default: 'unit_1')
 *   (row order)       →  group_number       →  INTEGER   →  Auto-increment (1, 2, 3, 4, ...)
 * 
 * Note: 
 * - bucket_id disimpan di bundle_promo_groups, product_ids di-lookup dari bucket_members saat query
 * - Tidak perlu bundle_promo_group_items, karena bucket_members adalah source of truth
 * - bucket_id berbeda dari product_group_id meskipun namanya sama
 */
async function importBundlePromo() {
    console.log('📦 Importing bundle promo...');
    const rows = readCSV('discon_paket_rule.csv');
    
    if (rows.length === 0) {
        console.log('⚠️  No rows to import');
        return;
    }
    
    // Auto-detect format: Check if CSV has 'bucket_id' column (new format) or 'buket_1' (old format)
    const firstRow = rows[0];
    const isNewFormat = 'bucket_id' in firstRow;
    
    if (isNewFormat) {
        // NEW FORMAT: Multiple rows per promo_id (unlimited buckets)
        console.log('📋 Using NEW format (multiple rows per promo_id)');
        
        // Group rows by promo_id
        const promoMap = new Map(); // promo_id -> { promoInfo, groups[] }
        
        rows.forEach(row => {
            // Skip empty rows (check if promo_id and bucket_id are valid)
            if (!row.promo_id || !row.promo_id.trim() || !row.bucket_id || !row.bucket_id.trim()) {
                return; // Skip empty rows
            }
            
            const promoId = row.promo_id.trim();
            const bucketId = row.bucket_id.trim();
            
            // Initialize promo entry if not exists (take header info from first row of this promo)
            if (!promoMap.has(promoId)) {
                promoMap.set(promoId, {
                    promo_id: promoId,
                    description: (row.description || '').trim(),
                    discount_per_package: toNumber(row.potongan, false),
                    max_packages: toInt(row.kelipatan, true),
                    groups: []
                });
            }
            
            // Add group info (group_number will be auto-generated from array index)
            const qty = row.qty_bucket || row.qty_buket_1 || row.qty_buket; // Support multiple column name variations
            const unit = row.unit_bucket || row.sat_buket_1 || row.sat_buket || 'unit_1';
            
            if (!qty || !qty.trim()) {
                console.warn(`⚠️  Skipping bucket ${bucketId} in promo ${promoId}: qty is empty`);
                return;
            }
            
            promoMap.get(promoId).groups.push({
                bucket_id: bucketId,
                qty: qty.trim(),
                unit: (unit || 'unit_1').trim()
            });
        });
        
        // Process each promo
        let totalGroups = 0;
        
        for (const [promoId, promoData] of promoMap) {
            // Skip if no groups
            if (promoData.groups.length === 0) {
                console.warn(`⚠️  Skipping promo ${promoId}: no valid groups found`);
                continue;
            }
            
            // Insert bundle_promo header
            const { error: promoError } = await supabase
                .from('bundle_promo')
                .upsert({
                    promo_id: promoData.promo_id,
                    description: promoData.description,
                    discount_per_package: promoData.discount_per_package,
                    max_packages: promoData.max_packages
                }, { onConflict: 'promo_id' });
            
            if (promoError) throw promoError;
            
            // Process groups (auto-generate group_number: 1, 2, 3, 4, ...)
            for (let i = 0; i < promoData.groups.length; i++) {
                const group = promoData.groups[i];
                const groupNumber = i + 1;
                
                // Insert bundle_promo_groups (simpan bucket_id langsung, product_ids di-lookup dari bucket_members saat query)
                const { error: groupError } = await supabase
                    .from('bundle_promo_groups')
                    .upsert({
                        promo_id: promoData.promo_id,
                        group_number: groupNumber,
                        bucket_id: group.bucket_id,
                        total_quantity: toInt(group.qty, false),
                        unit: group.unit
                    }, { onConflict: 'promo_id,group_number' });
                
                if (groupError) throw groupError;
                totalGroups++;
            }
        }
        
        console.log(`✅ Imported ${promoMap.size} bundle promos, ${totalGroups} groups`);
    } else {
        // OLD FORMAT: buket_1, buket_2, buket_3 (backward compatible, max 3 buckets)
        console.log('📋 Using OLD format (buket_1, buket_2, buket_3) - limited to 3 buckets');
        
        // Insert bundle_promo headers
        const bundlePromoData = rows.map(row => ({
            promo_id: row.promo_id,
            description: row.description || '',
            discount_per_package: toNumber(row.potongan, false),
            max_packages: toInt(row.kelipatan, true)
        }));
        
        const { error: promoError } = await supabase.from('bundle_promo').upsert(bundlePromoData, { onConflict: 'promo_id' });
        if (promoError) throw promoError;
        console.log(`✅ Imported ${bundlePromoData.length} bundle promo headers`);
        
        // Process each bundle promo row
        let totalGroups = 0;
        
        for (const row of rows) {
            const promoId = row.promo_id;
            if (!promoId || !promoId.trim()) continue; // Skip empty rows
            
            // Create bundle_promo_groups for buket_1, buket_2, buket_3 (simpan bucket_id langsung)
            const groups = [
                { num: 1, bucket: row.buket_1, qty: row.qty_buket_1, unit: row.sat_buket_1 },
                { num: 2, bucket: row.buket_2, qty: row.qty_buket_2, unit: row.sat_buket_2 },
                { num: 3, bucket: row.buket_3, qty: row.qty_buket_3, unit: row.sat_buket_3 }
            ].filter(g => g.bucket && g.bucket.trim() !== '' && g.qty && g.qty.trim() !== '');
            
            if (groups.length === 0) {
                console.warn(`⚠️  Skipping promo ${promoId}: no valid buckets found`);
                continue;
            }
            
            for (const group of groups) {
                // Insert bundle_promo_groups (simpan bucket_id langsung, product_ids di-lookup dari bucket_members saat query)
                const { error: groupError } = await supabase
                    .from('bundle_promo_groups')
                    .upsert({
                        promo_id: promoId.trim(),
                        group_number: group.num,
                        bucket_id: group.bucket.trim(),
                        total_quantity: toInt(group.qty, false),
                        unit: group.unit || 'unit_1'
                    }, { onConflict: 'promo_id,group_number' });
                
                if (groupError) throw groupError;
                totalGroups++;
            }
        }
        
        console.log(`✅ Imported ${totalGroups} bundle promo groups (OLD format - max 3 buckets)`);
    }
}

/**
 * 14. Import invoice_discounts
 * 
 * CSV Source: tabel usulan/discon_invoice.csv
 * Target Table: invoice_discounts
 * 
 * Mapping:
 *   CSV Column        →  DB Column              →  Type      →  Transform
 *   ──────────────────────────────────────────────────────────────────────
 *   promo_id          →  promo_id               →  TEXT
 *   description       →  description            →  TEXT      →  (default: '')
 *   min_belanja       →  min_purchase_amount    →  DECIMAL   →  toNumber()
 *   payment_method    →  payment_method         →  TEXT
 *   disc              →  discount_percentage    →  DECIMAL   →  toNumber()
 */
async function importInvoiceDiscounts() {
    console.log('📦 Importing invoice discounts...');
    const rows = readCSV('discon_invoice.csv');
    
    const data = rows.map(row => ({
        promo_id: row.promo_id,                              // CSV: promo_id → DB: promo_id
        description: row.description || '',                    // CSV: description → DB: description (default: '')
        min_purchase_amount: toNumber(row.min_belanja, false), // CSV: min_belanja → DB: min_purchase_amount
        payment_method: row.payment_method,                   // CSV: payment_method → DB: payment_method
        discount_percentage: toNumber(row.disc, false)        // CSV: disc → DB: discount_percentage
    }));
    
    const { error } = await supabase.from('invoice_discounts').upsert(data, { onConflict: 'promo_id' });
    if (error) throw error;
    console.log(`✅ Imported ${data.length} invoice discounts`);
}

/**
 * 15. Import free_product_promo
 * 
 * CSV Source: tabel usulan/promo_gratis_produk.csv
 * Target Table: free_product_promo
 * Dependencies: master_products (lookup required_product_id, free_product_id)
 * 
 * Mapping:
 *   CSV Column              →  DB Column              →  Type      →  Transform
 *   ──────────────────────────────────────────────────────────────────────────────────
 *   promo_id                →  promo_id               →  TEXT
 *   description             →  description            →  TEXT      →  (default: '')
 *   trigger_type            →  trigger_type           →  TEXT      →  ('nominal' atau 'qty')
 *   min_purchase_amount     →  min_purchase_amount    →  DECIMAL   →  toNumber() (nullable jika trigger_type='qty')
 *   min_quantity            →  min_quantity           →  INTEGER   →  toInt() (nullable jika trigger_type='nominal')
 *   purchase_scope          →  purchase_scope         →  TEXT
 *   principal_ids           →  principal_codes        →  TEXT[]    →  parseArray() (nullable)
 *   required_product_code   →  required_product_id    →  UUID      →  LOOKUP master_products.code
 *   free_product_code       →  free_product_id        →  UUID      →  LOOKUP master_products.code
 *   free_quantity           →  free_quantity          →  INTEGER   →  toInt()
 */
async function importFreeProductPromo() {
    console.log('📦 Importing free product promo...');
    const rows = readCSV('promo_gratis_produk.csv');
    
    // Note: master_products doesn't have id column, use code directly
    const productCodes = [...new Set(rows.map(r => [r.required_product_code, r.free_product_code]).flat())];
    const productMap = await batchLookupCodes('master_products', 'code', productCodes);
    
    const principalCodes = rows
        .map(r => parseArray(r.principal_ids))
        .flat()
        .filter(c => c);
    const principalMap = principalCodes.length > 0 
        ? await batchLookupIds('principals', 'code', [...new Set(principalCodes)])
        : new Map();
    
    const data = rows.map(row => {
        const principalCodesArray = parseArray(row.principal_ids);
        return {
            promo_id: row.promo_id,                                                          // CSV: promo_id → DB: promo_id
            description: row.description || '',                                               // CSV: description → DB: description
            trigger_type: row.trigger_type,                                                   // CSV: trigger_type → DB: trigger_type
            min_purchase_amount: row.trigger_type === 'nominal' ? toNumber(row.min_purchase_amount, false) : null, // Conditional
            min_quantity: row.trigger_type === 'qty' ? toInt(row.min_quantity, false) : null, // Conditional
            purchase_scope: row.purchase_scope,                                               // CSV: purchase_scope → DB: purchase_scope
            principal_codes: principalCodesArray.length > 0 ? principalCodesArray : null,     // CSV: principal_ids → DB: principal_codes (TEXT[])
            required_product_id: productMap.has(row.required_product_code) ? row.required_product_code : null,                  // CSV: required_product_code → DB: required_product_id (code)
            free_product_id: productMap.has(row.free_product_code) ? row.free_product_code : null,                          // CSV: free_product_code → DB: free_product_id (code)
            free_quantity: toInt(row.free_quantity, false)                                   // CSV: free_quantity → DB: free_quantity
        };
    }).filter(row => row.required_product_id && row.free_product_id);
    
    const { error } = await supabase.from('free_product_promo').upsert(data, { onConflict: 'promo_id' });
    if (error) throw error;
    console.log(`✅ Imported ${data.length} free product promo`);
}

/**
 * 16. Import promo_availability
 * 
 * CSV Source: tabel usulan/promo_availability.csv
 * Target Table: promo_availability
 * 
 * Mapping:
 *   CSV Column      →  DB Column          →  Type      →  Transform
 *   ──────────────────────────────────────────────────────────────────────
 *   promo_id        →  promo_id           →  TEXT
 *   description     →  description        →  TEXT      →  (nullable)
 *   type            →  promo_type         →  TEXT      →  Standard baku: 'principal', 'strata', 'bundling', 'invoice', 'free_product'
 *   store_type      →  store_type         →  TEXT
 *   rule_type       →  rule_type          →  TEXT      →  (allow/deny)
 *   level           →  level              →  TEXT      →  (zona/region/depo)
 *   zone_code       →  zone_codes         →  TEXT[]    →  parseArray() (note: CSV uses singular)
 *   region_code     →  region_codes       →  TEXT[]    →  parseArray() (note: CSV uses singular)
 *   depo_code       →  depo_codes         →  TEXT[]    →  parseArray() (note: CSV uses singular)
 *   start_date      →  start_date         →  DATE      →  (nullable, format: YYYY-MM-DD)
 *   end_date        →  end_date           →  DATE      →  (nullable, format: YYYY-MM-DD)
 * 
 * Note: Periode promo ditangani di promo_availability (tidak perlu ubah struktur tabel promosi lainnya)
 *       Jika start_date/end_date null = tidak ada batas waktu (backward compatible)
 */
async function importPromoAvailability() {
    console.log('📦 Importing promo availability...');
    const rows = readCSV('promo_availability.csv');
    
    const data = rows.map(row => ({
        promo_id: row.promo_id,                              // CSV: promo_id → DB: promo_id
        description: row.description || null,                 // CSV: description → DB: description (nullable)
        promo_type: (row.type || '').trim().toLowerCase(),   // CSV: type → DB: promo_type (standard: 'principal', 'strata', 'bundling', 'invoice', 'free_product')
        store_type: row.store_type,                          // CSV: store_type → DB: store_type
        rule_type: row.rule_type,                            // CSV: rule_type → DB: rule_type
        level: row.level,                                    // CSV: level → DB: level
        zone_codes: parseArray(row.zone_code || ''),         // CSV: zone_code → DB: zone_codes (TEXT[]) - note: CSV uses singular
        region_codes: parseArray(row.region_code || ''),     // CSV: region_code → DB: region_codes (TEXT[]) - note: CSV uses singular
        depo_codes: parseArray(row.depo_code || ''),         // CSV: depo_code → DB: depo_codes (TEXT[]) - note: CSV uses singular
        start_date: (row.start_date && row.start_date.trim() !== '' && row.start_date.trim().toLowerCase() !== 'null') ? row.start_date.trim() : null, // CSV: start_date → DB: start_date (DATE, nullable, format: YYYY-MM-DD)
        end_date: (row.end_date && row.end_date.trim() !== '' && row.end_date.trim().toLowerCase() !== 'null') ? row.end_date.trim() : null           // CSV: end_date → DB: end_date (DATE, nullable, format: YYYY-MM-DD)
    }));
    
    const { error } = await supabase.from('promo_availability').insert(data);
    if (error) throw error;
    console.log(`✅ Imported ${data.length} promo availability rules`);
}

// ============================================
// MAIN IMPORT FUNCTION
// ============================================

// Mapping step number/name to import function
const importSteps = {
    '1': { name: 'zones', func: importZones, csv: 'master_zona.csv' },
    '2': { name: 'principals', func: importPrincipals, csv: 'master_pincipal.csv' },
    '3': { name: 'products', func: importProducts, csv: 'master_product.csv' },
    '4': { name: 'prices', func: importPrices, csv: 'master_harga.csv' },
    '5': { name: 'product_groups', func: importProductGroups, csv: 'master_group.csv' },
    '6': { name: 'product_group_members', func: importProductGroupMembers, csv: 'master_group_member.csv' },
    '7': { name: 'bucket_members', func: importBucketMembers, csv: 'master_bucket_member.csv' },
    '8': { name: 'product_group_availability', func: importProductGroupAvailability, csv: 'master_group_availability.csv' },
    '9': { name: 'store_loyalty_classes', func: importStoreLoyaltyClasses, csv: 'master_loyalty_class.csv' },
    '10': { name: 'store_loyalty_availability', func: importStoreLoyaltyAvailability, csv: 'master_loyalty_availability.csv' },
    '10b': { name: 'store_loyalty_area_rules', func: importStoreLoyaltyAreaRules, csv: 'master_loyalty_area_rules.csv' },
    '11': { name: 'principal_discount_tiers', func: importPrincipalDiscountTiers, csv: 'discon_principal_rule.csv' },
    '12': { name: 'group_promo', func: importGroupPromo, csv: 'discon_strata_rule.csv' },
    '13': { name: 'bundle_promo', func: importBundlePromo, csv: 'discon_paket_rule.csv' },
    '14': { name: 'invoice_discounts', func: importInvoiceDiscounts, csv: 'discon_invoice.csv' },
    '15': { name: 'free_product_promo', func: importFreeProductPromo, csv: 'promo_gratis_produk.csv' },
    '16': { name: 'promo_availability', func: importPromoAvailability, csv: 'promo_availability.csv' }
};

async function main() {
    const args = process.argv.slice(2);
    const stepArg = args[0];
    
    // If no argument, show usage and list available steps
    if (!stepArg) {
        console.log('📋 Import CSV to Supabase - Step by Step\n');
        console.log('Usage: node import-csv.js <step_number>\n');
        console.log('Available steps:');
        Object.entries(importSteps).forEach(([num, step]) => {
            console.log(`  ${num.padStart(2)}. ${step.name.padEnd(30)} (${step.csv})`);
        });
        console.log('\nExample:');
        console.log('  node import-csv.js 1    # Import zones');
        console.log('  node import-csv.js all  # Import all steps in order');
        console.log('');
        process.exit(0);
    }
    
    // Import all steps in order
    if (stepArg === 'all') {
        console.log('🚀 Starting CSV import to Supabase (all steps)...\n');
        
        try {
            for (const [num, step] of Object.entries(importSteps)) {
                console.log(`\n[Step ${num}/${Object.keys(importSteps).length}] ${step.name}`);
                await step.func();
            }
            
            console.log('\n✅ All imports completed successfully!');
        } catch (error) {
            console.error('\n❌ Import failed:', error);
            process.exit(1);
        }
        return;
    }
    
    // Import specific step
    const step = importSteps[stepArg];
    if (!step) {
        console.error(`❌ Invalid step number: ${stepArg}`);
        console.log('\nAvailable steps: 1-16 or "all"');
        process.exit(1);
    }
    
    console.log(`🚀 Importing step ${stepArg}: ${step.name} (${step.csv})...\n`);
    
    try {
        await step.func();
        console.log(`\n✅ Step ${stepArg} (${step.name}) completed successfully!`);
    } catch (error) {
        console.error(`\n❌ Step ${stepArg} (${step.name}) failed:`, error);
        process.exit(1);
    }
}

// Run import
main();

