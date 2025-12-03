
// FILE: kioskUI.js
// UPDATED: Fixed event setup timing - events now attached when question renders

(function() {
    const { INACTIVITY_TIMEOUT_MS, SYNC_INTERVAL_MS, STORAGE_KEY_STATE, STORAGE_KEY_QUEUE } = window.CONSTANTS;
    const appState = window.appState;
    const { 
        safeSetLocalStorage, getSubmissionQueue, recordAnalytics, autoSync, updateAdminCount, syncData 
    } = window.dataHandlers;
    
    // Internal helper for timers
    function clearAllTimers() {
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
        if (appState.rotationInterval) {
            clearInterval(appState.rotationInterval);
            appState.rotationInterval = null;
        }
    }

    // ---------------------------------------------------------------------
    // --- TIMERS & UX ---
    // ---------------------------------------------------------------------
    
    function startQuestionTimer(qId) {
        stopQuestionTimer(qId);
        
        const startTime = Date.now();
        let elapsed = appState.questionTimeSpent[qId] || 0;

        const interval = setInterval(() => {
            elapsed++;
        }, 1000);

        appState.questionTimer[qId] = {
            startTime: startTime,
            interval: interval,
            get timeSpent() { return elapsed; }
        };
    }

    function stopQuestionTimer(qId) {
        if (appState.questionTimer[qId]) {
            clearInterval(appState.questionTimer[qId].interval);
            appState.questionTimeSpent[qId] = appState.questionTimer[qId].timeSpent;
            delete appState.questionTimer[qId];
        }
    }

    function getTotalSurveyTime() {
        let totalTime = 0;
        for (const qId in appState.questionTimeSpent) {
            totalTime += appState.questionTimeSpent[qId];
        }
        for (const qId in appState.questionTimer) {
            totalTime += appState.questionTimer[qId].timeSpent;
        }
        return totalTime;
    }

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

                submissionQueue.push(appState.formData);
                safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueue);
                
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
        document.addEventListener('mousemove', resetInactivityTimer);
        document.addEventListener('keypress', resetInactivityTimer);
        document.addEventListener('touchstart', resetInactivityTimer);
    }
    
    // ---------------------------------------------------------------------
    // --- NAVIGATION & RENDERING ---
    // ---------------------------------------------------------------------

    function updateProgressBar() {
        const progressBar = window.globals.progressBar;
        const prevBtn = window.globals.prevBtn;
        const nextBtn = window.globals.nextBtn;

        const total = window.dataUtils.surveyQuestions.length;
        const current = appState.currentQuestionIndex;
        const progress = (current / total) * 100;
        
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }

        if (prevBtn) {
            prevBtn.style.visibility = (current >= 2) ? 'visible' : 'hidden';
        }
        if (nextBtn) {
            nextBtn.style.visibility = 'visible'; 
            nextBtn.textContent = (current === total - 1) ? 'Submit' : 'Next';
            nextBtn.disabled = false;
        }
    }

    function showQuestion(index) {
        const questionContainer = window.globals.questionContainer;

        if (index < 0 || index >= window.dataUtils.surveyQuestions.length) return;
        
        const q = window.dataUtils.surveyQuestions[index];
        appState.currentQuestionIndex = index;

        safeSetLocalStorage(STORAGE_KEY_STATE, appState);
        updateProgressBar();
        resetInactivityTimer();
        
        if (questionContainer) {
            questionContainer.innerHTML = '';
            const questionEl = renderQuestion(q);
            questionContainer.appendChild(questionEl);
        } else {
            console.error('questionContainer not defined when calling showQuestion');
        }
        
        startQuestionTimer(q.id);
    }

    function goNext() {
        const currentQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];
        const answer = getAnswer(currentQuestion);
        
        if (answer === null || answer === undefined) {
            alert("Please provide an answer to continue.");
            return;
        }

        stopQuestionTimer(currentQuestion.id);
        appState.formData[currentQuestion.name] = answer;
        
        if (appState.currentQuestionIndex === window.dataUtils.surveyQuestions.length - 1) {
            console.log('Survey completed. Preparing submission.');
            appState.formData.completionTimeSeconds = getTotalSurveyTime();
            appState.formData.questionTimeSpent = appState.questionTimeSpent;
            appState.formData.completedAt = new Date().toISOString();
            appState.formData.timestamp = new Date().toISOString();
            appState.formData.sync_status = 'unsynced';
            
            const submissionQueue = getSubmissionQueue();
            submissionQueue.push(appState.formData);
            safeSetLocalStorage(STORAGE_KEY_QUEUE, submissionQueue);
            
            recordAnalytics('survey_completed', {
                totalTimeSeconds: appState.formData.completionTimeSeconds
            });

            syncData(false);
            performKioskReset();
            return;
        }
        
        showQuestion(appState.currentQuestionIndex + 1);
    }

    function goPrev() {
        if (appState.currentQuestionIndex > 1) { 
            const currentQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];
            stopQuestionTimer(currentQuestion.id);
            showQuestion(appState.currentQuestionIndex - 1);
            resetInactivityTimer();
        } else if (appState.currentQuestionIndex === 1) {
            const currentQuestion = window.dataUtils.surveyQuestions[appState.currentQuestionIndex];
            stopQuestionTimer(currentQuestion.id);
            performKioskReset();
        }
    }

    function showStartScreen() {
        const kioskStartScreen = window.globals.kioskStartScreen;
        const kioskVideo = window.globals.kioskVideo;
        const questionContainer = window.globals.questionContainer;
        const nextBtn = window.globals.nextBtn;
        const prevBtn = window.globals.prevBtn;

        if (kioskStartScreen) {
            kioskStartScreen.classList.remove('hidden');
            if (kioskVideo) {
                kioskVideo.play();
            }
        }
        if (questionContainer) {
            questionContainer.innerHTML = '';
        }
        
        if (nextBtn) {
            nextBtn.style.visibility = 'hidden';
        }
        if (prevBtn) {
            prevBtn.style.visibility = 'hidden';
        }
        updateProgressBar();
        
        const introQuestion = window.dataUtils.surveyQuestions[0];
        if (introQuestion && introQuestion.rotatingText && introQuestion.rotatingText.length > 0) {
            rotateQuestionText(introQuestion);
        }
        
        if (kioskStartScreen) {
            kioskStartScreen.addEventListener('click', startSurvey, { once: true });
        }
        
        startPeriodicSync();
    }

    function startSurvey() {
        const kioskStartScreen = window.globals.kioskStartScreen;
        const kioskVideo = window.globals.kioskVideo;

        if (kioskStartScreen) {
            kioskStartScreen.classList.add('hidden');
            kioskStartScreen.removeEventListener('click', startSurvey); 

            if (kioskVideo) {
                kioskVideo.pause();
                kioskVideo.currentTime = 0;
            }
        }
        
        appState.formData = {
            sessionId: crypto.randomUUID(),
            kioskId: window.dataUtils.kioskId,
            startTime: new Date().toISOString()
        };
        appState.questionTimeSpent = {};
        
        showQuestion(1);
    }

    function performKioskReset() {
        console.log('[RESET] Kiosk reset initiated.');
        clearAllTimers();
        
        appState.currentQuestionIndex = 0;
        appState.formData = {};
        appState.questionTimeSpent = {};
        safeSetLocalStorage(STORAGE_KEY_STATE, appState);
        
        updateAdminCount();
        showStartScreen();
    }
    
    function getAnswer(q) {
        let answer = appState.formData[q.name];

        if (q.type === 'textarea') {
            const input = document.getElementById(q.id);
            answer = input ? input.value.trim() : (appState.formData[q.name] || null);
            if (q.required && !answer) return null;
        }

        if (q.type === 'radio-with-other' && answer === 'Other') {
            const otherInput = document.getElementById('other_location_text');
            const otherValue = otherInput ? otherInput.value.trim() : '';
            if (q.required && !otherValue) return null;
            
            return {
                main: answer,
                other: otherValue
            };
        }
        
        if (q.type === 'checkbox-with-other' && Array.isArray(answer) && answer.includes('Other')) {
            const otherInput = document.getElementById('other_hear_about_text');
            const otherValue = otherInput ? otherInput.value.trim() : '';
            
            if (q.required && answer.length === 0) return null;

            return {
                selected: answer,
                other: otherValue
            };
        }
        
        if (q.required && (answer === null || answer === undefined || answer === '' || (Array.isArray(answer) && answer.length === 0))) {
             return null;
        }
        
        return answer; 
    }

    function renderQuestion(q) {
        const renderer = window.dataUtils.questionRenderers[q.type];
        if (!renderer) {
            console.error(`No renderer found for question type: ${q.type}`);
            const div = document.createElement('div');
            div.innerHTML = `<h2>Error: Unsupported Question Type (${q.type}) </h2>`;
            return div;
        }
        
        const div = document.createElement('div');
        div.classList.add('survey-question-wrapper');
        div.innerHTML = renderer.render(q, appState.formData);
        
        // FIXED: Setup events immediately after rendering
        if (renderer.setupEvents) {
            // Use setTimeout to ensure DOM is ready
            setTimeout(() => {
                const handleNextQuestion = goNext;
                const updateData = (key, value) => {
                    appState.formData[key] = value;
                };
                
                renderer.setupEvents(q, { handleNextQuestion, updateData });
            }, 0);
        }

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
        performKioskReset,
        getTotalSurveyTime
    };
})();
