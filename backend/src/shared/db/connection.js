// backend/src/shared/db/connection.js
const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoURI, {
      // Mongoose 6+ options are generally handled automatically
      // useNewUrlParser: true, // Deprecated
      // useUnifiedTopology: true, // Deprecated
      // useCreateIndex: true, // Deprecated
      // useFindAndModify: false, // Deprecated
    });
    logger.info('MongoDB Connected');
  } catch (err) {
    logger.error('MongoDB connection error:', err.message);
    // Exit process with failure
    process.exit(1);
  }
};

module.exports = connectDB;