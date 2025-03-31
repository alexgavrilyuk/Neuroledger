# backend/src/shared/config/README.md

## Shared: Configuration

This directory handles loading, validating, and exporting application configuration, primarily from environment variables.

### Files

*   **`index.js`**:
    *   Loads environment variables using `dotenv`.
    *   Validates the presence of essential variables (`PORT`, `MONGODB_URI`, `FIREBASE_PROJECT_ID` in Phase 1). Exits the process if required variables are missing.
    *   Exports an immutable configuration object containing typed/parsed values.

### Usage

```javascript
// Import the configuration object anywhere in the backend
const config = require('./shared/config');

// Access configuration values
const port = config.port;
const mongoURI = config.mongoURI;