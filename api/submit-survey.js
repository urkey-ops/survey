// FILE: api/submit-survey.js
// UPDATED: Synchronized with client-side V11 data structure, removing contact fields and adding tracking fields.
// FIXED: Data validation and hear_about processing to resolve Google Sheets API "Invalid values[14][12]" errors

import { google } from 'googleapis';

// --- Define Column Order (Must match your Google Sheet headers) ---
const COLUMN_ORDER = [

    'satisfaction',    
    'cleanliness',
    'staff_friendliness',
    'location',
    'age',
    'hear_about',
    'gift_shop_visit', // ADD THIS LINE
    'sync_status', // Use sync_status to capture 'unsynced', 'unsynced (inactivity)'
    'comments',
    'timestamp',
    'id',
];
    
];

/**
 * Transforms a single submission object (sent from the client queue) into a
 * flat array that matches the SHEET's COLUMN_ORDER.
 * @param {Object} submission - A single survey data object from the client queue.
 * @returns {Array} An array of values ready for Google Sheets batch append.
 */
function processSingleSubmission(submission) {
    // The client sends data fields directly on the 'submission' object.
    const source = submission;
    
    // Convert the detailed question timings object to a JSON string for a single spreadsheet cell
    const questionTimeSpentString = source.questionTimeSpent 
        ? JSON.stringify(source.questionTimeSpent) 
        : '{}';
    
    const processedData = {
        // Core tracking fields
        id: source.id || crypto.randomUUID(), // Use the existing submission ID or generate one
        timestamp: source.timestamp || new Date().toISOString(),
        sync_status: source.sync_status || 'unsynced', 
        
        // NEW: Time and Session Tracking Fields
        sessionId: source.sessionId || 'N/A',
        kioskId: source.kioskId || 'N/A',
        startTime: source.startTime || '',
        completedAt: source.completedAt || '',
        abandonedAt: source.abandonedAt || '',
        completionTimeSeconds: source.completionTimeSeconds || '',
        questionTimeSpent: questionTimeSpentString, // NEW: JSON string

        // Survey fields
        satisfaction: source.satisfaction || '',
        cleanliness: source.cleanliness || '',
        staff_friendliness: source.staff_friendliness || '',
        comments: (source.comments || '').trim(),
        gift_shop_visit: source.gift_shop_visit || '',

        // Handle Location (radio-with-other) logic
        location: (source.location && source.location.main === 'Other' && source.location.other)
            ? source.location.other.trim()
            // UPDATED: Access location value via .main or the direct string
            : (source.location && source.location.main) ? source.location.main : (source.location || ''), 
            
        age: source.age || '',
        
        // FIXED: Robust hear_about processing to prevent Google Sheets API validation errors
        hear_about: (() => {
            const hear = source.hear_about;
            try {
                if (Array.isArray(hear)) {
                    // Simple array of strings - join them safely
                    return hear.filter(item => item && typeof item === 'string').join(', ');
                }
                if (hear && typeof hear === 'object' && hear.selected && Array.isArray(hear.selected)) {
                    // Complex object with selected array (checkbox-with-other)
                    const selected = hear.selected.filter(item => item && typeof item === 'string');
                    if (hear.other && selected.includes('Other')) {
                        return [...selected.filter(v => v !== 'Other'), `Other: ${String(hear.other).trim()}`].join(', ');
                    }
                    return selected.join(', ');
                }
                // Fallback: convert anything else to string
                return String(hear || '');
            } catch (e) {
                console.error('hear_about processing error:', e, hear);
                return 'DATA_PROCESSING_ERROR';
            }
        })(),
    };
    
    // Map the processed data object to an array based on the defined column order
    const row = COLUMN_ORDER.map(key => String(processedData[key] || ''));
    
    // DEBUG: Log first row for verification (remove after fix confirmed)
    if (processedData.hear_about.includes('Instagram')) {
        console.log('DEBUG - hear_about processed:', processedData.hear_about);
        console.log('DEBUG - Row 13 (hear_about) value:', row[12]);
        console.log('DEBUG - Full row length:', row.length);
    }
    
    return row;
}

export default async function handler(request, response) {
    if (request.method !== 'POST') {
        return response.status(405).json({ message: 'Method Not Allowed' });
    }

    // --- Configuration from Environment Variables ---
    const { 
        SPREADSHEET_ID, 
        GOOGLE_SERVICE_ACCOUNT_EMAIL, 
        GOOGLE_PRIVATE_KEY,
        SHEET_NAME = 'Sheet1' 
    } = process.env;

    if (!SPREADSHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        console.error('API Error: Missing one or more required environment variables.');
        return response.status(500).json({ message: 'Server configuration error.' });
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
        // --- 1. DESTRUCTURE ARRAY PAYLOAD ---
        const { submissions } = request.body;

        if (!Array.isArray(submissions) || submissions.length === 0) {
            return response.status(200).json({ 
                success: true, 
                message: 'No submissions received.',
                successfulIds: []
            });
        }
        
        // --- NEW: Input Validation ---
        console.log(`Processing ${submissions.length} submissions.`);
        console.log('Sample hear_about structure:', submissions[0]?.hear_about);
        
        // Validate submissions don't contain unprocessable data
        const invalidCount = submissions.filter((sub, index) => {
            if (sub.hear_about) {
                if (typeof sub.hear_about === 'object' && !Array.isArray(sub.hear_about) && sub.hear_about.values) {
                    console.warn(`Submission ${index} has proto list_value structure:`, sub.hear_about);
                    return true;
                }
            }
            return false;
        }).length;
        
        if (invalidCount > 0) {
            console.error(`${invalidCount}/${submissions.length} submissions have invalid hear_about format.`);
        }
        
        // --- 2. PREPARE DATA FOR BATCH APPEND ---
        const rowsToAppend = submissions.map((submission, index) => {
            try {
                return processSingleSubmission(submission);
            } catch (e) {
                console.error(`Error processing submission ${index}:`, e);
                return COLUMN_ORDER.map(() => 'PROCESSING_ERROR');
            }
        });
        
        console.log('Prepared rows sample:', rowsToAppend[0]?.slice(0, 5), '...');
        
        // --- Append Data to Google Sheets ---
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A1`, 
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: rowsToAppend,
            },
        });
        
        // --- SUCCESS RESPONSE ---
        const successfulIds = submissions.map(sub => sub.id).filter(Boolean);
        
        console.log(`${successfulIds.length} submissions successfully appended to Google Sheet.`);
        return response.status(200).json({ 
            success: true,
            message: `${successfulIds.length} submissions processed.`,
            successfulIds: successfulIds
        });

    } catch (error) {
        console.error('API Error:', error.message);
        if (error.response) {
            console.error('Google Sheets API Response:', error.response.data);
        }
        
        // On ANY failure, return empty successfulIds array so client retains data
        return response.status(500).json({ 
            success: false,
            message: 'Internal Server Error during sheet append. Data retained locally.',
            successfulIds: []
        });
    }
}
