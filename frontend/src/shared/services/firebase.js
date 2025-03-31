// frontend/src/shared/services/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, EmailAuthProvider } from "firebase/auth";
// Import other Firebase services like getFirestore, getStorage if needed later

// Your web app's Firebase configuration
// Using Vite's env variable import
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID // Optional
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider(); // Example if you add Google Sign-in later
const emailProvider = new EmailAuthProvider(); // Useful for email link sign-in maybe

// Export the initialized services
export { auth, googleProvider, emailProvider };
// export const db = getFirestore(app); // Example for Firestore
// export const storage = getStorage(app); // Example for Storage