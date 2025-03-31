
# frontend/src/features/auth/README.md
# ** UPDATED FILE **

## Feature: Frontend Authentication

This feature slice handles the user interface and logic for user signup and login within the NeuroLedger frontend application. It interacts heavily with the `shared/contexts/AuthContext` and the `shared/services/firebase.js` module.

### Core Flow

1.  **Routing:** The main application router (`src/routes.jsx`) directs users to `/login` or `/signup` routes. These routes use the `CenteredLayout`, which presents a **split-screen layout** on larger viewports (branding panel + form panel) and a single centered form card on smaller screens. Logged-in users are redirected away from these pages.
2.  **Pages (`pages/`):**
    *   `LoginPage.jsx`: Renders the `LoginForm` component within the `CenteredLayout`.
    *   `SignupPage.jsx`: Renders the `SignupForm` component within the `CenteredLayout`.
3.  **Components (`components/`):**
    *   `LoginForm.jsx`: Provides the UI form (email, password inputs with icons, submit button, link to signup) for user login. Includes a title section. Uses shared `Input` and `Button` components adhering to the new UI style. Handles form state. On submit, calls the `login` action provided by the `useAuthActions` hook. Displays loading states and errors.
    *   `SignupForm.jsx`: Provides the UI form (email, password, confirm password inputs with icons, submit button, link to login) for user signup. Includes a title section. Uses shared `Input` and `Button` components adhering to the new UI style. Handles form state and basic validation. On submit, calls the `signup` action provided by the `useAuthActions` hook. Displays loading states and errors.
4.  **Hooks (`hooks/`):**
    *   `useAuthActions.js`: Abstracted logic for handling login/signup actions. Consumes actions from `useAuth`. Manages local loading/error state specific to the form submission.

### Files

*   **`components/`**
    *   `LoginForm.jsx`: UI and state management for the login form.
    *   `SignupForm.jsx`: UI and state management for the signup form.
*   **`hooks/`**
    *   `useAuthActions.js`: Hook to encapsulate calling auth actions and managing form state.
*   **`pages/`**
    *   `LoginPage.jsx`: Renders the `LoginForm`.
    *   `SignupPage.jsx`: Renders the `SignupForm`.
*   **`README.md`**: This file.

### Dependencies

*   `react-router-dom` (for `Link`)
*   `@heroicons/react` (for input icons)
*   `shared/ui/Input`, `shared/ui/Button`, `shared/ui/Card`
*   `shared/hooks/useAuth` (via `useAuthActions`)
*   `shared/contexts/AuthContext` (indirectly via `useAuthActions`)
*   `shared/services/firebase.js` (indirectly via `AuthContext`)
*   `shared/layouts/CenteredLayout` (used by the router for these pages)

### State Management

*   Local form state (email, password, etc.) is managed within `LoginForm.jsx` and `SignupForm.jsx` using `useState`.
*   Form submission loading and error states are managed within `useAuthActions.js`.
*   Global authentication state is managed by `AuthContext`.