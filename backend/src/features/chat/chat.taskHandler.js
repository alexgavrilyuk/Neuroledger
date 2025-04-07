const ChatSession = require('./chatSession.model');
const PromptHistory = require('../prompts/prompt.model');
const User = require('../users/user.model');
const Dataset = require('../datasets/dataset.model');
const Team = require('../teams/team.model');
const TeamMember = require('../teams/team-member.model');
const promptService = require('../prompts/prompt.service');
const { emitToUser } = require('../../socket');
const logger = require('../../shared/utils/logger');
const { getBucket } = require('../../shared/external_apis/gcs.client'); // Import GCS client helper

/**
 * Fetches content for given dataset IDs from GCS.
 */
const fetchDatasetContent = async (datasetIds) => {
  if (!datasetIds || datasetIds.length === 0) {
    return [];
  }
  logger.debug(`Fetching content for datasets: ${datasetIds.join(', ')}`);
  const bucket = getBucket();
  const datasets = await Dataset.find({ _id: { $in: datasetIds } }).select('name gcsPath').lean();
  const results = [];

  for (const ds of datasets) {
    if (!ds.gcsPath) {
      results.push({ name: ds.name, content: null, error: 'Dataset GCS path missing' });
      continue;
    }
    try {
      const file = bucket.file(ds.gcsPath);
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error(`File not found at path: ${ds.gcsPath}`);
      }
      // Download the entire file content
      const [buffer] = await file.download();
      results.push({ name: ds.name, content: buffer.toString('utf8'), error: null });
      logger.debug(`Successfully fetched content for ${ds.name}`);
    } catch (fetchErr) {
      logger.error(`Failed to fetch content for dataset ${ds.name} (${ds._id}):`, fetchErr);
      results.push({ name: ds.name, content: null, error: fetchErr.message || 'Failed to fetch content' });
    }
  }
  return results;
};

/**
 * Handles the worker request from Cloud Tasks for chat AI response generation
 * @param {Object} payload - Task payload with IDs and context
 * @returns {Promise<void>}
 */
const workerHandler = async (payload) => {
  logger.info(`Chat AI worker started with payload: ${JSON.stringify(payload)}`);

  try {
    // Extract payload data
    // Use the sessionDatasetIds field passed from addMessage
    const { userId, userMessageId, aiMessageId, chatSessionId, sessionDatasetIds } = payload;

    // Validate payload
    if (!userId || !userMessageId || !aiMessageId || !chatSessionId || !sessionDatasetIds) {
      throw new Error('Invalid payload: missing required IDs or sessionDatasetIds');
    }

    // Fetch the user's message to get the prompt text
    const userMessage = await PromptHistory.findById(userMessageId);
    if (!userMessage || userMessage.userId.toString() !== userId) {
      throw new Error('User message not found or unauthorized');
    }

    // Fetch the AI message to update its status
    const aiMessage = await PromptHistory.findById(aiMessageId);
    if (!aiMessage || aiMessage.userId.toString() !== userId) {
      throw new Error('AI message not found or unauthorized');
    }

    // Fetch the chat session
    const chatSession = await ChatSession.findById(chatSessionId);
    if (!chatSession || chatSession.userId.toString() !== userId) {
      throw new Error('Chat session not found or unauthorized');
    }

    // Get all previous messages in this chat session to build context
    const previousMessages = await PromptHistory.find({
      chatSessionId,
      createdAt: { $lt: userMessage.createdAt }
    }).sort({ createdAt: 1 });

    // Format previous messages for context
    const chatHistory = previousMessages.map(msg => {
      if (msg.messageType === 'user') {
        return {
          role: 'user',
          content: msg.promptText,
          timestamp: msg.createdAt
        };
      } else if (msg.messageType === 'ai_report') {
        return {
          role: 'assistant',
          content: msg.aiGeneratedCode || msg.aiResponseText,
          timestamp: msg.createdAt
        };
      }
      return null;
    }).filter(Boolean); // Remove any null entries

    // Update AI message status to processing
    aiMessage.status = 'generating_code';
    await aiMessage.save();

    // Emit event that processing has started
    emitToUser(userId, 'chat:message:processing', {
      messageId: aiMessageId,
      sessionId: chatSessionId
    });

    // Generate AI response using the existing prompt service with the additional chat history
    // Pass sessionDatasetIds received from the task payload
    const response = await promptService.generateWithHistory(userId, userMessage.promptText, sessionDatasetIds, chatHistory);

    // Fetch dataset content *after* generating code
    aiMessage.status = 'fetching_data'; 
    await aiMessage.save();
    emitToUser(userId, 'chat:message:fetching_data', { messageId: aiMessageId, sessionId: chatSessionId }); // Optional: finer-grained status update

    let fetchedDatasets = [];
    try {
        fetchedDatasets = await fetchDatasetContent(sessionDatasetIds);
        const fetchErrors = fetchedDatasets.filter(d => d.error).map(d => `${d.name}: ${d.error}`);
        if (fetchErrors.length > 0) {
            logger.warn(`Some datasets failed to fetch for report rendering: ${fetchErrors.join(', ')}`);
            // Decide if this is a fatal error or just include partial data
        }
    } catch (dataFetchError) {
        logger.error(`Critical error fetching dataset content for report: ${dataFetchError.message}`);
        throw new Error(`Failed to retrieve dataset content: ${dataFetchError.message}`); // Make it a fatal error for this message
    }

    // Update the AI message with generated code AND fetched data
    aiMessage.aiGeneratedCode = response.aiGeneratedCode;
    aiMessage.aiResponseText = response.aiResponseText; // In case code fails, maybe text response
    aiMessage.reportDatasets = fetchedDatasets; // Save fetched data
    aiMessage.contextSent = response.contextSent;
    aiMessage.durationMs = response.durationMs;
    aiMessage.claudeModelUsed = response.claudeModelUsed;
    aiMessage.status = 'completed';
    await aiMessage.save();

    // Update chat session updatedAt
    chatSession.updatedAt = new Date();
    await chatSession.save();

    // <<<--- ADD LOGGING HERE --- >>>
    logger.debug(`Emitting completed message with reportDatasets: ${JSON.stringify(aiMessage.reportDatasets)}`);
    
    // Emit event that processing is complete with the updated message (including reportDatasets)
    emitToUser(userId, 'chat:message:completed', {
      message: aiMessage, // Send the whole updated message object
      sessionId: chatSessionId
    });

    logger.info(`Successfully generated AI response and fetched data for chat message: ${aiMessageId}`);
  } catch (error) {
    logger.error(`Chat AI worker failed: ${error.message}`);

    // Update AI message status to error if possible
    try {
      if (payload?.aiMessageId && payload?.userId) {
        const aiMessage = await PromptHistory.findById(payload.aiMessageId);
        if (aiMessage) {
          aiMessage.status = aiMessage.status === 'fetching_data' ? 'error_fetching_data' : 'error_generating'; // Set more specific error
          aiMessage.errorMessage = error.message;
          await aiMessage.save();

          // Emit error event
          emitToUser(payload.userId, 'chat:message:error', {
            messageId: payload.aiMessageId,
            sessionId: payload.chatSessionId,
            error: error.message
          });

          logger.info(`Updated AI message ${payload.aiMessageId} status to error due to worker failure`);
        }
      }
    } catch (updateError) {
      logger.error(`Failed to update AI message status after worker failure: ${updateError.message}`);
    }

    throw error;
  }
};

module.exports = {
  workerHandler
}; 