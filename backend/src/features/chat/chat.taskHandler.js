const ChatSession = require('./chatSession.model');
const PromptHistory = require('./prompt.model');
// User model might still be needed if we add user context to agent later
// const User = require('../users/user.model');
// Dataset model no longer needed directly here
// const Dataset = require('../datasets/dataset.model');
// Team models no longer needed directly here
// const Team = require('../teams/team.model');
// const TeamMember = require('../teams/team-member.model');
// Rename emitToUser to match actual usage in socket.handler.js (if different)
// TODO: Verify correct import/usage of socket emitter
const { getIO } = require('../../socket');
const logger = require('../../shared/utils/logger');
// Remove promptService import if no longer directly used
// const promptService = require('./prompt.service');
// Remove GCS client import
// const { getBucket } = require('../../shared/external_apis/gcs.client');
const { AgentOrchestrator } = require('./agent.service'); // Import AgentOrchestrator

/**
 * Handles the worker request from Cloud Tasks for chat AI response generation
 * using the AgentOrchestrator.
 * @param {Object} payload - Task payload with IDs and context
 * @returns {Promise<void>}
 */
const workerHandler = async (payload) => {
  let userId, chatSessionId, aiMessageId; // Define vars here for catch block scope
  const io = getIO(); // Get socket instance for final emissions

  try {
    logger.info(`Chat Agent worker started with payload: ${JSON.stringify(payload)}`);
    // Extract payload data
    // sessionDatasetIds is still needed by the agent if we decide to pass it initially
    // but the agent loop itself will decide if/when to fetch content via tools.
    ({ userId, userMessageId, aiMessageId, chatSessionId, sessionDatasetIds } = payload);

    // Validate payload
    if (!userId || !userMessageId || !aiMessageId || !chatSessionId) {
      // sessionDatasetIds might be empty/null legitimately after first message
      throw new Error('Invalid payload: missing required IDs');
    }

    // Fetch the user's message to get the prompt text
    const userMessage = await PromptHistory.findById(userMessageId).lean(); // Use lean for read-only
    if (!userMessage || userMessage.userId.toString() !== userId) {
      throw new Error('User message not found or unauthorized');
    }
    if (!userMessage.promptText) {
        // Should not happen based on controller logic, but good to check
        throw new Error('User message is missing promptText');
    }

    // Fetch the chat session to get teamId if applicable
    const chatSession = await ChatSession.findById(chatSessionId).lean(); // Use lean
    if (!chatSession || chatSession.userId.toString() !== userId) {
      // TODO: Add team member access check here if applicable
      throw new Error('Chat session not found or unauthorized');
    }

    // Fetch the placeholder AI message record (we need the object to potentially update in catch block)
    // Note: AgentOrchestrator will handle the main updates inside runAgentLoop
    let aiMessageRecord = await PromptHistory.findById(aiMessageId);
    if (!aiMessageRecord || aiMessageRecord.userId.toString() !== userId) {
        throw new Error('AI placeholder message not found or unauthorized');
    }

    // --- Start Agent Orchestration --- 
    const agentOrchestrator = new AgentOrchestrator(
        userId,
        chatSession.teamId || null, // Pass teamId from session
        chatSessionId,
        aiMessageId
    );

    // The agent loop handles internal state updates (DB) and agent:* websocket events
    const agentResult = await agentOrchestrator.runAgentLoop(userMessage.promptText);

    // --- Agent Loop Finished --- 

    // Fetch the final state of the AI message record after the agent loop
    const finalAiMessage = await PromptHistory.findById(aiMessageId).lean();
    if (!finalAiMessage) {
        // This shouldn't happen if the loop updated it, but handle defensively
        throw new Error('Failed to retrieve final AI message state after agent loop.');
    }

    if (agentResult.status === 'completed') {
        logger.info(`Agent loop completed successfully for message ${aiMessageId}. Emitting final update.`);
        // Update chat session lastActivityAt (previously updatedAt)
        await ChatSession.findByIdAndUpdate(chatSessionId, { lastActivityAt: new Date() });

        // ---- ADD DEBUG LOG ----
        logger.debug(`[Task Handler Emit] Emitting completed message ${finalAiMessage._id} to user ${userId}`, { 
            sessionId: chatSessionId, 
            messageId: finalAiMessage._id, 
            hasCode: !!finalAiMessage.aiGeneratedCode, 
            codeLength: finalAiMessage.aiGeneratedCode?.length 
        });
        // ---- END DEBUG LOG ----

        // Emit the final completed event with the full message object
        if (io) {
             io.to(`user:${userId}`).emit('chat:message:completed', {
                 message: finalAiMessage, // Send the whole updated message object
                 sessionId: chatSessionId
             });
        } else {
             logger.warn('Socket.io instance not available, cannot emit chat:message:completed');
        }

    } else { // agentResult.status === 'error'
        logger.warn(`Agent loop finished with error for message ${aiMessageId}: ${agentResult.error}. Emitting final error update.`);
        // The agent loop already updated the DB record status to 'error'
        if (io) {
            // TODO: Emit to specific user/room if implemented
            io.to(`user:${userId}`).emit('chat:message:error', {
                messageId: aiMessageId,
                sessionId: chatSessionId,
                error: agentResult.error || finalAiMessage.errorMessage || 'Agent processing failed'
            });
        } else {
             logger.warn('Socket.io instance not available, cannot emit chat:message:error');
        }
    }

    // --- Remove Old Logic --- 
    // Remove fetching chatHistory - Agent will handle context
    // Remove direct status updates (generating_code, fetching_data)
    // Remove direct calls to promptService.generateWithHistory
    // Remove fetchDatasetContent call
    // Remove direct updates to aiMessage fields (aiGeneratedCode, reportDatasets etc.)
    // Remove direct emission of chat:message:processing/fetching_data/completed

  } catch (error) {
    logger.error(`Chat Agent worker failed outside agent loop: ${error.message}`, { error, payload });

    // Attempt to update AI message status to error if possible and if not already done by agent loop
    try {
      if (aiMessageId && userId) {
        // Fetch the record again to check current status
        const currentAiMessage = await PromptHistory.findById(aiMessageId);
        if (currentAiMessage && currentAiMessage.status !== 'error') {
          currentAiMessage.status = 'error'; // Generic error status
          currentAiMessage.errorMessage = `Worker failed: ${error.message}`;
          await currentAiMessage.save();
          logger.info(`Updated AI message ${aiMessageId} status to error due to worker failure outside agent loop.`);

          // Emit final error event if not already emitted by agent loop error path
          if (io) {
                // TODO: Emit to specific user/room if implemented
                io.to(`user:${userId}`).emit('chat:message:error', {
                    messageId: aiMessageId,
                    sessionId: chatSessionId,
                    error: currentAiMessage.errorMessage
                });
          } else {
             logger.warn('Socket.io instance not available, cannot emit final chat:message:error from outer catch block');
          }
        } else if (currentAiMessage) {
             logger.info(`AI message ${aiMessageId} status was already 'error'. No update needed.`);
        }
      }
    } catch (updateError) {
      logger.error(`Failed to update AI message status after outer worker failure: ${updateError.message}`);
    }

    // Rethrow the error so Cloud Tasks knows the job failed
    throw error;
  }
};

module.exports = {
  workerHandler
}; 