# Frontend Features (`frontend/src/features`)

This directory contains the specific feature implementations of the NeuroLedger frontend application, organized according to the Vertical Slice Architecture (VSA) pattern.

## Vertical Slice Architecture (VSA)

Each subdirectory represents a distinct user-facing feature or capability (e.g., authentication, dashboard display, managing datasets). Within each feature slice, you will typically find:

*   **`pages/`**: Top-level React components representing distinct views or pages within the feature (e.g., `LoginPage.jsx`, `DashboardPage.jsx`). These are usually the components referenced in `frontend/src/routes.jsx`.
*   **`components/`**: UI components specific to this feature and not intended for reuse across other features.
*   **`hooks/`**: React hooks containing state management, data fetching, or side effect logic specific to this feature.
*   **`services/`**: (Less common in VSA frontend, often delegated to shared services) Functions specifically for interacting with backend API endpoints related *only* to this feature. Often, API calls might be made directly from hooks or components using the shared `apiClient`.
*   **`layouts/`**: Layout components used only within this specific feature (e.g., `AccountLayout.jsx` within `account_management`).

This approach aims to group related functionality together, making it easier for developers to understand and modify a specific feature without needing extensive knowledge of unrelated parts of the application. Shared functionality (UI components, hooks, contexts, services) resides in `frontend/src/shared/`.

## Feature Slices

The following feature slices are currently implemented:

*   **`account_management/`**: Handles user profile viewing/editing, settings management, and provides navigation/layout for related sub-features like dataset and team management within the account section.
*   **`auth/`**: Manages user login and signup flows and pages.
*   **`dashboard/`**: Displays the main dashboard interface, likely including the prompt interaction area and report history/display.
*   **`dataQuality/`**: Components related to initiating, monitoring, and viewing data quality audits for datasets.
*   **`dataset_management/`**: Handles dataset listing, viewing details (including schema), uploading new datasets, and managing dataset context/descriptions.
*   **`notifications/`**: Components for displaying user notifications.
*   **`onboarding/`**: Contains the UI and logic for the new user onboarding tutorial/flow.
*   **`report_display/`**: Components specifically responsible for rendering the AI-generated reports (likely involves executing the generated code string in a sandboxed environment).
*   **`subscription/`**: Handles the UI for viewing subscription status and selecting (currently dummy) plans.
*   **`team_management/`**: Contains UI and logic for creating teams, viewing team details, managing members, handling invites, etc.

Each feature subdirectory should ideally contain its own `README.md` file detailing its specific purpose, components, state management, and interactions.