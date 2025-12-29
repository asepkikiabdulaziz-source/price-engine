// Nama file ini adalah app.js
// VERSI FINAL (GABUNGAN)
// - Fitur Super User (4 Panel, CENTRAL vs REGIONAL)
// - Logika AppStore (State Terpusat)
// - Logika Rendering Canggih (Tabel Promo Rapi & Terkelompok)
// - Perbaikan Bug (Modal, Urutan Load Produk, Ejaan)

// Deklarasi Global untuk objek Firebase utama (auth dan db)
window.auth = null;
window.db = null;

// [PERBAIKAN MODAL] Fungsi baru untuk menutup modal
function handleCloseModalOnly() {
    const roleDetailsModal = document.getElementById('role-details-modal');
    if(roleDetailsModal) roleDetailsModal.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {

    // ▼▼▼ [PERBAIKAN ERROR LAYAR PUTIH] ▼▼▼
    if (typeof window.CONSTANTS === 'undefined' || 
        typeof window.AppStore === 'undefined' || 
        typeof window.calculateOrderSummary === 'undefined') 
    {
        console.error("KRITIS: Satu atau lebih file dependency (helpers, store, calculator) gagal dimuat.");
        
        let missing = [];
        if (typeof window.CONSTANTS === 'undefined') missing.push("js/helpers.js");
        if (typeof window.AppStore === 'undefined') missing.push("js/store.js");
        if (typeof window.calculateOrderSummary === 'undefined') missing.push("js/calculator.js");

        document.body.innerHTML = `<div style="padding: 20px; text-align: center; font-family: sans-serif;">
                                    <h2>Error Kritis: Gagal Memuat Dependensi</h2>
                                    <p>Aplikasi tidak dapat berjalan karena file berikut gagal dimuat:</p>
                                    <p style="color: red; font-weight: bold;">${missing.join(', ')}</p>
                                    <p>Pastikan file-file tersebut ada di folder 'js/' dan coba 'Clear site data' lagi.</p>
                                   </div>`;
        return; // Hentikan eksekusi script
    }
    // ▲▲▲ BATAS PERBAIKAN ▲▲▲

    // ===================================================================
    // LANGKAH 1: KONFIGURASI KUNCI FIREBASE
    // ===================================================================
    const firebaseConfig = {
      apiKey: "AIzaSyAyCm1Nu91Gtz7LffCIqH4oeGw-16M2oIc",
      authDomain: "nabaticuan-6a1bc.firebaseapp.com",
      projectId: "nabaticuan-6a1bc",
      storageBucket: "nabaticuan-6a1bc.firebasestorage.app",
      messagingSenderId:  "56102557081",
      appId: "1:56102557081:web:1c835505090a8b1d7b6f08",
    };
    
    if (typeof firebase === 'undefined' || !firebase.initializeApp) {
        console.error("Firebase global object is not defined. Check CDN imports in index.html.");
        return; 
    }

    firebase.initializeApp(firebaseConfig);
    
    window.auth = firebase.auth();
    window.db = firebase.firestore();

    // === DOM Elemen (Login) ===
    const loginContainer = document.getElementById('login-container');
    const loginButton = document.getElementById('login-button');
    const loginIdInput = document.getElementById('login-id');
    const loginPasswordInput = document.getElementById('login-password');
    const loginErrorMsg = document.getElementById('login-error-message');
    const loginLoading = document.getElementById('login-loading');
    const loginRegionEl = document.getElementById('login-region');
    const loginDepoEl = document.getElementById('login-depo');
    
    // === DOM Elemen (MAIN APP) ===
    const mainAppContainer = document.getElementById('main-app-container'); 
    const mainLogoutButton = document.getElementById('main-logout-button'); 
    const userNameEl = document.getElementById('user-nama'); 
    const menuContainer = document.getElementById('menuContainer'); 
    const daftarKeranjangEl = document.getElementById('daftarKeranjang'); 

    // Dropdown & Promosi Container
    const tipeTokoEl = document.getElementById('tipeToko'); 
    const kelasPelangganEl = document.getElementById('kelasPelanggan'); 
    const globalPromoContainer = document.getElementById('globalPromoContainer'); 
    const loyaltyPromoContainer = document.getElementById('loyaltyPromoContainer'); 
    const codPromoContainer = document.getElementById('codPromoContainer');
    const strataSummaryContainer = document.getElementById('strataSummaryContainer');

    // [POIN 5] DOM Elemen Simulasi Super User
    const simulationPanel = document.getElementById('simulation-panel');
    const simZonaEl = document.getElementById('sim-zona');
    const simRegionEl = document.getElementById('sim-region');
    const simDepoEl = document.getElementById('sim-depo');
    const simTypeUserEl = document.getElementById('sim-type-user');

    // DOM Tab
    const tabProdukBtn = document.getElementById('tab-produk-btn');
    const tabPromoBtn = document.getElementById('tab-promo-btn');
    const tabProdukContent = document.getElementById('tab-produk-content');
    const tabPromoContent = document.getElementById('tab-promo-content');

    // DOM Elemen Summary Bar
    const summaryPanelEl = document.querySelector('.simulasi-order');
    const summaryToggleBarEl = document.getElementById('summary-toggle-bar');
    const closeSummaryBtn = document.getElementById('close-summary-btn');
    const summaryBarTotalEl = document.getElementById('summary-bar-total'); 

    // DOM Elemen (MODAL)
    const roleDetailsModal = document.getElementById('role-details-modal'); 
    const modalTitleEl = document.getElementById('modalTitle');
    const modalRoleDetailsEl = document.getElementById('modal-role-details'); 
    const closeModalButton = document.getElementById('close-modal-button'); 
    const modalProceedButton = document.getElementById('modal-proceed-button'); 
    
    // ===================================================================
    // [POIN 4] State sekarang dikelola oleh 'AppStore' dari js/store.js
    // ===================================================================
    
    // Konstanta (Sekarang aman dibaca setelah 'guard clause' di atas)
    const PPN_RATE = window.CONSTANTS.PPN_RATE;
    const JUMLAH_GRUP_FOKUS = window.CONSTANTS.JUMLAH_GRUP_FOKUS;
    const CUSTOM_GROUP_ORDER = window.CONSTANTS.CUSTOM_GROUP_ORDER;


    // ========================================================
    // === LOCAL STORAGE CART PERSISTENCE (Menggunakan AppStore)
    // ========================================================
    const CART_STORAGE_KEY = 'nabati_cart_v1';

    function saveCartToLocalStorage() {
        const keranjang = AppStore.getCart(); // [Poin 4]
        if (keranjang.size > 0) {
            const cartArray = Array.from(keranjang.entries());
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartArray));
        } else {
            localStorage.removeItem(CART_STORAGE_KEY);
        }
    }

    function loadCartFromLocalStorage() {
        const storedCart = localStorage.getItem(CART_STORAGE_KEY);
        AppStore.clearCart(); // [Poin 4]
        if (storedCart) {
            try {
                const cartArray = JSON.parse(storedCart);
                // Konversi Array kembali ke Map dan simpan ke AppStore
                cartArray.forEach(([sku, item]) => {
                    AppStore.updateCart(sku, item); // [Poin 4]
                });
                console.log(`[Persistence] Memuat ${AppStore.getCart().size} item dari cache.`);
            } catch (e) {
                console.error("Gagal memuat keranjang dari LocalStorage:", e);
                localStorage.removeItem(CART_STORAGE_KEY);
            }
        }
    }
    // ========================================================


    // ========================================================
    // === SYNC MASTER DATA (Menggunakan AppStore - Poin 4)
    // ========================================================

    async function getMasterVersion() {
        const versionRef = window.db.collection('metadata').doc('versionInfo');
        try {
            const versionDoc = await versionRef.get();
            return versionDoc.data() || {};
        } catch (error) {
            console.error("Gagal mengambil versi master:", error);
            return {};
        }
    }

    async function syncCollectionData(collectionName, versionKey) {
        const DATA_KEY = collectionName;
        let dbData = JSON.parse(localStorage.getItem(DATA_KEY));

        try {
            const versions = await getMasterVersion();
            const serverVersion = versions[versionKey] || 0;
            const localVersion = parseInt(localStorage.getItem(versionKey)) || 0; 

            if (dbData && serverVersion == localVersion) {
                // [Poin 4] Muat data dari cache ke AppStore
                if (collectionName === 'roles') {} // Roles di-handle khusus saat login
                if (collectionName === 'products') AppStore.setAllProducts(dbData);
                if (collectionName === 'promos_strata') AppStore.setMasterPromo('strata', dbData);
                if (collectionName === 'promos_reguler') AppStore.setMasterPromo('reguler', dbData);
                if (collectionName === 'deal_khusus') AppStore.setMasterPromo('deal_khusus', dbData);
                if (collectionName === 'promos_cod') AppStore.setMasterPromo('cod', dbData);
                
                return `<p class="sync-status-item success"><span class="label">${collectionName} (v${localVersion}):</span> <span>&#10003; Siap dari Cache.</span></p>`;
            } else {
                const snapshot = await window.db.collection(collectionName).get(); 
                dbData = snapshot.docs.map(doc => doc.data());
                
                localStorage.setItem(DATA_KEY, JSON.stringify(dbData));
                localStorage.setItem(versionKey, serverVersion);
                
                // [Poin 4] Muat data BARU ke AppStore
                if (collectionName === 'roles') {} // Roles di-handle khusus saat login
                if (collectionName === 'products') AppStore.setAllProducts(dbData);
                if (collectionName === 'promos_strata') AppStore.setMasterPromo('strata', dbData);
                if (collectionName === 'promos_reguler') AppStore.setMasterPromo('reguler', dbData);
                if (collectionName === 'deal_khusus') AppStore.setMasterPromo('deal_khusus', dbData);
                if (collectionName === 'promos_cod') AppStore.setMasterPromo('cod', dbData);
                
                if (localVersion === 0) {
                    return `<p class="sync-status-item info"><span class="label">${collectionName} (v${serverVersion}):</span> <span>&#9888; Unduh Pertama.</span></p>`;
                } else {
                    return `<p class="sync-status-item warning"><span class="label">${collectionName}:</span> <span>&#10148; Update v${localVersion} &rarr; v${serverVersion}.</span></p>`;
                }
            }
        } catch (error) {
            console.error(`Gagal sinkronisasi data ${collectionName}:`, error);
            // [Poin 4] Tetap coba muat data lama (jika ada) ke AppStore
            if(dbData) {
                if (collectionName === 'products') AppStore.setAllProducts(dbData);
                if (collectionName === 'promos_strata') AppStore.setMasterPromo('strata', dbData);
                if (collectionName === 'promos_reguler') AppStore.setMasterPromo('reguler', dbData);
                if (collectionName === 'deal_khusus') AppStore.setMasterPromo('deal_khusus', dbData);
                if (collectionName === 'promos_cod') AppStore.setMasterPromo('cod', dbData);
            }
            
            const statusClass = dbData ? 'warning' : 'danger';
            const statusText = dbData ? 'Gagal update. Menggunakan data lama.' : 'Gagal total. Data tidak ada.';
            
            return `<p class="sync-status-item ${statusClass}"><span class="label">${collectionName}:</span> <span>&#10060; ${statusText}</span></p>`;
        }
    }
    
    // ========================================================
    // === HELPER FUNGSI UMUM & KALKULASI (GLOBAL ACCESS)
    // ========================================================
    
    /**
     * [POIN 4] Menghitung simulasi reward off-faktur per karton.
     * Menggunakan AppStore.getContext().
     * [Logika dari app.js lama, diadaptasi ke AppStore]
     */
    function getSimulasiRewardKrt(product, itemSummary) {
    if (!product || !itemSummary) return { totalRewardKrt: 0, hargaNettAkhirSimulasiKrt: 0, discRateLoyalty: 0, potonganDealKhususKrt: 0 };

    const { selectedType, selectedKelas, userZona, userRegion, userDepo } = AppStore.getContext();
    const allDeals = AppStore.getMasterPromo('deal_khusus'); // Gunakan data mentah
    
    let discRateLoyalty = 0;
    let potonganDealKhususKrt = 0; 
    
    const isLoyaltyClassValid = selectedKelas && selectedKelas !== "-Tidak Ada Loyalti-" && selectedKelas !== "-Pilih Kelas Loyalti-";
    
    if (allDeals.length > 0) {
        // --- 1. LOGIKA LOYALTI (Diskon %) ---
        if (isLoyaltyClassValid) { 
            // Ambil semua aturan untuk Kelas yang dipilih
            const classCandidates = allDeals.filter(p => 
                (p.ket_program || '').toUpperCase() === "LOYALTI" && 
                (p.kelas || '').toUpperCase() === selectedKelas.toUpperCase() &&
                isAreaMatch(p.type, selectedType) &&
                isAreaMatch(p.region, userRegion) &&
                isAreaMatch(p.depo, userDepo) &&
                isAreaMatch(p.zona, userZona)
            );

            // CARI PEMENANG (Winner Takes All)
            let bestClassRule = null;
            let maxScore = -1;
            let maxRate = -1;

            classCandidates.forEach(rule => {
                const score = window.getPromoSpecificityScore(rule);
                const rate = parseFloat(rule.disc) || 0;

                if (score > maxScore) {
                    maxScore = score;
                    maxRate = rate;
                    bestClassRule = rule;
                } else if (score === maxScore) {
                    // Tie-Breaker
                    if (rate > maxRate) {
                        maxRate = rate;
                        bestClassRule = rule;
                    }
                }
            });

            if (bestClassRule) {
                discRateLoyalty = parseFloat(bestClassRule.disc) || 0;
            }
        }
            
        // --- 2. LOGIKA DEAL KHUSUS (Potongan Rp) ---
        // Cari aturan untuk Principal & Group produk ini
        const dealCandidates = allDeals.filter(p => 
            (p.ket_program || '').toUpperCase() !== "LOYALTI" && 
            (parseFloat(p.pot) || 0) > 0 && 
            isAreaMatch(p.type, selectedType) && 
            isAreaMatch(p.region, userRegion) &&
            isAreaMatch(p.depo, userDepo) && 
            isAreaMatch(p.zona, userZona) &&
            isAreaMatch(p.group, product.group) && 
            isAreaMatch(p.principal, product.principal)
        );
        
        if (dealCandidates.length > 0) {
            const groupName = product.group || 'LAIN-LAIN';
            const isGroupDealKhususActive = localStorage.getItem(`deal_khusus_state_${groupName}`) === 'active';
            
            if (isGroupDealKhususActive) {
                // CARI PEMENANG (Winner Takes All)
                let bestDealRule = null;
                let maxDealScore = -1;
                let maxPot = -1;

                dealCandidates.forEach(rule => {
                    const score = window.getPromoSpecificityScore(rule);
                    const pot = parseFloat(rule.pot) || 0;

                    if (score > maxDealScore) {
                        maxDealScore = score;
                        maxPot = pot;
                        bestDealRule = rule;
                    } else if (score === maxDealScore) {
                        // Tie-Breaker
                        if (pot > maxPot) {
                            maxPot = pot;
                            bestDealRule = rule;
                        }
                    }
                });

                if (bestDealRule) {
                    potonganDealKhususKrt = parseFloat(bestDealRule.pot) || 0;
                }
            }
        }
    }
    
    // ... (Sisa kode kalkulasi harga tidak berubah) ...
    // Pastikan pakai window.CONSTANTS.PPN_RATE
    const PPN_RATE = (window.CONSTANTS && window.CONSTANTS.PPN_RATE) ? window.CONSTANTS.PPN_RATE : 0.11;
    
    const boxPerKrt = product.box_per_krt || 12;
    const hargaOnFakturPerKrt = itemSummary.qtyBoxTotal > 0 ? (itemSummary.totalOnFaktur / itemSummary.qtyBoxTotal) * boxPerKrt : 0;
    
    const discRegPerKrt_DPP = itemSummary.qtyBoxTotal > 0 ? (itemSummary.nominalDiskonReguler / itemSummary.qtyBoxTotal) * boxPerKrt : 0;
    const discStrataPerKrt_IncPpn = itemSummary.qtyBoxTotal > 0 ? (itemSummary.nominalDiskonStrata_IncPPN / itemSummary.qtyBoxTotal) * boxPerKrt : 0;
    const discRegPerKrt_IncPpn = discRegPerKrt_DPP * (1 + PPN_RATE);
    
    const hargaSetelahItemDiscKrt = (product.harga_inc_ppn || 0) - discRegPerKrt_IncPpn - discStrataPerKrt_IncPpn;

    const potLoyaltiKrt = hargaSetelahItemDiscKrt * discRateLoyalty;
    const totalRewardKrt = potLoyaltiKrt + potonganDealKhususKrt;
    const hargaNettAkhirSimulasiKrt = hargaOnFakturPerKrt - totalRewardKrt;

    return { totalRewardKrt, hargaNettAkhirSimulasiKrt, hargaOnFakturPerKrt, discRateLoyalty, potonganDealKhususKrt };
}
    
    // ========================================================
    // === LOGIKA LOGIN & DROPDOWN
    // ========================================================

    async function initLoginDropdowns() {
        if (loginErrorMsg) {
            loginErrorMsg.innerText = "";
        }
        if (loginLoading) {
            loginLoading.style.display = 'block';
        }

        try {
            let dbRoles;
            const localData = localStorage.getItem('roles');
            
            if (!localData) {
                const rolesSnapshot = await window.db.collection("roles").get(); 
                dbRoles = rolesSnapshot.docs.map(doc => doc.data());
                localStorage.setItem('roles', JSON.stringify(dbRoles)); 
            } else {
                dbRoles = JSON.parse(localData);
            }
            
            const regions = [...new Set(dbRoles.map(r => r.REGION))];
            if (loginRegionEl) {
                loginRegionEl.innerHTML = '<option value="">1. Pilih Region...</option>'; 
                regions.sort().forEach(region => {
                    loginRegionEl.innerHTML += `<option value="${region}">${region}</option>`;
                });
            }
            if (loginDepoEl) {
                loginDepoEl.innerHTML = '<option value="">Pilih region dulu</option>';
            }
            
            if (loginRegionEl && !loginRegionEl.dataset.listenerAttached) {
                loginRegionEl.addEventListener('change', () => isiDepo(dbRoles)); // Kirim dbRoles
                loginRegionEl.dataset.listenerAttached = 'true'; 
            }
            
            if (loginLoading) {
                loginLoading.style.display = 'none';
            }
            if (loginButton) {
                loginButton.disabled = false;
            }

        } catch (error) {
            console.error("Gagal memuat data roles untuk dropdown:", error);
            if (loginErrorMsg) {
                loginErrorMsg.innerText = "Gagal memuat data login. Cek koneksi.";
                loginErrorMsg.style.display = 'block';
            }
            if (loginLoading) {
                loginLoading.style.display = 'none';
            }
        }
    }

    function isiDepo(dbRoles) { // Terima dbRoles
        const regionTerpilih = loginRegionEl.value;
        loginDepoEl.innerHTML = '<option value="">2. Pilih Depo...</option>';
        if (!regionTerpilih) {
            loginDepoEl.innerHTML = '<option value="">Pilih region dulu</option>';
            return;
        }
        
        let depos;
        if (regionTerpilih === "ALL") {
            depos = ["ALL"];
        } else {
             depos = [...new Set(dbRoles
                .filter(r => r.REGION === regionTerpilih)
                .map(r => r.DEPO)
            )];
        }
        
        depos.sort().forEach(depo => {
            loginDepoEl.innerHTML += `<option value="${depo}">${depo}</option>`;
        });
    }

    async function handleLogin() { 
        loginErrorMsg.style.display = 'none'; 
        loginLoading.style.display = 'block';
        loginButton.disabled = true;

        const regionTerpilih = loginRegionEl.value;
        const depoTerpilih = loginDepoEl.value;
        const kdSales = loginIdInput.value.trim();
        const password = loginPasswordInput.value.trim();

        if (!regionTerpilih || !depoTerpilih || !kdSales || !password) {
            loginErrorMsg.innerText = "Harap lengkapi semua field.";
            loginErrorMsg.style.display = 'block';
            loginLoading.style.display = 'none';
            loginButton.disabled = false;
            return;
        }
        
        let dbRoles = JSON.parse(localStorage.getItem('roles') || '[]');
        
        if (dbRoles.length === 0) {
            console.warn("Cache roles kosong. Mencoba mengambil data roles langsung dari Firestore...");
            try {
                const rolesSnapshot = await window.db.collection("roles").get(); 
                dbRoles = rolesSnapshot.docs.map(doc => doc.data());
                localStorage.setItem('roles', JSON.stringify(dbRoles)); 
            } catch (e) {
                console.error("Gagal total mengambil roles:", e);
                loginErrorMsg.innerText = "Gagal mengambil data roles. Cek koneksi.";
                loginErrorMsg.style.display = 'block';
                loginLoading.style.display = 'none';
                loginButton.disabled = false;
                return;
            }
        }

        if (dbRoles.length === 0) {
             loginErrorMsg.innerText = "Data roles tidak ada. Gagal login.";
             loginErrorMsg.style.display = 'block';
             loginLoading.style.display = 'none';
             loginButton.disabled = false;
             return;
        }

        const roleData = dbRoles.find(r => 
            r.REGION === regionTerpilih && 
            r.DEPO === depoTerpilih && 
            String(r.KD_SALES) === kdSales
        );

        if (!roleData) {
            loginErrorMsg.innerText = "Kombinasi Region/Depo dan KD Sales tidak ditemukan.";
            loginErrorMsg.style.display = 'block';
            loginLoading.style.display = 'none';
            loginButton.disabled = false;
            return;
        }
        
        const kdDist = roleData.KD_DIST;
        const emailUntukFirebase = `${kdDist}-${kdSales}@pma.com`; 
        
        try {
            await window.auth.signInWithEmailAndPassword(emailUntukFirebase, password);
        } catch (error) {
            console.error("Login Gagal:", error.message, error.code); 
            let msg = "Kombinasi Email/Password salah.";
            if (error.code && error.code.includes('auth/')) {
                 msg = "Login Gagal: " + error.message;
            }
            loginErrorMsg.innerText = msg;
            loginErrorMsg.style.display = 'block';
            loginLoading.style.display = 'none';
            loginButton.disabled = false;
            return;
        }
    }

    function handleLogout() {
        localStorage.clear(); 
        window.auth.signOut();
        if (roleDetailsModal) roleDetailsModal.style.display = 'none';
        
        if (loginContainer) loginContainer.style.display = 'flex';
        if (mainAppContainer) mainAppContainer.style.display = 'none';
        if (summaryToggleBarEl) summaryToggleBarEl.style.display = 'none'; 
    }
    
    // ========================================================
    // === FUNGSI UTILITY & UI (MODAL, DROPDOWN, TOGGLE)
    // ========================================================
    
    function showConfirmationModal(title, message, callback = null, buttonText = 'Lanjutkan') {
        if (!modalProceedButton) return; 
        
        modalProceedButton.removeEventListener('click', handleCloseModalAndProceed);
        modalProceedButton.removeEventListener('click', handleCloseModalOnly);
        
        if (modalTitleEl) {
            modalTitleEl.innerText = title;
            modalTitleEl.style.color = callback ? 'var(--danger-color)' : 'var(--success-color)';
        }
        
        if (modalRoleDetailsEl) {
             modalRoleDetailsEl.innerHTML = `<p style="text-align:center; font-size:1.1em; line-height:1.5; padding: 10px 0;">${message}</p>`;
        }

        if (modalProceedButton) {
            modalProceedButton.style.display = 'block'; 
            modalProceedButton.innerText = buttonText;
            modalProceedButton.classList.remove('btn-secondary', 'btn-danger'); 
            
            if (callback) {
                // Untuk "Reset" atau "Logout"
                modalProceedButton.classList.add('btn-danger');
                const newHandler = function() {
                    callback(); 
                    handleCloseModalOnly();
                    modalProceedButton.removeEventListener('click', newHandler); 
                };
                modalProceedButton.addEventListener('click', newHandler);
            } else {
                // Untuk "OK" biasa
                modalProceedButton.classList.add('btn-secondary');
                modalProceedButton.addEventListener('click', handleCloseModalOnly);
            }
        }
        
        if (roleDetailsModal) roleDetailsModal.style.display = 'block';
    }

    /**
     * [POIN 4] Mengisi dropdown kelas loyalti.
     * [Logika dari app.js lama, diadaptasi ke AppStore]
     */
    function populateLoyaltiDropdown() {
    const loyaltiData = AppStore.getMasterPromo('deal_khusus');
    const { selectedType, userZona, userRegion, userDepo } = AppStore.getContext();

    // Reset Dropdown
    kelasPelangganEl.innerHTML = '<option value="">Memuat...</option>';
    kelasPelangganEl.disabled = true;

    // Validasi Awal
    if (loyaltiData.length === 0) { 
        kelasPelangganEl.innerHTML = '<option value="">Data Loyalti Gagal Dimuat</option>';
        return;
    }
    if (!selectedType) {
        kelasPelangganEl.innerHTML = '<option value="">Pilih Tipe Toko</option>';
        return;
    }

    try {
        // --- 1. Ambil Kandidat (Filter Area & Program LOYALTI) ---
        let candidates = loyaltiData.filter(d => 
            (d.ket_program || '').toUpperCase() === "LOYALTI" && 
            isAreaMatch(d.type, selectedType) &&
            isAreaMatch(d.region, userRegion) &&
            isAreaMatch(d.depo, userDepo) &&
            isAreaMatch(d.zona, userZona)
        );
        
        if (candidates.length === 0) {
            kelasPelangganEl.innerHTML = '<option value="">-Tidak Ada Loyalti-</option>';
            return;
        }

        // --- 2. CEK LEVEL PROGRAM (NASIONAL VS LOKAL) ---
        // Cari skor wilayah tertinggi yang ditemukan di antara kandidat
        let maxProgramScore = 0;
        candidates.forEach(d => {
            const s = window.getPromoSpecificityScore(d);
            if (s > maxProgramScore) maxProgramScore = s;
        });

        // Filter Eksklusif: HANYA ambil data yang setara dengan Level Tertinggi
        // Jika MaxScore = 4 (Depo), maka data Nasional (Score 0) dibuang semua.
        candidates = candidates.filter(d => window.getPromoSpecificityScore(d) === maxProgramScore);

        // --- 3. DEDUPLIKASI KELAS (Tie-Breaker) ---
        // Pastikan 1 Nama Kelas hanya muncul 1 kali (ambil diskon terbesar)
        const uniqueClassesMap = new Map();
        
        candidates.forEach(opt => {
            const namaKelas = (opt.kelas || '').toUpperCase().trim();
            if (!namaKelas) return;

            const discRate = parseFloat(opt.disc) || 0;
            
            // Karena kita sudah memfilter Level di Langkah 2, 
            // di sini kita tinggal adu Value (Diskon) jika ada duplikat nama kelas.
            const existing = uniqueClassesMap.get(namaKelas);

            if (!existing) {
                uniqueClassesMap.set(namaKelas, { kelas: namaKelas, disc: discRate });
            } else {
                // Ambil yang diskonnya lebih besar
                if (discRate > existing.disc) {
                    uniqueClassesMap.set(namaKelas, { kelas: namaKelas, disc: discRate });
                }
            }
        });

        // --- 4. Render ke Dropdown ---
        const uniqueClasses = Array.from(uniqueClassesMap.values());

        if (uniqueClasses.length === 0) {
            kelasPelangganEl.innerHTML = '<option value="">-Tidak Ada Loyalti-</option>';
            kelasPelangganEl.disabled = true;
        } else {
            // Sortir: Diskon Terbesar di atas
            uniqueClasses.sort((a, b) => b.disc - a.disc);
            
            kelasPelangganEl.innerHTML = '<option value="">-Pilih Kelas Loyalti-</option>';
            uniqueClasses.forEach(item => {
                const namaKelas = item.kelas;
                const persen = (item.disc * 100).toFixed(2); 
                const displayLabel = `${namaKelas} - ${persen}%`; 
                kelasPelangganEl.innerHTML += `<option value="${namaKelas}">${displayLabel}</option>`;
            });
            kelasPelangganEl.disabled = false; 
        }

    } catch (e) {
        console.error("Gagal memproses dropdown Loyalitas:", e);
        kelasPelangganEl.innerHTML = '<option value="">Error Data</option>';
    }
}
    /**
     * [GABUNGAN] Logika Super User "Menyamar" + Alur Sales Biasa.
     */
    function handleTipeTokoChange() {
        
        const { access_level } = AppStore.getIdentity();
        const { currentUserData } = AppStore.getIdentity();
        const { selectedTipeUser, selectedType } = AppStore.getContext();

        if (access_level === "SALES") {
            // --- LOGIKA ASLI SALESMAN (Tidak diubah) ---
            const userFlagType = currentUserData.TYPE || "ALL";
            if (userFlagType !== "ALL") {
                tipeTokoEl.value = userFlagType;
                tipeTokoEl.disabled = true;
            } else {
                tipeTokoEl.value = selectedType; // Ambil nilai dari state (jika sudah dipilih)
                tipeTokoEl.disabled = false;
            }
            
        } else {
            // --- LOGIKA BARU SUPER USER "MENYAMAR" ---
            if (selectedTipeUser === "ALL") {
                // Super User simulasi "ALL", Tipe Toko bisa dipilih
                tipeTokoEl.value = selectedType; // Ambil nilai dari state
                tipeTokoEl.disabled = false;
            } else if (selectedTipeUser === "GROSIR" || selectedTipeUser === "RETAIL") {
                // Super User simulasi "GROSIR" / "RETAIL", Tipe Toko terkunci
                tipeTokoEl.value = selectedTipeUser;
                tipeTokoEl.disabled = true;
            } else {
                // Super User belum memilih Tipe User, Tipe Toko terkunci & kosong
                tipeTokoEl.value = "";
                tipeTokoEl.disabled = true;
            }
        }

        
        // --- Sisa fungsi ini (untuk mengisi Kelas Loyalti) tetap sama ---
        const finalSelectedType = tipeTokoEl.value; // Baca nilai akhir setelah logika di atas

        if (finalSelectedType === "GROSIR") {
            console.log("Mode: GROSIR diaktifkan. Mengisi dropdown Loyalti.");
            populateLoyaltiDropdown(); 
        } else {
            if (finalSelectedType === "RETAIL") {
                console.log("Mode: RETAIL diaktifkan. Loyalti dinonaktifkan.");
            } else {
                 console.log("Mode: Tipe Toko kosong. Loyalti dinonaktifkan.");
            }
            
            kelasPelangganEl.disabled = true;
            if (!finalSelectedType) {
                kelasPelangganEl.innerHTML = '<option value="">Pilih Tipe Toko</option>';
            } else {
                kelasPelangganEl.innerHTML = '<option value="">-Tidak Ada Loyalti-</option>';
            }
        }
        
        // Render ulang menu dan promo (ini penting)
        renderProductMenu(); 
        renderAllPromotions();
        batchUpdateUI(); 
    }

    
    /**
     * [GABUNGAN] Mengisi 4 dropdown admin (Zona, Region, Depo, Tipe User)
     */
    function populateAdminDropdowns() {
        const allRoles = JSON.parse(localStorage.getItem('roles') || '[]');
        const { access_level } = AppStore.getIdentity();

        if (access_level === "SALES" || !simZonaEl) return; // Jangan jalankan untuk Sales

        const selectedZona = simZonaEl.value;
        const selectedRegion = simRegionEl.value;

        // --- 1. Isi ZONA (Hanya jika masih kosong) ---
        if (simZonaEl.options.length <= 1) { // <= 1 karena sudah ada "-Simulasi Zona-"
            let allZonas = [...new Set(allRoles.map(r => r.ZONA).filter(Boolean))].sort();
            if (access_level === "CENTRAL" && !allZonas.includes("ALL")) {
                 allZonas.unshift("ALL");
            }
            allZonas.forEach(z => simZonaEl.innerHTML += `<option value="${z}">${z}</option>`);
        }

        // --- 2. Isi REGION (berdasarkan selectedZona) ---
        const oldRegionVal = selectedRegion || AppStore.getIdentity().currentUserData.REGION;
        simRegionEl.innerHTML = '<option value="">-Simulasi Region-</option>'; // Reset
        
        let regionsToPopulate = [];
        if (selectedZona) {
            if (selectedZona === 'ALL') {
                regionsToPopulate = [...new Set(allRoles.map(r => r.REGION).filter(Boolean))].sort();
            } else {
                regionsToPopulate = [...new Set(allRoles
                    .filter(r => r.ZONA === selectedZona)
                    .map(r => r.REGION).filter(Boolean)
                )].sort();
            }
            if (access_level === "CENTRAL" && !regionsToPopulate.includes("ALL")) {
                 regionsToPopulate.unshift("ALL");
            }
        }
        regionsToPopulate.forEach(r => simRegionEl.innerHTML += `<option value="${r}">${r}</option>`);
        // Coba pilih kembali nilai lama HANYA jika masih ada di daftar baru
        if (regionsToPopulate.includes(oldRegionVal)) {
            simRegionEl.value = oldRegionVal;
        }


        // --- 3. Isi DEPO (berdasarkan selectedRegion) ---
        const oldDepoVal = simDepoEl.value || AppStore.getIdentity().currentUserData.DEPO;
        simDepoEl.innerHTML = '<option value="">-Simulasi Depo-</option>'; // Reset
        
        let deposToPopulate = [];
        // Gunakan nilai simRegionEl.value yang sudah pasti (setelah di-set di atas)
        const currentSelectedRegion = simRegionEl.value; 
        if (currentSelectedRegion) { 
            if (currentSelectedRegion === 'ALL') {
                 deposToPopulate = [...new Set(allRoles.map(r => r.DEPO).filter(Boolean))].sort();
            } else {
                deposToPopulate = [...new Set(allRoles
                    .filter(r => r.REGION === currentSelectedRegion)
                    .map(r => r.DEPO).filter(Boolean)
                )].sort();
            }
            if (access_level === "CENTRAL" && !deposToPopulate.includes("ALL")) {
                 deposToPopulate.unshift("ALL");
            }
        }
        deposToPopulate.forEach(d => simDepoEl.innerHTML += `<option value="${d}">${d}</option>`);
        // Coba pilih kembali nilai lama HANYA jika masih ada di daftar baru
        if (deposToPopulate.includes(oldDepoVal)) {
            simDepoEl.value = oldDepoVal;
        }
        
        // --- 4. Isi Tipe User (Statis) ---
        if (simTypeUserEl && simTypeUserEl.options.length <= 1) {
            simTypeUserEl.innerHTML = '<option value="">-Pilih Tipe User-</option>';
            simTypeUserEl.innerHTML += '<option value="ALL">ALL</option>';
            simTypeUserEl.innerHTML += '<option value="GROSIR">GROSIR</option>';
            simTypeUserEl.innerHTML += '<option value="RETAIL">RETAIL</option>';
        }
    }

    
    /**
     * [GABUNGAN] Mengatur UI Simulasi (CENTRAL vs REGIONAL).
     */
    function setupSimulationUI() {
        const { currentUserData, access_level } = AppStore.getIdentity();
        
        // Reset dropdowns (penting)
        if (simZonaEl) simZonaEl.innerHTML = '<option value="">-Simulasi Zona-</option>';
        if (simRegionEl) simRegionEl.innerHTML = '<option value="">-Simulasi Region-</option>';
        if (simDepoEl) simDepoEl.innerHTML = '<option value="">-Simulasi Depo-</option>';
        if (simTypeUserEl) simTypeUserEl.innerHTML = '<option value="">-Pilih Tipe User-</option>';
        
        if (access_level === "SALES") {
            // --- LOGIKA ASLI SALESMAN (Tidak diubah) ---
            if (simulationPanel) simulationPanel.style.display = 'none'; 
            
            const userFlagType = currentUserData.TYPE || "ALL";
            if (userFlagType !== "ALL") {
                tipeTokoEl.value = userFlagType;
                tipeTokoEl.disabled = true;
            } else {
                tipeTokoEl.value = "";
                tipeTokoEl.disabled = false;
            }
            
        } else {
            // --- LOGIKA BARU SUPER USER (CENTRAL vs REGIONAL) ---
            if (simulationPanel) simulationPanel.style.display = 'flex'; 
            
            // Panggil fungsi untuk mengisi dropdown
            populateAdminDropdowns(); 

            if (access_level === "REGIONAL") {
                // ▼▼▼ [PERBAIKAN] Logika REGIONAL ▼▼▼
                simZonaEl.value = currentUserData.ZONA; // Terkunci ke Zona user
                simZonaEl.disabled = true;
                
                simRegionEl.value = currentUserData.REGION; // Terkunci ke Region user
                simRegionEl.disabled = true;
                
                simDepoEl.value = ""; // Mulai kosong
                simDepoEl.disabled = false; // Buka hanya Depo
                
                simTypeUserEl.value = "ALL"; // Paksa "ALL"
                simTypeUserEl.disabled = true;
                
                // Panggil lagi untuk memfilter depo berdasarkan region yang terkunci
                populateAdminDropdowns(); 
                // ▲▲▲ [BATAS PERBAIKAN] ▲▲▲
                
            } else if (access_level === "CENTRAL") {
                // ▼▼▼ [PERBAIKAN] Logika CENTRAL ▼▼▼
                simZonaEl.value = ""; // Mulai kosong
                simZonaEl.disabled = false;
                
                simRegionEl.value = ""; // Mulai kosong
                simRegionEl.disabled = false;
                
                simDepoEl.value = ""; // Mulai kosong
                simDepoEl.disabled = false;
                
                simTypeUserEl.value = ""; // Mulai kosong
                simTypeUserEl.disabled = false;
                // ▲▲▲ [BATAS PERBAIKAN] ▲▲▲
            }
            
            if (userNameEl) {
                const { currentPICData } = AppStore.getIdentity();
                if(currentPICData) { // Cek jika picData ada
                    userNameEl.innerHTML += ` <strong style="color: var(--danger-color);">[${access_level} MODE]</strong>`;
                }
            }
        }
        
        // 1. Update state (AppStore) dulu
        updateSimulationContext(false); // Sinkronkan state, tanpa render ulang
        // 2. Baru panggil UI (yang akan membaca state baru)
        handleTipeTokoChange(); 
    }

    /**
     * [GABUNGAN] Membaca semua dropdown, update AppStore, dan render ulang.
     */
    function updateSimulationContext(runRenders = true) {
        // Ambil konteks AppStore saat ini
        const currentContext = AppStore.getContext();
        
        const { access_level } = AppStore.getIdentity();
        
        let context;
        let tipeTokoChanged = false;
        let tipeUserChanged = false;
        
        if (access_level === "SALES") {
            // --- LOGIKA ASLI SALESMAN (Tidak diubah) ---
            context = {
                zona: currentContext.userZona,
                region: currentContext.userRegion,
                depo: currentContext.userDepo,
                tipeToko: tipeTokoEl.value,
                tipeUser: "", // Sales tidak pakai ini
                kelasPelanggan: kelasPelangganEl.value
            };
            tipeTokoChanged = context.tipeToko !== currentContext.selectedType;
            
        } else {
            // --- LOGIKA BARU SUPER USER "MENYAMAR" ---
            const newTipeUser = simTypeUserEl.value;
            tipeUserChanged = newTipeUser !== currentContext.selectedTipeUser;

            let newTipeToko = "";
            if (newTipeUser === "ALL") {
                // Jika Tipe User "ALL", Tipe Toko diambil dari dropdown Tipe Toko
                newTipeToko = tipeTokoEl.value;
            } else if (newTipeUser === "GROSIR" || newTipeUser === "RETAIL") {
                // Jika Tipe User "GROSIR" / "RETAIL", Tipe Toko dipaksa sama
                newTipeToko = newTipeUser;
            }
            
            context = {
                zona: simZonaEl.value,
                region: simRegionEl.value,
                depo: simDepoEl.value,
                tipeToko: newTipeToko,
                tipeUser: newTipeUser,
                kelasPelanggan: kelasPelangganEl.value
            };
            tipeTokoChanged = context.tipeToko !== currentContext.selectedType;
        }
        

        // 2. Simpan ke 'brankas' AppStore
        AppStore.setSimulationContext(context);
        
        // 3. Reset kelas pelanggan jika Tipe Toko atau Tipe User ganti
        // (tipeUserChanged ditambahkan untuk Super User)
        if (tipeTokoChanged || tipeUserChanged) {
            console.log("Tipe Toko atau Tipe User berubah, reset kelas pelanggan.");
            kelasPelangganEl.value = "";
            
            const currentCtx = AppStore.getContext(); 
            AppStore.setSimulationContext({
                zona: currentCtx.userZona,
                region: currentCtx.userRegion,
                depo: currentCtx.userDepo,
                tipeToko: currentCtx.selectedType,
                tipeUser: currentCtx.selectedTipeUser, // [PERUBAHAN]
                kelasPelanggan: ""               // <-- Reset nilai ini
            });
        }

        // 4. Render ulang (jika diminta)
        if (runRenders) {
            // (tipeUserChanged ditambahkan untuk Super User)
            if (tipeTokoChanged || tipeUserChanged) {
                // HANYA jika Tipe Toko/Tipe User berubah, panggil handleTipeTokoChange
                handleTipeTokoChange();
            } else {
                // Jika HANYA Kelas Loyalti (atau admin lain) yang berubah,
                // JANGAN panggil handleTipeTokoChange().
                renderProductMenu();
                renderAllPromotions();
                batchUpdateUI();
            }
        }
    }

    function handleCloseModalAndProceed() {
        if(roleDetailsModal) roleDetailsModal.style.display = 'none';
        
        if(loginContainer) loginContainer.style.display = 'none';
        if(mainAppContainer) mainAppContainer.style.display = 'block'; 

        if (summaryToggleBarEl && isMobile()) {
            summaryToggleBarEl.style.display = 'block';
        }
        
        if (modalProceedButton && modalTitleEl && (modalProceedButton.innerText === 'Tutup' || modalTitleEl.innerText.includes('Login Berhasil!'))) {
             modalProceedButton.innerText = 'OK';
             modalProceedButton.classList.remove('btn-secondary');
             modalProceedButton.classList.add('btn-danger');
             modalProceedButton.removeEventListener('click', handleCloseModalAndProceed); 
        }

        console.log("Melanjutkan ke halaman utama.");
    }
    
    function toggleSummaryPanel(){
        if (isMobile()){
            summaryPanelEl.classList.toggle('summary-visible');
            document.body.style.overflow = summaryPanelEl.classList.contains('summary-visible') ? 'hidden' : 'auto';
            
            if (summaryToggleBarEl) {
                summaryToggleBarEl.style.display = summaryPanelEl.classList.contains('summary-visible') ? 'none' : 'block';
            }
        }
    }

    function switchTab(tabId) {
        if (!tabProdukBtn) return; 
        
        const allButtons = document.querySelectorAll('.tab-button');
        const allContents = document.querySelectorAll('.tab-content');

        allButtons.forEach(btn => btn.classList.remove('active'));
        allContents.forEach(content => content.style.display = 'none');

        if (tabId === 'produk') {
            tabProdukBtn.classList.add('active');
            tabProdukContent.style.display = 'block';
        } else if (tabId === 'promo') {
            tabPromoBtn.classList.add('active');
            tabPromoContent.style.display = 'block';
            renderAllPromotions(); 
        }
    }
    
 function renderProductMenu() {
    if (!menuContainer) {
        console.error("Menu container not found!");
        return;
    }
    
    const allProducts = AppStore.getAllProducts();
    const context = AppStore.getContext();
    // Ambil data User Asli (bukan simulasi) untuk fallback
    const { currentUserData, access_level } = AppStore.getIdentity(); 
    
    // Gunakan Zona Simulasi jika ada, jika tidak gunakan Zona User Asli
    const targetZona = context.userZona || currentUserData.ZONA; 
    const targetRegion = context.userRegion || currentUserData.REGION;
    const targetDepo = context.userDepo || currentUserData.DEPO;

    // [SAFETY CHECK]
    // Jika masih loading atau data kosong, coba reload dari cache
    if ((!allProducts || allProducts.length === 0) && localStorage.getItem('products')) {
        const cachedProd = JSON.parse(localStorage.getItem('products'));
        if(cachedProd) AppStore.setAllProducts(cachedProd);
    }

    if (AppStore.getAllProducts().length === 0) {
        menuContainer.innerHTML = `<p style="text-align:center; padding:20px;">Memuat data produk...</p>`;
        return;
    }

    // [FIX FILTER PRODUK]
    // Logika Akses Produk: "ALL" harus bisa dilihat oleh siapa saja (Inklusif)
    // Berbeda dengan Promo yang Eksklusif.
    const activeProducts = AppStore.getAllProducts().filter(p => p.status === 'AKTIF');
    
    const filteredProducts = activeProducts.filter(p => {
        // 1. Cek Zona (Wajib Match atau Produknya ALL)
        // User Z01 BISA lihat produk Z01 DAN produk ALL
        const productZona = String(p.zona_harga || '').toUpperCase();
        const userZonaVal = String(targetZona || '').toUpperCase();
        
        const zonaMatch = (productZona === 'ALL') || (productZona === userZonaVal);

        // 2. Cek Region (Opsional, biasanya produk ALL Region)
        const productRegion = String(p.region || '').toUpperCase();
        const userRegionVal = String(targetRegion || '').toUpperCase();
        // Jika produk region kosong/ALL, semua bisa lihat. Jika spesifik, harus match.
        const regionMatch = (!p.region || productRegion === 'ALL') || (productRegion === userRegionVal);

        // 3. Cek Depo (Sangat Opsional)
        const productDepo = String(p.depo || '').toUpperCase();
        const userDepoVal = String(targetDepo || '').toUpperCase();
        const depoMatch = (!p.depo || productDepo === 'ALL') || (productDepo === userDepoVal);

        return zonaMatch && regionMatch && depoMatch;
    });

    if (filteredProducts.length === 0) {
         menuContainer.innerHTML = `<div style="text-align:center; padding:20px;">
            <p>Tidak ada produk aktif untuk Area Anda.</p>
            <small style="color:#666;">Zona: ${targetZona || 'ALL'}, Region: ${targetRegion || 'ALL'}</small>
         </div>`;
        return;
    }

    // ... (Sisa kode rendering grouping & accordion tetap sama seperti sebelumnya) ...
    // Pastikan Anda menyalin sisa kode rendering di bawah ini agar menu tampil
    
    const grouped = {};
    filteredProducts.forEach(p => { 
        const g = p.group || 'LAIN-LAIN'; 
        p.group = g; 
        (grouped[g] ||= []).push(p); 
    });
    
    menuContainer.innerHTML = '';
    const order = [];
    const seen = new Set();
    // Gunakan global constant jika ada, atau default
    const customOrder = (window.CONSTANTS && window.CONSTANTS.CUSTOM_GROUP_ORDER) ? window.CONSTANTS.CUSTOM_GROUP_ORDER : [];
    const jmlFokus = (window.CONSTANTS && window.CONSTANTS.JUMLAH_GRUP_FOKUS) ? window.CONSTANTS.JUMLAH_GRUP_FOKUS : 5;

    customOrder.forEach(g => { if(grouped[g]){ order.push(g); seen.add(g);} });
    Object.keys(grouped).sort().forEach(g => { if(!seen.has(g)) order.push(g); });
    
    // Ambil Helper Promo Strata untuk tombol header
    const allPromosStrata = AppStore.getMasterPromo('strata');

    for (let i = 0; i < order.length; i++) {
        const g = order[i]; 
        const isFokus = (i < jmlFokus);
        
        // Sort SKU dalam grup
        grouped[g].sort((a, b) => {
            // Helper getSkuPriority harus ada di helpers.js
            const prioA = (typeof getSkuPriority === 'function') ? getSkuPriority(a.sku, g, context) : 9999;
            const prioB = (typeof getSkuPriority === 'function') ? getSkuPriority(b.sku, g, context) : 9999;

            if (prioA !== prioB) return prioA - prioB;
            return (a.nama_sku || a.sku).localeCompare(b.nama_sku || b.sku);
        });

        let itemsHtml=''; 
        const keranjang = AppStore.getCart();

        grouped[g].forEach(p => {
            const sku = String(p.sku || p.id);
            const inCart = keranjang.get(sku);
            
            const qtyK = inCart ? inCart.qtyKarton : 0;
            const qtyB = inCart ? inCart.qtyBox : 0;
            
            const vK = qtyK > 0 ? fmtNumInput(qtyK) : 'K';
            const vB = qtyB > 0 ? fmtNumInput(qtyB) : 'B';
            const kClass = qtyK === 0 ? 'is-placeholder' : '';
            const bClass = qtyB === 0 ? 'is-placeholder' : '';
            
            const namaSKU = p.nama_sku || 'Nama Produk N/A';
            const hargaKarton = p.harga_inc_ppn || 0;
            const boxPerKrt = p.box_per_krt || 12; 
            const productPrincipal = p.principal || 'N/A'; 
            const hasQty = inCart && (inCart.qtyKarton > 0 || inCart.qtyBox > 0);
            
            // Placeholder angka 0 untuk harga nett
            const subtotalText = fmtRp(0);
            const hargaNettText = fmtRp(0);
            const simulasiHargaNettKrtText = fmtRp(0);

            itemsHtml += `
            <div class="product-item" data-product-id="${sku}" data-search-keys="${sku} ${namaSKU} ${productPrincipal} ${g}">
                <strong>${sku} - ${namaSKU} </strong> 
                <p class="price-info">
                    ${fmtRp(hargaKarton)} / Krt | ${boxPerKrt} Box/Krt
                </p>
                <div class="quantity-controls input-qty">
                    <button class="btn-qty btn-minus" data-unit="krt" data-action="minus" data-sku="${sku}">-</button>
                    <input type="tel" value="${vK}" min="0" class="qty-input input-krt ${kClass}" data-unit="krt" data-sku="${sku}">
                    <button class="btn-qty btn-plus" data-unit="krt" data-action="plus" data-sku="${sku}">+</button>
                    <button class="btn-qty btn-minus" data-unit="box" data-action="minus" data-sku="${sku}" style="margin-left:8px;">-</button>
                    <input type="tel" value="${vB}" min="0" class="qty-input input-box ${bClass}" data-unit="box" data-sku="${sku}">
                    <button class="btn-qty btn-plus" data-unit="box" data-action="plus" data-sku="${sku}">+</button>
                </div>
                <div class="nett-summary product-card-pricing" data-sku-pricing="${sku}" style="display:${hasQty ? 'block' : 'none'};">
                    <div class="nett-item">
                        <span class="nett-label">Subtotal Nett (On Faktur):</span>
                        <span class="nett-value" id="subtotal-${sku}">${subtotalText}</span>
                    </div>
                    <div class="nett-item">
                        <span class="nett-label">Harga Nett/Krt (On Faktur):</span>
                        <span class="nett-value" id="harganett-${sku}">${hargaNettText}</span>
                    </div>
                    <div class="nett-item" style="border-top: 1px dashed #ddd; padding-top: 5px;">
                        <span class="nett-label" style="font-weight: 500; color: var(--success-color);">Simulasi Nett/Krt (Setelah Reward):</span>
                        <span class="nett-value" id="simulasi-nett-${sku}" style="color: var(--success-color);">${simulasiHargaNettKrtText}</span>
                    </div>
                </div>
            </div>
            `;
        }); 

        // Cek ketersediaan strata untuk tombol header
        // Gunakan window.filterStrata yang sudah ada
        const applicableStrata = (typeof window.filterStrata === 'function') 
                                 ? window.filterStrata(g, allPromosStrata, context) 
                                 : [];
        
        // Logika Tombol Strata: Hanya aktif jika ada promo DAN Tipe Toko sudah dipilih
        const strataDisabled = applicableStrata.length === 0 || !context.selectedType;
        const title = !context.selectedType 
                      ? 'Pilih Tipe Toko terlebih dahulu' 
                      : 'Tidak ada promo Strata aktif untuk grup ini';

        const initialExpanded = 'false';
        const initialMaxHeight = '0';
        const initialPadding = '0 15px';

        menuContainer.innerHTML += `
        <div class="accordion-group" data-group-name="${g}">
            <div class="accordion-header ${isFokus ? 'grup-fokus' : ''}" id="group-header-${g}" role="button" aria-expanded="${initialExpanded}" aria-controls="group-body-${g}">
                <span class="group-title-text">&#9660; ${g}</span> 
                <div class="header-right-side">
                    <button class="btn-strata-header" data-stratagroup="${g}" 
                            ${strataDisabled ? `disabled title="${title}"` : ''} 
                            style="display:${applicableStrata.length === 0 ? 'none' : 'block'};">
                        Strata
                    </button> 
                    </div>
            </div>
            <div class="accordion-content" id="group-body-${g}" aria-labelledby="group-header-${g}" style="max-height:${initialMaxHeight}; padding:${initialPadding};">
                ${itemsHtml}
            </div>
        </div>`;
    } 
    
    // Re-attach Event Listeners (Accordion & Tombol Strata)
    document.querySelectorAll('.accordion-header').forEach(header => {
        header.addEventListener('click', (e) => {
            if (e.target.closest('.btn-strata-header')) return; 
            const body = header.nextElementSibling; 
            const isExpanded = header.getAttribute('aria-expanded') === 'true';
            if (body) {
                header.setAttribute('aria-expanded', !isExpanded);
                if (isExpanded) {
                    body.style.maxHeight = 0;
                    body.style.padding = '0 15px';
                } else {
                    body.style.maxHeight = '1000px'; 
                    body.style.padding = '10px 15px'; 
                }
            }
        });
    });

    document.querySelectorAll('.btn-strata-header').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            // Pastikan fungsi showStrataModal ada di app.js
            if(typeof showStrataModal === 'function') showStrataModal(btn.dataset.stratagroup);
        });
    });
    
    // Update UI harga (jika keranjang ada isi)
    if(typeof batchUpdateUI === 'function') batchUpdateUI();
}
    // ========================================================
    // === FUNGSI ORKESTRATOR (BATCH UPDATE UI)
    // ========================================================
    
    function batchUpdateUI() {
        // [PERBAIKAN] Cek Tipe Toko sebelum kalkulasi
        const { selectedType } = AppStore.getContext();
        if (!selectedType) {
            // Jika Tipe Toko belum dipilih, jangan jalankan kalkulasi promo.
            // Cukup render keranjang kosong (jika ada) dan simpan.
            const keranjang = AppStore.getCart();
            if (keranjang.size === 0) {
                 daftarKeranjangEl.innerHTML = '<p style="text-align: center; color: #666;">Keranjang masih kosong.</p>';
            }
            // Jangan panggil updateAllProductCardSummaries() karena harga promo belum valid
            saveCartToLocalStorage();
            return;
        }

        const summary = window.calculateOrderSummary(); 
        renderKeranjang(summary); 
        updateAllProductCardSummaries(summary); 
        saveCartToLocalStorage();
    }
    
    // ========================================================
    // === AUTH STATE & SYNC MASTER DATA (Poin 4 & 5)
    // ========================================================

    async function tampilkanModalWelcome(userData, picData) {
        // [Poin 4 & 5] Simpan identitas user ke AppStore
        AppStore.setUser(userData, picData);
        
        loadCartFromLocalStorage(); 

        const collectionsToCheck = [
            { name: 'roles', vers_key: 'roles_version' },
            { name: 'products', vers_key: 'products_version' }, 
            { name: 'promos_strata', vers_key: 'promos_strata_version' },
            { name: 'deal_khusus', vers_key: 'deal_khusus_version' }, 
            { name: 'promos_reguler', vers_key: 'promos_reguler_version' }, 
            { name: 'promos_cod', vers_key: 'promos_cod_version' },
            { name: 'sku_priorities', vers_key: 'sku_priorities_version' },
            { name: 'pic_history', vers_key: 'pic_history_version' },
        ];
        
        const syncPromises = collectionsToCheck.map(c => syncCollectionData(c.name, c.vers_key));
        const syncResults = await Promise.all(syncPromises);
        
        if (modalProceedButton) {
            modalProceedButton.removeEventListener('click', handleCloseModalOnly);
            modalProceedButton.removeEventListener('click', handleCloseModalAndProceed);
            modalProceedButton.addEventListener('click', handleCloseModalAndProceed);
            
            modalProceedButton.innerText = 'OK';
            modalProceedButton.classList.remove('btn-secondary');
            modalProceedButton.classList.add('btn-danger');
        }

        if (modalTitleEl) {
            modalTitleEl.innerText = `✅ Login Berhasil!`;
            modalTitleEl.style.color = 'var(--success-color)';
        }

        if (userNameEl) {
            const { currentUserData, currentPICData } = AppStore.getIdentity();
            const kdSales = currentUserData.KD_SALES || 'N/A';
            const nama = currentPICData.NAMA || 'Pengguna N/A';
            const type = currentUserData.TYPE || 'N/A';
            userNameEl.innerText = `${kdSales}-${nama} | ${type}`;
        }
        
        if (modalRoleDetailsEl) {
            const { currentPICData } = AppStore.getIdentity();
            const { userZona } = AppStore.getContext(); 
            
            modalRoleDetailsEl.innerHTML = `
                <div class="welcome-focus-container">
                    <span class="welcome-text">Selamat Datang,</span>
                    <span class="user-focus-name">${currentPICData.NAMA}</span>
                    <span class="focus-reminder">Zona Harga Awal:</span>
                    <span class="focus-details">${userZona || 'N/A'}</span>
                </div>
                <div class="sync-status-container">
                    <h4>Status Pembaruan Data Master:</h4>
                    <div id="collection-sync-results">
                        ${syncResults.join('')}
                    </div>
                </div>
            `;
        } 
        
        if (roleDetailsModal) roleDetailsModal.style.display = 'block';
        
        setupSimulationUI(); 
        switchTab('produk'); 
    }

    function tampilkanHalamanLogin() {
        if (roleDetailsModal) {
            roleDetailsModal.style.display = 'none';
        }
        if (mainAppContainer) {
            mainAppContainer.style.display = 'none';
        }
        if (loginContainer) {
            loginContainer.style.display = 'flex';
        }
        
        if (summaryToggleBarEl) {
            summaryToggleBarEl.style.display = 'none';
        }
        
        initLoginDropdowns(); 
    }

    window.auth.onAuthStateChanged(async (user) => { 
        const loadingScreen = document.getElementById('loading');
        if(loadingScreen) loadingScreen.style.display = 'block';

        if (user) {
            const roleId = user.email.split('@')[0];
            try {
                const roleSnapshot = await window.db.collection("roles")
                    .where("ROLE_ID", "==", roleId).limit(1).get();

                const picSnapshot = await window.db.collection("pic_history") 
                    .where("ROLE_ID", "==", roleId).orderBy("TGL_EFEKTIF", "desc").limit(1).get();
                
                if (roleSnapshot.empty || picSnapshot.empty) {
                    throw new Error("Data user (role/pic) tidak lengkap.");
                }

                tampilkanModalWelcome(roleSnapshot.docs[0].data(), picSnapshot.docs[0].data());

            } catch (error) {
                console.error("Gagal memuat data user saat auth state change:", error);
                
                if (error.message.includes("Data user (role/pic) tidak lengkap.")) {
                    console.warn("Data user (role/pic) tidak ditemukan. Logout paksa.");
                    handleLogout();
                } else {
                    console.error("Error jaringan/database sementara terdeteksi. User TIDAK di-logout.", error.message);
                    showConfirmationModal(
                        '⚠️ Peringatan: Gagal Sinkronisasi', 
                        'Gagal mengambil data user (role/pic) saat verifikasi. Ini bisa jadi masalah koneksi sementara.' + 
                        ' Aplikasi mungkin tidak stabil. Coba muat ulang halaman.' +
                        '\n\nError: ' + error.message, 
                        null,
                        'Tutup'
                    );
                    if (loadingScreen) {
                        loadingScreen.style.display = 'none';
                    }
                }
            }

        } else {
            tampilkanHalamanLogin();
        }
        if(loadingScreen) loadingScreen.style.display = 'none';
    });

    // ========================================================
    // === LOGIKA RENDER PROMO (GABUNGAN)
    // ========================================================
    
    function renderAllPromotions() {
        renderRegulerPromoTable(); 
        renderDealKhususTable(); 
        renderCODPromoTable();   
        renderStrataSummary(); 
    }

    /**
     * [GABUNGAN] Menggunakan logika .sort() dari app.js lama
     * dan diadaptasi ke AppStore.
     */
    /**
 * [REVISI TAMPILAN] Render Tabel Promo Reguler (Show ALL Match)
 * Menampilkan SEMUA promo yang cocok dengan area, diurutkan berdasarkan prioritas.
 * (Khusus Depo paling atas, lalu Region, lalu Nasional).
 */
/**
 * [REVISI FINAL] Render Tabel Promo Reguler
 * Logika:
 * 1. SCOPE: Prioritaskan Area Spesifik (Jika ada Depo, Nasional hidden).
 * 2. TIER: Tampilkan SEMUA tingkatan target dalam Scope pemenang tersebut.
 */
function renderRegulerPromoTable() {
    if (!globalPromoContainer) return;
    const { selectedType, userZona, userRegion, userDepo } = AppStore.getContext();
    const allPromos = AppStore.getMasterPromo('reguler');

    if (!selectedType) {
        globalPromoContainer.innerHTML = '<h4>Promo Reguler</h4><p><i>Pilih Tipe Toko untuk melihat promo.</i></p>';
        return;
    }

    // --- LANGKAH 1: Ambil Kandidat (Cocok Area) ---
    let candidates = allPromos.filter(promo => {
        const diskon = parseFloat(promo.diskon); 
        return promo.principal && !isNaN(diskon) && 
               isAreaMatch(promo.type, selectedType) &&
               isAreaMatch(promo.region, userRegion) &&
               isAreaMatch(promo.depo, userDepo) &&
               isAreaMatch(promo.zona, userZona);
    });

    if (candidates.length === 0) {
        globalPromoContainer.innerHTML = `<h4>Promo Reguler</h4><p style="font-size: 0.9em; color: #6c757d;">Tidak ada Promo Reguler aktif untuk Area Anda.</p>`;
        return;
    }

    // --- LANGKAH 2: Grouping per Principal & Cari Scope Tertinggi ---
    const groups = {};

    candidates.forEach(promo => {
        // NORMALISASI KEY: Hapus spasi, uppercase.
        // Agar "MEIJI, KSNI" dan "MEIJI,KSNI" dianggap grup yang sama.
        let rawKey = Array.isArray(promo.principal) ? promo.principal.join(',') : String(promo.principal);
        const key = rawKey.replace(/\s/g, '').toUpperCase(); // Hapus spasi total

        if (!groups[key]) {
            groups[key] = {
                maxScore: -1,
                promos: []
            };
        }

        // Simpan promo ke grup
        groups[key].promos.push(promo);

        // Update Skor Tertinggi di grup ini
        const score = window.getPromoSpecificityScore(promo);
        if (score > groups[key].maxScore) {
            groups[key].maxScore = score;
        }
    });

    // --- LANGKAH 3: Filter Pemenang (Hanya Scope Tertinggi) ---
    let finalDisplayList = [];

    Object.keys(groups).forEach(key => {
        const group = groups[key];
        // Hanya ambil promo yang skornya SAMA dengan maxScore grup ini
        // Contoh: MaxScore 4 (Depo). Maka promo Regional (3) dibuang.
        // Tapi sesama Depo (Tier 1jt, 5jt) skornya sama-sama 4, jadi AMAN (Tetap tampil).
        const winners = group.promos.filter(p => window.getPromoSpecificityScore(p) === group.maxScore);
        
        finalDisplayList.push(...winners);
    });

    // --- LANGKAH 4: Sorting (Principal A-Z, lalu Target Kecil ke Besar) ---
    finalDisplayList.sort((a, b) => {
        const pA = Array.isArray(a.principal) ? a.principal[0] : String(a.principal);
        const pB = Array.isArray(b.principal) ? b.principal[0] : String(b.principal);
        
        // 1. Abjad Principal
        if (pA.localeCompare(pB) !== 0) return pA.localeCompare(pB);
        
        // 2. Target Bruto (Agar berurutan 1jt, 2jt, 5jt)
        return (parseFloat(a.nilai_bruto)||0) - (parseFloat(b.nilai_bruto)||0);
    });

    // --- LANGKAH 5: Render HTML ---
    let html = `
        <h4>Promo Reguler</h4>
        <style>
            .reguler-promo-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.85em; }
            .reguler-promo-table th, .reguler-promo-table td { border: 1px solid #dee2e6; padding: 6px 8px; text-align: left; }
            .reguler-promo-table th { background-color: #007bff; color: white; font-weight: 600; }
            .reguler-promo-table td:last-child { font-weight: bold; text-align: center; }
            .badge-depo { background: #28a745; color: white; padding: 2px 5px; border-radius: 3px; font-size: 0.75em; margin-left: 5px; font-weight: normal; }
        </style>
        
        <div style="background: #e9f5ff; padding: 8px; border-radius: 4px; font-size: 0.85em; color: #007bff; margin-bottom: 10px;">
            Menampilkan promo terbaik yang berlaku spesifik untuk wilayah Anda.
        </div>
        
        <table class="reguler-promo-table">
            <thead>
                <tr>
                    <th style="width: 40%;">Principal & Lingkup</th>
                    <th>Target Bruto (DPP)</th>
                    <th style="width: 20%; text-align: center;">Diskon</th>
                </tr>
            </thead>
            <tbody>
    `;

    finalDisplayList.forEach(promo => {
        let principalLabel = Array.isArray(promo.principal) ? promo.principal.join(', ') : promo.principal;
        
        const score = window.getPromoSpecificityScore(promo);
        let badge = '';
        // Beri badge hanya jika ini promo spesifik (bukan nasional)
        if (score >= 4) badge = '<span class="badge-depo">Khusus Depo</span>';
        else if (score >= 3) badge = '<span class="badge-depo" style="background:#17a2b8;">Regional</span>';

        const requiredBruto = fmtRp(promo.nilai_bruto); 
        const discountRate = (parseFloat(promo.diskon) * 100).toFixed(2) + '%'; 
        
        html += `
            <tr>
                <td>${principalLabel} ${badge}</td>
                <td>${requiredBruto}</td>
                <td>${discountRate}</td>
            </tr>
        `;
    });
    
    html += `</tbody></table>`;
    globalPromoContainer.innerHTML = html;
}
    /**
     * [GABUNGAN] Menggunakan logika .reduce() (grouping) dari app.js lama
     * dan diadaptasi ke AppStore.
     */
    function renderDealKhususTable() {
    if (!loyaltyPromoContainer) return; 
    const { selectedType, userZona, userRegion, userDepo } = AppStore.getContext();
    const allDeals = AppStore.getMasterPromo('deal_khusus');

    if (!selectedType) {
        loyaltyPromoContainer.innerHTML = '<h4>Deal Khusus & Loyalti</h4><p><i>Pilih Tipe Toko untuk melihat promo.</i></p>';
        return;
    }
    if (allDeals.length === 0) { 
        loyaltyPromoContainer.innerHTML = '<h4>Deal Khusus & Loyalti</h4><p>Data tidak tersedia.</p>';
        return;
    }

    // --- LANGKAH 1: Ambil Kandidat (Cocok Area) ---
    let candidates = allDeals.filter(d => 
        isAreaMatch(d.type || "", selectedType) &&
        isAreaMatch(d.region, userRegion) &&
        isAreaMatch(d.depo, userDepo) &&
        isAreaMatch(d.zona, userZona)
    );

    if (candidates.length === 0) {
        loyaltyPromoContainer.innerHTML = `<h4>Deal Khusus / Loyalti</h4><p style="font-size: 0.9em; color: #6c757d;">Tidak ada program aktif untuk Tipe **${selectedType || 'ALL'}** / Zona **${userZona || 'ALL'}**.</p>`; 
        loyaltyPromoContainer.style.display = 'block'; 
        return;
    }

    // --- LANGKAH 1.5: CEK LEVEL PROGRAM (NASIONAL VS LOKAL) ---
    // Kita cek per PROGRAM (misal: "LOYALTI").
    // Jika di program "LOYALTI" ada data Depo, maka data "LOYALTI" Nasional harus dibuang semua.
    
    const maxScorePerProgram = new Map();
    
    // Cek skor tertinggi yang ada di setiap Nama Program
    candidates.forEach(item => {
        const progName = (item.ket_program || 'LAIN').toUpperCase().trim();
        const score = window.getPromoSpecificityScore(item);
        const currentMax = maxScorePerProgram.get(progName) || 0;
        if (score > currentMax) {
            maxScorePerProgram.set(progName, score);
        }
    });

    // Filter Kandidat: Buang yang levelnya di bawah level tertinggi programnya
    candidates = candidates.filter(item => {
        const progName = (item.ket_program || 'LAIN').toUpperCase().trim();
        const score = window.getPromoSpecificityScore(item);
        const maxScoreInThisProgram = maxScorePerProgram.get(progName) || 0;

        // ATURAN EKSKLUSIF:
        // Jika program ini punya data Depo (MaxScore=4), maka data Nasional (Score=0) DIBUANG.
        // Data harus punya skor yang sama dengan MaxScore program tersebut.
        return score === maxScoreInThisProgram;
    });

    // --- LANGKAH 2: Kompetisi Tie-Breaker (Sama seperti sebelumnya) ---
    const bestDealsMap = new Map();

    const getCompetitionKey = (item) => {
        const program = (item.ket_program || '').toUpperCase().trim();
        if (program === 'LOYALTI') {
            return `LOYALTI_${(item.kelas || 'NA').toUpperCase().trim()}`;
        } else {
            const p = (item.principal || 'ALL').toUpperCase().trim();
            const g = (item.group || 'ALL').toUpperCase().trim();
            return `DEAL_${p}_${g}`;
        }
    };

    candidates.forEach(item => {
        const key = getCompetitionKey(item);
        const score = window.getPromoSpecificityScore(item);
        const value = Math.max(parseFloat(item.disc) || 0, parseFloat(item.pot) || 0);

        const currentBest = bestDealsMap.get(key);
        if (!currentBest) {
            bestDealsMap.set(key, { promo: item, score: score, value: value });
        } else {
            // Karena di Langkah 1.5 kita sudah memfilter hanya skor tertinggi,
            // di sini skor pasti sama. Kita tinggal adu Value.
            if (value > currentBest.value) {
                bestDealsMap.set(key, { promo: item, score: score, value: value });
            }
        }
    });

    // --- LANGKAH 3: Ambil Pemenang & Render (Sama seperti sebelumnya) ---
    const finalWinners = Array.from(bestDealsMap.values()).map(x => x.promo);

    loyaltyPromoContainer.style.display = 'block';

    const groupedDeals = finalWinners.reduce((acc, deal) => {
        const programName = deal.ket_program || 'LAIN-LAIN';
        (acc[programName] ||= []).push(deal);
        return acc;
    }, {});

    let html = `
        <h4>Program Deal Khusus / Loyalti (Efektif)</h4>
        <div style="margin-bottom:10px; font-size:0.85em; color:#28a745;">
            <i class="fas fa-check-circle"></i> Menampilkan promo terbaik spesifik wilayah Anda.
        </div>
        <style>
            .deal-khusus-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.85em; }
            .deal-khusus-table th, .deal-khusus-table td { border: 1px solid #dee2e6; padding: 8px; text-align: left; }
            .deal-khusus-table th { background-color: #28a745; color: white; font-weight: 600; text-align: center; }
            .deal-khusus-subheader { 
                font-weight: bold; 
                color: var(--header-color); 
                background-color: #f8f9fa; 
                padding: 8px;
                margin-top: 15px;
                border-top: 2px solid #28a745;
            }
            .badge-depo { background: #28a745; color: white; padding: 2px 5px; border-radius: 3px; font-size: 0.75em; margin-left: 5px; font-weight: normal; }
        </style>
    `;
    
    const programKeys = Object.keys(groupedDeals).sort();

    for (const programName of programKeys) {
        html += `<div class="deal-khusus-subheader">Program: ${programName}</div>`;
        html += `
        <table class="deal-khusus-table">
            <thead>
                <tr>
                    <th>Principal</th>
                    <th>Group</th>
                    <th>Kelas</th>
                    <th>Reward</th>
                    <th>Keterangan</th>
                </tr>
            </thead>
            <tbody>
        `;
        
        groupedDeals[programName].sort((a,b) => (a.principal||'').localeCompare(b.principal||'') || (a.group||'').localeCompare(b.group||''));

        groupedDeals[programName].forEach(deal => {
            const principal = deal.principal || 'ALL';
            const group = deal.group || 'ALL';
            const namaKelas = deal.kelas || '-';
            
            const score = window.getPromoSpecificityScore(deal);
            let badge = '';
            if (score >= 4) badge = '<span class="badge-depo">Khusus Depo</span>';
            else if (score >= 3) badge = '<span class="badge-depo" style="background:#17a2b8;">Regional</span>';
            
            let rewardText = '-';
            if (parseFloat(deal.disc) > 0) {
                rewardText = `<strong>${(parseFloat(deal.disc) * 100).toFixed(2)}%</strong>`;
            } else if (parseFloat(deal.pot) > 0) {
                rewardText = `<strong>${fmtRp(deal.pot)}</strong> /Krt`;
            }
            
            html += `
                <tr>
                    <td>${principal} ${badge}</td>
                    <td>${group}</td>
                    <td>${namaKelas}</td>
                    <td style="text-align:center; color:#155724;">${rewardText}</td>
                    <td>${deal.keterangan || ''}</td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
    } 

    loyaltyPromoContainer.innerHTML = html; 
}
    
    /**
     * [GABUNGAN] Menggunakan logika .sort() dari app.js lama
     * dan diadaptasi ke AppStore.
     */
    function renderCODPromoTable() {
        if (!codPromoContainer) return;
        const { selectedType, userZona, userRegion, userDepo } = AppStore.getContext();
        const allPromos = AppStore.getMasterPromo('cod');

        if (!selectedType) {
            codPromoContainer.innerHTML = '<h4>Diskon COD</h4><p><i>Pilih Tipe Toko untuk melihat promo.</i></p>';
            return;
        }
        if (allPromos.length === 0) {
            codPromoContainer.innerHTML = '<h4>Diskon COD</h4><p>Data tidak tersedia.</p>';
            return; 
        }
        const applicablePromos = allPromos.filter(promo =>
            isAreaMatch(promo.type || "", selectedType) &&
            isAreaMatch(promo.region, userRegion) &&
            isAreaMatch(promo.depo, userDepo) &&
            isAreaMatch(promo.zona, userZona)
        );

        if (applicablePromos.length === 0) {
            codPromoContainer.innerHTML = `<h4>Diskon COD</h4><p style="font-size: 0.9em; color: #6c757d;">Tidak ada program Diskon Pembayaran (COD/TOP) yang berlaku untuk Tipe **${selectedType || 'ALL'}** / Zona **${userZona || 'ALL'}**.</p>`; 
            codPromoContainer.style.display = 'block'; 
            return;
        }
        
        codPromoContainer.style.display = 'block';
        
        // --- Logika Sort dari app.js lama ---
        applicablePromos.sort((a, b) => (parseFloat(a.nilai_bruto) || 0) - (parseFloat(b.nilai_bruto) || 0)); 
        // --- Batas Logika Sort ---

        let html = `
            <h4>Diskon COD (Tipe: ${selectedType || 'ALL'} / Zona: ${userZona || 'ALL'})</h4>
            <style>
                .cod-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 0.85em; }
                .cod-table th, .cod-table td { border: 1px solid #dee2e6; padding: 8px; text-align: left; }
                .cod-table th { background-color: #ffc107; color: #333; font-weight: 600; text-align: center; }
            </style>
            <table class="cod-table">
                <thead>
                    <tr>
                        <th>Tipe Pembayaran</th>
                        <th>Target Bruto (Min)</th>
                        <th>Diskon (%)</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        applicablePromos.forEach(promo => {
            const tipeBayar = promo.tipe_bayar || 'COD';
            const brutoMin = fmtRp(promo.nilai_bruto); 
            const potongan = (parseFloat(promo.diskon) * 100).toFixed(2) + '%'; 
            
            html += `
                <tr>
                    <td>${tipeBayar}</td>
                    <td>${brutoMin}</td>
                    <td>${potongan}</td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        `;
        codPromoContainer.innerHTML = html;
    }

    function fmtQty(n) {
    return parseFloat(n).toString();
}

// Ganti fungsi renderStrataSummary yang lama dengan ini:
function renderStrataSummary() {
    if (!strataSummaryContainer) return;
    
    const allPromosStrata = AppStore.getMasterPromo('strata');
    const allProducts = AppStore.getAllProducts();
    const context = AppStore.getContext(); 

    if (!context.selectedType) {
        strataSummaryContainer.innerHTML = '<h4>Ringkasan Promo Strata</h4><p><i>Pilih Tipe Toko untuk melihat promo.</i></p>';
        return;
    }
    
    if (allProducts.length === 0 || allPromosStrata.length === 0)  {
        strataSummaryContainer.innerHTML = '<h4>Ringkasan Promo Strata</h4><p>Data tidak tersedia.</p>';
        return;
    }

    const activeProducts = allProducts.filter(p => p.status === 'AKTIF' && isAreaMatch(p.zona_harga, context.userZona));
    const uniqueGroups = [...new Set(activeProducts.map(p => p.group || 'LAIN-LAIN'))].sort();
    
    let allStrataHtml = '';
    let foundStrata = false;
    
    uniqueGroups.forEach(groupName => {
        // 1. Ambil semua kandidat
        let candidates = window.filterStrata(groupName, allPromosStrata, context);
        
        if (candidates.length > 0) {
            // 2. [BARU] FILTER SCOPE: Cari Skor Tertinggi (Depo vs Nasional)
            let maxScore = -1;
            candidates.forEach(p => {
                const s = window.getPromoSpecificityScore(p);
                if(s > maxScore) maxScore = s;
            });

            // 3. Hanya ambil yang skornya setara Max (Buang yang kalah)
            const bestScopeStrata = candidates.filter(p => window.getPromoSpecificityScore(p) === maxScore);
            
            if (bestScopeStrata.length > 0) {
                foundStrata = true;
                allStrataHtml += `
                    <h5 style="margin-top: 20px; color: var(--header-color); border-bottom: 1px dashed #ccc; padding-bottom: 5px;">Group: ${groupName}</h5>
                    <table class="strata-promo-table" style="font-size: 0.85em; width:100%; border-collapse:collapse;">
                        <thead>
                            <tr>
                                <th style="background-color:#495057; color:white; padding: 6px;">Min. Qty</th>
                                <th style="background-color:#495057; color:white; padding: 6px;">Min. SKU</th>
                                <th style="background-color:#495057; color:white; padding: 6px;">Potongan</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                bestScopeStrata.forEach(promo => {
                    const potonganLabel = `${fmtRp(promo.potongan)} / ${promo.satuan}`;
                    const qtyLabel = `${fmtQty(promo.qty_min)} ${promo.satuan}`; 
                    const note = (parseFloat(promo.qty_min) < 1) ? '<br><span style="font-size:0.8em; color:#e67e22;">(Pecahan)</span>' : '';
                    // [VISUAL] Tambahkan badge jika ini promo Depo
                    const isDepo = window.getPromoSpecificityScore(promo) >= 4;
                    const badge = isDepo ? '<span style="font-size:0.7em; background:#28a745; color:white; padding:1px 3px; border-radius:2px; margin-left:3px;">Depo</span>' : '';

                    allStrataHtml += `
                        <tr style="border: 1px solid #eee;">
                            <td style="text-align:center;"><strong>${qtyLabel}</strong> ${note}</td>
                            <td style="text-align:center;">${promo.sku_min} SKU</td>
                            <td style="text-align:right; color: var(--success-color); font-weight:bold;">${potonganLabel} ${badge}</td>
                        </tr>
                    `;
                });

                allStrataHtml += `</tbody></table>`;
            }
        }
    });

    if (!foundStrata) {
        strataSummaryContainer.innerHTML = `<h4>Ringkasan Promo Strata</h4><p style="font-size: 0.9em; color: #6c757d;">Tidak ada promo Strata yang berlaku.</p>`;
    } else {
        strataSummaryContainer.innerHTML = `<h4>Ringkasan Promo Strata per Grup</h4>` + allStrataHtml;
    }
}

// Ganti fungsi renderStrataTable yang lama dengan ini:
function renderStrataTable(applicableStrata) {
    if (applicableStrata.length === 0) {
        return `<p style="text-align:center; padding:15px; background:#f8d7da; color:#721c24; border-radius:6px;">Tidak ada tier promo Strata yang berlaku saat ini.</p>`;
    }
    
    const allDates = applicableStrata.map(p => new Date(p.tgl_efektif)).filter(d => d instanceof Date && !isNaN(d));
    const earliestDate = allDates.length > 0 ? new Date(Math.min(...allDates)) : null;
    const latestDate = allDates.length > 0 ? new Date(Math.max(...allDates)) : null; // Fix: Gunakan allDates juga
    
    const formatTgl = (dateObj) => dateObj ? dateObj.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A';
    
    let html = `
        <div class="strata-periode">
            Periode: <strong>${formatTgl(earliestDate)}</strong> s/d <strong>${formatTgl(latestDate)}</strong>
        </div>

        <table class="strata-table">
            <thead>
                <tr>
                    <th>Min. Qty</th>
                    <th>Min. SKU</th>
                    <th>Potongan</th>
                    <th>Info</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    applicableStrata.forEach((promo) => {
        const potonganLabel = `${fmtRp(promo.potongan)} / ${promo.satuan}`;
        const qtyLabel = `${fmtQty(promo.qty_min)} ${promo.satuan}`;
        const mixText = promo.mix === 'Y' ? '<span style="color:green; font-weight:bold;">Bisa Mix</span>' : '<span style="color:red;">Wajib Utuh</span>';

        html += `
            <tr>
                <td><strong>${qtyLabel}</strong></td>
                <td>${promo.sku_min} SKU</td>
                <td style="color:var(--success-color); font-weight:bold;">${potonganLabel}</td>
                <td>${mixText}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
        <div style="margin-top:15px; padding:10px; background:#fff3cd; border:1px solid #ffeeba; border-radius:4px; font-size:0.85em; color:#856404;">
           <strong>ℹ️ Catatan Perhitungan:</strong><br>
           Jika total order (Mix Varian) mencapai <strong>1 Karton atau lebih</strong>, maka hitungan desimal akan <strong>dibulatkan ke bawah</strong> (dihitung Karton Utuh).
        </div>
    `;
    return html;
}

    function showStrataModal(groupName) {
    console.log(`[STRATA] Membuka modal untuk Group: ${groupName}`);
    const allPromosStrata = AppStore.getMasterPromo('strata');
    const context = AppStore.getContext();
    
    // 1. Ambil Kandidat
    const candidates = window.filterStrata(groupName, allPromosStrata, context);
    
    // 2. [BARU] FILTER SCOPE: Cari Skor Tertinggi
    let maxScore = -1;
    candidates.forEach(p => {
        const s = window.getPromoSpecificityScore(p);
        if(s > maxScore) maxScore = s;
    });

    // 3. Hanya ambil pemenang
    const applicableStrata = candidates.filter(p => window.getPromoSpecificityScore(p) === maxScore);
    
    if(modalProceedButton) {
        modalProceedButton.removeEventListener('click', handleCloseModalAndProceed);
        modalProceedButton.removeEventListener('click', handleCloseModalOnly);
        modalProceedButton.addEventListener('click', handleCloseModalOnly);
        
        modalProceedButton.innerText = 'OK';
        modalProceedButton.classList.remove('btn-danger');
        modalProceedButton.classList.add('btn-secondary');
    }
    
    if (modalRoleDetailsEl) {
        modalRoleDetailsEl.innerHTML = `<div class="strata-details-container">
                                            ${renderStrataTable(applicableStrata)}
                                        </div>`;
    }
    if (modalTitleEl) {
            modalTitleEl.innerText = `Detail Strata: ${groupName}`;
            modalTitleEl.style.color = 'var(--primary-color)';
    }
    if (roleDetailsModal) roleDetailsModal.style.display = 'block';
}

    // ========================================================
    // === LOGIKA FAKTUR (GABUNGAN)
    // ========================================================
    function showFakturModal() {
        const keranjang = AppStore.getCart();
        if (keranjang.size === 0) {
            showConfirmationModal('❌ Gagal Faktur', 'Keranjang kosong, tidak bisa membuat faktur.', null, 'Tutup');
            return;
        }
        
        const summary = window.calculateOrderSummary();
        const items = summary.items;
        
        const { currentUserData, currentPICData } = AppStore.getIdentity();
        const { userRegion, userDepo, selectedType, selectedKelas } = AppStore.getContext();
        
        let fakturHtml = `
            <div class="faktur-header-info">
                <div class="info-line"><span class="info-label">Region</span><span class="info-separator">:</span><span>${userRegion || 'N/A'}</span></div>
                <div class="info-line"><span class="info-label">Depo</span><span class="info-separator">:</span><span>${userDepo || 'N/A'}</span></div>
                <div class="info-line"><span class="info-label">Sales</span><span class="info-separator">:</span><span>${currentPICData.NAMA || 'N/A'} (${currentUserData.KD_SALES || 'N/A'})</span></div>
                <div class="info-line"><span class="info-label">Tipe Toko</span><span class="info-separator">:</span><span>${selectedType || 'N/A'} ${selectedKelas ? `(${selectedKelas})` : ''}</span></div>
            </div>
            <table class="faktur-table">
                <thead>
                    <tr>
                        <th class="col-nama">Nama Produk</th>
                        <th class="col-qty">Qty (Krt)</th>
                        <th class="col-price">Harga Nett / Krt</th>
                        <th class="col-total">Subtotal Nett (Inc PPN)</th>
                    </tr>
                </thead>
                <tbody>
        `;

        items.forEach(item => {
            const product = item.product;
            const qtyKrtUtuh = item.qtyKarton;
            const qtyBoxPecahan = item.qtyBox;
            const totalFakturItem = item.totalOnFaktur;
            const qtyKrtRiil = window.getQtyKartonRiil(qtyKrtUtuh, qtyBoxPecahan, product.box_per_krt);
            const hargaNettPerKrtIncPpn = qtyKrtRiil > 0 ? totalFakturItem / qtyKrtRiil : 0;
            fakturHtml += `
                <tr>
                    <td class="item-name">${product.nama_sku}</td>
                    <td class="item-qty">${qtyKrtRiil.toFixed(2)}</td>
                    <td class="item-price-nett">${fmtRp(hargaNettPerKrtIncPpn)}</td>
                    <td class="item-total">${fmtRp(totalFakturItem)}</td>
                </tr>
            `;
        });

        fakturHtml += `</tbody></table><div class="faktur-summary">
                <div class="summary-row"><span class="summary-label">Total Bruto</span><span class="summary-value">${fmtRp(summary.totalBruto_DPP)}</span></div>
                <div class="summary-row discount-row"><span class="summary-label">(-) Potongan Reguler</span><span class="summary-value value-danger">- ${fmtRp(summary.totalPotonganReguler)}</span></div>
                <div class="summary-row discount-row"><span class="summary-label">(-) Potongan Strata</span><span class="summary-value value-danger">- ${fmtRp(summary.totalPotonganStrata_IncPPN)}</span></div>
                <div class="summary-row nett-dpp-row" style="border-top: 2px solid #333;"><span class="summary-label">Total DPP (Nett)</span><span class="summary-value">${fmtRp(summary.totalNett)}</span></div>
                <div class="summary-row"><span class="summary-label">(+) PPN (${(PPN_RATE * 100).toFixed(0)}%)</span><span class="summary-value">${fmtRp(summary.totalPpn)}</span></div>
                <div class="summary-row on-faktur-row" style="border-top: 2px solid #333;"><span class="summary-label">Total Faktur (Nett + PPN)</span><span class="summary-value">${fmtRp(summary.totalGrossPreCod)}</span></div>
                <div class="summary-row cod-cut discount-row"><span class="summary-label">(-) Potongan COD (${(summary.discRateCOD * 100).toFixed(2)}%)</span><span class="summary-value value-danger">- ${fmtRp(summary.totalPotonganCOD)}</span></div>
                <div class="summary-row discount-row" style="color:var(--success-color); font-weight:bold;"><span class="summary-label">(-) Voucher</span><span class="summary-value value-danger">- ${fmtRp(summary.nominalVoucher)}</span></div>
                <div class="summary-row grand-total" style="border-top: 2px solid #333; margin-top: 5px;"><span class="summary-label">FINAL TAGIHAN:</span><span class="summary-value">${fmtRp(summary.finalGrandTotal)}</span></div>
            </div>
        `;
        
        if (modalTitleEl) { modalTitleEl.innerText = "Simulasi Faktur"; }
        if (modalRoleDetailsEl) { modalRoleDetailsEl.innerHTML = fakturHtml; }
        if (modalProceedButton) { 
            modalProceedButton.removeEventListener('click', handleCloseModalAndProceed);
            modalProceedButton.removeEventListener('click', handleCloseModalOnly);
            modalProceedButton.addEventListener('click', handleCloseModalOnly);
            
            modalProceedButton.innerText = 'Tutup';
            modalProceedButton.classList.remove('btn-danger');
            modalProceedButton.classList.add('btn-secondary');
        }
        if (roleDetailsModal) roleDetailsModal.style.display = 'block';
    }


    // ========================================================
    // === MODAL DETAIL HARGA (GABUNGAN)
    // ========================================================
    /**
     * [GABUNGAN] Menggunakan logika rendering dari app.js lama
     * dan diadaptasi ke AppStore.
     */
    function showDetailHargaModal(sku) {
        
        const summaryData = window.calculateOrderSummary();
        const item = summaryData.items.find(i => i.sku === sku);

        if (!item) {
            console.error(`Tidak dapat menemukan item ${sku} di keranjang.`);
            showConfirmationModal('❌ Error', `Item ${sku} tidak ditemukan.`, null, 'Tutup');
            return;
        }

        const product = item.product;
        const boxPerKrt = product.box_per_krt || 12;
        const qtyRiilKrt = window.getQtyKartonRiil(item.qtyKarton, item.qtyBox, boxPerKrt);

        if (qtyRiilKrt === 0) {
             showConfirmationModal('❌ Error', 'Gagal memuat detail harga. Kuantitas item nol.', null, 'Tutup');
             return;
        }

        const { 
            hargaNettAkhirSimulasiKrt, 
            hargaOnFakturPerKrt, 
            discRateLoyalty, 
            potonganDealKhususKrt 
        } = getSimulasiRewardKrt(product, item);
        
        const { selectedKelas } = AppStore.getContext();
        const isLoyaltyClassValid = selectedKelas && 
                                    selectedKelas !== "-Tidak Ada Loyalti-" && 
                                    selectedKelas !== "-Pilih Kelas Loyalti-";
        
        // Kalkulasi per karton
        const hargaDasarKrt = product.harga_inc_ppn || 0;
        
        const discRegPerKrt_DPP = (item.nominalDiskonReguler / item.qtyBoxTotal) * boxPerKrt;
        const discRegPerKrt_IncPpn = discRegPerKrt_DPP * (1 + PPN_RATE);
        
        const discStrataPerKrt_IncPpn = (item.nominalDiskonStrata_IncPPN / item.qtyBoxTotal) * boxPerKrt;

        const hargaSetelahItemDiscKrt = hargaDasarKrt - discRegPerKrt_IncPpn - discStrataPerKrt_IncPpn;
        
        let discRateCOD = summaryData.discRateCOD || 0;
        
        const potonganCODPerKrt = hargaSetelahItemDiscKrt * discRateCOD;
        
        // Final Harga Nett On Faktur (Inc PPN)
        // const hargaNettOnFakturKrt = hargaSetelahItemDiscKrt - potonganCODPerKrt; // Ini sudah dihitung oleh helper
        
        // Hitung Reward Off-Faktur
        const potonganLoyaltyKrt = hargaSetelahItemDiscKrt * discRateLoyalty;
        
        const totalRewardOffFakturKrt = potonganLoyaltyKrt + potonganDealKhususKrt;

        let detailHtml = `
            <p style="text-align:center; font-size: 1.1em; margin-bottom: 15px;">
                Kuantitas: <strong>${item.qtyKarton} Krt</strong> & <strong>${item.qtyBox} Box</strong>
            </p>

            <table class="price-breakdown">
                <thead>
                    <tr><th colspan="2">Rincian Harga Nett On-Faktur (per Krt, Inc PPN)</th></tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="label">Harga Dasar (Inc PPN)</td>
                        <td class="value">${fmtRp(hargaDasarKrt)}</td>
                    </tr>
                    <tr>
                        <td class="label">Potongan Reguler</td>
                        <td class="value value-danger">- ${fmtRp(discRegPerKrt_IncPpn)}</td>
                    </tr>
                    <tr>
                        <td class="label">Potongan Strata</td>
                        <td class="value value-danger">- ${fmtRp(discStrataPerKrt_IncPpn)}</td>
                    </tr>
                    <tr>
                        <td class="label">Potongan COD (${(discRateCOD * 100).toFixed(2)}%)</td>
                        <td class="value value-danger">- ${fmtRp(potonganCODPerKrt)}</td>
                    </tr>
                    <tr class="final-total-row">
                        <td class="label">Harga Nett Akhir (On Faktur)</td>
                        <td class="value">${fmtRp(hargaOnFakturPerKrt)}</td>
                    </tr>
                </tbody>
            </table>

            <table class="price-breakdown" style="margin-top: 20px;">
                <thead>
                    <tr><th colspan="2">Simulasi Reward Off-Faktur (Bonus di luar Tagihan)</th></tr>
                </thead>
                <tbody>
                    <tr class="reward-row">
                        <td class="label">Reward Loyalti (${(discRateLoyalty * 100).toFixed(2)}%)</td>
                        <td class="value value-success">+ ${fmtRp(potonganLoyaltyKrt)}</td>
                    </tr>
                    <tr class="reward-row">
                        <td class="label">Reward Deal Khusus (Rp/Krt)</td>
                        <td class="value value-success">+ ${fmtRp(potonganDealKhususKrt)}</td>
                    </tr>
                    <tr class="final-total-row" style="background-color: #e6ffed;">
                        <td class="label" style="color:var(--success-color)">Simulasi Nett / Krt (Setelah Reward)</td>
                        <td class="value" style="color:var(--success-color)">${fmtRp(hargaNettAkhirSimulasiKrt)}</td>
                    </tr>
                </tbody>
            </table>
            
            ${!isLoyaltyClassValid ? `
                <div class="modal-info-box warning">
                    Reward Off-Faktur **Loyalty** (diskon %) tidak aktif karena "Kelas Loyalti" belum dipilih atau tidak valid.
                </div>
            ` : ''}
            <div class="modal-info-box info">
                *Reward off-faktur adalah estimasi bonus/potongan di luar faktur dan tidak mengurangi total tagihan.
            </div>
        `;

        modalTitleEl.innerText = `Rincian Harga: ${product.nama_sku}`;
        modalTitleEl.style.color = 'var(--primary-color)';
        
        modalRoleDetailsEl.innerHTML = detailHtml;

        if (modalProceedButton) {
            modalProceedButton.style.display = 'block'; 
            modalProceedButton.innerText = 'Tutup';
            modalProceedButton.classList.add('btn-secondary'); 
            modalProceedButton.classList.remove('btn-danger');
            
            modalProceedButton.removeEventListener('click', handleCloseModalAndProceed);
            modalProceedButton.removeEventListener('click', handleCloseModalOnly);
            modalProceedButton.addEventListener('click', handleCloseModalOnly);
        }
        
        roleDetailsModal.style.display = 'block';
    }


    // ========================================================
    // === LOGIKA RENDER KERANJANG (GABUNGAN)
    // ========================================================
    function renderKeranjang() {
        if (!daftarKeranjangEl) return;
        
        const { selectedType } = AppStore.getContext();
        if (!selectedType) {
            daftarKeranjangEl.innerHTML = '<p style="text-align: center; color: #666;">Silakan pilih Tipe Toko untuk memulai simulasi.</p>';
            if (summaryBarTotalEl) {
                summaryBarTotalEl.innerText = fmtRp(0);
            }
            return;
        }

        const summaryData = window.calculateOrderSummary();
        const context = AppStore.getContext();
        
        if (summaryData.items.length === 0) {
            daftarKeranjangEl.innerHTML = '<p style="text-align: center; color: #666;">Keranjang masih kosong.</p>';
            if (summaryBarTotalEl) {
                summaryBarTotalEl.innerText = fmtRp(0);
                if (summaryToggleBarEl && isMobile()) {
                    summaryToggleBarEl.style.display = 'block';
                }
            }
            return;
        }
        
        const allPromosStrata = AppStore.getMasterPromo('strata');
        const upsellingRecs = window.getStrataUpsellingRecommendations(allPromosStrata, context); 

        const groupedItems = {};
        summaryData.items.forEach(item => {
            const g = item.product.group || 'LAIN-LAIN';
            (groupedItems[g] ||= []).push(item);
        });

        let keranjangHtml = '';
        const order = [];
        const seen = new Set();
        CUSTOM_GROUP_ORDER.forEach(g => { if(groupedItems[g]){ order.push(g); seen.add(g);} });
        Object.keys(groupedItems).sort().forEach(g => { if(!seen.has(g)) order.push(g); });
        
        const { selectedKelas } = context;
        const isLoyaltyClassChosen = selectedKelas && selectedKelas !== "-Pilih Kelas Loyalti-" && selectedKelas !== "-Tidak Ada Loyalti-";
        const allPromosDealKhusus = AppStore.getMasterPromo('deal_khusus');

        order.forEach(g => {
            let maxPotonganDealKhususKrt = 0;
            if (allPromosDealKhusus.length > 0 && context.currentUserData) {
                try {
                    const applicableDeals = allPromosDealKhusus.filter(p => 
                        p.ket_program !== "LOYALTI" && (parseFloat(p.pot) || 0) > 0 && 
                        isAreaMatch(p.type, context.selectedType) && isAreaMatch(p.region, context.userRegion) &&
                        isAreaMatch(p.depo, context.userDepo) && isAreaMatch(p.zona, context.userZona) &&
                        isAreaMatch(p.group, g)
                    );
                    if (applicableDeals.length > 0) {
                        maxPotonganDealKhususKrt = Math.max(...applicableDeals.map(p => parseFloat(p.pot) || 0));
                    }
                } catch (e) { console.error("Gagal parse deal_khusus saat rendering grup:", e); }
            }
            
            const isDealKhususApplicable = maxPotonganDealKhususKrt > 0;
            const storedState = localStorage.getItem(`deal_khusus_state_${g}`);
            const isChecked = storedState === 'active'; 
            
            let groupHeaderContent = `<h4 class="cart-group-header">${g}</h4>`;
            if (isDealKhususApplicable && isLoyaltyClassChosen) {
                 groupHeaderContent = `
                    <h4 class="cart-group-header deal-khusus-group-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="group-title-text">${g}</span>
                        <div class="deal-khusus-toggle" title="Reward Off-Faktur Rp/Krt: ${fmtRp(maxPotonganDealKhususKrt)}/Krt" style="display: flex; align-items: center;">
                            <label for="deal-khusus-check-${g}" style="font-size: 0.85em; font-weight: 600; margin-right: 5px; color: var(--primary-color);">Deal Khusus</label>
                            <input type="checkbox" id="deal-khusus-check-${g}" data-group="${g}" ${isChecked ? 'checked' : ''} style="width: 16px; height: 16px;">
                        </div>
                    </h4>
                `;
            }
            keranjangHtml += `<div class="cart-group" data-cart-group="${g}" data-deal-khusus-state="${isChecked ? 'active' : 'inactive'}">${groupHeaderContent}`; 

            groupedItems[g].forEach(item => {
                const sku = item.sku;
                const product = item.product;
                const namaSKU = `${sku} - ${product.nama_sku || 'Nama Produk N/A'}`;
                const { hargaNettAkhirSimulasiKrt, hargaOnFakturPerKrt } = getSimulasiRewardKrt(product, item);
                const totalFaktur = item.totalOnFaktur;
                const qtyK = item.qtyKarton;
                const qtyB = item.qtyBox;
                const vK = qtyK > 0 ? fmtNumInput(qtyK) : 'K';
                const vB = qtyB > 0 ? fmtNumInput(qtyB) : 'B';
                const kClass = qtyK === 0 ? 'is-placeholder' : '';
                const bClass = qtyB === 0 ? 'is-placeholder' : '';

                keranjangHtml += `
                    <div class="cart-item" data-sku="${sku}">
                        <div class="cart-item-details">
                            <div class="cart-item-info">
                                <strong>${namaSKU}</strong>
                                <span class="qty-info">
                                    ${item.qtyKarton > 0 ? `${fmtNumInput(item.qtyKarton)} Krt` : ''} 
                                    ${item.qtyKarton > 0 && item.qtyBox > 0 ? ' & ' : ''}
                                    ${item.qtyBox > 0 ? `${fmtNumInput(item.qtyBox)} Box` : ''} 
                                    (${fmtNumInput(item.qtyBoxTotal)} Box total)
                                </span>
                                <div class="quantity-controls input-qty">
                                    <button class="btn-qty btn-minus" data-unit="krt" data-action="minus" data-sku="${sku}">-</button>
                                    <input type="tel" value="${vK}" min="0" class="qty-input input-krt ${kClass}" data-unit="krt" data-sku="${sku}">
                                    <button class="btn-qty btn-plus" data-unit="krt" data-action="plus" data-sku="${sku}">+</button>
                                    <button class="btn-qty btn-minus" data-unit="box" data-action="minus" data-sku="${sku}" style="margin-left:8px;">-</button>
                                    <input type="tel" value="${vB}" min="0" class="qty-input input-box ${bClass}" data-unit="box" data-sku="${sku}">
                                    <button class="btn-qty btn-plus" data-unit="box" data-action="plus" data-sku="${sku}">+</button>
                                </div>
                            </div>
                            <div class="cart-item-pricing">
                                <div class="cart-item-actions">
                                    <button class="btn-detail-harga" data-sku="${sku}">Detail</button>
                                    <button class="btn-danger cart-item-delete-btn" data-sku="${sku}">Hapus</button>
                                </div>
                            </div>
                        </div>
                        <div class="cart-item-summary-soft">
                            <div class="summary-line"><span class="summary-label-soft">Subtotal Nett (Inc PPN): <span> <span class="summary-value-highlight">${fmtRp(totalFaktur)}</span></div>
                            <div class="summary-line"><span class="summary-label-soft">Harga Nett / Krt (On Faktur):<span> <span class="summary-value-highlight">${fmtRp(hargaOnFakturPerKrt)}</span></div>
                            <div class="summary-line off-faktur"><span class="summary-label-soft">Simulasi Nett / Krt (Setelah Deal Khusus / Loyalti):<span> <span class="summary-value-highlight">${fmtRp(hargaNettAkhirSimulasiKrt)}</span></div>
                        </div>
                    </div>
                `;
            });
            
            if (upsellingRecs.has(g)) {
                const rec = upsellingRecs.get(g);
                const stats = rec.stats;
                let upsaleHtml = '';
                
                const currentStatus = rec.currentTier 
                    ? `Saat ini mencapai Strata Qty ${rec.currentTier.qty_min} ${rec.currentTier.satuan} dengan Potongan ${fmtRp(rec.currentPotongan)}/${rec.currentTier.satuan}.`
                    : 'Belum mencapai Strata apapun di grup ini.';
                upsaleHtml += `<p style="font-size: 0.85em; margin-top: 10px; color: #495057;">${currentStatus}</p>`;
                                
                if (rec.recs.qty && rec.recs.qty.gapQtyCeil > 0) {
                    const next = rec.recs.qty;
                    upsaleHtml += `
                        <div style="background-color: #e9f5ff; border: 1px solid #cce5ff; padding: 10px; border-radius: 4px; margin-top: 8px;">
                            <span style="font-size: 0.9em;">Tambah 
                            <strong>${next.gapQtyCeil} ${next.satuan}</strong> 
                            untuk mencapai potensi Potongan hingga 
                            <strong>${fmtRp(next.potongan)}/${next.satuan}</strong>.
                            </span>
                        </div>
                    `;
                }
                
                if (rec.recs.sku) { 
                    const skuRec = rec.recs.sku;
                    if (skuRec.skuMin > 1 && stats.totalSKUUnik < skuRec.skuMin) { 
                        const tambahanPotongan = skuRec.additionalPotongan || 0; 
                        const potonganText = tambahanPotongan > 0 
                            ? `tambahan potongan senilai <strong>${fmtRp(tambahanPotongan)}/${skuRec.satuan}</strong>` 
                            : `potensi Strata <strong>${fmtRp(skuRec.potongan)}/${skuRec.satuan}</strong>`;

                        let suggestionsHtml = '';
                        if (skuRec.suggestedProducts && skuRec.suggestedProducts.length > 0) {
                            suggestionsHtml = `
                                <br>
                                <i style="font-size: 0.9em; color: #555;">
                                    Misalnya: ${skuRec.suggestedProducts.join(', ')}
                                </i>`;
                        }

                        upsaleHtml += `
                            <div style="background-color: #fff3cd; border: 1px solid #ffeeba; padding: 10px; border-radius: 4px; margin-top: 8px;">
                                <strong style="color: #856404;">💡 Perhatian: Syarat Varian (SKU)</strong><br>
                                <span style="font-size: 0.9em;">
                                Untuk mendapatkan ${potonganText}, 
                                Anda perlu menambah <strong>${skuRec.gapSku} Varian (SKU)</strong> unik lagi.
                                <span style="font-weight: 600;">(Target Min. ${skuRec.skuMin} SKU, Qty Min. ${skuRec.qtyMin} KRT)</span>
                                ${suggestionsHtml} </span>
                            </div>
                        `;
                    } 
                }
                keranjangHtml += `<div class="strata-upsale-info" style="margin: 10px 0; padding-bottom: 10px; border-top: 1px dashed #eee;">${upsaleHtml}</div>`;
            }
            
            keranjangHtml += `</div>`; 
        });
        
        // --- Logika Debug Reguler dari app.js lama ---
        const totalBrutoPerPrincipal = {}; 
        summaryData.items.forEach(item => {
            const principal = item.product.principal || 'N/A';
            const hargaExcPpn = item.product.harga_inc_ppn / (1 + PPN_RATE);
            const hargaPerBoxExcPpn = hargaExcPpn / (item.product.box_per_krt || 12);
            const subtotalBruto = item.qtyBoxTotal * hargaPerBoxExcPpn;
            totalBrutoPerPrincipal[principal] = (totalBrutoPerPrincipal[principal] || 0) + subtotalBruto;
        });

        const regulerDiscounts = window.getRegulerDiscount(summaryData.items, context);
        let debugRegulerHtml = '';
        Object.keys(totalBrutoPerPrincipal).forEach(principal => {
            const discRate = regulerDiscounts[principal] || 0;
            const bruto = totalBrutoPerPrincipal[principal];
            debugRegulerHtml += `<div class="total-line info-disc">
                                    <span>Bruto (${principal}):</span>
                                    <strong>${fmtRp(bruto*(1 + PPN_RATE))} (${(discRate * 100).toFixed(2)}% Applied)</strong>
                                 </div>`;
        });
        keranjangHtml += `<div style="margin-top: 10px; padding-top: 10px; border-top: 1px dashed #ccc;">${debugRegulerHtml}</div>`;
        // --- Batas Logika Debug ---
        

        let upsellHtml = '';
        if (summaryData.regulerUpsells && summaryData.regulerUpsells.length > 0) {
            summaryData.regulerUpsells.forEach(rec => {
                upsellHtml += `
                    <div class="upsell-info-box reguler-upsell">
                        <strong>🎯 Promo Reguler (${rec.principal}):</strong><br>
                        <span style="font-size: 0.9em;">
                            Tambah belanja <strong>${fmtRp(rec.gap)}</strong> lagi
                            untuk dapat diskon <strong>${(rec.nextRate * 100).toFixed(1)}%</strong>
                            (Target: ${fmtRp(rec.targetBruto)}).
                        </span>
                    </div>`;
            });
        }
        if (summaryData.codUpsell) {
            const rec = summaryData.codUpsell;
            upsellHtml += `
                <div class="upsell-info-box cod-upsell">
                    <strong>🎯 Promo COD (Total):</strong><br>
                    <span style="font-size: 0.9em;">
                        Tambah total belanja <strong>${fmtRp(rec.gap)}</strong> lagi
                        untuk dapat diskon COD <strong>${(rec.nextRate * 100).toFixed(1)}%</strong>
                        (Target: ${fmtRp(rec.targetBruto)}).
                    </span>
                </div>
            `;
        }
        if (upsellHtml) {
            keranjangHtml += `<div class="upsell-summary-container">${upsellHtml}</div>`;
        }


        keranjangHtml += `
            <div class="cart-total-summary">
                <div class="total-line"><span>Subtotal Nett (DPP):</span><strong>${fmtRp(summaryData.totalNett)}</strong></div>
                <div class="total-line"><span>PPN (${(PPN_RATE * 100).toFixed(0)}%):</span><strong>${fmtRp(summaryData.totalPpn)}</strong></div>
                <div class="total-line" style="color:var(--primary-color); font-weight:bold;"><span>Total Faktur (Pre-COD):</span><strong>${fmtRp(summaryData.totalGrossPreCod)}</strong></div>
                <div class="total-line" style="color:var(--danger-color); font-weight:bold;"><span>Potongan COD (${(summaryData.discRateCOD * 100).toFixed(2)}%)</span><strong>- ${fmtRp(summaryData.totalPotonganCOD)}</strong></div>
                <div class="total-line grand-total voucher-line">
                    <span style="color:var(--success-color);">Voucher:</span>
                    <input type="tel" id="voucher-input" class="voucher-input-keranjang" 
                           value="${summaryData.nominalVoucher > 0 ? fmtNumInput(summaryData.nominalVoucher) : ''}" 
                           placeholder="Input...">
                </div>
                <div class="total-line grand-total"><span>FINAL TAGIHAN:</span><strong>${fmtRp(summaryData.finalGrandTotal)}</strong></div>
                <div class="cart-actions-bottom">
                    <button id="cart-reset-button" class="btn-danger btn-block" style="flex: 1; margin-right: 5px;">🗑️ Reset Simulasi</button>
                    <button id="cart-lihat-faktur-button" class="btn-primary btn-block" style="flex: 1;">🧾 Lihat Faktur</button>
                </div>
            </div>
        `;

        daftarKeranjangEl.innerHTML = keranjangHtml;
        
        if (summaryBarTotalEl) {
            summaryBarTotalEl.innerText = fmtRp(summaryData.finalGrandTotal);
        }
    }


    function updateAllProductCardSummaries(summaryData) {
        if (!menuContainer) return; 
        const allPricingDivs = menuContainer.querySelectorAll('[data-sku-pricing]');
        allPricingDivs.forEach(pricingDiv => {
            const sku = pricingDiv.dataset.skuPricing;
            const calculatedItem = summaryData.items.find(i => i.sku === sku);
            const product = calculatedItem ? calculatedItem.product : null;

            if (calculatedItem && (calculatedItem.qtyKarton > 0 || calculatedItem.qtyBox > 0)) {
                const subtotalNettEl = pricingDiv.querySelector(`#subtotal-${sku}`);
                const hargaNettEl = pricingDiv.querySelector(`#harganett-${sku}`);
                const simulasiNettEl = pricingDiv.querySelector(`#simulasi-nett-${sku}`);
                const totalFakturItem = calculatedItem.totalOnFaktur;
                const { hargaNettAkhirSimulasiKrt, hargaOnFakturPerKrt } = getSimulasiRewardKrt(product, calculatedItem);
                
                if(subtotalNettEl) subtotalNettEl.innerText = fmtRp(totalFakturItem); 
                if(hargaNettEl) hargaNettEl.innerText = fmtRp(hargaOnFakturPerKrt); 
                if(simulasiNettEl) simulasiNettEl.innerText = fmtRp(hargaNettAkhirSimulasiKrt); 
                
                pricingDiv.style.display = 'block';
            } else {
                pricingDiv.style.display = 'none';
            }
        });
    }

    function onRemoveItemClick(btnEl) {
        const sku = btnEl.dataset.sku;
        AppStore.updateCart(sku, null);
        syncProductListInputs(sku, 0, 0);
        batchUpdateUI(); 
    }
    
    function onMenuClick(e) {
      const target = e.target;
      const qtyBtn = target.closest('.btn-qty, .btn-plus, .btn-minus'); 
      if (qtyBtn) {
        e.preventDefault();
        onQtyButtonClick(qtyBtn);
        return;
      }
    }

    function onCartClick(e) {
        const target = e.target;
        const qtyBtn = target.closest('.btn-qty, .btn-plus, .btn-minus'); 
        if (qtyBtn) { e.preventDefault(); onQtyButtonClick(qtyBtn); return; }
        const deleteBtn = target.closest('.cart-item-delete-btn');
        if (deleteBtn) { e.preventDefault(); onRemoveItemClick(deleteBtn); return; }
        const detailBtn = target.closest('.btn-detail-harga');
        if (detailBtn) { e.preventDefault(); showDetailHargaModal(detailBtn.dataset.sku); return; }
        
        const dealKhususCheckbox = target.closest(`input[type="checkbox"][data-group]`);
        if (dealKhususCheckbox) {
            const groupName = dealKhususCheckbox.dataset.group;
            const newState = dealKhususCheckbox.checked ? 'active' : 'inactive';
            localStorage.setItem(`deal_khusus_state_${groupName}`, newState);
            batchUpdateUI(); 
            return;
        }
        
        if (target.id === 'cart-lihat-faktur-button') { e.preventDefault(); showFakturModal(); return; } 
        else if (target.id === 'cart-reset-button') {
            e.preventDefault();
            showConfirmationModal(
                '⚠️ Konfirmasi Reset Simulasi',
                'Anda yakin ingin **menghapus semua pesanan** di keranjang dan me-reset Tipe Toko/Loyalti?',
                resetSimulation, 
                'Ya, Reset'
            );
            return;
        }
    }

    function onQtyButtonClick(btnEl){
      const sku  = btnEl.dataset.sku;
      const type = btnEl.dataset.unit; 
      const action = btnEl.dataset.action;
      const qtyContainer = btnEl.closest('.quantity-controls, .input-qty'); 
      if (!qtyContainer) return;
      const inp = qtyContainer.querySelector(`.qty-input.input-${type}`);
      if (!inp) return;
      let v = parseNumInput(inp.value); 
      if (action === 'plus' || btnEl.classList.contains('btn-plus')) v++;
      else v = Math.max(0, v-1);
      inp.value = v; 
      onInputBlur(inp);
    }

    function syncProductListInputs(sku, krtVal, boxVal) {
        if (!menuContainer) return; 
        const productItem = menuContainer.querySelector(`[data-product-id="${sku}"]`);
        if (!productItem) return;
        const krtInput = productItem.querySelector('.input-krt');
        const boxInput = productItem.querySelector('.input-box');
        if (krtInput) { 
            krtInput.value = (krtVal > 0) ? fmtNumInput(krtVal) : 'K';
            krtInput.classList.toggle('is-placeholder', krtVal === 0);
        }
        if (boxInput) { 
            boxInput.value = (boxVal > 0) ? fmtNumInput(boxVal) : 'B';
            boxInput.classList.toggle('is-placeholder', boxVal === 0);
        }
    }

    function updateKeranjang(inputEl){
      const sku = String(inputEl.dataset.sku);
      const inputQtyContainer = inputEl.closest('.quantity-controls, .input-qty'); 
      if (!inputQtyContainer) return;

      let valKrt = parseNumInput(inputQtyContainer.querySelector('.input-krt').value);
      let valBox = parseNumInput(inputQtyContainer.querySelector('.input-box').value);

      const it  = AppStore.getCart().get(sku) || {sku, qtyKarton:0, qtyBox:0, qtyBoxTotal:0, diskonDetail:{}};
      
      if (!it.product) {
          const { userZona, userRegion, userDepo } = AppStore.getContext();
          const productData = getProductDataBySkuAndArea(sku, userZona, userRegion, userDepo);
          
          if (productData) {
              it.product = {
                  sku: productData.sku,
                  nama_sku: productData.nama_sku,
                  group: productData.group || 'LAIN-LAIN',
                  principal: productData.principal,
                  zona_harga: productData.zona_harga,
                  harga_inc_ppn: productData.harga_inc_ppn,
                  box_per_krt: productData.box_per_krt || 12,
              };
          } else if (valKrt > 0 || valBox > 0) {
              showConfirmationModal('❌ Produk Tidak Tersedia', `Produk ${sku} tidak memiliki harga/data yang valid untuk Area Simulasi Anda. Pesanan dibatalkan.`, null, 'OK');
              valKrt = 0; valBox = 0; 
          }
      }

      if (it.product && it.product.box_per_krt) {
          const bpk = it.product.box_per_krt;
          if (valBox >= bpk && bpk > 0) {
              const newKrt = Math.floor(valBox / bpk);
              const remainingBox = valBox % bpk;
              valKrt += newKrt;
              valBox = remainingBox;
              
              if (!inputEl.closest('#menuContainer')) {
                  const krtInput = inputQtyContainer.querySelector('.input-krt');
                  const boxInput = inputQtyContainer.querySelector('.input-box');
                  if (krtInput) {
                      krtInput.value = (valKrt > 0) ? fmtNumInput(valKrt) : 'K';
                      krtInput.classList.toggle('is-placeholder', valKrt === 0);
                  }
                  if (boxInput) {
                      boxInput.value = (valBox > 0) ? fmtNumInput(valBox) : 'B';
                      boxInput.classList.toggle('is-placeholder', valBox === 0);
                  }
              }
          }
      }

      it.qtyKarton = valKrt;
      it.qtyBox = valBox;
      const bpk = it.product ? (it.product.box_per_krt || 12) : 12; 
      it.qtyBoxTotal = (it.qtyKarton * bpk) + it.qtyBox;
      
      if (it.qtyKarton > 0 || it.qtyBox > 0) {
          AppStore.updateCart(sku, it);
      } else {
          AppStore.updateCart(sku, null); // Hapus
      }
      
      syncProductListInputs(sku, valKrt, valBox);
      batchUpdateUI(); 
    }

    function onInputFocus(el) {
        if (el.classList.contains('qty-input')) {
            if (el.value === 'K' || el.value === 'B') { el.value = ''; } 
            else { const val = parseNumInput(el.value); el.value = val === 0 ? '' : val; }
            el.classList.remove('is-placeholder');
        } else if (el.id === 'voucher-input') { 
            const val = parseNumInput(el.value);
            el.value = val === 0 ? '' : val;
        }
    }
    
    function onInputBlur(el) {
        if (el.classList.contains('qty-input')) {
            const val = parseNumInput(el.value);
            const isKrt = el.classList.contains('input-krt');
            if (val === 0) {
                el.value = isKrt ? 'K' : 'B';
                el.classList.add('is-placeholder');
            } else {
                el.value = fmtNumInput(val); 
                el.classList.remove('is-placeholder');
            }
            updateKeranjang(el); 
        } else if (el.id === 'voucher-input') { 
            const val = parseNumInput(el.value);
            if (val === 0) { el.value = ''; } 
            else { el.value = fmtNumInput(val); }
            batchUpdateUI(); 
        }
    }
    
    function resetSimulation() {
        const { currentUserData, currentPICData } = AppStore.getIdentity();
        AppStore.setUser(currentUserData, currentPICData); // Reset simulasi ke state login
        AppStore.clearCart();
        
        const voucherInputElement = document.getElementById('voucher-input');
        if (voucherInputElement) voucherInputElement.value = "";
        
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('deal_khusus_state_')) {
                localStorage.removeItem(key);
            }
        });

        document.querySelectorAll('.qty-input').forEach(inputEl => {
            const unit = inputEl.dataset.unit;
            inputEl.value = unit === 'krt' ? 'K' : 'B';
            inputEl.classList.add('is-placeholder');
        });
        
        setupSimulationUI(); // Panggil setup UI lagi untuk me-reset dropdown
        
        if (isMobile() && summaryPanelEl && summaryPanelEl.classList.contains('summary-visible')) {
             toggleSummaryPanel();
        }
    }


    // ========================================================
    // === EVENT LISTENERS (Poin 4 & 5)
    // ========================================================
    if (loginButton) {
        loginButton.addEventListener('click', handleLogin);
        loginIdInput.addEventListener('input', () => { if(loginErrorMsg) loginErrorMsg.style.display = 'none'; });
        loginPasswordInput.addEventListener('input', () => { if(loginErrorMsg) loginErrorMsg.style.display = 'none'; });
        document.querySelectorAll('#login-id, #login-password, #login-region, #login-depo').forEach(el => {
            el.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') { handleLogin(); }
            });
        });
    }
    
    if (closeModalButton) {
        closeModalButton.addEventListener('click', handleCloseModalOnly); 
    }
    
    window.addEventListener('click', (event) => {
        if (event.target == roleDetailsModal) {
            if (modalTitleEl && !modalTitleEl.innerText.includes('Login Berhasil!')) {
                handleCloseModalOnly();
            }
        }
    });
    
    if (mainLogoutButton) {
        mainLogoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            showConfirmationModal(
                '⚠️ Konfirmasi Logout',
                'Anda yakin ingin **Logout** dan kembali ke halaman Login?',
                handleLogout, 
                'Logout'
            );
        });
    }

    if (summaryToggleBarEl) {
        summaryToggleBarEl.addEventListener('click', toggleSummaryPanel);
    }
    if (closeSummaryBtn) {
        closeSummaryBtn.addEventListener('click', toggleSummaryPanel);
    }

    if(simZonaEl) simZonaEl.addEventListener('change', () => {
        populateAdminDropdowns();
        updateSimulationContext(true);
    });
    if(simRegionEl) simRegionEl.addEventListener('change', () => {
        populateAdminDropdowns();
        updateSimulationContext(true);
    });
    if(simDepoEl) simDepoEl.addEventListener('change', () => updateSimulationContext(true));
    if(simTypeUserEl) simTypeUserEl.addEventListener('change', () => updateSimulationContext(true)); 
    
    if(tipeTokoEl) tipeTokoEl.addEventListener('change', () => updateSimulationContext(true));
    if(kelasPelangganEl) kelasPelangganEl.addEventListener('change', () => updateSimulationContext(true));
    
    if (tabProdukBtn) {
        tabProdukBtn.addEventListener('click', () => switchTab('produk'));
    }
    if (tabPromoBtn) {
        tabPromoBtn.addEventListener('click', () => switchTab('promo'));
    }
    
    if (menuContainer) {
        menuContainer.addEventListener('click', onMenuClick);
        menuContainer.addEventListener('focus', (e) => onInputFocus(e.target), true);
        menuContainer.addEventListener('blur', (e) => onInputBlur(e.target), true);
    }
    
    if (daftarKeranjangEl) {
        daftarKeranjangEl.addEventListener('click', onCartClick);
        daftarKeranjangEl.addEventListener('focus', (e) => onInputFocus(e.target), true);
        daftarKeranjangEl.addEventListener('blur', (e) => onInputBlur(e.target), true);
        daftarKeranjangEl.addEventListener('keypress', (e) => {
            if (e.target.id === 'voucher-input' && e.key === 'Enter') {
                e.target.blur(); 
            }
        });
    }
    
}); // Penutup DOMContentLoaded


// ========================================================
// === [POIN 3] REGISTRASI SERVICE WORKER UNTUK PWA/OFFLINE
// ========================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(registration => {
        console.log('[PWA] ServiceWorker registration successful with scope: ', registration.scope);
      })
      .catch(err => {
        console.log('[PWA] ServiceWorker registration failed: ', err);
      });
  });
}