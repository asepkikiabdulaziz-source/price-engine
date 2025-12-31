// Database Operations using Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env.js';
import { logger } from './logger.js';

// Initialize supabase client for database operations
// Note: We create our own instance here to ensure it's initialized
let supabase = null;

function getSupabaseClient() {
    if (!supabase) {
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || 
            SUPABASE_URL === 'YOUR_SUPABASE_URL' || 
            SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
            throw new Error('Supabase credentials not configured. Please update env.js');
        }
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabase;
}

/**
 * Load master products from database
 */
export async function loadProducts() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('master_products')
            .select('code, name, principal_code, category, eceran, unit_1, unit_2, unit_3, ratio_unit_2_per_unit_1, ratio_unit_3_per_unit_2')
            .order('name');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading products:', error);
        throw error;
    }
}

/**
 * Load prices for a specific zone
 * zone_id di prices table adalah zone_code (TEXT), sama dengan view_area.zona
 * Tidak perlu lookup ke master_zones
 */
export async function loadPrices(zoneCode) {
    try {
        const supabase = getSupabaseClient();
        // Query langsung menggunakan zone_code (zone_id di prices = zone_code TEXT)
        const { data, error } = await supabase
            .from('prices')
            .select('product_code, base_price')
            .eq('zone_code', zoneCode); // zone_code di prices (TEXT)
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading prices:', error);
        throw error;
    }
}

/**
 * Load product groups
 */
export async function loadProductGroups() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('product_groups')
            .select('code, name, priority')
            .order('priority', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading product groups:', error);
        throw error;
    }
}

/**
 * Load product group members with group info
 */
export async function loadProductGroupMembers() {
    try {
        const supabase = getSupabaseClient();
        // Load members
        const { data: members, error: membersError } = await supabase
            .from('product_group_members')
            .select('product_code, product_group_code, priority');
        
        if (membersError) throw membersError;
        
        // Debug: Log raw data from database
        if (members && members.length > 0) {
            logger.log('🔍 loadProductGroupMembers - Raw data from database (first 3):', members.slice(0, 3).map(m => ({
                product_code: m.product_code,
                product_codeType: typeof m.product_code,
                product_group_code: m.product_group_code,
                priority: m.priority,
                allKeys: Object.keys(m)
            })));
        } else {
            logger.warn('⚠️ loadProductGroupMembers - No members found in database!');
        }
        
        // Load groups separately for mapping
        const { data: groups, error: groupsError } = await supabase
            .from('product_groups')
            .select('code, name, priority');
        
        if (groupsError) throw groupsError;
        
        // Create group map by code
        const groupMap = new Map();
        groups?.forEach(g => groupMap.set(g.code, g));
        
        // Attach group info to members and rename product_code to code
        const transformed = members?.map((member, index) => {
            // Debug: Log if product_code is missing
            if (!member.product_code) {
                logger.warn(`⚠️ loadProductGroupMembers - Member at index ${index} has no product_code:`, member);
            }
            return {
                code: member.product_code,  // Rename product_code to code
                product_group_code: member.product_group_code,
                priority: member.priority,
                product_groups: groupMap.get(member.product_group_code)
            };
        }) || [];
        
        // Debug: Log first few transformed members
        if (transformed.length > 0) {
            logger.log('🔍 loadProductGroupMembers - First 3 transformed members:', transformed.slice(0, 3).map((m, idx) => ({
                code: m.code,
                codeType: typeof m.code,
                codeValue: `"${m.code}"`,
                product_group_code: m.product_group_code,
                original_product_code: members[idx]?.product_code,
                original_product_codeType: typeof members[idx]?.product_code
            })));
        }
        
        return transformed;
    } catch (error) {
        logger.error('Error loading product group members:', error);
        throw error;
    }
}

/**
 * Load product group availability rules
 */
export async function loadProductGroupAvailability() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('product_group_availability')
            .select('product_group_code, rule_type, level, zone_codes, region_codes, depo_codes');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading product group availability:', error);
        throw error;
    }
}

/**
 * Check if a product group is available for user based on availability rules
 * @param {string} groupCode - Product group code
 * @param {Array} availabilityRules - Array of availability rules
 * @param {string} userZona - User's zona
 * @param {string} userRegion - User's region_name
 * @param {string} userDepo - User's depo_id
 * @returns {boolean} - True if group is available
 */
export function isProductGroupAvailable(groupCode, availabilityRules, userZona, userRegion, userDepo) {
    // Get rules for this group
    const groupRules = availabilityRules.filter(rule => rule.product_group_code === groupCode);
    
    // Debug logging for first few groups
    if (groupCode && (groupCode.includes('WFR') || groupCode.includes('SIP'))) {
        logger.log(`🔍 isProductGroupAvailable for ${groupCode}:`, {
            groupCode,
            rulesCount: groupRules.length,
            userZona,
            userRegion,
            userDepo,
            rules: groupRules.map(r => ({
                rule_type: r.rule_type,
                level: r.level,
                zone_codes: r.zone_codes,
                region_codes: r.region_codes,
                depo_codes: r.depo_codes
            }))
        });
    }
    
    // If no rules, default to available
    if (groupRules.length === 0) {
        return true;
    }
    
    // Check deny rules first - if any deny rule matches, group is not available
    const denyRules = groupRules.filter(rule => rule.rule_type === 'deny');
    for (const rule of denyRules) {
        let isMatch = false;
        
        if (rule.level === 'zona') {
            const zones = rule.zone_codes || [];
            // Empty array means no restriction (don't match)
            // Only match if array has values and userZona is in the array
            if (userZona && zones.length > 0) {
                isMatch = zones.includes(userZona);
            }
        } else if (rule.level === 'region') {
            const regions = rule.region_codes || [];
            // Empty array means no restriction (don't match)
            // Only match if array has values and userRegion is in the array
            if (userRegion && regions.length > 0) {
                isMatch = regions.includes(userRegion);
            }
        } else if (rule.level === 'depo') {
            const depos = rule.depo_codes || [];
            // Empty array means no restriction (don't match)
            // Only match if array has values and userDepo is in the array
            if (userDepo && depos.length > 0) {
                isMatch = depos.includes(userDepo);
            }
        }
        // Note: product_group_availability only supports 'zona', 'region', 'depo' (not 'all')
        
        if (isMatch) {
            return false; // Deny rule matched, group not available
        }
    }
    
    // Check allow rules - if there are allow rules, group must match at least one
    const allowRules = groupRules.filter(rule => rule.rule_type === 'allow');
    if (allowRules.length === 0) {
        // No allow rules, only deny rules (already checked above), so group is available
        return true;
    }
    
    // Check if user matches any allow rule
    for (const rule of allowRules) {
        let isMatch = false;
        
        if (rule.level === 'zona') {
            const zones = rule.zone_codes || [];
            // Empty array means no restriction (don't match)
            // Only match if array has values and userZona is in the array
            if (userZona && zones.length > 0) {
                isMatch = zones.includes(userZona);
            }
        } else if (rule.level === 'region') {
            const regions = rule.region_codes || [];
            // Empty array means no restriction (don't match)
            // Only match if array has values and userRegion is in the array
            if (userRegion && regions.length > 0) {
                isMatch = regions.includes(userRegion);
            }
        } else if (rule.level === 'depo') {
            const depos = rule.depo_codes || [];
            // Empty array means no restriction (don't match)
            // Only match if array has values and userDepo is in the array
            if (userDepo && depos.length > 0) {
                isMatch = depos.includes(userDepo);
            }
        }
        // Note: product_group_availability only supports 'zona', 'region', 'depo' (not 'all')
        
        if (isMatch) {
            return true; // Allow rule matched
        }
    }
    
    // If there are allow rules but none matched, group is not available
    return false;
}

/**
 * Load principals
 */
export async function loadPrincipals() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('principals')
            .select('id, code, name')
            .order('name');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading principals:', error);
        throw error;
    }
}


/**
 * Load regions from view_area
 * Menggunakan view_area untuk mendapatkan unique regions
 */
export async function loadRegions() {
    try {
        const supabase = getSupabaseClient();
        
        // Query view_area untuk mendapatkan unique regions
        const { data, error } = await supabase
            .from('view_area')
            .select('region_name')
            .order('region_name');
        
        if (error) throw error;
        
        // Get unique region names
        const uniqueRegions = [...new Set((data || []).map(r => r.region_name).filter(Boolean))];
        
        // Map ke format yang diharapkan (code, name)
        // Note: region_name digunakan sebagai code dan name (karena tidak ada region_id di view)
        return uniqueRegions.map(regionName => ({
            code: regionName,
            name: regionName
        }));
    } catch (error) {
        logger.error('Error loading regions:', error);
        throw error;
    }
}

/**
 * Load depos for a specific region from view_area
 */
export async function loadDepos(regionCode = null) {
    try {
        const supabase = getSupabaseClient();
        let query = supabase
            .from('view_area')
            .select('depo_id, depo_name, region_name');
        
        // Filter by region jika regionCode diberikan
        if (regionCode) {
            query = query.eq('region_name', regionCode);
        }
        
        const { data, error } = await query.order('depo_name');
        
        if (error) throw error;
        
        // Get unique depos (dalam kasus ada duplicate)
        const depoMap = new Map();
        (data || []).forEach(d => {
            if (d.depo_id && !depoMap.has(d.depo_id)) {
                depoMap.set(d.depo_id, {
                    code: d.depo_id,
                    name: d.depo_name || d.depo_id
                });
            }
        });
        
        return Array.from(depoMap.values());
    } catch (error) {
        logger.error('Error loading depos:', error);
        throw error;
    }
}

/**
 * Get zona from view_area berdasarkan depo_id
 */
export async function getZonaByDepoId(depoId) {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('view_area')
            .select('zona')
            .eq('depo_id', depoId)
            .single();
        
        if (error) {
            logger.error('Error getting zona:', error);
            return null;
        }
        
        return data?.zona || null;
    } catch (error) {
        logger.error('Error getting zona by depo_id:', error);
        return null;
    }
}

/**
 * Get depo info (depo_name, region_name, zona) from view_area berdasarkan depo_id
 */
export async function getDepoInfoByDepoId(depoId) {
    try {
        const supabase = getSupabaseClient();
        // Gunakan .limit(1) dan ambil first result, karena mungkin ada multiple rows untuk same depo_id
        const { data, error } = await supabase
            .from('view_area')
            .select('depo_name, region_name, zona')
            .eq('depo_id', depoId)
            .limit(1);
        
        if (error) {
            logger.error('Error getting depo info:', error);
            return null;
        }
        
        if (!data || data.length === 0) {
            logger.warn('No depo info found for depo_id:', depoId);
            return null;
        }
        
        const depoInfo = data[0];
        logger.log('📋 Depo info retrieved:', depoInfo, 'for depo_id:', depoId);
        
        return {
            depo_name: depoInfo?.depo_name || null,
            region_name: depoInfo?.region_name || null,
            zona: depoInfo?.zona || null
        };
    } catch (error) {
        logger.error('Error getting depo info by depo_id:', error);
        return null;
    }
}

/**
 * Get price for a product in a specific zone
 * zone_id di prices table adalah zone_code (TEXT), sama dengan view_area.zona
 */
export async function getProductPrice(productCode, zoneCode) {
    try {
        const supabase = getSupabaseClient();
        // Query langsung menggunakan zone_code
        const { data, error } = await supabase
            .from('prices')
            .select('base_price')
            .eq('product_code', productCode)
            .eq('zone_code', zoneCode) // zone_code di prices (TEXT)
            .single();
        
        if (error) return null;
        return data?.base_price || null;
    } catch (error) {
        logger.error('Error getting product price:', error);
        return null;
    }
}

/**
 * Load bundle promos
 */
export async function loadBundlePromos() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('bundle_promo')
            .select('promo_id, description, discount_per_package, max_packages');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading bundle promos:', error);
        throw error;
    }
}

/**
 * Load bucket members (product_id -> bucket_id mapping)
 */
export async function loadBucketMembers() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('bucket_members')
            .select('product_code, bucket_id');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading bucket members:', error);
        throw error;
    }
}

/**
 * Load bundle promo groups (bucket_id per promo_id)
 */
export async function loadBundlePromoGroups(promoId) {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('bundle_promo_groups')
            .select('promo_id, group_number, bucket_id, total_quantity, unit')
            .eq('promo_id', promoId)
            .order('group_number');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading bundle promo groups:', error);
        throw error;
    }
}

/**
 * Load all bundle promo groups (for all promos)
 */
export async function loadAllBundlePromoGroups() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('bundle_promo_groups')
            .select('promo_id, group_number, bucket_id, total_quantity, unit')
            .order('promo_id, group_number');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading all bundle promo groups:', error);
        throw error;
    }
}

/**
 * Load promo availability rules
 */
export async function loadPromoAvailability() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('promo_availability')
            .select('promo_id, promo_type, store_type, rule_type, level, zone_codes, region_codes, depo_codes, start_date, end_date');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading promo availability:', error);
        throw error;
    }
}

/**
 * Check if a promo is available for user based on availability rules
 * @param {string} promoId - Promo ID
 * @param {string} promoType - Promo type (e.g., 'bundling')
 * @param {Array} availabilityRules - Array of availability rules
 * @param {string} storeType - Selected store type ('grosir' or 'retail')
 * @param {string} userZona - User's zona
 * @param {string} userRegion - User's region_name
 * @param {string} userDepo - User's depo_id
 * @returns {boolean} - True if promo is available
 */
export function isPromoAvailable(promoId, promoType, availabilityRules, storeType, userZona, userRegion, userDepo) {
    // Get rules for this promo
    const promoRules = availabilityRules.filter(rule => 
        rule.promo_id === promoId && rule.promo_type === promoType
    );
    
    // If no rules, default to available
    if (promoRules.length === 0) {
        return true;
    }
    
    // Check date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const activeRules = promoRules.filter(rule => {
        if (rule.start_date) {
            const startDate = new Date(rule.start_date);
            startDate.setHours(0, 0, 0, 0);
            if (today < startDate) return false;
        }
        if (rule.end_date) {
            const endDate = new Date(rule.end_date);
            endDate.setHours(23, 59, 59, 999);
            if (today > endDate) return false;
        }
        return true;
    });
    
    if (activeRules.length === 0) {
        return false; // No active rules
    }
    
    // Check store type
    const storeTypeRules = activeRules.filter(rule => {
        if (rule.store_type === 'all') return true;
        return rule.store_type === storeType;
    });
    
    if (storeTypeRules.length === 0) {
        return false; // Not available for this store type
    }
    
    // Check deny rules first
    const denyRules = storeTypeRules.filter(rule => rule.rule_type === 'deny');
    for (const rule of denyRules) {
        let isMatch = false;
        
        if (rule.level === 'all') {
            isMatch = true;
        } else if (rule.level === 'zona') {
            const zones = rule.zone_codes || [];
            if (userZona && zones.length > 0) {
                isMatch = zones.includes(userZona);
            }
        } else if (rule.level === 'region') {
            const regions = rule.region_codes || [];
            if (userRegion && regions.length > 0) {
                isMatch = regions.includes(userRegion);
            }
        } else if (rule.level === 'depo') {
            const depos = rule.depo_codes || [];
            if (userDepo && depos.length > 0) {
                isMatch = depos.includes(userDepo);
            }
        }
        
        if (isMatch) {
            return false; // Deny rule matched
        }
    }
    
    // Check allow rules
    const allowRules = storeTypeRules.filter(rule => rule.rule_type === 'allow');
    if (allowRules.length === 0) {
        // No allow rules, only deny rules (already checked), so promo is available
        return true;
    }
    
    for (const rule of allowRules) {
        let isMatch = false;
        
        if (rule.level === 'all') {
            isMatch = true;
        } else if (rule.level === 'zona') {
            const zones = rule.zone_codes || [];
            if (userZona && zones.length > 0) {
                isMatch = zones.includes(userZona);
            }
        } else if (rule.level === 'region') {
            const regions = rule.region_codes || [];
            if (userRegion && regions.length > 0) {
                isMatch = regions.includes(userRegion);
            }
        } else if (rule.level === 'depo') {
            const depos = rule.depo_codes || [];
            if (userDepo && depos.length > 0) {
                isMatch = depos.includes(userDepo);
            }
        }
        
        if (isMatch) {
            return true; // Allow rule matched
        }
    }
    
    // If there are allow rules but none matched, promo is not available
    return false;
}

/**
 * Load principal discount tiers
 */
export async function loadPrincipalDiscountTiers() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('principal_discount_tiers')
            .select('promo_id, description, principal_codes, min_purchase_amount, discount_percentage, priority')
            .order('promo_id', { ascending: true })
            .order('min_purchase_amount', { ascending: true });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading principal discount tiers:', error);
        throw error;
    }
}

/**
 * Load group promo (strata) headers
 */
export async function loadGroupPromos() {
    try {
        const supabase = getSupabaseClient();
        // Fetch all rows using pagination (Supabase default limit is 1000 rows)
        const batchSize = 1000;
        let allData = [];
        let from = 0;
        let hasMore = true;
        
        while (hasMore) {
            const { data, error } = await supabase
                .from('group_promo')
                .select('promo_id, description, product_group_code, tier_mode, tier_unit, consider_variant')
                .range(from, from + batchSize - 1);
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                allData = allData.concat(data);
                // If we got fewer rows than batchSize, we've reached the end
                hasMore = data.length === batchSize;
                from += batchSize;
            } else {
                hasMore = false;
            }
        }
        
        logger.log(`Loaded ${allData.length} group promos from database`);
        return allData;
    } catch (error) {
        logger.error('Error loading group promos:', error);
        throw error;
    }
}

/**
 * Load group promo tiers
 */
export async function loadGroupPromoTiers() {
    try {
        const supabase = getSupabaseClient();
        // Fetch all rows using pagination (Supabase default limit is 1000 rows)
        const batchSize = 1000;
        let allData = [];
        let from = 0;
        let hasMore = true;
        
        while (hasMore) {
            const { data, error } = await supabase
                .from('group_promo_tiers')
                .select('promo_id, description, min_qty, discount_per_unit, variant_count, priority')
                .order('promo_id', { ascending: true })
                .order('min_qty', { ascending: true })
                .range(from, from + batchSize - 1);
            
            if (error) throw error;
            
            if (data && data.length > 0) {
                allData = allData.concat(data);
                // If we got fewer rows than batchSize, we've reached the end
                hasMore = data.length === batchSize;
                from += batchSize;
            } else {
                hasMore = false;
            }
        }
        
        logger.log(`Loaded ${allData.length} group promo tiers from database`);
        return allData;
    } catch (error) {
        logger.error('Error loading group promo tiers:', error);
        throw error;
    }
}

/**
 * Load invoice discounts
 */
export async function loadInvoiceDiscounts() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('invoice_discounts')
            .select('promo_id, description, min_purchase_amount, payment_method, discount_percentage')
            .order('min_purchase_amount', { ascending: true });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading invoice discounts:', error);
        throw error;
    }
}

/**
 * Load free product promos
 */
export async function loadFreeProductPromos() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('free_product_promo')
            .select('promo_id, description, trigger_type, min_purchase_amount, min_quantity, unit_min_quantity, purchase_scope, principal_codes, group_codes, required_product_code, free_product_code, free_quantity, unit_free_quantity, discount_type, discount_per_unit, discount_percentage');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading free product promos:', error);
        throw error;
    }
}

/**
 * Load free product promo tiers
 * Tiers digunakan untuk percentage discount dengan multiple tiers
 */
export async function loadFreeProductPromoTiers() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('free_product_promo_tiers')
            .select('promo_id, min_quantity, max_quantity, discount_percentage, priority, description')
            .order('promo_id', { ascending: true })
            .order('priority', { ascending: true })
            .order('min_quantity', { ascending: true });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading free product promo tiers:', error);
        throw error;
    }
}

/**
 * Get principal code for a product
 * Note: principal_id in master_products is actually the principal CODE (TEXT), not UUID
 */
export async function getProductPrincipal(productCode) {
    try {
        const supabase = getSupabaseClient();
        
        // Get product with principal_id
        // Note: principal_id in master_products is already the principal code (TEXT)
        const { data: product, error: productError } = await supabase
            .from('master_products')
            .select('principal_id')
            .eq('code', productCode)
            .single();
        
        if (productError) throw productError;
        if (!product || !product.principal_id) {
            return null;
        }
        
        // principal_id is already the principal code (TEXT), return it directly
        return product.principal_id;
    } catch (error) {
        logger.error(`Error getting principal for product ${productCode}:`, error);
        return null;
    }
}

/**
 * Batch get principal codes for multiple products
 * Returns a Map<productCode, principalCode>
 * Note: Performs separate queries since foreign key relationship may not be configured in Supabase
 * IMPORTANT: master_products.principal_id references principals.code (TEXT), not principals.id (UUID)
 */
export async function batchGetProductPrincipals(productCodes) {
    try {
        if (!productCodes || productCodes.length === 0) {
            return new Map();
        }
        
        const supabase = getSupabaseClient();
        
        // First, get products with principal_code
        // Note: principal_code in master_products is the principal CODE (TEXT), not UUID
        const { data: products, error: productsError } = await supabase
            .from('master_products')
            .select('code, principal_code')
            .in('code', productCodes);
        
        if (productsError) throw productsError;
        if (!products || products.length === 0) {
            return new Map();
        }
        
        // Create final map: product_code -> principal_code
        // principal_code in master_products stores the principal code directly (TEXT)
        // So we can use it directly without any lookup
        const principalMap = new Map();
        (products || []).forEach(product => {
            if (product.principal_code) {
                // principal_code is already the principal code, use it directly
                principalMap.set(product.code, product.principal_code);
            }
        });
        
        return principalMap;
    } catch (error) {
        logger.error('Error batch getting product principals:', error);
        return new Map();
    }
}

/**
 * Load loyalty classes from database
 */
export async function loadLoyaltyClasses() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('store_loyalty_classes')
            .select('code, name, store_type, target_monthly, cashback_percentage')
            .order('code, store_type');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading loyalty classes:', error);
        throw error;
    }
}

/**
 * Load loyalty area rules from database
 */
export async function loadLoyaltyAreaRules() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('store_loyalty_area_rules')
            .select('loyalty_class_code, store_type, zone_codes, region_codes, depo_codes, target_monthly, cashback_percentage, priority')
            .order('loyalty_class_code, priority', { ascending: false });
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading loyalty area rules:', error);
        throw error;
    }
}

/**
 * Load loyalty availability rules from database
 */
export async function loadLoyaltyAvailability() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('store_loyalty_availability')
            .select('loyalty_class_code, rule_type, level, zone_codes, region_codes, depo_codes');
        
        if (error) throw error;
        return data || [];
    } catch (error) {
        logger.error('Error loading loyalty availability:', error);
        throw error;
    }
}

/**
 * Check if a loyalty class is available for user based on availability rules
 * @param {string} loyaltyClassCode - Loyalty class code
 * @param {Array} availabilityRules - Array of availability rules
 * @param {string} userZona - User's zona
 * @param {string} userRegion - User's region_name
 * @param {string} userDepo - User's depo_id
 * @returns {boolean} - True if loyalty class is available
 */
export function isLoyaltyClassAvailable(loyaltyClassCode, availabilityRules, userZona, userRegion, userDepo) {
    // Get rules for this loyalty class
    const classRules = availabilityRules.filter(rule => 
        rule.loyalty_class_code === loyaltyClassCode
    );
    
    // If no rules, default to available
    if (classRules.length === 0) {
        return true;
    }
    
    // Check rules (similar to isPromoAvailable logic)
    let hasAllowRule = false;
    let hasDenyRule = false;
    
    for (const rule of classRules) {
        if (rule.rule_type === 'deny') {
            // Check if this deny rule matches user's area
            if (matchesArea(rule, userZona, userRegion, userDepo)) {
                hasDenyRule = true;
            }
        } else if (rule.rule_type === 'allow') {
            // Check if this allow rule matches user's area
            if (matchesArea(rule, userZona, userRegion, userDepo)) {
                hasAllowRule = true;
            }
        }
    }
    
    // If there's a deny rule that matches, return false
    if (hasDenyRule) {
        return false;
    }
    
    // If there's an allow rule that matches, return true
    if (hasAllowRule) {
        return true;
    }
    
    // Default: if only allow rules exist but none match, return false
    // If only deny rules exist but none match, return true
    const hasAnyAllowRule = classRules.some(r => r.rule_type === 'allow');
    return !hasAnyAllowRule;
}

/**
 * Helper function to check if a rule matches user's area
 */
function matchesArea(rule, userZona, userRegion, userDepo) {
    // Check zone
    if (rule.zone_codes && rule.zone_codes.length > 0) {
        if (!rule.zone_codes.includes('all') && !rule.zone_codes.includes(userZona)) {
            return false;
        }
    }
    
    // Check region
    if (rule.region_codes && rule.region_codes.length > 0) {
        if (!rule.region_codes.includes('all') && !rule.region_codes.includes(userRegion)) {
            return false;
        }
    }
    
    // Check depo
    if (rule.depo_codes && rule.depo_codes.length > 0) {
        if (!rule.depo_codes.includes('all') && !rule.depo_codes.includes(userDepo)) {
            return false;
        }
    }
    
    return true;
}

/**
 * Resolve loyalty rule for a specific class and store type
 * Simplified version: hanya menggunakan store_loyalty_classes (dengan store_type)
 * @param {string} loyaltyClassCode - Loyalty class code
 * @param {string} storeType - Store type ('grosir' or 'retail')
 * @param {Array} loyaltyClasses - Array of loyalty classes from loadLoyaltyClasses()
 * @returns {Object|null} - Resolved rule with target_monthly and cashback_percentage, or null if not found
 */
export function resolveLoyaltyRule(loyaltyClassCode, storeType, loyaltyClasses) {
    if (!loyaltyClasses || loyaltyClasses.length === 0) {
        return null;
    }
    
    // Filter classes for this code
    const classRules = loyaltyClasses.filter(c => c.code === loyaltyClassCode);
    
    if (classRules.length === 0) {
        return null;
    }
    
    // Try to find specific store_type first (grosir or retail)
    const specificStoreType = classRules.find(c => c.store_type === storeType);
    if (specificStoreType) {
        return {
            target_monthly: parseFloat(specificStoreType.target_monthly) || 0,
            cashback_percentage: parseFloat(specificStoreType.cashback_percentage) || 0
        };
    }
    
    // Fallback to 'all' store_type
    const allStoreType = classRules.find(c => c.store_type === 'all');
    if (allStoreType) {
        return {
            target_monthly: parseFloat(allStoreType.target_monthly) || 0,
            cashback_percentage: parseFloat(allStoreType.cashback_percentage) || 0
        };
    }
    
    // If no match, return first one (shouldn't happen if data is correct)
    const firstRule = classRules[0];
    return {
        target_monthly: parseFloat(firstRule.target_monthly) || 0,
        cashback_percentage: parseFloat(firstRule.cashback_percentage) || 0
    };
}

/**
 * Helper function to calculate specificity score
 * Higher score = more specific (depo > region > zone > all)
 */
function getSpecificity(rule) {
    let score = 0;
    if (rule.depo_codes && rule.depo_codes.length > 0 && !rule.depo_codes.includes('all')) {
        score += 3;
    }
    if (rule.region_codes && rule.region_codes.length > 0 && !rule.region_codes.includes('all')) {
        score += 2;
    }
    if (rule.zone_codes && rule.zone_codes.length > 0 && !rule.zone_codes.includes('all')) {
        score += 1;
    }
    return score;
}

/**
 * Get master data version from Supabase metadata
 * Mirror dari kalkulator/app.js getMasterVersion()
 */
export async function getMasterVersion() {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('metadata')
            .select('value')
            .eq('key', 'versionInfo')
            .single();
        
        if (error) {
            // Jika tabel metadata belum ada, return empty object
            if (error.code === 'PGRST116') {
                logger.warn('Metadata table not found, returning empty version');
                return {};
            }
            throw error;
        }
        return data?.value || {};
    } catch (error) {
        logger.error('Error getting master version:', error);
        return {};
    }
}

/**
 * Sync collection data with version checking (mirror dari kalkulator/app.js syncCollectionData)
 * @param {string} collectionName - Nama collection (untuk localStorage key)
 * @param {string} versionKey - Key untuk version di metadata (misal: 'master_products')
 * @param {Function} loadFunction - Function untuk load data dari Supabase
 * @returns {Promise<{data: any, fromCache: boolean, version: number, updated?: boolean, error?: boolean}>}
 */
export async function syncCollectionData(collectionName, versionKey, loadFunction) {
    const DATA_KEY = `price_engine_${collectionName}`;
    let dbData = null;
    
    // Get local version early (before try block) untuk fallback
    let localVersion = parseInt(localStorage.getItem(`version_${versionKey}`)) || 0;
    
    try {
        const storedData = localStorage.getItem(DATA_KEY);
        if (storedData) {
            dbData = JSON.parse(storedData);
        }
    } catch (e) {
        logger.warn(`Failed to parse cached data for ${collectionName}:`, e);
        dbData = null;
    }

    try {
        const versions = await getMasterVersion();
        const serverVersion = versions[versionKey] || 0;
        localVersion = parseInt(localStorage.getItem(`version_${versionKey}`)) || 0;

        if (dbData && serverVersion === localVersion && localVersion > 0) {
            // Versi sama, gunakan cache
            logger.log(`✅ ${collectionName} (v${localVersion}): Siap dari Cache`);
            return { 
                data: dbData, 
                fromCache: true, 
                version: localVersion 
            };
        } else {
            // Versi berbeda atau belum ada cache, ambil dari server
            if (localVersion > 0) {
                logger.log(`🔄 ${collectionName}: Update v${localVersion} → v${serverVersion}`);
            } else {
                logger.log(`📥 ${collectionName} (v${serverVersion}): Unduh Pertama`);
            }
            
            dbData = await loadFunction();
            
            // Simpan ke localStorage
            localStorage.setItem(DATA_KEY, JSON.stringify(dbData));
            localStorage.setItem(`version_${versionKey}`, serverVersion.toString());
            
            return { 
                data: dbData, 
                fromCache: false, 
                version: serverVersion,
                updated: localVersion > 0 
            };
        }
    } catch (error) {
        logger.error(`❌ Gagal sync ${collectionName}:`, error);
        
        // Fallback ke cache lama jika ada
        if (dbData) {
            logger.warn(`⚠️ Menggunakan data lama dari cache untuk ${collectionName}`);
            return { 
                data: dbData, 
                fromCache: true, 
                error: true,
                version: localVersion 
            };
        }
        
        throw error;
    }
}


