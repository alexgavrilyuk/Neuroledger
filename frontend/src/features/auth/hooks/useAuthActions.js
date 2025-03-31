// frontend/src/features/auth/hooks/useAuthActions.js
// ** UPDATED FILE **
import { useState } from 'react';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { signOut } from "firebase/auth"; // Import signOut
import { auth } from '../../../shared/services/firebase'; // Import auth instance

// This hook simplifies using auth actions within forms/components
export const useAuthActions = () => {
    // Get actions AND the raw logout action from context
    const { actions, error: contextError } = useAuth();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    const handleAuthAction = async (actionType, credentials) => {
        setLoading(true);
        setError(null);
        try {
            let result;
            if (actionType === 'login') {
                result = await actions.login(credentials.email, credentials.password);
                // Login success: onAuthStateChanged handles navigation implicitly
                console.log(`${actionType} successful`);

            } else if (actionType === 'signup') {
                result = await actions.signup(credentials.email, credentials.password);

                // --- CHANGE: Log user out immediately after signup ---
                if (result) {
                    console.log("Signup successful in Firebase, logging out...");
                    try {
                         // Directly call Firebase signout, don't use context logout action here
                         // as we don't want context state changes yet
                         await signOut(auth);
                         console.log("User logged out after signup.");
                         // --- CHANGE: Redirect to login with success message ---
                         navigate('/login', {
                             replace: true,
                             state: { message: 'Signup successful! Please log in.' }
                         });
                    } catch (signOutError) {
                         console.error("Error signing out after signup:", signOutError);
                         // Proceed with error display, but user might be left logged in briefly
                         setError("Signup succeeded but failed to log out. Please log in manually.");
                    }
                }
                // --- END CHANGES ---

            } else {
                throw new Error('Invalid action type');
            }

        } catch (err) {
             console.error(`${actionType} hook error:`, err);
             setError(contextError || err.message || `Failed to ${actionType}.`);
             // Ensure loading is stopped on error for both cases
             setLoading(false);
        } finally {
             // Only set loading false here if it wasn't handled by signup logout/redirect
             if (actionType === 'login') {
                 setLoading(false);
             }
             // For signup, loading stops either on error or after redirect attempt
        }
    };

    const login = (email, password) => {
        return handleAuthAction('login', { email, password });
    };

    const signup = (email, password) => {
        return handleAuthAction('signup', { email, password });
    };

    return { login, signup, loading, error, clearError: () => setError(null) };
};