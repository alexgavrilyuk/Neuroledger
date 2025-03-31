// frontend/src/shared/services/apiClient.js
import axios from 'axios';
import { auth } from './firebase'; // Import firebase auth instance

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Add Firebase ID token to Authorization header
apiClient.interceptors.request.use(
  async (config) => {
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        const idToken = await currentUser.getIdToken(false); // false = don't force refresh
        // console.log("Attaching token:", idToken); // Debugging
        config.headers.Authorization = `Bearer ${idToken}`;
      } catch (error) {
         // This can happen if the token is expired and cannot be refreshed silently.
         // The AuthContext should ideally handle logout/redirect in this case.
         console.error("Error getting ID token in interceptor:", error);
         // Optionally trigger a logout action here or let downstream error handling catch it
         // Example: store.dispatch(logoutAction());
         return Promise.reject(error); // Reject the request
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response Interceptor (Optional: handle common errors like 401)
apiClient.interceptors.response.use(
  (response) => response, // Pass through successful responses
  (error) => {
    // console.error("API Error:", error.response || error.message); // Log API errors
    if (error.response && error.response.status === 401) {
      // Handle unauthorized errors globally if needed
      // e.g., Force logout, redirect to login
      console.warn('Received 401 Unauthorized from API');
      // Example: You might want to trigger a logout action from your state management
      // store.dispatch(logoutAction());
      // Or emit an event that the AuthProvider listens to.
    }
    // Important: Reject the promise so downstream .catch() blocks are triggered
    return Promise.reject(error);
  }
);


export default apiClient;