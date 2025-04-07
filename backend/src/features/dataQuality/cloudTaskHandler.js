// backend/src/features/dataQuality/cloudTaskHandler.js
const { CloudTasksClient } = require('@google-cloud/tasks');
const Dataset = require('../datasets/dataset.model');
const TeamMember = require('../teams/team-member.model');
const config = require('../../shared/config');
const logger = require('../../shared/utils/logger');

// Initialize Cloud Tasks client
const tasksClient = new CloudTasksClient();

// Get the project ID and location from config
const project = config.projectId || process.env.GOOGLE_CLOUD_PROJECT;
const location = config.cloudTasksLocation || 'us-central1'; // default to us-central1 if not specified
const queue = config.qualityAuditQueueName || 'neuroledger-quality-audit-queue';
const serviceUrl = config.serviceUrl || `https://${process.env.GOOGLE_CLOUD_PROJECT}.appspot.com`;

// Construct the fully qualified queue name
const parent = tasksClient.queuePath(project, location, queue);

/**
 * Initiates a quality audit for a dataset
 * @param {string} datasetId - MongoDB ObjectId of the dataset
 * @param {string} userId - MongoDB ObjectId of the user requesting the audit
 * @returns {Promise<Object>} - Status object
 */
const initiateQualityAudit = async (datasetId, userId) => {
  try {
    // Fetch the dataset
    const dataset = await Dataset.findById(datasetId);
    if (!dataset) {
      throw new Error('Dataset not found.');
    }

    // Check if user has permissions (owner or team admin)
    if (dataset.ownerId.toString() !== userId.toString()) {
      if (dataset.teamId) {
        // Check if user is admin of the team
        const teamMember = await TeamMember.findOne({
          teamId: dataset.teamId,
          userId,
          role: 'admin'
        });

        if (!teamMember) {
          throw new Error('You do not have permission to audit this team dataset.');
        }
      } else {
        throw new Error('You do not have permission to audit this dataset.');
      }
    }

    // Check if dataset has description and all column descriptions
    if (!dataset.description || dataset.description.trim() === '') {
      throw new Error('Dataset description is required for quality audit.');
    }

    // Check if all columns have descriptions
    const missingDescriptions = [];
    if (dataset.schemaInfo && dataset.schemaInfo.length > 0) {
      dataset.schemaInfo.forEach(column => {
        const columnName = column.name;
        if (!dataset.columnDescriptions.get(columnName) || dataset.columnDescriptions.get(columnName).trim() === '') {
          missingDescriptions.push(columnName);
        }
      });
    }

    if (missingDescriptions.length > 0) {
      throw new Error(`Column descriptions are missing for: ${missingDescriptions.join(', ')}`);
    }

    // Check if audit is already running or completed
    if (['processing', 'ok', 'warning', 'error'].includes(dataset.qualityStatus)) {
      if (dataset.qualityStatus === 'processing') {
        throw new Error('A quality audit is already in progress for this dataset.');
      } else {
        throw new Error('This dataset has already been audited. Delete the existing audit to run a new one.');
      }
    }

    // Update dataset status to processing
    dataset.qualityStatus = 'processing';
    dataset.qualityAuditRequestedAt = new Date();
    dataset.qualityAuditCompletedAt = null;
    dataset.qualityReport = null;
    await dataset.save();

    logger.info(`Quality audit initiated for dataset ${datasetId} by user ${userId}`);

    // Create Cloud Task payload
    const payload = {
      datasetId: datasetId.toString(),
      userId: userId.toString()
    };

    // Define the task
    const task = {
      httpRequest: {
        httpMethod: 'POST',
        url: `${serviceUrl}/api/v1/internal/quality-audit-worker`,
        headers: {
          'Content-Type': 'application/json',
        },
        body: Buffer.from(JSON.stringify(payload)).toString('base64'),
        oidcToken: {
          serviceAccountEmail: config.cloudTasksServiceAccount || `${project}@appspot.gserviceaccount.com`,
          audience: `${serviceUrl}/api/v1/internal/quality-audit-worker`
        },
      },
    };

    // Create the Cloud Task
    const [response] = await tasksClient.createTask({ parent, task });
    logger.info(`Created Cloud Task: ${response.name}`);

    return { status: 'processing' };
  } catch (error) {
    logger.error(`Failed to initiate quality audit: ${error.message}`);
    throw error;
  }
};

/**
 * Handles the worker request from Cloud Tasks
 * @param {Object} payload - Task payload with datasetId and userId
 * @returns {Promise<void>}
 */
const workerHandler = async (payload) => {
  logger.info(`Quality audit worker started with payload: ${JSON.stringify(payload)}`);

  try {
    const { datasetId, userId } = payload;

    // Validate payload
    if (!datasetId || !userId) {
      throw new Error('Invalid payload: missing datasetId or userId');
    }

    // Import dynamically to avoid circular dependencies
    const { performFullAudit } = require('./dataQuality.service');
    
    // Call performFullAudit with the payload parameters
    await performFullAudit(datasetId, userId);
  } catch (error) {
    logger.error(`Quality audit worker failed: ${error.message}`);

    // Update dataset status to error if possible
    try {
      if (payload?.datasetId) {
        const dataset = await Dataset.findById(payload.datasetId);
        if (dataset && dataset.qualityStatus === 'processing') {
          dataset.qualityStatus = 'error';
          dataset.qualityAuditCompletedAt = new Date();
          dataset.qualityReport = {
            error: error.message,
            timestamp: new Date().toISOString()
          };
          await dataset.save();
          logger.info(`Updated dataset ${payload.datasetId} status to error due to worker failure`);
        }
      }
    } catch (updateError) {
      logger.error(`Failed to update dataset status after worker failure: ${updateError.message}`);
    }

    throw error;
  }
};

module.exports = {
  initiateQualityAudit,
  workerHandler
};