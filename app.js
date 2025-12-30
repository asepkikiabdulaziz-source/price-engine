// Main Application Logic
import { initAuth, login, logout, getCurrentUser } from './auth.js';
import { 
    loadProducts, 
    loadPrices, 
    loadProductGroups, 
    loadProductGroupMembers,
    loadProductGroupAvailability,
    isProductGroupAvailable,
    loadRegions,
    loadDepos,
    getProductPrice,
    getZonaByDepoId,
    getDepoInfoByDepoId,
    loadBucketMembers,
    loadBundlePromos,
    loadAllBundlePromoGroups,
    loadPromoAvailability,
    isPromoAvailable,
    loadPrincipalDiscountTiers,
    loadGroupPromos,
    loadGroupPromoTiers,
    loadInvoiceDiscounts,
    loadFreeProductPromos,
    loadFreeProductPromoTiers,
    batchGetProductPrincipals,
    loadLoyaltyClasses,
    loadLoyaltyAvailability,
    isLoyaltyClassAvailable,
    resolveLoyaltyRule,
    syncCollectionData,
    getMasterVersion
} from './database.js';
import { calculateTotal } from './calculation.js';

// Development mode - set to false for production
const DEV_MODE = false; // Set to false to use database (true = bypass auth, use dummy data)

// Initialize app
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    // In development mode, skip auth and show UI directly
    if (DEV_MODE) {
        console.log('Development mode: Bypassing authentication');
        currentUser = { id: 'dev-user', email: 'dev@example.com' };
        showApp();
        setupEventListeners();
        return;
    }
    
    try {
        await initAuth();
        
        // Check if user is already logged in (dari localStorage)
        currentUser = await getCurrentUser();
        if (currentUser) {
            // Jika depo_name/region_name tidak ada, load lagi dari view_area
            if (currentUser.depo_id && (!currentUser.depo_name || !currentUser.region_name)) {
                console.log('🔄 Reloading depo info for existing session...');
                try {
                    const depoInfo = await getDepoInfoByDepoId(currentUser.depo_id);
                    if (depoInfo) {
                        currentUser.depo_name = depoInfo.depo_name;
                        currentUser.region_name = depoInfo.region_name;
                        currentUser.zona = depoInfo.zona;
                        // Update localStorage
                        localStorage.setItem('price_engine_user_session', JSON.stringify(currentUser));
                        console.log('✅ Depo info reloaded:', {
                            depo_name: currentUser.depo_name,
                            region_name: currentUser.region_name,
                            zona: currentUser.zona
                        });
                    }
                } catch (error) {
                    console.error('❌ Error reloading depo info:', error);
                }
            }
            
            // Setup store type jika user sudah login
            if (currentUser.div_sls) {
                setupStoreTypeByDivSls(currentUser.div_sls);
            }
            showApp();
        } else {
            showLogin();
        }
        
        // Setup event listeners
        setupEventListeners();
        setupDetailHargaListeners();
    } catch (error) {
        console.error('Error initializing app:', error);
        // Fallback to dev mode if initialization fails
        console.log('Falling back to development mode');
        currentUser = { id: 'dev-user', email: 'dev@example.com' };
        showApp();
        setupEventListeners();
        setupDetailHargaListeners();
    }
});

function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Region dropdown change - load depos
    const regionSelect = document.getElementById('region');
    if (regionSelect) {
        regionSelect.addEventListener('change', handleRegionChange);
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Tab navigation
    setupTabNavigation();
    
    // Summary bar toggle (mobile)
    const summaryBar = document.getElementById('summary-bar');
    if (summaryBar) {
        // Ensure cart sidebar is closed by default (no cart-visible class)
        const cartSidebar = document.getElementById('cart-sidebar');
        if (cartSidebar) {
            cartSidebar.classList.remove('cart-visible');
        }
        // Ensure arrow shows ▲ (closed state)
        const arrow = summaryBar.querySelector('.summary-bar-arrow');
        if (arrow) {
            arrow.textContent = '▲';
        }
        
        summaryBar.addEventListener('click', () => {
            const cartSidebar = document.getElementById('cart-sidebar');
            if (cartSidebar) {
                cartSidebar.classList.toggle('cart-visible');
                // Update arrow direction
                const arrow = summaryBar.querySelector('.summary-bar-arrow');
                if (arrow) {
                    arrow.textContent = cartSidebar.classList.contains('cart-visible') ? '▼' : '▲';
                }
            }
        });
    }

    // Close cart button
    const closeCartBtn = document.getElementById('close-cart-btn');
    if (closeCartBtn) {
        closeCartBtn.addEventListener('click', () => {
            const cartSidebar = document.getElementById('cart-sidebar');
            const summaryBar = document.getElementById('summary-bar');
            if (cartSidebar) {
                cartSidebar.classList.remove('cart-visible');
            }
            if (summaryBar) {
                const arrow = summaryBar.querySelector('.summary-bar-arrow');
                if (arrow) {
                    arrow.textContent = '▲';
                }
            }
        });
    }
    
    // Load regions on page load
    loadRegionsForLogin();
    
    // Store type change - trigger recalculation and reload data
    const storeTypeEl = document.getElementById('store-type');
    if (storeTypeEl) {
        storeTypeEl.addEventListener('change', async () => {
            const selectedStoreType = storeTypeEl.value;
            
            // Handle loyalty dropdown: enable/disable based on store type
            const loyaltyClassEl = document.getElementById('loyalty-class');
            if (loyaltyClassEl) {
                if (selectedStoreType === 'retail') {
                    // Disable dan clear jika retail (loyalty hanya untuk grosir)
                    loyaltyClassEl.disabled = true;
                    loyaltyClassEl.value = '';
                    loyaltyClassEl.innerHTML = '<option value="">Loyalty tidak berlaku untuk Retail</option>';
                } else {
                    // Enable dan populate jika grosir
                    loyaltyClassEl.disabled = false;
                    await populateLoyaltyClassDropdown();
                }
            }
            
            // Reload calculation data when store type changes
            if (currentUser) {
                await loadCalculationData();
                // Reload promos data with new store type filter
                await loadPromosData();
                // Auto-recalculate if cart has items
                if (cart && cart.size > 0) {
                    handleCalculate();
                }
            }
        });
    }
    
    // Loyalty class change - trigger recalculation
    const loyaltyClassEl = document.getElementById('loyalty-class');
    if (loyaltyClassEl) {
        loyaltyClassEl.addEventListener('change', () => {
            // Auto-recalculate when loyalty class changes
            if (cart && cart.size > 0 && currentUser) {
                handleCalculate();
            }
        });
    }
    
    // Payment method change - trigger recalculation
    const paymentMethodEl = document.getElementById('payment-method');
    if (paymentMethodEl) {
        paymentMethodEl.addEventListener('change', () => {
            // Auto-recalculate when payment method changes
            if (cart && cart.size > 0 && currentUser) {
                handleCalculate();
            }
        });
    }
    
    // Voucher input - trigger recalculation on blur
    const voucherInput = document.getElementById('voucher-input');
    if (voucherInput) {
        voucherInput.addEventListener('blur', () => {
            // Format input value
            const val = parseNumInput(voucherInput.value);
            voucherInput.value = val === 0 ? '' : fmtNumInput(val);
            // Recalculate final tagihan
            updateFinalTagihan();
        });
        voucherInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.target.blur();
            }
        });
        voucherInput.addEventListener('input', (e) => {
            // Format while typing (optional, bisa dihapus jika mengganggu)
            const val = parseNumInput(e.target.value);
            if (val > 0) {
                e.target.value = fmtNumInput(val);
            }
        });
    }
    
    // Reset button
    const resetButton = document.getElementById('cart-reset-button');
    if (resetButton) {
        resetButton.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('⚠️ Konfirmasi Reset\n\nAnda yakin ingin menghapus semua pesanan di keranjang?')) {
                resetSimulation();
            }
        });
    }
    
    // Lihat Faktur button
    const lihatFakturButton = document.getElementById('cart-lihat-faktur-button');
    if (lihatFakturButton) {
        lihatFakturButton.addEventListener('click', (e) => {
            e.preventDefault();
            showFakturModal();
        });
    }
}

function setupTabNavigation() {
    const navTabs = document.querySelectorAll('.nav-tab');
    
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTabId = tab.getAttribute('data-tab');
            
            // Remove active class from all tabs and panes
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding pane
            tab.classList.add('active');
            const targetPane = document.getElementById(targetTabId);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });
}

// Handle add to cart with multiple units
function setupAddToCart() {
    document.querySelectorAll('.btn-add').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const productItem = e.target.closest('.product-item');
            const productId = productItem.getAttribute('data-product-id');
            const productName = productItem.querySelector('.product-name').textContent;
            const productPrice = productItem.querySelector('.product-price').textContent;
            
            // Get values from all unit inputs
            const unitInputs = productItem.querySelectorAll('.unit-input');
            const quantities = {};
            
            unitInputs.forEach(input => {
                const unit = input.getAttribute('data-unit');
                const value = parseFloat(input.value) || 0;
                if (value > 0) {
                    quantities[unit] = value;
                }
            });
            
            // Check if at least one unit has value
            if (Object.keys(quantities).length === 0) {
                alert('Silakan input jumlah produk');
                return;
            }
            
            // Add to cart logic (to be implemented)
            console.log('Add to cart:', {
                productId,
                productName,
                quantities,
                productPrice
            });
            
            // Add to cart implementation
            // For now, just show alert
            const qtyStr = Object.entries(quantities)
                .map(([unit, qty]) => `${qty} ${unit}`)
                .join(' + ');
            alert(`Menambahkan: ${productName}\nJumlah: ${qtyStr}`);
        });
    });
}

// Initialize add to cart handlers
document.addEventListener('DOMContentLoaded', () => {
    // This will be called after content loads
    setTimeout(setupAddToCart, 100);
});

/**
 * Load regions untuk dropdown login
 */
async function loadRegionsForLogin() {
    try {
        console.log('🔄 Loading regions for login form...');
        
        // Add timeout untuk mencegah hang
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout loading regions')), 10000)
        );
        
        const regionsPromise = loadRegions();
        const regions = await Promise.race([regionsPromise, timeoutPromise]);
        
        console.log(`✅ Loaded ${regions?.length || 0} regions:`, regions);
        
        const regionSelect = document.getElementById('region');
        
        if (!regionSelect) {
            console.error('❌ Region select element not found!');
            return;
        }
        
        // Clear existing options (except first option)
        regionSelect.innerHTML = '<option value="">Pilih Region</option>';
        
        if (!regions || regions.length === 0) {
            console.warn('⚠️ No regions found!');
            const option = document.createElement('option');
            option.value = '';
            option.textContent = 'Tidak ada region tersedia';
            option.disabled = true;
            regionSelect.appendChild(option);
            return;
        }
        
        // Add regions - hanya tampilkan nama region (tanpa code)
        regions.forEach(region => {
            const option = document.createElement('option');
            option.value = region.code; // Value tetap menggunakan code untuk filtering
            option.textContent = region.name; // Display hanya nama saja
            regionSelect.appendChild(option);
        });
        
        console.log(`✅ Successfully populated ${regions.length} regions in dropdown`);
    } catch (error) {
        console.error('❌ Error loading regions:', error);
        const regionSelect = document.getElementById('region');
        if (regionSelect) {
            regionSelect.innerHTML = '<option value="">Error loading regions - Silakan refresh</option>';
        }
    }
}

/**
 * Handle region change - load depos for selected region
 */
async function handleRegionChange(e) {
    const regionCode = e.target.value;
    const depoSelect = document.getElementById('depo');
    
    if (!depoSelect) return;
    
    // Clear existing options
    depoSelect.innerHTML = '<option value="">Pilih Depo</option>';
    depoSelect.disabled = true;
    
    if (!regionCode) {
        return;
    }
    
    try {
        // Load depos (TODO: filter by region jika ada relasi)
        const depos = await loadDepos(regionCode);
        
        // Add depos
        depos.forEach(depo => {
            const option = document.createElement('option');
            option.value = depo.code;
            option.textContent = `${depo.code} - ${depo.name}`;
            depoSelect.appendChild(option);
        });
        
        depoSelect.disabled = false;
    } catch (error) {
        console.error('Error loading depos:', error);
    }
}

/**
 * Handle login form submission
 */
async function handleLogin(e) {
    e.preventDefault();
    
    const regionCode = document.getElementById('region').value;
    const depoCode = document.getElementById('depo').value;
    const kodeSales = document.getElementById('kode-sales').value.trim();
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');
    
    // Validation
    if (!regionCode || !depoCode || !kodeSales || !password) {
        errorDiv.textContent = 'Mohon lengkapi semua field';
        errorDiv.classList.add('show');
        return;
    }
    
    try {
        const user = await login(regionCode, depoCode, kodeSales, password);
        if (user) {
            // Ambil depo info (depo_name, region_name, zona) berdasarkan depo_id
            if (user.depo_id) {
                try {
                    const depoInfo = await getDepoInfoByDepoId(user.depo_id);
                    if (depoInfo) {
                        user.depo_name = depoInfo.depo_name;
                        user.region_name = depoInfo.region_name;
                        user.zona = depoInfo.zona;
                        console.log('✅ Depo info loaded:', {
                            depo_id: user.depo_id,
                            depo_name: depoInfo.depo_name,
                            region_name: depoInfo.region_name,
                            zona: depoInfo.zona
                        });
                    } else {
                        console.warn('⚠️ No depo info found for depo_id:', user.depo_id);
                    }
                } catch (error) {
                    console.error('❌ Error loading depo info:', error);
                }
            } else {
                console.warn('⚠️ No depo_id in user object:', user);
            }
            
            // Simpan session ke localStorage SETELAH depo info diambil (gunakan key spesifik untuk aplikasi ini)
            console.log('💾 Saving user to localStorage:', {
                depo_id: user.depo_id,
                depo_name: user.depo_name,
                region_name: user.region_name,
                zona: user.zona
            });
            localStorage.setItem('price_engine_user_session', JSON.stringify(user));
            currentUser = user;
            
            // Setup store type berdasarkan div_sls
            setupStoreTypeByDivSls(user.div_sls);
            
            // Tampilkan user info di header
            displayUserInfo(user);
            
            showApp();
            errorDiv.classList.remove('show');
        }
    } catch (error) {
        errorDiv.textContent = error.message || 'Login gagal. Silakan coba lagi.';
        errorDiv.classList.add('show');
    }
}

async function handleLogout() {
    try {
        await logout();
        currentUser = null;
        showLogin();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

function showLogin() {
    document.getElementById('login-section').style.display = 'flex';
    document.getElementById('app-section').style.display = 'none';
    
    // Load regions untuk dropdown (pastikan selalu dimuat saat login form ditampilkan)
    loadRegionsForLogin();
}

function showApp() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('app-section').style.display = 'block';
    
    // Setup store type jika user sudah login
    if (currentUser && currentUser.div_sls) {
        setupStoreTypeByDivSls(currentUser.div_sls);
    }
    
    // Tampilkan user info jika user sudah login
    if (currentUser) {
        displayUserInfo(currentUser);
    }
    
    loadAppContent();
}

/**
 * Display user information in header
 */
function displayUserInfo(user) {
    const userInfoDiv = document.getElementById('header-user-info');
    if (!userInfoDiv) return;
    
    // Format sederhana dengan separator pipe
    const userName = user.full_name || '-';
    const userDepo = user.depo_name || '-';
    const userRegion = user.region_name || '-';
    const userZona = user.zona || '-';
    const userDiv = user.div_sls || '-';
    
    const userInfoSimple = document.getElementById('user-info-simple');
    if (userInfoSimple) {
        userInfoSimple.textContent = `${userName} | ${userDepo} | ${userRegion} | ${userZona} | ${userDiv}`;
    }
    
    userInfoDiv.style.display = 'flex';
}

/**
 * Setup store type options berdasarkan div_sls
 * - AEPDA: hanya GROSIR (disable Retail option)
 * - Selain AEPDA: bisa GROSIR atau RETAIL
 */
function setupStoreTypeByDivSls(divSls) {
    const storeTypeSelect = document.getElementById('store-type');
    
    if (!storeTypeSelect) {
        console.warn('Store type select not found');
        return;
    }
    
    // Get Retail option
    const retailOption = storeTypeSelect.querySelector('option[value="retail"]');
    
    if (!retailOption) {
        console.warn('Retail option not found');
        return;
    }
    
    // Reset: enable Retail option
    retailOption.disabled = false;
    retailOption.style.opacity = '1';
    
    // Set berdasarkan div_sls
    if (divSls === 'AEPDA') {
        // Hanya GROSIR - disable Retail option
        retailOption.disabled = true;
        retailOption.style.opacity = '0.5';
        // Set default ke Grosir jika belum dipilih
        if (storeTypeSelect.value === 'retail') {
            storeTypeSelect.value = 'grosir';
        }
        console.log('✅ Store type: GROSIR only (AEPDA)');
    } else {
        // Bisa GROSIR atau RETAIL - enable semua
        // Retail option sudah di-enable di atas
        console.log(`✅ Store type: GROSIR or RETAIL available (${divSls || 'default'})`);
    }
    
    // Setup loyalty dropdown setelah store type di-set
    populateLoyaltyClassDropdown();
}

/**
 * Populate loyalty class dropdown
 * Filter berdasarkan store_type (hanya grosir) dan availability rules
 */
async function populateLoyaltyClassDropdown() {
    const loyaltyClassEl = document.getElementById('loyalty-class');
    if (!loyaltyClassEl) {
        console.warn('Loyalty class dropdown not found');
        return;
    }
    
    // Get selected store type
    const storeTypeEl = document.getElementById('store-type');
    const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
    
    // Reset dropdown
    loyaltyClassEl.innerHTML = '<option value="">Memuat...</option>';
    loyaltyClassEl.disabled = true;
    
    // Loyalty hanya berlaku untuk grosir
    if (selectedStoreType !== 'grosir') {
        loyaltyClassEl.innerHTML = '<option value="">Loyalty tidak berlaku untuk Retail</option>';
        return;
    }
    
    // Validasi data sudah di-load
    if (!currentUser || loyaltyClasses.length === 0 || loyaltyAvailabilityRules.length === 0) {
        loyaltyClassEl.innerHTML = '<option value="">Data loyalty belum dimuat</option>';
        return;
    }
    
    try {
        const userZona = currentUser.zona || null;
        const userRegion = currentUser.region_name || null;
        const userDepo = currentUser.depo_id || null;
        
        // Filter loyalty classes yang available untuk area user dan store_type grosir
        const availableClasses = loyaltyClasses.filter(loyaltyClass => {
            // Filter store_type: hanya 'grosir' atau 'all'
            if (loyaltyClass.store_type !== 'grosir' && loyaltyClass.store_type !== 'all') {
                return false;
            }
            
            // Cek availability
            return isLoyaltyClassAvailable(
                loyaltyClass.code,
                loyaltyAvailabilityRules,
                userZona,
                userRegion,
                userDepo
            );
        });
        
        if (availableClasses.length === 0) {
            loyaltyClassEl.innerHTML = '<option value="">Tidak ada kelas loyalty tersedia</option>';
            return;
        }
        
        // Populate dropdown (hanya class_code, urutkan berdasarkan target_monthly descending)
        const classesWithRules = availableClasses
            .map(loyaltyClass => {
                const rule = resolveLoyaltyRule(loyaltyClass.code, selectedStoreType, loyaltyClasses);
                if (rule) {
                    return {
                        code: loyaltyClass.code,
                        targetMonthly: rule.target_monthly
                    };
                }
                return null;
            })
            .filter(item => item !== null)
            .sort((a, b) => b.targetMonthly - a.targetMonthly); // Sort descending by target_monthly
        
        loyaltyClassEl.innerHTML = '<option value="">-- Pilih Kelas --</option>';
        classesWithRules.forEach(item => {
            const option = document.createElement('option');
            option.value = item.code;
            option.textContent = item.code; // Hanya class_code saja
            loyaltyClassEl.appendChild(option);
        });
        
        loyaltyClassEl.disabled = false;
        console.log(`✅ Populated ${availableClasses.length} loyalty classes`);
        
    } catch (error) {
        console.error('Error populating loyalty class dropdown:', error);
        loyaltyClassEl.innerHTML = '<option value="">Error memuat kelas loyalty</option>';
    }
}

/**
 * Check if cart has products from principal KSNI
 * @returns {boolean} True if cart contains at least one KSNI product
 */
function checkIfCartHasKSNI() {
    if (!cart || cart.size === 0) return false;
    
    for (const [productId, item] of cart) {
        const product = productDataMap.get(productId);
        if (product && product.principal_code === 'KSNI') {
            return true;
        }
    }
    return false;
}

/**
 * Calculate loyalty cashback
 * @param {Object} result - Calculation result from calculateTotal()
 * @param {string} loyaltyClassCode - Selected loyalty class code
 * @param {string} storeType - Selected store type
 * @param {string} userZona - User's zona
 * @param {string} userRegion - User's region
 * @param {string} userDepo - User's depo
 * @returns {Object} Cashback calculation result
 */
function calculateLoyaltyCashback(result, loyaltyClassCode, storeType, userZona, userRegion, userDepo) {
    // 1. Validasi store type = grosir
    if (storeType !== 'grosir') {
        return {
            cashbackAmount: 0,
            cashbackPercentage: 0,
            isAvailable: false,
            reason: 'Loyalty hanya berlaku untuk Grosir'
        };
    }
    
    // 2. Validasi loyalty class dipilih
    if (!loyaltyClassCode || loyaltyClassCode.trim() === '') {
        return {
            cashbackAmount: 0,
            cashbackPercentage: 0,
            isAvailable: false,
            reason: 'Kelas loyalty belum dipilih'
        };
    }
    
    // 3. Validasi principal KSNI
    if (!checkIfCartHasKSNI()) {
        return {
            cashbackAmount: 0,
            cashbackPercentage: 0,
            isAvailable: false,
            reason: 'Cashback hanya untuk principal KSNI'
        };
    }
    
    // 4. Cek availability
    if (!isLoyaltyClassAvailable(loyaltyClassCode, loyaltyAvailabilityRules, userZona, userRegion, userDepo)) {
        return {
            cashbackAmount: 0,
            cashbackPercentage: 0,
            isAvailable: false,
            reason: 'Kelas loyalty tidak tersedia untuk area ini'
        };
    }
    
    // 5. Resolve rule
    const rule = resolveLoyaltyRule(loyaltyClassCode, storeType, loyaltyClasses);
    if (!rule) {
        return {
            cashbackAmount: 0,
            cashbackPercentage: 0,
            isAvailable: false,
            reason: 'Rule loyalty tidak ditemukan'
        };
    }
    
    // 6. Hitung cashback dari totalNett (setelah semua diskon)
    const totalNett = result.totalNett || 0;
    const cashbackAmount = totalNett * (rule.cashback_percentage / 100);
    
    // Get loyalty class name
    const loyaltyClass = loyaltyClasses.find(c => c.code === loyaltyClassCode);
    const loyaltyClassName = loyaltyClass ? loyaltyClass.name : loyaltyClassCode;
    
    return {
        loyaltyClassCode: loyaltyClassCode,
        loyaltyClassName: loyaltyClassName,
        cashbackPercentage: rule.cashback_percentage,
        cashbackAmount: Math.round(cashbackAmount), // Round to integer
        targetMonthly: rule.target_monthly,
        isAvailable: true
    };
}

async function loadAppContent() {
    console.log('🔄 Loading app content from database...');
    console.log('👤 Current user:', {
        id: currentUser?.id,
        email: currentUser?.email,
        depo_id: currentUser?.depo_id,
        depo_name: currentUser?.depo_name,
        region_name: currentUser?.region_name,
        zona: currentUser?.zona,
        div_sls: currentUser?.div_sls
    });
    
    try {
        // Load data from database
        // Load cart from localStorage
        loadCartFromLocalStorage();
        
        await loadProductsData();
        
        // Load and display promos
        await loadPromosData();
        
        // Populate loyalty dropdown (setelah data di-load)
        await populateLoyaltyClassDropdown();
        
        // Setup add to cart handlers
        setupAddToCart();
        
        // Re-render cart if items were loaded from cache
        if (cart.size > 0) {
            renderKeranjang();
            handleCalculate();
        }
    } catch (error) {
        console.error('Error loading app content:', error);
        showError('Gagal memuat data. Silakan refresh halaman.');
    }
}

/**
 * Load products and display them
 */
async function loadProductsData() {
    try {
        // Gunakan zona dari user yang sudah login (dari view_area)
        // Tidak perlu load semua zones, cukup pakai zona user
        const selectedZone = currentUser?.zona || null;
        
        if (!selectedZone) {
            console.warn('⚠️ No zone found for current user');
            document.getElementById('product-groups').innerHTML = '<p>Tidak ada zona ditemukan untuk user. Silakan hubungi administrator.</p>';
            return;
        }
        
        console.log('📍 Using zone from user:', selectedZone);
        
        // Load products dengan version checking
        const productsResult = await syncCollectionData('master_products', 'master_products', loadProducts);
        const products = productsResult.data || [];
        console.log(`📦 Loaded ${products?.length || 0} products ${productsResult.fromCache ? '(from cache)' : '(from server)'}`);
        if (!products || products.length === 0) {
            console.warn('No products found');
            document.getElementById('product-groups').innerHTML = '<p>Tidak ada produk ditemukan. Silakan import data CSV terlebih dahulu.</p>';
            return;
        }
        
        // Update AppStore
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setProducts(products);
        }
        
        // Build product data map for cart display
        productDataMap.clear();
        products.forEach(product => {
            productDataMap.set(product.code, product);
        });
        
        // Load product groups dengan version checking
        const groupsResult = await syncCollectionData('product_groups', 'product_groups', loadProductGroups);
        const productGroups = groupsResult.data || [];
        console.log(`📂 Loaded ${productGroups?.length || 0} product groups ${groupsResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setProductGroups(productGroups);
        }
        
        // Load product group availability rules dengan version checking
        const availabilityResult = await syncCollectionData('product_group_availability', 'product_group_availability', loadProductGroupAvailability);
        productGroupAvailabilityRules = availabilityResult.data || [];
        console.log(`📋 Loaded ${productGroupAvailabilityRules?.length || 0} availability rules ${availabilityResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setProductGroupAvailability(productGroupAvailabilityRules);
        }
        
        // Filter groups based on availability rules (user's zona, region, depo)
        const userZona = currentUser?.zona || null;
        const userRegion = currentUser?.region_name || null;
        const userDepo = currentUser?.depo_id || null;
        
        const availableGroups = productGroups.filter(group => {
            return isProductGroupAvailable(
                group.code,
                productGroupAvailabilityRules,
                userZona,
                userRegion,
                userDepo
            );
        });
        
        console.log(`📊 Filtered ${productGroups.length} groups to ${availableGroups.length} available groups`);
        if (availableGroups.length === 0) {
            console.warn('⚠️ No available groups found after filtering!');
            console.log('User info:', {
                zona: userZona,
                region: userRegion,
                depo: userDepo
            });
            console.log('Availability rules count:', productGroupAvailabilityRules.length);
            console.log('Availability rules (first 5):', productGroupAvailabilityRules.slice(0, 5));
            console.log('All product groups:', productGroups.map(g => ({ code: g.code, name: g.name })));
            
            // Test each group individually
            console.log('🔍 Testing each group availability:');
            productGroups.slice(0, 10).forEach(group => {
                const isAvailable = isProductGroupAvailable(
                    group.code,
                    productGroupAvailabilityRules,
                    userZona,
                    userRegion,
                    userDepo
                );
                const groupRules = productGroupAvailabilityRules.filter(r => r.product_group_code === group.code);
                console.log(`  - ${group.code}: ${isAvailable ? '✅' : '❌'} (${groupRules.length} rules)`);
            });
        }
        
        // Load product group members dengan version checking
        const membersResult = await syncCollectionData('product_group_members', 'product_group_members', loadProductGroupMembers);
        const groupMembers = membersResult.data || [];
        console.log(`📋 Loaded ${groupMembers?.length || 0} product group members ${membersResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        // Debug: Check if data from cache is stale (missing code field)
        if (groupMembers.length > 0) {
            const firstMember = groupMembers[0];
            if (!firstMember.code && !firstMember.product_code) {
                console.error('❌ CRITICAL: Data from cache is stale! Missing both code and product_code.');
                console.error('Solution: Clear cache or force refresh from server.');
                console.error('First member:', firstMember);
            } else if (!firstMember.code && firstMember.product_code) {
                console.warn('⚠️ WARNING: Data from cache has product_code but not code. Cache might be stale.');
                console.warn('First member:', firstMember);
            }
        }
        
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setProductGroupMembers(groupMembers);
        }
        if (!groupMembers || groupMembers.length === 0) {
            console.warn('⚠️ No product group members found!');
        }
        
        // Build group map: group_code -> [{product, priority}]
        // Hanya produk yang ada di product_group_members yang ditampilkan
        const groupMap = new Map();
        
        // Only add available groups to map
        availableGroups.forEach(group => {
            groupMap.set(group.code, []);
        });
        console.log(`🗺️ Initialized groupMap with ${availableGroups.length} available groups`);
        
        let matchedProductsCount = 0;
        let unmatchedProductsCount = 0;
        let unmatchedGroupsCount = 0;
        
        // Debug: Log first few members and available groups
        if (groupMembers && groupMembers.length > 0) {
            console.log('🔍 Sample group members from loadProductsData (first 5):', groupMembers.slice(0, 5).map(m => ({
                code: m.code,
                codeType: typeof m.code,
                codeValue: `"${m.code}"`,
                hasProductCode: 'product_code' in m,
                product_code: m.product_code, // Check if original field still exists
                product_group_code: m.product_group_code,
                product_group_code_type: typeof m.product_group_code,
                allKeys: Object.keys(m) // Show all available keys
            })));
            
            // Check if code is undefined and try to use product_code as fallback
            const firstMemberCheck = groupMembers[0];
            if (firstMemberCheck && !firstMemberCheck.code && firstMemberCheck.product_code) {
                console.warn('⚠️ WARNING: member.code is undefined but product_code exists! Using product_code as fallback.');
                console.log('First member details:', {
                    code: firstMemberCheck.code,
                    product_code: firstMemberCheck.product_code,
                    allKeys: Object.keys(firstMemberCheck)
                });
            }
            console.log('🔍 Sample products (first 5):', products.slice(0, 5).map(p => ({
                code: p.code,
                codeType: typeof p.code,
                codeLength: p.code?.length,
                name: p.name
            })));
            console.log('🔍 Sample available groups (first 5):', availableGroups.slice(0, 5).map(g => ({
                code: g.code,
                codeType: typeof g.code,
                name: g.name
            })));
            
            // Check for exact match between first member and first product
            const firstMemberTest = groupMembers[0];
            const firstProduct = products[0];
            if (firstMemberTest && firstProduct) {
                const memberCodeForTest = firstMemberTest.code || firstMemberTest.product_code;
                console.log('🔍 Matching test (first member vs first product):', {
                    memberCode: `"${memberCodeForTest}"`,
                    productCode: `"${firstProduct.code}"`,
                    exactMatch: memberCodeForTest === firstProduct.code,
                    caseInsensitiveMatch: memberCodeForTest?.toUpperCase() === firstProduct.code?.toUpperCase(),
                    trimmedMatch: memberCodeForTest?.trim() === firstProduct.code?.trim(),
                    memberCodeCharCodes: memberCodeForTest?.split('').map(c => c.charCodeAt(0)),
                    productCodeCharCodes: firstProduct.code?.split('').map(c => c.charCodeAt(0))
                });
            }
        }
        
        groupMembers.forEach(member => {
            // REQUIREMENT: member.code must exist (transformed from product_code in loadProductGroupMembers)
            // If member.code is undefined, it means:
            // 1. Data in product_group_members table is missing product_code column
            // 2. OR product_code values are NULL in the database
            // 3. OR transformation in loadProductGroupMembers() failed
            if (!member.code) {
                unmatchedProductsCount++;
                if (unmatchedProductsCount <= 3) {
                    console.error('❌ ERROR: member.code is undefined!');
                    console.error('Required columns from product_group_members table:');
                    console.error('  - product_code (TEXT, NOT NULL) → transformed to member.code');
                    console.error('  - product_group_code (TEXT, NOT NULL)');
                    console.error('  - priority (INTEGER, default 0)');
                    console.error('Current member object:', {
                        member,
                        allKeys: Object.keys(member),
                        hasCode: 'code' in member,
                        hasProductCode: 'product_code' in member
                    });
                }
                return;
            }
            
            // Try exact match first
            let product = products.find(p => p.code === member.code);
            
            // If no exact match, try case-insensitive
            if (!product) {
                product = products.find(p => p.code?.toUpperCase() === member.code.toUpperCase());
            }
            
            // If still no match, try trimmed
            if (!product) {
                product = products.find(p => p.code?.trim() === member.code.trim());
            }
            
            if (product) {
                // Only add to groups that are available (in availableGroups)
                // Note: member.product_group_code is now TEXT (code), not UUID
                let group = availableGroups.find(g => g.code === member.product_group_code);
                
                // If no exact match, try case-insensitive
                if (!group && member.product_group_code) {
                    group = availableGroups.find(g => g.code?.toUpperCase() === member.product_group_code.toUpperCase());
                }
                
                // If still no match, try trimmed
                if (!group && member.product_group_code) {
                    group = availableGroups.find(g => g.code?.trim() === member.product_group_code.trim());
                }
                
                if (group && groupMap.has(group.code)) {
                    groupMap.get(group.code).push({
                        product: product,
                        priority: member.priority ?? null // Use null instead of 0 for undefined priority
                    });
                    matchedProductsCount++;
                    
                    // Store product group mapping for cart grouping
                    productGroupMap.set(product.code, {
                        code: group.code,
                        name: group.name
                    });
                } else {
                    if (!group) {
                        unmatchedGroupsCount++;
                        // Only log first few to avoid spam
                        if (unmatchedGroupsCount <= 5) {
                            console.log(`⚠️ Group not found for member:`, {
                                code: member.code,
                                product_group_code: member.product_group_code,
                                product_group_code_type: typeof member.product_group_code,
                                available_group_codes: availableGroups.slice(0, 3).map(g => ({ code: g.code, name: g.name }))
                            });
                        }
                    }
                }
            } else {
                unmatchedProductsCount++;
                // Log first 10 unmatched to see pattern
                if (unmatchedProductsCount <= 10) {
                    console.log(`⚠️ Product not found for member code: "${member.code}" (type: ${typeof member.code}, length: ${member.code?.length})`);
                    console.log(`   Member code char codes:`, member.code?.split('').map(c => `${c}(${c.charCodeAt(0)})`).join(' '));
                    
                    // Find similar product codes (more aggressive search)
                    const similarProducts = products.filter(p => {
                        if (!p.code || !member.code) return false;
                        const pCode = p.code.toUpperCase().trim();
                        const mCode = member.code.toUpperCase().trim();
                        // Check if first 3-5 chars match
                        const minLen = Math.min(pCode.length, mCode.length, 5);
                        return pCode.slice(0, minLen) === mCode.slice(0, minLen) || 
                               pCode.includes(mCode.slice(0, 3)) || 
                               mCode.includes(pCode.slice(0, 3));
                    }).slice(0, 5);
                    
                    if (similarProducts.length > 0) {
                        console.log(`   Similar product codes found (${similarProducts.length}):`, similarProducts.map(p => ({ 
                            code: `"${p.code}"`, 
                            type: typeof p.code,
                            name: p.name,
                            charCodes: p.code?.split('').map(c => `${c}(${c.charCodeAt(0)})`).join(' ')
                        })));
                    } else {
                        console.log(`   No similar product codes found.`);
                    }
                    
                    // Show all product codes for comparison (first 10)
                    if (unmatchedProductsCount === 1) {
                        console.log(`   All product codes (first 10):`, products.slice(0, 10).map(p => ({ 
                            code: `"${p.code}"`, 
                            type: typeof p.code,
                            length: p.code?.length
                        })));
                    }
                }
            }
        });
        
        // Show detailed comparison if no matches
        if (matchedProductsCount === 0 && unmatchedProductsCount > 0) {
            console.error('❌ CRITICAL: No products matched!');
            console.log('📋 First 5 member codes:', groupMembers.slice(0, 5).map(m => ({
                memberCode: `"${m.code}"`,
                memberCodeType: typeof m.code,
                memberCodeLength: m.code?.length,
                memberCodeCharCodes: m.code?.split('').map(c => `${c}(${c.charCodeAt(0)})`).join(' ')
            })));
            console.log('📋 First 5 product codes:', products.slice(0, 5).map(p => ({
                productCode: `"${p.code}"`,
                productCodeType: typeof p.code,
                productCodeLength: p.code?.length,
                productCodeCharCodes: p.code?.split('').map(c => `${c}(${c.charCodeAt(0)})`).join(' ')
            })));
            
            // Try to find any partial matches
            const firstMemberCode = groupMembers[0]?.code;
            if (firstMemberCode) {
                const partialMatches = products.filter(p => {
                    if (!p.code) return false;
                    const pCode = p.code.toUpperCase().trim();
                    const mCode = firstMemberCode.toUpperCase().trim();
                    return pCode.includes(mCode) || mCode.includes(pCode) || 
                           pCode.slice(0, 3) === mCode.slice(0, 3);
                }).slice(0, 5);
                console.log(`🔍 Partial matches for "${firstMemberCode}":`, partialMatches.map(p => ({
                    code: `"${p.code}"`,
                    name: p.name
                })));
            }
        }
        
        console.log(`📊 Group mapping results:`, {
            matchedProducts: matchedProductsCount,
            unmatchedProducts: unmatchedProductsCount,
            unmatchedGroups: unmatchedGroupsCount,
            groupMapSizes: Array.from(groupMap.entries()).map(([code, products]) => ({ 
                code, 
                count: products.length,
                productCodes: products.map(p => p.product?.code || 'N/A').slice(0, 5) // First 5 product codes
            })),
            totalProductsInMap: Array.from(groupMap.values()).reduce((sum, arr) => sum + arr.length, 0),
            availableGroupsCount: availableGroups.length,
            groupMembersCount: groupMembers.length
        });
        
        // Load promo availability rules dengan version checking
        const promoAvailabilityResult = await syncCollectionData('promo_availability', 'promo_availability', loadPromoAvailability);
        promoAvailabilityRules = promoAvailabilityResult.data || [];
        console.log(`📋 Loaded ${promoAvailabilityRules?.length || 0} promo availability rules ${promoAvailabilityResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setPromoAvailability(promoAvailabilityRules);
        }
        
        // Get selected store type
        const storeTypeEl = document.getElementById('store-type');
        const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir'; // default grosir
        console.log(`🏪 Selected store type: ${selectedStoreType}`);
        
        // Load bundle promos dengan version checking
        const bundlePromosResult = await syncCollectionData('bundle_promos', 'bundle_promos', loadBundlePromos);
        bundlePromosList = bundlePromosResult.data || [];
        console.log(`🎁 Loaded ${bundlePromosList?.length || 0} bundle promos ${bundlePromosResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setBundlePromos(bundlePromosList);
        }
        
        // Filter promos based on availability (reuse userZona, userRegion, userDepo from above)
        const availablePromos = bundlePromosList.filter(promo => {
            return isPromoAvailable(
                promo.promo_id,
                'bundling',
                promoAvailabilityRules,
                selectedStoreType,
                userZona,
                userRegion,
                userDepo
            );
        });
        console.log(`✅ Filtered ${bundlePromosList.length} promos to ${availablePromos.length} available promos`);
        
        // Load bundle promo groups dengan version checking
        const bundlePromoGroupsResult = await syncCollectionData('bundle_promo_groups', 'bundle_promo_groups', loadAllBundlePromoGroups);
        bundlePromoGroupsList = bundlePromoGroupsResult.data || [];
        console.log(`📦 Loaded ${bundlePromoGroupsList?.length || 0} bundle promo groups ${bundlePromoGroupsResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setBundlePromoGroups(bundlePromoGroupsList);
        }
        
        // Load bucket members dengan version checking (jika ada version key untuk ini)
        // Note: bucket_members mungkin tidak punya version key terpisah, gunakan 'bundle_promo_groups' atau buat key baru
        const bucketMembersResult = await syncCollectionData('bucket_members', 'bundle_promo_groups', loadBucketMembers);
        const bucketMembers = bucketMembersResult.data || [];
        console.log(`🪣 Loaded ${bucketMembers?.length || 0} bucket members ${bucketMembersResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        // Build promo structure: promo_id -> bucket_id -> product_ids
        promoStructureMap.clear();
        productToPromoBucketMap.clear();
        productBucketMap.clear();
        
        availablePromos.forEach(promo => {
            const promoGroups = bundlePromoGroupsList.filter(pg => pg.promo_id === promo.promo_id);
            const bucketsMap = new Map(); // bucket_id -> product_ids[]
            
            promoGroups.forEach(pg => {
                const bucketId = pg.bucket_id;
                // Get products for this bucket from bucket_members
                const productsInBucket = bucketMembers
                    .filter(bm => bm.bucket_id === bucketId)
                    .map(bm => bm.product_code);
                
                bucketsMap.set(bucketId, productsInBucket);
                
                // Store mapping: product -> { promo_id, bucket_id }
                productsInBucket.forEach(productCode => {
                    productToPromoBucketMap.set(productCode, {
                        promo_id: promo.promo_id,
                        bucket_id: bucketId
                    });
                    productBucketMap.set(productCode, bucketId);
                });
            });
            
            promoStructureMap.set(promo.promo_id, {
                description: promo.description,
                buckets: bucketsMap
            });
        });
        
        console.log(`🗺️ Built promo structure: ${promoStructureMap.size} promos`);
        console.log(`🗺️ Mapped ${productToPromoBucketMap.size} products to promo/bucket`);
        
        // Load prices menggunakan zona user
        // Load prices dengan version checking (jika belum di-load sebelumnya)
        let prices;
        if (typeof window.AppStore !== 'undefined' && window.AppStore.getPrices(selectedZone).length > 0) {
            prices = window.AppStore.getPrices(selectedZone);
            console.log(`💰 Using cached prices for zone ${selectedZone}`);
        } else {
            const pricesResult = await syncCollectionData(`prices_${selectedZone}`, 'prices', () => loadPrices(selectedZone));
            prices = pricesResult.data || [];
            console.log(`💰 Loaded ${prices?.length || 0} prices for zone ${selectedZone} ${pricesResult.fromCache ? '(from cache)' : '(from server)'}`);
            if (typeof window.AppStore !== 'undefined') {
                window.AppStore.setPrices(selectedZone, prices);
            }
        }
        const priceMap = new Map();
        prices.forEach(price => {
            priceMap.set(price.product_code, price.base_price);
        });
        
        // Update productDataMap with prices (for calculation)
        productDataMap.forEach((product, productCode) => {
            const price = priceMap.get(productCode) || 0;
            if (!product.prices) {
                product.prices = {};
            }
            product.prices[selectedZone] = price;
        });
        
        // Render products grouped by product groups with accordion (only available groups)
        // Hanya tampilkan products yang ada di product_group_members
        renderProducts(availableGroups, groupMap, priceMap, products);
        
        // Load promo/discount data for calculation
        await loadCalculationData(products);
        
    } catch (error) {
        console.error('Error loading products data:', error);
        throw error;
    }
}

/**
 * Load promo/discount data for calculation
 */
async function loadCalculationData(products) {
    try {
        console.log('📊 Loading calculation data...');
        
        // Load principal discount tiers dengan version checking
        const principalResult = await syncCollectionData('principal_discount_tiers', 'principal_discount_tiers', loadPrincipalDiscountTiers);
        principalDiscountTiers = principalResult.data || [];
        console.log(`💰 Loaded ${principalDiscountTiers?.length || 0} principal discount tiers ${principalResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setPrincipalDiscountTiers(principalDiscountTiers);
        }
        
        // Load group promos dengan version checking
        const groupPromosResult = await syncCollectionData('group_promos', 'group_promos', loadGroupPromos);
        groupPromos = groupPromosResult.data || [];
        console.log(`🎁 Loaded ${groupPromos?.length || 0} group promos ${groupPromosResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setGroupPromos(groupPromos);
        }
        
        // Load group promo tiers dengan version checking
        const groupTiersResult = await syncCollectionData('group_promo_tiers', 'group_promo_tiers', loadGroupPromoTiers);
        groupPromoTiers = groupTiersResult.data || [];
        console.log(`📊 Loaded ${groupPromoTiers?.length || 0} group promo tiers ${groupTiersResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setGroupPromoTiers(groupPromoTiers);
        }
        
        // Load invoice discounts dengan version checking
        const invoiceResult = await syncCollectionData('invoice_discounts', 'invoice_discounts', loadInvoiceDiscounts);
        invoiceDiscounts = invoiceResult.data || [];
        console.log(`🧾 Loaded ${invoiceDiscounts?.length || 0} invoice discounts ${invoiceResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setInvoiceDiscounts(invoiceDiscounts);
        }
        
        // Load free product promos dengan version checking
        const freeProductResult = await syncCollectionData('free_product_promos', 'free_product_promos', loadFreeProductPromos);
        freeProductPromos = freeProductResult.data || [];
        console.log(`🎁 Loaded ${freeProductPromos?.length || 0} free product promos ${freeProductResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setFreeProductPromos(freeProductPromos);
        }
        
        // Load free product promo tiers dengan version checking
        // NOTE: Tiers sementara dinonaktifkan, akan diaktifkan jika diperlukan
        // const freeProductTiersResult = await syncCollectionData('free_product_promo_tiers', 'free_product_promo_tiers', loadFreeProductPromoTiers);
        // freeProductPromoTiers = freeProductTiersResult.data || [];
        // console.log(`🎁 Loaded ${freeProductPromoTiers?.length || 0} free product promo tiers ${freeProductTiersResult.fromCache ? '(from cache)' : '(from server)'}`);
        freeProductPromoTiers = []; // Set empty untuk sementara
        
        // if (typeof window.AppStore !== 'undefined') {
        //     window.AppStore.setFreeProductPromoTiers(freeProductPromoTiers);
        // }
        
        // Load loyalty data dengan version checking
        const loyaltyClassesResult = await syncCollectionData('store_loyalty_classes', 'store_loyalty_classes', loadLoyaltyClasses);
        loyaltyClasses = loyaltyClassesResult.data || [];
        
        const loyaltyAvailabilityResult = await syncCollectionData('store_loyalty_availability', 'store_loyalty_availability', loadLoyaltyAvailability);
        loyaltyAvailabilityRules = loyaltyAvailabilityResult.data || [];
        console.log(`🎯 Loaded ${loyaltyClasses?.length || 0} loyalty classes and ${loyaltyAvailabilityRules?.length || 0} availability rules ${loyaltyClassesResult.fromCache && loyaltyAvailabilityResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        if (typeof window.AppStore !== 'undefined') {
            window.AppStore.setLoyaltyClasses(loyaltyClasses);
            window.AppStore.setLoyaltyAvailability(loyaltyAvailabilityRules);
        }
        
        // Build principal map for products (only if products is provided)
        if (products && Array.isArray(products) && products.length > 0) {
            const productCodes = products.map(p => p.code);
            principalMap = await batchGetProductPrincipals(productCodes);
            console.log(`🔗 Mapped ${principalMap.size} products to principals`);
        } else if (productDataMap && productDataMap.size > 0) {
            // Fallback: use productDataMap if products not provided
            const productCodes = Array.from(productDataMap.keys());
            principalMap = await batchGetProductPrincipals(productCodes);
            console.log(`🔗 Mapped ${principalMap.size} products to principals (from productDataMap)`);
        } else {
            console.warn('⚠️ No products available for principal mapping');
        }
        
    } catch (error) {
        console.error('Error loading calculation data:', error);
        // Don't throw - calculation can still work with empty data
    }
}

/**
 * Load and display available promos in the promosi tab
 */
async function loadPromosData() {
    try {
        console.log('📋 Loading promos data for display...');
        
        // Get user info and store type
        const storeTypeEl = document.getElementById('store-type');
        const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
        const userZona = currentUser?.zona || null;
        const userRegion = currentUser?.region_name || null;
        const userDepo = currentUser?.depo_id || null;
        
        // Load all promo types (they should already be loaded in loadCalculationData, but we'll use them)
        // If not loaded yet, load them now
        if (promoAvailabilityRules.length === 0) {
            promoAvailabilityRules = await loadPromoAvailability();
        }
        if (principalDiscountTiers.length === 0) {
            principalDiscountTiers = await loadPrincipalDiscountTiers();
        }
        if (groupPromos.length === 0) {
            groupPromos = await loadGroupPromos();
            groupPromoTiers = await loadGroupPromoTiers();
        }
        if (bundlePromosList.length === 0) {
            bundlePromosList = await loadBundlePromos();
        }
        if (invoiceDiscounts.length === 0) {
            invoiceDiscounts = await loadInvoiceDiscounts();
        }
        if (freeProductPromos.length === 0) {
            freeProductPromos = await loadFreeProductPromos();
        }
        // Tiers sementara dinonaktifkan
        // if (freeProductPromoTiers.length === 0) {
        //     freeProductPromoTiers = await loadFreeProductPromoTiers();
        // }
        freeProductPromoTiers = []; // Set empty untuk sementara
        
        // Filter and group promos by type with tiers
        const availablePromos = {
            principal: [],
            strata: [],
            bundling: [],
            invoice: [],
            free_product: []
        };
        
        // 1. Principal Discount Promos with tiers
        const principalPromoMap = new Map(); // promo_id -> { promo info, tiers: [] }
        principalDiscountTiers.forEach(tier => {
            if (isPromoAvailable(
                tier.promo_id,
                'principal',
                promoAvailabilityRules,
                selectedStoreType,
                userZona,
                userRegion,
                userDepo
            )) {
                if (!principalPromoMap.has(tier.promo_id)) {
                    principalPromoMap.set(tier.promo_id, {
                        promo_id: tier.promo_id,
                        description: tier.description,
                        type: 'principal',
                        tiers: []
                    });
                }
                principalPromoMap.get(tier.promo_id).tiers.push({
                    min_purchase_amount: tier.min_purchase_amount,
                    discount_percentage: tier.discount_percentage,
                    priority: tier.priority,
                    principal_codes: tier.principal_codes
                });
            }
        });
        availablePromos.principal = Array.from(principalPromoMap.values());
        
        // Sort tiers by min_purchase_amount (ascending)
        availablePromos.principal.forEach(promo => {
            promo.tiers.sort((a, b) => parseFloat(a.min_purchase_amount || 0) - parseFloat(b.min_purchase_amount || 0));
        });
        
        // 2. Group Promo (Strata) with tiers
        const strataPromoMap = new Map(); // promo_id -> { promo info, tiers: [] }
        groupPromos.forEach(promo => {
            if (isPromoAvailable(
                promo.promo_id,
                'strata',
                promoAvailabilityRules,
                selectedStoreType,
                userZona,
                userRegion,
                userDepo
            )) {
                strataPromoMap.set(promo.promo_id, {
                    promo_id: promo.promo_id,
                    description: promo.description,
                    product_group_code: promo.product_group_code,
                    tier_mode: promo.tier_mode,
                    tier_unit: promo.tier_unit,
                    type: 'strata',
                    tiers: []
                });
            }
        });
        
        // Add tiers to strata promos
        groupPromoTiers.forEach(tier => {
            if (strataPromoMap.has(tier.promo_id)) {
                strataPromoMap.get(tier.promo_id).tiers.push({
                    min_qty: tier.min_qty,
                    discount_per_unit: tier.discount_per_unit,
                    variant_count: tier.variant_count,
                    priority: tier.priority
                });
            }
        });
        availablePromos.strata = Array.from(strataPromoMap.values());
        
        // Sort tiers by min_qty (ascending)
        availablePromos.strata.forEach(promo => {
            promo.tiers.sort((a, b) => parseFloat(a.min_qty || 0) - parseFloat(b.min_qty || 0));
        });
        
        // 3. Bundle Promos
        bundlePromosList.forEach(promo => {
            if (isPromoAvailable(
                promo.promo_id,
                'bundling',
                promoAvailabilityRules,
                selectedStoreType,
                userZona,
                userRegion,
                userDepo
            )) {
                availablePromos.bundling.push({
                    promo_id: promo.promo_id,
                    description: promo.description,
                    discount_per_package: promo.discount_per_package,
                    max_packages: promo.max_packages,
                    type: 'bundling'
                });
            }
        });
        
        // 4. Invoice Discounts
        invoiceDiscounts.forEach(promo => {
            // Filter by promo availability (same as other promo types)
            if (isPromoAvailable(
                promo.promo_id,
                'invoice',
                promoAvailabilityRules,
                selectedStoreType,
                userZona,
                userRegion,
                userDepo
            )) {
                availablePromos.invoice.push({
                    promo_id: promo.promo_id,
                    description: promo.description,
                    min_purchase_amount: promo.min_purchase_amount,
                    payment_method: promo.payment_method,
                    discount_percentage: promo.discount_percentage,
                    type: 'invoice'
                });
            }
        });
        
        // 5. Free Product Promos
        freeProductPromos.forEach(promo => {
            if (isPromoAvailable(
                promo.promo_id,
                'free_product',
                promoAvailabilityRules,
                selectedStoreType,
                userZona,
                userRegion,
                userDepo
            )) {
                availablePromos.free_product.push({
                    promo_id: promo.promo_id,
                    description: promo.description,
                    trigger_type: promo.trigger_type,
                    min_purchase_amount: promo.min_purchase_amount,
                    min_quantity: promo.min_quantity,
                    purchase_scope: promo.purchase_scope,
                    free_quantity: promo.free_quantity,
                    type: 'free_product'
                });
            }
        });
        
        // Render promos to tab
        renderPromos(availablePromos, promoAvailabilityRules, currentUser);
        
        console.log('✅ Promos loaded:', {
            principal: availablePromos.principal.length,
            strata: availablePromos.strata.length,
            bundling: availablePromos.bundling.length,
            invoice: availablePromos.invoice.length,
            free_product: availablePromos.free_product.length
        });
        
    } catch (error) {
        console.error('Error loading promos data:', error);
        const promoContainer = document.querySelector('#tab-promosi .promo-table-container');
        if (promoContainer) {
            promoContainer.innerHTML = '<p style="color: red;">Gagal memuat data promosi. Silakan refresh halaman.</p>';
        }
    }
}

/**
 * Render promos to the promosi tab
 */
function renderPromos(promos, promoAvailabilityRules = [], currentUser = null) {
    const container = document.querySelector('#tab-promosi .promo-table-container');
    if (!container) {
        console.warn('⚠️ Promo container not found');
        return;
    }
    
    let html = '';
    
    // Format currency
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
    
    // Create accordion structure for each promo type
    html += '<div class="promo-accordion-container">';
    
    // 1. Principal Discount Promos with tiers (Format seperti kalkulator)
    if (promos.principal.length > 0) {
        const principalCount = promos.principal.reduce((sum, p) => sum + (p.tiers?.length || 0), 0);
        html += '<div class="accordion-item promo-accordion-item">';
        html += `<div class="accordion-header promo-accordion-header" onclick="togglePromoAccordion(this)">
            <span class="accordion-toggle">▼</span>
            <span class="accordion-title">💰 Promo Reguler</span>
            <span class="accordion-count">(${principalCount} tier)</span>
        </div>`;
        html += '<div class="accordion-content promo-accordion-content" style="display: none;">';
        
        // Build flat list of all tiers with promo availability info
        const allPrincipalTiers = [];
        promos.principal.forEach(promo => {
            if (promo.tiers && promo.tiers.length > 0) {
                promo.tiers.forEach(tier => {
                    // Check if this tier's promo is depo-specific
                    const promoAvailability = (promoAvailabilityRules || []).find(rule => 
                        rule.promo_id === promo.promo_id && rule.promo_type === 'principal'
                    );
                    const isDepoSpecific = promoAvailability && 
                        promoAvailability.depo_codes && 
                        promoAvailability.depo_codes.length > 0 &&
                        (!promoAvailability.region_codes || promoAvailability.region_codes.length === 0);
                    
                    allPrincipalTiers.push({
                        principal_codes: tier.principal_codes,
                        min_purchase_amount: tier.min_purchase_amount,
                        discount_percentage: tier.discount_percentage,
                        isDepoSpecific: isDepoSpecific
                    });
                });
            }
        });
        
        // Sort by principal (alphabetically), then by min_purchase_amount
        allPrincipalTiers.sort((a, b) => {
            const principalA = Array.isArray(a.principal_codes) ? a.principal_codes.sort().join(',') : String(a.principal_codes || '');
            const principalB = Array.isArray(b.principal_codes) ? b.principal_codes.sort().join(',') : String(b.principal_codes || '');
            const principalCompare = principalA.localeCompare(principalB);
            if (principalCompare !== 0) return principalCompare;
            return parseFloat(a.min_purchase_amount || 0) - parseFloat(b.min_purchase_amount || 0);
        });
        
        html += '<div class="promo-list">';
        html += '<table class="promo-tier-table">';
        html += '<thead><tr><th>Principal & Lingkup</th><th>Target Bruto (DPP)</th><th>Diskon</th></tr></thead>';
        html += '<tbody>';
        allPrincipalTiers.forEach(tier => {
            const principals = Array.isArray(tier.principal_codes) 
                ? tier.principal_codes.join(',') 
                : (tier.principal_codes || '-');
            const depoBadge = tier.isDepoSpecific 
                ? '<span style="font-size:0.7em; background:#28a745; color:white; padding:1px 4px; border-radius:2px; margin-left:5px;">Khusus Depo</span>' 
                : '';
            html += `<tr>
                <td>${principals}${depoBadge}</td>
                <td><strong>${formatCurrency(tier.min_purchase_amount)}</strong></td>
                <td style="color: var(--success-color, #28a745); font-weight: bold;">${tier.discount_percentage.toFixed(2)}%</td>
            </tr>`;
        });
        html += '</tbody></table>';
        html += '</div></div>';
    }
    
    // 2. Group Promo (Strata) with tiers
    if (promos.strata.length > 0) {
        html += '<div class="promo-section-type">';
        html += '<h3>📊 Promo Grup Produk (Strata)</h3>';
        html += '<div class="promo-list">';
        promos.strata.forEach(promo => {
            html += `<div class="promo-item">
                <div class="promo-id"><strong>${promo.promo_id}</strong></div>
                <div class="promo-description">${promo.description || '-'}</div>
                <div class="promo-detail">Group: ${promo.product_group_code} | Mode: ${promo.tier_mode} | Unit: ${promo.tier_unit}</div>`;
            
            // Display tiers
            if (promo.tiers && promo.tiers.length > 0) {
                html += '<div class="promo-tiers">';
                html += '<table class="promo-tier-table">';
                
                // Build header row based on tier_mode
                if (promo.tier_mode === "mix") {
                    html += '<thead><tr><th>Min. Qty</th><th>Diskon per Unit</th><th>Varian</th></tr></thead>';
                } else {
                    html += '<thead><tr><th>Min. Qty</th><th>Diskon per Unit</th></tr></thead>';
                }
                
                html += '<tbody>';
                promo.tiers.forEach(tier => {
                    if (promo.tier_mode === "mix") {
                        html += `<tr>
                            <td><strong>${tier.min_qty}</strong></td>
                            <td style="color: var(--success-color, #28a745); font-weight: bold;">${formatCurrency(tier.discount_per_unit)}</td>
                            <td>${tier.variant_count || '-'}</td>
                        </tr>`;
                    } else {
                        html += `<tr>
                            <td><strong>${tier.min_qty}</strong></td>
                            <td style="color: var(--success-color, #28a745); font-weight: bold;">${formatCurrency(tier.discount_per_unit)}</td>
                        </tr>`;
                    }
                });
                html += '</tbody></table>';
                html += '</div>';
            }
            
            html += '</div>';
        });
        html += '</div>';
        html += '</div></div>'; // Close accordion-content and accordion-item
    }
    
    // 3. Bundle Promos
    if (promos.bundling.length > 0) {
        html += '<div class="accordion-item promo-accordion-item">';
        html += `<div class="accordion-header promo-accordion-header" onclick="togglePromoAccordion(this)">
            <span class="accordion-toggle">▼</span>
            <span class="accordion-title">🎁 Promo Bundling</span>
            <span class="accordion-count">(${promos.bundling.length} promo)</span>
        </div>`;
        html += '<div class="accordion-content promo-accordion-content" style="display: none;">';
        html += '<div class="promo-list">';
        promos.bundling.forEach(promo => {
            // Get bucket IDs for this promo from bundlePromoGroupsList
            const buckets = bundlePromoGroupsList
                .filter(g => g.promo_id === promo.promo_id)
                .map(g => g.bucket_id)
                .sort()
                .join(', ');
            
            // Format: Paket X (bucket 1, bucket 2)
            const shortDescription = buckets 
                ? `Paket ${promo.promo_id} (${buckets})`
                : (promo.description || promo.promo_id);
            
            html += `<div class="promo-item">
                <div class="promo-id"><strong>${promo.promo_id}</strong></div>
                <div class="promo-description">${shortDescription}</div>
                <div class="promo-detail">Diskon per paket: ${formatCurrency(promo.discount_per_package)}${promo.max_packages ? ` | Max paket: ${promo.max_packages}` : ''}</div>
            </div>`;
        });
        html += '</div>';
        html += '</div></div>'; // Close accordion-content and accordion-item
    }
    
    // 4. Invoice Discounts
    if (promos.invoice.length > 0) {
        html += '<div class="accordion-item promo-accordion-item">';
        html += `<div class="accordion-header promo-accordion-header" onclick="togglePromoAccordion(this)">
            <span class="accordion-toggle">▼</span>
            <span class="accordion-title">🧾 Diskon Invoice</span>
            <span class="accordion-count">(${promos.invoice.length} promo)</span>
        </div>`;
        html += '<div class="accordion-content promo-accordion-content" style="display: none;">';
        html += '<div class="promo-list">';
        promos.invoice.forEach(promo => {
            html += `<div class="promo-item">
                <div class="promo-id"><strong>${promo.promo_id}</strong></div>
                <div class="promo-description">${promo.description || '-'}</div>
                <div class="promo-detail">Min. belanja: ${formatCurrency(promo.min_purchase_amount)} | Metode: ${promo.payment_method} | Diskon: ${(parseFloat(promo.discount_percentage) || 0).toFixed(2)}%</div>
            </div>`;
        });
        html += '</div>';
        html += '</div></div>'; // Close accordion-content and accordion-item
    }
    
    // 5. Free Product Promos
    if (promos.free_product.length > 0) {
        html += '<div class="accordion-item promo-accordion-item">';
        html += `<div class="accordion-header promo-accordion-header" onclick="togglePromoAccordion(this)">
            <span class="accordion-toggle">▼</span>
            <span class="accordion-title">🎁 Promo Gratis Produk</span>
            <span class="accordion-count">(${promos.free_product.length} promo)</span>
        </div>`;
        html += '<div class="accordion-content promo-accordion-content" style="display: none;">';
        html += '<div class="promo-list">';
        promos.free_product.forEach(promo => {
            const triggerText = promo.trigger_type === 'nominal' 
                ? `Min. belanja: ${formatCurrency(promo.min_purchase_amount)}`
                : `Min. qty: ${promo.min_quantity}`;
            html += `<div class="promo-item">
                <div class="promo-id"><strong>${promo.promo_id}</strong></div>
                <div class="promo-description">${promo.description || '-'}</div>
                <div class="promo-detail">${triggerText} | Scope: ${promo.purchase_scope} | Gratis: ${promo.free_quantity} pcs</div>
            </div>`;
        });
        html += '</div>';
        html += '</div></div>'; // Close accordion-content and accordion-item
    }
    
    // 6. Loyalty Rules (hanya untuk Grosir) - tidak perlu accordion, langsung tampil
    const storeTypeEl = document.getElementById('store-type');
    const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
    
    if (selectedStoreType === 'grosir' && loyaltyClasses && loyaltyClasses.length > 0 && loyaltyAvailabilityRules && loyaltyAvailabilityRules.length > 0) {
        const userZona = currentUser?.zona || null;
        const userRegion = currentUser?.region_name || null;
        const userDepo = currentUser?.depo_id || null;
        
        // Filter loyalty classes yang available untuk area user dan store_type grosir
        const availableLoyaltyClasses = loyaltyClasses.filter(loyaltyClass => {
            // Filter store_type: hanya 'grosir' atau 'all'
            if (loyaltyClass.store_type !== 'grosir' && loyaltyClass.store_type !== 'all') {
                return false;
            }
            
            // Cek availability
            return isLoyaltyClassAvailable(
                loyaltyClass.code,
                loyaltyAvailabilityRules,
                userZona,
                userRegion,
                userDepo
            );
        });
        
        if (availableLoyaltyClasses.length > 0) {
            // Map dan resolve rules untuk semua classes
            const loyaltyRulesWithData = availableLoyaltyClasses
                .map(loyaltyClass => {
                    const rule = resolveLoyaltyRule(loyaltyClass.code, selectedStoreType, loyaltyClasses);
                    if (rule) {
                        return {
                            classCode: loyaltyClass.code,
                            targetMonthly: rule.target_monthly,
                            cashbackPercentage: rule.cashback_percentage
                        };
                    }
                    return null;
                })
                .filter(item => item !== null)
                .sort((a, b) => b.targetMonthly - a.targetMonthly); // Sort descending by target_monthly
            
            if (loyaltyRulesWithData.length > 0) {
                html += '<div class="promo-section-type">';
                html += '<h3>🎯 Program Loyalty (Cashback)</h3>';
                html += '<div class="promo-list">';
                html += '<table class="promo-tier-table">';
                html += '<thead><tr><th>Kelas</th><th>Target Bulanan</th><th>Cashback</th></tr></thead>';
                html += '<tbody>';
                
                loyaltyRulesWithData.forEach(item => {
                    html += `<tr>
                        <td><strong>${item.classCode}</strong></td>
                        <td><strong>${formatCurrency(item.targetMonthly)}</strong></td>
                        <td style="color: var(--success-color, #28a745); font-weight: bold;">${item.cashbackPercentage}%</td>
                    </tr>`;
                });
                
                html += '</tbody></table>';
                html += '</div></div>';
            }
        }
    }
    
    // If no promos available
    if (html === '') {
        html = '<p>Tidak ada promosi yang tersedia saat ini.</p>';
    }
    
    container.innerHTML = html;
}

/**
 * Toggle accordion untuk promo section
 * Fungsi ini harus global karena dipanggil dari onclick attribute
 */
window.togglePromoAccordion = function(header) {
    const content = header.nextElementSibling;
    const toggle = header.querySelector('.accordion-toggle');
    
    if (!content || !toggle) {
        console.warn('⚠️ togglePromoAccordion: content or toggle not found');
        return;
    }
    
    // Check current state: if display is 'none' or empty (default collapsed), expand it
    const isCurrentlyHidden = content.style.display === 'none' || 
                              content.style.display === '' ||
                              window.getComputedStyle(content).display === 'none';
    
    if (isCurrentlyHidden) {
        content.style.display = 'block';
        toggle.textContent = '▲';
        header.classList.add('expanded');
    } else {
        content.style.display = 'none';
        toggle.textContent = '▼';
        header.classList.remove('expanded');
    }
};

/**
 * Get upselling recommendation for group promo (strata)
 * @param {string} groupCode - Product group code
 * @param {Map} cart - Cart items
 * @param {Map} productDataMap - Product data map
 * @param {Map} productGroupMap - Product group map
 * @param {Array} groupPromos - Array of group promo headers
 * @param {Array} groupPromoTiers - Array of group promo tiers
 * @param {string} userZona - User's zona
 * @param {string} userRegion - User's region
 * @param {string} userDepo - User's depo
 * @param {Function} isPromoAvailable - Function to check promo availability
 * @param {Array} promoAvailabilityRules - Promo availability rules
 * @param {string} storeType - Store type
 * @param {Array} productGroupAvailabilityRules - Product group availability rules
 * @param {Function} isProductGroupAvailable - Function to check group availability
 * @param {Array} allProducts - All products array (for variant suggestions)
 * @returns {Object|null} Upselling recommendation or null
 */
function getStrataUpsellingRecommendation(
    groupCode,
    cart,
    productDataMap,
    productGroupMap,
    groupPromos,
    groupPromoTiers,
    userZona,
    userRegion,
    userDepo,
    isPromoAvailable,
    promoAvailabilityRules,
    storeType,
    productGroupAvailabilityRules,
    isProductGroupAvailable,
    allProducts
) {
    console.log(`🔍 [Upselling] Checking group: ${groupCode}`, {
        cartSize: cart?.size || 0,
        groupPromosCount: groupPromos?.length || 0,
        groupPromoTiersCount: groupPromoTiers?.length || 0
    });
    
    // 1. Check if group is available
    if (isProductGroupAvailable && productGroupAvailabilityRules) {
        const isAvailable = isProductGroupAvailable(
            groupCode,
            productGroupAvailabilityRules,
            userZona,
            userRegion,
            userDepo
        );
        if (!isAvailable) {
            console.log(`  ❌ Group ${groupCode} not available for user area`);
            return null;
        }
    }
    
    // 2. Find promo for this group
    const promosForGroup = groupPromos.filter(promo => {
        const promoGroupCode = (promo.product_group_code || '').toUpperCase().trim();
        const targetGroupCode = (groupCode || '').toUpperCase().trim();
        return promoGroupCode === targetGroupCode;
    });
    
    if (promosForGroup.length === 0) {
        console.log(`  ❌ No promo found for group ${groupCode}`);
        return null;
    }
    
    console.log(`  ✅ Found ${promosForGroup.length} promo(s) for group ${groupCode}`);
    
    // 3. Filter available promos
    const availablePromos = promosForGroup.filter(promo => {
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
        console.log(`  ❌ No available promo for group ${groupCode} after filtering`);
        return null;
    }
    
    console.log(`  ✅ Found ${availablePromos.length} available promo(s) for group ${groupCode}`);
    
    // Use first available promo (or merge logic if multiple)
    const promo = availablePromos[0];
    
    // 4. Get all tiers for this promo, sorted by min_qty ascending
    const tiers = groupPromoTiers
        .filter(tier => tier.promo_id === promo.promo_id)
        .sort((a, b) => {
            const minA = parseFloat(a.min_qty) || 0;
            const minB = parseFloat(b.min_qty) || 0;
            return minA - minB;
        });
    
    if (tiers.length === 0) return null;
    
    // 5. Calculate current quantity for this group
    const tierUnit = promo.tier_unit || 'unit_1';
    let currentQty = 0;
    const itemsInGroup = [];
    
    cart.forEach((item, productId) => {
        const product = productDataMap.get(productId);
        if (!product) return;
        
        const groupInfo = productGroupMap.get(productId);
        if (!groupInfo || groupInfo.code !== groupCode) return;
        
        itemsInGroup.push({ item, product });
        
        const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || 0;
        const qtyBox = item.quantities?.box || item.quantities?.unit_2 || 0;
        const ratio = product.ratio_unit_2_per_unit_1 || 1;
        
        if (tierUnit === 'unit_1') {
            const fractionalKrt = ratio > 0 ? (qtyBox / ratio) : 0;
            currentQty += qtyKrt + fractionalKrt;
        } else if (tierUnit === 'unit_2') {
            const totalBoxes = (qtyKrt * ratio) + qtyBox;
            currentQty += totalBoxes;
        }
    });
    
    if (itemsInGroup.length === 0) {
        console.log(`  ❌ No items in cart for group ${groupCode}`);
        return null;
    }
    
    console.log(`  ✅ Found ${itemsInGroup.length} item(s) in cart for group ${groupCode}, currentQty: ${currentQty}`);
    
    // 6. Find current active tier
    const sortedTiers = [...tiers].sort((a, b) => {
        const minA = parseFloat(a.min_qty) || 0;
        const minB = parseFloat(b.min_qty) || 0;
        return minA - minB;
    });
    
    let currentTier = null;
    for (let i = 0; i < sortedTiers.length; i++) {
        const tier = sortedTiers[i];
        const minQty = parseFloat(tier.min_qty) || 0;
        const nextTier = sortedTiers[i + 1];
        const nextMinQty = nextTier ? parseFloat(nextTier.min_qty) || Infinity : Infinity;
        
        if (currentQty >= minQty && currentQty < nextMinQty) {
            currentTier = tier;
            break;
        }
    }
    
    if (!currentTier) {
        console.log(`  ❌ No current tier found for group ${groupCode} with qty ${currentQty}`);
        return null;
    }
    
    const currentDiscountPerUnit = parseFloat(currentTier.discount_per_unit) || 0;
    console.log(`  ✅ Current tier: min_qty=${currentTier.min_qty}, discount=${currentDiscountPerUnit}`);
    
    // 7. Find next tier with higher discount
    const betterTiers = sortedTiers.filter(tier => {
        const tierDiscount = parseFloat(tier.discount_per_unit) || 0;
        return tierDiscount > currentDiscountPerUnit;
    });
    
    if (betterTiers.length === 0) {
        console.log(`  ❌ No better tier found for group ${groupCode} (current discount: ${currentDiscountPerUnit})`);
        return null;
    }
    
    // 8. Get nearest tier (lowest min_qty among better tiers)
    const nextTier = betterTiers[0];
    const nextMinQty = parseFloat(nextTier.min_qty) || 0;
    const nextDiscountPerUnit = parseFloat(nextTier.discount_per_unit) || 0;
    
    console.log(`  ✅ Next tier: min_qty=${nextMinQty}, discount=${nextDiscountPerUnit}`);
    
    // 9. Calculate gap
    const gapQty = Math.max(0, nextMinQty - currentQty);
    
    if (gapQty <= 0) {
        console.log(`  ❌ Gap qty is 0 or negative for group ${groupCode}`);
        return null;
    }
    
    console.log(`  ✅ Upselling recommendation found for group ${groupCode}: gap=${gapQty}, nextDiscount=${nextDiscountPerUnit}`);
    
    // 10. Check variant requirement
    const tierMode = promo.tier_mode || 'non mix';
    let variantGap = 0;
    let suggestedVariants = [];
    
    if (tierMode === 'mix' && nextTier.variant_count) {
        const requiredVariants = parseInt(nextTier.variant_count) || 0;
        const currentVariants = new Set(itemsInGroup.map(({ product }) => product.code));
        const currentVariantCount = currentVariants.size;
        
        variantGap = Math.max(0, requiredVariants - currentVariantCount);
        
        // Get suggested variants (products in group that are not in cart)
        if (variantGap > 0 && allProducts) {
            suggestedVariants = allProducts
                .filter(p => {
                    const groupInfo = productGroupMap.get(p.code);
                    return groupInfo && groupInfo.code === groupCode && !currentVariants.has(p.code);
                })
                .slice(0, 3) // Max 3 suggestions
                .map(p => p.code);
        }
    }
    
    return {
        groupCode: groupCode,
        groupName: productGroupMap.get(itemsInGroup[0].product.code)?.name || groupCode,
        currentDiscountPerUnit: currentDiscountPerUnit,
        nextDiscountPerUnit: nextDiscountPerUnit,
        nextMinQty: nextMinQty,
        gapQty: gapQty,
        tierUnit: tierUnit,
        variantGap: variantGap,
        suggestedVariants: suggestedVariants
    };
}

/**
 * Get bundle promo upselling recommendation
 * Returns recommendation for adding quantity to get bundle promo discount
 * 
 * @param {string} promoId - Bundle promo ID
 * @param {Map} cart - Cart items
 * @param {Map} productDataMap - Product data map
 * @param {Map} promoStructureMap - Promo structure map (promo_id -> { buckets: Map<bucketId, productIds[]> })
 * @param {Array} bundlePromos - Array of bundle promo headers
 * @param {Array} bundlePromoGroups - Array of bundle promo groups
 * @param {Array} promoAvailabilityRules - Array of promo availability rules
 * @param {string} storeType - Store type ('grosir' or 'retail')
 * @param {string} userZona - User's zona
 * @param {string} userRegion - User's region
 * @param {string} userDepo - User's depo
 * @param {Function} isPromoAvailable - Function to check if promo is available
 * @returns {Object|null} Upselling recommendation or null
 */
function getBundleUpsellingRecommendation(
    promoId,
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
    console.log(`🔍 [Bundle Upselling] Checking promo: ${promoId}`, {
        cartSize: cart?.size || 0,
        bundlePromosCount: bundlePromos?.length || 0
    });
    
    // 1. Check if promo exists and is available
    const promo = bundlePromos.find(p => p.promo_id === promoId);
    if (!promo) {
        console.log(`  ❌ Promo ${promoId} not found`);
        return null;
    }
    
    const isAvailable = isPromoAvailable(
        promo.promo_id,
        'bundling',
        promoAvailabilityRules,
        storeType,
        userZona,
        userRegion,
        userDepo
    );
    
    if (!isAvailable) {
        console.log(`  ❌ Promo ${promoId} not available for user area`);
        return null;
    }
    
    // 2. Get promo structure
    const promoData = promoStructureMap.get(promoId);
    if (!promoData || !promoData.buckets) {
        console.log(`  ❌ No buckets found for promo ${promoId}`);
        return null;
    }
    
    // 3. Get groups for this promo
    const groups = bundlePromoGroups.filter(g => g.promo_id === promoId);
    if (groups.length === 0) {
        console.log(`  ❌ No groups found for promo ${promoId}`);
        return null;
    }
    
    // 4. Calculate current packages per bucket
    const bucketInfo = [];
    
    groups.forEach(group => {
        const bucketId = group.bucket_id;
        const requiredQty = parseFloat(group.total_quantity) || 0;
        const unit = group.unit || 'unit_1';
        
        if (requiredQty <= 0) {
            return;
        }
        
        // Get products in this bucket
        const productsInBucket = promoData.buckets.get(bucketId) || [];
        if (productsInBucket.length === 0) {
            return;
        }
        
        // Calculate total quantity of products in this bucket from cart
        let totalQtyInBucket = 0;
        
        productsInBucket.forEach(productId => {
            const cartItem = cart.get(productId);
            if (!cartItem) return;
            
            const product = productDataMap.get(productId);
            if (!product) return;
            
            const qtyKrt = cartItem.quantities?.krt || cartItem.quantities?.unit_1 || 0;
            const qtyBox = cartItem.quantities?.box || cartItem.quantities?.unit_2 || 0;
            const ratio = product.ratio_unit_2_per_unit_1 || 1;
            
            if (unit === 'unit_1') {
                const fractionalKrt = ratio > 0 ? (qtyBox / ratio) : 0;
                totalQtyInBucket += qtyKrt + fractionalKrt;
            } else if (unit === 'unit_2') {
                const totalBoxes = (qtyKrt * ratio) + qtyBox;
                totalQtyInBucket += totalBoxes;
            } else {
                const fractionalKrt = ratio > 0 ? (qtyBox / ratio) : 0;
                totalQtyInBucket += qtyKrt + fractionalKrt;
            }
        });
        
        // Calculate how many packages can be formed from this bucket
        const packages = Math.floor(totalQtyInBucket / requiredQty);
        const remainder = totalQtyInBucket % requiredQty;
        // Gap to next package: if remainder is 0, we need full requiredQty for next package
        // Otherwise, we need (requiredQty - remainder)
        const gapToNextPackage = remainder === 0 ? requiredQty : (requiredQty - remainder);
        
        bucketInfo.push({
            bucketId: bucketId,
            requiredQty: requiredQty,
            unit: unit,
            currentQty: totalQtyInBucket,
            packages: packages,
            gapToNextPackage: gapToNextPackage,
            productsInBucket: productsInBucket
        });
    });
    
    if (bucketInfo.length === 0) {
        console.log(`  ❌ No valid buckets for promo ${promoId}`);
        return null;
    }
    
    // 5. Calculate current complete packages berdasarkan jumlah qty di cart
    const packagesPerBucket = bucketInfo.map(b => b.packages);
    const currentPackages = Math.min(...packagesPerBucket);
    const maxPackagesPerBucket = Math.max(...packagesPerBucket);
    
    // 6. Check max_packages limit
    const maxPackages = promo.max_packages ? parseFloat(promo.max_packages) : null;
    const discountPerPackage = parseFloat(promo.discount_per_package) || 0;
    
    // 7. Determine upselling scenario
    let targetPackages = currentPackages + 1;
    if (maxPackages && targetPackages > maxPackages) {
        console.log(`  ❌ Already at max packages (${maxPackages}) for promo ${promoId}`);
        return null;
    }
    
    // 8. Tentukan bucket yang "lebih" dan bucket yang "kurang" berdasarkan jumlah qty
    // Bucket yang "lebih" = bucket dengan packages lebih banyak (jumlah qty lebih besar)
    // Bucket yang "kurang" = bucket dengan packages lebih sedikit (jumlah qty lebih kecil)
    // Rekomendasi muncul di bucket yang "lebih" untuk menambahkan bucket yang "kurang"
    
    // OPSI 1: Tidak ada rekomendasi jika semua bucket sudah sama packages-nya (rule sudah terpenuhi)
    // Rekomendasi hanya muncul jika ada bucket yang "lebih" jelas (packages berbeda)
    if (maxPackagesPerBucket === currentPackages) {
        console.log(`  ℹ️ All buckets have same packages (${currentPackages}) - rule already fulfilled, no recommendation needed`);
        return null;
    }
    
    let sourceBucket = null; // Bucket yang akan menampilkan rekomendasi (yang lebih)
    let targetBucket = null; // Bucket yang perlu ditambahkan (yang kurang)
    
    // Ada bucket yang lebih banyak dari yang lain (berdasarkan jumlah qty)
    // Rekomendasi muncul di bucket yang lebih untuk menambahkan bucket yang kurang
    
    // Cari bucket dengan packages paling banyak (source bucket - yang lebih)
    sourceBucket = bucketInfo.find(b => b.packages === maxPackagesPerBucket);
    
    // Cari bucket dengan packages paling sedikit atau gap terbesar (target bucket - yang kurang)
    const bucketsWithLessPackages = bucketInfo.filter(b => b.packages === currentPackages);
    targetBucket = bucketsWithLessPackages.reduce((min, bucket) => {
        if (!min || bucket.gapToNextPackage < min.gapToNextPackage) {
            return bucket;
        }
        return min;
    });
    
    console.log(`  📊 Bucket comparison: maxPackages=${maxPackagesPerBucket}, minPackages=${currentPackages}`);
    console.log(`  📍 Source bucket (lebih): ${sourceBucket.bucketId} (${sourceBucket.packages} packages)`);
    console.log(`  📍 Target bucket (kurang): ${targetBucket.bucketId} (${targetBucket.packages} packages, gap=${targetBucket.gapToNextPackage})`);
    
    if (!sourceBucket || !targetBucket || sourceBucket.bucketId === targetBucket.bucketId) {
        console.log(`  ❌ No valid source/target bucket found for promo ${promoId}`);
        return null;
    }
    
    if (targetBucket.gapToNextPackage <= 0) {
        console.log(`  ❌ No gap found for promo ${promoId}`);
        return null;
    }
    
    // 9. Determine if this is for first package or next package
    const isFirstPackage = currentPackages === 0;
    const gapQtyFormatted = targetBucket.gapToNextPackage.toFixed(1);
    const unitLabel = targetBucket.unit === 'unit_1' ? 'krt' : 'box';
    const discountFormatted = Math.round(discountPerPackage).toLocaleString('id-ID');
    
    const message = isFirstPackage 
        ? `Tambahkan bucket ${targetBucket.bucketId} sebanyak ${gapQtyFormatted} ${unitLabel} untuk mendapat potongan bundling sebesar ${discountFormatted}`
        : `Tambahkan bucket ${targetBucket.bucketId} sebanyak ${gapQtyFormatted} ${unitLabel} untuk mendapat 1 paket bundle lagi (potongan tambahan ${discountFormatted})`;
    
    console.log(`  ✅ Upselling recommendation found for promo ${promoId}: ${message}`);
    
    return {
        promoId: promoId,
        promoName: promo.description || promoId,
        currentPackages: currentPackages,
        targetPackages: targetPackages,
        gapQty: targetBucket.gapToNextPackage,
        gapUnit: targetBucket.unit === 'unit_1' ? 'krt' : 'box',
        sourceBucketId: sourceBucket.bucketId, // Bucket yang menampilkan rekomendasi (yang lebih)
        targetBucketId: targetBucket.bucketId, // Bucket yang perlu ditambahkan (yang kurang)
        discountPerPackage: discountPerPackage,
        isFirstPackage: isFirstPackage,
        message: message
    };
}

/**
 * Setup sticky behavior untuk upselling box
 * Box akan tetap terlihat saat scroll di dalam kawasan accordion content
 */
function setupStickyUpselling(stickyElement, accordionItem, accordionContent) {
    if (!stickyElement || !accordionItem || !accordionContent) return;
    
    let isSticky = false;
    let rafId = null;
    
    const handleScroll = () => {
        if (rafId) {
            cancelAnimationFrame(rafId);
        }
        
        rafId = requestAnimationFrame(() => {
            // Cek apakah accordion content sedang expanded
            if (!accordionContent.classList.contains('expanded')) {
                if (isSticky) {
                    stickyElement.style.position = 'relative';
                    stickyElement.style.top = 'auto';
                    stickyElement.style.left = 'auto';
                    stickyElement.style.width = 'auto';
                    stickyElement.style.zIndex = 'auto';
                    isSticky = false;
                }
                return;
            }
            
            const accordionHeader = accordionItem.querySelector('.accordion-header');
            const headerHeight = accordionHeader?.offsetHeight || 0;
            const accordionRect = accordionItem.getBoundingClientRect();
            const stickyRect = stickyElement.getBoundingClientRect();
            const contentRect = accordionContent.getBoundingClientRect();
            
            // Cek apakah sticky element sudah keluar dari viewport atas
            // dan masih dalam kawasan accordion content
            const shouldBeSticky = stickyRect.top < headerHeight && 
                                   contentRect.bottom > headerHeight + stickyRect.height &&
                                   accordionRect.top < headerHeight;
            
            if (shouldBeSticky) {
                if (!isSticky) {
                    stickyElement.style.position = 'fixed';
                    stickyElement.style.top = headerHeight + 'px';
                    stickyElement.style.left = accordionRect.left + 'px';
                    stickyElement.style.width = accordionRect.width + 'px';
                    stickyElement.style.zIndex = '1000';
                    stickyElement.style.marginLeft = '0';
                    stickyElement.style.marginRight = '0';
                    isSticky = true;
                } else {
                    // Update position jika accordion item bergeser (responsive)
                    stickyElement.style.left = accordionRect.left + 'px';
                    stickyElement.style.width = accordionRect.width + 'px';
                }
            } else {
                if (isSticky) {
                    stickyElement.style.position = 'relative';
                    stickyElement.style.top = 'auto';
                    stickyElement.style.left = 'auto';
                    stickyElement.style.width = 'auto';
                    stickyElement.style.zIndex = 'auto';
                    stickyElement.style.marginLeft = '';
                    stickyElement.style.marginRight = '';
                    isSticky = false;
                }
            }
        });
    };
    
    // Listen to scroll events
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    
    // Initial check
    handleScroll();
    
    // Store cleanup function
    stickyElement._cleanupSticky = () => {
        if (rafId) {
            cancelAnimationFrame(rafId);
        }
        window.removeEventListener('scroll', handleScroll);
        window.removeEventListener('resize', handleScroll);
    };
}

/**
 * Update upselling recommendations for all groups in product container
 * Called after cart changes to refresh upselling display
 */
function updateUpsellingRecommendations() {
    const productContainer = document.getElementById('product-groups');
    if (!productContainer) return;
    
    // Find all accordion items (groups)
    const accordionItems = productContainer.querySelectorAll('.accordion-item');
    
    accordionItems.forEach(accordionItem => {
        // Find accordion content
        const accordionContent = accordionItem.querySelector('.accordion-content');
        if (!accordionContent) return;
        
        // Get group code from data attribute (set during renderProducts)
        let groupCode = accordionItem.dataset.groupCode;
        if (!groupCode) {
            // Fallback: try to find from products in this accordion
            const firstProduct = accordionContent.querySelector('.product-item');
            if (firstProduct) {
                const productId = firstProduct.dataset.productId;
                const groupInfo = productGroupMap.get(productId);
                if (groupInfo) {
                    groupCode = groupInfo.code;
                } else {
                    return; // No group code found
                }
            } else {
                return; // No products found
            }
        }
        
        console.log(`🔄 [Update Upselling] Checking group: ${groupCode}`);
        
        // Remove existing upselling elements
        const existingUpsell = accordionContent.querySelector('.upsell-strata-box');
        if (existingUpsell) {
            existingUpsell.remove();
        }
        
        // Remove badge from header
        const existingBadge = accordionItem.querySelector('.upsell-badge-header');
        if (existingBadge) {
            existingBadge.remove();
        }
        
        // Remove sticky box dan cleanup event listeners
        const existingSticky = accordionContent.querySelector('.upsell-strata-sticky');
        if (existingSticky) {
            if (existingSticky._cleanupSticky) {
                existingSticky._cleanupSticky();
            }
            existingSticky.remove();
        }
        
        // Remove upselling badges dari semua product items di group ini
        const productItems = accordionContent.querySelectorAll('.product-item');
        productItems.forEach(item => {
            // Hapus badge lama
            const existingBadge = item.querySelector('.upsell-item-badge');
            if (existingBadge) {
                existingBadge.remove();
            }
            // Hapus badge baru (single-line)
            const existingBadgeSingleLine = item.querySelector('.upsell-item-badge-single-line');
            if (existingBadgeSingleLine) {
                existingBadgeSingleLine.remove();
            }
        });
        
        // Get upselling recommendation
        const storeTypeEl = document.getElementById('store-type');
        const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
        
        const upsellingRec = getStrataUpsellingRecommendation(
            groupCode,
            cart,
            productDataMap,
            productGroupMap,
            groupPromos,
            groupPromoTiers,
            currentUser?.zona || null,
            currentUser?.region_name || null,
            currentUser?.depo_id || null,
            isPromoAvailable,
            promoAvailabilityRules,
            selectedStoreType,
            productGroupAvailabilityRules,
            isProductGroupAvailable,
            Array.from(productDataMap.values())
        );
        
        // Add upselling recommendation if available
        if (upsellingRec) {
            const unitLabel = upsellingRec.tierUnit === 'unit_1' ? 'krt' : 'box';
            const formatCurrency = (amount) => {
                const roundedAmount = Math.round(amount || 0);
                return new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }).format(roundedAmount);
            };
            
            // Tambahkan badge 1 baris ke setiap product item di group ini
            productItems.forEach(productItem => {
                const productId = productItem.getAttribute('data-product-id');
                if (!productId) return;
                
                // Cek apakah product ini termasuk dalam group yang sama
                const productGroupInfo = productGroupMap.get(productId);
                if (!productGroupInfo || productGroupInfo.code !== groupCode) return;
                
                // Cari product-info untuk menambahkan badge
                const productInfo = productItem.querySelector('.product-info');
                if (!productInfo) return;
                
                // Format: "Potongan saat ini 2300 tambah 1 krt lagi untuk mendapat potongan 2750"
                const currentDiscount = Math.round(upsellingRec.currentDiscountPerUnit || 0);
                const nextDiscount = Math.round(upsellingRec.nextDiscountPerUnit || 0);
                const gapQty = upsellingRec.gapQty.toFixed(1);
                
                // Buat badge 1 baris yang informatif
                const badge = document.createElement('div');
                badge.className = 'upsell-item-badge-single-line';
                badge.innerHTML = `
                    Potongan saat ini <strong>${currentDiscount.toLocaleString('id-ID')}</strong> 
                    tambah <strong>${gapQty} ${unitLabel}</strong> lagi 
                    untuk mendapat potongan <strong>${nextDiscount.toLocaleString('id-ID')}</strong>
                `;
                
                // Pastikan tidak ada badge yang sudah ada sebelum menambahkan
                const existingBadge = productItem.querySelector('.upsell-item-badge-single-line');
                if (existingBadge) {
                    existingBadge.remove();
                }
                
                // Tambahkan badge setelah product-info (sebelum quantity-controls)
                const quantityControls = productItem.querySelector('.quantity-controls');
                if (quantityControls) {
                    productInfo.insertAdjacentElement('afterend', badge);
                } else {
                    // Fallback: tambahkan di akhir product-item
                    productItem.appendChild(badge);
                }
            });
            
            console.log(`✅ [Update Upselling] Added recommendation for group: ${groupCode}`);
        } else {
            console.log(`  ℹ️ [Update Upselling] No recommendation for group: ${groupCode}`);
        }
    });
    
    console.log(`✅ [Update Upselling] Finished updating ${accordionItems.length} groups`);
}

/**
 * Update bundle promo upselling recommendations
 * Called after cart changes to refresh bundle upselling display
 */
function updateBundleUpsellingRecommendations() {
    const productContainer = document.getElementById('product-groups');
    if (!productContainer) return;
    
    // Remove existing bundle upselling badges
    const existingBundleBadges = productContainer.querySelectorAll('.upsell-bundle-badge');
    existingBundleBadges.forEach(badge => badge.remove());
    
    if (!bundlePromosList || bundlePromosList.length === 0) {
        console.log('🔄 [Bundle Upselling] No bundle promos available');
        return;
    }
    
    if (!promoStructureMap || promoStructureMap.size === 0) {
        console.log('🔄 [Bundle Upselling] No promo structure available');
        return;
    }
    
    const storeTypeEl = document.getElementById('store-type');
    const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
    
    // Check each available bundle promo
    bundlePromosList.forEach(promo => {
        const upsellingRec = getBundleUpsellingRecommendation(
            promo.promo_id,
            cart,
            productDataMap,
            promoStructureMap,
            bundlePromosList,
            bundlePromoGroupsList,
            promoAvailabilityRules,
            selectedStoreType,
            currentUser?.zona || null,
            currentUser?.region_name || null,
            currentUser?.depo_id || null,
            isPromoAvailable
        );
        
        if (!upsellingRec) return;
        
        // Rekomendasi muncul di bucket yang "lebih" (jumlah qty lebih besar)
        // untuk menambahkan bucket yang "kurang" (jumlah qty lebih kecil)
        const promoData = promoStructureMap.get(promo.promo_id);
        if (!promoData || !promoData.buckets) return;
        
        // Get source bucket (bucket yang lebih - akan menampilkan rekomendasi)
        const sourceBucketId = upsellingRec.sourceBucketId;
        const targetBucketId = upsellingRec.targetBucketId;
        
        if (!sourceBucketId || !targetBucketId) return;
        
        // Get products from source bucket (bucket yang lebih)
        const productsInSourceBucket = promoData.buckets.get(sourceBucketId) || [];
        if (productsInSourceBucket.length === 0) return;
        
        // Add badge to each product in the source bucket
        // Rekomendasi menyarankan untuk menambahkan bucket target
        // PENTING: Untuk bucket yang masuk di 2 paket, pastikan badge hanya muncul di konteks promo yang benar
        const currentPromoId = promo.promo_id; // Store promo ID untuk digunakan di dalam loop
        productsInSourceBucket.forEach(productId => {
            // Cari semua product items dengan productId ini
            const allProductItemsWithId = productContainer.querySelectorAll(`.product-item[data-product-id="${productId}"]`);
            
            // Filter product items yang valid untuk menampilkan badge
            // Badge bisa muncul di:
            // 1. Product yang berada di bucket accordion (lingkungan paket)
            // 2. Product yang berada di group accordion (lingkungan strata) TAPI juga ada di bucket ini
            const allProductItems = Array.from(allProductItemsWithId).filter(productItem => {
                // Cek apakah product berada di bucket accordion
                const bucketAccordion = productItem.closest(`.accordion-item[data-bucket-id="${sourceBucketId}"]`);
                
                if (bucketAccordion) {
                    // Product berada di bucket accordion - validasi promo ID
                    const bucketPromoId = bucketAccordion.getAttribute('data-promo-id');
                    if (bucketPromoId !== currentPromoId) {
                        console.log(`  ⏭️ Product ${productId} in bucket ${sourceBucketId} - promo mismatch: ${bucketPromoId} vs ${currentPromoId}`);
                        return false;
                    }
                    
                    // Pastikan ada parent promo accordion dengan promo yang benar
                    let currentElement = bucketAccordion.parentElement;
                    let foundCorrectParent = false;
                    
                    while (currentElement && currentElement !== productContainer) {
                        if (currentElement.classList && currentElement.classList.contains('accordion-item')) {
                            const parentPromoId = currentElement.getAttribute('data-promo-id');
                            if (parentPromoId === currentPromoId) {
                                foundCorrectParent = true;
                                break;
                            }
                        }
                        currentElement = currentElement.parentElement;
                    }
                    
                    if (!foundCorrectParent) {
                        console.log(`  ⏭️ Product ${productId} in bucket ${sourceBucketId} - no parent promo accordion found for promo ${currentPromoId}`);
                        return false;
                    }
                    
                    return true;
                } else {
                    // Product tidak berada di bucket accordion - cek apakah berada di group accordion
                    // DAN product ini memang ada di bucket sourceBucketId untuk promo ini
                    const groupAccordion = productItem.closest(`.accordion-item[data-group-code]`);
                    if (!groupAccordion) {
                        console.log(`  ⏭️ Product ${productId} - not in bucket or group accordion`);
                        return false;
                    }
                    
                    // Validasi: product ini memang ada di bucket sourceBucketId untuk promo currentPromoId
                    const promoData = promoStructureMap.get(currentPromoId);
                    if (!promoData || !promoData.buckets) {
                        return false;
                    }
                    
                    const bucketProducts = promoData.buckets.get(sourceBucketId) || [];
                    if (!bucketProducts.includes(productId)) {
                        console.log(`  ⏭️ Product ${productId} - not in bucket ${sourceBucketId} for promo ${currentPromoId}`);
                        return false;
                    }
                    
                    // Product valid - berada di group accordion tapi juga ada di bucket ini
                    console.log(`  ✅ Product ${productId} - in group accordion but also in bucket ${sourceBucketId} for promo ${currentPromoId}`);
                    return true;
                }
            });
            
            allProductItems.forEach(productItem => {
                // Skip if already has bundle badge for this promo
                const existingBadge = productItem.querySelector(`.upsell-bundle-badge[data-promo-id="${currentPromoId}"]`);
                if (existingBadge) {
                    console.log(`  ⏭️ Skipping product ${productId} in bucket ${sourceBucketId} for promo ${currentPromoId} - badge already exists`);
                    return;
                }
                
                // Validasi sudah dilakukan di filter, tidak perlu double check lagi
                // Filter sudah memastikan product item berada dalam konteks promo yang benar
                
                // Find product-info
                const productInfo = productItem.querySelector('.product-info');
                if (!productInfo) return;
                
                // Create badge with promo ID for identification
                const badge = document.createElement('div');
                badge.className = 'upsell-bundle-badge';
                badge.setAttribute('data-promo-id', currentPromoId);
                badge.setAttribute('data-target-bucket', targetBucketId);
                const discountFormatted = Math.round(upsellingRec.discountPerPackage).toLocaleString('id-ID');
                
                const currentDiscount = upsellingRec.currentPackages > 0 
                    ? (upsellingRec.currentPackages * Math.round(upsellingRec.discountPerPackage)).toLocaleString('id-ID') 
                    : '0';
                
                badge.innerHTML = `
                    Potongan saat ini <strong>${currentDiscount}</strong> 
                    tambahkan bucket <strong>${targetBucketId}</strong> sebanyak <strong>${upsellingRec.gapQty.toFixed(1)} ${upsellingRec.gapUnit}</strong> 
                    untuk mendapat ${upsellingRec.isFirstPackage ? 'potongan bundling sebesar' : '1 paket bundle lagi (potongan tambahan)'} <strong>${discountFormatted}</strong>
                    <span style="font-size: 0.85em; opacity: 0.8;"> (Paket ${currentPromoId})</span>
                `;
                
                // Add badge after product-info (before quantity-controls)
                const quantityControls = productItem.querySelector('.quantity-controls');
                if (quantityControls) {
                    productInfo.insertAdjacentElement('afterend', badge);
                } else {
                    productItem.appendChild(badge);
                }
            });
        });
        
        console.log(`✅ [Bundle Upselling] Added recommendation for promo ${promo.promo_id}`);
    });
    
    console.log(`✅ [Bundle Upselling] Finished updating bundle upselling recommendations`);
}

/**
 * Helper function to calculate total per principal (mirror from calculation.js)
 */
function calculateTotalPerPrincipal(cart, productDataMap, principalMap, userZona) {
    const totalPerPrincipal = new Map();
    
    cart.forEach((item, productId) => {
        const product = productDataMap.get(productId);
        if (!product) return;
        
        // Get principal code for this product
        const principalCode = principalMap.get(productId) || product.principal_code || '';
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
 * Get principal discount upselling recommendation
 */
function getPrincipalUpsellingRecommendation(
    principalCode,
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
        return null;
    }
    
    // 1. Hitung total belanja per principal
    const totalPerPrincipal = calculateTotalPerPrincipal(cart, productDataMap, principalMap, userZona);
    const normalizedPrincipalCode = principalCode.toUpperCase().trim();
    const currentTotal = totalPerPrincipal.get(normalizedPrincipalCode) || 0;
    
    if (currentTotal <= 0) {
        return null; // Tidak ada belanja untuk principal ini
    }
    
    // 2. Filter tiers yang available dan relevan untuk principal ini
    // NOTE: Jika tier memiliki multiple principals, hitung total gabungan
    const availableTiers = principalDiscountTiers.filter(tier => {
        // Check availability
        const available = isPromoAvailable(
            tier.promo_id,
            'principal',
            promoAvailabilityRules,
            storeType,
            userZona,
            userRegion,
            userDepo
        );
        if (!available) return false;
        
        // Parse principal_codes
        let principalCodes = [];
        if (Array.isArray(tier.principal_codes)) {
            principalCodes = tier.principal_codes;
        } else if (typeof tier.principal_codes === 'string') {
            principalCodes = tier.principal_codes.split(',').map(s => s.trim());
        }
        principalCodes = principalCodes.map(c => String(c).toUpperCase().trim()).filter(Boolean);
        
        // Check if principal code is in the array
        if (!principalCodes.includes(normalizedPrincipalCode)) {
            return false;
        }
        
        return true;
    });
    
    if (availableTiers.length === 0) {
        return null;
    }
    
    // 3. Sort tiers by min_purchase_amount ascending
    const sortedTiers = [...availableTiers].sort((a, b) => {
        const minA = parseFloat(a.min_purchase_amount) || 0;
        const minB = parseFloat(b.min_purchase_amount) || 0;
        return minA - minB; // Ascending
    });
    
    // 4. Cari tier berikutnya yang lebih tinggi
    // NOTE: Untuk multiple principals, hitung total gabungan
    let currentTier = null;
    let nextTier = null;
    
    for (const tier of sortedTiers) {
        // Parse principal_codes
        let tierPrincipalCodes = [];
        if (Array.isArray(tier.principal_codes)) {
            tierPrincipalCodes = tier.principal_codes;
        } else if (typeof tier.principal_codes === 'string') {
            tierPrincipalCodes = tier.principal_codes.split(',').map(s => s.trim());
        }
        tierPrincipalCodes = tierPrincipalCodes.map(c => String(c).toUpperCase().trim()).filter(Boolean);
        
        const minPurchase = parseFloat(tier.min_purchase_amount) || 0;
        
        // Jika tier memiliki multiple principals, hitung total gabungan
        let totalToCheck = currentTotal;
        if (tierPrincipalCodes.length > 1) {
            // Hitung total gabungan dari semua principals di array
            totalToCheck = 0;
            tierPrincipalCodes.forEach(pc => {
                totalToCheck += totalPerPrincipal.get(pc) || 0;
            });
        }
        
        if (totalToCheck >= minPurchase) {
            currentTier = tier;
        } else {
            nextTier = tier;
            break;
        }
    }
    
    // 5. Jika sudah di tier tertinggi, tidak ada rekomendasi
    if (!nextTier) {
        return null;
    }
    
    // 6. Hitung gap
    // Untuk nextTier, jika multiple principals, hitung total gabungan yang diperlukan
    let nextTierPrincipalCodes = [];
    if (Array.isArray(nextTier.principal_codes)) {
        nextTierPrincipalCodes = nextTier.principal_codes;
    } else if (typeof nextTier.principal_codes === 'string') {
        nextTierPrincipalCodes = nextTier.principal_codes.split(',').map(s => s.trim());
    }
    nextTierPrincipalCodes = nextTierPrincipalCodes.map(c => String(c).toUpperCase().trim()).filter(Boolean);
    
    const nextMinPurchase = parseFloat(nextTier.min_purchase_amount) || 0;
    
    // Hitung total gabungan saat ini untuk nextTier
    let currentCombinedTotal = currentTotal;
    if (nextTierPrincipalCodes.length > 1) {
        currentCombinedTotal = 0;
        nextTierPrincipalCodes.forEach(pc => {
            currentCombinedTotal += totalPerPrincipal.get(pc) || 0;
        });
    }
    
    const gap = nextMinPurchase - currentCombinedTotal;
    
    if (gap <= 0) {
        return null;
    }
    
    // 7. Hitung potensi diskon
    // discount_percentage sudah dalam format persentase (1 = 1%, 5 = 5%)
    const currentDiscount = parseFloat(currentTier?.discount_percentage) || 0;
    const nextDiscount = parseFloat(nextTier.discount_percentage) || 0;
    const discountIncrease = nextDiscount - currentDiscount;
    
    const formatCurrency = (amount) => {
        const roundedAmount = Math.round(amount || 0);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(roundedAmount);
    };
    
    // Format message berdasarkan apakah nextTier memiliki multiple principals
    let message = '';
    if (nextTierPrincipalCodes.length > 1) {
        // Multiple principals: sebutkan semua principals yang perlu ditambah
        const otherPrincipals = nextTierPrincipalCodes.filter(pc => pc !== normalizedPrincipalCode);
        if (otherPrincipals.length > 0) {
            message = `Tambah belanja ${formatCurrency(gap)} untuk principal ${normalizedPrincipalCode} (atau gabungan dengan ${otherPrincipals.join(', ')}) untuk mendapat diskon ${nextDiscount}% (saat ini ${currentDiscount}%)`;
        } else {
            message = `Tambah belanja ${formatCurrency(gap)} untuk principal ${normalizedPrincipalCode} untuk mendapat diskon ${nextDiscount}% (saat ini ${currentDiscount}%)`;
        }
    } else {
        // Single principal
        message = `Tambah belanja ${formatCurrency(gap)} untuk principal ${normalizedPrincipalCode} untuk mendapat diskon ${nextDiscount}% (saat ini ${currentDiscount}%)`;
    }
    
    return {
        principalCode: normalizedPrincipalCode,
        currentTotal: currentCombinedTotal,
        currentDiscount,
        nextMinPurchase,
        nextDiscount,
        gap,
        discountIncrease,
        message,
        isMultiplePrincipals: nextTierPrincipalCodes.length > 1,
        relatedPrincipals: nextTierPrincipalCodes
    };
}

/**
 * Get invoice discount upselling recommendation
 */
function getInvoiceUpsellingRecommendation(
    basePrice,
    invoiceDiscounts,
    paymentMethod
) {
    if (!invoiceDiscounts || invoiceDiscounts.length === 0 || !paymentMethod) {
        return null;
    }
    
    // 1. Filter by payment method
    const applicableDiscounts = invoiceDiscounts.filter(discount => 
        discount.payment_method === paymentMethod
    );
    
    if (applicableDiscounts.length === 0) {
        return null;
    }
    
    // 2. Sort by min_purchase_amount ascending
    const sortedDiscounts = [...applicableDiscounts].sort((a, b) => {
        const minA = parseFloat(a.min_purchase_amount) || 0;
        const minB = parseFloat(b.min_purchase_amount) || 0;
        return minA - minB; // Ascending
    });
    
    // 3. Cari tier berikutnya yang lebih tinggi
    let currentDiscount = null;
    let nextDiscount = null;
    
    for (const discount of sortedDiscounts) {
        const minPurchase = parseFloat(discount.min_purchase_amount) || 0;
        if (basePrice >= minPurchase) {
            currentDiscount = discount;
        } else {
            nextDiscount = discount;
            break;
        }
    }
    
    // 4. Jika sudah di tier tertinggi, tidak ada rekomendasi
    if (!nextDiscount) {
        return null;
    }
    
    // 5. Hitung gap
    const nextMinPurchase = parseFloat(nextDiscount.min_purchase_amount) || 0;
    const gap = nextMinPurchase - basePrice;
    
    if (gap <= 0) {
        return null;
    }
    
    // 6. Hitung potensi diskon
    const currentDiscountPercent = parseFloat(currentDiscount?.discount_percentage) || 0;
    const nextDiscountPercent = parseFloat(nextDiscount.discount_percentage) || 0;
    const discountIncrease = nextDiscountPercent - currentDiscountPercent;
    
    const formatCurrency = (amount) => {
        const roundedAmount = Math.round(amount || 0);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(roundedAmount);
    };
    
    return {
        currentTotal: basePrice,
        currentDiscount: currentDiscountPercent,
        nextMinPurchase,
        nextDiscount: nextDiscountPercent,
        gap,
        discountIncrease,
        paymentMethod,
        message: `Tambahkan belanja sebesar ${formatCurrency(gap)} untuk mendapat diskon invoice ${nextDiscountPercent}% (saat ini ${currentDiscountPercent}%)`
    };
}

/**
 * Update all upselling recommendations in calculation display
 */
function updateCalculationUpsellingRecommendations() {
    const calculationDetails = document.getElementById('calculation-details');
    if (!calculationDetails) return;
    
    // Remove existing upselling sections, info direct, collapse content, dan toggle
    const existingUpsellSections = calculationDetails.querySelectorAll('.upsell-section, .upsell-info-direct, .upsell-collapse-content');
    existingUpsellSections.forEach(section => section.remove());
    
    // Remove toggle dari calc-row
    const existingToggles = calculationDetails.querySelectorAll('.collapse-toggle');
    existingToggles.forEach(toggle => toggle.remove());
    
    if (cart.size === 0) return;
    
    const storeTypeEl = document.getElementById('store-type');
    const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
    
    const userZona = currentUser?.zona || null;
    const userRegion = currentUser?.region_name || null;
    const userDepo = currentUser?.depo_id || null;
    
    const formatCurrency = (amount) => {
        const roundedAmount = Math.round(amount || 0);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(roundedAmount);
    };
    
    // 1. Principal Discount Upselling (tidak collapse, tampil langsung)
    const principalDiscountRow = document.getElementById('principal-discount');
    if (principalDiscountRow) {
        let principalRecommendations = [];
        
        // Get unique principals from cart
        const principalsInCart = new Set();
        cart.forEach((item, productId) => {
            const product = productDataMap.get(productId);
            if (!product) return;
            
            const principalCode = principalMap.get(productId) || product.principal_code || '';
            if (principalCode) {
                principalsInCart.add(principalCode.toUpperCase().trim());
            }
        });
        
        // Check upselling for each principal
        // Gunakan Map untuk menghindari duplikasi rekomendasi untuk tier dengan multiple principals
        const recommendationMap = new Map(); // key: string dari sorted relatedPrincipals, value: recommendation
        
        principalsInCart.forEach(principalCode => {
            const recommendation = getPrincipalUpsellingRecommendation(
                principalCode,
                cart,
                productDataMap,
                principalMap,
                principalDiscountTiers,
                promoAvailabilityRules,
                selectedStoreType,
                userZona,
                userRegion,
                userDepo,
                isPromoAvailable
            );
            
            if (recommendation) {
                // Jika tier memiliki multiple principals, gunakan relatedPrincipals sebagai key
                // Jika single principal, gunakan principalCode sebagai key
                let key;
                if (recommendation.isMultiplePrincipals && recommendation.relatedPrincipals) {
                    // Sort relatedPrincipals untuk konsistensi key
                    key = recommendation.relatedPrincipals.sort().join(',');
                } else {
                    key = recommendation.principalCode;
                }
                
                // Hanya simpan jika belum ada, atau jika gap lebih kecil (lebih prioritas)
                if (!recommendationMap.has(key) || recommendation.gap < recommendationMap.get(key).gap) {
                    recommendationMap.set(key, recommendation);
                }
            }
        });
        
        // Convert Map values to array
        principalRecommendations = Array.from(recommendationMap.values());
        
        if (principalRecommendations.length > 0) {
            // Tampilkan langsung tanpa header (hanya informasi)
            principalRecommendations.forEach(recommendation => {
                const infoDiv = document.createElement('div');
                infoDiv.className = 'upsell-info-direct';
                infoDiv.innerHTML = `<span class="upsell-icon">💡</span> ${recommendation.message}`;
                principalDiscountRow.closest('.calc-row').insertAdjacentElement('afterend', infoDiv);
            });
        }
    }
    
    // 2. Strata (Group Promo) Upselling (collapse di dalam row Promo Grup Produk)
    const groupDiscountRow = document.getElementById('group-discount');
    if (!groupDiscountRow) {
        console.warn('⚠️ group-discount element not found! Cannot display strata upselling.');
        console.log('Available calculation elements:', {
            basePrice: !!document.getElementById('total-base-price'),
            principalDiscount: !!document.getElementById('principal-discount'),
            groupDiscount: !!document.getElementById('group-discount'),
            bundleDiscount: !!document.getElementById('bundle-discount'),
            invoiceDiscount: !!document.getElementById('invoice-discount')
        });
    }
    if (groupDiscountRow) {
        const groupDiscountRowElement = groupDiscountRow.closest('.calc-row');
        
        // Remove existing collapse content dan toggle
        const existingContent = groupDiscountRowElement.nextElementSibling;
        if (existingContent && existingContent.classList.contains('upsell-collapse-content')) {
            existingContent.remove();
        }
        const existingToggle = groupDiscountRowElement.querySelector('.collapse-toggle');
        if (existingToggle) {
            existingToggle.remove();
        }
        
        const strataRecommendations = [];
        
        // Get all groups with upselling recommendations
        const productContainer = document.getElementById('product-groups');
        if (!productContainer) {
            console.warn('⚠️ product-groups container not found! Cannot get group codes for strata upselling.');
        } else {
            const accordionItems = productContainer.querySelectorAll('.accordion-item[data-group-code]');
            console.log(`🔍 [Strata Upselling] Found ${accordionItems.length} accordion items with data-group-code`);
            
            if (accordionItems.length === 0) {
                console.warn('⚠️ No accordion items with data-group-code found!');
            }
            
            accordionItems.forEach((accordionItem, idx) => {
                const groupCode = accordionItem.dataset.groupCode;
                if (!groupCode) {
                    console.warn(`⚠️ Accordion item ${idx} has no data-group-code attribute`);
                    return;
                }
                
                console.log(`🔍 [Strata Upselling] Checking group: ${groupCode}`);
                const recommendation = getStrataUpsellingRecommendation(
                    groupCode,
                    cart,
                    productDataMap,
                    productGroupMap,
                    groupPromos,
                    groupPromoTiers,
                    userZona,
                    userRegion,
                    userDepo,
                    isPromoAvailable,
                    promoAvailabilityRules,
                    selectedStoreType,
                    productGroupAvailabilityRules,
                    isProductGroupAvailable,
                    Array.from(productDataMap.values())
                );
                
                if (recommendation) {
                    console.log(`✅ [Strata Upselling] Found recommendation for group ${groupCode}:`, recommendation);
                    // Format message yang informatif (sama seperti di product list)
                    const unitLabel = recommendation.tierUnit === 'unit_1' ? 'krt' : 'box';
                    const currentDiscount = Math.round(recommendation.currentDiscountPerUnit || 0);
                    const nextDiscount = Math.round(recommendation.nextDiscountPerUnit || 0);
                    const gapQty = recommendation.gapQty.toFixed(1);
                    
                    const groupName = recommendation.groupName || groupCode;
                    let message = `<strong>${groupName}:</strong> `;
                    message += `Potongan saat ini <strong>${currentDiscount.toLocaleString('id-ID')}</strong> `;
                    message += `tambah <strong>${gapQty} ${unitLabel}</strong> lagi `;
                    message += `untuk mendapat potongan <strong>${nextDiscount.toLocaleString('id-ID')}</strong>`;
                    
                    // Tambahkan info variant jika diperlukan
                    if (recommendation.variantGap > 0 && recommendation.suggestedVariants && recommendation.suggestedVariants.length > 0) {
                        message += ` (butuh ${recommendation.variantGap} variant lagi: ${recommendation.suggestedVariants.join(', ')})`;
                    }
                    
                    strataRecommendations.push({ message });
                } else {
                    console.log(`❌ [Strata Upselling] No recommendation for group ${groupCode}`);
                }
            });
        }
        
        console.log(`📊 [Strata Upselling] Total recommendations: ${strataRecommendations.length}`);
        if (strataRecommendations.length > 0) {
            // Add collapse toggle di kiri row Promo Grup Produk
            const toggle = document.createElement('span');
            toggle.className = 'collapse-toggle';
            toggle.id = 'toggle-group-upsell';
            toggle.textContent = '▼';
            toggle.style.cursor = 'pointer';
            toggle.onclick = (e) => {
                e.stopPropagation();
                toggleGroupUpsell();
            };
            // Insert toggle di awal row (sebelum label)
            const labelSpan = groupDiscountRowElement.querySelector('span:first-of-type');
            if (labelSpan) {
                groupDiscountRowElement.insertBefore(toggle, labelSpan);
            } else {
                groupDiscountRowElement.insertBefore(toggle, groupDiscountRowElement.firstChild);
            }
            
            // Create collapse content di bawah row Promo Grup Produk
            const collapseContent = document.createElement('div');
            collapseContent.className = 'upsell-collapse-content';
            collapseContent.id = 'group-upsell-content';
            collapseContent.style.display = 'none';
            
            let recommendationsHtml = '';
            strataRecommendations.forEach(rec => {
                recommendationsHtml += `<div class="upsell-recommendation-item">${rec.message}</div>`;
            });
            
            collapseContent.innerHTML = recommendationsHtml;
            groupDiscountRowElement.insertAdjacentElement('afterend', collapseContent);
        }
    }
    
    // 3. Bundle Promo Upselling (collapse di dalam row Promo Bundling)
    const bundleDiscountRow = document.getElementById('bundle-discount');
    if (bundleDiscountRow) {
        const bundleDiscountRowElement = bundleDiscountRow.closest('.calc-row');
        
        // Remove existing collapse content dan toggle
        const existingContent = bundleDiscountRowElement.nextElementSibling;
        if (existingContent && existingContent.classList.contains('upsell-collapse-content')) {
            existingContent.remove();
        }
        const existingToggle = bundleDiscountRowElement.querySelector('.collapse-toggle');
        if (existingToggle) {
            existingToggle.remove();
        }
        
        const bundleRecommendations = [];
        
        if (bundlePromosList && bundlePromosList.length > 0 && promoStructureMap && promoStructureMap.size > 0) {
            bundlePromosList.forEach(promo => {
                const recommendation = getBundleUpsellingRecommendation(
                    promo.promo_id,
                    cart,
                    productDataMap,
                    promoStructureMap,
                    bundlePromosList,
                    bundlePromoGroupsList,
                    promoAvailabilityRules,
                    selectedStoreType,
                    userZona,
                    userRegion,
                    userDepo,
                    isPromoAvailable
                );
                
                if (recommendation) {
                    // Tambahkan promo ID di awal message untuk clarity
                    const messageWithPromo = `<strong>Paket ${promo.promo_id}:</strong> ${recommendation.message}`;
                    bundleRecommendations.push({
                        promoId: promo.promo_id,
                        message: messageWithPromo
                    });
                }
            });
        }
        
        if (bundleRecommendations.length > 0) {
            // Add collapse toggle di kiri row Promo Bundling
            const toggle = document.createElement('span');
            toggle.className = 'collapse-toggle';
            toggle.id = 'toggle-bundle-upsell';
            toggle.textContent = '▼';
            toggle.style.cursor = 'pointer';
            toggle.onclick = (e) => {
                e.stopPropagation();
                toggleBundleUpsell();
            };
            // Insert toggle di awal row (sebelum label)
            const labelSpan = bundleDiscountRowElement.querySelector('span:first-of-type');
            if (labelSpan) {
                bundleDiscountRowElement.insertBefore(toggle, labelSpan);
            } else {
                bundleDiscountRowElement.insertBefore(toggle, bundleDiscountRowElement.firstChild);
            }
            
            // Create collapse content di bawah row Promo Bundling
            const collapseContent = document.createElement('div');
            collapseContent.className = 'upsell-collapse-content';
            collapseContent.id = 'bundle-upsell-content';
            collapseContent.style.display = 'none';
            
            let recommendationsHtml = '';
            bundleRecommendations.forEach(rec => {
                recommendationsHtml += `<div class="upsell-recommendation-item">${rec.message}</div>`;
            });
            
            collapseContent.innerHTML = recommendationsHtml;
            bundleDiscountRowElement.insertAdjacentElement('afterend', collapseContent);
        }
    }
    
    // 4. Invoice Discount Upselling
    const invoiceDiscountRow = document.getElementById('invoice-discount');
    if (invoiceDiscountRow) {
        const basePrice = window.lastCalculationResult?.basePrice || window.lastCalculationResult?.totalBasePrice || 0;
        if (basePrice > 0) {
            const paymentMethodEl = document.getElementById('payment-method');
            const paymentMethod = paymentMethodEl ? paymentMethodEl.value : 'COD';
            
            const recommendation = getInvoiceUpsellingRecommendation(
                basePrice,
                invoiceDiscounts,
                paymentMethod
            );
            
            if (recommendation) {
                // Tampilkan langsung tanpa header (hanya informasi)
                const infoDiv = document.createElement('div');
                infoDiv.className = 'upsell-info-direct';
                infoDiv.innerHTML = `<span class="upsell-icon">💡</span> ${recommendation.message}`;
                invoiceDiscountRow.closest('.calc-row').insertAdjacentElement('afterend', infoDiv);
            }
        }
    }
}

/**
 * Create upselling section with optional collapse functionality
 * @param {string} type - Section type (principal, invoice, strata-{groupCode}, bundle-{promoId})
 * @param {string} title - Section title
 * @param {Array} recommendations - Array of recommendations
 * @param {Function} formatCurrency - Currency formatter function
 * @param {boolean} collapsible - Whether section is collapsible (default: true)
 */
function createUpsellSection(type, title, recommendations, formatCurrency, collapsible = true) {
    const sectionId = `upsell-${type}-section`;
    const collapseId = `upsell-${type}-collapse`;
    
    if (!recommendations || recommendations.length === 0) {
        return null;
    }
    
    let recommendationsHtml = '';
    recommendations.forEach((rec, index) => {
        let message = '';
        
        if (typeof rec === 'string') {
            message = rec;
        } else if (rec.message) {
            message = rec.message;
        } else if (rec.groupCode) {
            // Strata recommendation
            message = rec.message || 'Rekomendasi upselling';
        } else if (rec.promoId) {
            // Bundle recommendation
            message = rec.message || 'Rekomendasi upselling';
        } else if (rec.principalCode) {
            // Principal recommendation
            message = rec.message || 'Rekomendasi upselling';
        }
        
        if (message) {
            recommendationsHtml += `<div class="upsell-recommendation-item">${message}</div>`;
        }
    });
    
    if (!recommendationsHtml) {
        return null;
    }
    
    const section = document.createElement('div');
    section.className = 'upsell-section';
    section.id = sectionId;
    
    if (collapsible) {
        // Collapsible section (untuk group dan bundling)
        section.innerHTML = `
            <div class="upsell-section-header" onclick="toggleUpsellSection('${collapseId}')">
                <span class="upsell-section-title">💡 ${title}</span>
                <span class="upsell-section-toggle" id="toggle-${collapseId}">▼</span>
            </div>
            <div class="upsell-section-content" id="${collapseId}" style="display: none;">
                ${recommendationsHtml}
            </div>
        `;
    } else {
        // Non-collapsible section (untuk principal dan invoice)
        section.innerHTML = `
            <div class="upsell-section-header" style="cursor: default;">
                <span class="upsell-section-title">💡 Rekomendasi ${title}</span>
            </div>
            <div class="upsell-section-content" style="display: block;">
                ${recommendationsHtml}
            </div>
        `;
    }
    
    return section;
}

/**
 * Toggle upselling section collapse
 */
window.toggleUpsellSection = function(collapseId) {
    const content = document.getElementById(collapseId);
    const toggle = document.getElementById(`toggle-${collapseId}`);
    
    if (!content || !toggle) return;
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.textContent = '▲';
    } else {
        content.style.display = 'none';
        toggle.textContent = '▼';
    }
};

/**
 * Toggle group promo upselling collapse
 */
window.toggleGroupUpsell = function() {
    const content = document.getElementById('group-upsell-content');
    const toggle = document.getElementById('toggle-group-upsell');
    
    if (!content || !toggle) return;
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.textContent = '▲';
    } else {
        content.style.display = 'none';
        toggle.textContent = '▼';
    }
};

/**
 * Toggle bundle promo upselling collapse
 */
window.toggleBundleUpsell = function() {
    const content = document.getElementById('bundle-upsell-content');
    const toggle = document.getElementById('toggle-bundle-upsell');
    
    if (!content || !toggle) return;
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        toggle.textContent = '▲';
    } else {
        content.style.display = 'none';
        toggle.textContent = '▼';
    }
};

/**
 * Render products grouped by product groups in accordion format
 * Hanya menampilkan products yang ada di product_group_members (tidak ada "Others")
 */
function renderProducts(productGroups, groupMap, priceMap, allProducts) {
    const container = document.getElementById('product-groups');
    if (!container) {
        console.error('❌ Container #product-groups not found');
        return;
    }
    
    console.log('🎨 Rendering products:', {
        productGroupsCount: productGroups.length,
        groupMapSize: groupMap.size,
        promoStructureMapSize: promoStructureMap.size,
        groups: productGroups.map(g => ({ code: g.code, name: g.name })),
        groupMapDetails: Array.from(groupMap.entries()).map(([code, products]) => ({
            code,
            productCount: products.length,
            products: products.map(p => p.product?.code || 'N/A').slice(0, 3) // First 3 product codes
        })),
        totalProductsInMap: Array.from(groupMap.values()).reduce((sum, arr) => sum + arr.length, 0)
    });
    
    let html = '';
    let accordionIndex = 0;
    let totalProductsRendered = 0;
    
    // 1. RENDER PROMO BUNDLING FIRST (hierarchical: Promo -> Bucket -> Products)
    // promoStructureMap sudah di-filter berdasarkan promo_availability di loadProductsData
    const promoIds = Array.from(promoStructureMap.keys()).sort();
    
    if (promoIds.length > 0) {
        promoIds.forEach(promoId => {
            const promoData = promoStructureMap.get(promoId);
            const buckets = promoData.buckets;
            
            // Get bucket IDs for this promo from bundlePromoGroupsList
            const bucketIdsString = bundlePromoGroupsList
                .filter(g => g.promo_id === promoId)
                .map(g => g.bucket_id)
                .sort()
                .join(', ');
            
            // Format: Paket X (bucket 1, bucket 2)
            const shortDescription = bucketIdsString 
                ? `Paket ${promoId} (${bucketIdsString})`
                : `Paket ${promoId}`;
            
            // Promo level accordion (Level 1)
            const promoAccordionId = `promo-accordion-${accordionIndex}`;
            accordionIndex++;
            
            html += `
                <div class="accordion-item" data-promo-id="${promoId}">
                    <div class="accordion-header-wrapper" style="position: relative;">
                        <button class="accordion-header" onclick="toggleAccordion('${promoAccordionId}')" style="width: 100%;">
                            <span class="accordion-title">${shortDescription}</span>
                            <span class="accordion-icon" id="icon-${promoAccordionId}">▼</span>
                        </button>
                        <button class="btn-promo-info" onclick="showBundlePromoModal('${promoId}'); event.stopPropagation();" title="Info Promo" style="position: absolute; right: 40px; top: 50%; transform: translateY(-50%); background: #007bff; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; z-index: 10;">ℹ️</button>
                    </div>
                    <div class="accordion-content" id="${promoAccordionId}">
            `;
            
            // Sort buckets by bucket_id (sorted by bucket_id for rendering)
            const sortedBucketIds = Array.from(buckets.keys()).sort();
            
            sortedBucketIds.forEach(bucketId => {
                const productIds = buckets.get(bucketId);
                
                // Bucket level accordion (Level 2 - nested)
                const bucketAccordionId = `bucket-accordion-${accordionIndex}`;
                accordionIndex++;
                
                html += `
                    <div class="accordion-item" data-promo-id="${promoId}" data-bucket-id="${bucketId}" style="margin-left: 0; margin-top: 0; border-left: none;">
                        <button class="accordion-header" onclick="toggleAccordion('${bucketAccordionId}')" style="background: #e2e6ea; font-size: 0.9em; padding: 10px 15px; font-weight: bold; color: #343a40;">
                            <span class="accordion-title">Bucket ${bucketId}</span>
                            <span class="accordion-icon" id="icon-${bucketAccordionId}">▼</span>
                        </button>
                        <div class="accordion-content" id="${bucketAccordionId}">
                            <div class="products-list">
                `;
                
                // Render products in this bucket
                productIds.forEach(productId => {
                    const product = allProducts.find(p => p.code === productId);
                    if (!product) return;
                    
                    const price = priceMap.get(product.code) || 0;
                    const priceFormatted = new Intl.NumberFormat('id-ID', {
                        style: 'currency',
                        currency: 'IDR',
                        minimumFractionDigits: 0
                    }).format(price);
                    
                    const boxPerKrt = product.ratio_unit_2_per_unit_1 || 12;
                    const unitKrt = product.unit_1 || 'Krt';
                    const unitBox = product.unit_2 || 'Box';
                    
                    // Get current cart quantities (sync dengan cart yang sama)
                    const cartItem = cart.get(product.code);
                    const qtyKrt = cartItem?.quantities?.krt || cartItem?.quantities?.unit_1 || 0;
                    const qtyBox = cartItem?.quantities?.box || cartItem?.quantities?.unit_2 || 0;
                    
                    const vKrt = qtyKrt > 0 ? fmtNumInput(qtyKrt) : 'K';
                    const vBox = qtyBox > 0 ? fmtNumInput(qtyBox) : 'B';
                    const krtClass = qtyKrt === 0 ? 'is-placeholder' : '';
                    const boxClass = qtyBox === 0 ? 'is-placeholder' : '';
                    
                    const hasQty = qtyKrt > 0 || qtyBox > 0;
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
                    
                    html += `
                        <div class="product-item" data-product-id="${product.code}">
                            <div class="product-info">
                                <strong>${product.code} - ${product.name}</strong>
                                <p class="price-info">
                                    ${priceFormatted}/${unitKrt} | ${boxPerKrt} ${unitBox}/${unitKrt}
                                </p>
                            </div>
                            <div class="quantity-controls input-qty">
                                <button class="btn-qty btn-minus" data-unit="krt" data-action="minus" data-product-id="${product.code}">-</button>
                                <input type="tel" value="${vKrt}" min="0" class="qty-input input-krt ${krtClass}" data-unit="krt" data-product-id="${product.code}">
                                <button class="btn-qty btn-plus" data-unit="krt" data-action="plus" data-product-id="${product.code}">+</button>
                                <button class="btn-qty btn-minus" data-unit="box" data-action="minus" data-product-id="${product.code}" style="margin-left:8px;">-</button>
                                <input type="tel" value="${vBox}" min="0" class="qty-input input-box ${boxClass}" data-unit="box" data-product-id="${product.code}">
                                <button class="btn-qty btn-plus" data-unit="box" data-action="plus" data-product-id="${product.code}">+</button>
                            </div>
                            <div class="nett-summary product-card-pricing" data-product-pricing="${product.code}" style="display:${hasQty ? 'block' : 'none'};">
                                <div class="nett-item">
                                    <span class="nett-label">Subtotal Nett (On Faktur):</span>
                                    <span class="nett-value" id="subtotal-${product.code}">${formatCurrency(0)}</span>
                                </div>
                                <div class="nett-item">
                                    <span class="nett-label">Harga Nett/Krt (On Faktur):</span>
                                    <span class="nett-value" id="harganett-${product.code}">${formatCurrency(0)}</span>
                                </div>
                                <div class="nett-item" style="border-top: 1px dashed #ddd; padding-top: 5px;">
                                    <span class="nett-label" style="font-weight: 500; color: var(--success-color, #28a745);">Simulasi Nett/Krt (Setelah Reward):</span>
                                    <span class="nett-value" id="simulasi-nett-${product.code}" style="color: var(--success-color, #28a745);">${formatCurrency(0)}</span>
                                </div>
                                <div class="nett-item" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
                                    <button class="btn-detail-harga" data-product-id="${product.code}" style="width: 100%; padding: 6px; font-size: 0.85em; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Lihat Detail Harga</button>
                                </div>
                            </div>
                        </div>
                    `;
                    
                    totalProductsRendered++;
                });
                
                html += `
                            </div>
                        </div>
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        });
    }
    
    // 2. RENDER PRODUCT GROUPS (setelah semua promo bundling, termasuk produk yang sudah ada di promo)
    // TIDAK filter produk yang sudah ada di promo - semua produk dalam group tetap ditampilkan
    if (productGroups.length === 0 && promoIds.length === 0) {
        console.warn('⚠️ No product groups and no promos provided!');
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;"><p>Tidak ada group produk atau promo yang tersedia.</p></div>';
        return;
    }
    
    // Sort groups by priority (ascending - dari kecil ke besar)
    const sortedGroups = [...productGroups].sort((a, b) => {
        const priorityA = (a.priority && a.priority !== 0) ? a.priority : null;
        const priorityB = (b.priority && b.priority !== 0) ? b.priority : null;
        
        if (priorityA === null && priorityB === null) return 0;
        if (priorityA === null) return 1;
        if (priorityB === null) return -1;
        return priorityA - priorityB;
    });
    
    // Render product groups (semua produk dalam group, termasuk yang sudah ada di promo bundling)
    sortedGroups.forEach(group => {
        const groupProducts = groupMap.get(group.code) || [];
        
        console.log(`📦 Group ${group.name} (${group.code}): ${groupProducts.length} products`);
        
        if (groupProducts.length === 0) {
            console.log(`⏭️ Skipping empty group: ${group.name} (${group.code})`);
            return; // Skip empty groups
        }
        
        totalProductsRendered += groupProducts.length;
        
        // Sort products within group by priority (ascending - dari kecil ke besar)
        // Produk dengan priority null/undefined/0 akan diletakkan di akhir
        const sortedProducts = [...groupProducts].sort((a, b) => {
            // Handle priority: 0, null, undefined semua dianggap "tidak ada priority"
            const priorityA = (a.priority && a.priority !== 0) ? a.priority : null;
            const priorityB = (b.priority && b.priority !== 0) ? b.priority : null;
            
            // Jika kedua produk tidak ada priority, tetap urutan asli
            if (priorityA === null && priorityB === null) {
                return 0;
            }
            
            // Jika hanya A yang tidak ada priority, letakkan di akhir
            if (priorityA === null) {
                return 1;
            }
            
            // Jika hanya B yang tidak ada priority, letakkan di akhir
            if (priorityB === null) {
                return -1;
            }
            
            // Jika keduanya ada priority, sort ascending (priority kecil ke besar)
            return priorityA - priorityB;
        });
        
        const accordionId = `accordion-${accordionIndex}`;
        accordionIndex++;
        
        html += `
            <div class="accordion-item" data-group-code="${group.code}">
                <div class="accordion-header-wrapper" style="position: relative;">
                    <button class="accordion-header" onclick="toggleAccordion('${accordionId}')" style="width: 100%;">
                        <span class="accordion-title">${group.name}${group.name !== group.code ? ` (${group.code})` : ''}</span>
                        <span class="accordion-icon" id="icon-${accordionId}">▼</span>
                    </button>
                    <button class="btn-promo-info" onclick="showGroupPromoModal('${group.code}'); event.stopPropagation();" title="Info Promo" style="position: absolute; right: 40px; top: 50%; transform: translateY(-50%); background: #007bff; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; z-index: 10;">ℹ️</button>
                </div>
                <div class="accordion-content" id="${accordionId}">
                    <div class="products-list">
        `;
        
        sortedProducts.forEach(({ product, priority }) => {
            const price = priceMap.get(product.code) || 0;
            const priceFormatted = new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0
            }).format(price);
            
            // Krt = unit_1, Box = unit_2
            // ratio_unit_2_per_unit_1 = how many unit_2 (box) per unit_1 (krt)
            const boxPerKrt = product.ratio_unit_2_per_unit_1 || 12; // default 12 boxes per carton
            const unitKrt = product.unit_1 || 'Krt';
            const unitBox = product.unit_2 || 'Box';
            
            // Get current cart quantities (if any)
            const cartItem = cart.get(product.code);
            const qtyKrt = cartItem?.quantities?.krt || cartItem?.quantities?.unit_1 || 0;
            const qtyBox = cartItem?.quantities?.box || cartItem?.quantities?.unit_2 || 0;
            
            // Format values for display (placeholder if 0)
            const vKrt = qtyKrt > 0 ? fmtNumInput(qtyKrt) : 'K';
            const vBox = qtyBox > 0 ? fmtNumInput(qtyBox) : 'B';
            const krtClass = qtyKrt === 0 ? 'is-placeholder' : '';
            const boxClass = qtyBox === 0 ? 'is-placeholder' : '';
            
            const hasQty = qtyKrt > 0 || qtyBox > 0;
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
            
            html += `
                <div class="product-item" data-product-id="${product.code}">
                    <div class="product-info">
                        <strong>${product.code} - ${product.name}</strong>
                        <p class="price-info">
                            ${priceFormatted}/${unitKrt} | ${boxPerKrt} ${unitBox}/${unitKrt}
                        </p>
                    </div>
                    <div class="quantity-controls input-qty">
                        <button class="btn-qty btn-minus" data-unit="krt" data-action="minus" data-product-id="${product.code}">-</button>
                        <input type="tel" value="${vKrt}" min="0" class="qty-input input-krt ${krtClass}" data-unit="krt" data-product-id="${product.code}">
                        <button class="btn-qty btn-plus" data-unit="krt" data-action="plus" data-product-id="${product.code}">+</button>
                        <button class="btn-qty btn-minus" data-unit="box" data-action="minus" data-product-id="${product.code}" style="margin-left:8px;">-</button>
                        <input type="tel" value="${vBox}" min="0" class="qty-input input-box ${boxClass}" data-unit="box" data-product-id="${product.code}">
                        <button class="btn-qty btn-plus" data-unit="box" data-action="plus" data-product-id="${product.code}">+</button>
                    </div>
                    <div class="nett-summary product-card-pricing" data-product-pricing="${product.code}" style="display:${hasQty ? 'block' : 'none'};">
                        <div class="nett-item">
                            <span class="nett-label">Subtotal Nett (On Faktur):</span>
                            <span class="nett-value" id="subtotal-${product.code}">${formatCurrency(0)}</span>
                        </div>
                        <div class="nett-item">
                            <span class="nett-label">Harga Nett/Krt (On Faktur):</span>
                            <span class="nett-value" id="harganett-${product.code}">${formatCurrency(0)}</span>
                        </div>
                        <div class="nett-item" style="border-top: 1px dashed #ddd; padding-top: 5px;">
                            <span class="nett-label" style="font-weight: 500; color: var(--success-color, #28a745);">Simulasi Nett/Krt (Setelah Reward):</span>
                            <span class="nett-value" id="simulasi-nett-${product.code}" style="color: var(--success-color, #28a745);">${formatCurrency(0)}</span>
                        </div>
                        <div class="nett-item" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
                            <button class="btn-detail-harga" data-product-id="${product.code}" style="width: 100%; padding: 6px; font-size: 0.85em; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Lihat Detail Harga</button>
                        </div>
                    </div>
                </div>
            `;
        });
        
        // Get upselling recommendation for this group
        const storeTypeEl = document.getElementById('store-type');
        const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
        
        const upsellingRec = getStrataUpsellingRecommendation(
            group.code,
            cart,
            productDataMap,
            productGroupMap,
            groupPromos,
            groupPromoTiers,
            currentUser?.zona || null,
            currentUser?.region_name || null,
            currentUser?.depo_id || null,
            isPromoAvailable,
            promoAvailabilityRules,
            selectedStoreType,
            productGroupAvailabilityRules,
            isProductGroupAvailable,
            allProducts
        );
        
        // Add upselling recommendation if available
        if (upsellingRec) {
            const unitLabel = upsellingRec.tierUnit === 'unit_1' ? 'krt' : 'box';
            const formatCurrency = (amount) => {
                const roundedAmount = Math.round(amount || 0);
                return new Intl.NumberFormat('id-ID', {
                    style: 'currency',
                    currency: 'IDR',
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0
                }).format(roundedAmount);
            };
            
            html += `
                <div class="upsell-strata-box" style="margin-top: 15px; padding: 12px; background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px;">
                    <div style="font-weight: bold; color: #2e7d32; margin-bottom: 8px;">
                        🎯 Promo Strata (${upsellingRec.groupName})
                    </div>
                    <div style="font-size: 0.9em; color: #333; margin-bottom: 4px;">
                        Tambah <strong>${upsellingRec.gapQty.toFixed(2)} ${unitLabel}</strong> lagi untuk dapat diskon 
                        <strong>${formatCurrency(upsellingRec.nextDiscountPerUnit)}</strong> per ${unitLabel}
                        (dari ${formatCurrency(upsellingRec.currentDiscountPerUnit)} menjadi ${formatCurrency(upsellingRec.nextDiscountPerUnit)} per ${unitLabel})
                    </div>
                    ${upsellingRec.variantGap > 0 ? `
                        <div style="font-size: 0.85em; color: #666; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ccc;">
                            <strong>Butuh ${upsellingRec.variantGap} variant berbeda lagi.</strong>
                            ${upsellingRec.suggestedVariants.length > 0 ? `
                                <div style="margin-top: 4px;">
                                    Variant yang bisa ditambahkan: 
                                    <strong>${upsellingRec.suggestedVariants.join(', ')}</strong>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        html += `
                    </div>
                </div>
        `;
    });
    
    // Jika tidak ada produk yang di-render, tampilkan pesan
    if (!html || totalProductsRendered === 0) {
        console.warn('⚠️ No products rendered. Showing message to user.');
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
                <p>Tidak ada produk yang tersedia untuk zona, region, dan depo Anda saat ini.</p>
                <p style="font-size: 0.9em; margin-top: 10px;">Silakan hubungi administrator jika Anda yakin seharusnya ada produk yang ditampilkan.</p>
            </div>
        `;
        return;
    }
    
    console.log(`✅ Rendered ${totalProductsRendered} products in ${accordionIndex} groups`);
    container.innerHTML = html;
    
    // Setup quantity controls event listeners after rendering
    setupQuantityControls();
}

/**
 * Toggle accordion open/close
 * Made available globally for inline onclick handlers
 */
window.toggleAccordion = function(accordionId) {
    const content = document.getElementById(accordionId);
    const icon = document.getElementById(`icon-${accordionId}`);
    
    if (!content || !icon) return;
    
    // Toggle expanded class (default collapsed, toggle to expanded)
    if (content.classList.contains('expanded')) {
        content.classList.remove('expanded');
        icon.textContent = '▼';
        icon.style.transform = 'rotate(0deg)';
    } else {
        content.classList.add('expanded');
        icon.textContent = '▲';
        icon.style.transform = 'rotate(180deg)';
    }
};

/**
 * Show error message
 */
function showError(message) {
    const container = document.getElementById('product-groups');
    if (container) {
        container.innerHTML = `<div class="error-message" style="padding: 20px; color: red;">${message}</div>`;
    }
}

// ========================================================
// === QUANTITY CONTROLS & CART MANAGEMENT (Like Kalkulator)
// ========================================================

// Helper functions (similar to kalkulator)
function fmtNumInput(n) {
    return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0);
}

function parseNumInput(s) {
    return parseFloat(String(s).replace(/\./g, '').replace(/,/g, '.')) || 0;
}

// Cart storage (simple Map for now, can be enhanced later)
let cart = new Map();

// Product data map for cart display (product code -> product data)
let productDataMap = new Map();

// Cart persistence keys
const CART_STORAGE_KEY = 'price_engine_cart_v1';

/**
 * Save cart to localStorage
 */
function saveCartToLocalStorage() {
    try {
        const cartArray = Array.from(cart.entries());
        if (cartArray.length > 0) {
            localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartArray));
            console.log(`💾 Saved ${cartArray.length} items to cart cache`);
        } else {
            localStorage.removeItem(CART_STORAGE_KEY);
        }
        
        // Also update AppStore if available
        if (typeof window.AppStore !== 'undefined') {
            cartArray.forEach(([productId, item]) => {
                window.AppStore.updateCart(productId, item);
            });
        }
    } catch (error) {
        console.error('Error saving cart to localStorage:', error);
    }
}

/**
 * Load cart from localStorage
 */
function loadCartFromLocalStorage() {
    try {
        const storedCart = localStorage.getItem(CART_STORAGE_KEY);
        if (storedCart) {
            const cartArray = JSON.parse(storedCart);
            cart.clear();
            cartArray.forEach(([productId, item]) => {
                cart.set(productId, item);
            });
            console.log(`✅ Loaded ${cart.size} items from cart cache`);
            
            // Also update AppStore if available
            if (typeof window.AppStore !== 'undefined') {
                cartArray.forEach(([productId, item]) => {
                    window.AppStore.updateCart(productId, item);
                });
            }
            
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error loading cart from localStorage:', error);
        localStorage.removeItem(CART_STORAGE_KEY);
        return false;
    }
}

// Product group map (product code -> group code) for cart grouping
let productGroupMap = new Map(); // product_code -> { code, name }

// Product bucket map (product code -> bucket_id) for cart grouping by bucket
let productBucketMap = new Map(); // product_code -> bucket_id

// Promo structure: promo_id -> bucket_id -> product_ids
// For cart grouping: promo_id (top level) -> bucket_id -> products
let promoStructureMap = new Map(); // promo_id -> { description, buckets: Map<bucket_id, product_ids[]> }
let productToPromoBucketMap = new Map(); // product_code -> { promo_id, bucket_id }

// Principal map (product code -> principal code) for calculation
let principalMap = new Map(); // product_code -> principal_code

// Promo/Discount data for calculation
let principalDiscountTiers = [];
let groupPromos = [];
let groupPromoTiers = [];
let invoiceDiscounts = [];
let freeProductPromos = [];
let freeProductPromoTiers = []; // Store free product promo tiers
let promoAvailabilityRules = [];
let productGroupAvailabilityRules = []; // Store product group availability rules
let bundlePromosList = []; // Store bundle promos for calculation
let bundlePromoGroupsList = []; // Store bundle promo groups for calculation
let loyaltyClasses = []; // Store loyalty classes
let loyaltyAvailabilityRules = []; // Store loyalty availability rules

// Setup event listeners for detail harga buttons
function setupDetailHargaListeners() {
    console.log('🔧 Setting up detail harga listeners');
    
    // Event delegation untuk tombol detail harga - gunakan document untuk menangkap semua klik
    // Hapus listener lama jika ada (untuk menghindari duplikasi)
    document.removeEventListener('click', handleDetailHargaClick);
    document.addEventListener('click', handleDetailHargaClick);
    
    // Close modal buttons - setup sekali saja
    setupModalCloseListeners();
}

// Handler untuk klik tombol detail harga
function handleDetailHargaClick(e) {
    // Check if clicked element or its parent is the button
    const btn = e.target.closest('.btn-detail-harga');
    if (btn) {
        const productId = btn.dataset.productId;
        console.log('🔘 Detail harga button clicked, productId:', productId);
        if (productId) {
            e.preventDefault();
            e.stopPropagation();
            showDetailHargaModal(productId);
        } else {
            console.warn('⚠️ ProductId not found in button dataset');
        }
    }
}

// Setup modal close listeners
function setupModalCloseListeners() {
    const closePriceModal = document.getElementById('close-price-modal');
    const priceModalCloseBtn = document.getElementById('price-modal-close-btn');
    const priceModal = document.getElementById('price-detail-modal');
    
    if (closePriceModal) {
        closePriceModal.onclick = () => {
            if (priceModal) priceModal.style.display = 'none';
        };
    }
    
    if (priceModalCloseBtn) {
        priceModalCloseBtn.onclick = () => {
            if (priceModal) priceModal.style.display = 'none';
        };
    }
    
    // Close modal when clicking outside
    if (priceModal) {
        priceModal.onclick = (e) => {
            if (e.target === priceModal) {
                priceModal.style.display = 'none';
            }
        };
    }
    
    // Promo info modal close listeners
    const closePromoModal = document.getElementById('close-promo-modal');
    const promoModalCloseBtn = document.getElementById('promo-modal-close-btn');
    const promoModal = document.getElementById('promo-info-modal');
    
    if (closePromoModal) {
        closePromoModal.onclick = () => {
            if (promoModal) promoModal.style.display = 'none';
        };
    }
    
    if (promoModalCloseBtn) {
        promoModalCloseBtn.onclick = () => {
            if (promoModal) promoModal.style.display = 'none';
        };
    }
    
    // Close modal when clicking outside
    if (promoModal) {
        promoModal.onclick = (e) => {
            if (e.target === promoModal) {
                promoModal.style.display = 'none';
            }
        };
    }
    
    console.log('✅ Modal close listeners setup:', {
        closePriceModal: !!closePriceModal,
        priceModalCloseBtn: !!priceModalCloseBtn,
        priceModal: !!priceModal
    });
}

// Setup quantity controls event listeners (event delegation like kalkulator)
function setupQuantityControls() {
    const productContainer = document.getElementById('product-groups');
    const cartContainer = document.getElementById('cart-items');
    
    if (productContainer) {
        // Remove old listeners to avoid duplicates
        const newContainer = productContainer.cloneNode(true);
        productContainer.parentNode.replaceChild(newContainer, productContainer);
        
        // Re-attach listeners
        newContainer.addEventListener('click', handleProductClick);
        newContainer.addEventListener('focus', (e) => handleInputFocus(e.target), true);
        newContainer.addEventListener('blur', (e) => handleInputBlur(e.target), true);
    }
    
    if (cartContainer) {
        cartContainer.addEventListener('click', handleCartClick);
        cartContainer.addEventListener('focus', (e) => handleInputFocus(e.target), true);
        cartContainer.addEventListener('blur', (e) => handleInputBlur(e.target), true);
    }
}

// Handle clicks on product list
function handleProductClick(e) {
    const target = e.target;
    const qtyBtn = target.closest('.btn-qty, .btn-plus, .btn-minus');
    if (qtyBtn) {
        e.preventDefault();
        handleQtyButtonClick(qtyBtn);
        return;
    }
}

// Handle clicks on cart
function handleCartClick(e) {
    const target = e.target;
    const qtyBtn = target.closest('.btn-qty, .btn-plus, .btn-minus');
    if (qtyBtn) {
        e.preventDefault();
        handleQtyButtonClick(qtyBtn);
        return;
    }
    
    const deleteBtn = target.closest('.btn-remove, .cart-item-delete-btn');
    if (deleteBtn) {
        e.preventDefault();
        handleRemoveItem(deleteBtn);
        return;
    }
}

// Handle quantity button click (plus/minus)
function handleQtyButtonClick(btnEl) {
    const productId = btnEl.dataset.productId || btnEl.dataset.sku;
    const unit = btnEl.dataset.unit;
    const action = btnEl.dataset.action;
    
    if (!productId || !unit) return;
    
    const qtyContainer = btnEl.closest('.quantity-controls, .input-qty');
    if (!qtyContainer) return;
    
    // Find input by class (input-krt or input-box) or data-unit
    const inputClass = unit === 'krt' ? 'input-krt' : 'input-box';
    const input = qtyContainer.querySelector(`.qty-input.${inputClass}`) || 
                  qtyContainer.querySelector(`.qty-input[data-unit="${unit}"]`);
    if (!input) return;
    
    let value = parseNumInput(input.value);
    if (action === 'plus' || btnEl.classList.contains('btn-plus')) {
        value++;
    } else {
        value = Math.max(0, value - 1);
    }
    
    input.value = value;
    handleInputBlur(input);
}

// Handle input focus
function handleInputFocus(el) {
    if (el.classList.contains('qty-input')) {
        const value = parseNumInput(el.value);
        if (value === 0) {
            el.value = '';
        } else {
            el.value = value;
        }
        el.classList.remove('is-placeholder');
    }
}

// Handle input blur
function handleInputBlur(el) {
    if (el.classList.contains('qty-input')) {
        const value = parseNumInput(el.value);
        const isKrt = el.classList.contains('input-krt');
        
        if (value === 0) {
            el.value = isKrt ? 'K' : 'B';
            el.classList.add('is-placeholder');
        } else {
            el.value = fmtNumInput(value);
            el.classList.remove('is-placeholder');
        }
        
        updateCartFromInput(el);
    }
}

// Sync product list inputs with cart (mirror dari kalkulator)
// Sync SEMUA instance produk yang sama (bisa ada di promo bundling DAN product group)
function syncProductListInputs(productId, krtVal, boxVal) {
    const productContainer = document.getElementById('product-groups');
    if (!productContainer) return;
    
    // Find ALL product items with this product ID (bisa ada di promo bundling dan product group)
    const productItems = productContainer.querySelectorAll(`.product-item[data-product-id="${productId}"]`);
    
    productItems.forEach(productItem => {
        const krtInput = productItem.querySelector('.qty-input.input-krt');
        const boxInput = productItem.querySelector('.qty-input.input-box');
        
        if (krtInput) {
            krtInput.value = (krtVal > 0) ? fmtNumInput(krtVal) : 'K';
            krtInput.classList.toggle('is-placeholder', krtVal === 0);
        }
        if (boxInput) {
            boxInput.value = (boxVal > 0) ? fmtNumInput(boxVal) : 'B';
            boxInput.classList.toggle('is-placeholder', boxVal === 0);
        }
    });
}

// Update cart based on input values (mirror dari kalkulator updateKeranjang)
function updateCartFromInput(inputEl) {
    const productId = inputEl.dataset.productId || inputEl.dataset.sku;
    if (!productId) return;
    
    const qtyContainer = inputEl.closest('.quantity-controls, .input-qty');
    if (!qtyContainer) return;
    
    // Get karton and box inputs
    // Krt = unit_1, Box = unit_2
    const krtInput = qtyContainer.querySelector('.qty-input.input-krt');
    const boxInput = qtyContainer.querySelector('.qty-input.input-box');
    
    let qtyKrt = krtInput ? parseNumInput(krtInput.value) : 0;
    let qtyBox = boxInput ? parseNumInput(boxInput.value) : 0;
    
    // Get product data
    const productData = productDataMap.get(productId);
    if (!productData) {
        console.warn(`Product data not found for ${productId}`);
        return;
    }
    
    // Get or create cart item
    let cartItem = cart.get(productId);
    if (!cartItem) {
        cartItem = {
            productId,
            productCode: productId,
            quantities: { krt: 0, box: 0, unit_1: 0, unit_2: 0, qtyBoxTotal: 0 },
            product: null
        };
    }
    
    // Store product data if not already stored
    if (!cartItem.product) {
        const boxPerKrt = productData.ratio_unit_2_per_unit_1 || 12;
        
        // Find product group for this product from productGroupMap
        const groupInfo = productGroupMap.get(productId) || { code: 'LAIN-LAIN', name: 'LAIN-LAIN' };
        
        // Find promo_id and bucket_id for this product from productToPromoBucketMap
        const promoBucketInfo = productToPromoBucketMap.get(productId) || null;
        const promoId = promoBucketInfo?.promo_id || null;
        const bucketId = promoBucketInfo?.bucket_id || null;
        
        cartItem.product = {
            code: productData.code,
            name: productData.name,
            box_per_krt: boxPerKrt,
            group: groupInfo.code,
            groupName: groupInfo.name,
            promoId: promoId,      // For promo-based grouping (top level)
            bucketId: bucketId      // For bucket-based grouping (within promo)
        };
    }
    
    // Auto-convert box to karton if box >= box_per_krt (mirror dari kalkulator)
    const boxPerKrt = cartItem.product.box_per_krt || 12;
    if (qtyBox >= boxPerKrt && boxPerKrt > 0) {
        const newKrt = Math.floor(qtyBox / boxPerKrt);
        const remainingBox = qtyBox % boxPerKrt;
        qtyKrt += newKrt;
        qtyBox = remainingBox;
        
        // Update input fields only if NOT in product list (i.e., in cart sidebar)
        // Mirror logic dari kalkulator: if (!inputEl.closest('#menuContainer'))
        const productContainer = document.getElementById('product-groups');
        if (!inputEl.closest('#product-groups')) {
            if (krtInput) {
                krtInput.value = (qtyKrt > 0) ? fmtNumInput(qtyKrt) : 'K';
                krtInput.classList.toggle('is-placeholder', qtyKrt === 0);
            }
            if (boxInput) {
                boxInput.value = (qtyBox > 0) ? fmtNumInput(qtyBox) : 'B';
                boxInput.classList.toggle('is-placeholder', qtyBox === 0);
            }
        }
    }
    
    // Update cart item quantities
    cartItem.quantities = {
        krt: qtyKrt,
        box: qtyBox,
        unit_1: qtyKrt,
        unit_2: qtyBox,
        qtyBoxTotal: (qtyKrt * boxPerKrt) + qtyBox  // Total box = (karton * box_per_krt) + box
    };
    cartItem.productName = cartItem.product.name || productId;
    
    // Add to cart or remove if quantities are zero
    if (qtyKrt > 0 || qtyBox > 0) {
        cart.set(productId, cartItem);
    } else {
        cart.delete(productId);
    }
    
    // Save cart to localStorage
    saveCartToLocalStorage();
    
    // Sync product list inputs (mirror dari kalkulator)
    syncProductListInputs(productId, qtyKrt, qtyBox);
    
    // Update cart display (mirror batchUpdateUI dari kalkulator)
    batchUpdateUI();
    
    // Update nett summary visibility SETELAH cart di-update
    updateNettSummaryVisibility();
}

// Handle remove item from cart (mirror dari kalkulator)
function handleRemoveItem(btnEl) {
    const productId = btnEl.dataset.productId || btnEl.dataset.sku;
    if (!productId) return;
    
    cart.delete(productId);
    
    // Save cart to localStorage
    saveCartToLocalStorage();
    
    // Sync product list inputs (mirror dari kalkulator)
    syncProductListInputs(productId, 0, 0);
    
    // Update nett summary visibility
    updateNettSummaryVisibility();
    
    // Update cart display (mirror batchUpdateUI dari kalkulator)
    batchUpdateUI();
}

// Batch update UI (mirror dari kalkulator batchUpdateUI)
function batchUpdateUI() {
    // Update nett summary visibility untuk semua produk di cart
    updateNettSummaryVisibility();
    
    // Render cart
    renderKeranjang();
    
    // Auto-calculate when cart changes (mirror dari kalkulator)
    if (cart.size > 0 && currentUser) {
        handleCalculate();
    } else {
        // Reset calculation display if cart is empty
        updateCalculationDisplay({
            basePrice: 0,
            principalDiscount: 0,
            groupPromoDiscount: 0,
            bundlePromoDiscount: 0,
            freeProductDiscount: 0,
            invoiceDiscount: 0,
            totalNett: 0
        });
    }
    
    // Update product card summaries (harga promo, dll) jika diperlukan
    // updateAllProductCardSummaries(summary);
    
    // Save cart to localStorage
    saveCartToLocalStorage();
}

// Render keranjang dengan grouping per group (mirror dari kalkulator renderKeranjang)
function renderKeranjang() {
    const cartItemsEl = document.getElementById('cart-items');
    if (!cartItemsEl) return;
    
    if (cart.size === 0) {
        cartItemsEl.innerHTML = '<div class="empty-cart">Belum ada produk dalam keranjang</div>';
        
        // Update summary bar total
        const summaryBarTotal = document.getElementById('summary-bar-total');
        if (summaryBarTotal) {
            summaryBarTotal.textContent = 'Rp 0';
        }
        
        // Hide calculation section when cart is empty
        const calculationSection = document.querySelector('.calculation-section');
        if (calculationSection) {
            calculationSection.style.display = 'none';
        }
        
        return;
    }
    
    // Check if all items have qty = 0, then hide calculation section
    let hasItemsWithQty = false;
    cart.forEach((item, productId) => {
        const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || 0;
        const qtyBox = item.quantities?.box || item.quantities?.unit_2 || 0;
        if (qtyKrt > 0 || qtyBox > 0) {
            hasItemsWithQty = true;
        }
    });
    
    const calculationSection = document.querySelector('.calculation-section');
    if (calculationSection) {
        calculationSection.style.display = hasItemsWithQty ? 'block' : 'none';
    }
    
    // Group cart items by eceran saja (netral dari paket dan group)
    const eceranGroups = new Map(); // eceran -> items[]
    
    cart.forEach((item, productId) => {
        // Get product data untuk mendapatkan eceran
        const product = productDataMap.get(productId);
        const eceran = product?.eceran || 'LAIN-LAIN';
        
        if (!eceranGroups.has(eceran)) {
            eceranGroups.set(eceran, []);
        }
        
        eceranGroups.get(eceran).push({
            productId,
            item
        });
    });
    
    // Build ordered list: sorted by eceran
    const orderedGroups = [];
    const eceranKeys = Array.from(eceranGroups.keys()).sort();
    
    eceranKeys.forEach(eceran => {
        orderedGroups.push({
            type: 'eceran',
            key: `ECERAN:${eceran}`,
            name: eceran,
            items: eceranGroups.get(eceran)
        });
    });
    
    let html = '';
    
    // Render each group (eceran -> products)
    orderedGroups.forEach(groupData => {
        html += `<div class="cart-group" data-cart-group="${groupData.key}">`;
        html += `<h4 class="cart-group-header">${groupData.name}</h4>`;
        
        // Render items in this eceran group
        groupData.items.forEach(({ productId, item }) => {
            html += renderCartItem(productId, item);
        });
        
        html += `</div>`; // Close cart-group
    });
    
    cartItemsEl.innerHTML = html;
    
    // Update summary bar total menggunakan nilai dari lastCalculationResult yang sudah dihitung
    const summaryBarTotal = document.getElementById('summary-bar-total');
    if (summaryBarTotal) {
        // Gunakan nilai dari lastCalculationResult yang sudah dihitung dengan benar
        const totalNettValue = window.lastCalculationResult?.totalNettPrice || window.lastCalculationResult?.totalNett || 0;
        
        const formatCurrency = (amount) => {
            const roundedAmount = Math.round(amount || 0);
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(roundedAmount);
        };
        
        summaryBarTotal.textContent = formatCurrency(totalNettValue);
        
        // Debug logging
        if (totalNettValue === 0 && window.lastCalculationResult && (window.lastCalculationResult.basePrice || window.lastCalculationResult.totalBasePrice) > 0) {
            console.warn('⚠️ renderKeranjang: totalNettValue is 0 but basePrice exists:', {
                totalNettPrice: window.lastCalculationResult.totalNettPrice,
                totalNett: window.lastCalculationResult.totalNett,
                basePrice: window.lastCalculationResult.basePrice,
                totalBasePrice: window.lastCalculationResult.totalBasePrice
            });
        }
    }
}

// Helper function to render cart item
function renderCartItem(productId, item) {
    const qtyKrt = item.quantities.krt || 0;
    const qtyBox = item.quantities.box || 0;
    const qtyBoxTotal = item.quantities.qtyBoxTotal || 0;
    
    // Format quantity display (mirror dari kalkulator)
    let qtyDisplay = '';
    if (qtyKrt > 0 && qtyBox > 0) {
        qtyDisplay = `${fmtNumInput(qtyKrt)} Krt & ${fmtNumInput(qtyBox)} Box (${fmtNumInput(qtyBoxTotal)} Box total)`;
    } else if (qtyKrt > 0) {
        qtyDisplay = `${fmtNumInput(qtyKrt)} Krt (${fmtNumInput(qtyBoxTotal)} Box total)`;
    } else if (qtyBox > 0) {
        qtyDisplay = `${fmtNumInput(qtyBox)} Box (${fmtNumInput(qtyBoxTotal)} Box total)`;
    }
    
    // Get input values for cart display (mirror dari kalkulator)
    const vKrt = qtyKrt > 0 ? fmtNumInput(qtyKrt) : 'K';
    const vBox = qtyBox > 0 ? fmtNumInput(qtyBox) : 'B';
    const krtClass = qtyKrt === 0 ? 'is-placeholder' : '';
    const boxClass = qtyBox === 0 ? 'is-placeholder' : '';
    
    // Get calculation result untuk subtotal nett dan promo info
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
    
    let subtotalNettHtml = '';
    let promoInfoHtml = '';
    
    if (window.lastCalculationResult && window.lastCalculationResult.items) {
        const calcItem = window.lastCalculationResult.items.find(it => it.productId === productId);
        if (calcItem && calcItem.finalNett !== undefined) {
            // Use pre-calculated values from calculateItemDetails
            const itemGroupPromoDiscount = calcItem.itemGroupPromoDiscount || 0;
            const itemBundlePromoDiscount = calcItem.itemBundlePromoDiscount || 0;
            const itemFreeProductDiscount = calcItem.itemFreeProductDiscount || 0;
            const itemInvoiceDiscount = calcItem.itemInvoiceDiscount || 0;
            const finalNett = calcItem.finalNett || 0;
            
            // Subtotal nett
            subtotalNettHtml = `<div class="cart-item-subtotal">Subtotal Nett: <strong>${formatCurrency(finalNett)}</strong></div>`;
            
            // Rincian promo
            const promoDetails = [];
            if (calcItem.discountRate > 0) {
                promoDetails.push(`Principal: ${calcItem.discountRate.toFixed(2)}%`);
            }
            if (itemGroupPromoDiscount > 0) {
                promoDetails.push(`Strata: ${formatCurrency(itemGroupPromoDiscount)}`);
            }
            if (itemBundlePromoDiscount > 0) {
                promoDetails.push(`Bundle: ${formatCurrency(itemBundlePromoDiscount)}`);
            }
            if (itemFreeProductDiscount > 0) {
                promoDetails.push(`Free Product: ${formatCurrency(itemFreeProductDiscount)}`);
            }
            if (itemInvoiceDiscount > 0) {
                promoDetails.push(`Invoice: ${formatCurrency(itemInvoiceDiscount)}`);
            }
            
            if (promoDetails.length > 0) {
                promoInfoHtml = `<div class="cart-item-promo">Promo: ${promoDetails.join(', ')}</div>`;
            }
        }
    }
    
    return `
        <div class="cart-item" data-product-id="${productId}">
            <div class="cart-item-info">
                <div class="cart-item-name-row">
                    <strong class="cart-item-name">${item.productName || productId}</strong>
                    <div class="cart-item-controls">
                        <div class="quantity-controls input-qty cart-qty-controls">
                            <button class="btn-qty btn-minus" data-unit="krt" data-action="minus" data-product-id="${productId}">-</button>
                            <input type="tel" value="${vKrt}" min="0" class="qty-input input-krt ${krtClass}" data-unit="krt" data-product-id="${productId}">
                            <button class="btn-qty btn-plus" data-unit="krt" data-action="plus" data-product-id="${productId}">+</button>
                            <button class="btn-qty btn-minus" data-unit="box" data-action="minus" data-product-id="${productId}" style="margin-left:4px;">-</button>
                            <input type="tel" value="${vBox}" min="0" class="qty-input input-box ${boxClass}" data-unit="box" data-product-id="${productId}">
                            <button class="btn-qty btn-plus" data-unit="box" data-action="plus" data-product-id="${productId}">+</button>
                        </div>
                        <button class="btn-remove cart-btn-remove" data-product-id="${productId}">Hapus</button>
                    </div>
                </div>
                <span class="qty-info">${qtyDisplay}</span>
                ${subtotalNettHtml}
                ${promoInfoHtml}
            </div>
        </div>
    `;
}

/**
 * Handle calculate button click
 */
async function handleCalculate() {
    try {
        if (!currentUser) {
            // Don't alert, just return - calculation will fail silently
            return;
        }
        
        if (cart.size === 0) {
            // Reset calculation display to 0 if cart is empty
            updateCalculationDisplay({
                totalBasePrice: 0,
                principalDiscount: 0,
                groupPromoDiscount: 0,
                bundlePromoDiscount: 0,
                freeProductPromo: 0,
                invoiceDiscount: 0,
                totalNettPrice: 0
            });
            return;
        }
        
        // Get selected store type
        const storeTypeEl = document.getElementById('store-type');
        const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
        
        // Get payment method
        const paymentMethodEl = document.getElementById('payment-method');
        const paymentMethod = paymentMethodEl ? paymentMethodEl.value : 'COD';
        
        // Get user info
        const userZona = currentUser.zona || null;
        const userRegion = currentUser.region_name || null;
        const userDepo = currentUser.depo_id || null;
        
        // Prepare prices for products
        // Update productDataMap with prices
        const selectedZone = currentUser.zona || null;
        if (selectedZone) {
            const { loadPrices } = await import('./database.js');
            const prices = await loadPrices(selectedZone);
            const priceMap = new Map();
            prices.forEach(price => {
                priceMap.set(price.product_code, price.base_price);
            });
            
            // Update productDataMap with prices
            productDataMap.forEach((product, productCode) => {
                const price = priceMap.get(productCode) || 0;
                if (!product.prices) {
                    product.prices = {};
                }
                product.prices[selectedZone] = price;
            });
        }
        
        // Calculate total
        const result = calculateTotal({
            cart,
            productDataMap,
            principalMap,
            productGroupMap,
            promoStructureMap,
            principalDiscountTiers,
            groupPromos,
            groupPromoTiers,
            bundlePromos: bundlePromosList,
            bundlePromoGroups: bundlePromoGroupsList,
            invoiceDiscounts,
            freeProductPromos,
            freeProductPromoTiers,
            promoAvailabilityRules,
            productGroupAvailabilityRules,
            isProductGroupAvailable,
            storeType: selectedStoreType,
            userZona,
            userRegion,
            userDepo,
            paymentMethod,
            isPromoAvailable
        });
        
        // Update UI with calculation result
        console.log('📊 Calculation result:', result);
        console.log('📊 Total Nett values:', {
            totalNett: result.totalNett,
            totalNettPrice: result.totalNettPrice,
            basePrice: result.basePrice,
            principalDiscount: result.principalDiscount,
            groupPromoDiscount: result.groupPromoDiscount,
            bundlePromoDiscount: result.bundlePromoDiscount,
            freeProductDiscount: result.freeProductDiscount,
            invoiceDiscount: result.invoiceDiscount
        });
        updateCalculationDisplay(result);
        
        // Calculate per-item details dan simpan di result
        calculateItemDetails(result);
        
        // Calculate loyalty cashback
        const loyaltyClassEl = document.getElementById('loyalty-class');
        const selectedLoyaltyClass = loyaltyClassEl ? loyaltyClassEl.value : '';
        const loyaltyCashback = calculateLoyaltyCashback(
            result,
            selectedLoyaltyClass,
            selectedStoreType,
            userZona,
            userRegion,
            userDepo
        );
        
        // Add loyalty cashback to result
        result.loyaltyCashback = loyaltyCashback;
        
        // Store result for detail modal (SETELAH calculateItemDetails agar data lengkap)
        window.lastCalculationResult = result;
        
        // Update summary bar lagi setelah semua update selesai (untuk memastikan)
        const formatCurrency = (amount) => {
            const roundedAmount = Math.round(amount || 0);
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(roundedAmount);
        };
        const summaryBarTotal = document.getElementById('summary-bar-total');
        if (summaryBarTotal) {
            // Gunakan totalNettPrice atau totalNett yang sudah dihitung dengan benar
            const totalNettValue = result.totalNettPrice || result.totalNett || 0;
            
            console.log('🔄 Final update summary bar:', {
                totalNettValue,
                totalNettPrice: result.totalNettPrice,
                totalNett: result.totalNett,
                basePrice: result.basePrice,
                principalDiscount: result.principalDiscount,
                groupPromoDiscount: result.groupPromoDiscount,
                bundlePromoDiscount: result.bundlePromoDiscount,
                invoiceDiscount: result.invoiceDiscount,
                calculation: `${result.basePrice} - ${result.principalDiscount} - ${result.groupPromoDiscount} - ${result.bundlePromoDiscount} - ${result.invoiceDiscount} = ${totalNettValue}`,
                elementFound: !!summaryBarTotal
            });
            summaryBarTotal.textContent = formatCurrency(totalNettValue);
        } else {
            console.warn('⚠️ summary-bar-total element not found!');
        }
        
        // Update harga nett per product item
        updateProductNettPrices(result);
        
        // Update nett summary visibility setelah harga nett di-update
        updateNettSummaryVisibility();
        
        // Re-render cart untuk update subtotal nett dan promo info
        renderKeranjang();
        
        // Update upselling recommendations (di product list)
        updateUpsellingRecommendations();
        updateBundleUpsellingRecommendations();
        
        // Update upselling recommendations (di calculation display)
        updateCalculationUpsellingRecommendations();
        
        // Update final tagihan setelah semua perhitungan selesai
        updateFinalTagihan();
        
    } catch (error) {
        console.error('❌ Error calculating total:', error);
        console.error('Error details:', error.stack);
        // Don't alert, just log - calculation can fail silently if data not ready
        // Reset display to 0 on error
        updateCalculationDisplay({
            totalBasePrice: 0,
            principalDiscount: 0,
            groupPromoDiscount: 0,
            bundlePromoDiscount: 0,
            freeProductPromo: 0,
            invoiceDiscount: 0,
            totalNettPrice: 0
        });
    }
}

/**
 * Update calculation display in UI
 */
function updateCalculationDisplay(result) {
    // Show/hide calculation section based on whether there are items with qty > 0
    const calculationSection = document.querySelector('.calculation-section');
    if (calculationSection) {
        let hasItemsWithQty = false;
        if (cart && cart.size > 0) {
            // Check if any item has qty > 0
            cart.forEach((item, productId) => {
                const qtyKrt = item.quantities?.krt || item.quantities?.unit_1 || 0;
                const qtyBox = item.quantities?.box || item.quantities?.unit_2 || 0;
                if (qtyKrt > 0 || qtyBox > 0) {
                    hasItemsWithQty = true;
                }
            });
        }
        calculationSection.style.display = hasItemsWithQty ? 'block' : 'none';
    }
    
    // Format currency
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
    
    // Update base price
    const basePriceEl = document.getElementById('total-base-price');
    if (basePriceEl) {
        basePriceEl.textContent = formatCurrency(result.totalBasePrice || result.basePrice || 0);
    }
    
    // Update principal discount
    const principalDiscountEl = document.getElementById('principal-discount');
    if (principalDiscountEl) {
        principalDiscountEl.textContent = `- ${formatCurrency(result.principalDiscount || 0)}`;
    }
    
    // Update group promo discount
    const groupDiscountEl = document.getElementById('group-discount');
    if (groupDiscountEl) {
        groupDiscountEl.textContent = `- ${formatCurrency(result.groupPromoDiscount || 0)}`;
        
        // Toggle akan ditambahkan di updateCalculationUpsellingRecommendations jika ada rekomendasi
    }
    
    // Update bundle promo discount
    const bundleDiscountEl = document.getElementById('bundle-discount');
    if (bundleDiscountEl) {
        bundleDiscountEl.textContent = `- ${formatCurrency(result.bundlePromoDiscount || 0)}`;
        
        // Toggle akan ditambahkan di updateCalculationUpsellingRecommendations jika ada rekomendasi
    }
    
    // Update free product discount
    const freeProductDiscountEl = document.getElementById('free-product-discount');
    if (freeProductDiscountEl) {
        const discountValue = result.freeProductDiscount || 0;
        freeProductDiscountEl.textContent = `- ${formatCurrency(discountValue)}`;
        console.log(`💰 UI Update - Free Product Discount: Rp ${discountValue.toLocaleString('id-ID')}`);
    } else {
        console.warn('⚠️ Element #free-product-discount not found!');
    }
    
    // Update invoice discount
    const invoiceDiscountEl = document.getElementById('invoice-discount');
    if (invoiceDiscountEl) {
        invoiceDiscountEl.textContent = `- ${formatCurrency(result.invoiceDiscount || 0)}`;
    }
    
    // Update total nett
    const totalNettEl = document.getElementById('total-nett-price');
    if (totalNettEl) {
        totalNettEl.innerHTML = `<strong>${formatCurrency(result.totalNettPrice || result.totalNett || 0)}</strong>`;
    }
    
    // Update summary bar
    const summaryBarTotal = document.getElementById('summary-bar-total');
    if (summaryBarTotal) {
        // Gunakan totalNettPrice atau totalNett yang sudah dihitung dengan benar
        const totalNettValue = result.totalNettPrice || result.totalNett || 0;
        
        summaryBarTotal.textContent = formatCurrency(totalNettValue);
        console.log('📊 Summary bar updated:', {
            totalNettPrice: result.totalNettPrice,
            totalNett: result.totalNett,
            finalValue: totalNettValue,
            basePrice: result.basePrice,
            principalDiscount: result.principalDiscount,
            groupPromoDiscount: result.groupPromoDiscount,
            bundlePromoDiscount: result.bundlePromoDiscount,
            invoiceDiscount: result.invoiceDiscount,
            calculation: `${result.basePrice} - ${result.principalDiscount} - ${result.groupPromoDiscount} - ${result.bundlePromoDiscount} - ${result.invoiceDiscount} = ${totalNettValue}`
        });
    }
    
    // Update final tagihan (setelah voucher)
    updateFinalTagihan();
    
    console.log('✅ Calculation result updated:', result);
}

/**
 * Update final tagihan setelah dikurangi voucher
 */
function updateFinalTagihan() {
    const finalTagihanEl = document.getElementById('final-tagihan');
    if (!finalTagihanEl) return;
    
    // Get total nett dari lastCalculationResult
    const totalNett = window.lastCalculationResult?.totalNettPrice || window.lastCalculationResult?.totalNett || 0;
    
    // Get voucher value
    const voucherInput = document.getElementById('voucher-input');
    const nominalVoucher = voucherInput ? parseNumInput(voucherInput.value) : 0;
    
    // Calculate final tagihan
    const finalTagihan = Math.max(0, totalNett - nominalVoucher);
    
    const formatCurrency = (amount) => {
        const roundedAmount = Math.round(amount || 0);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(roundedAmount);
    };
    
    finalTagihanEl.innerHTML = `<strong>${formatCurrency(finalTagihan)}</strong>`;
    
    console.log('💰 Final tagihan updated:', {
        totalNett,
        nominalVoucher,
        finalTagihan
    });
}

/**
 * Reset simulation - clear cart and reset voucher
 */
function resetSimulation() {
    // Clear cart
    cart.clear();
    
    // Save cart to localStorage
    saveCartToLocalStorage();
    
    // Reset all quantity inputs in product list
    const productContainer = document.getElementById('product-groups');
    if (productContainer) {
        const qtyInputs = productContainer.querySelectorAll('.qty-input');
        qtyInputs.forEach(input => {
            const isKrt = input.classList.contains('input-krt');
            input.value = isKrt ? 'K' : 'B';
            input.classList.add('is-placeholder');
        });
    }
    
    // Reset voucher input
    const voucherInput = document.getElementById('voucher-input');
    if (voucherInput) {
        voucherInput.value = '';
    }
    
    // Reset payment method to COD
    const paymentMethodEl = document.getElementById('payment-method');
    if (paymentMethodEl) {
        paymentMethodEl.value = 'COD';
    }
    
    // Re-render cart
    renderKeranjang();
    
    // Reset calculation display (autohide will be handled by updateCalculationDisplay based on qty)
    updateCalculationDisplay({
        totalBasePrice: 0,
        principalDiscount: 0,
        groupPromoDiscount: 0,
        bundlePromoDiscount: 0,
        freeProductPromo: 0,
        invoiceDiscount: 0,
        totalNettPrice: 0
    });
    
    // Update final tagihan
    updateFinalTagihan();
    
    // Update summary bar
    const summaryBarTotal = document.getElementById('summary-bar-total');
    if (summaryBarTotal) {
        summaryBarTotal.textContent = 'Rp 0';
    }
    
    console.log('🔄 Simulation reset');
}

/**
 * Show faktur modal
 */
function showFakturModal() {
    if (cart.size === 0) {
        alert('❌ Keranjang kosong, tidak bisa membuat faktur.');
        return;
    }
    
    const result = window.lastCalculationResult;
    if (!result) {
        alert('❌ Data perhitungan belum tersedia. Silakan hitung terlebih dahulu.');
        return;
    }
    
    // Get voucher value
    const voucherInput = document.getElementById('voucher-input');
    const nominalVoucher = voucherInput ? parseNumInput(voucherInput.value) : 0;
    
    // Get user info
    const userRegion = currentUser?.region_name || currentUser?.region || 'N/A';
    const userDepo = currentUser?.depo_name || currentUser?.depo || 'N/A';
    // Extract kode sales from login_code (format: depo_id-kode_sales) or use kode_sales field
    const loginCode = currentUser?.login_code || '';
    const kodeSalesFromLogin = loginCode.includes('-') ? loginCode.split('-')[1] : null;
    const userSales = currentUser?.kode_sales || kodeSalesFromLogin || 'N/A';
    const userName = currentUser?.full_name || currentUser?.nama || currentUser?.NAMA || currentUser?.name || 'N/A';
    
    // Build faktur HTML
    let fakturHtml = `
        <div class="faktur-header-info">
            <div class="info-line"><span class="info-label">Region</span><span class="info-separator">:</span><span>${userRegion}</span></div>
            <div class="info-line"><span class="info-label">Depo</span><span class="info-separator">:</span><span>${userDepo}</span></div>
            <div class="info-line"><span class="info-label">Sales</span><span class="info-separator">:</span><span>${userName} (${userSales})</span></div>
        </div>
        <table class="faktur-table">
            <thead>
                <tr>
                    <th class="col-nama">Nama Produk</th>
                    <th class="col-qty">Qty (Krt)</th>
                    <th class="col-price">Harga Nett / Krt</th>
                    <th class="col-total">Subtotal Nett</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Add items
    result.items.forEach(item => {
        const product = item.product || productDataMap.get(item.productId);
        if (!product) return;
        
        // Get qtyKrtTotal from item (stored in calculateItemDetails) or calculate from cart
        let qtyKrtTotal = item.qtyKrtTotal;
        if (!qtyKrtTotal || qtyKrtTotal === 0) {
            // Fallback: calculate from cart
            const cartItem = cart.get(item.productId);
            if (cartItem) {
                const qtyKrt = cartItem.quantities?.krt || cartItem.quantities?.unit_1 || 0;
                const qtyBox = cartItem.quantities?.box || cartItem.quantities?.unit_2 || 0;
                const ratio = product.ratio_unit_2_per_unit_1 || 1;
                qtyKrtTotal = qtyKrt + (qtyBox / ratio);
            }
        }
        
        const hargaNettPerKrt = item.hargaNettPerKrt || (qtyKrtTotal > 0 ? (item.finalNett / qtyKrtTotal) : 0);
        const subtotalNett = item.finalNett || 0;
        
        const formatCurrency = (amount) => {
            const roundedAmount = Math.round(amount || 0);
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(roundedAmount);
        };
        
        fakturHtml += `
            <tr>
                <td class="item-name">${product.code || item.productId} - ${product.name || 'N/A'}</td>
                <td class="item-qty">${qtyKrtTotal.toFixed(2)}</td>
                <td class="item-price-nett">${formatCurrency(hargaNettPerKrt)}</td>
                <td class="item-total">${formatCurrency(subtotalNett)}</td>
            </tr>
        `;
    });
    
    // Calculate totals
    const totalNett = result.totalNettPrice || result.totalNett || 0;
    const cashback = result.loyaltyCashback || {};
    const cashbackAmount = cashback.isAvailable ? (cashback.cashbackAmount || 0) : 0;
    const finalTagihan = Math.max(0, totalNett - cashbackAmount - nominalVoucher);
    
    const formatCurrency = (amount) => {
        const roundedAmount = Math.round(amount || 0);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(roundedAmount);
    };
    
    fakturHtml += `</tbody></table>
        <div class="faktur-summary">
            <div class="summary-row"><span class="summary-label">Total Harga Dasar</span><span class="summary-value">${formatCurrency(result.basePrice || result.totalBasePrice || 0)}</span></div>
            <div class="summary-row discount-row"><span class="summary-label">(-) Diskon Principal</span><span class="summary-value value-danger">- ${formatCurrency(result.principalDiscount || 0)}</span></div>
            <div class="summary-row discount-row"><span class="summary-label">(-) Promo Grup Produk</span><span class="summary-value value-danger">- ${formatCurrency(result.groupPromoDiscount || 0)}</span></div>
            <div class="summary-row discount-row"><span class="summary-label">(-) Promo Bundling</span><span class="summary-value value-danger">- ${formatCurrency(result.bundlePromoDiscount || 0)}</span></div>
            <div class="summary-row discount-row"><span class="summary-label">(-) Diskon Invoice</span><span class="summary-value value-danger">- ${formatCurrency(result.invoiceDiscount || 0)}</span></div>
            <div class="summary-row on-faktur-row" style="border-top: 2px solid #333;"><span class="summary-label">Total Harga Nett</span><span class="summary-value">${formatCurrency(totalNett)}</span></div>
            ${(() => {
                const cashback = result.loyaltyCashback || {};
                if (cashback.isAvailable && cashback.cashbackAmount > 0) {
                    return `
                        <div class="summary-row discount-row" style="color:var(--success-color); font-weight:bold;">
                            <span class="summary-label">(-) Cashback Loyalty (${cashback.loyaltyClassName || cashback.loyaltyClassCode})</span>
                            <span class="summary-value value-danger">- ${formatCurrency(cashback.cashbackAmount)}</span>
                        </div>
                    `;
                }
                return '';
            })()}
            <div class="summary-row discount-row" style="color:var(--success-color); font-weight:bold;"><span class="summary-label">(-) Voucher</span><span class="summary-value value-danger">- ${formatCurrency(nominalVoucher)}</span></div>
            <div class="summary-row grand-total" style="border-top: 2px solid #333; margin-top: 5px;"><span class="summary-label">FINAL TAGIHAN:</span><span class="summary-value">${formatCurrency(finalTagihan)}</span></div>
        </div>
    `;
    
    // Show modal (reuse price detail modal structure)
    const modal = document.getElementById('price-detail-modal');
    const modalTitle = document.getElementById('price-modal-title');
    const modalDetails = document.getElementById('price-modal-details');
    
    if (modal && modalTitle && modalDetails) {
        modalTitle.textContent = 'Simulasi Faktur';
        modalDetails.innerHTML = fakturHtml;
        modal.style.display = 'block';
    } else {
        // Fallback: use alert or create new modal
        console.warn('⚠️ Price detail modal not found, using alert');
        alert('Faktur:\n\nTotal Nett: ' + formatCurrency(totalNett) + '\nVoucher: -' + formatCurrency(nominalVoucher) + '\nFinal Tagihan: ' + formatCurrency(finalTagihan));
    }
}

/**
 * Update harga nett per product item setelah calculate
 */
function updateProductNettPrices(result) {
    if (!result || !result.items) return;
    
    const formatCurrency = (amount) => {
        // Pastikan amount adalah angka valid dan bulatkan ke bilangan bulat
        const numAmount = typeof amount === 'number' && !isNaN(amount) && isFinite(amount) ? amount : 0;
        const roundedAmount = Math.round(numAmount);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(roundedAmount);
    };
    
    // Create map untuk lookup item by productId
    const itemMap = new Map();
    result.items.forEach(item => {
        itemMap.set(item.productId, item);
    });
    
    // Update setiap product item di cart (termasuk yang belum ada di result.items)
    cart.forEach((cartItem, productId) => {
        const qtyKrt = cartItem.quantities?.krt || cartItem.quantities?.unit_1 || 0;
        const qtyBox = cartItem.quantities?.box || cartItem.quantities?.unit_2 || 0;
        const hasQty = qtyKrt > 0 || qtyBox > 0;
        
        // Show/hide nett summary - UPDATE SEMUA pricing divs (bisa ada di bundle dan group)
        const pricingDivs = document.querySelectorAll(`[data-product-pricing="${productId}"]`);
        console.log(`  updateProductNettPrices: Product ${productId}, hasQty=${hasQty}, found ${pricingDivs.length} pricing divs, item in result: ${!!itemMap.get(productId)}`);
        
        pricingDivs.forEach(pricingDiv => {
            pricingDiv.style.display = hasQty ? 'block' : 'none';
        });
        
        // Jika item tidak ada di result.items, set nilai ke 0 dan return
        const item = itemMap.get(productId);
        if (!item) {
            if (hasQty) {
                console.warn(`  ⚠️ Product ${productId} ada di cart tapi tidak ada di result.items`);
            }
            // Set semua nilai ke 0 jika tidak ada di result
            pricingDivs.forEach(pricingDiv => {
                const subtotalEl = pricingDiv.querySelector(`#subtotal-${productId}`);
                const hargaNettEl = pricingDiv.querySelector(`#harganett-${productId}`);
                const simulasiNettEl = pricingDiv.querySelector(`#simulasi-nett-${productId}`);
                
                if (subtotalEl) subtotalEl.textContent = formatCurrency(0);
                if (hargaNettEl) hargaNettEl.textContent = formatCurrency(0);
                if (simulasiNettEl) simulasiNettEl.textContent = formatCurrency(0);
            });
            return;
        }
        
        if (!hasQty) {
            // Jika tidak ada qty, set semua nilai ke 0 dan hide
            pricingDivs.forEach(pricingDiv => {
                const subtotalEl = pricingDiv.querySelector(`#subtotal-${productId}`);
                const hargaNettEl = pricingDiv.querySelector(`#harganett-${productId}`);
                const simulasiNettEl = pricingDiv.querySelector(`#simulasi-nett-${productId}`);
                
                if (subtotalEl) subtotalEl.textContent = formatCurrency(0);
                if (hargaNettEl) hargaNettEl.textContent = formatCurrency(0);
                if (simulasiNettEl) simulasiNettEl.textContent = formatCurrency(0);
            });
            return;
        }
        
        // Get product untuk ratio
        const product = productDataMap.get(productId);
        const ratio = product?.ratio_unit_2_per_unit_1 || 1;
        
        // Calculate total subtotal setelah principal discount (untuk proporsi)
        const totalSubtotalAfterPrincipal = result.items.reduce((sum, it) => sum + it.subtotalAfterDiscount, 0);
        
        // Calculate proporsi discount untuk item ini
        const itemProportion = totalSubtotalAfterPrincipal > 0 
            ? (item.subtotalAfterDiscount / totalSubtotalAfterPrincipal) 
            : 0;
        
        // Use pre-calculated item details from calculateItemDetails
        const itemGroupPromoDiscount = item.itemGroupPromoDiscount || 0;
        const itemBundlePromoDiscount = item.itemBundlePromoDiscount || 0;
        const itemInvoiceDiscount = item.itemInvoiceDiscount || 0;
        const finalNett = item.finalNett || 0;
        
        // Use hargaNettPerKrt yang sudah dihitung di calculateItemDetails untuk konsistensi
        // Jika belum ada (undefined/null/NaN), hitung ulang sebagai fallback
        let hargaNettPerKrt = item.hargaNettPerKrt;
        if (hargaNettPerKrt === undefined || hargaNettPerKrt === null || isNaN(hargaNettPerKrt) || !isFinite(hargaNettPerKrt)) {
            // Fallback: calculate harga nett per krt (include fractional from boxes)
            const qtyKrtTotal = qtyKrt + (qtyBox / ratio);
            if (qtyKrtTotal > 0 && !isNaN(finalNett) && isFinite(finalNett) && finalNett >= 0) {
                hargaNettPerKrt = finalNett / qtyKrtTotal;
            } else {
                // Jika finalNett tidak valid, gunakan subtotal (basePrice) sebagai fallback
                // Logika: jika semua diskon = 0, harga = basePrice
                const basePrice = item.subtotal || item.subtotalAfterDiscount || 0;
                hargaNettPerKrt = qtyKrtTotal > 0 ? basePrice / qtyKrtTotal : 0;
            }
        }
        
        // Pastikan hargaNettPerKrt tidak NaN atau negatif
        if (isNaN(hargaNettPerKrt) || !isFinite(hargaNettPerKrt) || hargaNettPerKrt < 0) {
            // Fallback ke harga per krt dari subtotal (basePrice)
            const qtyKrtTotal = qtyKrt + (qtyBox / ratio);
            const basePrice = item.subtotal || item.subtotalAfterDiscount || 0;
            hargaNettPerKrt = qtyKrtTotal > 0 ? basePrice / qtyKrtTotal : 0;
        }
        
        // Debug logging jika hargaNettPerKrt adalah 0 padahal seharusnya ada nilai
        if (hargaNettPerKrt === 0 && finalNett > 0) {
            const qtyKrtTotal = qtyKrt + (qtyBox / ratio);
            console.warn(`  ⚠️ updateProductNettPrices: hargaNettPerKrt is 0 for product ${productId}: finalNett=${finalNett}, qtyKrtTotal=${qtyKrtTotal}, qtyKrt=${qtyKrt}, qtyBox=${qtyBox}, ratio=${ratio}, item.hargaNettPerKrt=${item.hargaNettPerKrt}`);
        }
        
        // Update SEMUA pricing divs (bisa ada di bundle dan group)
        pricingDivs.forEach(pricingDiv => {
            // Update subtotal (setelah principal discount)
            const subtotalEl = pricingDiv.querySelector(`#subtotal-${productId}`);
            if (subtotalEl) {
                subtotalEl.textContent = formatCurrency(item.subtotalAfterDiscount);
            }
            
            // Update harga nett per krt (setelah SEMUA diskon)
            const hargaNettEl = pricingDiv.querySelector(`#harganett-${productId}`);
            if (hargaNettEl) {
                hargaNettEl.textContent = formatCurrency(hargaNettPerKrt);
            }
            
            // Simulasi nett (setelah semua discount termasuk invoice) - sama dengan harga nett per krt
            const simulasiNettEl = pricingDiv.querySelector(`#simulasi-nett-${productId}`);
            if (simulasiNettEl) {
                simulasiNettEl.textContent = formatCurrency(hargaNettPerKrt);
            }
        });
    });
}

/**
 * Calculate per-item discount details (group promo, bundle promo, invoice)
 * dan simpan ke result.items untuk konsistensi dengan cart dan modal
 */
function calculateItemDetails(result) {
    if (!result || !result.items) return;

    // Calculate total subtotal after principal discount for proportion calculations
    const totalSubtotalAfterPrincipal = result.items.reduce((sum, it) => sum + it.subtotalAfterDiscount, 0);

    // Calculate total after all discounts (excluding invoice and free product) for invoice proportion
    // Pastikan tidak negatif - jika semua promo tidak berlaku, ini = basePrice - principalDiscount
    const totalAfterOtherDiscountsGlobal = Math.max(0, result.basePrice - (result.principalDiscount || 0) - (result.groupPromoDiscount || 0) - (result.bundlePromoDiscount || 0) - (result.freeProductDiscount || 0));

    // Calculate total qty for group promo proportion (per group)
    // Group promo discount harus dibagi berdasarkan qty, bukan subtotal
    const groupQtyMap = new Map(); // group_code -> totalQty
    const itemQtyMap = new Map(); // productId -> { qtyKrtTotal, groupCode }
    
    result.items.forEach(item => {
        const productId = item.productId;
        const product = productDataMap.get(productId);
        const cartItem = cart.get(productId);
        if (!product || !cartItem) return;

        const qtyKrt = cartItem.quantities?.krt || cartItem.quantities?.unit_1 || 0;
        const qtyBox = cartItem.quantities?.box || cartItem.quantities?.unit_2 || 0;
        const ratio = product.ratio_unit_2_per_unit_1 || 1;
        const qtyKrtTotal = qtyKrt + (qtyBox / ratio);
        
        // Get group code for this product
        const groupInfo = productGroupMap.get(productId);
        const groupCode = groupInfo?.code || null;
        
        itemQtyMap.set(productId, { qtyKrtTotal, groupCode });
        
        if (groupCode) {
            if (!groupQtyMap.has(groupCode)) {
                groupQtyMap.set(groupCode, 0);
            }
            groupQtyMap.set(groupCode, groupQtyMap.get(groupCode) + qtyKrtTotal);
        }
    });

    result.items.forEach(item => {
        const productId = item.productId;
        const product = productDataMap.get(productId);
        const cartItem = cart.get(productId);
        if (!product || !cartItem) return;

        const qtyInfo = itemQtyMap.get(productId);
        if (!qtyInfo) return;
        
        const { qtyKrtTotal, groupCode } = qtyInfo;

        // Proportion for invoice discount (berdasarkan subtotal)
        const itemProportion = totalSubtotalAfterPrincipal > 0
            ? (item.subtotalAfterDiscount / totalSubtotalAfterPrincipal)
            : 0;

        // 1. Group Promo Discount for this item (proportional berdasarkan QTY dalam group yang sama)
        // Karena group promo discount adalah per unit (per krt), proporsi harus berdasarkan qty
        // IMPORTANT: Proporsi harus dalam group yang sama, bukan total semua group
        item.itemGroupPromoDiscount = 0;
        if (groupCode && groupQtyMap.has(groupCode)) {
            const totalGroupQty = groupQtyMap.get(groupCode);
            if (totalGroupQty > 0) {
                // Proporsi item ini dari total qty dalam group yang sama
                const qtyProportionInGroup = qtyKrtTotal / totalGroupQty;
                
                // Gunakan group promo discount untuk group ini (jika tersedia)
                const groupDiscountForThisGroup = result.groupPromoDiscountByGroup?.get(groupCode) || 0;
                
                if (groupDiscountForThisGroup > 0) {
                    // Bagi group discount untuk group ini proporsional berdasarkan qty item
                    item.itemGroupPromoDiscount = groupDiscountForThisGroup * qtyProportionInGroup;
                }
                // TIDAK ADA FALLBACK - jika group tidak punya discount, maka itemGroupPromoDiscount = 0
                // Fallback sebelumnya salah karena membagikan discount dari group lain ke group yang tidak eligible
            }
        }

        // 2. Bundle Promo Discount for this item (proportional per promo berdasarkan QTY)
        // Item bisa masuk ke multiple bundle promos, jadi kita perlu hitung proporsi per promo
        // Proporsi berdasarkan QTY (bukan harga), sehingga jika bucket 1 = 1 krt dan bucket 2 = 1 krt,
        // potongan 3000 dibagi rata menjadi masing-masing 1500
        item.itemBundlePromoDiscount = 0;
        item.bundlePromoDiscountByPromo = {}; // Track discount per promo untuk breakdown di modal
        
        // Check all promos that have bundle discount
        if (result.bundlePromoDiscountByPromo && result.bundlePromoDiscountByPromo.size > 0) {
            // Iterate through all promos that have discount
            result.bundlePromoDiscountByPromo.forEach((promoDiscount, promoId) => {
                // Check if this product is in this promo
                const promoData = promoStructureMap?.get(promoId);
                if (!promoData || !promoData.buckets) return;
                
                // Check if productId is in any bucket of this promo
                let isInPromo = false;
                promoData.buckets.forEach((productsInBucket) => {
                    if (productsInBucket.includes(productId)) {
                        isInPromo = true;
                    }
                });
                
                if (!isInPromo) return;
                
                // Calculate proportion for this promo based on QTY (not subtotal)
                // Get all items that are in this promo and calculate total qty
                let totalQtyInThisPromo = 0;
                const itemQtyInPromo = new Map(); // productId -> qtyKrtTotal
                
                result.items.forEach(it => {
                    // Check if it.productId is in this promo
                    let itIsInPromo = false;
                    promoData.buckets.forEach((productsInBucket) => {
                        if (productsInBucket.includes(it.productId)) {
                            itIsInPromo = true;
                        }
                    });
                    
                    if (itIsInPromo) {
                        const itQtyInfo = itemQtyMap.get(it.productId);
                        if (itQtyInfo) {
                            const itQtyKrtTotal = itQtyInfo.qtyKrtTotal || 0;
                            totalQtyInThisPromo += itQtyKrtTotal;
                            itemQtyInPromo.set(it.productId, itQtyKrtTotal);
                        }
                    }
                });
                
                // Calculate proportion and discount for this promo based on QTY
                const currentItemQty = qtyKrtTotal || 0;
                if (totalQtyInThisPromo > 0 && currentItemQty > 0) {
                    const qtyProportion = currentItemQty / totalQtyInThisPromo;
                    const itemDiscountForThisPromo = promoDiscount * qtyProportion;
                    item.itemBundlePromoDiscount += itemDiscountForThisPromo;
                    item.bundlePromoDiscountByPromo[promoId] = itemDiscountForThisPromo;
                }
            });
        }

        // 2.5. Free Product Discount for this item (based on quantity in eligible groups)
        // Gunakan discount per group yang sudah dihitung di calculation.js (yang sudah mempertimbangkan promo availability)
        item.itemFreeProductDiscount = 0;
        if (result.freeProductDiscountByGroup && result.freeProductDiscountByGroup.size > 0) {
            // Get group code for this product
            const groupInfo = productGroupMap.get(productId);
            const groupCode = groupInfo?.code || null;
            
            if (groupCode && result.freeProductDiscountByGroup.has(groupCode)) {
                // Get total discount for this group (sudah mempertimbangkan promo availability)
                const totalDiscountForThisGroup = result.freeProductDiscountByGroup.get(groupCode);
                
                if (totalDiscountForThisGroup > 0) {
                    // Calculate total qty in this group for all products
                    let totalQtyInGroup = 0;
                    result.items.forEach(otherItem => {
                        const otherProductId = otherItem.productId;
                        const otherGroupInfo = productGroupMap.get(otherProductId);
                        if (otherGroupInfo && otherGroupInfo.code === groupCode) {
                            const otherCartItem = cart.get(otherProductId);
                            if (otherCartItem) {
                                const otherQtyKrt = otherCartItem.quantities?.krt || otherCartItem.quantities?.unit_1 || 0;
                                const otherQtyBox = otherCartItem.quantities?.box || otherCartItem.quantities?.unit_2 || 0;
                                const otherProduct = productDataMap.get(otherProductId);
                                const otherRatio = otherProduct?.ratio_unit_2_per_unit_1 || 1;
                                totalQtyInGroup += (otherQtyKrt * otherRatio) + otherQtyBox;
                            }
                        }
                    });
                    
                    // Calculate this item's qty in box
                    const qtyKrt = cartItem.quantities?.krt || cartItem.quantities?.unit_1 || 0;
                    const qtyBox = cartItem.quantities?.box || cartItem.quantities?.unit_2 || 0;
                    const ratio = product.ratio_unit_2_per_unit_1 || 1;
                    const itemQtyInBox = (qtyKrt * ratio) + qtyBox;
                    
                    // Distribute discount based on quantity proportion
                    if (totalQtyInGroup > 0 && itemQtyInBox > 0) {
                        const qtyProportion = itemQtyInBox / totalQtyInGroup;
                        item.itemFreeProductDiscount = totalDiscountForThisGroup * qtyProportion;
                        
                        // Debug logging
                        if (window.DEBUG_FREE_PRODUCT) {
                            console.log(`%c🔍 ITEM DISCOUNT CALCULATION for ${productId} (${groupCode})`, 'background: #ffd43b; color: #000; font-weight: bold; padding: 2px 6px;');
                            console.log(`  Total discount for group ${groupCode}: Rp ${totalDiscountForThisGroup.toLocaleString('id-ID')}`);
                            console.log(`  Item qty: ${itemQtyInBox} box, Total group qty: ${totalQtyInGroup} box`);
                            console.log(`  Proportion: ${(qtyProportion * 100).toFixed(2)}%`);
                            console.log(`  Item discount: Rp ${item.itemFreeProductDiscount.toLocaleString('id-ID')}`);
                        }
                    }
                }
            }
        }

        // Subtotal after Principal, Group, Bundle, and Free Product discounts
        // Jika promo tidak berlaku, semua discount akan 0
        // sehingga subtotalAfterAllDiscounts = subtotalAfterDiscount (base price setelah principal)
        const subtotalAfterAllDiscounts = item.subtotalAfterDiscount - (item.itemGroupPromoDiscount || 0) - (item.itemBundlePromoDiscount || 0) - (item.itemFreeProductDiscount || 0);

        // 3. Invoice Discount for this item (proportional)
        // HANYA diterapkan jika ada invoice discount dan item memiliki subtotal > 0
        item.itemInvoiceDiscount = 0;
        if (totalAfterOtherDiscountsGlobal > 0 && result.invoiceDiscount > 0 && subtotalAfterAllDiscounts > 0) {
            const invoiceDiscountProportion = subtotalAfterAllDiscounts / totalAfterOtherDiscountsGlobal;
            // Pastikan proporsi valid (tidak NaN dan tidak negatif)
            if (!isNaN(invoiceDiscountProportion) && isFinite(invoiceDiscountProportion) && invoiceDiscountProportion > 0) {
                item.itemInvoiceDiscount = result.invoiceDiscount * invoiceDiscountProportion;
            }
            // TIDAK ADA FALLBACK - jika tidak eligible, itemInvoiceDiscount = 0
        }

        // Final Nett for this item
        // Logika: basePrice (subtotal) - principalDiscount - strataDiscount - bundleDiscount - freeProductDiscount - invoiceDiscount
        // Jika semua diskon = 0, maka finalNett = subtotal (basePrice)
        item.finalNett = subtotalAfterAllDiscounts - (item.itemInvoiceDiscount || 0);
        
        // Pastikan finalNett tidak NaN (jika NaN, gunakan subtotal sebagai basePrice)
        if (isNaN(item.finalNett) || !isFinite(item.finalNett)) {
            // Jika perhitungan menghasilkan NaN, gunakan subtotal (basePrice) sebagai fallback
            item.finalNett = item.subtotal || 0;
        }
        
        // Pastikan finalNett tidak negatif (tidak boleh negatif)
        if (item.finalNett < 0) {
            item.finalNett = 0;
        }

        // Calculate harga nett per krt
        // Pastikan qtyKrtTotal valid dan tidak 0
        if (qtyKrtTotal > 0 && !isNaN(item.finalNett) && isFinite(item.finalNett)) {
            item.hargaNettPerKrt = item.finalNett / qtyKrtTotal;
        } else {
            // Jika qtyKrtTotal 0 atau finalNett tidak valid, hitung dari subtotal (basePrice)
            if (qtyKrtTotal > 0 && item.subtotal) {
                item.hargaNettPerKrt = item.subtotal / qtyKrtTotal;
            } else {
                item.hargaNettPerKrt = 0;
            }
        }
        
        // Pastikan hargaNettPerKrt tidak NaN
        if (isNaN(item.hargaNettPerKrt) || !isFinite(item.hargaNettPerKrt)) {
            item.hargaNettPerKrt = 0;
        }
        
        // Store qtyKrtTotal to item for use in faktur modal
        item.qtyKrtTotal = qtyKrtTotal;
        
        // Store product reference for use in faktur modal
        if (!item.product) {
            item.product = product;
        }
        
        // Debug logging jika hargaNettPerKrt adalah 0 padahal seharusnya ada nilai
        if (item.hargaNettPerKrt === 0 && item.finalNett > 0) {
            console.warn(`  ⚠️ calculateItemDetails: hargaNettPerKrt is 0 for product ${productId}: finalNett=${item.finalNett}, qtyKrtTotal=${qtyKrtTotal}`);
        }
    });
}

/**
 * Update nett summary visibility untuk semua produk di cart
 * Dipanggil setelah cart berubah (bukan hanya setelah calculate)
 */
function updateNettSummaryVisibility() {
    console.log('🔄 updateNettSummaryVisibility called, cart size:', cart.size);
    
    if (cart.size === 0) {
        // Hide all nett summaries if cart is empty
        const allPricingDivs = document.querySelectorAll('[data-product-pricing]');
        allPricingDivs.forEach(pricingDiv => {
            pricingDiv.style.display = 'none';
        });
        return;
    }
    
    cart.forEach((cartItem, productId) => {
        const qtyKrt = cartItem.quantities?.krt || cartItem.quantities?.unit_1 || 0;
        const qtyBox = cartItem.quantities?.box || cartItem.quantities?.unit_2 || 0;
        const hasQty = qtyKrt > 0 || qtyBox > 0;
        
        // Update semua nett summary untuk produk ini (bisa ada di bundle dan group)
        const pricingDivs = document.querySelectorAll(`[data-product-pricing="${productId}"]`);
        console.log(`  Product ${productId}: hasQty=${hasQty}, found ${pricingDivs.length} pricing divs`);
        
        if (pricingDivs.length === 0) {
            console.warn(`  ⚠️ No pricing divs found for product ${productId}`);
        }
        
        pricingDivs.forEach(pricingDiv => {
            pricingDiv.style.display = hasQty ? 'block' : 'none';
        });
    });
    
    // Hide nett summary untuk produk yang tidak ada di cart
    const allPricingDivs = document.querySelectorAll('[data-product-pricing]');
    allPricingDivs.forEach(pricingDiv => {
        const productId = pricingDiv.getAttribute('data-product-pricing');
        if (!cart.has(productId)) {
            pricingDiv.style.display = 'none';
        }
    });
}

/**
 * Show detail harga modal untuk produk tertentu
 */
function showDetailHargaModal(productId) {
    console.log('🔍 showDetailHargaModal called for productId:', productId);
    
    const priceModal = document.getElementById('price-detail-modal');
    const priceModalTitle = document.getElementById('price-modal-title');
    const priceModalDetails = document.getElementById('price-modal-details');
    
    if (!priceModal || !priceModalTitle || !priceModalDetails) {
        console.error('Modal elements not found:', {
            priceModal: !!priceModal,
            priceModalTitle: !!priceModalTitle,
            priceModalDetails: !!priceModalDetails
        });
        alert('Modal detail harga tidak ditemukan. Silakan refresh halaman.');
        return;
    }
    
    // Get product data
    const product = productDataMap.get(productId);
    if (!product) {
        console.error(`Product ${productId} not found`);
        return;
    }
    
    // Get cart item
    const cartItem = cart.get(productId);
    if (!cartItem) {
        console.error(`Cart item ${productId} not found`);
        return;
    }
    
    const qtyKrt = cartItem.quantities?.krt || cartItem.quantities?.unit_1 || 0;
    const qtyBox = cartItem.quantities?.box || cartItem.quantities?.unit_2 || 0;
    
    if (qtyKrt === 0 && qtyBox === 0) {
        alert('Kuantitas item nol. Silakan tambahkan kuantitas terlebih dahulu.');
        return;
    }
    
    // Get user info
    const userZona = currentUser?.zona || null;
    const userRegion = currentUser?.region || null;
    const userDepo = currentUser?.depo || null;
    if (!userZona) {
        alert('Zona tidak ditemukan. Silakan login ulang.');
        return;
    }
    
    // Get store type
    const storeTypeEl = document.getElementById('store-type');
    const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
    
    // Get base price
    const basePrice = product.prices?.[userZona] || 0;
    if (!basePrice) {
        alert('Harga produk tidak ditemukan.');
        return;
    }
    
    // Get ratio
    const ratio = product.ratio_unit_2_per_unit_1 || 1;
    const qtyKrtTotal = qtyKrt + (qtyBox / ratio);
    
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
    
    // Gunakan data yang sudah dihitung dari lastCalculationResult untuk konsistensi
    let hargaDasarKrt = basePrice;
    let discPrincipalPerKrt = 0;
    let discGroupPromoPerKrt = 0;
    let discBundlePromoPerKrt = 0;
    let discFreeProductPerKrt = 0;
    let discInvoicePerKrt = 0;
    let hargaNettPerKrt = 0;
    let calcItem = null;
    
    if (window.lastCalculationResult && window.lastCalculationResult.items) {
        calcItem = window.lastCalculationResult.items.find(it => it.productId === productId);
        if (calcItem && calcItem.finalNett !== undefined) {
            // Use pre-calculated values untuk konsistensi dengan cart
            const itemGroupPromoDiscount = calcItem.itemGroupPromoDiscount || 0;
            const itemBundlePromoDiscount = calcItem.itemBundlePromoDiscount || 0;
            const itemFreeProductDiscount = calcItem.itemFreeProductDiscount || 0;
            const itemInvoiceDiscount = calcItem.itemInvoiceDiscount || 0;
            const finalNett = calcItem.finalNett || 0;
            
            // Calculate per-krt values
            hargaDasarKrt = basePrice;
            const principalDiscountAmount = calcItem.discountAmount || 0;
            discPrincipalPerKrt = qtyKrtTotal > 0 ? (principalDiscountAmount / qtyKrtTotal) : 0;
            discGroupPromoPerKrt = qtyKrtTotal > 0 ? (itemGroupPromoDiscount / qtyKrtTotal) : 0;
            discBundlePromoPerKrt = qtyKrtTotal > 0 ? (itemBundlePromoDiscount / qtyKrtTotal) : 0;
            discFreeProductPerKrt = qtyKrtTotal > 0 ? (itemFreeProductDiscount / qtyKrtTotal) : 0;
            discInvoicePerKrt = qtyKrtTotal > 0 ? (itemInvoiceDiscount / qtyKrtTotal) : 0;
            hargaNettPerKrt = qtyKrtTotal > 0 ? (finalNett / qtyKrtTotal) : 0;
        } else {
            // Data tidak ditemukan - tampilkan pesan error
            alert('Data perhitungan tidak ditemukan. Silakan hitung ulang.');
            return;
        }
    } else {
        // lastCalculationResult tidak ada - tampilkan pesan error
        alert('Data perhitungan tidak tersedia. Silakan hitung ulang.');
        return;
    }
    
    // Build detail HTML (values sudah dihitung di atas menggunakan data dari lastCalculationResult)
    // hargaDasarKrt, discPrincipalPerKrt, discGroupPromoPerKrt, discBundlePromoPerKrt, 
    // discInvoicePerKrt, dan hargaNettPerKrt sudah dihitung di atas
    const detailHtml = `
        <p style="text-align:center; font-size: 1.1em; margin-bottom: 15px;">
            Kuantitas: <strong>${fmtNumInput(qtyKrt)} Krt</strong> & <strong>${fmtNumInput(qtyBox)} Box</strong>
            ${qtyKrtTotal > 0 ? `(${fmtNumInput(qtyKrtTotal)} Krt total)` : ''}
        </p>

        <table class="price-breakdown">
            <thead>
                <tr><th colspan="2">Rincian Harga Nett On-Faktur (per Krt, Inc PPN)</th></tr>
            </thead>
            <tbody>
                <tr>
                    <td class="label">Harga Dasar (Inc PPN)</td>
                    <td class="value">${formatCurrency(hargaDasarKrt)}</td>
                </tr>
                <tr>
                    <td class="label">Potongan Principal</td>
                    <td class="value value-danger">- ${formatCurrency(discPrincipalPerKrt)}</td>
                </tr>
                <tr>
                    <td class="label">Potongan Group Promo (Strata)</td>
                    <td class="value value-danger">- ${formatCurrency(discGroupPromoPerKrt)}</td>
                </tr>
                ${(() => {
                    // Check if item has breakdown per promo
                    const bundlePromoBreakdown = calcItem.bundlePromoDiscountByPromo || {};
                    const promoIds = Object.keys(bundlePromoBreakdown);
                    
                    if (promoIds.length === 0) {
                        // No bundle promo discount
                        return `
                            <tr>
                                <td class="label">Potongan Bundle Promo</td>
                                <td class="value value-danger">- ${formatCurrency(discBundlePromoPerKrt)}</td>
                            </tr>
                        `;
                    } else if (promoIds.length === 1) {
                        // Only 1 promo, show simple
                        const promoId = promoIds[0];
                        const discountPerKrt = qtyKrtTotal > 0 ? (bundlePromoBreakdown[promoId] / qtyKrtTotal) : 0;
                        return `
                            <tr>
                                <td class="label">Potongan Bundle Promo (${promoId})</td>
                                <td class="value value-danger">- ${formatCurrency(discountPerKrt)}</td>
                            </tr>
                        `;
                    } else {
                        // Multiple promos, show breakdown
                        let html = `
                            <tr>
                                <td class="label">Potongan Bundle Promo</td>
                                <td class="value value-danger">- ${formatCurrency(discBundlePromoPerKrt)}</td>
                            </tr>
                        `;
                        promoIds.forEach(promoId => {
                            const discount = bundlePromoBreakdown[promoId];
                            const discountPerKrt = qtyKrtTotal > 0 ? (discount / qtyKrtTotal) : 0;
                            html += `
                                <tr style="font-size: 0.9em; color: #666;">
                                    <td class="label" style="padding-left: 20px;">└─ ${promoId}</td>
                                    <td class="value value-danger">- ${formatCurrency(discountPerKrt)}</td>
                                </tr>
                            `;
                        });
                        return html;
                    }
                })()}
                ${discFreeProductPerKrt > 0 ? `
                <tr>
                    <td class="label">Potongan Free Product</td>
                    <td class="value value-danger">- ${formatCurrency(discFreeProductPerKrt)}</td>
                </tr>
                ` : ''}
                <tr>
                    <td class="label">Potongan Invoice</td>
                    <td class="value value-danger">- ${formatCurrency(discInvoicePerKrt)}</td>
                </tr>
                <tr class="final-total-row">
                    <td class="label">Harga Nett Akhir (On Faktur)</td>
                    <td class="value">${formatCurrency(hargaNettPerKrt)}</td>
                </tr>
                ${(() => {
                    const cashback = window.lastCalculationResult?.loyaltyCashback || {};
                    if (cashback.isAvailable && cashback.cashbackAmount > 0) {
                        const cashbackPerKrt = qtyKrtTotal > 0 ? (cashback.cashbackAmount / qtyKrtTotal) : 0;
                        const hargaSetelahCashback = Math.max(0, hargaNettPerKrt - cashbackPerKrt);
                        return `
                            <tr>
                                <td class="label">(-) Cashback Loyalty (${cashback.loyaltyClassName || cashback.loyaltyClassCode})</td>
                                <td class="value value-danger">- ${formatCurrency(cashbackPerKrt)}</td>
                            </tr>
                            <tr class="final-total-row" style="background-color: #e8f5e9; border-top: 2px solid #4caf50;">
                                <td class="label" style="font-weight: bold;">Harga Setelah Cashback</td>
                                <td class="value" style="font-weight: bold; color: #2e7d32;">${formatCurrency(hargaSetelahCashback)}</td>
                            </tr>
                        `;
                    }
                    return '';
                })()}
            </tbody>
        </table>
        
        ${(() => {
            const cashback = window.lastCalculationResult?.loyaltyCashback || {};
            if (cashback.isAvailable && cashback.cashbackAmount > 0) {
                return `
                    <div class="modal-info-box success" style="margin-top: 15px;">
                        <strong>Cashback Loyalty:</strong> ${cashback.loyaltyClassName || cashback.loyaltyClassCode} - 
                        ${formatCurrency(cashback.cashbackAmount)} (${cashback.cashbackPercentage}% dari Total Nett)
                        <br><small>*Cashback diberikan per transaksi untuk principal KSNI</small>
                    </div>
                `;
            }
            return '';
        })()}
        
        <div class="modal-info-box info">
            *Harga nett adalah harga setelah semua diskon diterapkan (Principal, Group Promo, Bundle Promo, dan Invoice Discount).
        </div>
    `;
    
    priceModalTitle.textContent = `Rincian Harga: ${product.code} - ${product.name}`;
    priceModalDetails.innerHTML = detailHtml;
    priceModal.style.display = 'block';
    
    console.log('✅ Modal detail harga ditampilkan');
}

/**
 * Show group promo modal (strata promo rules)
 * @param {string} groupCode - Product group code
 */
window.showGroupPromoModal = function(groupCode) {
    const promoModal = document.getElementById('promo-info-modal');
    const promoModalTitle = document.getElementById('promo-modal-title');
    const promoModalDetails = document.getElementById('promo-modal-details');
    
    if (!promoModal || !promoModalTitle || !promoModalDetails) {
        console.error('Promo modal elements not found');
        return;
    }
    
    // Find group promo for this group code
    const groupPromo = groupPromos.find(promo => 
        promo.product_group_code && promo.product_group_code.toLowerCase() === groupCode.toLowerCase()
    );
    
    if (!groupPromo) {
        promoModalTitle.textContent = `Info Promo - Group ${groupCode}`;
        promoModalDetails.innerHTML = '<p>Tidak ada promo yang tersedia untuk group ini.</p>';
        promoModal.style.display = 'block';
        return;
    }
    
    // Get tiers for this promo
    const promoTiers = groupPromoTiers.filter(tier => tier.promo_id === groupPromo.promo_id);
    
    const formatCurrency = (amount) => {
        const roundedAmount = Math.round(amount || 0);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(roundedAmount);
    };
    
    let html = `
        <div style="margin-bottom: 15px;">
            <h4 style="color: #1e3a8a; margin-bottom: 10px;">${groupPromo.promo_id || 'N/A'}</h4>
            <p style="color: #666; margin-bottom: 10px;">${groupPromo.description || '-'}</p>
            <div style="font-size: 0.9em; color: #888;">
                <strong>Group:</strong> ${groupPromo.product_group_code || '-'} | 
                <strong>Mode:</strong> ${groupPromo.tier_mode || '-'} | 
                <strong>Unit:</strong> ${groupPromo.tier_unit || '-'}
            </div>
        </div>
    `;
    
    if (promoTiers.length > 0) {
        html += '<table class="promo-tier-table" style="width: 100%; margin-top: 15px;">';
        
        // Build header row based on tier_mode
        if (groupPromo.tier_mode === "mix") {
            html += '<thead><tr><th>Min. Qty</th><th>Diskon per Unit</th><th>Varian</th></tr></thead>';
        } else {
            html += '<thead><tr><th>Min. Qty</th><th>Diskon per Unit</th></tr></thead>';
        }
        
        html += '<tbody>';
        promoTiers.forEach(tier => {
            if (groupPromo.tier_mode === "mix") {
                html += `<tr>
                    <td><strong>${tier.min_qty}</strong></td>
                    <td style="color: var(--success-color, #28a745); font-weight: bold;">${formatCurrency(tier.discount_per_unit)}</td>
                    <td>${tier.variant_count || '-'}</td>
                </tr>`;
            } else {
                html += `<tr>
                    <td><strong>${tier.min_qty}</strong></td>
                    <td style="color: var(--success-color, #28a745); font-weight: bold;">${formatCurrency(tier.discount_per_unit)}</td>
                </tr>`;
            }
        });
        html += '</tbody></table>';
    } else {
        html += '<p style="color: #888; margin-top: 15px;">Tidak ada tier yang tersedia untuk promo ini.</p>';
    }
    
    promoModalTitle.textContent = `Info Promo - Group ${groupCode}`;
    promoModalDetails.innerHTML = html;
    promoModal.style.display = 'block';
};

/**
 * Show bundle promo modal
 * @param {string} promoId - Bundle promo ID
 */
window.showBundlePromoModal = function(promoId) {
    const promoModal = document.getElementById('promo-info-modal');
    const promoModalTitle = document.getElementById('promo-modal-title');
    const promoModalDetails = document.getElementById('promo-modal-details');
    
    if (!promoModal || !promoModalTitle || !promoModalDetails) {
        console.error('Promo modal elements not found');
        return;
    }
    
    // Find bundle promo
    const bundlePromo = bundlePromosList.find(promo => promo.promo_id === promoId);
    
    if (!bundlePromo) {
        promoModalTitle.textContent = `Info Promo - Paket ${promoId}`;
        promoModalDetails.innerHTML = '<p>Tidak ada promo yang tersedia untuk paket ini.</p>';
        promoModal.style.display = 'block';
        return;
    }
    
    // Get bucket IDs for this promo
    const bucketIds = bundlePromoGroupsList
        .filter(g => g.promo_id === promoId)
        .map(g => g.bucket_id)
        .sort();
    
    const formatCurrency = (amount) => {
        const roundedAmount = Math.round(amount || 0);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(roundedAmount);
    };
    
    let html = `
        <div style="margin-bottom: 15px;">
            <h4 style="color: #1e3a8a; margin-bottom: 10px;">Paket ${bundlePromo.promo_id || 'N/A'}</h4>
            <p style="color: #666; margin-bottom: 10px;">${bundlePromo.description || '-'}</p>
            <div style="font-size: 0.9em; color: #888; margin-bottom: 10px;">
                <strong>Bucket:</strong> ${bucketIds.join(', ') || '-'}
            </div>
            <div style="font-size: 0.9em; color: #888;">
                <strong>Diskon per paket:</strong> <span style="color: var(--success-color, #28a745); font-weight: bold;">${formatCurrency(bundlePromo.discount_per_package || 0)}</span>
                ${bundlePromo.max_packages ? ` | <strong>Max paket:</strong> ${bundlePromo.max_packages}` : ''}
            </div>
        </div>
    `;
    
    // Get products in buckets (optional: show which products are in each bucket)
    if (bucketIds.length > 0 && promoStructureMap.has(promoId)) {
        const promoData = promoStructureMap.get(promoId);
        const buckets = promoData.buckets;
        
        html += '<div style="margin-top: 20px;">';
        html += '<h5 style="color: #1e3a8a; margin-bottom: 10px;">Produk dalam Paket:</h5>';
        
        bucketIds.forEach(bucketId => {
            const productIds = buckets.get(bucketId) || [];
            if (productIds.length > 0) {
                html += `<div style="margin-bottom: 10px;">`;
                html += `<strong>Bucket ${bucketId}:</strong> `;
                html += `<span style="font-size: 0.9em; color: #666;">${productIds.join(', ')}</span>`;
                html += `</div>`;
            }
        });
        
        html += '</div>';
    }
    
    promoModalTitle.textContent = `Info Promo - Paket ${promoId}`;
    promoModalDetails.innerHTML = html;
    promoModal.style.display = 'block';
};