// FILE: main/contracts.js
// PURPOSE: Single source of truth for all data shapes — queue records,
//          analytics events, and formData field schemas.
// AUTHORITY: Any code that writes a queue record or analytics event must
//            use the factory functions here. No raw object literals with
//            sync_status, abandonedAt, or abandonedReason outside these factories.
// LOAD ORDER: After config.js (needs CONSTANTS), before all consumers.
// VERSION: 1.0.0

// ─── CONFIG VERSION ───────────────────────────────────────────────────────────
// Bump this when config.js changes in a breaking way (renamed key, new endpoint).
// Boot check in appState.js or index.js compares this against the SW cache name
// to detect stale cache before any data is written.
// Current SW cache name: 'kiosk-survey-v48' — parsed suffix compared to this.

export const CONFIG_VERSION = '3.4';  // matches config.js v3.4.0

export function validateConfigVersion() {
  // SW cache name format: 'kiosk-survey-vNN' — extract the numeric suffix
  // This is called at boot. If mismatch: clear kioskState and force reload
  // before any formData is written — prevents wrong-schema submissions.
  // NOTE: Cannot access CacheStorage from page context; instead compare
  // CONFIG_VERSION against a known baked constant. When SW is bumped,
  // increment CONFIG_VERSION here too and the mismatch self-heals on next load.
  const baked = window.__EXPECTED_CONFIG_VERSION__;  // set by SW on activate via postMessage
  if (!baked) {
    // SW hasn't posted yet (first paint) — skip, will catch on next load
    return true;
  }
  if (baked !== CONFIG_VERSION) {
    console.error(
      `[CONTRACTS] ❌ Config version mismatch — page has "${CONFIG_VERSION}", ` +
      `SW baked "${baked}". Clearing state and reloading.`
    );
    localStorage.removeItem('kioskState');
    location.reload();
    return false;
  }
  console.log(`[CONTRACTS] ✅ Config version "${CONFIG_VERSION}" verified`);
  return true;
}

// ─── QUEUE RECORD FACTORY ─────────────────────────────────────────────────────
// Single builder for ALL three queue writers:
//   Writer 1: submit.js           (normal completion)
//   Writer 2: adminSurveyControls.js (partial save on type switch)
//   Writer 3: queueManager.addToQueue() should receive the output of this
//
// sync_status values: 'unsynced' | 'unsynced_partial'
// Required meta fields: surveyType
// Optional meta fields: abandonedAt, abandonedReason (partial saves only)

export function buildQueueRecord(formData, meta = {}) {
  const surveyType = meta.surveyType
    || window.KIOSK_CONFIG?.getActiveSurveyType?.()
    || 'type1';

  return {
    // ── Identity ───────────────────────────────────────────────────────────
    id: formData.id || crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    surveyType,
    kioskId: window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',

    // ── Timestamps ─────────────────────────────────────────────────────────
    submittedAt: new Date().toISOString(),

    // ── Survey payload ─────────────────────────────────────────────────────
    ...formData,

    // ── Sync metadata ──────────────────────────────────────────────────────
    sync_status: meta.sync_status || 'unsynced',

    // ── Partial/abandon metadata — only written when provided ──────────────
    ...(meta.abandonedAt     ? { abandonedAt:     meta.abandonedAt     } : {}),
    ...(meta.abandonedReason ? { abandonedReason: meta.abandonedReason } : {}),
  };
}

// ─── ANALYTICS EVENT FACTORY ──────────────────────────────────────────────────
// analyticsManager.js reads these specific fields during syncAnalytics():
//   a.questionIndex, a.questionId, a.totalTimeSeconds, a.eventType
// If callers pass wrong field names, dropoffByQuestion and avgCompletionTime
// silently compute wrong values — the server call still succeeds so no error shows.
//
// submit.js currently calls: recordAnalytics('survey_completed', {
//   surveyId, surveyType, questionIndex, totalTimeSeconds, completedAllQuestions })
// — missing: questionId (not critical for completions but documented here)
//
// inactivityHandler/other abandon callers must pass: questionIndex, questionId

export function buildAnalyticsEvent(eventType, data = {}) {
  const base = {
    timestamp:  new Date().toISOString(),
    eventType,
    surveyType: window.KIOSK_CONFIG?.getActiveSurveyType?.() ?? 'type1',
    kioskId:    window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
    surveyId:   window.appState?.formData?.id || null,
  };

  // Required field validation per eventType — warns loudly, never silently drops
  if (eventType === 'survey_completed') {
    if (data.totalTimeSeconds === undefined) {
      console.warn('[CONTRACTS] ⚠️ survey_completed missing totalTimeSeconds — avgCompletionTime will be wrong');
    }
  }

  if (eventType === 'survey_abandoned') {
    if (data.questionIndex === undefined) {
      console.warn('[CONTRACTS] ⚠️ survey_abandoned missing questionIndex — dropoffByQuestion will be wrong');
    }
    if (data.questionId === undefined) {
      console.warn('[CONTRACTS] ⚠️ survey_abandoned missing questionId — dropoffByQuestion key will be "q?:unknown"');
    }
  }

  return { ...base, ...data };
}

// ─── FORM DATA SCHEMA ─────────────────────────────────────────────────────────
// Field names verified against actual question definitions in:
//   surveys/data-util.js     (type1: surveyQuestionsType1, type2: surveyQuestionsType2)
//   surveys/shayona-data-util.js (type3: surveyQuestionsType3)
//
// submit.js calls normalizeSubmissionPayload() which flattens:
//   radio-with-other     → { main, other } object (kept nested in queue, flattened for sheet)
//   radio-with-followup  → { main, followup[] } object
//   selector-textarea    → flattened to ${name}_category and ${name}_text
//   dual-star-rating     → flattened to ${name}_taste and ${name}_value
//   section-header       → deleted (no data field)
//
// Schema lists the final flat field names as they appear in the queue record.
// WARNING: These are warnings only — branching surveys legitimately skip fields.

export const FORM_DATA_SCHEMA = {
  type1: [
    'id', 'surveyType', 'kioskId',
    'satisfaction',       // emoji-radio → string value
    'cleanliness',        // number-scale → number
    'staff_friendliness', // star-rating → number
    'location',           // radio-with-other → { main, other } object
    'age',                // radio → string value
    'hear_about',         // checkbox-with-other → string[]
    'gift_shop_visit',    // emoji-radio → string value
    'comments',           // textarea → string
  ],
  type2: [
    'id', 'surveyType', 'kioskId',
    'satisfaction',        // emoji-radio → string value
    'experiences',         // checkbox-with-other → string[]
    'standout',            // radio-with-other → { main, other } object
    'shayona_intent',      // radio-with-followup → { main, followup[] }
    'expectation_met',     // radio-with-followup → { main, followup[] }
    'final_thoughts_category', // selector-textarea flattened
    'final_thoughts_text',     // selector-textarea flattened
  ],
  type3: [
    'id', 'surveyType', 'kioskId',
    'cafeExperience',      // emoji-radio → string value
    'visitPurpose',        // radio → string value (drives branching)
    // purchaser branch:
    'waitTime',            // radio → string value
    'waitAcceptable',      // radio-with-followup → { main, followup[] }
    'flowExperience',      // radio → string value
    // Grab & Go branch:
    'grabGoFinding',       // radio-with-followup → { main, followup[] }
    'grabGoSpeed',         // radio-with-followup → { main, followup[] }
    // Hot Food|Buffet branch:
    'foodPriority',        // radio → string value
    'foodRating_taste',    // dual-star-rating flattened → number
    'foodRating_value',    // dual-star-rating flattened → number
    // Catering branch:
    'cateringClarity',     // radio-with-followup → { main, followup[] }
    'cateringImprovement', // radio → string value
    // Failed Intent branch:
    'browsingBarrier',     // radio → string value
    // Browsing branch:
    'browsingDiscovery',   // radio → string value (not required)
    // Always present:
    'final_thoughts_category', // selector-textarea flattened
    'final_thoughts_text',     // selector-textarea flattened
  ],
};

export function validateFormData(formData, surveyType) {
  const schema = FORM_DATA_SCHEMA[surveyType];
  if (!schema) {
    console.warn(`[CONTRACTS] ⚠️ No schema for surveyType "${surveyType}" — skipping validation`);
    return;
  }

  // Check only non-metadata, non-branching fields — warn, never block
  const coreFields = schema.filter(f => !['id','surveyType','kioskId'].includes(f));
  const missing = coreFields.filter(field =>
    formData[field] === undefined || formData[field] === null || formData[field] === ''
  );

  if (missing.length) {
    console.warn(
      `[CONTRACTS] ⚠️ formData for ${surveyType} is missing expected fields: ${missing.join(', ')} ` +
      `(may be valid for branching surveys — check if these branches were active)`
    );
  } else {
    console.log(`[CONTRACTS] ✅ formData shape valid for ${surveyType}`);
  }
}
