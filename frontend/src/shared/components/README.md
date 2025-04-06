# frontend/src/shared/components/README.md

## Shared: Components

This directory holds shared, reusable React components that are more complex than basic UI elements (found in `shared/ui`) or are specific compositions used across features but don't belong to a single feature slice.

### Files

*   **`Sidebar.jsx`**:
    *   **Purpose:** Provides the main left-hand navigation sidebar used within `AppLayout`.
    *   **Functionality:**
        *   Displays branding (Logo and "NeuroLedger" title when expanded).
        *   Renders navigation links grouped into sections (Main, Account, Support) using configuration arrays (`navigation`, `accountNavigation`, `secondaryNavigation`).
        *   Uses `NavLink` from `react-router-dom` for active state highlighting based on the current route (`location.pathname`).
        *   Uses Heroicons for navigation items.
        *   **Collapsible:** Supports an expanded (default) and collapsed state (`isCollapsed`), managed internally. Provides toggle buttons (`ChevronLeftIcon`, `ChevronRightIcon`). Passes the current collapsed state up via the `onCollapse` prop, allowing the parent layout (`AppLayout`) to adjust accordingly.
        *   Adapts link display (shows only icons when collapsed, full text when expanded).
        *   Displays the current user's name/email at the bottom when expanded (using `useAuth`).
        *   Styled extensively with Tailwind CSS, including conditional classes and background patterns.
        *   **(Note:** Mobile responsiveness/sidebar is not currently implemented).
    *   **Dependencies:** `react-router-dom`, `shared/hooks/useAuth`, `@heroicons/react`.

### Future Components

*   Potentially complex shared components like a customizable Data Table wrapper, advanced search components, Activity Feed display, etc.