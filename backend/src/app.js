const express = require('express');
const cors = require('cors');

const app = express();

// --- Middleware ---
// Enable CORS for all origins (adjust for production later)
app.use(cors());
// Parse JSON request bodies
app.use(express.json());

// --- Basic Test Route ---
app.get('/api/v1', (req, res) => {
  res.json({ message: 'NeuroLedger Backend is running!' });
});

// --- (Future routes will be added here) ---
// const mainRouter = require('./routes');
// app.use('/api/v1', mainRouter);


// --- Error Handling (Add later) ---


module.exports = app;