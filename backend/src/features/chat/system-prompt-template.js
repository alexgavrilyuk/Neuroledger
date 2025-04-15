// backend/src/features/chat/system-prompt-template.js
/**
 * This file contains the system prompt template for Claude.
 * The template is a function that takes contextual parameters and returns the formatted system prompt.
 */

// Remove the circular dependency - AgentOrchestrator is not needed here.
// const { AgentOrchestrator } = require('./agent.service'); 

// --- Add Helper Function for Formatting Numbers --- 
const formatCurrency = (value) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const formatPercentage = (value, decimals = 1) => {
    if (typeof value !== 'number' || isNaN(value)) return 'N/A';
    // Simple percentage formatting for the prompt
    return value.toFixed(decimals) + '%';
};
// --- End Helper Function ---

/**
 * Generates the system prompt for the NeuroLedger Financial Agent (Claude).
 */

/**
 * Generates the system prompt for the Agent's reasoning step.
 *
 * @param {Object} contextParams - Parameters for the prompt.
 * @param {string} [contextParams.userContext] - General business context from user settings.
 * @param {string} [contextParams.teamContext] - General business context from team settings.
 * @param {Array} contextParams.currentTurnSteps - Steps taken so far in this turn (tool calls and results).
 * @param {Array} contextParams.availableTools - Descriptions of tools the agent can use.
 * @param {object|null} [contextParams.analysisResult] - The actual result object from a previous code execution step.
 * @param {string|null} [contextParams.previousAnalysisResultSummary] - Summary of analysis result from the relevant previous turn.
 * @param {boolean} [contextParams.hasPreviousGeneratedCode] - Flag indicating if code was generated in the relevant previous turn.
 * @param {Object} [contextParams.datasetSchemas] - Schemas for datasets preloaded for the session.
 * @param {Object} [contextParams.datasetSamples] - Sample data for datasets preloaded for the session.
 * @returns {string} - The formatted system prompt.
 */
const generateAgentSystemPrompt = (contextParams) => {
  const { 
    userContext, 
    teamContext, 
    currentTurnSteps, 
    availableTools, 
    analysisResult, 
    previousAnalysisResultSummary, 
    hasPreviousGeneratedCode,
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
      turnStepsText += `${index + 1}. Tool Used: ${step.tool}\n`;
      turnStepsText += `   Args: ${JSON.stringify(step.args)}\n`;
      turnStepsText += `   Result Summary: ${step.resultSummary || 'N/A'}\n`; // Use summary
      // Optionally include full result if small? For now, stick to summary.
    });
  }

  // --- Add Info about Previous Turn Artifacts --- 
  let previousArtifactsText = 'No relevant analysis/report artifacts found from previous turns.';
  if (previousAnalysisResultSummary) {
      previousArtifactsText = '**Previous Turn Artifacts (If applicable):**\n';
      previousArtifactsText += `- Analysis Result Summary: ${previousAnalysisResultSummary}\n`;
      previousArtifactsText += `- Generated Code Exists: ${hasPreviousGeneratedCode ? 'Yes' : 'No'}\n`;
  }
  // --- End Previous Artifacts Info ---

  // --- Add Dataset Information --- 
  let datasetInfoText = '';
  const datasetIds = Object.keys(datasetSchemas);
  
  if (datasetIds.length > 0) {
    datasetInfoText = '\n**AVAILABLE DATASETS - CRITICAL INFORMATION:**\n';
    datasetInfoText += '\n⚠️ **CRITICAL: YOU MUST USE THE EXACT DATASET IDs LISTED BELOW WITH THE `parse_csv_data` TOOL** ⚠️\n';
    datasetInfoText += '\n**DO NOT MAKE UP DATASET IDs. ONLY USE THE MONGODB OBJECTID VALUES SHOWN BELOW.**\n\n';
    
    datasetIds.forEach(datasetId => {
      const schema = datasetSchemas[datasetId];
      const samples = datasetSamples[datasetId];
      
      // Dataset header and description
      datasetInfoText += `\n## Dataset ID: ${datasetId}\n`;
      datasetInfoText += `Description: ${schema.description || 'No description available'}\n\n`;
      datasetInfoText += `**CRITICAL WARNING: When using the \`parse_csv_data\` tool, you MUST use this EXACT MongoDB ObjectId: \`${datasetId}\`**\n`;
      datasetInfoText += `**DO NOT use any other identifier, name, or a made-up ID. Only the exact 24-character hex string above will work.**\n\n`;
      
      // Column schema information
      datasetInfoText += `### Schema Information:\n`;
      if (schema.schemaInfo && schema.schemaInfo.length > 0) {
        schema.schemaInfo.forEach(column => {
          const description = schema.columnDescriptions ? (schema.columnDescriptions[column.name] || 'No description') : 'No description';
          datasetInfoText += `- **${column.name}** (${column.type || 'unknown type'}): ${description}\n`;
        });
      } else {
        datasetInfoText += `No schema information available.\n`;
      }
      
      // Sample data
      if (samples && samples.sampleRows && samples.sampleRows.length > 0) {
        datasetInfoText += `\n### Sample Data (Last ${samples.sampleRows.length} rows of ${samples.totalRows} total):\n`;
        datasetInfoText += `\`\`\`json\n${JSON.stringify(samples.sampleRows, null, 2)}\n\`\`\`\n`;
      }
    });
  }
  // --- End Dataset Information ---

  // --- Format Actual Analysis Results (if available) --- 
  let formattedAnalysisResult = 'No analysis has been performed yet this turn.';
  if (analysisResult && typeof analysisResult === 'object') {
    formattedAnalysisResult = '**Actual Analysis Results (MUST USE for Summarization/Report Args):**\n';
    try {
      // MODIFIED: Handle arbitrary JSON structure instead of assuming specific financial structure
      // Use a recursive approach to format key-value pairs from the JSON object
      const formatJsonValue = (value) => {
        if (value === null || value === undefined) return 'N/A';
        if (typeof value === 'number') {
          // If it looks like a percentage (between 0 and 1 or ends with %)
          if ((value >= 0 && value <= 1 && `${value}`.includes('.')) || 
              (typeof value === 'string' && value.endsWith('%'))) {
            return formatPercentage(value, 1);
          }
          // Otherwise treat as currency/number
          return formatCurrency(value);
        }
        if (typeof value === 'string') return value;
        if (typeof value === 'boolean') return value ? 'Yes' : 'No';
        if (Array.isArray(value)) {
          if (value.length === 0) return '[]';
          if (value.length <= 3) {
            // Format small arrays inline
            return `[${value.map(item => formatJsonValue(item)).join(', ')}]`;
          }
          // For larger arrays, just show count
          return `Array with ${value.length} items`;
        }
        if (typeof value === 'object') {
          // For objects, indicate it's an object with its keys
          const keys = Object.keys(value);
          if (keys.length === 0) return '{}';
          if (keys.length <= 3) {
            return `{ ${keys.join(', ')} }`;
          }
          return `Object with ${keys.length} properties`;
        }
        return String(value);
      };
      
      // Build formatted result by traversing the top-level properties
      const formatObject = (obj, prefix = '', maxDepth = 1, currentDepth = 0) => {
        let result = '';
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const value = obj[key];
            const formattedKey = `${prefix}${key}`;
            
            // Handle different value types
            if (typeof value === 'object' && value !== null && !Array.isArray(value) && currentDepth < maxDepth) {
              // For objects, recurse with indentation if not at max depth
              result += `- ${formattedKey}:\n`;
              const nestedResult = formatObject(value, '  ', maxDepth, currentDepth + 1);
              if (nestedResult.trim() === '') {
                result += `  (Empty object)\n`;
              } else {
                result += nestedResult;
              }
            } else {
              // For primitive values or max depth reached, format directly
              result += `- ${formattedKey}: ${formatJsonValue(value)}\n`;
            }
          }
        }
        return result;
      };
      
      // Format the analysis result with moderate depth for proper summarization
      const formatted = formatObject(analysisResult, '', 2);
      if (formatted.trim() === '') {
        formattedAnalysisResult += '(Analysis result is empty or contains no data)\n';
      } else {
        formattedAnalysisResult += formatted;
      }
    } catch (e) {
      console.error('[System Prompt] Error formatting analysisResult:', e);
      formattedAnalysisResult = '**Actual Analysis Results:** Error formatting results.\n';
    }
  } else {
      // If analysisResult is null or not an object, explicitly state it.
      formattedAnalysisResult = '**Actual Analysis Results:** None available in context.';
  }
  // --- End Analysis Result Formatting ---

  // Construct the prompt
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

**IMPORTANT INSTRUCTIONS:**
*   **Dataset schema and sample data are already provided above. You do NOT need to use the list_datasets or get_dataset_schema tools.**
*   Analyze 'Current Turn Progress' / previous step results before deciding action.
*   Do NOT call a tool if info already available in the current turn.
*   Typical Workflow for Analysis:
    1. Use \`parse_csv_data\` to parse the required dataset.
    2. Use \`generate_analysis_code\` to create analysis code.
    3. Use \`execute_analysis_code\` to run the analysis code.
    4. Analyze the result from \`execute_analysis_code\`. 
    5. **If the user asked for a report AND the analysis in step 4 was successful, you MUST use \`generate_report_code\`. Provide ONLY the \`analysis_summary\` argument in your tool call JSON.** The system will use the analysis results already in context. **Do NOT call \`generate_report_code\` if analysis has not been successfully executed in a previous step of THIS turn.**
*   The \`execute_analysis_code\` tool runs in a restricted sandbox. Code MUST use the \`inputData\` variable and call \`sendResult(data)\`. \n    **IMPORTANT:** The \`inputData\` variable will contain an array of JavaScript objects, already parsed from the CSV according to the schema (e.g., numbers will be numbers, dates might be strings but typically ISO format). **Your generated analysis code MUST directly access properties on these objects (e.g., \`row.Income\`, \`row.Date\`) and SHOULD NOT include its own logic to re-parse numbers (like \`parseFloat\` or \`parseInt\`) or dates (like \`new Date()\`).** Assume the data types are correct in \`inputData\`. NO file reading or network calls allowed.\n
*   Ensure JSON for tool calls is correctly escaped, especially code strings for \`execute_analysis_code\` (newlines \\n, quotes \\", etc.).
*   Base analysis ONLY on history and tool results.
*   **CRITICAL: When calling \`generate_report_code\` or \`_answerUserTool\` after successful analysis, use the figures shown in \`Actual Analysis Results\` above for your summary or final text. Do NOT use numbers from the \`Current Turn Progress\` tool result summaries for these steps.**
*   **MODIFICATION HANDLING:** If the user asks to **modify** a previous report/analysis (e.g., change title, remove chart, add column) AND the modification **does not require new calculations**: \n    a. **REUSE** the previous analysis data (summarized under \`Previous Turn Artifacts\`). \n    b. Your primary action should be \`generate_report_code\`. Provide ONLY the \`analysis_summary\` argument describing the modification. The system will use the previous analysis data automatically.\n    c. **DO NOT** call \`list_datasets\`, \`get_dataset_schema\`, \`parse_csv_data\`, \`generate_analysis_code\`, or \`execute_analysis_code\` unless the modification clearly requires re-running the underlying data analysis.\n*   **ERROR HANDLING:** If the *last step* in 'Current Turn Progress' shows a tool call resulted in an 'Error:', DO NOT call the same tool again immediately. Instead, use the \`_answerUserTool\` to inform the user that the action failed and you cannot proceed with that specific step.
*   Handle tool errors appropriately.
*   **REPORT VISUALIZATION GUIDELINES (for \`generate_report_code\`):**
*     - **Modern Aesthetics:** Design the report with a clean, modern look. Use ample whitespace, clear typography, and a professional color scheme. Avoid cluttered layouts.
*     - **Visual Hierarchy:** Structure the report logically using clear headings, subheadings, and consistent spacing. Key findings should be easily identifiable.
*     - **Clarity & Readability:** Ensure all text is legible. Charts and tables must have clear titles, axes labels, legends, and tooltips where appropriate. Data visualizations should be easy to interpret and tell a story.
*     - **Component Styling:** Use consistent styling for components (e.g., cards, charts, tables) throughout the report.
*     - **Chart Design:** For charts (using Recharts), ensure axes are clearly labeled and formatted appropriately (use \`formatNumber\` or \`formatCurrency\` helpers as needed for tick formatters, following the critical axis formatting rules below). Use tooltips to show precise values on hover. Choose chart types suitable for the data being presented.
*     - **Responsiveness (Conceptual):** While the container is fixed, design components to be somewhat flexible, avoiding hardcoded widths that might break easily.
*     - **Accessibility:** Use semantic HTML elements where appropriate (e.g., \`<h2>\`, \`<table>\`, \`<p>\`). Ensure sufficient color contrast.
*     - **PDF/Print Considerations (See Below):** Include CSS rules to improve page breaks for printing/PDF export.
*   Output ONLY ONE valid JSON object for a single tool call in your response. Do not include any other text, explanations, or additional JSON objects before or after the tool call JSON.
*   **CODE GENERATION GUIDELINE:** When writing code (for analysis or reports), if you pass a helper function (like a formatter) as an argument to another function (like a data table renderer), ensure the helper function is called with the correct number and type of arguments it expects. If the calling function provides extra arguments that the helper doesn't handle (e.g., passing the whole data row when the formatter only needs the value), wrap the helper function call in an anonymous function (e.g., \`(value) => formatCurrency(value)\`) to ensure the correct signature is used.\n
*   **CHART AXIS FORMATTING (CRITICAL):** When formatting numeric ticks on chart axes (e.g., using \`tickFormatter\` in Recharts): \n    a. **DO NOT EVER pass an empty string (\`''\`) as the currency code to \`formatCurrency\`. This WILL cause errors.** \n    b. **DO NOT use \`.replace()\` immediately after calling \`formatCurrency(value, '')\`. This pattern is invalid.**\n    c. **PREFERRED METHOD:** If you need numbers on an axis *without* a currency symbol, use the \`formatNumber(value)\` helper function directly in the \`tickFormatter\`. Example: \`tickFormatter: (value) => formatNumber(value)\`\n    d. (Alternative) If you must use currency formatting first, call \`formatCurrency\` correctly (e.g., \`formatCurrency(value)\`) and *then* apply string manipulation like \`.slice(1)\` to the *result*, only if absolutely necessary and you know the symbol's position.\n
*   **FINAL STEP AFTER REPORT:** If the last step in 'Current Turn Progress' shows that the \`generate_report_code\` tool was used **successfully**, your **next and final action** for this turn MUST be to use the \`_answerUserTool\` to inform the user the report has been generated or modified. Do not call \`generate_report_code\` again in the same turn.\n
*   **PDF/PRINT STYLING (CRITICAL for \`generate_report_code\`):** When generating the React component code, you **MUST** include a literal \`<style>\` tag within the main returned JSX fragment. This tag **MUST** contain an \`@media print\` block. Inside this block, define CSS rules to prevent elements like charts, tables, or logical sections (e.g., elements with class '.report-card', '.kpi-container', '.chart-wrapper', '.data-table-wrapper' - adapt selectors based on your generated structure) from being awkwardly split across PDF pages. Use the following CSS properties within the \`@media print\` block:
*     - \`page-break-inside: avoid !important;\` on container elements that should stay intact on a single page.
*     - \`page-break-before: auto;\` (usually default, but can be \`always\` to force a new page before an element if needed for logical grouping).
*     - \`page-break-after: auto;\` (or \`always\` to force a break after an element, e.g., \`page-break-after: avoid !important;\` for headings like h2, h3 to prevent breaks right after them).
*   **Example Structure (MUST INCLUDE STYLE TAG IN OUTPUT):**
*     \`\`\`jsx
*     // IMPORTANT: Include this <style> tag directly in your returned JSX
*     const printStyles = \`
*       @media print {
*         .report-card, .chart-wrapper { /* Adapt selectors! */
*           page-break-inside: avoid !important;
*         }
*         h2, h3 {
*            page-break-after: avoid !important; /* Prevent break after heading */
*         }
*         /* Add more rules as needed for your specific layout */
*       }
*     \`; // Use backticks for the CSS string
*
*     return (
*       <React.Fragment>
*         <style>{printStyles}</style>
*         {/* ... rest of your report JSX ... */}
*       </React.Fragment>
*     );
*     \`\`\`
*   **Ensure the CSS selectors used target the actual container elements in your generated report code.**
*   Now, analyze the user\'s latest query which is provided as the final message in the conversation history...`;
};

module.exports = generateAgentSystemPrompt;

