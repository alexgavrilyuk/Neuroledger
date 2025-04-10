const { 
  createChatSession, 
  getUserChatSessions,
  getChatSessionById,
  updateChatSession,
  deleteChatSession,
  addMessage,
  getChatMessages
} = require('./chat.service');
const { workerHandler } = require('./chat.taskHandler');
const PromptHistory = require('./prompt.model');
const logger = require('../../shared/utils/logger');

/**
 * Create a new chat session
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const createSession = async (req, res) => {
  try {
    const { teamId, title } = req.body;
    const session = await createChatSession(req.user._id, teamId, title);
    
    res.status(201).json({
      status: 'success',
      data: session
    });
  } catch (error) {
    logger.error(`Failed to create chat session: ${error.message}`);
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
};

/**
 * Get user's chat sessions
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getSessions = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const skip = parseInt(req.query.skip) || 0;
    
    const sessions = await getUserChatSessions(req.user._id, limit, skip);
    
    res.status(200).json({
      status: 'success',
      data: sessions
    });
  } catch (error) {
    logger.error(`Failed to get chat sessions: ${error.message}`);
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
};

/**
 * Get a single chat session by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getSession = async (req, res) => {
  try {
    const session = await getChatSessionById(req.params.sessionId, req.user._id);
    
    res.status(200).json({
      status: 'success',
      data: session
    });
  } catch (error) {
    logger.error(`Failed to get chat session: ${error.message}`);
    res.status(404).json({
      status: 'error',
      message: error.message
    });
  }
};

/**
 * Update a chat session
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const updateSession = async (req, res) => {
  try {
    const { title } = req.body;
    
    if (!title) {
      return res.status(400).json({
        status: 'error',
        message: 'Title is required for update'
      });
    }
    
    const session = await updateChatSession(req.params.sessionId, req.user._id, { title });
    
    res.status(200).json({
      status: 'success',
      data: session
    });
  } catch (error) {
    logger.error(`Failed to update chat session: ${error.message}`);
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
};

/**
 * Delete a chat session
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const deleteSession = async (req, res) => {
  try {
    await deleteChatSession(req.params.sessionId, req.user._id);
    
    res.status(200).json({
      status: 'success',
      message: 'Chat session deleted successfully'
    });
  } catch (error) {
    logger.error(`Failed to delete chat session: ${error.message}`);
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
};

/**
 * Add a message to a chat session and queue AI response
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const sendMessage = async (req, res) => {
  logger.debug(`sendMessage controller received body: ${JSON.stringify(req.body)}`); 
  
  try {
    const { promptText, selectedDatasetIds = [] } = req.body;
    
    logger.debug(`Extracted promptText: "${promptText}", selectedDatasetIds: [${selectedDatasetIds.join(', ')}]`);

    if (!promptText) {
      logger.warn('sendMessage controller detected empty promptText after extraction.');
      return res.status(400).json({
        status: 'error',
        message: 'Message text is required'
      });
    }
    
    const result = await addMessage(
      req.params.sessionId,
      req.user._id,
      promptText,
      selectedDatasetIds
    );
    
    res.status(202).json({
      status: 'success',
      data: {
        userMessage: result.userMessage,
        aiMessage: result.aiMessage,
        updatedSession: result.updatedSession 
      }
    });
  } catch (error) {
    logger.error(`Failed to send message: ${error.message}`);
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
};

/**
 * Get messages for a chat session
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getMessages = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    
    const messages = await getChatMessages(
      req.params.sessionId,
      req.user._id,
      limit,
      skip
    );
    
    res.status(200).json({
      status: 'success',
      data: messages
    });
  } catch (error) {
    logger.error(`Failed to get chat messages: ${error.message}`);
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
};

/**
 * Get a specific message by ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const getMessage = async (req, res) => {
  try {
    const message = await PromptHistory.findOne({
      _id: req.params.messageId,
      chatSessionId: req.params.sessionId,
      userId: req.user._id
    });
    
    if (!message) {
      return res.status(404).json({
        status: 'error',
        message: 'Message not found or unauthorized'
      });
    }
    
    res.status(200).json({
      status: 'success',
      data: message
    });
  } catch (error) {
    logger.error(`Failed to get chat message: ${error.message}`);
    res.status(400).json({
      status: 'error',
      message: error.message
    });
  }
};

/**
 * Handle the worker request from Cloud Tasks
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const handleWorkerRequest = async (req, res) => {
  try {
    // Send immediate response to Cloud Tasks to acknowledge receipt
    res.status(200).json({ status: 'success', message: 'Task received' });
    
    // Process the task asynchronously to allow the HTTP response to complete
    setImmediate(async () => {
      try {
        await workerHandler(req.body);
      } catch (error) {
        logger.error(`Worker handler error: ${error.message}`);
        // Errors are handled within workerHandler, nothing more to do here
      }
    });
  } catch (error) {
    logger.error(`Failed to process worker request: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
};

module.exports = {
  createSession,
  getSessions,
  getSession,
  updateSession,
  deleteSession,
  sendMessage,
  getMessages,
  getMessage,
  handleWorkerRequest
}; 