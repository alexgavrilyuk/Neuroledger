// backend/src/features/chat/chat.routes.js
const express = require('express');
const chatController = require('./chat.controller');
const promptController = require('./prompt.controller');
const { protect } = require('../../shared/middleware/auth.middleware');
const { requireActiveSubscription } = require('../../shared/middleware/subscription.guard');
const { validateCloudTaskToken } = require('../../shared/middleware/cloudTask.middleware');

const router = express.Router();

// Public routes (protected by auth and subscription middlewares)
router.post('/chats', protect, requireActiveSubscription, chatController.createSession);
router.get('/chats', protect, requireActiveSubscription, chatController.getSessions);
router.get('/chats/:sessionId', protect, requireActiveSubscription, chatController.getSession);
router.patch('/chats/:sessionId', protect, requireActiveSubscription, chatController.updateSession);
router.delete('/chats/:sessionId', protect, requireActiveSubscription, chatController.deleteSession);

// Chat message routes
router.post('/chats/:sessionId/messages', protect, requireActiveSubscription, chatController.sendMessage);
router.get('/chats/:sessionId/messages', protect, requireActiveSubscription, chatController.getMessages);
router.get('/chats/:sessionId/messages/:messageId', protect, requireActiveSubscription, chatController.getMessage);

// Add prompt route (requires auth & subscription)
router.post('/prompts', protect, requireActiveSubscription, promptController.generateAndExecuteReport);

// Create a separate router for internal worker endpoint
const internalRouter = express.Router();
internalRouter.post('/internal/chat-ai-worker', validateCloudTaskToken, chatController.handleWorkerRequest);

module.exports = {
  router,
  internalRouter
}; 