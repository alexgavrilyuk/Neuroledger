// backend/src/app.js
// ** UPDATED FILE **
const express = require('express');
const cors = require('cors');
const mainRouter = require('./routes');
const errorHandler = require('./shared/middleware/error.handler');
const logger = require('./shared/utils/logger');

const app = express();

// --- Middleware ---
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON request bodies

// Request Logging (Simple)
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});


// --- API Routes ---
app.use('/api/v1', mainRouter);


// --- Catch 404 Routes ---
app.use((req, res, next) => {
    res.status(404).json({ status: 'error', message: 'Resource not found.'});
});

// --- Global Error Handler ---
// IMPORTANT: Must be the last middleware added
app.use(errorHandler);

module.exports = app;