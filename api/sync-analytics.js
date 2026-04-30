// --- api/sync-analytics.js (Vercel Function for Analytics Syncing) ---

import { google } from 'googleapis';

// --- Define Column Order for Analytics Summary Sheet ---
const ANALYTICS_SUMMARY_COLUMNS = [
    'timestamp',
    'kioskId',
    'totalCompletions',
    'totalAbandonments',
    'completionRate',
    'avgCompletionTimeSeconds',
    'dropoffByQuestion' // JSON string of dropoff stats
];

// --- Define Column Order for Analytics Detail Sheet (Optional) ---
const ANALYTICS_DETAIL_COLUMNS = [
    'timestamp',
    'kioskId',
    'sessionId',
    'eventType',
    'surveyId',
    'questionId',
    'questionIndex',
    'totalTimeSeconds',
    'reason',
    'surveyType',        // ← type1 / type2 split for funnel
  'questionTimeSpent'  // ← JSON string of per-question durations
];

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Method Not Allowed' });
    }

    const { 
        SPREADSHEET_ID, 
        GOOGLE_SERVICE_ACCOUNT_EMAIL, 
        GOOGLE_PRIVATE_KEY,
        ANALYTICS_SHEET_NAME = 'a',
        ANALYTICS_DETAIL_SHEET_NAME = 'Analytics_Detail'
    } = process.env;

    if (!SPREADSHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        console.error('API Error: Missing required environment variables.');
        return response.status(500).json({ success: false, message: 'Server configuration error.' });
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
        const analyticsData = request.body;

        // ── FIX: Accept client payload shape (kioskId + eventCount + events)
        //    Old guard required analyticsType:'summary' which client never sends.
        if (!analyticsData || typeof analyticsData !== 'object') {
            return response.status(400).json({ 
                success: false, 
                message: 'Invalid or missing analytics payload'
            });
        }

        // Support both payload shapes:
        //   Client shape: { kioskId, eventCount, completions, abandonments, avgCompletionTime, events, syncedAt }
        //   Legacy shape: { analyticsType:'summary', kioskId, totalCompletions, rawEvents, ... }
        const isClientShape  = Array.isArray(analyticsData.events);
        const isLegacyShape  = analyticsData.analyticsType === 'summary';

        if (!isClientShape && !isLegacyShape) {
            return response.status(400).json({ 
                success: false, 
                message: 'Unrecognized analytics payload shape — expected events[] or analyticsType:summary'
            });
        }

        // Normalize to a common internal shape
        const kioskId          = analyticsData.kioskId || 'UNKNOWN_KIOSK';
        const rawEvents        = isClientShape
            ? analyticsData.events
            : (analyticsData.rawEvents || []);
        const totalCompletions = isClientShape
            ? (analyticsData.completions  || 0)
            : (analyticsData.totalCompletions  || 0);
        const totalAbandonments = isClientShape
            ? (analyticsData.abandonments || 0)
            : (analyticsData.totalAbandonments || 0);
        const total            = totalCompletions + totalAbandonments;
        const completionRate   = total > 0
            ? ((totalCompletions / total) * 100).toFixed(1)
            : '0';
        const avgCompletionTimeSeconds = isClientShape
            ? (analyticsData.avgCompletionTime || 0)
            : (analyticsData.avgCompletionTimeSeconds || 0);
        const dropoffByQuestion = isClientShape
            ? (analyticsData.dropoffByQuestion || {})
            : (analyticsData.dropoffByQuestion || {});

        console.log(`Processing analytics sync for Kiosk ${kioskId}: ${rawEvents.length} events`);

        // ── Summary row ───────────────────────────────────────────────────────
        const summaryRow = [
            analyticsData.syncedAt || new Date().toISOString(),
            kioskId,
            totalCompletions,
            totalAbandonments,
            `${completionRate}%`,
            avgCompletionTimeSeconds,
            JSON.stringify(dropoffByQuestion)
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${ANALYTICS_SHEET_NAME}!A:G`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [summaryRow] }
        });

        console.log(`Analytics summary for Kiosk ${kioskId} written to sheet "${ANALYTICS_SHEET_NAME}"`);

        // ── Detail rows ───────────────────────────────────────────────────────
        if (rawEvents.length > 0) {
            const detailRows = rawEvents.map(event => [
                event.timestamp                                         || '',
                event.kioskId                                           || kioskId,
                event.sessionId || event.surveyId                       || '',
                event.eventType                                         || '',
                event.surveyId                                          || '',
                event.questionId                                        || '',
                event.questionIndex !== undefined ? event.questionIndex : '',
                event.totalTimeSeconds                                  || '',
                event.reason                                            || '',
                event.surveyType                                        || '',
                event.questionTimeSpent ? JSON.stringify(event.questionTimeSpent) : ''
            ]);

            try {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    range: `${ANALYTICS_DETAIL_SHEET_NAME}!A:K`,
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: detailRows }
                });
                console.log(`${detailRows.length} detailed events written to ${ANALYTICS_DETAIL_SHEET_NAME}`);
            } catch (detailError) {
                console.error(`[ANALYTICS] ❌ Detail sheet write failed (${ANALYTICS_DETAIL_SHEET_NAME}):`, detailError.message);
            }
        }

        return response.status(200).json({ 
            success: true,
            message: 'Analytics synced successfully',
            summaryRecords: 1,
            detailRecords: rawEvents.length
        });

    } catch (error) {
        console.error('Analytics Sync Error:', error.message);
        if (error.response) {
            console.error('API Response Data:', error.response.data);
        }
        return response.status(500).json({ 
            success: false,
            message: 'Analytics sync failed. Data retained locally.',
            error: error.message
        });
    }
}
