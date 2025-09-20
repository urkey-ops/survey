const { google } = require('googleapis');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

exports.handler = async (event, context) => {
    try {
        // Set up authentication with your service account key
        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: SCOPES,
        });

        const sheets = google.sheets({ version: 'v4', auth });
        const spreadsheetId = process.env.GOOGLE_SHEET_ID;

        // --- In a real application, you would read this data from a database ---
        // For this example, we'll use a placeholder array of submissions
        // that would have been stored throughout the day.
        const submissions = [
            ['2025-09-20T08:00:00.000Z', 'Thumbs Up', 'Online', 'Yes'],
            ['2025-09-20T10:30:00.000Z', 'Thumbs Down', 'Magazine', 'No'],
            ['2025-09-20T11:45:00.000Z', 'Thumbs Up', 'Online', 'Yes']
        ];

        if (submissions.length === 0) {
            console.log('No new submissions to add.');
            return { statusCode: 200, body: 'No new submissions.' };
        }

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
        // In a real app, you would now clear the database.

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
