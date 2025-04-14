// frontend/src/features/auth/components/LoginForm.jsx
// ** COMPLETELY REDESIGNED LOGIN FORM **
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import Input from '../../../shared/ui/Input';
import Button from '../../../shared/ui/Button';
import { useAuthActions } from '../hooks/useAuthActions';
import { EnvelopeIcon, LockClosedIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

const LoginForm = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const { login, loading, error, clearError } = useAuthActions();

    const handleSubmit = async (e) => {
      e.preventDefault();
      clearError();
      await login(email, password);
    };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Welcome back</h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Sign in to your account to continue</p>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Email address"
          id="email"
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
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          error={error && (error.includes('password') || error.includes('credential')) ? error : null}
          leadingIcon={LockClosedIcon}
          className="transition-all duration-300"
        />

        {/* Password recovery link */}
        <div className="flex justify-end">
          <Link to="/reset-password" className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors">
            Forgot your password?
          </Link>
        </div>

        {/* Display general errors with better styling */}
        {error && !(error.includes('email') || error.includes('password') || error.includes('credential')) && (
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
            Sign in
          </Button>
        </div>
      </form>
      
      <div className="mt-8">
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300 dark:border-gray-600"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Don't have an account?</span>
          </div>
        </div>
        
        <div className="mt-6">
          <Link 
            to="/signup" 
            className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all duration-300"
          >
            Create an account
          </Link>
        </div>
      </div>
      
      <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400">
        By signing in, you agree to our{' '}
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

export default LoginForm;