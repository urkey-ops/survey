// FILE: api/submit-survey.js
// VERSION: 4.0.0 - Bug fixes: PROCESSING_ERROR filter, reject missing IDs, location field fix

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
  'future_wish',
  'final_thoughts',
  'sync_status',
  'timestamp',
  'id',
];

// ═══════════════════════════════════════════════════════════
// PROCESSORS
// ═══════════════════════════════════════════════════════════

/**
 * Process a Type 1 submission into a flat row array.
 * Throws on unrecoverable error so the caller can filter it out.
 */
function processSingleSubmissionType1(submission) {
  const source = submission;
  const questionTimeSpentString = source.questionTimeSpent
    ? JSON.stringify(source.questionTimeSpent) : '{}';

  // BUG #6 FIX: location field — guard against empty-string main producing "[object Object]"
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
    // If both main and other are empty, locationValue stays ''
  }

  const processedData = {
    id:                     source.id, // ID guaranteed present — validated before this call
    timestamp:              source.timestamp || new Date().toISOString(),
    sync_status:            source.sync_status || 'unsynced',
    sessionId:              source.sessionId || 'N/A',
    kioskId:                source.kioskId || 'N/A',
    startTime:              source.startTime || '',
    completedAt:            source.completedAt || '',
    abandonedAt:            source.abandonedAt || '',
    completionTimeSeconds:  source.completionTimeSeconds || '',
    questionTimeSpent:      questionTimeSpentString,
    satisfaction:           source.satisfaction || '',
    cleanliness:            source.cleanliness || '',
    staff_friendliness:     source.staff_friendliness || '',
    comments:               (source.comments || '').trim(),
    gift_shop_visit:        source.gift_shop_visit || '',
    location:               locationValue,
    age:                    source.age || '',
    hear_about: (() => {
      const hear = source.hear_about;
      try {
        if (Array.isArray(hear)) {
          return hear.filter(item => item && typeof item === 'string').join(', ');
        }
        if (hear && typeof hear === 'object' && hear.selected && Array.isArray(hear.selected)) {
          const selected = hear.selected.filter(item => item && typeof item === 'string');
          if (hear.other && selected.includes('Other')) {
            return [...selected.filter(v => v !== 'Other'), `Other: ${String(hear.other).trim()}`].join(', ');
          }
          return selected.join(', ');
        }
        return String(hear || '');
      } catch (e) {
        console.error('[SUBMIT] hear_about processing error:', e, hear);
        return 'DATA_PROCESSING_ERROR';
      }
    })(),
  };

  return COLUMN_ORDER_TYPE1.map(key => String(processedData[key] ?? ''));
}

/**
 * Process a Type 2 submission into a flat row array.
 * Throws on unrecoverable error so the caller can filter it out.
 */
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
    id:               source.id, // ID guaranteed present — validated before this call
    timestamp:        source.timestamp || new Date().toISOString(),
    sync_status:      source.sync_status || 'unsynced',
    visit_feeling:    source.visit_feeling || '',
    experiences:      flattenCheckbox(source.experiences),
    standout:         flattenRadioWithOther(source.standout),
    shayona_intent:   flattenRadioWithFollowup(source.shayona_intent),
    shayona_reason:   flattenFollowup(source.shayona_intent),
    expectation_met:  flattenRadioWithFollowup(source.expectation_met),
    expectation_diff: flattenFollowup(source.expectation_met),
    future_wish:      flattenRadioWithOther(source.future_wish),
    final_thoughts:   (source.final_thoughts || '').trim(),
  };

  return COLUMN_ORDER_TYPE2.map(key => String(processedData[key] ?? ''));
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
    SHEET_NAME    = 'Sheet1',
    SHEET_NAME_V2 = 'VisitorFeedbackV2',
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

    // ── BUG #5 FIX: Reject submissions missing an ID ──────────────────────────
    // The client assigns a stable UUID at survey-creation time via generateUUID().
    // A missing ID means a broken client payload — reject with 400 so the record
    // stays in the local queue and is not silently lost.
    const missingIdCount = submissions.filter(s => !s.id).length;
    if (missingIdCount > 0) {
      console.error(`[SUBMIT] ❌ ${missingIdCount} submission(s) missing ID — rejecting batch`);
      return response.status(400).json({
        success: false,
        message: `${missingIdCount} submission(s) are missing a required 'id' field. Assign a stable UUID on the client before queuing.`,
        successfulIds: [],
      });
    }

    // ── Determine sheet tab and processor ─────────────────────────────────────
    const isType2         = surveyType === 'type2';
    const activeSheetName = isType2 ? SHEET_NAME_V2 : SHEET_NAME;
    const columnOrder     = isType2 ? COLUMN_ORDER_TYPE2 : COLUMN_ORDER_TYPE1;
    const processor       = isType2 ? processSingleSubmissionType2 : processSingleSubmissionType1;

    console.log(`[SUBMIT] Processing ${submissions.length} submissions (${surveyType || 'type1'} → ${activeSheetName})`);

    // ── Deduplication ─────────────────────────────────────────────────────────
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
      console.log(`[SUBMIT] Filtered ${duplicateIds.length} duplicates`);
      console.log('[DEDUP] Cache stats:', getCacheStats());
    }

    if (uniqueSubmissions.length === 0) {
      return response.status(200).json({
        success:      true,
        message:      `${duplicateIds.length} duplicate submission(s) skipped.`,
        successfulIds: duplicateIds,
        duplicates:   duplicateIds.length,
      });
    }

    // ── Build rows ────────────────────────────────────────────────────────────
    // BUG #4 FIX: Process each submission individually and track which ones fail.
    // NEVER append PROCESSING_ERROR rows to the sheet.
    // Only successfully processed submissions are appended and marked as done.
    const rowsToAppend    = [];
    const processedSubs   = [];  // parallel to rowsToAppend
    const failedSubs      = [];

    for (const submission of uniqueSubmissions) {
      try {
        const row = processor(submission);

        // Extra guard: if any cell contains PROCESSING_ERROR, treat as failed
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
      // All unique submissions failed processing — return failure so client retains them
      return response.status(200).json({
        success:       false,
        message:       'All submissions failed processing. Data retained locally.',
        successfulIds: duplicateIds, // duplicates are still "done"
        newSubmissions: 0,
        duplicates:    duplicateIds.length,
        processingErrors: failedSubs.length,
        sheetName:     activeSheetName,
      });
    }

    console.log(`[SUBMIT] Sample row (${activeSheetName}):`, rowsToAppend[0]?.slice(0, 5), '...');

    // ── Append to Google Sheet ────────────────────────────────────────────────
    const appendResult = await sheets.spreadsheets.values.append({
      spreadsheetId:   SPREADSHEET_ID,
      range:           `${activeSheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: rowsToAppend },
    });

    console.log(`[SUBMIT] ✅ Appended ${rowsToAppend.length} rows to "${activeSheetName}":`, appendResult.data);

    // BUG #1 FIX: markAsProcessed() called ONLY after confirmed sheet append
    processedSubs.forEach(sub => markAsProcessed(sub.id));

    const successfulIds = [
      ...processedSubs.map(sub => sub.id),
      ...duplicateIds,
      // Note: failedSubs IDs are intentionally NOT in successfulIds
      // so the client retains them in the queue for retry
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
