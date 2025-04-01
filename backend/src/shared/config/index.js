// backend/src/shared/config/index.js
// ** UPDATED FILE - Add Claude API Key **
require('dotenv').config();

// Validate essential environment variables
const requiredEnv = ['PORT', 'MONGODB_URI', 'FIREBASE_PROJECT_ID', 'GCS_BUCKET_NAME', 'CLAUDE_API_KEY']; // Added CLAUDE_API_KEY
requiredEnv.forEach((varName) => {
  if (!process.env[varName]) {
    // Use console.error for startup errors before logger might be fully configured
    console.error(`Error: Environment variable ${varName} is missing.`);
    process.exit(1);
  }
});

module.exports = {
  port: process.env.PORT || 5001,
  mongoURI: process.env.MONGODB_URI,
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID,
  gcsBucketName: process.env.GCS_BUCKET_NAME,
  claudeApiKey: process.env.CLAUDE_API_KEY, // Added Claude API Key
  // Add other configurations as needed
};