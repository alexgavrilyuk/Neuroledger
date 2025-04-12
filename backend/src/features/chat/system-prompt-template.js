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
 * @returns {string} - The formatted system prompt.
 */
const generateAgentSystemPrompt = (contextParams) => {
  const { userContext, teamContext, currentTurnSteps, availableTools, analysisResult, previousAnalysisResultSummary, hasPreviousGeneratedCode } = contextParams;

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

  // --- Format Actual Analysis Results (if available) --- 
  let formattedAnalysisResult = 'No analysis has been performed yet this turn.';
  if (analysisResult && typeof analysisResult === 'object') {
    formattedAnalysisResult = '**Actual Analysis Results (MUST USE for Summarization/Report Args):**\n';
    try {
      // Extract key figures safely using optional chaining
      const overview = analysisResult.summary?.overview;
      const profitability = analysisResult.kpis?.profitability;
      const budgetKpis = analysisResult.kpis?.budgetPerformance;
      const expenseRatioKpis = analysisResult.kpis?.expenseRatio;

      if (overview) {
        formattedAnalysisResult += `- Total Income: ${formatCurrency(overview.totalIncome)}\n`;
        formattedAnalysisResult += `- Total Expenses: ${formatCurrency(overview.totalExpenses)}\n`;
        formattedAnalysisResult += `- Net Profit: ${formatCurrency(overview.netProfit)}\n`;
        formattedAnalysisResult += `- Profit Margin: ${formatPercentage(overview.profitMargin, 1)}\n`;
      }
      if (profitability) {
        formattedAnalysisResult += `- Return on Expense: ${formatPercentage(profitability.returnOnExpense, 1)}\n`;
      }
      if (budgetKpis) {
        formattedAnalysisResult += `- Income vs Budget: ${formatPercentage(budgetKpis.incomePerformance, 2)}\n`;
        formattedAnalysisResult += `- Expenses vs Budget: ${formatPercentage(budgetKpis.expensePerformance, 2)}\n`;
        formattedAnalysisResult += `- Overall Budget Variance: ${formatCurrency(budgetKpis.overallBudgetVariance)}\n`;
      }
       if (expenseRatioKpis) {
         formattedAnalysisResult += `- Expense-to-Income Ratio: ${formatPercentage(expenseRatioKpis.expenseToIncomeRatio, 2)}\n`;
       }
      // Add more key figures if needed
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

**Current Turn Progress:**
${turnStepsText}

${previousArtifactsText}

**${formattedAnalysisResult}**

**User/Team Context:**
${userContext || teamContext ? `User Context: ${userContext || 'Not set.'}\nTeam Context: ${teamContext || 'Not set.'}` : 'No specific user or team context provided.'}

**Available Tools:**
You have access to the following tools. To use a tool, output ONLY a single JSON object in the following format:
\`\`\`json
{\n  \"tool\": \"<tool_name>\",\n  \"args\": {\n    \"<arg_name>\": \"<value>\",\n    ...\n  }\n}\`\`\`

Tool Definitions:
[\n${formattedTools}\n]

**IMPORTANT INSTRUCTIONS:**
*   Analyze 'Current Turn Progress' / previous step results before deciding action.
*   Do NOT call a tool if info already available in the current turn.
*   Typical Workflow for Analysis:
    1. Use \`list_datasets\` / \`get_dataset_schema\` to understand data.
    2. Use \`parse_csv_data\` to parse the required dataset.
    3. Use \`generate_analysis_code\` to create analysis code.
    4. Use \`execute_analysis_code\` to run the analysis code.
    5. Analyze the result from \`execute_analysis_code\`. \n    6. **If the user asked for a report AND the analysis in step 5 was successful, you MUST use \`generate_report_code\`. Provide ONLY the \`analysis_summary\` argument in your tool call JSON.** The system will use the analysis results already in context.
    7. Provide the final answer/summary using \`_answerUserTool\`. If a report was generated (step 6), the text answer should be a concise summary complementing the report.
*   The \`execute_analysis_code\` tool runs in a restricted sandbox. Code MUST use the \`inputData\` variable and call \`sendResult(data)\`. NO parsing allowed in this code.
*   Ensure JSON for tool calls is correctly escaped, especially code strings for \`execute_analysis_code\` (newlines \\n, quotes \\", etc.).
*   Base analysis ONLY on history and tool results.
*   **CRITICAL: When calling \`generate_report_code\` or \`_answerUserTool\` after successful analysis, use the figures shown in \`Actual Analysis Results\` above for your summary or final text. Do NOT use numbers from the \`Current Turn Progress\` tool result summaries for these steps.**
*   **MODIFICATION HANDLING:** If the user asks to **modify** a previous report/analysis (e.g., change title, remove chart, add column) AND the modification **does not require new calculations**: \n    a. **REUSE** the previous analysis data (summarized under \`Previous Turn Artifacts\`). \n    b. Your primary action should be \`generate_report_code\`. Provide ONLY the \`analysis_summary\` argument describing the modification. The system will use the previous analysis data automatically.\n    c. **DO NOT** call \`list_datasets\`, \`get_dataset_schema\`, \`parse_csv_data\`, \`generate_analysis_code\`, or \`execute_analysis_code\` unless the modification clearly requires re-running the underlying data analysis.\n*   **ERROR HANDLING:** If the *last step* in 'Current Turn Progress' shows a tool call resulted in an 'Error:', DO NOT call the same tool again immediately. Instead, use the \`_answerUserTool\` to inform the user that the action failed and you cannot proceed with that specific step.
*   Handle tool errors appropriately.\n*   Output ONLY ONE valid JSON object for a single tool call in your response. Do not include any other text, explanations, or additional JSON objects before or after the tool call JSON.\n\nNow, analyze the user\'s latest query which is provided as the final message in the conversation history...`;
};

// Replace the old export with the new one
module.exports = generateAgentSystemPrompt;

// Remove the old generateSystemPrompt function if it's no longer needed.
// Or keep it if the old /prompts endpoint still needs it temporarily.
// For now, we assume it's replaced.
/*
const generateSystemPrompt = (contextParams) => {
  // ... old code ...
};
*/