// frontend/src/features/auth/hooks/useAuthActions.js
import { useState } from 'react';
import { useAuth } from '../../../shared/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

// This hook simplifies using auth actions within forms/components
export const useAuthActions = () => {
    const { actions, error: contextError } = useAuth(); // Get actions from context
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    const handleAuthAction = async (actionType, credentials) => {
        setLoading(true);
        setError(null); // Clear previous errors
        try {
            let result;
            if (actionType === 'login') {
                result = await actions.login(credentials.email, credentials.password);
            } else if (actionType === 'signup') {
                result = await actions.signup(credentials.email, credentials.password);
            } else {
                throw new Error('Invalid action type');
            }

            if (result) {
               // onAuthStateChanged in AuthContext handles navigation implicitly
               // by updating the user state, which Router then reacts to.
               // No explicit navigate('/') needed here if Router setup is correct.
               console.log(`${actionType} successful`);
            }

        } catch (err) {
             console.error(`${actionType} hook error:`, err);
             // Use the error message from Firebase or context if available
             setError(contextError || err.message || `Failed to ${actionType}.`);
        } finally {
            setLoading(false);
        }
    };

    const login = (email, password) => {
        return handleAuthAction('login', { email, password });
    };

    const signup = (email, password) => {
        return handleAuthAction('signup', { email, password });
    };

    // Expose loading state and error specific to the hook's operations
    return { login, signup, loading, error, clearError: () => setError(null) };
};