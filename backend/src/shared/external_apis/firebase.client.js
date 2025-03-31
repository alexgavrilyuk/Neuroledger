// backend/src/shared/external_apis/firebase.client.js
// ** UPDATED FILE **
const admin = require('firebase-admin');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');

try {
  const serviceAccountPath = path.join(__dirname, '..', '..', '..', 'firebase-service-account.json');

  // Verify the path looks correct (optional debugging)
  // logger.debug(`Attempting to load Firebase service account from: ${serviceAccountPath}`);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccountPath), // Load the service account key
    projectId: config.firebaseProjectId,
  });
  logger.info('Firebase Admin SDK Initialized');

} catch (error) {
  logger.error('Firebase Admin SDK Initialization Error:', error);
  // Log the path it tried to access if it's an ENOENT error
  if (error.code === 'ENOENT' || (error.errorInfo && error.errorInfo.code === 'app/invalid-credential')) {
      logger.error(`Ensure 'firebase-service-account.json' exists in the '/backend' root directory (not '/backend/src') and is correctly formatted.`);
  }
  process.exit(1); // Exit if Firebase Admin cannot initialize
}

module.exports = admin; // Export the initialized admin instance