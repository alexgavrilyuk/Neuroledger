/**
 * OpenAI LLM provider implementation
 */
const BaseLLMProvider = require('./BaseLLMProvider');
const logger = require('../../shared/utils/logger');

class OpenAIProvider extends BaseLLMProvider {
  constructor(apiKey, config = {}) {
    super(apiKey, config);
    
    try {
      const { OpenAI } = require('openai');
      this.openai = new OpenAI({
        apiKey: this.apiKey,
      });
      logger.info('OpenAI Client Initialized Successfully');
    } catch (error) {
      logger.error('OpenAI Client Initialization Error:', error.message);
      this.openai = null;
    }
  }

  /**
   * Checks if the OpenAI provider is available
   * 
   * @returns {boolean} - Whether OpenAI is available
   */
  isAvailable() {
    return !!this.openai;
  }

  /**
   * Maps messages to OpenAI format (no transformation needed, but included for consistency)
   * 
   * @param {array} messages - Messages in standard format
   * @param {string} systemPrompt - System prompt
   * @returns {array} - Messages in OpenAI format
   */
  _mapMessages(messages, systemPrompt) {
    // For OpenAI, if a system prompt is provided, prepend it as a system message
    if (systemPrompt) {
      return [
        { role: 'system', content: systemPrompt },
        ...messages
      ];
    }
    
    return messages;
  }

  /**
   * Generates content using OpenAI's API (non-streaming)
   * 
   * @param {object} options - Generation options
   * @returns {Promise<object>} - The formatted response
   */
  async generateContent(options) {
    if (!this.isAvailable()) {
      throw new Error('OpenAI client is not available');
    }

    const { model, system, messages, max_tokens, temperature } = options;

    try {
      // OpenAI expects the system message as part of the messages array
      const mappedMessages = this._mapMessages(messages, system);
      
      const apiOptions = {
        model: model,
        messages: mappedMessages,
        max_tokens: max_tokens,
        temperature: temperature || 0.7,
      };

      logger.debug(`[OpenAI] Sending non-streaming request to model ${model}`);
      const response = await this.openai.chat.completions.create(apiOptions);
      
      // Format response to match Claude's structure
      if (response.choices && response.choices.length > 0) {
        return {
          content: [
            {
              type: 'text',
              text: response.choices[0].message.content,
            },
          ],
        };
      } else {
        throw new Error('OpenAI returned an empty response');
      }
    } catch (error) {
      logger.error(`Error calling OpenAI API model ${model}: ${error.message}`, { error });
      throw new Error(`OpenAI API Error: ${error.message}`);
    }
  }

  /**
   * Streams content from OpenAI's API
   * 
   * @param {object} options - Generation options with streaming
   * @returns {Promise<AsyncIterable>} - The response stream
   */
  async streamContent(options) {
    if (!this.isAvailable()) {
      throw new Error('OpenAI client is not available');
    }

    const { model, system, messages, max_tokens, temperature } = options;

    try {
      // OpenAI expects the system message as part of the messages array
      const mappedMessages = this._mapMessages(messages, system);
      
      const apiOptions = {
        model: model,
        messages: mappedMessages,
        max_tokens: max_tokens,
        temperature: temperature || 0.7,
        stream: true
      };

      logger.debug(`[OpenAI] Sending streaming request to model ${model}`);
      // Return the stream directly
      return await this.openai.chat.completions.create(apiOptions);
    } catch (error) {
      logger.error(`Error starting OpenAI stream for model ${model}: ${error.message}`, { error });
      throw new Error(`OpenAI API Streaming Error: ${error.message}`);
    }
  }
}

module.exports = OpenAIProvider; 