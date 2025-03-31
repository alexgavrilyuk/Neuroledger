// backend/src/shared/config/index.js
// ** UPDATED FILE **
require('dotenv').config();

// Validate essential environment variables
const requiredEnv = ['PORT', 'MONGODB_URI', 'FIREBASE_PROJECT_ID', 'GCS_BUCKET_NAME']; // Added GCS_BUCKET_NAME
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
  gcsBucketName: process.env.GCS_BUCKET_NAME, // Added GCS bucket name
  // Add other configurations as needed
};