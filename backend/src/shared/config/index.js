// backend/src/shared/config/index.js
require('dotenv').config();

// Validate essential environment variables
const requiredEnv = [
  'PORT',
  'MONGODB_URI',
  'FIREBASE_PROJECT_ID',
  'GCS_BUCKET_NAME',
  'CLAUDE_API_KEY',
  'SERVICE_URL', // Ensure SERVICE_URL is required for task handlers
  'CLOUD_TASKS_LOCATION',
  'GOOGLE_CLOUD_PROJECT',
  'CLOUD_TASKS_SERVICE_ACCOUNT' // Required for OIDC token generation
];

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
  gcsBucketName: process.env.GCS_BUCKET_NAME,
  claudeApiKey: process.env.CLAUDE_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY,
  openaiApiKey: process.env.OPENAI_API_KEY,

  // Cloud Tasks configuration
  projectId: process.env.GOOGLE_CLOUD_PROJECT,
  cloudTasksLocation: process.env.CLOUD_TASKS_LOCATION,
  qualityAuditQueueName: process.env.QUALITY_AUDIT_QUEUE || 'neuroledger-quality-audit-queue',
  chatAiQueueName: process.env.CHAT_AI_QUEUE_NAME || 'neuroledger-chat-ai-queue',
  datasetParserQueueName: process.env.DATASET_PARSER_QUEUE || 'neuroledger-dataset-parser-queue',
  cloudTasksServiceAccount: process.env.CLOUD_TASKS_SERVICE_ACCOUNT,
  serviceUrl: process.env.SERVICE_URL, // Base URL of the deployed service

};