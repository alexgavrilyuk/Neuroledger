# Frontend Shared Modules (`frontend/src/shared`)

This directory contains modules, components, hooks, contexts, and utilities that are designed for reuse across multiple feature slices within the frontend application. Consolidating shared code here helps maintain consistency and reduces duplication.

## Subdirectories

*   **`components/`**: Contains complex, reusable UI components that often have their own state or logic but are needed by multiple features (e.g., `Sidebar`). Simpler, purely presentational UI building blocks are typically found in `ui/`.
*   **`contexts/`**: Holds React Context providers for managing global or cross-feature state (e.g., `AuthContext`, `ThemeContext`).
*   **`hooks/`**: Contains reusable React hooks encapsulating logic that can be shared across features (e.g., `useAuth`, `useTheme`). Feature-specific hooks should reside within their respective feature directories.
*   **`layouts/`**: Provides wrapper components that define the overall structure or layout for different sections of the application (e.g., `AppLayout` for the main authenticated view, `CenteredLayout` for public pages).
*   **`services/`**: Contains modules related to interacting with external services, primarily the backend API. This typically includes the configured `axios` instance (`apiClient.js`) and potentially Firebase initialization (`firebase.js`).
*   **`theme/`**: Includes files related to theme configuration (e.g., light/dark mode variables, toggle components).
*   **`ui/`**: Contains foundational, often stateless, UI building blocks (e.g., `Button`, `Input`, `Card`, `Modal`, `Spinner`). These components are typically styled using Tailwind CSS and are designed to be highly reusable and themeable.
*   **`utils/`**: Holds general-purpose utility functions (e.g., formatting functions, helper logic) that are not specific to any single feature and do not involve React state or hooks.

**(Note:** Based on the current structure, directories like `assets`, `styles`, and `types`, which might typically be found in `shared`, were not present here during the documentation process.)

Each subdirectory should contain its own `README.md` file detailing its specific purpose and the components/modules within it.