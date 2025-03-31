// backend/src/shared/config/index.js
require('dotenv').config();

// Validate essential environment variables
const requiredEnv = ['PORT', 'MONGODB_URI', 'FIREBASE_PROJECT_ID'];
requiredEnv.forEach((varName) => {
  if (!process.env[varName]) {
    console.error(`Error: Environment variable ${varName} is missing.`);
    process.exit(1);
  }
});

module.exports = {
  port: process.env.PORT || 5001,
  mongoURI: process.env.MONGODB_URI,
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  // Add other configurations as needed
};