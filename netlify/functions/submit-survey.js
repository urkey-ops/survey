exports.handler = async (event, context) => {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ message: "Method Not Allowed" }),
    };
  }

  try {
    // Parse the JSON body from the request
    const data = JSON.parse(event.body);

    // Log the received survey submission to the Netlify function logs
    console.log("Received survey submission:", data);

    // Return a success response
    return {
      statusCode: 200,
      body: JSON.stringify({ message: "Survey submitted successfully!" }),
    };
  } catch (error) {
    // Return an error response if something goes wrong
    console.error("Error processing submission:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Bad Request" }),
    };
  }
};
