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
                return `Success: Parsed data (${data.rowCount} rows).`;
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
             if (Array.isArray(data) && data.length > 0 && data[0]._id && data[0].name) {
                // Heuristic for list_datasets result
                return `Success: Found ${data.length} dataset(s).`;
             }
              if (Array.isArray(data.schemaInfo) && typeof data.rowCount === 'number') {
                 // Heuristic for get_dataset_schema result
                 return `Success: Retrieved schema (${data.schemaInfo.length} columns, ${data.rowCount} rows).`;
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
 * Parses the LLM's complete raw response text (potentially containing JSON) to identify
 * either a valid tool call or determine it's a final textual answer.
 *
 * Looks for a JSON object matching the expected tool call structure {"tool": "<name>", "args": {...}},
 * optionally enclosed in markdown code fences (```json ... ``` or ``` ... ```).
 *
 * If a valid, known tool call is found, it's returned. Otherwise, the entire input
 * text is treated as the final answer.
 *
 * @param {string} llmResponse - The raw text response from the LLM.
 * @param {Array<string>} knownToolNames - An array of valid tool names recognized by the system.
 * @returns {{tool: string, args: object, isFinalAnswer: boolean, textResponse: string|null}} An object indicating the parsed action:
 *   - `tool`: The name of the tool to call, or '_answerUserTool' if it's a final answer.
 *   - `args`: The arguments object for the tool call, or { textResponse: ... } for the final answer.
 *   - `isFinalAnswer`: Boolean indicating if this represents a final answer rather than a tool call.
 *   - `textResponse`: The extracted text if `isFinalAnswer` is true, otherwise null.
 */
function parseLLMResponse(llmResponse, knownToolNames) {
    const defaultAnswer = { tool: '_answerUserTool', args: { textResponse: llmResponse?.trim() || '' }, isFinalAnswer: true, textResponse: llmResponse?.trim() || '' };

    if (!llmResponse || typeof llmResponse !== 'string') {
        logger.warn('LLM response is empty or not a string.');
        return { ...defaultAnswer, args: { textResponse: 'An error occurred: Empty response from AI.' }, textResponse: 'An error occurred: Empty response from AI.' };
    }

    const trimmedResponse = llmResponse.trim();

    // Regex to find a JSON object enclosed in optional markdown fences
    const jsonRegex = /^```(?:json)?\s*(\{[\s\S]*\})\s*```$|^(\{[\s\S]*\})$/m;
    const jsonMatch = trimmedResponse.match(jsonRegex);

    if (jsonMatch) {
        const potentialJson = jsonMatch[1] || jsonMatch[2];
        if (potentialJson) {
            let sanitizedJsonString = null;
            try {
                // Basic sanitization for common issues like unescaped newlines/quotes in code args
                 sanitizedJsonString = potentialJson.replace(/("code"\s*:\s*")([\s\S]*?)("(?!\\))/gs, (match, p1, p2, p3) => {
                     const escapedCode = p2
                         .replace(/\\/g, '\\\\') // Escape backslashes FIRST
                         .replace(/"/g, '\\"')  // Escape double quotes
                         .replace(/\n/g, '\\n') // Escape newlines
                         .replace(/\r/g, '\\r'); // Escape carriage returns
                     return p1 + escapedCode + p3;
                 });

                const parsed = JSON.parse(sanitizedJsonString);

                if (parsed && typeof parsed.tool === 'string' && typeof parsed.args === 'object' && parsed.args !== null) {
                    if (knownToolNames.includes(parsed.tool)) {
                        logger.debug(`Parsed tool call via regex: ${parsed.tool}`, parsed.args);
                         // If it's the answer tool called via JSON, ensure textResponse is valid
                         if (parsed.tool === '_answerUserTool') {
                             const textResponse = parsed.args.textResponse;
                            if (typeof textResponse === 'string' && textResponse.trim() !== '') {
                                 return { tool: parsed.tool, args: parsed.args, isFinalAnswer: true, textResponse: textResponse.trim() };
                             } else {
                                 logger.warn('_answerUserTool called via JSON but missing/empty textResponse. Using raw response.');
                                 return defaultAnswer; // Fallback to raw response
                            }
                         }
                        // Valid tool call found
                        return { tool: parsed.tool, args: parsed.args, isFinalAnswer: false, textResponse: null };
                    } else {
                        logger.warn(`LLM requested unknown tool via JSON: ${parsed.tool}. Treating as final answer.`);
                        return defaultAnswer;
                    }
                } else {
                    logger.warn('Parsed JSON does not match expected tool structure. Treating as final answer.', parsed);
                    return defaultAnswer;
                }
            } catch (e) {
                logger.error(`Failed to parse extracted JSON: ${e.message}. Content: ${potentialJson}. Treating as final answer.`);
                return defaultAnswer;
            }
        }
    }

    // If no valid JSON tool call found, treat the entire response as the final answer.
    logger.debug('LLM response treated as final answer text (no valid JSON tool call found).');
    return defaultAnswer;
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
         if (toolName === 'generate_analysis_code' || toolName === 'generate_report_code') {
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
         if (toolName === 'parse_csv_data' && toolResult.result.parsedData) {
             const rowCount = Array.isArray(toolResult.result.parsedData) ? toolResult.result.parsedData.length : 0;
              // Provide a summary instead of the full data
             return JSON.stringify({
                 tool_name: toolName,
                 status: 'success',
                 result_summary: `Successfully parsed ${rowCount} rows.`
                 // Avoid sending parsed data back into context
             });
         }

         // For other tools, try to stringify the result, truncating if necessary
         try {
             const resultString = JSON.stringify(toolResult.result);
             const truncatedResult = resultString.substring(0, 500) + (resultString.length > 500 ? '...' : '');
             return JSON.stringify({ tool_name: toolName, status: 'success', result: JSON.parse(truncatedResult) }); // Parse back to object after truncating string
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
    parseLLMResponse,
    formatToolResultForLLM,
}; 