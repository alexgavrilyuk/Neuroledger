/**
 * Claude LLM provider implementation
 */
const BaseLLMProvider = require('./BaseLLMProvider');
const logger = require('../../shared/utils/logger');

class ClaudeProvider extends BaseLLMProvider {
  constructor(apiKey, config = {}) {
    super(apiKey, config);
    
    try {
      const Anthropic = require('@anthropic-ai/sdk');
      this.anthropic = new Anthropic({
        apiKey: this.apiKey,
      });
      logger.info('Anthropic Claude Client Initialized Successfully');
    } catch (error) {
      logger.error('Anthropic Claude Client Initialization Error:', error.message);
      this.anthropic = null;
    }
  }

  /**
   * Checks if the Claude provider is available
   * 
   * @returns {boolean} - Whether Claude is available
   */
  isAvailable() {
    return !!this.anthropic;
  }

  /**
   * Generates content using Claude's API (non-streaming)
   * 
   * @param {object} options - Generation options
   * @returns {Promise<object>} - The formatted response
   */
  async generateContent(options) {
    if (!this.isAvailable()) {
      throw new Error('Claude client is not available');
    }

    const { model, system, messages, max_tokens, temperature } = options;

    try {
      const apiOptions = {
        model: model,
        system: system,
        messages: messages,
        max_tokens: max_tokens || 4096,
        temperature: temperature || 0.7,
      };

      logger.debug(`[Claude] Sending non-streaming request to model ${model}`);
      const response = await this.anthropic.messages.create(apiOptions);
      
      // Claude responses are already in the expected format
      return response;
    } catch (error) {
      logger.error(`Error calling Claude API model ${model}: ${error.message}`, { error });
      throw new Error(`Claude API Error: ${error.message}`);
    }
  }

  /**
   * Streams content from Claude's API
   * 
   * @param {object} options - Generation options with streaming
   * @returns {Promise<AsyncIterable>} - The response stream
   */
  async streamContent(options) {
    if (!this.isAvailable()) {
      throw new Error('Claude client is not available');
    }

    const { model, system, messages, max_tokens, temperature } = options;

    try {
      const apiOptions = {
        model: model,
        system: system,
        messages: messages,
        max_tokens: max_tokens || 4096,
        temperature: temperature || 0.7,
        stream: true
      };

      logger.debug(`[Claude] Sending streaming request to model ${model}`);
      // Return the stream directly
      return await this.anthropic.messages.create(apiOptions);
    } catch (error) {
      logger.error(`Error starting Claude stream for model ${model}: ${error.message}`, { error });
      throw new Error(`Claude API Streaming Error: ${error.message}`);
    }
  }
}

module.exports = ClaudeProvider; 