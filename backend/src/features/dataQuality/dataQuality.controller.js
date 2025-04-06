// backend/src/features/dataQuality/dataQuality.controller.js
const dataQualityService = require('./dataQuality.service');
const Dataset = require('../datasets/dataset.model');
const logger = require('../../shared/utils/logger');
const mongoose = require('mongoose'); // Import mongoose for ID validation

/**
 * Initiates a data quality audit for a dataset
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const initiateAudit = async (req, res, next) => {
  try {
    const { datasetId } = req.params;
    const userId = req.user._id;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(datasetId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid dataset ID format.'
      });
    }

    // Call service to initiate audit
    const result = await dataQualityService.initiateQualityAudit(datasetId, userId);

    // Return 202 Accepted with processing status
    res.status(202).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    logger.error(`Error initiating quality audit: ${error.message}`);

    // Return specific error messages for known errors
    if (error.message.includes('Dataset not found')) {
      return res.status(404).json({ status: 'error', message: error.message });
    }

    if (error.message.includes('permission')) {
      return res.status(403).json({ status: 'error', message: error.message });
    }

    if (error.message.includes('description is required')) {
      return res.status(400).json({
        status: 'error',
        message: error.message,
        code: 'MISSING_CONTEXT'
      });
    }

    if (error.message.includes('Column descriptions are missing')) {
      return res.status(400).json({
        status: 'error',
        message: error.message,
        code: 'MISSING_COLUMN_DESCRIPTIONS'
      });
    }

    if (error.message.includes('already in progress')) {
      return res.status(409).json({
        status: 'error',
        message: error.message,
        code: 'AUDIT_IN_PROGRESS'
      });
    }

    if (error.message.includes('already been audited')) {
      return res.status(409).json({
        status: 'error',
        message: error.message,
        code: 'AUDIT_ALREADY_COMPLETE'
      });
    }

    // For any other errors, pass to global error handler
    next(error);
  }
};

/**
 * Gets the current status of a quality audit
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const getAuditStatus = async (req, res, next) => {
  try {
    const { datasetId } = req.params;
    const userId = req.user._id;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(datasetId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid dataset ID format.'
      });
    }

    // Find dataset with team access consideration
    const TeamMember = require('../teams/team-member.model');

    // First, get all teams the user is a member of
    const teamMemberships = await TeamMember.find({ userId }).select('teamId').lean();
    const teamIds = teamMemberships.map(tm => tm.teamId);

    // Then find dataset either owned by user or belonging to user's team
    const dataset = await Dataset.findOne({
      _id: datasetId,
      $or: [
        { ownerId: userId },  // User is owner
        { teamId: { $in: teamIds } }  // Or belongs to user's team
      ]
    }).select('qualityStatus qualityAuditRequestedAt qualityAuditCompletedAt').lean();

    if (!dataset) {
      logger.warn(`User ${userId} attempted to get audit status for inaccessible dataset ID: ${datasetId}`);
      return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' });
    }

    // Return audit status information
    res.status(200).json({
      status: 'success',
      data: {
        qualityStatus: dataset.qualityStatus,
        requestedAt: dataset.qualityAuditRequestedAt,
        completedAt: dataset.qualityAuditCompletedAt
      }
    });
  } catch (error) {
    logger.error(`Error getting audit status: ${error.message}`);
    next(error);
  }
};

/**
 * Gets the complete quality audit report
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const getAuditReport = async (req, res, next) => {
  try {
    const { datasetId } = req.params;
    const userId = req.user._id;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(datasetId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid dataset ID format.'
      });
    }

    // Find dataset with team access consideration
    const TeamMember = require('../teams/team-member.model');

    // First, get all teams the user is a member of
    const teamMemberships = await TeamMember.find({ userId }).select('teamId').lean();
    const teamIds = teamMemberships.map(tm => tm.teamId);

    // Then find dataset either owned by user or belonging to user's team
    const dataset = await Dataset.findOne({
      _id: datasetId,
      $or: [
        { ownerId: userId },  // User is owner
        { teamId: { $in: teamIds } }  // Or belongs to user's team
      ]
    }).select('qualityStatus qualityReport qualityAuditRequestedAt qualityAuditCompletedAt').lean();

    if (!dataset) {
      logger.warn(`User ${userId} attempted to get audit report for inaccessible dataset ID: ${datasetId}`);
      return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' });
    }

    // Handle cases based on quality status
    switch (dataset.qualityStatus) {
      case 'not_run':
        return res.status(404).json({
          status: 'error',
          message: 'No quality audit has been run for this dataset.',
          code: 'NO_AUDIT'
        });

      case 'processing':
        return res.status(202).json({
          status: 'success',
          data: {
            qualityStatus: 'processing',
            requestedAt: dataset.qualityAuditRequestedAt,
            message: 'Quality audit is still processing.'
          }
        });

      case 'ok':
      case 'warning':
      case 'error':
        return res.status(200).json({
          status: 'success',
          data: {
            qualityStatus: dataset.qualityStatus,
            requestedAt: dataset.qualityAuditRequestedAt,
            completedAt: dataset.qualityAuditCompletedAt,
            report: dataset.qualityReport
          }
        });

      default:
        return res.status(500).json({
          status: 'error',
          message: `Unknown quality status: ${dataset.qualityStatus}`
        });
    }
  } catch (error) {
    logger.error(`Error getting audit report: ${error.message}`);
    next(error);
  }
};

/**
 * Handles the worker request from Cloud Tasks
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const handleWorkerRequest = async (req, res, next) => {
  try {
    // Extract payload from request body
    const payload = req.body;

    logger.info(`Received worker request with payload: ${JSON.stringify(payload)}`);

    // Basic validation of payload
    if (!payload || !payload.datasetId || !payload.userId) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid payload: missing required fields'
      });
    }

    // Process the task in the background and return success immediately
    // This prevents Cloud Tasks from retrying if the processing takes longer than the HTTP timeout
    res.status(200).json({
      status: 'success',
      message: 'Task received and processing started'
    });

    // Handle the worker task in the background
    dataQualityService.workerHandler(payload)
      .then(() => {
        logger.info(`Successfully completed worker task for dataset ${payload.datasetId}`);
      })
      .catch(error => {
        logger.error(`Error in background processing of worker task: ${error.message}`);
      });

  } catch (error) {
    logger.error(`Error handling worker request: ${error.message}`);

    // Still return 200 to prevent Cloud Tasks retries
    // The error is already logged and handled in the background processing
    res.status(200).json({
      status: 'error',
      message: 'Error occurred but task will not be retried'
    });
  }
};

/**
 * Resets a previously completed quality audit to allow running a new one
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const resetAudit = async (req, res, next) => {
  try {
    const { datasetId } = req.params;
    const userId = req.user._id;

    // Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(datasetId)) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid dataset ID format.'
      });
    }

    // Find dataset with team access consideration
    const TeamMember = require('../teams/team-member.model');

    // First, get all teams the user is a member of
    const teamMemberships = await TeamMember.find({ userId }).select('teamId').lean();
    const teamIds = teamMemberships.map(tm => tm.teamId);

    // Then find dataset either owned by user or belonging to user's team
    const dataset = await Dataset.findOne({
      _id: datasetId,
      $or: [
        { ownerId: userId },  // User is owner
        { teamId: { $in: teamIds } }  // Or belongs to user's team
      ]
    });

    if (!dataset) {
      logger.warn(`User ${userId} attempted to reset audit for inaccessible dataset ID: ${datasetId}`);
      return res.status(404).json({ status: 'error', message: 'Dataset not found or not accessible.' });
    }

    // Check if the audit is in processing state
    if (dataset.qualityStatus === 'processing') {
      return res.status(409).json({
        status: 'error',
        message: 'Cannot reset an audit that is currently processing.',
        code: 'AUDIT_IN_PROGRESS'
      });
    }

    // Reset quality audit fields
    dataset.qualityStatus = 'not_run';
    dataset.qualityAuditRequestedAt = null;
    dataset.qualityAuditCompletedAt = null;
    dataset.qualityReport = null;

    await dataset.save();

    logger.info(`Quality audit reset for dataset ${datasetId} by user ${userId}`);

    res.status(200).json({
      status: 'success',
      data: {
        qualityStatus: 'not_run',
        message: 'Quality audit has been reset. You can now run a new audit.'
      }
    });
  } catch (error) {
    logger.error(`Error resetting audit: ${error.message}`);
    next(error);
  }
};

module.exports = {
  initiateAudit,
  getAuditStatus,
  getAuditReport,
  handleWorkerRequest,
  resetAudit
};