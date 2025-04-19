// ================================================================================
// FILE: backend/src/features/chat/agent/LLMOrchestrator.js
// PURPOSE: Handles streaming LLM interaction and parsing the response.
// PHASE 1 UPDATE: Modified _parseCompleteLLMResponse to extract <thinking> tags.
// ================================================================================

const logger = require('../../../shared/utils/logger');
const { streamLLMReasoningResponse } = require('../prompt.service'); // Use only the streaming one
const SystemPromptBuilder = require('./SystemPromptBuilder');
const { getUserModelPreference } = require('../../../shared/llm_providers/ProviderFactory');

/**
 * Parses the LLM's complete raw response text to identify reasoning (thinking)
 * and either a valid tool call or determine it's a final textual answer.
 * Looks for <thinking>...</thinking> tags followed by JSON tool call.
 *
 * @private
 * @param {string | null} llmResponse - The full raw text response from the LLM.
 * @param {string[]} knownToolNames - List of valid tool names.
 * @returns {{tool: string, args: object, isFinalAnswer: boolean, thinking: string|null, textResponse: string|null}} Parsed action details.
 */
function _parseCompleteLLMResponse(llmResponse, knownToolNames) {
    let thinkingText = null;
    let actionText = llmResponse || ''; // Start with the full response for action parsing

    const defaultAnswer = {
        tool: '_answerUserTool',
        args: { textResponse: actionText.trim() }, // Default args use remaining text
        isFinalAnswer: true,
        thinking: thinkingText, // Will be null if no thinking tag found initially
        textResponse: actionText.trim() // Default text response is remaining text
    };

    if (!actionText || typeof actionText !== 'string') {
        logger.warn('[LLM Orchestrator] LLM response is empty or not a string.');
        return { ...defaultAnswer, args: { textResponse: 'An error occurred: Empty response from AI.' }, textResponse: 'An error occurred: Empty response from AI.' };
    }

    // 1. Extract <thinking> block
    // Use regex with 's' flag for multiline matching
    const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/im;
    const thinkingMatch = actionText.match(thinkingRegex);

    if (thinkingMatch && thinkingMatch[1]) {
        thinkingText = thinkingMatch[1].trim();
        logger.debug(`[LLM Orchestrator] Extracted thinking block (length: ${thinkingText.length})`);
        // Remove the thinking block from the text to parse for action
        actionText = actionText.substring(thinkingMatch[0].length).trim();
         // Update default answer thinking text *if* we found one
         defaultAnswer.thinking = thinkingText;
    } else {
        logger.debug('[LLM Orchestrator] No <thinking> block found in LLM response.');
        // actionText remains the full llmResponse
    }

    // 2. Parse the remaining actionText for a Tool Call JSON
    const trimmedActionText = actionText.trim();
    // Regex to find JSON block, possibly wrapped in ```json ... ``` or ``` ... ```
    const jsonRegex = /^```(?:json)?\s*(\{[\s\S]*?\})\s*```$|^(\{[\s\S]*?\})$/m;
    const jsonMatch = trimmedActionText.match(jsonRegex);

    if (jsonMatch) {
        const potentialJson = jsonMatch[1] || jsonMatch[2];
        if (potentialJson) {
            let sanitizedJsonString = null;
            try {
                // Basic sanitization for code args (keep as before)
                 sanitizedJsonString = potentialJson.replace(/("code"\s*:\s*")([\s\S]*?)("(?!\\))/gs, (match, p1, p2, p3) => {
                     const escapedCode = p2
                         .replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
                     return p1 + escapedCode + p3;
                 });

                const parsed = JSON.parse(sanitizedJsonString || potentialJson);

                if (parsed && typeof parsed.tool === 'string' && typeof parsed.args === 'object' && parsed.args !== null) {
                    if (knownToolNames.includes(parsed.tool)) {
                        logger.debug(`[LLM Orchestrator] Parsed tool call: ${parsed.tool}`, parsed.args);
                        // Handle _answerUserTool specifically
                        if (parsed.tool === '_answerUserTool') {
                             const textResponse = parsed.args.textResponse;
                             if (typeof textResponse === 'string' && textResponse.trim() !== '') {
                                 // Return the structured answer tool call
                                 return { tool: parsed.tool, args: parsed.args, isFinalAnswer: true, thinking: thinkingText, textResponse: textResponse.trim() };
                             } else {
                                 logger.warn('[LLM Orchestrator] _answerUserTool JSON missing textResponse, using thinking block or raw text as fallback.');
                                 // Fallback: use thinking text if available, else the trimmed action text
                                  const fallbackText = thinkingText || trimmedActionText || 'Could not determine final answer.';
                                  return { tool: '_answerUserTool', args: { textResponse: fallbackText }, isFinalAnswer: true, thinking: thinkingText, textResponse: fallbackText };
                             }
                        }
                        // Return the parsed tool call
                        return { tool: parsed.tool, args: parsed.args, isFinalAnswer: false, thinking: thinkingText, textResponse: null };
                    } else {
                        logger.warn(`[LLM Orchestrator] LLM requested unknown tool via JSON: ${parsed.tool}. Treating as final answer.`);
                        // Treat as final answer using thinking text or the original action text
                         const fallbackText = thinkingText || trimmedActionText || 'AI tried to use an unknown tool.';
                         return { ...defaultAnswer, args: { textResponse: fallbackText }, textResponse: fallbackText };
                    }
                } else {
                    logger.warn('[LLM Orchestrator] Parsed JSON does not match tool structure. Treating as final answer.', parsed);
                     const fallbackText = thinkingText || trimmedActionText || 'AI response was not a valid tool call.';
                     return { ...defaultAnswer, args: { textResponse: fallbackText }, textResponse: fallbackText };
                }
            } catch (e) {
                logger.error(`[LLM Orchestrator] Failed to parse JSON: ${e.message}. Content: ${potentialJson}. Treating as final answer.`);
                 const fallbackText = thinkingText || trimmedActionText || `Error parsing AI response: ${e.message}`;
                 return { ...defaultAnswer, args: { textResponse: fallbackText }, textResponse: fallbackText };
            }
        }
    }

    // 3. If no valid JSON tool call found in actionText, treat the actionText as the final answer
    logger.debug('[LLM Orchestrator] No valid JSON tool call found after thinking block (if any). Treating remaining text as final answer.');
    // Use thinkingText if available but actionText is empty/just whitespace, otherwise use actionText
    const finalAnswerText = trimmedActionText || thinkingText || 'AI provided thinking but no final action or answer.';
    return { ...defaultAnswer, args: { textResponse: finalAnswerText.trim() }, textResponse: finalAnswerText.trim() };
}


/**
 * Interacts with the LLM using streaming to get the next action (tool call or final answer).
 * It handles the streaming process and parses the complete response afterwards.
 *
 * @async
 * @param {object} llmContext - The context object prepared for the LLM prompt service. Includes userId.
 * @param {function(string, object): void} streamCallback - Function to call with intermediate stream events (e.g., 'token').
 * @param {string[]} knownToolNames - Array of valid tool names for parsing the response.
 * @returns {Promise<{tool: string, args: object, isFinalAnswer: boolean, thinking: string|null, textResponse: string|null}>} The parsed action.
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
        max_tokens: 4096, // Adjusted token limit
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
             // Return default error structure, including null for thinking
             return { tool: '_answerUserTool', args: { textResponse: 'An error occurred during AI processing.' }, isFinalAnswer: true, thinking: null, textResponse: 'An error occurred during AI processing.' };
        }

        logger.debug(`[LLM Orchestrator] Stream finished. Full response length: ${fullLLMResponseText.length}. Parsing...`);

        // Parse the *complete* accumulated text response using the updated parser
        const parseResult = _parseCompleteLLMResponse(fullLLMResponseText, knownToolNames);

        logger.info(`[LLM Orchestrator] Parsed LLM Action: Tool='${parseResult.tool}', IsFinal=${parseResult.isFinalAnswer}, HasThinking=${!!parseResult.thinking}`);
        return parseResult; // Return the object including the 'thinking' property

    } catch (error) {
        // Catch errors from the streamLLMReasoningResponse call itself (e.g., API errors)
        logger.error(`[LLM Orchestrator] Error during streamLLMReasoningResponse call: ${error.message}`, { error });
        // Return an error state, including null for thinking
         return { tool: '_answerUserTool', args: { textResponse: `Error communicating with AI: ${error.message}` }, isFinalAnswer: true, thinking: null, textResponse: `Error communicating with AI: ${error.message}` };
    }
}

module.exports = { getNextActionFromLLM };