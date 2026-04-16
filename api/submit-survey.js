// FILE: api/submit-survey.js
// VERSION: 4.1.0 - FIXES:
//   1. hear_about Other text now appended inline: "Instagram, Other: typed text"
//   2. COLUMN_ORDER_TYPE2 'future_wish' column removed (question no longer exists)
//   3. processSingleSubmissionType2 future_wish references removed

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
  'hear_about',       // "Instagram, Friend, Other: typed text" — Other inline
  'gift_shop_visit',
  'sync_status',
  'comments',
  'timestamp',
  'id',
];

// TYPE 2: future_wish removed — question no longer in survey
const COLUMN_ORDER_TYPE2 = [
  'visit_feeling',
  'experiences',
  'standout',         // "Something Else: typed text" when Other selected
  'shayona_intent',   // main selection only
  'shayona_reason',   // followup checkboxes joined
  'expectation_met',  // main selection only
  'expectation_diff', // followup checkboxes joined
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
 */
function processSingleSubmissionType1(submission) {
  const source = submission;
  const questionTimeSpentString = source.questionTimeSpent
    ? JSON.stringify(source.questionTimeSpent) : '{}';

  // location: saved as { main, other } object from data-util.js radio-with-other
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

  // hear_about: saved as plain array from data-util.js checkbox-with-other
  // otherhearabout: saved separately as formData['otherhearabout']
  // FIX: append Other typed text inline — "Instagram, Friend, Other: typed text"
  let hearAboutValue = '';
  try {
    const hear = source.hear_about;
    if (Array.isArray(hear)) {
      const items = hear.filter(item => item && typeof item === 'string');
      const otherText = (source.otherhearabout || '').trim();
      if (items.includes('Other') && otherText) {
        // Replace bare 'Other' with 'Other: typed text'
        hearAboutValue = items
          .map(v => v === 'Other' ? `Other: ${otherText}` : v)
          .join(', ');
      } else {
        hearAboutValue = items.join(', ');
      }
    } else if (hear && typeof hear === 'object' && hear.selected && Array.isArray(hear.selected)) {
      // Legacy object format fallback
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

/**
 * Process a Type 2 submission into a flat row array.
 */
function processSingleSubmissionType2(submission) {
  const source = submission;

  // radio-with-other: saved as { main, other }
  // Returns "Other: typed text" when Other selected, else main value
  const flattenRadioWithOther = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (val.main === 'Other' && val.other) return `Other: ${val.other.trim()}`;
    return val.main || '';
  };

  // radio-with-followup: saved as { main, followup: [] }
  // Returns main selection only
  const flattenRadioWithFollowup = (val) => {
    if (!val) return '';
    if (typeof val === 'string') return val;
    return val.main || '';
  };

  // radio-with-followup: returns followup array joined as string
  const flattenFollowup = (val) => {
    if (!val) return '';
    if (typeof val === 'object' && Array.isArray(val.followup)) {
      return val.followup.join(', ');
    }
    return '';
  };

  // checkbox-with-other: saved as plain array
  const flattenCheckbox = (val) => {
    if (!val) return '';
    if (Array.isArray(val)) return val.join(', ');
    if (typeof val === 'object' && Array.isArray(val.selected)) return val.selected.join(', ');
    return String(val);
  };

  const processedData = {
    id:               source.id,
    timestamp:        source.timestamp || new Date().toISOString(),
    sync_status:      source.sync_status || 'unsynced',
    visit_feeling:    source.visit_feeling || '',
    experiences:      flattenCheckbox(source.experiences),
    standout:         flattenRadioWithOther(source.standout),
    shayona_intent:   flattenRadioWithFollowup(source.shayona_intent),
    shayona_reason:   flattenFollowup(source.shayona_intent),
    expectation_met:  flattenRadioWithFollowup(source.expectation_met),
    expectation_diff: flattenFollowup(source.expectation_met),
    // future_wish removed — no longer in Type 2 survey
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
      private_key:  GOOGLE_PRIVATE_KEY.replace(/\\\\n/g, '\\n'),
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

    // Reject submissions missing an ID — client retains them for retry
    const missingIdCount = submissions.filter(s => !s.id).length;
    if (missingIdCount > 0) {
      console.error(`[SUBMIT] ❌ ${missingIdCount} submission(s) missing ID — rejecting batch`);
      return response.status(400).json({
        success: false,
        message: `${missingIdCount} submission(s) are missing a required 'id' field.`,
        successfulIds: [],
      });
    }

    // Determine sheet tab and processor
    const isType2         = surveyType === 'type2';
    const activeSheetName = isType2 ? SHEET_NAME_V2 : SHEET_NAME;
    const processor       = isType2 ? processSingleSubmissionType2 : processSingleSubmissionType1;

    console.log(`[SUBMIT] Processing ${submissions.length} submissions (${surveyType || 'type1'} → ${activeSheetName})`);

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
      console.log(`[SUBMIT] Filtered ${duplicateIds.length} duplicates`);
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

    // Build rows — track failures individually, never write PROCESSING_ERROR to sheet
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
      range:            `${activeSheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: rowsToAppend },
    });

    console.log(`[SUBMIT] ✅ Appended ${rowsToAppend.length} rows to "${activeSheetName}":`, appendResult.data);

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
