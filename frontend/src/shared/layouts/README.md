# frontend/src/shared/layouts/README.md
# ** UPDATED FILE **

## Shared: Layouts

This directory contains high-level page layout components that define the main structure of the application's views.

### Files

*   **`AppLayout.jsx`**:
    *   The primary layout for **authenticated** sections of the application.
    *   Features a **fixed-width left Sidebar** (`shared/components/Sidebar.jsx`) containing the main navigation and branding.
    *   The main content area (`<main>`) takes up the remaining space to the right of the sidebar (`pl-64`) and includes padding.
    *   Includes a **sticky Header** at the top of the content area, typically containing user information, global controls (ThemeSwitcher), and potentially page-specific actions.
    *   Uses `react-router-dom`'s `<Outlet />` component to render the matched nested child route component within the main content area.
    *   Consumes `AuthContext` via `useAuth` to display user info and provide logout functionality.
*   **`CenteredLayout.jsx`**:
    *   A layout used for **public-facing** pages requiring user focus, primarily Login and Signup.
    *   Implements a **split-screen layout** on larger screens (`lg:` breakpoint).
        *   The left panel is visually distinct (e.g., gradient background) and used for branding/marketing elements.
        *   The right panel contains the main form (`<Outlet />`), vertically centered and rendered within a `Card`.
    *   On smaller screens, it collapses to a single, centered column containing the form card.
    *   Includes a `ThemeSwitcher`.

### Usage

Layout components are applied in the `routes.jsx` file as parent routes to define the overall structure for different sections of the application (e.g., authenticated vs. public routes).

```jsx
// Example in routes.jsx
import AppLayout from './shared/layouts/AppLayout';
import CenteredLayout from './shared/layouts/CenteredLayout';
// ...

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />, // Apply AppLayout for authenticated routes
    children: [ /* Protected routes using <Outlet /> */ ],
  },
  {
    // No path here, acts as a layout route for children
    element: <CenteredLayout />, // Apply CenteredLayout for public routes
    children: [ /* Login/Signup routes using <Outlet /> */ ],
  },
]);