// FILE: main/contracts.js
// PURPOSE: Single source of truth for all data shapes — queue records,
//          analytics events, formData field schemas, config version.
// VERSION: 1.0.1
// CHANGES FROM 1.0.0:
//   - FIX BUG-22: buildAnalyticsEvent() base object now sets
//     surveyType: data.surveyType ?? null instead of always calling
//     window.KIOSK_CONFIG.getActiveSurveyType(). Previously every analytics
//     event — including sync events, network events, and admin events that
//     have no survey context — was stamped with whatever survey type happened
//     to be active at the moment of the call. This caused non-survey events
//     to pollute the byType breakdown in _buildPayload (analyticsManager.js),
//     inflating completed/abandoned counts for the active type. Now callers
//     that DO have survey context pass surveyType explicitly in the data
//     argument; callers without survey context pass nothing and get null,
//     which _buildPayload's `if (!a.surveyType) return;` guard already
//     correctly skips.

// ─── CONFIG VERSION ───────────────────────────────────────────────────────────
export const CONFIG_VERSION = '3.4';

export function validateConfigVersion() {
  const baked = window.__EXPECTED_CONFIG_VERSION__;

  if (!baked) {
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
  if (meta.abandonedAt)     record.abandonedAt     = meta.abandonedAt;
  if (meta.abandonedReason) record.abandonedReason = meta.abandonedReason;

  return record;
}

// ─── ANALYTICS EVENT FACTORY ──────────────────────────────────────────────────

/**
 * Build a validated analytics event object.
 *
 * FIX BUG-22: surveyType is now data.surveyType ?? null instead of always
 * calling getActiveSurveyType(). This prevents non-survey events (sync,
 * network, admin) from being misattributed to the currently active survey
 * type in the byType analytics breakdown. Callers with survey context must
 * pass surveyType explicitly in the data argument.
 *
 * Survey callers — pass surveyType explicitly:
 *   buildAnalyticsEvent('survey_completed', { surveyType: 'type3', totalTimeSeconds: 42 })
 *
 * Non-survey callers — omit surveyType, gets null:
 *   buildAnalyticsEvent('sync_completed', { synced: 5 })
 *   buildAnalyticsEvent('network_restored', { queueSize: 3 })
 *
 * analyticsManager._buildPayload already guards: if (!a.surveyType) return;
 * so null-typed events are correctly excluded from byType counts.
 */
export function buildAnalyticsEvent(eventType, data = {}) {
  const base = {
    timestamp: new Date().toISOString(),
    eventType,

    // FIX BUG-22: Default to data.surveyType if provided by caller, else null.
    // Do NOT fall back to getActiveSurveyType() — that causes sync/network/admin
    // events to be misattributed to whatever survey is currently active.
    surveyType: data.surveyType ?? null,

    kioskId:  window.KIOSK_CONFIG?.KIOSK_ID || 'UNKNOWN',
    surveyId: window.appState?.formData?.id || null,
  };

  // Required field validation per eventType
  if (eventType === 'survey_completed') {
    if (data.totalTimeSeconds === undefined) {
      console.warn(
        '[CONTRACTS] ⚠️ survey_completed missing totalTimeSeconds — ' +
        'avgCompletionTime in analytics dashboard will be wrong'
      );
    }
    if (!data.surveyType) {
      console.warn(
        '[CONTRACTS] ⚠️ survey_completed missing surveyType — ' +
        'byType breakdown will not count this completion. Pass surveyType explicitly.'
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
    if (!data.surveyType) {
      console.warn(
        '[CONTRACTS] ⚠️ survey_abandoned missing surveyType — ' +
        'byType breakdown will not count this abandonment. Pass surveyType explicitly.'
      );
    }
  }

  return { ...base, ...data };
}

// ─── FORM DATA SCHEMA ─────────────────────────────────────────────────────────

export const FORM_DATA_SCHEMA = {
  type1: [
    'id', 'surveyType', 'kioskId',
    'satisfaction',
    'cleanliness',
    'staff_friendliness',
    'location',
    'age',
    'hear_about',
    'gift_shop_visit',
    'comments',
  ],
  type2: [
    'id', 'surveyType', 'kioskId',
    'satisfaction',
    'experiences',
    'standout',
    'shayona_intent',
    'expectation_met',
    'final_thoughts_category',
    'final_thoughts_text',
  ],
  type3: [
    'id', 'surveyType', 'kioskId',
    'cafeExperience',
    'visitPurpose',
    'waitTime',
    'waitAcceptable',
    'flowExperience',
    'grabGoFinding',
    'grabGoSpeed',
    'foodPriority',
    'foodRating_taste',
    'foodRating_value',
    'cateringClarity',
    'cateringImprovement',
    'browsingBarrier',
    'browsingDiscovery',
    'final_thoughts_category',
    'final_thoughts_text',
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

console.log('[CONTRACTS] ✅ contracts.js loaded (v1.0.1)');
