# Features Directory (`backend/src/features`)

**Last Updated:** April 17, 2025

This directory implements the Vertical Slice Architecture pattern by organizing code around business features rather than technical layers.

## Available Features

### 1. Authentication (`auth/`)
Handles user authentication via Firebase, session creation, and validation. See `auth/README.md` for details.

### 2. Chat (`chat/`)
Implements persistent, contextual chat sessions powered by an advanced AI agent architecture. Handles real-time streaming responses via Server-Sent Events (SSE) and asynchronous processing via Cloud Tasks. The agent can reason, use tools (dataset access, code generation, code execution, report generation, financial calculations, user clarification), manage conversation history with summarization, and interact with multiple LLM providers. See `chat/README.md` for complete implementation details.

### 3. Data Quality Audit (`dataQuality/`)
Provides in-depth dataset analysis with AI interpretations. Uses Cloud Tasks for background processing. See `dataQuality/README.md` for details.

### 4. Dataset Management (`datasets/`)
Handles dataset metadata, storage via Google Cloud Storage (GCS), access control (personal and team), schema/description management, and file uploads (direct and proxied). See `datasets/README.md` for details.

### 5. Export (`export/`)
Handles exporting content, currently focused on generating PDF reports from HTML content using Puppeteer. See `export/README.md` for details.

### 6. Notifications (`notifications/`)
Manages user notifications and alerts, primarily for team-related events. See `notifications/README.md` for details.

### 7. Subscriptions (`subscriptions/`)
Handles subscription management (currently dummy logic) and feature access control based on subscription status. See `subscriptions/README.md` for details.

### 8. Teams (`teams/`)
Manages team creation, membership, invitations, permissions, and team-based resource sharing (datasets, chat context). See `teams/README.md` for details.

### 9. Users (`users/`)
Handles user profile, settings (including preferred AI model), subscription status, and preference management. See `users/README.md` for details.

## Feature Structure

Each feature typically includes:

- **Routes (`feature.routes.js`)**: Define API endpoints and middleware chains. May export multiple routers (e.g., public-facing and internal worker).
- **Controllers (`feature.controller.js`)**: Handle HTTP requests/responses and call services.
- **Services (`feature.service.js`)**: Implement business logic and database operations. May contain multiple service files for complex features (e.g., `chat/agent.service.js`, `chat/agentContext.service.js`).
- **Models (`feature.model.js`)**: Define Mongoose schemas and models. Features might have multiple models (e.g., `Team`, `TeamMember`, `TeamInvite`).
- **Middleware (`feature.middleware.js`)**: Feature-specific middleware (optional, e.g., team role checks).
- **README.md**: Documentation specific to the feature.

## Cross-Feature Interactions

Features interact primarily through:
- Mongoose model references (e.g., Teams referencing Users, Datasets referencing Teams/Users).
- Service function calls (when necessary, e.g., Teams service calling Notification service).
- Database queries (preferred over direct service dependencies for simple data retrieval).

This structure maintains feature isolation while allowing necessary coordination. Shared infrastructure (database connection, external API clients, common middleware, utilities) resides in `src/shared/`.
