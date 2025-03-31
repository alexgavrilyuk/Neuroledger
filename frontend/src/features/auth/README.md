# frontend/src/features/auth/README.md
# ** UPDATED FILE **

## Feature: Frontend Authentication

This feature slice handles the user interface and logic for user signup and login within the NeuroLedger frontend application. It interacts heavily with the `shared/contexts/AuthContext` and the `shared/services/firebase.js` module.

### Core Flow

1.  **Routing:** The main application router (`src/routes.jsx`) directs users to `/login` or `/signup` routes using the `CenteredLayout`. Logged-in users are redirected away from these pages.
2.  **Pages (`pages/`):**
    *   `LoginPage.jsx`: Renders the `LoginForm` component. Displays an optional success message if redirected from signup.
    *   `SignupPage.jsx`: Renders the `SignupForm` component.
3.  **Components (`components/`):**
    *   `LoginForm.jsx`: Provides the UI form for user login. On submit, calls the `login` action from `useAuthActions`. Displays loading/errors.
    *   `SignupForm.jsx`: Provides the UI form for user signup. On submit, calls the `signup` action from `useAuthActions`. Displays loading/errors.
4.  **Hooks (`hooks/`):**
    *   `useAuthActions.js`:
        *   Handles `login`: Calls the `login` action from `AuthContext`. `onAuthStateChanged` in context handles state updates and subsequent navigation.
        *   Handles `signup`: Calls the `signup` action from `AuthContext`. **Upon successful Firebase user creation, it immediately signs the user out via `signOut(auth)` and redirects the user back to the `/login` page using `navigate`, passing a success message.**

### Files

*   **`components/`**
    *   `LoginForm.jsx`: UI and state management for the login form.
    *   `SignupForm.jsx`: UI and state management for the signup form.
*   **`hooks/`**
    *   `useAuthActions.js`: Hook to encapsulate calling login/signup actions, managing form state, and handling the post-signup logout/redirect.
*   **`pages/`**
    *   `LoginPage.jsx`: Renders the `LoginForm`, displays optional success message.
    *   `SignupPage.jsx`: Renders the `SignupForm`.
*   **`README.md`**: This file.

### Dependencies

*   `react-router-dom` (`Link`, `useNavigate`, `useLocation`)
*   `@heroicons/react` (for input icons)
*   `firebase/auth` (`signOut`)
*   `shared/ui/Input`, `shared/ui/Button`, `shared/ui/Card`
*   `shared/hooks/useAuth` (via `useAuthActions`)
*   `shared/contexts/AuthContext` (indirectly via `useAuthActions`)
*   `shared/services/firebase.js` (`auth` instance)
*   `shared/layouts/CenteredLayout`

### State Management

*   Local form state is managed within `LoginForm.jsx` and `SignupForm.jsx`.
*   Form submission loading/error states are managed within `useAuthActions.js`.
*   Global authentication state is managed by `AuthContext`.
*   Navigation state (`location.state`) is used to pass the signup success message.