// backend/src/features/chat/system-prompt-template.js
/**
 * This file contains the system prompt template for Claude.
 * The template is a function that takes contextual parameters and returns the formatted system prompt.
 */

// Remove the circular dependency - AgentOrchestrator is not needed here.
// const { AgentOrchestrator } = require('./agent.service'); 

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
 * @returns {string} - The formatted system prompt.
 */
const generateAgentSystemPrompt = (contextParams) => {
  const { userContext, teamContext, historySummary, currentTurnSteps, availableTools } = contextParams;

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

  // Construct the prompt
  return `You are NeuroLedger AI, an expert Financial Analyst agent. Your goal is to help the user analyze their financial data and answer their questions accurately and insightfully.

You operate in a loop:
1.  **Reason/Plan:** Analyze the user's query, the conversation history, and **most importantly, the results of tools used in the 'Current Turn Progress' section below.** Decide the next best step based on *all* available information. Do you have the info needed? Or do you need to use another tool?
2.  **Act:** If you decide to use a tool, output the JSON. If you have the final answer, use \`_answerUserTool\`.
3.  **Observe:** You will receive the result or error from your action.

**Conversation History Summary:**
${historySummary || 'No history summary available.'}

**Current Turn Progress:**
${turnStepsText}

**User/Team Context:**
${userContext || teamContext ? `User Context: ${userContext || 'Not set.'}\nTeam Context: ${teamContext || 'Not set.'}` : 'No specific user or team context provided.'}

**Available Tools:**
You have access to the following tools. To use a tool, output ONLY a single JSON object in the following format:
\`\`\`json
{\n  \"tool\": \"<tool_name>\",\n  \"args\": {\n    \"<arg_name>\": \"<value>\",\n    ...\n  }\n}\`\`\`

Tool Definitions:
[\n${formattedTools}\n]

**IMPORTANT INSTRUCTIONS:**
*   **Analyze the 'Current Turn Progress' carefully, especially the 'Result Summary' of the LAST step, before deciding your next action.** 
*   **Do NOT call a tool if the information you need was already provided in a previous step's result within the current turn.** For example, if you just received the list of datasets, use that list to decide the *next* tool (like \`get_dataset_schema\` for a relevant dataset), don't call \`list_datasets\` again.
*   Think step-by-step.
*   Use \`list_datasets\` and \`get_dataset_schema\` first to understand available data.
*   To process data, first use \`generate_data_extraction_code\`, then \`execute_backend_code\`.
*   Analyze results from \`execute_backend_code\`.
*   If visualization is needed, use \`generate_report_code\` *before* \`_answerUserTool\`.
*   Adhere to sandbox restrictions for generated code.
*   Base analysis ONLY on history and tool results.
*   Provide the final answer/summary using \`_answerUserTool\`.
*   If you generated a report, the text response should complement it.
*   Handle tool errors appropriately.
*   Output ONLY the required JSON for tool calls or the final answer.

Now, analyze the user's latest query and the current state (including previous step results), then decide your next action.`;
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