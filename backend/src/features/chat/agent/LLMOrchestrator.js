// backend/src/features/chat/agent/LLMOrchestrator.js
// ENTIRE FILE - FULLY UPDATED

const logger = require('../../../shared/utils/logger');
const { streamLLMReasoningResponse } = require('../prompt.service');
const SystemPromptBuilder = require('./SystemPromptBuilder');
const { getUserModelPreference } = require('../../../shared/llm_providers/ProviderFactory');

/**
 * Parses the LLM's complete raw response text to identify:
 * 1. Internal reasoning (`<thinking>`)
 * 2. User-facing explanation (`<user_explanation>`)
 * 3. The next action (tool call JSON or final answer JSON `_answerUserTool`).
 * Handles potential missing tags and malformed JSON gracefully.
 *
 * @private
 * @param {string | null} llmResponse - The full raw text response from the LLM.
 * @param {string[]} knownToolNames - List of valid tool names.
 * @returns {{tool: string, args: object, isFinalAnswer: boolean, thinking: string|null, userExplanation: string|null, textResponse: string|null}} Parsed action details.
 */
function _parseCompleteLLMResponse(llmResponse, knownToolNames) {
    let thinkingText = null;
    let userExplanationText = null;
    let actionText = llmResponse || ''; // Start with the full response

    const defaultAnswer = { // Base structure for fallbacks
        tool: '_answerUserTool',
        args: { textResponse: 'Processing complete.' }, // Default text
        isFinalAnswer: true,
        thinking: thinkingText, // Will be updated if found
        userExplanation: userExplanationText, // Will be updated if found
        textResponse: 'Processing complete.' // Default text
    };

    if (!actionText || typeof actionText !== 'string') {
        logger.warn('[LLM Orchestrator] LLM response is empty or not a string.');
        return { ...defaultAnswer, args: { textResponse: 'An error occurred: Empty response from AI.' }, textResponse: 'An error occurred: Empty response from AI.' };
    }

    // 1. Extract <thinking> block
    const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/im;
    const thinkingMatch = actionText.match(thinkingRegex);
    if (thinkingMatch && thinkingMatch[1]) {
        thinkingText = thinkingMatch[1].trim();
        logger.debug(`[LLM Orchestrator] Extracted thinking block (length: ${thinkingText.length})`);
        actionText = actionText.substring(thinkingMatch[0].length).trim(); // Remove thinking block for next parse
        defaultAnswer.thinking = thinkingText; // Update default
    } else {
        logger.debug('[LLM Orchestrator] No <thinking> block found.');
    }

    // 2. Extract <user_explanation> block from the remaining text
    const explanationRegex = /<user_explanation>([\s\S]*?)<\/user_explanation>/im;
    const explanationMatch = actionText.match(explanationRegex);
    if (explanationMatch && explanationMatch[1]) {
        userExplanationText = explanationMatch[1].trim();
        logger.debug(`[LLM Orchestrator] Extracted user_explanation block (length: ${userExplanationText.length})`);
        actionText = actionText.substring(explanationMatch[0].length).trim(); // Remove explanation block for next parse
        defaultAnswer.userExplanation = userExplanationText; // Update default
        // Update default text response with the explanation if no other action follows
        defaultAnswer.args.textResponse = userExplanationText;
        defaultAnswer.textResponse = userExplanationText;
    } else {
        logger.debug('[LLM Orchestrator] No <user_explanation> block found.');
        // If no explanation, the remaining actionText becomes the default text response
        defaultAnswer.args.textResponse = actionText.trim() || (thinkingText ? '(Processing based on internal thoughts)' : 'Processing complete.');
        defaultAnswer.textResponse = actionText.trim() || (thinkingText ? '(Processing based on internal thoughts)' : 'Processing complete.');
    }

    // 3. Parse the remaining actionText for a Tool Call JSON
    const trimmedActionText = actionText.trim();
    if (!trimmedActionText) {
        logger.warn('[LLM Orchestrator] No action text remaining after parsing thinking/explanation. Returning default final answer based on explanation/thinking.');
        // If action text is empty, return the default (which uses userExplanation or fallback text)
        return defaultAnswer;
    }

    // Regex to find JSON block, possibly wrapped in ```json ... ``` or ``` ... ```
    const jsonRegex = /^```(?:json)?\s*(\{[\s\S]*?\})\s*```$|^(\{[\s\S]*?\})$/m;
    const jsonMatch = trimmedActionText.match(jsonRegex);

    if (jsonMatch) {
        const potentialJson = jsonMatch[1] || jsonMatch[2];
        if (potentialJson) {
            let sanitizedJsonString = potentialJson; // Start with raw JSON
            try {
                // --- Basic Sanitization (only needed if LLM struggles with escaping) ---
                // Example: sanitizedJsonString = potentialJson.replace(/\\"/g, '"'); // Be cautious with this
                // --- End Sanitization ---

                const parsed = JSON.parse(sanitizedJsonString);

                // Validate structure: must have tool (string) and args (object)
                if (parsed && typeof parsed.tool === 'string' && typeof parsed.args === 'object' && parsed.args !== null) {
                    // Check if tool is known
                    if (knownToolNames.includes(parsed.tool)) {
                        logger.debug(`[LLM Orchestrator] Parsed known tool call: ${parsed.tool}`, parsed.args);

                        // Handle _answerUserTool specifically
                        if (parsed.tool === '_answerUserTool') {
                             const textResponse = parsed.args.textResponse;
                             if (typeof textResponse === 'string' && textResponse.trim() !== '') {
                                 // Return the structured answer tool call
                                 return { tool: parsed.tool, args: parsed.args, isFinalAnswer: true, thinking: thinkingText, userExplanation: userExplanationText, textResponse: textResponse.trim() };
                             } else {
                                 logger.warn('[LLM Orchestrator] _answerUserTool JSON missing textResponse. Falling back.');
                                 // Fallback using userExplanation or thinking text
                                 const fallbackText = userExplanationText || thinkingText || 'Action completed.';
                                 return { tool: '_answerUserTool', args: { textResponse: fallbackText }, isFinalAnswer: true, thinking: thinkingText, userExplanation: userExplanationText, textResponse: fallbackText };
                             }
                        }
                        // Return other valid tool calls
                        return { tool: parsed.tool, args: parsed.args, isFinalAnswer: false, thinking: thinkingText, userExplanation: userExplanationText, textResponse: null };
                    } else {
                        logger.warn(`[LLM Orchestrator] LLM requested unknown tool via JSON: ${parsed.tool}. Treating as final answer.`);
                        // Fallback if tool name isn't recognized
                        const fallbackText = userExplanationText || thinkingText || `AI tried to use an unknown tool (${parsed.tool}).`;
                         return { ...defaultAnswer, args: { textResponse: fallbackText }, textResponse: fallbackText };
                    }
                } else {
                    logger.warn('[LLM Orchestrator] Parsed JSON does not match required tool/args structure. Treating as final answer.', parsed);
                    const fallbackText = userExplanationText || thinkingText || 'AI response was not a valid tool call.';
                     return { ...defaultAnswer, args: { textResponse: fallbackText }, textResponse: fallbackText };
                }
            } catch (e) {
                logger.error(`[LLM Orchestrator] Failed to parse JSON: ${e.message}. Content snippet: ${potentialJson.substring(0, 200)}... Treating as final answer.`);
                const fallbackText = userExplanationText || thinkingText || `Error parsing AI response: ${e.message}`;
                 return { ...defaultAnswer, args: { textResponse: fallbackText }, textResponse: fallbackText };
            }
        }
    }

    // 4. If no valid JSON tool call found, treat the remaining actionText as the final answer
    logger.debug('[LLM Orchestrator] No valid JSON tool call found. Treating remaining text as final answer.');
    const finalAnswerText = trimmedActionText || userExplanationText || thinkingText || 'Processing complete.'; // Final fallback
    return { ...defaultAnswer, args: { textResponse: finalAnswerText.trim() }, textResponse: finalAnswerText.trim() };
}

/**
 * Interacts with the LLM using streaming to get the next action (tool call or final answer).
 * Handles prompt building, streaming, and parsing the complete response.
 *
 * @async
 * @param {object} llmContext - Context object including userId, history, datasets, etc.
 * @param {function(string, object): void} streamCallback - Function to send events back (e.g., SSE).
 * @param {string[]} knownToolNames - Array of valid tool names for parsing.
 * @returns {Promise<{tool: string, args: object, isFinalAnswer: boolean, thinking: string|null, userExplanation: string|null, textResponse: string|null}>} The parsed action.
 */
async function getNextActionFromLLM(llmContext, streamCallback, knownToolNames) {
    const builder = new SystemPromptBuilder();
    const systemPrompt = builder.build(llmContext);

    logger.debug(`[LLM Orchestrator] Generated System Prompt Length: ${systemPrompt.length}`);
    // logger.debug(`[LLM Orchestrator] System Prompt Snippet:\n${systemPrompt.substring(0, 300)}...\n...${systemPrompt.substring(systemPrompt.length - 300)}`); // Log snippet if needed

    const { provider: preferredProvider, model: modelToUse } = await getUserModelPreference(llmContext.userId);
    logger.info(`[LLM Orchestrator] Using ${preferredProvider} model: ${modelToUse} for user ${llmContext.userId}`);

    const apiOptions = {
        model: modelToUse,
        system: systemPrompt,
        messages: [
            ...(llmContext.fullChatHistory || []),
            { role: "user", content: llmContext.originalQuery }
        ],
        max_tokens: 4096,
        temperature: 0.1,
        stream: true,
        userId: llmContext.userId
    };

    logger.debug(`[LLM Orchestrator] Calling streamLLMReasoningResponse for user ${llmContext.userId}`);

    try {
        const fullLLMResponseText = await streamLLMReasoningResponse(apiOptions, streamCallback);

        if (fullLLMResponseText === null) {
             logger.error('[LLM Orchestrator] streamLLMReasoningResponse returned null, indicating a stream error.');
             return { tool: '_answerUserTool', args: { textResponse: 'An error occurred during AI processing.' }, isFinalAnswer: true, thinking: null, userExplanation: null, textResponse: 'An error occurred during AI processing.' };
        }

        logger.debug(`[LLM Orchestrator] Stream finished. Full response length: ${fullLLMResponseText.length}. Parsing...`);
        // logger.debug(`[LLM Orchestrator] Raw Response for Parsing:\n${fullLLMResponseText}`); // Log full raw response if needed for debugging parser

        // Use the updated parser which extracts thinking, userExplanation, and action
        const parseResult = _parseCompleteLLMResponse(fullLLMResponseText, knownToolNames);

        logger.info(`[LLM Orchestrator] Parsed LLM Action: Tool='${parseResult.tool}', IsFinal=${parseResult.isFinalAnswer}, HasThinking=${!!parseResult.thinking}, HasExplanation=${!!parseResult.userExplanation}`);
        return parseResult;

    } catch (error) {
        logger.error(`[LLM Orchestrator] Error during streamLLMReasoningResponse call: ${error.message}`, { error });
         return { tool: '_answerUserTool', args: { textResponse: `Error communicating with AI: ${error.message}` }, isFinalAnswer: true, thinking: null, userExplanation: null, textResponse: `Error communicating with AI: ${error.message}` };
    }
}

module.exports = { getNextActionFromLLM };