

# frontend/src/shared/services/README.md

## Shared: Services

This directory contains modules related to external services, API client configuration, and SDK initializations.

### Files (Phase 1)

*   **`apiClient.js`**:
    *   Configures and exports an Axios instance for making HTTP requests to the backend API.
    *   Sets the `baseURL` based on the `VITE_API_BASE_URL` environment variable.
    *   Includes a **request interceptor** that automatically retrieves the current Firebase ID token (using `auth.currentUser.getIdToken()`) and adds it to the `Authorization: Bearer <token>` header for all outgoing requests. Handles potential errors during token retrieval.
    *   Includes a basic **response interceptor** primarily for logging errors and potentially handling global `401 Unauthorized` responses (though specific handling like logout is often better managed in `AuthContext` or component-level error handlers).
*   **`firebase.js`**:
    *   Initializes the Firebase JS SDK using the configuration values from `.env` (prefixed with `VITE_FIREBASE_`).
    *   Initializes and exports the `auth` service instance (`getAuth`).
    *   Optionally initializes and exports other Firebase services (like Firestore `db` or Storage `storage`) if needed later.

### Usage

*   The `apiClient` is typically imported into hooks (`useApi`, `useAuthActions`) or feature-specific service files that need to make backend calls.
*   The `auth` instance from `firebase.js` is imported into `AuthContext.jsx` and potentially `useAuthActions.js` or specific components that need direct Firebase auth interaction (less common when using `AuthContext`).

```javascript
// Example usage of apiClient (often within other hooks)
import apiClient from '../shared/services/apiClient';

async function fetchSomeData() {
  const response = await apiClient.get('/some-endpoint');
  return response.data;
}

// Example usage of firebase auth (primarily in AuthContext)
import { auth } from '../shared/services/firebase';
import { signOut } from "firebase/auth";

async function logoutUser() {
  await signOut(auth);
}