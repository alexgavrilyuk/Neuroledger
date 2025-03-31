// backend/src/server.js
// ** UPDATED FILE **
require('dotenv').config(); // Load environment variables first
const config = require('./shared/config'); // Use centralized config
const app = require('./app');
const connectDB = require('./shared/db/connection');
const logger = require('./shared/utils/logger');

const PORT = config.port;

// Connect to Database
connectDB().then(() => {
    // Start the server only after successful DB connection
    app.listen(PORT, () => {
      logger.info(`NeuroLedger Backend listening on port ${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
}).catch(err => {
    // The connectDB function already logs the error and exits,
    // but we catch here just in case.
    logger.error("Failed to start server due to DB connection error.", err);
    process.exit(1);
});