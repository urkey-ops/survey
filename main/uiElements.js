// FILE: main/uiElements.js
// PURPOSE: DOM element initialization and validation
// DEPENDENCIES: window.globals

/**
 * Initialize all DOM element references
 */
export function initializeElements() {
    console.log('[UI ELEMENTS] Initializing DOM references...');
    
    window.globals.questionContainer = document.getElementById('questionContainer');
    window.globals.nextBtn = document.getElementById('nextBtn');
    window.globals.prevBtn = document.getElementById('prevBtn');
    window.globals.mainTitle = document.getElementById('mainTitle');
    window.globals.progressBar = document.getElementById('progressBar');
    window.globals.kioskStartScreen = document.getElementById('kioskStartScreen');
    window.globals.kioskVideo = document.getElementById('kioskVideo');
    window.globals.adminControls = document.getElementById('adminControls');
    window.globals.syncButton = document.getElementById('syncButton');
    window.globals.adminClearButton = document.getElementById('adminClearButton');
    window.globals.hideAdminButton = document.getElementById('hideAdminButton');
    window.globals.unsyncedCountDisplay = document.getElementById('unsyncedCountDisplay');
    window.globals.syncStatusMessage = document.getElementById('syncStatusMessage');
    window.globals.syncAnalyticsButton = document.getElementById('syncAnalyticsButton');
}

/**
 * Validate that all critical DOM elements exist
 * @returns {Object} { valid: boolean, missingElements: Array }
 */
export function validateElements() {
    const missingElements = [];
    
    const requiredElements = {
        questionContainer: window.globals.questionContainer,
        nextBtn: window.globals.nextBtn,
        prevBtn: window.globals.prevBtn,
        mainTitle: window.globals.mainTitle,
        kioskStartScreen: window.globals.kioskStartScreen,
        kioskVideo: window.globals.kioskVideo
    };
    
    Object.entries(requiredElements).forEach(([name, element]) => {
        if (!element) {
            missingElements.push(name);
        }
    });
    
    return {
        valid: missingElements.length === 0,
        missingElements
    };
}

/**
 * Display critical error screen when elements are missing
 * @param {Array} missingElements - List of missing element IDs
 */
export function showCriticalError(missingElements) {
    console.error(`[UI ELEMENTS] ❌ CRITICAL ERROR: Missing essential HTML elements: ${missingElements.join(', ')}`);
    
    document.body.innerHTML = `
        <div style="padding: 50px; text-align: center; font-family: system-ui;">
            <h1 style="color: #dc2626; font-size: 24px; margin-bottom: 20px;">Application Error</h1>
            <p style="color: #6b7280; font-size: 16px;">Could not load survey interface.</p>
            <p style="color: #9ca3af; font-size: 14px; margin-top: 10px;">Missing elements: ${missingElements.join(', ')}</p>
            <button onclick="location.reload()" style="margin-top: 30px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px;">Reload Page</button>
        </div>
    `;
}

export default {
    initializeElements,
    validateElements,
    showCriticalError
};
