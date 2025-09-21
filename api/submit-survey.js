// Vercel serverless function to handle survey submissions and save to Firestore.
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Vercel serverless functions use an `api` folder by default.
// The endpoint will be /api/submit-survey.
// Our frontend already sends data to this endpoint.

// A custom service account file is used for Vercel's environment.
// The file path is relative to the api directory.
const serviceAccount = require('./firebase-service-account.json');

// Initialize Firebase Admin SDK if it hasn't been already.
if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount)
  });
}

const db = getFirestore();

module.exports = async (req, res) => {
  // Only allow POST requests, as we are receiving data.
  if (req.method !== 'POST') {
    return res.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    // Parse the JSON body from the request.
    const data = req.body;

    // Check if the data is valid.
    if (!data || !data.answers) {
      return res.status(400).json({ message: "Bad Request: Missing data." });
    }

    // Save the new survey submission to the Firestore database.
    // The `surveySubmissions` collection is used to store all submissions.
    await db.collection('surveySubmissions').add(data);

    // Log the submission to the Vercel logs for debugging.
    console.log("Survey submitted successfully:", data);

    // Send a success response back to the client.
    return res.status(200).json({ message: "Survey submitted successfully!" });
  } catch (error) {
    // Log the error and send a 500 status code for server errors.
    console.error("Error processing submission:", error);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};
