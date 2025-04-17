// ================================================================================
// FILE: NeuroLedger copy/backend/src/features/chat/agent/SystemPromptBuilder.js
// PURPOSE: Builds the dynamic system prompt for the agent's reasoning step.
// NEW FILE (Phase 4)
// ================================================================================

const { toolDefinitions } = require('../tools/tool.definitions'); // Import tool definitions

/**
 * Helper function to format currency values for the prompt.
 * @param {number | string | null | undefined} value - The value to format.
 * @returns {string} Formatted currency string or 'N/A'.
 */
const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

/**
 * Helper function to format percentage values for the prompt.
 * @param {number | string | null | undefined} value - The value to format.
 * @param {number} [decimals=1] - Number of decimal places.
 * @returns {string} Formatted percentage string or 'N/A'.
 */
const formatPercentage = (value, decimals = 1) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    const numericValue = typeof value === 'string' ? parseFloat(value.replace('%', '')) : value;
    if (isNaN(numericValue)) return 'N/A';
    return numericValue.toFixed(decimals) + '%';
};

/**
 * Recursively formats a JSON-like object into a human-readable string for the LLM context,
 * summarizing nested structures beyond a certain depth.
 * @param {any} obj - The object or value to format.
 * @param {string} [prefix=''] - Indentation prefix for nested levels.
 * @param {number} [maxDepth=2] - Maximum depth to fully expand objects/arrays.
 * @param {number} [currentDepth=0] - Current recursion depth.
 * @returns {string} A formatted string representation.
 */
const formatAnalysisObject = (obj, prefix = '', maxDepth = 2, currentDepth = 0) => {
    let result = '';
    if (typeof obj !== 'object' || obj === null) {
        // Should not happen for top-level call, but handle defensively
        return `${prefix}${formatJsonValue(obj)}\n`;
    }

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            const formattedKey = `${prefix}- ${key}:`; // Indent with prefix

            if (typeof value === 'object' && value !== null && !Array.isArray(value) && currentDepth < maxDepth) {
                // Recurse for nested objects
                const nestedResult = formatAnalysisObject(value, prefix + '  ', maxDepth, currentDepth + 1);
                if (nestedResult.trim()) {
                     result += `${formattedKey}\n${nestedResult}`;
                } else {
                    result += `${formattedKey} {}\n`; // Show empty object
                }
            } else if (Array.isArray(value) && currentDepth < maxDepth && value.length > 0 && typeof value[0] === 'object') {
                 // Summarize arrays of objects beyond depth 0
                 result += `${formattedKey} [Array of ${value.length} objects, first item keys: ${Object.keys(value[0]).join(', ')}]\n`;
            }
            else {
                // Format primitive values or summarized structures
                result += `${formattedKey} ${formatJsonValue(value)}\n`;
            }
        }
    }
    return result;
};

/**
 * Helper to format individual JSON values appropriately (currency, percentage, etc.).
 * Used by `formatAnalysisObject`.
 * @param {any} value - The value to format.
 * @returns {string} Formatted string representation.
 */
const formatJsonValue = (value) => {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') {
        if ((value >= 0 && value <= 1 && `${value}`.includes('.')) || (typeof value === 'string' && value.endsWith('%'))) { return formatPercentage(value, 1); }
        return formatCurrency(value);
    }
    if (typeof value === 'string') return `"${value}"`; // Add quotes for clarity
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        if (value.length <= 5) { return `[${value.map(item => formatJsonValue(item)).join(', ')}]`; } // Show more items
        return `[Array with ${value.length} items]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return '{}';
        if (keys.length <= 5) { return `{ ${keys.join(', ')} }`; } // Show more keys
        return `Object with ${keys.length} properties`;
    }
    return String(value);
};


/**
 * Builds the system prompt for the Agent's reasoning LLM call by assembling
 * various context sections.
 */
class SystemPromptBuilder {
    /**
     * Builds the complete system prompt string.
     * @param {object} context - The context object containing all necessary data.
     *                           Expected shape matches `AgentStateManager.getContextForLLM()`.
     * @returns {string} The fully assembled system prompt string.
     */
    build(context) {
        const parts = [
            this._buildIntroduction(),
            this._buildCriticalWarnings(),
            this._buildCurrentProgress(context.currentTurnSteps),
            this._buildPreviousArtifacts(context.previousAnalysisResultSummary, context.hasPreviousGeneratedCode),
            this._buildAnalysisResult(context.analysisResult),
            this._buildUserTeamContext(context.userContext, context.teamContext),
            this._buildDatasetInfo(context.datasetSchemas, context.datasetSamples),
            this._buildToolDefinitions(),
            this._buildCoreInstructions(),
            this._buildWorkflowGuidance(),
            this._buildModificationHandling(),
            this._buildErrorHandling(),
            this._buildFinalInstruction()
        ];
        // Join non-empty sections with double newlines for clear separation
        return parts.filter(Boolean).join('\n\n');
    }

    // --- Private Helper Methods for Building Sections ---

    _buildIntroduction() {
        return "You are NeuroLedger AI, an expert Financial Analyst agent. Your goal is to help the user analyze their financial data and answer their questions accurately and insightfully.";
    }

    _buildCriticalWarnings() {
        return "You operate in a loop: Reason -> Act -> Observe.\n\n**⚠️ CRITICAL INSTRUCTION: WHEN USING THE `parse_csv_data` TOOL, YOU MUST USE THE EXACT MONGODB OBJECTID PROVIDED IN THE DATASETS SECTION BELOW. DO NOT CREATE OR INVENT DATASET IDs. ⚠️**";
    }

    _buildCurrentProgress(steps = []) {
        if (!steps || steps.length === 0) {
            return '**Current Turn Progress:**\nNo actions taken yet this turn.';
        }
        let text = '**Current Turn Progress:**\nActions taken so far in this turn:\n';
        steps.forEach((step, index) => {
            text += `${index + 1}. Tool Used: ${step.tool} (Attempt: ${step.attempt})\n`;
            // Limit args display length for prompt clarity
            const argsString = JSON.stringify(step.args);
            const truncatedArgs = argsString.substring(0, 150) + (argsString.length > 150 ? '...' : '');
            text += `   Args: ${truncatedArgs}\n`;
            text += `   Result Summary: ${step.resultSummary || 'N/A'}\n`;
        });
        return text;
    }

    _buildPreviousArtifacts(summary, hasCode) {
        if (!summary && !hasCode) {
             return ''; // Return empty string if no previous artifacts
        }
        let text = '**Previous Turn Artifacts (If applicable):**\n';
        text += `- Analysis Result Summary: ${summary || 'None available'}\n`;
        text += `- Generated Code Exists: ${hasCode ? 'Yes' : 'No'}\n`;
        return text;
    }

    _buildAnalysisResult(analysisResult) {
        if (!analysisResult) {
            return '**Actual Analysis Results:**\nNo analysis has been performed yet this turn.';
        }
        if (typeof analysisResult !== 'object') {
             return '**Actual Analysis Results:**\n[Non-object data received from analysis]';
        }
        try {
            const formatted = formatAnalysisObject(analysisResult);
            if (!formatted.trim()) {
                 return '**Actual Analysis Results (MUST USE for Summarization/Report Args):**\n(Analysis result is empty or contains no data)';
            }
            return `**Actual Analysis Results (MUST USE for Summarization/Report Args):**\n${formatted}`;
        } catch (e) {
            console.error('[SystemPromptBuilder] Error formatting analysisResult:', e);
            return '**Actual Analysis Results:**\nError formatting results for display.';
        }
    }

    _buildUserTeamContext(userCtx, teamCtx) {
        if (!userCtx && !teamCtx) {
            return '**User/Team Context:**\nNo specific user or team context provided.';
        }
        return `**User/Team Context:**\nUser Context: ${userCtx || 'Not set.'}\nTeam Context: ${teamCtx || 'Not set.'}`;
    }

    _buildDatasetInfo(schemas = {}, samples = {}) {
        const datasetIds = Object.keys(schemas);
        if (datasetIds.length === 0) {
            return ''; // No dataset info if none are loaded
        }

        let text = '**AVAILABLE DATASETS - CRITICAL INFORMATION:**\n';
        text += '\n⚠️ **CRITICAL: YOU MUST USE THE EXACT DATASET IDs LISTED BELOW WITH THE `parse_csv_data` TOOL** ⚠️\n';
        text += '\n**DO NOT MAKE UP DATASET IDs. ONLY USE THE MONGODB OBJECTID VALUES SHOWN BELOW.**\n';

        datasetIds.forEach(datasetId => {
            const schema = schemas[datasetId] || {};
            const sample = samples[datasetId];
            text += `\n## Dataset ID: ${datasetId}\n`;
            text += `Description: ${schema.description || 'No description available'}\n\n`;
            text += `**CRITICAL WARNING: When using the \`parse_csv_data\` tool, you MUST use this EXACT MongoDB ObjectId: \`${datasetId}\`**\n`;
            text += `**DO NOT use any other identifier, name, or a made-up ID. Only the exact 24-character hex string above will work.**\n\n`;
            text += `### Schema Information:\n`;
            if (schema.schemaInfo && schema.schemaInfo.length > 0) {
                schema.schemaInfo.forEach(column => {
                    const colDesc = schema.columnDescriptions?.[column.name] || 'No description';
                    text += `- **${column.name}** (${column.type || 'unknown'}): ${colDesc}\n`;
                });
            } else {
                text += `No schema information available.\n`;
            }
            if (sample && sample.sampleRows && sample.sampleRows.length > 0) {
                text += `\n### Sample Data (Last ${sample.sampleRows.length} rows of ${sample.totalRows} total):\n`;
                // Limit sample display size in prompt
                const sampleString = JSON.stringify(sample.sampleRows, null, 2);
                const truncatedSample = sampleString.substring(0, 1000) + (sampleString.length > 1000 ? '\n...' : '');
                text += `\`\`\`json\n${truncatedSample}\n\`\`\`\n`;
            }
        });
        return text;
    }

    _buildToolDefinitions() {
        const formattedTools = toolDefinitions.map(tool => (
            `  {\n     \"name\": \"${tool.name}\",\n     \"description\": \"${tool.description}\",\n     \"args\": ${JSON.stringify(tool.args, null, 2).replace(/^/gm, '     ')},\n     \"output\": \"${typeof tool.output === 'string' ? tool.output.replace(/\n/g, '\n     ') : JSON.stringify(tool.output)}\"\n   }`
        )).join('\n\n');

        return `**Available Tools:**\nYou have access to the following tools. To use a tool, output ONLY a single JSON object in the following format:\n\`\`\`json\n{\n  \"tool\": \"<tool_name>\",\n  \"args\": {\n    \"<arg_name>\": \"<value>\",\n    ...\n  }\n}\`\`\`\n\nTool Definitions:\n[\n${formattedTools}\n]`;
    }

    _buildCoreInstructions() {
        return `**IMPORTANT INSTRUCTIONS (User Experience Focus):**
*   **User-Friendly Progress Updates:** Before taking an action (calling a tool or answering), explain your progress towards the user's goal in simple, non-technical language. Focus on *what* you are doing for the user (e.g., "Loading your data", "Preparing the analysis code", "Running the calculations", "Generating the report").
*   **DO NOT Mention Internals:** In your explanatory text to the user, **DO NOT** mention specific internal tool names (like \`parse_csv_data\`, \`generate_analysis_code\`, \`execute_analysis_code\`, \`generate_report_code\`, \`_answerUserTool\`), internal variables, or system identifiers like MongoDB ObjectIds. Keep the language focused on the user's perspective and the task progress.
*   **Action AFTER Explanation:** Only AFTER providing your user-friendly progress update, output the required tool call JSON object if you need to use a tool. The JSON should contain the correct internal tool name and arguments as defined above.
*   **Summarize After Observing:** After receiving a tool result (which will be added to the history), briefly summarize the outcome in simple terms (e.g., "Data loaded successfully", "Analysis complete", "Report component created") and explain your plan for the next step, again using user-friendly language.`;
    }

    _buildWorkflowGuidance() {
        return `**Workflow & Tool Usage Guidance (Internal Logic):**
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
*   **CRITICAL:** When calling \`generate_report_code\` or \`_answerUserTool\` after successful analysis, use the figures shown in \`Actual Analysis Results\` above for your summary or final text. Do NOT use numbers from the \`Current Turn Progress\` tool result summaries for these steps.`;
    }

    _buildModificationHandling() {
        return `**MODIFICATION HANDLING:** If the user asks to **modify** a previous report/analysis (e.g., change title, remove chart, add column) AND the modification **does not require new calculations**:
    a. **REUSE** the previous analysis data (summarized under \`Previous Turn Artifacts\`).
    b. Explain you are "Updating the report component".
    c. Your primary action should be \`generate_report_code\`. Provide ONLY the \`analysis_summary\` describing the modification and the relevant \`dataset_id\`. The system will use the previous analysis data automatically.
    d. **DO NOT** call \`list_datasets\`, \`get_dataset_schema\`, \`parse_csv_data\`, \`generate_analysis_code\`, or \`execute_analysis_code\` unless the modification clearly requires re-running the underlying data analysis.`;
    }

     _buildErrorHandling() {
         return `**ERROR HANDLING:** If the *last step* in 'Current Turn Progress' shows a tool call resulted in an 'Error:',
    a. Explain to the user that a step failed (e.g., "I encountered an error while running the analysis.").
    b. Use the \`_answerUserTool\` to inform the user you cannot proceed with that specific path and suggest they try rephrasing or asking something else.
    c. DO NOT attempt to call the *same* tool again immediately after it failed in the previous step.`;
    }

    _buildFinalInstruction() {
        return "Remember to provide your user-friendly explanation *first*, then the JSON action object on its own lines if required.\n\nRespond now based on the user's latest request and the current context.";
    }
}

module.exports = SystemPromptBuilder;