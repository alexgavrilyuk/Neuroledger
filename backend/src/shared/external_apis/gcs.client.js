// backend/src/shared/external_apis/gcs.client.js
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

let storage;
try {
  // Use service account key file placed in the backend root
  const keyFilename = path.join(__dirname, '..', '..', '..', 'gcs-service-account.json');

  storage = new Storage({
    keyFilename: keyFilename,
    projectId: config.firebaseProjectId, // Often the same project ID
  });

  logger.info(`Google Cloud Storage Client Initialized for bucket: ${config.gcsBucketName}`);

} catch (error) {
  logger.error('Google Cloud Storage Client Initialization Error:', error);
  logger.error(`Ensure 'gcs-service-account.json' exists in the '/backend' root directory and has correct permissions for bucket '${config.gcsBucketName}'.`);
  process.exit(1);
}

// Function to get the configured bucket
const getBucket = () => {
    if (!storage) {
        throw new Error("GCS Storage client not initialized.");
    }
    return storage.bucket(config.gcsBucketName);
}

module.exports = {
    storage, // Export storage instance if needed elsewhere directly
    getBucket // Export helper to get the configured bucket
};