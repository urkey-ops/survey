// FILE: api/submit-survey.js
// UPDATED: Added server-side deduplication (Priority Fix #1)
// VERSION: 2.0.0 - Race condition protection + duplicate prevention

import { google } from 'googleapis';
import { isDuplicate, markAsProcessed, getCacheStats } from './deduplication-check.js';

// --- Define Column Order (Must match your Google Sheet headers) ---
const COLUMN_ORDER = [
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
        id: source.id || crypto.randomUUID(),
        timestamp: source.timestamp || new Date().toISOString(),
        sync_status: source.sync_status || 'unsynced', 
        
        // NEW: Time and Session Tracking Fields
        sessionId: source.sessionId || 'N/A',
        kioskId: source.kioskId || 'N/A',
        startTime: source.startTime || '',
        completedAt: source.completedAt || '',
        abandonedAt: source.abandonedAt || '',
        completionTimeSeconds: source.completionTimeSeconds || '',
        questionTimeSpent: questionTimeSpentString,

        // Survey fields
        satisfaction: source.satisfaction || '',
        cleanliness: source.cleanliness || '',
        staff_friendliness: source.staff_friendliness || '',
        comments: (source.comments || '').trim(),
        gift_shop_visit: source.gift_shop_visit || '',

        // Handle Location (radio-with-other) logic
        location: (source.location && source.location.main === 'Other' && source.location.other)
            ? source.location.other.trim()
            : (source.location && source.location.main) ? source.location.main : (source.location || ''), 
            
        age: source.age || '',
        
        // FIXED: Robust hear_about processing
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
    
    // Map the processed data object to an array based on the defined column order
    const row = COLUMN_ORDER.map(key => String(processedData[key] || ''));
    
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
        return response.status(500).json({ 
            success: false,
            message: 'Server configuration error.',
            successfulIds: [] // CRITICAL: Always return array
        });
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
        
        console.log(`[SUBMIT] Processing ${submissions.length} submissions...`);
        
        // --- 2. PRIORITY FIX #1: DEDUPLICATION CHECK ---
        const uniqueSubmissions = [];
        const duplicateIds = [];
        const skippedIds = [];
        
        for (const submission of submissions) {
            if (!submission.id) {
                console.warn('[SUBMIT] ⚠️ Submission missing ID - generating new one');
                submission.id = crypto.randomUUID();
                uniqueSubmissions.push(submission);
                continue;
            }
            
            if (isDuplicate(submission.id)) {
                console.warn(`[SUBMIT] 🚫 Skipping duplicate: ${submission.id}`);
                duplicateIds.push(submission.id);
                // IMPORTANT: Still return as "successful" to client so they remove from queue
                continue;
            }
            
            uniqueSubmissions.push(submission);
        }
        
        // Log deduplication stats
        if (duplicateIds.length > 0) {
            console.log(`[SUBMIT] Filtered out ${duplicateIds.length} duplicates`);
            console.log('[DEDUP] Cache stats:', getCacheStats());
        }
        
        // If all were duplicates, return success with their IDs
        if (uniqueSubmissions.length === 0) {
            console.log('[SUBMIT] All submissions were duplicates - returning success');
            return response.status(200).json({
                success: true,
                message: `${duplicateIds.length} duplicate submissions skipped.`,
                successfulIds: duplicateIds, // Return duplicate IDs so client removes them
                duplicates: duplicateIds.length
            });
        }
        
        console.log(`[SUBMIT] Processing ${uniqueSubmissions.length} unique submissions (${duplicateIds.length} duplicates filtered)`);
        
        // --- 3. VALIDATE SUBMISSIONS ---
        const invalidCount = uniqueSubmissions.filter((sub, index) => {
            if (sub.hear_about) {
                if (typeof sub.hear_about === 'object' && !Array.isArray(sub.hear_about) && sub.hear_about.values) {
                    console.warn(`[SUBMIT] Submission ${index} has invalid hear_about format:`, sub.hear_about);
                    return true;
                }
            }
            return false;
        }).length;
        
        if (invalidCount > 0) {
            console.error(`[SUBMIT] ${invalidCount}/${uniqueSubmissions.length} submissions have invalid format.`);
        }
        
        // --- 4. PREPARE DATA FOR BATCH APPEND ---
        const rowsToAppend = uniqueSubmissions.map((submission, index) => {
            try {
                return processSingleSubmission(submission);
            } catch (e) {
                console.error(`[SUBMIT] Error processing submission ${index}:`, e);
                return COLUMN_ORDER.map(() => 'PROCESSING_ERROR');
            }
        });
        
        console.log('[SUBMIT] Sample row:', rowsToAppend[0]?.slice(0, 5), '...');
        
        // --- 5. APPEND DATA TO GOOGLE SHEETS ---
        const appendResult = await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: `${SHEET_NAME}!A1`, 
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: rowsToAppend,
            },
        });
        
        console.log(`[SUBMIT] ✅ Google Sheets append successful:`, appendResult.data);
        
        // --- 6. MARK AS PROCESSED IN DEDUP CACHE ---
        uniqueSubmissions.forEach(sub => {
            if (sub.id) {
                markAsProcessed(sub.id);
            }
        });
        
        // --- 7. PREPARE SUCCESS RESPONSE ---
        const successfulIds = [
            ...uniqueSubmissions.map(sub => sub.id).filter(Boolean),
            ...duplicateIds // Include duplicates so client removes them
        ];
        
        console.log(`[SUBMIT] ✅ Successfully processed ${uniqueSubmissions.length} new + ${duplicateIds.length} duplicates = ${successfulIds.length} total IDs`);
        console.log('[SUBMIT] Returning IDs:', successfulIds);

        // CRITICAL FIX: Always return successfulIds array, never empty on success
        if (successfulIds.length !== submissions.length) {
            console.warn(`[SUBMIT] ⚠️ ID mismatch: Received ${submissions.length} submissions but only ${successfulIds.length} have IDs`);
        }

        return response.status(200).json({ 
            success: true,
            message: `${uniqueSubmissions.length} new submissions processed, ${duplicateIds.length} duplicates skipped.`,
            successfulIds: successfulIds,
            newSubmissions: uniqueSubmissions.length,
            duplicates: duplicateIds.length
        });

    } catch (error) {
        console.error('[SUBMIT] API Error:', error.message);
        if (error.response) {
            console.error('[SUBMIT] Google Sheets API Response:', error.response.data);
        }
        
        // CRITICAL FIX: On ANY failure, return empty successfulIds array
        // This ensures client retains data in queue for retry
        return response.status(500).json({ 
            success: false,
            message: 'Internal Server Error during sheet append. Data retained locally.',
            successfulIds: [], // NEVER return undefined
            error: process.env.NODE_ENV === 'development' ? error.message : 'Server error'
        });
    }
}
