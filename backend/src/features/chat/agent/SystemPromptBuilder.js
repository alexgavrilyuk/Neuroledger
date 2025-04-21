// backend/src/features/chat/agent/SystemPromptBuilder.js
// ENTIRE FILE - FULLY UPDATED

const { toolDefinitions } = require('../tools/tool.definitions'); // Import tool definitions

// Helper function to format currency values for the prompt.
const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// Helper function to format percentage values for the prompt.
const formatPercentage = (value, decimals = 1) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    const numericValue = typeof value === 'string' ? parseFloat(value.replace('%', '')) : value;
    if (isNaN(numericValue)) return 'N/A';
    return numericValue.toFixed(decimals) + '%';
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
        // Heuristic for percentages (0-1 range or > 1 and <= 100)
        if ((value >= 0 && value <= 1 && String(value).includes('.')) || (value > 1 && value <= 100)) {
            if (Math.abs(value) <= 100) return formatPercentage(value, 1);
        }
        return formatCurrency(value); // Default to currency for other numbers
    }
    if (typeof value === 'string') return `"${value.substring(0, 200)}${value.length > 200 ? '...' : ''}"`; // Keep quotes, truncate long strings
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        // Summarize arrays beyond a certain length or complexity
        if (value.length > 5 || (value[0] && typeof value[0] === 'object')) {
            return `[Array with ${value.length} items]`;
        }
        return `[${value.map(item => formatJsonValue(item)).join(', ')}]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return '{}';
        // Summarize objects beyond a certain size
        if (keys.length > 5) {
            return `Object with ${keys.length} properties`;
        }
        return `{ ${keys.map(k => `${k}: ${formatJsonValue(value[k])}`).join(', ')} }`; // Show limited key-values
    }
    return String(value).substring(0, 200); // Truncate other types
};


/**
 * Recursively formats a JSON-like object into a human-readable string for the LLM context,
 * summarizing nested structures beyond a certain depth and truncating long values.
 * @param {any} obj - The object or value to format.
 * @param {string} [prefix=''] - Indentation prefix for nested levels.
 * @param {number} [maxDepth=3] - Maximum depth to fully expand objects/arrays. Increased slightly.
 * @param {number} [currentDepth=0] - Current recursion depth.
 * @returns {string} A formatted string representation.
 */
const formatAnalysisObject = (obj, prefix = '', maxDepth = 3, currentDepth = 0) => {
    let result = '';
    // Max output length to prevent excessive context
    const MAX_FORMATTED_LENGTH = 2000;

    function formatRecursive(currentObj, currentPrefix, depth) {
        if (result.length > MAX_FORMATTED_LENGTH) return; // Stop if too long

        if (typeof currentObj !== 'object' || currentObj === null || depth > maxDepth) {
            const formattedVal = `${currentPrefix}${formatJsonValue(currentObj)}\n`;
            if (result.length + formattedVal.length <= MAX_FORMATTED_LENGTH) {
                result += formattedVal;
            } else {
                result += `${currentPrefix}[Data truncated...]\n`;
            }
            return;
        }

        if (Array.isArray(currentObj)) {
            const arraySummary = `${currentPrefix}[Array (${currentObj.length} items)]\n`;
            if (result.length + arraySummary.length > MAX_FORMATTED_LENGTH) {
                 result += `${currentPrefix}[Array truncated...]\n`; return;
            }
             result += arraySummary;
            // Optionally show first few items if space allows and depth not exceeded
             if (depth < maxDepth) {
                 for (let i = 0; i < Math.min(currentObj.length, 3); i++) { // Show first 3 items max
                     if (result.length > MAX_FORMATTED_LENGTH) { result += `${currentPrefix}  [More items truncated...]\n`; break; }
                     formatRecursive(currentObj[i], `${currentPrefix}  - `, depth + 1);
                 }
                 if (currentObj.length > 3 && result.length <= MAX_FORMATTED_LENGTH) {
                     result += `${currentPrefix}  [... ${currentObj.length - 3} more items]\n`;
                 }
             }
             return;
        }

        // Handle objects
        for (const key in currentObj) {
            if (result.length > MAX_FORMATTED_LENGTH) { result += `${currentPrefix}[More properties truncated...]\n`; break; }
            if (Object.prototype.hasOwnProperty.call(currentObj, key)) {
                const value = currentObj[key];
                const formattedKey = `${currentPrefix}- ${key}:`;

                if (typeof value === 'object' && value !== null && depth < maxDepth) {
                    const keyLine = `${formattedKey}\n`;
                    if (result.length + keyLine.length > MAX_FORMATTED_LENGTH) { result += `${currentPrefix}[More properties truncated...]\n`; break; }
                    result += keyLine;
                    formatRecursive(value, currentPrefix + '  ', depth + 1);
                } else {
                    const valueLine = ` ${formatJsonValue(value)}\n`;
                    if (result.length + formattedKey.length + valueLine.length <= MAX_FORMATTED_LENGTH) {
                        result += formattedKey + valueLine;
                    } else {
                         result += `${formattedKey} [Value truncated...]\n`;
                    }
                }
            }
        }
    }

    formatRecursive(obj, prefix, currentDepth);
    if (result.length > MAX_FORMATTED_LENGTH) {
         // Ensure truncation message is appended if limit exceeded during recursion
         if (!result.endsWith('[Data truncated...]\n') && !result.endsWith('[More items truncated...]\n') && !result.endsWith('[More properties truncated...]\n')) {
             result = result.substring(0, MAX_FORMATTED_LENGTH - 20) + '... [Truncated]\n';
         }
    }
    return result;
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
            this._buildCoreThinkingInstruction(), // Updated
            this._buildCriticalWarnings(),
            this._buildChatHistory(context.fullChatHistory),
            this._buildCurrentProgress(context.currentTurnSteps),
            this._buildPreviousArtifacts(context.previousAnalysisResultSummary, context.hasPreviousGeneratedCode),
            this._buildAnalysisResult(context.analysisResult),
            this._buildUserTeamContext(context.userContext, context.teamContext),
            this._buildDatasetInfo(context.datasetSchemas, context.datasetSamples),
            this._buildToolDefinitions(),
            this._buildFewShotExamples(),
            this._buildCoreInstructions(),
            this._buildWorkflowGuidance(),
            this._buildModificationHandling(),
            this._buildErrorHandling(),
            this._buildClarificationGuidance(),
            this._buildFinalInstruction()
        ];
        return parts.filter(Boolean).join('\n\n');
    }

    _buildIntroduction() {
        return "You are NeuroLedger AI, an expert Financial Analyst agent. Your goal is to help the user analyze their financial data and answer their questions accurately and insightfully.";
    }

    // ** UPDATED: Add <user_explanation> requirement **
    _buildCoreThinkingInstruction() {
        return `**CORE REQUIREMENT: THINK BEFORE ACTING & EXPLAIN TO USER**
Before outputting ANY tool call OR your final answer, YOU MUST first provide **BOTH**:
1.  Your internal, step-by-step reasoning and plan within \`<thinking> ... </thinking>\` tags. This is for internal use.
2.  A concise, user-friendly explanation of your current plan/action in \`<user_explanation> ... </user_explanation>\` tags. This text will be shown directly to the user. Keep it brief and focus on what you are doing for them (e.g., "Analyzing the sales data...", "Checking the budget details...", "Preparing the summary report..."). **DO NOT mention internal tool names here.**

**Output Format:**
1.  Provide your internal reasoning in \`<thinking> ... </thinking>\`. **When planning for a comprehensive report, explicitly state in your \`<thinking>\` block that you will generate analysis code that includes insights, and then generate report code to display both data and insights.**
2.  **Immediately** following, provide the user explanation in \`<user_explanation> ... </user_explanation>\`.
3.  **Immediately** following the closing \`</user_explanation>\` tag, provide EITHER:
    a.  A **single JSON object** for a tool call (e.g., \`parse_csv_data\`). Format:
        \`\`\`json
        {
          "tool": "<tool_name>",
          "args": { <arguments_based_on_tool_description> }
        }
        \`\`\`
    b.  OR, if no more tools are needed, provide the final answer using the **EXACT** \`_answerUserTool\` format:
        \`\`\`json
        {
          "tool": "_answerUserTool",
          "args": {
            "textResponse": "Your final, complete answer text for the user goes here."
          }
        }
        \`\`\`
        **CRITICAL:** For the final answer, the key inside "args" MUST be exactly \`"textResponse"\`. Do NOT include any extra text outside the JSON block.`;
    }

    _buildCriticalWarnings() {
        return `You operate in a loop: Reason -> Act -> Observe.\n\n**⚠️ CRITICAL INSTRUCTION: WHEN USING TOOLS REQUIRING A 'dataset_id', YOU MUST USE THE EXACT MONGODB OBJECTID PROVIDED IN THE 'AVAILABLE DATASETS' SECTION BELOW. DO NOT CREATE, INVENT, OR USE DATASET NAMES AS IDs. ⚠️**`;
    }

    _buildChatHistory(chatHistory = []) {
        if (!chatHistory || chatHistory.length === 0) return '**Conversation History:**\nNo history yet.';
        let historyText = '**Conversation History (Most Recent Messages):**\n';
        if (chatHistory[0]?.role === 'assistant' && chatHistory[0]?.content?.startsWith('Previous conversation summary:')) {
             historyText += `*Summary of Earlier Conversation:*\n${chatHistory[0].content.replace('Previous conversation summary:\n','')}\n---\n*Recent Messages:*\n`;
             chatHistory = chatHistory.slice(1);
        }
        const displayHistory = chatHistory.slice(-10); // Keep recent N turns for context
        historyText += displayHistory.map(msg => {
            const prefix = msg.role === 'user' ? 'User' : 'Assistant';
            // Truncate long messages in history for brevity
            const content = (msg.content || '').substring(0, 500);
            const ellipsis = (msg.content || '').length > 500 ? '...' : '';
            return `${prefix}: ${content}${ellipsis}`;
        }).join('\n\n');
         if (chatHistory.length > 10) historyText = `**(Older messages summarized or omitted)**\n${historyText}`;
        return historyText;
    }

    _buildCurrentProgress(steps = []) {
        if (!steps || steps.length === 0) return '**Current Turn Progress:**\nNo actions taken yet this turn.';
        let text = '**Current Turn Progress:**\nActions taken so far in this turn:\n';
        steps.forEach((step, index) => {
            if (step.tool.startsWith('_')) return; // Skip internal steps like _refiningCode
            text += `${index + 1}. Tool Used: \`${step.tool}\` (Attempt: ${step.attempt || 1})\n`; // Show tool name internally
             let argsSummary = 'No args';
             if (step.args && Object.keys(step.args).length > 0) {
                 const argsToSummarize = {};
                 for (const key in step.args) {
                     if (typeof step.args[key] === 'string' && step.args[key].length > 50) { argsToSummarize[key] = step.args[key].substring(0, 50) + '...'; }
                     else if (key !== 'code' && key !== 'react_code') { argsToSummarize[key] = step.args[key]; }
                 }
                 try { argsSummary = JSON.stringify(argsToSummarize); } catch { argsSummary = '[Args not serializable]'; }
             }
             text += `   Args: ${argsSummary.substring(0, 150)}${argsSummary.length > 150 ? '...' : ''}\n`;
            text += `   Result Summary: ${step.resultSummary || 'N/A'}\n`;
            if (step.error) {
                const errorCodePart = step.errorCode ? ` (${step.errorCode})` : '';
                text += `   Error: ${String(step.error).substring(0, 150)}...${errorCodePart}\n`;
            }
        });
        return text;
    }

    _buildPreviousArtifacts(summary, hasCode) {
        if (!summary && !hasCode) return '';
        let text = '**Context from Previous Report Generation (If applicable):**\n';
        text += `- Summary of Previous Analysis Used: ${summary || 'None available'}\n`;
        text += `- Previously Generated Code Available: ${hasCode ? 'Yes' : 'No'}\n`;
        return text;
    }

    _buildAnalysisResult(analysisResult) {
        if (!analysisResult) return '**Current Turn Analysis Results:**\nNo analysis has been performed or resulted in data *this turn*. Check previous turn artifacts if modifying.';
        try {
            const formatted = formatAnalysisObject(analysisResult);
            if (!formatted.trim()) return '**Current Turn Analysis Results (MUST USE for Summarization/Report Args):**\n(Analysis result is empty or contains no data)';
            // Make header clearer for LLM
            return `**Actual Analysis Results (Data available for next step):**\n\`\`\`json\n${formatted}\n\`\`\``;
        } catch (e) {
            console.error('[SystemPromptBuilder] Error formatting analysisResult:', e);
            return '**Current Turn Analysis Results:**\nError formatting results for display.';
        }
    }

    _buildUserTeamContext(userCtx, teamCtx) {
        if (!userCtx && !teamCtx) return '**User/Team Context:**\nNo specific user or team context provided.';
        return `**User/Team Context:**\nUser Context: ${userCtx || 'Not set.'}\nTeam Context: ${teamCtx || 'Not set.'}`;
    }

    _buildDatasetInfo(schemas = {}, samples = {}) {
        const datasetIds = Object.keys(schemas);
        if (datasetIds.length === 0) return '**AVAILABLE DATASETS:**\nNo datasets are currently selected or available for this chat session.';
        let text = '**AVAILABLE DATASETS - CRITICAL INFORMATION:**\n';
        text += '\n⚠️ **CRITICAL: YOU MUST USE THE EXACT DATASET IDs LISTED BELOW WHEN A TOOL REQUIRES A \`dataset_id\`** ⚠️\n';
        text += '\n**DO NOT MAKE UP IDs OR USE DATASET NAMES. ONLY USE THE MONGODB OBJECTID VALUES SHOWN BELOW.**\n';
        datasetIds.forEach(datasetId => {
            const schema = schemas[datasetId] || {};
            const sample = samples[datasetId];
            text += `\n## Dataset ID: \`${datasetId}\`\n`; // Highlight the ID
            text += `   Name: ${schema.name || 'Unknown Name'}\n`;
            text += `   Description: ${schema.description || 'No description available'}\n\n`;
            text += `### Schema Information:\n`;
            if (schema.schemaInfo && schema.schemaInfo.length > 0) {
                schema.schemaInfo.forEach(column => {
                    const colDesc = schema.columnDescriptions?.[column.name] || 'No description';
                    text += `- **${column.name}** (${column.type || 'unknown'}): ${colDesc}\n`;
                });
            } else { text += `   No schema information available.\n`; }
            if (sample && sample.sampleRows && sample.sampleRows.length > 0) {
                text += `\n### Sample Data (Last ${sample.sampleRows.length} rows of ${sample.totalRows} total):\n`;
                try {
                     const sampleString = JSON.stringify(sample.sampleRows, null, 2);
                     // Increased sample display limit
                     const truncatedSample = sampleString.substring(0, 1500) + (sampleString.length > 1500 ? '\n...' : '');
                     text += `   \`\`\`json\n   ${truncatedSample}\n   \`\`\`\n`;
                } catch { text += `   [Could not display sample data]\n`; }
            }
        });
        return text;
    }

    _buildToolDefinitions() {
        // Using the imported toolDefinitions directly
        const formattedTools = toolDefinitions.map(tool => {
            const escapedDescription = tool.description.replace(/"/g, '\\"').replace(/\n/g, '\\n');
            let escapedOutput = '';
            if (typeof tool.output === 'string') { escapedOutput = tool.output.replace(/"/g, '\\"').replace(/\n/g, '\\n     '); }
            else { try { escapedOutput = JSON.stringify(tool.output); } catch { escapedOutput = '[Output format unavailable]'; } }
            // Don't include argsSchema in the prompt for the LLM
            return `  {\n     "name": "${tool.name}",\n     "description": "${escapedDescription}",\n     "output": "${escapedOutput}"\n   }`;
        }).join(',\n');

        return `**Available Tools:**\nYou have access to the following tools. To use a tool, output ONLY a single JSON object in the format shown below AFTER your <thinking> and <user_explanation> blocks:\n\`\`\`json\n{\n  \"tool\": \"<tool_name>\",\n  \"args\": { <arguments_based_on_tool_description> }\n}\n\`\`\`\n\n**Tool Definitions:**\n[\n${formattedTools}\n]\n\n**IMPORTANT:** Determine the required arguments for each tool based on its description above. For the FINAL answer, you MUST use the \`_answerUserTool\` with the argument format \`{"textResponse": "Your answer here"}\`.`;
    }

     _buildFewShotExamples() {
          // Include <user_explanation> in examples
          return `**Examples of Interaction Flow:**

          *Example 1: User asks for schema*
          User Request: "What columns are in dataset 6abcdef1234567890abcdef?"
          Your Response:
          \`<thinking>
          1. User wants the schema for dataset ID 6abcdef1234567890abcdef.
          2. Dataset context above shows this ID is available.
          3. I need to use the \`get_dataset_schema\` tool with the exact ID.
          </thinking>
          <user_explanation>Let me check the columns available in that dataset for you.</user_explanation>\`
          \`\`\`json
          {
            "tool": "get_dataset_schema",
            "args": { "dataset_id": "6abcdef1234567890abcdef" }
          }
          \`\`\`

          *Example 2: User asks for analysis requiring code execution*
          User Request: "Calculate the total revenue from dataset 6abcdef1234567890abcdef"
          Your Response (after parsing data in a previous step):
          \`<thinking>
          1. User wants total revenue. Data for 6abc...def is parsed.
          2. Schema context shows a 'Revenue' column.
          3. Need to generate code to sum the 'Revenue' column.
          4. Goal for code gen: 'Sum the Revenue column'.
          5. Use \`generate_analysis_code\`.
          </thinking>
          <user_explanation>Okay, I've loaded the data. Now I'll prepare the calculation to find the total revenue.</user_explanation>\`
          \`\`\`json
          {
            "tool": "generate_analysis_code",
            "args": { "analysis_goal": "Sum the Revenue column", "dataset_id": "6abcdef1234567890abcdef" }
          }
          \`\`\`
          (After successful code generation, Observation contains summary)
          Your NEXT Response:
          \`<thinking>
          1. Analysis code to sum revenue has been generated.
          2. Now I need to execute this code using \`execute_analysis_code\` on the parsed data for dataset 6abc...def.
          </thinking>
          <user_explanation>I have the calculation ready, now I'll run it on your data.</user_explanation>\`
          \`\`\`json
          {
            "tool": "execute_analysis_code",
            "args": { "dataset_id": "6abcdef1234567890abcdef" }
          }
          \`\`\`
          (After successful code execution, Observation contains summary like: {"result_preview": {"totalRevenue": 150000}})
          Your FINAL Response:
          \`<thinking>
          1. Code execution completed successfully. The result was {totalRevenue: 150000}.
          2. Need to present this final answer to the user using \`_answerUserTool\`.
          </thinking>
          <user_explanation>The analysis is complete.</user_explanation>\`
          \`\`\`json
          {
            "tool": "_answerUserTool",
            "args": {
              "textResponse": "The total revenue calculated from the dataset is $150,000."
            }
          }
          \`\`\`
          `;
      }

    _buildCoreInstructions() {
        // Keep user-friendly progress update guidance
        return `**IMPORTANT INSTRUCTIONS (User Experience Focus):**
*   **User-Friendly Explanations:** In your \`<user_explanation>\` block, explain your progress towards the user's goal in simple, non-technical language. Focus on *what* you are doing for the user (e.g., "Loading your data", "Preparing the analysis code", "Running the calculations", "Generating the report").
*   **DO NOT Mention Internals:** In your \`<user_explanation>\` and final \`textResponse\`, **DO NOT** mention internal tool names (like \\\`parse_csv_data\\\`, \\\`generate_analysis_code\\\`, etc.), internal variables, or system identifiers like MongoDB ObjectIds. Keep the language focused on the user's perspective and the task progress.
*   **Action AFTER Explanation:** Output the required JSON tool call object (or \\\`_answerUserTool\\\` call) **immediately after** the closing \`</user_explanation>\` tag.`;
    }

    _buildWorkflowGuidance() {
        return `**WORKFLOW GUIDANCE:**
*   **Data Loading First:** Generally, use \`parse_csv_data\` or \`check_data_loaded\` first if data isn't already loaded for the current analysis task.
*   **Code for Calculations:** For calculations or specific data transformations not covered by other tools, use \`generate_analysis_code\` then \`execute_analysis_code\`.
*   **Report Generation:** To visualize results or present data in a structured way (charts, tables), use \`generate_report_code\` AFTER analysis code has been successfully executed (its result will be passed automatically).
*   **Tool Selection:** Choose the MOST appropriate tool for the specific task. Don't use general code generation if a specific tool (like \`calculate_financial_ratios\`) can directly answer the request.
*   **Iterative Refinement:** If code execution fails, use the error information to refine the goal for \`generate_analysis_code\` (if the error was in the analysis code) or \`generate_report_code\` (if the error was in the report component) and try again. If the agent gets stuck in a loop of failed code execution, consider using \`_answerUserTool\` to explain the issue.

*   **Workflow for Comprehensive Reports / Insights:**
    If the user asks for 'insights', 'commentary', 'recommendations', an 'executive summary', or a 'comprehensive report', you **MUST** follow this specific workflow:
    1.  **(Parse Data)** Use \`parse_csv_data\` if needed. Explain as 'Loading data'.
    2.  **(Generate ENHANCED Analysis Code)** Use \`generate_analysis_code\`. Your \`analysis_goal\` MUST explicitly ask for calculations like variances, ratios, trends, AND **textual insights/recommendations** to be included in the \`sendResult\` object. Explain as 'Performing in-depth analysis'.
    3.  **(Execute Code)** Use \`execute_analysis_code\`. Explain as 'Running detailed calculations'.
    4.  **(Generate ENHANCED Report Code)** Use \`generate_report_code\`. Your \`analysis_summary\` should mention that insights are included. Explain as 'Generating comprehensive report'.
    5.  **(Answer User)** Use \`_answerUserTool\` with a brief message like 'Here is the comprehensive report you requested.' Explain as 'Presenting the detailed report'.

*   **Tool Usage Clarification:** Use \`calculate_financial_ratios\` for direct ratio requests. Use the 'Comprehensive Report' workflow involving \`generate_analysis_code\` for requests needing deeper insights, commentary, custom analysis, or when the required data structure for ratios isn't immediately obvious. The comprehensive workflow is generally preferred for complex or multi-faceted analysis requests.

`;
    }

    _buildModificationHandling() {
        return `**MODIFICATION HANDLING:** If the user asks to **modify** the *most recently generated report* AND the modification **does not require new calculations**:
    a. Explain you are "Updating the report component" in \`<user_explanation>\`.
    b. Use only \`generate_report_code\`.`;
    }

     _buildErrorHandling() {
         return `**ERROR HANDLING:** If the *last step* shows an 'Error:',
    a. Explain to the user (in \`<user_explanation>\`) that a step failed (e.g., "I encountered an error while running the analysis.").
    b. Use \`_answerUserTool\` to inform the user you cannot proceed with that specific path.
    c. DO NOT attempt to call the *same* tool again unless the error code explicitly suggests a retry AND you modify args. Prefer \`ask_user_for_clarification\` if missing info caused the error.`;
    }

     _buildClarificationGuidance() {
         return `**Requesting Clarification:** If the user's request is ambiguous or missing information, use \`ask_user_for_clarification\`. Explain *why* you need clarification in \`<user_explanation>\`.`;
     }

    _buildFinalInstruction() {
         return `Respond now. Remember the strict output format: 1. \`<thinking>\` block. 2. \`<user_explanation>\` block. 3. EITHER the tool call JSON OR the \`_answerUserTool\` JSON.`;
    }
}

module.exports = SystemPromptBuilder;