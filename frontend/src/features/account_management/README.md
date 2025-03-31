# frontend/src/features/account_management/README.md
# ** NEW FILE **

## Feature: Frontend Account Management

This feature provides the structure and navigation for various user account-related sections, such as profile, datasets, teams, and settings.

### Core Flow (Phase 3)

1.  **Routing:** The main router (`src/routes.jsx`) defines a parent route `/account` which uses the `AccountLayout` component. Nested routes like `/account/profile`, `/account/datasets`, etc., are defined as children. Access is protected.
2.  **Layout (`layouts/AccountLayout.jsx`):**
    *   Provides the main structure for all pages within the `/account/*` path.
    *   Displays a consistent page header ("Account Management").
    *   Includes a sub-navigation menu (using styled `NavLink` components with icons) allowing the user to switch between different account sections (Profile, Datasets, Teams, Settings).
    *   Renders the matched nested child route component (the specific account page) using `<Outlet />`.
3.  **Pages (`pages/`):**
    *   Container pages for each subsection. In Phase 3, most are simple placeholders (`AccountProfilePage`, `AccountTeamsPage`, `AccountSettingsPage`) rendered within a `Card`.
    *   `AccountDatasetsPage.jsx`: Renders the actual dataset management UI components (`DatasetUpload`, `DatasetList`) from the `dataset_management` feature.

### Files

*   **`layouts/`**
    *   `AccountLayout.jsx`: The main layout component for the account section, including sub-navigation.
*   **`pages/`**
    *   `AccountProfilePage.jsx`: Placeholder page for user profile.
    *   `AccountDatasetsPage.jsx`: Page integrating dataset upload and listing components.
    *   `AccountTeamsPage.jsx`: Placeholder page for team management.
    *   `AccountSettingsPage.jsx`: Placeholder page for application settings.
*   **`README.md`**: This file.

### Dependencies

*   `react-router-dom` (`NavLink`, `Outlet`)
*   `shared/ui/Card`
*   `@heroicons/react` (for sub-navigation icons)
*   `shared/layouts/AppLayout` (used by the router *above* this layout)
*   Components from other features rendered within pages (e.g., `DatasetUpload`, `DatasetList`).

### Future Enhancements

*   Implement forms and logic within the placeholder pages (Profile, Teams, Settings).
*   Add sections for Billing, API Keys, etc.