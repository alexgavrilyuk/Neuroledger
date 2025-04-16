const logger = require('../../shared/utils/logger');
const datasetService = require('../datasets/dataset.service');
const PromptHistory = require('./prompt.model');
const { assembleContext: assembleUserTeamContext } = require('./prompt.service'); // Renamed import for clarity
const Papa = require('papaparse');

const HISTORY_FETCH_LIMIT = 20; // Max history messages to fetch for context/summarization
const DATASET_SAMPLE_SIZE = 20; // Number of sample rows to fetch for dataset context

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
        this.teamId = teamId; // May be null
        this.sessionId = sessionId;
    }

    /**
     * Fetches initial user profile and team context strings from the prompt service.
     * These strings typically contain user preferences, settings, or team-level instructions.
     *
     * @async
     * @returns {Promise<{userContext: string, teamContext: string}>} An object containing the fetched context strings.
     */
    async getInitialUserTeamContext() {
        try {
            // assembleUserTeamContext doesn't need datasetIds for this initial call
            const initialContext = await assembleUserTeamContext(this.userId, []); 
            return {
                userContext: initialContext.userContext || '',
                teamContext: initialContext.teamContext || '',
            };
        } catch (error) {
            logger.error(`[Context Service ${this.sessionId}] Error fetching initial user/team context: ${error.message}`, { error });
            return { userContext: '', teamContext: '' }; // Return empty on error
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
        const datasetSchemas = {};
        const datasetSamples = {};

        if (!datasetIds || datasetIds.length === 0) {
            logger.info(`[Context Service ${this.sessionId}] No datasets to preload.`);
            return { datasetSchemas, datasetSamples };
        }

        logger.info(`[Context Service ${this.sessionId}] Preloading context for ${datasetIds.length} datasets: ${JSON.stringify(datasetIds)}`);

        for (const datasetId of datasetIds) {
            try {
                logger.info(`[Context Service ${this.sessionId}] Processing dataset ID: ${datasetId}`);

                // 1. Fetch schema
                const schemaData = await datasetService.getDatasetSchema(datasetId, this.userId);
                if (schemaData) {
                    datasetSchemas[datasetId] = schemaData;
                    logger.info(`[Context Service ${this.sessionId}] Preloaded schema for dataset ${datasetId}`);
                } else {
                    logger.warn(`[Context Service ${this.sessionId}] No schema found for dataset ${datasetId}`);
                }

                // 2. Fetch and parse sample data (last DATASET_SAMPLE_SIZE rows)
                const rawContent = await datasetService.getRawDatasetContent(datasetId, this.userId);
                if (rawContent) {
                    const parseResult = Papa.parse(rawContent, {
                        header: true,
                        dynamicTyping: true,
                        skipEmptyLines: true,
                        transformHeader: header => header.trim(),
                    });

                    if (parseResult.data && parseResult.data.length > 0) {
                        const sampleSize = DATASET_SAMPLE_SIZE;
                        const totalRows = parseResult.data.length;
                        const startIndex = Math.max(0, totalRows - sampleSize);
                        const sampleRows = parseResult.data.slice(startIndex);

                        datasetSamples[datasetId] = {
                            totalRows,
                            sampleRows,
                        };
                        logger.info(`[Context Service ${this.sessionId}] Preloaded ${sampleRows.length} sample rows from ${totalRows} total rows for dataset ${datasetId}`);
                    } else {
                        logger.warn(`[Context Service ${this.sessionId}] No data parsed from raw content for dataset ${datasetId}`);
                    }
                } else {
                     logger.warn(`[Context Service ${this.sessionId}] No raw content found for dataset ${datasetId}`);
                }
            } catch (error) {
                logger.error(`[Context Service ${this.sessionId}] Error preloading context for dataset ${datasetId}: ${error.message}`, { error });
                // Continue with the next dataset
            }
        }
        return { datasetSchemas, datasetSamples };
    }

    /**
     * Fetches the chat history for the session and identifies the most recent artifacts
     * (analysis results and generated code) from previous successful AI report messages.
     * Formats the history for direct use by the LLM.
     *
     * @async
     * @param {string} aiMessagePlaceholderId - The MongoDB ObjectId of the current AI message placeholder to exclude from history.
     * @returns {Promise<{fullChatHistory: Array<{role: string, content: string}>, previousAnalysisResult: any|null, previousGeneratedCode: string|null}>} An object containing:
     *   - `fullChatHistory`: Array of message objects ({ role: 'user'|'assistant', content: string }) ordered chronologically.
     *   - `previousAnalysisResult`: The `reportAnalysisData` from the most recent relevant AI message, or null.
     *   - `previousGeneratedCode`: The `aiGeneratedCode` from the most recent relevant AI message, or null.
     */
    async prepareChatHistoryAndArtifacts(aiMessagePlaceholderId) {
        let fullChatHistory = [];
        let previousAnalysisResult = null;
        let previousGeneratedCode = null;

        try {
            // Fetch records that might contain artifacts (newest first)
            const artifactRecords = await PromptHistory.find({
                chatSessionId: this.sessionId,
                _id: { $ne: aiMessagePlaceholderId },
                messageType: 'ai_report', 
                status: 'completed',
                $or: [
                    { reportAnalysisData: { $exists: true, $ne: null } },
                    { aiGeneratedCode: { $exists: true, $ne: null } }
                ]
            })
            .sort({ createdAt: -1 })
            .limit(HISTORY_FETCH_LIMIT) // Limit search space
            .select('reportAnalysisData aiGeneratedCode createdAt _id')
            .lean();

            logger.debug(`[Context Service ${this.sessionId}] Fetched ${artifactRecords.length} potential artifact records.`);

            // Find the most recent successful report with analysis data
            const lastSuccessfulReport = artifactRecords.find(msg => msg.reportAnalysisData);

            if (lastSuccessfulReport) {
                previousAnalysisResult = lastSuccessfulReport.reportAnalysisData;
                previousGeneratedCode = lastSuccessfulReport.aiGeneratedCode; // May be null
                logger.info(`[Context Service ${this.sessionId}] Found previous artifacts in message ${lastSuccessfulReport._id}`);
            } else {
                logger.info(`[Context Service ${this.sessionId}] No suitable previous completed report with analysis data found.`);
            }

            // Fetch full history for LLM context (chronological)
            const fullHistoryRecords = await PromptHistory.find({
                chatSessionId: this.sessionId,
                _id: { $ne: aiMessagePlaceholderId }
            })
            .sort({ createdAt: 1 })
            .limit(HISTORY_FETCH_LIMIT)
            .select('messageType promptText aiResponseText')
            .lean();

            fullChatHistory = fullHistoryRecords.map(msg => ({
                role: msg.messageType === 'user' ? 'user' : 'assistant',
                content: (msg.messageType === 'user' ? msg.promptText : msg.aiResponseText) || ''
            })).filter(msg => msg.content);

            logger.debug(`[Context Service ${this.sessionId}] Prepared ${fullChatHistory.length} messages for LLM context.`);

        } catch (err) {
            logger.error(`[Context Service ${this.sessionId}] Failed to fetch/prepare chat history: ${err.message}`, { error: err });
            // Return empty/null values on error
            fullChatHistory = [];
            previousAnalysisResult = null;
            previousGeneratedCode = null;
        }

        return { fullChatHistory, previousAnalysisResult, previousGeneratedCode };
    }
}

module.exports = AgentContextService; 