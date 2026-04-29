// FILE: ui/navigation/submit.js
// PURPOSE: Survey submission and completion logic
// VERSION: 3.8.3
// CHANGES FROM 3.8.2:
//   - FIX: _doReset uses window.navigationHandler.showStartScreen() directly
//     (navigation was never in resolvedDeps so reset silently did nothing)
//   - FIX: Live countdown ticker using setInterval + re-querying #resetCountdown
//     (window.showCheckmark renders static text — ticker now drives it)
//   - REMOVED: _renderCheckmarkAndCountdown (replaced by window.showCheckmark + ticker)
// DEPENDENCIES: core.js, main/contracts.js

import { getDependencies, stopQuestionTimer, saveState } from './core.js';
import { buildQueueRecord, validateFormData, buildAnalyticsEvent } from '../../main/contracts.js';

let completionInProgress = false;
let resetTriggered       = false;

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function hasMeaningfulResponse(formData, surveyType) {
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) {
    return false;
  }

  const REQUIRED_KEYS = [
    'cafeExperience',
    'visitPurpose',
    'waitTime',
    'waitAcceptable',
    'flowExperience',
    'foodPriority',
    'foodRating',
    'final_thoughts'
  ];

  if (surveyType !== 'type3') {
    return Object.entries(formData).some(([key, val]) => {
      if (key === 'id') return false;
      if (Array.isArray(val))  return val.length > 0;
      if (typeof val === 'object' && val !== null) {
        return Object.values(val).some(v => v !== null && v !== undefined && v !== '');
      }
      return val !== null && val !== undefined && val !== '';
    });
  }

  for (const key of REQUIRED_KEYS) {
    const val = formData[key];

    if (val === null || val === undefined || val === '') continue;

    if (Array.isArray(val)) {
      if (val.some(v => v !== null && v !== undefined && v !== '')) return true;
      continue;
    }

    if (typeof val === 'object' && val !== null) {
      for (const v of Object.values(val)) {
        if (v !== null && v !== undefined && v !== '') return true;
      }
      continue;
    }

    return true;
  }

  return false;
}

// ─────────────────────────────────────────────────────────────
// NORMALISE PAYLOAD
// ─────────────────────────────────────────────────────────────

function normalizeSubmissionPayload(formData, questions) {
  const normalized = { ...formData };

  questions.forEach((q) => {
    const rawValue = normalized[q.name];

    if (q.type === 'section-header') {
      delete normalized[q.name];
      return;
    }

    if (q.type === 'dual-star-rating') {
      const valueObj =
        rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
          ? rawValue
          : {};

      q.subRatings?.forEach(sub => {
        const val = valueObj[sub.key];
        normalized[`${q.name}_${sub.key}`] =
          val !== null && val !== undefined ? Number(val) : '';
      });

      delete normalized[q.name];
      return;
    }

    if (q.type === 'selector-textarea') {
      const valueObj =
        rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
          ? rawValue
          : { category: null, text: typeof rawValue === 'string' ? rawValue : '' };

      const category = valueObj.category ? String(valueObj.category).trim() : '';
      const text     = valueObj.text     ? String(valueObj.text).trim()     : '';

      normalized[`${q.name}_category`] = category;
      normalized[`${q.name}_text`]     = text;
      delete normalized[q.name];
      return;
    }

    if (q.type === 'number-scale' || q.type === 'star-rating') {
      if (rawValue !== undefined && rawValue !== null && rawValue !== '') {
        normalized[q.name] = Number(rawValue);
      }
      return;
    }

    if (q.type === 'checkbox-with-other') {
      if (!Array.isArray(normalized[q.name])) {
        normalized[q.name] = normalized[q.name] ? [normalized[q.name]] : [];
      }
      return;
    }
  });

  return normalized;
}

// ─────────────────────────────────────────────────────────────
// RESET
// ─────────────────────────────────────────────────────────────

function _doReset(deps) {
  const { appState } = deps;

  resetTriggered       = true;
  completionInProgress = false;

  if (appState) {
    appState.currentQuestionIndex = 0;
    appState.formData             = {};
    appState.questionTimeSpent    = {};
    appState.surveyStartTime      = null;
  }

  // ── FIX: navigation is never in resolvedDeps — use window.navigationHandler
  if (typeof window.navigationHandler?.showStartScreen === 'function') {
    window.navigationHandler.showStartScreen();
  } else if (typeof window.showStartScreen === 'function') {
    window.showStartScreen();
  } else {
    console.error('[SUBMIT] ❌ No showStartScreen found — cannot reset to start');
  }

  saveState(deps);
  console.log('[SUBMIT] ✅ Survey reset — back to start screen');
}

// ─────────────────────────────────────────────────────────────
// MAIN SUBMIT HANDLER
// ─────────────────────────────────────────────────────────────

export async function handleSubmit(deps = null) {
  try {
    const resolvedDeps = deps || getDependencies();
    const {
      appState,
      dataHandlers,
      questions,
      surveyType,
      questionContainer,
    } = resolvedDeps;

    let SURVEY_TYPE = surveyType;

    if (!SURVEY_TYPE || typeof SURVEY_TYPE !== 'string') {
      const explicit = window.KIOSK_CONFIG?.getActiveSurveyType?.();
      SURVEY_TYPE = explicit || 'type1';
      console.error(
        `[SUBMIT] ⚠️ surveyType missing or invalid: "${surveyType}"` +
        ` — falling back to "${SURVEY_TYPE}"`
      );
    }

    if (completionInProgress) {
      console.warn('[SUBMIT] Already in progress — ignoring duplicate call');
      return;
    }
    completionInProgress = true;
    resetTriggered       = false;

    console.log('[SUBMIT] 📋 Starting submission for surveyType:', SURVEY_TYPE);

    const debugFormData = appState?.formData || {};
    console.log('[DEBUG] formData @ guard entry:', JSON.parse(JSON.stringify(debugFormData)));

    stopQuestionTimer(resolvedDeps);

    const normalizedFormData = normalizeSubmissionPayload(
      appState.formData || {},
      questions || []
    );

    console.log('[DEBUG] normalizedFormData:', JSON.parse(JSON.stringify(normalizedFormData)));

    validateFormData(normalizedFormData, SURVEY_TYPE);

    if (!hasMeaningfulResponse(debugFormData, SURVEY_TYPE)) {
      console.warn('[SUBMIT] ⚠️ Empty formData — skipping submission');
      completionInProgress = false;
      _doReset(resolvedDeps);
      return;
    }

    const queueConfig = window.CONSTANTS?.SURVEY_TYPES?.[SURVEY_TYPE];
    const queueKey    = queueConfig?.storageKey;

    if (!queueKey) {
      console.error(`[SUBMIT] ❌ No storageKey found for surveyType "${SURVEY_TYPE}" — cannot save`);
      completionInProgress = false;
      _doReset(resolvedDeps);
      return;
    }

    const surveyStartTime   = appState.surveyStartTime || Date.now();
    const totalTimeSeconds  = Math.round((Date.now() - surveyStartTime) / 1000);
    const questionTimeSpent = { ...(appState.questionTimeSpent || {}) };

    const record = buildQueueRecord(
      {
        ...normalizedFormData,
        questionTimeSpent,
        completionTimeSeconds: totalTimeSeconds,
      },
      {
        surveyType: SURVEY_TYPE,
        sync_status: 'unsynced',
      }
    );

    let saved = false;
    if (dataHandlers?.addToQueue) {
      saved = dataHandlers.addToQueue(record, queueKey);
    } else {
      console.warn('[SUBMIT] ⚠️ addToQueue not available — falling back to safeSetLocalStorage');
      try {
        const existing = JSON.parse(localStorage.getItem(queueKey) || '[]');
        existing.push(record);
        saved = dataHandlers?.safeSetLocalStorage
          ? dataHandlers.safeSetLocalStorage(queueKey, existing)
          : (localStorage.setItem(queueKey, JSON.stringify(existing)), true);
      } catch (e) {
        console.error('[SUBMIT] ❌ Fallback write failed:', e);
      }
    }

    if (!saved) {
      console.error('[SUBMIT] ❌ Failed to save record — storage may be full');
    } else {
      console.log(`[SUBMIT] ✅ Record saved to "${queueKey}" (id: ${record.id})`);
    }

    if (dataHandlers?.recordAnalytics) {
      dataHandlers.recordAnalytics(
        'survey_completed',
        buildAnalyticsEvent('survey_completed', {
          surveyId:              record.id,
          surveyType:            SURVEY_TYPE,
          totalTimeSeconds,
          completedAllQuestions: true,
        })
      );
    }

    if (dataHandlers?.updateAdminCount) {
      dataHandlers.updateAdminCount();
    }

    if (navigator.onLine && dataHandlers?.syncData) {
      dataHandlers.syncData(false, { surveyType: SURVEY_TYPE }).catch(err => {
        console.warn('[SUBMIT] Background sync failed (will retry later):', err.message);
      });
    }

    // ── Show success UI ───────────────────────────────────────────────────────
    if (typeof window.showCheckmark === 'function') {
      window.showCheckmark();
    } else if (questionContainer) {
      questionContainer.innerHTML = `
        <div style="text-align:center;padding:2rem;">
          <p style="font-size:3rem;">✅</p>
          <h2 style="font-size:1.5rem;font-weight:700;margin-bottom:0.5rem;">
            Thank you for your feedback!
          </h2>
          <p id="resetCountdown" style="color:#6b7280;font-size:1rem;">
            Kiosk resetting in 5 seconds...
          </p>
        </div>`;
    }

    // ── FIX: live countdown ticker ────────────────────────────────────────────
    let remaining = 5;
    const tick = setInterval(() => {
      remaining--;
      const el = document.getElementById('resetCountdown');
      if (el && remaining > 0) {
        el.textContent = `Kiosk resetting in ${remaining} second${remaining !== 1 ? 's' : ''}...`;
      }
      if (remaining <= 0) {
        clearInterval(tick);
        if (!resetTriggered) _doReset(resolvedDeps);
      }
    }, 1000);

    saveState(resolvedDeps);
    console.log(`[SUBMIT] ✅ Submission complete — surveyType: ${SURVEY_TYPE}, time: ${totalTimeSeconds}s`);

  } catch (err) {
    // ── Always release the lock so the user can retry ─────────────────────────
    console.error('[SUBMIT] ❌ Unexpected error during submission:', err);
    completionInProgress = false;
    throw err;
  }
}

export default { handleSubmit };
