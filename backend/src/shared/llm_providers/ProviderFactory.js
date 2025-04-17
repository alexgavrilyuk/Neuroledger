/**
 * Factory for creating LLM provider instances based on user preferences
 */
const ClaudeProvider = require('./ClaudeProvider');
const GeminiProvider = require('./GeminiProvider');
const OpenAIProvider = require('./OpenAIProvider');
const User = require('../../features/users/user.model');
const config = require('../config');
const logger = require('../utils/logger');

// Provider model mapping
const PROVIDER_MODELS = {
  claude: 'claude-3-7-sonnet-20250219',
  gemini: 'gemini-2.5-pro-preview-03-25',
  openai: 'o3-mini-2025-01-31'
};

/**
 * Gets the user's preferred AI model
 * 
 * @param {string} userId - The user ID
 * @returns {Promise<{provider: string, model: string}>} - The preferred provider and model
 */
async function getUserModelPreference(userId) {
  if (!userId) {
    logger.warn('Cannot fetch model preference without userId. Defaulting to Claude.');
    return { provider: 'claude', model: PROVIDER_MODELS.claude };
  }
  
  try {
    // Select only the preferredAiModel field
    const user = await User.findById(userId).select('settings.preferredAiModel').lean();
    const preference = user?.settings?.preferredAiModel || 'claude'; // Default to claude if not found
    
    return { 
      provider: preference, 
      model: PROVIDER_MODELS[preference] || PROVIDER_MODELS.claude
    };
  } catch (error) {
    logger.error(`Error fetching user model preference for user ${userId}: ${error.message}. Defaulting to Claude.`);
    return { provider: 'claude', model: PROVIDER_MODELS.claude };
  }
}

/**
 * Creates and returns an appropriate LLM provider based on user preference
 * 
 * @param {string} userId - The user ID
 * @returns {Promise<object>} - An instance of an LLM provider
 */
async function getProvider(userId) {
  // Fetch user preference
  const { provider: preferredProvider } = await getUserModelPreference(userId);
  let ProviderClass;
  let apiKey;

  // Try to use the preferred provider if available, otherwise fall back to available alternatives
  if (preferredProvider === 'gemini' && config.geminiApiKey) {
    const geminiProvider = new GeminiProvider(config.geminiApiKey);
    if (geminiProvider.isAvailable()) {
      logger.debug(`Using Gemini provider for user ${userId} (preferred)`);
      return geminiProvider;
    }
    // If Gemini is preferred but not available, log and fall back
    logger.warn(`User ${userId} prefers Gemini, but it's not available. Falling back.`);
  }
  
  if (preferredProvider === 'openai' || (preferredProvider !== 'claude' && config.openaiApiKey)) {
    const openaiProvider = new OpenAIProvider(config.openaiApiKey);
    if (openaiProvider.isAvailable()) {
      logger.debug(`Using OpenAI provider for user ${userId}${preferredProvider === 'openai' ? ' (preferred)' : ' (fallback)'}`);
      return openaiProvider;
    }
    // If OpenAI is preferred or second choice but not available, log and fall back
    if (preferredProvider === 'openai') {
      logger.warn(`User ${userId} prefers OpenAI, but it's not available. Falling back to Claude.`);
    }
  }
  
  // Claude is the final fallback
  const claudeProvider = new ClaudeProvider(config.claudeApiKey);
  if (claudeProvider.isAvailable()) {
    logger.debug(`Using Claude provider for user ${userId}${preferredProvider === 'claude' ? ' (preferred)' : ' (fallback)'}`);
    return claudeProvider;
  }
  
  // If we get here, no providers are available
  logger.error(`No LLM providers are available for user ${userId}!`);
  throw new Error('No LLM providers are available. Please check your API keys.');
}

module.exports = { 
  getProvider,
  getUserModelPreference // Export this for compatibility with existing code
}; 