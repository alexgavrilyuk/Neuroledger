// ================================================================================
// FILE: backend/src/features/chat/agentContext.service.js
// PURPOSE: Fetches and prepares context (user, team, datasets, history) for the agent.
// PHASE 4 UPDATE: Added history summarization logic using tiktoken and prompt service.
// ================================================================================

const logger = require('../../shared/utils/logger');
const datasetService = require('../datasets/dataset.service');
const PromptHistory = require('./prompt.model');
const { assembleContext: assembleUserTeamContext, getHistorySummary } = require('./prompt.service'); // Renamed import & Added getHistorySummary
const Papa = require('papaparse');
const { encoding_for_model } = require("tiktoken"); // PHASE 4: Import tiktoken

// Constants
const HISTORY_FETCH_LIMIT = 50; // Fetch more messages initially to allow for summarization
const DATASET_SAMPLE_SIZE = 20;
const HISTORY_TOKEN_LIMIT = 3000; // PHASE 4: Token limit before summarization
const HISTORY_MESSAGES_TO_KEEP = 6; // PHASE 4: Number of recent messages to always keep unsmarized

/**
 * Service responsible for fetching and preparing various context elements required by the AgentExecutor.
 * This includes user/team settings, dataset metadata (schemas, samples), and chat history with artifact detection.
 * Encapsulates the logic for gathering information needed for the agent's reasoning process.
 */
class AgentContextService {
    /**
     * Creates an instance of AgentContextService.
     * @param {string} userId - The ID of the user associated with the agent.
     * @param {string | null} teamId - The ID of the team associated with the agent (if applicable).
     * @param {string} sessionId - The ID of the current chat session.
     */
    constructor(userId, teamId, sessionId) {
        this.userId = userId;
        this.teamId = teamId;
        this.sessionId = sessionId;
        // PHASE 4: Initialize tokenizer (use a common one for estimation)
        try {
            this.tokenizer = encoding_for_model("gpt-4");
        } catch (e) {
            logger.error("[AgentContextService] Failed to initialize tiktoken tokenizer:", e);
            this.tokenizer = null; // Handle potential failure gracefully
        }
    }

    // Method to safely clean up tokenizer resources
    cleanup() {
        if (this.tokenizer) {
            try {
                this.tokenizer.free();
                logger.debug(`[AgentContextService ${this.sessionId}] Tokenizer freed.`);
            } catch (e) {
                 logger.error(`[AgentContextService ${this.sessionId}] Error freeing tokenizer:`, e);
            }
        }
    }


    /**
     * Fetches initial user profile and team context strings from the prompt service.
     * These strings typically contain user preferences, settings, or team-level instructions.
     *
     * @async
     * @returns {Promise<{userContext: string, teamContext: string}>} An object containing the fetched context strings.
     */
    async getInitialUserTeamContext() {
        // (No changes needed in this method for Phase 4)
        try {
            const initialContext = await assembleUserTeamContext(this.userId, []);
            return {
                userContext: initialContext.userContext || '',
                teamContext: initialContext.teamContext || '',
            };
        } catch (error) {
            logger.error(`[Context Service ${this.sessionId}] Error fetching initial user/team context: ${error.message}`, { error });
            return { userContext: '', teamContext: '' };
        }
    }

    /**
     * Pre-fetches dataset schemas and sample data (last N rows) for a given list of dataset IDs.
     * Handles fetching from the dataset service and parsing sample data using PapaParse.
     * Errors during processing of a single dataset are logged but do not stop the processing of others.
     *
     * @async
     * @param {Array<string>} datasetIds - Array of dataset IDs in the session to preload context for.
     * @returns {Promise<{datasetSchemas: object<string, object>, datasetSamples: object<string, object>}>} An object containing:
     *   - `datasetSchemas`: A map where keys are dataset IDs and values are schema objects ({ schemaInfo, rowCount }).
     *   - `datasetSamples`: A map where keys are dataset IDs and values are sample objects ({ totalRows, sampleRows }).
     */
    async preloadDatasetContext(datasetIds) {
        // (No changes needed in this method for Phase 4)
        const datasetSchemas = {};
        const datasetSamples = {};

        if (!datasetIds || datasetIds.length === 0) {
            logger.info(`[Context Service ${this.sessionId}] No datasets to preload.`);
            return { datasetSchemas, datasetSamples };
        }

        logger.info(`[Context Service ${this.sessionId}] Preloading context for ${datasetIds.length} datasets: ${JSON.stringify(datasetIds)}`);

        for (const datasetId of datasetIds) {
            try {
                logger.debug(`[Context Service ${this.sessionId}] Processing dataset ID for context: ${datasetId}`); // Changed log level

                // 1. Fetch schema
                const schemaData = await datasetService.getDatasetSchema(datasetId, this.userId);
                if (schemaData) {
                    datasetSchemas[datasetId] = schemaData;
                    logger.debug(`[Context Service ${this.sessionId}] Preloaded schema for dataset ${datasetId}`);
                } else {
                    logger.warn(`[Context Service ${this.sessionId}] No schema found for dataset ${datasetId}`);
                }

                // 2. Fetch and parse sample data (last DATASET_SAMPLE_SIZE rows)
                const rawContent = await datasetService.getRawDatasetContent(datasetId, this.userId);
                if (rawContent) {
                    const parseResult = Papa.parse(rawContent, {
                        header: true, dynamicTyping: true, skipEmptyLines: true, transformHeader: header => header.trim(),
                    });
                    if (parseResult.data && parseResult.data.length > 0) {
                        const sampleSize = DATASET_SAMPLE_SIZE;
                        const totalRows = parseResult.data.length;
                        const startIndex = Math.max(0, totalRows - sampleSize);
                        const sampleRows = parseResult.data.slice(startIndex);
                        datasetSamples[datasetId] = { totalRows, sampleRows };
                        logger.debug(`[Context Service ${this.sessionId}] Preloaded ${sampleRows.length}/${totalRows} sample rows for dataset ${datasetId}`);
                    } else { logger.warn(`[Context Service ${this.sessionId}] No data parsed from raw content for dataset ${datasetId}`); }
                } else { logger.warn(`[Context Service ${this.sessionId}] No raw content found for dataset ${datasetId}`); }
            } catch (error) {
                logger.error(`[Context Service ${this.sessionId}] Error preloading context for dataset ${datasetId}: ${error.message}`, { error });
            }
        }
        return { datasetSchemas, datasetSamples };
    }

    /**
     * Fetches the chat history, identifies recent artifacts, and potentially summarizes older history
     * if the token count exceeds a limit. Formats the final history for the LLM.
     *
     * @async
     * @param {string} aiMessagePlaceholderId - The MongoDB ObjectId of the current AI message placeholder to exclude from history.
     * @returns {Promise<{fullChatHistory: Array<{role: string, content: string}>, previousAnalysisResult: any|null, previousGeneratedCode: string|null}>} An object containing:
     *   - `fullChatHistory`: Array of message objects ({ role: 'user'|'assistant', content: string }) ordered chronologically, potentially including a summary message.
     *   - `previousAnalysisResult`: The `reportAnalysisData` from the most recent relevant AI message, or null.
     *   - `previousGeneratedCode`: The `aiGeneratedCode` from the most recent relevant AI message, or null.
     */
    async prepareChatHistoryAndArtifacts(aiMessagePlaceholderId) {
        let previousAnalysisResult = null;
        let previousGeneratedCode = null;
        let finalHistoryRecords = []; // Will hold the records to be formatted

        try {
            // --- Artifact Fetching (remains the same) ---
            const artifactRecords = await PromptHistory.find({
                chatSessionId: this.sessionId, _id: { $ne: aiMessagePlaceholderId },
                messageType: 'ai_report', status: 'completed',
                $or: [ { reportAnalysisData: { $exists: true, $ne: null } }, { aiGeneratedCode: { $exists: true, $ne: null } } ]
            })
            .sort({ createdAt: -1 }).limit(HISTORY_FETCH_LIMIT)
            .select('reportAnalysisData aiGeneratedCode createdAt _id').lean();
            logger.debug(`[Context Service ${this.sessionId}] Fetched ${artifactRecords.length} potential artifact records.`);
            const lastSuccessfulReport = artifactRecords.find(msg => msg.reportAnalysisData);
            if (lastSuccessfulReport) {
                previousAnalysisResult = lastSuccessfulReport.reportAnalysisData;
                previousGeneratedCode = lastSuccessfulReport.aiGeneratedCode;
                logger.info(`[Context Service ${this.sessionId}] Found previous artifacts in message ${lastSuccessfulReport._id}`);
            } else { logger.info(`[Context Service ${this.sessionId}] No suitable previous completed report with analysis data found.`); }
            // --- End Artifact Fetching ---


            // --- Fetch Full History Records (potentially more than needed for context) ---
            const allHistoryRecords = await PromptHistory.find({
                chatSessionId: this.sessionId, _id: { $ne: aiMessagePlaceholderId }
            })
            .sort({ createdAt: 1 }) // Chronological for processing
            .limit(HISTORY_FETCH_LIMIT) // Limit fetched records
            .select('messageType promptText aiResponseText createdAt') // Select necessary fields
            .lean();
            logger.debug(`[Context Service ${this.sessionId}] Fetched ${allHistoryRecords.length} raw history records.`);
            // --- End Fetch Full History ---


            // --- PHASE 4: History Summarization Logic ---
            let tokenCount = 0;
            if (this.tokenizer) {
                // Calculate token count for all fetched messages
                for (const msg of allHistoryRecords) {
                    const content = (msg.messageType === 'user' ? msg.promptText : msg.aiResponseText) || '';
                    tokenCount += this.tokenizer.encode(content).length;
                }
                logger.info(`[Context Service ${this.sessionId}] Calculated initial history token count: ${tokenCount}`);

                if (tokenCount > HISTORY_TOKEN_LIMIT && allHistoryRecords.length > HISTORY_MESSAGES_TO_KEEP) {
                    logger.warn(`[Context Service ${this.sessionId}] History token count (${tokenCount}) exceeds limit (${HISTORY_TOKEN_LIMIT}). Triggering summarization.`);

                    const messagesToKeep = allHistoryRecords.slice(-HISTORY_MESSAGES_TO_KEEP);
                    const messagesToSummarizeRecords = allHistoryRecords.slice(0, -HISTORY_MESSAGES_TO_KEEP);

                    // Format messages for summarization prompt
                    const summarizationInput = messagesToSummarizeRecords.map(msg =>
                        `${msg.messageType === 'user' ? 'User' : 'Assistant'}: ${ (msg.messageType === 'user' ? msg.promptText : msg.aiResponseText) || ''}`
                    ).join('\n\n');

                    try {
                        // Call the summarization service function (using a potentially cheaper model)
                         const summaryText = await getHistorySummary(summarizationInput, this.userId); // Pass userId for provider selection maybe

                        if (summaryText) {
                            logger.info(`[Context Service ${this.sessionId}] History successfully summarized (Length: ${summaryText.length}).`);
                            // Create a system message representing the summary
                            const summaryMessage = {
                                _id: `summary-${Date.now()}`, // Placeholder ID
                                messageType: 'system', // Use a distinct type if needed, or 'assistant'
                                aiResponseText: `Previous conversation summary:\n${summaryText}`,
                                createdAt: messagesToSummarizeRecords[messagesToSummarizeRecords.length - 1]?.createdAt || new Date(), // Timestamp of last summarized message
                            };
                            // Combine summary with recent messages
                            finalHistoryRecords = [summaryMessage, ...messagesToKeep];
                        } else {
                             logger.warn(`[Context Service ${this.sessionId}] History summarization returned empty result. Using truncated history.`);
                             // Fallback: Keep only the most recent messages if summarization fails
                             finalHistoryRecords = messagesToKeep;
                        }
                    } catch (summaryError) {
                        logger.error(`[Context Service ${this.sessionId}] Error during history summarization: ${summaryError.message}. Using truncated history.`, summaryError);
                         // Fallback: Keep only the most recent messages
                         finalHistoryRecords = messagesToKeep;
                    }
                } else {
                    // Token count is within limit or not enough messages to summarize
                    finalHistoryRecords = allHistoryRecords;
                }
            } else {
                 logger.warn(`[Context Service ${this.sessionId}] Tiktoken tokenizer not available. Skipping history token check and summarization.`);
                 finalHistoryRecords = allHistoryRecords; // Use fetched history directly
            }
            // --- End PHASE 4 Logic ---

            // --- Format final history for LLM ---
            const fullChatHistory = finalHistoryRecords.map(msg => ({
                role: msg.messageType === 'user' ? 'user' : 'assistant', // Treat 'system' summary as 'assistant' for model
                content: (msg.messageType === 'user' ? msg.promptText : msg.aiResponseText) || ''
            })).filter(msg => msg.content); // Ensure no empty messages

            logger.debug(`[Context Service ${this.sessionId}] Prepared ${fullChatHistory.length} messages for LLM context.`);

            return { fullChatHistory, previousAnalysisResult, previousGeneratedCode };

        } catch (err) {
            logger.error(`[Context Service ${this.sessionId}] Failed to fetch/prepare chat history & artifacts: ${err.message}`, { error: err });
            return { fullChatHistory: [], previousAnalysisResult: null, previousGeneratedCode: null };
        } finally {
            // PHASE 4: Cleanup tokenizer after use in this method
            // this.cleanup(); // Consider if cleanup should be here or after the entire agent run
        }
    }
}

module.exports = AgentContextService;