// FILE: networkHandler.js
// PURPOSE: Network requests with retry logic and exponential backoff
// DEPENDENCIES: window.CONSTANTS

/**
 * Calculate exponential backoff delay
 * @param {number} attempt - Current retry attempt (1-indexed)
 * @returns {number} Delay in milliseconds
 */
function getExponentialBackoffDelay(attempt) {
    const RETRY_DELAY_MS = window.CONSTANTS?.RETRY_DELAY_MS || 2000;
    return RETRY_DELAY_MS * Math.pow(2, attempt - 1);
}

/**
 * Send HTTP request with retry logic
 * @param {string} endpoint - API endpoint URL
 * @param {Object} payload - Request payload
 * @param {number} maxRetries - Maximum retry attempts (default from CONSTANTS)
 * @returns {Promise<Object>} Response JSON
 */
export async function sendRequest(endpoint, payload, maxRetries = null) {
    const MAX_RETRIES = maxRetries || window.CONSTANTS?.MAX_RETRIES || 3;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`Server returned status: ${response.status}`);
            }
            
            const result = await response.json();
            return result;
            
        } catch (error) {
            if (attempt < MAX_RETRIES) {
                const delay = getExponentialBackoffDelay(attempt);
                console.warn(`[NETWORK] Attempt ${attempt}/${MAX_RETRIES} failed. Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                // Last attempt failed, throw error
                throw error;
            }
        }
    }
}

/**
 * Check if device is online
 * @returns {boolean} True if online
 */
export function isOnline() {
    return navigator.onLine;
}

/**
 * Wait for device to come online
 * @param {number} timeout - Maximum wait time in ms (default 30 seconds)
 * @returns {Promise<boolean>} True if came online, false if timeout
 */
export function waitForOnline(timeout = 30000) {
    return new Promise((resolve) => {
        if (navigator.onLine) {
            resolve(true);
            return;
        }
        
        const timeoutId = setTimeout(() => {
            window.removeEventListener('online', onlineHandler);
            resolve(false);
        }, timeout);
        
        const onlineHandler = () => {
            clearTimeout(timeoutId);
            window.removeEventListener('online', onlineHandler);
            resolve(true);
        };
        
        window.addEventListener('online', onlineHandler);
    });
}

/**
 * Test connection to endpoint
 * @param {string} endpoint - Endpoint to test
 * @returns {Promise<boolean>} True if reachable
 */
export async function testConnection(endpoint) {
    try {
        const response = await fetch(endpoint, {
            method: 'HEAD',
            cache: 'no-cache'
        });
        return response.ok;
    } catch (error) {
        console.warn('[NETWORK] Connection test failed:', error.message);
        return false;
    }
}

export default {
    sendRequest,
    isOnline,
    waitForOnline,
    testConnection
};
