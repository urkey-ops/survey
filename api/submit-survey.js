// Vercel's request and response objects are slightly different from Netlify's,
// but the core logic remains the same.
module.exports = async (request, response) => {
  // Only allow POST requests
  if (request.method !== 'POST') {
    return response.status(405).json({ message: "Method Not Allowed" });
  }

  try {
    // Parse the JSON body from the request
    const data = request.body;

    // Log the received survey submission to the Vercel function logs
    console.log("Received survey submission:", data);

    // Return a success response
    return response.status(200).json({ message: "Survey submitted successfully!" });
  } catch (error) {
    // Return an error response if something goes wrong
    console.error("Error processing submission:", error);
    return response.status(400).json({ message: "Bad Request" });
  }
};
