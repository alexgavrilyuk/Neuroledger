const ChatSession = require('./chatSession.model');
const PromptHistory = require('./prompt.model');
const { createTask } = require('../../shared/services/cloudTasks.service');
const config = require('../../shared/config');
const logger = require('../../shared/utils/logger');

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
    const messages = await PromptHistory.find({ chatSessionId: sessionId })
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);
      
    return messages;
  } catch (error) {
    logger.error(`Failed to get chat messages: ${error.message}`);
    throw error;
  }
};

module.exports = {
  createChatSession,
  getUserChatSessions,
  getChatSessionById,
  updateChatSession,
  deleteChatSession,
  addMessage,
  getChatMessages
}; 