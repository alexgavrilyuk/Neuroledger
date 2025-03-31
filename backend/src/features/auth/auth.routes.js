// backend/src/features/auth/auth.routes.js
const express = require('express');
const authController = require('./auth.controller');

const router = express.Router();

// POST /api/v1/auth/session
// Verifies Firebase ID token and returns user data (creating user if first login)
router.post('/session', authController.handleSessionLogin);

module.exports = router;