// Input Validation Utility Functions
// Centralized validation for user inputs to prevent security issues and data corruption

/**
 * Validate and sanitize string input
 * @param {string} input - Input string to validate
 * @param {Object} options - Validation options
 * @param {number} options.maxLength - Maximum length allowed
 * @param {number} options.minLength - Minimum length required
 * @param {RegExp} options.pattern - Regex pattern to match
 * @param {boolean} options.trim - Whether to trim whitespace (default: true)
 * @param {boolean} options.allowEmpty - Whether empty string is allowed (default: false)
 * @returns {Object} - { valid: boolean, value: string, error: string }
 */
export function validateString(input, options = {}) {
    const {
        maxLength = 1000,
        minLength = 0,
        pattern = null,
        trim = true,
        allowEmpty = false
    } = options;

    // Convert to string and trim if needed
    let value = input != null ? String(input) : '';
    if (trim) {
        value = value.trim();
    }

    // Check empty
    if (!allowEmpty && value.length === 0) {
        return {
            valid: false,
            value: '',
            error: 'Input tidak boleh kosong'
        };
    }

    // Check min length
    if (value.length > 0 && value.length < minLength) {
        return {
            valid: false,
            value: value,
            error: `Input harus minimal ${minLength} karakter`
        };
    }

    // Check max length
    if (value.length > maxLength) {
        return {
            valid: false,
            value: value.substring(0, maxLength),
            error: `Input tidak boleh lebih dari ${maxLength} karakter`
        };
    }

    // Check pattern
    if (pattern && value.length > 0 && !pattern.test(value)) {
        return {
            valid: false,
            value: value,
            error: 'Format input tidak valid'
        };
    }

    return {
        valid: true,
        value: value,
        error: null
    };
}

/**
 * Validate kode sales (alphanumeric, underscore, dash, space allowed)
 * More flexible to accommodate various kode sales formats
 * @param {string} input - Kode sales input
 * @returns {Object} - { valid: boolean, value: string, error: string }
 */
export function validateKodeSales(input) {
    return validateString(input, {
        minLength: 1,
        maxLength: 50,
        pattern: /^[a-zA-Z0-9_\s-]+$/, // Allow spaces too
        allowEmpty: false
    });
}

/**
 * Validate region/depo code (alphanumeric, space, dash, underscore, dot, slash)
 * More flexible to accommodate various code formats
 * Note: These usually come from dropdown, so pattern validation is lenient
 * @param {string} input - Region or depo code
 * @returns {Object} - { valid: boolean, value: string, error: string }
 */
export function validateRegionDepoCode(input) {
    // If empty, return invalid
    if (!input || String(input).trim().length === 0) {
        return {
            valid: false,
            value: '',
            error: 'Input tidak boleh kosong'
        };
    }
    
    // More permissive pattern - allow most common characters
    return validateString(input, {
        minLength: 1,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9\s_.\/-]+$/, // Allow dots and slashes too
        allowEmpty: false
    });
}

/**
 * Validate numeric input
 * @param {any} input - Input to validate as number
 * @param {Object} options - Validation options
 * @param {number} options.min - Minimum value
 * @param {number} options.max - Maximum value
 * @param {boolean} options.integer - Must be integer (default: false)
 * @param {boolean} options.positive - Must be positive (default: false)
 * @returns {Object} - { valid: boolean, value: number, error: string }
 */
export function validateNumber(input, options = {}) {
    const {
        min = null,
        max = null,
        integer = false,
        positive = false
    } = options;

    // Convert to number
    const numValue = Number(input);

    // Check if valid number
    if (isNaN(numValue)) {
        return {
            valid: false,
            value: 0,
            error: 'Input harus berupa angka'
        };
    }

    // Check integer
    if (integer && !Number.isInteger(numValue)) {
        return {
            valid: false,
            value: Math.round(numValue),
            error: 'Input harus berupa bilangan bulat'
        };
    }

    // Check positive
    if (positive && numValue < 0) {
        return {
            valid: false,
            value: 0,
            error: 'Input harus berupa bilangan positif'
        };
    }

    // Check min
    if (min !== null && numValue < min) {
        return {
            valid: false,
            value: numValue,
            error: `Input harus minimal ${min}`
        };
    }

    // Check max
    if (max !== null && numValue > max) {
        return {
            valid: false,
            value: numValue,
            error: `Input tidak boleh lebih dari ${max}`
        };
    }

    return {
        valid: true,
        value: integer ? Math.round(numValue) : numValue,
        error: null
    };
}

/**
 * Validate quantity input (positive integer, 0 or more)
 * @param {any} input - Quantity input
 * @param {number} maxQty - Maximum quantity allowed (optional)
 * @returns {Object} - { valid: boolean, value: number, error: string }
 */
export function validateQuantity(input, maxQty = null) {
    return validateNumber(input, {
        min: 0,
        max: maxQty,
        integer: true,
        positive: false // Allow 0
    });
}

/**
 * Sanitize input to prevent XSS
 * Remove or escape potentially dangerous characters
 * @param {string} input - Input to sanitize
 * @returns {string} - Sanitized string
 */
export function sanitizeInput(input) {
    if (input == null) return '';
    
    return String(input)
        .replace(/[<>]/g, '') // Remove < and >
        .trim();
}

/**
 * Validate email format (basic validation)
 * @param {string} email - Email address
 * @returns {Object} - { valid: boolean, value: string, error: string }
 */
export function validateEmail(email) {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return validateString(email, {
        minLength: 5,
        maxLength: 255,
        pattern: emailPattern,
        allowEmpty: false
    });
}

/**
 * Validate password strength (basic)
 * @param {string} password - Password to validate
 * @param {number} minLength - Minimum length (default: 6)
 * @returns {Object} - { valid: boolean, value: string, error: string }
 */
export function validatePassword(password, minLength = 6) {
    return validateString(password, {
        minLength: minLength,
        maxLength: 128,
        allowEmpty: false
    });
}
