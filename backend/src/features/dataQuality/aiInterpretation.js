// backend/src/features/dataQuality/aiInterpretation.js
const anthropic = require('../../shared/external_apis/claude.client');
const logger = require('../../shared/utils/logger');

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

module.exports = {
  performAiInterpretations,
  getColumnInsights,
  getOverallInsights
};