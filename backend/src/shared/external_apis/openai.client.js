const { OpenAI } = require("openai");
const config = require("../config"); // Assuming config holds API keys
const logger = require("../utils/logger"); // Corrected path to logger

let openai;
let isClientAvailable = false;

try {
  if (!config.openaiApiKey) {
    logger.warn('OpenAI API Key (OPENAI_API_KEY) is missing in environment variables. OpenAI client will not be available.');
  } else {
    openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    isClientAvailable = true;
    logger.info('OpenAI Client Initialized');
  }
} catch (error) {
  logger.error('OpenAI Client Initialization Error:', error.message);
  // Allow startup but log that OpenAI features will fail
}

/**
 * Checks if the OpenAI client was initialized successfully.
 * @returns {boolean} True if the client is available, false otherwise.
 */
const isAvailable = () => isClientAvailable;


/**
 * Maps the internal message format (similar to Claude's) to OpenAI's format.
 * @param {Array<object>} messages - Messages in format [{role: 'user'|'assistant', content: '...'}]
 * @param {string|null} systemPrompt - The system prompt string, if any.
 * @returns {Array<object>} Messages in OpenAI format [{role: 'system'|'user'|'assistant', content: '...'}]
 */
const mapMessagesToOpenAI = (messages, systemPrompt = null) => {
  const openAIMessages = [];
  if (systemPrompt) {
    openAIMessages.push({ role: 'system', content: systemPrompt });
  }
  messages.forEach(msg => {
    // Direct mapping assuming roles 'user' and 'assistant' are compatible
    if (msg.role === 'user' || msg.role === 'assistant') {
        // Handle potential non-string content if your app uses complex content arrays like Claude
        let contentString = '';
        if (typeof msg.content === 'string') {
            contentString = msg.content;
        } else if (Array.isArray(msg.content)) {
            // Find the first text block if using Claude's rich content format
            const textBlock = msg.content.find(block => block.type === 'text');
            if (textBlock) {
                contentString = textBlock.text;
            } else {
                logger.warn(`[mapMessagesToOpenAI] Skipping message block with non-text content for OpenAI: ${JSON.stringify(msg.content)}`);
                return; // Skip this message if no text content found
            }
        } else {
             logger.warn(`[mapMessagesToOpenAI] Unexpected message content type: ${typeof msg.content}`);
             return; // Skip unknown content types
        }
      openAIMessages.push({ role: msg.role, content: contentString });
    } else {
      logger.warn(`[mapMessagesToOpenAI] Skipping message with unhandled role for OpenAI: ${msg.role}`);
    }
  });
  return openAIMessages;
};


/**
 * Sends a NON-STREAMING request to the OpenAI API (Chat Completions).
 * Mimics the interface of the Gemini/Claude clients for easier integration.
 *
 * @param {object} options - The request options.
 * @param {string} options.model - The OpenAI model to use (e.g., 'gpt-3.5-turbo').
 * @param {Array<object>} options.messages - The message history in the internal/Claude format.
 * @param {string} [options.system] - The system prompt.
 * @param {number} [options.max_tokens] - The maximum number of tokens to generate.
 * @param {number} [options.temperature] - The sampling temperature.
 * // Add other potential OpenAI parameters as needed (top_p, etc.)
 * @returns {Promise<object>} - The OpenAI API response content, adapted to a consistent format.
 */
const createChatCompletion = async (options) => {
  if (!isClientAvailable) {
    logger.error("OpenAI client is not initialized. Cannot make API calls.");
    throw new Error('OpenAI client is not available.');
  }

  const { model, messages, system, max_tokens, temperature /*, other params */ } = options;

  try {
    const openAIMessages = mapMessagesToOpenAI(messages, system);

    const requestOptions = {
        model: model,
        messages: openAIMessages,
        // Only include parameters if they are provided and valid
        ...(max_tokens && { max_tokens: max_tokens }),
        ...(temperature !== undefined && { temperature: temperature }),
        stream: false, // Explicitly set stream to false for this non-streaming version
    };

    // --- DEBUG LOG: OpenAI Request ---
    logger.debug(`[createChatCompletion] Sending request to OpenAI. Model: ${model}, Messages Count: ${openAIMessages.length}, Max Tokens: ${max_tokens}, Stream: false`);
    // Avoid logging full messages in production if sensitive
    // logger.debug('[createChatCompletion] Request Messages:', JSON.stringify(openAIMessages));


    const completion = await openai.chat.completions.create(requestOptions);

    // --- DEBUG LOG: OpenAI Response ---
    // logger.debug('[createChatCompletion] OpenAI Raw Response:', JSON.stringify(completion));


    // Adapt OpenAI response to the structure expected by the calling service
    // (e.g., similar to Claude's { content: [{ type: 'text', text: '...' }] })
    if (completion.choices && completion.choices.length > 0 && completion.choices[0].message) {
      const choice = completion.choices[0];
      const responseContent = choice.message.content;
      const finishReason = choice.finish_reason;

      logger.info(`[createChatCompletion] OpenAI response received. Finish reason: ${finishReason}, Model used: ${completion.model}`);

      if (finishReason === 'length') {
           logger.warn(`[createChatCompletion] OpenAI response truncated due to max_tokens limit for model ${model}.`);
      }

      // Mimic the Claude/Gemini structure used in prompt.service.js
      return {
        content: [{ type: 'text', text: responseContent }],
        usage: completion.usage, // Include usage info if needed
        model: completion.model, // Include actual model used
        stop_reason: finishReason, // Map OpenAI's finish reason
      };
    } else {
      logger.warn(`[createChatCompletion] OpenAI API returned an empty or unexpected response structure for model ${model}.`, completion);
      // Return structure consistent with how Claude/Gemini errors might be checked
       return {
            content: [],
            error: 'Empty or unexpected response from OpenAI API',
        };
    }
  } catch (error) {
    logger.error(`[createChatCompletion] Error calling OpenAI API model ${model}: ${error.message}`, { error: error.response?.data || error.stack });
    // Propagate a generic error structure
    throw new Error(`OpenAI API Error: ${error.message}`);
  }
};

/**
 * Creates a STREAMING chat completion request to the OpenAI API.
 *
 * @param {object} options - The request options (similar to createChatCompletion).
 * @param {string} options.model - The OpenAI model to use.
 * @param {Array<object>} options.messages - The message history.
 * @param {string} [options.system] - The system prompt.
 * @param {number} [options.max_tokens] - Max completion tokens.
 * @param {number} [options.temperature] - Temperature.
 * // Add other compatible OpenAI parameters as needed.
 * @returns {Promise<Stream<OpenAI.Chat.Completions.ChatCompletionChunk>>} - A stream object from the OpenAI SDK.
 */
const streamChatCompletion = async (options) => {
  if (!isClientAvailable) {
    logger.error("OpenAI client is not initialized. Cannot make streaming API calls.");
    throw new Error('OpenAI client is not available.');
  }

  const { model, messages, system, max_tokens, temperature /*, other params */ } = options;

  try {
    const openAIMessages = mapMessagesToOpenAI(messages, system);

    const requestOptions = {
      model: model,
      messages: openAIMessages,
      ...(max_tokens && { max_tokens: max_tokens }),
      ...(temperature !== undefined && { temperature: temperature }),
      // CRITICAL: Enable streaming
      stream: true,
    };

    logger.debug(`[streamChatCompletion] Sending STREAMING request to OpenAI. Model: ${model}, Messages Count: ${openAIMessages.length}, Max Tokens: ${max_tokens}, Stream: true`);

    // Call the API and return the stream directly
    const stream = await openai.chat.completions.create(requestOptions);
    return stream;

  } catch (error) {
    logger.error(`[streamChatCompletion] Error starting OpenAI stream for model ${model}: ${error.message}`, { error: error.response?.data || error.stack });
    throw new Error(`OpenAI API Streaming Error: ${error.message}`);
  }
};

module.exports = {
  isAvailable,
  createChatCompletion,
  streamChatCompletion, // Export the new streaming function
  // Export the raw client if needed elsewhere, though usually wrapper is preferred
  // openaiClient: openai
}; 