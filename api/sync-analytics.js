// --- api/sync-analytics.js (Vercel Function for Analytics Syncing) ---

import { google } from 'googleapis';

// --- Define Column Order for Analytics Summary Sheet ---
// UPDATED: Added 'kioskId' for tracking where the aggregated data came from.
const ANALYTICS_SUMMARY_COLUMNS = [
    'timestamp',
    'kioskId', // NEW: Kiosk's static ID
    'totalCompletions',
    'totalAbandonments',
    'completionRate',
    'avgCompletionTimeSeconds',
    'dropoffByQuestion' // JSON string of dropoff stats
];

// --- Define Column Order for Analytics Detail Sheet (Optional) ---
// UPDATED: Added 'kioskId' and 'sessionId' to link events to their source and session.
const ANALYTICS_DETAIL_COLUMNS = [
    'timestamp',
    'kioskId', // NEW
    'sessionId', // NEW
    'eventType',
    'surveyId',
    'questionId',
    'questionIndex',
    'totalTimeSeconds',
    'reason'
];

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Method Not Allowed' });
    }

    // --- Configuration from Environment Variables ---
    const { 
        SPREADSHEET_ID, 
        GOOGLE_SERVICE_ACCOUNT_EMAIL, 
        GOOGLE_PRIVATE_KEY,
        ANALYTICS_SHEET_NAME = 'a', // Sheet "a" for summary
        ANALYTICS_DETAIL_SHEET_NAME = 'Analytics_Detail' // Optional detail sheet
    } = process.env;

    if (!SPREADSHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        console.error('API Error: Missing required environment variables.');
        return response.status(500).json({ success: false, message: 'Server configuration error.' });
    }

    // --- Google Sheets Authentication ---
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

        if (!analyticsData || analyticsData.analyticsType !== 'KioskData') {
            return response.status(400).json({ 
                success: false, 
                message: 'Invalid analytics payload or type.' 
            });
        }

        console.log(`Processing analytics sync for Kiosk ${analyticsData.kioskId}: ${analyticsData.rawEvents?.length || 0} events`);

        // --- 1. PREPARE SUMMARY DATA ---
        // Range: A:G (7 columns)
        const summaryRow = [
            analyticsData.timestamp || new Date().toISOString(),
            analyticsData.kioskId || 'N/A', // NEW: Added kioskId
            analyticsData.totalCompletions || 0,
            analyticsData.totalAbandonments || 0,
            analyticsData.completionRate ? `${analyticsData.completionRate}%` : '0%',
            analyticsData.avgCompletionTimeSeconds || '0',
            // Ensure dropoff data is stringified for a single cell
            JSON.stringify(analyticsData.dropoffByQuestion || {}) 
        ];

        // --- 2. APPEND SUMMARY TO SHEET "a" ---
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            // UPDATED: Range is now A:G (7 columns)
            range: `${ANALYTICS_SHEET_NAME}!A:G`, 
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [summaryRow]
            }
        });

        console.log(`Analytics summary for Kiosk ${analyticsData.kioskId} written to sheet "${ANALYTICS_SHEET_NAME}"`);

        // --- 3. OPTIONAL: APPEND DETAILED EVENTS ---
        if (analyticsData.rawEvents && analyticsData.rawEvents.length > 0) {
            // Range: A:I (9 columns)
            const detailRows = analyticsData.rawEvents.map(event => [
                event.timestamp || '',
                event.kioskId || analyticsData.kioskId || '', // NEW: Get from event or root
                event.sessionId || '', // NEW: Added sessionId
                event.eventType || '',
                event.surveyId || '',
                event.questionId || '',
                event.questionIndex !== undefined ? event.questionIndex : '',
                event.totalTimeSeconds || '',
                event.reason || ''
            ]);

            try {
                await sheets.spreadsheets.values.append({
                    spreadsheetId: SPREADSHEET_ID,
                    // UPDATED: Range is now A:I (9 columns)
                    range: `${ANALYTICS_DETAIL_SHEET_NAME}!A:I`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: detailRows
                    }
                });
                console.log(`${detailRows.length} detailed events written to ${ANALYTICS_DETAIL_SHEET_NAME}`);
            } catch (detailError) {
                // If detail sheet doesn't exist, log warning but don't fail the entire process
                console.warn(`Could not write to detail sheet (${ANALYTICS_DETAIL_SHEET_NAME}):`, detailError.message);
            }
        }

        // --- SUCCESS RESPONSE ---
        return response.status(200).json({ 
            success: true,
            message: 'Analytics synced successfully',
            summaryRecords: 1,
            detailRecords: analyticsData.rawEvents?.length || 0
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
