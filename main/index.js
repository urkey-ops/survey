// FILE: main/index.js
// PURPOSE: Main application entry point - orchestrates initialization
// DEPENDENCIES: All main sub-modules
// VERSION: 2.0.0 - Battery optimized

import { initializeElements, validateElements, showCriticalError } from './uiElements.js';
import { setupNavigation, setupActivityTracking, initializeSurveyState } from './navigationSetup.js';
import { setupAdminPanel } from './adminPanel.js';
import { setupNetworkMonitoring } from './networkStatus.js';
import { setupVisibilityHandler } from './visibilityHandler.js';
import { setupInactivityVisibilityHandler } from '../timers/inactivityHandler.js'; // NEW
import { setupTypewriterVisibilityHandler } from '../ui/typewriterEffect.js';

/**
 * Start heartbeat logging - periodic system status
 */
function startHeartbeat() {
    const CONSTANTS = window.CONSTANTS;
    const appState = window.appState;
    const dataHandlers = window.dataHandlers;
    
    setInterval(() => {
        const queue = dataHandlers.getSubmissionQueue();
        const analytics = dataHandlers.safeGetLocalStorage(CONSTANTS.STORAGE_KEY_ANALYTICS) || [];
        
        console.log(`[HEARTBEAT] ❤️  Kiosk alive | Queue: ${queue.length} | Analytics: ${analytics.length} | Question: ${appState.currentQuestionIndex + 1} | Online: ${navigator.onLine ? '✓' : '✗'}`);
    }, 15 * 60 * 1000); // Every 15 minutes
}

/**
 * Main initialization function
 */
function initialize() {
    console.log('[INIT] DOM Content Loaded - Initializing kiosk...');
    
    // Step 1: Initialize DOM element references
    initializeElements();
    
    // Step 2: Validate all critical elements exist
    const validation = validateElements();
    if (!validation.valid) {
        showCriticalError(validation.missingElements);
        return;
    }
    
    console.log('[INIT] ✅ All essential elements found');
    
    // Step 3: Setup navigation
    setupNavigation();
    
    // Step 4: Setup activity tracking
    setupActivityTracking();
    
    // Step 5: Setup admin panel (if enabled)
    setupAdminPanel();
    
    // Step 6: Initialize survey state (resume or start fresh)
    initializeSurveyState();
    
    // Step 7: Setup network monitoring
    setupNetworkMonitoring();
    
    // Step 8: Setup visibility change handler (main app visibility)
    setupVisibilityHandler();
    
    // Step 9: Setup inactivity visibility handler (battery optimization)
    // NEW: Pauses/resumes inactivity listeners when tab hidden/visible
    setupInactivityVisibilityHandler();
    console.log('[INIT] ✅ Inactivity visibility handler active');
    
   // Step 10: Setup typewriter visibility handler (battery optimization)
setupTypewriterVisibilityHandler();
console.log('[INIT] ✅ Typewriter visibility handler active');

// Step 11: Start heartbeat logging
startHeartbeat();
console.log('[INIT] ✅ Heartbeat started (15 min interval)');
    
    console.log('[INIT] ✅ Initialization complete (battery optimized)');
    console.log('═══════════════════════════════════════════════════════');
}

// Start initialization when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);

// Export for testing or manual initialization
export { initialize };
export default { initialize };
