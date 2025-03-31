// frontend/src/shared/contexts/AuthContext.jsx
// ** UPDATED FILE - Add setUser function **
import React, { createContext, useState, useEffect, useMemo, useCallback } from 'react';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from '../services/firebase';
import apiClient from '../services/apiClient';
import Spinner from '../ui/Spinner';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState(undefined); // Start as undefined
  const [appUser, setAppUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // --- Callback to explicitly set App User (e.g., after plan selection) ---
  // Use useCallback to keep the function reference stable if passed in deps arrays
  const updateAppUser = useCallback((newUserData) => {
      console.log("AuthContext: Updating appUser state.", newUserData);
      setAppUser(newUserData);
  }, []);


  // --- Backend Session Verification ---
  const verifySessionWithBackend = useCallback(async (fbUser) => {
      // No initial setLoading(true) here, managed by listener
      if (!fbUser) {
          setAppUser(null);
          setLoading(false); // Now authenticated (as null)
          return;
      }
      try {
          const response = await apiClient.post('/auth/session');
          if (response.data.status === 'success') {
              setAppUser(response.data.data);
              setAuthError(null);
          } else {
              throw new Error(response.data.message || 'Backend session verification failed');
          }
      } catch (error) {
          console.error("Backend session verification error:", error.response?.data?.message || error.message);
          setAuthError(error.response?.data?.message || 'Failed to verify session.');
          setAppUser(null);
          // Optionally sign out Firebase user if backend validation fails
          // await signOut(auth);
      } finally {
           setLoading(false); // Finished checking backend
      }
  }, []);


  // --- Firebase Auth State Listener ---
  useEffect(() => {
    setLoading(true); // Start loading when listener attaches
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user); // Store raw firebase user
      verifySessionWithBackend(user); // Verify with backend
    });
    return () => unsubscribe();
  }, [verifySessionWithBackend]); // Dependency array


  // --- Auth Actions ---
  const signup = useCallback(async (email, password) => {
    setLoading(true); setAuthError(null);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged handles the rest
    } catch (error) {
      console.error("Signup error:", error); setAuthError(error.message); setLoading(false); throw error;
    }
  }, []); // No dependencies needed if only using auth context values

  const login = useCallback(async (email, password) => {
    setLoading(true); setAuthError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged handles the rest
    } catch (error) {
      console.error("Login error:", error); setAuthError(error.message); setLoading(false); throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    // setLoading(true); // Optional: show loading on logout?
    setAuthError(null);
    try {
      await signOut(auth);
      // onAuthStateChanged handles clearing user state
    } catch (error) {
      console.error("Logout error:", error); setAuthError(error.message); throw error;
    } finally {
        // Explicitly clear user state here too, just in case listener is slow/fails
        setFirebaseUser(null);
        setAppUser(null);
        // setLoading(false);
    }
  }, []);


  const value = useMemo(() => ({
    user: appUser,
    firebaseUser,
    loading,
    error: authError,
    actions: {
      signup,
      login,
      logout,
    },
    // --- Expose the updater function ---
    setUser: updateAppUser
  }), [appUser, firebaseUser, loading, authError, signup, login, logout, updateAppUser]); // Add updateAppUser

   // More robust initial loading check: wait until firebaseUser is determined (null or object)
   if (loading || firebaseUser === undefined) {
      return (
         <div className="fixed inset-0 bg-gray-100 dark:bg-gray-950 flex items-center justify-center z-50">
            <Spinner size="lg" />
         </div>
      );
   }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};