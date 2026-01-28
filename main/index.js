// FILE: main/index.js
// PURPOSE: Main application entry point - orchestrates initialization
// DEPENDENCIES: All main sub-modules
// VERSION: 4.1.0 - CORRECTED: Removed aggressive proactive sync, true offline-first

import { initializeElements, validateElements, showCriticalError } from './uiElements.js';
import { setupNavigation, setupActivityTracking, initializeSurveyState } from './navigationSetup.js';
import { setupAdminPanel } from './adminPanel.js';
import { setupNetworkMonitoring } from './networkStatus.js';
import { setupVisibilityHandler } from './visibilityHandler.js';
import { setupInactivityVisibilityHandler } from '../timers/inactivityHandler.js';
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
        
        console.log(`[HEARTBEAT] ❤️ Kiosk alive | Queue: ${queue.length} | Analytics: ${analytics.length} | Question: ${appState.currentQuestionIndex + 1} | Online: ${navigator.onLine ? '✔' : '✗'}`);
    }, 15 * 60 * 1000); // Every 15 minutes
}

/**
 * Main initialization function
 * VERSION: 4.1.0 - CORRECTED: True offline-first, only auto-sync on critical
 */
function initialize() {
    console.log('[INIT] DOM Content Loaded - Initializing kiosk...');
    
    // Step 1: Initialize DOM element references
    initializeElements();
    
    // PRIORITY FIX #2: Enhanced storage quota check with AUTO-CLEANUP
    // CORRECTED: Only auto-sync on CRITICAL (80%+), not on warning (60%)
    try {
        const checkQuota = () => {
            if (window.dataHandlers && window.dataHandlers.checkStorageQuota) {
                const quotaStatus = window.dataHandlers.checkStorageQuota();
                
                if (quotaStatus.status === 'critical') {
                    console.error('[INIT] 🚨 Storage critical (80%+) - auto-sync triggered!');
                    
                    // AUTO-FIX: Force sync if online
                    if (navigator.onLine && window.dataHandlers.syncData) {
                        console.log('[INIT] 🔄 Auto-syncing to free storage...');
                        
                        window.dataHandlers.syncData(true).then((success) => {
                            if (success) {
                                console.log('[INIT] ✅ Emergency sync freed storage');
                                
                                // Verify storage improved
                                setTimeout(() => {
                                    const newStatus = window.dataHandlers.checkStorageQuota();
                                    console.log(`[INIT] Storage status after sync: ${newStatus.status} (${newStatus.percentUsed}%)`);
                                    
                                    if (newStatus.status === 'critical') {
                                        console.error('[INIT] ⚠️ Storage still critical after sync - may need manual intervention');
                                    }
                                }, 2000);
                            } else {
                                console.error('[INIT] ❌ Emergency sync failed');
                                
                                // Show persistent user alert
                                if (window.globals?.syncStatusMessage) {
                                    window.globals.syncStatusMessage.textContent = '⚠️ Storage full - please sync manually';
                                    window.globals.syncStatusMessage.style.color = '#dc2626';
                                    window.globals.syncStatusMessage.style.fontWeight = 'bold';
                                    
                                    // Make admin panel visible if it's hidden
                                    const adminControls = window.globals?.adminControls;
                                    if (adminControls && adminControls.classList.contains('hidden')) {
                                        console.log('[INIT] Auto-showing admin panel due to storage crisis');
                                        adminControls.classList.remove('hidden');
                                    }
                                }
                            }
                        }).catch(err => {
                            console.error('[INIT] Emergency sync error:', err);
                        });
                        
                    } else if (!navigator.onLine) {
                        console.error('[INIT] 🚨 Storage critical but OFFLINE - data loss risk!');
                        
                        // Alert user to the critical situation
                        if (window.globals?.syncStatusMessage) {
                            window.globals.syncStatusMessage.textContent = '🚨 Storage full & offline - connect to internet';
                            window.globals.syncStatusMessage.style.color = '#dc2626';
                            window.globals.syncStatusMessage.style.fontWeight = 'bold';
                        }
                        
                        // OFFLINE-FIRST: Wait for connection, then auto-sync
                        const onlineHandler = () => {
                            console.log('[INIT] Device online - attempting emergency sync');
                            if (window.dataHandlers.syncData) {
                                window.dataHandlers.syncData(true);
                            }
                            window.removeEventListener('online', onlineHandler);
                        };
                        window.addEventListener('online', onlineHandler);
                        
                    } else {
                        console.error('[INIT] 🚨 Storage critical but syncData not available!');
                    }
                    
                } else if (quotaStatus.status === 'warning') {
                    // CORRECTED: Log warning but DON'T auto-sync
                    // Let the 24-hour interval handle normal syncing
                    console.warn('[INIT] ⚠️ Storage at 60% - monitoring (normal sync will handle)');
                    
                } else {
                    console.log(`[INIT] ✅ Storage healthy: ${quotaStatus.percentUsed}% used`);
                }
            }
        };
        
        // Try immediately if dataHandlers ready
        if (window.dataHandlers) {
            checkQuota();
        }
        
        // Fallback: try again after 1 second if not ready yet
        setTimeout(() => {
            if (window.dataHandlers) {
                checkQuota();
            } else {
                console.warn('[INIT] dataHandlers not available - skipping storage check');
            }
        }, 1000);
        
        // Set up periodic storage checks (every 30 minutes)
        // This only MONITORS, it doesn't auto-sync unless critical
        setInterval(() => {
            if (window.dataHandlers && window.dataHandlers.checkStorageQuota) {
                const quotaStatus = window.dataHandlers.checkStorageQuota();
                
                if (quotaStatus.status === 'critical') {
                    console.error(`[STORAGE CHECK] 🚨 CRITICAL: ${quotaStatus.percentUsed}% used - triggering emergency sync`);
                    
                    // Trigger emergency sync if critical detected during periodic check
                    if (navigator.onLine && window.dataHandlers.syncData) {
                        window.dataHandlers.syncData(true);
                    }
                    
                } else if (quotaStatus.status === 'warning') {
                    console.warn(`[STORAGE CHECK] ⚠️ WARNING: ${quotaStatus.percentUsed}% used - monitor closely`);
                    
                } else if (quotaStatus.status === 'healthy') {
                    // Only log if we want verbose monitoring
                    // console.log(`[STORAGE CHECK] ✅ Healthy: ${quotaStatus.percentUsed}% used`);
                }
            }
        }, 30 * 60 * 1000); // Every 30 minutes
        
    } catch (err) {
        console.error('[INIT] Storage check failed:', err);
    }
    
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
    setupInactivityVisibilityHandler();
    console.log('[INIT] ✅ Inactivity visibility handler active');
    
    // Step 10: Setup typewriter visibility handler (battery optimization)
    setupTypewriterVisibilityHandler();
    console.log('[INIT] ✅ Typewriter visibility handler active');
    
    // Step 11: Start heartbeat logging
    startHeartbeat();
    console.log('[INIT] ✅ Heartbeat started (15 min interval)');
    
    console.log('[INIT] ✅ Initialization complete (battery optimized, safety enhanced, TRUE offline-first)');
    console.log('═══════════════════════════════════════════════════════════');
}

// Start initialization when DOM is ready
document.addEventListener('DOMContentLoaded', initialize);

// Export for testing or manual initialization
export { initialize };
export default { initialize };
