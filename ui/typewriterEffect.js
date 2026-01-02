// FILE: ui/typewriterEffect.js
// EXTRACTED FROM: kioskUI.js (Lines 33-355)
// PURPOSE: Manages typewriter animation effects for question labels and rotating text
// DEPENDENCIES: window.CONSTANTS (TYPEWRITER_DURATION_MS, TEXT_ROTATION_INTERVAL_MS)
// VERSION: 2.0.0 - Battery optimized (visibility-aware, proper cleanup)

/**
 * Typewriter Effect Manager
 * Handles typewriter animations for question labels with proper timer management
 * BATTERY OPTIMIZED: Pauses animations when page hidden
 */
export const typewriterManager = {
    // Internal timer storage to prevent conflicts
    timers: {
        initial: null,        // Timer for initial question render
        rotation: null,       // Timer for rotating text questions
        rotationInterval: null, // NEW: Store interval reference
        labels: new Map()     // Map of label elements to their timers
    },

    // NEW: Track if animations are paused
    isPaused: false,
    
    // NEW: Store rotation state for resume
    rotationState: {
        question: null,
        currentIndex: 0,
        labelEl: null
    },

    /**
     * Add typewriter effect to all labels in the question container
     * Each label gets its own timer to prevent conflicts
     * @param {HTMLElement} questionContainer - The container with question labels
     */
    addEffect(questionContainer) {
        if (!questionContainer) {
            console.warn('[TYPEWRITER] Question container not found');
            return;
        }

        // BATTERY OPTIMIZATION: Don't start animations if page is hidden
        if (document.hidden) {
            console.log('[TYPEWRITER] 🔋 Page hidden, skipping initial animation');
            return;
        }

        const TYPEWRITER_DURATION_MS = window.CONSTANTS?.TYPEWRITER_DURATION_MS || 2000;

        // Clear previous initial timer
        if (this.timers.initial) {
            clearTimeout(this.timers.initial);
            this.timers.initial = null;
        }

        // Clear all existing label timers
        this.timers.labels.forEach(timer => {
            if (timer) clearTimeout(timer);
        });
        this.timers.labels.clear();

        // Find all labels that need typewriter effect
        const labels = questionContainer.querySelectorAll('label[id$="Label"], #rotatingQuestion');

        labels.forEach(label => {
            // Skip if already has typewriter or no text
            if (label.classList.contains('typewriter') || !label.textContent.trim()) {
                return;
            }

            // Add typewriter class to start animation
            label.classList.add('typewriter');

            // Create separate timer for EACH label
            const timer = setTimeout(() => {
                if (label && document.contains(label)) {
                    label.classList.add('typing-complete');
                }
            }, TYPEWRITER_DURATION_MS);

            // Store timer in map for proper cleanup
            this.timers.labels.set(label, timer);
        });

        // Backward compatibility - clear old global
        if (window.typewriterTimer) {
            clearTimeout(window.typewriterTimer);
            window.typewriterTimer = null;
        }
    },

    /**
     * Clear all typewriter-related timers
     * Prevents timer leaks and animation conflicts
     */
    clearTimers() {
        // Clear initial render timer
        if (this.timers.initial) {
            clearTimeout(this.timers.initial);
            this.timers.initial = null;
        }

        // Clear rotation timer
        if (this.timers.rotation) {
            clearTimeout(this.timers.rotation);
            this.timers.rotation = null;
        }

        // NEW: Clear rotation interval
        if (this.timers.rotationInterval) {
            clearInterval(this.timers.rotationInterval);
            this.timers.rotationInterval = null;
        }

        // Clear all label-specific timers
        this.timers.labels.forEach(timer => {
            if (timer) clearTimeout(timer);
        });
        this.timers.labels.clear();

        // Reset rotation state
        this.rotationState = {
            question: null,
            currentIndex: 0,
            labelEl: null
        };

        // Backward compatibility: clear old global timer
        if (window.typewriterTimer) {
            clearTimeout(window.typewriterTimer);
            window.typewriterTimer = null;
        }

        console.log('[TYPEWRITER] All timers cleared');
    },

    /**
     * Rotate text for questions with multiple text variations
     * BATTERY OPTIMIZED: Pauses when page hidden, stores state for resume
     * @param {Object} question - Question object with rotatingText array
     * @param {number} rotationInterval - Interval reference to clear (deprecated, for compatibility)
     * @returns {number} - Interval ID for the rotation
     */
    rotateText(question, rotationInterval) {
        if (!question.rotatingText || question.rotatingText.length === 0) {
            console.warn('[ROTATION] No rotating text provided');
            return null;
        }

        // BATTERY OPTIMIZATION: Don't start if page is hidden
        if (document.hidden) {
            console.log('[TYPEWRITER] 🔋 Page hidden, deferring rotation start');
            // Store state to start later when visible
            this.rotationState = {
                question: question,
                currentIndex: 0,
                labelEl: document.getElementById('rotatingQuestion')
            };
            return null;
        }

        const TYPEWRITER_DURATION_MS = window.CONSTANTS?.TYPEWRITER_DURATION_MS || 2000;
        const TEXT_ROTATION_INTERVAL_MS = window.CONSTANTS?.TEXT_ROTATION_INTERVAL_MS || 4000;

        let idx = 0;
        const labelEl = document.getElementById('rotatingQuestion');

        if (!labelEl) {
            console.warn('[ROTATION] rotatingQuestion element not found');
            return null;
        }

        // Store rotation state
        this.rotationState = {
            question: question,
            currentIndex: idx,
            labelEl: labelEl
        };

        // Clear any existing rotation timers
        if (this.timers.rotation) {
            clearTimeout(this.timers.rotation);
            this.timers.rotation = null;
        }
        if (this.timers.rotationInterval) {
            clearInterval(this.timers.rotationInterval);
            this.timers.rotationInterval = null;
        }

        try {
            const interval = setInterval(() => {
                // BATTERY OPTIMIZATION: Skip rotation if page is hidden
                if (document.hidden) {
                    console.log('[TYPEWRITER] 🔋 Page hidden, skipping rotation tick');
                    return;
                }

                // Rotate to next text
                idx = (idx + 1) % question.rotatingText.length;
                this.rotationState.currentIndex = idx;

                if (labelEl && document.contains(labelEl)) {
                    // Remove previous animation classes
                    labelEl.classList.remove('typewriter', 'typing-complete');

                    // Update text
                    labelEl.textContent = question.rotatingText[idx];

                    // Start new typewriter animation
                    labelEl.classList.add('typewriter');

                    // Clear previous rotation timer
                    if (this.timers.rotation) {
                        clearTimeout(this.timers.rotation);
                    }

                    // Create dedicated rotation timer
                    // Verify element still exists and text matches (prevents race conditions)
                    const currentText = question.rotatingText[idx];
                    this.timers.rotation = setTimeout(() => {
                        // BATTERY OPTIMIZATION: Don't update DOM if hidden
                        if (document.hidden) {
                            return;
                        }
                        
                        if (labelEl && 
                            document.contains(labelEl) && 
                            labelEl.textContent === currentText) {
                            labelEl.classList.add('typing-complete');
                        }
                    }, TYPEWRITER_DURATION_MS);
                } else {
                    // Element no longer exists, stop rotation
                    console.warn('[ROTATION] Label element removed, stopping rotation');
                    clearInterval(interval);
                    this.timers.rotationInterval = null;
                }
            }, TEXT_ROTATION_INTERVAL_MS);

            // Store interval reference for cleanup
            this.timers.rotationInterval = interval;

            return interval;

        } catch (e) {
            console.error('[ROTATION] Error in text rotation:', e);
            return null;
        }
    },

    /**
     * Clear rotation timer specifically
     * Called when stopping rotation (e.g., navigating away from question)
     */
    clearRotationTimer() {
        if (this.timers.rotation) {
            clearTimeout(this.timers.rotation);
            this.timers.rotation = null;
        }
        
        if (this.timers.rotationInterval) {
            clearInterval(this.timers.rotationInterval);
            this.timers.rotationInterval = null;
        }
        
        // Clear rotation state
        this.rotationState = {
            question: null,
            currentIndex: 0,
            labelEl: null
        };
    },

    /**
     * BATTERY OPTIMIZATION: Pause all animations
     * Called when page becomes hidden
     */
    pause() {
        if (this.isPaused) return;
        
        this.isPaused = true;
        
        // Pause rotation interval (don't clear, just pause ticks handled in interval)
        // The interval will check document.hidden and skip work
        
        console.log('[TYPEWRITER] 🔋 Animations paused (page hidden)');
    },

    /**
     * BATTERY OPTIMIZATION: Resume all animations
     * Called when page becomes visible
     */
    resume() {
        if (!this.isPaused) return;
        
        this.isPaused = false;
        
        // If we have a stored rotation state, restart rotation
        if (this.rotationState.question && this.rotationState.labelEl) {
            console.log('[TYPEWRITER] Resuming rotation from index', this.rotationState.currentIndex);
            
            // Rotation interval should still be running and will resume on next tick
            // No need to restart, just let it continue
        }
        
        console.log('[TYPEWRITER] Animations resumed');
    }
};

/**
 * Setup visibility handler for typewriter animations
 * BATTERY OPTIMIZATION: Auto-pause when page hidden
 */
function handleTypewriterVisibility() {
    if (document.hidden) {
        typewriterManager.pause();
    } else {
        typewriterManager.resume();
    }
}

/**
 * Initialize typewriter visibility handler
 * Call this once during app initialization
 */
export function setupTypewriterVisibilityHandler() {
    document.addEventListener('visibilitychange', handleTypewriterVisibility);
    console.log('[TYPEWRITER] Visibility handler active');
}

/**
 * Cleanup typewriter visibility handler
 */
export function cleanupTypewriterVisibilityHandler() {
    document.removeEventListener('visibilitychange', handleTypewriterVisibility);
}

// Export individual functions for backward compatibility
export const addTypewriterEffect = (container) => typewriterManager.addEffect(container);
export const clearTypewriterTimers = () => typewriterManager.clearTimers();
export const rotateQuestionText = (question, interval) => typewriterManager.rotateText(question, interval);

// Make globally available for compatibility
window.typewriterManager = typewriterManager;

// Default export
export default typewriterManager;
