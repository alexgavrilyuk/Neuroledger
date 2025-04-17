/**
 * Gemini LLM provider implementation
 */
const BaseLLMProvider = require('./BaseLLMProvider');
const logger = require('../../shared/utils/logger');

class GeminiProvider extends BaseLLMProvider {
  constructor(apiKey, config = {}) {
    super(apiKey, config);
    
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      this.genAI = new GoogleGenerativeAI(this.apiKey);
      logger.info('Google Gemini Client Initialized Successfully');
    } catch (error) {
      logger.error('Google Gemini Client Initialization Error:', error.message);
      this.genAI = null;
    }
  }

  /**
   * Checks if the Gemini provider is available
   * 
   * @returns {boolean} - Whether Gemini is available
   */
  isAvailable() {
    return !!this.genAI;
  }

  /**
   * Maps standard message format to Gemini format
   * 
   * @param {array} messages - Messages in standard format
   * @param {string} systemPrompt - System prompt
   * @returns {array} - Messages in Gemini format
   */
  _mapMessages(messages, systemPrompt) {
    // Map message roles ('assistant' -> 'model')
    const mappedMessages = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    // Prepend system prompt as a user message if provided
    if (systemPrompt) {
      return [
        {
          role: 'user',
          parts: [{ text: `System Instructions: \n${systemPrompt}` }]
        },
        ...mappedMessages
      ];
    }

    return mappedMessages;
  }

  /**
   * Generates content using Gemini's API (non-streaming)
   * 
   * @param {object} options - Generation options
   * @returns {Promise<object>} - The formatted response
   */
  async generateContent(options) {
    if (!this.isAvailable()) {
      throw new Error('Gemini client is not available');
    }

    const { model, system, messages, max_tokens, temperature } = options;

    try {
      const geminiModel = this.genAI.getGenerativeModel({ model });
      
      // Map messages to Gemini format
      const history = this._mapMessages(messages, system);

      // Prepare generation config
      const generationConfig = {};
      if (max_tokens !== undefined) generationConfig.maxOutputTokens = max_tokens;
      if (temperature !== undefined) generationConfig.temperature = temperature;

      logger.debug(`[Gemini] Sending non-streaming request to model ${model}`);
      const result = await geminiModel.generateContent({
        contents: history,
        generationConfig: generationConfig,
      });

      const response = await result.response;
      const responseText = response.text();

      // Format response to match Claude's structure
      return {
        content: [
          {
            type: 'text',
            text: responseText,
          },
        ],
      };
    } catch (error) {
      logger.error(`Error calling Gemini API model ${model}: ${error.message}`, { error });
      throw new Error(`Gemini API Error: ${error.message}`);
    }
  }

  /**
   * Streams content from Gemini's API
   * 
   * @param {object} options - Generation options with streaming
   * @returns {Promise<AsyncIterable>} - The response stream
   */
  async streamContent(options) {
    if (!this.isAvailable()) {
      throw new Error('Gemini client is not available');
    }

    const { model, system, messages, max_tokens, temperature } = options;

    try {
      const geminiModel = this.genAI.getGenerativeModel({ model });
      
      // Map messages to Gemini format
      const history = this._mapMessages(messages, system);

      // Prepare generation config
      const generationConfig = {};
      if (max_tokens !== undefined) generationConfig.maxOutputTokens = max_tokens;
      if (temperature !== undefined) generationConfig.temperature = temperature;

      logger.debug(`[Gemini] Sending streaming request to model ${model}`);
      const result = await geminiModel.generateContentStream({
        contents: history,
        generationConfig: generationConfig,
      });

      // Return the stream iterator
      return result.stream;
    } catch (error) {
      logger.error(`Error starting Gemini stream for model ${model}: ${error.message}`, { error });
      throw new Error(`Gemini API Streaming Error: ${error.message}`);
    }
  }
}

module.exports = GeminiProvider; 