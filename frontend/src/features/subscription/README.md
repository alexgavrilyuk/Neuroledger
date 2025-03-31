
# frontend/src/features/subscription/README.md
# ** NEW FILE **

## Feature: Frontend Subscription Selection

This feature provides the UI for users to select a subscription plan (using dummy data and backend logic in Phase 2). It is typically shown to users after login if they do not have an active subscription status.

### Core Flow

1.  **Routing:** The `ProtectedRoute` component in `src/routes.jsx` checks the `user.subscriptionInfo` status from the `AuthContext`. If the user does not have an active or trialing subscription, they are redirected to the `/select-plan` route (unless they are already there).
2.  **Page (`pages/SubscriptionPage.jsx`):**
    *   Displays available subscription plans (currently using `DUMMY_PLANS_DATA`).
    *   Renders `PlanSelectorCard` components for each plan.
    *   Manages loading and error states for the plan selection process.
    *   When a plan is selected, it calls the backend `POST /api/v1/subscriptions/select` endpoint via `apiClient`.
    *   On successful selection, it receives the **updated user object** from the backend.
    *   **Crucially, it calls the `setUser` function (exposed via `useAuth` from `AuthContext`)** to update the global user state with the new subscription information.
    *   Navigates the user to `/dashboard` (or potentially onboarding if that logic is refined later).
3.  **Component (`components/PlanSelectorCard.jsx`):**
    *   A presentational component that displays the details of a single plan (name, price, features).
    *   Uses shared `Card` and `Button` components.
    *   Highlights if it's the currently selected plan during the API call.
    *   Triggers the `onSelect` callback passed from `SubscriptionPage`.

### Files

*   **`components/`**
    *   `PlanSelectorCard.jsx`: Displays a single subscription plan option.
*   **`pages/`**
    *   `SubscriptionPage.jsx`: Main page for viewing and selecting subscription plans.
*   **`README.md`**: This file.

### Dependencies

*   `react-router-dom` (`useNavigate`)
*   `shared/ui/Card`, `shared/ui/Button`, `shared/ui/Spinner`
*   `@heroicons/react` (for check icon)
*   `shared/hooks/useAuth` (to get `setUser` function)
*   `shared/services/apiClient` (to call the backend)
*   `shared/layouts/AppLayout` (used by the router for this page)

### State Management

*   Local state within `SubscriptionPage` manages the currently selected plan ID during submission (`selectedPlanId`), loading state (`isLoading`), and error messages (`error`).
*   Global user state (including subscription status) is updated via `AuthContext`'s `setUser` function upon successful plan selection.