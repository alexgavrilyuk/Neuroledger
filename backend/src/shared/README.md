# Backend Shared Modules (`backend/src/shared`)

This directory contains modules, utilities, configurations, and clients that are shared across multiple feature slices or are fundamental to the backend application's core infrastructure.

The goal is to keep common concerns separate from feature-specific logic, promoting reusability and maintainability.

## Subdirectories

*   **`config/`**: Handles loading, validation, and access to application configuration variables (e.g., from environment variables).
*   **`db/`**: Manages the database connection (MongoDB/Mongoose setup).
*   **`external_apis/`**: Contains clients and initialization logic for interacting with third-party services (Firebase Admin SDK, Google Cloud Storage, Anthropic Claude API).
*   **`middleware/`**: Provides reusable Express middleware functions used across various routes (e.g., authentication checks, subscription guards, error handling, Cloud Task validation).
*   **`utils/`**: Contains general utility functions, such as logging setup.

Each subdirectory includes its own `README.md` file detailing its specific purpose and contents.