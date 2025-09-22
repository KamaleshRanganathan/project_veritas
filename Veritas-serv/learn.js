const express = require('express');
require('dotenv').config(); // Make sure this is at the top
const mongoose = require('mongoose');

const app = express();
const port = process.env.PORT || 3000; // Use port from .env or default to 3000
const dbURI = process.env.key; // Store the key in a variable for clarity

// Function to connect to DB and start server
const startServer = async () => {
  try {
    // Await the connection to the database
    await mongoose.connect(dbURI);
    console.log('✅ Connected to MongoDB');

    // Only start listening for requests after the DB is connected
    app.listen(port, () => console.log(`Server Started on port ${port}`));

  } catch (error) {
    console.error('❌ Failed to connect to MongoDB');
    console.error(error);
    process.exit(1); // Exit the process with an error code
  }
};

// Call the function to start the server
startServer();