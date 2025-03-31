// backend/src/shared/utils/logger.js
// Using console for simplicity in Phase 1. Replace with Winston/Pino later if needed.
const logger = {
  info: (...args) => console.log('[INFO]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  debug: (...args) => console.debug('[DEBUG]', ...args),
};

module.exports = logger;