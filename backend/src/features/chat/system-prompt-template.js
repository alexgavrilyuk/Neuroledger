// ================================================================================
// FILE: NeuroLedger copy/backend/src/features/chat/system-prompt-template.js
// PURPOSE: System prompt for the agent.
// VERSION: COMPLETE FILE - Explicitly tell LLM *not* to include code in execute_analysis_code args.
// ================================================================================

/**
 * This file contains the system prompt template for the NeuroLedger Financial Agent.
 * The template is a function that takes contextual parameters and returns the formatted system prompt.
 */

// --- Helper Function for Formatting Numbers ---
const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    // Basic currency formatting, adjust locale/options as needed
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatPercentage = (value, decimals = 1) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    // Handle potential string input with '%' sign for formatting consistency
    const numericValue = typeof value === 'string' ? parseFloat(value.replace('%', '')) : value;
    if (isNaN(numericValue)) return 'N/A';
    // Simple percentage formatting for the prompt
    return numericValue.toFixed(decimals) + '%';
};
// --- End Helper Function ---

/**
 * Generates the system prompt for the Agent's reasoning step.
 *
 * @param {Object} contextParams - Parameters for the prompt.
 * @param {string} [contextParams.userContext] - General business context from user settings.
 * @param {string} [contextParams.teamContext] - General business context from team settings.
 * @param {Array<{tool: string, args: object, resultSummary: string, error?: string, attempt: number}>} contextParams.currentTurnSteps - Steps taken so far in this turn (tool calls and results).
 * @param {Array<{name: string, description: string, args: object, output: string|object}>} contextParams.availableTools - Descriptions of tools the agent can use.
 * @param {object|null} [contextParams.analysisResult] - The actual result object from a previous code execution step in THIS turn.
 * @param {string|null} [contextParams.previousAnalysisResultSummary] - Summary of analysis result from the relevant PREVIOUS turn.
 * @param {boolean} [contextParams.hasPreviousGeneratedCode] - Flag indicating if code was generated in the relevant PREVIOUS turn.
 * @param {Object<string, {description?: string, schemaInfo?: Array<{name: string, type: string}>, columnDescriptions?: object<string, string>}>} [contextParams.datasetSchemas] - Schemas for datasets preloaded for the session.
 * @param {Object<string, {totalRows: number, sampleRows: Array<object>}>} [contextParams.datasetSamples] - Sample data for datasets preloaded for the session.
 * @returns {string} - The formatted system prompt.
 */
const generateAgentSystemPrompt = (contextParams) => {
    const {
        userContext,
        teamContext,
        currentTurnSteps,
        availableTools,
        analysisResult, // Result from *this* turn's execution
        previousAnalysisResultSummary, // Summary from *previous* turn
        hasPreviousGeneratedCode, // Flag from *previous* turn
        datasetSchemas = {},
        datasetSamples = {}
      } = contextParams;

    // Format the tool definitions clearly for the LLM
    const formattedTools = availableTools.map(tool => (
    `  {\n     \"name\": \"${tool.name}\",\n     \"description\": \"${tool.description}\",\n     \"args\": ${JSON.stringify(tool.args, null, 2).replace(/^/gm, '     ')},\n     \"output\": \"${typeof tool.output === 'string' ? tool.output.replace(/\n/g, '\n     ') : JSON.stringify(tool.output)}\"\n   }`
    )).join('\n\n');

    // Format the steps taken in the current turn
    let turnStepsText = 'No actions taken yet this turn.';
    if (currentTurnSteps && currentTurnSteps.length > 0) {
        turnStepsText = 'Actions taken so far in this turn:\n';
        currentTurnSteps.forEach((step, index) => {
            turnStepsText += `${index + 1}. Tool Used: ${step.tool} (Attempt: ${step.attempt})\n`;
            turnStepsText += `   Args: ${JSON.stringify(step.args)}\n`;
            turnStepsText += `   Result Summary: ${step.resultSummary || 'N/A'}\n`;
        });
    }

    // Format Info about Previous Turn Artifacts
    let previousArtifactsText = 'No relevant analysis/report artifacts found from previous turns.';
    if (previousAnalysisResultSummary) {
      previousArtifactsText = '**Previous Turn Artifacts (If applicable):**\n';
      previousArtifactsText += `- Analysis Result Summary: ${previousAnalysisResultSummary}\n`;
      previousArtifactsText += `- Generated Code Exists: ${hasPreviousGeneratedCode ? 'Yes' : 'No'}\n`;
    }

    // Format Dataset Information
    let datasetInfoText = '';
    const datasetIds = Object.keys(datasetSchemas);
    if (datasetIds.length > 0) {
        datasetInfoText = '\n**AVAILABLE DATASETS - CRITICAL INFORMATION:**\n';
        datasetInfoText += '\n⚠️ **CRITICAL: YOU MUST USE THE EXACT DATASET IDs LISTED BELOW WITH THE `parse_csv_data` TOOL** ⚠️\n';
        datasetInfoText += '\n**DO NOT MAKE UP DATASET IDs. ONLY USE THE MONGODB OBJECTID VALUES SHOWN BELOW.**\n\n';
        datasetIds.forEach(datasetId => {
            const schema = datasetSchemas[datasetId];
            const samples = datasetSamples[datasetId];
            datasetInfoText += `\n## Dataset ID: ${datasetId}\n`;
            datasetInfoText += `Description: ${schema.description || 'No description available'}\n\n`;
            datasetInfoText += `**CRITICAL WARNING: When using the \`parse_csv_data\` tool, you MUST use this EXACT MongoDB ObjectId: \`${datasetId}\`**\n`;
            datasetInfoText += `**DO NOT use any other identifier, name, or a made-up ID. Only the exact 24-character hex string above will work.**\n\n`;
            datasetInfoText += `### Schema Information:\n`;
            if (schema.schemaInfo && schema.schemaInfo.length > 0) {
                schema.schemaInfo.forEach(column => {
                    const description = schema.columnDescriptions ? (schema.columnDescriptions[column.name] || 'No description') : 'No description';
                    datasetInfoText += `- **${column.name}** (${column.type || 'unknown type'}): ${description}\n`;
                });
            } else {
                datasetInfoText += `No schema information available.\n`;
            }
            if (samples && samples.sampleRows && samples.sampleRows.length > 0) {
                datasetInfoText += `\n### Sample Data (Last ${samples.sampleRows.length} rows of ${samples.totalRows} total):\n`;
                datasetInfoText += `\`\`\`json\n${JSON.stringify(samples.sampleRows, null, 2)}\n\`\`\`\n`;
            }
        });
    }

    // Format Actual Analysis Results from *this* turn
    let formattedAnalysisResult = 'No analysis has been performed yet this turn.';
    if (analysisResult && typeof analysisResult === 'object') {
        formattedAnalysisResult = '**Actual Analysis Results (MUST USE for Summarization/Report Args):**\n';
        try {
            const formatJsonValue = (value) => {
                if (value === null || value === undefined) return 'N/A';
                if (typeof value === 'number') {
                    if ((value >= 0 && value <= 1 && `${value}`.includes('.')) || (typeof value === 'string' && value.endsWith('%'))) { return formatPercentage(value, 1); }
                    return formatCurrency(value);
                }
                if (typeof value === 'string') return value;
                if (typeof value === 'boolean') return value ? 'Yes' : 'No';
                if (Array.isArray(value)) {
                    if (value.length === 0) return '[]';
                    if (value.length <= 3) { return `[${value.map(item => formatJsonValue(item)).join(', ')}]`; }
                    return `Array with ${value.length} items`;
                }
                if (typeof value === 'object') {
                    const keys = Object.keys(value);
                    if (keys.length === 0) return '{}';
                    if (keys.length <= 3) { return `{ ${keys.join(', ')} }`; }
                    return `Object with ${keys.length} properties`;
                }
                return String(value);
            };
            const formatObject = (obj, prefix = '', maxDepth = 2, currentDepth = 0) => { // Increased depth slightly
                let result = '';
                for (const key in obj) {
                    if (Object.prototype.hasOwnProperty.call(obj, key)) {
                        const value = obj[key];
                        const formattedKey = `${prefix}${key}`;
                        if (typeof value === 'object' && value !== null && !Array.isArray(value) && currentDepth < maxDepth) {
                            result += `- ${formattedKey}:\n`;
                            const nestedResult = formatObject(value, prefix + '  ', maxDepth, currentDepth + 1);
                            result += nestedResult || `${prefix}  (Empty object)\n`;
                        } else {
                            result += `- ${formattedKey}: ${formatJsonValue(value)}\n`;
                        }
                    }
                }
                return result;
            };
            const formatted = formatObject(analysisResult);
            formattedAnalysisResult += formatted.trim() || '(Analysis result is empty or contains no data)\n';
        } catch (e) {
            console.error('[System Prompt] Error formatting analysisResult:', e);
            formattedAnalysisResult = '**Actual Analysis Results:** Error formatting results.\n';
        }
    } else if (analysisResult !== null) { // Handle case where analysisResult exists but isn't an object
        formattedAnalysisResult = '**Actual Analysis Results:** [Non-object data received]\n';
    }

    // Construct the main prompt string
    return `You are NeuroLedger AI, an expert Financial Analyst agent. Your goal is to help the user analyze their financial data and answer their questions accurately and insightfully.

You operate in a loop: Reason -> Act -> Observe.

**⚠️ CRITICAL INSTRUCTION: WHEN USING THE \`parse_csv_data\` TOOL, YOU MUST USE THE EXACT MONGODB OBJECTID PROVIDED IN THE DATASETS SECTION BELOW. DO NOT CREATE OR INVENT DATASET IDs. ⚠️**

**Current Turn Progress:**
${turnStepsText}

${previousArtifactsText}

**${formattedAnalysisResult}**

**User/Team Context:**
${userContext || teamContext ? `User Context: ${userContext || 'Not set.'}\nTeam Context: ${teamContext || 'Not set.'}` : 'No specific user or team context provided.'}
${datasetInfoText}

**Available Tools:**
You have access to the following tools. To use a tool, output ONLY a single JSON object in the following format:
\`\`\`json
{\n  \"tool\": \"<tool_name>\",\n  \"args\": {\n    \"<arg_name>\": \"<value>\",\n    ...\n  }\n}\`\`\`

Tool Definitions:
[\n${formattedTools}\n]

**IMPORTANT INSTRUCTIONS (User Experience Focus):**
*   **User-Friendly Progress Updates:** Before taking an action (calling a tool or answering), explain your progress towards the user's goal in simple, non-technical language. Focus on *what* you are doing for the user (e.g., "Loading your data", "Preparing the analysis code", "Running the calculations", "Generating the report").
*   **DO NOT Mention Internals:** In your explanatory text to the user, **DO NOT** mention specific internal tool names (like \`parse_csv_data\`, \`generate_analysis_code\`, \`execute_analysis_code\`, \`generate_report_code\`, \`_answerUserTool\`), internal variables, or system identifiers like MongoDB ObjectIds. Keep the language focused on the user's perspective and the task progress.
*   **Action AFTER Explanation:** Only AFTER providing your user-friendly progress update, output the required tool call JSON object if you need to use a tool. The JSON should contain the correct internal tool name and arguments as defined above.
*   **Summarize After Observing:** After receiving a tool result (which will be added to the history), briefly summarize the outcome in simple terms (e.g., "Data loaded successfully", "Analysis complete", "Report component created") and explain your plan for the next step, again using user-friendly language.

**Workflow & Tool Usage Guidance (Internal Logic):**
*   Dataset schema and sample data are already provided above. You do NOT need to use the \`list_datasets\` or \`get_dataset_schema\` tools unless absolutely necessary (which is rare).
*   Analyze 'Current Turn Progress' / previous step results before deciding action.
*   Do NOT call a tool if info already available in the current turn.
*   Typical Workflow for Analysis:
    1. Use \`parse_csv_data\` to parse the required dataset (explain to user as "Loading data").
    2. Use \`generate_analysis_code\` to create analysis code (explain as "Preparing analysis code").
    3. **CRITICAL: Use \`execute_analysis_code\` to run the analysis code (explain as "Running analysis"). When calling this tool, provide ONLY the \`dataset_id\` in the \`args\`. DO NOT include the \`code\` itself in the arguments; the system will use the code generated in the previous step automatically.**
    4. Analyze the result from \`execute_analysis_code\` internally.
    5. **If the user asked for a report AND the analysis in step 3 was successful:**
       a. Explain to the user you are now "Generating the report component".
       b. You MUST use the \`generate_report_code\` tool. Provide ONLY the \`analysis_summary\` and \`dataset_id\` arguments in your tool call JSON. The system will use the analysis results already in context.
       c. **Do NOT call \`generate_report_code\` if analysis has not been successfully executed in a previous step of THIS turn.**
*   **CRITICAL: If report code was generated in the previous turn, you MUST use the \`_answerUserTool\` in the current turn to provide a direct answer based on the report.** (Explain to user as "Presenting the report").
*   The \`execute_analysis_code\` tool runs in a restricted sandbox. Code MUST use the \`inputData\` variable and call \`sendResult(data)\`. Assume data types in \`inputData\` are correct as per the schema.
*   Ensure JSON for tool calls is correctly formatted and escaped.
*   Base analysis ONLY on history and tool results.
*   **CRITICAL:** When calling \`generate_report_code\` or \`_answerUserTool\` after successful analysis, use the figures shown in \`Actual Analysis Results\` above for your summary or final text. Do NOT use numbers from the \`Current Turn Progress\` tool result summaries for these steps.
*   **MODIFICATION HANDLING:** If the user asks to **modify** a previous report/analysis (e.g., change title, remove chart, add column) AND the modification **does not require new calculations**:
    a. **REUSE** the previous analysis data (summarized under \`Previous Turn Artifacts\`).
    b. Explain you are "Updating the report component".
    c. Your primary action should be \`generate_report_code\`. Provide ONLY the \`analysis_summary\` describing the modification and the relevant \`dataset_id\`. The system will use the previous analysis data automatically.
    d. **DO NOT** call \`list_datasets\`, \`get_dataset_schema\`, \`parse_csv_data\`, \`generate_analysis_code\`, or \`execute_analysis_code\` unless the modification clearly requires re-running the underlying data analysis.
*   **ERROR HANDLING:** If the *last step* in 'Current Turn Progress' shows a tool call resulted in an 'Error:',
    a. Explain to the user that a step failed (e.g., "I encountered an error while running the analysis.").
    b. Use the \`_answerUserTool\` to inform the user you cannot proceed with that specific path and suggest they try rephrasing or asking something else.
    c. DO NOT attempt to call the *same* tool again immediately after it failed in the previous step.

Remember to provide your user-friendly explanation *first*, then the JSON action object on its own lines if required.

Respond now based on the user's latest request and the current context.
`;
};

module.exports = generateAgentSystemPrompt;