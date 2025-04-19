// ================================================================================
// FILE: backend/src/features/chat/agent.utils.js
// PURPOSE: Contains utility functions for the agent.
// PHASE 2 UPDATE: formatToolResultForLLM now includes errorCode.
// ================================================================================

const logger = require('../../shared/utils/logger');

/**
 * Generates a concise summary string from a tool execution result object.
 * Used for logging agent steps and providing context to the agent status updates.
 * Handles common result structures (errors, parsed data, generated code) and truncates long outputs.
 *
 * @param {object} result - The result object from a tool call. Expected structure: { status: 'success'|'error', result?: any, error?: string | object, errorCode?: string }.
 * @returns {string} A human-readable summary string of the tool result.
 */
function summarizeToolResult(result) {
    if (!result) return 'Tool returned null or undefined.';

    // Handle errors first
    if (result.error) {
        const errMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
        const codePart = result.errorCode ? ` (Code: ${result.errorCode})` : '';
        // Truncate long errors for summary
        const truncatedMsg = errMsg.substring(0, 150) + (errMsg.length > 150 ? '...' : '');
        return `Error: ${truncatedMsg}${codePart}`;
    }

    // Handle successful results
    if (result.result !== undefined && result.result !== null) {
        const data = result.result;
        if (typeof data === 'object') {
            // Specific handling for known successful tool result structures
             if (typeof data.rowCount === 'number' && data.summary?.includes('parsed')) {
                 // Heuristic for parse_csv_data result summary
                 return `Success: ${data.summary || `Parsed ${data.rowCount} rows.`}`;
             }
            if (typeof data.rowCount === 'number' && Array.isArray(data.schemaInfo)) {
                 // Heuristic for get_dataset_schema result
                 return `Success: Retrieved schema (${data.schemaInfo.length} columns).`;
            }
            if (typeof data.code === 'string') {
                return `Success: Generated analysis code snippet (length: ${data.code.length}).`;
            }
             if (typeof data.react_code === 'string') {
                 return `Success: Generated React report code snippet (length: ${data.react_code.length}).`;
             }
             if (Array.isArray(data.result) && data.result.length > 0 && data.result[0]._id && data.result[0].name) {
                // Heuristic for list_datasets result (assuming result structure from tool)
                 return `Success: Found ${data.result.length} dataset(s).`;
             }
             if (typeof data.isFinalAnswer === 'boolean' && data.isFinalAnswer) {
                 return 'Success: Final answer signal received.';
             }
             // Heuristic for execute_analysis_code result
             if (data.result !== undefined) { // Check if the inner 'result' property exists from the sandbox
                  try {
                      const summary = JSON.stringify(data.result);
                      return `Success: Code executed. Result: ${summary.substring(0, 100)}${summary.length > 100 ? '...' : ''}`;
                  } catch (e) {
                      return 'Success: Code executed [Result not summarizable]';
                  }
             }

            // Generic object summary (fallback)
            try {
                 const summary = JSON.stringify(data);
                 return `Success: ${summary.substring(0, 150)}${summary.length > 150 ? '...' : ''}`;
            } catch (e) {
                 return 'Success: [Object result, could not stringify]';
            }
        }
        // Handle primitive results (numbers, strings, booleans)
        return `Success: ${String(data).substring(0, 150)}${String(data).length > 150 ? '...' : ''}`;
    }

    // Handle case where tool succeeded but returned no specific 'result' payload
    return 'Tool executed successfully with no specific output.';
}


/**
 * Formats the result of a tool execution into a structured JSON string suitable
 * for inclusion in the LLM's context for the next reasoning step.
 *
 * Summarizes large results (like code or parsed data) to avoid excessive context length.
 * Truncates long error messages and includes error codes.
 *
 * @param {string} toolName - The name of the tool that was executed.
 * @param {object} toolResult - The result object from the tool execution. Expected structure: { status: 'success'|'error', result?: any, error?: string | object, errorCode?: string }.
 * @returns {string} A JSON string representing the formatted tool result (e.g., '{"tool_name": "parse_csv_data", "status": "success", "result_summary": "Successfully parsed 100 rows."}').
 */
function formatToolResultForLLM(toolName, toolResult) {
     if (!toolResult) {
         return JSON.stringify({ tool_name: toolName, status: 'error', error: 'Tool returned null or undefined.', errorCode: 'TOOL_RETURNED_NULL' });
     }

     // Format error results, including errorCode
     if (toolResult.error) {
         const errMsg = typeof toolResult.error === 'string' ? toolResult.error : JSON.stringify(toolResult.error);
         const truncatedError = errMsg.substring(0, 500) + (errMsg.length > 500 ? '...' : '');
         return JSON.stringify({
             tool_name: toolName,
             status: 'error',
             error: truncatedError,
             errorCode: toolResult.errorCode || 'UNKNOWN_ERROR' // Include errorCode
            });
     }

     // Format success results
     let resultSummary = 'Tool executed successfully.'; // Default summary
     let resultPayload = null; // Payload to include (usually summarized)

     if (toolResult.result !== undefined && toolResult.result !== null) {
         const data = toolResult.result;
         // --- Summarization Logic ---
         if ((toolName === 'generate_analysis_code' || toolName === 'generate_report_code') && typeof data === 'object') {
             const codeKey = data.code ? 'code' : 'react_code';
             const codeSnippet = data[codeKey] || '';
             resultSummary = `Generated code snippet (length: ${codeSnippet.length}). Code is available in agent memory.`;
             // resultPayload = { code_generated: true }; // Don't send code back
         } else if (toolName === 'parse_csv_data' && typeof data === 'object' && (data.rowCount !== undefined || data.summary)) {
              resultSummary = data.summary || `Successfully parsed ${data.rowCount} rows. Data is available in agent memory.`;
              // resultPayload = { rows_parsed: data.rowCount }; // Don't send data back
         } else if (toolName === 'execute_analysis_code' && typeof data === 'object') {
              try {
                  // Attempt to stringify and truncate the execution result for preview
                  const resultString = JSON.stringify(data.result); // Access inner 'result' from sandbox
                  const truncatedResult = resultString.substring(0, 500) + (resultString.length > 500 ? '...' : '');
                  resultSummary = 'Code executed successfully. Full result stored in agent memory.';
                  try { // Try parsing truncated result back to object for cleaner JSON
                    resultPayload = { result_preview: JSON.parse(truncatedResult) };
                  } catch {
                    resultPayload = { result_preview: truncatedResult }; // Send truncated string if not valid JSON
                  }
              } catch (e) {
                  logger.warn(`Could not stringify execute_analysis_code result for LLM context: ${e.message}`);
                  resultSummary = 'Code executed successfully, result preview unavailable.';
                  // resultPayload = { execution_status: 'success' };
              }
         } else if (toolName === 'list_datasets' && Array.isArray(data)) {
              resultSummary = `Found ${data.length} dataset(s).`;
              // Send limited info back, not full descriptions
              resultPayload = data.slice(0, 5).map(d => ({ id: d._id, name: d.name, isTeam: d.isTeamDataset })); // Send only ID/name/team status of first 5
         } else if (toolName === 'get_dataset_schema' && typeof data === 'object' && data.schemaInfo) {
              resultSummary = `Retrieved schema (${data.schemaInfo.length} columns). Full schema stored in agent memory.`;
              // resultPayload = { columns: data.schemaInfo.map(c=>c.name).slice(0,10) }; // Send first 10 col names?
         } else if (toolName === '_answerUserTool') {
              resultSummary = 'Final answer provided to user.';
              // resultPayload = { final_answer_sent: true };
         } else {
             // Generic fallback summarization for other successful results
             try {
                 const resultString = JSON.stringify(data);
                 resultSummary = `Tool execution succeeded. Result preview: ${resultString.substring(0, 150)}${resultString.length > 150 ? '...' : ''}`;
                 // Maybe include small primitive results directly
                 if (resultString.length <= 150 && (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean')) {
                      resultPayload = data;
                 }
             } catch (e) {
                 resultSummary = 'Tool executed successfully, but result could not be summarized.';
             }
         }
     }

     // Construct the final JSON object for the LLM
     const finalLLMResult = {
         tool_name: toolName,
         status: 'success',
         result_summary: resultSummary,
     };
     // Conditionally add the payload if it was created
     if (resultPayload !== null) {
          finalLLMResult.result = resultPayload;
     }

     return JSON.stringify(finalLLMResult);
}


module.exports = {
    summarizeToolResult,
    // parseLLMResponse, // Removed - logic moved to LLMOrchestrator
    formatToolResultForLLM,
};