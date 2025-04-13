const express = require('express');
const exportController = require('./export.controller');
const { protect } = require('../../shared/middleware/auth.middleware'); // Correct import name

const router = express.Router();

// Route for generating PDF from HTML content
// POST because we're sending potentially large HTML content in the body
router.post(
    '/pdf',
    protect, // Use the correct middleware function
    exportController.exportToPdf
);

module.exports = router; 