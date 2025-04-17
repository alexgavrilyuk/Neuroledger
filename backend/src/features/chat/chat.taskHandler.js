// ================================================================================
// FILE: NeuroLedger copy/backend/src/features/chat/chat.taskHandler.js
// PURPOSE: Handles Cloud Task invocation, calls the new agent service runner.
// MODIFIED FILE
// ================================================================================

const ChatSession = require('./chatSession.model');
const PromptHistory = require('./prompt.model');
const { runAgent } = require('./agent.service'); // Import the new runner function
const { getIO } = require('../../socket');
const logger = require('../../shared/utils/logger');

/**
 * Handles the worker request from Cloud Tasks for chat AI response generation
 * using the new agent service runner.
 * @param {Object} payload - Task payload with IDs and context
 * @returns {Promise<void>}
 */
const workerHandler = async (payload) => {
  let userId, chatSessionId, aiMessageId, userMessageId; // Define vars for scope
  const io = getIO(); // Get socket instance

  try {
    logger.info(`[Task Handler] Chat Agent worker started with payload: ${JSON.stringify(payload)}`);
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

    // Fetch the chat session (needed for teamId and final update)
    const chatSession = await ChatSession.findById(chatSessionId).lean();
    if (!chatSession || chatSession.userId.toString() !== userId) {
      // TODO: Add team member access check here if applicable later
      throw new Error('Chat session not found or unauthorized');
    }

    // Fetch previous artifacts (analysis data, generated code) for context
    let initialPreviousAnalysisData = null;
    let initialPreviousGeneratedCode = null;
    try {
        const previousAiMessage = await PromptHistory.findOne({
            chatSessionId: chatSessionId,
            messageType: 'ai_report',
            status: 'completed',
            createdAt: { $lt: userMessage.createdAt } // Before the current user message
        })
        .sort({ createdAt: -1 })
        .select('reportAnalysisData aiGeneratedCode')
        .lean();
        if (previousAiMessage) {
            initialPreviousAnalysisData = previousAiMessage.reportAnalysisData;
            initialPreviousGeneratedCode = previousAiMessage.aiGeneratedCode;
        }
    } catch (historyError) {
         logger.error(`[Task Handler] Error fetching previous AI message history: ${historyError.message}`);
    }

    // --- Call the Agent Service Runner ---
    const agentResult = await runAgent({
        userId,
        teamId: chatSession.teamId || null,
        sessionId: chatSessionId,
        aiMessagePlaceholderId: aiMessageId,
        // Provide a simple callback for final WebSocket emissions (if needed)
        // Note: AgentRunner now uses its own callback for SSE events.
        // This callback is ONLY for the final message status AFTER the agent finishes.
        sendEventCallback: (eventName, eventData) => {
             logger.debug(`[Task Handler] sendEventCallback received event: ${eventName}`, eventData);
             // This callback might become redundant if SSE handles everything,
             // but keeping for potential final WebSocket confirmation.
             // if (io) {
             //     io.to(`user:${userId}`).emit(eventName, eventData);
             // }
        },
        userMessage: userMessage.promptText,
        sessionDatasetIds: sessionDatasetIds || [], // Ensure it's an array
        initialPreviousAnalysisData,
        initialPreviousGeneratedCode
    });

    // --- Agent Run Finished ---
    // AgentRunner handles updating the PromptHistory record internally.
    // We just need to handle the final outcome (e.g., update session, emit final WS event).

    if (agentResult.status === 'completed') {
        logger.info(`[Task Handler] Agent run completed successfully for message ${aiMessageId}.`);
        // Update chat session lastActivityAt (previously updatedAt)
        await ChatSession.findByIdAndUpdate(chatSessionId, { updatedAt: new Date() }); // Keep using updatedAt for now

        // Optional: Emit final WebSocket confirmation (SSE handles primary streaming)
        // Fetch final message state to send
        const finalAiMessage = await PromptHistory.findById(aiMessageId).lean();
        if (io && finalAiMessage) {
            io.to(`user:${userId}`).emit('chat:message:completed', {
                 message: finalAiMessage,
                 sessionId: chatSessionId
            });
             logger.debug(`[Task Handler Emit] Emitted FINAL 'chat:message:completed' via WebSocket for ${finalAiMessage._id}`);
        } else if (!finalAiMessage) {
            logger.error(`[Task Handler] Failed to fetch final AI message ${aiMessageId} after completion.`);
        }

    } else { // agentResult.status === 'error'
        logger.warn(`[Task Handler] Agent run finished with error for message ${aiMessageId}: ${agentResult.error}.`);
        // AgentRunner already updated the DB record status to 'error'.

        // Optional: Emit final WebSocket error confirmation
        if (io) {
            io.to(`user:${userId}`).emit('chat:message:error', {
                messageId: aiMessageId,
                sessionId: chatSessionId,
                error: agentResult.error || 'Agent processing failed'
            });
             logger.debug(`[Task Handler Emit] Emitted FINAL 'chat:message:error' via WebSocket for ${aiMessageId}`);
        }
    }

  } catch (error) {
    // Catch errors occurring *before* or *after* the agent run call
    logger.error(`[Task Handler] Worker failed outside agent run: ${error.message}`, { error, payload });

    // Attempt to update AI message status to error if possible
    try {
      if (aiMessageId && userId) {
        const currentAiMessage = await PromptHistory.findById(aiMessageId);
        if (currentAiMessage && currentAiMessage.status !== 'error') {
          currentAiMessage.status = 'error';
          currentAiMessage.errorMessage = `Task Handler Error: ${error.message}`;
           currentAiMessage.completedAt = new Date(); // Mark completion time even for error
          await currentAiMessage.save();
          logger.info(`[Task Handler] Updated AI message ${aiMessageId} status to error due to outer task failure.`);

          // Optional: Emit final WebSocket error event if possible
          if (io) {
                io.to(`user:${userId}`).emit('chat:message:error', {
                    messageId: aiMessageId,
                    sessionId: chatSessionId,
                    error: currentAiMessage.errorMessage
                });
                logger.debug(`[Task Handler Emit] Emitted FINAL 'chat:message:error' via WebSocket from outer catch for ${aiMessageId}`);
          }
        }
      }
    } catch (updateError) {
      logger.error(`[Task Handler] Failed to update AI message status after outer worker failure: ${updateError.message}`);
    }

    // IMPORTANT: Rethrow the error so Cloud Tasks knows the job ultimately failed
    // and potentially retries based on queue configuration.
    throw error;
  }
};

module.exports = {
  workerHandler
};