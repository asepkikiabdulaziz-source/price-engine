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
    clearMasterDataCache,
    clearCollectionCache,
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
import { logger } from './logger.js';

// SECURITY: DEV_MODE removed - Authentication is always required in production builds
// For local development, use a local Supabase instance or mock data setup
// DO NOT add DEV_MODE back - it's a security risk

/**
 * SECURITY: HTML escaping utility to prevent XSS attacks
 * Escapes special HTML characters in user-generated content
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text safe for HTML insertion
 */
function escapeHtml(text) {
    if (text == null) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * SECURITY: Safe HTML insertion using textContent for dynamic content
 * Use this instead of innerHTML when inserting user-generated or database content
 * @param {HTMLElement} element - Target element
 * @param {string} text - Text content (will be escaped)
 */
function setSafeText(element, text) {
    if (element) {
        element.textContent = text != null ? String(text) : '';
    }
}

// Initialize app
let currentUser = null;

/**
 * Check if device is online
 * @returns {boolean} - True if online, false if offline
 */
function isOnline() {
    if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
        return navigator.onLine;
    }
    // Fallback: assume online if navigator.onLine is not available
    return true;
}

/**
 * Check if session has expired (helper untuk offline fallback)
 * @param {Object} sessionData - Session data from localStorage
 * @returns {boolean} - True if session is expired
 */
function isSessionExpired(sessionData) {
    if (!sessionData || !sessionData._expiresAt) {
        // Old format without expiration - consider expired for security
        return true;
    }
    return Date.now() > sessionData._expiresAt;
}

/**
 * Update offline indicator di header
 */
function updateOfflineIndicator() {
    const headerUserInfo = document.getElementById('header-user-info');
    const offlineIndicator = document.getElementById('offline-indicator');
    
    if (!isOnline()) {
        // Tampilkan indikator offline
        if (offlineIndicator) {
            offlineIndicator.style.display = 'inline-flex';
        } else if (headerUserInfo) {
            // Buat indikator jika belum ada
            const indicator = document.createElement('div');
            indicator.id = 'offline-indicator';
            indicator.className = 'offline-indicator';
            indicator.innerHTML = '<span class="offline-icon">📴</span> <span class="offline-text">Mode Offline</span>';
            headerUserInfo.insertBefore(indicator, headerUserInfo.firstChild);
        }
    } else {
        // Sembunyikan indikator offline
        if (offlineIndicator) {
            offlineIndicator.style.display = 'none';
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Init auth hanya jika online (untuk menghindari error saat offline)
        // Jika offline, skip initAuth dan langsung gunakan cached session
        if (isOnline()) {
            try {
                await initAuth();
            } catch (authInitError) {
                // Jika initAuth gagal tapi offline, tetap lanjut dengan cached session
                if (!isOnline()) {
                    logger.warn('Offline mode: Skipping Supabase init, using cached session');
                } else {
                    // Jika online tapi initAuth gagal, throw error
                    throw authInitError;
                }
            }
        } else {
            logger.log('Offline mode: Skipping Supabase init, using cached session');
        }
        
        // Check if user is already logged in (dari localStorage)
        // getCurrentUser() sudah memiliki fallback untuk offline mode
        // Jika offline, getCurrentUser() akan langsung return user dari localStorage tanpa validasi ke Supabase
        currentUser = await getCurrentUser();
        if (currentUser) {
            // Jika depo_name/region_name tidak ada, load lagi dari view_area (hanya jika online)
            if (currentUser.depo_id && (!currentUser.depo_name || !currentUser.region_name)) {
                if (isOnline()) {
                    logger.log('Reloading depo info for existing session...');
                    try {
                        const depoInfo = await getDepoInfoByDepoId(currentUser.depo_id);
                        if (depoInfo) {
                            currentUser.depo_name = depoInfo.depo_name;
                            currentUser.region_name = depoInfo.region_name;
                            currentUser.zona = depoInfo.zona;
                            // Update localStorage
                            localStorage.setItem('price_engine_user_session', JSON.stringify(currentUser));
                            logger.log('Depo info reloaded:', {
                                depo_name: currentUser.depo_name,
                                region_name: currentUser.region_name,
                                zona: currentUser.zona
                            });
                        }
                    } catch (error) {
                        logger.error('Error reloading depo info:', error);
                        // Jika error dan offline, gunakan data yang ada di localStorage
                        if (!isOnline()) {
                            logger.warn('Offline mode: Using cached depo info');
                        }
                    }
                } else {
                    logger.log('Offline mode: Using cached depo info without reloading');
                }
            }
            
            // Setup store type jika user sudah login
            if (currentUser.div_sls) {
                setupStoreTypeByDivSls(currentUser.div_sls);
            }
            showApp();
            
            // Update offline indicator setelah showApp()
            updateOfflineIndicator();
        } else {
            showLogin();
        }
        
        // Setup event listeners
        setupEventListeners();
        setupDetailHargaListeners();
        
        // Listen untuk perubahan status online/offline
        window.addEventListener('online', () => {
            logger.log('Device is now online');
            updateOfflineIndicator();
        });
        
        window.addEventListener('offline', () => {
            logger.log('Device is now offline');
            updateOfflineIndicator();
        });
    } catch (error) {
        logger.error('Error initializing app:', error);
        // Jika offline dan ada user di localStorage, tetap tampilkan app
        if (!isOnline()) {
            const sessionData = localStorage.getItem('price_engine_user_session');
            if (sessionData) {
                try {
                    const userData = JSON.parse(sessionData);
                    const { _expiresAt, _savedAt, ...user } = userData;
                    if (!isSessionExpired(userData)) {
                        currentUser = user;
                        showApp();
                        updateOfflineIndicator();
                        setupEventListeners();
                        setupDetailHargaListeners();
                        return;
                    }
                } catch (parseError) {
                    logger.error('Error parsing cached session:', parseError);
                }
            }
        }
        
        // SECURITY: No fallback to dev mode - authentication is required
        // Show error message to user instead
        const loginSection = document.getElementById('login-section');
        const loginError = document.getElementById('login-error');
        if (loginSection && loginError) {
            loginError.textContent = 'Gagal menginisialisasi aplikasi. Silakan refresh halaman atau hubungi administrator.';
            loginError.classList.add('show');
        }
    }
});

function setupEventListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        // Remove existing listener jika ada untuk prevent duplicate
        loginForm.removeEventListener('submit', handleLogin);
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Region dropdown change - load depos
    // Gunakan event delegation atau pastikan hanya attach sekali
    const regionSelect = document.getElementById('region');
    if (regionSelect) {
        // Remove existing listener jika ada untuk prevent duplicate
        regionSelect.removeEventListener('change', handleRegionChange);
        regionSelect.addEventListener('change', handleRegionChange);
        
        // Pastikan dropdown enabled dan bisa di-interact
        regionSelect.disabled = false;
        regionSelect.style.pointerEvents = 'auto';
        regionSelect.style.opacity = '1';
    }
    
    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Clear cache button
    const clearCacheBtn = document.getElementById('clear-cache-btn');
    if (clearCacheBtn) {
        clearCacheBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm('Yakin ingin membersihkan cache master data?\n\nData yang dihapus:\n- Product groups\n- Promo availability\n- Prices\n- Dll\n\nSession dan cart TIDAK akan dihapus.\n\nSetelah clear cache, halaman akan di-refresh.')) {
                await clearMasterDataCacheHandler();
                // Reload halaman setelah clear cache
                window.location.reload();
            }
        });
    }

    // Tab navigation
    setupTabNavigation();
    
    // Pastikan summary bar dan cart sidebar terlihat di tab Order (default)
    // Karena tab-simulasi adalah tab default yang aktif
    // Tapi kita akan set visibility berdasarkan tab aktif setelah setupTabNavigation
    // Jadi tidak perlu set di sini, biarkan setupTabNavigation yang handle
    
    // Summary bar toggle (mobile)
    const summaryBar = document.getElementById('summary-bar');
    const cartSidebar = document.getElementById('cart-sidebar');
    if (summaryBar) {
        // Ensure cart sidebar is closed by default (no cart-visible class)
        // cartSidebar sudah dideklarasikan di atas
        if (cartSidebar) {
            cartSidebar.classList.remove('cart-visible');
        }
        // Ensure arrow shows ▲ (closed state)
        const arrow = summaryBar.querySelector('.summary-bar-arrow');
        if (arrow) {
            arrow.textContent = '▲';
        }
        
        summaryBar.addEventListener('click', () => {
            // cartSidebar sudah dideklarasikan di atas
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
            // cartSidebar dan summaryBar sudah dideklarasikan di atas
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
            
            // Re-filter data dengan store type yang baru (tidak perlu reload dari server)
            // Data sudah lengkap di-cache tanpa filter store type, jadi cukup re-filter saja
            if (currentUser) {
                // Re-filter promos dengan store type yang baru (client-side filtering)
                // loadPromosData() akan menggunakan data yang sudah di-cache dan hanya re-filter
                // Tidak akan memanggil server jika data sudah ada di cache
                await loadPromosData();
                
                // Re-filter calculation data dengan store type yang baru
                // loadCalculationData() akan menggunakan promoAvailabilityRules yang sudah ada
                // dan hanya re-filter promo yang available berdasarkan store type baru
                // syncCollectionData() akan menggunakan cache jika versi sama, tidak akan error saat offline
                await loadCalculationData();
                
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
    
    // Function to update summary bar visibility based on active tab
    const updateSummaryBarVisibility = () => {
        const activeTab = document.querySelector('.nav-tab.active');
        const targetTabId = activeTab ? activeTab.getAttribute('data-tab') : 'tab-simulasi';
        
        const summaryBar = document.getElementById('summary-bar');
        const cartSidebar = document.getElementById('cart-sidebar');
        
        if (targetTabId === 'tab-simulasi') {
            // Tab Order: Tampilkan summary bar dan cart sidebar
            if (summaryBar) {
                summaryBar.style.display = 'block';
                summaryBar.style.visibility = 'visible';
                summaryBar.style.opacity = '1';
                summaryBar.classList.remove('hidden');
                summaryBar.classList.add('visible');
            }
            if (cartSidebar) {
                cartSidebar.style.display = 'block';
                cartSidebar.style.visibility = 'visible';
                cartSidebar.classList.remove('hidden');
            }
        } else {
            // Tab lain (Promosi, KPI): Sembunyikan summary bar dan cart sidebar
            if (summaryBar) {
                summaryBar.style.display = 'none';
                summaryBar.style.visibility = 'hidden';
                summaryBar.style.opacity = '0';
                summaryBar.classList.add('hidden');
                summaryBar.classList.remove('visible');
            }
            if (cartSidebar) {
                cartSidebar.style.display = 'none';
                cartSidebar.style.visibility = 'hidden';
                cartSidebar.classList.add('hidden');
                // Pastikan cart sidebar ditutup saat pindah tab
                cartSidebar.classList.remove('cart-visible');
            }
        }
    };
    
    // Set initial visibility based on default active tab
    updateSummaryBarVisibility();
    
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
            
            // Update summary bar visibility
            updateSummaryBarVisibility();
            
            // Load promos data when promosi tab is clicked
            // Use setTimeout to ensure DOM is updated before accessing container
            if (targetTabId === 'tab-promosi') {
                setTimeout(() => {
                    loadPromosData().catch(err => {
                        logger.error('Error loading promos data on tab click:', err);
                        const container = document.querySelector('#tab-promosi .promo-table-container');
                        if (container) {
                            container.innerHTML = '<p style="color: red;">Gagal memuat data promosi. Silakan refresh halaman.</p>';
                        }
                    });
                }, 100);
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
            logger.log('Add to cart:', {
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
        logger.log('Loading regions for login form...');
        
        // Add timeout untuk mencegah hang
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Timeout loading regions')), 10000)
        );
        
        const regionsPromise = loadRegions();
        const regions = await Promise.race([regionsPromise, timeoutPromise]);
        
        logger.log(`Loaded ${regions?.length || 0} regions:`, regions);
        
        const regionSelect = document.getElementById('region');
        
        if (!regionSelect) {
            logger.error('Region select element not found!');
            return;
        }
        
        // Clear existing options (except first option)
        // Gunakan removeChild untuk preserve event listeners (lebih aman dari innerHTML)
        while (regionSelect.firstChild) {
            regionSelect.removeChild(regionSelect.firstChild);
        }
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Pilih Region';
        regionSelect.appendChild(defaultOption);
        
        // Ensure region select is enabled dan bisa di-interact (important for mobile after refresh)
        regionSelect.disabled = false;
        regionSelect.style.pointerEvents = 'auto';
        regionSelect.style.opacity = '1';
        regionSelect.removeAttribute('readonly');
        regionSelect.removeAttribute('tabindex');
        
        if (!regions || regions.length === 0) {
            logger.warn('No regions found!');
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
        
        // Ensure region select is enabled after populating (extra safety for mobile)
        regionSelect.disabled = false;
        regionSelect.style.pointerEvents = 'auto';
        regionSelect.style.opacity = '1';
        regionSelect.removeAttribute('readonly');
        regionSelect.removeAttribute('tabindex');
        
        logger.log(`Successfully populated ${regions.length} regions in dropdown`);
    } catch (error) {
        logger.error('Error loading regions:', error);
        const regionSelect = document.getElementById('region');
        if (regionSelect) {
            // Clear dan set error message
            while (regionSelect.firstChild) {
                regionSelect.removeChild(regionSelect.firstChild);
            }
            const errorOption = document.createElement('option');
            errorOption.value = '';
            errorOption.textContent = 'Error loading regions - Silakan refresh';
            regionSelect.appendChild(errorOption);
            
            // Ensure it's still enabled even on error (so user can try again)
            regionSelect.disabled = false;
            regionSelect.style.pointerEvents = 'auto';
            regionSelect.style.opacity = '1';
            regionSelect.removeAttribute('readonly');
            regionSelect.removeAttribute('tabindex');
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
        logger.error('Error loading depos:', error);
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
                        logger.log('Depo info loaded:', {
                            depo_id: user.depo_id,
                            depo_name: depoInfo.depo_name,
                            region_name: depoInfo.region_name,
                            zona: depoInfo.zona
                        });
                    } else {
                        logger.warn('No depo info found for depo_id:', user.depo_id);
                    }
                } catch (error) {
                    logger.error('Error loading depo info:', error);
                }
            } else {
                logger.warn('No depo_id in user object:', user);
            }
            
            // Simpan session ke localStorage SETELAH depo info diambil (gunakan key spesifik untuk aplikasi ini)
            logger.log('Saving user to localStorage:', {
                depo_id: user.depo_id,
                depo_name: user.depo_name,
                region_name: user.region_name,
                zona: user.zona
            });
            
            // Cek apakah user berbeda dari user sebelumnya (jika ada)
            const previousUserStr = localStorage.getItem('price_engine_user_session');
            let previousUser = null;
            if (previousUserStr) {
                try {
                    previousUser = JSON.parse(previousUserStr);
                } catch (e) {
                    logger.warn('Error parsing previous user session:', e);
                }
            }
            
            // Jika user berbeda, clear cart untuk mencegah data leakage antar user
            if (previousUser && (previousUser.depo_id !== user.depo_id || previousUser.kode_sales !== user.kode_sales)) {
                logger.log('Different user detected, clearing previous cart...', {
                    previous: { depo_id: previousUser.depo_id, kode_sales: previousUser.kode_sales },
                    current: { depo_id: user.depo_id, kode_sales: user.kode_sales }
                });
                // Clear cart di memory
                if (typeof cart !== 'undefined' && cart) {
                    cart.clear();
                }
                // Clear cart storage untuk user sebelumnya
                if (previousUser.depo_id && previousUser.kode_sales) {
                    const previousCartKey = getCartStorageKeyForUser(previousUser.depo_id, previousUser.kode_sales);
                    localStorage.removeItem(previousCartKey);
                }
            }
            
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

/**
 * Clear all user-specific data, but keep master data and static assets for offline-first
 * Dipanggil saat logout untuk memastikan data user tidak terlihat, tapi tetap support offline
 */
/**
 * Clear master data cache (product groups, promos, availability rules, etc.)
 * Bisa dipanggil dari console: window.clearMasterDataCache()
 * atau dari UI dengan tombol
 */
async function clearMasterDataCacheHandler() {
    try {
        const result = clearMasterDataCache();
        if (result.success) {
            logger.log(`✅ Cache cleared successfully. ${result.clearedCount} entries removed.`);
            alert(`Cache berhasil dibersihkan!\n${result.clearedCount} entri dihapus.\n\nSilakan refresh halaman untuk memuat ulang data dari server.`);
            // Opsional: auto-reload setelah clear cache
            // window.location.reload();
        } else {
            logger.error('Failed to clear cache:', result.error);
            alert('Gagal membersihkan cache: ' + result.error);
        }
        return result;
    } catch (error) {
        logger.error('Error clearing master data cache:', error);
        alert('Error: ' + error.message);
        return { success: false, error: error.message };
    }
}

// Export fungsi ke window untuk bisa dipanggil dari console
if (typeof window !== 'undefined') {
    window.clearMasterDataCache = clearMasterDataCacheHandler;
    window.clearCollectionCache = clearCollectionCache;
}

async function clearAllApplicationData() {
    try {
        logger.log('Clearing user-specific data (keeping master data for offline-first)...');
        
        // 1. Clear cart di memory
        if (typeof cart !== 'undefined' && cart) {
            cart.clear();
        }
        
        // 2. Clear hanya user-specific localStorage (BUKAN master data)
        const localStorageKeysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key) {
                // Hapus hanya user-specific data:
                // - User session
                // - Cart per user
                // - Cache user-specific lainnya
                if (
                    key === 'price_engine_user_session' ||
                    key.startsWith('price_engine_cart_v1_') ||
                    (key.startsWith('price_engine_') && !key.startsWith('price_engine_master_'))
                ) {
                    localStorageKeysToRemove.push(key);
                }
                // PERTAHANKAN:
                // - price_engine_master_* (master data untuk offline)
                // - version_* (version info untuk master data)
            }
        }
        localStorageKeysToRemove.forEach(key => {
            localStorage.removeItem(key);
            logger.log(`Removed user-specific localStorage key: ${key}`);
        });
        
        // 4. Clear sessionStorage (user-specific)
        try {
            sessionStorage.clear();
            logger.log('Cleared sessionStorage');
        } catch (e) {
            logger.warn('Error clearing sessionStorage:', e);
        }
        
        // 5. PERTAHANKAN Service Worker cache (untuk offline-first)
        // Service Worker cache berisi static assets (HTML, CSS, JS) yang tidak user-specific
        // Tidak perlu dihapus karena sama untuk semua user
        logger.log('Keeping Service Worker cache for offline-first functionality');
        
        // 6. PERTAHANKAN Service Worker registration (untuk offline-first)
        logger.log('Keeping Service Worker registration for offline-first functionality');
        
        // 7. Clear IndexedDB hanya jika berisi user-specific data
        // Jika IndexedDB hanya berisi master data, bisa dipertahankan
        if ('indexedDB' in window) {
            try {
                const databases = await indexedDB.databases();
                // Hanya hapus jika ada database yang jelas user-specific
                // Untuk saat ini, kita skip karena tidak ada user-specific IndexedDB
                logger.log(`Found ${databases.length} IndexedDB database(s) - keeping for offline-first`);
            } catch (e) {
                logger.warn('Error checking IndexedDB:', e);
            }
        }
        
        logger.log('User-specific data cleared, master data retained for offline-first');
    } catch (error) {
        logger.error('Error clearing application data:', error);
        // Continue dengan logout meskipun ada error
    }
}

async function handleLogout() {
    try {
        await logout();
        
        // Clear semua data aplikasi, cache, dan storage
        await clearAllApplicationData();
        
        currentUser = null;
        
        // Force reload page dengan cache bypass untuk memastikan semua state reset dengan benar
        // Ini lebih reliable daripada reset manual, terutama di mobile
        // Gunakan location.replace untuk mencegah back button kembali ke halaman sebelumnya
        window.location.replace(window.location.origin + window.location.pathname);
    } catch (error) {
        logger.error('Logout error:', error);
        // Even if logout fails, try to clear data and reload
        try {
            await clearAllApplicationData();
        } catch (clearError) {
            logger.error('Error clearing data during logout:', clearError);
        }
        window.location.replace(window.location.origin + window.location.pathname);
    }
}

function showLogin() {
    document.getElementById('login-section').style.display = 'flex';
    document.getElementById('app-section').style.display = 'none';
    
    // Reset form login dengan benar
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.reset();
    }
    
    // Reset region dropdown - pastikan enabled dan kosong
    const regionSelect = document.getElementById('region');
    if (regionSelect) {
        regionSelect.disabled = false;
        regionSelect.style.pointerEvents = 'auto';
        regionSelect.style.opacity = '1';
        regionSelect.removeAttribute('readonly');
        regionSelect.removeAttribute('tabindex');
        regionSelect.value = '';
        
        // Clear options dengan cara yang aman (preserve event listeners)
        while (regionSelect.firstChild) {
            regionSelect.removeChild(regionSelect.firstChild);
        }
        const defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Pilih Region';
        regionSelect.appendChild(defaultOption);
    }
    
    // Reset depo dropdown - disabled dan kosong
    const depoSelect = document.getElementById('depo');
    if (depoSelect) {
        depoSelect.disabled = true;
        depoSelect.value = '';
        depoSelect.innerHTML = '<option value="">Pilih Depo</option>';
    }
    
    // Clear error message
    const loginError = document.getElementById('login-error');
    if (loginError) {
        loginError.textContent = '';
        loginError.classList.remove('show');
    }
    
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
        // Tampilkan header controls (store type & loyalty)
        const headerControls = document.getElementById('header-controls');
        if (headerControls) {
            headerControls.style.display = 'block';
        }
    }
    
    // Welcome message akan ditampilkan setelah data ter-sync di loadAppContent()
    // untuk memastikan versi yang ditampilkan sudah akurat
    
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
 * Show welcome message dengan informasi versi tabel dan status sync
 */
async function showWelcomeMessage() {
    const welcomeMessage = document.getElementById('welcome-message');
    const welcomeBody = document.getElementById('welcome-message-body');
    
    if (!welcomeMessage || !welcomeBody) {
        logger.warn('Welcome message elements not found');
        return;
    }
    
    try {
        // Get master version dari database
        const serverVersions = await getMasterVersion();
        
        // Get local versions dari localStorage
        // Key harus sesuai dengan versionKey yang digunakan di syncCollectionData()
        const localVersions = {};
        const versionKeys = [
            { key: 'master_products', displayName: 'Products' },
            { key: 'prices', displayName: 'Prices' },
            { key: 'product_groups', displayName: 'Product Groups' },
            { key: 'product_group_availability', displayName: 'Product Group Availability' },
            { key: 'product_group_members', displayName: 'Product Group Members' },
            { key: 'promo_availability', displayName: 'Promo Availability' },
            { key: 'principal_discount_tiers', displayName: 'Principal Discount Tiers' },
            { key: 'group_promos', displayName: 'Group Promos' },
            { key: 'group_promo_tiers', displayName: 'Group Promo Tiers' },
            { key: 'bundle_promos', displayName: 'Bundle Promos' },
            { key: 'bundle_promo_groups', displayName: 'Bundle Promo Groups' },
            { key: 'invoice_discounts', displayName: 'Invoice Discounts' },
            { key: 'free_product_promos', displayName: 'Free Product Promos' },
            { key: 'store_loyalty_classes', displayName: 'Loyalty Classes' },
            { key: 'store_loyalty_availability', displayName: 'Loyalty Availability' }
        ];
        
        versionKeys.forEach(({ key, displayName }) => {
            const localVersion = parseInt(localStorage.getItem(`version_${key}`)) || 0;
            const serverVersion = serverVersions[key] || 0;
            const isSyncing = localStorage.getItem(`syncing_${key}`) === 'true';
            localVersions[key] = {
                local: localVersion,
                server: serverVersion,
                synced: localVersion === serverVersion && localVersion > 0,
                needsUpdate: localVersion > 0 && localVersion !== serverVersion,
                displayName: displayName,
                isSyncing: isSyncing
            };
        });
        
        // Build HTML untuk versi info
        let html = '<div class="version-info-container">';
        html += '<div class="version-info-header">📊 Versi Tabel Master Data</div>';
        html += '<div class="version-info-list">';
        
        // Group by status
        const synced = [];
        const needsUpdate = [];
        const notCached = [];
        
        versionKeys.forEach(({ key, displayName }) => {
            const info = localVersions[key];
            
            if (info.isSyncing) {
                // Tampilkan sebagai syncing dengan progress indicator
                needsUpdate.push({ 
                    name: displayName, 
                    local: info.local, 
                    server: info.server,
                    isSyncing: true 
                });
            } else if (info.synced) {
                synced.push({ 
                    name: displayName, 
                    version: info.local,
                    server: info.server 
                });
            } else if (info.needsUpdate) {
                needsUpdate.push({ 
                    name: displayName, 
                    local: info.local, 
                    server: info.server,
                    isSyncing: false 
                });
            } else {
                notCached.push({ 
                    name: displayName, 
                    version: info.server,
                    local: 0 
                });
            }
        });
        
        // Tampilkan yang sedang sync dengan progress indicator
        const syncingItems = needsUpdate.filter(item => item.isSyncing);
        if (syncingItems.length > 0) {
            html += '<div class="version-status-group syncing">';
            html += '<div class="version-status-title">⏳ Sedang Download:</div>';
            syncingItems.forEach(item => {
                html += `<div class="version-item syncing">
                    <span class="version-name">${escapeHtml(item.name)}</span>
                    <span class="version-badge syncing">
                        <span class="spinner"></span> v${item.local || 0} → v${item.server}
                    </span>
                </div>`;
            });
            html += '</div>';
        }
        
        // Tampilkan yang perlu update (tidak sedang sync)
        const updateItems = needsUpdate.filter(item => !item.isSyncing);
        if (updateItems.length > 0) {
            html += '<div class="version-status-group needs-update">';
            html += '<div class="version-status-title">🔄 Perlu Update:</div>';
            updateItems.forEach(item => {
                html += `<div class="version-item">
                    <span class="version-name">${escapeHtml(item.name)}</span>
                    <span class="version-badge update">v${item.local} → v${item.server}</span>
                </div>`;
            });
            html += '</div>';
        }
        
        // Tampilkan yang sudah sync dengan perbandingan versi
        if (synced.length > 0) {
            html += '<div class="version-status-group synced">';
            html += '<div class="version-status-title">✅ Tersinkronisasi:</div>';
            synced.forEach(item => {
                const versionText = item.server === item.version 
                    ? `v${item.version}` 
                    : `v${item.version} (DB: v${item.server})`;
                html += `<div class="version-item">
                    <span class="version-name">${escapeHtml(item.name)}</span>
                    <span class="version-badge synced">${versionText}</span>
                </div>`;
            });
            html += '</div>';
        }
        
        // Tampilkan yang belum di-cache dengan versi DB
        if (notCached.length > 0) {
            html += '<div class="version-status-group not-cached">';
            html += '<div class="version-status-title">📥 Belum Di-cache:</div>';
            notCached.forEach(item => {
                html += `<div class="version-item">
                    <span class="version-name">${escapeHtml(item.name)}</span>
                    <span class="version-badge not-cached">Lokal: v${item.local || 0} | DB: v${item.version}</span>
                </div>`;
            });
            html += '</div>';
        }
        
        html += '</div></div>';
        
        welcomeBody.innerHTML = html;
        // Show modal (menggunakan style modal standar)
        welcomeMessage.style.display = 'block';
        
        // Setup close button (X di pojok kanan atas)
        const closeBtn = document.getElementById('close-welcome-btn');
        if (closeBtn) {
            closeBtn.onclick = () => {
                welcomeMessage.style.display = 'none';
            };
        }
        
        // Setup close button (tombol Tutup di bawah)
        const welcomeCloseBtn = document.getElementById('welcome-close-btn');
        if (welcomeCloseBtn) {
            welcomeCloseBtn.onclick = () => {
                welcomeMessage.style.display = 'none';
            };
        }
        
        // Close modal when clicking outside
        welcomeMessage.onclick = (e) => {
            if (e.target === welcomeMessage) {
                welcomeMessage.style.display = 'none';
            }
        };
        
    } catch (error) {
        logger.error('Error showing welcome message:', error);
        welcomeBody.innerHTML = '<div class="version-info-error">⚠️ Gagal memuat informasi versi. Data akan di-load saat diperlukan.</div>';
        welcomeMessage.style.display = 'block';
    }
}

/**
 * Setup store type options berdasarkan div_sls
 * - AEPDA: hanya GROSIR (disable Retail option)
 * - Selain AEPDA: bisa GROSIR atau RETAIL
 */
function setupStoreTypeByDivSls(divSls) {
    const storeTypeSelect = document.getElementById('store-type');
    
    if (!storeTypeSelect) {
        logger.warn('Store type select not found');
        return;
    }
    
    // Get Retail option
    const retailOption = storeTypeSelect.querySelector('option[value="retail"]');
    
    if (!retailOption) {
        logger.warn('Retail option not found');
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
        logger.log('Store type: GROSIR only (AEPDA)');
    } else {
        // Bisa GROSIR atau RETAIL - enable semua
        // Retail option sudah di-enable di atas
        logger.log(`Store type: GROSIR or RETAIL available (${divSls || 'default'})`);
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
        logger.warn('Loyalty class dropdown not found');
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
        logger.log(`Populated ${availableClasses.length} loyalty classes`);
        
    } catch (error) {
        logger.error('Error populating loyalty class dropdown:', error);
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
    logger.log('Loading app content from database...');
    logger.log('Current user:', {
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
        
        // Update welcome message setelah data ter-sync untuk menampilkan versi yang benar
        showWelcomeMessage();
    } catch (error) {
        logger.error('Error loading app content:', error);
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
            logger.warn('No zone found for current user');
            document.getElementById('product-groups').innerHTML = '<p>Tidak ada zona ditemukan untuk user. Silakan hubungi administrator.</p>';
            return;
        }
        
        logger.log('Using zone from user:', selectedZone);
        
        // Load products dengan version checking
        const productsResult = await syncCollectionData('master_products', 'master_products', loadProducts);
        const products = productsResult.data || [];
        logger.log(`Loaded ${products?.length || 0} products ${productsResult.fromCache ? '(from cache)' : '(from server)'}`);
        if (!products || products.length === 0) {
            logger.warn('No products found');
            document.getElementById('product-groups').innerHTML = '<p>Tidak ada produk ditemukan. Silakan import data CSV terlebih dahulu.</p>';
            return;
        }
        
        // Build product data map for cart display
        productDataMap.clear();
        products.forEach(product => {
            productDataMap.set(product.code, product);
        });
        
        // Load product groups dengan version checking
        const groupsResult = await syncCollectionData('product_groups', 'product_groups', loadProductGroups);
        const productGroups = groupsResult.data || [];
        logger.log(`Loaded ${productGroups?.length || 0} product groups ${groupsResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        // Load product group availability rules dengan version checking dan filter
        // Pastikan zoneId sudah didefinisikan (gunakan zona dari user atau dapatkan dari depo_id)
        const zoneId = currentUser?.zona || (currentUser?.depo_id ? await getZonaByDepoId(currentUser.depo_id) : null);
        const userRegion = currentUser?.region_name || null;
        const userDepo = currentUser?.depo_id || null;
        const availabilityResult = await syncCollectionData(
            'product_group_availability', 
            'product_group_availability', 
            () => loadProductGroupAvailability(zoneId, userRegion, userDepo)
        );
        productGroupAvailabilityRules = availabilityResult.data || [];
        logger.log(`Loaded ${productGroupAvailabilityRules?.length || 0} availability rules ${availabilityResult.fromCache ? '(from cache)' : '(from server)'}${zoneId ? ` (filtered by zone: ${zoneId})` : ''}`);
        
        // Filter groups based on availability rules (user's zona, region, depo)
        
        const availableGroups = productGroups.filter(group => {
            return isProductGroupAvailable(
                group.code,
                productGroupAvailabilityRules,
                zoneId,
                userRegion,
                userDepo
            );
        });
        
        logger.log(`Filtered ${productGroups.length} groups to ${availableGroups.length} available groups`);
        if (availableGroups.length === 0) {
            logger.warn('No available groups found after filtering!');
            logger.log('User info:', {
                zona: zoneId,
                region: userRegion,
                depo: userDepo
            });
            logger.log('Availability rules count:', productGroupAvailabilityRules.length);
            logger.log('Availability rules (first 5):', productGroupAvailabilityRules.slice(0, 5));
            logger.log('All product groups:', productGroups.map(g => ({ code: g.code, name: g.name })));
            
            // Test each group individually
            logger.log('Testing each group availability:');
            productGroups.slice(0, 10).forEach(group => {
                const isAvailable = isProductGroupAvailable(
                    group.code,
                    productGroupAvailabilityRules,
                    zoneId,
                    userRegion,
                    userDepo
                );
                const groupRules = productGroupAvailabilityRules.filter(r => r.product_group_code === group.code);
                logger.log(`- ${group.code}: ${isAvailable ? '' : ''} (${groupRules.length} rules)`);
            });
        }
        
        // Load product group members dengan version checking
        const membersResult = await syncCollectionData('product_group_members', 'product_group_members', loadProductGroupMembers);
        const groupMembers = membersResult.data || [];
        logger.log(`Loaded ${groupMembers?.length || 0} product group members ${membersResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        // Debug: Check if data from cache is stale (missing code field)
        if (groupMembers.length > 0) {
            const firstMember = groupMembers[0];
            if (!firstMember.code && !firstMember.product_code) {
                logger.error('CRITICAL: Data from cache is stale! Missing both code and product_code.');
                logger.error('Solution: Clear cache or force refresh from server.');
                logger.error('First member:', firstMember);
            } else if (!firstMember.code && firstMember.product_code) {
                logger.warn('WARNING: Data from cache has product_code but not code. Cache might be stale.');
                logger.warn('First member:', firstMember);
            }
        }
        
        if (!groupMembers || groupMembers.length === 0) {
            logger.warn('No product group members found!');
        }
        
        // Build group map: group_code -> [{product, priority}]
        // Hanya produk yang ada di product_group_members yang ditampilkan
        const groupMap = new Map();
        
        // Only add available groups to map
        availableGroups.forEach(group => {
            groupMap.set(group.code, []);
        });
        logger.log(`Initialized groupMap with ${availableGroups.length} available groups`);
        
        let matchedProductsCount = 0;
        let unmatchedProductsCount = 0;
        let unmatchedGroupsCount = 0;
        
        // Debug: Log first few members and available groups
        if (groupMembers && groupMembers.length > 0) {
            logger.log('Sample group members from loadProductsData (first 5):', groupMembers.slice(0, 5).map(m => ({
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
                logger.warn('WARNING: member.code is undefined but product_code exists! Using product_code as fallback.');
                logger.log('First member details:', {
                    code: firstMemberCheck.code,
                    product_code: firstMemberCheck.product_code,
                    allKeys: Object.keys(firstMemberCheck)
                });
            }
            logger.log('Sample products (first 5):', products.slice(0, 5).map(p => ({
                code: p.code,
                codeType: typeof p.code,
                codeLength: p.code?.length,
                name: p.name
            })));
            logger.log('Sample available groups (first 5):', availableGroups.slice(0, 5).map(g => ({
                code: g.code,
                codeType: typeof g.code,
                name: g.name
            })));
            
            // Check for exact match between first member and first product
            const firstMemberTest = groupMembers[0];
            const firstProduct = products[0];
            if (firstMemberTest && firstProduct) {
                const memberCodeForTest = firstMemberTest.code || firstMemberTest.product_code;
                logger.log('Matching test (first member vs first product):', {
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
                    logger.error('ERROR: member.code is undefined!');
                    logger.error('Required columns from product_group_members table:');
                    logger.error('- product_code (TEXT, NOT NULL)  transformed to member.code');
                    logger.error('- product_group_code (TEXT, NOT NULL)');
                    logger.error('- priority (INTEGER, default 0)');
                    logger.error('Current member object:', {
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
                            logger.log(`Group not found for member:`, {
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
                    logger.log(`Product not found for member code: "${member.code}" (type: ${typeof member.code}, length: ${member.code?.length})`);
                    logger.log(`Member code char codes:`, member.code?.split('').map(c => `${c}(${c.charCodeAt(0)})`).join(' '));
                    
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
                        logger.log(`Similar product codes found (${similarProducts.length}):`, similarProducts.map(p => ({ 
                            code: `"${p.code}"`, 
                            type: typeof p.code,
                            name: p.name,
                            charCodes: p.code?.split('').map(c => `${c}(${c.charCodeAt(0)})`).join(' ')
                        })));
                    } else {
                        logger.log(`No similar product codes found.`);
                    }
                    
                    // Show all product codes for comparison (first 10)
                    if (unmatchedProductsCount === 1) {
                        logger.log(`All product codes (first 10):`, products.slice(0, 10).map(p => ({ 
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
            logger.error('CRITICAL: No products matched!');
            logger.log('First 5 member codes:', groupMembers.slice(0, 5).map(m => ({
                memberCode: `"${m.code}"`,
                memberCodeType: typeof m.code,
                memberCodeLength: m.code?.length,
                memberCodeCharCodes: m.code?.split('').map(c => `${c}(${c.charCodeAt(0)})`).join(' ')
            })));
            logger.log('First 5 product codes:', products.slice(0, 5).map(p => ({
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
                logger.log(`Partial matches for "${firstMemberCode}":`, partialMatches.map(p => ({
                    code: `"${p.code}"`,
                    name: p.name
                })));
            }
        }
        
        logger.log(`Group mapping results:`, {
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
        // TIDAK filter berdasarkan storeType di awal - ambil semua data
        // Filter storeType akan dilakukan di client-side saat filtering promo
        // Ini memungkinkan user ganti store type saat offline dan promo tetap relevan
        const userRegionForPromo = currentUser?.region_name || null;
        const userDepoForPromo = currentUser?.depo_id || null;
        const promoAvailabilityResult = await syncCollectionData(
            'promo_availability', 
            'promo_availability', 
            () => loadPromoAvailability({ 
                regionCode: userRegionForPromo, 
                depoId: userDepoForPromo
                // HAPUS: storeType: selectedStoreType - jangan filter di awal
                // HAPUS: zoneCode - tidak perlu karena filtering akan dilakukan client-side
            })
        );
        promoAvailabilityRules = promoAvailabilityResult.data || [];
        logger.log(`Loaded ${promoAvailabilityRules?.length || 0} promo availability rules ${promoAvailabilityResult.fromCache ? '(from cache)' : '(from server)'}${userRegionForPromo ? ` (filtered by region: ${userRegionForPromo})` : ''} - store type filtering will be done client-side`);
        
        // Load bundle promos dengan version checking
        const bundlePromosResult = await syncCollectionData('bundle_promos', 'bundle_promos', loadBundlePromos);
        bundlePromosList = bundlePromosResult.data || [];
        logger.log(`Loaded ${bundlePromosList?.length || 0} bundle promos ${bundlePromosResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        // Get store type from DOM for filtering
        const storeTypeEl = document.getElementById('store-type');
        const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
        
        // Get user zona untuk filtering (diperlukan untuk isPromoAvailable)
        const userZonaForPromo = currentUser?.zona || null;
        
        // Filter promos based on availability
        const availablePromos = bundlePromosList.filter(promo => {
            return isPromoAvailable(
                promo.promo_id,
                'bundling',
                promoAvailabilityRules,
                selectedStoreType,
                userZonaForPromo,
                userRegionForPromo,
                userDepoForPromo
            );
        });
        logger.log(`Filtered ${bundlePromosList.length} promos to ${availablePromos.length} available promos`);
        
        // Load bundle promo groups dengan version checking
        const bundlePromoGroupsResult = await syncCollectionData('bundle_promo_groups', 'bundle_promo_groups', loadAllBundlePromoGroups);
        bundlePromoGroupsList = bundlePromoGroupsResult.data || [];
        logger.log(`Loaded ${bundlePromoGroupsList?.length || 0} bundle promo groups ${bundlePromoGroupsResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        // Load bucket members dengan version checking (jika ada version key untuk ini)
        // Note: bucket_members mungkin tidak punya version key terpisah, gunakan 'bundle_promo_groups' atau buat key baru
        const bucketMembersResult = await syncCollectionData('bucket_members', 'bundle_promo_groups', loadBucketMembers);
        const bucketMembers = bucketMembersResult.data || [];
        logger.log(`Loaded ${bucketMembers?.length || 0} bucket members ${bucketMembersResult.fromCache ? '(from cache)' : '(from server)'}`);
        
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
        
        logger.log(`Built promo structure: ${promoStructureMap.size} promos`);
        logger.log(`Mapped ${productToPromoBucketMap.size} products to promo/bucket`);
        
        // Load prices menggunakan zona user
        // Load prices dengan version checking (jika belum di-load sebelumnya)
        // Load prices dengan version checking
        const pricesResult = await syncCollectionData(`prices_${selectedZone}`, 'prices', () => loadPrices(selectedZone));
        const prices = pricesResult.data || [];
        logger.log(`Loaded ${prices?.length || 0} prices for zone ${selectedZone} ${pricesResult.fromCache ? '(from cache)' : '(from server)'}`);
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
        logger.error('Error loading products data:', error);
        throw error;
    }
}

/**
 * Load promo/discount data for calculation
 */
async function loadCalculationData(products) {
    try {
        logger.log('Loading calculation data...');
        
        // Get store type from DOM
        const storeTypeEl = document.getElementById('store-type');
        const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
        
        // Get user info for promo availability filtering
        const userZonaForPromo = currentUser?.zona || null;
        const userRegionForPromo = currentUser?.region_name || null;
        const userDepoForPromo = currentUser?.depo_id || null;
        
        // Load principal discount tiers dengan version checking
        const principalResult = await syncCollectionData('principal_discount_tiers', 'principal_discount_tiers', loadPrincipalDiscountTiers);
        principalDiscountTiers = principalResult.data || [];
        logger.log(`Loaded ${principalDiscountTiers?.length || 0} principal discount tiers ${principalResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        // Load group promos dengan version checking
        const groupPromosResult = await syncCollectionData('group_promos', 'group_promos', loadGroupPromos);
        groupPromos = groupPromosResult.data || [];
        logger.log(`Loaded ${groupPromos?.length || 0} group promos ${groupPromosResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        // Load group promo tiers dengan version checking dan filter berdasarkan promo yang available
        // Filter promo IDs yang available untuk user
        const availablePromoIds = groupPromos
            .filter(promo => isPromoAvailable(
                promo.promo_id,
                'group',
                promoAvailabilityRules,
                selectedStoreType,
                userZonaForPromo,
                userRegionForPromo,
                userDepoForPromo
            ))
            .map(promo => promo.promo_id);
        
        const groupTiersResult = await syncCollectionData(
            'group_promo_tiers', 
            'group_promo_tiers', 
            () => loadGroupPromoTiers(availablePromoIds.length > 0 ? availablePromoIds : null)
        );
        groupPromoTiers = groupTiersResult.data || [];
        logger.log(`Loaded ${groupPromoTiers?.length || 0} group promo tiers ${groupTiersResult.fromCache ? '(from cache)' : '(from server)'}${availablePromoIds.length > 0 ? ` (filtered by ${availablePromoIds.length} available promo IDs)` : ''}`);
        
        // Load invoice discounts dengan version checking
        const invoiceResult = await syncCollectionData('invoice_discounts', 'invoice_discounts', loadInvoiceDiscounts);
        invoiceDiscounts = invoiceResult.data || [];
        logger.log(`Loaded ${invoiceDiscounts?.length || 0} invoice discounts ${invoiceResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        // Load free product promos dengan version checking
        const freeProductResult = await syncCollectionData('free_product_promos', 'free_product_promos', loadFreeProductPromos);
        freeProductPromos = freeProductResult.data || [];
        logger.log(`Loaded ${freeProductPromos?.length || 0} free product promos ${freeProductResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        // Load free product promo tiers dengan version checking
        // NOTE: Tiers sementara dinonaktifkan, akan diaktifkan jika diperlukan
        // const freeProductTiersResult = await syncCollectionData('free_product_promo_tiers', 'free_product_promo_tiers', loadFreeProductPromoTiers);
        // freeProductPromoTiers = freeProductTiersResult.data || [];
        // logger.log(`Loaded ${freeProductPromoTiers?.length || 0} free product promo tiers ${freeProductTiersResult.fromCache ? '(from cache)' : '(from server)'}`);
        freeProductPromoTiers = []; // Set empty untuk sementara
        
        // Load loyalty data dengan version checking
        const loyaltyClassesResult = await syncCollectionData('store_loyalty_classes', 'store_loyalty_classes', loadLoyaltyClasses);
        loyaltyClasses = loyaltyClassesResult.data || [];
        
        const loyaltyAvailabilityResult = await syncCollectionData('store_loyalty_availability', 'store_loyalty_availability', loadLoyaltyAvailability);
        loyaltyAvailabilityRules = loyaltyAvailabilityResult.data || [];
        logger.log(`Loaded ${loyaltyClasses?.length || 0} loyalty classes and ${loyaltyAvailabilityRules?.length || 0} availability rules ${loyaltyClassesResult.fromCache && loyaltyAvailabilityResult.fromCache ? '(from cache)' : '(from server)'}`);
        
        // Build principal map for products (only if products is provided)
        if (products && Array.isArray(products) && products.length > 0) {
            const productCodes = products.map(p => p.code);
            principalMap = await batchGetProductPrincipals(productCodes);
            logger.log(`Mapped ${principalMap.size} products to principals`);
        } else if (productDataMap && productDataMap.size > 0) {
            // Fallback: use productDataMap if products not provided
            const productCodes = Array.from(productDataMap.keys());
            principalMap = await batchGetProductPrincipals(productCodes);
            logger.log(`Mapped ${principalMap.size} products to principals (from productDataMap)`);
        } else {
            logger.warn('No products available for principal mapping');
        }
        
    } catch (error) {
        logger.error('Error loading calculation data:', error);
        // Don't throw - calculation can still work with empty data
    }
}

/**
 * Load and display available promos in the promosi tab
 */
async function loadPromosData() {
    try {
        logger.log('Loading promos data for display...');
        
        // Get user info and store type
        const storeTypeEl = document.getElementById('store-type');
        const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
        const userZona = currentUser?.zona || null;
        const userRegion = currentUser?.region_name || null;
        const userDepo = currentUser?.depo_id || null;
        
        // Load all promo types (they should already be loaded in loadCalculationData, but we'll use them)
        // If not loaded yet, load them now (TANPA filter storeType - ambil semua data)
        if (promoAvailabilityRules.length === 0) {
            promoAvailabilityRules = await loadPromoAvailability({
                zoneCode: userZona,
                regionCode: userRegion,
                depoId: userDepo
                // TIDAK include storeType - ambil semua
            });
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
        // Filter by promo availability - only show promos that are available for this user
        const strataPromoMap = new Map(); // promo_id -> { promo info, tiers: [] }
        
        logger.log(`Processing ${groupPromos.length} group promo headers and ${groupPromoTiers.length} tiers for display`);
        
        // First, add promo headers that pass availability filter
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
        
        // Add tiers to filtered strata promos only
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
        
        // Only include promos that have at least one tier
        const allFilteredPromos = Array.from(strataPromoMap.values());
        availablePromos.strata = allFilteredPromos.filter(promo => promo.tiers.length > 0);
        
        // Detailed logging for debugging
        const promosWithoutTiers = allFilteredPromos.filter(p => p.tiers.length === 0);
        logger.log('Strata promos loaded for display:', {
            totalPromosFromDB: groupPromos.length,
            totalTiersFromDB: groupPromoTiers.length,
            promosPassedAvailabilityFilter: strataPromoMap.size,
            promosWithTiers: availablePromos.strata.length,
            promosWithoutTiers: promosWithoutTiers.length,
            finalStrataCount: availablePromos.strata.length,
            promoIds: availablePromos.strata.map(p => p.promo_id).sort(),
            promoIdsWithoutTiers: promosWithoutTiers.map(p => p.promo_id).sort()
        });
        
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
        
        // Store available promos globally for modal access (filtered by availability)
        availablePromosGlobal = availablePromos;
        
        // Render promos to tab
        renderPromos(availablePromos, promoAvailabilityRules, currentUser);
        
        logger.log('Promos loaded:', {
            principal: availablePromos.principal.length,
            strata: availablePromos.strata.length,
            bundling: availablePromos.bundling.length,
            invoice: availablePromos.invoice.length,
            free_product: availablePromos.free_product.length
        });
        
    } catch (error) {
        logger.error('Error loading promos data:', error);
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
        logger.warn('Promo container not found');
        // Try alternative selector
        const altContainer = document.querySelector('.promo-table-container');
        if (altContainer) {
            logger.log('Found alternative container');
            altContainer.innerHTML = '<p style="color: red;">Error: Container selector mismatch. Please check HTML structure.</p>';
        }
        return;
    }
    
    logger.log('Rendering promos to container:', {
        principal: promos.principal?.length || 0,
        strata: promos.strata?.length || 0,
        bundling: promos.bundling?.length || 0,
        invoice: promos.invoice?.length || 0,
        free_product: promos.free_product?.length || 0
    });
    
    // Log strata promos detail for debugging
    if (promos.strata && promos.strata.length > 0) {
        logger.log('Strata promos to render:', {
            count: promos.strata.length,
            promoIds: promos.strata.map(p => p.promo_id)
        });
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
        html += '<div class="accordion-content promo-accordion-content">';
        
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
            // Escape principal codes untuk keamanan XSS
            const principals = Array.isArray(tier.principal_codes) 
                ? tier.principal_codes.map(code => escapeHtml(code)).join(',') 
                : escapeHtml(tier.principal_codes || '-');
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
        html += '<div class="accordion-item promo-accordion-item">';
        html += `<div class="accordion-header promo-accordion-header expanded" onclick="togglePromoAccordion(this)">
            <span class="accordion-toggle">▼</span>
            <span class="accordion-title">📊 Pot. Strata</span>
            <span class="accordion-count">(${promos.strata.length} promo)</span>
        </div>`;
        html += '<div class="accordion-content promo-accordion-content expanded" style="padding: 2px 5px;">';
        html += '<div class="promo-list strata-promo-list">';
        promos.strata.forEach(promo => {
            const promoId = escapeHtml(promo.promo_id);
            const description = escapeHtml(promo.description || '-');
            const detail = escapeHtml(`Group: ${promo.product_group_code} | Mode: ${promo.tier_mode} | Unit: ${promo.tier_unit}`);
            
            // Each promo becomes an accordion item
            html += `<div class="accordion-item strata-promo-accordion-item" data-promo-id="${promoId}">`;
            html += `<div class="accordion-header strata-promo-header" onclick="togglePromoAccordion(this)">
                <span class="accordion-toggle">▶</span>
                <div class="strata-promo-header-info">
                    <span class="strata-promo-id"><strong>${promoId}</strong></span>
                    <span class="strata-promo-desc">${description}</span>
                    <span class="strata-promo-detail">${detail}</span>
                </div>
            </div>`;
            html += '<div class="accordion-content strata-promo-content">';
            
            // Display tiers
            if (promo.tiers && promo.tiers.length > 0) {
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
            }
            
            html += '</div></div>'; // Close strata-promo-content and strata-promo-accordion-item
        });
        html += '</div>';
        html += '</div></div>'; // Close promo-accordion-content and promo-accordion-item
    }
    
    // 3. Bundle Promos
    if (promos.bundling.length > 0) {
        html += '<div class="accordion-item promo-accordion-item">';
        html += `<div class="accordion-header promo-accordion-header" onclick="togglePromoAccordion(this)">
            <span class="accordion-toggle">▼</span>
            <span class="accordion-title">🎁 Program Kawin</span>
            <span class="accordion-count">(${promos.bundling.length} promo)</span>
        </div>`;
        html += '<div class="accordion-content promo-accordion-content">';
        html += '<div class="promo-list">';
        promos.bundling.forEach(promo => {
            // Get bucket IDs for this promo from bundlePromoGroupsList
            const buckets = bundlePromoGroupsList
                .filter(g => g.promo_id === promo.promo_id)
                .map(g => g.bucket_id)
                .sort()
                .join(', ');
            
            // Format: Paket X (bucket 1, bucket 2)
            // Escape buckets untuk keamanan XSS
            const bucketsEscaped = escapeHtml(buckets);
            const promoIdEscaped = escapeHtml(promo.promo_id);
            const promoDescriptionEscaped = escapeHtml(promo.description || promo.promo_id);
            const shortDescription = bucketsEscaped 
                ? `Paket ${promoIdEscaped} (${bucketsEscaped})`
                : promoDescriptionEscaped;
            
            // Escape promo data untuk keamanan XSS
            const shortDescriptionEscaped = escapeHtml(shortDescription);
            
            html += `<div class="promo-item">
                <div class="promo-id"><strong>${promoIdEscaped}</strong></div>
                <div class="promo-description">${shortDescriptionEscaped}</div>
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
        html += '<div class="accordion-content promo-accordion-content">';
        html += '<div class="promo-list">';
        promos.invoice.forEach(promo => {
            // Escape promo data untuk keamanan XSS
            const invoicePromoIdEscaped = escapeHtml(promo.promo_id);
            const invoiceDescriptionEscaped = escapeHtml(promo.description || '-');
            const paymentMethodEscaped = escapeHtml(promo.payment_method);
            
            html += `<div class="promo-item">
                <div class="promo-id"><strong>${invoicePromoIdEscaped}</strong></div>
                <div class="promo-description">${invoiceDescriptionEscaped}</div>
                <div class="promo-detail">Min. belanja: ${formatCurrency(promo.min_purchase_amount)} | Metode: ${paymentMethodEscaped} | Diskon: ${(parseFloat(promo.discount_percentage) || 0).toFixed(2)}%</div>
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
            <span class="accordion-title">🎁 Pot. Extra Barang</span>
            <span class="accordion-count">(${promos.free_product.length} promo)</span>
        </div>`;
        html += '<div class="accordion-content promo-accordion-content">';
        html += '<div class="promo-list">';
        promos.free_product.forEach(promo => {
            const triggerText = promo.trigger_type === 'nominal' 
                ? `Min. belanja: ${formatCurrency(promo.min_purchase_amount)}`
                : `Min. qty: ${promo.min_quantity}`;
            // Escape promo data untuk keamanan XSS
            const freePromoIdEscaped = escapeHtml(promo.promo_id);
            const freeDescriptionEscaped = escapeHtml(promo.description || '-');
            const purchaseScopeEscaped = escapeHtml(promo.purchase_scope);
            
            html += `<div class="promo-item">
                <div class="promo-id"><strong>${freePromoIdEscaped}</strong></div>
                <div class="promo-description">${freeDescriptionEscaped}</div>
                <div class="promo-detail">${triggerText} | Scope: ${purchaseScopeEscaped} | Gratis: ${promo.free_quantity} pcs</div>
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
                html += '<div class="accordion-item promo-accordion-item">';
                html += `<div class="accordion-header promo-accordion-header" onclick="togglePromoAccordion(this)">
                    <span class="accordion-toggle">▼</span>
                    <span class="accordion-title">🎯 Program Loyalty</span>
                    <span class="accordion-count">(${loyaltyRulesWithData.length} kelas)</span>
                </div>`;
                html += '<div class="accordion-content promo-accordion-content">';
                html += '<div class="promo-list">';
                html += '<table class="promo-tier-table">';
                html += '<thead><tr><th>Kelas</th><th>Target Bulanan</th><th>Loyalty</th></tr></thead>';
                html += '<tbody>';
                
                loyaltyRulesWithData.forEach(item => {
                    // Escape loyalty class code untuk keamanan XSS
                    const classCodeEscaped = escapeHtml(item.classCode);
                    
                    html += `<tr>
                        <td><strong>${classCodeEscaped}</strong></td>
                        <td><strong>${formatCurrency(item.targetMonthly)}</strong></td>
                        <td style="color: var(--success-color, #28a745); font-weight: bold;">${item.cashbackPercentage}%</td>
                    </tr>`;
                });
                
                html += '</tbody></table>';
                html += '</div>';
                html += '</div></div>'; // Close accordion-content and accordion-item
            }
        }
    }
    
    // Close promo-accordion-container
    html += '</div>'; // Close promo-accordion-container
    
    // If no promos available
    if (html === '<div class="promo-accordion-container"></div>') {
        html = '<p>Tidak ada promosi yang tersedia saat ini.</p>';
    }
    
    container.innerHTML = html;
    
    // Log after rendering for debugging
    if (promos.strata && promos.strata.length > 0) {
        const strataItems = container.querySelectorAll('.strata-promo-accordion-item');
        logger.log('After rendering - Strata promo items found:', {
            expected: promos.strata.length,
            found: strataItems.length,
            items: Array.from(strataItems).map(item => item.getAttribute('data-promo-id'))
        });
    }
}

/**
 * Toggle accordion untuk promo section
 * Fungsi ini harus global karena dipanggil dari onclick attribute
 */
window.togglePromoAccordion = function(header) {
    const accordionItem = header.closest('.accordion-item');
    if (!accordionItem) {
        logger.warn('togglePromoAccordion: accordion-item not found');
        return;
    }
    
    const content = accordionItem.querySelector('.accordion-content');
    const toggle = header.querySelector('.accordion-toggle');
    
    if (!content || !toggle) {
        logger.warn('togglePromoAccordion: content or toggle not found', { content: !!content, toggle: !!toggle });
        return;
    }
    
    // Check current state: if display is 'none' or empty (default collapsed), expand it
    const currentDisplay = content.style.display;
    const computedDisplay = window.getComputedStyle(content).display;
    const isCurrentlyHidden = currentDisplay === 'none' || 
                             currentDisplay === '' ||
                             !currentDisplay ||
                             computedDisplay === 'none';
    
    // Toggle expanded class
    const isExpanded = content.classList.contains('expanded');
    
    // Check if this is a strata promo accordion (uses ▶/▼ instead of ▼/▲)
    const isStrataPromo = accordionItem.classList.contains('strata-promo-accordion-item');
    
    if (isExpanded) {
        // Collapse
        content.classList.remove('expanded');
        content.style.display = 'none';
        content.style.maxHeight = '0';
        toggle.textContent = isStrataPromo ? '▶' : '▼';
        accordionItem.classList.remove('expanded');
        header.classList.remove('expanded');
    } else {
        // Expand
        content.classList.add('expanded');
        content.style.display = 'block';
        content.style.maxHeight = '5000px';
        toggle.textContent = isStrataPromo ? '▼' : '▲';
        accordionItem.classList.add('expanded');
        header.classList.add('expanded');
    }
    
    logger.log('Toggle promo accordion:', {
        wasExpanded: isExpanded,
        nowExpanded: content.classList.contains('expanded'),
        computedDisplay: window.getComputedStyle(content).display,
        maxHeight: window.getComputedStyle(content).maxHeight
    });
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
    logger.log(`[Upselling] Checking group: ${groupCode}`, {
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
            logger.log(`Group ${groupCode} not available for user area`);
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
        logger.log(`No promo found for group ${groupCode}`);
        return null;
    }
    
    logger.log(`Found ${promosForGroup.length} promo(s) for group ${groupCode}`);
    
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
        logger.log(`No available promo for group ${groupCode} after filtering`);
        return null;
    }
    
    logger.log(`Found ${availablePromos.length} available promo(s) for group ${groupCode}`);
    
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
        logger.log(`No items in cart for group ${groupCode}`);
        return null;
    }
    
    logger.log(`Found ${itemsInGroup.length} item(s) in cart for group ${groupCode}, currentQty: ${currentQty}`);
    
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
    
    // 6a. Jika belum ada current tier tapi qty > 0, gunakan tier pertama sebagai target
    if (!currentTier) {
        if (currentQty > 0 && sortedTiers.length > 0) {
            // Belum mencapai tier terendah, tapi ada qty di cart
            // Tampilkan upsell untuk mencapai tier pertama
            const firstTier = sortedTiers[0];
            const firstTierMinQty = parseFloat(firstTier.min_qty) || 0;
            const firstTierDiscount = parseFloat(firstTier.discount_per_unit) || 0;
            const gapQty = Math.max(0, firstTierMinQty - currentQty);
            
            if (gapQty > 0) {
                logger.log(`Upselling recommendation (pre-tier): gap=${gapQty} to reach tier 1 (min_qty=${firstTierMinQty}, discount=${firstTierDiscount})`);
                
                // Check variant requirement untuk tier pertama
                const tierMode = promo.tier_mode || 'non mix';
                let variantGap = 0;
                let suggestedVariants = [];
                
                if (tierMode === 'mix' && firstTier.variant_count) {
                    const requiredVariants = parseInt(firstTier.variant_count) || 0;
                    const currentVariants = new Set(itemsInGroup.map(({ product }) => product.code));
                    const currentVariantCount = currentVariants.size;
                    
                    variantGap = Math.max(0, requiredVariants - currentVariantCount);
                    
                    // Get suggested variants
                    if (variantGap > 0 && allProducts) {
                        suggestedVariants = allProducts
                            .filter(p => {
                                const groupInfo = productGroupMap.get(p.code);
                                return groupInfo && groupInfo.code === groupCode && !currentVariants.has(p.code);
                            })
                            .slice(0, 3)
                            .map(p => p.code);
                    }
                }
                
                return {
                    groupCode: groupCode,
                    groupName: productGroupMap.get(itemsInGroup[0].product.code)?.name || groupCode,
                    currentDiscountPerUnit: 0, // Belum dapat discount
                    nextDiscountPerUnit: firstTierDiscount,
                    nextMinQty: firstTierMinQty,
                    gapQty: gapQty,
                    tierUnit: tierUnit,
                    variantGap: variantGap,
                    suggestedVariants: suggestedVariants
                };
            }
        }
        logger.log(`No current tier found for group ${groupCode} with qty ${currentQty}`);
        return null;
    }
    
    const currentDiscountPerUnit = parseFloat(currentTier.discount_per_unit) || 0;
    logger.log(`Current tier: min_qty=${currentTier.min_qty}, discount=${currentDiscountPerUnit}`);
    
    // 7. Find next tier with higher discount
    const betterTiers = sortedTiers.filter(tier => {
        const tierDiscount = parseFloat(tier.discount_per_unit) || 0;
        return tierDiscount > currentDiscountPerUnit;
    });
    
    if (betterTiers.length === 0) {
        logger.log(`No better tier found for group ${groupCode} (current discount: ${currentDiscountPerUnit})`);
        return null;
    }
    
    // 8. Get nearest tier (lowest min_qty among better tiers)
    const nextTier = betterTiers[0];
    const nextMinQty = parseFloat(nextTier.min_qty) || 0;
    const nextDiscountPerUnit = parseFloat(nextTier.discount_per_unit) || 0;
    
    logger.log(`Next tier: min_qty=${nextMinQty}, discount=${nextDiscountPerUnit}`);
    
    // 9. Calculate gap
    const gapQty = Math.max(0, nextMinQty - currentQty);
    
    if (gapQty <= 0) {
        logger.log(`Gap qty is 0 or negative for group ${groupCode}`);
        return null;
    }
    
    logger.log(`Upselling recommendation found for group ${groupCode}: gap=${gapQty}, nextDiscount=${nextDiscountPerUnit}`);
    
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
    logger.log(`[Bundle Upselling] Checking promo: ${promoId}`, {
        cartSize: cart?.size || 0,
        bundlePromosCount: bundlePromos?.length || 0
    });
    
    // 1. Check if promo exists and is available
    const promo = bundlePromos.find(p => p.promo_id === promoId);
    if (!promo) {
        logger.log(`Promo ${promoId} not found`);
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
        logger.log(`Promo ${promoId} not available for user area`);
        return null;
    }
    
    // 2. Get promo structure
    const promoData = promoStructureMap.get(promoId);
    if (!promoData || !promoData.buckets) {
        logger.log(`No buckets found for promo ${promoId}`);
        return null;
    }
    
    // 3. Get groups for this promo
    const groups = bundlePromoGroups.filter(g => g.promo_id === promoId);
    if (groups.length === 0) {
        logger.log(`No groups found for promo ${promoId}`);
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
        logger.log(`No valid buckets for promo ${promoId}`);
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
        logger.log(`Already at max packages (${maxPackages}) for promo ${promoId}`);
        return null;
    }
    
    // 8. Tentukan bucket yang "lebih" dan bucket yang "kurang" berdasarkan jumlah qty
    // Bucket yang "lebih" = bucket dengan packages lebih banyak (jumlah qty lebih besar)
    // Bucket yang "kurang" = bucket dengan packages lebih sedikit (jumlah qty lebih kecil)
    // Rekomendasi muncul di bucket yang "lebih" untuk menambahkan bucket yang "kurang"
    
    // OPSI 1: Tidak ada rekomendasi jika semua bucket sudah sama packages-nya (rule sudah terpenuhi)
    // Rekomendasi hanya muncul jika ada bucket yang "lebih" jelas (packages berbeda)
    if (maxPackagesPerBucket === currentPackages) {
        logger.log(`All buckets have same packages (${currentPackages}) - rule already fulfilled, no recommendation needed`);
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
    
    logger.log(`Bucket comparison: maxPackages=${maxPackagesPerBucket}, minPackages=${currentPackages}`);
    logger.log(`Source bucket (lebih): ${sourceBucket.bucketId} (${sourceBucket.packages} packages)`);
    logger.log(`Target bucket (kurang): ${targetBucket.bucketId} (${targetBucket.packages} packages, gap=${targetBucket.gapToNextPackage})`);
    
    if (!sourceBucket || !targetBucket || sourceBucket.bucketId === targetBucket.bucketId) {
        logger.log(`No valid source/target bucket found for promo ${promoId}`);
        return null;
    }
    
    if (targetBucket.gapToNextPackage <= 0) {
        logger.log(`No gap found for promo ${promoId}`);
        return null;
    }
    
    // 9. Determine if this is for first package or next package
    const isFirstPackage = currentPackages === 0;
    const gapQtyFormatted = targetBucket.gapToNextPackage.toFixed(1);
    const unitLabel = targetBucket.unit === 'unit_1' ? 'krt' : 'box';
    const discountFormatted = Math.round(discountPerPackage).toLocaleString('id-ID');
    
    const message = isFirstPackage 
        ? `Tambahkan ${targetBucket.bucketId} sebanyak ${gapQtyFormatted} ${unitLabel} untuk mendapat potongan Program Kawin sebesar ${discountFormatted}`
        : `Tambahkan ${targetBucket.bucketId} sebanyak ${gapQtyFormatted} ${unitLabel} untuk mendapat 1 paket Program Kawin lagi (potongan tambahan ${discountFormatted})`;
    
    logger.log(`Upselling recommendation found for promo ${promoId}: ${message}`);
    
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
        
        logger.log(`[Update Upselling] Checking group: ${groupCode}`);
        
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
                // Atau jika belum dapat potongan: "Tambah 1 krt lagi untuk mendapat potongan 2300"
                const currentDiscount = Math.round(upsellingRec.currentDiscountPerUnit || 0);
                const nextDiscount = Math.round(upsellingRec.nextDiscountPerUnit || 0);
                const gapQty = upsellingRec.gapQty.toFixed(1);
                
                // Buat badge 1 baris yang informatif
                const badge = document.createElement('div');
                badge.className = 'upsell-item-badge-single-line';
                
                // Jika belum dapat potongan (currentDiscount = 0), gunakan pesan yang berbeda
                if (currentDiscount === 0) {
                    badge.innerHTML = `
                        Tambah <strong>${gapQty} ${unitLabel}</strong> lagi 
                        untuk mendapat potongan <strong>${nextDiscount.toLocaleString('id-ID')}</strong>
                    `;
                } else {
                badge.innerHTML = `
                    Potongan saat ini <strong>${currentDiscount.toLocaleString('id-ID')}</strong> 
                    tambah <strong>${gapQty} ${unitLabel}</strong> lagi 
                    untuk mendapat potongan <strong>${nextDiscount.toLocaleString('id-ID')}</strong>
                `;
                }
                
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
            
            logger.log(`[Update Upselling] Added recommendation for group: ${groupCode}`);
        } else {
            logger.log(`[Update Upselling] No recommendation for group: ${groupCode}`);
        }
    });
    
    logger.log(`[Update Upselling] Finished updating ${accordionItems.length} groups`);
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
        logger.log('[Bundle Upselling] No bundle promos available');
        return;
    }
    
    if (!promoStructureMap || promoStructureMap.size === 0) {
        logger.log('[Bundle Upselling] No promo structure available');
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
                        logger.log(`Product ${productId} in bucket ${sourceBucketId} - promo mismatch: ${bucketPromoId} vs ${currentPromoId}`);
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
                        logger.log(`Product ${productId} in bucket ${sourceBucketId} - no parent promo accordion found for promo ${currentPromoId}`);
                        return false;
                    }
                    
                    return true;
                } else {
                    // Product tidak berada di bucket accordion - cek apakah berada di group accordion
                    // DAN product ini memang ada di bucket sourceBucketId untuk promo ini
                    const groupAccordion = productItem.closest(`.accordion-item[data-group-code]`);
                    if (!groupAccordion) {
                        logger.log(`Product ${productId} - not in bucket or group accordion`);
                        return false;
                    }
                    
                    // Validasi: product ini memang ada di bucket sourceBucketId untuk promo currentPromoId
                    const promoData = promoStructureMap.get(currentPromoId);
                    if (!promoData || !promoData.buckets) {
                        return false;
                    }
                    
                    const bucketProducts = promoData.buckets.get(sourceBucketId) || [];
                    if (!bucketProducts.includes(productId)) {
                        logger.log(`Product ${productId} - not in bucket ${sourceBucketId} for promo ${currentPromoId}`);
                        return false;
                    }
                    
                    // Product valid - berada di group accordion tapi juga ada di bucket ini
                    logger.log(`Product ${productId} - in group accordion but also in bucket ${sourceBucketId} for promo ${currentPromoId}`);
                    return true;
                }
            });
            
            allProductItems.forEach(productItem => {
                // Skip if already has bundle badge for this promo
                const existingBadge = productItem.querySelector(`.upsell-bundle-badge[data-promo-id="${currentPromoId}"]`);
                if (existingBadge) {
                    logger.log(`Skipping product ${productId} in bucket ${sourceBucketId} for promo ${currentPromoId} - badge already exists`);
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
                    tambahkan <strong>${targetBucketId}</strong> sebanyak <strong>${upsellingRec.gapQty.toFixed(1)} ${upsellingRec.gapUnit}</strong> 
                    untuk mendapat ${upsellingRec.isFirstPackage ? 'potongan Program Kawin sebesar' : '1 paket Program Kawin lagi (potongan tambahan)'} <strong>${discountFormatted}</strong>
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
        
        logger.log(`[Bundle Upselling] Added recommendation for promo ${promo.promo_id}`);
    });
    
    logger.log(`[Bundle Upselling] Finished updating bundle upselling recommendations`);
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
            message = `Tambah belanja ${formatCurrency(gap)} untuk diskon reguler ${normalizedPrincipalCode} (atau gabungan dengan ${otherPrincipals.join(', ')}) untuk mendapat diskon ${nextDiscount}% (saat ini ${currentDiscount}%)`;
        } else {
            message = `Tambah belanja ${formatCurrency(gap)} untuk diskon reguler ${normalizedPrincipalCode} untuk mendapat diskon ${nextDiscount}% (saat ini ${currentDiscount}%)`;
        }
    } else {
        // Single principal
        message = `Tambah belanja ${formatCurrency(gap)} untuk diskon reguler ${normalizedPrincipalCode} untuk mendapat diskon ${nextDiscount}% (saat ini ${currentDiscount}%)`;
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
                // Escape recommendation message untuk keamanan XSS
                const messageEscaped = escapeHtml(recommendation.message);
                infoDiv.innerHTML = `<span class="upsell-icon">💡</span> ${messageEscaped}`;
                principalDiscountRow.closest('.calc-row').insertAdjacentElement('afterend', infoDiv);
            });
        }
    }
    
    // 2. Strata (Group Promo) Upselling (collapse di dalam row Promo Grup Produk)
    const groupDiscountRow = document.getElementById('group-discount');
    if (!groupDiscountRow) {
        logger.warn('group-discount element not found! Cannot display strata upselling.');
        logger.log('Available calculation elements:', {
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
            logger.warn('product-groups container not found! Cannot get group codes for strata upselling.');
        } else {
            const accordionItems = productContainer.querySelectorAll('.accordion-item[data-group-code]');
            logger.log(`[Strata Upselling] Found ${accordionItems.length} accordion items with data-group-code`);
            
            if (accordionItems.length === 0) {
                logger.warn('No accordion items with data-group-code found!');
            }
            
            accordionItems.forEach((accordionItem, idx) => {
                const groupCode = accordionItem.dataset.groupCode;
                if (!groupCode) {
                    logger.warn(`Accordion item ${idx} has no data-group-code attribute`);
                    return;
                }
                
                logger.log(`[Strata Upselling] Checking group: ${groupCode}`);
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
                    logger.log(`[Strata Upselling] Found recommendation for group ${groupCode}:`, recommendation);
                    // Format message yang informatif (sama seperti di product list)
                    const unitLabel = recommendation.tierUnit === 'unit_1' ? 'krt' : 'box';
                    const currentDiscount = Math.round(recommendation.currentDiscountPerUnit || 0);
                    const nextDiscount = Math.round(recommendation.nextDiscountPerUnit || 0);
                    const gapQty = recommendation.gapQty.toFixed(1);
                    
                    const groupName = recommendation.groupName || groupCode;
                    let message = `<strong>${groupName}:</strong> `;
                    
                    // Jika belum dapat potongan (currentDiscount = 0), gunakan pesan yang berbeda
                    if (currentDiscount === 0) {
                        message += `Tambah <strong>${gapQty} ${unitLabel}</strong> lagi `;
                        message += `untuk mendapat potongan <strong>${nextDiscount.toLocaleString('id-ID')}</strong>`;
                    } else {
                    message += `Potongan saat ini <strong>${currentDiscount.toLocaleString('id-ID')}</strong> `;
                    message += `tambah <strong>${gapQty} ${unitLabel}</strong> lagi `;
                    message += `untuk mendapat potongan <strong>${nextDiscount.toLocaleString('id-ID')}</strong>`;
                    }
                    
                    // Tambahkan info variant jika diperlukan
                    if (recommendation.variantGap > 0 && recommendation.suggestedVariants && recommendation.suggestedVariants.length > 0) {
                        message += ` (butuh ${recommendation.variantGap} variant lagi: ${recommendation.suggestedVariants.join(', ')})`;
                    }
                    
                    strataRecommendations.push({ message });
                } else {
                    logger.log(`[Strata Upselling] No recommendation for group ${groupCode}`);
                }
            });
        }
        
        logger.log(`[Strata Upselling] Total recommendations: ${strataRecommendations.length}`);
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
                    // Escape promo ID dan message untuk keamanan XSS
                    const promoIdEscaped = escapeHtml(promo.promo_id);
                    const messageEscaped = escapeHtml(recommendation.message);
                    const messageWithPromo = `<strong>Paket ${promoIdEscaped}:</strong> ${messageEscaped}`;
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
                // Escape recommendation message untuk keamanan XSS
                const messageEscaped = escapeHtml(recommendation.message);
                infoDiv.innerHTML = `<span class="upsell-icon">💡</span> ${messageEscaped}`;
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
        logger.error('Container #product-groups not found');
        return;
    }
    
    logger.log('Rendering products:', {
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
                .map(g => escapeHtml(g.bucket_id))
                .sort()
                .join(', ');
            
            // Escape promoId untuk keamanan XSS
            const promoIdEscaped = escapeHtml(promoId);
            
            // Format: Paket X (bucket 1, bucket 2)
            const shortDescription = bucketIdsString 
                ? `Paket ${promoIdEscaped} (${bucketIdsString})`
                : `Paket ${promoIdEscaped}`;
            
            // Promo level accordion (Level 1)
            const promoAccordionId = `promo-accordion-${accordionIndex}`;
            accordionIndex++;
            
            html += `
                <div class="accordion-item" data-promo-id="${promoIdEscaped}">
                    <div class="accordion-header-wrapper" style="position: relative;">
                        <button class="accordion-header" onclick="toggleAccordion('${promoAccordionId}')" style="width: 100%;">
                            <span class="accordion-title">${shortDescription}</span>
                            <span class="accordion-icon" id="icon-${promoAccordionId}">▼</span>
                        </button>
                        <button class="btn-promo-info" onclick="showBundlePromoModal('${promoIdEscaped}'); event.stopPropagation();" title="Info Promo" style="position: absolute; right: 40px; top: 50%; transform: translateY(-50%); background: #007bff; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; z-index: 10;">🎁</button>
                    </div>
                    <div class="accordion-content" id="${promoAccordionId}">
            `;
            
            // Sort buckets by bucket_id (sorted by bucket_id for rendering)
            const sortedBucketIds = Array.from(buckets.keys()).sort();
            
            sortedBucketIds.forEach(bucketId => {
                const productIds = buckets.get(bucketId);
                
                // Escape bucketId untuk keamanan XSS
                const bucketIdEscaped = escapeHtml(bucketId);
                
                // Bucket level accordion (Level 2 - nested)
                const bucketAccordionId = `bucket-accordion-${accordionIndex}`;
                accordionIndex++;
                
                html += `
                    <div class="accordion-item" data-promo-id="${promoIdEscaped}" data-bucket-id="${bucketIdEscaped}" style="margin-left: 0; margin-top: 0; border-left: none;">
                        <button class="accordion-header" onclick="toggleAccordion('${bucketAccordionId}')" style="background: #e2e6ea; font-size: 0.85em; font-weight: bold; color: #343a40;">
                            <span class="accordion-title">${bucketIdEscaped}</span>
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
                    
                    // Escape product data untuk keamanan XSS
                    const productCodeEscaped = escapeHtml(product.code);
                    const productNameEscaped = escapeHtml(product.name);
                    const unitKrtEscaped = escapeHtml(unitKrt);
                    const unitBoxEscaped = escapeHtml(unitBox);
                    
                    html += `
                        <div class="product-item" data-product-id="${productCodeEscaped}">
                            <div class="product-info">
                                <strong>${productCodeEscaped} - ${productNameEscaped}</strong>
                                <p class="price-info">
                                    ${priceFormatted}/${unitKrtEscaped} | ${boxPerKrt} ${unitBoxEscaped}/${unitKrtEscaped}
                                </p>
                            </div>
                            <div class="quantity-controls input-qty">
                                <button class="btn-qty btn-minus" data-unit="krt" data-action="minus" data-product-id="${productCodeEscaped}">-</button>
                                <input type="tel" value="${vKrt}" min="0" class="qty-input input-krt ${krtClass}" data-unit="krt" data-product-id="${productCodeEscaped}">
                                <button class="btn-qty btn-plus" data-unit="krt" data-action="plus" data-product-id="${productCodeEscaped}">+</button>
                                <button class="btn-qty btn-minus" data-unit="box" data-action="minus" data-product-id="${productCodeEscaped}" style="margin-left:8px;">-</button>
                                <input type="tel" value="${vBox}" min="0" class="qty-input input-box ${boxClass}" data-unit="box" data-product-id="${productCodeEscaped}">
                                <button class="btn-qty btn-plus" data-unit="box" data-action="plus" data-product-id="${productCodeEscaped}">+</button>
                            </div>
                            <div class="nett-summary product-card-pricing" data-product-pricing="${productCodeEscaped}" style="display:${hasQty ? 'block' : 'none'};">
                                <div class="nett-item">
                                    <span class="nett-label">Subtotal Nett (On Faktur):</span>
                                    <span class="nett-value" id="subtotal-${productCodeEscaped}">${formatCurrency(0)}</span>
                                </div>
                                <div class="nett-item">
                                    <span class="nett-label">Harga Nett/Krt (On Faktur):</span>
                                    <span class="nett-value" id="harganett-${productCodeEscaped}">${formatCurrency(0)}</span>
                                </div>
                                <div class="nett-item" style="border-top: 1px dashed #ddd; padding-top: 5px;">
                                    <span class="nett-label" style="font-weight: 500; color: var(--success-color, #28a745);">Simulasi Nett/Krt (Setelah Reward):</span>
                                    <span class="nett-value" id="simulasi-nett-${productCodeEscaped}" style="color: var(--success-color, #28a745);">${formatCurrency(0)}</span>
                                </div>
                                <div class="nett-item" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
                                    <button class="btn-detail-harga" data-product-id="${productCodeEscaped}" style="width: 100%; padding: 6px; font-size: 0.85em; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Lihat Detail Harga</button>
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
        logger.warn('No product groups and no promos provided!');
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
        
        logger.log(`Group ${group.name} (${group.code}): ${groupProducts.length} products`);
        
        if (groupProducts.length === 0) {
            logger.log(`Skipping empty group: ${group.name} (${group.code})`);
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
        
        // Escape group data untuk keamanan XSS
        const groupCodeEscaped = escapeHtml(group.code);
        const groupNameEscaped = escapeHtml(group.name);
        
        html += `
            <div class="accordion-item" data-group-code="${groupCodeEscaped}">
                <div class="accordion-header-wrapper" style="position: relative;">
                    <button class="accordion-header" onclick="toggleAccordion('${accordionId}')" style="width: 100%;">
                        <span class="accordion-title">${groupNameEscaped}${groupNameEscaped !== groupCodeEscaped ? ` (${groupCodeEscaped})` : ''}</span>
                        <span class="accordion-icon" id="icon-${accordionId}">▼</span>
                    </button>
                    <button class="btn-promo-info" onclick="showGroupPromoModal('${groupCodeEscaped}'); event.stopPropagation();" title="Info Promo" style="position: absolute; right: 40px; top: 50%; transform: translateY(-50%); background: #007bff; color: white; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: center; z-index: 10;">🎁</button>
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
            
            // Escape product data untuk keamanan XSS
            const productCodeEscaped = escapeHtml(product.code);
            const productNameEscaped = escapeHtml(product.name);
            const unitKrtEscaped = escapeHtml(unitKrt);
            const unitBoxEscaped = escapeHtml(unitBox);
            
            html += `
                <div class="product-item" data-product-id="${productCodeEscaped}">
                    <div class="product-info">
                        <strong>${productCodeEscaped} - ${productNameEscaped}</strong>
                        <p class="price-info">
                            ${priceFormatted}/${unitKrtEscaped} | ${boxPerKrt} ${unitBoxEscaped}/${unitKrtEscaped}
                        </p>
                    </div>
                    <div class="quantity-controls input-qty">
                        <button class="btn-qty btn-minus" data-unit="krt" data-action="minus" data-product-id="${productCodeEscaped}">-</button>
                        <input type="tel" value="${vKrt}" min="0" class="qty-input input-krt ${krtClass}" data-unit="krt" data-product-id="${productCodeEscaped}">
                        <button class="btn-qty btn-plus" data-unit="krt" data-action="plus" data-product-id="${productCodeEscaped}">+</button>
                        <button class="btn-qty btn-minus" data-unit="box" data-action="minus" data-product-id="${productCodeEscaped}" style="margin-left:8px;">-</button>
                        <input type="tel" value="${vBox}" min="0" class="qty-input input-box ${boxClass}" data-unit="box" data-product-id="${productCodeEscaped}">
                        <button class="btn-qty btn-plus" data-unit="box" data-action="plus" data-product-id="${productCodeEscaped}">+</button>
                    </div>
                    <div class="nett-summary product-card-pricing" data-product-pricing="${productCodeEscaped}" style="display:${hasQty ? 'block' : 'none'};">
                        <div class="nett-item">
                            <span class="nett-label">Subtotal Nett (On Faktur):</span>
                            <span class="nett-value" id="subtotal-${productCodeEscaped}">${formatCurrency(0)}</span>
                        </div>
                        <div class="nett-item">
                            <span class="nett-label">Harga Nett/Krt (On Faktur):</span>
                            <span class="nett-value" id="harganett-${productCodeEscaped}">${formatCurrency(0)}</span>
                        </div>
                        <div class="nett-item" style="border-top: 1px dashed #ddd; padding-top: 5px;">
                            <span class="nett-label" style="font-weight: 500; color: var(--success-color, #28a745);">Simulasi Nett/Krt (Setelah Reward):</span>
                            <span class="nett-value" id="simulasi-nett-${productCodeEscaped}" style="color: var(--success-color, #28a745);">${formatCurrency(0)}</span>
                        </div>
                        <div class="nett-item" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid #ddd;">
                            <button class="btn-detail-harga" data-product-id="${productCodeEscaped}" style="width: 100%; padding: 6px; font-size: 0.85em; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Lihat Detail Harga</button>
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
            
            // Escape upselling data untuk keamanan XSS
            const groupNameEscaped = escapeHtml(upsellingRec.groupName || groupCode);
            const suggestedVariantsEscaped = upsellingRec.suggestedVariants 
                ? upsellingRec.suggestedVariants.map(v => escapeHtml(v)).join(', ')
                : '';
            
            html += `
                <div class="upsell-strata-box" style="margin-top: 15px; padding: 12px; background: #e8f5e9; border-left: 4px solid #4caf50; border-radius: 4px;">
                    <div style="font-weight: bold; color: #2e7d32; margin-bottom: 8px;">
                        🎯 Promo Strata (${groupNameEscaped})
                    </div>
                    <div style="font-size: 0.9em; color: #333; margin-bottom: 4px;">
                        ${Math.round(upsellingRec.currentDiscountPerUnit || 0) === 0
                            ? `Tambah <strong>${upsellingRec.gapQty.toFixed(2)} ${unitLabel}</strong> lagi untuk dapat diskon <strong>${formatCurrency(upsellingRec.nextDiscountPerUnit)}</strong> per ${unitLabel}`
                            : `Tambah <strong>${upsellingRec.gapQty.toFixed(2)} ${unitLabel}</strong> lagi untuk dapat diskon (dari ${formatCurrency(upsellingRec.currentDiscountPerUnit)} menjadi ${formatCurrency(upsellingRec.nextDiscountPerUnit)} per ${unitLabel})`
                        }
                    </div>
                    ${upsellingRec.variantGap > 0 ? `
                        <div style="font-size: 0.85em; color: #666; margin-top: 8px; padding-top: 8px; border-top: 1px dashed #ccc;">
                            <strong>Butuh ${upsellingRec.variantGap} variant berbeda lagi.</strong>
                            ${suggestedVariantsEscaped ? `
                                <div style="margin-top: 4px;">
                                    Variant yang bisa ditambahkan: 
                                    <strong>${suggestedVariantsEscaped}</strong>
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
        logger.warn('No products rendered. Showing message to user.');
        container.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #666;">
                <p>Tidak ada produk yang tersedia untuk zona, region, dan depo Anda saat ini.</p>
                <p style="font-size: 0.9em; margin-top: 10px;">Silakan hubungi administrator jika Anda yakin seharusnya ada produk yang ditampilkan.</p>
            </div>
        `;
        return;
    }
    
    logger.log(`Rendered ${totalProductsRendered} products in ${accordionIndex} groups`);
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
        // SECURITY: Escape error message to prevent XSS
        container.innerHTML = '';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.style.cssText = 'padding: 20px; color: red;';
        errorDiv.textContent = message;
        container.appendChild(errorDiv);
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

// Cart persistence keys - dengan user identifier untuk isolasi data per user
function getCartStorageKey() {
    if (!currentUser || !currentUser.depo_id || !currentUser.kode_sales) {
        // Fallback ke key default jika belum login (tidak seharusnya terjadi)
        return 'price_engine_cart_v1_default';
    }
    // Gunakan depo_id dan kode_sales sebagai identifier unik per user
    return `price_engine_cart_v1_${currentUser.depo_id}_${currentUser.kode_sales}`;
}

/**
 * Get cart storage key for a specific user (untuk validasi)
 */
function getCartStorageKeyForUser(depoId, kodeSales) {
    if (!depoId || !kodeSales) {
        return 'price_engine_cart_v1_default';
    }
    return `price_engine_cart_v1_${depoId}_${kodeSales}`;
}

/**
 * Clear cart for all users (untuk cleanup saat logout atau user switch)
 */
function clearAllCartStorage() {
    try {
        // Clear cart untuk user saat ini
        const currentKey = getCartStorageKey();
        localStorage.removeItem(currentKey);
        
        // Clear semua cart storage yang mungkin ada (cleanup)
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('price_engine_cart_v1_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        
        logger.log('Cleared all cart storage');
    } catch (error) {
        logger.error('Error clearing cart storage:', error);
    }
}

/**
 * Save cart to localStorage dengan user identifier
 */
function saveCartToLocalStorage() {
    try {
        if (!currentUser || !currentUser.depo_id || !currentUser.kode_sales) {
            logger.warn('Cannot save cart: user not logged in');
            return;
        }
        
        const cartArray = Array.from(cart.entries());
        const storageKey = getCartStorageKey();
        
        if (cartArray.length > 0) {
            // Simpan dengan metadata user untuk validasi
            const cartData = {
                depo_id: currentUser.depo_id,
                kode_sales: currentUser.kode_sales,
                timestamp: Date.now(),
                items: cartArray
            };
            localStorage.setItem(storageKey, JSON.stringify(cartData));
            logger.log(`Saved ${cartArray.length} items to cart cache for user ${currentUser.kode_sales}`);
        } else {
            localStorage.removeItem(storageKey);
        }
        
    } catch (error) {
        logger.error('Error saving cart to localStorage:', error);
    }
}

/**
 * Load cart from localStorage dengan validasi user
 */
function loadCartFromLocalStorage() {
    try {
        if (!currentUser || !currentUser.depo_id || !currentUser.kode_sales) {
            logger.warn('Cannot load cart: user not logged in');
            return false;
        }
        
        const storageKey = getCartStorageKey();
        const storedCart = localStorage.getItem(storageKey);
        
        if (storedCart) {
            const cartData = JSON.parse(storedCart);
            
            // Validasi: pastikan cart milik user yang sedang login
            if (cartData.depo_id !== currentUser.depo_id || cartData.kode_sales !== currentUser.kode_sales) {
                logger.warn('Cart belongs to different user, clearing...', {
                    stored: { depo_id: cartData.depo_id, kode_sales: cartData.kode_sales },
                    current: { depo_id: currentUser.depo_id, kode_sales: currentUser.kode_sales }
                });
                localStorage.removeItem(storageKey);
                cart.clear();
                return false;
            }
            
            // Load items dari cart data
            const cartArray = cartData.items || [];
            cart.clear();
            cartArray.forEach(([productId, item]) => {
                cart.set(productId, item);
            });
            logger.log(`Loaded ${cart.size} items from cart cache for user ${currentUser.kode_sales}`);
            
            return true;
        }
        return false;
    } catch (error) {
        logger.error('Error loading cart from localStorage:', error);
        // Clear corrupted cart data
        if (currentUser) {
            const storageKey = getCartStorageKey();
            localStorage.removeItem(storageKey);
        }
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
let availablePromosGlobal = null; // Store filtered available promos for modal access

// Setup event listeners for detail harga buttons
function setupDetailHargaListeners() {
    logger.log('Setting up detail harga listeners');
    
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
        logger.log('Detail harga button clicked, productId:', productId);
        if (productId) {
            e.preventDefault();
            e.stopPropagation();
            showDetailHargaModal(productId);
        } else {
            logger.warn('ProductId not found in button dataset');
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
    
    logger.log('Modal close listeners setup:', {
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
        logger.warn(`Product data not found for ${productId}`);
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
        // Escape group name untuk keamanan XSS
        const groupNameEscaped = escapeHtml(groupData.name);
        const groupKeyEscaped = escapeHtml(groupData.key);
        
        html += `<div class="cart-group" data-cart-group="${groupKeyEscaped}">`;
        html += `<h4 class="cart-group-header">${groupNameEscaped}</h4>`;
        
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
            logger.warn('renderKeranjang: totalNettValue is 0 but basePrice exists:', {
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
            if (calcItem.discountAmount > 0) {
                promoDetails.push(`Diskon Reguler: ${formatCurrency(calcItem.discountAmount)}`);
            }
            if (itemGroupPromoDiscount > 0) {
                promoDetails.push(`Strata: ${formatCurrency(itemGroupPromoDiscount)}`);
            }
            if (itemBundlePromoDiscount > 0) {
                promoDetails.push(`Program Kawin: ${formatCurrency(itemBundlePromoDiscount)}`);
            }
            if (itemFreeProductDiscount > 0) {
                promoDetails.push(`Pot. Extra Barang: ${formatCurrency(itemFreeProductDiscount)}`);
            }
            if (itemInvoiceDiscount > 0) {
                promoDetails.push(`Invoice: ${formatCurrency(itemInvoiceDiscount)}`);
            }
            
            if (promoDetails.length > 0) {
                promoInfoHtml = `<div class="cart-item-promo">Promo: ${promoDetails.join(', ')}</div>`;
            }
        }
    }
    
    // Escape product data untuk keamanan XSS
    const productIdEscaped = escapeHtml(productId);
    const productNameEscaped = escapeHtml(item.productName || productId);
    
    return `
        <div class="cart-item" data-product-id="${productIdEscaped}">
            <div class="cart-item-info">
                <div class="cart-item-name-row">
                    <strong class="cart-item-name">${productNameEscaped}</strong>
                    <div class="cart-item-controls">
                        <div class="quantity-controls input-qty cart-qty-controls">
                            <button class="btn-qty btn-minus" data-unit="krt" data-action="minus" data-product-id="${productIdEscaped}">-</button>
                            <input type="tel" value="${vKrt}" min="0" class="qty-input input-krt ${krtClass}" data-unit="krt" data-product-id="${productIdEscaped}">
                            <button class="btn-qty btn-plus" data-unit="krt" data-action="plus" data-product-id="${productIdEscaped}">+</button>
                            <button class="btn-qty btn-minus" data-unit="box" data-action="minus" data-product-id="${productIdEscaped}" style="margin-left:4px;">-</button>
                            <input type="tel" value="${vBox}" min="0" class="qty-input input-box ${boxClass}" data-unit="box" data-product-id="${productIdEscaped}">
                            <button class="btn-qty btn-plus" data-unit="box" data-action="plus" data-product-id="${productIdEscaped}">+</button>
                        </div>
                        <button class="btn-remove cart-btn-remove" data-product-id="${productIdEscaped}">Hapus</button>
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
        logger.log('Calculation result:', result);
        logger.log('Total Nett values:', {
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
            
            logger.log('Final update summary bar:', {
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
            logger.warn('summary-bar-total element not found!');
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
        logger.error('Error calculating total:', error);
        logger.error('Error details:', error.stack);
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
        logger.log(`UI Update - Free Product Discount: Rp ${discountValue.toLocaleString('id-ID')}`);
    } else {
        logger.warn('Element #free-product-discount not found!');
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
        logger.log('Summary bar updated:', {
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
    
    logger.log('Calculation result updated:', result);
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
    
    logger.log('Final tagihan updated:', {
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
    
    // Reset all product nett prices to 0
    updateProductNettPrices({
        items: []
    });
    
    // Remove all upselling recommendations (strata)
    updateUpsellingRecommendations();
    
    // Remove all bundle promo upselling recommendations
    updateBundleUpsellingRecommendations();
    
    // Remove all upselling recommendations in calculation display
    updateCalculationUpsellingRecommendations();
    
    // Update final tagihan
    updateFinalTagihan();
    
    // Update summary bar
    const summaryBarTotal = document.getElementById('summary-bar-total');
    if (summaryBarTotal) {
        summaryBarTotal.textContent = 'Rp 0';
    }
    
    logger.log('Simulation reset');
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
    
    // Validate result.items
    if (!result.items || !Array.isArray(result.items) || result.items.length === 0) {
        alert('❌ Data item faktur tidak tersedia. Silakan hitung ulang.');
        return;
    }
    
    // Get voucher value
    const voucherInput = document.getElementById('voucher-input');
    const nominalVoucher = voucherInput ? parseNumInput(voucherInput.value) : 0;
    
    // Get user info
    const userRegion = escapeHtml(currentUser?.region_name || currentUser?.region || 'N/A');
    const userDepo = escapeHtml(currentUser?.depo_name || currentUser?.depo || 'N/A');
    // Extract kode sales from login_code (format: depo_id-kode_sales) or use kode_sales field
    const loginCode = currentUser?.login_code || '';
    const kodeSalesFromLogin = loginCode.includes('-') ? loginCode.split('-')[1] : null;
    const userSales = escapeHtml(currentUser?.kode_sales || kodeSalesFromLogin || 'N/A');
    const userName = escapeHtml(currentUser?.full_name || currentUser?.nama || currentUser?.NAMA || currentUser?.name || 'N/A');
    
    // Format currency helper (defined once, used throughout)
    const formatCurrency = (amount) => {
        const numAmount = parseFloat(amount) || 0;
        if (isNaN(numAmount) || !isFinite(numAmount)) {
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            }).format(0);
        }
        const roundedAmount = Math.round(numAmount);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(roundedAmount);
    };
    
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
        if (!qtyKrtTotal || qtyKrtTotal === 0 || isNaN(qtyKrtTotal) || !isFinite(qtyKrtTotal)) {
            // Fallback: calculate from cart
            const cartItem = cart.get(item.productId);
            if (cartItem) {
                const qtyKrt = cartItem.quantities?.krt || cartItem.quantities?.unit_1 || 0;
                const qtyBox = cartItem.quantities?.box || cartItem.quantities?.unit_2 || 0;
                const ratio = product.ratio_unit_2_per_unit_1 || 1;
                qtyKrtTotal = qtyKrt + (qtyBox / ratio);
            }
        }
        
        // Validate qtyKrtTotal
        if (isNaN(qtyKrtTotal) || !isFinite(qtyKrtTotal) || qtyKrtTotal < 0) {
            qtyKrtTotal = 0;
        }
        
        // Get hargaNettPerKrt from item or calculate
        let hargaNettPerKrt = item.hargaNettPerKrt;
        if (!hargaNettPerKrt || isNaN(hargaNettPerKrt) || !isFinite(hargaNettPerKrt)) {
            // Fallback: calculate from finalNett
            if (qtyKrtTotal > 0 && item.finalNett && !isNaN(item.finalNett) && isFinite(item.finalNett)) {
                hargaNettPerKrt = item.finalNett / qtyKrtTotal;
            } else {
                hargaNettPerKrt = 0;
            }
        }
        
        // Validate hargaNettPerKrt
        if (isNaN(hargaNettPerKrt) || !isFinite(hargaNettPerKrt) || hargaNettPerKrt < 0) {
            hargaNettPerKrt = 0;
        }
        
        // Get subtotalNett from item
        let subtotalNett = item.finalNett || 0;
        if (isNaN(subtotalNett) || !isFinite(subtotalNett) || subtotalNett < 0) {
            subtotalNett = 0;
        }
        
        // Escape product name and code for XSS protection
        const productCode = escapeHtml(product.code || item.productId || 'N/A');
        const productName = escapeHtml(product.name || 'N/A');
        
        fakturHtml += `
            <tr>
                <td class="item-name">${productCode} - ${productName}</td>
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
    
    fakturHtml += `</tbody></table>
        <div class="faktur-summary">
            <div class="summary-row"><span class="summary-label">Total Gross</span><span class="summary-value">${formatCurrency(result.basePrice || result.totalBasePrice || 0)}</span></div>
            <div class="summary-row discount-row"><span class="summary-label">(-) Diskon Reguler</span><span class="summary-value value-danger">- ${formatCurrency(result.principalDiscount || 0)}</span></div>
            <div class="summary-row discount-row"><span class="summary-label">(-) Pot. Strata</span><span class="summary-value value-danger">- ${formatCurrency(result.groupPromoDiscount || 0)}</span></div>
            <div class="summary-row discount-row"><span class="summary-label">(-) Program Kawin</span><span class="summary-value value-danger">- ${formatCurrency(result.bundlePromoDiscount || 0)}</span></div>
            <div class="summary-row discount-row"><span class="summary-label">(-) Diskon Invoice</span><span class="summary-value value-danger">- ${formatCurrency(result.invoiceDiscount || 0)}</span></div>
            <div class="summary-row on-faktur-row" style="border-top: 2px solid #333;"><span class="summary-label">Total Harga Nett</span><span class="summary-value">${formatCurrency(totalNett)}</span></div>
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
        logger.warn('Price detail modal not found, using alert');
        alert('Faktur:\n\nTotal Nett: ' + formatCurrency(totalNett) + '\nVoucher: -' + formatCurrency(nominalVoucher) + '\nFinal Tagihan: ' + formatCurrency(finalTagihan));
    }
}

/**
 * Update harga nett per product item setelah calculate
 */
function updateProductNettPrices(result) {
    // Allow empty result for reset scenario
    if (!result) result = { items: [] };
    if (!result.items) result.items = [];
    
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
    // If cart is empty, find all product items in DOM and reset them
    const productIdsToUpdate = cart.size > 0 
        ? Array.from(cart.keys())
        : Array.from(document.querySelectorAll('[data-product-pricing]')).map(el => el.getAttribute('data-product-pricing')).filter(id => id);
    
    productIdsToUpdate.forEach(productId => {
        if (!productId) return;
        
        const cartItem = cart.get(productId);
        const qtyKrt = cartItem?.quantities?.krt || cartItem?.quantities?.unit_1 || 0;
        const qtyBox = cartItem?.quantities?.box || cartItem?.quantities?.unit_2 || 0;
        const hasQty = qtyKrt > 0 || qtyBox > 0;
        
        // Show/hide nett summary - UPDATE SEMUA pricing divs (bisa ada di bundle dan group)
        const pricingDivs = document.querySelectorAll(`[data-product-pricing="${productId}"]`);
        logger.log(`updateProductNettPrices: Product ${productId}, hasQty=${hasQty}, found ${pricingDivs.length} pricing divs, item in result: ${!!itemMap.get(productId)}`);
        
        pricingDivs.forEach(pricingDiv => {
            pricingDiv.style.display = hasQty ? 'block' : 'none';
        });
        
        // Jika item tidak ada di result.items, set nilai ke 0 dan return
        const item = itemMap.get(productId);
        if (!item) {
            if (hasQty) {
                logger.warn(`Product ${productId} ada di cart tapi tidak ada di result.items`);
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
            logger.warn(`updateProductNettPrices: hargaNettPerKrt is 0 for product ${productId}: finalNett=${finalNett}, qtyKrtTotal=${qtyKrtTotal}, qtyKrt=${qtyKrt}, qtyBox=${qtyBox}, ratio=${ratio}, item.hargaNettPerKrt=${item.hargaNettPerKrt}`);
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

        // 2. Bundle Promo Discount for this item (proportional per promo berdasarkan QTY YANG DIGUNAKAN untuk package)
        // Item bisa masuk ke multiple bundle promos, jadi kita perlu hitung proporsi per promo
        // IMPORTANT: Proporsi berdasarkan QTY YANG DIGUNAKAN untuk membentuk package, bukan total qty
        // Example: Promo 1 krt bucket 1 + 1 krt bucket 2 → 3000 per paket
        //          Order: 1 krt bucket 1 + 2 krt bucket 2
        //          Package = min(1, 2) = 1 package
        //          Qty used: 1 (bucket 1) + 1 (bucket 2, dari 2 krt) = 2 krt
        //          Distribusi: 1/2 × 3000 = 1500 (bucket 1), 1/2 × 3000 = 1500 (bucket 2)
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
                let productBucketId = null;
                promoData.buckets.forEach((productsInBucket, bucketId) => {
                    if (productsInBucket.includes(productId)) {
                        isInPromo = true;
                        productBucketId = bucketId;
                    }
                });
                
                if (!isInPromo || !productBucketId) return;
                
                // Get groups for this promo (to get required qty per bucket)
                const groups = bundlePromoGroupsList?.filter(g => g.promo_id === promoId) || [];
                if (groups.length === 0) return;
                
                // Build maps for required qty and bucket assignment
                const requiredQtyPerBucket = new Map(); // bucketId -> requiredQty
                const unitPerBucket = new Map(); // bucketId -> unit
                const bucketIdForProduct = new Map(); // productId -> bucketId
                
                groups.forEach(group => {
                    const bucketId = group.bucket_id;
                    requiredQtyPerBucket.set(bucketId, parseFloat(group.total_quantity) || 0);
                    unitPerBucket.set(bucketId, group.unit || 'unit_1');
                    
                    const productsInBucket = promoData.buckets.get(bucketId) || [];
                    productsInBucket.forEach(pid => {
                        bucketIdForProduct.set(pid, bucketId);
                    });
                });
                
                // Calculate packages formed per bucket (same logic as calculateBundlePromoDiscount)
                const packagesPerBucket = new Map(); // bucketId -> packages
                
                groups.forEach(group => {
                    const bucketId = group.bucket_id;
                    const requiredQty = requiredQtyPerBucket.get(bucketId) || 0;
                    const unit = unitPerBucket.get(bucketId) || 'unit_1';
                    
                    if (requiredQty <= 0) return;
                    
                    // Calculate total qty in this bucket from cart
                    let totalQtyInBucket = 0;
                    const productsInBucket = promoData.buckets.get(bucketId) || [];
                    
                    productsInBucket.forEach(pid => {
                        const itQtyInfo = itemQtyMap.get(pid);
                        if (!itQtyInfo) return;
                        
                        const itQtyKrtTotal = itQtyInfo.qtyKrtTotal || 0;
                        
                        // Convert to appropriate unit if needed
                        if (unit === 'unit_1') {
                            totalQtyInBucket += itQtyKrtTotal;
                        } else {
                            // For unit_2 or unit_3, we need product ratio
                            // But since we're using qtyKrtTotal (already in krt), we'll use it as is
                            // If unit is different, we might need to convert, but for now use qtyKrtTotal
                            totalQtyInBucket += itQtyKrtTotal;
                        }
                    });
                    
                    // Calculate how many packages can be formed from this bucket
                    const packages = Math.floor(totalQtyInBucket / requiredQty);
                    packagesPerBucket.set(bucketId, packages);
                });
                
                if (packagesPerBucket.size === 0) return;
                
                // Number of complete packages = minimum of all buckets
                const completePackages = Math.min(...Array.from(packagesPerBucket.values()));
                
                if (completePackages <= 0) return;
                
                // Apply max_packages limit if exists
                const promo = bundlePromosList?.find(p => p.promo_id === promoId);
                const maxPackages = promo?.max_packages ? parseFloat(promo.max_packages) : null;
                const finalPackages = maxPackages ? Math.min(completePackages, maxPackages) : completePackages;
                
                // Calculate total qty USED for packages (2-level distribution)
                // Level 1: Calculate qty used per bucket (total dari semua produk dalam bucket)
                // Level 2: Distribute discount to bucket, then to products within bucket
                const qtyUsedPerBucket = new Map(); // bucketId -> qtyUsed (total untuk bucket)
                
                groups.forEach(group => {
                    const bucketId = group.bucket_id;
                    const requiredQty = requiredQtyPerBucket.get(bucketId) || 0;
                    
                    if (requiredQty <= 0) return;
                    
                    // Calculate total qty in this bucket from all products
                    let totalQtyInBucket = 0;
                    const productsInBucket = promoData.buckets.get(bucketId) || [];
                    
                    productsInBucket.forEach(pid => {
                        const itQtyInfo = itemQtyMap.get(pid);
                        if (itQtyInfo) {
                            totalQtyInBucket += itQtyInfo.qtyKrtTotal || 0;
                        }
                    });
                    
                    // Qty used untuk bucket = min(total qty dalam bucket, requiredQty × finalPackages)
                    const qtyUsed = Math.min(totalQtyInBucket, requiredQty * finalPackages);
                    qtyUsedPerBucket.set(bucketId, qtyUsed);
                });
                
                // Calculate total qty used (sum dari semua bucket)
                let totalQtyUsedInThisPromo = 0;
                qtyUsedPerBucket.forEach(qtyUsed => {
                    totalQtyUsedInThisPromo += qtyUsed;
                });
                
                if (totalQtyUsedInThisPromo <= 0) return;
                
                // Level 1: Calculate discount per bucket (proporsional berdasarkan qty used per bucket)
                const discountPerBucket = new Map(); // bucketId -> discount
                qtyUsedPerBucket.forEach((qtyUsed, bucketId) => {
                    const bucketProportion = qtyUsed / totalQtyUsedInThisPromo;
                    const bucketDiscount = promoDiscount * bucketProportion;
                    discountPerBucket.set(bucketId, bucketDiscount);
                });
                
                // Level 2: Distribute discount to products within bucket (proporsional berdasarkan qty actual per produk)
                // Use productBucketId that was already determined above (line 5598)
                if (productBucketId && discountPerBucket.has(productBucketId)) {
                    const bucketDiscount = discountPerBucket.get(productBucketId);
                    const qtyUsedForBucket = qtyUsedPerBucket.get(productBucketId) || 0;
                    
                    if (qtyUsedForBucket <= 0) return;
                    
                    // Calculate total qty actual per product in this bucket
                    const productsInBucket = promoData.buckets.get(productBucketId) || [];
                    let totalQtyActualInBucket = 0;
                    
                    productsInBucket.forEach(pid => {
                        const itQtyInfo = itemQtyMap.get(pid);
                        if (itQtyInfo) {
                            totalQtyActualInBucket += itQtyInfo.qtyKrtTotal || 0;
                        }
                    });
                    
                    if (totalQtyActualInBucket <= 0) return;
                    
                    // Distribute bucket discount to products proportionally based on actual qty
                    // Note: qtyUsedForBucket sudah di-limit, jadi kita distribusi berdasarkan actual qty
                    // tapi proporsinya tetap benar karena total qty actual >= qty used
                    const currentItemQty = itemQtyMap.get(productId)?.qtyKrtTotal || 0;
                    if (currentItemQty > 0) {
                        const productProportion = currentItemQty / totalQtyActualInBucket;
                        const itemDiscountForThisPromo = bucketDiscount * productProportion;
                    item.itemBundlePromoDiscount += itemDiscountForThisPromo;
                    item.bundlePromoDiscountByPromo[promoId] = itemDiscountForThisPromo;
                    }
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
                            logger.log(`%c ITEM DISCOUNT CALCULATION for ${productId} (${groupCode})`, 'background: #ffd43b; color: #000; font-weight: bold; padding: 2px 6px;');
                            logger.log(`Total discount for group ${groupCode}: Rp ${totalDiscountForThisGroup.toLocaleString('id-ID')}`);
                            logger.log(`Item qty: ${itemQtyInBox} box, Total group qty: ${totalQtyInGroup} box`);
                            logger.log(`Proportion: ${(qtyProportion * 100).toFixed(2)}%`);
                            logger.log(`Item discount: Rp ${item.itemFreeProductDiscount.toLocaleString('id-ID')}`);
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
            logger.warn(`calculateItemDetails: hargaNettPerKrt is 0 for product ${productId}: finalNett=${item.finalNett}, qtyKrtTotal=${qtyKrtTotal}`);
        }
    });
}

/**
 * Update nett summary visibility untuk semua produk di cart
 * Dipanggil setelah cart berubah (bukan hanya setelah calculate)
 */
function updateNettSummaryVisibility() {
    logger.log('updateNettSummaryVisibility called, cart size:', cart.size);
    
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
        logger.log(`Product ${productId}: hasQty=${hasQty}, found ${pricingDivs.length} pricing divs`);
        
        if (pricingDivs.length === 0) {
            logger.warn(`No pricing divs found for product ${productId}`);
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
    logger.log('showDetailHargaModal called for productId:', productId);
    
    const priceModal = document.getElementById('price-detail-modal');
    const priceModalTitle = document.getElementById('price-modal-title');
    const priceModalDetails = document.getElementById('price-modal-details');
    
    if (!priceModal || !priceModalTitle || !priceModalDetails) {
        logger.error('Modal elements not found:', {
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
        logger.error(`Product ${productId} not found`);
        return;
    }
    
    // Get cart item
    const cartItem = cart.get(productId);
    if (!cartItem) {
        logger.error(`Cart item ${productId} not found`);
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
                    <td class="label">Gross (Inc PPN)</td>
                    <td class="value">${formatCurrency(hargaDasarKrt)}</td>
                </tr>
                <tr>
                    <td class="label">Diskon Reguler</td>
                    <td class="value value-danger">- ${formatCurrency(discPrincipalPerKrt)}</td>
                </tr>
                <tr>
                    <td class="label">Pot. Strata</td>
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
                                <td class="label">Potongan Program Kawin</td>
                                <td class="value value-danger">- ${formatCurrency(discBundlePromoPerKrt)}</td>
                            </tr>
                        `;
                    } else if (promoIds.length === 1) {
                        // Only 1 promo, show simple
                        const promoId = promoIds[0];
                        const discountPerKrt = qtyKrtTotal > 0 ? (bundlePromoBreakdown[promoId] / qtyKrtTotal) : 0;
                        return `
                            <tr>
                                <td class="label">Potongan Program Kawin (${promoId})</td>
                                <td class="value value-danger">- ${formatCurrency(discountPerKrt)}</td>
                            </tr>
                        `;
                    } else {
                        // Multiple promos, show breakdown
                        let html = `
                            <tr>
                                <td class="label">Potongan Program Kawin</td>
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
                    <td class="label">Pot. Extra Barang</td>
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
                    // Cashback hanya berlaku untuk principal KSNI
                    const isKSNIProduct = product && product.principal_code === 'KSNI';
                    if (cashback.isAvailable && cashback.cashbackPercentage > 0 && isKSNIProduct) {
                        // Cashback per krt = reward (persentase) * harga nett per krt
                        const cashbackPerKrt = hargaNettPerKrt * (cashback.cashbackPercentage / 100);
                        const hargaSetelahCashback = Math.max(0, hargaNettPerKrt - cashbackPerKrt);
                        return `
                            <tr>
                                <td class="label">(-) Loyalty (${cashback.loyaltyClassName || cashback.loyaltyClassCode})</td>
                                <td class="value value-danger">- ${formatCurrency(cashbackPerKrt)}</td>
                            </tr>
                            <tr class="final-total-row" style="background-color: #e8f5e9; border-top: 2px solid #4caf50;">
                                <td class="label" style="font-weight: bold;">Harga Setelah Loyalty</td>
                                <td class="value" style="font-weight: bold; color: #2e7d32;">${formatCurrency(hargaSetelahCashback)}</td>
                            </tr>
                        `;
                    }
                    return '';
                })()}
            </tbody>
        </table>
        
        
        <div class="modal-info-box info">
            *Harga nett adalah harga setelah semua diskon diterapkan (Diskon Reguler, Pot. Strata, Program Kawin, dan Invoice Discount).
        </div>
    `;
    
    // SECURITY: Escape product code and name
    priceModalTitle.textContent = `Rincian Harga: ${escapeHtml(product.code)} - ${escapeHtml(product.name)}`;
    // Note: detailHtml contains formatted currency which is safe (numbers only)
    // but we still need to be careful - in production, consider using DOMPurify for complex HTML
    priceModalDetails.innerHTML = detailHtml;
    priceModal.style.display = 'block';
    
    logger.log('Modal detail harga ditampilkan');
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
        logger.error('Promo modal elements not found');
        return;
    }
    
    // Find group promo from filtered available promos (only shows available promos)
    // This ensures modal only shows promos that passed availability filter
    let groupPromo = null;
    if (availablePromosGlobal && availablePromosGlobal.strata) {
        groupPromo = availablePromosGlobal.strata.find(promo => 
            promo.product_group_code && promo.product_group_code.toLowerCase() === groupCode.toLowerCase()
        );
    }
    
    // Fallback: if not found in availablePromosGlobal, try to find from all promos
    // but check availability before showing
    if (!groupPromo) {
        const allGroupPromo = groupPromos.find(promo => 
            promo.product_group_code && promo.product_group_code.toLowerCase() === groupCode.toLowerCase()
        );
        
        // Check if this promo is available for current user
        if (allGroupPromo) {
            const storeTypeEl = document.getElementById('store-type');
            const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
            const userZona = currentUser?.zona || null;
            const userRegion = currentUser?.region_name || null;
            const userDepo = currentUser?.depo_id || null;
            
            if (isPromoAvailable(
                allGroupPromo.promo_id,
                'strata',
                promoAvailabilityRules,
                selectedStoreType,
                userZona,
                userRegion,
                userDepo
            )) {
                // Convert to format compatible with modal display
                groupPromo = {
                    promo_id: allGroupPromo.promo_id,
                    description: allGroupPromo.description,
                    product_group_code: allGroupPromo.product_group_code,
                    tier_mode: allGroupPromo.tier_mode,
                    tier_unit: allGroupPromo.tier_unit
                };
            }
        }
    }
    
    if (!groupPromo) {
        promoModalTitle.textContent = `📊 Info Promo - Group ${escapeHtml(groupCode)}`;
        // SECURITY: Use safe text insertion for static messages
        promoModalDetails.textContent = '';
        const p = document.createElement('p');
        p.textContent = 'Tidak ada promo yang tersedia untuk group ini.';
        promoModalDetails.appendChild(p);
        promoModal.style.display = 'block';
        return;
    }
    
    // Get tiers for this promo (use tiers from availablePromosGlobal if available)
    let promoTiers = [];
    if (availablePromosGlobal && availablePromosGlobal.strata) {
        const availablePromo = availablePromosGlobal.strata.find(p => p.promo_id === groupPromo.promo_id);
        if (availablePromo && availablePromo.tiers) {
            promoTiers = availablePromo.tiers;
        } else {
            promoTiers = groupPromoTiers.filter(tier => tier.promo_id === groupPromo.promo_id);
        }
    } else {
        promoTiers = groupPromoTiers.filter(tier => tier.promo_id === groupPromo.promo_id);
    }
    
    const formatCurrency = (amount) => {
        const roundedAmount = Math.round(amount || 0);
        return new Intl.NumberFormat('id-ID', {
            style: 'currency',
            currency: 'IDR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(roundedAmount);
    };
    
    // SECURITY: Escape all database values to prevent XSS
    let html = `
        <div style="margin-bottom: 15px;">
            <h4 style="color: #1e3a8a; margin-bottom: 10px;">${escapeHtml(groupPromo.promo_id || 'N/A')}</h4>
            <p style="color: #666; margin-bottom: 10px;">${escapeHtml(groupPromo.description || '-')}</p>
            <div style="font-size: 0.9em; color: #888;">
                <strong>Group:</strong> ${escapeHtml(groupPromo.product_group_code || '-')} | 
                <strong>Mode:</strong> ${escapeHtml(groupPromo.tier_mode || '-')} | 
                <strong>Unit:</strong> ${escapeHtml(groupPromo.tier_unit || '-')}
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
            // SECURITY: Escape numeric values (though less critical, still good practice)
            const minQty = escapeHtml(String(tier.min_qty || ''));
            const variantCount = tier.variant_count != null ? escapeHtml(String(tier.variant_count)) : '-';
            const discountFormatted = formatCurrency(tier.discount_per_unit); // formatCurrency already returns safe string
            
            if (groupPromo.tier_mode === "mix") {
                html += `<tr>
                    <td><strong>${minQty}</strong></td>
                    <td style="color: var(--success-color, #28a745); font-weight: bold;">${discountFormatted}</td>
                    <td>${variantCount}</td>
                </tr>`;
            } else {
                html += `<tr>
                    <td><strong>${minQty}</strong></td>
                    <td style="color: var(--success-color, #28a745); font-weight: bold;">${discountFormatted}</td>
                </tr>`;
            }
        });
        html += '</tbody></table>';
    } else {
        html += '<p style="color: #888; margin-top: 15px;">Tidak ada tier yang tersedia untuk promo ini.</p>';
    }
    
    promoModalTitle.textContent = `📊 Info Promo - Group ${groupCode}`;
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
        logger.error('Promo modal elements not found');
        return;
    }
    
    // Find bundle promo from filtered available promos (only shows available promos)
    // This ensures modal only shows promos that passed availability filter
    let bundlePromo = null;
    if (availablePromosGlobal && availablePromosGlobal.bundling) {
        bundlePromo = availablePromosGlobal.bundling.find(promo => promo.promo_id === promoId);
    }
    
    // Fallback: if not found in availablePromosGlobal, try to find from all promos
    // but check availability before showing
    if (!bundlePromo) {
        const allBundlePromo = bundlePromosList.find(promo => promo.promo_id === promoId);
        
        // Check if this promo is available for current user
        if (allBundlePromo) {
            const storeTypeEl = document.getElementById('store-type');
            const selectedStoreType = storeTypeEl ? storeTypeEl.value : 'grosir';
            const userZona = currentUser?.zona || null;
            const userRegion = currentUser?.region_name || null;
            const userDepo = currentUser?.depo_id || null;
            
            if (isPromoAvailable(
                allBundlePromo.promo_id,
                'bundling',
                promoAvailabilityRules,
                selectedStoreType,
                userZona,
                userRegion,
                userDepo
            )) {
                bundlePromo = allBundlePromo;
            }
        }
    }
    
    if (!bundlePromo) {
        promoModalTitle.textContent = `Info Promo - Paket ${escapeHtml(promoId)}`;
        // SECURITY: Use safe text insertion
        promoModalDetails.textContent = '';
        const p = document.createElement('p');
        p.textContent = 'Tidak ada promo yang tersedia untuk paket ini.';
        promoModalDetails.appendChild(p);
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
    
    // SECURITY: Escape all database values
    let html = `
        <div style="margin-bottom: 15px;">
            <h4 style="color: #1e3a8a; margin-bottom: 10px;">Paket ${escapeHtml(bundlePromo.promo_id || 'N/A')}</h4>
            <p style="color: #666; margin-bottom: 10px;">${escapeHtml(bundlePromo.description || '-')}</p>
            <div style="font-size: 0.9em; color: #888; margin-bottom: 10px;">
                <strong>${escapeHtml(bucketIds.join(', ') || '-')}</strong>
            </div>
            <div style="font-size: 0.9em; color: #888;">
                <strong>Diskon per paket:</strong> <span style="color: var(--success-color, #28a745); font-weight: bold;">${formatCurrency(bundlePromo.discount_per_package || 0)}</span>
                ${bundlePromo.max_packages ? ` | <strong>Max paket:</strong> ${escapeHtml(String(bundlePromo.max_packages))}` : ''}
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
                // SECURITY: Escape bucketId and productIds
                const safeBucketId = escapeHtml(bucketId);
                const safeProductIds = productIds.map(id => escapeHtml(id)).join(', ');
                html += `<div style="margin-bottom: 10px;">`;
                html += `<strong>${safeBucketId}:</strong> `;
                html += `<span style="font-size: 0.9em; color: #666;">${safeProductIds}</span>`;
                html += `</div>`;
            }
        });
        
        html += '</div>';
    }
    
    promoModalTitle.textContent = `🎁 Info Promo - Paket ${promoId}`;
    promoModalDetails.innerHTML = html;
    promoModal.style.display = 'block';
};