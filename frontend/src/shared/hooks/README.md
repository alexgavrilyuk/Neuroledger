
# frontend/src/shared/hooks/README.md
# ** UPDATED FILE **

## Shared: Hooks

This directory contains custom reusable React hooks used across different features.

### Files

*   **`useAuth.js`**:
    *   A hook that consumes the `AuthContext`.
    *   Provides easy access to `{ user, firebaseUser, loading, error, actions, setUser }`.
    *   The `setUser` function allows components to update the application user state held within `AuthContext`.
    *   Throws an error if used outside of an `AuthProvider`.
*   **`useTheme.js`**:
    *   A hook that consumes the `ThemeContext`.
    *   Provides easy access to `{ theme, themeName, toggleTheme, setTheme }`.
    *   Throws an error if used outside of a `ThemeProvider`.
*   **`useOnboarding.js`**: (New in Phase 2)
    *   Manages the visibility logic for the onboarding tutorial.
    *   Takes the user's backend onboarding status (`user.onboardingCompleted`) as an argument.
    *   Checks both the backend status and a flag in `localStorage` (`neuroledger-onboarding-completed`).
    *   Returns `showOnboarding` (boolean indicating if the tutorial modal should be shown) and `dismissOnboarding` (a function to hide the modal and optionally persist the 'completed' state to `localStorage`).

### Future Files

*   `useApi.js`: A hook to simplify making API calls using `apiClient`.
*   Hooks specific to features but potentially reusable (e.g., `useDataTable`, `useFormValidation`).

### Usage

Import and call the hook within functional components that need access to the context state/actions or shared logic.

```jsx
import { useAuth } from '../shared/hooks/useAuth';
import { useTheme } from '../shared/hooks/useTheme';
import { useOnboarding } from './features/onboarding/hooks/useOnboarding'; // Path relative to component

function MyComponent({ user }) { // Assuming user object is passed down
  const { setUser, loading: authLoading } = useAuth();
  const { themeName } = useTheme();
  const { showOnboarding, dismissOnboarding } = useOnboarding(user?.onboardingCompleted);
  // ...
}
```