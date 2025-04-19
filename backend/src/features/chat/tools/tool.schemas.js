// ================================================================================
// FILE: backend/src/features/chat/tools/tool.schemas.js
// PURPOSE: Defines Ajv JSON Schemas for validating arguments passed to agent tools.
// NEW FILE (Phase 2)
// ================================================================================

const MONGODB_OBJECTID_PATTERN = '^[a-f\\d]{24}$'; // Regex pattern for MongoDB ObjectId

/**
 * Schema for arguments of the `list_datasets` tool.
 * Currently takes no arguments.
 */
const listDatasetsArgsSchema = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
};

/**
 * Schema for arguments of the `get_dataset_schema` tool.
 */
const getDatasetSchemaArgsSchema = {
  type: 'object',
  properties: {
    dataset_id: {
      type: 'string',
      description: 'The MongoDB ObjectId of the dataset to get the schema for.',
      pattern: MONGODB_OBJECTID_PATTERN,
    },
  },
  required: ['dataset_id'],
  additionalProperties: false,
};

/**
 * Schema for arguments of the `parse_csv_data` tool.
 */
const parseCsvDataArgsSchema = {
  type: 'object',
  properties: {
    dataset_id: {
      type: 'string',
      description: 'The MongoDB ObjectId of the dataset containing the CSV data to parse.',
      pattern: MONGODB_OBJECTID_PATTERN,
    },
  },
  required: ['dataset_id'],
  additionalProperties: false,
};

/**
 * Schema for arguments of the `generate_analysis_code` tool.
 */
const generateAnalysisCodeArgsSchema = {
  type: 'object',
  properties: {
    analysis_goal: {
      type: 'string',
      description: 'A detailed description of the analysis goal the generated code should achieve.',
      minLength: 5, // Ensure goal is somewhat descriptive
    },
    dataset_id: {
      type: 'string',
      description: 'The MongoDB ObjectId of the dataset being analyzed (used for context).',
      pattern: MONGODB_OBJECTID_PATTERN,
    },
  },
  required: ['analysis_goal', 'dataset_id'],
  additionalProperties: false,
};

/**
 * Schema for arguments of the `execute_analysis_code` tool.
 * Note: The `code` argument might be optional if the system substitutes it from context.
 * However, we define it here as potentially coming from the LLM.
 */
const executeAnalysisCodeArgsSchema = {
  type: 'object',
  properties: {
    code: {
      type: 'string',
      description: '(Optional if generated in previous step) The Javascript code to execute.',
      // minLength: 10 // Basic check for non-empty code
    },
    dataset_id: {
      type: 'string',
      description: 'The MongoDB ObjectId of the dataset whose parsed data should be injected.',
      pattern: MONGODB_OBJECTID_PATTERN,
    },
  },
  required: ['dataset_id'], // Code might be substituted, dataset_id is always needed
  additionalProperties: false,
};

/**
 * Schema for arguments of the `generate_report_code` tool.
 */
const generateReportCodeArgsSchema = {
  type: 'object',
  properties: {
    analysis_summary: {
      type: 'string',
      description: 'A summary of the analysis goal and key results to guide report generation.',
      minLength: 5,
    },
    dataset_id: {
      type: 'string',
      description: 'The MongoDB ObjectId of the dataset related to the analysis (provides context).',
      pattern: MONGODB_OBJECTID_PATTERN,
    },
  },
  required: ['analysis_summary', 'dataset_id'],
  additionalProperties: false,
};

/**
 * Schema for arguments of the `_answerUserTool` tool.
 */
const answerUserToolArgsSchema = {
  type: 'object',
  properties: {
    textResponse: {
      type: 'string',
      description: 'The final textual response for the user.',
      minLength: 1,
    },
  },
  required: ['textResponse'],
  additionalProperties: false,
};

// Export all schemas
module.exports = {
  listDatasetsArgsSchema,
  getDatasetSchemaArgsSchema,
  parseCsvDataArgsSchema,
  generateAnalysisCodeArgsSchema,
  executeAnalysisCodeArgsSchema,
  generateReportCodeArgsSchema,
  answerUserToolArgsSchema,
};