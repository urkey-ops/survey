// FILE: kioskUI.js
// UPDATED: Implemented getAnswer and renderQuestion using data-util.js
// DEPENDS ON: appState.js (CONSTANTS, appState, globals, typewriterTimer, adminPanelTimer), dataSync.js (dataHandlers), data-util.js (window.dataUtils)

(function() {
    const { INACTIVITY_TIMEOUT_MS, SYNC_INTERVAL_MS, STORAGE_KEY_STATE, STORAGE_KEY_QUEUE } = window.CONSTANTS;
    const appState = window.appState;
    let { 
        questionContainer, nextBtn, prevBtn, progressBar, kioskStartScreen, kioskVideo 
    } = window.globals;
    const { 
        safeSetLocalStorage, getSubmissionQueue, recordAnalytics, autoSync, updateAdminCount, syncData 
    } = window.dataHandlers;
    
    let isKioskVisible = window.isKioskVisible;
    let typewriterTimer = window.typewriterTimer;

    // Internal helper for timers
    function clearAllTimers() {
        // ... (clearAllTimers function content remains unchanged)
        if (appState.inactivityTimer) {
            clearTimeout(appState.inactivityTimer);
            appState.inactivityTimer = null;
        }
        if (appState.syncTimer) {
            clearInterval(appState.syncTimer);
            appState.syncTimer = null;
        }
        cleanupIntervals();
        for (const qId in appState.questionTimer) {
            clearInterval(appState.questionTimer[qId].interval);
        }
        appState.questionTimer = {};
    }

    function cleanupIntervals() {
        // ... (cleanupIntervals function content remains unchanged)
        if (appState.rotationInterval) {
            clearInterval(appState.rotationInterval);
            appState.rotationInterval = null;
        }
    }

    // ---------------------------------------------------------------------
    // --- TIMERS & UX (Moved from Part 3) ---
    // ---------------------------------------------------------------------
    
    function startQuestionTimer(qId) {
        // ... (startQuestionTimer function content remains unchanged)
        stopQuestionTimer(qId);
        
        const startTime = Date.now();
        let elapsed = appState.questionTimeSpent[qId] || 0;

        const interval = setInterval(() => {
            elapsed++; // Track seconds
        }, 1000);

        appState.questionTimer[qId] = {
            startTime: startTime,
            interval: interval,
            get timeSpent() { return elapsed; }
        };
    }

    function stopQuestionTimer(qId) {
        // ... (stopQuestionTimer function content remains unchanged)
        if (appState.questionTimer[qId]) {
            clearInterval(appState.questionTimer[qId].interval);
            appState.questionTimeSpent[qId] = appState.questionTimer[qId].timeSpent;
            delete appState.questionTimer[qId];
        }
    }

    function getTotalSurveyTime() {
        // ... (getTotalSurveyTime function content remains unchanged)
        let totalTime = 0;
        for (const qId in appState.questionTimeSpent) {
            totalTime += appState.questionTimeSpent[qId];
        }
        // Add time for current question if timer is running
        for (const qId in appState.questionTimer) {
            totalTime += appState.questionTimer[qId].timeSpent;
        }
        return totalTime;
    }

    function resetInactivityTimer() {
        // ... (resetInactivityTimer function content remains unchanged)
        if (appState.inactivityTimer) {
            clearTimeout(appState.inactivityTimer);
        }
        if (appState.syncTimer) {
            clearInterval(appState.syncTimer);
        }
        
        if (!isKioskVisible) {
            console.log('[VISIBILITY] Kiosk hidden - timers not started');
            return;
        }
        
        startPeriodicSync(); 

        appState.inactivityTimer = setTimeout(() => {
            const isInProgress = appState.currentQuestionIndex > 0;

            if (isInProgress) {
                console.log('Mid-survey inactivity detected. Auto-saving and resetting kiosk.');

                const submissionQueue = getSubmissionQueue();
                
                // Record drop-off analytics
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

                submissionQueue.push(appState.formData);
                safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueue);
                
                // Record drop-off event
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
        // ... (startPeriodicSync function content remains unchanged)
        appState.syncTimer = setInterval(autoSync, SYNC_INTERVAL_MS);
    }

    function rotateQuestionText(q) {
        // ... (rotateQuestionText function content remains unchanged)
        let idx = 0;
        const labelEl = document.getElementById('rotatingQuestion');
        if (!labelEl) return;

        cleanupIntervals();

        try {
            appState.rotationInterval = setInterval(() => {
                idx = (idx + 1) % q.rotatingText.length;
                if (labelEl) {
                    // Remove typewriter classes before updating text
                    labelEl.classList.remove('typewriter', 'typing-complete');
                    labelEl.textContent = q.rotatingText[idx];
                    
                    // Re-apply typewriter effect for the new text
                    labelEl.classList.add('typewriter');
                    
                    // Clear previous typewriter timer
                    if (window.typewriterTimer) {
                        clearTimeout(window.typewriterTimer);
                    }
                    
                    // Set new completion timer
                    window.typewriterTimer = setTimeout(() => {
                        if (labelEl) {
                            labelEl.classList.add('typing-complete');
                        }
                    }, 2000); // Match animation duration
                }
            }, 4000);
        } catch (e) {
            console.error('Error in text rotation:', e);
            cleanupIntervals();
        }
    }

    function addInactivityListeners() {
        // ... (addInactivityListeners function content remains unchanged)
        document.addEventListener('mousemove', resetInactivityTimer);
        document.addEventListener('keypress', resetInactivityTimer);
        document.addEventListener('touchstart', resetInactivityTimer);
    }
    
    // ---------------------------------------------------------------------
    // --- NAVIGATION & RENDERING (Mostly from Part 2) ---
    // ---------------------------------------------------------------------

    function updateProgressBar() {
        // ... (updateProgressBar function content remains unchanged)
        const total = window.dataUtils.surveyQuestions.length;
        const current = appState.currentQuestionIndex;
        const progress = (current / total) * 100;
        
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }

        // Show/Hide navigation buttons
        if (prevBtn) {
            prevBtn.style.visibility = (current > 1 && current < total) ? 'visible' : 'hidden';
        }
        if (nextBtn) {
            nextBtn.textContent = (current === total - 1) ? 'Submit' : 'Next';
            nextBtn.disabled = false; // Re-enable for the new question
        }
    }

    function showQuestion(index) {
        // ... (showQuestion function content remains unchanged)
        if (index < 0 || index >= window.dataUtils.surveyQuestions.length) return;
        
        const q = window.dataUtils.surveyQuestions[index];
        appState.currentQuestionIndex = index;

        // Save current progress
        safeSetLocalStorage(STORAGE_KEY_STATE, appState);
        updateProgressBar();
        resetInactivityTimer();
        
        // Render content
        questionContainer.innerHTML = '';
        const questionEl = renderQuestion(q);
        questionContainer.appendChild(questionEl);
        
        // Start timer for the new question
        startQuestionTimer(q.id);
    }

    function goNext() {
        // ... (goNext function content remains unchanged)
        const currentQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];
        const answer = getAnswer(currentQuestion);
        
        if (answer === null || answer === undefined) {
            alert("Please provide an answer to continue.");
            return;
        }

        // 1. Record answer and stop timer for current question
        stopQuestionTimer(currentQuestion.id);
        appState.formData[currentQuestion.id] = answer;
        
        // 2. Check if we reached the end
        if (appState.currentQuestionIndex === window.dataUtils.surveyQuestions.length - 1) {
            console.log('Survey completed. Preparing submission.');
            // Final submission steps
            appState.formData.completionTimeSeconds = getTotalSurveyTime();
            appState.formData.questionTimeSpent = appState.questionTimeSpent;
            appState.formData.completedAt = new Date().toISOString();
            appState.formData.timestamp = new Date().toISOString();
            appState.formData.sync_status = 'unsynced';
            
            // Add to submission queue
            const submissionQueue = getSubmissionQueue();
            submissionQueue.push(appState.formData);
            safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueue);
            
            // Record completion analytics
            recordAnalytics('survey_completed', {
                totalTimeSeconds: appState.formData.completionTimeSeconds
            });

            // Perform final sync and reset
            syncData(false); // Attempt sync immediately
            performKioskReset();
            return;
        }
        
        // 3. Move to next question
        showQuestion(appState.currentQuestionIndex + 1);
    }

    function goPrev() {
        // ... (goPrev function content remains unchanged)
        if (appState.currentQuestionIndex > 1) {
            // Stop current timer
            const currentQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];
            stopQuestionTimer(currentQuestion.id);

            // Go back
            showQuestion(appState.currentQuestionIndex - 1);
            resetInactivityTimer();
        }
    }

    function showStartScreen() {
        // ... (showStartScreen function content remains unchanged)
        if (kioskStartScreen) {
            kioskStartScreen.classList.remove('hidden');
            if (kioskVideo) {
                kioskVideo.play();
            }
        }
        questionContainer.innerHTML = '';
        nextBtn.style.visibility = 'hidden';
        prevBtn.style.visibility = 'hidden';
        updateProgressBar();
        
        const introQuestion = window.dataUtils.surveyQuestions[0];
        if (introQuestion && introQuestion.rotatingText && introQuestion.rotatingText.length > 0) {
            rotateQuestionText(introQuestion);
        }
        
        // Event listener to start survey
        if (kioskStartScreen) {
            // UPDATED: Bind start event to the whole screen tap/click
            kioskStartScreen.addEventListener('click', startSurvey, { once: true });
        }
        
        // Ensure sync timer runs even when on start screen
        startPeriodicSync();
    }

    function startSurvey() {
        // ... (startSurvey function content remains unchanged)
        if (kioskStartScreen) {
            kioskStartScreen.classList.add('hidden');
            // Remove the 'click' listener to prevent multiple starts if needed, though 'once: true' handles it
            kioskStartScreen.removeEventListener('click', startSurvey); 

            if (kioskVideo) {
                kioskVideo.pause();
                kioskVideo.currentTime = 0; // Reset video
            }
        }
        
        // Reset state for a new survey
        appState.formData = {
            sessionId: crypto.randomUUID(),
            kioskId: window.dataUtils.kioskId,
            startTime: new Date().toISOString()
        };
        appState.questionTimeSpent = {};
        
        showQuestion(1); // Start at the first actual question
    }

    function performKioskReset() {
        // ... (performKioskReset function content remains unchanged)
        console.log('[RESET] Kiosk reset initiated.');
        clearAllTimers();
        
        // Clear in-progress data
        appState.currentQuestionIndex = 0;
        appState.formData = {};
        appState.questionTimeSpent = {};
        safeSetLocalStorage(STORAGE_KEY_STATE, appState);
        
        updateAdminCount();
        
        // Reload start screen
        showStartScreen();
    }
    
    // UPDATED: Implemented the two helper functions that rely on data-util.js
    function getAnswer(q) { 
        // Helper context for event listeners inside the renderer's setupEvents
        const handleNextQuestion = goNext;
        const updateData = (key, value) => appState.formData[key] = value;
        
        const renderer = window.dataUtils.questionRenderers[q.type];
        if (renderer && renderer.setupEvents) {
            renderer.setupEvents(q, { handleNextQuestion, updateData });
        }
        
        // Logic to extract answer from DOM based on question type
        // This is simplified, in a full app it would check the DOM for the selected value.
        // Since many types auto-advance, we assume the answer is already in appState.formData
        // for radio/scale questions, or we return the textarea content.
        
        let answer = appState.formData[q.name];

        if (q.type === 'textarea') {
            const input = document.getElementById(q.id);
            answer = input ? input.value : (appState.formData[q.name] || null);
            if (q.required && !answer) return null;
        }

        if (q.type === 'radio-with-other' && answer === 'Other') {
            const otherInput = document.getElementById('other_location_text');
            const otherValue = otherInput ? otherInput.value.trim() : '';
            if (q.required && !otherValue) return null;
            
            // Combine the answer for submission
            return {
                main: answer,
                other: otherValue
            };
        }
        
        if (q.type === 'checkbox-with-other' && Array.isArray(answer) && answer.includes('Other')) {
            const otherInput = document.getElementById('other_hear_about_text');
            const otherValue = otherInput ? otherInput.value.trim() : '';
            
            // In a checkbox group, the answer is an array of selected values
            if (q.required && answer.length === 0) return null;

            return {
                selected: answer,
                other: otherValue
            };
        }
        
        if (q.required && (answer === null || answer === undefined || answer === '' || (Array.isArray(answer) && answer.length === 0))) {
             // Basic validation for simple types (radio, number-scale, star-rating)
             return null;
        }
        
        return answer; 
    }

    function renderQuestion(q) {
        const renderer = window.dataUtils.questionRenderers[q.type];
        if (!renderer) {
            console.error(`No renderer found for question type: ${q.type}`);
            const div = document.createElement('div');
            div.innerHTML = `<h2>Error: Unsupported Question Type (${q.type})</h2>`;
            return div;
        }
        
        const div = document.createElement('div');
        div.classList.add('survey-question-wrapper');
        div.innerHTML = renderer.render(q, appState.formData);
        
        // NOTE: Event setup is moved to getAnswer(), which runs before goNext().
        // For types that auto-advance, the setupEvents listener calls goNext directly.

        return div;
    }


    // Expose functions globally
    window.uiHandlers = {
        clearAllTimers,
        resetInactivityTimer,
        startPeriodicSync,
        addInactivityListeners,
        goNext,
        goPrev,
        showQuestion,
        showStartScreen,
        startSurvey,
        performKioskReset,
        getTotalSurveyTime
    };
})();
