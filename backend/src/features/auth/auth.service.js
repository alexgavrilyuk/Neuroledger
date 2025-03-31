// backend/src/features/auth/auth.service.js
// ** UPDATED FILE **
const admin = require('../../shared/external_apis/firebase.client');
const User = require('../users/user.model');
const logger = require('../../shared/utils/logger');

const verifyFirebaseToken = async (idToken) => {
  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    logger.error('Error verifying Firebase ID token:', error);
    throw new Error('Invalid authentication token.');
  }
};

const getOrCreateUser = async (decodedToken) => {
  try {
    let user = await User.findOne({ firebaseUid: decodedToken.uid });

    if (!user) {
      logger.info(`Creating new user for firebaseUid: ${decodedToken.uid}`);
      user = new User({
        firebaseUid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || decodedToken.email.split('@')[0], // Default name
        // Initialize subscription as inactive - user must select a plan/trial
        subscriptionInfo: {
            tier: 'free',
            status: 'inactive', // Require explicit selection
            trialEndsAt: null,
            subscriptionEndsAt: null,
        },
        onboardingCompleted: false, // New users haven't done onboarding
      });
      await user.save();
    } else {
       logger.debug(`Found existing user for firebaseUid: ${decodedToken.uid}`);
       // Optional: Ensure defaults exist if model changed after user creation
       if (!user.subscriptionInfo) {
           user.subscriptionInfo = { tier: 'free', status: 'inactive' };
           await user.save();
       }
        if (user.onboardingCompleted === undefined) {
           user.onboardingCompleted = false; // Default for older users
            await user.save();
       }
    }

    return user.toObject(); // Convert Mongoose doc to plain JS object

  } catch (error) {
    logger.error('Error getting or creating user:', error);
    throw new Error('Could not process user information.');
  }
};

module.exports = {
  verifyFirebaseToken,
  getOrCreateUser,
};