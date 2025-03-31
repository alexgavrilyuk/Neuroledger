# frontend/src/features/subscription/README.md
# ** UPDATED FILE **

## Feature: Frontend Subscription Selection

This feature provides the UI for users to select a subscription plan (using dummy data and backend logic in Phase 2). It is typically shown to users after login if they do not have an active subscription status and is designed with a modern, visually distinct presentation.

### Core Flow

1.  **Routing:** The `ProtectedRoute` component directs users lacking an active subscription to the `/select-plan` route, rendered within the `AppLayout`.
2.  **Page (`pages/SubscriptionPage.jsx`):**
    *   Sets a distinct page background (`bg-white dark:bg-gray-950`) to contrast with plan containers.
    *   Displays a clear page header (title, subtitle).
    *   Arranges `PlanSelectorCard` components in a responsive flex/grid layout.
    *   Manages loading/error states for the selection process.
    *   Calls the backend (`POST /api/v1/subscriptions/select`) on plan selection.
    *   Updates `AuthContext` user state via `setUser` upon success.
    *   Navigates the user to the appropriate next view (usually `/dashboard`).
3.  **Component (`components/PlanSelectorCard.jsx`):**
    *   Renders a single plan option within a styled container (using borders, backgrounds, and shadows for visual distinction, especially for a 'Recommended' plan).
    *   Emphasizes the price and plan name with larger/bolder typography.
    *   Clearly lists features using check icons.
    *   Uses flexbox structure to push the CTA `Button` to the bottom for consistent alignment.
    *   Includes visual elements like a 'Recommended' badge/banner.
    *   Triggers the `onSelect` callback.

### Files

*   **`components/`**
    *   `PlanSelectorCard.jsx`: Displays a single subscription plan option with enhanced styling.
*   **`pages/`**
    *   `SubscriptionPage.jsx`: Main page for viewing and selecting subscription plans, with updated layout and styling.
*   **`README.md`**: This file.

### Dependencies

*   `react-router-dom` (`useNavigate`)
*   `shared/ui/Card` (No longer directly used by PlanSelectorCard, but page uses Card concepts), `shared/ui/Button`, `shared/ui/Spinner`
*   `@heroicons/react` (CheckIcon, StarIcon)
*   `shared/hooks/useAuth` (to get `setUser`)
*   `shared/services/apiClient`
*   `shared/layouts/AppLayout`

### State Management

*   Local state within `SubscriptionPage` manages `selectedPlanId`, `isLoading`, and `error`.
*   Global user state is updated via `AuthContext`'s `setUser` function upon success.