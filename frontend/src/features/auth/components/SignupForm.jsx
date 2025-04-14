// frontend/src/features/auth/components/SignupForm.jsx
// ** COMPLETELY REDESIGNED SIGNUP FORM **
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Input from '../../../shared/ui/Input';
import Button from '../../../shared/ui/Button';
import { useAuthActions } from '../hooks/useAuthActions';
import { EnvelopeIcon, LockClosedIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

const SignupForm = () => {
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
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Create your account</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Join NeuroLedger to unlock financial insights</p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Email address"
          id="email-signup"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          error={error && error.includes('email') ? error : null}
          leadingIcon={EnvelopeIcon}
          className="transition-all duration-300"
        />

        <Input
          label="Password"
          id="password-signup"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          error={error && error.includes('password') ? error : null}
          leadingIcon={LockClosedIcon}
          className="transition-all duration-300"
        />

        <Input
          label="Confirm Password"
          id="confirm-password"
          name="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
          error={formError} // Show local form errors here
          leadingIcon={LockClosedIcon}
          className="transition-all duration-300"
        />

        {/* Security note */}
        <div className="mt-1">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Password must be at least 6 characters long
          </p>
        </div>

        {/* Display general errors with better styling */}
        {error && !(error.includes('email') || error.includes('password')) && (
          <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/30 rounded-md p-3 animate-fadeIn">
            <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>
          </div>
        )}

        <div className="pt-3">
          <Button 
            type="submit" 
            className="w-full justify-center shadow-md hover:shadow-lg transition-all duration-300" 
            disabled={loading} 
            isLoading={loading} 
            size="lg"
            rightIcon={!loading ? ArrowRightIcon : undefined}
          >
            Create account
          </Button>
        </div>
      </form>
      
      <div className="mt-8">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Already have an account?</span>
          </div>
        </div>
        
        <div className="mt-6">
          <Link 
            to="/login" 
            className="w-full flex items-center justify-center py-3 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300"
          >
            Sign in to existing account
          </Link>
        </div>
      </div>
      
      <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
        By creating an account, you agree to our{' '}
        <Link to="/terms" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
          Terms of Service
        </Link>{' '}
        and{' '}
        <Link to="/privacy" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors">
          Privacy Policy
        </Link>
      </div>
    </div>
  );
};

export default SignupForm;