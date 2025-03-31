// frontend/src/features/auth/components/SignupForm.jsx
// ** UPDATED FILE - Adjust spacing and add title **
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Input from '../../../shared/ui/Input';
import Button from '../../../shared/ui/Button';
import { useAuthActions } from '../hooks/useAuthActions';
import { EnvelopeIcon, LockClosedIcon } from '@heroicons/react/24/outline'; // Add icons


const SignupForm = () => {
    // ... (useState, formError, handleSubmit remain the same) ...
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const { signup, loading, error, clearError } = useAuthActions();
    const [formError, setFormError] = useState('');

      const handleSubmit = async (e) => {
        e.preventDefault();
        clearError(); // Clear hook/context error
        setFormError(''); // Clear local form error

        if (password !== confirmPassword) {
          setFormError("Passwords do not match.");
          return;
        }
        if (password.length < 6) {
          setFormError("Password must be at least 6 characters long.");
          return;
        }

        await signup(email, password);
      };

  return (
    <>
        {/* Add Title within the Card */}
         <div className="text-center mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">Create your account</h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
             Or{' '}
             <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                 sign in to your existing account
             </Link>
            </p>
         </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Email address"
            id="email-signup"
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            error={error && error.includes('email') ? error : null}
            leadingIcon={EnvelopeIcon}
          />

          <Input
            label="Password"
            id="password-signup"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            error={error && error.includes('password') ? error : null}
            leadingIcon={LockClosedIcon}
          />

          <Input
            label="Confirm Password"
            id="confirm-password"
            name="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={loading}
            error={formError} // Show local form errors here
            leadingIcon={LockClosedIcon}
          />

          {/* Display general Firebase/hook errors */}
          {error && !(error.includes('email') || error.includes('password')) && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}


          <div>
            <Button type="submit" className="w-full justify-center" disabled={loading} isLoading={loading} size="lg">
              Sign up
            </Button>
          </div>

        </form>
    </>
  );
};

export default SignupForm;