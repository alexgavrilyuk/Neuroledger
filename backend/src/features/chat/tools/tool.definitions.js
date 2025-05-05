// backend/src/features/chat/tools/tool.definitions.js
/**
 * Defines the structure and description of tools available to the LLM agent.
 */
const toolDefinitions = [
    // Dataset Interaction Tools
    {
        name: 'list_datasets',
        description: 'Lists all available datasets for the user or team, providing their names and IDs. Use this first if the user asks about datasets generally or doesn\'t specify one.',
        output: 'On success, returns an object with status: success and result: an array of dataset objects (including _id, name, description, columnCount, isTeamDataset, teamName). On failure, returns an object with status: error and an error message.'
    },
    {
        name: 'get_dataset_schema',
        description: 'Retrieves the schema (column names, types, descriptions) and general description for a specific dataset ID. Essential before generating analysis code.',
        output: 'On success, returns an object with status: success and result: an object containing schemaInfo array, columnDescriptions map, dataset description string, and optionally rowCount. On failure, returns an object with status: error, an error message, and an errorCode.'
    },
    {
        name: 'parse_csv_data',
        // MODIFIED Description:
        description: 'Checks if the data for a specific dataset ID has been successfully processed and is ready for analysis. Returns an error if processing is ongoing or failed. This step is implicitly required before analysis, but you usually do not need to call it directly unless checking status.',
        // MODIFIED Output:
        output: 'On success, returns an object with status: success and result: an object containing a summary message. On failure (e.g., processing, error), returns an object with status: error, an error message, and an errorCode.'
    },
    // Code Generation & Execution Tools
    {
        name: 'generate_analysis_code',
        description: 'Generates executable Node.js code to perform data analysis based on a specific goal. Requires dataset schema context (use get_dataset_schema first). The code will receive parsed data in an `inputData` variable. Example `analysis_goal`: \'Calculate the sum of the Sales column\', \'Calculate Gross Profit Margin using the Revenue and COGS columns\', \'Calculate Debt-to-Equity ratio using Total Liabilities and Total Equity columns\'. Can optionally receive error context from a previous failed execution via the `previous_error` argument.',
        output: 'On success, returns an object with status: success and result: an object containing the generated Node.js code string. On failure, returns an object with status: error, an error message, and an errorCode (e.g., CODE_GENERATION_FAILED, SCHEMA_MISSING).'
    },
    {
        name: 'execute_analysis_code',
        // MODIFIED Description (removed explicit mention of parse_csv_data requirement):
        description: 'Executes the generated Node.js analysis code in a secure sandbox using pre-processed data for the specified dataset ID. The system automatically uses the code generated in the previous step.',
        output: 'On success, returns an object with status: success and result: the JSON output from the executed code. On failure, returns an object with status: error, an error message, an errorCode (e.g., CODE_EXECUTION_FAILED, CODE_EXECUTION_TIMEOUT, PARSED_DATA_MISSING), and potentially console logs.'
    },
    {
        name: 'generate_report_code',
        description: 'Generates React component code (JSX) to visualize or report the results of a previous analysis. Use this AFTER `execute_analysis_code` has successfully returned results. Provide a summary of the results to guide the generation. Can optionally accept `title`, `chart_type`, and `columns_to_visualize` arguments for customization.',
        output: 'On success, returns an object with status: success and result: an object containing the generated React component code string. On failure, returns an object with status: error, an error message, and an errorCode (e.g., CODE_GENERATION_FAILED, MISSING_ANALYSIS_DATA).'
    },
     // Financial Ratio Tool
     {
        name: 'calculate_financial_ratios',
        // MODIFIED Description (removed explicit mention of parse_csv_data requirement):
        description: 'Calculates common financial ratios (e.g., Gross Profit Margin, Net Profit Margin, Current Ratio, Debt-to-Equity) directly from pre-processed dataset data. Provide the `dataset_id` of the processed data, an array of desired `ratios`, and the exact `column_names` required for those ratios.',
        output: 'On success, returns an object with status: success and result: an object containing calculated ratios { ratioName: value, ... }. On failure, status: error and error message with errorCode.'
    },
    // Clarification Tool
    {
        name: 'ask_user_for_clarification',
        description: 'Use this tool ONLY when you need more information from the user to proceed. Ask a specific question to resolve ambiguity or gather missing details (like column names).',
        output: 'Pauses the agent turn and sends the question to the user. Does not return a value to the agent loop directly.'
    },
    // Final Output Tool
    {
        name: '_answerUserTool',
        description: 'Provides the final text-based answer directly to the user when the request has been fully addressed and no further tool use is needed.',
        output: 'Signals the end of the agent\'s turn. Does not return a structured object, only indicates success/failure via status.'
    }
];

module.exports = { toolDefinitions };