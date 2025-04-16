const ChatSession = require('./chatSession.model');
const PromptHistory = require('./prompt.model');
const { createTask } = require('../../shared/services/cloudTasks.service');
const config = require('../../shared/config');
const logger = require('../../shared/utils/logger');
const { runAgent } = require('./agent.service');

/**
 * Creates a new chat session
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
      updatedAt: new Date()
    });

    await chatSession.save();
    return chatSession;
  } catch (error) {
    logger.error(`Failed to create chat session: ${error.message}`);
    throw error;
  }
};

/**
 * Get user's chat sessions
 * @param {string} userId - The user ID
 * @param {number} [limit=10] - Maximum number of sessions to retrieve
 * @param {number} [skip=0] - Number of sessions to skip (for pagination)
 * @returns {Promise<Array>} - Array of chat sessions
 */
const getUserChatSessions = async (userId, limit = 10, skip = 0) => {
  try {
    const sessions = await ChatSession.find({ userId })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
      
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
    const session = await ChatSession.findOne({ 
      _id: sessionId,
      userId
    });
    
    if (!session) {
      throw new Error('Chat session not found or unauthorized');
    }
    
    return session;
  } catch (error) {
    logger.error(`Failed to get chat session by ID: ${error.message}`);
    throw error;
  }
};

/**
 * Update a chat session
 * @param {string} sessionId - The chat session ID
 * @param {string} userId - The user ID (for authorization check)
 * @param {Object} updateData - Data to update (title or other fields)
 * @returns {Promise<Object>} - Updated chat session
 */
const updateChatSession = async (sessionId, userId, updateData) => {
  try {
    const session = await ChatSession.findOne({ 
      _id: sessionId,
      userId
    });
    
    if (!session) {
      throw new Error('Chat session not found or unauthorized');
    }
    
    // Only allow updating certain fields
    if (updateData.title) {
      session.title = updateData.title;
    }
    
    session.updatedAt = new Date();
    await session.save();
    
    return session;
  } catch (error) {
    logger.error(`Failed to update chat session: ${error.message}`);
    throw error;
  }
};

/**
 * Delete a chat session and all associated messages
 * @param {string} sessionId - The chat session ID
 * @param {string} userId - The user ID (for authorization check)
 * @returns {Promise<Object>} - Deletion result
 */
const deleteChatSession = async (sessionId, userId) => {
  try {
    // First check if session exists and belongs to user
    const session = await ChatSession.findOne({ 
      _id: sessionId,
      userId
    });
    
    if (!session) {
      throw new Error('Chat session not found or unauthorized');
    }
    
    // Delete all messages associated with this session
    await PromptHistory.deleteMany({ chatSessionId: sessionId });
    
    // Delete the session itself
    await ChatSession.deleteOne({ _id: sessionId });
    
    return { success: true, message: 'Chat session and messages deleted' };
  } catch (error) {
    logger.error(`Failed to delete chat session: ${error.message}`);
    throw error;
  }
};

/**
 * Add a message to a chat session and queue AI response generation if needed.
 * Enforces dataset selection on the first message and associates them with the session.
 * @param {string} sessionId - The chat session ID
 * @param {string} userId - The user ID
 * @param {string} promptText - The user's message
 * @param {Array} [selectedDatasetIds=[]] - Array of dataset IDs (only used for the first message)
 * @returns {Promise<Object>} - Created user message and AI placeholder message
 */
const addMessage = async (sessionId, userId, promptText, selectedDatasetIds = []) => {
  try {
    // Verify session exists and belongs to user
    const session = await ChatSession.findOne({
      _id: sessionId,
      userId
    });

    if (!session) {
      throw new Error('Chat session not found or unauthorized');
    }

    // Check if this is the first message in the session
    const messageCount = await PromptHistory.countDocuments({ chatSessionId: sessionId });
    const isFirstMessage = messageCount === 0;
    let finalDatasetIds = [];

    if (isFirstMessage) {
      // First message: Require datasets and associate them with the session
      if (!selectedDatasetIds || selectedDatasetIds.length === 0) {
        throw new Error('At least one dataset must be selected for the first message in a chat session.');
      }
      session.associatedDatasetIds = selectedDatasetIds;
      finalDatasetIds = selectedDatasetIds;
    } else {
      // Subsequent messages: Use the datasets already associated with the session
      finalDatasetIds = session.associatedDatasetIds || [];
      if (finalDatasetIds.length === 0) {
          // This should ideally not happen if the first message logic works, but handle defensively
          logger.warn(`Session ${sessionId} has subsequent messages but no associated datasets. This might indicate an issue.`);
          // Depending on requirements, could throw error or allow proceeding without dataset context
          // For now, let it proceed without dataset IDs for AI context
      }
    }

    // Create a new user message
    const userMessage = new PromptHistory({
      userId,
      chatSessionId: sessionId,
      promptText,
      // Store the datasets USED for this specific message generation context
      // For the first message, this is selectedDatasetIds
      // For subsequent, it's the session.associatedDatasetIds
      selectedDatasetIds: finalDatasetIds,
      messageType: 'user',
      status: 'completed', // User messages are immediately complete
      createdAt: new Date()
    });

    await userMessage.save();

    // Update the session updatedAt timestamp and save associated datasets if first message
    session.updatedAt = new Date();
    await session.save();

    // Create a placeholder for the AI response
    const aiMessage = new PromptHistory({
      userId,
      chatSessionId: sessionId,
      promptText: "",  // AI doesn't have prompt text
      // Also store the dataset IDs used for this AI response context
      selectedDatasetIds: finalDatasetIds,
      messageType: 'ai_report',
      status: 'processing',
      createdAt: new Date()
    });

    await aiMessage.save();

    // Create a background task to generate the AI response
    // Always pass the session's associated dataset IDs (finalDatasetIds)
    const payload = {
      userId: userId.toString(),
      userMessageId: userMessage._id.toString(),
      aiMessageId: aiMessage._id.toString(),
      chatSessionId: sessionId.toString(),
      // Pass the dataset IDs that are actually used for context
      sessionDatasetIds: finalDatasetIds.map(id => id.toString()) 
    };

    await createTask(
      config.chatAiQueueName,
      '/internal/chat-ai-worker',
      payload
    );

    return {
      userMessage,
      aiMessage,
      updatedSession: session // Return updated session including associated datasets
    };
  } catch (error) {
    logger.error(`Failed to add message: ${error.message}`);
    throw error;
  }
};

/**
 * Get messages for a chat session
 * @param {string} sessionId - The chat session ID
 * @param {string} userId - The user ID (for authorization check)
 * @param {number} [limit=50] - Maximum number of messages to retrieve
 * @param {number} [skip=0] - Number of messages to skip (for pagination)
 * @returns {Promise<Array>} - Array of messages
 */
const getChatMessages = async (sessionId, userId, limit = 50, skip = 0) => {
  try {
    // Verify session exists and belongs to user
    const session = await ChatSession.findOne({ 
      _id: sessionId,
      userId
    });
    
    if (!session) {
      throw new Error('Chat session not found or unauthorized');
    }
    
    // Get messages for this session, sorted by creation date
    // Explicitly select fields, including aiGeneratedCode and reportAnalysisData
    const messages = await PromptHistory.find({ chatSessionId: sessionId })
      .select('+aiGeneratedCode +reportAnalysisData') // Ensure both fields are included
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean() for performance if not modifying docs
      
    // ---- ADD DEBUG LOG ----
    logger.debug(`[Chat Service] Fetched ${messages.length} messages for session ${sessionId}. Checking for aiGeneratedCode...`);
    messages.forEach((msg, index) => {
        if (msg.messageType === 'ai_report') { // Check only AI messages
            logger.debug(`[Chat Service] Message ${index} (ID: ${msg._id}): hasCode: ${!!msg.aiGeneratedCode}, codeLength: ${msg.aiGeneratedCode?.length}`);
        }
    });
    // ---- END DEBUG LOG ----

    return messages;
  } catch (error) {
    logger.error(`Failed to get chat messages: ${error.message}`);
    throw error;
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
 * @param {string[]} [selectedDatasetIds=[]] - Array of dataset IDs selected for context.
 * @param {object} responseStream - The Express response object used as the Server-Sent Events stream.
 * @throws {Error} Throws errors for validation failures or agent execution issues.
 */
const handleStreamingChatRequest = async (sessionId, userId, promptText, selectedDatasetIds = [], responseStream) => {
  try {
    logger.info(`Starting streaming chat response for session ${sessionId}, user ${userId}`);
    
    // Validate session and user access (assuming ChatSession.findOne handles authorization or it's done before)
    const session = await ChatSession.findOne({ _id: sessionId, userId: userId }); // Or broader team access check
    if (!session) {
      throw new Error('Chat session not found or access denied.');
    }

    // Ensure dataset IDs are valid strings (basic check)
    const finalDatasetIds = (Array.isArray(selectedDatasetIds) ? selectedDatasetIds : []).filter(id => typeof id === 'string' && id.length > 0);

    // Create user message placeholder
    const userMessage = new PromptHistory({
      userId,
      chatSessionId: sessionId,
      promptText,
      selectedDatasetIds: finalDatasetIds,
      messageType: 'user',
      status: 'completed', // User message is always completed instantly
      createdAt: new Date()
    });
    await userMessage.save();

    // Create AI message placeholder
    const aiMessage = new PromptHistory({
      userId, // Store user ID for potential ownership checks later
      chatSessionId: sessionId,
      promptText: "",  // Will be populated by the agent or finalized
      selectedDatasetIds: finalDatasetIds,
      messageType: 'ai_report',
      status: 'processing',
      createdAt: new Date()
    });
    await aiMessage.save();

    // Send initial events to confirm receipt and provide message IDs
    sendStreamEvent(responseStream, 'user_message_created', { 
      messageId: userMessage._id.toString(),
      status: 'completed'
    });
    
    sendStreamEvent(responseStream, 'ai_message_created', { 
      messageId: aiMessage._id.toString(),
      status: 'processing'
    });
    
    // --- Use the new runAgent function --- 
    const agentParams = {
        userId,
        teamId: session.teamId || null,
        sessionId,
        aiMessagePlaceholderId: aiMessage._id.toString(),
        sendEventCallback: (eventType, eventData) => sendStreamEvent(responseStream, eventType, eventData),
        userMessage: promptText,
        sessionDatasetIds: finalDatasetIds,
        // TODO: Potentially fetch and pass initialPreviousAnalysisData / initialPreviousGeneratedCode here
        // based on the session or previous messages if needed for context carry-over.
        initialPreviousAnalysisData: null, // Placeholder
        initialPreviousGeneratedCode: null // Placeholder
    };

    try {
      // Call the exported runAgent function
      const finalResult = await runAgent(agentParams);
      
      // runAgent now handles updating PromptHistory internally, 
      // and should send a 'final_result' event via the callback.

      // We still need to ensure the stream is properly ended.
      // The final_result event might be the last thing sent.
      if (!responseStream.writableEnded) {
          logger.info(`Stream for session ${sessionId}, message ${aiMessage._id} closing after agent completion (Status: ${finalResult.status}).`);
          sendStreamEvent(responseStream, 'end', { status: finalResult.status }); // Send explicit end event
          responseStream.end();
      } else {
          logger.warn(`Stream for session ${sessionId}, message ${aiMessage._id} was already ended before explicit closure.`);
      }

    } catch (agentError) {
      // Errors caught within runAgent should ideally be handled there (updating DB, sending error event).
      // This catch block handles potential unexpected errors *from* runAgent itself, or errors it re-throws.
      logger.error(`Error running agent for session ${sessionId}: ${agentError.message}`, { error: agentError });
      if (!responseStream.writableEnded) {
        // Ensure an error event is sent if the stream is still open
        sendStreamEvent(responseStream, 'error', { message: `Agent execution failed: ${agentError.message}` });
        sendStreamEvent(responseStream, 'end', { status: 'error' }); // Send explicit end event with error status
        responseStream.end();
      }
      // No need to update PromptHistory here, runAgent should handle it on failure.
    }
  } catch (error) {
    // Catch errors from initial setup (session validation, message creation)
    logger.error(`Failed to handle streaming chat request for session ${sessionId}: ${error.message}`, { error });
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
    // Re-throw the error so the controller knows something went wrong
    throw error; 
  }
};

/**
 * Helper function to send SSE events to the client
 * @param {Object} stream - Express response object used as SSE stream
 * @param {string} eventType - Event type name
 * @param {Object} data - Data payload for the event
 */
const sendStreamEvent = (stream, eventType, data) => {
  if (!stream || stream.writableEnded) return;
  
  try {
    const eventString = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    stream.write(eventString);
    logger.debug(`Sent event: ${eventType}`, data);
  } catch (error) {
    logger.error(`Failed to send stream event: ${error.message}`);
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
  handleStreamingChatRequest
}; 