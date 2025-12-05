// FILE: kioskUI.js
// UPDATED: Fixed data clearing after successful sync - ensures IDs are always set

(function() {
    const { 
        INACTIVITY_TIMEOUT_MS, 
        SYNC_INTERVAL_MS, 
        RESET_DELAY_MS,
        STORAGE_KEY_STATE, 
        STORAGE_KEY_QUEUE 
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
    
    function addTypewriterEffect() {
        if (window.typewriterTimer) {
            clearTimeout(window.typewriterTimer);
        }
        
        const questionContainer = window.globals.questionContainer;
        const labels = questionContainer.querySelectorAll('label[id$="Label"], #rotatingQuestion');
        
        labels.forEach(label => {
            if (label.classList.contains('typewriter') || !label.textContent.trim()) {
                return;
            }
            
            label.classList.add('typewriter');
            
            window.typewriterTimer = setTimeout(() => {
                label.classList.add('typing-complete');
            }, 2000);
        });
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
        if (appState.inactivityTimer) {
            clearTimeout(appState.inactivityTimer);
        }
        if (appState.syncTimer) {
            clearInterval(appState.syncTimer);
        }

        if (!window.isKioskVisible) {
            console.log('[VISIBILITY] Kiosk hidden - timers not started');
            return;
        }

        // restart periodic sync
        startPeriodicSync();

        appState.inactivityTimer = setTimeout(() => {
            const isInProgress = appState.currentQuestionIndex > 0;

            if (isInProgress) {
                console.log('Mid-survey inactivity detected. Auto-saving and resetting kiosk.');

                const submissionQueue = getSubmissionQueue();
                const currentQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];
                stopQuestionTimer(currentQuestion.id);
                
                const totalTimeSeconds = getTotalSurveyTime();
                appState.formData.completionTimeSeconds = totalTimeSeconds;
                appState.formData.questionTimeSpent = appState.questionTimeSpent;
                appState.formData.abandonedAt = new Date().toISOString();
                appState.formData.abandonedAtQuestion = currentQuestion.id;
                appState.formData.abandonedAtQuestionIndex = appState.currentQuestionIndex;
                appState.formData.timestamp = new Date().toISOString();
                appState.formData.sync_status = 'unsynced (inactivity)';

                const submissionQueueUpdated = getSubmissionQueue();
                submissionQueueUpdated.push(appState.formData);
                safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueueUpdated);
                
                recordAnalytics('survey_abandoned', {
                    questionId: currentQuestion.id,
                    questionIndex: appState.currentQuestionIndex,
                    totalTimeSeconds: totalTimeSeconds,
                    reason: 'inactivity'
                });

                performKioskReset(); 
            } else {
                autoSync();
            }
        }, INACTIVITY_TIMEOUT_MS);
    }

    function startPeriodicSync() {
        if (appState.syncTimer) {
            clearInterval(appState.syncTimer);
        }
        appState.syncTimer = setInterval(autoSync, SYNC_INTERVAL_MS);
    }

    function rotateQuestionText(q) {
        let idx = 0;
        const labelEl = document.getElementById('rotatingQuestion');
        if (!labelEl) return;

        cleanupIntervals();

        try {
            appState.rotationInterval = setInterval(() => {
                idx = (idx + 1) % q.rotatingText.length;
                if (labelEl) {
                    labelEl.classList.remove('typewriter', 'typing-complete');
                    labelEl.textContent = q.rotatingText[idx];
                    labelEl.classList.add('typewriter');
                    
                    if (window.typewriterTimer) {
                        clearTimeout(window.typewriterTimer);
                    }
                    
                    window.typewriterTimer = setTimeout(() => {
                        if (labelEl) {
                            labelEl.classList.add('typing-complete');
                        }
                    }, 2000);
                }
            }, 4000);
        } catch (e) {
            console.error('Error in text rotation:', e);
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

            if (renderer.setupEvents) {
                renderer.setupEvents(q, {
                    handleNextQuestion: goNext,
                    updateData: updateData
                });
            }

            if (q.rotatingText) {
                rotateQuestionText(q);
            }

            prevBtn.disabled = index === 0;
            nextBtn.textContent = (index === window.dataUtils.surveyQuestions.length - 1) ? 'Submit Survey' : 'Next';
            nextBtn.disabled = false;

            updateProgressBar();

        } catch (e) {
            console.error("Fatal Error during showQuestion render:", e);
            cleanupIntervals();
            questionContainer.innerHTML = '<h2 class="text-xl font-bold text-red-600">A critical error occurred. Please refresh or contact support.</h2>';
            logErrorToServer(e, 'showQuestion');
        }
    }

    function logErrorToServer(error, context) {
        try {
            fetch('/api/log-error', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: error.message,
                    stack: error.stack,
                    context: context,
                    timestamp: new Date().toISOString(),
                    kioskId: appState.formData.id
                })
            }).catch(() => {});
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
        if (boundStartSurvey && kioskStartScreen) {
            kioskStartScreen.removeEventListener('click', boundStartSurvey);
            kioskStartScreen.removeEventListener('touchstart', boundStartSurvey);
        }
        
        kioskStartScreen.classList.add('hidden');
        
        if (kioskVideo) {
            kioskVideo.pause();
        }
        
        // FIX: Ensure formData has an ID if it doesn't exist
        if (!appState.formData.id) {
            appState.formData.id = generateUUID();
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
            if (kioskStartScreen && document.body.contains(kioskStartScreen)) {
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
                        console.warn("[VIDEO] Autoplay was prevented. Will play on user interaction:", error);
                        
                        // iOS fallback: Play on first touch
                        const playOnTouch = () => {
                            kioskVideo.play();
                            document.removeEventListener('touchstart', playOnTouch);
                        };
                        document.addEventListener('touchstart', playOnTouch, { once: true });
                    });
                }
            }

            // Remove any existing listeners first
            if (boundStartSurvey) {
                kioskStartScreen.removeEventListener('click', boundStartSurvey);
                kioskStartScreen.removeEventListener('touchstart', boundStartSurvey);
            }

            // Create bound function
            boundStartSurvey = startSurvey.bind(null);
            
            // Add event listeners
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

        const submissionQueue = getSubmissionQueue();
        
        // Stop timer for last question
        const lastQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];
        stopQuestionTimer(lastQuestion.id);
        
        // FIX: Ensure ID exists before submission
        if (!appState.formData.id) {
            appState.formData.id = generateUUID();
            console.warn('[SUBMIT] Missing ID - generated new one:', appState.formData.id);
        }
        
        // Calculate and add analytics data
        const totalTimeSeconds = getTotalSurveyTime();
        appState.formData.completionTimeSeconds = totalTimeSeconds;
        appState.formData.questionTimeSpent = appState.questionTimeSpent;
        appState.formData.completedAt = new Date().toISOString();
        appState.formData.timestamp = new Date().toISOString();
        appState.formData.sync_status = 'unsynced';

        console.log('[SUBMIT] Submitting survey with ID:', appState.formData.id);
        
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
        
        localStorage.removeItem(STORAGE_KEY_STATE);

        // FIX: Always use generateUUID to ensure proper ID
        appState.formData = { 
            id: generateUUID(), 
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
