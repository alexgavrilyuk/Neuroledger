// ================================================================================
// FILE: NeuroLedger copy/backend/src/features/chat/chat.service.js
// PURPOSE: Handles chat session logic and streaming requests.
// PHASE 5 UPDATE: Ensure handleStreamingChatRequest correctly defines and passes
//                 the SSE event callback to runAgent.
// ================================================================================

const ChatSession = require('./chatSession.model');
const PromptHistory = require('./prompt.model');
const { createTask } = require('../../shared/services/cloudTasks.service');
const config = require('../../shared/config');
const logger = require('../../shared/utils/logger');
const { runAgent } = require('./agent.service');

// --- Existing Session CRUD functions (createChatSession, getUserChatSessions, etc.) remain unchanged ---

/**
 * Create a new chat session
 * @param {string} userId - The user ID
 * @param {string} [teamId] - Optional team ID if chat is team-based
 * @param {string} [title] - Optional title (defaults to "New Chat")
 * @returns {Promise<Object>} - Newly created chat session
 */
const createChatSession = async (userId, teamId = null, title = "New Chat") => {
  try {
    const chatSession = new ChatSession({
      userId,
      teamId,
      title,
      createdAt: new Date(),
      updatedAt: new Date() // Use updatedAt for last activity tracking
    });

    await chatSession.save();
    logger.info(`Created chat session ${chatSession._id} for user ${userId}`);
    return chatSession;
  } catch (error) {
    logger.error(`Failed to create chat session: ${error.message}`);
    throw error;
  }
};

/**
 * Get user's chat sessions
 * @param {string} userId - The user ID
 * @param {number} [limit=50] - Maximum number of sessions to retrieve (increased default)
 * @param {number} [skip=0] - Number of sessions to skip (for pagination)
 * @returns {Promise<Array>} - Array of chat sessions
 */
const getUserChatSessions = async (userId, limit = 50, skip = 0) => {
  try {
    const sessions = await ChatSession.find({ userId })
      .sort({ updatedAt: -1 }) // Sort by last activity
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean for read-only

    logger.debug(`Retrieved ${sessions.length} chat sessions for user ${userId}`);
    return sessions;
  } catch (error) {
    logger.error(`Failed to get user chat sessions: ${error.message}`);
    throw error;
  }
};

/**
 * Get a chat session by ID
 * @param {string} sessionId - The chat session ID
 * @param {string} userId - The user ID (for authorization check)
 * @returns {Promise<Object>} - Chat session
 */
const getChatSessionById = async (sessionId, userId) => {
  try {
    // TODO: Add team member access check if applicable
    const session = await ChatSession.findOne({
      _id: sessionId,
      userId
    }).lean(); // Use lean for read-only

    if (!session) {
      logger.warn(`Chat session ${sessionId} not found or user ${userId} unauthorized.`);
      throw new Error('Chat session not found or unauthorized');
    }

    logger.debug(`Retrieved chat session ${sessionId} for user ${userId}`);
    return session;
  } catch (error) {
    logger.error(`Failed to get chat session by ID ${sessionId}: ${error.message}`);
    throw error; // Rethrow original error or a generic one
  }
};

/**
 * Update a chat session
 * @param {string} sessionId - The chat session ID
 * @param {string} userId - The user ID (for authorization check)
 * @param {Object} updateData - Data to update (currently only 'title')
 * @returns {Promise<Object>} - Updated chat session document
 */
const updateChatSession = async (sessionId, userId, updateData) => {
  try {
    // Use findOneAndUpdate for atomicity and return updated doc
    const updatedSession = await ChatSession.findOneAndUpdate(
      { _id: sessionId, userId }, // Query matches session ID and owner
      { $set: { title: updateData.title, updatedAt: new Date() } }, // Update title and timestamp
      { new: true } // Return the updated document
    ).lean(); // Use lean for read-only return

    if (!updatedSession) {
      logger.warn(`Update failed: Chat session ${sessionId} not found or user ${userId} unauthorized.`);
      throw new Error('Chat session not found or unauthorized');
    }

    logger.info(`Updated chat session ${sessionId} title to "${updatedSession.title}"`);
    return updatedSession;
  } catch (error) {
    logger.error(`Failed to update chat session ${sessionId}: ${error.message}`);
    throw error;
  }
};

/**
 * Delete a chat session and all associated messages
 * @param {string} sessionId - The chat session ID
 * @param {string} userId - The user ID (for authorization check)
 * @returns {Promise<{success: boolean, message: string}>} - Deletion result
 */
const deleteChatSession = async (sessionId, userId) => {
    const session = await mongoose.startSession(); // Use a transaction
    session.startTransaction();
    try {
      // Verify ownership first within transaction
      const chatSession = await ChatSession.findOne({ _id: sessionId, userId }).session(session);
      if (!chatSession) {
        throw new Error('Chat session not found or unauthorized');
      }

      // Delete messages associated with the session
      const messageDeletionResult = await PromptHistory.deleteMany({ chatSessionId: sessionId }).session(session);
      logger.info(`Deleted ${messageDeletionResult.deletedCount} messages for session ${sessionId}`);

      // Delete the session itself
      await ChatSession.deleteOne({ _id: sessionId }).session(session);

      await session.commitTransaction();
      logger.info(`Successfully deleted chat session ${sessionId} and associated messages by user ${userId}`);
      return { success: true, message: 'Chat session and messages deleted' };

    } catch (error) {
        await session.abortTransaction();
        logger.error(`Failed to delete chat session ${sessionId}: ${error.message}`);
        throw error; // Rethrow the error after aborting
    } finally {
        session.endSession();
    }
};

/**
 * Add a message to a chat session and queue AI response generation (Non-streaming).
 * Enforces dataset selection on the first message.
 * @param {string} sessionId - The chat session ID
 * @param {string} userId - The user ID
 * @param {string} promptText - The user's message
 * @param {Array<string>} [selectedDatasetIds=[]] - Array of dataset IDs (used for the first message)
 * @returns {Promise<{userMessage: object, aiMessage: object, updatedSession: object}>} - Created messages and session
 */
const addMessage = async (sessionId, userId, promptText, selectedDatasetIds = []) => {
  const session = await mongoose.startSession(); // Use transaction
  session.startTransaction();
  try {
    // Verify session exists and belongs to user
    const chatSession = await ChatSession.findOne({ _id: sessionId, userId }).session(session);
    if (!chatSession) {
      throw new Error('Chat session not found or unauthorized');
    }

    // Check if this is the first message in the session
    const messageCount = await PromptHistory.countDocuments({ chatSessionId: sessionId }).session(session);
    const isFirstMessage = messageCount === 0;
    let finalDatasetIds = [];

    if (isFirstMessage) {
      if (!selectedDatasetIds || selectedDatasetIds.length === 0) {
        throw new Error('At least one dataset must be selected for the first message in a chat session.');
      }
      chatSession.associatedDatasetIds = selectedDatasetIds;
      finalDatasetIds = selectedDatasetIds;
    } else {
      finalDatasetIds = chatSession.associatedDatasetIds || [];
      if (finalDatasetIds.length === 0 && messageCount > 0) { // Check messageCount > 0
        logger.warn(`Session ${sessionId} has subsequent messages but no associated datasets.`);
      }
    }

    // Create user message
    const userMessage = new PromptHistory({
      userId,
      chatSessionId: sessionId,
      promptText,
      selectedDatasetIds: finalDatasetIds,
      messageType: 'user',
      status: 'completed',
      createdAt: new Date()
    });
    await userMessage.save({ session });

    // Update session updatedAt timestamp and save associated datasets if needed
    chatSession.updatedAt = new Date();
    await chatSession.save({ session });

    // Create AI placeholder
    const aiMessage = new PromptHistory({
      userId,
      chatSessionId: sessionId,
      promptText: "",
      selectedDatasetIds: finalDatasetIds,
      messageType: 'ai_report',
      status: 'processing',
      createdAt: new Date()
    });
    await aiMessage.save({ session });

    // Commit transaction before creating task
    await session.commitTransaction();

    // Create background task (outside transaction)
    const payload = {
      userId: userId.toString(),
      userMessageId: userMessage._id.toString(),
      aiMessageId: aiMessage._id.toString(),
      chatSessionId: sessionId.toString(),
      sessionDatasetIds: finalDatasetIds.map(id => id.toString())
    };
    await createTask(config.chatAiQueueName, '/internal/chat-ai-worker', payload);

    logger.info(`User message ${userMessage._id} added, AI message ${aiMessage._id} placeholder created, task queued for session ${sessionId}.`);
    return {
      userMessage: userMessage.toObject(),
      aiMessage: aiMessage.toObject(),
      updatedSession: chatSession.toObject() // Return the potentially updated session
    };

  } catch (error) {
    await session.abortTransaction();
    logger.error(`Failed to add message to session ${sessionId}: ${error.message}`);
    throw error; // Rethrow error after aborting
  } finally {
    session.endSession();
  }
};


/**
 * Get messages for a chat session
 * @param {string} sessionId - The chat session ID
 * @param {string} userId - The user ID (for authorization check)
 * @param {number} [limit=50] - Maximum number of messages to retrieve
 * @param {number} [skip=0] - Number of messages to skip (for pagination)
 * @returns {Promise<Array<Object>>} - Array of message objects
 */
const getChatMessages = async (sessionId, userId, limit = 50, skip = 0) => {
  try {
    // Verify session exists and belongs to user
    const sessionExists = await ChatSession.exists({ _id: sessionId, userId });
    if (!sessionExists) {
      logger.warn(`Attempt to get messages for non-existent/unauthorized session ${sessionId} by user ${userId}.`);
      throw new Error('Chat session not found or unauthorized');
    }

    // Fetch messages
    const messages = await PromptHistory.find({ chatSessionId: sessionId })
      .select('+aiGeneratedCode +reportAnalysisData +steps +messageFragments') // Explicitly include required fields
      .sort({ createdAt: 1 }) // Chronological order
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean for performance

    logger.debug(`Retrieved ${messages.length} messages for session ${sessionId}`);
    return messages;
  } catch (error) {
    logger.error(`Failed to get chat messages for session ${sessionId}: ${error.message}`);
    throw error;
  }
};

// --- sendStreamEvent Helper ---
// Remains necessary here as it formats the SSE message structure
const sendStreamEvent = (stream, eventType, data) => {
  if (!stream || stream.writableEnded) return;
  try {
    const eventString = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    stream.write(eventString);
    // Reduce logging frequency for token events
    if (eventType !== 'token') {
        logger.debug(`[SSE Send] Event: ${eventType}`, data);
    }
  } catch (error) {
    logger.error(`[SSE Send] Failed to send stream event '${eventType}': ${error.message}`);
    // Optionally try to close the stream on write error
     try { stream.end(); } catch (e) {}
  }
};

/**
 * Handles a streaming chat request: validates input, creates messages,
 * runs the agent orchestrator, and streams events back to the client via SSE.
 *
 * @async
 * @param {string} sessionId - The ID of the chat session.
 * @param {string} userId - The ID of the user making the request.
 * @param {string} promptText - The user's message text.
 * @param {Array<string>} [selectedDatasetIds=[]] - Array of dataset IDs selected for context.
 * @param {object} responseStream - The Express response object used as the Server-Sent Events stream.
 * @throws {Error} Throws errors for validation failures or agent execution issues.
 */
const handleStreamingChatRequest = async (sessionId, userId, promptText, selectedDatasetIds = [], responseStream) => {
  let userMessageId, aiMessageId; // Keep track of created message IDs
  try {
    logger.info(`Starting streaming chat response for session ${sessionId}, user ${userId}`);

    // --- Initial Setup & Validation ---
    const session = await ChatSession.findOne({ _id: sessionId, userId }); // TODO: Add team member check?
    if (!session) {
      throw new Error('Chat session not found or access denied.');
    }

    const messageCount = await PromptHistory.countDocuments({ chatSessionId: sessionId });
    const isFirstMessage = messageCount === 0;
    let finalDatasetIds = [];

    if (isFirstMessage) {
        if (!selectedDatasetIds || selectedDatasetIds.length === 0) {
            throw new Error('At least one dataset must be selected for the first message.');
        }
        session.associatedDatasetIds = selectedDatasetIds;
        finalDatasetIds = selectedDatasetIds;
        session.updatedAt = new Date(); // Update timestamp on first message with datasets
        await session.save(); // Save associated datasets immediately
    } else {
        finalDatasetIds = session.associatedDatasetIds || [];
        if (finalDatasetIds.length === 0 && messageCount > 0) {
             logger.warn(`Session ${sessionId} has subsequent messages but no associated datasets.`);
        }
    }
    // Ensure dataset IDs are strings
    const stringDatasetIds = finalDatasetIds.map(id => String(id));

    // --- Create Messages ---
    const userMessage = new PromptHistory({
      userId, chatSessionId: sessionId, promptText,
      selectedDatasetIds: stringDatasetIds, messageType: 'user', status: 'completed', createdAt: new Date()
    });
    await userMessage.save();
    userMessageId = userMessage._id.toString();

    const aiMessage = new PromptHistory({
      userId, chatSessionId: sessionId, promptText: "", selectedDatasetIds: stringDatasetIds,
      messageType: 'ai_report', status: 'processing', createdAt: new Date(),
      fragments: [], steps: [], // Initialize fragments and steps
      isStreaming: true, // Explicitly mark as streaming initially
    });
    await aiMessage.save();
    aiMessageId = aiMessage._id.toString();

    // --- Send Initial SSE Events ---
    sendStreamEvent(responseStream, 'user_message_created', { messageId: userMessageId, status: 'completed' });
    sendStreamEvent(responseStream, 'ai_message_created', { messageId: aiMessageId, status: 'processing' });

    // --- Prepare and Run Agent ---
    // ** PHASE 5 UPDATE: Define the callback using sendStreamEvent **
    const sseEventCallback = (eventType, eventData) => {
        // This callback IS the SSE emitter function
        sendStreamEvent(responseStream, eventType, eventData);
    };

    const agentParams = {
        userId,
        teamId: session.teamId || null,
        sessionId,
        aiMessagePlaceholderId: aiMessageId,
        sendEventCallback: sseEventCallback, // Pass the correctly defined callback
        userMessage: promptText,
        sessionDatasetIds: stringDatasetIds,
        // TODO: Fetch initialPreviousAnalysisData / initialPreviousGeneratedCode if needed
        initialPreviousAnalysisData: null,
        initialPreviousGeneratedCode: null
    };

    // Run the agent (does not throw errors for internal agent failures, returns status object)
    const finalResult = await runAgent(agentParams);

    // --- Handle Agent Completion ---
    // AgentRunner updates the DB record. We just need to close the stream.
    const finalStatus = finalResult.status || 'error'; // Default to error if status missing
    logger.info(`Agent run finished for stream ${sessionId}, message ${aiMessageId}. Final Status: ${finalStatus}`);

    if (!responseStream.writableEnded) {
      logger.debug(`Stream ${sessionId} closing after agent completion.`);
      sendStreamEvent(responseStream, 'end', { status: finalStatus }); // Send final status
      responseStream.end();
    } else {
      logger.warn(`Stream ${sessionId} was already ended before agent completion signal.`);
    }

  } catch (error) {
    // Catch errors from initial setup (session validation, message creation)
    logger.error(`Failed to handle streaming chat request for session ${sessionId}: ${error.message}`, { error });

    // Attempt to update AI message status to error if it exists
    if (aiMessageId) {
      try {
        await PromptHistory.findByIdAndUpdate(aiMessageId, {
          $set: { status: 'error', errorMessage: `Stream setup failed: ${error.message}`, isStreaming: false }
        });
      } catch (dbError) {
        logger.error(`Failed to mark AI message ${aiMessageId} as error after stream setup failure: ${dbError.message}`);
      }
    }

    // Try to send error through stream if possible
    if (responseStream && !responseStream.writableEnded) {
      try {
        sendStreamEvent(responseStream, 'error', { message: error.message });
        sendStreamEvent(responseStream, 'end', { status: 'error' });
        responseStream.end();
      } catch (streamError) {
        logger.error(`Failed to send setup error event to stream: ${streamError.message}`);
      }
    }
    // Do not re-throw, as the stream response is handled
  }
};


module.exports = {
  createChatSession,
  getUserChatSessions,
  getChatSessionById,
  updateChatSession,
  deleteChatSession,
  addMessage,
  getChatMessages,
  handleStreamingChatRequest,
  // sendStreamEvent // Keep sendStreamEvent private to this service
};