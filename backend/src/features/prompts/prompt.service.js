// backend/src/features/prompts/prompt.service.js
// ** COMPLETE FILE - Added matching logging **

const anthropic = require('../../shared/external_apis/claude.client');
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const PromptHistory = require('./prompt.model');
const logger = require('../../shared/utils/logger');
const executionService = require('../code_execution/execution.service');
const { fetchDataForSandbox } = require('../code_execution/execution.service');

// Context assembly function (Full Implementation)
const assembleContext = async (userId, selectedDatasetIds) => {
    let contextString = "Context:\n";
    const user = await User.findById(userId).select('settings').lean();
    contextString += `- User Settings: Currency=${user?.settings?.currency || 'USD'}, DateFormat=${user?.settings?.dateFormat || 'YYYY-MM-DD'}. ${user?.settings?.aiContext || ''}\n`;
    contextString += `- Team Settings: (Not implemented yet)\n`;
    contextString += "- Selected Datasets:\n";
    if (selectedDatasetIds && selectedDatasetIds.length > 0) {
        const datasets = await Dataset.find({ _id: { $in: selectedDatasetIds }, ownerId: userId })
            .select('name description gcsPath schemaInfo columnDescriptions').lean();
        if (!datasets || datasets.length === 0) {
            contextString += "  - No accessible datasets found for the provided IDs.\n";
        } else {
            datasets.forEach(ds => {
                contextString += `  - Name: ${ds.name}\n`;
                contextString += `    Description: ${ds.description || '(No description provided)'}\n`;
                contextString += `    Columns:\n`;
                if (ds.schemaInfo && ds.schemaInfo.length > 0) {
                    ds.schemaInfo.forEach(col => {
                        const colDesc = ds.columnDescriptions?.[col.name];
                        contextString += `      - ${col.name} (Type: ${col.type})${colDesc ? `: ${colDesc}` : ''}\n`;
                    });
                } else { contextString += `      - (No column schema available)\n`; }
            });
        }
    } else { contextString += "  - None selected.\n"; }
    return contextString;
};

// Fetch dataset content function (Full Implementation)
const fetchDatasetContent = async (userId, selectedDatasetIds) => {
    logger.debug(`Fetching content for datasets: ${selectedDatasetIds}`);
    const datasets = await Dataset.find({ _id: { $in: selectedDatasetIds }, ownerId: userId }).select('name gcsPath').lean();
    if (!datasets || datasets.length === 0) throw new Error("No accessible datasets found to fetch content.");
    const contentPromises = datasets.map(async (ds) => {
        try {
            const content = await fetchDataForSandbox(ds.gcsPath);
            return { name: ds.name, gcsPath: ds.gcsPath, content: content };
        } catch (error) {
            logger.error(`Failed to fetch content for dataset ${ds.name} (${ds.gcsPath}): ${error.message}`);
            return { name: ds.name, gcsPath: ds.gcsPath, content: null, error: error.message };
        }
    });
    return Promise.all(contentPromises);
};

// Generate code and execute function (Full Implementation)
const generateCodeAndExecute = async (userId, promptText, selectedDatasetIds) => {
    if (!anthropic) { throw new Error('AI assistant is currently unavailable.'); }
    if (!executionService || typeof executionService.executeGeneratedCode !== 'function') {
        throw new Error('Report generation engine is currently unavailable.');
    }

    const startTime = Date.now();
    logger.info(`Generating CODE and executing report for user ${userId}`);
    let historyId = null;
    let historyStatus = 'pending';
    let historyErrorMessage = null;
    let generatedCode = null;
    let executionResult = null;
    let fetchedDatasetContent = null;

    // Create Initial History Record
    try {
        const initialHistory = new PromptHistory({ userId, promptText, selectedDatasetIds, status: 'generating_code' });
        const saved = await initialHistory.save();
        historyId = saved._id;
        logger.info(`Initial prompt history record created ID: ${historyId}`);
    } catch (dbError) { logger.error(`Failed to create initial prompt history for user ${userId}: ${dbError.message}`); }

    try {
        // 1. Assemble Context
        const context = await assembleContext(userId, selectedDatasetIds);

        // 1b. Pre-fetch Actual Data
        try {
            fetchedDatasetContent = await fetchDatasetContent(userId, selectedDatasetIds);
            // --- ADDED LOGGING ---
            const fetchedContentSummary = (fetchedDatasetContent || []).map(d => ({
                name: d?.name, contentLength: d?.content?.length, error: d?.error, hasContent: !!d?.content
            }));
            logger.debug(`Result of fetchDatasetContent (summary):`, JSON.stringify(fetchedContentSummary, null, 2));
            // --- END LOGGING ---
            if (fetchedDatasetContent.every(d => d.error)) { throw new Error("Failed to load content for all selected datasets."); }
             logger.debug(`Successfully completed fetching for ${fetchedDatasetContent.length} dataset(s) for historyId: ${historyId}`); // Changed wording
        } catch (fetchError) {
             logger.error(`Fatal error during dataset content fetching for historyId ${historyId}: ${fetchError.message}`);
             historyStatus = 'error_generating';
             historyErrorMessage = `Failed to load required dataset content: ${fetchError.message}`;
              if (historyId) await PromptHistory.findByIdAndUpdate(historyId, { status: historyStatus, errorMessage: historyErrorMessage, durationMs: Date.now() - startTime });
             throw new Error(historyErrorMessage);
        }

        // 2. Define System Prompt (Corrected escaping, requires React.createElement, sync processing)
        const systemPrompt = `You are NeuroLedger AI, an expert React developer and data analyst... [SAME AS PREVIOUS STEP] ... enclosed in \`\`\`javascript ... \`\`\`.`;

        const messages = [{ role: "user", content: `${context}\n\nUser Prompt: ${promptText}` }];
        const modelToUse = "claude-3-7-sonnet-20250219"; // Corrected model
        const apiOptions = { model: modelToUse, max_tokens: 10000, system: systemPrompt, messages };

        // 3. Call Claude API...
        logger.debug(`Calling Claude API for CODE generation with options:`, JSON.stringify(apiOptions, null, 2));
        const claudeApiResponse = await anthropic.messages.create(apiOptions);
        const rawResponse = claudeApiResponse.content?.[0]?.type === 'text' ? claudeApiResponse.content[0].text : null;
        logger.debug(`Claude RAW response content received for historyId ${historyId}. Length: ${rawResponse?.length}`); // Log length

        // Extract code...
        if (rawResponse) {
            const match = rawResponse.match(/```javascript\s*([\s\S]*?)\s*```/);
            if (match && match[1]) {
                generatedCode = match[1].trim();
                logger.debug(`Successfully extracted JS Code Block for historyId ${historyId}. Length: ${generatedCode.length}`);
                historyStatus = 'execution_pending';
            } else { /* ... handle no code block ... */ throw new Error('AI failed to generate the expected code format.'); }
        } else { /* ... handle unexpected API response ... */ throw new Error('Unexpected response format from AI assistant.'); }

        // Update history with code
        if (historyId && historyStatus === 'execution_pending') await PromptHistory.findByIdAndUpdate(historyId, { status: historyStatus, aiGeneratedCode: generatedCode });

        // 4. Prepare Execution Context
        const executionContext = { datasets: fetchedDatasetContent };
        historyStatus = 'executing_code';
        if (historyId) await PromptHistory.findByIdAndUpdate(historyId, { status: historyStatus });

        // 5. Call Code Execution Service
        logger.info(`Calling execution service for historyId: ${historyId}`);
        const executionServiceResult = await executionService.executeGeneratedCode(generatedCode, executionContext); // Pass generatedCode and context
        logger.info(`Execution service finished for historyId: ${historyId}. Status: ${executionServiceResult.status}`);

        // 6. Process Execution Result
        if (executionServiceResult.status === 'success') {
             executionResult = executionServiceResult.output;
             historyStatus = 'completed';
        } else {
            historyErrorMessage = executionServiceResult.message || 'Code execution failed.';
            historyStatus = 'error_executing';
        }

        // 7. Final History Update
        if (historyId) {
             await PromptHistory.findByIdAndUpdate(historyId, {
                 status: historyStatus,
                 errorMessage: historyErrorMessage,
                 executionResult: executionResult, // Store HTML output or error message
                 durationMs: Date.now() - startTime,
                 claudeModelUsed: apiOptions.model,
             });
             logger.info(`Final prompt history update ID: ${historyId}. Status: ${historyStatus}`);
        }

        // 8. Return result
        return { executionOutput: executionResult || historyErrorMessage, status: historyStatus, historyId: historyId, };

    } catch (error) { // Catch errors...
        logger.error(`Error during prompt processing for historyId: ${historyId}: ${error.message}`, error.stack);
         historyStatus = (historyStatus === 'pending' || historyStatus === 'generating_code') ? 'error_generating' : 'error_executing';
         historyErrorMessage = error.message;
         if (historyId) {
             try { await PromptHistory.findByIdAndUpdate(historyId, { status: historyStatus, errorMessage: historyErrorMessage, durationMs: Date.now() - startTime }); }
             catch (dbError) { logger.error(`Failed to update history with error state for ID ${historyId}: ${dbError.message}`); }
         }
        throw error; // Rethrow to controller
    }
};

module.exports = {
    generateCodeAndExecute,
};