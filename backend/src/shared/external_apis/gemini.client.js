const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../utils/logger');

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
    logger.warn('GEMINI_API_KEY is not set in environment variables. Gemini client will not be available.');
}

let genAI;
try {
    genAI = new GoogleGenerativeAI(API_KEY);
    logger.info('Google Generative AI client initialized successfully.');
} catch (error) {
    logger.error(`Failed to initialize Google Generative AI client: ${error.message}`, { error });
    genAI = null; // Ensure client is null if initialization fails
}

// Function to map Claude-style messages to Gemini format
const mapMessagesToGemini = (messages) => {
    return messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user', // Map 'assistant' to 'model'
        parts: [{ text: msg.content }]
    }));
};

// Function to map Claude-style system prompt to Gemini format
const mapSystemPromptToGemini = (systemPrompt) => {
    if (!systemPrompt) return null;
    return {
        role: 'user', // Gemini uses alternating user/model roles, system goes as first user message part
        parts: [{ text: `System Instructions: \n${systemPrompt}` }]
    };
};


/**
 * Sends a request to the Google Gemini API.
 *
 * @param {object} options - The options for the API call.
 * @param {string} options.model - The Gemini model to use (e.g., 'gemini-2.5-pro').
 * @param {string} [options.system] - The system prompt (optional).
 * @param {Array<object>} options.messages - The message history in Claude format [{role: 'user'|'assistant', content: '...'}].
 * @param {number} [options.max_tokens] - Max output tokens (used as maxOutputTokens).
 * @param {number} [options.temperature] - Sampling temperature.
 * @returns {Promise<object>} - The Gemini API response content.
 */
const generateContent = async (options) => {
    if (!genAI) {
        throw new Error('Gemini client is not initialized.');
    }

    const { model, system, messages, max_tokens, temperature } = options;

    if (!model || !messages || !Array.isArray(messages)) {
        throw new Error('Missing required parameters: model and messages array.');
    }

    // --- Gemini API Interaction ---
    try {
        const geminiModel = genAI.getGenerativeModel({ model });

        // Map Claude messages and prepend system prompt if it exists
        const geminiSystemPrompt = mapSystemPromptToGemini(system);
        const geminiMessages = mapMessagesToGemini(messages);
        const history = geminiSystemPrompt ? [geminiSystemPrompt, ...geminiMessages] : geminiMessages;

        // Prepare generation config
        const generationConfig = {};
        if (max_tokens !== undefined) generationConfig.maxOutputTokens = max_tokens;
        if (temperature !== undefined) generationConfig.temperature = temperature;

        // Use generateContent for single-turn or simple exchanges for now
        // For more complex chat, consider startChat with history
        const result = await geminiModel.generateContent({
            contents: history,
            generationConfig: generationConfig,
            // Safety settings could be added here if needed
        });

        const response = await result.response;
        const responseText = response.text();

        // Mimic Claude's response structure slightly for easier integration initially
        // Claude: { content: [{ type: 'text', text: '...' }] }
        // Gemini (this function): { content: [{ type: 'text', text: '...' }] }
        if (!responseText) {
             logger.warn(`Gemini API returned an empty response for model ${model}.`);
             // Return structure consistent with how Claude errors might be checked
             return { content: [{ type: 'text', text: '' }] }; 
        }
        
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
        // Include details if available (e.g., safety ratings block)
        if (error.response && error.response.promptFeedback) {
             logger.error('Gemini API prompt feedback:', error.response.promptFeedback);
        }
        if (error.response && error.response.candidates) {
             logger.error('Gemini API candidate feedback:', error.response.candidates.map(c => c.finishReason));
        }
        // Propagate a generic error structure similar to potential Claude errors
        throw new Error(`Gemini API Error: ${error.message}`); 
    }
};

module.exports = {
    generateContent,
    isAvailable: () => !!genAI, // Export a function to check availability
}; 