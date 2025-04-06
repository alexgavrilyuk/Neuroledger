# frontend/src/shared/utils/README.md

## Shared: Utilities

This directory contains general-purpose utility functions used across the frontend application that are not specific to any single feature and do not involve React state or hooks.

### Files

*   **`logger.js`**:
    *   **Purpose:** Provides a simple, centralized logging interface that wraps the browser's `console` object. Allows for potential future integration with more robust logging services (e.g., Sentry, LogRocket) without requiring changes in all consuming files.
    *   **Functionality:**
        *   Exports a `logger` object with methods: `log`, `info`, `warn`, `error`, `debug`.
        *   Adds prefixes (e.g., `[App Info]`) to console output for easier identification.
        *   The `debug` method only outputs messages when the application is running in development mode (checked via Vite's `import.meta.env.DEV`).
    *   **Usage:** Import `logger` and call its methods instead of using `console` directly.

    ```javascript
    import logger from '../shared/utils/logger'; // Adjust path as necessary

    logger.info('User profile loaded successfully.');
    logger.error('Failed to fetch data:', errorObject);
    logger.debug('Current component state:', currentState); // Only logs in dev
    ```

### Future Files

*   `formatters.js`: Functions for formatting dates, currency, numbers, etc.
*   `helpers.js`: Other miscellaneous helper functions.
*   `validation.js`: Common validation logic (though often handled by libraries like Zod or Yup).