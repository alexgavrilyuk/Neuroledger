const mongoose = require('mongoose');

const ChatSessionSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true, 
    index: true 
  },
  teamId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Team', 
    index: true 
  },
  title: { 
    type: String, 
    default: 'New Chat', 
    trim: true 
  },
  associatedDatasetIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Dataset'
  }],
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Create index on userId and updatedAt for efficient listing
ChatSessionSchema.index({ userId: 1, updatedAt: -1 });

module.exports = mongoose.model('ChatSession', ChatSessionSchema); 