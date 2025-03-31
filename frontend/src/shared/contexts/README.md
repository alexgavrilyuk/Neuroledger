# frontend/src/shared/contexts/README.md
# ** UPDATED FILE **

## Shared: Contexts

This directory contains React Context providers for managing global or cross-feature state.

### Files

*   **`AuthContext.jsx`**:
    *   Provides authentication state and actions to the application.
    *   Uses Firebase JS SDK (`onAuthStateChanged`) to listen for user login/logout status.
    *   Stores the raw `firebaseUser` object.
    *   Calls the backend `POST /api/v1/auth/session` endpoint via `apiClient` to verify sessions and fetch application-specific user data (`appUser`).
    *   Manages loading states (`loading`) and authentication errors (`authError`).
    *   Provides memoized `value` containing `user` (the application user data), `loading`, `error`, and `actions` (`login`, `signup`, `logout`).
    *   **Exposes a `setUser` function** in its value. This allows other parts of the application (like the Subscription page after selecting a plan) to directly update the `appUser` state within the context, ensuring the UI reflects changes immediately without requiring a full page reload or re-authentication.
    *   Renders a loading spinner during the initial authentication check.
    *   Exports `AuthContext` and `AuthProvider`.
*   **`ThemeContext.jsx`**:
    *   Manages the application's theme (e.g., 'light', 'dark').
    *   Reads/writes the theme preference to `localStorage`.
    *   Applies the corresponding theme class (`light` or `dark`) to the root `<html>` element.
    *   Provides memoized `value` containing `theme`, `themeName`, `toggleTheme`, and `setTheme`.
    *   Exports `ThemeContext` and `ThemeProvider`.

### Usage

Wrap the relevant parts of the application (usually the entire `App`) with the providers. Consume the context value using the corresponding hooks (`useAuth`, `useTheme`).

```jsx
// In App.jsx
import { AuthProvider } from './shared/contexts/AuthContext';
import { ThemeProvider } from './shared/contexts/ThemeContext';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        {/* ... rest of the app ... */}
      </AuthProvider>
    </ThemeProvider>
  );
}

// Example using setUser from useAuth in another component
import { useAuth } from './shared/hooks/useAuth';

function SomeComponentThatUpdatesUser() {
    const { setUser } = useAuth();
    // ...
    // const handleUpdate = (newUserData) => setUser(newUserData);
    // ...
}

```

