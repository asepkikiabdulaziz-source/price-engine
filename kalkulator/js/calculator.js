// File: js/calculator.js
// ========================================================
// === LOGIKA PERHITUNGAN INTI (MODE: Strict Specificity)
// ========================================================

/**
 * Mencari data produk berdasarkan SKU dan kriteria Area.
 */
window.getProductDataBySkuAndArea = function(sku, userZone, userRegion, userDepo) {
    if (!userZone) return null;
    const allProducts = AppStore.getAllProducts();
    if (!allProducts || allProducts.length === 0) return null;
    return allProducts.find(p => {
        const productSku = String(p.sku || p.id);
        const skuMatch = productSku === String(sku);
        const zonaMatch = isAreaMatch(p.zona_harga, userZone);
        const regionMatch = isAreaMatch(p.region, userRegion);
        const depoMatch = isAreaMatch(p.depo, userDepo);
        return skuMatch && zonaMatch && regionMatch && depoMatch;
    });
};

/**
 * [REVISI FIX] Menghitung Diskon Reguler
 * Perbaikan:
 * 1. Konsistensi UPPERCASE untuk pencocokan Principal.
 * 2. Perbandingan Target Bruto menggunakan basis DPP (Exc PPN) vs DPP.
 * 3. Logika Strict Specificity (Depo > Region > ...).
 */
/**
 * [REVISI FINAL - DATA ASLI]
 * Logika:
 * 1. Loop Produk di Keranjang (Bukan Loop Promo).
 * 2. Ambil Nama Principal ASLI dari produk (item.product.principal).
 * 3. Cari Promo yang cocok untuk nama tersebut (pakai UpperCase cuma buat pencarian).
 * 4. Terapkan Filter Scope (Depo > Nasional).
 * 5. Return hasilnya menggunakan Nama Principal ASLI sebagai kunci.
 */
window.getRegulerDiscount = function(itemsInCart, context) {
    const allPromos = AppStore.getMasterPromo('reguler');
    if (allPromos.length === 0) return {};

    const { selectedType, userRegion, userDepo, userZona } = context;
    const PPN_RATE = window.CONSTANTS.PPN_RATE;

    // --- 1. HITUNG TOTAL BELANJA PER PRINCIPAL (NORMALIZED) ---
    const totalBrutoMap = new Map();

    itemsInCart.forEach(item => {
        if (!item.product) return;
        const key = String(item.product.principal || '').toUpperCase().trim();
        
        const hargaExcPpn = item.product.harga_inc_ppn / (1 + PPN_RATE);
        const hargaPerBoxExcPpn = hargaExcPpn / (item.product.box_per_krt || 12);
        const subtotal = item.qtyBoxTotal * hargaPerBoxExcPpn;

        totalBrutoMap.set(key, (totalBrutoMap.get(key) || 0) + subtotal);
    });

    // --- 2. PETAKAN PROMO & CARI MAX SCORE (PER PRINCIPAL) ---
    const promoCandidates = []; // Tampung dulu semua kandidat
    const maxScoreMap = new Map(); // Key: Principal -> Max Score

    allPromos.forEach(promo => {
        // Filter Area Dasar
        if (!isAreaMatch(promo.type, selectedType)) return;
        if (!isAreaMatch(promo.region, userRegion)) return;
        if (!isAreaMatch(promo.depo, userDepo)) return;
        if (!isAreaMatch(promo.zona, userZona)) return;

        const score = window.getPromoSpecificityScore(promo);
        
        // Normalisasi Principal List
        const principals = Array.isArray(promo.principal) 
            ? promo.principal.map(s => String(s).toUpperCase().trim())
            : String(promo.principal).split(',').map(s => s.trim().toUpperCase());

        // Simpan data
        promoCandidates.push({ promo, principals, score });

        // Update Max Score untuk setiap Principal yang terlibat
        principals.forEach(pKey => {
            const currentMax = maxScoreMap.get(pKey) || -1;
            if (score > currentMax) maxScoreMap.set(pKey, score);
        });
    });

    // --- 3. FILTER "KILL THE LOSER" & HITUNG TARGET ---
    // Kita simpan Rate Terbaik untuk setiap Principal (Upper Key)
    const bestRateMap = new Map();

    promoCandidates.forEach(c => {
        const { promo, principals, score } = c;

        // CEK SCOPE (Sangat Ketat)
        // Ambil salah satu principal untuk cek levelnya.
        // Jika level promo ini (misal 0) lebih rendah dari Max Level principal tersebut (misal 4),
        // MAKA PROMO INI DIBUANG. Tidak peduli targetnya nyampe atau tidak.
        const checkKey = principals[0];
        const winningScore = maxScoreMap.get(checkKey) || 0;

        if (score < winningScore) return; // BYE BYE NASIONAL!

        // HITUNG TARGET
        let totalCapaian = 0;
        principals.forEach(pKey => {
            totalCapaian += totalBrutoMap.get(pKey) || 0;
        });

        const requiredBruto = parseFloat(promo.nilai_bruto) || 0;
        const rate = parseFloat(promo.diskon) || 0;

        if (totalCapaian >= requiredBruto) {
            // Target Tercapai -> Simpan Rate
            principals.forEach(pKey => {
                const currentBest = bestRateMap.get(pKey) || 0;
                // Tie-Breaker: Jika ada 2 promo Depo (Duplikat), ambil terbesar
                if (rate > currentBest) {
                    bestRateMap.set(pKey, rate);
                }
            });
        }
    });

    // --- 4. SUSUN HASIL UNTUK CALCULATEORDERSUMMARY ---
    const finalDiscounts = {};

    itemsInCart.forEach(item => {
        if (!item.product) return;
        
        // AMBIL NAMA ASLI (Kunci Wajib)
        const itemPrincipalOriginal = item.product.principal; 
        if (!itemPrincipalOriginal) return;

        // Cari diskon pakai kunci Upper
        const searchKey = String(itemPrincipalOriginal).toUpperCase().trim();
        const rate = bestRateMap.get(searchKey);

        if (rate > 0) {
            // Assign ke Nama Asli
            finalDiscounts[itemPrincipalOriginal] = rate;
        }
    });

    return finalDiscounts;
};

// File: js/calculator.js

/**
 * [REVISI STRICT] Menghitung Diskon COD
 * Logika: 
 * 1. Filter promo yang TARGET BRUTO-nya tercapai.
 * 2. Pilih yang SKOR SPESIFISITAS-nya paling tinggi (Depo > Region > ...).
 * 3. Jika skor sama, ambil RATE tertinggi.
 */
window.getCODDiscount = function(totalBrutoTotal_DPP, context) {
    const allPromos = AppStore.getMasterPromo('cod');
    if (allPromos.length === 0) return 0;
    
    const { selectedType, userRegion, userDepo, userZona } = context;
    
    // 1. Filter Promo yang Berlaku di Area User
    const applicablePromos = allPromos.filter(promo =>
        isAreaMatch(promo.type, selectedType) &&
        isAreaMatch(promo.region, userRegion) &&
        isAreaMatch(promo.depo, userDepo) &&
        isAreaMatch(promo.zona, userZona)
    );

    // 2. Filter Promo yang Kualifikasi Target Brutonya TERCAPAI
    const qualifiedPromos = applicablePromos.filter(promo => {
        const brutoMin = parseFloat(promo.nilai_bruto) || 0; 
        return totalBrutoTotal_DPP >= brutoMin;
    });

    if (qualifiedPromos.length === 0) return 0;

    // 3. Adu Spesifisitas & Rate
    let bestPromo = null;
    let maxScore = -1;
    let maxRate = -1;

    for (const promo of qualifiedPromos) {
        // Hitung Skor (Depo=4, Region=3, Zona=2, Type=1, All=0)
        // Pastikan helper getPromoSpecificityScore() sudah ada di file calculator.js Anda
        const currentScore = getPromoSpecificityScore(promo);
        const currentRate = parseFloat(promo.diskon) || 0;

        if (currentScore > maxScore) {
            // Menang Spesifisitas -> MENANG MUTLAK
            maxScore = currentScore;
            maxRate = currentRate;
            bestPromo = promo;
        } else if (currentScore === maxScore) {
            // Spesifisitas Sama -> Adu Persentase Diskon
            if (currentRate > maxRate) {
                maxRate = currentRate;
                bestPromo = promo;
            }
        }
    }
    
    return bestPromo ? (parseFloat(bestPromo.diskon) || 0) : 0;
};

window.filterStrata = function(groupName, allPromosStrata, context) {
    if (!allPromosStrata || allPromosStrata.length === 0 || !context) return [];
    const today = new Date();
    const { selectedType, userRegion, userDepo, userZona } = context;
    const applicableStrata = allPromosStrata.filter(promo => {
        if (promo.group !== groupName) return false;
        if (!isAreaMatch(promo.type, selectedType)) return false;
        if (!isAreaMatch(promo.zona, userZona)) return false;
        if (!isAreaMatch(promo.region, userRegion)) return false;
        if (!isAreaMatch(promo.depo, userDepo)) return false;
        const tglEfektif = promo.tgl_efektif ? new Date(promo.tgl_efektif) : null;
        if (tglEfektif) { tglEfektif.setHours(0, 0, 0, 0); today.setHours(0, 0, 0, 0); if (tglEfektif.getTime() > today.getTime()) return false; }
        const tglBerakhir = promo.tgl_berakhir ? new Date(promo.tgl_berakhir) : null;
        if (tglBerakhir) { tglBerakhir.setHours(23, 59, 59, 999); today.setHours(0, 0, 0, 0); if (tglBerakhir.getTime() < today.getTime()) return false; }
        return true;
    });
    // Sort Ascending Qty
    applicableStrata.sort((a, b) => (parseFloat(a.qty_min)||0) - (parseFloat(b.qty_min)||0));
    return applicableStrata;
};

window.calculateGroupStats = function(groupName) {
    let totalQtyKrtGroupUtuh = 0; 
    let totalQtyKrtGroupRiil = 0; 
    let totalQtyBoxGroup = 0; 
    const skuInGroup = new Set(); 
    AppStore.getCart().forEach(cartItem => {
        if (cartItem.product && (cartItem.product.group || 'LAIN-LAIN') === groupName) {
            const itemBoxPerKrt = cartItem.product.box_per_krt || 12;
            const qtyBoxTotal = (cartItem.qtyKarton * itemBoxPerKrt) + cartItem.qtyBox;
            totalQtyKrtGroupUtuh += Math.floor(qtyBoxTotal / itemBoxPerKrt) || 0; 
            totalQtyKrtGroupRiil += (qtyBoxTotal / itemBoxPerKrt); 
            totalQtyBoxGroup += qtyBoxTotal || 0; 
            if (qtyBoxTotal > 0) skuInGroup.add(cartItem.sku);
        }
    });
    return { totalQtyKrtUtuh: totalQtyKrtGroupUtuh, totalQtyKrtGroupRiil: totalQtyKrtGroupRiil, totalQtyBoxGroup: totalQtyBoxGroup, totalSKUUnik: skuInGroup.size, skuInGroup: skuInGroup };
};

// HELPER SKOR
function getPromoSpecificityScore(promo) {
    let score = 0;
    if (promo.depo && promo.depo.toUpperCase() !== 'ALL') score += 4;   
    if (promo.region && promo.region.toUpperCase() !== 'ALL') score += 3;
    if (promo.zona && promo.zona.toUpperCase() !== 'ALL') score += 2;
    if (promo.type && promo.type.toUpperCase() !== 'ALL') score += 1;
    return score;
}

window.getStrataDiscount = function(item, allPromosStrata, context) {
    const groupName = item.product.group || 'LAIN-LAIN';
    
    // 1. Ambil Kandidat
    let candidates = window.filterStrata(groupName, allPromosStrata, context);
    if (candidates.length === 0) return 0;

    // 2. [BARU] Cari Skor Tertinggi di Group ini
    let maxScore = -1;
    candidates.forEach(p => {
        const s = window.getPromoSpecificityScore(p);
        if (s > maxScore) maxScore = s;
    });

    // 3. [BARU] Filter Scope: Buang yang kalah skor
    // Ini menjamin kita hanya menghitung berdasarkan aturan "Tuan Rumah"
    const validPromos = candidates.filter(p => window.getPromoSpecificityScore(p) === maxScore);

    if (validPromos.length === 0) return 0;

    // 4. Hitung Statistik & Cari Tier Terbaik
    const { totalQtyKrtUtuh, totalQtyKrtGroupRiil, totalQtyBoxGroup, totalSKUUnik } = window.calculateGroupStats(groupName);

    let bestPromo = null;
    let maxPotongan = -1;

    for (const promo of validPromos) {
        const qtyMin = parseFloat(promo.qty_min) || 0;
        const skuMin = parseFloat(promo.sku_min) || 1;
        const isMix = promo.mix === 'Y';
        const satuan = promo.satuan;
        const potongan = parseFloat(promo.potongan) || 0;

        if (totalSKUUnik < skuMin) continue;

        let qtyToCheck = (satuan === 'BOX') ? totalQtyBoxGroup : (isMix ? totalQtyKrtGroupRiil : totalQtyKrtUtuh);
        
        if (qtyToCheck >= qtyMin) {
            if (potongan > maxPotongan) {
                maxPotongan = potongan;
                bestPromo = promo;
            }
        }
    }
    
    // 5. Hitung Nominal (Sama seperti sebelumnya)
    if (bestPromo) {
        const isMixFinal = bestPromo.mix === 'Y';
        const nominalFinal = parseFloat(bestPromo.potongan) || 0;
        const boxPerKrt = item.product.box_per_krt || 12;

        if (bestPromo.satuan === 'BOX') {
            return nominalFinal * item.qtyBoxTotal; 
        } else {
            if (isMixFinal) {
                let payableGroupQty = totalQtyKrtGroupRiil;
                if (totalQtyKrtGroupRiil >= 1) payableGroupQty = Math.floor(totalQtyKrtGroupRiil); 
                const itemQtyRiil = (item.qtyKarton + (item.qtyBox / boxPerKrt));
                const share = (totalQtyKrtGroupRiil > 0) ? (itemQtyRiil / totalQtyKrtGroupRiil) : 0;
                return share * (payableGroupQty * nominalFinal);
            } else {
                const itemQtyUtuh = Math.floor(item.qtyKarton + (item.qtyBox / boxPerKrt));
                return itemQtyUtuh * nominalFinal;
            }
        }
    }
    return 0;
};
// [LOGIKA UPSELLING ANTI-PRANK]
window.getStrataUpsellingRecommendations = function(allPromosStrata, context) {
    const recommendations = new Map();
    const allProducts = AppStore.getAllProducts(); 
    const keranjang = AppStore.getCart(); 
    
    const allRelevantGroups = new Set();
    if (keranjang) keranjang.forEach(item => { if (item.product) allRelevantGroups.add(item.product.group || 'LAIN-LAIN'); });
    if (allProducts) allProducts.forEach(p => { if (window.filterStrata(p.group || 'LAIN-LAIN', allPromosStrata, context).length > 0) allRelevantGroups.add(p.group || 'LAIN-LAIN'); });

    allRelevantGroups.forEach(groupName => {
        const applicableStrata = window.filterStrata(groupName, allPromosStrata, context);
        if (applicableStrata.length === 0) return; 

        const stats = window.calculateGroupStats(groupName); 
        
        let maxPotonganSaatIni = 0;
        let maxScoreSaatIni = -1; // Default -1 (Skor terendah)
        let maxTier = null; 
        
        // Cari status promo saat ini dengan logika Strict Specificity
        for (const promo of applicableStrata) {
            const qtyMin = parseFloat(promo.qty_min) || 0;
            const skuMin = parseFloat(promo.sku_min) || 1;
            const potonganTier = parseFloat(promo.potongan) || 0;
            const isMix = promo.mix === 'Y';
            const satuan = promo.satuan;
            let qtyToCheck = (satuan === 'BOX') ? stats.totalQtyBoxGroup : (isMix ? stats.totalQtyKrtGroupRiil : stats.totalQtyKrtUtuh);

            if (stats.totalSKUUnik >= skuMin && qtyToCheck >= qtyMin) {
                const currentScore = getPromoSpecificityScore(promo);
                if (currentScore > maxScoreSaatIni) {
                    maxScoreSaatIni = currentScore;
                    maxPotonganSaatIni = potonganTier;
                    maxTier = promo;
                } else if (currentScore === maxScoreSaatIni) {
                    if (potonganTier > maxPotonganSaatIni) {
                        maxPotonganSaatIni = potonganTier;
                        maxTier = promo;
                    }
                }
            }
        }
        
        let nextTiersCandidates = [];
        for (const promo of applicableStrata) {
            const potonganTier = parseFloat(promo.potongan) || 0;
            const promoScore = getPromoSpecificityScore(promo);

            // [ANTI-PRANK LOGIC] 
            // Hanya tawarkan upsell jika DUIT LEBIH GEDE 
            // DAN Skor Area >= Skor Pemenang Saat Ini.
            // (Jadi Promo Nasional tidak akan ditawarkan ke orang yang kejebak Promo Region)
            if (potonganTier > maxPotonganSaatIni && promoScore >= maxScoreSaatIni) {
                const qtyMin = parseFloat(promo.qty_min) || 0;
                const skuMin = parseFloat(promo.sku_min) || 1;
                const isMix = promo.mix === 'Y';
                const satuan = promo.satuan;
                let qtyCurrent = (satuan === 'BOX') ? stats.totalQtyBoxGroup : (isMix ? stats.totalQtyKrtGroupRiil : stats.totalQtyKrtUtuh);
                
                const isQtyReached = qtyCurrent >= qtyMin;
                const isSkuReached = stats.totalSKUUnik >= skuMin;
                if (isQtyReached && isSkuReached) continue; 

                let gapQty = Math.max(0, qtyMin - qtyCurrent);
                let gapSku = Math.max(0, skuMin - stats.totalSKUUnik);
                
                if (gapQty > 0 || gapSku > 0) {
                     const isDuplicate = nextTiersCandidates.some(c => c.potongan === potonganTier && c.qtyMin === qtyMin && c.skuMin === skuMin);
                    if (!isDuplicate) {
                         nextTiersCandidates.push({
                            promo, potongan: potonganTier, qtyMin, skuMin,
                            gapQty, gapQtyCeil: gapQty > 0 ? Math.ceil(gapQty) : 0, 
                            gapSku, satuan, additionalPotongan: 0
                        });
                    }
                }
            }
        } 
        
        // Sorting dan seleksi rekomendasi (Standard)
        let finalRec = null; 
        let skuRec = null; 
        if (nextTiersCandidates.length > 0) {
             nextTiersCandidates.sort((a, b) => {
                 if (a.gapQty !== b.gapQty) return a.gapQty - b.gapQty;
                 return b.potongan - a.potongan;
             });
             finalRec = nextTiersCandidates[0]; 
             if (finalRec.gapQty === 0 && finalRec.gapSku > 0) {
                 const nextQtyOnly = nextTiersCandidates.find(c => c.gapQty > 0);
                 finalRec = nextQtyOnly ? nextQtyOnly : null;
             } else if (finalRec.gapQty === 0 && finalRec.gapSku === 0) finalRec = null; 
             
             const skuCandidates = nextTiersCandidates.filter(r => r.gapSku > 0);
             if (skuCandidates.length > 0) {
                 skuCandidates.sort((a, b) => {
                     if (a.gapSku !== b.gapSku) return a.gapSku - b.gapSku;
                     return b.potongan - a.potongan; 
                 });
                 skuRec = skuCandidates[0];
                 if (skuRec && skuRec.gapSku > 0) {
                     const skusInCart = stats.skuInGroup; 
                     const { userZona, userRegion, userDepo } = context;
                     const recommendedProducts = AppStore.getAllProducts()
                         .filter(p => (p.group || 'LAIN-LAIN') === groupName && !skusInCart.has(p.sku) && p.status === 'AKTIF' && isAreaMatch(p.zona_harga, userZona) && isAreaMatch(p.region, userRegion) && isAreaMatch(p.depo, userDepo))
                         .map(p => p.nama_sku).slice(0, 3); 
                     skuRec.suggestedProducts = recommendedProducts; 
                 }
             }
        }
        recommendations.set(groupName, { currentTier: maxTier, currentPotongan: maxPotonganSaatIni, stats, recs: { qty: finalRec, sku: skuRec } });
    });
    return recommendations;
};

// File: js/calculator.js

/**
 * [REVISI ANTI-PRANK] Upselling Reguler
 * Aturan:
 * 1. Hanya tawarkan jika Diskon LEBIH BESAR.
 * 2. Hanya tawarkan jika Skor Area SETARA atau LEBIH TINGGI (Depo > Region > ...).
 * (Mencegah tawaran Promo Nasional ke user yang terkunci Promo Region).
 */
// ========================================================
// [REVISI ANTI-PRANK] Upselling Reguler
// ========================================================
// Aturan:
// 1. Hanya tawarkan jika diskon LEBIH BESAR dari yang sedang aktif.
// 2. Target dan capaian dihitung di basis DPP (sama dengan getRegulerDiscount).
// 3. Untuk setiap principal, hanya pakai promo dengan SKOR AREA TERTINGGI
//    (Depo > Region > Zona > Type > ALL), supaya skema khusus depo
//    tidak dikalahkan skema ALL/Nasional.
// ========================================================
window.getRegulerUpsellingRecommendations = function(itemsInCart, context, finalApplicableDiscounts) {
    const allPromos = AppStore.getMasterPromo('reguler');
    if (!allPromos || allPromos.length === 0) return [];

    const { selectedType, userRegion, userDepo, userZona } = context;
    const PPN_RATE = window.CONSTANTS.PPN_RATE || 0;

    // ----------------------------------------------------
    // 1. Filter promo sesuai area user
    // ----------------------------------------------------
    const applicablePromos = allPromos.filter(promo =>
        isAreaMatch(promo.type,   selectedType) &&
        isAreaMatch(promo.region, userRegion)   &&
        isAreaMatch(promo.depo,   userDepo)     &&
        isAreaMatch(promo.zona,   userZona)
    );

    if (applicablePromos.length === 0) return [];

    // ----------------------------------------------------
    // 2. Hitung total bruto (DPP) per principal (UPPERCASE)
    //    -> rumus disamakan dengan getRegulerDiscount
    // ----------------------------------------------------
    const totalBrutoPerPrincipal = {}; // key: principal UPPERCASE

    itemsInCart.forEach(item => {
        if (!item.product) return;

        const principalName = item.product.principal || '';
        const key = String(principalName).toUpperCase().trim();

        const hargaIncPpn = item.product.harga_inc_ppn || 0;
        const boxPerKrt   = item.product.box_per_krt || 12;

        const hargaExcPpn        = hargaIncPpn / (1 + PPN_RATE);
        const hargaPerBoxExcPpn  = hargaExcPpn / boxPerKrt;
        const subtotalDPP        = item.qtyBoxTotal * hargaPerBoxExcPpn;

        totalBrutoPerPrincipal[key] = (totalBrutoPerPrincipal[key] || 0) + subtotalDPP;
    });

    // ----------------------------------------------------
    // 3. Tentukan skor area TERTINGGI per principal
    //    -> kalau di depo ini ada skema Depo, maka ALL untuk
    //       principal yang sama tidak dipakai lagi.
    // ----------------------------------------------------
    const maxScopePerPrincipal = {}; // key: principal UPPERCASE -> skor tertinggi

    applicablePromos.forEach(promo => {
        const raw = promo.principal;
        if (!raw) return;

        let principals;
        if (Array.isArray(raw)) {
            principals = raw;
        } else {
            principals = String(raw)
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
        }

        const score = window.getPromoSpecificityScore(promo);

        principals.forEach(p => {
            const k = String(p).toUpperCase().trim();
            const prev = maxScopePerPrincipal[k];
            if (prev == null || score > prev) {
                maxScopePerPrincipal[k] = score;
            }
        });
    });

    // ----------------------------------------------------
    // 4. Cari kandidat upsell
    //    - Hanya pakai promo dengan skor == skor tertinggi
    //    - Gap dihitung DPP (tanpa PPN)
    //    - Diskon harus lebih besar dari yang sedang aktif
    // ----------------------------------------------------
    const bestUpsellByPrincipal = new Map(); // key: label principal (join), value: {principal, gap, targetBruto, nextRate}

    applicablePromos.forEach(promo => {
        const raw = promo.principal;
        if (!raw) return;

        let principals;
        if (Array.isArray(raw)) {
            principals = raw;
        } else {
            principals = String(raw)
                .split(',')
                .map(s => s.trim())
                .filter(Boolean);
        }
        if (principals.length === 0) return;

        const requiredBruto = parseFloat(promo.nilai_bruto) || 0;
        const discountRate  = parseFloat(promo.diskon)      || 0;
        if (!requiredBruto || !discountRate) return;

        const promoScore = window.getPromoSpecificityScore(promo);

        // Pakai principal pertama sebagai anchor untuk:
        // - baca diskon yang sedang aktif,
        // - baca skor area pemenang.
        const firstPrincipalOriginal = principals[0];
        const firstKeyUpper = String(firstPrincipalOriginal).toUpperCase().trim();

        const allowedScopeScore = maxScopePerPrincipal[firstKeyUpper];
        if (allowedScopeScore == null) return;

        // Hanya pakai promo yang SKOR-nya == skor tertinggi untuk principal ini
        if (promoScore !== allowedScopeScore) return;

        // Hitung capaian DPP gabungan untuk semua principal di promo ini
        let totalBrutoActual = 0;
        principals.forEach(p => {
            const k = String(p).toUpperCase().trim();
            totalBrutoActual += totalBrutoPerPrincipal[k] || 0;
        });

        const gapDPP = requiredBruto - totalBrutoActual;
        if (gapDPP <= 0) {
            // Target sudah tercapai, tidak perlu upsell
            return;
        }

        // Diskon yang saat ini sudah aktif untuk principal ini
        const currentRate = finalApplicableDiscounts[firstPrincipalOriginal] || 0;
        if (!(discountRate > currentRate)) {
            // Tidak menawarkan diskon yang sama atau lebih kecil
            return;
        }

        const principalLabel = principals.join(', ');

        const candidate = {
            principal: principalLabel,
            gap: Math.ceil(gapDPP),       // dibulatkan ke atas biar aman
            targetBruto: requiredBruto,   // semuanya di DPP
            nextRate: discountRate
        };

        const existing = bestUpsellByPrincipal.get(principalLabel);
        if (!existing) {
            bestUpsellByPrincipal.set(principalLabel, candidate);
        } else {
            // Ambil yang gap-nya paling kecil,
            // kalau sama, ambil yang diskonnya lebih tinggi
            if (
                candidate.gap < existing.gap ||
                (candidate.gap === existing.gap && candidate.nextRate > existing.nextRate)
            ) {
                bestUpsellByPrincipal.set(principalLabel, candidate);
            }
        }
    });

    // ----------------------------------------------------
    // 5. Kembalikan sebagai array, urut dari gap terkecil
    // ----------------------------------------------------
    const result = Array.from(bestUpsellByPrincipal.values());
    result.sort((a, b) => a.gap - b.gap);
    return result;
};


// Helper kecil untuk parsing principal (taruh di paling bawah calculator.js jika belum ada)
function parsePrincipals(raw) {
    if (Array.isArray(raw)) return raw.map(s => String(s).toUpperCase().trim());
    if (typeof raw === 'string' && raw.includes(',')) return raw.split(',').map(s => s.toUpperCase().trim());
    return [String(raw).toUpperCase().trim()];
}
// File: js/calculator.js

/**
 * [REVISI ANTI-PRANK] Upselling COD
 * Hanya merekomendasikan target baru JIKA:
 * 1. Target Bruto belum tercapai (Gap > 0).
 * 2. Rate diskonnya LEBIH BESAR.
 * 3. Skor Spesifisitasnya SETARA atau LEBIH TINGGI dari promo saat ini.
 * (Jangan tawarkan Promo Nasional ke orang yang dikunci Promo Depo).
 */
window.getCODUpsellingRecommendations = function(totalBrutoTotal_DPP, context, currentRate) {
    const allPromos = AppStore.getMasterPromo('cod');
    if (allPromos.length === 0) return null;
    
    const { selectedType, userRegion, userDepo, userZona } = context;
    
    // 1. Filter Promo yang Berlaku di Area User
    const applicablePromos = allPromos.filter(promo =>
        isAreaMatch(promo.type, selectedType) &&
        isAreaMatch(promo.region, userRegion) &&
        isAreaMatch(promo.depo, userDepo) &&
        isAreaMatch(promo.zona, userZona)
    );

    if (applicablePromos.length === 0) return null;

    // 2. Cari Tahu Dulu: Skor Spesifisitas "Pemenang" Saat Ini
    // (Kita harus tahu user sedang "dikunci" di level apa: Depo/Region/Nasional?)
    let maxScoreSaatIni = -1;
    
    // Kita simulasi ulang sedikit logika pencarian pemenang untuk tahu skornya
    const qualifiedPromos = applicablePromos.filter(p => (parseFloat(p.nilai_bruto) || 0) <= totalBrutoTotal_DPP);
    
    for (const promo of qualifiedPromos) {
        const s = getPromoSpecificityScore(promo);
        const r = parseFloat(promo.diskon) || 0;
        
        if (s > maxScoreSaatIni) {
            maxScoreSaatIni = s;
        } else if (s === maxScoreSaatIni) {
            // Jika skor sama, rate pasti diambil yang terbesar di fungsi utama
            // Jadi maxScoreSaatIni valid
        }
    }
    // Jika belum dapat promo (currentRate 0), set skor ke -1 agar semua promo bisa masuk
    if (currentRate === 0) maxScoreSaatIni = -1;


    // 3. Cari Kandidat Upsell
    let bestCandidate = null;

    // Sort dulu berdasarkan Bruto Terkecil (Cari gap terdekat)
    applicablePromos.sort((a, b) => (parseFloat(a.nilai_bruto) || 0) - (parseFloat(b.nilai_bruto) || 0));

    for (const promo of applicablePromos) {
        const requiredBruto = parseFloat(promo.nilai_bruto) || 0; 
        const promoRate = parseFloat(promo.diskon) || 0; 
        const promoScore = getPromoSpecificityScore(promo);
        
        // Syarat Upsell Valid:
        // A. Bruto belum tercapai (Gap > 0)
        // B. Rate lebih bagus dari sekarang
        // C. [PENTING] Skor area harus >= Skor saat ini.
        //    (Kalau user di level 4/Depo, jangan tawari promo level 0/Nasional meskipun rate-nya gede, 
        //    karena sistem pasti akan menolaknya nanti).
        
        if (totalBrutoTotal_DPP < requiredBruto && promoRate > currentRate && promoScore >= maxScoreSaatIni) {
            return {
                gap: requiredBruto - totalBrutoTotal_DPP,
                targetBruto: requiredBruto,
                nextRate: promoRate
            };
        }
    }
    
    return null; 
};

window.calculateOrderSummary = function() {
    
    let nominalVoucher = 0;
    const voucherInputElement = document.getElementById('voucher-input');
    if (voucherInputElement) {
        nominalVoucher = parseNumInput(voucherInputElement.value);
    }
    
    const keranjang = AppStore.getCart();

    if (keranjang.size === 0) {
        return { 
            items: [], totalBruto_DPP: 0, totalPotonganReguler: 0, totalPotonganStrata: 0,
            totalNett: 0, totalPpn: 0, totalGross: 0, totalPotonganCOD: 0, finalGrandTotal: 0,
            discRateCOD: 0, totalGrossPreCod: 0, totalPotonganStrata_IncPPN: 0,
            nominalVoucher: 0, 
            regulerUpsells: [],
            codUpsell: null
        };
    }
    
    const PPN_RATE = window.CONSTANTS.PPN_RATE;
    const context = AppStore.getContext();
    const allPromosStrata = AppStore.getMasterPromo('strata');

    let summary = {
        items: [],
        totalBruto_DPP: 0,        
        totalPotonganReguler: 0,
        totalPotonganStrata: 0,
        totalPotonganStrata_IncPPN: 0,
        totalNett: 0,             
        totalPpn: 0,
        totalGross: 0,
        totalGrossPreCod: 0,
        totalPotonganCOD: 0, 
        finalGrandTotal: 0,
        discRateCOD: 0,
        nominalVoucher: nominalVoucher,
        regulerUpsells: [],
        codUpsell: null
    };
    
    let itemsForCalculation = Array.from(keranjang.values());
    
    let validItems = [];
    itemsForCalculation.forEach(item => {
        const productData = item.product; 
        if (!productData || (item.qtyKarton === 0 && item.qtyBox === 0)) {
            return; 
        }
        const bpk = productData.box_per_krt || 12; 
        item.qtyBoxTotal = (item.qtyKarton * bpk) + item.qtyBox;
        validItems.push(item);
    });
    itemsForCalculation = validItems;

    if (itemsForCalculation.length === 0) {
        return summary;
    }
    
    let tempBrutoDPP_ForDiscount = 0;
    itemsForCalculation.forEach(item => {
        const hargaExcPpn = item.product.harga_inc_ppn / (1 + PPN_RATE);
        const hargaPerBoxExcPpn = hargaExcPpn / (item.product.box_per_krt || 12);
        tempBrutoDPP_ForDiscount += (item.qtyBoxTotal * hargaPerBoxExcPpn * (1 + PPN_RATE));
    });

    const totalBrutoTotal_DPP = tempBrutoDPP_ForDiscount;
    
    const discRateCOD = window.getCODDiscount(totalBrutoTotal_DPP, context);
    const regulerDiscounts = window.getRegulerDiscount(itemsForCalculation, context);
    const regulerUpsells = window.getRegulerUpsellingRecommendations(itemsForCalculation, context, regulerDiscounts);
    const codUpsell = window.getCODUpsellingRecommendations(totalBrutoTotal_DPP, context, discRateCOD);

    summary.discRateCOD = discRateCOD; 
    summary.regulerUpsells = regulerUpsells;
    summary.codUpsell = codUpsell;
    
    itemsForCalculation.forEach(item => {
        const productData = item.product; 
        const boxPerKrt = productData.box_per_krt || 12;
        const hargaIncPpn = productData.harga_inc_ppn || 0; 
        const qtyBoxTotal = item.qtyBoxTotal; 
        const principal = productData.principal || 'N/A';
        const hargaDasarPerBox_DPP = (hargaIncPpn / (1 + PPN_RATE)) / boxPerKrt;
        const subtotalBruto_DPP = hargaDasarPerBox_DPP * qtyBoxTotal;
        
        const discRateReguler = regulerDiscounts[principal] || 0;
        const nominalDiskonReguler_DPP = subtotalBruto_DPP * discRateReguler;
        
        const nominalDiskonStrata_IncPPN = window.getStrataDiscount(item, allPromosStrata, context); 
        const nominalDiskonStrata_DPP = nominalDiskonStrata_IncPPN / (1 + PPN_RATE);

        const totalDiskonItem_DPP = nominalDiskonReguler_DPP + nominalDiskonStrata_DPP;
        const subtotalNett_DPP_PreCod = Math.max(0, subtotalBruto_DPP - totalDiskonItem_DPP);
        
        const ppnPreCod = subtotalNett_DPP_PreCod * PPN_RATE;
        const grossPreCod = subtotalNett_DPP_PreCod + ppnPreCod;
        
        summary.totalGrossPreCod += grossPreCod; 
        
        const nominalDiskonCod = grossPreCod * discRateCOD;
        const totalOnFaktur = grossPreCod - nominalDiskonCod; 
        const subtotalNett_DPP = totalOnFaktur / (1 + PPN_RATE);
        const ppnFinal = totalOnFaktur - subtotalNett_DPP;

        summary.items.push({
            ...item,
            nominalDiskonReguler: nominalDiskonReguler_DPP,
            nominalDiskonStrata: nominalDiskonStrata_DPP,
            nominalDiskonStrata_IncPPN: nominalDiskonStrata_IncPPN,
            nominalDiskonCod,
            discRateReguler, 
            subtotalNett: subtotalNett_DPP, 
            ppnFinal,
            totalOnFaktur, 
            totalDiskon: totalDiskonItem_DPP + nominalDiskonCod,
        });
        
        summary.totalBruto_DPP += subtotalBruto_DPP;
        summary.totalPotonganReguler += nominalDiskonReguler_DPP;
        summary.totalPotonganStrata += nominalDiskonStrata_DPP;
        summary.totalPotonganStrata_IncPPN += nominalDiskonStrata_IncPPN;
        summary.totalPotonganCOD += nominalDiskonCod;
        summary.totalNett += subtotalNett_DPP;
        summary.totalPpn += ppnFinal;
        summary.totalGross += totalOnFaktur;
    });
    
    summary.finalGrandTotal = summary.totalGross - nominalVoucher; 
    
    return summary;
};

window.getQtyKartonRiil = function(qtyKarton, qtyBox, boxPerKrt) {
    if (boxPerKrt <= 0) return 0;
    const totalBox = (qtyKarton * boxPerKrt) + qtyBox;
    return totalBox / boxPerKrt;
};