# Backend Features (`backend/src/features`)

This directory houses the core business logic of the NeuroLedger backend, organized into distinct "feature slices" following the Vertical Slice Architecture (VSA) pattern.

## Vertical Slice Architecture (VSA)

The goal of VSA here is to group all the code related to a specific feature (e.g., user authentication, dataset management) together within a dedicated subdirectory. This typically includes:

*   **Routes:** Defines the HTTP API endpoints for the feature (`*.routes.js`).
*   **Controllers:** Handles incoming requests, parses input, calls services, and formats responses (`*.controller.js`).
*   **Services:** Contains the core business logic, orchestrates data access, and interacts with external APIs or other services (`*.service.js`).
*   **Models:** Defines the database schema (e.g., Mongoose schemas) for the feature's data (`*.model.js`).
*   **Validation:** Defines request validation rules (e.g., using Joi or express-validator) (`*.validation.js`).

This approach contrasts with traditional layered architectures (e.g., separate folders for all controllers, all services, etc.) and aims to improve modularity, cohesion, and maintainability, especially as the application grows. Developers working on a specific feature can primarily focus on the code within that feature's slice.

## Feature Slices

The following feature slices are currently implemented:

*   **`auth/`**: Handles user authentication, primarily focusing on Firebase token verification and session management.
*   **`dataQuality/`**: Provides endpoints and potentially background processes related to analyzing and improving the quality of uploaded datasets.
*   **`datasets/`**: Manages dataset metadata, handles file upload coordination (direct and proxy), controls access, and provides schema information.
*   **`notifications/`**: Manages user notifications for various events within the application (e.g., team invites).
*   **`prompts/`**: Handles interactions with the AI model (e.g., Claude) for generating insights or code based on user prompts and selected datasets. Includes prompt history management.
*   **`subscriptions/`**: Manages user subscription status and plan selection (currently includes dummy logic).
*   **`teams/`**: Manages team creation, membership, invitations, and team-based access control for resources like datasets.
*   **`users/`**: Manages user profile information and settings.

Each subdirectory contains its own detailed `README.md` file explaining its specific functionality, internal structure, and interactions.