// backend/src/features/teams/team-invite.model.js
const mongoose = require('mongoose');

const TeamInviteSchema = new mongoose.Schema({
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    required: true,
    index: true,
  },
  invitedByUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  inviteeEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member',
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'expired'],
    default: 'pending',
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Default to 7 days from creation
      const date = new Date();
      date.setDate(date.getDate() + 7);
      return date;
    },
    index: true,
  }
});

// Create a compound index for teamId and inviteeEmail to prevent multiple invites
TeamInviteSchema.index({ teamId: 1, inviteeEmail: 1, status: 1 });

module.exports = mongoose.model('TeamInvite', TeamInviteSchema);