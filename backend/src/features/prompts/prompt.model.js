// backend/src/features/prompts/prompt.model.js
// ** UPDATED FILE - Add fields for chat session integration **
const mongoose = require('mongoose');

const PromptHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  // Make promptText required ONLY if messageType is 'user'
  promptText: {
    type: String,
    required: function() { return this.messageType === 'user'; }, 
  },
  selectedDatasetIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Dataset',
  }],
  contextSent: {
      type: String,
  },
  // --- Chat Session Fields ---
  chatSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatSession',
    index: true
  },
  messageType: {
    type: String,
    enum: ['user', 'ai_report', 'ai_error', 'system'],
    default: 'user' // Default should be fine, but explicit check is safer
  },
  // --- End Chat Session Fields ---
  // --- Phase 5 Fields ---
  aiGeneratedCode: { // Store the React code string generated by Claude
      type: String,
  },
  aiResponseText: { // Can still store text if code generation fails or for hybrid responses
      type: String,
  },
  // NEW: Store fetched dataset content needed for rendering the report
  reportDatasets: [{
    name: String,
    content: String,
    error: String // Store errors if fetching specific dataset content failed
  }],
  executionResult: { // Keep this if you plan iframe execution later, but we'll use ReportViewer for now
      type: String
  },
  status: { // More granular status for Phase 5
    type: String,
    enum: ['pending', 'processing', 'generating_code', 'fetching_data', 'execution_pending', 'executing_code', 'completed', 'error_generating', 'error_fetching_data', 'error_executing', 'error'],
    default: 'pending',
  },
  // --- End Phase 5 Fields ---
  errorMessage: {
      type: String
  },
  durationMs: {
      type: Number
  },
  claudeModelUsed: {
      type: String
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Create compound index for efficient retrieval of messages in chronological order
PromptHistorySchema.index({ chatSessionId: 1, createdAt: 1 });

module.exports = mongoose.model('PromptHistory', PromptHistorySchema);