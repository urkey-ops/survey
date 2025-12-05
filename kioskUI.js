// FILE: kioskUI.js
// UPDATED: Priority fixes applied - memory leaks, missing analytics, proper cleanup

(function() {
    const { 
        INACTIVITY_TIMEOUT_MS, 
        SYNC_INTERVAL_MS, 
        RESET_DELAY_MS,
        STORAGE_KEY_STATE, 
        STORAGE_KEY_QUEUE,
        TYPEWRITER_DURATION_MS,
        TEXT_ROTATION_INTERVAL_MS,
        AUTO_ADVANCE_DELAY_MS
    } = window.CONSTANTS;
    const appState = window.appState;
    const { 
        safeSetLocalStorage, 
        safeGetLocalStorage,
        getSubmissionQueue, 
        recordAnalytics, 
        autoSync, 
        updateAdminCount, 
        syncData,
        generateUUID
    } = window.dataHandlers;
    
    // Store bound event handlers for proper cleanup
    let boundResetInactivityTimer = null;
    let boundStartSurvey = null;
    let boundInputFocusHandler = null;
    
    // ---------------------------------------------------------------------
    // --- UTILITIES ---
    // ---------------------------------------------------------------------
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    function clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => {
            el.textContent = '';
            el.classList.add('hidden');
        });
    }
    
    function clearAllTimers() {
        if (appState.inactivityTimer) {
            clearTimeout(appState.inactivityTimer);
            appState.inactivityTimer = null;
        }
        if (appState.syncTimer) {
            clearInterval(appState.syncTimer);
            appState.syncTimer = null;
        }
        if (appState.countdownInterval) {
            clearInterval(appState.countdownInterval);
            appState.countdownInterval = null;
        }
        cleanupIntervals();
        
        if (window.typewriterTimer) {
            clearTimeout(window.typewriterTimer);
            window.typewriterTimer = null;
        }
    }

    function cleanupIntervals() {
        if (appState.rotationInterval) {
            clearInterval(appState.rotationInterval);
            appState.rotationInterval = null;
        }
    }

    // ---------------------------------------------------------------------
    // --- ANALYTICS TRACKING ---
    // ---------------------------------------------------------------------
    
    function startSurveyTimer() {
        if (!appState.surveyStartTime) {
            appState.surveyStartTime = Date.now();
            saveState();
        }
    }

    function startQuestionTimer(questionId) {
        appState.questionStartTimes[questionId] = Date.now();
        saveState();
    }

    function stopQuestionTimer(questionId) {
        if (appState.questionStartTimes[questionId]) {
            const timeSpent = Date.now() - appState.questionStartTimes[questionId];
            appState.questionTimeSpent[questionId] = timeSpent;
            delete appState.questionStartTimes[questionId];
            saveState();
        }
    }

    function getTotalSurveyTime() {
        if (!appState.surveyStartTime) return 0;
        return Math.round((Date.now() - appState.surveyStartTime) / 1000);
    }

    function saveState() {
        safeSetLocalStorage(STORAGE_KEY_STATE, {
            currentQuestionIndex: appState.currentQuestionIndex,
            formData: appState.formData,
            surveyStartTime: appState.surveyStartTime,
            questionStartTimes: appState.questionStartTimes,
            questionTimeSpent: appState.questionTimeSpent
        });
    }

    function updateData(key, value) {
        if (appState.formData[key] !== value) {
            appState.formData[key] = value;
            saveState();
        }
    }

    // ---------------------------------------------------------------------
    // --- TYPEWRITER EFFECT ---
    // ---------------------------------------------------------------------
    

    function addTypewriterEffect(element, text) {
    if (!element) return;
    
    // Cancel existing typewriter animation
    if (element._typewriterTimer) {
        clearTimeout(element._typewriterTimer);
        element._typewriterTimer = null;
    }

    element.classList.remove('typewriter', 'typing-complete');

    // Reset text so animation plays cleanly
    element.textContent = text;

    // Restart CSS animation
    void element.offsetWidth; // <- reflow trick
    element.classList.add('typewriter');

    element._typewriterTimer = setTimeout(() => {
        element.classList.add('typing-complete');
    }, TYPEWRITER_DURATION_MS);
}


    // ---------------------------------------------------------------------
    // --- VALIDATION ---
    // ---------------------------------------------------------------------
    
    function validateQuestion(q) {
        clearErrors();
        const answer = appState.formData[q.name];
        let isValid = true;
        let errorMessage = '';

        const displayError = (id, message) => {
            const errorEl = document.getElementById(id);
            if (errorEl) {
                errorEl.textContent = message;
                errorEl.classList.remove('hidden');
            } else {
                console.warn(`Validation Error: Missing HTML element for ID '${id}' in question '${q.id}'`);
            }
        };

        // Handle checkbox validation (array)
        if (q.type === 'checkbox-with-other') {
            if (q.required && (!answer || !Array.isArray(answer) || answer.length === 0)) {
                errorMessage = 'Please select at least one option.';
                isValid = false;
            }
            
            // Check if "Other" is selected and validate the text field
            if (Array.isArray(answer) && answer.includes('Other')) {
                const otherValue = appState.formData['other_hear_about'];
                if (!otherValue || otherValue.trim() === '') {
                    displayError('other_hear_about_textError', 'Please specify other source.');
                    isValid = false;
                }
            }
        }
        // Handle standard required field validation
        else if (q.required && (!answer || (typeof answer === 'string' && answer.trim() === ''))) {
            errorMessage = 'This response is required.';
            isValid = false;
        }

        if (q.type === 'radio-with-other' && answer === 'Other') {
            const otherValue = appState.formData['other_location'];
            if (!otherValue || otherValue.trim() === '') {
                displayError('other_location_textError', 'Please specify your location.');
                isValid = false;
            }
        }

        if (q.type === 'custom-contact') {
            const consent = appState.formData['newsletterConsent'] === 'Yes';
            const name = appState.formData['name'];
            const email = appState.formData['email'];

            if (consent) {
                if (!name) {
                    displayError('nameError', 'Name is required for contact.');
                    isValid = false;
                }
                if (!email || !emailRegex.test(email)) {
                    displayError('emailError', 'Please enter a valid email address.');
                    isValid = false;
                }
            }
        }

        if (!isValid && errorMessage) {
            displayError(q.id + 'Error', errorMessage);
        }

        return isValid;
    }

    // ---------------------------------------------------------------------
    // --- TIMERS & UX ---
    // ---------------------------------------------------------------------

    function resetInactivityTimer() {
        // Clear existing timers
        if (appState.inactivityTimer) {
            clearTimeout(appState.inactivityTimer);
        }
        if (appState.syncTimer) {
            clearInterval(appState.syncTimer);
        }

        // Stop auto-reset if kiosk is hidden
        if (!window.isKioskVisible) {
            console.log('[VISIBILITY] Kiosk hidden - timers not started');
            return;
        }

        // Start auto-sync
        startPeriodicSync();

        // Main inactivity timer
        appState.inactivityTimer = setTimeout(() => {
            const idx = appState.currentQuestionIndex;
            const currentQuestion = window.dataUtils.surveyQuestions[idx];
            
            console.log(`[INACTIVITY] Detected at question ${idx + 1} (${currentQuestion.id})`);

            // PRIORITY FIX #2: Record analytics for Q1 abandonment
            if (idx === 0) {
                console.log('[INACTIVITY] Q1 abandonment - recording analytics before reset');
                
                // Record that user engaged with first question
                recordAnalytics('survey_abandoned', {
                    questionId: currentQuestion.id,
                    questionIndex: idx,
                    totalTimeSeconds: getTotalSurveyTime(),
                    reason: 'inactivity_q1',
                    partialData: {
                        satisfaction: appState.formData.satisfaction || null
                    }
                });
                
                performKioskReset();
                return;
            }

            // Q2–end inactivity → SAVE + RESET
            console.log('[INACTIVITY] Mid-survey abandonment - saving partial data');

            stopQuestionTimer(currentQuestion.id);
            const totalTimeSeconds = getTotalSurveyTime();

            // Prepare partial submission
            const timestamp = new Date().toISOString();
            appState.formData.completionTimeSeconds = totalTimeSeconds;
            appState.formData.questionTimeSpent = appState.questionTimeSpent;
            appState.formData.abandonedAt = timestamp;
            appState.formData.abandonedAtQuestion = currentQuestion.id;
            appState.formData.abandonedAtQuestionIndex = idx;
            appState.formData.timestamp = timestamp;
            appState.formData.sync_status = 'unsynced (inactivity)';

            // PRIORITY FIX #3: Check queue size before adding
            const submissionQueue = getSubmissionQueue();
            if (submissionQueue.length >= 100) {
                console.warn('[QUEUE] Queue full (100 records) - removing oldest entry');
                submissionQueue.shift();
            }

            submissionQueue.push(appState.formData);
            safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueue);

            recordAnalytics('survey_abandoned', {
                questionId: currentQuestion.id,
                questionIndex: idx,
                totalTimeSeconds,
                reason: 'inactivity'
            });

            performKioskReset();
        }, INACTIVITY_TIMEOUT_MS);
    }

    function startPeriodicSync() {
        appState.syncTimer = setInterval(autoSync, SYNC_INTERVAL_MS);
    }

   function rotateQuestionText(q) {
    let idx = 0;

    const labelEl = document.getElementById('rotatingQuestion');
    if (!labelEl) return;

    // Clear any previous intervals/timers safely
    cleanupIntervals();
    if (window.typewriterTimer) {
        clearTimeout(window.typewriterTimer);
        window.typewriterTimer = null;
    }

    try {
        // Immediately show first text before interval starts
        if (q.rotatingText && q.rotatingText.length > 0) {
            labelEl.classList.remove('typewriter', 'typing-complete');
            labelEl.textContent = q.rotatingText[0];

            // Trigger typing effect
            window.typewriterTimer = setTimeout(() => {
                if (labelEl) {
                    labelEl.classList.add('typing-complete');
                }
            }, TYPEWRITER_DURATION_MS);
        }

        // Start rotation loop
        appState.rotationInterval = setInterval(() => {
            if (!q.rotatingText || q.rotatingText.length === 0) return;

            idx = (idx + 1) % q.rotatingText.length;

            // Reset classes
            labelEl.classList.remove('typewriter', 'typing-complete');

            // Set new text
            labelEl.textContent = q.rotatingText[idx];

            // Clear previous timer
            if (window.typewriterTimer) {
                clearTimeout(window.typewriterTimer);
            }

            // Trigger typing animation
            window.typewriterTimer = setTimeout(() => {
                if (labelEl) {
                    labelEl.classList.add('typing-complete');
                }
            }, TYPEWRITER_DURATION_MS);

        }, TEXT_ROTATION_INTERVAL_MS);

    } catch (e) {
        console.error("[ROTATION] Error in text rotation:", e);
        cleanupIntervals();
    }
}


    

    function addInactivityListeners() {
        boundResetInactivityTimer = resetInactivityTimer.bind(null);
        
        document.addEventListener('mousemove', boundResetInactivityTimer);
        document.addEventListener('keydown', boundResetInactivityTimer);
        document.addEventListener('touchstart', boundResetInactivityTimer);
    }
    
    function removeInactivityListeners() {
        if (boundResetInactivityTimer) {
            document.removeEventListener('mousemove', boundResetInactivityTimer);
            document.removeEventListener('keydown', boundResetInactivityTimer);
            document.removeEventListener('touchstart', boundResetInactivityTimer);
            boundResetInactivityTimer = null;
        }
    }
    
    // PRIORITY FIX #4: Proper cleanup for input focus listeners
    function setupInputFocusScroll() {
        const questionContainer = window.globals.questionContainer;
        if (!questionContainer) return;

        // Remove existing listener if present
        if (boundInputFocusHandler) {
            questionContainer.removeEventListener('focusin', boundInputFocusHandler);
        }

        boundInputFocusHandler = (event) => {
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

        questionContainer.addEventListener('focusin', boundInputFocusHandler);
    }
    
    function cleanupInputFocusScroll() {
        const questionContainer = window.globals.questionContainer;
        if (questionContainer && boundInputFocusHandler) {
            questionContainer.removeEventListener('focusin', boundInputFocusHandler);
            boundInputFocusHandler = null;
        }
    }
    
    // ---------------------------------------------------------------------
    // --- NAVIGATION & RENDERING ---
    // ---------------------------------------------------------------------

    function updateProgressBar() {
        const progressBar = window.globals.progressBar;
        if (!progressBar) return;

        const totalQuestions = window.dataUtils.surveyQuestions.length;
        if (totalQuestions === 0) return;

        const progressPercentage = Math.min(((appState.currentQuestionIndex + 1) / totalQuestions) * 100, 100);
        progressBar.style.width = `${progressPercentage}%`;
    }

    function showQuestion(index) {
        const questionContainer = window.globals.questionContainer;
        const nextBtn = window.globals.nextBtn;
        const prevBtn = window.globals.prevBtn;

        try {
            clearErrors();
            const q = window.dataUtils.surveyQuestions[index];
            
            if (!q) {
                throw new Error(`Question at index ${index} is undefined`);
            }
            
            const renderer = window.dataUtils.questionRenderers[q.type];
            
            if (!renderer) {
                throw new Error(`No renderer found for question type: ${q.type}`);
            }

            // Start tracking time for this question
            startQuestionTimer(q.id);

            questionContainer.innerHTML = renderer.render(q, appState.formData);

            // Add typewriter effect after rendering
            addTypewriterEffect();

// Attach renderer event handlers safely
if (renderer.setupEvents) {
    renderer.setupEvents(q, {
        handleNextQuestion: goNext,
        updateData: updateData
    });
}

// Start rotating text (if this question uses it)
if (Array.isArray(q.rotatingText) && q.rotatingText.length > 0) {
    rotateQuestionText(q);
} else {
    // If no rotating text, clear any previous intervals
    cleanupIntervals();
}

// Buttons
prevBtn.disabled = index === 0;

const isLast = index === window.dataUtils.surveyQuestions.length - 1;
nextBtn.textContent = isLast ? 'Submit Survey' : 'Next';
nextBtn.disabled = false;

// UI helpers
updateProgressBar();
setupInputFocusScroll();


    function logErrorToServer(error, context) {
        try {
            const errorData = {
                error: error.message,
                stack: error.stack,
                context: context,
                timestamp: new Date().toISOString(),
                kioskId: window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
                surveyId: appState.formData.id
            };
            
            fetch('/api/log-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(errorData)
            }).catch(() => {
                console.warn('[ERROR] Failed to log error to server');
            });
        } catch (e) {
            // Silent fail for error logging
        }
    }

    function goNext() {
        const currentQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];

        if (!validateQuestion(currentQuestion)) {
            return;
        }

        // Stop timer for current question
        stopQuestionTimer(currentQuestion.id);

        cleanupIntervals();
        clearErrors();

        if (appState.currentQuestionIndex < window.dataUtils.surveyQuestions.length - 1) {
            appState.currentQuestionIndex++;
            saveState();
            showQuestion(appState.currentQuestionIndex);
        } else {
            submitSurvey();
        }
    }

    function goPrev() {
        if (appState.currentQuestionIndex > 0) {
            // Stop timer for current question (going back)
            const currentQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];
            stopQuestionTimer(currentQuestion.id);
            
            cleanupIntervals();

            appState.currentQuestionIndex--;
            saveState();
            showQuestion(appState.currentQuestionIndex);
        }
    }

    // ---------------------------------------------------------------------
    // --- VIDEO START SCREEN LOGIC ---
    // ---------------------------------------------------------------------
    
    function cleanupStartScreenListeners() {
        const kioskStartScreen = window.globals.kioskStartScreen;
        
        if (boundStartSurvey && kioskStartScreen) {
            kioskStartScreen.removeEventListener('click', boundStartSurvey);
            kioskStartScreen.removeEventListener('touchstart', boundStartSurvey);
            boundStartSurvey = null;
        }
    }
    
    function startSurvey(e) {
        const kioskStartScreen = window.globals.kioskStartScreen;
        const kioskVideo = window.globals.kioskVideo;
        
        // Prevent multiple calls
        if (!kioskStartScreen || kioskStartScreen.classList.contains('hidden')) {
            return;
        }
        
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        
        console.log('[START] Starting survey...');
        
        // Remove event listeners immediately
        cleanupStartScreenListeners();
        
        kioskStartScreen.classList.add('hidden');
        
        if (kioskVideo) {
            kioskVideo.pause();
        }
        
        // PRIORITY FIX #1: Use proper reference to generateUUID
        if (!appState.formData.id) {
            appState.formData.id = window.dataHandlers.generateUUID();
            console.log('[START] Generated new survey ID:', appState.formData.id);
        }
        if (!appState.formData.timestamp) {
            appState.formData.timestamp = new Date().toISOString();
        }
        
        // Start survey timer
        startSurveyTimer();
        
        showQuestion(appState.currentQuestionIndex);
        resetInactivityTimer();

        setTimeout(() => {
            if(kioskStartScreen && document.body.contains(kioskStartScreen)) {
                kioskStartScreen.remove();
            }
        }, 400); 
    }

    function showStartScreen() {
        const kioskStartScreen = window.globals.kioskStartScreen;
        const kioskVideo = window.globals.kioskVideo;
        const questionContainer = window.globals.questionContainer;
        const nextBtn = window.globals.nextBtn;
        const prevBtn = window.globals.prevBtn;
        const progressBar = window.globals.progressBar;
        
        clearAllTimers();
        cleanupStartScreenListeners();
        cleanupInputFocusScroll();

        if (questionContainer) questionContainer.innerHTML = '';
        if (nextBtn) nextBtn.disabled = true;
        if (prevBtn) prevBtn.disabled = true;
        
        console.log('[START SCREEN] Showing start screen...');
        
        if (kioskStartScreen) {
            if (!document.body.contains(kioskStartScreen)) {
                document.body.appendChild(kioskStartScreen);
            }
            kioskStartScreen.classList.remove('hidden');

            if (kioskVideo) {
                // iOS Video Fix
                kioskVideo.currentTime = 0;
                kioskVideo.setAttribute('playsinline', '');
                kioskVideo.setAttribute('webkit-playsinline', '');
                kioskVideo.muted = true;
                kioskVideo.loop = true;
                
                const playPromise = kioskVideo.play();
                
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log("[VIDEO] Video autoplay started successfully");
                    }).catch(error => {
                        console.warn("[VIDEO] Autoplay prevented:", error.message);
                        
                        // iOS fallback: Play on first touch
                        const playOnTouch = () => {
                            kioskVideo.play().catch(err => {
                                console.warn("[VIDEO] Manual play failed:", err);
                            });
                            document.removeEventListener('touchstart', playOnTouch);
                        };
                        document.addEventListener('touchstart', playOnTouch, { once: true });
                    });
                }
            }

            // Create bound function
            boundStartSurvey = startSurvey.bind(null);
            
            // Add event listeners with proper cleanup
            kioskStartScreen.addEventListener('click', boundStartSurvey, { once: true });
            kioskStartScreen.addEventListener('touchstart', boundStartSurvey, { once: true, passive: false });
            
            console.log('[START SCREEN] Event listeners attached');
        }

        if (progressBar) {
            progressBar.style.width = '0%';
        }
    }

    // ---------------------------------------------------------------------
    // --- SUBMISSION ---
    // ---------------------------------------------------------------------

    function submitSurvey() {
        const questionContainer = window.globals.questionContainer;
        const prevBtn = window.globals.prevBtn;
        const nextBtn = window.globals.nextBtn;
        const progressBar = window.globals.progressBar;
        
        clearAllTimers();
        cleanupInputFocusScroll();

        // Stop timer for last question
        const lastQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];
        stopQuestionTimer(lastQuestion.id);
        
        // PRIORITY FIX #1: Ensure ID exists before submission
        if (!appState.formData.id) {
            appState.formData.id = window.dataHandlers.generateUUID();
            console.warn('[SUBMIT] Missing ID - generated new one:', appState.formData.id);
        }
        
        // PRIORITY FIX #6: Standardize timestamp format (ISO string)
        const timestamp = new Date().toISOString();
        const totalTimeSeconds = getTotalSurveyTime();
        
        appState.formData.completionTimeSeconds = totalTimeSeconds;
        appState.formData.questionTimeSpent = appState.questionTimeSpent;
        appState.formData.completedAt = timestamp;
        appState.formData.timestamp = timestamp;
        appState.formData.sync_status = 'unsynced';

        console.log('[SUBMIT] Submitting survey with ID:', appState.formData.id);
        
        // PRIORITY FIX #3: Check queue size before adding
        const submissionQueue = getSubmissionQueue();
        if (submissionQueue.length >= 100) {
            console.warn('[QUEUE] Queue full (100 records) - removing oldest entry');
            submissionQueue.shift();
        }
        
        submissionQueue.push(appState.formData);
        safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueue);
        
        // Record completion analytics
        recordAnalytics('survey_completed', {
            questionIndex: appState.currentQuestionIndex,
            totalTimeSeconds: totalTimeSeconds,
            completedAllQuestions: true
        });

        if (progressBar) {
            progressBar.style.width = '100%';
        }

        // Professional completion screen with checkmark
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
                performKioskReset(); 
            }
        }, 1000);
    }

    function performKioskReset() {
        console.log('[RESET] Performing kiosk reset...');
        
        // Clean up all listeners
        cleanupStartScreenListeners();
        cleanupInputFocusScroll();
        cleanupIntervals();
        
        localStorage.removeItem(STORAGE_KEY_STATE);

        // PRIORITY FIX #1 & #6: Use proper UUID generation and timestamp
        appState.formData = { 
            id: window.dataHandlers.generateUUID(), 
            timestamp: new Date().toISOString()
        };
        appState.currentQuestionIndex = 0;
        
        console.log('[RESET] New session ID:', appState.formData.id);
        
        // Reset analytics tracking
        appState.surveyStartTime = null;
        appState.questionStartTimes = {};
        appState.questionTimeSpent = {};

        showStartScreen(); 
        
        const nextBtn = window.globals.nextBtn;
        const prevBtn = window.globals.prevBtn;
        
        if (nextBtn) nextBtn.disabled = true;
        if (prevBtn) prevBtn.disabled = true;
    }

    // Expose functions globally
    window.uiHandlers = {
        clearAllTimers,
        resetInactivityTimer,
        startPeriodicSync,
        addInactivityListeners,
        removeInactivityListeners,
        goNext,
        goPrev,
        showQuestion,
        showStartScreen,
        performKioskReset,
        getTotalSurveyTime
    };
})();
