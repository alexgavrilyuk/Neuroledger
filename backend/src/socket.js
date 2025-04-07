// backend/src/socket.js
const { Server } = require('socket.io');
const { auth } = require('firebase-admin');
const logger = require('./shared/utils/logger');

let io;

/**
 * Initialize Socket.IO server
 * @param {Object} server - HTTP server instance
 */
const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true
    }
  });

  // Socket.IO authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        logger.warn(`Socket connection rejected: no authentication token`);
        return next(new Error('Authentication token is required'));
      }

      // Verify token using Firebase Admin SDK
      const decodedToken = await auth().verifyIdToken(token);
      
      if (!decodedToken || !decodedToken.uid) {
        logger.warn(`Socket connection rejected: invalid token`);
        return next(new Error('Invalid authentication token'));
      }

      // Store user information in socket
      socket.user = {
        id: decodedToken.uid,
        email: decodedToken.email || 'unknown'
      };

      logger.info(`Socket authenticated for user: ${socket.user.email}`);
      next();
    } catch (error) {
      logger.error(`Socket authentication error: ${error.message}`);
      next(new Error('Authentication failed'));
    }
  });

  // Connection event handler
  io.on('connection', (socket) => {
    const userId = socket.user?.id;
    
    logger.info(`User connected to socket: ${userId}`);
    
    // Join user to a room with their user ID for targeted broadcasts
    socket.join(`user:${userId}`);
    
    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`User disconnected from socket: ${userId}`);
    });
  });

  logger.info('Socket.IO server initialized');
};

/**
 * Emit an event to a specific user
 * @param {string} userId - User ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const emitToUser = (userId, event, data) => {
  if (!io) {
    logger.error('Socket.IO not initialized');
    return;
  }
  
  logger.debug(`Emitting event '${event}' to user ${userId}`);
  io.to(`user:${userId}`).emit(event, data);
};

/**
 * Emit an event to all connected clients
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
const emitToAll = (event, data) => {
  if (!io) {
    logger.error('Socket.IO not initialized');
    return;
  }
  
  logger.debug(`Emitting event '${event}' to all users`);
  io.emit(event, data);
};

/**
 * Get active Socket.IO instance
 * @returns {Object} - Socket.IO instance
 */
const getIO = () => {
  if (!io) {
    logger.error('Socket.IO not initialized');
    throw new Error('Socket.IO not initialized');
  }
  return io;
};

module.exports = {
  initializeSocket,
  emitToUser,
  emitToAll,
  getIO
}; 