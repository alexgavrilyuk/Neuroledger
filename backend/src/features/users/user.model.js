// backend/src/features/users/user.model.js
// ** UPDATED FILE - Add references to teams **
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  firebaseUid: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  name: {
    type: String,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  // --- Phase 2: Detailed Subscription Info ---
  subscriptionInfo: {
    tier: {
      type: String,
      enum: ['free', 'trial', 'plus', 'pro'], // Define possible tiers
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'trialing', 'past_due', 'canceled'], // Define possible statuses
      default: 'inactive', // Start as inactive until plan selected
    },
    trialEndsAt: { // Relevant if status is 'trialing'
        type: Date,
        default: null
    },
    subscriptionEndsAt: { // For active, non-trial plans (if using time-based billing later)
        type: Date,
        default: null
    },
    stripeCustomerId: { // For future Stripe integration
        type: String,
        default: null
    },
     stripeSubscriptionId: { // For future Stripe integration
        type: String,
        default: null
    }
  },
  // --- User Settings ---
  settings: {
    currency: { type: String, default: 'USD' },
    dateFormat: { type: String, default: 'YYYY-MM-DD' },
    aiContext: { type: String, default: '' },
    // NEW: User preference for AI model
    preferredAiModel: {
      type: String,
      enum: ['claude', 'gemini', 'openai'],
      default: 'claude', // Default to Claude initially
      trim: true,
    },
  },
  // --- Teams Reference - Now implemented ---
  teams: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
  }],
  // --- Phase 2: Onboarding Status ---
   onboardingCompleted: {
       type: Boolean,
       default: false // Track if user finished/skipped onboarding on BE (optional backup to FE localStorage)
   }
});

// Helper method to check if subscription is considered active for feature access
UserSchema.methods.hasActiveSubscription = function() {
    const activeStatuses = ['active', 'trialing'];
    // Check status
    if (!activeStatuses.includes(this.subscriptionInfo.status)) {
        return false;
    }
    // If trialing, check expiry
    if (this.subscriptionInfo.status === 'trialing') {
        return this.subscriptionInfo.trialEndsAt && this.subscriptionInfo.trialEndsAt > new Date();
    }
    // Add checks for subscriptionEndsAt if implementing time-based plans later
    // if (this.subscriptionInfo.status === 'active') {
    //    return this.subscriptionInfo.subscriptionEndsAt && this.subscriptionInfo.subscriptionEndsAt > new Date();
    // }
    return true; // 'active' status without end date check is considered active for now
};


module.exports = mongoose.model('User', UserSchema);