// backend/src/features/prompts/prompt.service.js
// ** UPDATED FILE - Now includes team business context **
const anthropic = require('../../shared/external_apis/claude.client');
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const Team = require('../teams/team.model');
const TeamMember = require('../teams/team-member.model');
const PromptHistory = require('./prompt.model');
const logger = require('../../shared/utils/logger');
const systemPromptTemplate = require('./system-prompt-template');

// Enhanced context assembly function - now includes team context
const assembleContext = async (userId, selectedDatasetIds) => {
    let contextString = "";

    try {
        // Get user data including settings with business context
        const user = await User.findById(userId).select('settings').lean();

        // Add currency and date format from user settings
        contextString += `- User Preferences: Currency=${user?.settings?.currency || 'USD'}, DateFormat=${user?.settings?.dateFormat || 'YYYY-MM-DD'}\n`;

        // Add user business context if available
        if (user?.settings?.aiContext) {
            contextString += `- User Business Context: ${user.settings.aiContext}\n`;
        }

        // Get team memberships and add team settings/context
        const teamMemberships = await TeamMember.find({ userId }).lean();
        if (teamMemberships && teamMemberships.length > 0) {
            const teamIds = teamMemberships.map(membership => membership.teamId);
            const teams = await Team.find({ _id: { $in: teamIds } }).lean();

            if (teams.length > 0) {
                contextString += "- Team Contexts:\n";
                teams.forEach(team => {
                    if (team.settings?.aiContext) {
                        contextString += `  - Team "${team.name}": ${team.settings.aiContext}\n`;
                    }
                });
            }
        }

        // Add dataset context
        contextString += "- Selected Datasets:\n";

        if (selectedDatasetIds && selectedDatasetIds.length > 0) {
            // Modify query to include both personal and team datasets the user has access to
            const teamIds = teamMemberships ? teamMemberships.map(tm => tm.teamId) : [];

            const datasets = await Dataset.find({
                _id: { $in: selectedDatasetIds },
                $or: [
                    { ownerId: userId, teamId: null }, // Personal datasets
                    { teamId: { $in: teamIds } }       // Team datasets user has access to
                ]
            }).populate('teamId', 'name').lean();

            if (!datasets || datasets.length === 0) {
                contextString += "  - No accessible datasets found for the provided IDs.\n";
            } else {
                datasets.forEach(ds => {
                    contextString += `  - Name: ${ds.name}`;

                    // Add team name if it's a team dataset
                    if (ds.teamId) {
                        contextString += ` (Team: ${ds.teamId.name})`;
                    }
                    contextString += "\n";

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
        const systemPrompt = systemPromptTemplate({
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

/**
 * Generate code with chat history context
 * @param {string} userId - User ID
 * @param {string} promptText - Current user prompt
 * @param {Array} selectedDatasetIds - Selected dataset IDs
 * @param {Array} chatHistory - Array of previous messages with { role, content, timestamp }
 * @returns {Promise<Object>} - Generated code response
 */
const generateWithHistory = async (userId, promptText, selectedDatasetIds, chatHistory = []) => {
    if (!anthropic) {
        logger.error("generateWithHistory called but Anthropic client is not initialized.");
        throw new Error('AI assistant is currently unavailable.');
    }

    const startTime = Date.now();
    logger.info(`Generating React CODE with history for user ${userId}, Prompt: "${promptText}", Datasets: [${selectedDatasetIds.join(', ')}], History: ${chatHistory.length} messages`);
    
    let generatedCode = null;
    let contextUsed = '';
    let userContextUsed = '';
    let totalHistoryTokens = 0;

    try {
        // 1. Assemble Enhanced Context
        logger.debug(`Assembling context for chat message`);
        const { contextString, userContext } = await assembleContext(userId, selectedDatasetIds);
        contextUsed = contextString;
        userContextUsed = userContext;
        logger.debug(`Context assembled successfully. Length: ${contextUsed.length}`);
        logger.debug(`Business context available: ${userContextUsed ? 'Yes' : 'No'}`);
        logger.debug(`Chat history available: ${chatHistory.length > 0 ? 'Yes' : 'No'}`);

        // 2. Generate system prompt using the template, including chat history
        const systemPrompt = systemPromptTemplate({
            userContext: userContextUsed,
            datasetContext: contextUsed,
            promptText,
            chatHistory
        });
        logger.debug(`System prompt with history generated. Length: ${systemPrompt.length}`);

        const messages = [{ role: "user", content: "Generate the React component code based on the provided context, chat history, and user prompt." }];
        const modelToUse = "claude-3-7-sonnet-20250219";
        // Allow more tokens for potentially complex code generation
        const apiOptions = { model: modelToUse, max_tokens: 16000, system: systemPrompt, messages, temperature: 0.2 };

        // 3. Call Claude API
        logger.debug(`Calling Claude API for CODE generation with model ${apiOptions.model}...`);
        const claudeApiResponse = await anthropic.messages.create(apiOptions);
        const rawResponse = claudeApiResponse.content?.[0]?.type === 'text' ? claudeApiResponse.content[0].text : null;
        logger.debug(`Claude RAW CODE response received. Length: ${rawResponse?.length}`);

        // 4. Extract code
        if (rawResponse) {
            // Attempt to remove markdown backticks if present
            const codeRegex = /```(?:javascript|jsx)?\s*([\s\S]*?)\s*```/;
            const match = rawResponse.match(codeRegex);
            if (match && match[1]) {
                generatedCode = match[1].trim();
                logger.debug(`Extracted JS Code Block.`);
            } else {
                // Assume raw response is the code if no markdown
                generatedCode = rawResponse.trim();
                logger.debug(`Using raw response as code.`);
            }
            // Basic validation: does it look like a function?
            if (!generatedCode.includes('function ReportComponent') && !generatedCode.includes('React.createElement')) {
                logger.warn(`Generated code might be invalid (doesn't contain expected keywords).`);
                // We'll still return the code, but log the warning
            }

            logger.debug(`--- START GENERATED CODE WITH HISTORY ---`);
            console.log(generatedCode); // Log the final code string
            logger.debug(`--- END GENERATED CODE ---`);
        } else {
            logger.error(`Unexpected or empty response format from Claude API:`, claudeApiResponse);
            throw new Error('Unexpected response format from AI assistant.');
        }

        return {
            aiGeneratedCode: generatedCode,
            aiResponseText: null,
            contextSent: systemPrompt,
            durationMs: Date.now() - startTime,
            claudeModelUsed: modelToUse
        };
    } catch (error) {
        logger.error(`Error generating code with history: ${error.message}`);
        throw error;
    }
};

module.exports = {
    generateCode,
    generateWithHistory
};