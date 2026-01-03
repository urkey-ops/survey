// FILE: pwa-update-manager.js
// PURPOSE: Automatic PWA update detection and user prompt
// VERSION: 2.0.0 - Battery optimized (visibility-aware, efficient polling)

/**
 * PWA Update Manager
 * Automatically detects service worker updates and prompts user to refresh
 * BATTERY OPTIMIZED: Pauses checks when page hidden
 */

class PWAUpdateManager {
    constructor() {
        this.registration = null;
        this.updateCheckInterval = 86400000; // Check every 24 hours (86400000ms)
        this.hasUpdate = false;
        this.isUpdating = false;
        this.updateIntervalId = null; // NEW: Store interval reference
        this.delayedPromptIntervalId = null; // NEW: Store delayed prompt interval
        this.isPaused = false; // NEW: Track pause state
        
        this.init();
    }
    
    /**
     * Initialize update manager
     */
    async init() {
        if (!('serviceWorker' in navigator)) {
            console.log('[PWA UPDATE] Service Worker not supported');
            return;
        }
        
        try {
            // Register service worker with update checking
            this.registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('[PWA UPDATE] ✅ Update manager initialized');
            
            // Listen for updates
            this.setupUpdateListeners();
            
            // BATTERY OPTIMIZATION: Setup visibility handler
            this.setupVisibilityHandler();
            
            // Check for updates periodically
            this.startPeriodicUpdateCheck();
            
            // Check immediately on page load (only if visible)
            if (!document.hidden) {
                this.checkForUpdate();
            }
            
        } catch (error) {
            console.error('[PWA UPDATE] Registration failed:', error);
        }
    }
    
    /**
     * BATTERY OPTIMIZATION: Setup visibility handler
     */
    setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        });
    }
    
    /**
     * BATTERY OPTIMIZATION: Pause update checking
     */
    pause() {
        if (this.isPaused) return;
        
        this.isPaused = true;
        console.log('[PWA UPDATE] 🔋 Paused (page hidden)');
        
        // Note: We don't clear the 24-hour interval as it's infrequent
        // But we prevent checks from running via isPaused flag
    }
    
    /**
     * BATTERY OPTIMIZATION: Resume update checking
     */
    resume() {
        if (!this.isPaused) return;
        
        this.isPaused = false;
        console.log('[PWA UPDATE] Resumed (page visible)');
    }
    
    /**
     * Setup service worker update listeners
     */
    setupUpdateListeners() {
        if (!this.registration) return;
        
        // Listen for new service worker installing
        this.registration.addEventListener('updatefound', () => {
            console.log('[PWA UPDATE] 🔄 New version detected!');
            
            const newWorker = this.registration.installing;
            
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New service worker installed and ready
                    console.log('[PWA UPDATE] ✅ New version ready');
                    this.hasUpdate = true;
                    this.showUpdatePrompt();
                }
            });
        });
        
        // Listen for controller change (service worker activated)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!this.isUpdating) {
                console.log('[PWA UPDATE] Controller changed, reloading...');
                window.location.reload();
            }
        });
    }
    
    /**
     * Check for updates manually
     * BATTERY OPTIMIZED: Skips if page hidden
     */
    async checkForUpdate() {
        if (!this.registration) return;
        
        // BATTERY OPTIMIZATION: Skip check if page hidden
        if (this.isPaused || document.hidden) {
            console.log('[PWA UPDATE] 🔋 Skipping check (page hidden)');
            return;
        }
        
        try {
            console.log('[PWA UPDATE] 🔍 Checking for updates...');
            await this.registration.update();
        } catch (error) {
            console.warn('[PWA UPDATE] Update check failed:', error);
        }
    }
    
    /**
     * Start periodic update checking
     * BATTERY OPTIMIZED: Checks visibility before running
     */
    startPeriodicUpdateCheck() {
        this.updateIntervalId = setInterval(() => {
            // BATTERY OPTIMIZATION: Skip if paused or already has update
            if (this.isPaused || this.hasUpdate || this.isUpdating || document.hidden) {
                return;
            }
            
            this.checkForUpdate();
        }, this.updateCheckInterval);
        
        console.log(`[PWA UPDATE] Periodic checking enabled (every ${this.updateCheckInterval / 1000}s)`);
    }
    
    /**
     * Show update prompt to user
     */
    showUpdatePrompt() {
        // BATTERY OPTIMIZATION: Don't show if page hidden
        if (document.hidden) {
            console.log('[PWA UPDATE] 🔋 Page hidden, deferring prompt');
            // Will show when page becomes visible
            this.scheduleVisibilityPrompt();
            return;
        }
        
        // Check if we're on the start screen (don't interrupt active survey)
        const appState = window.appState;
        if (appState && appState.currentQuestionIndex > 0) {
            console.log('[PWA UPDATE] Survey in progress, delaying update prompt');
            // Will show prompt when they return to start screen
            this.scheduleDelayedPrompt();
            return;
        }
        
        this.displayUpdateBanner();
    }
    
    /**
     * BATTERY OPTIMIZATION: Show prompt when page becomes visible
     */
    scheduleVisibilityPrompt() {
        const handler = () => {
            if (!document.hidden && this.hasUpdate) {
                document.removeEventListener('visibilitychange', handler);
                this.showUpdatePrompt();
            }
        };
        
        document.addEventListener('visibilitychange', handler);
        
        // Cleanup after 1 hour
        setTimeout(() => {
            document.removeEventListener('visibilitychange', handler);
        }, 3600000);
    }
    
    /**
     * Display update banner
     */
    displayUpdateBanner() {
        // Remove existing banner if any
        const existing = document.getElementById('pwa-update-banner');
        if (existing) existing.remove();
        
        // Create banner
        const banner = document.createElement('div');
        banner.id = 'pwa-update-banner';
        banner.innerHTML = `
            <div style="
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 16px 20px;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                display: flex;
                align-items: center;
                justify-content: space-between;
                animation: slideDown 0.3s ease-out;
            ">
                <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
                    </svg>
                    <div>
                        <div style="font-weight: 600; font-size: 16px; margin-bottom: 2px;">
                            New Version Available
                        </div>
                        <div style="font-size: 13px; opacity: 0.9;">
                            Update now for the latest features and improvements
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px;">
                    <button id="pwa-update-later" style="
                        background: rgba(255,255,255,0.2);
                        border: 1px solid rgba(255,255,255,0.3);
                        color: white;
                        padding: 8px 16px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 500;
                        transition: all 0.2s;
                    ">
                        Later
                    </button>
                    <button id="pwa-update-now" style="
                        background: white;
                        border: none;
                        color: #667eea;
                        padding: 8px 20px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 14px;
                        font-weight: 600;
                        transition: all 0.2s;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    ">
                        Update Now
                    </button>
                </div>
            </div>
            <style>
                @keyframes slideDown {
                    from { transform: translateY(-100%); }
                    to { transform: translateY(0); }
                }
                #pwa-update-later:hover {
                    background: rgba(255,255,255,0.3);
                }
                #pwa-update-now:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                }
            </style>
        `;
        
        document.body.insertBefore(banner, document.body.firstChild);
        
        // Add event listeners
        document.getElementById('pwa-update-now').addEventListener('click', () => {
            this.applyUpdate();
        });
        
        document.getElementById('pwa-update-later').addEventListener('click', () => {
            banner.remove();
            // Show again in 5 minutes
            setTimeout(() => {
                if (this.hasUpdate && !document.hidden) {
                    this.showUpdatePrompt();
                }
            }, 300000);
        });
        
        console.log('[PWA UPDATE] 📢 Update banner displayed');
    }
    
    /**
     * Schedule delayed prompt (after survey completion)
     * BATTERY OPTIMIZED: Uses event-based approach instead of polling
     */
    scheduleDelayedPrompt() {
        // BETTER APPROACH: Listen for navigation instead of polling
        const checkOnce = () => {
            const appState = window.appState;
            if (appState && appState.currentQuestionIndex === 0) {
                // Back on start screen
                if (!document.hidden && this.hasUpdate) {
                    this.displayUpdateBanner();
                }
            }
        };
        
        // Check when visibility changes (user returns to tab)
        const visibilityHandler = () => {
            if (!document.hidden) {
                checkOnce();
                document.removeEventListener('visibilitychange', visibilityHandler);
            }
        };
        
        document.addEventListener('visibilitychange', visibilityHandler);
        
        // Also set up a single delayed check (as fallback)
        setTimeout(() => {
            checkOnce();
            document.removeEventListener('visibilitychange', visibilityHandler);
        }, 60000); // Check once after 1 minute
        
        console.log('[PWA UPDATE] Scheduled prompt after survey completion');
    }
    
    /**
     * Apply update and reload
     */
    async applyUpdate() {
        if (!this.registration || !this.registration.waiting) {
            console.warn('[PWA UPDATE] No waiting service worker');
            return;
        }
        
        this.isUpdating = true;
        
        // Show loading state
        const banner = document.getElementById('pwa-update-banner');
        if (banner) {
            banner.innerHTML = `
                <div style="
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 16px 20px;
                    z-index: 10000;
                    text-align: center;
                    font-weight: 600;
                ">
                    🔄 Updating... Please wait
                </div>
            `;
        }
        
        console.log('[PWA UPDATE] 🚀 Applying update...');
        
        // Tell waiting service worker to activate
        this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        
        // Reload will happen via controllerchange event
        // But add fallback just in case
        setTimeout(() => {
            window.location.reload();
        }, 1000);
    }
    
    /**
     * Force manual update check (for admin panel)
     */
    async forceUpdate() {
        console.log('[PWA UPDATE] 🔧 Force update triggered');
        
        await this.checkForUpdate();
        
        // If update available, apply immediately
        if (this.registration && this.registration.waiting) {
            this.applyUpdate();
        } else {
            console.log('[PWA UPDATE] No updates available');
            
            // Show feedback
            this.showToast('Already on latest version', 'success');
        }
    }
    
    /**
     * Show toast notification
     */
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.innerHTML = `
            <div style="
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: ${type === 'success' ? '#10b981' : '#3b82f6'};
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10001;
                animation: slideIn 0.3s ease-out;
            ">
                ${message}
            </div>
            <style>
                @keyframes slideIn {
                    from { transform: translateX(400px); }
                    to { transform: translateX(0); }
                }
            </style>
        `;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
    
    /**
     * Cleanup (if needed)
     */
    destroy() {
        if (this.updateIntervalId) {
            clearInterval(this.updateIntervalId);
            this.updateIntervalId = null;
        }
        
        if (this.delayedPromptIntervalId) {
            clearInterval(this.delayedPromptIntervalId);
            this.delayedPromptIntervalId = null;
        }
        
        console.log('[PWA UPDATE] Cleaned up');
    }
}

// Initialize update manager
const pwaUpdateManager = new PWAUpdateManager();

// Expose for admin panel use
window.pwaUpdateManager = pwaUpdateManager;

console.log('[PWA UPDATE] 📱 Auto-update system loaded (battery optimized)');
