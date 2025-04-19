// backend/src/features/chat/tools/tool.schemas.js
// ENTIRE FILE - PHASE 6 & 7

const MONGODB_OBJECTID_PATTERN = '^[a-f\\d]{24}$'; // Regex pattern for MongoDB ObjectId

/**
 * Schema for arguments of the `list_datasets` tool.
 * Takes no arguments.
 */
const listDatasetsArgsSchema = {
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
  description: "Arguments for listing available datasets.", // Optional description for schema itself
};

/**
 * Schema for arguments of the `get_dataset_schema` tool.
 */
const getDatasetSchemaArgsSchema = {
  type: 'object',
  properties: {
    dataset_id: {
      type: 'string',
      description: 'The MongoDB ObjectId (24 hex characters) of the dataset to get the schema for.',
      pattern: MONGODB_OBJECTID_PATTERN,
    },
  },
  required: ['dataset_id'],
  additionalProperties: false,
  description: "Arguments for retrieving a dataset's schema.",
};

/**
 * Schema for arguments of the `parse_csv_data` tool.
 */
const parseCsvDataArgsSchema = {
  type: 'object',
  properties: {
    dataset_id: {
      type: 'string',
      description: 'The MongoDB ObjectId of the dataset containing the CSV/Excel data to parse.',
      pattern: MONGODB_OBJECTID_PATTERN,
    },
  },
  required: ['dataset_id'],
  additionalProperties: false,
  description: "Arguments for parsing data from a specified dataset.",
};

/**
 * Schema for arguments of the `generate_analysis_code` tool.
 * Includes optional 'previous_error' for refinement (Phase 8 prep).
 */
const generateAnalysisCodeArgsSchema = {
  type: 'object',
  properties: {
    analysis_goal: {
      type: 'string',
      description: 'A detailed description of the analysis goal the generated code should achieve.',
      minLength: 5,
    },
    dataset_id: {
      type: 'string',
      description: 'The MongoDB ObjectId of the dataset being analyzed (used for schema context).',
      pattern: MONGODB_OBJECTID_PATTERN,
    },
    previous_error: {
        type: 'string',
        description: 'Optional. If provided, this contains the error message from the previous failed execution attempt. Use this error context to fix the code.',
        nullable: true // Allow null or omission
    }
  },
  required: ['analysis_goal', 'dataset_id'],
  additionalProperties: false,
  description: "Arguments for generating Javascript analysis code.",
};

/**
 * Schema for arguments of the `execute_analysis_code` tool.
 * 'code' is typically substituted by the AgentRunner, so not required from LLM.
 */
const executeAnalysisCodeArgsSchema = {
  type: 'object',
  properties: {
    dataset_id: {
      type: 'string',
      description: 'The MongoDB ObjectId of the dataset whose parsed data should be injected.',
      pattern: MONGODB_OBJECTID_PATTERN,
    },
  },
  required: ['dataset_id'],
  additionalProperties: false,
  description: "Arguments for executing generated analysis code.",
};

/**
 * Schema for arguments of the `generate_report_code` tool.
 * Includes optional args for customization (Phase 10 prep).
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
    title: {
        type: 'string',
        description: 'Optional: A title for the report component.',
        nullable: true
    },
    chart_type: {
        type: 'string',
        description: 'Optional: Preferred Recharts chart type (e.g., "LineChart", "BarChart", "PieChart", "Table").',
        enum: ["LineChart", "BarChart", "PieChart", "ComposedChart", "AreaChart", "Table", null], // Allow null
        nullable: true
    },
    columns_to_visualize: {
        type: 'array',
        description: 'Optional: Specific column names from the analysis result to focus on in the visualization.',
        items: { type: 'string' },
        nullable: true
    }
  },
  required: ['analysis_summary', 'dataset_id'],
  additionalProperties: false,
  description: "Arguments for generating a React visualization component.",
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
  description: "Arguments for providing the final text answer.",
};

/**
 * Schema for arguments of the `ask_user_for_clarification` tool (Phase 9 prep).
 */
const askUserForClarificationArgsSchema = {
    type: 'object',
    properties: {
        question: {
            type: 'string',
            description: 'The specific question to ask the user to resolve ambiguity.',
            minLength: 5,
        }
    },
    required: ['question'],
    additionalProperties: false,
    description: "Arguments for asking the user a clarifying question.",
};

/**
 * PHASE 7: Schema for arguments of the `calculate_financial_ratios` tool.
 */
const calculateFinancialRatiosArgsSchema = {
  type: 'object',
  properties: {
    dataset_id: {
      type: 'string',
      description: 'The MongoDB ObjectId (24 hex characters) of the *parsed* dataset containing the financial data.',
      pattern: MONGODB_OBJECTID_PATTERN
    },
    ratios: {
      type: 'array',
      description: 'An array of strings specifying which ratios to calculate. Supported: "Gross Profit Margin", "Net Profit Margin", "Current Ratio", "Debt-to-Equity".',
      items: {
        type: 'string',
        enum: ["Gross Profit Margin", "Net Profit Margin", "Current Ratio", "Debt-to-Equity"]
      },
      minItems: 1,
      uniqueItems: true
    },
    // Column name arguments - these are required IF the corresponding ratio is requested.
    // Validation of this dependency happens inside the tool logic itself.
    revenue_column: {
        type: 'string',
        description: 'Required if calculating profit margins. Exact column name for Total Revenue/Sales.',
        nullable: true // Allow omission if not needed for requested ratios
    },
    cogs_column: {
        type: 'string',
        description: 'Required if calculating Gross Profit Margin. Exact column name for Cost of Goods Sold.',
        nullable: true
    },
    net_income_column: {
        type: 'string',
        description: 'Required if calculating Net Profit Margin. Exact column name for Net Income.',
        nullable: true
    },
    current_assets_column: {
        type: 'string',
        description: 'Required if calculating Current Ratio. Exact column name for Current Assets.',
        nullable: true
    },
    current_liabilities_column: {
        type: 'string',
        description: 'Required if calculating Current Ratio. Exact column name for Current Liabilities.',
        nullable: true
    },
    total_debt_column: {
        type: 'string',
        description: 'Required if calculating Debt-to-Equity. Exact column name for Total Debt (or Total Liabilities).',
        nullable: true
    },
    total_equity_column: {
        type: 'string',
        description: 'Required if calculating Debt-to-Equity. Exact column name for Total Shareholders Equity.',
        nullable: true
    }
  },
  required: ['dataset_id', 'ratios'], // Core requirements
  additionalProperties: false, // Disallow unexpected arguments
  description: "Arguments for calculating financial ratios from parsed data."
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
  askUserForClarificationArgsSchema,
  calculateFinancialRatiosArgsSchema, // PHASE 7: Export new schema
};