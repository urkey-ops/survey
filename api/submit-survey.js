// FILE: api/submit-survey.js
// UPDATED: Synchronized with client-side V11 data structure, removing contact fields and adding tracking fields.

import { google } from 'googleapis';

// --- Define Column Order (Must match your Google Sheet headers) ---
// UPDATED: Added tracking fields (kioskId, sessionId, timings) and removed contact fields (name, email, newsletterConsent).
const COLUMN_ORDER = [
    'sessionId', // NEW: Unique ID for the current session
    'kioskId', // NEW: Kiosk's static ID
    'startTime', // NEW: Start time of the survey
    'completedAt', // NEW: End time if completed
    'abandonedAt', // NEW: End time if abandoned (inactivity)
    'completionTimeSeconds', // NEW: Total time taken
    'sync_status', // Use sync_status to capture 'unsynced', 'unsynced (inactivity)'
    'satisfaction',
    'cleanliness',
    'staff_friendliness',
    'location',
    'age',
    'hear_about',
    'gift_shop_visit', 
    'comments',
    'questionTimeSpent', // NEW: JSON string of time spent on each question
    'timestamp', // Old submission time (used as the last modification time)
    'id', // UUID of the submission object
];

/**
 * Transforms a single submission object (sent from the client queue) into a
 * flat array that matches the SHEET's COLUMN_ORDER.
 * * @param {Object} submission - A single survey data object from the client queue.
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
        
        // Handle "How did you hear about us?" (checkbox-with-other) logic
        hear_about: (source.hear_about && Array.isArray(source.hear_about.selected))
            ? (
                source.hear_about.selected.includes('Other') && source.hear_about.other
                    ? `${source.hear_about.selected.filter(v => v !== 'Other').join(', ')}, Other: ${source.hear_about.other.trim()}`
                    : source.hear_about.selected.join(', ')
            )
            : (source.hear_about || ''), // Fallback for simple string if not the combined object
    };
    
    // Map the processed data object to an array based on the defined column order
    return COLUMN_ORDER.map(key => processedData[key] || '');
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
        // VITAL: Ensure submissions array is present
        const { submissions } = request.body;

        if (!Array.isArray(submissions) || submissions.length === 0) {
            // Return a successful status for an empty array to match client expectations
            return response.status(200).json({ 
                success: true, 
                message: 'No submissions received.',
                successfulIds: [] // Client-side V11 expects 'successfulIds'
            });
        }
        
        console.log(`Processing ${submissions.length} submissions.`);

        // --- 2. PREPARE DATA FOR BATCH APPEND ---
        const rowsToAppend = submissions.map(processSingleSubmission);
        
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
        // VITAL: Get all IDs from the successful batch and return them.
        const successfulIds = submissions.map(sub => sub.id);
        
        console.log(`${successfulIds.length} submissions successfully appended to Google Sheet.`);
        return response.status(200).json({ 
            success: true,
            message: `${successfulIds.length} submissions processed.`,
            successfulIds: successfulIds // Client-side V11 expects 'successfulIds'
        });

    } catch (error) {
        console.error('API Error:', error.message);
        if (error.response) {
            console.error('API Response Data:', error.response.data);
        }
        
        // VITAL: On ANY failure (500), return an empty array of IDs
        // This tells the client to keep ALL submissions in the queue.
        return response.status(500).json({ 
            success: false,
            message: 'Internal Server Error during sheet append. Data retained locally.',
            successfulIds: []
        });
    }
}
