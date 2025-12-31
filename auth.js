// Authentication Logic using Supabase
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env.js';
import { logger } from './logger.js';

// Supabase configuration (loaded from env.js)

let supabase = null;

// Export function to get supabase instance
export function getSupabaseClient() {
    if (!supabase) {
        throw new Error('Supabase not initialized. Please call initAuth() first.');
    }
    return supabase;
}

// Initialize Supabase client
export async function initAuth() {
    try {
        if (!SUPABASE_URL || !SUPABASE_ANON_KEY || 
            SUPABASE_URL === 'YOUR_SUPABASE_URL' || 
            SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
            logger.warn('Supabase credentials not configured. Please update env.js with your credentials.');
            return;
        }
        
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        logger.log('Supabase initialized successfully');
    } catch (error) {
        logger.error('Supabase initialization error:', error);
        throw error;
    }
}

/**
 * Login function dengan hierarchy: region -> depo -> kode sales -> password
 * @param {string} regionCode - Kode region yang dipilih
 * @param {string} depoCode - Kode depo yang dipilih
 * @param {string} kodeSales - Kode sales yang diinput
 * @param {string} password - Password untuk Supabase Auth
 * @returns {Object} User data dari view_auth_session + Supabase Auth user
 */
export async function login(regionCode, depoCode, kodeSales, password) {
    try {
        if (!supabase) {
            throw new Error('Supabase not initialized. Please configure your credentials in env.js');
        }
        
        // Generate login_code dari depo_id + kode sales (format: depo_id-kode_sales)
        const loginCode = `${depoCode}-${kodeSales}`;
        
        logger.log('Login attempt:', {
            regionCode,
            depoCode,
            kodeSales,
            loginCode: loginCode
        });
        
        // Query view_auth_session berdasarkan login_code (tanpa filter aktif dulu untuk debugging)
        const { data: sessionDataAll, error: errorAll } = await supabase
            .from('view_auth_session')
            .select('*')
            .eq('login_code', loginCode);
        
        if (errorAll) {
            logger.error('Query error:', errorAll);
            throw new Error(`Error query database: ${errorAll.message}`);
        }
        
        logger.log('Records found:', sessionDataAll?.length || 0);
        if (sessionDataAll && sessionDataAll.length > 0) {
            logger.log('Record details:', {
                login_code: sessionDataAll[0].login_code,
                slot_is_active: sessionDataAll[0].slot_is_active,
                assignment_is_active: sessionDataAll[0].assignment_is_active,
                depo_id: sessionDataAll[0].depo_id,
                email: sessionDataAll[0].email
            });
        }
        
        // Filter untuk user aktif
        const activeUsers = (sessionDataAll || []).filter(user => 
            user.slot_is_active === true && user.assignment_is_active === true
        );
        
        if (activeUsers.length === 0) {
            if (sessionDataAll && sessionDataAll.length > 0) {
                // Ada data tapi tidak aktif
                const user = sessionDataAll[0];
                const inactiveReasons = [];
                if (user.slot_is_active !== true) inactiveReasons.push('Slot tidak aktif');
                if (user.assignment_is_active !== true) inactiveReasons.push('Assignment tidak aktif');
                throw new Error(`User ditemukan tapi tidak aktif: ${inactiveReasons.join(', ')}`);
            }
            throw new Error(`User tidak ditemukan dengan login_code: "${loginCode}". Pastikan depo (${depoCode}) dan kode sales (${kodeSales}) benar.`);
        }
        
        const sessionData = activeUsers[0];
        
        // Validasi depo_id sesuai dengan yang dipilih
        if (sessionData.depo_id !== depoCode) {
            throw new Error('Depo tidak sesuai');
        }
        
        // Cek apakah assignment masih aktif (cek tanggal efektif)
        const today = new Date();
        if (sessionData.assignment_effective_date && new Date(sessionData.assignment_effective_date) > today) {
            throw new Error('Assignment belum aktif');
        }
        if (sessionData.assignment_end_date && new Date(sessionData.assignment_end_date) < today) {
            throw new Error('Assignment sudah berakhir');
        }
        
        // Cek apakah slot masih aktif (cek tanggal efektif)
        if (sessionData.slot_effective_date && new Date(sessionData.slot_effective_date) > today) {
            throw new Error('Slot belum aktif');
        }
        
        // Dapatkan email dari view_auth_session
        const email = sessionData.email;
        if (!email) {
            throw new Error('Email tidak ditemukan untuk user ini');
        }
        
        // Login ke Supabase Auth menggunakan email + password
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });
        
        if (authError) {
            throw new Error('Password salah atau email tidak terdaftar di Supabase Auth');
        }
        
        // Combine data dari view_auth_session dengan Supabase Auth user
        // Ambil div_sls, job_title, depo_id untuk kebutuhan aplikasi
        const { password_text, ...userData } = sessionData;
        return {
            ...userData,
            div_sls: sessionData.div_sls, // Untuk menentukan store type yang bisa dipilih
            job_title: sessionData.job_title, // Job title user
            depo_id: sessionData.depo_id, // Untuk lookup zona dari view_area
            auth_user: authData.user,
            session: authData.session
        };
    } catch (error) {
        logger.error('Login error:', error);
        throw error;
    }
}

/**
 * Sign up function - Not used with view_auth_session
 * User registration should be handled through database admin
 */
export async function signUp(email, password) {
    throw new Error('Sign up tidak tersedia. Silakan hubungi administrator untuk membuat akun.');
}

/**
 * Logout function - Clear session from localStorage and Supabase Auth
 */
export async function logout() {
    try {
        // Sign out from Supabase Auth
        if (supabase) {
            await supabase.auth.signOut();
        }
        
        // Hapus session dari localStorage (gunakan key spesifik)
        localStorage.removeItem('price_engine_user_session');
        return true;
    } catch (error) {
        logger.error('Logout error:', error);
        // Clear localStorage even if signOut fails (gunakan key spesifik)
        localStorage.removeItem('price_engine_user_session');
        throw error;
    }
}

/**
 * Save user session to localStorage with expiration timestamp
 * Session expires after 24 hours (default) or custom duration
 * @param {Object} userData - User data to save
 * @param {number} expirationHours - Hours until expiration (default: 24)
 */
function saveUserSession(userData, expirationHours = 24) {
    try {
        const expirationTime = Date.now() + (expirationHours * 60 * 60 * 1000);
        const sessionData = {
            ...userData,
            _expiresAt: expirationTime,
            _savedAt: Date.now()
        };
        localStorage.setItem('price_engine_user_session', JSON.stringify(sessionData));
        logger.log('User session saved with expiration:', new Date(expirationTime).toISOString());
    } catch (error) {
        logger.error('Error saving user session:', error);
        throw error;
    }
}

/**
 * Check if session has expired
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
 * Clean expired session from localStorage
 */
function clearExpiredSession() {
    try {
        localStorage.removeItem('price_engine_user_session');
        logger.log('Expired session cleared from localStorage');
    } catch (error) {
        logger.error('Error clearing expired session:', error);
    }
}

/**
 * Get current user from localStorage (session)
 * Session disimpan setelah login berhasil
 * Validasi dengan Supabase Auth untuk memastikan session masih valid
 * Check expiration timestamp
 */
export async function getCurrentUser() {
    try {
        // Gunakan key spesifik untuk aplikasi ini agar tidak bentrok dengan aplikasi lain
        const sessionData = localStorage.getItem('price_engine_user_session');
        if (!sessionData) {
            return null;
        }
        
        const userData = JSON.parse(sessionData);
        
        // Check expiration
        if (isSessionExpired(userData)) {
            logger.warn('Session expired, clearing from localStorage');
            clearExpiredSession();
            return null;
        }
        
        // Remove internal fields before returning
        const { _expiresAt, _savedAt, ...user } = userData;
        
        // Validasi session dengan Supabase Auth (jika supabase sudah diinit)
        if (supabase) {
            try {
                const { data: { session }, error } = await supabase.auth.getSession();
                if (error || !session) {
                    // Session tidak valid atau expired, hapus dari localStorage
                    clearExpiredSession();
                    return null;
                }
                // Session valid, return user
                return user;
            } catch (authError) {
                // Jika ada error saat validasi, hapus session
                logger.error('Session validation error:', authError);
                clearExpiredSession();
                return null;
            }
        }
        
        // Jika supabase belum diinit, return user dari localStorage (untuk fallback)
        return user;
    } catch (error) {
        logger.error('Get current user error:', error);
        // Jika error, hapus session yang mungkin corrupt
        clearExpiredSession();
        return null;
    }
}

/**
 * Save user session (exported for use in app.js after login)
 * @param {Object} userData - User data to save
 */
export function saveSession(userData) {
    saveUserSession(userData, 24); // 24 hours expiration
}

/**
 * Get current session from localStorage
 */
export async function getCurrentSession() {
    try {
        const sessionData = localStorage.getItem('price_engine_user_session');
        if (!sessionData) {
            return null;
        }
        
        return JSON.parse(sessionData);
    } catch (error) {
        logger.error('Get current session error:', error);
        return null;
    }
}

// Listen to auth state changes
export function onAuthStateChange(callback) {
    if (!supabase) {
        return null;
    }
    
    return supabase.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });
}

// Export supabase client for advanced operations
export { supabase };

