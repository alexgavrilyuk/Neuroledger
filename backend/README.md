# backend/README.md

# NeuroLedger Backend

This directory contains the Node.js/Express backend service for the NeuroLedger application. It follows a Vertical Slice Architecture (VSA) pattern.

## Project Structure

*   **`src/`**: Contains all the source code for the application.
    *   **`features/`**: Houses self-contained feature slices (e.g., `auth`, `users`, `datasets`). Each feature should ideally contain its own models, services, controllers, and routes.
    *   **`shared/`**: Contains code shared across multiple features or core application setup.
        *   `config/`: Application configuration loading and validation.
        *   `db/`: Database connection setup (MongoDB/Mongoose).
        *   `external_apis/`: Clients for interacting with third-party services (Firebase Admin).
        *   `middleware/`: Reusable Express middleware (authentication, error handling).
        *   `utils/`: General utility functions (logging).
    *   `app.js`: Configures the main Express application instance (middleware, mounting routes).
    *   `routes.js`: The main API router that mounts feature-specific routers under `/api/v1`.
    *   `server.js`: The entry point that initializes the database connection and starts the HTTP server.
*   **`.env`**: (Untracked) Holds environment-specific variables (API keys, DB URIs).
*   **`.env.example`**: Template for required environment variables.
*   **`package.json`**: Project dependencies and scripts.
*   **`firebase-service-account.json`**: (Untracked) Service account key for Firebase Admin SDK. **Ensure this file exists in this directory for Phase 1.**

## Phase 1 Features Implemented

*   **Core Server Setup:** Express server initialization, CORS, JSON parsing, basic request logging.
*   **Configuration:** Loading environment variables (`dotenv`).
*   **Database:** MongoDB connection using Mongoose.
*   **Authentication (`features/auth`):** Endpoint (`POST /api/v1/auth/session`) to verify Firebase ID tokens, find or create users in the database, and establish a user session context.
*   **User Model (`features/users`):** Basic Mongoose schema for users, linking Firebase UID to application user data.
*   **Shared Middleware:** Authentication middleware (`protect`) to verify tokens on protected routes. Global error handler.
*   **Firebase Integration:** Initialization of Firebase Admin SDK using a service account key.

## Getting Started

1.  Ensure you have Node.js and npm/yarn installed.
2.  Ensure you have MongoDB running (locally or use Atlas) and obtain the connection string.
3.  Create a Firebase project, enable Authentication (Email/Password), and download the service account key JSON file. Rename it to `firebase-service-account.json` and place it in this `backend/` directory.
4.  Create a `.env` file in this directory, using `.env.example` as a template. Populate `PORT`, `MONGODB_URI`, and `FIREBASE_PROJECT_ID`.
5.  Install dependencies: `npm install`
6.  Run the development server: `npm run dev` (uses Nodemon for auto-restarts)
7.  The server should start, connect to MongoDB, initialize Firebase Admin, and be accessible (default: `http://localhost:5001`).

## API Interaction

See the main `FE_BE_INTERACTION_README.md` in the project root (or linked location) for detailed API endpoint specifications.