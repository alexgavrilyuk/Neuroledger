// frontend/src/shared/layouts/CenteredLayout.jsx
import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import ThemeSwitcher from '../theme/ThemeSwitcher';

const CenteredLayout = () => {
  return (
    <div className="min-h-screen flex dark:bg-gray-900 overflow-hidden">
      {/* Left Branding Panel - Enhanced with more engaging visuals and animations */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-2/5 relative overflow-hidden">
        {/* Gradient background with subtle pattern overlay and animation */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-indigo-50/50 to-blue-50/70 dark:from-gray-900 dark:via-blue-950/10 dark:to-indigo-950/10 bg-pattern-light dark:bg-pattern-dark"></div>

        {/* Enhanced animated decorative elements */}
        <div className="absolute top-1/4 -left-16 w-64 h-64 bg-blue-100/50 dark:bg-blue-900/10 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-3xl animate-pulse-slow"></div>
        <div className="absolute bottom-1/4 -right-8 w-48 h-48 bg-indigo-100/40 dark:bg-indigo-900/10 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-3xl animate-pulse-slow animation-delay-3000"></div>
        <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-purple-100/30 dark:bg-purple-900/10 rounded-full mix-blend-multiply dark:mix-blend-lighten filter blur-2xl animate-pulse-slow animation-delay-5000"></div>

        {/* Content positioned above background */}
        <div className="relative flex flex-col items-center justify-center p-12 w-full animate-fadeIn">
            {/* Logo and branding */}
            <div className="text-center relative z-10 max-w-md mx-auto">
                {/* Logo with animation */}
                <Link to="/" className="inline-block mb-8 transform transition-all duration-300 hover:scale-105">
                    <div className="relative">
                        <div className="absolute -inset-4 bg-gradient-to-r from-blue-100 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-full blur-xl opacity-70 dark:opacity-40 animate-pulse-slow"></div>
                        <svg
                            className="relative mx-auto h-20 w-auto text-blue-600 dark:text-blue-400 filter drop-shadow-md"
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
                    </div>
                </Link>

                {/* Branding text with gradient effect */}
                <h1 className="text-3xl sm:text-4xl font-bold mb-3 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 dark:from-white dark:via-gray-100 dark:to-white">
                    NeuroLedger
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
                    Unlock Financial Insights with AI
                </p>

                {/* Value propositions - Enhanced with better styling and animation */}
                <div className="mt-10 space-y-8">
                    <div className="flex items-start space-x-4 bg-white/80 dark:bg-gray-800/50 p-4 rounded-xl shadow-soft-sm dark:shadow-soft-dark-sm border border-gray-100 dark:border-gray-700/30 transform transition-all duration-300 hover:shadow-soft-md hover:-translate-y-0.5">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 dark:from-blue-900/40 dark:to-blue-800/40 flex items-center justify-center shadow-soft-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="text-left">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Instant Analysis</h3>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Get insightful financial analysis in seconds using natural language</p>
                        </div>
                    </div>

                    <div className="flex items-start space-x-4 bg-white/80 dark:bg-gray-800/50 p-4 rounded-xl shadow-soft-sm dark:shadow-soft-dark-sm border border-gray-100 dark:border-gray-700/30 transform transition-all duration-300 hover:shadow-soft-md hover:-translate-y-0.5">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900/40 dark:to-green-800/40 flex items-center justify-center shadow-soft-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600 dark:text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M2 10a8 8 0 018-8v8h8a8 8 0 11-16 0z" />
                                <path d="M12 2.252A8.014 8.014 0 0117.748 8H12V2.252z" />
                            </svg>
                        </div>
                        <div className="text-left">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Interactive Reports</h3>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Explore dynamic visualizations that bring your data to life</p>
                        </div>
                    </div>

                    <div className="flex items-start space-x-4 bg-white/80 dark:bg-gray-800/50 p-4 rounded-xl shadow-soft-sm dark:shadow-soft-dark-sm border border-gray-100 dark:border-gray-700/30 transform transition-all duration-300 hover:shadow-soft-md hover:-translate-y-0.5">
                        <div className="flex-shrink-0 h-10 w-10 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/40 flex items-center justify-center shadow-soft-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600 dark:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
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

      {/* Right Form Panel - Enhanced with better shadows and animation */}
      <div className="flex flex-1 flex-col justify-center items-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-28 bg-gradient-subtle-light dark:bg-gradient-subtle-dark relative overflow-hidden animate-fadeIn">
        {/* Subtle decorative elements for mobile view */}
        <div className="absolute top-0 right-0 w-full h-64 bg-gradient-to-b from-blue-50 to-transparent dark:from-blue-950/10 dark:to-transparent lg:hidden"></div>
        <div className="absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-indigo-50 to-transparent dark:from-indigo-950/10 dark:to-transparent lg:hidden"></div>

        {/* Theme switcher with better positioning */}
        <div className="absolute top-6 right-6 z-10">
            <ThemeSwitcher />
        </div>

        {/* Form container with enhanced styling */}
        <div className="w-full max-w-sm sm:max-w-md mx-auto lg:w-96 relative z-10">
          {/* Mobile-only logo */}
          <div className="lg:hidden text-center mb-10">
            <svg
              className="mx-auto h-16 w-auto text-blue-600 dark:text-blue-400 drop-shadow-md"
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
            <h2 className="mt-4 text-2xl font-bold text-gray-900 dark:text-white">
              NeuroLedger
            </h2>
          </div>

          <div className="w-full">
            {/* Outlet for the actual form content (Login/Signup) */}
            <div className="mt-8">
              <div className="bg-white dark:bg-gray-800 shadow-soft-xl dark:shadow-soft-dark-xl border border-gray-200/80 dark:border-gray-700/50 sm:rounded-xl p-6 sm:p-8 animate-slideInBottom relative overflow-hidden">
                {/* Subtle background detail */}
                <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-400 via-indigo-500 to-purple-600 rounded-t-lg"></div>

                <Outlet />
              </div>
            </div>

            {/* Footer text with better typography */}
            <div className="mt-6 text-center text-xs text-gray-500 dark:text-gray-400 bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg backdrop-blur-sm shadow-soft-sm">
              By signing in, you agree to our{' '}
              <Link to="/terms" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors duration-150">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 transition-colors duration-150">
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