# Features Directory (`backend/src/features`)

This directory implements the Vertical Slice Architecture pattern by organizing code around business features rather than technical layers.

## Available Features

### 1. Authentication (`auth/`)
Handles user authentication via Firebase, session creation, and validation. See `auth/README.md` for details.

### 2. Chat (`chat/`)
Implements persistent, contextual chat history with asynchronous AI response generation:
- Chat sessions that persist across page refreshes
- Full conversation history for contextual AI responses
- Asynchronous processing using Cloud Tasks
- Real-time updates via WebSockets
- Support for private and team-based chat contexts

See `chat/README.md` for complete implementation details.

### 3. Data Quality Audit (`dataQuality/`)
Provides in-depth dataset analysis with AI interpretations. Uses Cloud Tasks for background processing. See `dataQuality/README.md` for details.

### 4. Dataset Management (`datasets/`)
Handles dataset metadata, storage, access control, and data operations. See `datasets/README.md` for details.

### 5. Notifications (`notifications/`)
Manages user notifications and alerts. See `notifications/README.md` for details.

### 6. Prompts (`prompts/`)
Manages AI prompt handling and response generation using Claude API. See `prompts/README.md` for details.

### 7. Subscriptions (`subscriptions/`)
Handles subscription management and feature access control. See `subscriptions/README.md` for details.

### 8. Teams (`teams/`)
Manages team creation, membership, invitations, and permissions. See `teams/README.md` for details.

### 9. Users (`users/`)
Handles user profile, settings, and preference management. See `users/README.md` for details.

## Feature Structure

Each feature typically includes:

- **Routes (`feature.routes.js`)**: Define API endpoints and middleware chains.
- **Controllers (`feature.controller.js`)**: Handle HTTP requests/responses and call services.
- **Services (`feature.service.js`)**: Implement business logic and database operations.
- **Models (`feature.model.js`)**: Define Mongoose schemas and models.
- **Middleware (`feature.middleware.js`)**: Feature-specific middleware (optional).
- **README.md**: Documentation specific to the feature.

## Cross-Feature Interactions

Features interact primarily through:
- Mongoose model references (e.g., Teams referencing Users)
- Service function calls (when absolutely necessary)
- Database queries (preferred over direct service dependencies)

This structure maintains feature isolation while allowing necessary coordination.