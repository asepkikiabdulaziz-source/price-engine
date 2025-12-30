// calculation.js
const PPN_RATE = 0.11; // 11% PPN

// Helper function to format currency
const formatCurrency = (amount) => {
    // Bulatkan ke bilangan bulat sebelum format
    const roundedAmount = Math.round(amount || 0);
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(roundedAmount);
};

// Helper function to convert quantity to smallest unit (boxes)
const getQtyBoxTotal = (item) => {
    // Support both structures
    const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || item.qtyKarton || 0;
    const qtyBox = item.quantities?.box || item.quantities?.unit_2 || item.qtyBox || 0;
    const ratio = item.product?.ratio_unit_2_per_unit_1 || item.product?.box_per_krt || 1;
    return (qtyKrt * ratio) + qtyBox;
};

// Helper to get price per box (base_price is per unit_1/karton, need to convert)
const getPricePerBox = (product, priceMap, userZona) => {
    const basePrice = product.prices?.[userZona] || priceMap?.get(product.code) || 0;
    const ratio = product.ratio_unit_2_per_unit_1 || 1; // e.g., 8 box per carton
    // base_price is per unit_1 (karton), so convert to per box
    return basePrice / ratio;
};

/**
 * Calculate base price
 * @param {Map} cart - Cart items
 * @param {Map} productDataMap - Product data map
 * @param {string} userZona - User's zona
 * @returns {number} Total base price
 */
export function calculateBasePrice(cart, productDataMap, userZona) {
    let total = 0;
    
    cart.forEach((item, productId) => {
        const product = productDataMap.get(productId);
        if (!product) return;
        
        // Get base price for this product in user's zona
        const price = product.prices?.[userZona] || 0;
        if (!price) return;
        
        // Calculate quantity in unit_1 (smallest unit, e.g., Box)
        // Support both structures: item.quantities (new) and item.qtyKarton/item.qtyBox (old/kalkulator)
        const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || item.qtyKarton || 0;
        const qtyBox = item.quantities?.box || item.quantities?.unit_2 || item.qtyBox || 0;
        const ratio = product.ratio_unit_2_per_unit_1 || 1;
        const qtyBoxTotal = (qtyKrt * ratio) + qtyBox;
        
        // Calculate subtotal
        // Note: base_price is per unit_1 (karton/carton), so we need to convert to per box
        // ratio_unit_2_per_unit_1 = how many boxes per carton (e.g., 8 box/karton)
        const pricePerBox = price / ratio; // Convert price per carton to price per box
        const subtotal = qtyBoxTotal * pricePerBox;
        total += subtotal;
    });
    
    return total;
}

/**
 * Calculate total purchase amount per principal (INCLUDE PPN)
 * @param {Map} cart - Cart items
 * @param {Map} productDataMap - Product data map
 * @param {Map} principalMap - Map product code -> principal code
 * @param {string} userZona - User's zona
 * @returns {Map} Map of principal code -> total purchase amount (include PPN)
 */
function calculateTotalPerPrincipal(cart, productDataMap, principalMap, userZona) {
    const totalPerPrincipal = new Map();
    
    cart.forEach((item, productId) => {
        const product = productDataMap.get(productId);
        if (!product) return;
        
        // Get principal code for this product
        const principalCode = principalMap.get(productId) || product.principal_id || '';
        if (!principalCode) return;
        
        // Get base price (already include PPN)
        const basePrice = product.prices?.[userZona] || 0;
        if (!basePrice) return;
        
        // Calculate quantities
        const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || item.qtyKarton || 0;
        const qtyBox = item.quantities?.box || item.quantities?.unit_2 || item.qtyBox || 0;
        const ratio = product.ratio_unit_2_per_unit_1 || 1;
        const qtyBoxTotal = (qtyKrt * ratio) + qtyBox;
        
        // Calculate price per box (base_price is per unit_1/karton)
        const pricePerBox = basePrice / ratio;
        
        // Calculate subtotal (INCLUDE PPN - langsung pakai base_price)
        const subtotal = qtyBoxTotal * pricePerBox;
        
        // Normalize principal code to uppercase
        const principalKey = String(principalCode).toUpperCase().trim();
        totalPerPrincipal.set(principalKey, (totalPerPrincipal.get(principalKey) || 0) + subtotal);
    });
    
    return totalPerPrincipal;
}

/**
 * Calculate principal discount
 * @param {Map} cart - Cart items
 * @param {Map} productDataMap - Product data map
 * @param {Map} principalMap - Map product code -> principal code
 * @param {Array} principalDiscountTiers - Array of principal discount tiers
 * @param {Array} promoAvailabilityRules - Array of promo availability rules
 * @param {string} storeType - Store type ('grosir' or 'retail')
 * @param {string} userZona - User's zona
 * @param {string} userRegion - User's region
 * @param {string} userDepo - User's depo
 * @param {Function} isPromoAvailable - Function to check if promo is available
 * @returns {Map} Map of principal code -> discount percentage
 */
export function calculatePrincipalDiscount(
    cart, 
    productDataMap, 
    principalMap, 
    principalDiscountTiers,
    promoAvailabilityRules,
    storeType,
    userZona,
    userRegion,
    userDepo,
    isPromoAvailable
) {
    if (!cart || cart.size === 0 || !principalDiscountTiers || principalDiscountTiers.length === 0) {
        return new Map();
    }
    
    // 1. Hitung total belanja per principal (INCLUDE PPN)
    const totalPerPrincipal = calculateTotalPerPrincipal(cart, productDataMap, principalMap, userZona);
    
    // 2. Filter tier berdasarkan promo availability dan kumpulkan per promo_id
    const availableTiersByPromo = new Map();
    
    principalDiscountTiers.forEach(tier => {
        // Check if promo is available
        const available = isPromoAvailable(
            tier.promo_id,
            'principal',
            promoAvailabilityRules,
            storeType,
            userZona,
            userRegion,
            userDepo
        );
        
        if (available) {
            if (!availableTiersByPromo.has(tier.promo_id)) {
                availableTiersByPromo.set(tier.promo_id, []);
            }
            availableTiersByPromo.get(tier.promo_id).push(tier);
        }
    });
    
    // 3. Untuk setiap promo, cari tier terbaik per principal
    // NOTE: Jika principal_codes adalah array dengan multiple principals, 
    //       total gabungan dari semua principals di array harus >= min_purchase_amount
    const bestDiscountPerPrincipal = new Map();
    
    availableTiersByPromo.forEach((tiers, promoId) => {
        // Sort tiers by min_purchase_amount descending (terbesar dulu)
        const sortedTiers = [...tiers].sort((a, b) => {
            const minA = parseFloat(a.min_purchase_amount) || 0;
            const minB = parseFloat(b.min_purchase_amount) || 0;
            return minB - minA; // Descending
        });
        
        sortedTiers.forEach(tier => {
            // Parse principal_codes (bisa array atau string)
            let principalCodes = [];
            if (Array.isArray(tier.principal_codes)) {
                principalCodes = tier.principal_codes;
            } else if (typeof tier.principal_codes === 'string') {
                principalCodes = tier.principal_codes.split(',').map(s => s.trim());
            }
            
            // Normalize principal codes
            principalCodes = principalCodes.map(code => String(code).toUpperCase().trim()).filter(Boolean);
            
            if (principalCodes.length === 0) return;
            
            const minPurchase = parseFloat(tier.min_purchase_amount) || 0;
            // Normalize discount percentage (support both decimal 0.01 and percentage 5)
            // discount_percentage dalam format persentase (1 = 1%, 5 = 5%)
            const tierDiscount = parseFloat(tier.discount_percentage) || 0;
            
            // Jika principal_codes adalah array dengan multiple principals,
            // hitung TOTAL GABUNGAN dari semua principals di array
            if (principalCodes.length > 1) {
                // Hitung total gabungan
                let totalCombined = 0;
                principalCodes.forEach(principalCode => {
                    totalCombined += totalPerPrincipal.get(principalCode) || 0;
                });
                
                // Jika total gabungan >= min_purchase_amount, tier qualify
                // Discount diterapkan ke SEMUA principals di array
                if (totalCombined >= minPurchase) {
                    principalCodes.forEach(principalCode => {
                        const currentDiscount = bestDiscountPerPrincipal.get(principalCode) || 0;
                        // Use the higher discount
                        if (tierDiscount > currentDiscount) {
                            bestDiscountPerPrincipal.set(principalCode, tierDiscount);
                        }
                    });
                }
            } else {
                // Single principal: hitung per principal
                const principalCode = principalCodes[0];
                const totalPurchase = totalPerPrincipal.get(principalCode) || 0;
                
                if (totalPurchase >= minPurchase) {
                    // This tier qualifies - check if it's better than existing
                    const currentDiscount = bestDiscountPerPrincipal.get(principalCode) || 0;
                    
                    // Use the higher discount
                    if (tierDiscount > currentDiscount) {
                        bestDiscountPerPrincipal.set(principalCode, tierDiscount);
                    }
                }
            }
        });
    });
    
    return bestDiscountPerPrincipal;
}

/**
 * Calculate group promo (strata) discount
 * @param {Map} cart - Cart items
 * @param {Map} productDataMap - Product data map
 * @param {Map} productGroupMap - Map product code -> { code, name }
 * @param {Array} groupPromos - Array of group promo headers
 * @param {Array} groupPromoTiers - Array of group promo tiers
 * @param {Array} promoAvailabilityRules - Array of promo availability rules
 * @param {string} storeType - Store type ('grosir' or 'retail')
 * @param {string} userZona - User's zona
 * @param {string} userRegion - User's region
 * @param {string} userDepo - User's depo
 * @param {Function} isPromoAvailable - Function to check if promo is available
 * @returns {number} Total group promo discount amount
 */
export function calculateGroupPromoDiscount(
    cart,
    productDataMap,
    productGroupMap,
    groupPromos,
    groupPromoTiers,
    promoAvailabilityRules,
    productGroupAvailabilityRules,
    isProductGroupAvailable,
    storeType,
    userZona,
    userRegion,
    userDepo,
    isPromoAvailable
) {
    if (!cart || cart.size === 0 || !groupPromos || groupPromos.length === 0 || !groupPromoTiers || groupPromoTiers.length === 0) {
        return 0;
    }

    // Debug logging untuk group promos
    console.log(`🔍 calculateGroupPromoDiscount: Total group promos loaded: ${groupPromos?.length || 0}`);
    if (groupPromos && groupPromos.length > 0) {
        const sipPromos = groupPromos.filter(p => 
            p.product_group_code && (p.product_group_code === 'SIP-E01K' || p.product_group_code.toLowerCase() === 'sip-e01k')
        );
        if (sipPromos.length > 0) {
            console.log(`  ✅ Found ${sipPromos.length} promo(s) for SIP-E01K:`, sipPromos.map(p => ({
                promo_id: p.promo_id,
                product_group_code: p.product_group_code,
                description: p.description
            })));
        } else {
            console.log(`  ❌ No promo found for SIP-E01K in loaded promos`);
            console.log(`  - All loaded promos:`, groupPromos.map(p => ({
                promo_id: p.promo_id,
                product_group_code: p.product_group_code
            })));
        }
    }

    // 1. Filter available group promos
    const availablePromos = groupPromos.filter(promo => {
        return isPromoAvailable(
            promo.promo_id,
            'strata',
            promoAvailabilityRules,
            storeType,
            userZona,
            userRegion,
            userDepo
        );
    });

    console.log(`  - Available promos after filtering: ${availablePromos.length}`);
    if (availablePromos.length > 0) {
        const sipAvailablePromos = availablePromos.filter(p => 
            p.product_group_code && (p.product_group_code === 'SIP-E01K' || p.product_group_code.toLowerCase() === 'sip-e01k')
        );
        if (sipAvailablePromos.length > 0) {
            console.log(`  ✅ Found ${sipAvailablePromos.length} available promo(s) for SIP-E01K`);
        } else {
            console.log(`  ❌ No available promo for SIP-E01K after filtering`);
        }
    }

    if (availablePromos.length === 0) {
        return 0;
    }

    // 2. Group cart items by product_group_code
    const itemsByGroup = new Map(); // group_code -> [{ productId, item, product }]

    cart.forEach((item, productId) => {
        const product = productDataMap.get(productId);
        if (!product) return;

        // Get product group from productGroupMap
        const groupInfo = productGroupMap.get(productId);
        if (!groupInfo || !groupInfo.code) return;

        const groupCode = groupInfo.code;

        if (!itemsByGroup.has(groupCode)) {
            itemsByGroup.set(groupCode, []);
        }

        itemsByGroup.get(groupCode).push({
            productId,
            item,
            product
        });
    });

    // 3. For each product group, find applicable promo and calculate discount
    let totalGroupPromoDiscount = 0;
    const groupPromoDiscountByGroup = new Map(); // groupCode -> discountAmount

    itemsByGroup.forEach((items, groupCode) => {
        // Debug logging untuk group SIP-E01K
        if (groupCode === 'SIP-E01K' || groupCode === 'sip-e01k') {
            console.log(`🔍 Checking group promo for group: ${groupCode}`);
            console.log(`  - Total available promos: ${availablePromos.length}`);
            console.log(`  - Available promos:`, availablePromos.map(p => ({ promo_id: p.promo_id, product_group_code: p.product_group_code })));
        }
        
        // Check if this product group is available for the user
        if (isProductGroupAvailable && productGroupAvailabilityRules) {
            const isAvailable = isProductGroupAvailable(
                groupCode,
                productGroupAvailabilityRules,
                userZona,
                userRegion,
                userDepo
            );
            if (groupCode === 'SIP-E01K' || groupCode === 'sip-e01k') {
                console.log(`  - Group availability check: ${isAvailable} (zona: ${userZona}, region: ${userRegion}, depo: ${userDepo})`);
            }
            if (!isAvailable) {
                if (groupCode === 'SIP-E01K' || groupCode === 'sip-e01k') {
                    console.log(`  ❌ Group ${groupCode} is NOT available for this user - skipping discount`);
                }
                return; // Group not available for this user
            }
        }
        
        // Find promos for this group (case-insensitive comparison)
        const promosForGroup = availablePromos.filter(promo => {
            const promoGroupCode = (promo.product_group_code || '').toUpperCase().trim();
            const targetGroupCode = (groupCode || '').toUpperCase().trim();
            return promoGroupCode === targetGroupCode;
        });

        if (groupCode === 'SIP-E01K' || groupCode === 'sip-e01k') {
            console.log(`  - Promos found for group ${groupCode}: ${promosForGroup.length}`);
            if (promosForGroup.length > 0) {
                console.log(`  - Promo details:`, promosForGroup.map(p => ({ promo_id: p.promo_id, product_group_code: p.product_group_code })));
            } else {
                console.log(`  ❌ No promo found for group ${groupCode} - checking all promos:`, availablePromos.map(p => p.product_group_code));
            }
        }

        if (promosForGroup.length === 0) {
            return; // No promo for this group
        }

        // For each promo, find the best tier and calculate discount
        // IMPORTANT: Jika ada multiple promos untuk group yang sama, hanya gunakan promo dengan discount terbesar
        // (bukan dijumlahkan, karena itu akan double-count)
        let bestPromoDiscount = 0;
        let bestPromoTier = null;
        let bestPromo = null;
        
        promosForGroup.forEach(promo => {
            // Get tiers for this promo
            const tiers = groupPromoTiers
                .filter(tier => tier.promo_id === promo.promo_id)
                .sort((a, b) => {
                    // Sort by min_qty descending (highest first) to find best tier
                    const minA = parseFloat(a.min_qty) || 0;
                    const minB = parseFloat(b.min_qty) || 0;
                    return minB - minA;
                });

            if (tiers.length === 0) {
                return; // No tiers for this promo
            }

            // Calculate total quantity for this group based on tier_unit
            let totalQty = 0;
            const tierUnit = promo.tier_unit || 'unit_1';

            items.forEach(({ item, product }) => {
                const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || item.qtyKarton || 0;
                const qtyBox = item.quantities?.box || item.quantities?.unit_2 || item.qtyBox || 0;
                const ratio = product.ratio_unit_2_per_unit_1 || 1;

                if (tierUnit === 'unit_1') {
                    // Count in unit_1 (karton) - INCLUDE fractional cartons from boxes
                    // Example: 0 krt + 6 box (ratio 12) = 0.5 krt
                    const fractionalKrt = ratio > 0 ? (qtyBox / ratio) : 0;
                    totalQty += qtyKrt + fractionalKrt;
                } else if (tierUnit === 'unit_2') {
                    // Count in unit_2 (box) - include boxes from karton conversion
                    const totalBoxes = (qtyKrt * ratio) + qtyBox;
                    totalQty += totalBoxes;
                } else if (tierUnit === 'unit_3') {
                    // Count in unit_3 (pcs) - convert from box
                    // Assuming 1 box = 1 pcs for now (adjust if needed)
                    // Include boxes from karton conversion
                    const totalBoxes = (qtyKrt * ratio) + qtyBox;
                    totalQty += totalBoxes;
                } else {
                    // Default: count in unit_1 (with fractional support)
                    const fractionalKrt = ratio > 0 ? (qtyBox / ratio) : 0;
                    totalQty += qtyKrt + fractionalKrt;
                }
            });

            // Find the correct tier based on range (min_qty sd < min_qty tier berikutnya dalam urutan)
            // Sort tiers by min_qty ascending first
            const sortedTiers = [...tiers].sort((a, b) => {
                const minA = parseFloat(a.min_qty) || 0;
                const minB = parseFloat(b.min_qty) || 0;
                return minA - minB; // Ascending
            });

            let bestTier = null;
            
            // Find tier where: min_qty <= totalQty < min_qty_tier_berikutnya (dalam urutan)
            // Example: tiers 0.5, 1, 2 → tier 0.5 berlaku untuk 0.5 sd < 1
            // Example: tiers 0.5, 2 → tier 0.5 berlaku untuk 0.5 sd < 2
            // SPECIAL CASE: Jika tier dengan min_qty < 1 (e.g., 0.5), dan ada tier berikutnya dengan min_qty = 1,
            //               maka tier 0.5 berlaku sampai sebelum tier berikutnya yang min_qty > 1
            //               (skip tier dengan min_qty = 1 jika tier sebelumnya adalah < 1)
            for (let i = 0; i < sortedTiers.length; i++) {
                const tier = sortedTiers[i];
                const minQty = parseFloat(tier.min_qty) || 0;
                
                // Find next tier in sequence yang min_qty > 1 (skip tier dengan min_qty = 1 jika tier ini < 1)
                let nextTier = null;
                let nextMinQty = Infinity;
                
                if (minQty < 1) {
                    // Untuk tier < 1, cari tier berikutnya yang min_qty > 1 (skip tier dengan min_qty = 1)
                    for (let j = i + 1; j < sortedTiers.length; j++) {
                        const candidateTier = sortedTiers[j];
                        const candidateMinQty = parseFloat(candidateTier.min_qty) || 0;
                        if (candidateMinQty > 1) {
                            nextTier = candidateTier;
                            nextMinQty = candidateMinQty;
                            break;
                        }
                    }
                    // Jika tidak ada tier dengan min_qty > 1, gunakan Infinity
                    if (!nextTier) {
                        nextMinQty = Infinity;
                    }
                } else {
                    // Untuk tier >= 1, gunakan logic normal
                    nextTier = sortedTiers[i + 1];
                    nextMinQty = nextTier ? parseFloat(nextTier.min_qty) || Infinity : Infinity;
                }
                
                // Check if totalQty falls within this tier's range
                // Range: min_qty <= totalQty < min_qty_tier_berikutnya
                if (totalQty >= minQty && totalQty < nextMinQty) {
                    bestTier = tier;
                    break;
                }
            }

            if (!bestTier) {
                return; // No tier qualifies
            }

            // Check tier_mode requirements
            const tierMode = promo.tier_mode || 'non mix';
            
            if (tierMode === 'mix') {
                // For mix mode, need to check variant_count
                const requiredVariants = bestTier.variant_count;
                if (requiredVariants && requiredVariants > 0) {
                    // Count unique products (variants) in this group
                    const uniqueProducts = new Set(items.map(({ productId }) => productId));
                    const variantCount = uniqueProducts.size;

                    if (variantCount < requiredVariants) {
                        return; // Not enough variants
                    }
                }
            }

            // Calculate discount based on tier rules:
            // - Tier min_qty < 1 (e.g., 0.5): discount FIXED (bukan per unit)
            //   Example: tier 0.5 krt, potongan 2300 (fixed)
            //   Jika beli 0.5 krt → 2300
            //   Jika beli 0.8 krt → 2300
            //   Jika beli 1.5 krt → 2300 (masih dalam range tier 0.5)
            // - Tier min_qty >= 1: discount per krt utuh (floor)
            //   Example: tier 1 krt, potongan 2300 per krt
            //   Jika beli 1.5 krt → floor(1.5) = 1 krt → 2300 * 1 = 2300
            //   Jika beli 3.8 krt di tier 2 krt → floor(3.8) = 3 krt → 2750 * 3 = 8250
            const discountPerUnit = parseFloat(bestTier.discount_per_unit) || 0;
            const minQty = parseFloat(bestTier.min_qty) || 1;
            
            let discountAmount = 0;
            
            if (minQty < 1) {
                // Tier dengan min_qty < 1 (e.g., 0.5): potongan FIXED (bukan per unit)
                // Example: tier 0.5 krt, potongan 2300 (fixed)
                // Berapa pun quantity-nya (selama masih dalam range tier 0.5), potongan tetap 2300
                discountAmount = discountPerUnit;
            } else {
                // Tier dengan min_qty >= 1: potongan per krt utuh (floor)
                // Example: tier 1 krt, potongan 2300 per krt
                // Jika beli 1.5 krt → floor(1.5) = 1 krt → 2300 * 1 = 2300
                // Jika beli 3.8 krt di tier 2 krt → floor(3.8) = 3 krt → 2750 * 3 = 8250
                const wholeKrt = Math.floor(totalQty);
                discountAmount = discountPerUnit * wholeKrt;
            }
            
            // Track discount untuk memilih promo terbaik (jika ada multiple promos)
            if (discountAmount > bestPromoDiscount) {
                bestPromoDiscount = discountAmount;
                bestPromoTier = bestTier;
                bestPromo = promo;
            }
        });
        
        // Hanya gunakan discount dari promo terbaik (jika ada)
        // IMPORTANT: Jangan dijumlahkan jika ada multiple promos, hanya gunakan yang terbaik
        if (bestPromoDiscount > 0) {
            // Store discount for this group (hanya dari promo terbaik)
            if (!groupPromoDiscountByGroup.has(groupCode)) {
                groupPromoDiscountByGroup.set(groupCode, 0);
            }
            // Set discount (bukan tambahkan, karena hanya 1 promo terbaik yang digunakan)
            groupPromoDiscountByGroup.set(groupCode, bestPromoDiscount);
            
            totalGroupPromoDiscount += bestPromoDiscount;
        }
    });

    // Return both total and per-group discounts
    return {
        total: totalGroupPromoDiscount,
        byGroup: groupPromoDiscountByGroup
    };
}

/**
 * Calculate bundle promo discount
 * @param {Map} cart - Cart items
 * @param {Map} productDataMap - Product data map
 * @param {Map} promoStructureMap - Map promo_id -> { description, buckets: Map<bucket_id, product_ids[]> }
 * @param {Array} bundlePromos - Array of bundle promo headers
 * @param {Array} bundlePromoGroups - Array of bundle promo groups (with total_quantity, unit per bucket)
 * @param {Array} promoAvailabilityRules - Array of promo availability rules
 * @param {string} storeType - Store type ('grosir' or 'retail')
 * @param {string} userZona - User's zona
 * @param {string} userRegion - User's region
 * @param {string} userDepo - User's depo
 * @param {Function} isPromoAvailable - Function to check if promo is available
 * @returns {number} Total bundle promo discount amount
 */
export function calculateBundlePromoDiscount(
    cart,
    productDataMap,
    promoStructureMap,
    bundlePromos,
    bundlePromoGroups,
    promoAvailabilityRules,
    storeType,
    userZona,
    userRegion,
    userDepo,
    isPromoAvailable
) {
    if (!cart || cart.size === 0 || !bundlePromos || bundlePromos.length === 0 || !promoStructureMap || promoStructureMap.size === 0) {
        return 0;
    }

    // 1. Filter available bundle promos
    const availablePromos = bundlePromos.filter(promo => {
        return isPromoAvailable(
            promo.promo_id,
            'bundling',
            promoAvailabilityRules,
            storeType,
            userZona,
            userRegion,
            userDepo
        );
    });

    if (availablePromos.length === 0) {
        return 0;
    }

    let totalBundlePromoDiscount = 0;
    const bundlePromoDiscountByPromo = new Map(); // promo_id -> discount amount

    // 2. For each available promo, calculate discount
    // Note: If a product belongs to multiple bundle promos, all applicable promos are counted
    // (as long as quantity is sufficient to form packages for each promo)
    availablePromos.forEach(promo => {
        const promoData = promoStructureMap.get(promo.promo_id);
        if (!promoData || !promoData.buckets) {
            return; // No buckets for this promo
        }

        // Get groups for this promo (to get total_quantity and unit per bucket)
        const groups = bundlePromoGroups.filter(g => g.promo_id === promo.promo_id);
        if (groups.length === 0) {
            return; // No groups defined
        }

        // 3. For each bucket, calculate how many packages can be formed
        const packagesPerBucket = [];

        groups.forEach(group => {
            const bucketId = group.bucket_id;
            const requiredQty = parseFloat(group.total_quantity) || 0;
            const unit = group.unit || 'unit_1';

            if (requiredQty <= 0) {
                return; // Invalid requirement
            }

            // Get products in this bucket
            const productsInBucket = promoData.buckets.get(bucketId) || [];
            if (productsInBucket.length === 0) {
                return; // No products in bucket
            }

            // Calculate total quantity of products in this bucket from cart
            let totalQtyInBucket = 0;

            productsInBucket.forEach(productId => {
                const cartItem = cart.get(productId);
                if (!cartItem) return;

                const product = productDataMap.get(productId);
                if (!product) return;

                const qtyKrt = cartItem.quantities?.krt || cartItem.quantities?.unit_1 || cartItem.qtyKarton || 0;
                const qtyBox = cartItem.quantities?.box || cartItem.quantities?.unit_2 || cartItem.qtyBox || 0;
                const ratio = product.ratio_unit_2_per_unit_1 || 1;

                if (unit === 'unit_1') {
                    // Count in unit_1 (karton) - include fractional
                    const fractionalKrt = ratio > 0 ? (qtyBox / ratio) : 0;
                    totalQtyInBucket += qtyKrt + fractionalKrt;
                } else if (unit === 'unit_2') {
                    // Count in unit_2 (box) - include boxes from karton conversion
                    const totalBoxes = (qtyKrt * ratio) + qtyBox;
                    totalQtyInBucket += totalBoxes;
                } else if (unit === 'unit_3') {
                    // Count in unit_3 (pcs) - convert from box
                    const totalBoxes = (qtyKrt * ratio) + qtyBox;
                    totalQtyInBucket += totalBoxes; // Assuming 1 box = 1 pcs
                } else {
                    // Default: unit_1
                    const fractionalKrt = ratio > 0 ? (qtyBox / ratio) : 0;
                    totalQtyInBucket += qtyKrt + fractionalKrt;
                }
            });

            // Calculate how many packages can be formed from this bucket
            // floor(totalQty / requiredQty)
            const packages = Math.floor(totalQtyInBucket / requiredQty);
            packagesPerBucket.push(packages);
        });

        if (packagesPerBucket.length === 0) {
            return; // No valid buckets
        }

        // 4. Number of complete packages = minimum of all buckets (all buckets must be satisfied)
        const completePackages = Math.min(...packagesPerBucket);

        if (completePackages <= 0) {
            return; // Cannot form any complete package
        }

        // 5. Apply max_packages limit if exists
        const maxPackages = promo.max_packages ? parseFloat(promo.max_packages) : null;
        const finalPackages = maxPackages ? Math.min(completePackages, maxPackages) : completePackages;

        // 6. Calculate discount: discount_per_package × number of packages
        const discountPerPackage = parseFloat(promo.discount_per_package) || 0;
        const discountAmount = discountPerPackage * finalPackages;

        totalBundlePromoDiscount += discountAmount;
        bundlePromoDiscountByPromo.set(promo.promo_id, discountAmount);
        
        console.log(`✅ Bundle promo ${promo.promo_id} applied: ${discountAmount} (${finalPackages} packages × ${discountPerPackage})`);
    });

    return {
        total: totalBundlePromoDiscount,
        byPromo: bundlePromoDiscountByPromo
    };
}

/**
 * Calculate invoice discount
 * @param {number} basePrice - Total base price (before any discounts) - used to check min_purchase_amount
 * @param {number} totalAfterOtherDiscounts - Total after principal, group promo, and bundle promo discounts - used to calculate discount
 * @param {Array} invoiceDiscounts - Array of invoice discount rules
 * @param {string} paymentMethod - Payment method ('COD' or 'CBD')
 * @returns {number} Invoice discount amount
 */
export function calculateInvoiceDiscount(
    basePrice,
    totalAfterOtherDiscounts,
    invoiceDiscounts,
    paymentMethod
) {
    if (!invoiceDiscounts || invoiceDiscounts.length === 0 || !paymentMethod) {
        return 0;
    }

    // Filter invoice discounts by payment method
    const applicableDiscounts = invoiceDiscounts.filter(discount => 
        discount.payment_method === paymentMethod
    );

    if (applicableDiscounts.length === 0) {
        return 0;
    }

    // Sort by min_purchase_amount descending (highest first) to find best discount
    const sortedDiscounts = [...applicableDiscounts].sort((a, b) => {
        const minA = parseFloat(a.min_purchase_amount) || 0;
        const minB = parseFloat(b.min_purchase_amount) || 0;
        return minB - minA; // Descending
    });

    // Find the best discount that meets min_purchase_amount requirement
    // NOTE: min_purchase_amount is checked against basePrice (before any discounts)
    let bestDiscount = null;
    for (const discount of sortedDiscounts) {
        const minPurchase = parseFloat(discount.min_purchase_amount) || 0;
        if (basePrice >= minPurchase) {
            bestDiscount = discount;
            break; // Use first (highest) discount that qualifies
        }
    }

    if (!bestDiscount) {
        return 0; // No discount qualifies
    }

    // Calculate discount amount: totalAfterOtherDiscounts × discount_percentage / 100
    // NOTE: Discount is calculated on totalAfterOtherDiscounts (after other discounts)
    // discount_percentage dalam format persentase (1 = 1%, 5 = 5%)
    const discountPercentage = parseFloat(bestDiscount.discount_percentage) || 0;
    const discountAmount = totalAfterOtherDiscounts * (discountPercentage / 100);

    return discountAmount;
}

/**
 * Calculate free product promo discount
 * Free product promo menggunakan skema diskon, bukan free product fisik
 * @param {Map} cart - Cart items
 * @param {Map} productDataMap - Product data map
 * @param {Map} productGroupMap - Map product code -> { code, name }
 * @param {Map} principalMap - Map product code -> principal code
 * @param {Array} freeProductPromos - Array of free product promo rules
 * @param {Array} freeProductPromoTiers - Array of free product promo tiers (for percentage with tiers)
 * @param {Array} promoAvailabilityRules - Array of promo availability rules
 * @param {string} storeType - Store type ('grosir' or 'retail')
 * @param {string} userZona - User's zona
 * @param {string} userRegion - User's region
 * @param {string} userDepo - User's depo
 * @param {Function} isPromoAvailable - Function to check if promo is available
 * @param {number} totalAfterOtherDiscounts - Total after principal, group, and bundle discounts
 * @returns {number} Total free product discount amount
 */
export function calculateFreeProductDiscount(
    cart,
    productDataMap,
    productGroupMap,
    principalMap,
    freeProductPromos,
    freeProductPromoTiers,
    promoAvailabilityRules,
    storeType,
    userZona,
    userRegion,
    userDepo,
    isPromoAvailable,
    totalAfterOtherDiscounts
) {
    // ========================================
    // 🎁 FREE PRODUCT PROMO CALCULATION START
    // ========================================
    console.log('%c🎁 FREE PRODUCT PROMO CALCULATION START', 'background: #ff6b6b; color: white; font-size: 14px; font-weight: bold; padding: 4px 8px;');
    console.log('Cart size:', cart?.size || 0);
    console.log('Free product promos count:', freeProductPromos?.length || 0);
    
    if (!cart || cart.size === 0) {
        console.warn('%c⚠️ CART IS EMPTY', 'background: #ffa500; color: white; font-weight: bold; padding: 2px 6px;');
        console.log('%c🎁 FREE PRODUCT PROMO CALCULATION END (EMPTY CART)', 'background: #ff6b6b; color: white; font-weight: bold; padding: 4px 8px;');
        console.log('');
        return 0;
    }
    
    if (!freeProductPromos || freeProductPromos.length === 0) {
        console.warn('%c⚠️ NO FREE PRODUCT PROMOS LOADED', 'background: #ffa500; color: white; font-weight: bold; padding: 2px 6px;');
        console.log('%c🎁 FREE PRODUCT PROMO CALCULATION END (NO PROMOS DATA)', 'background: #ff6b6b; color: white; font-weight: bold; padding: 4px 8px;');
        console.log('');
        return 0;
    }

    // 1. Filter available free product promos
    console.log(`%c🔍 FILTERING PROMOS BY AVAILABILITY`, 'background: #4dabf7; color: white; font-weight: bold; padding: 2px 6px;');
    console.log(`Store type: ${storeType} | Zona: ${userZona} | Region: ${userRegion} | Depo: ${userDepo}`);
    console.log(`Total promos: ${freeProductPromos.length}`);
    
    const availablePromos = freeProductPromos.filter(promo => {
        const isAvailable = isPromoAvailable(
            promo.promo_id,
            'free_product',
            promoAvailabilityRules,
            storeType,
            userZona,
            userRegion,
            userDepo
        );
        
        // Log each promo availability check
        const promoRules = promoAvailabilityRules.filter(rule => 
            rule.promo_id === promo.promo_id && rule.promo_type === 'free_product'
        );
        const storeTypeRules = promoRules.filter(rule => {
            if (rule.store_type === 'all') return true;
            return rule.store_type === storeType;
        });
        
        console.log(`  ${isAvailable ? '✅' : '❌'} Promo ${promo.promo_id}: ${isAvailable ? 'AVAILABLE' : 'NOT AVAILABLE'}`);
        if (promoRules.length > 0) {
            console.log(`    Rules: ${promoRules.length} total, ${storeTypeRules.length} match store_type '${storeType}'`);
            promoRules.forEach(rule => {
                console.log(`      - store_type: ${rule.store_type}, rule_type: ${rule.rule_type}, level: ${rule.level}`);
            });
        } else {
            console.log(`    ⚠️ No rules found - defaulting to available`);
        }
        
        return isAvailable;
    });

    if (availablePromos.length === 0) {
        console.warn('%c⚠️ NO AVAILABLE FREE PRODUCT PROMOS', 'background: #ffa500; color: white; font-weight: bold; padding: 2px 6px;');
        console.log('All promos:', freeProductPromos.map(p => p.promo_id));
        console.log('Store type:', storeType, '| Zona:', userZona, '| Region:', userRegion, '| Depo:', userDepo);
        console.log('%c🎁 FREE PRODUCT PROMO CALCULATION END (NO PROMOS)', 'background: #ff6b6b; color: white; font-weight: bold; padding: 4px 8px;');
        return {
            total: 0,
            byGroup: new Map()
        };
    }

    console.log(`%c✅ ${availablePromos.length} AVAILABLE PROMO(S)`, 'background: #51cf66; color: white; font-weight: bold; padding: 2px 6px;', availablePromos.map(p => p.promo_id));

    let totalFreeProductDiscount = 0;
    const freeProductDiscountByGroup = new Map(); // groupCode -> discountAmount
    const usedPromosByGroup = new Map(); // groupCode -> Set of promo_id (track which promos already used for each group)
    
    // Helper function untuk convert qty berdasarkan unit
    const convertQtyToBox = (qty, unit, ratio = 1) => {
        if (!unit || unit === 'unit_2' || unit === 'box' || unit === 'pcs') {
            return qty; // Already in box/pcs
        } else if (unit === 'unit_1' || unit === 'krt') {
            return qty * ratio; // Convert krt to box
        }
        return qty; // Default: assume already in box
    };
    
    // Helper function untuk mencari tier yang sesuai
    const findApplicableTier = (tiers, totalQty, unitMinQty, ratio) => {
        if (!tiers || tiers.length === 0) {
            return null;
        }
        
        // Sort tiers by priority (ascending) atau min_quantity (ascending)
        const sortedTiers = [...tiers].sort((a, b) => {
            // Sort by priority first, then by min_quantity
            if (a.priority !== b.priority) {
                return (a.priority || 0) - (b.priority || 0);
            }
            return (a.min_quantity || 0) - (b.min_quantity || 0);
        });
        
        // Find tier where: min_quantity <= totalQty <= max_quantity (atau max_quantity IS NULL)
        for (const tier of sortedTiers) {
            const tierMinQty = parseFloat(tier.min_quantity) || 0;
            const tierMaxQty = tier.max_quantity !== null && tier.max_quantity !== undefined 
                ? parseFloat(tier.max_quantity) 
                : null;
            
            // Convert tier min/max ke box jika perlu
            const tierMinQtyInBox = convertQtyToBox(tierMinQty, unitMinQty, ratio);
            const tierMaxQtyInBox = tierMaxQty !== null 
                ? convertQtyToBox(tierMaxQty, unitMinQty, ratio)
                : null;
            
            // Check if totalQty falls within this tier's range
            if (totalQty >= tierMinQtyInBox) {
                if (tierMaxQtyInBox === null || totalQty <= tierMaxQtyInBox) {
                    return tier; // Found applicable tier
                }
            }
        }
        
        // TIDAK ADA TIER YANG APPLICABLE: Return null (TIDAK ada fallback)
        return null;
    };
    
    // Helper function untuk mendapatkan discount percentage (HANYA dari tiers, TIDAK ada fallback)
    const getDiscountPercentage = (promo, tiers, totalQty, unitMinQty, ratio) => {
        if (promo.discount_type !== 'percentage') {
            return null; // Bukan percentage discount
        }
        
        // Cek apakah ada tiers untuk promo ini
        const promoTiers = tiers.filter(t => t.promo_id === promo.promo_id);
        
        if (promoTiers.length === 0) {
            // TIDAK ADA TIERS: Skip promo (tidak pakai discount_percentage dari header)
            if (window.DEBUG_FREE_PRODUCT) {
                console.warn(`  ⚠️ No tiers found for promo ${promo.promo_id}, skipping percentage discount`);
            }
            return null;
        }
        
        // PAKAI TIERS: Cari tier yang sesuai
        const applicableTier = findApplicableTier(promoTiers, totalQty, unitMinQty, ratio);
        
        if (applicableTier) {
            if (window.DEBUG_FREE_PRODUCT) {
                console.log(`  🎯 Using tier: ${applicableTier.min_quantity}-${applicableTier.max_quantity || '∞'}, discount: ${applicableTier.discount_percentage}%`);
            }
            return parseFloat(applicableTier.discount_percentage) || 0;
        } else {
            // TIDAK ADA TIER YANG APPLICABLE: Skip promo
            if (window.DEBUG_FREE_PRODUCT) {
                console.warn(`  ⚠️ No applicable tier found for promo ${promo.promo_id}, skipping`);
            }
            return null;
        }
    };

    // 2. For each available promo, calculate discount
    // Sort promos by priority if available (higher priority first)
    const sortedPromos = [...availablePromos].sort((a, b) => {
        const priorityA = a.priority || 0;
        const priorityB = b.priority || 0;
        return priorityB - priorityA; // Higher priority first
    });
    
    sortedPromos.forEach(promo => {
        const triggerType = promo.trigger_type || 'qty';
        const purchaseScope = promo.purchase_scope || 'total_invoice';
        const discountType = promo.discount_type || 'fixed';
        const freeQuantity = parseFloat(promo.free_quantity) || 0;

        if (freeQuantity <= 0) {
            return; // Invalid promo
        }

        let discountAmount = 0;
        let groupCodes = []; // Define at function scope level
        let matchedProducts = []; // Track matched products for this promo

        // 3. Calculate based on purchase_scope
        if (purchaseScope === 'group') {
            // Group-based: hitung qty dalam group tertentu
            // Handle group_codes: bisa array atau string (dari database bisa jadi string jika single value)
            if (Array.isArray(promo.group_codes)) {
                groupCodes = promo.group_codes;
            } else if (typeof promo.group_codes === 'string' && promo.group_codes.trim()) {
                // Parse string seperti "CSD-E02K-24" atau "{CSD-E02K-24}"
                const cleaned = promo.group_codes.trim().replace(/^\{|\}$/g, '');
                groupCodes = cleaned.split(',').map(g => g.trim()).filter(g => g);
            }
            
            if (groupCodes.length === 0) {
                console.warn(`⚠️ Free Product Promo ${promo.promo_id}: No groups specified`);
                return; // No groups specified
            }


            // Debug logging - always show for troubleshooting
            console.log(`%c🔍 PROMO: ${promo.promo_id}`, 'background: #4dabf7; color: white; font-weight: bold; padding: 2px 6px;', {
                purchaseScope,
                groupCodes: groupCodes.join(', '),
                triggerType,
                minQuantity: `${promo.min_quantity} ${promo.unit_min_quantity || 'box'}`,
                freeQuantity: `${freeQuantity} ${promo.unit_free_quantity || 'box'}`,
                discountType,
                discountPerUnit: promo.discount_per_unit ? `Rp ${promo.discount_per_unit.toLocaleString('id-ID')}` : 'N/A'
            });

            // Hitung total qty untuk semua groups
            let totalQtyInGroups = 0;
            matchedProducts = []; // Reset matched products for this promo (use function scope variable)
            let firstRatio = 1; // Untuk convert min_quantity jika unit_min_quantity = 'unit_1'
            
            groupCodes.forEach(groupCode => {
                cart.forEach((item, productId) => {
                    const groupInfo = productGroupMap.get(productId);
                    if (groupInfo && groupInfo.code === groupCode) {
                        const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || 0;
                        const qtyBox = item.quantities?.box || item.quantities?.unit_2 || 0;
                        const product = productDataMap.get(productId);
                        const ratio = product?.ratio_unit_2_per_unit_1 || 1;
                        if (firstRatio === 1 && ratio > 1) {
                            firstRatio = ratio; // Ambil ratio pertama untuk convert min_quantity
                        }
                        // Convert to unit_2 (box) for consistency
                        const totalBoxes = (qtyKrt * ratio) + qtyBox;
                        totalQtyInGroups += totalBoxes;
                        matchedProducts.push({
                            productId,
                            productName: product?.name,
                            groupCode: groupInfo.code,
                            qtyKrt,
                            qtyBox,
                            totalBoxes,
                            ratio
                        });
                    } else {
                        // Debug: log products that don't match
                        if (window.DEBUG_FREE_PRODUCT && cart.has(productId)) {
                            const productGroup = productGroupMap.get(productId);
                            if (!productGroup) {
                                console.log(`  ⚠️ Product ${productId} has no group mapping`);
                            } else if (productGroup.code !== groupCode) {
                                console.log(`  ⚠️ Product ${productId} is in group "${productGroup.code}", not "${groupCode}"`);
                            }
                        }
                    }
                });
            });
            
            // Debug: log if no products matched
            if (matchedProducts.length === 0 && window.DEBUG_FREE_PRODUCT) {
                console.warn(`  ⚠️ No products matched for groups: ${groupCodes.join(', ')}`);
                console.log(`  Cart size: ${cart.size}`);
                console.log(`  Product group map size: ${productGroupMap.size}`);
                // Show first few products in cart
                const cartProducts = Array.from(cart.keys()).slice(0, 5);
                cartProducts.forEach(productId => {
                    const groupInfo = productGroupMap.get(productId);
                    console.log(`    Product ${productId}: group = ${groupInfo ? groupInfo.code : 'NO GROUP'}`);
                });
            }
            
            if (matchedProducts.length === 0) {
                console.warn(`%c⚠️ NO PRODUCTS MATCHED`, 'background: #ffa500; color: white; font-weight: bold; padding: 2px 6px;', `for groups: ${groupCodes.join(', ')}`);
                console.log(`Cart products:`, Array.from(cart.keys()).slice(0, 5).map(id => {
                    const groupInfo = productGroupMap.get(id);
                    return `${id} → ${groupInfo ? groupInfo.code : 'NO GROUP'}`;
                }).join(', '));
            } else {
                console.log(`%c✅ ${matchedProducts.length} PRODUCT(S) MATCHED`, 'background: #51cf66; color: white; font-weight: bold; padding: 2px 6px;', matchedProducts.map(p => `${p.productId} (${p.totalBoxes} box)`).join(', '));
                console.log(`Total qty: ${totalQtyInGroups} box`);
            }

            // Check trigger
            if (triggerType === 'qty') {
                const minQty = parseFloat(promo.min_quantity) || 0;
                if (minQty <= 0) {
                    if (window.DEBUG_FREE_PRODUCT) {
                        console.warn(`  ⚠️ Invalid min_quantity: ${promo.min_quantity}`);
                    }
                    return; // Invalid min_quantity
                }
                
                // Convert min_quantity ke box jika unit_min_quantity = 'unit_1' (krt)
                const unitMinQty = promo.unit_min_quantity || 'unit_2'; // Default: unit_2 (box)
                const minQtyInBox = convertQtyToBox(minQty, unitMinQty, firstRatio);
                const triggerMet = totalQtyInGroups >= minQtyInBox;
                
                console.log(`%c${triggerMet ? '✅' : '❌'} TRIGGER: ${totalQtyInGroups} box ${triggerMet ? '>=' : '<'} ${minQtyInBox} box`, 
                    triggerMet ? 'background: #51cf66; color: white; font-weight: bold; padding: 2px 6px;' : 'background: #ff6b6b; color: white; font-weight: bold; padding: 2px 6px;');
                
                if (triggerMet) {
                    const multiples = Math.floor(totalQtyInGroups / minQtyInBox);
                    console.log(`Multiples: ${multiples}`);
                    
                    if (discountType === 'fixed') {
                        const discountPerUnit = parseFloat(promo.discount_per_unit) || 0;
                        
                        if (discountPerUnit <= 0) {
                            console.warn(`%c⚠️ INVALID discount_per_unit: ${promo.discount_per_unit}`, 'background: #ffa500; color: white; font-weight: bold; padding: 2px 6px;');
                            return; // Invalid discount_per_unit
                        }
                        
                        discountAmount = multiples * freeQuantity * discountPerUnit;
                        console.log(`%c💰 DISCOUNT: ${multiples} × ${freeQuantity} × Rp ${discountPerUnit.toLocaleString('id-ID')} = Rp ${discountAmount.toLocaleString('id-ID')}`, 
                            'background: #ffd43b; color: #000; font-weight: bold; padding: 2px 6px;');
                        
                        // NOTE: Discount per group tracking is done at the end (line 1404) to avoid double tracking
                    } else if (discountType === 'percentage') {
                        // Get discount percentage (HANYA dari tiers, TIDAK ada fallback)
                        const discountPercentage = getDiscountPercentage(
                            promo,
                            freeProductPromoTiers,
                            totalQtyInGroups,
                            promo.unit_min_quantity,
                            firstRatio
                        );
                        
                        // Jika tidak ada tiers atau tidak ada tier yang applicable, skip promo
                        if (discountPercentage === null) {
                            if (window.DEBUG_FREE_PRODUCT) {
                                console.warn(`  ⚠️ Skipping promo ${promo.promo_id}: no tiers or no applicable tier`);
                            }
                            return; // Skip promo ini
                        }
                        
                        // Hitung subtotal untuk groups ini
                        let subtotalForGroups = 0;
                        groupCodes.forEach(groupCode => {
                            cart.forEach((item, productId) => {
                                const groupInfo = productGroupMap.get(productId);
                                if (groupInfo && groupInfo.code === groupCode) {
                                    const product = productDataMap.get(productId);
                                    const basePrice = product?.prices?.[userZona] || 0;
                                    const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || 0;
                                    const qtyBox = item.quantities?.box || item.quantities?.unit_2 || 0;
                                    const ratio = product?.ratio_unit_2_per_unit_1 || 1;
                                    const pricePerBox = basePrice / ratio;
                                    subtotalForGroups += (qtyKrt * ratio + qtyBox) * pricePerBox;
                                }
                            });
                        });
                        discountAmount = subtotalForGroups * (discountPercentage / 100) * multiples;
                        if (window.DEBUG_FREE_PRODUCT) {
                            console.log(`  💰 Percentage discount: ${subtotalForGroups} × ${discountPercentage}% × ${multiples} = ${discountAmount}`);
                        }
                        
                        // NOTE: Discount per group tracking is done at the end (line 1404) to avoid double tracking
                    }
                }
            } else if (triggerType === 'nominal') {
                // Hitung subtotal untuk groups
                let subtotalForGroups = 0;
                groupCodes.forEach(groupCode => {
                    cart.forEach((item, productId) => {
                        const groupInfo = productGroupMap.get(productId);
                        if (groupInfo && groupInfo.code === groupCode) {
                            const product = productDataMap.get(productId);
                            const basePrice = product?.prices?.[userZona] || 0;
                            const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || 0;
                            const qtyBox = item.quantities?.box || item.quantities?.unit_2 || 0;
                            const ratio = product?.ratio_unit_2_per_unit_1 || 1;
                            const pricePerBox = basePrice / ratio;
                            subtotalForGroups += (qtyKrt * ratio + qtyBox) * pricePerBox;
                        }
                    });
                });

                const minPurchase = parseFloat(promo.min_purchase_amount) || 0;
                if (subtotalForGroups >= minPurchase) {
                    if (discountType === 'fixed') {
                        const discountPerUnit = parseFloat(promo.discount_per_unit) || 0;
                        discountAmount = freeQuantity * discountPerUnit;
                    } else if (discountType === 'percentage') {
                        const discountPercentage = parseFloat(promo.discount_percentage) || 0;
                        discountAmount = subtotalForGroups * (discountPercentage / 100);
                    }
                }
            }

        } else if (purchaseScope === 'total_invoice') {
            // Total invoice: check against totalAfterOtherDiscounts
            if (triggerType === 'nominal') {
                const minPurchase = parseFloat(promo.min_purchase_amount) || 0;
                if (totalAfterOtherDiscounts >= minPurchase) {
                    if (discountType === 'fixed') {
                        const discountPerUnit = parseFloat(promo.discount_per_unit) || 0;
                        discountAmount = freeQuantity * discountPerUnit;
                    } else if (discountType === 'percentage') {
                        // Untuk nominal trigger dengan percentage, skip jika tidak ada tiers
                        // (karena tiers biasanya berdasarkan quantity, bukan nominal)
                        if (window.DEBUG_FREE_PRODUCT) {
                            console.warn(`  ⚠️ Skipping promo ${promo.promo_id}: percentage discount with nominal trigger requires tiers`);
                        }
                        return; // Skip promo ini
                    }
                }
            } else if (triggerType === 'qty') {
                // Helper function untuk convert qty berdasarkan unit
                const convertQtyToBox = (qty, unit, ratio = 1) => {
                    if (!unit || unit === 'unit_2' || unit === 'box' || unit === 'pcs') {
                        return qty; // Already in box/pcs
                    } else if (unit === 'unit_1' || unit === 'krt') {
                        return qty * ratio; // Convert krt to box
                    }
                    return qty; // Default: assume already in box
                };
                
                // Hitung total qty dari cart (convert ke box)
                let totalQty = 0;
                let firstRatio = 1;
                cart.forEach((item, productId) => {
                    const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || 0;
                    const qtyBox = item.quantities?.box || item.quantities?.unit_2 || 0;
                    const product = productDataMap.get(productId);
                    const ratio = product?.ratio_unit_2_per_unit_1 || 1;
                    if (firstRatio === 1 && ratio > 1) {
                        firstRatio = ratio;
                    }
                    totalQty += (qtyKrt * ratio) + qtyBox;
                });

                const minQty = parseFloat(promo.min_quantity) || 0;
                // Convert min_quantity ke box jika unit_min_quantity = 'unit_1' (krt)
                const unitMinQty = promo.unit_min_quantity || 'unit_2'; // Default: unit_2 (box)
                const minQtyInBox = convertQtyToBox(minQty, unitMinQty, firstRatio);
                
                if (window.DEBUG_FREE_PRODUCT) {
                    console.log(`  📏 Unit conversion: min_quantity=${minQty} ${unitMinQty} = ${minQtyInBox} box`);
                }
                
                if (totalQty >= minQtyInBox) {
                    const multiples = Math.floor(totalQty / minQtyInBox);
                    if (window.DEBUG_FREE_PRODUCT) {
                        console.log(`  ✅ Trigger met: ${totalQty} box >= ${minQtyInBox} box, multiples: ${multiples}`);
                    }
                    if (discountType === 'fixed') {
                        const discountPerUnit = parseFloat(promo.discount_per_unit) || 0;
                        discountAmount = multiples * freeQuantity * discountPerUnit;
                    } else if (discountType === 'percentage') {
                        // Get discount percentage (HANYA dari tiers, TIDAK ada fallback)
                        const discountPercentage = getDiscountPercentage(
                            promo,
                            freeProductPromoTiers,
                            totalQty,
                            promo.unit_min_quantity,
                            firstRatio
                        );
                        
                        // Jika tidak ada tiers atau tidak ada tier yang applicable, skip promo
                        if (discountPercentage === null) {
                            if (window.DEBUG_FREE_PRODUCT) {
                                console.warn(`  ⚠️ Skipping promo ${promo.promo_id}: no tiers or no applicable tier`);
                            }
                            return; // Skip promo ini
                        }
                        
                        discountAmount = totalAfterOtherDiscounts * (discountPercentage / 100) * multiples;
                        if (window.DEBUG_FREE_PRODUCT) {
                            console.log(`  💰 Percentage discount: ${totalAfterOtherDiscounts} × ${discountPercentage}% × ${multiples} = ${discountAmount}`);
                        }
                    }
                }
            }
        } else if (purchaseScope === 'per_principal' || purchaseScope === 'combined_principal') {
            // Principal-based: hitung per principal atau gabungan
            const principalCodes = Array.isArray(promo.principal_codes) ? promo.principal_codes : [];
            if (principalCodes.length === 0) {
                return; // No principals specified
            }

            // Hitung total purchase untuk principal(s)
            let totalPurchaseForPrincipals = 0;
            let totalQtyForPrincipals = 0;

            cart.forEach((item, productId) => {
                const principalCode = principalMap.get(productId) || productDataMap.get(productId)?.principal_code || '';
                const normalizedPrincipalCode = String(principalCode).toUpperCase().trim();
                
                if (principalCodes.includes(normalizedPrincipalCode)) {
                    const product = productDataMap.get(productId);
                    const basePrice = product?.prices?.[userZona] || 0;
                    const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || 0;
                    const qtyBox = item.quantities?.box || item.quantities?.unit_2 || 0;
                    const ratio = product?.ratio_unit_2_per_unit_1 || 1;
                    const pricePerBox = basePrice / ratio;
                    
                    totalPurchaseForPrincipals += (qtyKrt * ratio + qtyBox) * pricePerBox;
                    totalQtyForPrincipals += (qtyKrt * ratio) + qtyBox;
                }
            });

            if (triggerType === 'nominal') {
                const minPurchase = parseFloat(promo.min_purchase_amount) || 0;
                if (totalPurchaseForPrincipals >= minPurchase) {
                    if (discountType === 'fixed') {
                        const discountPerUnit = parseFloat(promo.discount_per_unit) || 0;
                        discountAmount = freeQuantity * discountPerUnit;
                    } else if (discountType === 'percentage') {
                        // Untuk nominal trigger dengan percentage, skip jika tidak ada tiers
                        // (karena tiers biasanya berdasarkan quantity, bukan nominal)
                        if (window.DEBUG_FREE_PRODUCT) {
                            console.warn(`  ⚠️ Skipping promo ${promo.promo_id}: percentage discount with nominal trigger requires tiers`);
                        }
                        return; // Skip promo ini
                    }
                }
            } else if (triggerType === 'qty') {
                const minQty = parseFloat(promo.min_quantity) || 0;
                // Convert min_quantity ke box jika unit_min_quantity = 'unit_1' (krt)
                // Gunakan ratio dari produk pertama yang match
                let firstRatio = 1;
                cart.forEach((item, productId) => {
                    const principalCode = principalMap.get(productId) || productDataMap.get(productId)?.principal_code || '';
                    const normalizedPrincipalCode = String(principalCode).toUpperCase().trim();
                    if (principalCodes.includes(normalizedPrincipalCode)) {
                        const product = productDataMap.get(productId);
                        const ratio = product?.ratio_unit_2_per_unit_1 || 1;
                        if (firstRatio === 1 && ratio > 1) {
                            firstRatio = ratio;
                        }
                    }
                });
                const unitMinQty = promo.unit_min_quantity || 'unit_2'; // Default: unit_2 (box)
                const minQtyInBox = convertQtyToBox(minQty, unitMinQty, firstRatio);
                
                if (totalQtyForPrincipals >= minQtyInBox) {
                    const multiples = Math.floor(totalQtyForPrincipals / minQtyInBox);
                    if (discountType === 'fixed') {
                        const discountPerUnit = parseFloat(promo.discount_per_unit) || 0;
                        discountAmount = multiples * freeQuantity * discountPerUnit;
                    } else if (discountType === 'percentage') {
                        // Get discount percentage (HANYA dari tiers, TIDAK ada fallback)
                        const discountPercentage = getDiscountPercentage(
                            promo,
                            freeProductPromoTiers,
                            totalQtyForPrincipals,
                            promo.unit_min_quantity,
                            firstRatio
                        );
                        
                        // Jika tidak ada tiers atau tidak ada tier yang applicable, skip promo
                        if (discountPercentage === null) {
                            if (window.DEBUG_FREE_PRODUCT) {
                                console.warn(`  ⚠️ Skipping promo ${promo.promo_id}: no tiers or no applicable tier`);
                            }
                            return; // Skip promo ini
                        }
                        
                        discountAmount = totalPurchaseForPrincipals * (discountPercentage / 100) * multiples;
                        if (window.DEBUG_FREE_PRODUCT) {
                            console.log(`  💰 Percentage discount: ${totalPurchaseForPrincipals} × ${discountPercentage}% × ${multiples} = ${discountAmount}`);
                        }
                    }
                }
            }
        }

        if (discountAmount > 0) {
            console.log(`%c✅ FINAL DISCOUNT: Rp ${discountAmount.toLocaleString('id-ID')}`, 
                'background: #51cf66; color: white; font-weight: bold; padding: 2px 6px;', `for promo ${promo.promo_id}`);
            totalFreeProductDiscount += discountAmount;
            
            // Track discount per group (only for group-based promos)
            // Hanya track discount untuk group yang benar-benar ada produknya di cart
            if (purchaseScope === 'group' && groupCodes && groupCodes.length > 0) {
                // Get groups that actually have products in cart (from matchedProducts)
                const groupsWithProducts = new Set();
                if (matchedProducts && matchedProducts.length > 0) {
                    matchedProducts.forEach(p => {
                        if (p.groupCode) {
                            groupsWithProducts.add(p.groupCode);
                        }
                    });
                }
                
                // Only track discount for groups that have products
                const eligibleGroups = groupCodes.filter(gc => groupsWithProducts.has(gc));
                
                if (eligibleGroups.length > 0) {
                    eligibleGroups.forEach(groupCode => {
                        if (!freeProductDiscountByGroup.has(groupCode)) {
                            freeProductDiscountByGroup.set(groupCode, 0);
                        }
                        if (!usedPromosByGroup.has(groupCode)) {
                            usedPromosByGroup.set(groupCode, new Set());
                        }
                        
                        // Track that this promo is used for this group
                        usedPromosByGroup.get(groupCode).add(promo.promo_id);
                        
                        // If promo applies to multiple groups, divide discount equally among groups with products
                        const discountPerGroup = discountAmount / eligibleGroups.length;
                        const previousDiscount = freeProductDiscountByGroup.get(groupCode) || 0;
                        freeProductDiscountByGroup.set(groupCode, previousDiscount + discountPerGroup);
                        console.log(`  📊 Track discount for group ${groupCode}: ${discountPerGroup.toLocaleString('id-ID')} (total for group: ${(previousDiscount + discountPerGroup).toLocaleString('id-ID')})`);
                    });
                } else {
                    console.warn(`%c⚠️ SKIP TRACKING: No products in cart for groups: ${groupCodes.join(', ')}`, 
                        'background: #ffa500; color: white; font-weight: bold; padding: 2px 6px;');
                }
            }
        }
    });

    if (totalFreeProductDiscount > 0) {
        console.log(`%c🎁 TOTAL FREE PRODUCT DISCOUNT: Rp ${totalFreeProductDiscount.toLocaleString('id-ID')}`, 
            'background: #51cf66; color: white; font-size: 14px; font-weight: bold; padding: 4px 8px;');
    } else {
        console.warn(`%c⚠️ TOTAL FREE PRODUCT DISCOUNT = 0`, 
            'background: #ffa500; color: white; font-size: 14px; font-weight: bold; padding: 4px 8px;');
    }
    console.log('%c🎁 FREE PRODUCT PROMO CALCULATION END', 'background: #ff6b6b; color: white; font-size: 14px; font-weight: bold; padding: 4px 8px;');
    console.log(''); // Empty line for separation

    return {
        total: totalFreeProductDiscount,
        byGroup: freeProductDiscountByGroup
    };
}

/**
 * Calculate total with all discounts
 * @param {Object} params - Calculation parameters
 * @returns {Object} Calculation result
 */
export function calculateTotal({
    cart,
    productDataMap,
    principalMap,
    productGroupMap,
    promoStructureMap,
    principalDiscountTiers,
    groupPromos,
    groupPromoTiers,
    bundlePromos,
    bundlePromoGroups,
    invoiceDiscounts,
    freeProductPromos,
    freeProductPromoTiers = [],
    promoAvailabilityRules,
    productGroupAvailabilityRules,
    isProductGroupAvailable,
    storeType,
    userZona,
    userRegion,
    userDepo,
    paymentMethod,
    isPromoAvailable
}) {
    // Initialize result
    const result = {
        basePrice: 0,
        principalDiscount: 0,
        groupPromoDiscount: 0,
        bundlePromoDiscount: 0,
        freeProductDiscount: 0,
        invoiceDiscount: 0,
        totalNett: 0,
        items: []
    };
    
    if (!cart || cart.size === 0) {
        return result;
    }
    
    // 1. Calculate base price
    result.basePrice = calculateBasePrice(cart, productDataMap, userZona);
    // Pastikan basePrice adalah number valid (bukan NaN atau Infinity)
    result.basePrice = (isNaN(result.basePrice) || !isFinite(result.basePrice)) ? 0 : result.basePrice;
    
    // 2. Calculate principal discount rates per principal
    const principalDiscountRates = calculatePrincipalDiscount(
        cart,
        productDataMap,
        principalMap,
        principalDiscountTiers,
        promoAvailabilityRules,
        storeType,
        userZona,
        userRegion,
        userDepo,
        isPromoAvailable
    );
    
    // 3. Calculate principal discount amount per item and total
    let totalPrincipalDiscount = 0;
    
    cart.forEach((item, productId) => {
        const product = productDataMap.get(productId);
        if (!product) return;
        
        // Get principal code
        const principalCode = principalMap.get(productId) || product.principal_id || '';
        const principalKey = String(principalCode).toUpperCase().trim();
        
        // Get discount rate for this principal
        const discountRate = principalDiscountRates.get(principalKey) || 0;
        
        // Get base price
        const basePrice = product.prices?.[userZona] || 0;
        if (!basePrice) return;
        
        // Calculate quantities
        const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || item.qtyKarton || 0;
        const qtyBox = item.quantities?.box || item.quantities?.unit_2 || item.qtyBox || 0;
        const ratio = product.ratio_unit_2_per_unit_1 || 1;
        const qtyBoxTotal = (qtyKrt * ratio) + qtyBox;
        
        // Calculate price per box (base_price is per unit_1/karton)
        const pricePerBox = basePrice / ratio;
        
        // Calculate subtotal (INCLUDE PPN)
        const subtotal = qtyBoxTotal * pricePerBox;
        
        // Calculate discount amount (INCLUDE PPN)
        const discountAmount = subtotal * (discountRate / 100);
        totalPrincipalDiscount += discountAmount;
        
        // Add item to result
        result.items.push({
            productId,
            principalCode,
            discountRate,
            subtotal,
            discountAmount,
            subtotalAfterDiscount: subtotal - discountAmount
        });
    });
    
    result.principalDiscount = totalPrincipalDiscount;
    // Pastikan principalDiscount adalah number valid (bukan NaN atau Infinity)
    result.principalDiscount = (isNaN(result.principalDiscount) || !isFinite(result.principalDiscount)) ? 0 : result.principalDiscount;
    
    // 4. Calculate group promo (strata) discount
    const groupPromoResult = calculateGroupPromoDiscount(
        cart,
        productDataMap,
        productGroupMap,
        groupPromos,
        groupPromoTiers,
        promoAvailabilityRules,
        productGroupAvailabilityRules,
        isProductGroupAvailable,
        storeType,
        userZona,
        userRegion,
        userDepo,
        isPromoAvailable
    );
    // Pastikan groupPromoDiscount adalah number, bukan object
    if (typeof groupPromoResult === 'object' && groupPromoResult !== null) {
        result.groupPromoDiscount = typeof groupPromoResult.total === 'number' && !isNaN(groupPromoResult.total) ? groupPromoResult.total : 0;
        result.groupPromoDiscountByGroup = groupPromoResult.byGroup || new Map();
    } else {
        result.groupPromoDiscount = typeof groupPromoResult === 'number' && !isNaN(groupPromoResult) ? groupPromoResult : 0;
        result.groupPromoDiscountByGroup = new Map();
    }
    
    // Pastikan semua discount adalah number valid (bukan NaN atau Infinity)
    result.groupPromoDiscount = (isNaN(result.groupPromoDiscount) || !isFinite(result.groupPromoDiscount)) ? 0 : result.groupPromoDiscount;
    
    // 5. Calculate bundle promo discount
    const bundlePromoResult = calculateBundlePromoDiscount(
        cart,
        productDataMap,
        promoStructureMap,
        bundlePromos,
        bundlePromoGroups || [],
        promoAvailabilityRules,
        storeType,
        userZona,
        userRegion,
        userDepo,
        isPromoAvailable
    );
    
    // Handle return value (bisa object dengan total dan byPromo, atau number untuk backward compatibility)
    if (typeof bundlePromoResult === 'object' && bundlePromoResult !== null) {
        result.bundlePromoDiscount = typeof bundlePromoResult.total === 'number' && !isNaN(bundlePromoResult.total) ? bundlePromoResult.total : 0;
        result.bundlePromoDiscountByPromo = bundlePromoResult.byPromo || new Map();
    } else {
        result.bundlePromoDiscount = typeof bundlePromoResult === 'number' && !isNaN(bundlePromoResult) ? bundlePromoResult : 0;
        result.bundlePromoDiscountByPromo = new Map();
    }
    
    // Pastikan bundlePromoDiscount adalah number valid (bukan NaN atau Infinity)
    result.bundlePromoDiscount = (isNaN(result.bundlePromoDiscount) || !isFinite(result.bundlePromoDiscount)) ? 0 : result.bundlePromoDiscount;
    
    // Pastikan semua nilai di result adalah number valid sebelum perhitungan
    // Update result dengan nilai yang sudah divalidasi
    result.basePrice = (isNaN(result.basePrice) || !isFinite(result.basePrice)) ? 0 : result.basePrice;
    result.principalDiscount = (isNaN(result.principalDiscount) || !isFinite(result.principalDiscount)) ? 0 : result.principalDiscount;
    result.groupPromoDiscount = (isNaN(result.groupPromoDiscount) || !isFinite(result.groupPromoDiscount)) ? 0 : result.groupPromoDiscount;
    result.bundlePromoDiscount = (isNaN(result.bundlePromoDiscount) || !isFinite(result.bundlePromoDiscount)) ? 0 : result.bundlePromoDiscount;
    
    // Hitung totalAfterOtherDiscounts menggunakan nilai dari result (yang sudah divalidasi)
    const totalAfterOtherDiscounts = result.basePrice - result.principalDiscount - result.groupPromoDiscount - result.bundlePromoDiscount;
    
    // 6. Calculate free product discount
    // NOTE: Free product discount dihitung sebelum invoice discount
    const freeProductResult = calculateFreeProductDiscount(
        cart,
        productDataMap,
        productGroupMap,
        principalMap,
        freeProductPromos || [],
        freeProductPromoTiers || [],
        promoAvailabilityRules,
        storeType,
        userZona,
        userRegion,
        userDepo,
        isPromoAvailable,
        totalAfterOtherDiscounts
    );
    
    // Handle return value (bisa object atau number untuk backward compatibility)
    if (typeof freeProductResult === 'object' && freeProductResult !== null) {
        result.freeProductDiscount = freeProductResult.total || 0;
        result.freeProductDiscountByGroup = freeProductResult.byGroup || new Map();
    } else {
        result.freeProductDiscount = freeProductResult || 0;
        result.freeProductDiscountByGroup = new Map();
    }
    
    if (window.DEBUG_FREE_PRODUCT) {
        console.log('📊 Free product discount result:', result.freeProductDiscount);
        console.log('📊 Free product discount by group:', Array.from(result.freeProductDiscountByGroup.entries()));
    }
    
    // Pastikan freeProductDiscount adalah number valid
    result.freeProductDiscount = (isNaN(result.freeProductDiscount) || !isFinite(result.freeProductDiscount)) ? 0 : result.freeProductDiscount;
    
    // Hitung total setelah free product discount
    const totalAfterFreeProductDiscount = totalAfterOtherDiscounts - result.freeProductDiscount;
    
    // 7. Calculate invoice discount
    // NOTE: min_purchase_amount is checked against basePrice (before any discounts)
    //       but discount is calculated on totalAfterFreeProductDiscount (after free product discount)
    
    // Calculate invoice discount
    result.invoiceDiscount = calculateInvoiceDiscount(
        result.basePrice, // Use basePrice to check min_purchase_amount
        totalAfterOtherDiscounts, // Use totalAfterOtherDiscounts to calculate discount
        invoiceDiscounts || [],
        paymentMethod || 'COD'
    );
    
    // Pastikan invoiceDiscount adalah number valid
    result.invoiceDiscount = (isNaN(result.invoiceDiscount) || !isFinite(result.invoiceDiscount)) ? 0 : result.invoiceDiscount;
    
    // Calculate total nett: basePrice - principalDiscount - groupPromoDiscount - bundlePromoDiscount - freeProductDiscount - invoiceDiscount
    // Pastikan totalNett tidak negatif
    result.totalNett = Math.max(0, totalAfterFreeProductDiscount - result.invoiceDiscount);
    
    // Pastikan totalNett adalah number valid
    result.totalNett = (isNaN(result.totalNett) || !isFinite(result.totalNett)) ? 0 : result.totalNett;
    
    // Also add totalNettPrice for compatibility (same as totalNett)
    result.totalNettPrice = result.totalNett;
    
    // Also add totalBasePrice for compatibility
    result.totalBasePrice = result.basePrice;
    
    // Debug logging
    console.log('💰 calculateTotal result:', {
        basePrice: result.basePrice,
        principalDiscount: result.principalDiscount,
        groupPromoDiscount: result.groupPromoDiscount,
        bundlePromoDiscount: result.bundlePromoDiscount,
        invoiceDiscount: result.invoiceDiscount,
        totalNett: result.totalNett,
        totalNettPrice: result.totalNettPrice
    });
    
    return result;
}