// backend/src/shared/config/index.js
// ** UPDATED FILE - Add Cloud Tasks Config **
require('dotenv').config();

// Validate essential environment variables
const requiredEnv = [
  'PORT',
  'MONGODB_URI',
  'FIREBASE_PROJECT_ID',
  'GCS_BUCKET_NAME',
  'CLAUDE_API_KEY'
];

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
  claudeApiKey: process.env.CLAUDE_API_KEY,

  // Cloud Tasks configuration
  projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID,
  cloudTasksLocation: process.env.CLOUD_TASKS_LOCATION || 'us-central1',
  qualityAuditQueueName: process.env.QUALITY_AUDIT_QUEUE || 'neuroledger-quality-audit-queue',
  chatAiQueueName: process.env.CHAT_AI_QUEUE_NAME || 'neuroledger-chat-ai-queue',
  cloudTasksServiceAccount: process.env.CLOUD_TASKS_SERVICE_ACCOUNT,
  serviceUrl: process.env.SERVICE_URL,

  // Add other configurations as needed
};