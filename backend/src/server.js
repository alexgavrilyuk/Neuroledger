// backend/src/server.js
// ** UPDATED FILE - Added Socket.IO initialization **
require('dotenv').config(); // Load environment variables first
const http = require('http');
const config = require('./shared/config'); // Use centralized config
const app = require('./app');
const { initializeSocket } = require('./socket');
const connectDB = require('./shared/db/connection');
const logger = require('./shared/utils/logger');

const PORT = config.port;

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO with the HTTP server
initializeSocket(server);

// Connect to Database
connectDB().then(() => {
    // Start the server only after successful DB connection
    server.listen(PORT, () => {
      logger.info(`NeuroLedger Backend listening on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`Socket.IO server running on same port`);
    });
}).catch(err => {
    // The connectDB function already logs the error and exits,
    // but we catch here just in case.
    logger.error("Failed to start server due to DB connection error.", err);
    process.exit(1);
});