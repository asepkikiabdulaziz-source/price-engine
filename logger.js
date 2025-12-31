// Logger utility for production/development mode control
// Usage: import { logger } from './logger.js';
// Then use: logger.log(), logger.warn(), logger.error(), logger.debug()
//
// Production Mode: Logs are disabled on non-localhost domains
// Development Mode: Logs are enabled on localhost or when window.DEBUG_MODE === true
// To force production mode: Set window.DEBUG_MODE = false in console
// To force development mode: Set window.DEBUG_MODE = true in console

const isDevelopment = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.includes('localhost') ||
    (window.DEBUG_MODE !== false && window.DEBUG_MODE === true) // Only true if explicitly set to true
);

const logger = {
    log: (...args) => {
        if (isDevelopment) {
            console.log(...args);
        }
    },
    
    warn: (...args) => {
        if (isDevelopment) {
            console.warn(...args);
        }
    },
    
    error: (...args) => {
        // Always log errors, even in production
        console.error(...args);
    },
    
    debug: (...args) => {
        if (isDevelopment || window.DEBUG_MODE === true) {
            console.debug(...args);
        }
    },
    
    info: (...args) => {
        if (isDevelopment) {
            console.info(...args);
        }
    },
    
    // Group methods for better organization
    group: (label) => {
        if (isDevelopment) {
            console.group(label);
        }
    },
    
    groupEnd: () => {
        if (isDevelopment) {
            console.groupEnd();
        }
    },
    
    // Conditional logging based on feature flags
    logIf: (condition, ...args) => {
        if (condition && isDevelopment) {
            console.log(...args);
        }
    }
};

export { logger, isDevelopment };


