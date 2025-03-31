

# backend/src/shared/utils/README.md

## Shared: Utilities

This directory contains general utility functions used across the application.

### Files (Phase 1)

*   **`logger.js`**:
    *   Provides a simple logger interface (using `console` for Phase 1).
    *   Exports methods like `info`, `warn`, `error`, `debug`.
    *   Can be replaced with a more robust logger (like Winston or Pino) later without changing the import interface in other files significantly.

### Future Files

*   `helpers.js`: For common data formatting, string manipulation, or other generic helper functions.
*   `validation.js`: Potentially for reusable validation logic if not using a library middleware.

### Usage

Import the logger or other utilities where needed.

```javascript
const logger = require('../shared/utils/logger');
logger.info('User logged in successfully.');
```

