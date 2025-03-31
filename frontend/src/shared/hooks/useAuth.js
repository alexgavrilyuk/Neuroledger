// frontend/src/shared/hooks/useAuth.js
// ** UPDATED FILE - Expose setUser from context **
import { useContext } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export const useAuth = () => {
 const context = useContext(AuthContext);
 if (context === undefined) {
   throw new Error('useAuth must be used within an AuthProvider');
 }
 // The context value includes { user, firebaseUser, loading, error, actions, setUser }
 return context;
};