/**
 * @fileoverview Defines the tools available to the AI agent.
 * This configuration array is passed to the LLM to inform it of its capabilities.
 * Each tool object specifies its name, description, expected arguments, and output format.
 * The descriptions should be clear and concise for the LLM to understand the tool's purpose.
 */

/**
 * Defines the structure and description of tools available to the LLM agent.
 * This array is used to inform the LLM about the capabilities it can request.
 */
const toolDefinitions = [
    // Dataset Interaction Tools
    {
        name: 'list_datasets',
        description: 'Lists all available datasets for the user or team, providing their names and IDs. Use this first if the user asks about datasets generally or doesn\'t specify one.',
        args: {},
        output: 'On success, returns an object with status: success and result: an array of dataset objects (including _id, name, description, rowCount, columnCount). On failure, returns an object with status: error and an error message.'
    },
    {
        name: 'get_dataset_schema',
        description: 'Retrieves the schema (column names, types, descriptions) for a specific dataset ID. Essential before generating analysis code.',
        args: {
            dataset_id: 'string' // The MongoDB ObjectId of the dataset.
        },
        output: 'On success, returns an object with status: success and result: an object containing schemaInfo array and rowCount. On failure, returns an object with status: error and an error message.'
    },
    {
        name: 'parse_csv_data',
        description: 'Parses the raw CSV content of a specific dataset by its ID using PapaParse. This makes the data available for analysis code execution.',
        args: {
            dataset_id: 'string' // The MongoDB ObjectId of the dataset.
        },
        output: 'On success, returns an object with status: success and result: an object containing the rowCount of parsed data. On failure, returns an object with status: error and an error message.'
    },

    // Code Generation & Execution Tools
    {
        name: 'generate_analysis_code',
        description: 'Generates executable Node.js code to perform data analysis based on a specific goal. Requires dataset schema context (use get_dataset_schema first). The code will receive parsed data in an `inputData` variable.',
        args: {
            analysis_goal: 'string', // Detailed description of the analysis needed.
            dataset_id: 'string' // ID of the dataset being analyzed (for context).
        },
        output: 'On success, returns an object with status: success and result: an object containing the generated Node.js code string. On failure, returns an object with status: error and an error message.'
    },
    {
        name: 'execute_analysis_code',
        description: 'Executes the provided Node.js analysis code in a secure sandbox. Requires `parse_csv_data` to have been successfully called for the relevant dataset first. The code MUST expect data in an `inputData` array variable and return a JSON object.',
        args: {
            code: 'string', // The generated Node.js code to execute.
            dataset_id: 'string' // The ID of the dataset whose parsed data should be injected.
        },
        output: 'On success, returns an object with status: success and result: the JSON output from the executed code. On failure, returns an object with status: error, an error message, and potentially console logs.'
    },
    {
        name: 'generate_report_code',
        description: 'Generates React component code (JSX) to visualize or report the results of a previous analysis. Use this AFTER `execute_analysis_code` has successfully returned results.',
        args: {
            analysis_summary: 'string', // A summary of the analysis goal and results to guide report generation.
            dataset_id: 'string' // ID of the dataset related to the analysis (for context).
        },
        output: 'On success, returns an object with status: success and result: an object containing the generated React component code string. On failure, returns an object with status: error and an error message.'
    },

    // Final Output Tool
    {
        name: '_answerUserTool',
        description: 'Provides the final text-based answer directly to the user when the request has been fully addressed and no further tool use is needed.',
        args: {
            textResponse: 'string' // The final textual response for the user.
        },
        output: 'Signals the end of the agent\'s turn. Does not return a structured object.'
    }
];

module.exports = { toolDefinitions }; 