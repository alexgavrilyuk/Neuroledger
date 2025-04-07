const { CloudTasksClient } = require('@google-cloud/tasks');
const config = require('../config');
const logger = require('../utils/logger');

// Initialize Cloud Tasks client
const tasksClient = new CloudTasksClient();

// Get the project ID and location from config
const project = config.projectId;
const location = config.cloudTasksLocation;
const serviceUrl = config.serviceUrl || `https://${process.env.GOOGLE_CLOUD_PROJECT}.appspot.com`;

/**
 * Creates a cloud task for asynchronous processing
 * @param {string} queueName - The name of the queue to add the task to
 * @param {string} endpoint - The endpoint that should handle the task (e.g., '/internal/quality-audit-worker')
 * @param {Object} payload - The payload to send to the worker
 * @returns {Promise<Object>} - Response from Cloud Tasks createTask
 */
const createTask = async (queueName, endpoint, payload) => {
  try {
    // Construct the fully qualified queue name
    const parent = tasksClient.queuePath(project, location, queueName);

    // Define the task
    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: `${serviceUrl}/api/v1${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        oidcToken: {
          serviceAccountEmail: config.cloudTasksServiceAccount || `${project}@appspot.gserviceaccount.com`,
          audience: `${serviceUrl}/api/v1${endpoint}`
        },
      },
    };

    // Create the Cloud Task
    const [response] = await tasksClient.createTask({ parent, task });
    logger.info(`Created Cloud Task in queue ${queueName}: ${response.name}`);

    return response;
  } catch (error) {
    logger.error(`Failed to create cloud task in queue ${queueName}: ${error.message}`);
    throw error;
  }
};

module.exports = {
  createTask
}; 