# frontend/src/shared/components/README.md

## Shared: Components

This directory holds shared, reusable React components that are more complex than basic UI elements (found in `shared/ui`) or are specific compositions used across features but don't belong to a single feature slice.

### Files (Phase 3)

*   **`Sidebar.jsx`**:
    *   Provides the main left-hand navigation sidebar used in `AppLayout`.
    *   Includes branding (logo/title).
    *   Displays primary navigation links (Dashboard) and secondary/account navigation links (Profile, Datasets, Teams, Settings, Help) using `NavLink` for active state highlighting.
    *   Uses Heroicons for navigation items.
    *   Organizes links into logical groups.

### Future Components

*   Potentially complex shared components like a customizable Data Table wrapper, advanced search components, etc.