// backend/src/features/chat/chat.taskHandler.js
const ChatSession = require('./chatSession.model');
const PromptHistory = require('./prompt.model');
const { getIO } = require('../../socket');
const logger = require('../../shared/utils/logger');
const { AgentOrchestrator } = require('./agent.service');

/**
 * Handles the worker request from Cloud Tasks for chat AI response generation
 * using the AgentOrchestrator.
 * @param {Object} payload - Task payload with IDs and context
 * @returns {Promise<void>}
 */
const workerHandler = async (payload) => {
  let userId, chatSessionId, aiMessageId;
  const io = getIO();

  try {
    logger.info(`Chat Agent worker started with payload: ${JSON.stringify(payload)}`);
    // Extract payload data
    ({ userId, userMessageId, aiMessageId, chatSessionId, sessionDatasetIds } = payload);

    // Validate payload
    if (!userId || !userMessageId || !aiMessageId || !chatSessionId) {
      throw new Error('Invalid payload: missing required IDs');
    }

    // Fetch the user's message to get the prompt text
    const userMessage = await PromptHistory.findById(userMessageId).lean();
    if (!userMessage || userMessage.userId.toString() !== userId) {
      throw new Error('User message not found or unauthorized');
    }
    if (!userMessage.promptText) {
      throw new Error('User message is missing promptText');
    }

    // Fetch the chat session to get teamId if applicable
    const chatSession = await ChatSession.findById(chatSessionId).lean();
    if (!chatSession || chatSession.userId.toString() !== userId) {
      throw new Error('Chat session not found or unauthorized');
    }

    // Fetch the placeholder AI message record
    let aiMessageRecord = await PromptHistory.findById(aiMessageId);
    if (!aiMessageRecord || aiMessageRecord.userId.toString() !== userId) {
        throw new Error('AI placeholder message not found or unauthorized');
    }

    // Look for previous analysis results for context
    let previousAnalysisData = null;
    let previousGeneratedCode = null;

    try {
        const previousAiMessage = await PromptHistory.findOne({
            chatSessionId: chatSessionId,
            messageType: 'ai_report',
            // Find the latest AI message BEFORE the current user message
            createdAt: { $lt: userMessage.createdAt }
        })
        .sort({ createdAt: -1 })
        .select('reportAnalysisData aiGeneratedCode')
        .lean();

        if (previousAiMessage) {
            previousAnalysisData = previousAiMessage.reportAnalysisData;
            previousGeneratedCode = previousAiMessage.aiGeneratedCode;
            logger.debug(`[Task Handler] Found previous analysis artifacts. Analysis: ${!!previousAnalysisData}, Code: ${!!previousGeneratedCode}`);
        } else {
            logger.debug('[Task Handler] No previous AI message found in this session.');
        }
    } catch (historyError) {
         logger.error(`[Task Handler] Error fetching previous AI message history: ${historyError.message}`);
         // Continue without previous context if history fetch fails
    }

    // Create and run the Agent Orchestrator
    const agentOrchestrator = new AgentOrchestrator(
        userId,
        chatSession.teamId || null,
        chatSessionId,
        aiMessageId,
        previousAnalysisData,
        previousGeneratedCode
    );

    // The agent loop handles internal state updates and websocket events
    const agentResult = await agentOrchestrator.runAgentLoop(userMessage.promptText);

    // Fetch the final state of the AI message record after the agent loop
    const finalAiMessage = await PromptHistory.findById(aiMessageId).lean();
    if (!finalAiMessage) {
        throw new Error('Failed to retrieve final AI message state after agent loop.');
    }

    if (agentResult.status === 'completed') {
        logger.info(`Agent loop completed successfully for message ${aiMessageId}. Emitting final update.`);
        // Update chat session lastActivityAt
        await ChatSession.findByIdAndUpdate(chatSessionId, { lastActivityAt: new Date() });

        logger.debug(`[Task Handler Emit] Emitting completed message ${finalAiMessage._id} to user ${userId}`, { 
            sessionId: chatSessionId, 
            messageId: finalAiMessage._id, 
            hasCode: !!finalAiMessage.aiGeneratedCode, 
            analysisKeys: finalAiMessage.reportAnalysisData ? Object.keys(finalAiMessage.reportAnalysisData) : []
        });

        // Emit the final completed event with the full message object
        if (io) {
             io.to(`user:${userId}`).emit('chat:message:completed', {
                 message: finalAiMessage,
                 sessionId: chatSessionId
             });
        } else {
             logger.warn('Socket.io instance not available, cannot emit chat:message:completed');
        }

    } else { // agentResult.status === 'error'
        logger.warn(`Agent loop finished with error for message ${aiMessageId}: ${agentResult.error}. Emitting final error update.`);

        if (agentResult.error?.includes('Analysis result is missing')) {
            logger.error(`[Task Handler] Specific Error: Failed to modify report for message ${aiMessageId} because previous analysis data was missing. Error from agent: ${agentResult.error}`);
        }

        if (io) {
            io.to(`user:${userId}`).emit('chat:message:error', {
                messageId: aiMessageId,
                sessionId: chatSessionId,
                error: agentResult.error || finalAiMessage?.errorMessage || 'Agent processing failed' 
            });
        } else {
             logger.warn('Socket.io instance not available, cannot emit chat:message:error');
        }
    }

  } catch (error) {
    logger.error(`Chat Agent worker failed outside agent loop: ${error.message}`, { error, payload });

    // Attempt to update AI message status to error if possible
    try {
      if (aiMessageId && userId) {
        // Fetch the record to check current status
        const currentAiMessage = await PromptHistory.findById(aiMessageId);
        if (currentAiMessage && currentAiMessage.status !== 'error') {
          currentAiMessage.status = 'error';
          currentAiMessage.errorMessage = `Worker failed: ${error.message}`;
          await currentAiMessage.save();
          logger.info(`Updated AI message ${aiMessageId} status to error due to worker failure.`);

          // Emit final error event
          if (io) {
                io.to(`user:${userId}`).emit('chat:message:error', {
                    messageId: aiMessageId,
                    sessionId: chatSessionId,
                    error: currentAiMessage.errorMessage
                });
          } else {
             logger.warn('Socket.io instance not available, cannot emit final error');
          }
        } else if (currentAiMessage) {
             logger.info(`AI message ${aiMessageId} status was already 'error'. No update needed.`);
        }
      }
    } catch (updateError) {
      logger.error(`Failed to update AI message status after worker failure: ${updateError.message}`);
    }

    // Rethrow the error so Cloud Tasks knows the job failed
    throw error;
  }
};

module.exports = {
  workerHandler
};