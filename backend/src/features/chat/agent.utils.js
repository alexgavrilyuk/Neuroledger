// ================================================================================
// FILE: NeuroLedger copy/backend/src/features/chat/agent.utils.js
// PURPOSE: Contains utility functions for the agent. parseLLMResponse moved.
// MODIFIED FILE
// ================================================================================

const logger = require('../../shared/utils/logger');

/**
 * Generates a concise summary string from a tool execution result object.
 * Used for logging agent steps and providing context to the agent status updates.
 * Handles common result structures (errors, parsed data, generated code) and truncates long outputs.
 *
 * @param {object} result - The result object from a tool call. Expected structure: { status: 'success'|'error', result?: any, error?: string | object }.
 * @returns {string} A human-readable summary string of the tool result.
 */
function summarizeToolResult(result) {
    if (!result) return 'Tool returned null or undefined.';

    // Handle errors first
    if (result.error) {
        const errMsg = typeof result.error === 'string' ? result.error : JSON.stringify(result.error);
        // Truncate long errors for summary
        return `Error: ${errMsg.substring(0, 200)}${errMsg.length > 200 ? '...' : ''}`;
    }

    // Handle successful results
    if (result.result !== undefined && result.result !== null) {
        const data = result.result;
        if (typeof data === 'object') {
            // Specific handling for known successful tool result structures
             if (data.parsedData && typeof data.rowCount === 'number') {
                // Check if parsedData is array for accurate summary
                 const rowCount = Array.isArray(data.parsedData) ? data.parsedData.length : data.rowCount;
                 return `Success: Parsed data (${rowCount} rows).`;
             }
            if (typeof data.rowCount === 'number' && Array.isArray(data.columns)) {
                 return `Success: Retrieved data, rows: ${data.rowCount}, columns: [${data.columns.join(', ')}]`;
            }
            if (typeof data.code === 'string') {
                return `Success: Generated analysis code snippet (length: ${data.code.length}).`;
            }
             if (typeof data.react_code === 'string') {
                 return `Success: Generated React report code snippet (length: ${data.react_code.length}).`;
             }
             if (Array.isArray(data.datasets) && data.datasets.length > 0 && data.datasets[0]._id && data.datasets[0].name) {
                // Heuristic for list_datasets result
                return `Success: Found ${data.datasets.length} dataset(s).`;
             }
              if (Array.isArray(data.schemaInfo)) { // Removed rowCount check as it might not always be present
                 // Heuristic for get_dataset_schema result
                 return `Success: Retrieved schema (${data.schemaInfo.length} columns).`;
             }
             if (typeof data.isFinalAnswer === 'boolean' && data.isFinalAnswer) {
                 return 'Success: Final answer signal received.';
             }

            // Generic object summary (fallback)
            try {
                 const summary = JSON.stringify(data);
                 return `Success: ${summary.substring(0, 200)}${summary.length > 200 ? '...' : ''}`;
            } catch (e) {
                 return 'Success: [Object result, could not stringify]';
            }
        }
        // Handle primitive results (numbers, strings, booleans)
        return `Success: ${String(data).substring(0, 200)}${String(data).length > 200 ? '...' : ''}`;
    }

    // Handle case where tool succeeded but returned no specific 'result' payload
    return 'Tool executed successfully with no specific output.';
}


/**
 * Formats the result of a tool execution into a structured JSON string suitable
 * for inclusion in the LLM's context for the next reasoning step.
 *
 * Summarizes large results (like code or parsed data) to avoid excessive context length.
 * Truncates long error messages.
 *
 * @param {string} toolName - The name of the tool that was executed.
 * @param {object} toolResult - The result object from the tool execution. Expected structure: { status: 'success'|'error', result?: any, error?: string | object }.
 * @returns {string} A JSON string representing the formatted tool result (e.g., '{"tool_name": "parse_csv_data", "status": "success", "result_summary": "Successfully parsed 100 rows."}').
 */
function formatToolResultForLLM(toolName, toolResult) {
     if (!toolResult) {
         return JSON.stringify({ tool_name: toolName, status: 'error', error: 'Tool returned null or undefined.' });
     }
     if (toolResult.error) {
         const errMsg = typeof toolResult.error === 'string' ? toolResult.error : JSON.stringify(toolResult.error);
         // Truncate potentially long errors for the LLM context
         const truncatedError = errMsg.substring(0, 500) + (errMsg.length > 500 ? '...' : '');
         return JSON.stringify({ tool_name: toolName, status: 'error', error: truncatedError });
     }
     if (toolResult.result !== undefined && toolResult.result !== null) {
         // Special handling for code generation results to avoid flooding context
          if ((toolName === 'generate_analysis_code' || toolName === 'generate_report_code') && typeof toolResult.result === 'object') {
             const codeKey = toolResult.result.code ? 'code' : 'react_code';
             const codeSnippet = toolResult.result[codeKey] || '';
             return JSON.stringify({
                 tool_name: toolName,
                 status: 'success',
                 result_summary: `Generated code snippet (length: ${codeSnippet.length})`
                 // Avoid sending the full code back into context unless necessary
             });
         }
          // Special handling for data parsing results
         if (toolName === 'parse_csv_data' && typeof toolResult.result === 'object' && toolResult.result.parsedData) {
             const rowCount = Array.isArray(toolResult.result.parsedData) ? toolResult.result.parsedData.length : 0;
              // Provide a summary instead of the full data
             return JSON.stringify({
                 tool_name: toolName,
                 status: 'success',
                 result_summary: `Successfully parsed ${rowCount} rows.`
                 // Avoid sending parsed data back into context
             });
         }
         // Special handling for code execution result
         if (toolName === 'execute_analysis_code' && typeof toolResult.result === 'object') {
             try {
                 const resultString = JSON.stringify(toolResult.result);
                 const truncatedResult = resultString.substring(0, 500) + (resultString.length > 500 ? '...' : '');
                 return JSON.stringify({ tool_name: toolName, status: 'success', result_summary: 'Code executed successfully.', result_preview: JSON.parse(truncatedResult) });
             } catch (e) {
                 logger.warn(`Could not stringify execute_analysis_code result for LLM context: ${e.message}`);
                 return JSON.stringify({ tool_name: toolName, status: 'success', result_summary: 'Code executed successfully, result preview unavailable.' });
             }
         }

         // For other tools, try to stringify the result, truncating if necessary
         try {
             const resultString = JSON.stringify(toolResult.result);
             const truncatedResult = resultString.substring(0, 500) + (resultString.length > 500 ? '...' : '');
              // Parse back only if truncation happened, otherwise keep original type
             const finalResultPayload = resultString.length > 500 ? JSON.parse(truncatedResult) : toolResult.result;
             return JSON.stringify({ tool_name: toolName, status: 'success', result: finalResultPayload });
         } catch (e) {
             logger.warn(`Could not stringify tool result for LLM context: ${e.message}`);
             return JSON.stringify({ tool_name: toolName, status: 'success', result_summary: 'Tool executed successfully, but result could not be summarized for context.' });
         }
     }
     // If no error and no result
     return JSON.stringify({ tool_name: toolName, status: 'success', result_summary: 'Tool executed successfully with no specific output.' });
}


module.exports = {
    summarizeToolResult,
    // parseLLMResponse, // Removed - logic moved to LLMOrchestrator
    formatToolResultForLLM,
};