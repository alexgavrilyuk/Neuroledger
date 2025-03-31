// frontend/src/features/auth/components/LoginForm.jsx
// ** UPDATED FILE - Adjust spacing and add title **
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Input from '../../../shared/ui/Input';
import Button from '../../../shared/ui/Button';
import { useAuthActions } from '../hooks/useAuthActions';
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline'; // Add icons

const LoginForm = () => {
    // ... (useState and handleSubmit remain the same) ...
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, loading, error, clearError } = useAuthActions();

    const handleSubmit = async (e) => {
      e.preventDefault();
      clearError();
      await login(email, password);
    };


  return (
      <>
         {/* Add Title within the Card */}
         <div className="text-center mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Sign in to your account</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
             Or{' '}
             <Link to="/signup" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                 create a new account
             </Link>
            </p>
         </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Email address"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            error={error && error.includes('email') ? error : null} // Basic error matching
            leadingIcon={EnvelopeIcon} // Add Icon
          />

          <Input
            label="Password"
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            error={error && (error.includes('password') || error.includes('credential')) ? error : null}
            leadingIcon={LockClosedIcon} // Add Icon
          />

          {/* Display general errors */}
           {error && !(error.includes('email') || error.includes('password') || error.includes('credential')) && (
               <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
           )}

          <div>
            <Button type="submit" className="w-full justify-center" disabled={loading} isLoading={loading} size="lg">
              Sign in
            </Button>
          </div>

        </form>
    </>
  );
};

export default LoginForm;