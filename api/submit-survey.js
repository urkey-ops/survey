// FILE: api/submit-survey.js
// UPDATED: VERSION 3.0.0 - Added Survey Type 2 routing to separate Google Sheet tab
// Reads `surveyType` from payload to determine which sheet tab to write to

import { google } from 'googleapis';
import { isDuplicate, markAsProcessed, getCacheStats } from './deduplication-check.js';

// ═══════════════════════════════════════════════════════════
// COLUMN DEFINITIONS PER SURVEY TYPE
// Must match the Google Sheet headers for each tab exactly
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
 * Process a Type 1 submission into a flat row array
 */
function processSingleSubmissionType1(submission) {
  const source = submission;
  const questionTimeSpentString = source.questionTimeSpent
    ? JSON.stringify(source.questionTimeSpent) : '{}';

  const processedData = {
    id: source.id || crypto.randomUUID(),
    timestamp: source.timestamp || new Date().toISOString(),
    sync_status: source.sync_status || 'unsynced',
    sessionId: source.sessionId || 'N/A',
    kioskId: source.kioskId || 'N/A',
    startTime: source.startTime || '',
    completedAt: source.completedAt || '',
    abandonedAt: source.abandonedAt || '',
    completionTimeSeconds: source.completionTimeSeconds || '',
    questionTimeSpent: questionTimeSpentString,
    satisfaction: source.satisfaction || '',
    cleanliness: source.cleanliness || '',
    staff_friendliness: source.staff_friendliness || '',
    comments: (source.comments || '').trim(),
    gift_shop_visit: source.gift_shop_visit || '',
    location: (source.location && source.location.main === 'Other' && source.location.other)
      ? source.location.other.trim()
      : (source.location && source.location.main) ? source.location.main : (source.location || ''),
    age: source.age || '',
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
        console.error('hear_about processing error:', e, hear);
        return 'DATA_PROCESSING_ERROR';
      }
    })(),
  };

  return COLUMN_ORDER_TYPE1.map(key => String(processedData[key] || ''));
}

/**
 * Process a Type 2 submission into a flat row array
 */
function processSingleSubmissionType2(submission) {
  const source = submission;

  // Helper: flatten object with main/followup or main/other structure
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
    id: source.id || crypto.randomUUID(),
    timestamp: source.timestamp || new Date().toISOString(),
    sync_status: source.sync_status || 'unsynced',

    visit_feeling: source.visit_feeling || '',
    experiences: flattenCheckbox(source.experiences),
    standout: flattenRadioWithOther(source.standout),
    shayona_intent: flattenRadioWithFollowup(source.shayona_intent),
    shayona_reason: flattenFollowup(source.shayona_intent),
    expectation_met: flattenRadioWithFollowup(source.expectation_met),
    expectation_diff: flattenFollowup(source.expectation_met),
    future_wish: flattenRadioWithOther(source.future_wish),
    final_thoughts: (source.final_thoughts || '').trim(),
  };

  return COLUMN_ORDER_TYPE2.map(key => String(processedData[key] || ''));
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
    SHEET_NAME = 'Sheet1',           // Type 1 sheet tab (env var, default Sheet1)
    SHEET_NAME_V2 = 'VisitorFeedbackV2' // Type 2 sheet tab (env var)
  } = process.env;

  if (!SPREADSHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
    console.error('API Error: Missing required environment variables.');
    return response.status(500).json({
      success: false, message: 'Server configuration error.', successfulIds: []
    });
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  try {
    const { submissions, surveyType } = request.body;

    if (!Array.isArray(submissions) || submissions.length === 0) {
      return response.status(200).json({
        success: true, message: 'No submissions received.', successfulIds: []
      });
    }

    // ── Determine which sheet tab and processor to use ──
    const isType2 = surveyType === 'type2';
    const activeSheetName = isType2 ? SHEET_NAME_V2 : SHEET_NAME;
    const processor = isType2 ? processSingleSubmissionType2 : processSingleSubmissionType1;

    console.log(`[SUBMIT] Processing ${submissions.length} submissions (survey: ${surveyType || 'type1'} → sheet: ${activeSheetName})`);

    // ── Deduplication ──
    const uniqueSubmissions = [];
    const duplicateIds = [];

    for (const submission of submissions) {
      if (!submission.id) {
        submission.id = crypto.randomUUID();
        uniqueSubmissions.push(submission);
        continue;
      }
      if (isDuplicate(submission.id)) {
        console.warn(`[SUBMIT] 🚫 Duplicate: ${submission.id}`);
        duplicateIds.push(submission.id);
        continue;
      }
      uniqueSubmissions.push(submission);
    }

    if (duplicateIds.length > 0) {
      console.log(`[SUBMIT] Filtered ${duplicateIds.length} duplicates`);
      console.log('[DEDUP] Cache stats:', getCacheStats());
    }

    if (uniqueSubmissions.length === 0) {
      return response.status(200).json({
        success: true,
        message: `${duplicateIds.length} duplicate submissions skipped.`,
        successfulIds: duplicateIds,
        duplicates: duplicateIds.length
      });
    }

    // ── Prepare rows ──
    const rowsToAppend = uniqueSubmissions.map((submission, index) => {
      try {
        return processor(submission);
      } catch (e) {
        console.error(`[SUBMIT] Error processing submission ${index}:`, e);
        return (isType2 ? COLUMN_ORDER_TYPE2 : COLUMN_ORDER_TYPE1).map(() => 'PROCESSING_ERROR');
      }
    });

    console.log(`[SUBMIT] Sample row (${activeSheetName}):`, rowsToAppend[0]?.slice(0, 5), '...');

    // ── Append to correct sheet tab ──
    const appendResult = await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: `${activeSheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      resource: { values: rowsToAppend },
    });

    console.log(`[SUBMIT] ✅ Appended to "${activeSheetName}":`, appendResult.data);

    // ── Mark as processed ──
    uniqueSubmissions.forEach(sub => { if (sub.id) markAsProcessed(sub.id); });

    const successfulIds = [
      ...uniqueSubmissions.map(sub => sub.id).filter(Boolean),
      ...duplicateIds
    ];

    return response.status(200).json({
      success: true,
      message: `${uniqueSubmissions.length} new + ${duplicateIds.length} duplicates processed.`,
      successfulIds,
      newSubmissions: uniqueSubmissions.length,
      duplicates: duplicateIds.length,
      sheetName: activeSheetName
    });

  } catch (error) {
    console.error('[SUBMIT] API Error:', error.message);
    if (error.response) {
      console.error('[SUBMIT] Google Sheets API Response:', error.response.data);
    }
    return response.status(500).json({
      success: false,
      message: 'Internal Server Error during sheet append. Data retained locally.',
      successfulIds: [],
      error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
    });
  }
}
