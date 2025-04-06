# Backend Source Root (`backend/src`)

This directory serves as the entry point and structural foundation for the NeuroLedger backend application. It orchestrates the application's startup, configuration, and request routing.

## Core Files

1.  **`server.js`**:
    *   **Purpose:** The main entry point for the Node.js application process.
    *   **Functionality:**
        *   Loads environment variables using `dotenv`.
        *   Loads application configuration from `./shared/config`.
        *   Initializes the database connection using `./shared/db/connection`.
        *   Requires the configured Express application instance from `app.js`.
        *   Starts the HTTP server, making the Express app listen on the port specified in the configuration (`config.port`), *only after* a successful database connection.
        *   Logs server start information and the current environment using the shared logger (`./shared/utils/logger`).
        *   Handles critical database connection errors on startup, logging the error and exiting the process.

2.  **`app.js`**:
    *   **Purpose:** Creates and configures the core Express application instance.
    *   **Functionality:**
        *   Initializes an `express()` application.
        *   Applies essential **global middleware**:
            *   `cors`: Enables Cross-Origin Resource Sharing for frontend interactions.
            *   `express.json()`: Parses incoming request bodies with JSON payloads.
            *   Basic request logging (method and URL) using the shared logger.
        *   Mounts the main API router (`./routes.js`) under the `/api/v1` base path. All application features are accessed through this router.
        *   Includes a **404 catch-all middleware** to handle requests for undefined routes.
        *   Applies the **global error handler** (`./shared/middleware/error.handler.js`) as the *last* piece of middleware to catch and standardize errors occurring anywhere in the request lifecycle.
        *   Exports the configured `app` instance for use by `server.js`.

3.  **`routes.js`**:
    *   **Purpose:** Defines the top-level API router and aggregates feature-specific routes.
    *   **Functionality:**
        *   Creates an `express.Router()` instance.
        *   Defines a simple health check endpoint at `/api/v1/` (responds with a JSON message).
        *   Mounts individual feature routers imported from the `./features/` directory onto specific sub-paths (e.g., `authRoutes` on `/auth`, `datasetRoutes` on `/datasets`).
        *   Exports the configured main router for use by `app.js`.

## Subdirectories

*   **`features/`**: Contains the individual, self-contained feature slices of the application (e.g., authentication, datasets, prompts), following the Vertical Slice Architecture pattern. Each feature typically includes its own routes, controllers, services, and potentially models.
*   **`shared/`**: Contains modules and utilities shared across multiple features or essential for the application's core operation (e.g., database connection, configuration management, common middleware, external API clients, utility functions).

## Application Flow Overview

1.  `node server.js` (or `npm run dev`) starts the process.
2.  `server.js` loads config and attempts DB connection.
3.  Upon successful DB connection, `server.js` tells the `app` (from `app.js`) to listen for requests.
4.  Incoming requests hit `app.js`, pass through global middleware (CORS, JSON parsing, logging).
5.  Requests matching `/api/v1/...` are passed to the main router in `routes.js`.
6.  `routes.js` directs the request to the appropriate feature router within `./features/`.
7.  The feature's specific route handlers process the request.
8.  Any errors are caught by the global error handler in `app.js`.

This structure isolates feature logic within `features/` while providing common infrastructure through `shared/` and orchestration via the root-level files.