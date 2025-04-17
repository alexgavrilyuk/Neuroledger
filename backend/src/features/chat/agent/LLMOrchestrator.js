// ================================================================================
// FILE: NeuroLedger copy/backend/src/features/chat/agent/LLMOrchestrator.js
// PURPOSE: Handles streaming LLM interaction and parsing the final response.
// MODIFIED: Corrected import path for getUserModelPreference.
// ================================================================================

const logger = require('../../../shared/utils/logger');
const { streamLLMReasoningResponse } = require('../prompt.service'); // Use only the streaming one
const SystemPromptBuilder = require('./SystemPromptBuilder');
// **** CORRECTED IMPORT PATH ****
const { getUserModelPreference } = require('../../../shared/llm_providers/ProviderFactory');
// *******************************

/**
 * Parses the LLM's complete raw response text (potentially containing JSON) to identify
 * either a valid tool call or determine it's a final textual answer.
 * Looks for a JSON object matching the expected tool call structure {"tool": "<name>", "args": {...}},
 * optionally enclosed in markdown code fences (```json ... ``` or ``` ... ```).
 * @private
 */
function _parseCompleteLLMResponse(llmResponse, knownToolNames) {
    // This logic remains the same as provided in the previous step
    const defaultAnswer = { tool: '_answerUserTool', args: { textResponse: llmResponse?.trim() || '' }, isFinalAnswer: true, textResponse: llmResponse?.trim() || '' };

    if (!llmResponse || typeof llmResponse !== 'string') {
        logger.warn('[LLM Orchestrator] LLM response is empty or not a string.');
        return { ...defaultAnswer, args: { textResponse: 'An error occurred: Empty response from AI.' }, textResponse: 'An error occurred: Empty response from AI.' };
    }

    const trimmedResponse = llmResponse.trim();

    const jsonRegex = /^```(?:json)?\s*(\{[\s\S]*?\})\s*```$|^(\{[\s\S]*?\})$/m; // Use [^]*?
    const jsonMatch = trimmedResponse.match(jsonRegex);

    if (jsonMatch) {
        const potentialJson = jsonMatch[1] || jsonMatch[2];
        if (potentialJson) {
            let sanitizedJsonString = null;
            try {
                // Basic sanitization for code args
                 sanitizedJsonString = potentialJson.replace(/("code"\s*:\s*")([\s\S]*?)("(?!\\))/gs, (match, p1, p2, p3) => {
                     const escapedCode = p2
                         .replace(/\\/g, '\\\\')
                         .replace(/"/g, '\\"')
                         .replace(/\n/g, '\\n')
                         .replace(/\r/g, '\\r');
                     return p1 + escapedCode + p3;
                 });

                const parsed = JSON.parse(sanitizedJsonString || potentialJson); // Use sanitized if available

                if (parsed && typeof parsed.tool === 'string' && typeof parsed.args === 'object' && parsed.args !== null) {
                    if (knownToolNames.includes(parsed.tool)) {
                        logger.debug(`[LLM Orchestrator] Parsed tool call: ${parsed.tool}`, parsed.args);
                        // Handle _answerUserTool specifically
                        if (parsed.tool === '_answerUserTool') {
                             const textResponse = parsed.args.textResponse;
                             if (typeof textResponse === 'string' && textResponse.trim() !== '') {
                                 return { tool: parsed.tool, args: parsed.args, isFinalAnswer: true, textResponse: textResponse.trim() };
                             } else {
                                 logger.warn('[LLM Orchestrator] _answerUserTool JSON missing textResponse, using raw.');
                                 return defaultAnswer;
                             }
                        }
                        return { tool: parsed.tool, args: parsed.args, isFinalAnswer: false, textResponse: null };
                    } else {
                        logger.warn(`[LLM Orchestrator] LLM requested unknown tool via JSON: ${parsed.tool}. Treating as final answer.`);
                        return defaultAnswer;
                    }
                } else {
                    logger.warn('[LLM Orchestrator] Parsed JSON does not match tool structure. Treating as final answer.', parsed);
                    return defaultAnswer;
                }
            } catch (e) {
                logger.error(`[LLM Orchestrator] Failed to parse JSON: ${e.message}. Content: ${potentialJson}. Treating as final answer.`);
                return defaultAnswer;
            }
        }
    }

    logger.debug('[LLM Orchestrator] Response treated as final answer (no valid JSON tool call).');
    return defaultAnswer;
}


/**
 * Interacts with the LLM using streaming to get the next action (tool call or final answer).
 * It handles the streaming process and parses the complete response afterwards.
 *
 * @async
 * @param {object} llmContext - The context object prepared for the LLM prompt service. Includes userId.
 * @param {function(string, object): void} streamCallback - Function to call with intermediate stream events (e.g., 'token').
 * @param {string[]} knownToolNames - Array of valid tool names for parsing the response.
 * @returns {Promise<{tool: string, args: object, isFinalAnswer: boolean, textResponse: string|null}>} The parsed action.
 */
async function getNextActionFromLLM(llmContext, streamCallback, knownToolNames) {
    // Use the SystemPromptBuilder
    const builder = new SystemPromptBuilder();
    const systemPrompt = builder.build(llmContext);

    // Log length for debugging
    logger.debug(`[LLM Orchestrator] Generated System Prompt Length: ${systemPrompt.length}`);

    // Get user's preferred model using the CORRECTED import
    const { provider: preferredProvider, model: modelToUse } = await getUserModelPreference(llmContext.userId);
    logger.info(`[LLM Orchestrator] Using ${preferredProvider} model: ${modelToUse} for user ${llmContext.userId}`);


    // Prepare API options
    const apiOptions = {
        model: modelToUse,
        system: systemPrompt,
        messages: [ // Combine history and current query from context
            ...(llmContext.fullChatHistory || []),
            { role: "user", content: llmContext.originalQuery }
        ],
        max_tokens: 24096,
        temperature: 0.1,
        stream: true,
        userId: llmContext.userId // Pass userId in options if provider needs it
    };


    logger.debug(`[LLM Orchestrator] Calling streamLLMReasoningResponse for user ${llmContext.userId}`);

    try {
        // Call the streaming function from prompt.service with constructed options
        const fullLLMResponseText = await streamLLMReasoningResponse(apiOptions, streamCallback); // Pass apiOptions

        if (fullLLMResponseText === null) {
             logger.error('[LLM Orchestrator] streamLLMReasoningResponse returned null, indicating a stream error.');
             return { tool: '_answerUserTool', args: { textResponse: 'An error occurred during AI processing.' }, isFinalAnswer: true, textResponse: 'An error occurred during AI processing.' };
        }

        logger.debug(`[LLM Orchestrator] Stream finished. Full response length: ${fullLLMResponseText.length}. Parsing...`);

        // Parse the *complete* accumulated text response
        const parseResult = _parseCompleteLLMResponse(fullLLMResponseText, knownToolNames);

        logger.info(`[LLM Orchestrator] Parsed LLM Action: Tool='${parseResult.tool}', IsFinal=${parseResult.isFinalAnswer}`);
        return parseResult;

    } catch (error) {
        // Catch errors from the streamLLMReasoningResponse call itself (e.g., API errors)
        logger.error(`[LLM Orchestrator] Error during streamLLMReasoningResponse call: ${error.message}`, { error });
        // Return an error state
         return { tool: '_answerUserTool', args: { textResponse: `Error communicating with AI: ${error.message}` }, isFinalAnswer: true, textResponse: `Error communicating with AI: ${error.message}` };
    }
}

module.exports = { getNextActionFromLLM };