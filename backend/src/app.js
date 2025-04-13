// backend/src/app.js
// ** UPDATED FILE **
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
require('dotenv').config();
const mainRoutes = require('./routes');
const errorHandler = require('./shared/middleware/error.handler.js');
const logger = require('./shared/utils/logger');
const { initializeSocket } = require('./socket');

const exportRoutes = require('./features/export/export.routes'); // Import export routes

const app = express();

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || '*', // Allow requests from frontend URL
    credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Request Logging (Simple)
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`);
  next();
});

// Main API Routes - Mount main routes back under /api/v1
app.use('/api/v1', mainRoutes);
// Add export routes under /api/export (remains separate)
app.use('/api/export', exportRoutes);

// Simple health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// --- Catch 404 Routes ---
app.use((req, res, next) => {
    res.status(404).json({ status: 'error', message: 'Resource not found.'});
});

// --- Global Error Handler ---
// IMPORTANT: Must be the last middleware added
app.use(errorHandler);

module.exports = app;