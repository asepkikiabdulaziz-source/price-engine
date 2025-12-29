// ========================================================
// === HELPER FUNGSI UMUM & UTILITY
// ========================================================

/**
 * Memformat angka menjadi format Rupiah (IDR).
 * @param {number} n - Angka yang akan diformat.
 * @returns {string} - String format Rupiah.
 */
const fmtRp  = (n)=> new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0, maximumFractionDigits:0}).format(n||0);

/**
 * Mem-parsing string input numerik (mengatasi format Indonesia).
 * @param {string|number} s - Nilai input.
 * @returns {number} - Nilai float.
 */
const parseNumInput = (s) => parseFloat(String(s).replace(/\./g, '').replace(/,/g, '.')) || 0; 

/**
 * Memformat angka untuk tampilan input (pemisah ribuan).
 * @param {number} n - Angka yang akan diformat.
 * @returns {string} - String format angka.
 */
const fmtNumInput = (n) => new Intl.NumberFormat('id-ID',{minimumFractionDigits:0, maximumFractionDigits:0}).format(n||0);

/**
 * Mendeteksi apakah perangkat adalah mobile.
 * @returns {boolean}
 */
const isMobile = ()=> window.matchMedia('(max-width: 768px)').matches; 

/**
 * Helper untuk mencocokkan area (Zona, Region, Depo, Tipe, Principal, Group).
 * @param {string|string[]} promoAreaField - Nilai area dari data promo (bisa ALL, string, atau array).
 * @param {string|null} userAreaValue - Nilai area dari data user/input.
 * @returns {boolean} - True jika cocok, false jika tidak.
 */
function isAreaMatch(promoAreaField, userAreaValue) {
    // 1. Jika User/Simulasi-nya "ALL" atau Kosong, anggap match all (Super User)
    if (userAreaValue === 'ALL' || userAreaValue === 'all' || userAreaValue === "") {
        return true;
    }

    // 2. "ALL" di data promo selalu lolos
    if (!promoAreaField || String(promoAreaField).toUpperCase() === 'ALL') {
        return true; 
    }

    // 3. User value null/undefined dianggap tidak cocok
    if (userAreaValue === null || userAreaValue === undefined || userAreaValue === 'N/A') {
        return false;
    }
    
    const userValue = String(userAreaValue).trim().toUpperCase(); 
    
    // 4. Case: Array (e.g., ["DEPO A", "DEPO B"]) - Cek satu per satu
    if (Array.isArray(promoAreaField)) {
        return promoAreaField.map(s => String(s).trim().toUpperCase()).includes(userValue); 
    }
    
    // 5. Case: Comma-separated string (e.g., "DEPO A, DEPO B") - Pecah dulu baru cek
    if (typeof promoAreaField === 'string' && promoAreaField.includes(',')) {
         return promoAreaField.split(',').map(s => String(s).trim().toUpperCase()).includes(userValue);
    }

    // 6. Case: Single string equality (Exact Match)
    return String(promoAreaField).trim().toUpperCase() === userValue;
}

/**
 * [HELPER SKOR] Menentukan seberapa spesifik sebuah promo.
 * Depo (4) > Region (3) > Zona (2) > Type (1) > All (0)
 */
window.getPromoSpecificityScore = function(promo) {
    let score = 0;
    // Selama isi field BUKAN 'ALL' (misal: "Depo A" atau "Depo A, Depo B"), maka dianggap Spesifik.
    if (promo.depo && String(promo.depo).toUpperCase() !== 'ALL') score += 4;
    if (promo.region && String(promo.region).toUpperCase() !== 'ALL') score += 3;
    if (promo.zona && String(promo.zona).toUpperCase() !== 'ALL') score += 2;
    if (promo.type && String(promo.type).toUpperCase() !== 'ALL') score += 1;
    return score;
};

/**
 * [BARU] Helper untuk mendapatkan prioritas SKU
 * Mengambil data dari localStorage 'sku_priorities'
 * Format data: [{ sku: '123', priority: 1 }, ...]
 */
window.getSkuPriority = function(sku, group, context) {
    try {
        const storedPriorities = localStorage.getItem('sku_priorities');
        if (!storedPriorities) return 9999;

        const priorities = JSON.parse(storedPriorities); // Array of objects
        if (!Array.isArray(priorities)) return 9999;

        // Cari priority berdasarkan SKU
        const match = priorities.find(p => String(p.sku) === String(sku));
        
        // Jika ketemu, kembalikan angkanya. Jika tidak, return 9999 (urutan belakang)
        return match ? (parseInt(match.priority) || 9999) : 9999;
    } catch (e) {
        console.warn("Gagal parse sku_priorities", e);
        return 9999;
    }
};

/**
 * [KRITIKAL] Helper untuk menghitung pecahan karton
 * Dibutuhkan oleh app.js dan Strata logic.
 */
window.getQtyKartonRiil = function(qtyKarton, qtyBox, boxPerKrt) {
    const bpk = boxPerKrt || 12;
    if (bpk === 0) return 0;
    return parseFloat(qtyKarton || 0) + (parseFloat(qtyBox || 0) / bpk);
};

/**
 * [KRITIKAL] Helper untuk Filter Promo Strata berdasarkan Group, Area, dan Tanggal
 * Dibutuhkan oleh calculator.js (Baris 137).
 */
window.filterStrata = function(groupName, allPromos, context) {
    if (!allPromos || allPromos.length === 0) return [];
    
    const { selectedType, userRegion, userDepo, userZona } = context;
    
    // Set hari ini (jam 00:00) untuk cek tanggal
    const today = new Date();
    today.setHours(0,0,0,0);

    return allPromos.filter(p => {
        // 1. Cek Group
        if (p.group !== groupName) return false;

        // 2. Cek Area (Wajib Match) - Menggunakan fungsi isAreaMatch yang sudah ada di helpers.js
        if (!isAreaMatch(p.type, selectedType)) return false;
        if (!isAreaMatch(p.region, userRegion)) return false;
        if (!isAreaMatch(p.depo, userDepo)) return false;
        if (!isAreaMatch(p.zona, userZona)) return false;

        // 3. Cek Tanggal Efektif (Start Date)
        if (p.tgl_efektif) {
            const start = new Date(p.tgl_efektif);
            if (!isNaN(start) && today < start) return false; // Belum mulai
        }
        
        // 4. Cek Tanggal Berakhir (End Date)
        if (p.tgl_berakhir) {
            const end = new Date(p.tgl_berakhir);
            if (!isNaN(end) && today > end) return false; // Sudah lewat
        }
        
        return true;
    });
};


// Variabel Konstan yang bisa diakses global
window.CONSTANTS = {
    PPN_RATE: 0.11, 
    JUMLAH_GRUP_FOKUS: 5,
    CUSTOM_GROUP_ORDER: ["NEXTAR","NXT-E02K","NXC-E02K","WFR-E02K","WFR-E05K","CSD-E02K-24","CSD-E02K-12","WFR-SIP-500","WFR-E01K","TBK-E01K","TBK-E02K","ROL-E500","ROL-E01K", "SIP-KRIM","SIP-E01K","SIP-E02K","AHH-E500","AHH-E01K","PST-E500","NEXTAR KEMASAN LAMA","NXS-E02K","NNR-E01K","NXK-E02K","OTHERS", "MEIJI","SIMBA-E500","SIMBA-E01K","SIMBA-E02K","SIMBA 2IN1","SIMBA BULKY"],
};