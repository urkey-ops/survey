const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors()); // Allow cross-origin requests from the client
app.use(express.json()); // Parse JSON body

// API endpoint to receive survey data
app.post('/submit-survey', (req, res) => {
  const surveyData = req.body;
  console.log('Received survey submission:', surveyData);

  // In a real application, you would save this data to a database
  // e.g., MongoDB, PostgreSQL, or Firestore

  res.status(200).json({ message: 'Survey submitted successfully!' });
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});
