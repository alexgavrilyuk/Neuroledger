// backend/src/features/dataQuality/dataQuality.service.js
const Dataset = require('../datasets/dataset.model');
const logger = require('../../shared/utils/logger');

// Import refactored modules
const cloudTaskHandler = require('./cloudTaskHandler');
const dataAnalysis = require('./dataAnalysis');
const aiInterpretation = require('./aiInterpretation');
const reportGeneration = require('./reportGeneration');

/**
 * Performs the full audit process
 * @param {string} datasetId - MongoDB ObjectId of the dataset
 * @param {string} userId - MongoDB ObjectId of the user
 * @returns {Promise<void>}
 */
const performFullAudit = async (datasetId, userId) => {
  logger.info(`Starting full audit for dataset ${datasetId}`);

  // B1: Setup - Fetch dataset, user, team context
  const dataset = await Dataset.findById(datasetId).populate('ownerId', 'name email settings').populate('teamId', 'name settings');
  if (!dataset) {
    throw new Error(`Dataset ${datasetId} not found during audit process`);
  }

  if (dataset.qualityStatus !== 'processing') {
    throw new Error(`Dataset ${datasetId} is not in processing status (current: ${dataset.qualityStatus})`);
  }

  // Gather context for AI
  let context = {
    datasetId: datasetId,
    datasetName: dataset.name,
    datasetDescription: dataset.description,
    originalFilename: dataset.originalFilename,
    createdAt: dataset.createdAt,
    columnInfo: dataset.schemaInfo || [],
    columnDescriptions: {},
  };

  // Convert Map to plain object for AI context
  if (dataset.columnDescriptions && dataset.columnDescriptions.size > 0) {
    dataset.columnDescriptions.forEach((value, key) => {
      context.columnDescriptions[key] = value;
    });
  }

  // Add user/team context
  if (dataset.ownerId) {
    context.owner = {
      name: dataset.ownerId.name,
      email: dataset.ownerId.email,
      aiContext: dataset.ownerId.settings?.aiContext || '',
    };
  }

  if (dataset.teamId) {
    context.team = {
      name: dataset.teamId.name,
      aiContext: dataset.teamId.settings?.aiContext || '',
    };
  }

  // B2: Programmatic Analysis
  logger.info(`Starting programmatic analysis for dataset ${datasetId}`);
  const programmaticReport = await dataAnalysis.analyzeProgrammatically(dataset.gcsPath);
  logger.info(`Completed programmatic analysis for dataset ${datasetId}`);

  // B3: AI Interpretation
  logger.info(`Starting AI interpretation for dataset ${datasetId}`);
  const aiInsights = await aiInterpretation.performAiInterpretations(context, programmaticReport);
  logger.info(`Completed AI interpretation for dataset ${datasetId}`);

  // B4: AI Synthesis
  logger.info(`Starting AI synthesis for dataset ${datasetId}`);
  const finalReport = await reportGeneration.generateAiFinalReport(context, programmaticReport, aiInsights);
  logger.info(`Completed AI synthesis for dataset ${datasetId}`);

  // B5: Finalize & Save
  const overallStatus = reportGeneration.determineOverallStatus(finalReport);

  // Update dataset with final report
  dataset.qualityStatus = overallStatus;
  dataset.qualityAuditCompletedAt = new Date();
  dataset.qualityReport = finalReport;
  await dataset.save();

  logger.info(`Quality audit completed for dataset ${datasetId} with status: ${overallStatus}`);
};

// Re-export functions from other modules
module.exports = {
  initiateQualityAudit: cloudTaskHandler.initiateQualityAudit,
  workerHandler: cloudTaskHandler.workerHandler,
  performFullAudit,
  analyzeProgrammatically: dataAnalysis.analyzeProgrammatically,
  performAiInterpretations: aiInterpretation.performAiInterpretations,
  generateAiFinalReport: reportGeneration.generateAiFinalReport,
  determineOverallStatus: reportGeneration.determineOverallStatus
};