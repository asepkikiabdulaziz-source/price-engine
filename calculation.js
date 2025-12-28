// calculation.js
const PPN_RATE = 0.11; // 11% PPN

// Helper function to format currency
const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0
    }).format(amount);
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
            
            // Check if minimum purchase is met for any of these principals
            principalCodes.forEach(principalCode => {
                const totalPurchase = totalPerPrincipal.get(principalCode) || 0;
                const minPurchase = parseFloat(tier.min_purchase_amount) || 0;
                
                if (totalPurchase >= minPurchase) {
                    // This tier qualifies - check if it's better than existing
                    const currentDiscount = bestDiscountPerPrincipal.get(principalCode) || 0;
                    const tierDiscount = parseFloat(tier.discount_percentage) || 0;
                    
                    // Use the higher discount (or first one if equal)
                    if (tierDiscount > currentDiscount) {
                        bestDiscountPerPrincipal.set(principalCode, tierDiscount);
                    }
                }
            });
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
    storeType,
    userZona,
    userRegion,
    userDepo,
    isPromoAvailable
) {
    if (!cart || cart.size === 0 || !groupPromos || groupPromos.length === 0 || !groupPromoTiers || groupPromoTiers.length === 0) {
        return 0;
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
        // Find promos for this group
        const promosForGroup = availablePromos.filter(promo => 
            promo.product_group_code === groupCode
        );

        if (promosForGroup.length === 0) {
            return; // No promo for this group
        }

        // For each promo, find the best tier and calculate discount
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
            for (let i = 0; i < sortedTiers.length; i++) {
                const tier = sortedTiers[i];
                const minQty = parseFloat(tier.min_qty) || 0;
                
                // Find next tier in sequence (not necessarily minQty + 1)
                const nextTier = sortedTiers[i + 1];
                const nextMinQty = nextTier ? parseFloat(nextTier.min_qty) || Infinity : Infinity;
                
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
            
            // Store discount for this group
            if (!groupPromoDiscountByGroup.has(groupCode)) {
                groupPromoDiscountByGroup.set(groupCode, 0);
            }
            groupPromoDiscountByGroup.set(groupCode, groupPromoDiscountByGroup.get(groupCode) + discountAmount);
            
            totalGroupPromoDiscount += discountAmount;
        });
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

    // 2. For each available promo, calculate discount
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
    });

    return totalBundlePromoDiscount;
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
    const discountPercentage = parseFloat(bestDiscount.discount_percentage) || 0;
    const discountAmount = totalAfterOtherDiscounts * (discountPercentage / 100);

    return discountAmount;
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
    promoAvailabilityRules,
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
    
    // 4. Calculate group promo (strata) discount
    const groupPromoResult = calculateGroupPromoDiscount(
        cart,
        productDataMap,
        productGroupMap,
        groupPromos,
        groupPromoTiers,
        promoAvailabilityRules,
        storeType,
        userZona,
        userRegion,
        userDepo,
        isPromoAvailable
    );
    result.groupPromoDiscount = groupPromoResult.total || groupPromoResult; // Backward compatibility
    result.groupPromoDiscountByGroup = groupPromoResult.byGroup || new Map(); // Per-group discounts
    
    // 5. Calculate bundle promo discount
    result.bundlePromoDiscount = calculateBundlePromoDiscount(
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
    
    // 6. Calculate invoice discount
    // NOTE: min_purchase_amount is checked against basePrice (before any discounts)
    //       but discount is calculated on totalAfterOtherDiscounts (after other discounts)
    const totalAfterOtherDiscounts = result.basePrice - result.principalDiscount - result.groupPromoDiscount - result.bundlePromoDiscount;
    result.invoiceDiscount = calculateInvoiceDiscount(
        result.basePrice, // Use basePrice to check min_purchase_amount
        totalAfterOtherDiscounts, // Use totalAfterOtherDiscounts to calculate discount
        invoiceDiscounts || [],
        paymentMethod || 'COD'
    );
    
    // TODO: Calculate free product discount
    // For now, calculate total nett with principal, group promo, bundle promo, and invoice discounts
    result.totalNett = totalAfterOtherDiscounts - result.invoiceDiscount;
    
    // Also add totalBasePrice for compatibility
    result.totalBasePrice = result.basePrice;
    
    return result;
}