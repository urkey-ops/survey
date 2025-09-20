const { google } = require('googleapis');

// The scopes required to write to a Google Sheet
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

exports.handler = async (event, context) => {
    try {
        // Retrieve credentials from Netlify environment variables
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: SCOPES,
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // --- Simulated Data Retrieval from a Database ---
        // In a full application, you would query a database (like faunaDB, firebase, etc.)
        // to get all submissions saved throughout the day.
        // For this example, we use a placeholder array to demonstrate the batch process.
        // The `answers` array must be in the same order as your Google Sheet headers.
        const submissions = [
            ['2025-09-20T08:00:00.000Z', 'Thumbs Up', 'Online', 'Yes'],
            ['2025-09-20T10:30:00.000Z', 'Thumbs Down', 'Magazine', 'No'],
            ['2025-09-20T11:45:00.000Z', 'Thumbs Up', 'Online', 'Yes']
        ];
        
        if (submissions.length === 0) {
            console.log('No new submissions to add.');
            return { statusCode: 200, body: 'No new submissions.' };
        }
        
        // Prepare the data for the API call
        const values = submissions.map(sub => [sub[0], sub[1], sub[2], sub[3]]);

        const resource = {
            values,
        };

        const result = await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: 'Sheet1!A1',
            valueInputOption: 'RAW',
            insertDataOption: 'INSERT_ROWS',
            resource,
        });

        console.log(`Appended ${result.data.updates.updatedCells} cells.`);
        // After successful append, a real application would clear the database.

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Batch update successful.' }),
        };
    } catch (error) {
        console.error('Error during batch update:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to update Google Sheet.' }),
        };
    }
};
