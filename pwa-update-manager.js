// FILE: pwa-update-manager.js
// PURPOSE: Automatic PWA update detection and user prompt
// VERSION: 2.2.0 - safer kiosk prompting, deduped timers, more robust banner/toast handling

class PWAUpdateManager {
    constructor() {
        this.registration = null;
        this.updateCheckInterval = 86400000; // 24 hours
        this.hasUpdate = false;
        this.isUpdating = false;
        this.updateIntervalId = null;
        this.delayedPromptTimeoutId = null;
        this.visibilityPromptTimeoutId = null;
        this.repromptTimeoutId = null;
        this.isPaused = false;
        this.isReloadingForUpdate = false;

        this.init();
    }

    async init() {
        if (!('serviceWorker' in navigator)) {
            console.log('[PWA UPDATE] Service Worker not supported');
            return;
        }

        try {
            this.registration = await navigator.serviceWorker.register('/service-worker.js');
            console.log('[PWA UPDATE] ✅ Update manager initialized');

            this.setupUpdateListeners();
            this.setupVisibilityHandler();
            this.startPeriodicUpdateCheck();

            if (!document.hidden) {
                this.checkForUpdate();
            }
        } catch (error) {
            console.error('[PWA UPDATE] Registration failed:', error);
        }
    }

    setupVisibilityHandler() {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        });
    }

    pause() {
        if (this.isPaused) return;
        this.isPaused = true;
        console.log('[PWA UPDATE] 🔋 Paused (page hidden)');
    }

    resume() {
        if (!this.isPaused) return;
        this.isPaused = false;
        console.log('[PWA UPDATE] Resumed (page visible)');

        if (!this.hasUpdate && !this.isUpdating) {
            this.checkForUpdate();
        } else if (this.hasUpdate) {
            this.showUpdatePrompt();
        }
    }

    setupUpdateListeners() {
        if (!this.registration) return;

        this.registration.addEventListener('updatefound', () => {
            console.log('[PWA UPDATE] 🔄 New version detected');

            const newWorker = this.registration.installing;
            if (!newWorker) return;

            newWorker.addEventListener('statechange', () => {
                console.log('[PWA UPDATE] Worker state:', newWorker.state);

                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    console.log('[PWA UPDATE] ✅ New version ready');
                    this.hasUpdate = true;
                    this.showUpdatePrompt();
                }
            });
        });

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (this.isReloadingForUpdate) return;
            this.isReloadingForUpdate = true;
            console.log('[PWA UPDATE] Controller changed, reloading once...');
            window.location.reload();
        });

        navigator.serviceWorker.addEventListener('message', (event) => {
            if (!event.data || !event.data.type) return;

            switch (event.data.type) {
                case 'SW_ACTIVATED':
                    console.log(`[PWA UPDATE] Service worker activated: v${event.data.version || 'unknown'}`);
                    break;
                case 'CACHE_CLEARED':
                    console.log('[PWA UPDATE] Cache cleared');
                    this.showToast('Cache cleared', 'success');
                    break;
                case 'VIDEO_RECACHED':
                    console.log('[PWA UPDATE] Video re-cached');
                    this.showToast('Video cache refreshed', 'success');
                    break;
                case 'BACKGROUND_SYNC':
                    console.log('[PWA UPDATE] Background sync signaled');
                    break;
                default:
                    break;
            }
        });
    }

    async checkForUpdate() {
        if (!this.registration) return;

        if (this.isPaused || document.hidden) {
            console.log('[PWA UPDATE] 🔋 Skipping check (page hidden)');
            return;
        }

        try {
            console.log('[PWA UPDATE] 🔍 Checking for updates...');
            await this.registration.update();

            this.registration = await navigator.serviceWorker.getRegistration('/') || this.registration;

            if (this.registration?.waiting) {
                console.log('[PWA UPDATE] ✅ Waiting worker already present');
                this.hasUpdate = true;
                this.showUpdatePrompt();
            }
        } catch (error) {
            console.warn('[PWA UPDATE] Update check failed:', error);
        }
    }

    startPeriodicUpdateCheck() {
        if (this.updateIntervalId) {
            clearInterval(this.updateIntervalId);
        }

        this.updateIntervalId = setInterval(() => {
            if (this.isPaused || this.hasUpdate || this.isUpdating || document.hidden) {
                return;
            }

            this.checkForUpdate();
        }, this.updateCheckInterval);

        console.log(`[PWA UPDATE] Periodic checking enabled (every ${this.updateCheckInterval / 1000}s)`);
    }

    isSurveyInProgress() {
        const appState = window.appState;
        return !!(appState && typeof appState.currentQuestionIndex === 'number' && appState.currentQuestionIndex > 0);
    }

    clearPromptTimers() {
        if (this.delayedPromptTimeoutId) {
            clearTimeout(this.delayedPromptTimeoutId);
            this.delayedPromptTimeoutId = null;
        }

        if (this.visibilityPromptTimeoutId) {
            clearTimeout(this.visibilityPromptTimeoutId);
            this.visibilityPromptTimeoutId = null;
        }

        if (this.repromptTimeoutId) {
            clearTimeout(this.repromptTimeoutId);
            this.repromptTimeoutId = null;
        }
    }

    showUpdatePrompt() {
        if (!this.hasUpdate || this.isUpdating) {
            return;
        }

        if (document.hidden) {
            console.log('[PWA UPDATE] 🔋 Page hidden, deferring prompt');
            this.scheduleVisibilityPrompt();
            return;
        }

        if (this.isSurveyInProgress()) {
            console.log('[PWA UPDATE] Survey in progress, delaying update prompt');
            this.scheduleDelayedPrompt();
            return;
        }

        this.displayUpdateBanner();
    }

    scheduleVisibilityPrompt() {
        if (this.visibilityPromptTimeoutId) {
            return;
        }

        const handler = () => {
            if (!document.hidden && this.hasUpdate && !this.isSurveyInProgress()) {
                document.removeEventListener('visibilitychange', handler);
                if (this.visibilityPromptTimeoutId) {
                    clearTimeout(this.visibilityPromptTimeoutId);
                    this.visibilityPromptTimeoutId = null;
                }
                this.showUpdatePrompt();
            }
        };

        document.addEventListener('visibilitychange', handler);

        this.visibilityPromptTimeoutId = setTimeout(() => {
            document.removeEventListener('visibilitychange', handler);
            this.visibilityPromptTimeoutId = null;
        }, 3600000);
    }

    displayUpdateBanner() {
        if (document.hidden || this.isSurveyInProgress() || this.isUpdating || !this.hasUpdate) {
            return;
        }

        const existing = document.getElementById('pwa-update-banner');
        if (existing) {
            return;
        }

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
                gap: 12px;
                animation: slideDown 0.3s ease-out;
            ">
                <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
                    </svg>
                    <div>
                        <div style="font-weight: 600; font-size: 16px; margin-bottom: 2px;">
                            New Version Available
                        </div>
                        <div style="font-size: 13px; opacity: 0.9;">
                            Update now for the latest fixes and improvements
                        </div>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; flex-shrink: 0;">
                    <button id="pwa-update-later" type="button" style="
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
                    <button id="pwa-update-now" type="button" style="
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

        const updateNowButton = document.getElementById('pwa-update-now');
        const updateLaterButton = document.getElementById('pwa-update-later');

        if (updateNowButton) {
            updateNowButton.addEventListener('click', () => {
                this.applyUpdate();
            });
        }

        if (updateLaterButton) {
            updateLaterButton.addEventListener('click', () => {
                banner.remove();

                if (this.repromptTimeoutId) {
                    clearTimeout(this.repromptTimeoutId);
                }

                this.repromptTimeoutId = setTimeout(() => {
                    this.repromptTimeoutId = null;
                    if (this.hasUpdate && !document.hidden && !this.isSurveyInProgress()) {
                        this.showUpdatePrompt();
                    }
                }, 300000);
            });
        }

        console.log('[PWA UPDATE] 📢 Update banner displayed');
    }

    scheduleDelayedPrompt() {
        if (this.delayedPromptTimeoutId) {
            return;
        }

        const tryShow = () => {
            if (!this.hasUpdate || this.isUpdating) return;
            if (document.hidden) return;

            if (!this.isSurveyInProgress()) {
                this.delayedPromptTimeoutId = null;
                this.displayUpdateBanner();
            }
        };

        const visibilityHandler = () => {
            if (!document.hidden) {
                tryShow();
                if (!this.isSurveyInProgress()) {
                    document.removeEventListener('visibilitychange', visibilityHandler);
                }
            }
        };

        document.addEventListener('visibilitychange', visibilityHandler);

        this.delayedPromptTimeoutId = setTimeout(() => {
            tryShow();
            document.removeEventListener('visibilitychange', visibilityHandler);
            this.delayedPromptTimeoutId = null;
        }, 60000);

        console.log('[PWA UPDATE] Scheduled prompt after survey completion');
    }

    async applyUpdate() {
        if (!this.registration) {
            console.warn('[PWA UPDATE] No registration found');
            return;
        }

        const latestRegistration = await navigator.serviceWorker.getRegistration('/');
        if (latestRegistration) {
            this.registration = latestRegistration;
        }

        if (!this.registration.waiting) {
            console.warn('[PWA UPDATE] No waiting service worker');
            this.showToast('No update ready yet', 'info');
            return;
        }

        this.isUpdating = true;
        this.clearPromptTimers();

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
        this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });

        setTimeout(() => {
            if (!this.isReloadingForUpdate) {
                this.isReloadingForUpdate = true;
                window.location.reload();
            }
        }, 1500);
    }

    async forceUpdate() {
        console.log('[PWA UPDATE] 🔧 Force update triggered');

        await this.checkForUpdate();

        const latestRegistration = await navigator.serviceWorker.getRegistration('/');
        if (latestRegistration) {
            this.registration = latestRegistration;
        }

        if (this.registration && this.registration.waiting) {
            this.applyUpdate();
        } else {
            console.log('[PWA UPDATE] No updates available');
            this.showToast('Already on latest version', 'success');
        }
    }

    showToast(message, type = 'info') {
        const existingToast = document.getElementById('pwa-update-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const color = type === 'success' ? '#10b981' : '#3b82f6';

        const toast = document.createElement('div');
        toast.id = 'pwa-update-toast';
        toast.innerHTML = `
            <div style="
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: ${color};
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
            if (toast.parentNode) {
                toast.remove();
            }
        }, 3000);
    }

    destroy() {
        if (this.updateIntervalId) {
            clearInterval(this.updateIntervalId);
            this.updateIntervalId = null;
        }

        this.clearPromptTimers();

        console.log('[PWA UPDATE] Cleaned up');
    }
}

const pwaUpdateManager = new PWAUpdateManager();
window.pwaUpdateManager = pwaUpdateManager;

console.log('[PWA UPDATE] 📱 Auto-update system loaded (single registration path)');
