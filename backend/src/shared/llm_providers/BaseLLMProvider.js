/**
 * Base class defining the interface for LLM providers.
 * All specific provider implementations should extend this class.
 */
class BaseLLMProvider {
  /**
   * Constructor for the base provider
   * 
   * @param {string} apiKey - The API key for the provider
   * @param {object} config - Optional configuration parameters
   */
  constructor(apiKey, config = {}) {
    this.apiKey = apiKey;
    this.config = config;
  }

  /**
   * Checks if this provider is available/configured correctly
   * 
   * @returns {boolean} - Whether the provider is available
   */
  isAvailable() {
    throw new Error("Not implemented in base class");
  }

  /**
   * Generates content using the provider's API (non-streaming)
   * 
   * @param {object} options - Generation options
   * @param {string} options.model - The model to use
   * @param {array} options.messages - The message history
   * @param {string} options.system - System prompt
   * @param {number} options.max_tokens - Maximum tokens to generate
   * @param {number} options.temperature - Sampling temperature
   * @returns {Promise<object>} - The generation result
   */
  async generateContent(options) {
    throw new Error("Not implemented in base class");
  }

  /**
   * Streams content from the provider's API
   * 
   * @param {object} options - Same options as generateContent, but with streaming
   * @returns {Promise<AsyncIterable>} - A stream of response chunks
   */
  async streamContent(options) {
    throw new Error("Not implemented in base class");
  }

  /**
   * Helper method to map messages to the provider's expected format
   * 
   * @param {array} messages - Messages in standard format [{role, content}]
   * @param {string} systemPrompt - The system prompt (if applicable)
   * @returns {array} - Messages in provider-specific format
   */
  _mapMessages(messages, systemPrompt) {
    // Default implementation returns messages unchanged
    return messages;
  }
}

module.exports = BaseLLMProvider; 