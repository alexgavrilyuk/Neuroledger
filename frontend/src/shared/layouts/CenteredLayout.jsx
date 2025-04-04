// frontend/src/shared/layouts/CenteredLayout.jsx
// ** UPDATED FILE - Enhanced Split Screen Layout **
import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import ThemeSwitcher from '../theme/ThemeSwitcher';

const CenteredLayout = () => {
  return (
    <div className="min-h-screen flex dark:bg-gray-900">
      {/* Left Branding Panel - Enhanced with gradients and patterns */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-2/5 relative overflow-hidden">
        {/* Gradient background with subtle pattern overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-850 dark:to-indigo-950/20 bg-pattern-light dark:bg-pattern-dark"></div>

        {/* Content positioned above background */}
        <div className="relative flex flex-col items-center justify-center p-12 w-full">
            {/* Subtle animated decorative elements */}
            <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-100/40 dark:bg-blue-900/10 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-3xl animate-pulse-slow"></div>
            <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-indigo-100/40 dark:bg-indigo-900/10 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-3xl animate-pulse-slow animation-delay-3000"></div>

            {/* Logo and branding */}
            <div className="text-center relative z-10 max-w-md mx-auto">
                {/* Logo */}
                <Link to="/" className="inline-block mb-8">
                    <svg
                        className="mx-auto h-16 w-auto text-blue-600 dark:text-blue-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 48 48"
                        aria-hidden="true"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9 3v4m6-4v4m6-4v4M9 15h6m-6 4h6m-6 4h6m6-4h6M15 3h6m-6 4h6m-6 4h6m-6 4h6m6-12h6M15 15h6m-6 4h6m6-4h6M15 23h6m6-4h6m6 4h6M21 3v4m6-4v4m6-4v4m6 8h6"
                        />
                    </svg>
                </Link>

                {/* Branding text */}
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">
                    NeuroLedger
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
                    Unlock Financial Insights with AI
                </p>

                {/* Value propositions */}
                <div className="mt-10 space-y-6">
                    <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 h-8 w-8 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="text-left">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Instant Analysis</h3>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Get insightful financial analysis in seconds using natural language</p>
                        </div>
                    </div>

                    <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 h-8 w-8 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                                <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
                            </svg>
                        </div>
                        <div className="text-left">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Interactive Reports</h3>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Explore dynamic visualizations that bring your data to life</p>
                        </div>
                    </div>

                    <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 h-8 w-8 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="text-left">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Secure & Private</h3>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Your financial data is protected with enterprise-grade security</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex flex-1 flex-col justify-center items-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-28 bg-white dark:bg-gray-900">
        <div className="absolute top-6 right-6">
            <ThemeSwitcher />
        </div>

        {/* Form container with enhanced styling */}
        <div className="w-full max-w-sm sm:max-w-md mx-auto lg:w-96">
          <div className="w-full">
            {/* Outlet for the actual form content (Login/Signup) */}
            <div className="mt-8">
              <div className="bg-white dark:bg-gray-800 shadow-soft-xl dark:shadow-soft-dark-xl border border-gray-200/80 dark:border-gray-700/50 sm:rounded-xl p-6 sm:p-8 animate-slideInBottom">
                <Outlet />
              </div>
            </div>

            {/* Optional footer text */}
            <div className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">
              By signing in, you agree to our{' '}
              <Link to="/terms" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CenteredLayout;