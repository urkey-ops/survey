// FILE: pwa-update-manager.js
// PURPOSE: Automatic PWA update detection and user prompt
// PLACE: Create this as a new file in your project root

/**
 * PWA Update Manager
 * Automatically detects service worker updates and prompts user to refresh
 */

class PWAUpdateManager {
    constructor() {
        this.registration = null;
        this.updateCheckInterval = 60000; // Check every 60 seconds
        this.hasUpdate = false;
        this.isUpdating = false;
        
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
            
            // Check for updates periodically
            this.startPeriodicUpdateCheck();
            
            // Check immediately on page load
            this.checkForUpdate();
            
        } catch (error) {
            console.error('[PWA UPDATE] Registration failed:', error);
        }
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
     */
    async checkForUpdate() {
        if (!this.registration) return;
        
        try {
            console.log('[PWA UPDATE] 🔍 Checking for updates...');
            await this.registration.update();
        } catch (error) {
            console.warn('[PWA UPDATE] Update check failed:', error);
        }
    }
    
    /**
     * Start periodic update checking
     */
    startPeriodicUpdateCheck() {
        setInterval(() => {
            if (!this.hasUpdate && !this.isUpdating) {
                this.checkForUpdate();
            }
        }, this.updateCheckInterval);
        
        console.log(`[PWA UPDATE] Periodic checking enabled (every ${this.updateCheckInterval / 1000}s)`);
    }
    
    /**
     * Show update prompt to user
     */
    showUpdatePrompt() {
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
                if (this.hasUpdate) {
                    this.showUpdatePrompt();
                }
            }, 300000);
        });
        
        console.log('[PWA UPDATE] 📢 Update banner displayed');
    }
    
    /**
     * Schedule delayed prompt (after survey completion)
     */
    scheduleDelayedPrompt() {
        // Listen for return to start screen
        const checkInterval = setInterval(() => {
            const appState = window.appState;
            if (appState && appState.currentQuestionIndex === 0) {
                clearInterval(checkInterval);
                this.displayUpdateBanner();
            }
        }, 2000);
        
        // Timeout after 30 minutes
        setTimeout(() => clearInterval(checkInterval), 1800000);
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
}

// Initialize update manager
const pwaUpdateManager = new PWAUpdateManager();

// Expose for admin panel use
window.pwaUpdateManager = pwaUpdateManager;

console.log('[PWA UPDATE] 📱 Auto-update system loaded');
