// FILE: main/contracts.js
// PURPOSE: Single source of truth for all data shapes — queue records,
//          analytics events, formData field schemas, config version.
// VERSION: 1.0.0
// AUTHORITY: Any code that writes a queue record or analytics event must
//            use the factory functions here. No raw object literals with
//            sync_status, abandonedAt, or abandonedReason outside these factories.
// LOAD ORDER: type="module" — imported by consumers (submit.js, adminSurveyControls.js,
//             analyticsManager.js). Also imported by main/index.js for boot check.

// ─── CONFIG VERSION ───────────────────────────────────────────────────────────
// Bump this string when config.js changes in a breaking way (renamed key,
// new required endpoint, schema change). The service worker posts its baked
// version via postMessage on activate. Boot check compares the two and forces
// a cache-clear reload on mismatch — prevents stale-cache submissions.
//
// Current pairing:
//   config.js       v3.4.0   → CONFIG_VERSION '3.4'
//   service-worker  v9.8.0   → posts CONFIG_VERSION '3.4' on activate
//
// When bumping: change this string AND the SW postMessage value AND
// increment CACHE_NAME / RUNTIME_CACHE in service-worker.js.

export const CONFIG_VERSION = '3.4';

export function validateConfigVersion() {
  const baked = window.__EXPECTED_CONFIG_VERSION__;

  if (!baked) {
    // SW has not posted yet (first paint race) — skip silently, caught on next load
    console.log('[CONTRACTS] ℹ️ CONFIG_VERSION check deferred — SW message not yet received');
    return true;
  }

  if (baked !== CONFIG_VERSION) {
    console.error(
      `[CONTRACTS] ❌ Config version mismatch — page expects "${CONFIG_VERSION}", ` +
      `SW reports "${baked}". Clearing kioskState and forcing reload to prevent ` +
      `wrong-schema submissions.`
    );
    try { localStorage.removeItem('kioskState'); } catch (_) {}
    location.reload();
    return false;
  }

  console.log(`[CONTRACTS] ✅ Config version "${CONFIG_VERSION}" verified`);
  return true;
}

// ─── QUEUE RECORD FACTORY ─────────────────────────────────────────────────────
// Single builder for ALL queue writers.
//
// Writer 1 — submit.js (normal completion)
//   Previously: raw object pushed directly to array + safeSetLocalStorage()
//   After:      buildQueueRecord(normalizedFormData, { surveyType, sync_status:'unsynced' })
//               passed to dataHandlers.addToQueue()
//
// Writer 2 — adminSurveyControls.js (partial save on type switch)
//   Previously: raw object with abandonedAt/abandonedReason + direct localStorage.setItem()
//   After:      buildQueueRecord(partialData, { surveyType, abandonedAt, abandonedReason,
//               sync_status:'unsynced_partial' }) passed to addToQueue()
//
// Writer 3 — queueManager.addToQueue() is the final storage writer for both above.
//   It handles deduplication, size limits, and updateAdminCount.
//
// sync_status values: 'unsynced' | 'unsynced_partial'
// meta.abandonedAt / meta.abandonedReason — only written when explicitly provided

export function buildQueueRecord(formData = {}, meta = {}) {
  const surveyType = meta.surveyType
    || window.KIOSK_CONFIG?.getActiveSurveyType?.()
    || 'type1';

  const id = formData.id
    || (typeof crypto !== 'undefined' && crypto.randomUUID?.())
    || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const record = {
    // ── Identity ─────────────────────────────────────────────────────────
    id,
    surveyType,
    kioskId: window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',

    // ── Timestamps ───────────────────────────────────────────────────────
    submittedAt: new Date().toISOString(),

    // ── Survey payload ───────────────────────────────────────────────────
    ...formData,

    // ── Sync metadata ────────────────────────────────────────────────────
    sync_status: meta.sync_status || 'unsynced',
  };

  // Partial/abandon metadata — only written when explicitly provided
  // This prevents undefined keys appearing in normal completion records
  if (meta.abandonedAt)     record.abandonedAt     = meta.abandonedAt;
  if (meta.abandonedReason) record.abandonedReason = meta.abandonedReason;

  return record;
}

// ─── ANALYTICS EVENT FACTORY ──────────────────────────────────────────────────
// analyticsManager.js syncAnalytics() reads these specific fields:
//   a.questionIndex      → used in dropoffByQuestion key
//   a.questionId         → used in dropoffByQuestion key
//   a.totalTimeSeconds   → used in avgCompletionTime calculation
//   a.eventType          → used to separate completions from abandonments
//
// If callers pass wrong field names the aggregation silently computes wrong
// values — the server call still succeeds so no error is visible.
//
// All callers of recordAnalytics() must be migrated to use this factory.
// Current confirmed callers:
//   submit.js           → 'survey_completed'  passes: totalTimeSeconds ✅ missing: questionId ⚠️
//   inactivityHandler   → 'survey_abandoned'  must pass: questionIndex, questionId
//   dataSync.js         → 'sync_completed', 'sync_partial_or_failed', 'sync_failed' (no field req)
//   adminSurveyControls → 'survey_type_switched' (no field req)
//   networkHandler area → 'network_restored', 'network_lost' (no field req)

export function buildAnalyticsEvent(eventType, data = {}) {
  const base = {
    timestamp:  new Date().toISOString(),
    eventType,
    surveyType: window.KIOSK_CONFIG?.getActiveSurveyType?.() ?? 'type1',
    kioskId:    window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
    surveyId:   window.appState?.formData?.id || null,
  };

  // Required field validation per eventType
  // Warns loudly — never silently drops the event
  if (eventType === 'survey_completed') {
    if (data.totalTimeSeconds === undefined) {
      console.warn(
        '[CONTRACTS] ⚠️ survey_completed missing totalTimeSeconds — ' +
        'avgCompletionTime in analytics dashboard will be wrong'
      );
    }
  }

  if (eventType === 'survey_abandoned') {
    if (data.questionIndex === undefined) {
      console.warn(
        '[CONTRACTS] ⚠️ survey_abandoned missing questionIndex — ' +
        'dropoffByQuestion will use "q?:..." key'
      );
    }
    if (data.questionId === undefined) {
      console.warn(
        '[CONTRACTS] ⚠️ survey_abandoned missing questionId — ' +
        'dropoffByQuestion will use "...:unknown" key'
      );
    }
  }

  return { ...base, ...data };
}

// ─── FORM DATA SCHEMA ─────────────────────────────────────────────────────────
// Field names verified against actual question definitions:
//   surveys/data-util.js         type1: surveyQuestionsType1 (8 questions)
//                                type2: surveyQuestionsType2 (6 questions)
//   surveys/shayona-data-util.js type3: surveyQuestionsType3 (16 questions, branching)
//
// Normalization applied by submit.js normalizeSubmissionPayload():
//   selector-textarea  → ${name}_category + ${name}_text  (original key deleted)
//   dual-star-rating   → ${name}_taste + ${name}_value     (original key deleted)
//   radio-with-other   → { main, other } object kept nested
//   radio-with-followup→ { main, followup[] } object kept nested
//   section-header     → deleted (no data)
//   number-scale       → number
//   star-rating        → number
//   emoji-radio        → string
//   radio              → string
//   checkbox / checkbox-with-other → string[]
//   textarea           → string
//
// Schema lists final field names as they appear in the queue record after normalization.
// Validation is warning-only — branching surveys legitimately skip branch-specific fields.

export const FORM_DATA_SCHEMA = {
  type1: [
    // Core identity (always present)
    'id', 'surveyType', 'kioskId',
    // Question fields — 8 questions, all required, no branching
    'satisfaction',       // emoji-radio → string
    'cleanliness',        // number-scale → number
    'staff_friendliness', // star-rating  → number  (q.name: 'staff_friendliness', q.id: 'stafffriendliness')
    'location',           // radio-with-other → { main, other }
    'age',                // radio → string
    'hear_about',         // checkbox-with-other → string[]
    'gift_shop_visit',    // emoji-radio → string
    'comments',           // textarea → string  (q.name: 'comments', q.id: 'enjoyedmost')
  ],
  type2: [
    // Core identity
    'id', 'surveyType', 'kioskId',
    // Question fields — 6 questions, last one optional
    'satisfaction',            // emoji-radio → string
    'experiences',             // checkbox-with-other → string[]
    'standout',                // radio-with-other → { main, other }
    'shayona_intent',          // radio-with-followup → { main, followup[] }
    'expectation_met',         // radio-with-followup → { main, followup[] }
    'final_thoughts_category', // selector-textarea flattened (optional, not required)
    'final_thoughts_text',     // selector-textarea flattened (optional, not required)
  ],
  type3: [
    // Core identity
    'id', 'surveyType', 'kioskId',
    // Always-present questions (no branch)
    'cafeExperience', // emoji-radio → string
    'visitPurpose',   // radio → string  (drives all branching below)
    // purchaser branch (all purposes except Browsing + Failed Intent)
    'waitTime',       // radio → string
    'waitAcceptable', // radio-with-followup → { main, followup[] }
    'flowExperience', // radio → string
    // Grab & Go branch
    'grabGoFinding',  // radio-with-followup → { main, followup[] }
    'grabGoSpeed',    // radio-with-followup → { main, followup[] }
    // Hot Food|Buffet branch
    'foodPriority',      // radio → string
    'foodRating_taste',  // dual-star-rating flattened → number
    'foodRating_value',  // dual-star-rating flattened → number
    // Catering branch
    'cateringClarity',      // radio-with-followup → { main, followup[] }
    'cateringImprovement',  // radio → string
    // Failed Intent branch
    'browsingBarrier',   // radio → string
    // Browsing branch
    'browsingDiscovery', // radio → string (not required)
    // Always-present optional final question
    'final_thoughts_category', // selector-textarea flattened
    'final_thoughts_text',     // selector-textarea flattened
  ],
};

export function validateFormData(formData, surveyType) {
  const schema = FORM_DATA_SCHEMA[surveyType];
  if (!schema) {
    console.warn(
      `[CONTRACTS] ⚠️ No schema defined for surveyType "${surveyType}" — ` +
      `skipping formData validation. Add schema to contracts.js if this is a new type.`
    );
    return;
  }

  // Skip identity fields — check only question-answer fields
  const questionFields = schema.filter(f => !['id', 'surveyType', 'kioskId'].includes(f));

  const missing = questionFields.filter(field => {
    const val = formData[field];
    if (val === undefined || val === null) return true;
    if (typeof val === 'string'  && val.trim() === '') return true;
    if (Array.isArray(val)       && val.length === 0)  return true;
    return false;
  });

  if (missing.length) {
    console.warn(
      `[CONTRACTS] ⚠️ formData for "${surveyType}" has empty/missing fields: ` +
      `${missing.join(', ')} — expected if these branches were not active for this visitor`
    );
  } else {
    console.log(`[CONTRACTS] ✅ formData shape valid for "${surveyType}"`);
  }
}

console.log('[CONTRACTS] ✅ contracts.js loaded (v1.0.0)');
