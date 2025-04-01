// backend/src/features/prompts/prompt.service.js
// ** UPDATED FILE **
const anthropic = require('../../shared/external_apis/claude.client');
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const PromptHistory = require('./prompt.model');
const logger = require('../../shared/utils/logger');

// Basic context assembly (will be enhanced in later phases)
const assembleContext = async (userId, selectedDatasetIds) => {
    let contextString = "Context:\n";

    // Fetch User Settings (placeholders for now)
    const user = await User.findById(userId).select('settings').lean();
    contextString += `- User Settings: Currency=${user?.settings?.currency || 'USD'}, DateFormat=${user?.settings?.dateFormat || 'YYYY-MM-DD'}. ${user?.settings?.aiContext || ''}\n`;

    // Fetch Team Settings (placeholder for now)
    contextString += `- Team Settings: (Not implemented yet)\n`;

    // Fetch Selected Dataset Info
    contextString += "- Selected Datasets:\n";
    if (selectedDatasetIds && selectedDatasetIds.length > 0) {
        // Find datasets ensuring they belong to the user (or team later)
        // TODO: Add team dataset access logic later
        const datasets = await Dataset.find({
            _id: { $in: selectedDatasetIds },
            ownerId: userId // Basic ownership check for now
        }).select('name description schemaInfo columnDescriptions').lean(); // Using .lean()

        if (!datasets || datasets.length === 0) {
            contextString += "  - No accessible datasets found for the provided IDs.\n";
        } else {
            datasets.forEach(ds => {
                contextString += `  - Name: ${ds.name}\n`;
                contextString += `    Description: ${ds.description || '(No description provided)'}\n`;
                contextString += `    Columns:\n`;
                if (ds.schemaInfo && ds.schemaInfo.length > 0) {
                    ds.schemaInfo.forEach(col => {
                        // --- FIX: Access columnDescriptions as a plain object ---
                        // Use bracket notation because .lean() was used.
                        const colDesc = ds.columnDescriptions?.[col.name];
                        // --- END FIX ---
                        contextString += `      - ${col.name} (Type: ${col.type})${colDesc ? `: ${colDesc}` : ''}\n`;
                    });
                } else {
                    contextString += `      - (No column schema available)\n`;
                }
            });
        }
    } else {
        contextString += "  - None selected.\n";
    }

    return contextString;
};

/**
 * Creates a prompt, gets a textual response from Claude, and saves history.
 */
const createPromptResponse = async (userId, promptText, selectedDatasetIds) => {
    if (!anthropic) {
        // Log the attempt even if the client isn't ready
        logger.error(`Attempted prompt generation for user ${userId} but Claude client is not initialized.`);
        throw new Error('AI assistant is currently unavailable.'); // More user-friendly message
    }

    const startTime = Date.now();
    logger.info(`Generating prompt response for user ${userId}`);

    // 1. Assemble Context
    let context;
    try {
        context = await assembleContext(userId, selectedDatasetIds);
        logger.debug(`Context assembled successfully for user ${userId}. Length: ${context?.length}`);
    } catch (err) {
        logger.error(`Failed to assemble context for user ${userId}: ${err.message}`, err.stack); // Log stack trace
        throw new Error("Failed to prepare analysis context."); // Rethrow the specific error
    }

    // 2. Create the message history for Claude
    const systemPrompt = `You are NeuroLedger AI, a helpful financial analyst assistant. Your goal is to analyze financial information based on the provided user prompt and the context about their datasets (column names, descriptions) and settings.

IMPORTANT: Provide your response as a clear, concise textual summary and analysis based *only* on the user's prompt and the provided context. DO NOT generate code. Focus on insights, trends, or answers directly derivable from the dataset schema information and the user's question. If the context lacks sufficient detail to answer fully, state that clearly.`;

    const messages = [
        {
            role: "user",
            content: `${context}\n\nUser Prompt: ${promptText}`
        }
    ];

    // 3. Call Claude API
    let aiResponseText = '';
    let claudeApiResponse = null;
    try {
        logger.debug(`Calling Claude API for user ${userId}`);
        claudeApiResponse = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 1024,
            system: systemPrompt,
            messages: messages,
        });

        if (claudeApiResponse.content && claudeApiResponse.content.length > 0 && claudeApiResponse.content[0].type === 'text') {
             aiResponseText = claudeApiResponse.content[0].text;
             logger.debug(`Claude response received for user ${userId}. Content length: ${aiResponseText?.length}`);
        } else {
            logger.warn(`Unexpected response format from Claude API for user ${userId}:`, claudeApiResponse);
             throw new Error('Unexpected response format from AI assistant');
        }

    } catch (error) {
        logger.error(`Claude API call failed for user ${userId}: ${error.message}`, error);
        const errorMessage = error.error?.message || error.message || 'Failed to get response from AI assistant.';
        throw new Error(errorMessage);
    }

    // 4. Save Prompt History
    let historyId;
    try {
        const history = new PromptHistory({
            userId,
            promptText,
            selectedDatasetIds,
            contextSent: context,
            aiResponseText,
            status: 'completed',
            durationMs: Date.now() - startTime,
            claudeModelUsed: claudeApiResponse?.model || 'claude-3-haiku-20240307',
        });
        const savedHistory = await history.save();
        historyId = savedHistory._id;
        logger.info(`Prompt history saved for user ${userId}, ID: ${historyId}`);
    } catch (error) {
        logger.error(`Failed to save prompt history for user ${userId}: ${error.message}`);
    }

    return { aiResponseText, historyId };
};

module.exports = {
    createPromptResponse,
};