// FILE: ui/typewriterEffect.js
// EXTRACTED FROM: kioskUI.js (Lines 33-355)
// PURPOSE: Manages typewriter animation effects for question labels and rotating text
// DEPENDENCIES: window.CONSTANTS (TYPEWRITER_DURATION_MS, TEXT_ROTATION_INTERVAL_MS)

/**
 * Typewriter Effect Manager
 * Handles typewriter animations for question labels with proper timer management
 * Prevents timer conflicts between initial render and rotating text
 */
export const typewriterManager = {
    // Internal timer storage to prevent conflicts
    timers: {
        initial: null,        // Timer for initial question render
        rotation: null,       // Timer for rotating text questions
        labels: new Map()     // Map of label elements to their timers
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

        // Clear all label-specific timers
        this.timers.labels.forEach(timer => {
            if (timer) clearTimeout(timer);
        });
        this.timers.labels.clear();

        // Backward compatibility: clear old global timer
        if (window.typewriterTimer) {
            clearTimeout(window.typewriterTimer);
            window.typewriterTimer = null;
        }
    },

    /**
     * Rotate text for questions with multiple text variations
     * Uses dedicated timer to prevent conflicts with initial render
     * @param {Object} question - Question object with rotatingText array
     * @param {number} rotationInterval - Interval reference to clear
     * @returns {number} - Interval ID for the rotation
     */
    rotateText(question, rotationInterval) {
        if (!question.rotatingText || question.rotatingText.length === 0) {
            console.warn('[ROTATION] No rotating text provided');
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

        // Clear any existing rotation timer
        if (this.timers.rotation) {
            clearTimeout(this.timers.rotation);
            this.timers.rotation = null;
        }

        try {
            const interval = setInterval(() => {
                // Rotate to next text
                idx = (idx + 1) % question.rotatingText.length;

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
                        if (labelEl && 
                            document.contains(labelEl) && 
                            labelEl.textContent === currentText) {
                            labelEl.classList.add('typing-complete');
                        }
                    }, TYPEWRITER_DURATION_MS);
                }
            }, TEXT_ROTATION_INTERVAL_MS);

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
    }
};

// Export individual functions for backward compatibility
export const addTypewriterEffect = (container) => typewriterManager.addEffect(container);
export const clearTypewriterTimers = () => typewriterManager.clearTimers();
export const rotateQuestionText = (question, interval) => typewriterManager.rotateText(question, interval);

// Default export
export default typewriterManager;
