// backend/src/features/teams/team-member.model.js
const mongoose = require('mongoose');

const TeamMemberSchema = new mongoose.Schema({
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member',
    required: true,
  },
  joinedAt: {
    type: Date,
    default: Date.now,
  }
});

// Create a compound index for teamId and userId to ensure uniqueness
TeamMemberSchema.index({ teamId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('TeamMember', TeamMemberSchema);