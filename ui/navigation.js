// FILE: ui/navigation.js
// EXTRACTED FROM: kioskUI.js (Lines 580-850)
// PURPOSE: Survey navigation and question rendering
// DEPENDENCIES: window.dataUtils, window.appState, validation.js, typewriterEffect.js

/**
 * Navigation Handler
 * Manages survey question navigation, rendering, and progress tracking
 */

/**
 * Get dependencies from global scope
 */
function getDependencies() {
    return {
        appState: window.appState,
        dataUtils: window.dataUtils,
        dataHandlers: window.dataHandlers,
        globals: window.globals,
        typewriterManager: window.typewriterManager,
        timerManager: window.timerManager,
        validateQuestion: window.validateQuestion,
        clearErrors: window.clearErrors
    };
}

/**
 * Update the progress bar based on current question
 */
export function updateProgressBar() {
    const { globals, dataUtils } = getDependencies();
    const progressBar = globals?.progressBar;
    
    if (!progressBar) return;

    const totalQuestions = dataUtils.surveyQuestions.length;
    if (totalQuestions === 0) return;

    const { appState } = getDependencies();
    const progressPercentage = Math.min(
        ((appState.currentQuestionIndex + 1) / totalQuestions) * 100, 
        100
    );
    
    progressBar.style.width = `${progressPercentage}%`;
}

/**
 * Save current application state to localStorage
 */
function saveState() {
    const { appState, dataHandlers } = getDependencies();
    const STORAGE_KEY_STATE = window.CONSTANTS?.STORAGE_KEY_STATE || 'kioskAppState';
    
    dataHandlers.safeSetLocalStorage(STORAGE_KEY_STATE, {
        currentQuestionIndex: appState.currentQuestionIndex,
        formData: appState.formData,
        surveyStartTime: appState.surveyStartTime,
        questionStartTimes: appState.questionStartTimes,
        questionTimeSpent: appState.questionTimeSpent
    });
}

/**
 * Update form data for a specific field
 * @param {string} key - Field name
 * @param {*} value - Field value
 */
function updateData(key, value) {
    const { appState } = getDependencies();
    
    if (appState.formData[key] !== value) {
        appState.formData[key] = value;
        saveState();
    }
}

/**
 * Start tracking time for a question
 * @param {string} questionId - Question ID
 */
function startQuestionTimer(questionId) {
    const { appState } = getDependencies();
    appState.questionStartTimes[questionId] = Date.now();
    saveState();
}

/**
 * Stop tracking time for a question
 * @param {string} questionId - Question ID
 */
function stopQuestionTimer(questionId) {
    const { appState } = getDependencies();
    
    if (appState.questionStartTimes[questionId]) {
        const timeSpent = Date.now() - appState.questionStartTimes[questionId];
        appState.questionTimeSpent[questionId] = timeSpent;
        delete appState.questionStartTimes[questionId];
        saveState();
    }
}

/**
 * Setup input focus scroll behavior
 * Scrolls input fields into view when focused (mobile-friendly)
 */
function setupInputFocusScroll() {
    const { globals } = getDependencies();
    const questionContainer = globals?.questionContainer;
    
    if (!questionContainer) return;

    // Remove existing listener if present
    if (window.boundInputFocusHandler) {
        questionContainer.removeEventListener('focusin', window.boundInputFocusHandler);
    }

    window.boundInputFocusHandler = (event) => {
        const target = event.target;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            setTimeout(() => {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });
            }, 300);
        }
    };

    questionContainer.addEventListener('focusin', window.boundInputFocusHandler);
}

/**
 * Cleanup intervals and timers
 */
function cleanupIntervals() {
    const { timerManager } = getDependencies();
    
    if (timerManager && timerManager.clearIntervals) {
        timerManager.clearIntervals();
    } else {
        const { appState } = getDependencies();
        if (appState.rotationInterval) {
            clearInterval(appState.rotationInterval);
            appState.rotationInterval = null;
        }
    }
}

/**
 * Show a specific question by index
 * @param {number} index - Question index to display
 */
export function showQuestion(index) {
    const { globals, dataUtils, appState, typewriterManager } = getDependencies();
    const questionContainer = globals?.questionContainer;
    const nextBtn = globals?.nextBtn;
    const prevBtn = globals?.prevBtn;

    try {
        // Clear any validation errors
        if (window.clearErrors) {
            window.clearErrors();
        }
        
        const question = dataUtils.surveyQuestions[index];
        
        if (!question) {
            throw new Error(`Question at index ${index} is undefined`);
        }
        
        const renderer = dataUtils.questionRenderers[question.type];
        
        if (!renderer) {
            throw new Error(`No renderer found for question type: ${question.type}`);
        }

        // Start tracking time for this question
        startQuestionTimer(question.id);

        // Render the question
        questionContainer.innerHTML = renderer.render(question, appState.formData);

        // Add typewriter effect after rendering
        if (typewriterManager) {
            typewriterManager.addEffect(questionContainer);
        } else if (window.addTypewriterEffect) {
            window.addTypewriterEffect(questionContainer);
        }

        // Setup event handlers for the question
        if (renderer.setupEvents) {
            renderer.setupEvents(question, {
                handleNextQuestion: goNext,
                updateData: updateData
            });
        }

        // Handle rotating text if present
        if (question.rotatingText) {
            if (typewriterManager) {
                const interval = typewriterManager.rotateText(question, appState.rotationInterval);
                appState.rotationInterval = interval;
            } else if (window.rotateQuestionText) {
                window.rotateQuestionText(question);
            }
        }

        // Update navigation buttons
        prevBtn.disabled = index === 0;
        nextBtn.textContent = (index === dataUtils.surveyQuestions.length - 1) 
            ? 'Submit Survey' 
            : 'Next';
        nextBtn.disabled = false;

        // Update progress bar
        updateProgressBar();
        
        // Setup input focus scrolling
        setupInputFocusScroll();

    } catch (error) {
        console.error("[ERROR] Fatal error during showQuestion render:", error);
        cleanupIntervals();
        
        questionContainer.innerHTML = `
            <h2 class="text-xl font-bold text-red-600">
                A critical error occurred. Please refresh or contact support.
            </h2>
        `;
        
        // Log error to server if available
        if (window.logErrorToServer) {
            window.logErrorToServer(error, 'showQuestion');
        }
    }
}

/**
 * Navigate to the next question or submit survey
 */
export function goNext() {
    const { appState, dataUtils } = getDependencies();
    const currentQuestion = dataUtils.surveyQuestions[appState.currentQuestionIndex];

    // Validate current question
    const isValid = window.validateQuestion 
        ? window.validateQuestion(currentQuestion, appState.formData)
        : true;
        
    if (!isValid) {
        return;
    }

    // Stop timer for current question
    stopQuestionTimer(currentQuestion.id);

    // Cleanup animations and timers
    cleanupIntervals();
    
    if (window.clearErrors) {
        window.clearErrors();
    }

    // Move to next question or submit
    if (appState.currentQuestionIndex < dataUtils.surveyQuestions.length - 1) {
        appState.currentQuestionIndex++;
        saveState();
        showQuestion(appState.currentQuestionIndex);
    } else {
        submitSurvey();
    }
}

/**
 * Navigate to the previous question
 */
export function goPrev() {
    const { appState, dataUtils } = getDependencies();
    
    if (appState.currentQuestionIndex > 0) {
        // Stop timer for current question (going back)
        const currentQuestion = dataUtils.surveyQuestions[appState.currentQuestionIndex];
        stopQuestionTimer(currentQuestion.id);
        
        // Cleanup animations
        cleanupIntervals();

        // Go back
        appState.currentQuestionIndex--;
        saveState();
        showQuestion(appState.currentQuestionIndex);
    }
}

/**
 * Submit the completed survey
 */
function submitSurvey() {
    const { globals, appState, dataUtils, dataHandlers } = getDependencies();
    const questionContainer = globals?.questionContainer;
    const prevBtn = globals?.prevBtn;
    const nextBtn = globals?.nextBtn;
    const progressBar = globals?.progressBar;
    
    // Clear all timers
    if (window.uiHandlers && window.uiHandlers.clearAllTimers) {
        window.uiHandlers.clearAllTimers();
    }

    // Stop timer for last question
    const lastQuestion = dataUtils.surveyQuestions[appState.currentQuestionIndex];
    stopQuestionTimer(lastQuestion.id);
    
    // Ensure ID exists before submission
    if (!appState.formData.id) {
        appState.formData.id = dataHandlers.generateUUID();
        console.warn('[SUBMIT] Missing ID - generated new one:', appState.formData.id);
    }
    
    // Get total survey time
    const totalTimeSeconds = window.uiHandlers?.getTotalSurveyTime 
        ? window.uiHandlers.getTotalSurveyTime()
        : 0;
    
    // Prepare submission data
    const timestamp = new Date().toISOString();
    appState.formData.completionTimeSeconds = totalTimeSeconds;
    appState.formData.questionTimeSpent = appState.questionTimeSpent;
    appState.formData.completedAt = timestamp;
    appState.formData.timestamp = timestamp;
    appState.formData.sync_status = 'unsynced';

    console.log('[SUBMIT] Submitting survey with ID:', appState.formData.id);
    
    // Add to queue
    const MAX_QUEUE_SIZE = window.CONSTANTS?.MAX_QUEUE_SIZE || 100;
    const STORAGE_KEY_QUEUE = window.CONSTANTS?.STORAGE_KEY_QUEUE || 'submissionQueue';
    
    const submissionQueue = dataHandlers.getSubmissionQueue();
    if (submissionQueue.length >= MAX_QUEUE_SIZE) {
        console.warn(`[QUEUE] Queue full (${MAX_QUEUE_SIZE} records) - removing oldest entry`);
        submissionQueue.shift();
    }
    
    submissionQueue.push(appState.formData);
    dataHandlers.safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueue);
    
    // Record completion analytics
    dataHandlers.recordAnalytics('survey_completed', {
        questionIndex: appState.currentQuestionIndex,
        totalTimeSeconds: totalTimeSeconds,
        completedAllQuestions: true
    });

    // Update progress to 100%
    if (progressBar) {
        progressBar.style.width = '100%';
    }

    // Show completion screen
    questionContainer.innerHTML = `
        <div class="checkmark-container">
            <div class="checkmark-circle">
                <svg class="checkmark-icon" viewBox="0 0 52 52">
                    <path d="M14 27l9 9 19-19"/>
                </svg>
            </div>
            <div class="text-center">
                <h2 class="text-2xl font-bold text-gray-800 mb-2">Thank you for your feedback!</h2>
                <p id="resetCountdown" class="text-gray-500 text-lg font-medium">Kiosk resetting in 5 seconds...</p>
            </div>
        </div>
    `;

    prevBtn.disabled = true;
    nextBtn.disabled = true;

    // Start countdown to reset
    const RESET_DELAY_MS = window.CONSTANTS?.RESET_DELAY_MS || 5000;
    let timeLeft = RESET_DELAY_MS / 1000;

    appState.countdownInterval = setInterval(() => {
        timeLeft--;
        const countdownEl = document.getElementById('resetCountdown');

        if (countdownEl) {
            countdownEl.textContent = `Kiosk resetting in ${timeLeft} seconds...`;
        }

        if (timeLeft <= 0) {
            clearInterval(appState.countdownInterval);
            appState.countdownInterval = null;
            
            // Perform reset
            if (window.uiHandlers && window.uiHandlers.performKioskReset) {
                window.uiHandlers.performKioskReset();
            }
        }
    }, 1000);
}

/**
 * Get current question object
 * @returns {Object|null} Current question or null
 */
export function getCurrentQuestion() {
    const { appState, dataUtils } = getDependencies();
    return dataUtils.surveyQuestions[appState.currentQuestionIndex] || null;
}

/**
 * Get total number of questions
 * @returns {number} Total questions in survey
 */
export function getTotalQuestions() {
    const { dataUtils } = getDependencies();
    return dataUtils.surveyQuestions.length;
}

/**
 * Check if on first question
 * @returns {boolean} True if on first question
 */
export function isFirstQuestion() {
    const { appState } = getDependencies();
    return appState.currentQuestionIndex === 0;
}

/**
 * Check if on last question
 * @returns {boolean} True if on last question
 */
export function isLastQuestion() {
    const { appState } = getDependencies();
    return appState.currentQuestionIndex === getTotalQuestions() - 1;
}

/**
 * Jump to a specific question by index
 * @param {number} index - Question index
 * @returns {boolean} True if successful
 */
export function jumpToQuestion(index) {
    const totalQuestions = getTotalQuestions();
    
    if (index < 0 || index >= totalQuestions) {
        console.warn(`[NAVIGATION] Invalid question index: ${index}`);
        return false;
    }
    
    const { appState } = getDependencies();
    const currentQuestion = getCurrentQuestion();
    
    // Stop timer for current question
    if (currentQuestion) {
        stopQuestionTimer(currentQuestion.id);
    }
    
    // Update index and show question
    appState.currentQuestionIndex = index;
    saveState();
    showQuestion(index);
    
    return true;
}

// Default export
export default {
    showQuestion,
    goNext,
    goPrev,
    updateProgressBar,
    getCurrentQuestion,
    getTotalQuestions,
    isFirstQuestion,
    isLastQuestion,
    jumpToQuestion
};
