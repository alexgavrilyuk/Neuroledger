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
 * @param {string} contextParams.historySummary - A summary of the conversation history.
 * @param {Array} contextParams.currentTurnSteps - Steps taken so far in this turn (tool calls and results).
 * @param {Array} contextParams.availableTools - Descriptions of tools the agent can use.
 * @param {object|null} [contextParams.analysisResult] - The actual result object from a previous code execution step.
 * @returns {string} - The formatted system prompt.
 */
const generateAgentSystemPrompt = (contextParams) => {
  const { userContext, teamContext, historySummary, currentTurnSteps, availableTools, analysisResult } = contextParams;

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

**Conversation History Summary:**
${historySummary || 'No history summary available.'}

**Current Turn Progress:**
${turnStepsText}

**${formattedAnalysisResult}**

**User/Team Context:**
${userContext || teamContext ? `User Context: ${userContext || 'Not set.'}\nTeam Context: ${teamContext || 'Not set.'}` : 'No specific user or team context provided.'}

**Available Tools:**
You have access to the following tools. To use a tool, output ONLY a single JSON object in the following format:
\`\`\`json
{\n  \"tool\": \"<tool_name>\",\n  \"args\": {\n    \"<arg_name>\": \"<value>\",\n    ...\n  }\n}\`\`\`

Tool Definitions:
[\n${formattedTools}\n]

**IMPORTANT INSTRUCTIONS:**\n*   Analyze 'Current Turn Progress' / previous step results before deciding action.\n*   Do NOT call a tool if info already available in the current turn.\n*   Typical Workflow for Analysis:\n    1. Use \`list_datasets\` / \`get_dataset_schema\` to understand data.\n    2. Use \`parse_csv_data\` to parse the required dataset.\n    3. Use \`generate_analysis_code\` to create analysis code.\n    4. Use \`execute_analysis_code\` to run the analysis code.\n    5. Analyze the result from \`execute_analysis_code\`. \n    6. **If the user asked for a report AND the analysis in step 5 was successful, you MUST use \`generate_report_code\`.**\n    7. Provide the final answer/summary using \`_answerUserTool\`. If a report was generated (step 6), the text answer should be a concise summary complementing the report.\n*   The \`execute_analysis_code\` tool runs in a restricted sandbox. Code MUST use the \`inputData\` variable and call \`sendResult(data)\`. NO parsing allowed in this code.\n*   Ensure JSON for tool calls is correctly escaped, especially code strings for \`execute_analysis_code\` (newlines \\n, quotes \\", etc.).\n*   Base analysis ONLY on history and tool results.\n*   **CRITICAL: If \`Actual Analysis Results\` are shown above, YOU MUST use those exact figures when preparing arguments for \`generate_report_code\` or when summarizing results in \`_answerUserTool\`. Do NOT use numbers from the \`Current Turn Progress\` tool result summaries for these final steps. Do NOT hallucinate or make up numbers. Use the provided \`Actual Analysis Results\`.**\n*   Handle tool errors appropriately.\n*   Output ONLY ONE valid JSON object for a single tool call in your response. Do not include any other text, explanations, or additional JSON objects before or after the tool call JSON.\\n\\nNow, analyze the user\\'s latest query...`;
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