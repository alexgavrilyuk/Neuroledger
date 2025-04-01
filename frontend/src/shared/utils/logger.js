// frontend/src/shared/utils/logger.js
// ** NEW FILE (or update if exists) - Basic console logger for frontend **

// Using console for simplicity. Could integrate a more robust library later (e.g., Sentry, LogRocket).
const logger = {
    log: (...args) => console.log('[App Log]', ...args),
    info: (...args) => console.info('[App Info]', ...args),
    warn: (...args) => console.warn('[App Warn]', ...args),
    error: (...args) => console.error('[App Error]', ...args),
    debug: (...args) => {
        // Only log debug messages in development environment
        if (import.meta.env.DEV) {
            console.debug('[App Debug]', ...args);
        }
    },
};

export default logger;