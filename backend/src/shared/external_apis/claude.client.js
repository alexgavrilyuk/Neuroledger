// backend/src/shared/external_apis/claude.client.js
const Anthropic = require('@anthropic-ai/sdk');
const config = require('../config');
const logger = require('../utils/logger');

let anthropic;

try {
  if (!config.claudeApiKey) {
    throw new Error('Claude API Key (CLAUDE_API_KEY) is missing in environment variables.');
  }
  anthropic = new Anthropic({
    apiKey: config.claudeApiKey,
  });
  logger.info('Anthropic Claude Client Initialized');
} catch (error) {
  logger.error('Anthropic Claude Client Initialization Error:', error.message);
  // Decide if the application should exit or just log the error
  // For a core feature like this, exiting might be appropriate if the API key is missing
  if (error.message.includes('missing')) {
       process.exit(1);
  }
  // Otherwise, maybe allow startup but log that Claude features will fail
  anthropic = null; // Ensure client is null if init fails
}

module.exports = anthropic; // Export the initialized client instance (or null)