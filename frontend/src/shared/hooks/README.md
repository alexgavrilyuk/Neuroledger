# frontend/src/shared/hooks/README.md
# ** UPDATED FILE **

## Shared: Hooks

This directory contains custom reusable React hooks designed to be shared across different features, primarily for accessing global contexts. Feature-specific hooks should reside within their respective feature directories.

### Files

*   **`useAuth.js`**:
    *   **Purpose:** Consumes the `AuthContext`.
    *   **Provides:** A simple way to access the authentication state and actions: `{ user, firebaseUser, loading, error, actions, setUser }`.
    *   **Key Value:** Includes `setUser` function, allowing components to directly update the `appUser` state within the `AuthContext` (e.g., after profile updates or plan selection).
    *   **Usage:** Throws an error if used outside of an `AuthProvider`.

*   **`useTheme.js`**:
    *   **Purpose:** Consumes the `ThemeContext`.
    *   **Provides:** A simple way to access the theme state and functions: `{ theme, themeName, toggleTheme, setTheme }`.
    *   **Usage:** Throws an error if used outside of a `ThemeProvider`.

### Future Files

*   `useApi.js`: A potential hook to simplify common patterns for making API calls using `apiClient`.
*   Other hooks encapsulating logic truly shared across *multiple* features (e.g., maybe a hook for interacting with `localStorage` or `sessionStorage`).

### Usage

Import and call the hooks within functional components that need access to the global context state or actions.

```jsx
// Example in a component needing auth user and theme
import { useAuth } from '../shared/hooks/useAuth'; // Path relative to component
import { useTheme } from '../shared/hooks/useTheme'; // Path relative to component

function MyComponent() {
  const { user, loading: authLoading } = useAuth();
  const { themeName, toggleTheme } = useTheme();

  if (authLoading) {
    return <p>Loading...</p>;
  }

  return (
    <div style={{ color: themeName === 'dark' ? 'white' : 'black' }}>
      Hello, {user ? user.name : 'Guest'}!
      <button onClick={toggleTheme}>Toggle Theme</button>
    </div>
  );
}

// Example using setUser (e.g., after a successful profile update API call)
import { useAuth } from '../shared/hooks/useAuth';

function ProfileEditor() {
    const { user, setUser } = useAuth();

    const handleSave = async (updatedProfileData) => {
        // ... make API call to update profile ...
        const updatedUserFromApi = await api.updateProfile(updatedProfileData);
        // Update the global auth context state
        setUser(updatedUserFromApi);
    };
    // ...
}
```