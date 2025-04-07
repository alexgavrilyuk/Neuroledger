// backend/src/features/dataQuality/reportGeneration.js
const anthropic = require('../../shared/external_apis/claude.client');
const logger = require('../../shared/utils/logger');

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
  generateAiFinalReport,
  determineOverallStatus
};