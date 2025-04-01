// backend/src/features/prompts/prompt.model.js
// ** NEW FILE **
const mongoose = require('mongoose');

const PromptHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  promptText: {
    type: String,
    required: true,
  },
  selectedDatasetIds: [{ // Track which datasets were used for context
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
  }],
  contextSent: { // Store the context sent to AI for debugging/retraining
      type: String,
  },
  // In Phase 4, we only get text responses
  aiResponseText: {
      type: String,
  },
  // Later phases might store generated code instead/as well
  // aiGeneratedCode: { type: String },
  // executionResult: { type: mongoose.Schema.Types.Mixed }, // For Phase 5 output

  status: { // Track if generation/execution succeeded or failed
    type: String,
    enum: ['pending', 'generating', 'executing', 'completed', 'error'],
    default: 'pending',
  },
  errorMessage: { // Store error message if status is 'error'
      type: String
  },
  durationMs: { // Time taken for AI response + execution
      type: Number
  },
  claudeModelUsed: {
      type: String
  },
  // Add token usage later if needed
  // inputTokens: { type: Number },
  // outputTokens: { type: Number },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

module.exports = mongoose.model('PromptHistory', PromptHistorySchema);