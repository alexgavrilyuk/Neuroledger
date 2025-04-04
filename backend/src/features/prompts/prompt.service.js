// backend/src/features/prompts/prompt.service.js
// ** UPDATED FILE - Now includes business and dataset context **
const anthropic = require('../../shared/external_apis/claude.client');
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const PromptHistory = require('./prompt.model');
const logger = require('../../shared/utils/logger');
const generateSystemPrompt = require('./system-prompt-template');

// Enhanced context assembly function
const assembleContext = async (userId, selectedDatasetIds) => {
    let contextString = "";

    try {
        // Get user data including settings with business context
        const user = await User.findById(userId).select('settings').lean();

        // Add currency and date format from user settings
        contextString += `- User Preferences: Currency=${user?.settings?.currency || 'USD'}, DateFormat=${user?.settings?.dateFormat || 'YYYY-MM-DD'}\n`;

        // Add team settings if needed (future feature)
        contextString += "- Team Settings: (Not implemented yet)\n";

        // Add dataset context
        contextString += "- Selected Datasets:\n";

        if (selectedDatasetIds && selectedDatasetIds.length > 0) {
            const datasets = await Dataset.find({ _id: { $in: selectedDatasetIds }, ownerId: userId })
                .select('name description schemaInfo columnDescriptions').lean();

            if (!datasets || datasets.length === 0) {
                contextString += "  - No accessible datasets found for the provided IDs.\n";
            } else {
                datasets.forEach(ds => {
                    contextString += `  - Name: ${ds.name}\n`;

                    // Add dataset description if available
                    if (ds.description) {
                        contextString += `    Dataset Description: ${ds.description}\n`;
                    } else {
                        contextString += `    Description: (No description provided)\n`;
                    }

                    contextString += `    Columns:\n`;

                    if (ds.schemaInfo && ds.schemaInfo.length > 0) {
                        ds.schemaInfo.forEach(col => {
                            const colDesc = ds.columnDescriptions && ds.columnDescriptions[col.name];
                            const colName = typeof col === 'object' && col.name ? col.name : String(col);
                            const colType = typeof col === 'object' && col.type ? col.type : 'unknown';
                            const descText = colDesc ? `: ${colDesc}` : '';
                            contextString += `      - ${colName} (Type: ${colType})${descText}\n`;
                        });
                    } else {
                        contextString += `      - (No column schema available)\n`;
                    }
                });
            }
        } else {
            contextString += "  - None selected.\n";
        }

        return {
            contextString,
            userContext: user?.settings?.aiContext || ''
        };
    } catch (error) {
        logger.error(`Error assembling context: ${error.message}`);
        return {
            contextString: "Error assembling detailed context: " + error.message,
            userContext: ''
        };
    }
};

// generateCode function using the template
const generateCode = async (userId, promptText, selectedDatasetIds) => {
    if (!anthropic) {
        logger.error("generateCode called but Anthropic client is not initialized.");
        throw new Error('AI assistant is currently unavailable.');
     }

    const startTime = Date.now();
    // Log intent clearly
    logger.info(`Generating React CODE for user ${userId}, Prompt: "${promptText}", Datasets: [${selectedDatasetIds.join(', ')}]`);
    let historyId = null;
    let historyStatus = 'pending';
    let historyErrorMessage = null;
    let generatedCode = null; // Will store the code string
    let contextUsed = '';
    let userContextUsed = '';

    // Create Initial History Record
    try {
        const initialHistory = new PromptHistory({ userId, promptText, selectedDatasetIds, status: 'generating_code' });
        const saved = await initialHistory.save();
        historyId = saved._id;
        logger.info(`Initial prompt history record created ID: ${historyId}`);
    } catch (dbError) {
        logger.error(`Failed to create initial prompt history for user ${userId}: ${dbError.message}`);
    }

    try {
        // 1. Assemble Enhanced Context
        logger.debug(`Assembling context for historyId: ${historyId}`);
        const { contextString, userContext } = await assembleContext(userId, selectedDatasetIds);
        contextUsed = contextString;
        userContextUsed = userContext;
        logger.debug(`Context assembled successfully for historyId: ${historyId}. Length: ${contextUsed.length}`);
        logger.debug(`Business context available: ${userContextUsed ? 'Yes' : 'No'}`);

        // 2. Generate system prompt using the template
        const systemPrompt = generateSystemPrompt({
            userContext: userContextUsed,
            datasetContext: contextUsed,
            promptText
        });
        logger.debug(`System prompt generated for historyId: ${historyId}. Length: ${systemPrompt.length}`);

        const messages = [{ role: "user", content: "Generate the React component code based on the provided context and user prompt." }];
        const modelToUse = "claude-3-7-sonnet-20250219";
        // Allow more tokens for potentially complex code generation
        const apiOptions = { model: modelToUse, max_tokens: 16000, system: systemPrompt, messages, temperature: 0.2 };

        // 3. Call Claude API
        logger.debug(`Calling Claude API for CODE generation with model ${apiOptions.model}...`);
        const claudeApiResponse = await anthropic.messages.create(apiOptions);
        const rawResponse = claudeApiResponse.content?.[0]?.type === 'text' ? claudeApiResponse.content[0].text : null;
        logger.debug(`Claude RAW CODE response received for historyId ${historyId}. Length: ${rawResponse?.length}`);

        // 4. Extract code
        if (rawResponse) {
            // Attempt to remove markdown backticks if present
             const codeRegex = /```(?:javascript|jsx)?\s*([\s\S]*?)\s*```/;
             const match = rawResponse.match(codeRegex);
             if (match && match[1]) {
                 generatedCode = match[1].trim();
                 logger.debug(`Extracted JS Code Block for historyId ${historyId}.`);
             } else {
                 // Assume raw response is the code if no markdown
                 generatedCode = rawResponse.trim();
                 logger.debug(`Using raw response as code for historyId ${historyId}.`);
             }
             // Basic validation: does it look like a function?
              if (!generatedCode.includes('function ReportComponent') && !generatedCode.includes('React.createElement')) {
                  logger.warn(`Generated code for ${historyId} might be invalid (doesn't contain expected keywords).`);
                  // Consider throwing an error here if validation is strict
                  // throw new Error('AI did not generate recognizable React component code.');
              }

             logger.debug(`--- START GENERATED CODE (History ID: ${historyId}) ---`);
             console.log(generatedCode); // Log the final code string
             logger.debug(`--- END GENERATED CODE ---`);
            historyStatus = 'completed';
        } else {
             logger.error(`Unexpected or empty response format from Claude API for historyId ${historyId}:`, claudeApiResponse);
             throw new Error('Unexpected response format from AI assistant.');
        }

        // 5. Final History Update
        if (historyId) {
             logger.debug(`Updating history ${historyId} with status: ${historyStatus}`);
             await PromptHistory.findByIdAndUpdate(historyId, {
                 status: historyStatus,
                 aiGeneratedCode: generatedCode, // Store the CODE string
                 aiResponseText: null,
                 contextSent: contextUsed,
                 durationMs: Date.now() - startTime,
                 claudeModelUsed: apiOptions.model,
                 errorMessage: null,
                 executionResult: null,
             });
             logger.info(`Final prompt history update ID: ${historyId}. Status: ${historyStatus}`);
        }

        // 6. Return the CODE STRING
        return {
            aiGeneratedCode: generatedCode, // Return the code string
            promptId: historyId,
            status: historyStatus
        };

    } catch (error) {
        logger.error(`Error during prompt code generation for historyId: ${historyId || 'N/A'}: ${error.message}`, error.stack);
         historyStatus = 'error_generating';
         historyErrorMessage = error.message;
         if (historyId) {
             try {
                 await PromptHistory.findByIdAndUpdate(historyId, {
                     status: historyStatus,
                     errorMessage: historyErrorMessage,
                     contextSent: contextUsed,
                     durationMs: Date.now() - startTime,
                     aiGeneratedCode: null,
                     aiResponseText: null
                 });
             }
             catch (dbError) {
                 logger.error(`Failed to update history with error state for ID ${historyId}: ${dbError.message}`);
             }
         }
        // Return error state to controller
        return {
             aiGeneratedCode: null, // Return null code
             promptId: historyId,
             status: historyStatus,
             errorMessage: historyErrorMessage
         };
    }
};

module.exports = {
    generateCode,
};