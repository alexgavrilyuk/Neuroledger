# LLM Providers

This directory contains the implementation of the LLM (Large Language Model) provider abstraction layer for NeuroLedger. It follows the Adapter pattern to provide a unified interface for interacting with different LLM providers.

## Architecture

- `BaseLLMProvider.js`: Defines the common interface that all providers must implement.
- `ClaudeProvider.js`: Implements the provider interface for Anthropic's Claude.
- `GeminiProvider.js`: Implements the provider interface for Google's Gemini.
- `OpenAIProvider.js`: Implements the provider interface for OpenAI's models.
- `ProviderFactory.js`: Creates the appropriate provider instance based on user preferences and available API keys.

## Common Interface

All LLM providers implement the following common interface:

- `constructor(apiKey, config = {})`: Initializes the provider with the given API key and optional configuration.
- `isAvailable()`: Checks if the provider is available (API key is valid, dependencies are installed, etc.).
- `generateContent(options)`: Generates content from the provider (non-streaming).
- `streamContent(options)`: Streams content from the provider.
- `_mapMessages(messages, systemPrompt)`: Internal helper method to map messages to the provider's expected format.

## Usage

```javascript
const { getProvider } = require('./shared/llm_providers/ProviderFactory');

async function exampleUsage(userId) {
  try {
    // Get the appropriate provider for the user
    const provider = await getProvider(userId);
    
    // Use the provider to generate content
    const options = {
      model: 'claude-3-7-sonnet-20250219', // The model to use
      messages: [{ role: 'user', content: 'Hello, how are you?' }], // Message history
      system: 'You are a helpful assistant.', // System prompt
      max_tokens: 4096, // Maximum tokens to generate
      temperature: 0.7 // Sampling temperature
    };
    
    const response = await provider.generateContent(options);
    console.log(response.content[0].text);
  } catch (error) {
    console.error('Error:', error.message);
  }
}
```

## Provider Selection Logic

The `ProviderFactory.getProvider()` function selects the appropriate provider based on the following criteria:

1. Check the user's preferred AI model setting.
2. Try to use the preferred provider if it's available.
3. If the preferred provider is not available, fall back to the next available provider.
4. If no providers are available, throw an error.

The fallback order is:
1. User's preference (Gemini, OpenAI, or Claude)
2. OpenAI (if not already tried)
3. Claude (final fallback)

## Error Handling

All provider implementations include proper error handling and logging. If a provider is not available or encounters an error, it will throw a descriptive error message. The factory will try to fall back to other providers when possible. 