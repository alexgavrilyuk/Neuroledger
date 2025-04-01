# backend/README.md
# ** UPDATED FILE - Mention Phase 4 **

# NeuroLedger Backend

This directory contains the Node.js/Express backend service for the NeuroLedger application. It follows a Vertical Slice Architecture (VSA) pattern.

## Project Structure

*   **`src/`**: Contains all the source code for the application.
    *   **`features/`**: Houses self-contained feature slices (e.g., `auth`, `users`, `datasets`, `subscriptions`, `prompts`). Each feature should ideally contain its own models, services, controllers, and routes.
    *   **`shared/`**: Contains code shared across multiple features or core application setup.
        *   `config/`: Application configuration loading and validation.
        *   `db/`: Database connection setup (MongoDB/Mongoose).
        *   `external_apis/`: Clients for interacting with third-party services (Firebase Admin, GCS, Claude).
        *   `middleware/`: Reusable Express middleware (authentication, error handling, subscription guard).
        *   `utils/`: General utility functions (logging).
    *   `app.js`: Configures the main Express application instance (middleware, mounting routes).
    *   `routes.js`: The main API router that mounts feature-specific routers under `/api/v1`.
    *   `server.js`: The entry point that initializes the database connection and starts the HTTP server.
*   **`.env`**: (Untracked) Holds environment-specific variables (API keys, DB URIs).
*   **`.env.example`**: Template for required environment variables.
*   **`package.json`**: Project dependencies and scripts.
*   **`firebase-service-account.json`**: (Untracked) Service account key for Firebase Admin SDK.
*   **`gcs-service-account.json`**: (Untracked) Service account key for Google Cloud Storage.

## Phases Implemented

*   **Phase 1:** Core Server Setup, Config, DB, Auth (Token Verification, User Get/Create), Shared Middleware (Protect, Error Handling), Firebase Admin Init.
*   **Phase 2:** Dummy Subscription Logic (Select Plan, Status Check), Subscription Guard Middleware, User Model Updates, Onboarding Status Flag.
*   **Phase 3:** Dataset Management MVP (GCS Client, Signed URL Upload, Metadata Creation w/ Header Parsing, List Datasets), Dataset Model, Routes protected by Auth+Subscription guards.
*   **Phase 4:** Core Prompting & AI Interaction (Textual Analysis): Claude Client, Prompt History Model, Prompt Service (Context Assembly, Basic Claude Text Request), Prompt Controller/Routes (protected).

## Getting Started

1.  Ensure you have Node.js and npm/yarn installed.
2.  Ensure you have MongoDB running (locally or use Atlas) and obtain the connection string.
3.  Create a Firebase project, enable Authentication (Email/Password), and download the service account key JSON file (`firebase-service-account.json`).
4.  Create a Google Cloud Project, enable Cloud Storage, create a bucket, create a service account with storage permissions, and download its key JSON file (`gcs-service-account.json`).
5.  Obtain an API key from Anthropic for Claude API access.
6.  Place `firebase-service-account.json` and `gcs-service-account.json` in this `backend/` directory.
7.  Create a `.env` file in this directory, using `.env.example` as a template. Populate `PORT`, `MONGODB_URI`, `FIREBASE_PROJECT_ID`, `GCS_BUCKET_NAME`, and `CLAUDE_API_KEY`.
8.  Install dependencies: `npm install`
9.  Run the development server: `npm run dev` (uses Nodemon for auto-restarts)
10. The server should start, connect to MongoDB, initialize Firebase Admin, GCS, and Claude clients, and be accessible (default: `http://localhost:5001`).

## API Interaction

See the main `FE_BE_INTERACTION_README.md` in the project root (or linked location) for detailed API endpoint specifications.