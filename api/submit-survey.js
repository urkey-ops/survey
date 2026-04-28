// FILE: api/submit-survey.js
// VERSION: 4.3.0
// CHANGES FROM 4.2.0:
//   - ADD: 'browsingDiscovery' to COLUMN_ORDER_TYPE3 (after browsingBarrier,
//     before final_thoughts_category — matches ShayonaCafe sheet header order)
//   - ADD: browsingDiscovery field in processSingleSubmissionType3 processedData
//     (Branch D2 — casual browser discovery question)
//   - No other logic changes

import { google } from 'googleapis';
import { isDuplicate, markAsProcessed, getCacheStats } from './deduplication-check.js';

// ═══════════════════════════════════════════════════════════
// COLUMN DEFINITIONS PER SURVEY TYPE
// ═══════════════════════════════════════════════════════════

const COLUMN_ORDER_TYPE1 = [
  'satisfaction',
  'cleanliness',
  'staff_friendliness',
  'location',
  'age',
  'hear_about',
  'gift_shop_visit',
  'sync_status',
  'comments',
  'timestamp',
  'id',
];

const COLUMN_ORDER_TYPE2 = [
  'visit_feeling',
  'experiences',
  'standout',
  'shayona_intent',
  'shayona_reason',
  'expectation_met',
  'expectation_diff',
  'final_thoughts_category',
  'final_thoughts_text',
  'sync_status',
  'timestamp',
  'id',
];

// TYPE 3: Shayona Café
// Names match shayona-data-util.js question `name` fields exactly.
// Branch columns are blank for submissions from other branches — that is expected.
const COLUMN_ORDER_TYPE3 = [
  // ── Global (all visitors) ────────────────────────────────
  'cafeExperience',
  'visitPurpose',
  'waitTime',
  'waitAcceptable',
  'waitAcceptable_followup',
  'flowExperience',
  // ── Branch A: Grab & Go ──────────────────────────────────
  'grabGoFinding',
  'grabGoFinding_followup',
  'grabGoSpeed',
  'grabGoSpeed_followup',
  // ── Branch B: Hot Food / Buffet ──────────────────────────
  'foodPriority',
  'foodRating_taste',
  'foodRating_value',
  // ── Branch C: Catering ───────────────────────────────────
  'cateringClarity',
  'cateringClarity_followup',
  'cateringImprovement',
  // ── Branch D1: Failed Intent (wanted to purchase, did not)
  'browsingBarrier',
  // ── Branch D2: Casual Browser (just browsing) ────────────
  'browsingDiscovery',           // ← ADD v4.3.0
  // ── Final (all visitors) ─────────────────────────────────
  'final_thoughts_category',
  'final_thoughts_text',
  // ── Meta ─────────────────────────────────────────────────
  'sync_status',
  'timestamp',
  'id',
];

// ═══════════════════════════════════════════════════════════
// PROCESSORS
// ═══════════════════════════════════════════════════════════

function processSingleSubmissionType1(submission) {
  const source = submission;
  const questionTimeSpentString = source.questionTimeSpent
    ? JSON.stringify(source.questionTimeSpent) : '{}';

  let locationValue = '';
  if (source.location) {
    if (typeof source.location === 'string') {
      locationValue = source.location;
    } else if (source.location.main === 'Other' && source.location.other) {
      locationValue = source.location.other.trim();
    } else if (source.location.main) {
      locationValue = source.location.main;
    } else if (source.location.other) {
      locationValue = source.location.other.trim();
    }
  }

  let hearAboutValue = '';
  try {
    const hear = source.hear_about;
    if (Array.isArray(hear)) {
      const items     = hear.filter(item => item && typeof item === 'string');
      const otherText = (source.otherhearabout || '').trim();
      if (items.includes('Other') && otherText) {
        hearAboutValue = items
          .map(v => v === 'Other' ? `Other: ${otherText}` : v)
          .join(', ');
      } else {
        hearAboutValue = items.join(', ');
      }
    } else if (hear && typeof hear === 'object' && Array.isArray(hear.selected)) {
      const selected = hear.selected.filter(item => item && typeof item === 'string');
      if (hear.other && selected.includes('Other')) {
        hearAboutValue = selected
          .map(v => v === 'Other' ? `Other: ${String(hear.other).trim()}` : v)
          .join(', ');
      } else {
        hearAboutValue = selected.join(', ');
      }
    } else {
      hearAboutValue = String(hear || '');
    }
  } catch (e) {
    console.error('[SUBMIT] hear_about processing error:', e, source.hear_about);
    throw new Error('hear_about processing failed');
  }

  const processedData = {
    id:                    source.id,
    timestamp:             source.timestamp || new Date().toISOString(),
    sync_status:           source.sync_status || 'unsynced',
    sessionId:             source.sessionId || 'N/A',
    kioskId:               source.kioskId || 'N/A',
    startTime:             source.startTime || '',
    completedAt:           source.completedAt || '',
    abandonedAt:           source.abandonedAt || '',
    completionTimeSeconds: source.completionTimeSeconds || '',
    questionTimeSpent:     questionTimeSpentString,
    satisfaction:          source.satisfaction || '',
    cleanliness:           source.cleanliness || '',
    staff_friendliness:    source.staff_friendliness || '',
    comments:              (source.comments || '').trim(),
    gift_shop_visit:       source.gift_shop_visit || '',
    location:              locationValue,
    age:                   source.age || '',
    hear_about:            hearAboutValue,
  };

  return COLUMN_ORDER_TYPE1.map(key => String(processedData[key] ?? ''));
}

function processSingleSubmissionType2(submission) {
  const source = submission;

  const flattenRadioWithOther = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val.main === 'Other' && val.other) return `Other: ${val.other.trim()}`;
    return val.main || '';
  };

  const flattenRadioWithFollowup = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return val.main || '';
  };

  const flattenFollowup = (val) => {
    if (!val) return '';
    if (typeof val === 'object' && Array.isArray(val.followup)) {
      return val.followup.join(', ');
    }
    return '';
  };

  const flattenCheckbox = (val) => {
    if (!val) return '';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object' && Array.isArray(val.selected)) return val.selected.join(', ');
    return String(val);
  };

  const processedData = {
    id:                      source.id,
    timestamp:               source.timestamp || new Date().toISOString(),
    sync_status:             source.sync_status || 'unsynced',
    visit_feeling:           source.visit_feeling || source.satisfaction || '',
    experiences:             flattenCheckbox(source.experiences),
    standout:                flattenRadioWithOther(source.standout),
    shayona_intent:          flattenRadioWithFollowup(source.shayona_intent),
    shayona_reason:          flattenFollowup(source.shayona_intent),
    expectation_met:         flattenRadioWithFollowup(source.expectation_met),
    expectation_diff:        flattenFollowup(source.expectation_met),
    final_thoughts_category: source.final_thoughts_category || '',
    final_thoughts_text:     (source.final_thoughts_text || '').trim(),
  };

  return COLUMN_ORDER_TYPE2.map(key => String(processedData[key] ?? ''));
}

/**
 * Process a Type 3 (Shayona Café) submission into a flat row array.
 *
 * FIX v4.3.1:
 *   submit.js (v3.7.0) normalizes dual-star-rating BEFORE queuing:
 *     IN:  { foodRating: { taste: 4, value: 3 } }
 *     OUT: { foodRating_taste: 4, foodRating_value: 3 }  (foodRating key deleted)
 *
 *   Previous code read source.foodRating (now always undefined) and derived
 *   taste/value from it — always producing empty strings in the sheet.
 *
 *   Fix: read the flat keys directly from source, exactly as submit.js stores them.
 *
 * Global questions populate for every visitor.
 * Branch columns will be blank for visitors on other branches — correct behaviour.
 *
 * selector-textarea (finalThoughts) is flattened to
 * final_thoughts_category / final_thoughts_text by normalizeSubmissionPayload()
 * in submit.js before queuing. The raw { category, text } shape is handled
 * defensively here as a fallback.
 */
function processSingleSubmissionType3(submission) {
  const source = submission;

  // radio-with-followup: main selection only
  const flattenMain = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return val.main || '';
  };

  // radio-with-followup: followup array → joined string
  const flattenFollowup = (val) => {
    if (!val) return '';
    if (typeof val === 'object' && Array.isArray(val.followup)) {
      return val.followup.join(', ');
    }
    return '';
  };

  // radio-with-other: "Other: typed text" when applicable
  const flattenRadioWithOther = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val.main === 'Other' && val.other) return `Other: ${val.other.trim()}`;
    return val.main || '';
  };

  // FIX v4.3.1: submit.js flattens dual-star-rating before queuing.
  // source.foodRating no longer exists — read the flat keys directly.
  // Defensive fallback: if somehow the old nested shape arrives (e.g. a
  // record queued before the submit.js upgrade), derive from it instead.
  const legacyFoodRating = source.foodRating || {};
  const tasteRaw  = source.foodRating_taste  != null && source.foodRating_taste  !== ''
    ? source.foodRating_taste
    : (legacyFoodRating.taste  != null ? legacyFoodRating.taste  : '');
  const valueRaw  = source.foodRating_value  != null && source.foodRating_value  !== ''
    ? source.foodRating_value
    : (legacyFoodRating.value  != null ? legacyFoodRating.value  : '');

  const processedData = {
    id:                      source.id,
    timestamp:               source.timestamp || new Date().toISOString(),
    sync_status:             source.sync_status || 'unsynced',

    // ── Global ──────────────────────────────────────────────
    cafeExperience:           source.cafeExperience || '',
    visitPurpose:             flattenRadioWithOther(source.visitPurpose),
    waitTime:                 source.waitTime || '',
    waitAcceptable:           flattenMain(source.waitAcceptable),
    waitAcceptable_followup:  flattenFollowup(source.waitAcceptable),
    flowExperience:           source.flowExperience || '',

    // ── Branch A: Grab & Go ─────────────────────────────────
    grabGoFinding:            flattenMain(source.grabGoFinding),
    grabGoFinding_followup:   flattenFollowup(source.grabGoFinding),
    grabGoSpeed:              flattenMain(source.grabGoSpeed),
    grabGoSpeed_followup:     flattenFollowup(source.grabGoSpeed),

    // ── Branch B: Hot Food / Buffet ─────────────────────────
    foodPriority:             source.foodPriority || '',
    // FIX v4.3.1: read flat keys, not source.foodRating nested object
    foodRating_taste:         tasteRaw !== '' ? String(tasteRaw) : '',
    foodRating_value:         valueRaw !== '' ? String(valueRaw) : '',

    // ── Branch C: Catering ──────────────────────────────────
    cateringClarity:          flattenMain(source.cateringClarity),
    cateringClarity_followup: flattenFollowup(source.cateringClarity),
    cateringImprovement:      source.cateringImprovement || '',

    // ── Branch D1: Failed Intent ────────────────────────────
    browsingBarrier:          source.browsingBarrier   || '',

    // ── Branch D2: Casual Browser ───────────────────────────
    browsingDiscovery:        source.browsingDiscovery || '',

    // ── Final ────────────────────────────────────────────────
    final_thoughts_category:  source.final_thoughts_category
                                || source.finalThoughts?.category
                                || '',
    final_thoughts_text:      (
                                source.final_thoughts_text
                                || source.finalThoughts?.text
                                || ''
                              ).toString().trim(),
  };

  return COLUMN_ORDER_TYPE3.map(key => String(processedData[key] ?? ''));
}

// ═══════════════════════════════════════════════════════════
// ROUTE RESOLVER
// Maps surveyType → { sheetName, processor }
// To add a new type: add COLUMN_ORDER + processor above,
// then add one entry here. Nothing else changes.
// ═══════════════════════════════════════════════════════════

function getRouteForSurveyType(surveyType) {
  const {
    SHEET_NAME    = 'Sheet1',
    SHEET_NAME_V2 = 'VisitorFeedbackV2',
    SHEET_NAME_V3 = 'ShayonaCafe',
  } = process.env;

  const routes = {
    type1: { sheetName: SHEET_NAME,    processor: processSingleSubmissionType1 },
    type2: { sheetName: SHEET_NAME_V2, processor: processSingleSubmissionType2 },
    type3: { sheetName: SHEET_NAME_V3, processor: processSingleSubmissionType3 },
  };

  const route = routes[surveyType];

  if (!route) {
    console.warn(`[SUBMIT] Unknown surveyType "${surveyType}" — defaulting to type1`);
    return routes['type1'];
  }

  return route;
}

// ═══════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  const {
    SPREADSHEET_ID,
    GOOGLE_SERVICE_ACCOUNT_EMAIL,
    GOOGLE_PRIVATE_KEY,
  } = process.env;

  if (!SPREADSHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.error('[SUBMIT] Missing required environment variables');
    return response.status(500).json({
      success: false, message: 'Server configuration error.', successfulIds: [],
    });
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key:  GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const { submissions, surveyType } = request.body;

    if (!Array.isArray(submissions) || submissions.length === 0) {
      return response.status(200).json({
        success: true, message: 'No submissions received.', successfulIds: [],
      });
    }

    const missingIdCount = submissions.filter(s => !s.id).length;
    if (missingIdCount > 0) {
      console.error(`[SUBMIT] ❌ ${missingIdCount} submission(s) missing ID — rejecting batch`);
      return response.status(400).json({
        success: false,
        message: `${missingIdCount} submission(s) are missing a required 'id' field.`,
        successfulIds: [],
      });
    }

    // Resolve sheet tab + processor from surveyType
    const { sheetName: activeSheetName, processor } = getRouteForSurveyType(surveyType || 'type1');

    console.log(`[SUBMIT] Processing ${submissions.length} submission(s) (${surveyType || 'type1'} → "${activeSheetName}")`);

    // Deduplication
    const uniqueSubmissions = [];
    const duplicateIds      = [];

    for (const submission of submissions) {
      if (isDuplicate(submission.id)) {
        console.warn(`[SUBMIT] 🚫 Duplicate: ${submission.id}`);
        duplicateIds.push(submission.id);
      } else {
        uniqueSubmissions.push(submission);
      }
    }

    if (duplicateIds.length > 0) {
      console.log(`[SUBMIT] Filtered ${duplicateIds.length} duplicate(s)`);
      console.log('[DEDUP] Cache stats:', getCacheStats());
    }

    if (uniqueSubmissions.length === 0) {
      return response.status(200).json({
        success:       true,
        message:       `${duplicateIds.length} duplicate submission(s) skipped.`,
        successfulIds: duplicateIds,
        duplicates:    duplicateIds.length,
      });
    }

    // Build rows — track failures individually
    const rowsToAppend  = [];
    const processedSubs = [];
    const failedSubs    = [];

    for (const submission of uniqueSubmissions) {
      try {
        const row = processor(submission);
        if (row.some(cell => cell === 'PROCESSING_ERROR')) {
          console.error(`[SUBMIT] ❌ Row for ${submission.id} contains PROCESSING_ERROR — skipping`);
          failedSubs.push(submission);
          continue;
        }
        rowsToAppend.push(row);
        processedSubs.push(submission);
      } catch (e) {
        console.error(`[SUBMIT] ❌ Exception processing submission ${submission.id}:`, e);
        failedSubs.push(submission);
      }
    }

    if (failedSubs.length > 0) {
      console.error(`[SUBMIT] ⚠️ ${failedSubs.length} submission(s) failed processing — retained in client queue`);
    }

    if (rowsToAppend.length === 0) {
      return response.status(200).json({
        success:          false,
        message:          'All submissions failed processing. Data retained locally.',
        successfulIds:    duplicateIds,
        newSubmissions:   0,
        duplicates:       duplicateIds.length,
        processingErrors: failedSubs.length,
        sheetName:        activeSheetName,
      });
    }

    console.log(`[SUBMIT] Sample row (${activeSheetName}):`, rowsToAppend[0]?.slice(0, 5), '...');

    // Append to Google Sheet
    const appendResult = await sheets.spreadsheets.values.append({
      spreadsheetId:    SPREADSHEET_ID,
      range:            `${activeSheetName}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: rowsToAppend },
    });

    console.log(`[SUBMIT] ✅ Appended ${rowsToAppend.length} row(s) to "${activeSheetName}":`, appendResult.data);

    // markAsProcessed ONLY after confirmed sheet append
    processedSubs.forEach(sub => markAsProcessed(sub.id));

    const successfulIds = [
      ...processedSubs.map(sub => sub.id),
      ...duplicateIds,
      // failedSubs IDs intentionally excluded — client retains for retry
    ];

    return response.status(200).json({
      success:          true,
      message:          `${processedSubs.length} new + ${duplicateIds.length} duplicates + ${failedSubs.length} failed.`,
      successfulIds,
      newSubmissions:   processedSubs.length,
      duplicates:       duplicateIds.length,
      processingErrors: failedSubs.length,
      sheetName:        activeSheetName,
    });

  } catch (error) {
    console.error('[SUBMIT] API Error:', error.message);
    if (error.response) {
      console.error('[SUBMIT] Google Sheets API Response:', error.response.data);
    }
    return response.status(500).json({
      success:       false,
      message:       'Internal Server Error during sheet append. Data retained locally.',
      successfulIds: [],
      error:         process.env.NODE_ENV === 'development' ? error.message : 'Server error',
    });
  }
}
