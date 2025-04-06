// backend/src/features/dataQuality/dataQuality.service.js
const { CloudTasksClient } = require('@google-cloud/tasks');
const Dataset = require('../datasets/dataset.model');
const User = require('../users/user.model');
const Team = require('../teams/team.model');
const TeamMember = require('../teams/team-member.model');
const { getBucket } = require('../../shared/external_apis/gcs.client');
const anthropic = require('../../shared/external_apis/claude.client');
const config = require('../../shared/config');
const logger = require('../../shared/utils/logger');
const Papa = require('papaparse');
const path = require('path');

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
  const programmaticReport = await analyzeProgrammatically(dataset.gcsPath);
  logger.info(`Completed programmatic analysis for dataset ${datasetId}`);

  // B3: AI Interpretation
  logger.info(`Starting AI interpretation for dataset ${datasetId}`);
  const aiInsights = await performAiInterpretations(context, programmaticReport);
  logger.info(`Completed AI interpretation for dataset ${datasetId}`);

  // B4: AI Synthesis
  logger.info(`Starting AI synthesis for dataset ${datasetId}`);
  const finalReport = await generateAiFinalReport(context, programmaticReport, aiInsights);
  logger.info(`Completed AI synthesis for dataset ${datasetId}`);

  // B5: Finalize & Save
  const overallStatus = determineOverallStatus(finalReport);

  // Update dataset with final report
  dataset.qualityStatus = overallStatus;
  dataset.qualityAuditCompletedAt = new Date();
  dataset.qualityReport = finalReport;
  await dataset.save();

  logger.info(`Quality audit completed for dataset ${datasetId} with status: ${overallStatus}`);
};

/**
 * Analyzes the dataset programmatically
 * @param {string} gcsPath - Path to the file in GCS
 * @returns {Promise<Object>} - Programmatic report
 */
const analyzeProgrammatically = async (gcsPath) => {
  logger.info(`Starting programmatic analysis for file at ${gcsPath}`);

  const bucket = getBucket();
  const file = bucket.file(gcsPath);

  // Check if file exists
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`File not found at path: ${gcsPath}`);
  }

  // Create a read stream
  const readStream = file.createReadStream();

  return new Promise((resolve, reject) => {
    // Initialize statistics object
    const stats = {
      rowCount: 0,
      columnCount: 0,
      raggedRows: {
        count: 0,
        examples: []
      },
      columns: {},
      processingTime: 0,
      fileSizeBytes: 0,
      fileType: path.extname(gcsPath).toLowerCase().replace('.', '')
    };

    const startTime = Date.now();

    // Use PapaParse to process the CSV stream
    Papa.parse(readStream, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: false, // We want to detect empty lines

      // Process each row as it's parsed
      step: function(results, parser) {
        stats.rowCount++;

        // Get column names from the first row
        if (stats.rowCount === 1) {
          stats.columnCount = Object.keys(results.data).length;

          // Initialize column statistics
          Object.keys(results.data).forEach(colName => {
            stats.columns[colName] = {
              name: colName,
              nonNullCount: 0,
              nullCount: 0,
              emptyStringCount: 0,
              whitespaceCount: 0,
              uniqueValues: new Set(),
              numericCount: 0,
              nonNumericCount: 0,
              dateAttemptCount: 0,
              minValue: null,
              maxValue: null,
              examples: [],
              issues: []
            };
          });
        }

        // Check if row has different number of columns than expected
        const rowColumnCount = Object.keys(results.data).length;
        if (rowColumnCount !== stats.columnCount) {
          stats.raggedRows.count++;
          if (stats.raggedRows.examples.length < 5) {
            stats.raggedRows.examples.push({
              rowNumber: stats.rowCount,
              expectedColumns: stats.columnCount,
              actualColumns: rowColumnCount
            });
          }
        }

        // Analyze each column in the row
        Object.entries(results.data).forEach(([colName, value]) => {
          const col = stats.columns[colName];
          if (!col) return; // Skip if column wasn't in headers

          // Track null/empty values
          if (value === null || value === undefined) {
            col.nullCount++;
            return;
          }

          col.nonNullCount++;

          // Handle string values
          if (typeof value === 'string') {
            // Check for empty strings
            if (value === '') {
              col.emptyStringCount++;
              return;
            }

            // Check for whitespace-only strings
            if (value.trim() === '') {
              col.whitespaceCount++;
              return;
            }

            // Try to parse as number
            const numberValue = Number(value);
            if (!isNaN(numberValue)) {
              col.numericCount++;

              // Update min/max
              if (col.minValue === null || numberValue < col.minValue) {
                col.minValue = numberValue;
              }
              if (col.maxValue === null || numberValue > col.maxValue) {
                col.maxValue = numberValue;
              }
            } else {
              col.nonNumericCount++;

              // Try to parse as date
              const dateValue = new Date(value);
              if (!isNaN(dateValue.getTime())) {
                col.dateAttemptCount++;
              }
            }
          }
          // Handle numeric values directly
          else if (typeof value === 'number') {
            col.numericCount++;

            // Update min/max
            if (col.minValue === null || value < col.minValue) {
              col.minValue = value;
            }
            if (col.maxValue === null || value > col.maxValue) {
              col.maxValue = value;
            }
          }

          // Track unique values (up to 1000 to avoid memory issues)
          if (col.uniqueValues.size < 1000) {
            col.uniqueValues.add(value);
          }

          // Store up to 10 examples of non-null values
          if (col.examples.length < 10) {
            col.examples.push({
              rowNumber: stats.rowCount,
              value: value
            });
          }
        });
      },

      complete: function(results) {
        const endTime = Date.now();
        stats.processingTime = endTime - startTime;

        // Get file size from parse results if available
        if (results.meta && results.meta.size) {
          stats.fileSizeBytes = results.meta.size;
        }

        // Final column processing
        Object.values(stats.columns).forEach(col => {
          // Calculate percentages
          const totalRows = stats.rowCount;
          col.nullPercentage = totalRows > 0 ? (col.nullCount / totalRows) * 100 : 0;
          col.emptyStringPercentage = totalRows > 0 ? (col.emptyStringCount / totalRows) * 100 : 0;
          col.whitespacePercentage = totalRows > 0 ? (col.whitespaceCount / totalRows) * 100 : 0;
          col.missingPercentage = totalRows > 0 ?
            ((col.nullCount + col.emptyStringCount + col.whitespaceCount) / totalRows) * 100 : 0;

          // Calculate cardinality
          col.cardinality = col.uniqueValues.size;
          col.cardinalityPercentage = col.nonNullCount > 0 ?
            (col.cardinality / col.nonNullCount) * 100 : 0;

          // Determine if column appears numeric
          col.appearingNumeric = col.nonNullCount > 0 &&
            (col.numericCount / col.nonNullCount) > 0.8;

          // Determine if column appears to contain dates
          col.appearingDates = col.nonNullCount > 0 &&
            (col.dateAttemptCount / col.nonNullCount) > 0.8;

          // Identify potential issues
          if (col.missingPercentage > 10) {
            col.issues.push({
              type: 'high_missing_values',
              description: `High percentage of missing values: ${col.missingPercentage.toFixed(2)}%`,
              severity: col.missingPercentage > 50 ? 'high' : 'medium'
            });
          }

          if (col.appearingNumeric && col.nonNumericCount > 0) {
            col.issues.push({
              type: 'inconsistent_numeric',
              description: `Column appears numeric but has ${col.nonNumericCount} non-numeric values`,
              severity: 'medium'
            });
          }

          if (col.appearingDates && col.nonNullCount > col.dateAttemptCount) {
            col.issues.push({
              type: 'inconsistent_dates',
              description: `Column appears to contain dates but has ${col.nonNullCount - col.dateAttemptCount} non-date values`,
              severity: 'medium'
            });
          }

          // For string columns, check cardinality
          if (!col.appearingNumeric && !col.appearingDates && col.cardinalityPercentage > 95) {
            col.issues.push({
              type: 'high_cardinality',
              description: `High unique value ratio (${col.cardinalityPercentage.toFixed(2)}%), possibly unique identifiers or free text`,
              severity: 'low'
            });
          }

          // Convert Set to Array for JSON serialization
          col.uniqueValues = Array.from(col.uniqueValues).slice(0, 100); // Limit to 100 values
        });

        // Add overall dataset issues
        stats.issues = [];

        if (stats.raggedRows.count > 0) {
          stats.issues.push({
            type: 'ragged_rows',
            description: `Dataset contains ${stats.raggedRows.count} rows with inconsistent column counts`,
            severity: 'high',
            examples: stats.raggedRows.examples
          });
        }

        // Count columns with high missing values
        const columnsWithHighMissing = Object.values(stats.columns).filter(col => col.missingPercentage > 20).length;
        if (columnsWithHighMissing > 0) {
          stats.issues.push({
            type: 'multiple_high_missing_columns',
            description: `Dataset has ${columnsWithHighMissing} columns with >20% missing values`,
            severity: columnsWithHighMissing > (stats.columnCount / 3) ? 'high' : 'medium'
          });
        }

        resolve(stats);
      },

      error: function(error) {
        reject(new Error(`Error parsing CSV: ${error.message}`));
      }
    });
  });
};

/**
 * Performs AI interpretations of programmatic findings
 * @param {Object} context - Dataset context
 * @param {Object} programmaticReport - Results from programmatic analysis
 * @returns {Promise<Object>} - AI insights
 */
const performAiInterpretations = async (context, programmaticReport) => {
  logger.info('Starting AI interpretations for programmatic findings');

  const aiInsights = {
    columnInsights: {},
    overallInsights: []
  };

  // Get columns with issues for targeted analysis
  const columnsWithIssues = Object.values(programmaticReport.columns)
    .filter(col => col.issues && col.issues.length > 0)
    .sort((a, b) => {
      // Sort by issue severity (high, medium, low)
      const severityScore = (issues) => {
        let score = 0;
        issues.forEach(issue => {
          if (issue.severity === 'high') score += 3;
          else if (issue.severity === 'medium') score += 2;
          else score += 1;
        });
        return score;
      };

      return severityScore(b.issues) - severityScore(a.issues);
    });

  // Process up to 5 columns with the most severe issues
  const columnsToProcess = columnsWithIssues.slice(0, 5);

  // Process each column with AI
  for (const column of columnsToProcess) {
    try {
      // Get column-specific insights
      const columnInsight = await getColumnInsights(column, context, programmaticReport);
      aiInsights.columnInsights[column.name] = columnInsight;

      logger.info(`Completed AI analysis for column: ${column.name}`);
    } catch (error) {
      logger.error(`Error analyzing column ${column.name}: ${error.message}`);
      aiInsights.columnInsights[column.name] = {
        error: error.message
      };
    }
  }

  // Get overall dataset insights
  try {
    const overallInsights = await getOverallInsights(context, programmaticReport);
    aiInsights.overallInsights = overallInsights;

    logger.info('Completed AI analysis for overall dataset');
  } catch (error) {
    logger.error(`Error analyzing overall dataset: ${error.message}`);
    aiInsights.overallInsights = [{
      type: 'error',
      content: error.message
    }];
  }

  return aiInsights;
};

/**
 * Gets AI insights for a specific column
 * @param {Object} column - Column statistics
 * @param {Object} context - Dataset context
 * @param {Object} programmaticReport - Full programmatic report
 * @returns {Promise<Object>} - Column insights
 */
const getColumnInsights = async (column, context, programmaticReport) => {
  // Get column description from context
  const columnDescription = context.columnDescriptions[column.name] || 'No description provided';

  // Determine prompt type based on column issues and characteristics
  let promptType;
  let additionalInfo = {};

  if (column.appearingDates && column.issues.some(i => i.type === 'inconsistent_dates')) {
    promptType = 'date_format_issues';
  }
  else if (column.appearingNumeric && column.issues.some(i => i.type === 'inconsistent_numeric')) {
    promptType = 'numeric_issues';
  }
  else if (column.missingPercentage > 10) {
    promptType = 'missing_values';
  }
  else if (column.cardinality > 0 && column.cardinality <= 50 && !column.appearingNumeric && !column.appearingDates) {
    promptType = 'categorical_analysis';
    additionalInfo.uniqueValues = column.uniqueValues;
  }
  else {
    promptType = 'general_column_assessment';
  }

  // Construct prompt based on type
  let promptText;

  switch (promptType) {
    case 'date_format_issues':
      promptText = `
You are analyzing a dataset column with date format issues. Your task is to identify patterns and make recommendations for cleaning.

DATASET CONTEXT:
- Dataset name: ${context.datasetName}
- Dataset description: ${context.datasetDescription}
- Column name: ${column.name}
- Column description: ${columnDescription}

COLUMN STATISTICS:
- Total rows: ${programmaticReport.rowCount}
- Number of non-null values: ${column.nonNullCount}
- Number of values that parsed as dates: ${column.dateAttemptCount}
- Number of values that failed date parsing: ${column.nonNullCount - column.dateAttemptCount}
- Missing values percentage: ${column.missingPercentage.toFixed(2)}%

EXAMPLE VALUES:
${column.examples.map(ex => `Row ${ex.rowNumber}: "${ex.value}"`).join('\n')}

Based on the data provided, please answer the following questions:
1. What date formats appear to be present in this column?
2. Is there a dominant format that appears most frequently?
3. What specific inconsistencies or issues exist in the date formats?
4. How can the user standardize these dates (provide specific code examples in Excel, Python, or SQL if appropriate)?
5. Are there any other concerns about this date column that might affect analysis?

Format your response as a structured JSON object with the following keys:
- "identifiedFormats": Array of date formats found
- "dominantFormat": The most common format if identifiable
- "inconsistencies": Specific issues found
- "cleaningSteps": Recommended steps to clean and standardize
- "concerns": Any additional concerns or considerations
`;
      break;

    case 'numeric_issues':
      promptText = `
You are analyzing a dataset column with numeric inconsistencies. Your task is to identify patterns and make recommendations for cleaning.

DATASET CONTEXT:
- Dataset name: ${context.datasetName}
- Dataset description: ${context.datasetDescription}
- Column name: ${column.name}
- Column description: ${columnDescription}

COLUMN STATISTICS:
- Total rows: ${programmaticReport.rowCount}
- Number of non-null values: ${column.nonNullCount}
- Number of values that parsed as numbers: ${column.numericCount}
- Number of non-numeric values: ${column.nonNumericCount}
- Minimum value (of numeric values): ${column.minValue !== null ? column.minValue : 'N/A'}
- Maximum value (of numeric values): ${column.maxValue !== null ? column.maxValue : 'N/A'}
- Missing values percentage: ${column.missingPercentage.toFixed(2)}%

EXAMPLE VALUES:
${column.examples.map(ex => `Row ${ex.rowNumber}: "${ex.value}"`).join('\n')}

Based on the data provided, please answer the following questions:
1. What numeric format issues appear to be present in this column?
2. Are there non-numeric characters (like currency symbols, commas, percent signs) that need to be cleaned?
3. Are there outliers or suspicious values that should be reviewed?
4. How can the user clean and standardize these values (provide specific code examples in Excel, Python, or SQL if appropriate)?
5. Are there any other concerns about this numeric column that might affect analysis?

Format your response as a structured JSON object with the following keys:
- "identifiedIssues": Array of numeric format issues found
- "nonNumericCharacters": Characters that need to be removed
- "outlierConcerns": Potential outliers or suspicious values
- "cleaningSteps": Recommended steps to clean and standardize
- "concerns": Any additional concerns or considerations
`;
      break;

    case 'missing_values':
      promptText = `
You are analyzing a dataset column with significant missing values. Your task is to assess the impact and make recommendations.

DATASET CONTEXT:
- Dataset name: ${context.datasetName}
- Dataset description: ${context.datasetDescription}
- Column name: ${column.name}
- Column description: ${columnDescription}

COLUMN STATISTICS:
- Total rows: ${programmaticReport.rowCount}
- Number of null values: ${column.nullCount}
- Number of empty strings: ${column.emptyStringCount}
- Number of whitespace-only values: ${column.whitespaceCount}
- Total missing percentage: ${column.missingPercentage.toFixed(2)}%
- Column appears to be: ${column.appearingNumeric ? 'numeric' : column.appearingDates ? 'dates' : 'text/categorical'}
- Cardinality (unique values): ${column.cardinality}

EXAMPLE VALUES (non-missing):
${column.examples.filter(ex => ex.value !== null && ex.value !== '').map(ex => `Row ${ex.rowNumber}: "${ex.value}"`).join('\n')}

Based on the data provided, please answer the following questions:
1. How might the missing values impact analysis of this dataset?
2. Based on the column description and example values, can you infer why data might be missing?
3. What are the best strategies for handling these missing values (removal, imputation, etc.)?
4. If imputation is appropriate, what method would you recommend?
5. Should the user be concerned about bias introduced by the missing values?

Format your response as a structured JSON object with the following keys:
- "impact": How missing values impact analysis
- "possibleReasons": Possible reasons for missing values
- "recommendedStrategy": Best approach for handling missing values
- "imputationMethod": Recommended method if imputation is appropriate
- "biasConcerns": Potential bias considerations
`;
      break;

    case 'categorical_analysis':
      promptText = `
You are analyzing a categorical column in a dataset. Your task is to assess the values and make recommendations.

DATASET CONTEXT:
- Dataset name: ${context.datasetName}
- Dataset description: ${context.datasetDescription}
- Column name: ${column.name}
- Column description: ${columnDescription}

COLUMN STATISTICS:
- Total rows: ${programmaticReport.rowCount}
- Number of non-null values: ${column.nonNullCount}
- Cardinality (unique values): ${column.cardinality}
- Missing values percentage: ${column.missingPercentage.toFixed(2)}%

UNIQUE VALUES:
${column.uniqueValues.slice(0, 50).map(val => `"${val}"`).join(', ')}

Based on the data provided, please answer the following questions:
1. Are there any inconsistencies or standardization issues in these categorical values?
2. Are there any misspellings or variations that should be consolidated?
3. Is the cardinality appropriate for what appears to be a categorical variable?
4. How can the user clean and standardize these values if needed?
5. Are there any other insights or patterns in these categorical values?

Format your response as a structured JSON object with the following keys:
- "inconsistencies": Identified inconsistencies or standardization issues
- "valueGroups": Suggestions for grouping similar values
- "cardinalityConcerns": Whether cardinality is appropriate
- "cleaningSteps": Recommended steps to clean and standardize
- "insights": Additional patterns or insights
`;
      break;

    case 'general_column_assessment':
    default:
      promptText = `
You are analyzing a column in a dataset. Your task is to provide a general assessment and recommendations.

DATASET CONTEXT:
- Dataset name: ${context.datasetName}
- Dataset description: ${context.datasetDescription}
- Column name: ${column.name}
- Column description: ${columnDescription}

COLUMN STATISTICS:
- Total rows: ${programmaticReport.rowCount}
- Number of non-null values: ${column.nonNullCount}
- Missing values percentage: ${column.missingPercentage.toFixed(2)}%
- Column appears to be: ${column.appearingNumeric ? 'numeric' : column.appearingDates ? 'dates' : 'text/categorical'}
- Cardinality (unique values): ${column.cardinality}
${column.appearingNumeric ? `- Minimum value: ${column.minValue}\n- Maximum value: ${column.maxValue}` : ''}

EXAMPLE VALUES:
${column.examples.map(ex => `Row ${ex.rowNumber}: "${ex.value}"`).join('\n')}

Based on the data provided, please answer the following questions:
1. What is the apparent data type and purpose of this column?
2. Are there any quality issues or inconsistencies in the values?
3. Are there any recommendations for improving data quality in this column?
4. How could this column be most effectively used in analysis?
5. Any other insights or observations about this column?

Format your response as a structured JSON object with the following keys:
- "dataTypeAssessment": Assessment of the data type and purpose
- "qualityIssues": Identified quality issues or inconsistencies
- "recommendations": Recommendations for improving quality
- "analyticalUse": How to effectively use this column in analysis
- "additionalInsights": Other observations or insights
`;
      break;
  }

  try {
    // Call Claude API with the constructed prompt
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1000,
      temperature: 0.2,
      system: "You are an expert data scientist specialized in data quality assessment. You provide clear, concise insights about dataset columns and provide actionable recommendations. Always respond with a valid JSON object.",
      messages: [{ role: "user", content: promptText }]
    });

    // Parse and return the JSON response
    const responseText = response.content[0].text;
    try {
      // Try to parse the JSON response
      const jsonResponse = JSON.parse(responseText);
      return {
        columnName: column.name,
        promptType: promptType,
        insights: jsonResponse
      };
    } catch (jsonError) {
      // If parsing fails, return the raw text
      logger.warn(`Failed to parse JSON response for column ${column.name}: ${jsonError.message}`);
      return {
        columnName: column.name,
        promptType: promptType,
        rawResponse: responseText
      };
    }
  } catch (error) {
    logger.error(`Failed to get AI insights for column ${column.name}: ${error.message}`);
    throw error;
  }
};

/**
 * Gets overall AI insights for the dataset
 * @param {Object} context - Dataset context
 * @param {Object} programmaticReport - Full programmatic report
 * @returns {Promise<Array>} - Overall insights
 */
const getOverallInsights = async (context, programmaticReport) => {
  // Construct a prompt for overall dataset assessment
  const promptText = `
You are analyzing a dataset for quality issues. Your task is to provide an overall assessment based on programmatic findings.

DATASET CONTEXT:
- Dataset name: ${context.datasetName}
- Dataset description: ${context.datasetDescription}
- File type: ${programmaticReport.fileType}
- Total rows: ${programmaticReport.rowCount}
- Total columns: ${programmaticReport.columnCount}

COLUMN INFORMATION:
${Object.values(programmaticReport.columns).map(col => `- "${col.name}": ${context.columnDescriptions[col.name] || 'No description'}`).join('\n')}

OVERALL ISSUES:
${programmaticReport.issues.map(issue => `- ${issue.type}: ${issue.description} (Severity: ${issue.severity})`).join('\n')}

COLUMN-SPECIFIC ISSUES:
${Object.values(programmaticReport.columns)
  .filter(col => col.issues && col.issues.length > 0)
  .map(col => `- "${col.name}": ${col.issues.map(i => i.description).join(', ')}`)
  .join('\n')}

Based on the data provided, please answer the following questions:
1. What are the most significant data quality concerns in this dataset?
2. Are there patterns of issues that might indicate systematic data collection or processing problems?
3. How might these issues impact analysis or machine learning models built on this data?
4. What are the top 3-5 recommendations for improving overall data quality?
5. Would you consider this dataset: high quality, medium quality, or low quality? Why?

Format your response as a JSON array of insight objects, each with the following keys:
- "type": One of ["general_assessment", "major_concern", "pattern", "impact", "recommendation", "quality_rating"]
- "title": Brief title for the insight
- "content": Detailed explanation
- "severity": One of ["low", "medium", "high"]
`;

  try {
    // Call Claude API with the constructed prompt
    const response = await anthropic.messages.create({
      model: "claude-3-haiku-20240307",
      max_tokens: 1500,
      temperature: 0.2,
      system: "You are an expert data scientist specialized in data quality assessment. You provide clear, concise insights about datasets and provide actionable recommendations. Always respond with a valid JSON array.",
      messages: [{ role: "user", content: promptText }]
    });

    // Parse and return the JSON response
    const responseText = response.content[0].text;
    try {
      // Try to parse the JSON response
      const jsonResponse = JSON.parse(responseText);
      return jsonResponse;
    } catch (jsonError) {
      // If parsing fails, return a structured object with the raw text
      logger.warn(`Failed to parse JSON response for overall insights: ${jsonError.message}`);
      return [{
        type: "parsing_error",
        title: "Error Parsing AI Response",
        content: responseText,
        severity: "medium"
      }];
    }
  } catch (error) {
    logger.error(`Failed to get overall AI insights: ${error.message}`);
    throw error;
  }
};

/**
 * Generates the final AI report synthesizing all findings
 * @param {Object} context - Dataset context
 * @param {Object} programmaticReport - Results from programmatic analysis
 * @param {Object} aiInsights - Results from AI interpretations
 * @returns {Promise<Object>} - Final synthesized report
 */
const generateAiFinalReport = async (context, programmaticReport, aiInsights) => {
  logger.info('Starting AI synthesis for final report');

  // Extract a summary of the most important programmatic findings
  const programmaticSummary = {
    rowCount: programmaticReport.rowCount,
    columnCount: programmaticReport.columnCount,
    overallIssues: programmaticReport.issues,
    columnsWithIssues: Object.values(programmaticReport.columns)
      .filter(col => col.issues && col.issues.length > 0)
      .map(col => ({
        name: col.name,
        issues: col.issues,
        missingPercentage: col.missingPercentage
      })),
    processingTime: programmaticReport.processingTime,
  };

  // Construct the synthesis prompt
  const promptText = `
You are generating a comprehensive data quality audit report. Your task is to synthesize programmatic findings and AI insights into a clear, actionable report for a business user.

DATASET CONTEXT:
- Dataset name: ${context.datasetName}
- Dataset description: ${context.datasetDescription}
- File type: ${programmaticReport.fileType}
- Total rows: ${programmaticReport.rowCount}
- Total columns: ${programmaticReport.columnCount}

PROGRAMMATIC FINDINGS:
${JSON.stringify(programmaticSummary, null, 2)}

AI INSIGHTS:
${JSON.stringify(aiInsights, null, 2)}

Based on all this information, please create a comprehensive data quality report with the following sections:
1. Executive Summary: A brief overview of the dataset quality, major findings, and key recommendations.
2. Quality Score: Assign a quality score (0-100) with explanation of how it was determined.
3. Key Findings: Bullet points of the most important quality issues discovered.
4. Detailed Analysis: In-depth examination of specific issues, organized by category.
5. Recommendations: Actionable steps to improve data quality, prioritized by impact.

Format your response as a structured JSON object with the following keys:
- "executiveSummary": String containing a brief overview of findings
- "qualityScore": Number between 0-100
- "scoreExplanation": String explaining how the score was determined
- "keyFindings": Array of objects with "issue" and "impact" keys
- "detailedAnalysis": Object with categories as keys and arrays of finding objects as values
- "recommendations": Array of objects with "recommendation", "priority", and "rationale" keys
- "metadata": Object containing audit metadata (timestamp, version, etc.)

Your response must be valid JSON. The report should be clear, actionable, and accessible to business users who may not have technical data science expertise.
`;

  try {
    // Call Claude API with the synthesis prompt
    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 8000,
      temperature: 0.2,
      system: "You are an expert data scientist specialized in creating data quality audit reports. You synthesize technical findings into clear, actionable reports for business users. Always respond with a valid, well-structured JSON object containing all requested sections. CRITICAL: Your response MUST be ONLY the raw JSON object itself, starting strictly with '{' and ending with '}'. Do NOT include ```json, ```, or any other text, explanations, or markdown formatting outside the JSON structure.",
      messages: [{ role: "user", content: promptText }]
    });

    // Parse the JSON response
    const responseText = response.content[0].text;

    // Add logging for the raw AI response
    logger.debug(`--- RAW AI SYNTHESIS RESPONSE ---`);
    logger.debug(responseText); // Log the full raw response
    logger.debug(`--- END RAW AI SYNTHESIS RESPONSE ---`);

    let jsonString = responseText.trim(); // Start with the raw, trimmed response

    // Look for markdown code fences and extract JSON if present
    const jsonRegex = /```(?:json)?\s*([\s\S]*?)\s*```/; // Regex to find ```json ... ``` or ``` ... ```
    const match = jsonString.match(jsonRegex);

    if (match && match[1]) {
      logger.debug("Extracted JSON content from Markdown code fence before parsing.");
      jsonString = match[1].trim(); // Use the extracted JSON content
    } else {
      logger.debug("No Markdown code fence detected, attempting to parse raw response.");
      // Proceed to parse jsonString as is.
    }

    try {
      // Try to parse the JSON response
      const jsonResponse = JSON.parse(jsonString);

      // Add timestamp and source to metadata
      if (!jsonResponse.metadata) {
        jsonResponse.metadata = {};
      }

      jsonResponse.metadata.generatedAt = new Date().toISOString();
      jsonResponse.metadata.source = "NeuroLedger Data Quality Audit";
      jsonResponse.metadata.version = "1.0";

      return jsonResponse;
    } catch (jsonError) {
      // If parsing fails, create a structured report with the raw text
      logger.warn(`Failed to parse JSON response for final report: ${jsonError.message}`);
      return {
        executiveSummary: "Error parsing the AI-generated report. The raw content is included below.",
        qualityScore: 0,
        scoreExplanation: "Could not determine due to parsing error.",
        keyFindings: [{
          issue: "AI Report Generation Error",
          impact: "Unable to properly structure the quality audit results."
        }],
        detailedAnalysis: {
          errors: [{
            title: "JSON Parsing Error",
            description: jsonError.message
          }]
        },
        recommendations: [{
          recommendation: "Contact support to review the raw report content.",
          priority: "high",
          rationale: "The AI generated invalid JSON which could not be parsed."
        }],
        metadata: {
          generatedAt: new Date().toISOString(),
          source: "NeuroLedger Data Quality Audit",
          version: "1.0",
          error: true,
          rawResponse: responseText
        }
      };
    }
  } catch (error) {
    logger.error(`Failed to generate final AI report: ${error.message}`);
    throw error;
  }
};

/**
 * Determines the overall status based on the final report
 * @param {Object} finalReport - The synthesized final report
 * @returns {string} - Overall status ('ok', 'warning', or 'error')
 */
const determineOverallStatus = (finalReport) => {
  // Default to error if report is incomplete
  if (!finalReport || !finalReport.qualityScore) {
    return 'error';
  }

  const score = finalReport.qualityScore;

  // Determine status based on score
  if (score >= 80) {
    return 'ok';
  } else if (score >= 50) {
    return 'warning';
  } else {
    return 'error';
  }
};

module.exports = {
  initiateQualityAudit,
  workerHandler,
  performFullAudit,
  analyzeProgrammatically,
  performAiInterpretations,
  generateAiFinalReport,
  determineOverallStatus
};