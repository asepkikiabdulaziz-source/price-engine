// Main Application Logic
import { initAuth, login, logout, getCurrentUser } from './auth.js';
import { initDB, addPrice, getAllPrices, updatePrice, deletePrice } from './db.js';
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
    batchGetProductPrincipals,
    loadLoyaltyClasses,
    loadLoyaltyAvailability,
    isLoyaltyClassAvailable,
    resolveLoyaltyRule
} from './database.js';
import { calculateTotal } from './calculation.js';

// Development mode - set to false when Supabase is configured
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
        await initDB();
        
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
            
            // TODO: Add to cart implementation
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
        if (product && product.principal_id === 'KSNI') {
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
        await loadProductsData();
        
        // Load and display promos
        await loadPromosData();
        
        // Populate loyalty dropdown (setelah data di-load)
        await populateLoyaltyClassDropdown();
        
        // Setup add to cart handlers
        setupAddToCart();
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
        
        // Load products
        const products = await loadProducts();
        console.log(`📦 Loaded ${products?.length || 0} products`);
        if (!products || products.length === 0) {
            console.warn('No products found');
            document.getElementById('product-groups').innerHTML = '<p>Tidak ada produk ditemukan. Silakan import data CSV terlebih dahulu.</p>';
            return;
        }
        
        // Build product data map for cart display
        productDataMap.clear();
        products.forEach(product => {
            productDataMap.set(product.code, product);
        });
        
        // Load product groups
        const productGroups = await loadProductGroups();
        console.log(`📂 Loaded ${productGroups?.length || 0} product groups`);
        
        // Load product group availability rules
        productGroupAvailabilityRules = await loadProductGroupAvailability();
        console.log(`📋 Loaded ${productGroupAvailabilityRules?.length || 0} availability rules`);
        
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
            console.log('Availability rules:', productGroupAvailabilityRules);
        }
        
        // Load product group members
        const groupMembers = await loadProductGroupMembers();
        console.log(`📋 Loaded ${groupMembers?.length || 0} product group members`);
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
            console.log('🔍 Sample group members (first 3):', groupMembers.slice(0, 3).map(m => ({
                product_id: m.product_id,
                product_group_id: m.product_group_id,
                product_group_id_type: typeof m.product_group_id
            })));
        }
        if (availableGroups && availableGroups.length > 0) {
            console.log('🔍 Sample available groups (first 3):', availableGroups.slice(0, 3).map(g => ({
                id: g.id,
                code: g.code,
                name: g.name,
                id_type: typeof g.id
            })));
        }
        
        groupMembers.forEach(member => {
            const product = products.find(p => p.code === member.product_id);
            if (product) {
                // Only add to groups that are available (in availableGroups)
                // Note: member.product_group_id is now TEXT (code), not UUID
                const group = availableGroups.find(g => g.code === member.product_group_id);
                
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
                                product_id: member.product_id,
                                product_group_id: member.product_group_id,
                                product_group_id_type: typeof member.product_group_id,
                                available_group_ids: availableGroups.slice(0, 3).map(g => ({ id: g.id, code: g.code }))
                            });
                        }
                    }
                }
            } else {
                unmatchedProductsCount++;
                // Only log first few to avoid spam
                if (unmatchedProductsCount <= 5) {
                    console.log(`⚠️ Product not found: ${member.product_id} (type: ${typeof member.product_id})`);
                    console.log(`   Available product codes (first 5):`, products.slice(0, 5).map(p => ({ code: p.code, type: typeof p.code })));
                }
            }
        });
        
        console.log(`📊 Group mapping results:`, {
            matchedProducts: matchedProductsCount,
            unmatchedProducts: unmatchedProductsCount,
            unmatchedGroups: unmatchedGroupsCount,
            groupMapSizes: Array.from(groupMap.entries()).map(([code, products]) => ({ code, count: products.length }))
        });
        
        // Load promo availability rules
        promoAvailabilityRules = await loadPromoAvailability();
        console.log(`📋 Loaded ${promoAvailabilityRules?.length || 0} promo availability rules`);
        
        // Get selected store type
        const storeTypeEl = document.getElementById('store-type');
        const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir'; // default grosir
        console.log(`🏪 Selected store type: ${selectedStoreType}`);
        
        // Load bundle promos (for product display - already loaded above in promoAvailabilityRules context)
        bundlePromosList = await loadBundlePromos();
        console.log(`🎁 Loaded ${bundlePromosList?.length || 0} bundle promos`);
        
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
        
        // Load bundle promo groups for all available promos
        const allPromoGroups = await loadAllBundlePromoGroups();
        bundlePromoGroupsList = allPromoGroups; // Store for calculation
        console.log(`📦 Loaded ${allPromoGroups?.length || 0} bundle promo groups`);
        
        // Load bucket members
        const bucketMembers = await loadBucketMembers();
        console.log(`🪣 Loaded ${bucketMembers?.length || 0} bucket members`);
        
        // Build promo structure: promo_id -> bucket_id -> product_ids
        promoStructureMap.clear();
        productToPromoBucketMap.clear();
        productBucketMap.clear();
        
        availablePromos.forEach(promo => {
            const promoGroups = allPromoGroups.filter(pg => pg.promo_id === promo.promo_id);
            const bucketsMap = new Map(); // bucket_id -> product_ids[]
            
            promoGroups.forEach(pg => {
                const bucketId = pg.bucket_id;
                // Get products for this bucket from bucket_members
                const productsInBucket = bucketMembers
                    .filter(bm => bm.bucket_id === bucketId)
                    .map(bm => bm.product_id);
                
                bucketsMap.set(bucketId, productsInBucket);
                
                // Store mapping: product -> { promo_id, bucket_id }
                productsInBucket.forEach(productId => {
                    productToPromoBucketMap.set(productId, {
                        promo_id: promo.promo_id,
                        bucket_id: bucketId
                    });
                    productBucketMap.set(productId, bucketId);
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
        const prices = await loadPrices(selectedZone);
        const priceMap = new Map();
        prices.forEach(price => {
            priceMap.set(price.product_id, price.base_price);
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
        
        // Load principal discount tiers
        principalDiscountTiers = await loadPrincipalDiscountTiers();
        console.log(`💰 Loaded ${principalDiscountTiers?.length || 0} principal discount tiers`);
        
        // Load group promos
        groupPromos = await loadGroupPromos();
        console.log(`🎁 Loaded ${groupPromos?.length || 0} group promos`);
        
        // Load group promo tiers
        groupPromoTiers = await loadGroupPromoTiers();
        console.log(`📊 Loaded ${groupPromoTiers?.length || 0} group promo tiers`);
        
        // Load invoice discounts
        invoiceDiscounts = await loadInvoiceDiscounts();
        console.log(`🧾 Loaded ${invoiceDiscounts?.length || 0} invoice discounts`);
        
        // Load free product promos
        freeProductPromos = await loadFreeProductPromos();
        console.log(`🎁 Loaded ${freeProductPromos?.length || 0} free product promos`);
        
        // Load loyalty data
        loyaltyClasses = await loadLoyaltyClasses();
        loyaltyAvailabilityRules = await loadLoyaltyAvailability();
        console.log(`🎯 Loaded ${loyaltyClasses?.length || 0} loyalty classes and ${loyaltyAvailabilityRules?.length || 0} availability rules`);
        
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
            // Invoice discounts don't have promo_availability, they apply to all
            availablePromos.invoice.push({
                promo_id: promo.promo_id,
                description: promo.description,
                min_purchase_amount: promo.min_purchase_amount,
                payment_method: promo.payment_method,
                discount_percentage: promo.discount_percentage,
                type: 'invoice'
            });
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
    
    // 1. Principal Discount Promos with tiers (Format seperti kalkulator)
    if (promos.principal.length > 0) {
        html += '<div class="promo-section-type">';
        html += '<h3>💰 Promo Reguler</h3>';
        
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
        html += '</div></div>';
    }
    
    // 3. Bundle Promos
    if (promos.bundling.length > 0) {
        html += '<div class="promo-section-type">';
        html += '<h3>🎁 Promo Bundling</h3>';
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
        html += '</div></div>';
    }
    
    // 4. Invoice Discounts
    if (promos.invoice.length > 0) {
        html += '<div class="promo-section-type">';
        html += '<h3>🧾 Diskon Invoice</h3>';
        html += '<div class="promo-list">';
        promos.invoice.forEach(promo => {
            html += `<div class="promo-item">
                <div class="promo-id"><strong>${promo.promo_id}</strong></div>
                <div class="promo-description">${promo.description || '-'}</div>
                <div class="promo-detail">Min. belanja: ${formatCurrency(promo.min_purchase_amount)} | Metode: ${promo.payment_method} | Diskon: ${promo.discount_percentage}%</div>
            </div>`;
        });
        html += '</div></div>';
    }
    
    // 5. Free Product Promos
    if (promos.free_product.length > 0) {
        html += '<div class="promo-section-type">';
        html += '<h3>🎁 Promo Gratis Produk</h3>';
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
        html += '</div></div>';
    }
    
    // 6. Loyalty Rules (hanya untuk Grosir)
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
        groups: productGroups.map(g => ({ id: g.id, code: g.code, name: g.name })),
        groupMapDetails: Array.from(groupMap.entries()).map(([code, products]) => ({
            code,
            productCount: products.length
        }))
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
                <div class="accordion-item">
                    <button class="accordion-header" onclick="toggleAccordion('${promoAccordionId}')">
                        <span class="accordion-title">${shortDescription}</span>
                        <span class="accordion-icon" id="icon-${promoAccordionId}">▼</span>
                    </button>
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
                    <div class="accordion-item" style="margin-left: 0; margin-top: 0; border-left: none;">
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
            <div class="accordion-item">
                <button class="accordion-header" onclick="toggleAccordion('${accordionId}')">
                    <span class="accordion-title">${group.name}${group.name !== group.code ? ` (${group.code})` : ''}</span>
                    <span class="accordion-icon" id="icon-${accordionId}">▼</span>
                </button>
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
    
    // TODO: Update product card summaries (harga promo, dll) jika diperlukan
    // updateAllProductCardSummaries(summary);
    
    // TODO: Save cart to localStorage jika diperlukan
    // saveCartToLocalStorage();
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
        return;
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
                priceMap.set(price.product_id, price.base_price);
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
    }
    
    // Update bundle promo discount
    const bundleDiscountEl = document.getElementById('bundle-discount');
    if (bundleDiscountEl) {
        bundleDiscountEl.textContent = `- ${formatCurrency(result.bundlePromoDiscount || 0)}`;
    }
    
    // Update free product discount
    const freeProductDiscountEl = document.getElementById('free-product-discount');
    if (freeProductDiscountEl) {
        freeProductDiscountEl.textContent = `- ${formatCurrency(result.freeProductPromo || result.freeProductDiscount || 0)}`;
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
    
    // Reset calculation display
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

    // Calculate total after all discounts (excluding invoice) for invoice proportion
    // Pastikan tidak negatif - jika semua promo tidak berlaku, ini = basePrice - principalDiscount
    const totalAfterOtherDiscountsGlobal = Math.max(0, result.basePrice - (result.principalDiscount || 0) - (result.groupPromoDiscount || 0) - (result.bundlePromoDiscount || 0));

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

        // 2. Bundle Promo Discount for this item (proportional per promo)
        // Item bisa masuk ke multiple bundle promos, jadi kita perlu hitung proporsi per promo
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
                
                // Calculate proportion for this promo
                // Get all items that are in this promo
                let totalSubtotalInThisPromo = 0;
                result.items.forEach(it => {
                    // Check if it.productId is in this promo
                    let itIsInPromo = false;
                    promoData.buckets.forEach((productsInBucket) => {
                        if (productsInBucket.includes(it.productId)) {
                            itIsInPromo = true;
                        }
                    });
                    
                    if (itIsInPromo) {
                        totalSubtotalInThisPromo += it.subtotalAfterDiscount;
                    }
                });
                
                // Calculate proportion and discount for this promo
                if (totalSubtotalInThisPromo > 0 && item.subtotalAfterDiscount > 0) {
                    const proportion = item.subtotalAfterDiscount / totalSubtotalInThisPromo;
                    const itemDiscountForThisPromo = promoDiscount * proportion;
                    item.itemBundlePromoDiscount += itemDiscountForThisPromo;
                    item.bundlePromoDiscountByPromo[promoId] = itemDiscountForThisPromo;
                }
            });
        }

        // Subtotal after Principal, Group, and Bundle discounts
        // Jika promo tidak berlaku, itemGroupPromoDiscount dan itemBundlePromoDiscount akan 0
        // sehingga subtotalAfterAllDiscounts = subtotalAfterDiscount (base price setelah principal)
        const subtotalAfterAllDiscounts = item.subtotalAfterDiscount - (item.itemGroupPromoDiscount || 0) - (item.itemBundlePromoDiscount || 0);

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
        // Logika: basePrice (subtotal) - principalDiscount - strataDiscount - bundleDiscount - invoiceDiscount
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
    let discInvoicePerKrt = 0;
    let hargaNettPerKrt = 0;
    let calcItem = null;
    
    if (window.lastCalculationResult && window.lastCalculationResult.items) {
        calcItem = window.lastCalculationResult.items.find(it => it.productId === productId);
        if (calcItem && calcItem.finalNett !== undefined) {
            // Use pre-calculated values untuk konsistensi dengan cart
            const itemGroupPromoDiscount = calcItem.itemGroupPromoDiscount || 0;
            const itemBundlePromoDiscount = calcItem.itemBundlePromoDiscount || 0;
            const itemInvoiceDiscount = calcItem.itemInvoiceDiscount || 0;
            const finalNett = calcItem.finalNett || 0;
            
            // Calculate per-krt values
            hargaDasarKrt = basePrice;
            const principalDiscountAmount = calcItem.discountAmount || 0;
            discPrincipalPerKrt = qtyKrtTotal > 0 ? (principalDiscountAmount / qtyKrtTotal) : 0;
            discGroupPromoPerKrt = qtyKrtTotal > 0 ? (itemGroupPromoDiscount / qtyKrtTotal) : 0;
            discBundlePromoPerKrt = qtyKrtTotal > 0 ? (itemBundlePromoDiscount / qtyKrtTotal) : 0;
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