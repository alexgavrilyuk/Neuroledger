// backend/src/features/chat/agentContext.service.js
// ENTIRE FILE - UPDATED FOR PHASE 11

const logger = require('../../shared/utils/logger');
const datasetService = require('../datasets/dataset.service');
const PromptHistory = require('./prompt.model');
const { assembleContext: assembleUserTeamContext, getHistorySummary } = require('./prompt.service');
const Papa = require('papaparse');
const { encoding_for_model } = require("tiktoken");

// Constants
const HISTORY_FETCH_LIMIT = 50;
const DATASET_SAMPLE_SIZE = 20;
const HISTORY_TOKEN_LIMIT = 3000;
const HISTORY_MESSAGES_TO_KEEP = 6;

/**
 * Service responsible for fetching and preparing various context elements required by the AgentExecutor.
 */
class AgentContextService {
    constructor(userId, teamId, sessionId) {
        this.userId = userId;
        this.teamId = teamId;
        this.sessionId = sessionId;
        try {
            this.tokenizer = encoding_for_model("gpt-4");
        } catch (e) {
            logger.error("[AgentContextService] Failed to initialize tiktoken tokenizer:", e);
            this.tokenizer = null;
        }
    }

    cleanup() {
        if (this.tokenizer) {
            try { this.tokenizer.free(); logger.debug(`[AgentContextService ${this.sessionId}] Tokenizer freed.`); }
            catch (e) { logger.error(`[AgentContextService ${this.sessionId}] Error freeing tokenizer:`, e); }
        }
    }

    async getInitialUserTeamContext() {
        try {
            const initialContext = await assembleUserTeamContext(this.userId, []);
            return { userContext: initialContext.userContext || '', teamContext: initialContext.teamContext || '' };
        } catch (error) {
            logger.error(`[Context Service ${this.sessionId}] Error fetching initial user/team context: ${error.message}`, { error });
            return { userContext: '', teamContext: '' };
        }
    }

    async preloadDatasetContext(datasetIds) {
        const datasetSchemas = {};
        const datasetSamples = {};
        if (!datasetIds || datasetIds.length === 0) {
            logger.info(`[Context Service ${this.sessionId}] No datasets to preload.`);
            return { datasetSchemas, datasetSamples };
        }
        logger.info(`[Context Service ${this.sessionId}] Preloading context for ${datasetIds.length} datasets: ${JSON.stringify(datasetIds)}`);
        for (const datasetId of datasetIds) {
            try {
                logger.debug(`[Context Service ${this.sessionId}] Processing dataset ID for context: ${datasetId}`);
                const schemaData = await datasetService.getDatasetSchema(datasetId, this.userId);
                if (schemaData) { datasetSchemas[datasetId] = schemaData; logger.debug(`[Context Service ${this.sessionId}] Preloaded schema for dataset ${datasetId}`); }
                else { logger.warn(`[Context Service ${this.sessionId}] No schema found for dataset ${datasetId}`); }
                const rawContent = await datasetService.getRawDatasetContent(datasetId, this.userId);
                if (rawContent) {
                    const parseResult = Papa.parse(rawContent, { header: true, dynamicTyping: true, skipEmptyLines: true, transformHeader: header => header.trim() });
                    if (parseResult.data && parseResult.data.length > 0) {
                        const sampleSize = DATASET_SAMPLE_SIZE; const totalRows = parseResult.data.length;
                        const startIndex = Math.max(0, totalRows - sampleSize); const sampleRows = parseResult.data.slice(startIndex);
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
     * PHASE 11 UPDATE: Ensure artifact fetching logic is robust.
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
        let finalHistoryRecords = [];

        try {
            // --- Artifact Fetching (Phase 11: Verify Logic) ---
            // Find the most recent 'ai_report' message that completed successfully
            // and has either analysis data OR generated code.
            const lastRelevantAiMessage = await PromptHistory.findOne({
                chatSessionId: this.sessionId,
                _id: { $ne: aiMessagePlaceholderId }, // Exclude current placeholder
                messageType: 'ai_report',
                status: 'completed',
                // Ensure at least one artifact exists
                $or: [
                    { reportAnalysisData: { $exists: true, $ne: null } },
                    { aiGeneratedCode: { $exists: true, $ne: null, $ne: '' } }
                ]
            })
            .sort({ createdAt: -1 }) // Get the most recent one
            .select('reportAnalysisData aiGeneratedCode createdAt _id')
            .lean();

            if (lastRelevantAiMessage) {
                // Store both artifacts if they exist on this message
                previousAnalysisResult = lastRelevantAiMessage.reportAnalysisData || null;
                previousGeneratedCode = lastRelevantAiMessage.aiGeneratedCode || null;
                logger.info(`[Context Service ${this.sessionId}] Found previous artifacts in message ${lastRelevantAiMessage._id}. Has Analysis: ${!!previousAnalysisResult}, Has Code: ${!!previousGeneratedCode}`);
            } else {
                logger.info(`[Context Service ${this.sessionId}] No suitable previous completed report with artifacts found.`);
            }
            // --- End Artifact Fetching ---

            // --- Fetch Full History Records ---
            const allHistoryRecords = await PromptHistory.find({
                chatSessionId: this.sessionId, _id: { $ne: aiMessagePlaceholderId }
            })
            .sort({ createdAt: 1 })
            .limit(HISTORY_FETCH_LIMIT)
            .select('messageType promptText aiResponseText createdAt')
            .lean();
            logger.debug(`[Context Service ${this.sessionId}] Fetched ${allHistoryRecords.length} raw history records.`);
            // --- End Fetch Full History ---

            // --- History Summarization Logic (Phase 4) ---
            let tokenCount = 0;
            if (this.tokenizer) {
                for (const msg of allHistoryRecords) {
                    const content = (msg.messageType === 'user' ? msg.promptText : msg.aiResponseText) || '';
                    tokenCount += this.tokenizer.encode(content).length;
                }
                logger.info(`[Context Service ${this.sessionId}] Calculated initial history token count: ${tokenCount}`);

                if (tokenCount > HISTORY_TOKEN_LIMIT && allHistoryRecords.length > HISTORY_MESSAGES_TO_KEEP) {
                    logger.warn(`[Context Service ${this.sessionId}] History token count (${tokenCount}) exceeds limit (${HISTORY_TOKEN_LIMIT}). Triggering summarization.`);
                    const messagesToKeep = allHistoryRecords.slice(-HISTORY_MESSAGES_TO_KEEP);
                    const messagesToSummarizeRecords = allHistoryRecords.slice(0, -HISTORY_MESSAGES_TO_KEEP);
                    const summarizationInput = messagesToSummarizeRecords.map(msg =>
                        `${msg.messageType === 'user' ? 'User' : 'Assistant'}: ${ (msg.messageType === 'user' ? msg.promptText : msg.aiResponseText) || ''}`
                    ).join('\n\n');
                    try {
                         const summaryText = await getHistorySummary(summarizationInput, this.userId);
                        if (summaryText) {
                            logger.info(`[Context Service ${this.sessionId}] History successfully summarized (Length: ${summaryText.length}).`);
                            const summaryMessage = {
                                _id: `summary-${Date.now()}`, messageType: 'system',
                                aiResponseText: `Previous conversation summary:\n${summaryText}`,
                                createdAt: messagesToSummarizeRecords[messagesToSummarizeRecords.length - 1]?.createdAt || new Date(),
                            };
                            finalHistoryRecords = [summaryMessage, ...messagesToKeep];
                        } else {
                             logger.warn(`[Context Service ${this.sessionId}] History summarization returned empty result. Using truncated history.`);
                             finalHistoryRecords = messagesToKeep;
                        }
                    } catch (summaryError) {
                        logger.error(`[Context Service ${this.sessionId}] Error during history summarization: ${summaryError.message}. Using truncated history.`, summaryError);
                         finalHistoryRecords = messagesToKeep;
                    }
                } else { finalHistoryRecords = allHistoryRecords; }
            } else {
                 logger.warn(`[Context Service ${this.sessionId}] Tiktoken tokenizer not available. Skipping history token check and summarization.`);
                 finalHistoryRecords = allHistoryRecords;
            }
            // --- End History Summarization Logic ---

            // --- Format final history for LLM ---
            const fullChatHistory = finalHistoryRecords.map(msg => ({
                role: msg.messageType === 'user' ? 'user' : 'assistant',
                content: (msg.messageType === 'user' ? msg.promptText : msg.aiResponseText) || ''
            })).filter(msg => msg.content);
            logger.debug(`[Context Service ${this.sessionId}] Prepared ${fullChatHistory.length} messages for LLM context.`);

            return { fullChatHistory, previousAnalysisResult, previousGeneratedCode };

        } catch (err) {
            logger.error(`[Context Service ${this.sessionId}] Failed to fetch/prepare chat history & artifacts: ${err.message}`, { error: err });
            return { fullChatHistory: [], previousAnalysisResult: null, previousGeneratedCode: null };
        }
    }
}

module.exports = AgentContextService;