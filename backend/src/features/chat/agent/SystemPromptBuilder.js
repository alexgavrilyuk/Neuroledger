// backend/src/features/chat/agent/SystemPromptBuilder.js
// ENTIRE FILE - UPDATED FOR PHASE 6/7 FIX #2

const { toolDefinitions } = require('../tools/tool.definitions'); // Import tool definitions

// Helper function to format currency values for the prompt.
const formatCurrency = (value) => { /* ... (implementation from previous steps) ... */
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// Helper function to format percentage values for the prompt.
const formatPercentage = (value, decimals = 1) => { /* ... (implementation from previous steps) ... */
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
const formatAnalysisObject = (obj, prefix = '', maxDepth = 2, currentDepth = 0) => { /* ... (implementation from previous steps) ... */
    let result = '';
    if (typeof obj !== 'object' || obj === null) {
        return `${prefix}${formatJsonValue(obj)}\n`;
    }

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            const formattedKey = `${prefix}- ${key}:`;

            if (typeof value === 'object' && value !== null && !Array.isArray(value) && currentDepth < maxDepth) {
                const nestedResult = formatAnalysisObject(value, prefix + '  ', maxDepth, currentDepth + 1);
                if (nestedResult.trim()) {
                     result += `${formattedKey}\n${nestedResult}`;
                } else {
                    result += `${formattedKey} {}\n`;
                }
            } else if (Array.isArray(value) && currentDepth < maxDepth && value.length > 0 && typeof value[0] === 'object') {
                 result += `${formattedKey} [Array of ${value.length} objects, first item keys: ${Object.keys(value[0]).slice(0,5).join(', ')}${Object.keys(value[0]).length > 5 ? '...' : ''}]\n`; // Show first few keys
            } else if (Array.isArray(value) && currentDepth < maxDepth) {
                 result += `${formattedKey} [Array of ${value.length} items: ${value.slice(0,5).map(formatJsonValue).join(', ')}${value.length > 5 ? '...' : ''}]\n`; // Show first few primitive values
            } else if (currentDepth >= maxDepth && (typeof value === 'object' || Array.isArray(value))) {
                result += `${formattedKey} [Nested data omitted for brevity]\n`;
            }
            else {
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
const formatJsonValue = (value) => { /* ... (implementation from previous steps) ... */
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') {
        // Heuristic for percentages (0-1 range or ends with %)
        if ((value >= 0 && value <= 1 && String(value).includes('.')) || (value > 1 && value <= 100)) {
             // Check if it likely represents a ratio/percentage between 0 and 100
             // Avoid formatting large numbers like counts or IDs as percentages
             if (Math.abs(value) <= 100) return formatPercentage(value, 1);
        }
        return formatCurrency(value); // Default to currency for other numbers
    }
    if (typeof value === 'string') return `"${value}"`; // Keep quotes for strings
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        if (value.length <= 5) { return `[${value.map(item => formatJsonValue(item)).join(', ')}]`; }
        return `[Array with ${value.length} items]`;
    }
    if (typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 0) return '{}';
        if (keys.length <= 5) { return `{ ${keys.join(', ')} }`; }
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
            this._buildCoreThinkingInstruction(),
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
            this._buildClarificationGuidance(), // Add clarification guidance
            this._buildFinalInstruction()
        ];
        return parts.filter(Boolean).join('\n\n');
    }

    _buildIntroduction() {
        return "You are NeuroLedger AI, an expert Financial Analyst agent. Your goal is to help the user analyze their financial data and answer their questions accurately and insightfully.";
    }

    // ** FIX: Explicitly define _answerUserTool format **
    _buildCoreThinkingInstruction() {
        return `**CORE REQUIREMENT: THINK BEFORE ACTING**
Before outputting ANY tool call OR your final answer, YOU MUST first provide your reasoning and step-by-step plan within \`<thinking>\` XML tags. Explain your thought process based on the user query, history, and available context.

**Output Format:**
1.  Provide your reasoning inside \`<thinking> ... </thinking>\` tags.
2.  **Immediately** following the closing \`</thinking>\` tag, provide EITHER:
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
        **CRITICAL:** For the final answer, the key inside "args" MUST be exactly \`"textResponse"\`. DO NOT use any other key like "answer" or "final_answer".`;
    }


    _buildCriticalWarnings() {
        return `You operate in a loop: Reason -> Act -> Observe.\n\n**⚠️ CRITICAL INSTRUCTION: WHEN USING TOOLS REQUIRING A 'dataset_id', YOU MUST USE THE EXACT MONGODB OBJECTID PROVIDED IN THE 'AVAILABLE DATASETS' SECTION BELOW. DO NOT CREATE, INVENT, OR USE DATASET NAMES AS IDs. ⚠️**`;
    }

    _buildChatHistory(chatHistory = []) { /* ... (implementation from previous steps) ... */
        if (!chatHistory || chatHistory.length === 0) return '**Conversation History:**\nNo history yet.';
        let historyText = '**Conversation History (Most Recent Messages):**\n';
        if (chatHistory[0]?.role === 'assistant' && chatHistory[0]?.content?.startsWith('Previous conversation summary:')) {
             historyText += `*Summary of Earlier Conversation:*\n${chatHistory[0].content.replace('Previous conversation summary:\n','')}\n---\n*Recent Messages:*\n`;
             chatHistory = chatHistory.slice(1);
        }
        const displayHistory = chatHistory.slice(-10);
        historyText += displayHistory.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content || ''}`).join('\n\n');
         if (chatHistory.length > 10) historyText = `**(Older messages summarized or omitted)**\n${historyText}`;
        return historyText;
    }


    _buildCurrentProgress(steps = []) { /* ... (implementation from previous steps) ... */
        if (!steps || steps.length === 0) return '**Current Turn Progress:**\nNo actions taken yet this turn.';
        let text = '**Current Turn Progress:**\nActions taken so far in this turn:\n';
        steps.forEach((step, index) => {
            if (step.tool.startsWith('_')) return; // Skip internal steps like _refiningCode
            text += `${index + 1}. Tool Used: ${step.tool} (Attempt: ${step.attempt || 1})\n`;
             let argsSummary = 'No args';
             if (step.args && Object.keys(step.args).length > 0) {
                 const argsToSummarize = {};
                 for (const key in step.args) {
                     if (typeof step.args[key] === 'string' && step.args[key].length > 50) { argsToSummarize[key] = step.args[key].substring(0, 50) + '...'; }
                     else if (key !== 'code' && key !== 'react_code') { argsToSummarize[key] = step.args[key]; }
                 }
                 argsSummary = JSON.stringify(argsToSummarize);
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

    _buildPreviousArtifacts(summary, hasCode) { /* ... (implementation from previous steps) ... */
        if (!summary && !hasCode) return '';
        let text = '**Context from Previous Report Generation (If applicable):**\n';
        text += `- Summary of Previous Analysis Used: ${summary || 'None available'}\n`;
        text += `- Previously Generated Code Available: ${hasCode ? 'Yes' : 'No'}\n`;
        return text;
    }

    _buildAnalysisResult(analysisResult) { /* ... (implementation from previous steps) ... */
        if (!analysisResult) return '**Current Turn Analysis Results:**\nNo analysis has been performed or resulted in data *this turn*. Check previous turn artifacts if modifying.';
        try {
            const formatted = formatAnalysisObject(analysisResult);
            if (!formatted.trim()) return '**Current Turn Analysis Results (MUST USE for Summarization/Report Args):**\n(Analysis result is empty or contains no data)';
            return `**Current Turn Analysis Results (Use THIS data for NEW reports/answers):**\n\`\`\`json\n${formatted}\n\`\`\``;
        } catch (e) {
            console.error('[SystemPromptBuilder] Error formatting analysisResult:', e);
            return '**Current Turn Analysis Results:**\nError formatting results for display.';
        }
    }

    _buildUserTeamContext(userCtx, teamCtx) { /* ... (implementation from previous steps) ... */
        if (!userCtx && !teamCtx) return '**User/Team Context:**\nNo specific user or team context provided.';
        return `**User/Team Context:**\nUser Context: ${userCtx || 'Not set.'}\nTeam Context: ${teamCtx || 'Not set.'}`;
    }

    _buildDatasetInfo(schemas = {}, samples = {}) { /* ... (implementation from previous steps) ... */
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
                     const truncatedSample = sampleString.substring(0, 1000) + (sampleString.length > 1000 ? '\n...' : '');
                     text += `   \`\`\`json\n   ${truncatedSample}\n   \`\`\`\n`;
                } catch { text += `   [Could not display sample data]\n`; }
            }
        });
        return text;
    }

    _buildToolDefinitions() {
        const formattedTools = toolDefinitions.map(tool => {
            const escapedDescription = tool.description.replace(/"/g, '\\"').replace(/\n/g, '\\n');
            let escapedOutput = '';
            if (typeof tool.output === 'string') { escapedOutput = tool.output.replace(/"/g, '\\"').replace(/\n/g, '\\n     '); }
            else { try { escapedOutput = JSON.stringify(tool.output); } catch { escapedOutput = '[Output format unavailable]'; } }
            return `  {\n     "name": "${tool.name}",\n     "description": "${escapedDescription}",\n     "output": "${escapedOutput}"\n   }`;
        }).join(',\n');

        // ** FIX: Reinforce _answerUserTool structure **
        return `**Available Tools:**\nYou have access to the following tools. To use a tool, output ONLY a single JSON object in the format shown below AFTER your <thinking> block:\n\`\`\`json\n{\n  \"tool\": \"<tool_name>\",\n  \"args\": { <arguments_based_on_tool_description> }\n}\n\`\`\`\n\n**Tool Definitions:**\n[\n${formattedTools}\n]\n\n**IMPORTANT:** Determine the required arguments for each tool based on its description above. For the FINAL answer, you MUST use the \`_answerUserTool\` with the argument format \`{"textResponse": "Your answer here"}\`.`;
    }

     _buildFewShotExamples() {
          // ** FIX: Correct _answerUserTool example format **
          return `**Examples of Interaction Flow:**

          *Example 1: User asks for schema*
          User Request: "What columns are in dataset 6abcdef1234567890abcdef?"
          Your Response:
          \`<thinking>
          1. User wants the schema for dataset ID 6abcdef1234567890abcdef.
          2. Dataset context above shows this ID is available.
          3. I need to use the \`get_dataset_schema\` tool with the exact ID.
          </thinking>\`
          \`\`\`json
          {
            "tool": "get_dataset_schema",
            "args": { "dataset_id": "6abcdef1234567890abcdef" }
          }
          \`\`\`

          *Example 2: User asks for analysis using specific tool*
          User Request: "Calculate the Current Ratio for dataset 6abcdef1234567890abcdef using the 'AssetsCurrent' and 'LiabilitiesCurrent' columns."
          Your Response (after parsing data in a previous step):
          \`<thinking>
          1. User wants the Current Ratio. Data for 6abc...def is parsed (from previous step).
          2. The user specified the exact columns: 'AssetsCurrent' and 'LiabilitiesCurrent'.
          3. I should use the \`calculate_financial_ratios\` tool directly.
          4. I need to request the "Current Ratio" and provide the column names specified by the user.
          </thinking>\`
          \`\`\`json
          {
            "tool": "calculate_financial_ratios",
            "args": {
               "dataset_id": "6abcdef1234567890abcdef",
               "ratios": ["Current Ratio"],
               "current_assets_column": "AssetsCurrent",
               "current_liabilities_column": "LiabilitiesCurrent"
            }
          }
          \`\`\`
          Your FINAL Response (after successful ratio calculation):
          \`<thinking>
          1. Ratio calculation completed. The result is {"ratios": {"Current Ratio": 2.5}}.
          2. I need to present this final answer to the user using \`_answerUserTool\`.
          </thinking>\`
          \`\`\`json
          {
            "tool": "_answerUserTool",
            "args": {
              "textResponse": "The Current Ratio for the dataset is 2.50."
            }
          }
          \`\`\`

          *Example 3: Handling Ambiguity*
          User Request: "Show the profit margin." (Dataset schema lacks obvious 'Profit' column but has 'Revenue', 'COGS')
          Your Response:
          \`<thinking>
          1. User wants profit margin, but the schema doesn't have a 'Profit' column directly.
          2. I see 'Revenue' and 'COGS' columns. Profit margin is usually (Revenue - COGS) / Revenue.
          3. I should ask the user to confirm if using these columns is correct before proceeding with calculations.
          4. I will use the \`ask_user_for_clarification\` tool.
          </thinking>\`
          \`\`\`json
          {
            "tool": "ask_user_for_clarification",
            "args": { "question": "I can calculate the profit margin using the 'Revenue' and 'COGS' columns. Is that correct?" }
          }
          \`\`\`
          `;
      }


    _buildCoreInstructions() { /* ... (implementation from previous steps) ... */
        return `**IMPORTANT INSTRUCTIONS (User Experience Focus):**
*   **User-Friendly Progress Updates:** Inside your \`<thinking>\` block, explain your progress towards the user's goal in simple, non-technical language. Focus on *what* you are doing for the user (e.g., "Loading your data", "Preparing the analysis code", "Running the calculations", "Generating the report").
*   **DO NOT Mention Internals:** In your user-facing explanations (both in \`<thinking>\` and final answers), **DO NOT** mention specific internal tool names (like \\\`parse_csv_data\\\`, \\\`generate_analysis_code\\\`, \\\`execute_analysis_code\\\`, \\\`generate_report_code\\\`, \\\`_answerUserTool\\\`), internal variables, or system identifiers like MongoDB ObjectIds. Keep the language focused on the user's perspective and the task progress.
*   **Action AFTER Explanation:** Output the required JSON tool call object (or \\\`_answerUserTool\\\` call) **immediately after** the closing \`</thinking>\` tag.
*   **Summarize After Observing:** After receiving a tool result (which will be added to the history), your *next* \`<thinking>\` block should briefly summarize the outcome in simple terms (e.g., "Data loaded successfully", "Analysis complete", "Report component created") and explain your plan for the next step, again using user-friendly language.`;
    }

    _buildWorkflowGuidance() { /* ... (implementation from previous steps) ... */
        return `**Workflow & Tool Usage Guidance (Internal Logic):**
*   Dataset schema and sample data are already provided above. You do NOT need to use the \\\`list_datasets\\\` or \\\`get_dataset_schema\\\` tools unless the user explicitly asks or context seems missing.
*   Analyze 'Current Turn Progress' / previous step results before deciding action.
*   Do NOT call a tool if info already available in the current turn.
*   **Typical Workflow for Analysis & Custom Ratio Calculation (via Code Gen):**
    1.  **(Parse Data)** Use \\\`parse_csv_data\\\` if data isn't already parsed for the required dataset(s). Explain as "Loading data".
    2.  **(Generate Analysis Code)** Use \\\`generate_analysis_code\\\` to create code. Explain as "Preparing analysis/ratio code".
    3.  **(Execute Code)** Use \\\`execute_analysis_code\\\` with the correct \\\`dataset_id\\\`. Explain to user as "Running analysis/calculation".
    4.  **(Analyze Result)** Internally analyze the numeric result returned by code execution.
    5.  **(Generate Report - Optional)** If the user asked for a report AND analysis was successful: Use \\\`generate_report_code\\\` providing an \\\`analysis_summary\\\`. Explain as "Generating the report visualization".
    6.  **(Answer User)** Use \\\`_answerUserTool\\\` to present the final calculated result (e.g., the ratio value) or state that the report is ready. Explain as "Summarizing the findings" or "Presenting the report".
*   **Workflow for COMMON Financial Ratios (Direct Calculation):**
    1.  **(Parse Data)** Use \\\`parse_csv_data\\\` if data isn't parsed. Explain as "Loading data".
    2.  **(Identify Columns)** Determine the EXACT column names needed for the ratio(s) (e.g., 'Revenue', 'COGS' for Gross Profit Margin). If unsure, use \\\`ask_user_for_clarification\\\`.
    3.  **(Calculate Ratios)** Use \\\`calculate_financial_ratios\\\` providing the \\\`dataset_id\\\`, the desired \\\`ratios\\\` array, and the EXACT \\\`column_names\\\` identified. Explain as "Calculating financial ratios".
    4.  **(Analyze Result)** Internally analyze the numeric result returned by the tool.
    5.  **(Generate Report - Optional)** Use \\\`generate_report_code\\\`. Explain as "Generating report".
    6.  **(Answer User)** Use \\\`_answerUserTool\\\` to present the ratio values. Explain as "Summarizing findings".
*   **CRITICAL:** When calling \\\`generate_report_code\\\` or \\\`_answerUserTool\\\` after successful analysis/calculation, use the figures shown in \\\`Actual Analysis Results\\\` above for your summary or final text. Do NOT use numbers from the \`Current Turn Progress\` tool result summaries for these steps.`;
    }

    _buildModificationHandling() { /* ... (implementation from previous steps) ... */
        return `**MODIFICATION HANDLING:** If the user asks to **modify** the *most recently generated report* (e.g., change title, remove chart, add column) AND the modification **does not require new calculations**:
    a. **REUSE** the previous analysis data (summarized under \\\`Previous Turn Artifacts\\\`).
    b. Explain you are "Updating the report component" inside \`<thinking>\`.
    c. Your primary action should be \`generate_report_code\`. Provide ONLY the \`analysis_summary\` describing the modification and the relevant \`dataset_id\`. The system will use the previous analysis data automatically.
    d. **DO NOT** call \`list_datasets\`, \`get_dataset_schema\`, \`parse_csv_data\`, \`generate_analysis_code\`, or \`execute_analysis_code\` unless the modification clearly requires re-running the underlying data analysis.`;
    }

     _buildErrorHandling() { /* ... (implementation from previous steps) ... */
         return `**ERROR HANDLING:** If the *last step* in 'Current Turn Progress' shows a tool call resulted in an 'Error:',
    a. Explain to the user that a step failed (e.g., "I encountered an error while running the analysis.") inside \`<thinking>\`.
    b. Use the \\\`_answerUserTool\\\` to inform the user you cannot proceed with that specific path and suggest they try rephrasing or asking something else.
    c. DO NOT attempt to call the *same* tool again immediately after it failed in the previous step, unless the error code explicitly suggests a retry (e.g., temporary issue) AND you modify the arguments. Prefer using \\\`ask_user_for_clarification\\\` if missing info caused the error.`;
    }

     _buildClarificationGuidance() { // Added for Phase 9
         return `**Requesting Clarification:** If the user's request is ambiguous (e.g., asks for a ratio without clear columns), if required information is missing from the context, or if a previous tool failed because information was missing, YOU MUST use the \\\`ask_user_for_clarification\\\` tool. Formulate a specific, concise question for the user. Explain *why* you need the clarification in your \\\`<thinking>\\\` block.`;
     }

    _buildFinalInstruction() {
         return `Remember to provide your \`<thinking>\` block *first*, then the JSON action object on its own lines if required. Ensure the action JSON format is exactly as specified, especially for \`_answerUserTool\` which requires \`{"textResponse": "..."}\` inside \`args\`. Respond now.`;
    }
}

module.exports = SystemPromptBuilder;